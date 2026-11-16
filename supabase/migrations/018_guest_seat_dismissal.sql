-- "Needs a seat" flag on guests: a guest with no seat is flagged on the guest
-- list and the project page, except babies (they sit on a lap). A planner can
-- dismiss the flag for a guest who genuinely will not sit (leaves after the
-- ceremony, stands, ...), and must say why. The dismissal lives on the guest
-- row. Deliberately NOT part of log_guest_activity()'s change test, so
-- dismissing or restoring never lands in the "what changed" summary and no
-- one is notified.

alter table public.guests
  add column seat_dismissed_note text,
  add column seat_dismissed_at   timestamptz,
  add column seat_dismissed_by   uuid references auth.users(id) on delete set null;

alter table public.guests
  add constraint guests_seat_dismissal_check check (
    (seat_dismissed_at is null and seat_dismissed_note is null)
    or (seat_dismissed_at is not null
        and seat_dismissed_note is not null
        and char_length(btrim(seat_dismissed_note)) between 1 and 300)
  );
