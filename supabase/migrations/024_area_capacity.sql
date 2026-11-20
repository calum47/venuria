-- Capacity per area (Notion, TBD page "capacity per area, not per venue"; To Do Phase 11).
--
-- Decided 28 Sep + 20 Nov 2026:
--   * It is a PEOPLE limit with two figures per room: seated (dinner, ceremony)
--     and standing (cocktail, dancing; a few chairs are still expected). The Venue
--     Manager owns the numbers (venue_manage_own_rooms already allows the update).
--   * When a planner first opens a room in a project they choose whether it is a
--     Seated or a Standing scene there; that decides which figure applies.
--     Stored per project and room in project_room_settings.
--   * Going over the figure is a WARNING, not a block. The planner can continue
--     after writing a note; the note is stored with the load it covered, so the
--     warning returns if the room grows past what was acknowledged. Overrides show
--     in the project activity log.
--   * venues.max_capacity_persons is left alone and is not enforced here.
--
-- What is counted (app side, see src/lib/capacity.ts): seated = chairs placed in
-- the room; standing = the project's guest total.

alter table public.rooms
  add column capacity_seated   integer check (capacity_seated   is null or capacity_seated   between 0 and 100000),
  add column capacity_standing integer check (capacity_standing is null or capacity_standing between 0 and 100000);

create table public.project_room_settings (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  room_id       uuid not null references public.rooms(id) on delete cascade,
  mode          text not null check (mode in ('seated', 'standing')),
  override_note text check (override_note is null or length(btrim(override_note)) between 1 and 300),
  override_load integer check (override_load is null or override_load >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, room_id),
  constraint project_room_settings_override_pair check ((override_note is null) = (override_load is null))
);

create trigger trg_project_room_settings_updated_at
  before update on public.project_room_settings
  for each row execute function public.update_updated_at();

alter table public.project_room_settings enable row level security;

create policy planner_manage_accessible_room_settings on public.project_room_settings
  for all
  using (planner_can_access_project(project_id))
  with check (planner_can_access_project(project_id));

create policy admin_manage_room_settings on public.project_room_settings
  for all using (is_admin()) with check (is_admin());

-- The room must belong to the project's venue; changing the mode clears any
-- acknowledgement (it was for the other figure).
create or replace function public.project_room_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from projects p join rooms r on r.venue_id = p.venue_id
     where p.id = new.project_id and r.id = new.room_id
  ) then
    raise exception 'That room does not belong to this project''s venue' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.mode is distinct from old.mode then
    new.override_note := null;
    new.override_load := null;
  end if;
  return new;
end;
$$;

create trigger trg_project_room_settings_guard
  before insert or update on public.project_room_settings
  for each row execute function public.project_room_settings_guard();

-- Activity log: only overrides are logged.
alter table public.project_activity drop constraint project_activity_entity_check;
alter table public.project_activity add constraint project_activity_entity_check
  check (entity in ('layout_object', 'guest', 'seat_assignment', 'payment', 'document', 'timetable', 'capacity'));

create or replace function public.log_capacity_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.override_note is not null
     and (tg_op = 'INSERT'
          or old.override_note is distinct from new.override_note
          or old.override_load is distinct from new.override_load) then
    insert into public.project_activity
      (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
    values
      (new.project_id, new.room_id, auth.uid(), public.activity_actor_name(auth.uid()),
       'capacity', 'override', new.id,
       jsonb_build_object('mode', new.mode, 'load', new.override_load));
  end if;
  return null;
end;
$$;

create trigger trg_log_capacity_override
  after insert or update on public.project_room_settings
  for each row execute function public.log_capacity_override();

revoke execute on function public.project_room_settings_guard() from public, anon, authenticated;
revoke execute on function public.log_capacity_override()       from public, anon, authenticated;
