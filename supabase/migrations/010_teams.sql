-- Phase 22a — Team structure foundation.
--
-- Every planner belongs to exactly one team. Solo planners are a team of
-- one, so nothing changes for them in practice. Whoever created a team is
-- its Manager (exactly one per team, enforced by a partial unique index).
--
-- Roles (decided 18 Sep 2026): manager | lead | member.
--   manager — runs the team: invite/remove members, roles, team name, currency.
--   lead    — runs projects: sees every team project incl. private, assigns them.
--   member  — sees public team projects plus own/assigned private ones.
-- Project visibility itself lands in 22c; this migration only establishes
-- teams and roles so nav / My Team / Settings can exist.
--
-- Team-of-one reconciliation: the spec says a team is auto-created "on
-- signup with no invite", but there is no self-serve signup — admins create
-- every account. So: this migration backfills a team for every existing
-- planner, and the admin create-account route creates one for each new
-- planner. "Create a team" as a separate action therefore never needs to
-- exist; self-serve means rename + invite + manage.
--
-- Applied directly to the live project on 2026-09-18 via MCP; this file keeps
-- the migration history in sync (same convention as 006–009).

-- ── Teams ───────────────────────────────────────────────────────────────────

create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  currency   text not null default 'EUR',   -- ISO 4217 code; team-wide, per spec
  created_at timestamptz not null default now()
);

alter table public.planners
  add column team_id uuid references public.teams(id) on delete restrict,
  add column role    text not null default 'member'
    check (role in ('manager', 'lead', 'member'));

-- ── Backfill: a team of one for every existing planner, as its manager ──────

do $$
declare
  r record;
  t uuid;
begin
  for r in select id, name from public.planners where team_id is null loop
    insert into public.teams (name)
      values (coalesce(nullif(trim(r.name), ''), 'Planner') || '''s team')
      returning id into t;
    update public.planners set team_id = t, role = 'manager' where id = r.id;
  end loop;
end $$;

alter table public.planners alter column team_id set not null;

-- Exactly one manager per team.
create unique index planners_one_manager_per_team
  on public.planners (team_id) where role = 'manager';

create index planners_team_idx on public.planners (team_id);

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.current_team_id()
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select team_id from public.planners where user_id = auth.uid();
$$;

create or replace function public.current_planner_role()
returns text
language sql
stable security definer
set search_path = public
as $$
  select role from public.planners where user_id = auth.uid();
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.teams enable row level security;

create policy team_members_read_team on public.teams
  for select using (id = current_team_id());

create policy manager_update_team on public.teams
  for update
  using (id = current_team_id() and current_planner_role() = 'manager')
  with check (id = current_team_id());

create policy admin_manage_teams on public.teams
  for all using (is_admin());

-- Roster: teammates can see each other. (planner_read_self stays; this
-- subsumes it.)
create policy planner_read_teammates on public.planners
  for select using (team_id = current_team_id());

-- Settings "update name": a planner may update their own row. RLS can't
-- limit which columns, so the trigger below rejects any change to the
-- fields that only an admin (and later, a manager) may touch.
create policy planner_update_self on public.planners
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.planners_protect_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin() then
    return new;
  end if;
  if new.team_id      is distinct from old.team_id
     or new.role         is distinct from old.role
     or new.user_id      is distinct from old.user_id
     or new.email        is distinct from old.email
     or new.planner_code is distinct from old.planner_code then
    raise exception 'Only an admin can change team, role, email or planner code'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_planners_protect_fields
  before update on public.planners
  for each row execute function public.planners_protect_fields();
