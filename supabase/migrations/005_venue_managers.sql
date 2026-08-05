-- ─── Separate "the venue" from "the venue's login" ──────────────────────────────
-- Previously venues.user_id tied one login directly to one venue row, mixing
-- account concerns into the venue's own data. venue_managers is now the
-- account side; venues stays purely the property (name, capacity, rooms).

create table venue_managers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null unique references venues(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  created_at timestamptz default now()
);

-- Carry over any venue already linked to a login under the old model. Note:
-- there was no separate "manager name" before now, so this uses the venue's
-- own name as a placeholder — if you already created a test venue account,
-- go fix its name in venue_managers after this runs.
insert into venue_managers (venue_id, user_id, name, email)
select v.id, v.user_id, v.name, u.email
from venues v
join auth.users u on u.id = v.user_id
where v.user_id is not null;

alter table venues drop column user_id;

-- ─── Update the helper function — every existing policy that calls
-- current_venue_id() (venues, rooms, catalog_items, hotspots) picks this up
-- automatically, nothing else needs to change.

create or replace function current_venue_id()
returns uuid
language sql
security definer
stable
as $$
  select venue_id from venue_managers where user_id = auth.uid();
$$;

alter table venue_managers enable row level security;

drop policy if exists admin_manage_venue_managers on venue_managers;
create policy admin_manage_venue_managers on venue_managers
  for all using (is_admin()) with check (is_admin());

drop policy if exists venue_manager_read_self on venue_managers;
create policy venue_manager_read_self on venue_managers
  for select using (user_id = auth.uid());
