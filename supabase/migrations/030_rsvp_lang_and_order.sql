-- RSVP page: default language and section order, both chosen by the planner.
--
-- default_lang: the language the page opens in. Guests can still switch it.
--   NULL is not allowed: new and existing rows get 'en' (the previous behaviour).
-- section_order: the order of the four movable blocks on the public page.
--   Always a permutation of details/form/area/hotels, so the page can never
--   lose a block because of a bad value.

alter table public.project_rsvp
  add column default_lang text not null default 'en'
    check (default_lang in ('es', 'en', 'fr')),
  add column section_order text[] not null default array['details', 'form', 'area', 'hotels']
    check (
      array_length(section_order, 1) = 4
      and section_order @> array['details', 'form', 'area', 'hotels']
    );
