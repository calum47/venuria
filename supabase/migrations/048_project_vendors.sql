-- 048: vendors on a project. A planner adds a vendor (a rental company with the Vendor tag, 047) to a
-- project; that vendor's logins can then LOOK at the project, read-only:
--   * the materials (layout objects + table settings), the 2D map (rooms, zones, objects), and
--   * the timetable / run-down (days, blocks, and the team vendors those blocks reference).
-- They never get guests, seat assignments, RSVP, payments, documents or notes: no policy below touches those.
-- Nothing here grants any write on project data.
--
-- NOT yet applied live. Apply with 047 already in place.

create table if not exists public.project_vendors (
  project_id        uuid not null references public.projects(id) on delete cascade,
  rental_company_id uuid not null references public.rental_companies(id) on delete cascade,
  added_by          uuid references public.planners(id) on delete set null,
  added_at          timestamptz not null default now(),
  primary key (project_id, rental_company_id)
);
create index if not exists project_vendors_company_idx on public.project_vendors (rental_company_id);
alter table public.project_vendors enable row level security;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- The signed-in user manages a rental company that still has the Vendor tag.
create or replace function public.is_active_vendor()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
      from public.rental_managers rm
      join public.rental_companies rc on rc.id = rm.rental_company_id
     where rm.user_id = auth.uid() and rc.is_vendor
  );
$$;

-- ...and that company has been added to this project.
create or replace function public.vendor_can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
      from public.project_vendors pv
      join public.rental_managers rm on rm.rental_company_id = pv.rental_company_id
      join public.rental_companies rc on rc.id = pv.rental_company_id
     where pv.project_id = pid and rm.user_id = auth.uid() and rc.is_vendor
  );
$$;

grant execute on function public.is_active_vendor() to authenticated;
grant execute on function public.vendor_can_view_project(uuid) to authenticated;

-- ── project_vendors itself ──────────────────────────────────────────────────
create policy admin_manage_project_vendors on public.project_vendors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy planner_view_project_vendors on public.project_vendors
  for select to authenticated using (public.planner_can_view_project(project_id));

-- Only people who can edit the project may add/remove, and only companies that have the Vendor tag.
create policy planner_add_project_vendors on public.project_vendors
  for insert to authenticated
  with check (
    public.planner_can_access_project(project_id)
    and exists (select 1 from public.rental_companies rc where rc.id = project_vendors.rental_company_id and rc.is_vendor)
  );

create policy planner_remove_project_vendors on public.project_vendors
  for delete to authenticated using (public.planner_can_access_project(project_id));

create policy vendor_view_own_project_vendors on public.project_vendors
  for select to authenticated
  using (exists (select 1 from public.rental_managers rm where rm.user_id = auth.uid() and rm.rental_company_id = project_vendors.rental_company_id));

-- ── Read-only access for the attached vendor ────────────────────────────────
create policy vendor_view_projects on public.projects
  for select to authenticated using (public.vendor_can_view_project(id));

create policy vendor_view_layout_objects on public.layout_objects
  for select to authenticated using (public.vendor_can_view_project(project_id));

create policy vendor_view_project_zones on public.project_zones
  for select to authenticated using (public.vendor_can_view_project(project_id));

create policy vendor_view_project_room_settings on public.project_room_settings
  for select to authenticated using (public.vendor_can_view_project(project_id));

create policy vendor_view_project_days on public.project_days
  for select to authenticated using (public.vendor_can_view_project(project_id));

create policy vendor_view_timetable_blocks on public.timetable_blocks
  for select to authenticated using (public.vendor_can_view_project(project_id));

-- Only the team vendors that a visible project's timetable actually uses (not the team's whole list).
create policy vendor_view_used_team_vendors on public.team_vendors
  for select to authenticated
  using (exists (
    select 1 from public.timetable_blocks b
     where b.vendor_id = team_vendors.id and public.vendor_can_view_project(b.project_id)
  ));

-- Venue data that planners can already read, so the map and materials can be drawn.
create policy vendor_view_rooms on public.rooms
  for select to authenticated using (public.is_active_vendor());
create policy vendor_view_venues on public.venues
  for select to authenticated using (public.is_active_vendor());
create policy vendor_view_hotspots on public.hotspots
  for select to authenticated using (public.is_active_vendor());
create policy vendor_view_catalog_items on public.catalog_items
  for select to authenticated using (public.is_active_vendor());
