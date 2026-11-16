-- Timetable + Run-Down (Notion: "Timetable & Team Schedule", "Run-Down List").
--
-- team_vendors    : the team's shared vendor/tag list (name, colour, contact,
--                   Instagram). Used to tag timetable blocks; Invoices and
--                   Music can adopt it later.
-- project_days    : one hourly calendar per event day (ceremony day, welcome
--                   party, brunch, ...). Day switcher in the UI.
-- timetable_blocks: the single source of truth for time. The Run-Down list is
--                   a view of these rows, so times are never entered twice.
--
-- Times are minutes from midnight of the block's day. end_min may run past
-- midnight (up to 30:00 = 06:00 next day) because wedding parties do.
--
-- Not in this migration (spec items still to build): team shift schedule,
-- Music timing, reference photos on run-down entries.

-- ── Vendors ─────────────────────────────────────────────────────────────────
create table public.team_vendors (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  colour       text not null default '#6366f1' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  contact_name text check (char_length(contact_name) <= 120),
  phone        text check (char_length(phone) <= 40),
  email        text check (char_length(email) <= 120),
  instagram    text check (char_length(instagram) <= 60),
  notes        text check (char_length(notes) <= 500),
  created_at   timestamptz not null default now()
);
create unique index team_vendors_team_name_key on public.team_vendors (team_id, lower(btrim(name)));

alter table public.team_vendors enable row level security;
create policy team_manage_vendors on public.team_vendors
  for all to authenticated
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());
create policy admin_manage_vendors on public.team_vendors
  for all to authenticated
  using (public.is_admin());

-- ── Days ────────────────────────────────────────────────────────────────────
create table public.project_days (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label      text not null check (char_length(btrim(label)) between 1 and 60),
  day_date   date,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, project_id)
);
create index project_days_project_idx on public.project_days (project_id, position);

alter table public.project_days enable row level security;
create policy planner_manage_accessible_project_days on public.project_days
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));

-- ── Blocks ──────────────────────────────────────────────────────────────────
create table public.timetable_blocks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  day_id        uuid not null,
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  start_min     integer not null check (start_min between 0 and 1439),
  end_min       integer not null check (end_min <= 1800),
  vendor_id     uuid references public.team_vendors(id) on delete set null,
  person        text check (char_length(person) <= 120),
  notes         text check (char_length(notes) <= 1000),
  materials     text[] not null default '{}' check (coalesce(array_length(materials, 1), 0) <= 50),
  -- Run-Down export switches, per entry (independent of what the vendor record holds)
  show_vendor    boolean not null default true,
  show_contact   boolean not null default true,
  show_instagram boolean not null default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_min > start_min),
  constraint timetable_blocks_day_fkey
    foreign key (day_id, project_id) references public.project_days(id, project_id) on delete cascade
);
create index timetable_blocks_day_idx on public.timetable_blocks (day_id, start_min);
create index timetable_blocks_project_idx on public.timetable_blocks (project_id);
create index timetable_blocks_vendor_idx on public.timetable_blocks (vendor_id) where vendor_id is not null;

alter table public.timetable_blocks enable row level security;
create policy planner_manage_accessible_timetable_blocks on public.timetable_blocks
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));

-- A block may only use a vendor from its own project's team.
create or replace function public.timetable_block_check_vendor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vendor_id is not null and not exists (
    select 1 from public.team_vendors v
    join public.projects p on p.team_id = v.team_id
    where v.id = new.vendor_id and p.id = new.project_id
  ) then
    raise exception 'Vendor does not belong to this project''s team' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_timetable_block_check
  before insert or update on public.timetable_blocks
  for each row execute function public.timetable_block_check_vendor();

-- ── Activity log ────────────────────────────────────────────────────────────
alter table public.project_activity drop constraint project_activity_entity_check;
alter table public.project_activity add constraint project_activity_entity_check
  check (entity in ('layout_object', 'guest', 'seat_assignment', 'payment', 'document', 'timetable'));

create or replace function public.log_timetable_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.timetable_blocks;
  act text;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  -- Cascade from a deleted project or a deleted day: nothing to log against.
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.projects where id = rec.project_id)
    or not exists (select 1 from public.project_days where id = rec.day_id)
  ) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    act := 'added';
  elsif tg_op = 'DELETE' then
    act := 'removed';
  elsif old.title     is distinct from new.title
     or old.start_min is distinct from new.start_min
     or old.end_min   is distinct from new.end_min
     or old.vendor_id is distinct from new.vendor_id
     or old.person    is distinct from new.person
     or old.day_id    is distinct from new.day_id then
    act := 'updated';
  else
    return null;  -- notes, materials and export switches are not logged
  end if;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, null, auth.uid(), public.activity_actor_name(auth.uid()),
     'timetable', act, rec.id, jsonb_build_object('title', rec.title));
  return null;
end;
$$;
create trigger trg_log_timetable_activity
  after insert or update or delete on public.timetable_blocks
  for each row execute function public.log_timetable_activity();

revoke execute on function public.timetable_block_check_vendor() from public, anon, authenticated;
revoke execute on function public.log_timetable_activity()       from public, anon, authenticated;
