-- 039: per-product sales totals for the My Stock tiles, computed in the database.
--
-- The page only loads the latest 200 sales, so "profit to date" and "out with clients" worked out in the
-- browser would be wrong for a busy account. One row per product of the caller's team:
--   units_sold  everything ever sold
--   units_out   units of a reusable product sold and not yet confirmed back
--   profit      revenue minus cost, all time. For a reusable sale only the units that did not come back cost
--               anything, and until the return is confirmed the cost counts as 0 (same rule as the Sales tab).
-- Profit is 0 for anyone who is not a manager or lead, like the other Member-safe functions (migration 036).
create or replace function public.stock_item_totals()
returns table (item_id uuid, units_sold integer, units_out integer, profit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         coalesce(sum(s.qty), 0)::integer,
         coalesce(sum(case
           when s.return_confirmed_at is null and i.reusable and (i.reusable_since is null or s.sold_at >= i.reusable_since)
             then s.qty else 0 end), 0)::integer,
         case when public.current_planner_role() in ('manager', 'lead') then
           coalesce(sum(case
             when s.return_confirmed_at is not null
               then s.unit_price * s.qty - s.unit_cost_snapshot * (s.qty - s.returned_qty)
             when i.reusable and (i.reusable_since is null or s.sold_at >= i.reusable_since)
               then s.unit_price * s.qty
             else s.unit_price * s.qty - s.unit_cost_snapshot * s.qty
           end), 0)
         else 0 end
    from public.stock_items i
    left join public.stock_sales s on s.item_id = i.id
   where i.team_id = public.current_team_id()
   group by i.id;
$$;

revoke execute on function public.stock_item_totals() from public, anon;
grant  execute on function public.stock_item_totals() to authenticated;
