-- The wedding-day block of the public RSVP page ("The big day") gets a title the planner can change.
-- Null = the page's own default title in the guest's language. The text is translated like the rest (migration 055).
-- The dress code is no longer shown on the page (it is a label on the day-by-day entries); the column stays so nothing is lost.

alter table public.project_rsvp add column schedule_title text check (schedule_title is null or char_length(schedule_title) <= 60);
