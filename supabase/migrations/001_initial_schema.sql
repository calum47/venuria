-- ─── Venues ───────────────────────────────────────────────────────────────────

create table venues (
                        id uuid primary key default gen_random_uuid(),
                        name text not null,
                        max_capacity_persons integer,
                        created_at timestamptz default now()
);

-- ─── Rooms ────────────────────────────────────────────────────────────────────

create table rooms (
                       id uuid primary key default gen_random_uuid(),
                       venue_id uuid references venues(id) on delete cascade,
                       name text not null,
                       type text check (type in ('indoor', 'outdoor')) default 'indoor',
                       floor_polygon jsonb not null default '[]',
                       bounding_box_width_cm integer not null default 1500,
                       bounding_box_depth_cm integer not null default 1000,
                       created_at timestamptz default now()
);

-- ─── Hotspots ─────────────────────────────────────────────────────────────────

create table hotspots (
                          id uuid primary key default gen_random_uuid(),
                          room_id uuid references rooms(id) on delete cascade,
                          position_x_cm integer not null,
                          position_y_cm integer not null,
                          height_cm integer not null default 160,
                          equirect_image_url text,
                          fov_deg integer default 90,
                          linked_hotspot_ids uuid[] default '{}',
                          created_at timestamptz default now()
);

-- ─── Rental Companies ─────────────────────────────────────────────────────────

create table rental_companies (
                                  id uuid primary key default gen_random_uuid(),
                                  name text not null,
                                  contact_email text,
                                  created_at timestamptz default now()
);

-- ─── Catalog Items ────────────────────────────────────────────────────────────

create table catalog_items (
                               id uuid primary key default gen_random_uuid(),
                               name text not null,
                               category text not null,
                               owner_type text check (owner_type in ('venue', 'rental')) not null,
                               venue_id uuid references venues(id) on delete set null,
                               rental_company_id uuid references rental_companies(id) on delete set null,
                               width_cm integer not null,
                               depth_cm integer not null,
                               height_cm integer not null,
                               model_url text,
                               image_url text,
                               price_per_unit numeric(10, 2),
                               created_at timestamptz default now()
);

-- ─── Planners ─────────────────────────────────────────────────────────────────

create table planners (
                          id uuid primary key default gen_random_uuid(),
                          user_id uuid references auth.users(id) on delete cascade,
                          name text not null,
                          email text not null unique,
                          planner_code text not null unique default upper(substring(gen_random_uuid()::text, 1, 8)),
                          created_at timestamptz default now()
);

-- ─── Clients ──────────────────────────────────────────────────────────────────

create table clients (
                         id uuid primary key default gen_random_uuid(),
                         user_id uuid references auth.users(id) on delete set null,
                         name text,
                         email text,
                         linked_planner_id uuid references planners(id) on delete set null,
                         partner_name text,
                         created_at timestamptz default now()
);

-- ─── Projects ─────────────────────────────────────────────────────────────────

create table projects (
                          id uuid primary key default gen_random_uuid(),
                          venue_id uuid references venues(id) on delete set null,
                          room_id uuid references rooms(id) on delete set null,
                          client_id uuid references clients(id) on delete set null,
                          planner_id uuid references planners(id) on delete set null,
                          status text check (status in (
                                                        'in_progress',
                                                        'awaiting_client_input',
                                                        'changes_suggested',
                                                        'approved',
                                                        'finalised'
                              )) default 'in_progress',
                          event_date date,
                          due_by date,
                          guest_count integer,
                          created_at timestamptz default now(),
                          updated_at timestamptz default now()
);

-- ─── Layout Objects ───────────────────────────────────────────────────────────

create table layout_objects (
                                id uuid primary key default gen_random_uuid(),
                                project_id uuid references projects(id) on delete cascade,
                                catalog_item_id uuid references catalog_items(id) on delete set null,
                                position_x_cm integer not null,
                                position_y_cm integer not null,
                                rotation_deg numeric(6, 2) default 0,
                                quantity integer default 1,
                                created_at timestamptz default now()
);

-- ─── Auto-update updated_at on projects ───────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
    before update on projects
    for each row execute function update_updated_at();

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index on rooms(venue_id);
create index on hotspots(room_id);
create index on catalog_items(venue_id);
create index on catalog_items(rental_company_id);
create index on projects(client_id);
create index on projects(planner_id);
create index on projects(venue_id);
create index on layout_objects(project_id);