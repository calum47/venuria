-- Projects are titled by the couple's names ("Anna & Tom"), not the venue.
--
-- projects.couple_names is optional in the database (existing projects have
-- none and fall back to showing the venue name); the New project form requires
-- it from now on. Plain text, max 80 characters, shown as typed.
--
-- Migration 028 added the same idea on the RSVP page (project_rsvp.couple_names).
-- Two copies of one fact would drift, so: carry any value already entered there
-- over to the project, then drop the RSVP column. The RSVP page now reads the
-- name from the project.

alter table public.projects
  add column couple_names text
  check (couple_names is null or length(btrim(couple_names)) between 1 and 80);

update public.projects p
   set couple_names = btrim(r.couple_names)
  from public.project_rsvp r
 where r.project_id = p.id
   and r.couple_names is not null
   and p.couple_names is null;

alter table public.project_rsvp drop column couple_names;
