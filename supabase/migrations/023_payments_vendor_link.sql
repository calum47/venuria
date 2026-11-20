-- Payments adopt the shared team vendor list (Notion, Invoices & Payments:
-- "the shared vendor Tag"; Phase 8 "Link payments to the shared vendor Tag system").
--
-- project_payments.vendor_name stays (free text is still allowed, and it is what
-- the PDF reader and old rows have). New: project_payments.vendor_id, a link to
-- team_vendors. Decided 20 Nov 2026: auto-link existing payments by exact name;
-- names with no match stay as text and the UI shows a "not in vendor list" hint.
-- Nothing is created or deleted automatically.
--
-- "Exact" here means the same name ignoring letter case and surrounding spaces,
-- which is exactly how team_vendors already treats two names as the same vendor
-- (unique index team_vendors_team_name_key), so a match is never ambiguous.
--
-- All linking happens in the database so every path (typing a name, "Add from
-- PDF", editing) behaves the same:
--   * BEFORE INSERT/UPDATE on project_payments: a vendor_id from another team is
--     dropped; a changed or missing vendor link is (re)resolved from vendor_name.
--   * AFTER INSERT / rename on team_vendors: unlinked payments of that team whose
--     text matches the (new) name get linked. Renaming a linked vendor does not
--     touch vendor_name (that would flood the activity log); the UI shows the
--     vendor's current name through the link.
-- Setting vendor_id alone is not logged: log_payment_activity only reacts to
-- label / vendor_name / amount / due_date / paid_at changes.

alter table public.project_payments
  add column vendor_id uuid references public.team_vendors(id) on delete set null;

create index project_payments_vendor_idx on public.project_payments (vendor_id);

create or replace function public.project_payments_link_vendor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from projects where id = new.project_id;

  if new.vendor_id is not null
     and (tg_op = 'INSERT' or new.vendor_id is distinct from old.vendor_id)
     and not exists (select 1 from team_vendors where id = new.vendor_id and team_id = v_team) then
    new.vendor_id := null;
  end if;

  if tg_op = 'UPDATE'
     and new.vendor_name is distinct from old.vendor_name
     and new.vendor_id is not distinct from old.vendor_id then
    new.vendor_id := null;
  end if;

  if new.vendor_id is null and v_team is not null then
    select id into new.vendor_id
      from team_vendors
     where team_id = v_team and lower(btrim(name)) = lower(btrim(new.vendor_name));
  end if;
  return new;
end;
$$;

create trigger trg_project_payments_link_vendor
  before insert or update on public.project_payments
  for each row execute function public.project_payments_link_vendor();

create or replace function public.team_vendors_link_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update project_payments pp
     set vendor_id = new.id
    from projects pr
   where pr.id = pp.project_id
     and pr.team_id = new.team_id
     and pp.vendor_id is null
     and lower(btrim(pp.vendor_name)) = lower(btrim(new.name));
  return null;
end;
$$;

create trigger trg_team_vendors_link_payments
  after insert or update of name on public.team_vendors
  for each row execute function public.team_vendors_link_payments();

revoke execute on function public.project_payments_link_vendor() from public, anon, authenticated;
revoke execute on function public.team_vendors_link_payments() from public, anon, authenticated;

-- Backfill: link what already exists.
update public.project_payments pp
   set vendor_id = v.id
  from public.projects pr, public.team_vendors v
 where pr.id = pp.project_id
   and v.team_id = pr.team_id
   and pp.vendor_id is null
   and lower(btrim(pp.vendor_name)) = lower(btrim(v.name));
