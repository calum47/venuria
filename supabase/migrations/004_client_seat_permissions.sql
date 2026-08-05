-- ─── Client permissions ──────────────────────────────────────────────────────────
-- A single flexible column rather than one-off boolean columns, since more
-- per-client visibility/permission toggles are expected later (run-down,
-- budget, etc. — shown to a client only when their planner opts them in).
-- Known keys so far:
--   "can_reassign_seats" (boolean) — move an already-seated guest to a
--     different chair. Default false: clients can only place an unassigned
--     guest into an empty chair, nothing more.

alter table projects
  add column client_permissions jsonb not null default '{}'::jsonb;

create or replace function client_project_permission(p_project_id uuid, p_key text)
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select client_permissions ->> p_key from projects where id = p_project_id)::boolean,
    false
  );
$$;

-- ─── Seat assignments: split the client policy ──────────────────────────────────
-- Previously "for all" (full CRUD). Replaced with:
--   - select: always (clients need to see who's seated where)
--   - insert: always (adding a guest from the list onto a chair)
--   - delete: only when the project's can_reassign_seats flag is on
-- No update policy — the app never runs UPDATE on this table (moves are
-- done as delete + insert), so omitting it is intentional, not an oversight.

drop policy if exists client_manage_own_seat_assignments on seat_assignments;

drop policy if exists client_read_own_seat_assignments on seat_assignments;
create policy client_read_own_seat_assignments on seat_assignments
  for select using (
    exists (
      select 1 from projects p
      where p.id = seat_assignments.project_id and p.client_id = current_client_id()
    )
  );

drop policy if exists client_insert_own_seat_assignments on seat_assignments;
create policy client_insert_own_seat_assignments on seat_assignments
  for insert with check (
    exists (
      select 1 from projects p
      where p.id = seat_assignments.project_id and p.client_id = current_client_id()
    )
  );

drop policy if exists client_delete_own_seat_assignments on seat_assignments;
create policy client_delete_own_seat_assignments on seat_assignments
  for delete using (
    exists (
      select 1 from projects p
      where p.id = seat_assignments.project_id and p.client_id = current_client_id()
    )
    and client_project_permission(seat_assignments.project_id, 'can_reassign_seats')
  );

-- Note: planner_manage_own_seat_assignments (from 003) is untouched — the
-- planner always has full control regardless of this flag.

-- ─── Data integrity: one guest per chair ─────────────────────────────────────────
-- Without this, a client blocked from reassigning could still insert a new
-- guest into an already-occupied chair (the delete of the old occupant gets
-- silently blocked by RLS above, but nothing stopped the insert). This turns
-- that into a clean constraint violation the app can catch, instead of two
-- guests silently sharing one chair.
--
-- If this fails to apply, it means duplicate assignments already exist for
-- some chair(s) — run this first to find them, then decide which to keep:
--   select layout_object_id, count(*) from seat_assignments
--   group by layout_object_id having count(*) > 1;

alter table seat_assignments
  add constraint seat_assignments_layout_object_id_unique unique (layout_object_id);
