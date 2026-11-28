-- Translations of the planner-written text on the public RSVP page (welcome note, schedule, dress code,
-- area text, photo captions, hotel descriptions and booking notes).
--
-- The planner writes the text once, in any language. After each save the app asks Claude to translate it into
-- Spanish, English and French and stores the result here, so a guest who switches language sees the text switch
-- too. Shape: {"h": {field: hash of the source text}, "es": {field: text}, "en": {...}, "fr": {...}}.
-- A translation is only shown while its hash still matches the current source text, so text edited after
-- the translation was made is never shown in an old translation: the guest sees the planner's own text instead.
-- Supersedes the 026 decision "text is ONE language for everyone".

alter table public.project_rsvp         add column translations jsonb;
alter table public.project_rsvp_photos  add column translations jsonb;
alter table public.project_rsvp_hotels  add column translations jsonb;
