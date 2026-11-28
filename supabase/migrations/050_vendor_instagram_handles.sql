-- 050: a vendor can list several Instagram handles, one of them marked as the main company account.
--
-- rental_companies.instagram_handles = jsonb array of {"handle": text, "main": boolean}.
-- rental_companies.instagram stays and always holds the MAIN handle, so everything built on it (the
-- team_vendors mirror from 049, the planners' timetable) keeps working unchanged.
-- update_my_vendor_profile() gets a new signature (p_instagrams jsonb replaces p_instagram text).

alter table public.rental_companies
  add column if not exists instagram_handles jsonb not null default '[]'::jsonb
    check (jsonb_typeof(instagram_handles) = 'array');

-- Existing single handles become a one-item list, marked main.
update public.rental_companies
   set instagram_handles = jsonb_build_array(jsonb_build_object('handle', instagram, 'main', true))
 where instagram is not null and instagram <> '' and instagram_handles = '[]'::jsonb;

drop function if exists public.update_my_vendor_profile(text, text, text, text);

create or replace function public.update_my_vendor_profile(
  p_contact_name text, p_phone text, p_email text, p_instagrams jsonb
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  cleaned jsonb := '[]'::jsonb;
  item jsonb;
  h text;
  seen text[] := '{}';
  main_handle text := null;
begin
  if p_instagrams is not null and jsonb_typeof(p_instagrams) = 'array' then
    for item in select * from jsonb_array_elements(p_instagrams) loop
      h := left(regexp_replace(btrim(coalesce(item->>'handle', '')), '^@+', ''), 60);
      continue when h = '' or lower(h) = any(seen);
      exit when array_length(seen, 1) >= 10;
      seen := seen || lower(h);
      -- the first item flagged main wins; any later "main" flags are ignored
      if main_handle is null and coalesce((item->>'main')::boolean, false) then main_handle := h; end if;
      cleaned := cleaned || jsonb_build_array(jsonb_build_object('handle', h, 'main', false));
    end loop;
    -- no main chosen: the first handle is the main one
    if main_handle is null and jsonb_array_length(cleaned) > 0 then main_handle := cleaned->0->>'handle'; end if;
    cleaned := coalesce((
      select jsonb_agg(jsonb_build_object('handle', e->>'handle', 'main', (e->>'handle') = main_handle))
        from jsonb_array_elements(cleaned) e), '[]'::jsonb);
  end if;

  update public.rental_companies rc
     set contact_name      = nullif(left(btrim(coalesce(p_contact_name, '')), 120), ''),
         phone             = nullif(left(btrim(coalesce(p_phone, '')), 40), ''),
         contact_email     = nullif(left(btrim(coalesce(p_email, '')), 120), ''),
         instagram_handles = cleaned,
         instagram         = main_handle
   where rc.id in (select rm.rental_company_id from public.rental_managers rm where rm.user_id = auth.uid());
  if not found then
    raise exception 'No vendor account is linked to this login' using errcode = '42501';
  end if;
end;
$$;
grant execute on function public.update_my_vendor_profile(text, text, text, jsonb) to authenticated;
