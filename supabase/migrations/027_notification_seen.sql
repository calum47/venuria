-- Bell notifications (planner nav).
--
-- Notifications are DERIVED, not stored, so they can never drift from the data:
--   * "To review" RSVP guests = guests.rsvp_needs_review (cleared by "Mark as reviewed").
--   * Payment reminders = unpaid project_payments due within 7 days or already
--     overdue; they appear every day until paid (paid_at set) or deleted.
-- Both are read through the caller's own RLS (planner_can_access_project), so a
-- planner only ever sees projects they can open.
--
-- The one thing that needs storing is "I have looked at today's reminder", so
-- the badge on the bell comes back each day without nagging all day:
-- notification_payment_seen holds, per user and payment, the last calendar day
-- (Europe/Madrid, computed by the app) the user opened the bell while that
-- payment was listed. One row per user and payment (upserted), removed with the
-- payment or the user.

create table public.notification_payment_seen (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payment_id uuid not null references public.project_payments(id) on delete cascade,
  seen_on    date not null,
  primary key (user_id, payment_id)
);

alter table public.notification_payment_seen enable row level security;

-- Own rows only. The payment must also be one the caller can access, so a user
-- cannot probe or mark payments of projects they cannot open.
create policy own_notification_payment_seen on public.notification_payment_seen
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.project_payments pp
       where pp.id = payment_id
         and public.planner_can_access_project(pp.project_id)
    )
  );
