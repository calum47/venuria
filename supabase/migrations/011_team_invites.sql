-- Phase 22b — Team invites and member management.
--
-- Invite links are the only way a planner account is created without an
-- admin. A manager mints a link (with the role the joiner will get); the
-- recipient opens /join/<token>, sets name/email/password, and lands in
-- that team. Tokens are 256-bit random, single-use, and expire.
--
-- Tokens are stored in plain text on purpose: they're bearer secrets with
-- no value after use, and hashing would only defend against an attacker
-- who can already read the table (i.e. has everything). Consumption is
-- done in one transaction by the join server action, which prevents the
-- same link being used twice.
--
-- Member management is done through SECURITY DEFINER functions rather
-- than widening RLS: planners_protect_fields (migration 010) blocks any
-- non-admin change to role/team_id, and these functions set a transaction-
-- local flag that trigger recognises. That keeps "who may change a role"
-- in exactly one place.
--
-- Removing a member does NOT delete anything: they're moved into a fresh
-- team of one as its manager, keeping their account and their projects.
--
-- Applied directly to the live project on 2026-09-18 via MCP; this file keeps
-- the migration history in sync (same convention as 006–010).

-- ── Invites ─────────────────────────────────────────────────────────────────

create table public.team_invites (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  token                 text not null unique,
  role                  text not null default 'member' check (role in ('lead', 'member')),
  created_by_planner_id uuid not null references public.planners(id) on delete cascade,
  expires_at            timestamptz not null,
  used_at               timestamptz,
  used_by_planner_id    uuid references public.planners(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index team_invites_team_idx on public.team_invites (team_id, created_at desc);

alter table public.team_invites enable row level security;

-- Managers see and manage their own team's invites. No anon/authenticated
-- read for outsiders — the join page uses the service role server-side.
create policy manager_manage_team_invites on public.team_invites
  for all
  using (team_id = current_team_id() and current_planner_role() = 'manager')
  with check (team_id = current_team_id() and current_planner_role() = 'manager');

create policy admin_manage_team_invites on public.team_invites
  for all using (is_admin());

-- ── Trigger bypass for the management functions below ───────────────────────

create or replace function public.planners_protect_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin() or current_setting('venuria.team_admin_op', true) = '1' then
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

-- ── Manager operations ──────────────────────────────────────────────────────

-- Change a teammate's role between lead and member. Manager can't change
-- their own role (there must always be exactly one manager) and can't
-- promote anyone to manager here — handing over a team is an admin task.
create or replace function public.set_team_member_role(target_planner_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me     public.planners;
  target public.planners;
begin
  select * into me from public.planners where user_id = auth.uid();
  if me.id is null or me.role <> 'manager' then
    raise exception 'Only the team manager can change roles' using errcode = '42501';
  end if;
  select * into target from public.planners where id = target_planner_id and team_id = me.team_id;
  if target.id is null then
    raise exception 'Planner not found in your team' using errcode = '42501';
  end if;
  if target.id = me.id then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if new_role not in ('lead', 'member') then
    raise exception 'Role must be lead or member' using errcode = '22023';
  end if;

  perform set_config('venuria.team_admin_op', '1', true);
  update public.planners set role = new_role where id = target.id;
end;
$$;

-- Remove a teammate: they become the manager of a brand-new team of one.
create or replace function public.remove_team_member(target_planner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me       public.planners;
  target   public.planners;
  new_team uuid;
begin
  select * into me from public.planners where user_id = auth.uid();
  if me.id is null or me.role <> 'manager' then
    raise exception 'Only the team manager can remove members' using errcode = '42501';
  end if;
  select * into target from public.planners where id = target_planner_id and team_id = me.team_id;
  if target.id is null then
    raise exception 'Planner not found in your team' using errcode = '42501';
  end if;
  if target.id = me.id then
    raise exception 'You cannot remove yourself' using errcode = '42501';
  end if;

  insert into public.teams (name)
    values (coalesce(nullif(trim(target.name), ''), 'Planner') || '''s team')
    returning id into new_team;

  perform set_config('venuria.team_admin_op', '1', true);
  update public.planners set team_id = new_team, role = 'manager' where id = target.id;
end;
$$;

revoke all on function public.set_team_member_role(uuid, text) from public;
revoke all on function public.remove_team_member(uuid) from public;
grant execute on function public.set_team_member_role(uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;
