-- RSVP link tokens may now be readable: "<names>-<dd-mm-yyyy>-<8 random characters>", e.g.
-- chloe-luke-21-05-2027-k7m2q9xd. The 8-character code (31-letter alphabet, about 8.5e11 combinations) is the secret;
-- the names and date are only there so a guest can see it is the right wedding. The app builds the token.
--
-- Links that already exist (64 hex characters) are untouched and keep working: the new format check below accepts them.
-- It replaces the old "at least 40 characters" check, which a short token could not meet. Lowercase letters, digits and
-- single hyphens only, 12 to 100 characters, so a token can never need escaping in an address.

alter table public.project_rsvp drop constraint project_rsvp_token_check;
alter table public.project_rsvp
  add constraint project_rsvp_token_format check (token ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(token) between 12 and 100);
