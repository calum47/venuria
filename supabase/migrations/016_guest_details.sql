-- Guest list details: per-guest fields, families, hotel per night, VIP photos.
--
-- guests gains: is_vip, gives_speech (the "speeches" checklist), dietary
-- (allergies / food needs, free text), age_group (adult | child | baby),
-- family_id and photo_path.
--
-- guest_families: a named group ("García family") so parents and their
-- children / babies show as linked. A guest belongs to at most one family.
-- A family with no members is just an unused row; the app removes it.
--
-- guest_stays: where a guest sleeps, ONE ROW PER NIGHT (a stay can change from
-- night to night across a multi-day event). `night` is the date the night
-- starts, i.e. the evening of that date.
--
-- guest-photos bucket: PRIVATE. Photos of identifiable people are personal
-- data, so they are never public and are only shown through short-lived
-- signed URLs. JPEG / PNG / WebP, 5 MB (the app downsizes before upload).
--
-- Access: planners via planner_can_access_project(), as for every other
-- project-scoped table. The two new tables have no client policy: clients are
-- deferred. NOTE the existing client_manage_own_guests policy (migration 003)
-- already lets a client write any column of their own project's guests, so the
-- new columns are client-writable the day clients exist; photo_path is
-- constrained to the project's own folder for that reason.
--
-- Not covered here: guest_stays changes are not written to project_activity
-- (a multi-night range would add one row per night). Guest field and photo
-- changes are logged through the existing guest trigger, extended below.
--
-- Applied directly to the live project on 2026-11-16 via MCP; this file keeps
-- the migration history in sync.

-- ── Families ────────────────────────────────────────────────────────────────

create table public.guest_families (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  -- Lets guests prove their family is in the same project.
  unique (id, project_id)
);

create index guest_families_project_idx on public.guest_families (project_id);

-- ── Guest columns ───────────────────────────────────────────────────────────

alter table public.guests
  add column is_vip       boolean not null default false,
  add column gives_speech boolean not null default false,
  add column dietary      text check (dietary is null or length(dietary) <= 500),
  add column age_group    text not null default 'adult'
                          check (age_group in ('adult', 'child', 'baby')),
  add column family_id    uuid,
  add column photo_path   text;

-- Lets guest_stays prove its guest is in the same project.
alter table public.guests add constraint guests_id_project_key unique (id, project_id);

-- A family must be in the same project; deleting a family unlinks, never deletes, guests.
alter table public.guests
  add constraint guests_family_same_project_fkey
  foreign key (family_id, project_id)
  references public.guest_families (id, project_id)
  on delete set null (family_id);

-- Path convention {team_id}/{project_id}/{uuid}.{ext}: the project segment must
-- match the row, so a row can never point at another project's photo.
alter table public.guests
  add constraint guests_photo_path_project_check
  check (photo_path is null or split_part(photo_path, '/', 2) = project_id::text);

create index guests_family_idx on public.guests (family_id) where family_id is not null;

-- ── Hotel per night ─────────────────────────────────────────────────────────

create table public.guest_stays (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  guest_id   uuid not null,
  night      date not null,
  hotel      text not null check (length(btrim(hotel)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (guest_id, night),
  foreign key (guest_id, project_id)
    references public.guests (id, project_id) on delete cascade
);

create index guest_stays_project_night_idx on public.guest_stays (project_id, night);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- planner_can_access_project() already includes is_admin().

alter table public.guest_families enable row level security;
alter table public.guest_stays    enable row level security;

create policy planner_manage_accessible_guest_families on public.guest_families
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));

create policy planner_manage_accessible_guest_stays on public.guest_stays
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));

-- ── Private photo bucket ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guest-photos', 'guest-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

-- Same guarded-cast policy as project-documents: a malformed path is denied,
-- not an error.
create policy planner_manage_accessible_guest_photo_objects on storage.objects
  for all to authenticated
  using (
    bucket_id = 'guest-photos'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'guest-photos'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false
    end
  );

-- ── Activity log ────────────────────────────────────────────────────────────
-- Same function as migration 008, but an UPDATE now also counts when any of
-- the new guest fields changed (it used to look at name and notes only).

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
    if old.name         is distinct from new.name
       or old.notes        is distinct from new.notes
       or old.is_vip       is distinct from new.is_vip
       or old.gives_speech is distinct from new.gives_speech
       or old.dietary      is distinct from new.dietary
       or old.age_group    is distinct from new.age_group
       or old.family_id    is distinct from new.family_id
       or old.photo_path   is distinct from new.photo_path then
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
