-- 047: two admin-controlled switches per rental company / vendor.
--   is_vendor        — the "Vendor" tag. Off: the company is no longer treated as a vendor, so Vendor
--                      stock is off too.
--   has_vendor_stock — access to "Vendor stock" (the tables & chairs the company rents out; NOT the
--                      team's retail stock, which is My stock). Only with this on does the login get the
--                      Planner ⇄ Vendor switch and the Vendor page; planners' summaries and PDFs include
--                      the company's rentable stock only with this on.
-- Switching off hides only; nothing is deleted, so ticking again restores everything.
-- Existing companies keep today's behaviour (both on). Who may change them: admins only,
-- through the existing admin_manage_rental_companies policy (002_auth_roles.sql).
-- Applied live 2026-11-28.

alter table public.rental_companies
  add column if not exists is_vendor        boolean not null default true,
  add column if not exists has_vendor_stock boolean not null default true;
