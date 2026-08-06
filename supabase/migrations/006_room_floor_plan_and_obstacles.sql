-- Floor-plan PNG + calibration + obstacles for the Venue Manager room editor.
-- `floor_polygon` already existed (jsonb, default '[]') but was dead — nothing wrote or
-- read it. It is now repurposed as the traced room-boundary polygon in cm coordinates,
-- replacing bounding_box_width_cm/depth_cm as the source of truth for room shape.
-- The bounding_box_* columns are kept as a cached fallback (derived from the polygon)
-- for any code path that still wants a quick width/depth without walking the polygon.
--
-- Applied directly to the live project on 2026-08-06 — this file brings the migration
-- history back in sync with that change (see the 2026-08-05 changelog entry re: drift
-- between committed migrations and the live schema).

alter table public.rooms
  add column if not exists floor_plan_image_url text,
  add column if not exists floor_plan_image_width_px integer,
  add column if not exists floor_plan_image_height_px integer,
  add column if not exists cm_per_px numeric,
  add column if not exists obstacles jsonb not null default '[]'::jsonb;

comment on column public.rooms.floor_polygon is
  'Traced room boundary in cm coordinates, ordered polygon points. Furniture must stay inside. Source of truth for room shape once set; falls back to bounding_box_* rectangle when empty.';
comment on column public.rooms.obstacles is
  'Array of {id, type: rect|circle|polygon, label?, ...shape fields in cm}. Furniture must stay outside every obstacle (pillars, columns, planters).';
comment on column public.rooms.cm_per_px is
  'Calibration ratio set by the venue manager after upload: real-world cm per image pixel. Null until calibrated.';

-- Storage: floor-plans bucket had zero RLS policies, so no session (only the service-role
-- key) could actually write to it. Scope venue managers to their own venue_id/ folder,
-- matching the existing rooms/venues policy pattern via current_venue_id().
create policy "public_read_floor_plans"
  on storage.objects for select
  using (bucket_id = 'floor-plans');

create policy "venue_manage_own_floor_plans"
  on storage.objects for all
  using (bucket_id = 'floor-plans' and (storage.foldername(name))[1] = current_venue_id()::text)
  with check (bucket_id = 'floor-plans' and (storage.foldername(name))[1] = current_venue_id()::text);

create policy "admin_manage_floor_plans"
  on storage.objects for all
  using (bucket_id = 'floor-plans' and is_admin())
  with check (bucket_id = 'floor-plans' and is_admin());
