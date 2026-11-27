-- 041: stop using the legacy single-assignee column, and make new projects Public by default.
-- HISTORY ONLY: applied live 28 Nov 2026 as "legacy_assignee_functions_default_public"; do not re-run.
--
-- 1. The two functions that read projects.assigned_to_planner_id (planner_can_access_project and the
--    projects_before_update trigger) are rewritten without it. project_assignees (038) is the only source now.
--    Checked before applying: the access result for every planner x project pair was identical (digest match).
-- 2. projects.visibility now defaults to 'public' (was 'private'). Existing projects keep their value.
--    A Public project is view-only for team members who are not creator/assignee/lead/manager.
--
-- The column itself is dropped in 042, after the app code that still selected it has been deployed.

create or replace function public.planner_can_access_project(pid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    is_admin()
    or exists (
      select 1
        from public.projects pr
        join public.planners me on me.user_id = auth.uid()
       where pr.id = pid
         and pr.team_id = me.team_id
         and (
           pr.planner_id = me.id
           or exists (select 1 from public.project_assignees pa where pa.project_id = pr.id and pa.planner_id = me.id)
           or me.role in ('manager', 'lead')
         )
    );
$function$;

create or replace function public.projects_before_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me public.planners;
begin
  if is_admin() then
    return new;
  end if;
  select * into me from public.planners where user_id = auth.uid();

  if new.planner_id is distinct from old.planner_id or new.team_id is distinct from old.team_id then
    raise exception 'Creator and team cannot be changed' using errcode = '42501';
  end if;

  if new.visibility is distinct from old.visibility then
    if not (old.planner_id = me.id or me.role in ('manager', 'lead')) then
      raise exception 'Only the creator, a manager or a lead can change visibility' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

alter table public.projects alter column visibility set default 'public';
