-- My Stock permissions by team role.
--
-- Spec (Notion, Stock Tracking): Managers and Leads can do everything in My
-- Stock. Members can add orders and record items used on a wedding. Anything
-- the spec leaves open defaults to the safer side (see "Defaults" below).
--
-- Before this, every team member could do everything (team_manage_* policies,
-- FOR ALL). Those are replaced by:
--   * team_read_*   : every team member can SEE the team's stock
--   * staff_write_* : manager / lead can insert, update, delete
--   * member_add_stock_orders : members may INSERT orders only
--   * member_record_stock_sales : members may INSERT a sale only when it is
--       tagged to a project they can access ("items used on a wedding")
-- admin_manage_* policies are untouched.
--
-- Defaults (not in the spec; change here if Calum decides otherwise):
--   members cannot log purchases, edit/add/delete catalogue items or groups,
--   make adjustments, upload product photos, or edit/delete orders and sales
--   (not even their own).
--
-- Stock counts keep working for member sales because the delta triggers are
-- SECURITY DEFINER (they update stock_items as the function owner).

-- ── stock_groups ────────────────────────────────────────────────────────────
drop policy if exists team_manage_stock_groups on public.stock_groups;
create policy team_read_stock_groups on public.stock_groups
  for select using (team_id = current_team_id());
create policy staff_write_stock_groups on public.stock_groups
  for all
  using (team_id = current_team_id() and current_planner_role() in ('manager', 'lead'))
  with check (team_id = current_team_id() and current_planner_role() in ('manager', 'lead'));

-- ── stock_items ─────────────────────────────────────────────────────────────
drop policy if exists team_manage_stock_items on public.stock_items;
create policy team_read_stock_items on public.stock_items
  for select using (team_id = current_team_id());
create policy staff_write_stock_items on public.stock_items
  for all
  using (team_id = current_team_id() and current_planner_role() in ('manager', 'lead'))
  with check (team_id = current_team_id() and current_planner_role() in ('manager', 'lead'));

-- ── stock_purchases ─────────────────────────────────────────────────────────
drop policy if exists team_manage_stock_purchases on public.stock_purchases;
create policy team_read_stock_purchases on public.stock_purchases
  for select using (exists (
    select 1 from public.stock_items i
    where i.id = stock_purchases.item_id and i.team_id = current_team_id()));
create policy staff_write_stock_purchases on public.stock_purchases
  for all
  using (current_planner_role() in ('manager', 'lead') and exists (
    select 1 from public.stock_items i
    where i.id = stock_purchases.item_id and i.team_id = current_team_id()))
  with check (current_planner_role() in ('manager', 'lead') and exists (
    select 1 from public.stock_items i
    where i.id = stock_purchases.item_id and i.team_id = current_team_id()));

-- ── stock_adjustments ───────────────────────────────────────────────────────
drop policy if exists team_manage_stock_adjustments on public.stock_adjustments;
create policy team_read_stock_adjustments on public.stock_adjustments
  for select using (exists (
    select 1 from public.stock_items i
    where i.id = stock_adjustments.item_id and i.team_id = current_team_id()));
create policy staff_write_stock_adjustments on public.stock_adjustments
  for all
  using (current_planner_role() in ('manager', 'lead') and exists (
    select 1 from public.stock_items i
    where i.id = stock_adjustments.item_id and i.team_id = current_team_id()))
  with check (current_planner_role() in ('manager', 'lead') and exists (
    select 1 from public.stock_items i
    where i.id = stock_adjustments.item_id and i.team_id = current_team_id()));

-- ── stock_sales ─────────────────────────────────────────────────────────────
drop policy if exists team_manage_stock_sales on public.stock_sales;
create policy team_read_stock_sales on public.stock_sales
  for select using (exists (
    select 1 from public.stock_items i
    where i.id = stock_sales.item_id and i.team_id = current_team_id()));
create policy staff_write_stock_sales on public.stock_sales
  for all
  using (current_planner_role() in ('manager', 'lead') and exists (
    select 1 from public.stock_items i
    where i.id = stock_sales.item_id and i.team_id = current_team_id()))
  with check (current_planner_role() in ('manager', 'lead') and exists (
    select 1 from public.stock_items i
    where i.id = stock_sales.item_id and i.team_id = current_team_id()));
create policy member_record_stock_sales on public.stock_sales
  for insert
  with check (
    current_planner_role() = 'member'
    and project_id is not null
    and planner_can_access_project(project_id)
    and exists (
      select 1 from public.stock_items i
      where i.id = stock_sales.item_id and i.team_id = current_team_id())
  );

-- ── stock_orders ────────────────────────────────────────────────────────────
drop policy if exists team_manage_stock_orders on public.stock_orders;
create policy team_read_stock_orders on public.stock_orders
  for select using (team_id = current_team_id());
create policy staff_write_stock_orders on public.stock_orders
  for all
  using (team_id = current_team_id() and current_planner_role() in ('manager', 'lead'))
  with check (team_id = current_team_id() and current_planner_role() in ('manager', 'lead'));
create policy member_add_stock_orders on public.stock_orders
  for insert
  with check (
    team_id = current_team_id()
    and current_planner_role() = 'member'
    and (project_id is null or planner_can_access_project(project_id))
  );

-- ── product photos (storage) ────────────────────────────────────────────────
-- Reading stays public (public_read_stock_photos). Writing is staff only.
drop policy if exists team_manage_own_stock_photos on storage.objects;
create policy staff_write_own_stock_photos on storage.objects
  for all
  using (
    bucket_id = 'stock-photos'
    and (storage.foldername(name))[1] = current_team_id()::text
    and current_planner_role() in ('manager', 'lead'))
  with check (
    bucket_id = 'stock-photos'
    and (storage.foldername(name))[1] = current_team_id()::text
    and current_planner_role() in ('manager', 'lead'));
