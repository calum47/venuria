-- Deleting a project is permanent (guests, layout, payments, RSVP data all go
-- with it), so it is limited to the planner who created it, or to managers and
-- leads of the team. Having read access (e.g. a "public" project in your team,
-- or being assigned to it) is no longer enough. Admins keep full control through
-- admin_manage_projects.

drop policy if exists planner_delete_accessible_projects on public.projects;

create policy planner_delete_own_or_managed_projects on public.projects
  for delete to authenticated
  using (
    planner_can_access_project(id)
    and (
      planner_id = current_planner_id()
      or exists (
        select 1 from public.planners me
         where me.user_id = auth.uid()
           and me.team_id = projects.team_id
           and me.role in ('manager', 'lead')
      )
    )
  );
