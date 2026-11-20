-- 021: more document types + document versions (project_documents).
-- History only: applied live first as "document_types_and_versions". Do not re-run.
--
-- 1. More document types. 'receipt' stays payment-attached only (the UI never
--    offers it for project-level documents).
-- 2. Versions. A document is a *group* of rows sharing version_group_id, each with
--    its own file and a version number; the highest number is the current one.
--    (Chosen over a "replaces previous row" pointer: deleting a middle version
--    would otherwise make older ones look current again.)
--    Every existing row becomes its own group at version 1.
-- 3. Activity: a new version (version > 1) is logged as 'new_version'. Edits to
--    name/type/vendor are deliberately not logged (decided 20 Nov 2026).

alter table public.project_documents drop constraint project_documents_kind_check;
alter table public.project_documents add constraint project_documents_kind_check
  check (kind in ('contract_draft', 'signed_contract', 'quote', 'invoice', 'insurance_permit', 'receipt', 'other'));

alter table public.project_documents
  add column version_group_id uuid not null default gen_random_uuid(),
  add column version          integer not null default 1 check (version >= 1);

create unique index project_documents_group_version_uq
  on public.project_documents (version_group_id, version);

create index project_documents_project_group_idx
  on public.project_documents (project_id, version_group_id);

-- A version group must live in one project. SECURITY DEFINER because RLS would
-- hide another project's rows from the caller and defeat the check.
create or replace function public.project_documents_check_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.project_documents d
    where d.version_group_id = new.version_group_id
      and d.project_id <> new.project_id
  ) then
    raise exception 'A document version group cannot span projects' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_project_documents_check_group
  before insert on public.project_documents
  for each row execute function public.project_documents_check_group();

revoke execute on function public.project_documents_check_group() from public, anon, authenticated;

-- Same function as 015, now distinguishing a new version from a first upload.
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
     'document',
     case
       when tg_op = 'DELETE' then 'removed'
       when rec.version > 1 then 'new_version'
       else 'added'
     end,
     rec.id,
     jsonb_build_object('label', rec.label, 'kind', rec.kind, 'version', rec.version));

  return null;
end;
$$;
