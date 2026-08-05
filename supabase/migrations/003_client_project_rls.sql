-- ─── Client accounts, not guest mode ────────────────────────────────────────────
-- Decision: clients (bride/groom) only get in via an account created by their
-- Planner — there is no anonymous/guest access. That closes the ambiguity
-- left open in 002_auth_roles.sql and lets us finally lock down the tables
-- that were sitting fully open (anyone with the anon key could previously
-- read/write every project, guest list, and layout in the database).

create or replace function current_client_id()
returns uuid
language sql
security definer
stable
as $$
  select id from clients where user_id = auth.uid();
$$;

alter table clients           enable row level security;
alter table projects          enable row level security;
alter table layout_objects    enable row level security;
alter table guests            enable row level security;
alter table seat_assignments  enable row level security;

-- ─── Clients ─────────────────────────────────────────────────────────────────────
-- A client can read/update their own row. The planner who created them can
-- manage their linked clients. Admin: everything.

drop policy if exists admin_manage_clients on clients;
create policy admin_manage_clients on clients
  for all using (is_admin()) with check (is_admin());

drop policy if exists client_read_self on clients;
create policy client_read_self on clients
  for select using (user_id = auth.uid());

drop policy if exists client_update_self on clients;
create policy client_update_self on clients
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists planner_manage_own_clients on clients;
create policy planner_manage_own_clients on clients
  for all using (linked_planner_id = current_planner_id())
  with check (linked_planner_id = current_planner_id());

-- ─── Projects ────────────────────────────────────────────────────────────────────
-- Planner: full control over their own projects.
-- Client: read-only on their own project (per the role split — clients view
-- the layout, they don't build it).

drop policy if exists admin_manage_projects on projects;
create policy admin_manage_projects on projects
  for all using (is_admin()) with check (is_admin());

drop policy if exists planner_manage_own_projects on projects;
create policy planner_manage_own_projects on projects
  for all using (planner_id = current_planner_id())
  with check (planner_id = current_planner_id());

drop policy if exists client_read_own_project on projects;
create policy client_read_own_project on projects
  for select using (client_id = current_client_id());

-- ─── Layout objects ──────────────────────────────────────────────────────────────
-- Planner: full control, scoped to their own projects (via a subquery since
-- there's no planner_id directly on this table).
-- Client: read-only — they can see the floor plan, not move furniture.

drop policy if exists admin_manage_layout_objects on layout_objects;
create policy admin_manage_layout_objects on layout_objects
  for all using (is_admin()) with check (is_admin());

drop policy if exists planner_manage_own_layout_objects on layout_objects;
create policy planner_manage_own_layout_objects on layout_objects
  for all using (
    exists (
      select 1 from projects p
      where p.id = layout_objects.project_id and p.planner_id = current_planner_id()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = layout_objects.project_id and p.planner_id = current_planner_id()
    )
  );

drop policy if exists client_read_own_layout_objects on layout_objects;
create policy client_read_own_layout_objects on layout_objects
  for select using (
    exists (
      select 1 from projects p
      where p.id = layout_objects.project_id and p.client_id = current_client_id()
    )
  );

-- ─── Guests ──────────────────────────────────────────────────────────────────────
-- Both planner and client can fully manage the guest list for a project —
-- this is the one area clients get write access, matching "view + guest
-- list only" from the role docs.

drop policy if exists admin_manage_guests on guests;
create policy admin_manage_guests on guests
  for all using (is_admin()) with check (is_admin());

drop policy if exists planner_manage_own_guests on guests;
create policy planner_manage_own_guests on guests
  for all using (
    exists (
      select 1 from projects p
      where p.id = guests.project_id and p.planner_id = current_planner_id()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = guests.project_id and p.planner_id = current_planner_id()
    )
  );

drop policy if exists client_manage_own_guests on guests;
create policy client_manage_own_guests on guests
  for all using (
    exists (
      select 1 from projects p
      where p.id = guests.project_id and p.client_id = current_client_id()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = guests.project_id and p.client_id = current_client_id()
    )
  );

-- ─── Seat assignments ────────────────────────────────────────────────────────────
-- Same shape as guests — assigning a guest to a chair is part of guest-list
-- management, so both planner and client can do it for their own project.

drop policy if exists admin_manage_seat_assignments on seat_assignments;
create policy admin_manage_seat_assignments on seat_assignments
  for all using (is_admin()) with check (is_admin());

drop policy if exists planner_manage_own_seat_assignments on seat_assignments;
create policy planner_manage_own_seat_assignments on seat_assignments
  for all using (
    exists (
      select 1 from projects p
      where p.id = seat_assignments.project_id and p.planner_id = current_planner_id()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = seat_assignments.project_id and p.planner_id = current_planner_id()
    )
  );

drop policy if exists client_manage_own_seat_assignments on seat_assignments;
create policy client_manage_own_seat_assignments on seat_assignments
  for all using (
    exists (
      select 1 from projects p
      where p.id = seat_assignments.project_id and p.client_id = current_client_id()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = seat_assignments.project_id and p.client_id = current_client_id()
    )
  );
