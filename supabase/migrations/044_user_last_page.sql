-- History file: this migration was applied live via the Supabase MCP on 28 Nov 2026.
-- One row per user: the last project page they had open, so "Last project" in the nav can return
-- to that page instead of the project hub. Deliberately separate from project_visits, whose
-- last_opened_at drives the "since you were last here" activity modal and must not be touched
-- by plain page views.

create table public.user_last_page (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  path       text not null check (length(path) <= 200 and path ~ '^/(planner/projects|editor)/'),
  updated_at timestamptz not null default now()
);

create index user_last_page_project_id_idx on public.user_last_page (project_id);

alter table public.user_last_page enable row level security;

create policy user_manage_own_last_page on public.user_last_page
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
