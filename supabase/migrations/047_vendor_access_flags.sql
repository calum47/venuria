-- 047: two admin-controlled switches per rental company / vendor.
--   is_vendor        — the "Vendor" tag. Off: the Planner ⇄ Vendor switch and the Vendor page are hidden
--                      for that login, and its rentable stock is not offered to planners.
--   has_vendor_stock — access to "Vendor stock" (the tables & chairs the company rents out; NOT the
--                      team's retail stock, which is My stock). Off: the section is hidden and the
--                      company's rentable stock is left out of planners' summaries and PDFs.
-- Switching off hides only; nothing is deleted, so ticking again restores everything.
-- Existing companies keep today's behaviour (both on). Who may change them: admins only,
-- through the existing admin_manage_rental_companies policy (002_auth_roles.sql).
-- NOT yet applied live: apply it BEFORE deploying the code that reads these columns.

alter table public.rental_companies
  add column if not exists is_vendor        boolean not null default true,
  add column if not exists has_vendor_stock boolean not null default true;
