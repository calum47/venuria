-- RSVP page content (extends migration 025): cover photo, schedule, dress code,
-- map link, "getting there & the area" text + photos, and a list of hotels.
--
-- Sections on the public page, each hidden when empty and switchable by the planner:
--   cover      one photo (project_rsvp.cover_path)
--   details    schedule (one line per row), dress code, map link   (show_details)
--   area       free text + up to 6 photos with captions            (show_area)
--   hotels     up to 8 recommended hotels: name, address, link, booking note,
--              short text, one photo                                (show_hotels)
-- Hotels here are a list ON THE PAGE ONLY. They are not linked to a guest's
-- free-text hotel per night (guest_stays), by decision.
--
-- Text is ONE language for everyone (not per ES/EN/FR), by decision.
--
-- Images live in the PRIVATE bucket rsvp-media, path {team_id}/{project_id}/{uuid}.jpg
-- (same layout and policy as guest-photos). Guests never read the bucket: the
-- public page signs short-lived URLs with the service role. Every stored path
-- must sit in its own project's folder, so a planner cannot point a page at
-- another project's file. Links must be http(s) so a javascript: URL can never
-- be stored.
--
-- Not handled: files left behind when a whole project is deleted, or when a
-- row is deleted outside the app (same as guest photos).

alter table public.project_rsvp
  add column cover_path   text,
  add column schedule     text check (schedule is null or length(schedule) <= 1000),
  add column dress_code   text check (dress_code is null or length(dress_code) <= 300),
  add column map_url      text check (map_url is null or (length(map_url) <= 500 and map_url ~* '^https?://')),
  add column area_text    text check (area_text is null or length(area_text) <= 2000),
  add column show_details boolean not null default true,
  add column show_area    boolean not null default true,
  add column show_hotels  boolean not null default true;

alter table public.project_rsvp add constraint project_rsvp_cover_in_project
  check (cover_path is null or split_part(cover_path, '/', 2) = project_id::text);

create table public.project_rsvp_photos (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path       text not null,
  caption    text check (caption is null or length(caption) <= 120),
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 2) = project_id::text)
);
create index project_rsvp_photos_project_idx on public.project_rsvp_photos (project_id, position);

create table public.project_rsvp_hotels (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 120),
  address      text check (address is null or length(address) <= 200),
  url          text check (url is null or (length(url) <= 500 and url ~* '^https?://')),
  booking_note text check (booking_note is null or length(booking_note) <= 300),
  description  text check (description is null or length(description) <= 500),
  image_path   text,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  check (image_path is null or split_part(image_path, '/', 2) = project_id::text)
);
create index project_rsvp_hotels_project_idx on public.project_rsvp_hotels (project_id, position);

-- Caps, so a page stays light on a phone.
create or replace function public.project_rsvp_content_caps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'project_rsvp_photos'
     and (select count(*) from public.project_rsvp_photos where project_id = new.project_id) >= 6 then
    raise exception 'An RSVP page can have at most 6 area photos' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'project_rsvp_hotels'
     and (select count(*) from public.project_rsvp_hotels where project_id = new.project_id) >= 8 then
    raise exception 'An RSVP page can list at most 8 hotels' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger project_rsvp_photos_caps before insert on public.project_rsvp_photos
  for each row execute function public.project_rsvp_content_caps();
create trigger project_rsvp_hotels_caps before insert on public.project_rsvp_hotels
  for each row execute function public.project_rsvp_content_caps();

alter table public.project_rsvp_photos enable row level security;
alter table public.project_rsvp_hotels enable row level security;

create policy planner_manage_accessible_rsvp_photos on public.project_rsvp_photos
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy admin_manage_rsvp_photos on public.project_rsvp_photos
  for all using (public.is_admin()) with check (public.is_admin());

create policy planner_manage_accessible_rsvp_hotels on public.project_rsvp_hotels
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy admin_manage_rsvp_hotels on public.project_rsvp_hotels
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Private image bucket ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rsvp-media', 'rsvp-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy planner_manage_accessible_rsvp_media_objects on storage.objects
  for all to authenticated
  using (
    bucket_id = 'rsvp-media'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'rsvp-media'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false
    end
  );
