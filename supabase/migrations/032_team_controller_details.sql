-- Who is responsible for the guests' data on the public RSVP page.
--
-- Under the GDPR the planner's company is the controller of guest data;
-- Venuria is the processor. The RSVP page names the company and gives a contact
-- address for access/deletion requests. Both are optional in the database
-- (existing teams have none; the page falls back to the team name and the
-- planner is warned in the RSVP panel while the email is missing). Only the
-- team manager can change them (existing manager_update_team policy).

alter table public.teams
  add column company_name text
    check (company_name is null or length(btrim(company_name)) between 2 and 120),
  add column contact_email text
    check (contact_email is null or (length(contact_email) <= 200 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
