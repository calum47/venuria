-- RSVP page: the names shown as the large title at the top ("Anna & Tom").
-- Optional; when empty the page falls back to the venue name. Plain text, shown
-- as typed in every language. Existing RLS on project_rsvp (planner / admin)
-- already covers the new column.

alter table public.project_rsvp
  add column couple_names text
  check (couple_names is null or length(btrim(couple_names)) between 1 and 80);
