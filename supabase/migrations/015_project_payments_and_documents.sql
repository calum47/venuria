-- Payment tracker + project documents.
--
-- project_payments: one row per payment a planner owes or has made on a
-- project (deposit, balance, ...). `paid_at` is null until paid; "overdue" is
-- derived in the UI (due_date passed and paid_at null), never stored, so it
-- cannot drift. Currency is not stored per row — it lives on teams.currency.
-- Vendor is free text for now: the shared vendor/tag system from the
-- Timetable spec does not exist in the database yet.
--
-- project_documents: PDFs attached to a project — contract drafts, receipts /
-- proof of payment, anything else. A receipt is simply a document whose
-- payment_id points at a payment. Files live in the PRIVATE bucket
-- `project-documents` (the other buckets are public; contracts must not be).
--
-- Access: planners via planner_can_access_project() (admin, or same team and
-- public | creator | assignee | manager/lead) — the same rule as every other
-- project-scoped table. No client policy: clients are deferred.
--
-- Also extends project_activity (migration 008) so payment and document
-- changes show up in the "what changed" modal, written by triggers like the
-- existing entities.
--
-- Applied directly to the live project on 2026-11-16 via MCP; this file keeps
-- the migration history in sync. Numbered 015 because the live project also
-- has a `stock_adjustments` migration (20260919071424) with no file in the
-- repo yet — 014 is left free for it.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.project_payments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  vendor_name text not null check (length(btrim(vendor_name)) > 0),
  label       text not null check (length(btrim(label)) > 0),   -- Deposit, Balance, ...
  amount      numeric(12,2) not null check (amount >= 0),
  due_date    date not null,
  paid_at     date,                                             -- null = unpaid
  notes       text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Lets project_documents prove a linked payment belongs to the same project.
  unique (id, project_id)
);

create index project_payments_project_due_idx
  on public.project_payments (project_id, due_date);

create table public.project_documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  payment_id   uuid,
  vendor_name  text,
  kind         text not null check (kind in ('contract_draft', 'receipt', 'other')),
  label        text not null check (length(btrim(label)) > 0),
  storage_path text not null unique,
  size_bytes   bigint not null check (size_bytes > 0),
  uploaded_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Path convention: {team_id}/{project_id}/{uuid}.pdf — the project segment
  -- must match the row, so a row can never point at another project's file.
  check (split_part(storage_path, '/', 2) = project_id::text),
  -- A linked payment must be on the same project. Deleting the payment keeps
  -- the document (payment_id goes null) so no file is ever orphaned silently.
  foreign key (payment_id, project_id)
    references public.project_payments (id, project_id)
    on delete set null (payment_id)
);

create index project_documents_project_created_idx
  on public.project_documents (project_id, created_at desc);

create index project_documents_payment_idx
  on public.project_documents (payment_id) where payment_id is not null;

create or replace function public.project_payments_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_project_payments_updated_at
  before update on public.project_payments
  for each row execute function public.project_payments_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- planner_can_access_project() already includes is_admin(), so one policy per
-- table covers planners and admins. It reads `projects`, not the row being
-- written, so it is safe for INSERT ... RETURNING (see the 22c learning).

alter table public.project_payments  enable row level security;
alter table public.project_documents enable row level security;

create policy planner_manage_accessible_project_payments on public.project_payments
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));

create policy planner_manage_accessible_project_documents on public.project_documents
  for all to authenticated
  using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));

-- ── Private storage bucket ──────────────────────────────────────────────────
-- PDF only, 10 MB — enforced by the bucket itself, not just the UI.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-documents', 'project-documents', false, 10485760, array['application/pdf']);

-- Object path is {team_id}/{project_id}/{uuid}.pdf. Access follows the project
-- segment. The CASE guards the uuid cast so a malformed path is denied rather
-- than raising an error (plain AND does not guarantee evaluation order).
create policy planner_manage_accessible_project_documents_objects on storage.objects
  for all to authenticated
  using (
    bucket_id = 'project-documents'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'project-documents'
    and case
      when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.planner_can_access_project(((storage.foldername(name))[2])::uuid)
      else false
    end
  );

-- ── Activity log ────────────────────────────────────────────────────────────

alter table public.project_activity drop constraint project_activity_entity_check;
alter table public.project_activity add constraint project_activity_entity_check
  check (entity in ('layout_object', 'guest', 'seat_assignment', 'payment', 'document'));

create or replace function public.log_payment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.project_payments;
  act text;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  -- Cascaded delete from a project being deleted: the project row is already
  -- gone, so an activity row would violate its FK.
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = rec.project_id) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    act := 'added';
  elsif tg_op = 'DELETE' then
    act := 'removed';
  else
    if old.paid_at is null and new.paid_at is not null then
      act := 'marked_paid';
    elsif old.paid_at is not null and new.paid_at is null then
      act := 'marked_unpaid';
    elsif old.label       is distinct from new.label
       or old.vendor_name is distinct from new.vendor_name
       or old.amount      is distinct from new.amount
       or old.due_date    is distinct from new.due_date
       or old.paid_at     is distinct from new.paid_at then
      act := 'updated';
    else
      return null;
    end if;
  end if;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, null, auth.uid(), public.activity_actor_name(auth.uid()),
     'payment', act, rec.id,
     jsonb_build_object('label', rec.label, 'vendor', rec.vendor_name));

  return null;
end;
$$;

create or replace function public.log_document_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.project_documents;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = rec.project_id) then
    return null;
  end if;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, null, auth.uid(), public.activity_actor_name(auth.uid()),
     'document', case when tg_op = 'INSERT' then 'added' else 'removed' end, rec.id,
     jsonb_build_object('label', rec.label, 'kind', rec.kind));

  return null;
end;
$$;

-- Documents: only INSERT/DELETE are logged. The UPDATE that nulls payment_id
-- when a payment is deleted is deliberately not a document event.
create trigger trg_log_payment_activity
  after insert or update or delete on public.project_payments
  for each row execute function public.log_payment_activity();

create trigger trg_log_document_activity
  after insert or delete on public.project_documents
  for each row execute function public.log_document_activity();

-- Trigger functions are never called directly; revoke the default PUBLIC
-- execute so they are not exposed as /rest/v1/rpc endpoints. (Triggers keep
-- firing: EXECUTE is checked when the trigger is created, not when it fires.)
revoke execute on function public.log_payment_activity()  from public, anon, authenticated;
revoke execute on function public.log_document_activity() from public, anon, authenticated;
