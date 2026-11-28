-- 052: renting items from a vendor becomes a request the vendor answers.
--
-- project_item_sources (051) rows now carry a status:
--   pending   the planner asked for requested_quantity; quantity = requested_quantity (held, counted as booked)
--   accepted  the vendor confirmed `quantity` (<= requested_quantity: a partial acceptance is allowed)
--   declined  the vendor said no; quantity = 0, nothing is held
-- Pending and accepted rows count against the vendor's stock on that event date (rental_committed_elsewhere);
-- declined rows do not.
--
-- Rows are written only through two SECURITY DEFINER functions, so neither side can set what is not theirs:
--   request_item_from_vendor()   planner (can edit the project): asks; also tags the vendor on the project
--   respond_to_item_request()    the vendor's own login: accepts all / part / none
-- Rows from 051 (written directly by planners, never seen by a vendor) become pending requests.
--
-- Applied live 2026-11-28.

alter table public.project_item_sources
  add column if not exists status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  add column if not exists requested_quantity integer,
  add column if not exists decided_at timestamptz;

update public.project_item_sources set requested_quantity = quantity where requested_quantity is null;
alter table public.project_item_sources alter column requested_quantity set not null;
alter table public.project_item_sources add constraint project_item_sources_requested_check check (requested_quantity > 0);
alter table public.project_item_sources drop constraint if exists project_item_sources_quantity_check;
alter table public.project_item_sources add constraint project_item_sources_quantity_check
  check (quantity >= 0 and quantity <= requested_quantity);

-- No direct writes any more: only the functions below.
drop policy if exists planner_edit_project_item_sources on public.project_item_sources;

create policy vendor_view_own_item_requests on public.project_item_sources
  for select to authenticated using (rental_company_id = public.current_rental_company_id());

create or replace function public.rental_committed_elsewhere(p_project uuid, p_items uuid[])
returns table (catalog_item_id uuid, rental_company_id uuid, committed integer)
language sql stable security definer set search_path to 'public' as $$
  select s.catalog_item_id, s.rental_company_id, sum(s.quantity)::integer
    from public.project_item_sources s
    join public.projects p  on p.id = s.project_id
    join public.projects me on me.id = p_project
   where public.planner_can_view_project(p_project)
     and s.project_id <> p_project
     and s.status <> 'declined'
     and me.event_date is not null
     and p.event_date = me.event_date
     and s.catalog_item_id = any (p_items)
   group by s.catalog_item_id, s.rental_company_id;
$$;

-- What the vendor's own login has already promised to OTHER projects on this project's event date.
create or replace function public.my_committed_that_day(p_project uuid, p_item uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(s.quantity), 0)::integer
    from public.project_item_sources s
    join public.projects p  on p.id = s.project_id
    join public.projects me on me.id = p_project
   where s.rental_company_id = public.current_rental_company_id()
     and s.project_id <> p_project
     and s.status <> 'declined'
     and s.catalog_item_id = p_item
     and me.event_date is not null
     and p.event_date = me.event_date;
$$;

create or replace function public.request_item_from_vendor(p_project uuid, p_item uuid, p_company uuid, p_qty integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  stock integer;
  booked integer;
begin
  if not public.planner_can_access_project(p_project) then
    raise exception 'Not allowed on this project' using errcode = '42501';
  end if;

  if coalesce(p_qty, 0) <= 0 then
    delete from public.project_item_sources
     where project_id = p_project and catalog_item_id = p_item and rental_company_id = p_company;
    return;
  end if;

  if not exists (select 1 from public.rental_companies rc where rc.id = p_company and rc.is_vendor and rc.has_vendor_stock) then
    raise exception 'That company is not a vendor with stock' using errcode = '42501';
  end if;

  select coalesce(max(quantity), 0) into stock from public.catalog_item_stock
   where catalog_item_id = p_item and owner_type = 'rental_company' and owner_id = p_company;
  select coalesce(sum(s.quantity), 0) into booked
    from public.project_item_sources s
    join public.projects p  on p.id = s.project_id
    join public.projects me on me.id = p_project
   where s.rental_company_id = p_company and s.catalog_item_id = p_item
     and s.project_id <> p_project and s.status <> 'declined'
     and me.event_date is not null and p.event_date = me.event_date;
  if p_qty > stock - booked then
    raise exception 'Only % are free' , greatest(0, stock - booked) using errcode = '23514';
  end if;

  -- Asking a vendor tags it on the project, so it can see what is asked and the plans.
  insert into public.project_vendors (project_id, rental_company_id, added_by)
    select p_project, p_company, (select pl.id from public.planners pl where pl.user_id = auth.uid() limit 1)
  on conflict do nothing;

  insert into public.project_item_sources (project_id, catalog_item_id, rental_company_id, quantity, requested_quantity, status, decided_at, updated_at)
    values (p_project, p_item, p_company, p_qty, p_qty, 'pending', null, now())
  on conflict (project_id, catalog_item_id, rental_company_id) do update
    set quantity = excluded.quantity, requested_quantity = excluded.requested_quantity,
        status = 'pending', decided_at = null, updated_at = now();
end;
$$;

create or replace function public.respond_to_item_request(p_project uuid, p_item uuid, p_accepted integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  co uuid := public.current_rental_company_id();
  req integer;
begin
  select requested_quantity into req from public.project_item_sources
   where project_id = p_project and catalog_item_id = p_item and rental_company_id = co;
  if co is null or req is null then
    raise exception 'No such request' using errcode = '42501';
  end if;
  if p_accepted is null or p_accepted < 0 or p_accepted > req then
    raise exception 'Accepted quantity must be between 0 and %', req using errcode = '22023';
  end if;
  update public.project_item_sources
     set quantity = p_accepted,
         status = case when p_accepted = 0 then 'declined' else 'accepted' end,
         decided_at = now(), updated_at = now()
   where project_id = p_project and catalog_item_id = p_item and rental_company_id = co;
end;
$$;

revoke execute on function public.my_committed_that_day(uuid, uuid) from public, anon;
revoke execute on function public.request_item_from_vendor(uuid, uuid, uuid, integer) from public, anon;
revoke execute on function public.respond_to_item_request(uuid, uuid, integer) from public, anon;
grant execute on function public.my_committed_that_day(uuid, uuid) to authenticated;
grant execute on function public.request_item_from_vendor(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.respond_to_item_request(uuid, uuid, integer) to authenticated;
