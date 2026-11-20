-- Reusable stock items (Notion, Stock Tracking: "Reusable items — new requirement 28 Sep 2026").
--
-- Some items are sold to the client every wedding but come back into stock
-- afterwards. Decided 20 Nov 2026 (option b): a Reusable flag on the item; a
-- sale still takes the items out; after the wedding the planner confirms how
-- many came back, so breakage/loss is recorded and "what is out right now" is
-- visible.
--
--   stock_items.reusable          the flag (cannot be combined with On Demand)
--   stock_items.reusable_since    set when the flag is switched on; sales made
--                                 before that moment are not treated as "out"
--   stock_sales.returned_qty      how many came back (0 until confirmed)
--   stock_sales.return_confirmed_at  when the planner confirmed the return
--
-- Stock maths: a sale takes qty out; confirming a return puts returned_qty back.
-- Profit (UI): revenue minus the cost of the items that did NOT come back.
-- Confirming a return is a manager / lead action (it is an UPDATE on a sale,
-- and members have INSERT only, see 017). Not in the spec: change here if
-- members should confirm returns too.

alter table public.stock_items
  add column reusable       boolean     not null default false,
  add column reusable_since timestamptz,
  add constraint stock_items_reusable_not_on_demand check (not (reusable and on_demand));

alter table public.stock_sales
  add column returned_qty        integer     not null default 0,
  add column return_confirmed_at timestamptz,
  add constraint stock_sales_returned_range check (returned_qty >= 0 and returned_qty <= qty),
  add constraint stock_sales_returned_needs_confirmation check (returned_qty = 0 or return_confirmed_at is not null);

-- reusable_since follows the flag.
create or replace function public.stock_items_enforce_on_demand()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.on_demand then
    new.current_stock := 0;
  end if;
  if new.reusable and (tg_op = 'INSERT' or not old.reusable) then
    new.reusable_since := now();
  elsif not new.reusable then
    new.reusable_since := null;
  end if;
  return new;
end;
$$;

-- Returns only make sense for reusable items, and only after the sale exists.
create or replace function public.stock_sales_validate_return()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.returned_qty <> 0 or new.return_confirmed_at is not null then
      raise exception 'A return can only be confirmed after the sale is recorded' using errcode = '22023';
    end if;
  elsif new.returned_qty is distinct from old.returned_qty
     or new.return_confirmed_at is distinct from old.return_confirmed_at then
    if not exists (select 1 from stock_items where id = new.item_id and reusable) then
      raise exception 'Only reusable items can have returns' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_stock_sales_validate_return
  before insert or update on public.stock_sales
  for each row execute function public.stock_sales_validate_return();

-- Stock counter: a sale takes qty out, a confirmed return puts returned_qty back.
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
    update stock_items set current_stock = current_stock - new.qty + new.returned_qty where id = new.item_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.item_id <> old.item_id then
      update stock_items set current_stock = current_stock + old.qty - old.returned_qty where id = old.item_id;
      update stock_items set current_stock = current_stock - new.qty + new.returned_qty where id = new.item_id;
    elsif new.qty <> old.qty or new.returned_qty <> old.returned_qty then
      update stock_items
         set current_stock = current_stock - (new.qty - old.qty) + (new.returned_qty - old.returned_qty)
       where id = new.item_id;
    end if;
    return new;
  else
    update stock_items set current_stock = current_stock + old.qty - old.returned_qty where id = old.item_id;
    return old;
  end if;
end;
$$;

revoke execute on function public.stock_sales_validate_return() from public, anon, authenticated;
