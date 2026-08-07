-- Rental Company Manager role — mirrors venue_managers exactly.
-- Also: catalog_item_stock, tracking how many of each master catalog item
-- (tables/chairs — venue_id/rental_company_id both null on catalog_items) a
-- specific venue or rental company owns. Informational only for now, not
-- enforced as a placement limit.
--
-- Applied directly to the live project on 2026-08-06 — this file brings the
-- migration history back in sync with that change (same drift issue flagged
-- in the 2026-08-05 changelog entry; see also 006_room_floor_plan_and_obstacles.sql).

create table public.rental_managers (
  id uuid primary key default gen_random_uuid(),
  rental_company_id uuid not null references public.rental_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz default now(),
  unique(rental_company_id)
);

create or replace function public.current_rental_company_id()
returns uuid
language sql
stable security definer
as $$
  select rental_company_id from rental_managers where user_id = auth.uid();
$$;

alter table public.rental_managers enable row level security;

create policy "admin_manage_rental_managers"
  on public.rental_managers for all
  using (is_admin()) with check (is_admin());

create policy "rental_manager_read_self"
  on public.rental_managers for select
  using (user_id = auth.uid());

-- Polymorphic owner_type + owner_id (rather than two nullable FK columns)
-- deliberately, so a single unique constraint and a single upsert onConflict
-- target both work cleanly — Postgres treats NULL <> NULL in unique
-- constraints, which would have let duplicate rows slip through with a
-- two-nullable-column design.
create table public.catalog_item_stock (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  owner_type text not null check (owner_type in ('venue','rental_company')),
  owner_id uuid not null,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (catalog_item_id, owner_type, owner_id)
);

comment on table public.catalog_item_stock is
  'Per-owner quantity of a master catalog item (tables/chairs for now). Not enforced as a hard placement limit — tracked so a future project summary can show "need to rent N more from a rental company" when a plan uses more than the venue itself has. owner_id is not a DB-level FK (polymorphic across venues/rental_companies) — integrity relies on RLS only ever allowing a venue/rental manager to write rows matching their own current_venue_id()/current_rental_company_id(), plus trusted admin writes.';

alter table public.catalog_item_stock enable row level security;

create policy "admin_manage_stock"
  on public.catalog_item_stock for all
  using (is_admin()) with check (is_admin());

create policy "venue_manage_own_stock"
  on public.catalog_item_stock for all
  using (owner_type = 'venue' and owner_id = current_venue_id())
  with check (owner_type = 'venue' and owner_id = current_venue_id());

create policy "rental_manage_own_stock"
  on public.catalog_item_stock for all
  using (owner_type = 'rental_company' and owner_id = current_rental_company_id())
  with check (owner_type = 'rental_company' and owner_id = current_rental_company_id());

create policy "planner_read_stock"
  on public.catalog_item_stock for select
  using (current_planner_id() is not null);

-- Also dropped 4 leftover "allow all" RLS policies that were silently
-- nullifying the properly-scoped policies sitting right next to them on
-- projects, layout_objects, guests, and seat_assignments — found while
-- checking projects' RLS ahead of adding the planner project-creation flow.
-- Included here for the historical record; already applied.
-- drop policy "Public can manage projects" on public.projects;
-- drop policy "Public can manage layout objects" on public.layout_objects;
-- drop policy "Allow all on guests" on public.guests;
-- drop policy "Allow all on seat_assignments" on public.seat_assignments;
