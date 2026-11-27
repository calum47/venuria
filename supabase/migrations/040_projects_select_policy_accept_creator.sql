-- 040: projects SELECT policy also accepts the creator directly. HISTORY ONLY: already applied live
-- (version 20261127113440, "projects_select_policy_accept_creator"); do not re-run.
--
-- Why: planner_can_view_project() is STABLE SECURITY DEFINER, so it cannot see a row inside its own
-- INSERT ... RETURNING. Migration 038 rebuilt the SELECT policy on the function alone, which brought back
-- the bug first fixed in 012 (new-project creation failing RLS for non-admin planners). The creator
-- branch below restores that fix.
--
-- This file was reconstructed from the live policy (pg_policies), not from the statement originally
-- applied, so the SQL text may differ from what ran. The resulting policy is identical.
drop policy if exists planner_read_accessible_projects on public.projects;
create policy planner_read_accessible_projects on public.projects
  for select
  using (
    public.planner_can_view_project(id)
    or planner_id = public.current_planner_id()
  );
