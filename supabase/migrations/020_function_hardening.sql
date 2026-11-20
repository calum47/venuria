-- 020: function hardening (history only: already applied live as "function_hardening").
-- Do not re-run.
--
-- 1. Pin search_path on older functions that left it mutable (behaviour unchanged).
alter function public.client_project_permission(uuid, text) set search_path = public;
alter function public.current_client_id() set search_path = public;
alter function public.current_planner_id() set search_path = public;
alter function public.current_rental_company_id() set search_path = public;
alter function public.current_venue_id() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.stock_items_enforce_on_demand() set search_path = public;
alter function public.update_updated_at() set search_path = public;

-- 2. Trigger functions are never called directly; remove the default API-callable
--    EXECUTE grant. Triggers keep firing: EXECUTE is checked when a trigger is
--    created, not when it fires.
revoke execute on function
  public.log_guest_activity(),
  public.log_layout_object_activity(),
  public.log_seat_assignment_activity(),
  public.planners_protect_fields(),
  public.projects_before_insert(),
  public.projects_before_update(),
  public.stock_apply_adjustment_delta(),
  public.stock_apply_purchase_delta(),
  public.stock_apply_sale_delta(),
  public.stock_log_price_change()
from public, anon, authenticated;
