-- 046: remember each user's interface language (English / Spanish) on their account, so it follows
-- them across devices. The browser cookie `venuria-lang` stays the source of truth for rendering
-- (it also works on the login page before anyone is signed in); this table only restores the
-- choice when the cookie is missing, and is written whenever the user changes language.
-- Applied live 2026-11-28. The app works
-- without it (the language just isn't remembered per account).

create table public.user_preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  language   text check (language in ('en', 'es')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy user_manage_own_preferences on public.user_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
