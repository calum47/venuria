-- 043: performance tidy-up from the Supabase advisors. HISTORY ONLY: applied live 28 Nov 2026
-- as "performance_tidy_up"; do not re-run.
--
-- 1. auth_rls_initplan: 13 policies called auth.uid() directly, which Postgres re-evaluates for every row.
--    Wrapping it as (select auth.uid()) evaluates it once per query. Same result, same roles.
--    Done generically below by rewriting the stored expression of each such policy.
-- 2. duplicate_index: seat_assignments had two identical unique constraints on layout_object_id; the
--    "_unique" twin is dropped (seat_assignments_layout_object_id_key stays).
do $$
declare
  r record;
  q text;
  w text;
  stmt text;
begin
  for r in
    select p.polname, c.relname, p.polrelid, p.polqual, p.polwithcheck
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ 'auth\.uid\(\)'
       and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) !~ 'SELECT auth\.uid\(\)'
  loop
    q := pg_get_expr(r.polqual, r.polrelid);
    w := pg_get_expr(r.polwithcheck, r.polrelid);
    stmt := format('alter policy %I on public.%I', r.polname, r.relname);
    if q is not null then
      stmt := stmt || ' using (' || replace(q, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    if w is not null then
      stmt := stmt || ' with check (' || replace(w, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    execute stmt;
  end loop;
end $$;

alter table public.seat_assignments drop constraint if exists seat_assignments_layout_object_id_unique;
