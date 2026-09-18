-- Phase 22c — Project visibility, assignment, and team-scoped access.
--
-- Before this, every project-scoped table had its own copy of the rule
-- "planner_id = current_planner_id()". That rule is now wrong (teammates
-- can access projects too) and it lived in six places. This migration
-- replaces all six with one function, planner_can_access_project(), so the
-- access rule exists exactly once.
--
-- Rule (18 Sep 2026 decisions):
--   admin                          -> everything
--   same team AND visibility=public -> yes
--   same team AND creator or assignee -> yes
--   same team AND role manager|lead -> yes (leads run projects)
--   otherwise                       -> no
-- Client access is untouched (client_* policies remain, keyed on client_id).
--
-- projects.planner_id keeps its meaning ("creator") rather than being
-- renamed to created_by_planner_id: it's referenced throughout the code
-- and the rename would be churn for no behavioural gain.
--
-- Visibility defaults to public: a team exists to share work, and a solo
-- planner has nobody to hide from anyway. Creator (or manager/lead) can
-- flip it to private.
--
-- Applied directly to the live project on 2026-09-18 via MCP; this file keeps
-- the migration history in sync (same convention as 006–011).

-- ── Columns ─────────────────────────────────────────────────────────────────

alter table public.projects
  add column team_id                uuid references public.teams(id) on delete restrict,
  add column assigned_to_planner_id uuid references public.planners(id) on delete set null,
  add column visibility             text not null default 'public'
    check (visibility in ('private', 'public'));

-- Backfill team from the creator.
update public.projects pr
   set team_id = p.team_id
  from public.planners p
 where p.id = pr.planner_id
   and pr.team_id is null;

alter table public.projects alter column team_id set not null;

create index projects_team_idx     on public.projects (team_id);
create index projects_assigned_idx on public.projects (assigned_to_planner_id);

-- ── The one access rule ─────────────────────────────────────────────────────

create or replace function public.planner_can_access_project(pid uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1
        from public.projects pr
        join public.planners me on me.user_id = auth.uid()
       where pr.id = pid
         and pr.team_id = me.team_id
         and (
           pr.visibility = 'public'
           or pr.planner_id = me.id
           or pr.assigned_to_planner_id = me.id
           or me.role in ('manager', 'lead')
         )
    );
$$;

-- ── Guards on projects ──────────────────────────────────────────────────────

-- On insert: stamp the creator's team; creator must be the caller.
create or replace function public.projects_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin() then
    if new.team_id is null then
      select team_id into new.team_id from public.planners where id = new.planner_id;
    end if;
    return new;
  end if;
  if new.planner_id is distinct from current_planner_id() then
    raise exception 'planner_id must be the creating planner' using errcode = '42501';
  end if;
  new.team_id := current_team_id();
  return new;
end;
$$;

-- On update: who may change what.
--   planner_id / team_id      : admin only (immutable in practice)
--   assigned_to_planner_id    : manager or lead; assignee must be on the team
--   visibility                : creator, manager, or lead
create or replace function public.projects_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.planners;
begin
  if is_admin() then
    return new;
  end if;
  select * into me from public.planners where user_id = auth.uid();

  if new.planner_id is distinct from old.planner_id or new.team_id is distinct from old.team_id then
    raise exception 'Creator and team cannot be changed' using errcode = '42501';
  end if;

  if new.assigned_to_planner_id is distinct from old.assigned_to_planner_id then
    if me.role not in ('manager', 'lead') then
      raise exception 'Only a manager or lead can assign projects' using errcode = '42501';
    end if;
    if new.assigned_to_planner_id is not null and not exists (
      select 1 from public.planners a where a.id = new.assigned_to_planner_id and a.team_id = old.team_id
    ) then
      raise exception 'Assignee must be on the same team' using errcode = '42501';
    end if;
  end if;

  if new.visibility is distinct from old.visibility then
    if not (old.planner_id = me.id or me.role in ('manager', 'lead')) then
      raise exception 'Only the creator, a manager or a lead can change visibility' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_projects_before_insert
  before insert on public.projects
  for each row execute function public.projects_before_insert();

create trigger trg_projects_before_update
  before update on public.projects
  for each row execute function public.projects_before_update();

-- ── Replace the six per-table planner policies ──────────────────────────────

drop policy planner_manage_own_projects on public.projects;
-- Creator is allowed directly, not only via the function: the function is
-- STABLE, so inside INSERT ... RETURNING it cannot see the row being
-- inserted and the RETURNING select check would fail for every new project.
-- (Found by impersonation test on 18 Sep; applied live as a follow-up.)
create policy planner_read_accessible_projects on public.projects
  for select using (planner_id = current_planner_id() or planner_can_access_project(id));
create policy planner_insert_own_projects on public.projects
  for insert with check (planner_id = current_planner_id());
create policy planner_update_accessible_projects on public.projects
  for update using (planner_can_access_project(id)) with check (planner_can_access_project(id));
create policy planner_delete_accessible_projects on public.projects
  for delete using (planner_can_access_project(id));

drop policy planner_manage_own_layout_objects on public.layout_objects;
create policy planner_manage_accessible_layout_objects on public.layout_objects
  for all using (planner_can_access_project(project_id)) with check (planner_can_access_project(project_id));

drop policy planner_manage_own_guests on public.guests;
create policy planner_manage_accessible_guests on public.guests
  for all using (planner_can_access_project(project_id)) with check (planner_can_access_project(project_id));

drop policy planner_manage_own_seat_assignments on public.seat_assignments;
create policy planner_manage_accessible_seat_assignments on public.seat_assignments
  for all using (planner_can_access_project(project_id)) with check (planner_can_access_project(project_id));

drop policy planner_manage_own_project_zones on public.project_zones;
create policy planner_manage_accessible_project_zones on public.project_zones
  for all using (planner_can_access_project(project_id)) with check (planner_can_access_project(project_id));

drop policy planner_read_own_project_activity on public.project_activity;
create policy planner_read_accessible_project_activity on public.project_activity
  for select using (planner_can_access_project(project_id));

-- project_visits stays per-user (user_id = auth.uid()) — unchanged.
