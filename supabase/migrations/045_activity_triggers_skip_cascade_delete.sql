-- 045: deleting a project failed with
--   insert or update on table "project_activity" violates foreign key
--   constraint "project_activity_project_id_fkey"
-- The project delete cascades into guests, layout_objects and seat_assignments;
-- their AFTER DELETE triggers tried to log a "removed" row for a project that was
-- already being deleted. The timetable, payment and document triggers already
-- skip that case; this adds the same guard to the other three.
-- Applied live via the Supabase MCP on 2026-11-28 (history file only).

create or replace function public.log_guest_activity()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  rec public.guests;
  act text;
  sum jsonb;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = rec.project_id) then
    return null;
  end if;

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
       or old.photo_path   is distinct from new.photo_path
       or old.rsvp_status  is distinct from new.rsvp_status then
      act := 'updated';
    else
      return null;
    end if;
  end if;

  sum := jsonb_build_object('name', rec.name);
  if rec.rsvp_status is not null and rec.rsvp_source = 'link' then
    sum := sum || jsonb_build_object('rsvp', rec.rsvp_status, 'via', 'link');
  end if;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, null, auth.uid(), public.activity_actor_name(auth.uid()),
     'guest', act, rec.id, sum);

  return null;
end;
$function$;

create or replace function public.log_layout_object_activity()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  rec       public.layout_objects;
  act       text;
  item_name text;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = rec.project_id) then
    return null;
  end if;

  if (rec.extra_data ->> 'isChairFor') is not null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    act := 'added';
  elsif tg_op = 'DELETE' then
    act := 'removed';
  else
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
$function$;

create or replace function public.log_seat_assignment_activity()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  rec        public.seat_assignments;
  act        text;
  guest_name text;
  the_room   uuid;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = rec.project_id) then
    return null;
  end if;

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

  select name    into guest_name from public.guests         where id = rec.guest_id;
  select room_id into the_room   from public.layout_objects where id = rec.layout_object_id;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, the_room, auth.uid(), public.activity_actor_name(auth.uid()),
     'seat_assignment', act, rec.id, jsonb_build_object('guest_name', guest_name));

  return null;
end;
$function$;
