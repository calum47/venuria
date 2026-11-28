-- 051: where a project's chairs, tables, plates… come from.
--
-- project_item_sources = the planner's choice "N of this item are rented from company X for this project".
-- Whatever is not allocated to a company is taken from the venue's own stock (implicit, nothing stored).
--
-- A company's availability for a project = its stock minus what it is already committed to OTHER projects
-- on the SAME event_date (assumption: one event date = one day of use; multi-day events and set-up days are
-- not modelled). Those other projects belong to other teams, so the planner never reads their rows:
-- rental_committed_elsewhere() returns only per-company totals, and only to someone who can view the project.
--
-- Applied live 2026-11-28.

create table if not exists public.project_item_sources (
  project_id        uuid not null references public.projects(id) on delete cascade,
  catalog_item_id   uuid not null references public.catalog_items(id) on delete cascade,
  rental_company_id uuid not null references public.rental_companies(id) on delete cascade,
  quantity          integer not null check (quantity > 0),
  updated_at        timestamptz not null default now(),
  primary key (project_id, catalog_item_id, rental_company_id)
);
create index if not exists project_item_sources_company_item_idx
  on public.project_item_sources (rental_company_id, catalog_item_id);

alter table public.project_item_sources enable row level security;

create policy admin_manage_project_item_sources on public.project_item_sources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy planner_view_project_item_sources on public.project_item_sources
  for select to authenticated using (public.planner_can_view_project(project_id));

create policy planner_edit_project_item_sources on public.project_item_sources
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (
    public.planner_can_access_project(project_id)
    and exists (select 1 from public.rental_companies rc
                 where rc.id = project_item_sources.rental_company_id and rc.is_vendor and rc.has_vendor_stock)
  );

create or replace function public.rental_committed_elsewhere(p_project uuid, p_items uuid[])
returns table (catalog_item_id uuid, rental_company_id uuid, committed integer)
language sql stable security definer set search_path to 'public' as $$
  select s.catalog_item_id, s.rental_company_id, sum(s.quantity)::integer
    from public.project_item_sources s
    join public.projects p  on p.id = s.project_id
    join public.projects me on me.id = p_project
   where public.planner_can_view_project(p_project)
     and s.project_id <> p_project
     and me.event_date is not null
     and p.event_date = me.event_date
     and s.catalog_item_id = any (p_items)
   group by s.catalog_item_id, s.rental_company_id;
$$;
revoke execute on function public.rental_committed_elsewhere(uuid, uuid[]) from public, anon;
grant execute on function public.rental_committed_elsewhere(uuid, uuid[]) to authenticated;
