-- 038: three levels of project access + several assignees per project.
--
--   edit  planner_can_access_project(pid)  creator, any assignee, Lead/Manager of the team (and admin).
--                                          Public no longer grants this: that is the change.
--   view  planner_can_view_project(pid)    edit, or the project is Public and in the caller's team.
--
-- View-only people (a Member opening a Public project they are not assigned to) can read the
-- project, plan, guests, timetable etc., but cannot change or delete anything, and cannot see
-- Payments & Documents at all (those policies keep using the edit function).
--
-- Assignees move to project_assignees (any number). projects.assigned_to_planner_id stays for now:
-- the functions still honour it so code deployed before this migration keeps working; a later
-- migration drops it once nothing reads it.
--
-- New projects default to Private; existing Public projects stay Public (decided with Calum).

create table if not exists public.project_assignees (
  project_id  uuid not null references public.projects(id) on delete cascade,
  planner_id  uuid not null references public.planners(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.planners(id) on delete set null,
  primary key (project_id, planner_id)
);
create index if not exists project_assignees_planner_idx on public.project_assignees (planner_id);
alter table public.project_assignees enable row level security;

insert into public.project_assignees (project_id, planner_id, assigned_by)
select pr.id, pr.assigned_to_planner_id, pr.planner_id
  from public.projects pr
  join public.planners pl on pl.id = pr.assigned_to_planner_id
 where pr.assigned_to_planner_id is not null
on conflict do nothing;

alter table public.projects alter column visibility set default 'private';

-- ── Access functions ────────────────────────────────────────────────────────
create or replace function public.planner_can_access_project(pid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    is_admin()
    or exists (
      select 1
        from public.projects pr
        join public.planners me on me.user_id = auth.uid()
       where pr.id = pid
         and pr.team_id = me.team_id
         and (
           pr.planner_id = me.id
           or pr.assigned_to_planner_id = me.id
           or exists (select 1 from public.project_assignees pa where pa.project_id = pr.id and pa.planner_id = me.id)
           or me.role in ('manager', 'lead')
         )
    );
$$;

create or replace function public.planner_can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select
    public.planner_can_access_project(pid)
    or exists (
      select 1
        from public.projects pr
        join public.planners me on me.user_id = auth.uid()
       where pr.id = pid
         and pr.team_id = me.team_id
         and pr.visibility = 'public'
    );
$$;

/** 'edit' | 'view' | 'none' for the signed-in planner: the app uses it to show or hide things. */
create or replace function public.planner_project_access(pid uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when public.planner_can_access_project(pid) then 'edit'
    when public.planner_can_view_project(pid) then 'view'
    else 'none'
  end;
$$;

grant execute on function public.planner_can_view_project(uuid) to authenticated;
grant execute on function public.planner_project_access(uuid) to authenticated;
revoke execute on function public.planner_can_view_project(uuid) from anon;
revoke execute on function public.planner_project_access(uuid) from anon;

-- ── project_assignees policies ──────────────────────────────────────────────
-- Anyone who can see the project sees who is on it; only Leads/Managers (and admin) change it,
-- and only to people on the project's own team.
create policy view_project_assignees on public.project_assignees
  for select to authenticated
  using (public.planner_can_view_project(project_id));

create policy lead_assign_project_assignees on public.project_assignees
  for insert to authenticated
  with check (
    is_admin()
    or (
      exists (
        select 1 from public.projects pr join public.planners me on me.user_id = auth.uid()
         where pr.id = project_assignees.project_id and pr.team_id = me.team_id and me.role in ('manager', 'lead')
      )
      -- Qualified on purpose: a bare planner_id would resolve to projects.planner_id (the creator).
      and exists (
        select 1 from public.projects pr join public.planners t on t.team_id = pr.team_id
         where pr.id = project_assignees.project_id and t.id = project_assignees.planner_id
      )
    )
  );

create policy lead_unassign_project_assignees on public.project_assignees
  for delete to authenticated
  using (
    is_admin()
    or exists (
      select 1 from public.projects pr join public.planners me on me.user_id = auth.uid()
       where pr.id = project_assignees.project_id and pr.team_id = me.team_id and me.role in ('manager', 'lead')
    )
  );

-- ── projects: read = view access ────────────────────────────────────────────
drop policy if exists planner_read_accessible_projects on public.projects;
create policy planner_read_accessible_projects on public.projects
  for select
  using (public.planner_can_view_project(id));
-- UPDATE / DELETE policies already use planner_can_access_project (now edit-only): unchanged.

-- ── Project tables: view-only people read, only edit people write ───────────

drop policy if exists planner_manage_accessible_guest_families on public.guest_families;
create policy planner_view_guest_families on public.guest_families for select to authenticated
  using (public.planner_can_view_project(project_id));
create policy planner_insert_guest_families on public.guest_families for insert to authenticated
  with check (public.planner_can_access_project(project_id));
create policy planner_update_guest_families on public.guest_families for update to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_guest_families on public.guest_families for delete to authenticated
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_guest_stays on public.guest_stays;
create policy planner_view_guest_stays on public.guest_stays for select to authenticated
  using (public.planner_can_view_project(project_id));
create policy planner_insert_guest_stays on public.guest_stays for insert to authenticated
  with check (public.planner_can_access_project(project_id));
create policy planner_update_guest_stays on public.guest_stays for update to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_guest_stays on public.guest_stays for delete to authenticated
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_guests on public.guests;
create policy planner_view_guests on public.guests for select
  using (public.planner_can_view_project(project_id));
create policy planner_insert_guests on public.guests for insert
  with check (public.planner_can_access_project(project_id));
create policy planner_update_guests on public.guests for update
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_guests on public.guests for delete
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_layout_objects on public.layout_objects;
create policy planner_view_layout_objects on public.layout_objects for select
  using (public.planner_can_view_project(project_id));
create policy planner_insert_layout_objects on public.layout_objects for insert
  with check (public.planner_can_access_project(project_id));
create policy planner_update_layout_objects on public.layout_objects for update
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_layout_objects on public.layout_objects for delete
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_project_days on public.project_days;
create policy planner_view_project_days on public.project_days for select to authenticated
  using (public.planner_can_view_project(project_id));
create policy planner_insert_project_days on public.project_days for insert to authenticated
  with check (public.planner_can_access_project(project_id));
create policy planner_update_project_days on public.project_days for update to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_project_days on public.project_days for delete to authenticated
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_room_settings on public.project_room_settings;
create policy planner_view_project_room_settings on public.project_room_settings for select
  using (public.planner_can_view_project(project_id));
create policy planner_insert_project_room_settings on public.project_room_settings for insert
  with check (public.planner_can_access_project(project_id));
create policy planner_update_project_room_settings on public.project_room_settings for update
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_project_room_settings on public.project_room_settings for delete
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_rsvp on public.project_rsvp;
create policy planner_view_project_rsvp on public.project_rsvp for select
  using (public.planner_can_view_project(project_id));
create policy planner_insert_project_rsvp on public.project_rsvp for insert
  with check (public.planner_can_access_project(project_id));
create policy planner_update_project_rsvp on public.project_rsvp for update
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_project_rsvp on public.project_rsvp for delete
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_rsvp_hotels on public.project_rsvp_hotels;
create policy planner_view_project_rsvp_hotels on public.project_rsvp_hotels for select to authenticated
  using (public.planner_can_view_project(project_id));
create policy planner_insert_project_rsvp_hotels on public.project_rsvp_hotels for insert to authenticated
  with check (public.planner_can_access_project(project_id));
create policy planner_update_project_rsvp_hotels on public.project_rsvp_hotels for update to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_project_rsvp_hotels on public.project_rsvp_hotels for delete to authenticated
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_rsvp_photos on public.project_rsvp_photos;
create policy planner_view_project_rsvp_photos on public.project_rsvp_photos for select to authenticated
  using (public.planner_can_view_project(project_id));
create policy planner_insert_project_rsvp_photos on public.project_rsvp_photos for insert to authenticated
  with check (public.planner_can_access_project(project_id));
create policy planner_update_project_rsvp_photos on public.project_rsvp_photos for update to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_project_rsvp_photos on public.project_rsvp_photos for delete to authenticated
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_project_zones on public.project_zones;
create policy planner_view_project_zones on public.project_zones for select
  using (public.planner_can_view_project(project_id));
create policy planner_insert_project_zones on public.project_zones for insert
  with check (public.planner_can_access_project(project_id));
create policy planner_update_project_zones on public.project_zones for update
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_project_zones on public.project_zones for delete
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_seat_assignments on public.seat_assignments;
create policy planner_view_seat_assignments on public.seat_assignments for select
  using (public.planner_can_view_project(project_id));
create policy planner_insert_seat_assignments on public.seat_assignments for insert
  with check (public.planner_can_access_project(project_id));
create policy planner_update_seat_assignments on public.seat_assignments for update
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_seat_assignments on public.seat_assignments for delete
  using (public.planner_can_access_project(project_id));

drop policy if exists planner_manage_accessible_timetable_blocks on public.timetable_blocks;
create policy planner_view_timetable_blocks on public.timetable_blocks for select to authenticated
  using (public.planner_can_view_project(project_id));
create policy planner_insert_timetable_blocks on public.timetable_blocks for insert to authenticated
  with check (public.planner_can_access_project(project_id));
create policy planner_update_timetable_blocks on public.timetable_blocks for update to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy planner_delete_timetable_blocks on public.timetable_blocks for delete to authenticated
  using (public.planner_can_access_project(project_id));

-- Activity feed: read-only table, view access is enough.
drop policy if exists planner_read_accessible_project_activity on public.project_activity;
create policy planner_read_accessible_project_activity on public.project_activity for select
  using (public.planner_can_view_project(project_id));

-- ── Storage: guest photos and RSVP media are readable with view access ──────

drop policy if exists planner_manage_accessible_guest_photo_objects on storage.objects;
create policy planner_view_guest_photo_objects on storage.objects for select to authenticated
  using (bucket_id = 'guest-photos' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_view_project(((storage.foldername(name))[2])::uuid)
      else false end);
create policy planner_insert_guest_photo_objects on storage.objects for insert to authenticated
  with check (bucket_id = 'guest-photos' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end);
create policy planner_update_guest_photo_objects on storage.objects for update to authenticated
  using (bucket_id = 'guest-photos' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end)
  with check (bucket_id = 'guest-photos' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end);
create policy planner_delete_guest_photo_objects on storage.objects for delete to authenticated
  using (bucket_id = 'guest-photos' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end);

drop policy if exists planner_manage_accessible_rsvp_media_objects on storage.objects;
create policy planner_view_rsvp_media_objects on storage.objects for select to authenticated
  using (bucket_id = 'rsvp-media' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_view_project(((storage.foldername(name))[2])::uuid)
      else false end);
create policy planner_insert_rsvp_media_objects on storage.objects for insert to authenticated
  with check (bucket_id = 'rsvp-media' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end);
create policy planner_update_rsvp_media_objects on storage.objects for update to authenticated
  using (bucket_id = 'rsvp-media' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end)
  with check (bucket_id = 'rsvp-media' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end);
create policy planner_delete_rsvp_media_objects on storage.objects for delete to authenticated
  using (bucket_id = 'rsvp-media' and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false end);

-- Unchanged on purpose (edit access only, so view-only people never see them):
--   project_payments, project_documents, notification_payment_seen, the project-documents bucket,
--   projects UPDATE/DELETE, and the Member stock policies (stock_orders / stock_sales).
