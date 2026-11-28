-- 053: tidy up who can call the functions added in 047-052 (Supabase security advisor, lint 0028).
--
-- * The two trigger functions are only ever run by their triggers; nobody needs EXECUTE to call them over the API.
-- * The vendor helper functions are used by signed-in users (RLS policies, RPC calls); signed-out visitors never are.
-- Grants to `authenticated` on the others (update_my_vendor_profile, vendor_can_view_project, is_active_vendor,
-- the request functions) stay as they were. Older helpers (is_admin, current_*_id…) are NOT touched here:
-- other flows (RSVP page, login) may rely on them.

revoke execute on function public.team_vendors_pull_company() from public, anon, authenticated;
revoke execute on function public.rental_company_push_contacts() from public, anon, authenticated;
revoke execute on function public.update_my_vendor_profile(text, text, text, jsonb) from public, anon;
revoke execute on function public.vendor_can_view_project(uuid) from public, anon;
revoke execute on function public.is_active_vendor() from public, anon;
