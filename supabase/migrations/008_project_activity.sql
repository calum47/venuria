-- Project activity log + per-user "last opened" stamps, backing the
-- "what changed since you last opened this project" modal in the editor.
--
-- project_activity is populated by database triggers, not by client code —
-- so every write path (autosave, auto-arrange, a future import, an admin
-- editing directly) is captured, and nothing can forget to log. Client code
-- only ever reads it.
--
-- Deliberate scope for v1: layout objects (tables/decor — chairs are skipped,
-- they move with their table and would turn one drag into nine events),
-- guests, and seat assignments. Room/floor-plan edits and stock changes are
-- not logged.
--
-- Applied directly to the live project on 2026-09-18 via MCP; this file keeps
-- the migration history in sync (same convention as 006/007).

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.project_activity (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  room_id       uuid,                      -- null for guest events (not room-scoped)
  actor_user_id uuid,                      -- auth.uid() at write time; null for service-role writes
  actor_name    text,                      -- resolved at write time so readers don't need cross-role read access
  entity        text not null check (entity in ('layout_object', 'guest', 'seat_assignment')),
  action        text not null,             -- added | moved | updated | removed | assigned | unassigned | reassigned
  entity_id     uuid,
  summary       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index project_activity_project_created_idx
  on public.project_activity (project_id, created_at desc);

create table public.project_visits (
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  last_opened_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.project_activity enable row level security;
alter table public.project_visits   enable row level security;

-- Read access mirrors layout_objects: a planner sees activity on their own
-- projects; admins see everything. No insert/update/delete policy for users —
-- rows are only written by the security-definer trigger functions below.
create policy planner_read_own_project_activity on public.project_activity
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_activity.project_id
        and p.planner_id = current_planner_id()
    )
  );

create policy admin_manage_project_activity on public.project_activity
  for all using (is_admin());

create policy user_manage_own_project_visits on public.project_visits
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Resolves a display name for whoever is writing. Security definer so it can
-- read across the role tables regardless of the caller's own RLS visibility.
create or replace function public.activity_actor_name(uid uuid)
returns text
language sql
stable security definer
set search_path = public
as $$
  select coalesce(
    (select name from public.planners        where user_id = uid limit 1),
    (select name from public.admins          where user_id = uid limit 1),
    (select name from public.venue_managers  where user_id = uid limit 1),
    (select name from public.rental_managers where user_id = uid limit 1),
    (select name from public.clients         where user_id = uid limit 1)
  );
$$;

-- ── Trigger functions ───────────────────────────────────────────────────────

create or replace function public.log_layout_object_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec       public.layout_objects;
  act       text;
  item_name text;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  -- Chairs are owned by their table and move with it — skip them entirely.
  if (rec.extra_data ->> 'isChairFor') is not null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    act := 'added';
  elsif tg_op = 'DELETE' then
    act := 'removed';
  else
    -- Autosave upserts every object in the room on each save, so most UPDATEs
    -- are no-ops. Only log when something actually changed.
    if old.position_x_cm is distinct from new.position_x_cm
       or old.position_y_cm is distinct from new.position_y_cm
       or old.rotation_deg  is distinct from new.rotation_deg
       or old.room_id       is distinct from new.room_id then
      act := 'moved';
    elsif old.extra_data      is distinct from new.extra_data
       or old.catalog_item_id is distinct from new.catalog_item_id
       or old.quantity        is distinct from new.quantity then
      act := 'updated';
    else
      return null;
    end if;
  end if;

  select name into item_name from public.catalog_items where id = rec.catalog_item_id;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, rec.room_id, auth.uid(), public.activity_actor_name(auth.uid()),
     'layout_object', act, rec.id,
     jsonb_build_object('name', item_name, 'label', rec.extra_data ->> 'tableLabel'));

  return null;
end;
$$;

create or replace function public.log_guest_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.guests;
  act text;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  if tg_op = 'INSERT' then
    act := 'added';
  elsif tg_op = 'DELETE' then
    act := 'removed';
  else
    if old.name is distinct from new.name or old.notes is distinct from new.notes then
      act := 'updated';
    else
      return null;
    end if;
  end if;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, null, auth.uid(), public.activity_actor_name(auth.uid()),
     'guest', act, rec.id, jsonb_build_object('name', rec.name));

  return null;
end;
$$;

create or replace function public.log_seat_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec        public.seat_assignments;
  act        text;
  guest_name text;
  the_room   uuid;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  if tg_op = 'INSERT' then
    act := 'assigned';
  elsif tg_op = 'DELETE' then
    act := 'unassigned';
  else
    if old.layout_object_id is distinct from new.layout_object_id
       or old.guest_id is distinct from new.guest_id then
      act := 'reassigned';
    else
      return null;
    end if;
  end if;

  -- Both lookups may come back null on a cascaded delete (parent row already
  -- gone) — that's fine, the modal falls back to generic wording.
  select name    into guest_name from public.guests         where id = rec.guest_id;
  select room_id into the_room   from public.layout_objects where id = rec.layout_object_id;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, the_room, auth.uid(), public.activity_actor_name(auth.uid()),
     'seat_assignment', act, rec.id, jsonb_build_object('guest_name', guest_name));

  return null;
end;
$$;

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger trg_log_layout_object_activity
  after insert or update or delete on public.layout_objects
  for each row execute function public.log_layout_object_activity();

create trigger trg_log_guest_activity
  after insert or update or delete on public.guests
  for each row execute function public.log_guest_activity();

create trigger trg_log_seat_assignment_activity
  after insert or update or delete on public.seat_assignments
  for each row execute function public.log_seat_assignment_activity();
