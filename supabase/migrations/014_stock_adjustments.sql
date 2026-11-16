-- Stock adjustments: manual +/- corrections to a stock item's current_stock
-- (stock-take fixes, breakage, a gift) that are not a purchase or a sale.
--
-- HISTORY ONLY. This was applied to the live project on 2026-09-19 (migration
-- version 20260919071424, "stock_adjustments") directly through the Supabase
-- MCP, and no file was ever committed. It was reconstructed on 2026-11-16 from
-- the live database (columns, constraints, indexes, trigger, function, policies)
-- so a fresh database built from supabase/migrations/ matches production.
-- Do NOT re-run it against the live project: the table already exists.
--
-- Mirrors the other stock ledgers (013): a trigger keeps stock_items.current_stock
-- in step with every insert / update / delete, and On Demand items refuse
-- adjustments because they do not track stock.

create table public.stock_adjustments (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.stock_items(id) on delete cascade,
  delta      integer not null check (delta <> 0),
  reason     text,
  created_at timestamptz not null default now()
);

create index stock_adjustments_item_idx on public.stock_adjustments (item_id, created_at desc);

create or replace function public.stock_apply_adjustment_delta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from stock_items where id = new.item_id and on_demand) then
      raise exception 'On Demand items don''t track stock' using errcode = '22023';
    end if;
    update stock_items set current_stock = current_stock + new.delta where id = new.item_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.item_id <> old.item_id then
      update stock_items set current_stock = current_stock - old.delta where id = old.item_id;
      update stock_items set current_stock = current_stock + new.delta where id = new.item_id;
    elsif new.delta <> old.delta then
      update stock_items set current_stock = current_stock + (new.delta - old.delta) where id = new.item_id;
    end if;
    return new;
  else
    update stock_items set current_stock = current_stock - old.delta where id = old.item_id;
    return old;
  end if;
end;
$function$;

create trigger trg_stock_adjustment_delta
  after insert or update or delete on public.stock_adjustments
  for each row execute function public.stock_apply_adjustment_delta();

alter table public.stock_adjustments enable row level security;

-- As in the live database: the policies are granted to PUBLIC (not just
-- authenticated), exactly like the 013 stock tables. They only ever match a
-- signed-in team member because current_team_id() / is_admin() are null/false
-- for anyone else.
create policy admin_manage_stock_adjustments on public.stock_adjustments
  for all
  using (is_admin());

create policy team_manage_stock_adjustments on public.stock_adjustments
  for all
  using (exists (
    select 1 from public.stock_items i
    where i.id = stock_adjustments.item_id and i.team_id = current_team_id()
  ))
  with check (exists (
    select 1 from public.stock_items i
    where i.id = stock_adjustments.item_id and i.team_id = current_team_id()
  ));
