-- 036 — My Stock: Members cannot see prices or profit; cost is a weighted average.
--
-- Requested 26 Nov 2026 (Phase 29.3 + 29.4).
--
-- 1. Members used to read every stock row (migration 017), and cost/sell price sit in
--    those rows, so hiding them in the screen alone would still leave them readable
--    through the API. Row-level security cannot hide one column, so:
--      * Members get NO select policy on stock_items, stock_purchases, stock_sales or
--        stock_price_history (managers/leads keep theirs through the existing
--        "for all" staff policies).
--      * Members read items and sales through two functions that return the same rows
--        with cost_price / sell_price / unit_price / unit_cost_snapshot set to 0.
--      * A Member's sale gets its prices from the catalogue on the server, whatever
--        the browser sends (so a Member never needs to know them).
-- 2. Cost price becomes a weighted average, updated by every purchase. Needs more than
--    2 decimals (10 @ 1.10 + 30 @ 0.80 = 0.875), so the cost columns become numeric(12,4).
--
-- Not changed on purpose: deleting a past purchase does NOT recompute the average, and
-- existing items keep their current cost until their next purchase (no backfill here).

-- ── 1. Precision for cost columns ───────────────────────────────────────────────────
alter table public.stock_items         alter column cost_price         type numeric(12, 4);
alter table public.stock_price_history alter column cost_price         type numeric(12, 4);
alter table public.stock_purchases     alter column unit_cost          type numeric(12, 4);
alter table public.stock_sales         alter column unit_cost_snapshot type numeric(12, 4);

-- ── 2. Weighted-average cost on purchase ────────────────────────────────────────────
-- BEFORE INSERT so current_stock is still the pre-purchase figure (the AFTER trigger
-- that adds the quantity runs later). Units out with clients on a reusable item are
-- still owned, so they count towards the weight. Zero or negative stock: the new
-- purchase's cost becomes the cost. The UPDATE below also writes a price-history row
-- through the existing trg_stock_log_price_change.
create or replace function public.stock_purchase_average_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  it      public.stock_items;
  out_now integer := 0;
  owned   integer;
begin
  select * into it from public.stock_items where id = new.item_id;
  if not found or it.on_demand then
    return new; -- the delta trigger rejects on-demand items; a missing item fails the FK
  end if;

  if it.reusable then
    select coalesce(sum(s.qty), 0) into out_now
      from public.stock_sales s
     where s.item_id = it.id
       and s.return_confirmed_at is null
       and (it.reusable_since is null or s.sold_at >= it.reusable_since);
  end if;

  owned := greatest(it.current_stock + out_now, 0);

  update public.stock_items
     set cost_price = case
           when owned = 0 then new.unit_cost
           else round((owned * it.cost_price + new.qty * new.unit_cost) / (owned + new.qty), 4)
         end
   where id = it.id;

  return new;
end;
$$;

create trigger trg_stock_purchase_average_cost
  before insert on public.stock_purchases
  for each row execute function public.stock_purchase_average_cost();

revoke execute on function public.stock_purchase_average_cost() from public, anon, authenticated;

-- ── 3. Sale prices come from the server ─────────────────────────────────────────────
-- The cost snapshot is always the item's current (average) cost. A Member's unit price is
-- always the item's sell price; managers and leads keep whatever price they typed.
create or replace function public.stock_sales_fill_prices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.stock_items;
begin
  select * into it from public.stock_items where id = new.item_id;
  if not found then
    return new; -- the foreign key reports it
  end if;
  new.unit_cost_snapshot := it.cost_price;
  if public.current_planner_role() = 'member' then
    new.unit_price := it.sell_price;
  end if;
  return new;
end;
$$;

create trigger trg_stock_sales_fill_prices
  before insert on public.stock_sales
  for each row execute function public.stock_sales_fill_prices();

revoke execute on function public.stock_sales_fill_prices() from public, anon, authenticated;

-- ── 4. Members lose direct read access to price-bearing tables ──────────────────────
drop policy if exists team_read_stock_items on public.stock_items;
drop policy if exists team_read_stock_purchases on public.stock_purchases;
drop policy if exists team_read_stock_sales on public.stock_sales;
drop policy if exists team_read_stock_price_history on public.stock_price_history;

-- The staff "for all" policies already let managers and leads read stock_items,
-- stock_purchases and stock_sales; price history had a team-wide read policy only.
create policy staff_read_stock_price_history on public.stock_price_history
  for select using (
    public.current_planner_role() in ('manager', 'lead')
    and exists (
      select 1 from public.stock_items i
      where i.id = stock_price_history.item_id and i.team_id = public.current_team_id()));

-- The Member sale policy looked the item up in stock_items, which a Member can no longer
-- read. Use a definer helper instead.
create or replace function public.stock_item_in_my_team(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stock_items where id = p_item and team_id = public.current_team_id());
$$;

revoke execute on function public.stock_item_in_my_team(uuid) from public, anon;
grant  execute on function public.stock_item_in_my_team(uuid) to authenticated;

drop policy if exists member_record_stock_sales on public.stock_sales;
create policy member_record_stock_sales on public.stock_sales
  for insert
  with check (
    public.current_planner_role() = 'member'
    and project_id is not null
    and public.planner_can_access_project(project_id)
    and public.stock_item_in_my_team(item_id)
  );

-- ── 5. The Member-safe read path ────────────────────────────────────────────────────
-- Same rows and columns as the tables; prices are zeroed for anyone who is not a manager
-- or lead. jsonb_populate_record keeps this correct if columns are added later.
create or replace function public.stock_items_for_me()
returns setof public.stock_items
language sql
stable
security definer
set search_path = public
as $$
  select (x).*
  from (
    select case
             when public.current_planner_role() in ('manager', 'lead') then i
             else jsonb_populate_record(i, '{"cost_price": 0, "sell_price": 0}'::jsonb)
           end as x,
           i.name as sort_name
    from public.stock_items i
    where i.team_id = public.current_team_id()
  ) s
  order by sort_name;
$$;

create or replace function public.stock_sales_for_me()
returns setof public.stock_sales
language sql
stable
security definer
set search_path = public
as $$
  select (x).*
  from (
    select case
             when public.current_planner_role() in ('manager', 'lead') then s
             else jsonb_populate_record(s, '{"unit_price": 0, "unit_cost_snapshot": 0}'::jsonb)
           end as x,
           s.sold_at as sort_at
    from public.stock_sales s
    join public.stock_items i on i.id = s.item_id
    where i.team_id = public.current_team_id()
  ) q
  order by sort_at desc;
$$;

revoke execute on function public.stock_items_for_me() from public, anon;
revoke execute on function public.stock_sales_for_me() from public, anon;
grant  execute on function public.stock_items_for_me() to authenticated;
grant  execute on function public.stock_sales_for_me() to authenticated;
