-- Phase 23 (core) — Stock Tracking / Planner Inventory.
--
-- Separate from layout_objects (the floor-plan catalog): this is the
-- planner's own retail inventory — welcome bags, favours, personalized
-- items — sold to clients as add-ons, never placed in a floor plan.
-- Client/Venue/Rental Company have no visibility into any of this.
--
-- Per the dedicated Stock Tracking spec page (updated scope note there):
-- every table is team_id-scoped, not planner_id — the whole team shares one
-- catalogue/history. No private/public split at all (unlike projects):
-- every row is visible to every team member. Order Tracking Integration
-- (17TRACK) is explicitly v2 in that spec, deferred until after this core
-- CRUD ships — not included here.
--
-- current_stock is a denormalized counter (spec's own wording), maintained
-- by triggers on purchases/sales rather than recomputed live — same pattern
-- already used for project_activity's derived state. Implementation calls
-- made here that the spec leaves open, flagged for review: (1) no role
-- gating on top of team membership — any member can read/write every stock
-- table, matching the spec's "fully visible... manager or not" framing
-- extended to writes; (2) an oversell is allowed to take current_stock
-- negative rather than being blocked, so a planner can record a sale first
-- and reconcile the count after.
--
-- Applied directly to the live project on 18 Sep 2026 via MCP; this file
-- keeps the migration history in sync (same convention as 006–012).

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.stock_groups (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.stock_items (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  group_id        uuid references public.stock_groups(id) on delete set null,
  name            text not null,
  icon_type       text not null default 'emoji' check (icon_type in ('emoji', 'photo')),
  icon_value      text,                        -- emoji character, or a stock-photos Storage URL
  cost_price      numeric(10, 2) not null default 0,
  sell_price      numeric(10, 2) not null default 0,
  min_stock_alert integer not null default 0,
  on_demand       boolean not null default false,
  notes           text,
  current_stock   integer not null default 0,  -- denormalized; see trigger notes above. Forced to 0 for on_demand items.
  created_at      timestamptz not null default now()
);

create index stock_items_team_idx  on public.stock_items (team_id);
create index stock_items_group_idx on public.stock_items (group_id);

create table public.stock_price_history (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.stock_items(id) on delete cascade,
  cost_price numeric(10, 2) not null,
  sell_price numeric(10, 2) not null,
  changed_at timestamptz not null default now()
);

create index stock_price_history_item_idx on public.stock_price_history (item_id, changed_at desc);

create table public.stock_purchases (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.stock_items(id) on delete cascade,
  qty          integer not null check (qty > 0),
  unit_cost    numeric(10, 2) not null,
  supplier     text,
  project_id   uuid references public.projects(id) on delete set null,
  purchased_at timestamptz not null default now()
);

create index stock_purchases_item_idx on public.stock_purchases (item_id, purchased_at desc);

create table public.stock_sales (
  id                  uuid primary key default gen_random_uuid(),
  item_id             uuid not null references public.stock_items(id) on delete cascade,
  qty                 integer not null check (qty > 0),
  unit_price          numeric(10, 2) not null,
  unit_cost_snapshot  numeric(10, 2) not null, -- captured at sale time so historical margin doesn't drift if cost_price later changes
  project_id          uuid references public.projects(id) on delete set null,
  sold_at             timestamptz not null default now()
);

create index stock_sales_item_idx on public.stock_sales (item_id, sold_at desc);

create table public.stock_orders (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade, -- kept directly (not just via item_id) since item_id may be null for a one-off order
  item_id    uuid references public.stock_items(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  qty        integer not null check (qty > 0),
  status     text not null default 'pending' check (status in ('pending', 'received')),
  ordered_at timestamptz not null default now()
);

create index stock_orders_team_idx on public.stock_orders (team_id, ordered_at desc);

-- ── Triggers: current_stock maintenance ──────────────────────────────────────

create or replace function public.stock_apply_purchase_delta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from stock_items where id = new.item_id and on_demand) then
      raise exception 'On Demand items don''t track stock — use Orders instead' using errcode = '22023';
    end if;
    update stock_items set current_stock = current_stock + new.qty where id = new.item_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.item_id <> old.item_id then
      update stock_items set current_stock = current_stock - old.qty where id = old.item_id;
      update stock_items set current_stock = current_stock + new.qty where id = new.item_id;
    elsif new.qty <> old.qty then
      update stock_items set current_stock = current_stock + (new.qty - old.qty) where id = new.item_id;
    end if;
    return new;
  else
    update stock_items set current_stock = current_stock - old.qty where id = old.item_id;
    return old;
  end if;
end;
$$;

create trigger trg_stock_purchase_delta
  after insert or update or delete on public.stock_purchases
  for each row execute function public.stock_apply_purchase_delta();

create or replace function public.stock_apply_sale_delta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from stock_items where id = new.item_id and on_demand) then
      raise exception 'On Demand items don''t track stock — use Orders instead' using errcode = '22023';
    end if;
    update stock_items set current_stock = current_stock - new.qty where id = new.item_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.item_id <> old.item_id then
      update stock_items set current_stock = current_stock + old.qty where id = old.item_id;
      update stock_items set current_stock = current_stock - new.qty where id = new.item_id;
    elsif new.qty <> old.qty then
      update stock_items set current_stock = current_stock - (new.qty - old.qty) where id = new.item_id;
    end if;
    return new;
  else
    update stock_items set current_stock = current_stock + old.qty where id = old.item_id;
    return old;
  end if;
end;
$$;

create trigger trg_stock_sale_delta
  after insert or update or delete on public.stock_sales
  for each row execute function public.stock_apply_sale_delta();

-- on_demand items stay fixed at 0 even if the flag is turned on after stock
-- was already recorded against the item.
create or replace function public.stock_items_enforce_on_demand()
returns trigger
language plpgsql
as $$
begin
  if new.on_demand then
    new.current_stock := 0;
  end if;
  return new;
end;
$$;

create trigger trg_stock_items_enforce_on_demand
  before insert or update on public.stock_items
  for each row execute function public.stock_items_enforce_on_demand();

-- ── Trigger: price history ───────────────────────────────────────────────────

create or replace function public.stock_log_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.cost_price is distinct from old.cost_price or new.sell_price is distinct from old.sell_price then
    insert into stock_price_history (item_id, cost_price, sell_price) values (new.id, new.cost_price, new.sell_price);
  end if;
  return new;
end;
$$;

create trigger trg_stock_log_price_change
  after insert or update on public.stock_items
  for each row execute function public.stock_log_price_change();

-- ── RLS: full team visibility, member read/write (no manager gate) ──────────

alter table public.stock_groups        enable row level security;
alter table public.stock_items         enable row level security;
alter table public.stock_price_history enable row level security;
alter table public.stock_purchases     enable row level security;
alter table public.stock_sales         enable row level security;
alter table public.stock_orders        enable row level security;

create policy team_manage_stock_groups on public.stock_groups
  for all using (team_id = current_team_id()) with check (team_id = current_team_id());
create policy admin_manage_stock_groups on public.stock_groups
  for all using (is_admin());

create policy team_manage_stock_items on public.stock_items
  for all using (team_id = current_team_id()) with check (team_id = current_team_id());
create policy admin_manage_stock_items on public.stock_items
  for all using (is_admin());

create policy team_read_stock_price_history on public.stock_price_history
  for select using (exists (select 1 from stock_items i where i.id = item_id and i.team_id = current_team_id()));
create policy admin_manage_stock_price_history on public.stock_price_history
  for all using (is_admin());

create policy team_manage_stock_purchases on public.stock_purchases
  for all
  using (exists (select 1 from stock_items i where i.id = item_id and i.team_id = current_team_id()))
  with check (exists (select 1 from stock_items i where i.id = item_id and i.team_id = current_team_id()));
create policy admin_manage_stock_purchases on public.stock_purchases
  for all using (is_admin());

create policy team_manage_stock_sales on public.stock_sales
  for all
  using (exists (select 1 from stock_items i where i.id = item_id and i.team_id = current_team_id()))
  with check (exists (select 1 from stock_items i where i.id = item_id and i.team_id = current_team_id()));
create policy admin_manage_stock_sales on public.stock_sales
  for all using (is_admin());

create policy team_manage_stock_orders on public.stock_orders
  for all using (team_id = current_team_id()) with check (team_id = current_team_id());
create policy admin_manage_stock_orders on public.stock_orders
  for all using (is_admin());

-- ── Storage: stock-photos bucket, self-serve upload scoped by team_id ───────

insert into storage.buckets (id, name, public) values ('stock-photos', 'stock-photos', true);

create policy public_read_stock_photos on storage.objects
  for select using (bucket_id = 'stock-photos');

create policy team_manage_own_stock_photos on storage.objects
  for all
  using (bucket_id = 'stock-photos' and (storage.foldername(name))[1] = (current_team_id())::text)
  with check (bucket_id = 'stock-photos' and (storage.foldername(name))[1] = (current_team_id())::text);

create policy admin_manage_stock_photos on storage.objects
  for all using (bucket_id = 'stock-photos' and is_admin());
