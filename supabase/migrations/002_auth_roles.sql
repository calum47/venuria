-- ─── Admins ────────────────────────────────────────────────────────────────────
-- One row per admin, linked to a Supabase Auth user. The very first admin row
-- has to be inserted manually after creating the auth user in the dashboard —
-- see bootstrap instructions at the bottom of this file.

create table admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  created_at timestamptz default now()
);

-- ─── Venues: add the missing auth link ──────────────────────────────────────────
-- Without this, a Venue Manager account cannot exist — venues had no way to
-- be tied to a login. Nullable because existing venue rows predate this.

alter table venues
  add column user_id uuid unique references auth.users(id) on delete set null;

-- ─── Helper functions ────────────────────────────────────────────────────────────
-- security definer so RLS on `admins`/`venues`/`planners` themselves doesn't
-- create a recursive lookup when these are called from policies on those
-- same tables.

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function current_venue_id()
returns uuid
language sql
security definer
stable
as $$
  select id from venues where user_id = auth.uid();
$$;

create or replace function current_planner_id()
returns uuid
language sql
security definer
stable
as $$
  select id from planners where user_id = auth.uid();
$$;

-- ─── Enable RLS ──────────────────────────────────────────────────────────────────
-- Scoped to the tables Admin/Venue/Planner logins touch today. projects,
-- layout_objects, guests, seat_assignments, clients are deliberately left
-- alone — see note above on why (guest-mode client flow has no auth yet).

alter table admins           enable row level security;
alter table venues           enable row level security;
alter table rooms            enable row level security;
alter table catalog_items    enable row level security;
alter table rental_companies enable row level security;
alter table hotspots         enable row level security;
alter table planners         enable row level security;

-- ─── Admins table ────────────────────────────────────────────────────────────────
-- Only admins can see/manage the admins table. A logged-in admin can read
-- their own row too, so the app can confirm "am I an admin" post-login.

drop policy if exists admin_manage_admins on admins;
create policy admin_manage_admins on admins
  for all using (is_admin()) with check (is_admin());

drop policy if exists admin_read_self on admins;
create policy admin_read_self on admins
  for select using (user_id = auth.uid());

-- ─── Venues ──────────────────────────────────────────────────────────────────────

drop policy if exists admin_manage_venues on venues;
create policy admin_manage_venues on venues
  for all using (is_admin()) with check (is_admin());

drop policy if exists venue_read_own on venues;
create policy venue_read_own on venues
  for select using (id = current_venue_id());

drop policy if exists venue_update_own on venues;
create policy venue_update_own on venues
  for update using (id = current_venue_id()) with check (id = current_venue_id());

drop policy if exists planner_read_venues on venues;
create policy planner_read_venues on venues
  for select using (current_planner_id() is not null);

-- ─── Rooms ───────────────────────────────────────────────────────────────────────

drop policy if exists admin_manage_rooms on rooms;
create policy admin_manage_rooms on rooms
  for all using (is_admin()) with check (is_admin());

drop policy if exists venue_manage_own_rooms on rooms;
create policy venue_manage_own_rooms on rooms
  for all using (venue_id = current_venue_id()) with check (venue_id = current_venue_id());

drop policy if exists planner_read_rooms on rooms;
create policy planner_read_rooms on rooms
  for select using (current_planner_id() is not null);

-- ─── Catalog items ───────────────────────────────────────────────────────────────
-- Venue manages its own catalog rows; planners get read-only across all
-- catalog (venue-owned + rental-owned) since they need to browse everything
-- to build a layout.

drop policy if exists admin_manage_catalog on catalog_items;
create policy admin_manage_catalog on catalog_items
  for all using (is_admin()) with check (is_admin());

drop policy if exists venue_manage_own_catalog on catalog_items;
create policy venue_manage_own_catalog on catalog_items
  for all using (venue_id = current_venue_id()) with check (venue_id = current_venue_id());

drop policy if exists planner_read_catalog on catalog_items;
create policy planner_read_catalog on catalog_items
  for select using (current_planner_id() is not null);

-- ─── Hotspots ────────────────────────────────────────────────────────────────────

drop policy if exists admin_manage_hotspots on hotspots;
create policy admin_manage_hotspots on hotspots
  for all using (is_admin()) with check (is_admin());

drop policy if exists venue_manage_own_hotspots on hotspots;
create policy venue_manage_own_hotspots on hotspots
  for all using (
    exists (select 1 from rooms r where r.id = hotspots.room_id and r.venue_id = current_venue_id())
  )
  with check (
    exists (select 1 from rooms r where r.id = hotspots.room_id and r.venue_id = current_venue_id())
  );

drop policy if exists planner_read_hotspots on hotspots;
create policy planner_read_hotspots on hotspots
  for select using (current_planner_id() is not null);

-- ─── Rental companies ────────────────────────────────────────────────────────────
-- No rental-company login exists yet, so no "own row" policy — just
-- admin-manage, everyone-else-read (venues/planners need to see rental
-- company names attached to catalog items).

drop policy if exists admin_manage_rental_companies on rental_companies;
create policy admin_manage_rental_companies on rental_companies
  for all using (is_admin()) with check (is_admin());

drop policy if exists authenticated_read_rental_companies on rental_companies;
create policy authenticated_read_rental_companies on rental_companies
  for select using (auth.uid() is not null);

-- ─── Planners ────────────────────────────────────────────────────────────────────

drop policy if exists admin_manage_planners on planners;
create policy admin_manage_planners on planners
  for all using (is_admin()) with check (is_admin());

drop policy if exists planner_read_self on planners;
create policy planner_read_self on planners
  for select using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════════
-- BOOTSTRAP: creating your first Admin
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Supabase Dashboard → Authentication → Users → Add User
--    Create yourself with an email + password.
-- 2. Copy that user's UUID from the dashboard, then run:
--
--    insert into admins (user_id, name, email)
--    values ('<paste-user-uuid-here>', 'Calum', '<your-email>');
--
-- This has to be done manually once — there's no signup flow for admins by
-- design (only an existing admin can create new accounts, via Phase 2).
