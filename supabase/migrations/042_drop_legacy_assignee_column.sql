-- 042: drop projects.assigned_to_planner_id (the pre-038 single assignee).
-- Apply ONLY after the app version that no longer selects it is deployed (select of a missing column errors).
-- Every project that had a value is already in project_assignees (checked 28 Nov 2026).
-- Dropping the column also drops projects_assigned_idx and projects_assigned_to_planner_id_fkey.
alter table public.projects drop column assigned_to_planner_id;
