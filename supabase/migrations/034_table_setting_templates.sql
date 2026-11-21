-- Team-wide table-setting templates.
--
-- ALREADY APPLIED to the live project on 21 Nov 2026 — kept here for history only,
-- do not re-run. Any team member can create, edit and delete templates (decided
-- 21 Nov 2026). A template only names items and quantities; per-seat vs per-table
-- comes from catalog_items.scope. Applying a template copies its items onto the
-- table (layout_objects.extra_data.tableSetting), so later edits to a template or
-- to one table never change other tables.

create table public.table_setting_templates (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (team_id, name)
);

create table public.table_setting_template_items (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.table_setting_templates(id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items(id),
  quantity        int  not null check (quantity between 1 and 50)
);
create index tsti_template_idx on public.table_setting_template_items (template_id);

alter table public.table_setting_templates      enable row level security;
alter table public.table_setting_template_items enable row level security;

create policy team_all on public.table_setting_templates
  for all using (team_id = current_team_id()) with check (team_id = current_team_id());

create policy team_all on public.table_setting_template_items
  for all
  using (exists (select 1 from table_setting_templates t
                 where t.id = template_id and t.team_id = current_team_id()))
  with check (exists (select 1 from table_setting_templates t
                      where t.id = template_id and t.team_id = current_team_id()));
