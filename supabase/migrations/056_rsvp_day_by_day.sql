-- RSVP page: a "day by day" programme (several entries, each with date, time frame, title, place, description and a tag)
-- and the wedding-day schedule as its own section.
--
--   project_rsvp_events   the day-by-day entries (up to 14), translated like the other page text (migration 055)
--   project_rsvp.show_schedule   the wedding-day schedule (project_rsvp.schedule) now has its own switch, on by default,
--                                 so pages that already show a schedule keep showing it
--   project_rsvp.section_order   now five movable blocks: details (day by day), schedule, form, area, hotels.
--                                 The check still accepts the old four-key order so an older app version keeps working.
-- Existing pages get their schedule right after their details block.

create table public.project_rsvp_events (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  position     int  not null default 0,
  event_date   date,
  starts_at    text check (starts_at is null or starts_at ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ends_at      text check (ends_at is null or ends_at ~ '^[0-2][0-9]:[0-5][0-9]$'),
  title        text not null check (length(btrim(title)) between 1 and 120),
  location     text check (location is null or length(location) <= 120),
  description  text check (description is null or length(description) <= 400),
  tag          text check (tag is null or length(tag) <= 60),
  translations jsonb,
  created_at   timestamptz not null default now()
);
create index project_rsvp_events_project_idx on public.project_rsvp_events (project_id, event_date, starts_at, position);

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
  if tg_table_name = 'project_rsvp_events'
     and (select count(*) from public.project_rsvp_events where project_id = new.project_id) >= 14 then
    raise exception 'An RSVP page can have at most 14 day-by-day entries' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger project_rsvp_events_caps before insert on public.project_rsvp_events
  for each row execute function public.project_rsvp_content_caps();

alter table public.project_rsvp_events enable row level security;

create policy planner_manage_accessible_rsvp_events on public.project_rsvp_events
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));
create policy admin_manage_rsvp_events on public.project_rsvp_events
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.project_rsvp add column show_schedule boolean not null default true;

alter table public.project_rsvp drop constraint project_rsvp_section_order_check;
alter table public.project_rsvp add constraint project_rsvp_section_order_check check (
  (array_length(section_order, 1) = 4 and section_order @> array['details', 'form', 'area', 'hotels'])
  or (array_length(section_order, 1) = 5 and section_order @> array['details', 'schedule', 'form', 'area', 'hotels'])
);
alter table public.project_rsvp alter column section_order set default array['details', 'schedule', 'form', 'area', 'hotels'];

update public.project_rsvp r
set section_order = (
  select array_agg(x order by o, k)
  from (
    select e as x, ord * 2 as o, 0 as k from unnest(r.section_order) with ordinality as u(e, ord)
    union all
    select 'schedule', ord * 2 + 1, 1 from unnest(r.section_order) with ordinality as u(e, ord) where e = 'details'
  ) s
)
where array_length(section_order, 1) = 4;
