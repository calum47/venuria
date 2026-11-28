-- Optional map on the public RSVP page: where the venue is and where the recommended hotels are.
--
-- Everything is optional and OFF by default:
--   project_rsvp.show_map       the planner switches the map on (default false)
--   project_rsvp.map_address    venue address, used when the venue's Maps link gives no position
--   project_rsvp.map_lat/lng    the venue's position, found by the app from the Maps link or the address
--   project_rsvp_hotels.maps_url   optional Google Maps link of the hotel
--   project_rsvp_hotels.lat/lng    the hotel's position, found the same way
--
-- The planner never pins anything: the position is looked up when they save (see /api/rsvp/locate).
-- A place without a position is simply left off the map. Guests never trigger a lookup.
-- Same rules as the other links on this page: http(s) only, so a javascript: URL can never be stored.

alter table public.project_rsvp
  add column show_map    boolean not null default false,
  add column map_address text check (map_address is null or length(map_address) <= 200),
  add column map_lat     double precision check (map_lat is null or map_lat between -90 and 90),
  add column map_lng     double precision check (map_lng is null or map_lng between -180 and 180),
  add constraint project_rsvp_map_position_pair check ((map_lat is null) = (map_lng is null));

alter table public.project_rsvp_hotels
  add column maps_url text check (maps_url is null or (length(maps_url) <= 500 and maps_url ~* '^https?://')),
  add column lat      double precision check (lat is null or lat between -90 and 90),
  add column lng      double precision check (lng is null or lng between -180 and 180),
  add constraint project_rsvp_hotels_position_pair check ((lat is null) = (lng is null));
