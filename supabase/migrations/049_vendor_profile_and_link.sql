-- 049: a vendor's own contact details, and their automatic use in planners' timetables.
--
-- * rental_companies gains contact_name / phone / instagram (contact_email already exists). The vendor
--   edits them from its own Settings page, only through update_my_vendor_profile() below, so a vendor
--   can never touch its admin-controlled switches (047) or anything else on the company row.
-- * team_vendors (the planner team's vendor list used by timetable / run-down / payments) gains
--   rental_company_id. A linked team vendor takes its name (once, when linked) and its contact details
--   (always) from the company: a BEFORE trigger overwrites them, so planners cannot drift from what the
--   vendor entered, and a vendor's edit reaches every team that uses it (AFTER trigger on rental_companies).
-- * Vendors that are not in Venuria stay free-text team vendors (rental_company_id null), unchanged.
--
-- Applied live 2026-11-28 (after 047 and 048).

alter table public.rental_companies
  add column if not exists contact_name text check (char_length(contact_name) <= 120),
  add column if not exists phone        text check (char_length(phone) <= 40),
  add column if not exists instagram    text check (char_length(instagram) <= 60);

alter table public.team_vendors
  add column if not exists rental_company_id uuid references public.rental_companies(id) on delete set null;
create unique index if not exists team_vendors_team_company_key
  on public.team_vendors (team_id, rental_company_id) where rental_company_id is not null;

-- ── Linked team vendors mirror the company ──────────────────────────────────
create or replace function public.team_vendors_pull_company()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare c record;
begin
  if new.rental_company_id is not null then
    select name, contact_name, phone, contact_email, instagram into c
      from public.rental_companies where id = new.rental_company_id;
    if found then
      -- The name is taken when the link is made, not on every update, so renaming a company can never
      -- collide with another vendor of the same team in the middle of someone else's save.
      if tg_op = 'INSERT' or old.rental_company_id is distinct from new.rental_company_id then
        new.name := left(c.name, 80);
      end if;
      new.contact_name := c.contact_name;
      new.phone        := c.phone;
      new.email        := c.contact_email;
      new.instagram    := c.instagram;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists team_vendors_pull_company on public.team_vendors;
create trigger team_vendors_pull_company
  before insert or update on public.team_vendors
  for each row execute function public.team_vendors_pull_company();

-- A vendor's change reaches every linked team vendor (touching the row re-runs the trigger above).
create or replace function public.rental_company_push_contacts()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.contact_name is distinct from old.contact_name
     or new.phone is distinct from old.phone
     or new.contact_email is distinct from old.contact_email
     or new.instagram is distinct from old.instagram then
    update public.team_vendors set rental_company_id = rental_company_id where rental_company_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists rental_company_push_contacts on public.rental_companies;
create trigger rental_company_push_contacts
  after update on public.rental_companies
  for each row execute function public.rental_company_push_contacts();

-- ── The vendor edits only its own contact details ───────────────────────────
create or replace function public.update_my_vendor_profile(
  p_contact_name text, p_phone text, p_email text, p_instagram text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.rental_companies rc
     set contact_name  = nullif(left(btrim(coalesce(p_contact_name, '')), 120), ''),
         phone         = nullif(left(btrim(coalesce(p_phone, '')), 40), ''),
         contact_email = nullif(left(btrim(coalesce(p_email, '')), 120), ''),
         instagram     = nullif(left(btrim(coalesce(p_instagram, '')), 60), '')
   where rc.id in (select rm.rental_company_id from public.rental_managers rm where rm.user_id = auth.uid());
  if not found then
    raise exception 'No vendor account is linked to this login' using errcode = '42501';
  end if;
end;
$$;
grant execute on function public.update_my_vendor_profile(text, text, text, text) to authenticated;
