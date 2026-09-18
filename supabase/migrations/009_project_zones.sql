-- Zone colour-coding (Phase 4b). A zone is a named, coloured area a Planner
-- draws on a room's canvas for one project: Dance Floor, Bar, Ceremony,
-- Buffet, Photo Booth, and so on. Per project, per room — this is the
-- event's plan, not a venue-level fact (the venue's fixed obstacles already
-- live on rooms.obstacles).
--
-- `shape` reuses the exact ObstacleShape JSON the venue floor-plan editor
-- already uses ({type:'rect'|'polygon'|'circle', ...} in cm). That's
-- deliberate: Auto-Arrange treats every zone as an obstacle, so the
-- "keep tables off the dance floor" behaviour is the same validateFootprint
-- check as a pillar, with no new geometry code.
--
-- Applied directly to the live project on 2026-09-18 via MCP; this file keeps
-- the migration history in sync (same convention as 006–008).

create table public.project_zones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  name       text not null,
  color      text not null,           -- hex, from a fixed palette in the app
  shape      jsonb not null,          -- ObstacleShape
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index project_zones_project_room_idx
  on public.project_zones (project_id, room_id, sort_order);

alter table public.project_zones enable row level security;

-- Access mirrors layout_objects exactly.
create policy planner_manage_own_project_zones on public.project_zones
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_zones.project_id
        and p.planner_id = current_planner_id()
    )
  );

create policy client_read_own_project_zones on public.project_zones
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_zones.project_id
        and p.client_id = current_client_id()
    )
  );

create policy admin_manage_project_zones on public.project_zones
  for all using (is_admin());
