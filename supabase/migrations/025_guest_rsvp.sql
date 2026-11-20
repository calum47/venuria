-- RSVP over a shared link (Phase A).
--
-- One link per project. A guest opens it, types their name, and the server
-- matches the name against the guest list (matching happens in the app, with
-- the service-role client; this migration never opens `guests` to anon).
--
--   project_rsvp   one row per project: secret token, on/off switch, deadline,
--                  welcome text, whether guests may add a plus-one.
--   guests         + rsvp_status (null = pending), rsvp_at, rsvp_source,
--                  rsvp_consent_at, rsvp_needs_review, plus_one_of.
--   rsvp_events    rate-limit bookkeeping only (no personal data).
--
-- Rules enforced here, not in the app:
--   * A link can only give a FIRST answer. Once a guest has answered, the link
--     refuses (a shared link cannot tell guests apart, so anyone could
--     otherwise overwrite someone else's answer). The planner edits afterwards.
--   * Nothing is stored without the guest's consent flag.
--   * The deadline is checked in the database (Europe/Madrid calendar day).
--   * Guests created through the link (no match on the list) and plus-ones are
--     flagged rsvp_needs_review, and creation is capped per project per hour.
--
-- Applied to the live project on 2026-11-20 via MCP; this file keeps the
-- migration history in sync.

-- ── Page settings ───────────────────────────────────────────────────────────

create table public.project_rsvp (
  project_id      uuid primary key references public.projects(id) on delete cascade,
  -- 64 hex characters from two random UUIDs. Possession of the token is the
  -- only credential, so it is never exposed to anyone but the planner team.
  token           text not null unique default
                    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  enabled         boolean not null default false,
  deadline        date,
  welcome_message text check (welcome_message is null or length(welcome_message) <= 500),
  allow_plus_one  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (length(token) >= 40)
);

create trigger project_rsvp_updated_at
  before update on public.project_rsvp
  for each row execute function public.update_updated_at();

alter table public.project_rsvp enable row level security;

create policy planner_manage_accessible_rsvp on public.project_rsvp
  for all using (public.planner_can_access_project(project_id))
  with check (public.planner_can_access_project(project_id));

create policy admin_manage_rsvp on public.project_rsvp
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Guest columns ───────────────────────────────────────────────────────────

alter table public.guests
  add column rsvp_status       text check (rsvp_status in ('attending', 'declined', 'maybe')),
  add column rsvp_at           timestamptz,
  add column rsvp_source       text check (rsvp_source in ('link', 'planner')),
  add column rsvp_consent_at   timestamptz,
  add column rsvp_needs_review boolean not null default false,
  add column plus_one_of       uuid;

-- A status always has a time and a source, and the reverse.
alter table public.guests add constraint guests_rsvp_complete
  check ((rsvp_status is null) = (rsvp_at is null) and (rsvp_status is null) = (rsvp_source is null));

-- Plus-ones are ordinary guest rows (one chair per guest) pointing at the guest
-- who brought them, in the same project. Deleting the inviter unlinks, not deletes.
alter table public.guests add constraint guests_plus_one_fk
  foreign key (plus_one_of, project_id) references public.guests (id, project_id)
  on delete set null (plus_one_of);
alter table public.guests add constraint guests_plus_one_not_self
  check (plus_one_of is null or plus_one_of <> id);
create unique index guests_one_plus_one_idx on public.guests (plus_one_of) where plus_one_of is not null;
create index guests_rsvp_status_idx on public.guests (project_id, rsvp_status);

-- ── Rate-limit bookkeeping ──────────────────────────────────────────────────

create table public.rsvp_events (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind       text not null check (kind in ('lookup', 'create')),
  created_at timestamptz not null default now()
);
create index rsvp_events_recent_idx on public.rsvp_events (project_id, kind, created_at);
create index rsvp_events_age_idx on public.rsvp_events (created_at);
-- RLS on, no policies: only the service role (which bypasses RLS) touches it.
alter table public.rsvp_events enable row level security;

-- ── Gate for name lookups ───────────────────────────────────────────────────
-- Validates the token, applies the page's open/deadline rules and records the
-- lookup. Returns { ok, project_id } or { ok:false, reason }.

create or replace function public.rsvp_gate(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.project_rsvp;
begin
  select * into cfg from public.project_rsvp where token = p_token;
  if not found or not cfg.enabled then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if cfg.deadline is not null and (now() at time zone 'Europe/Madrid')::date > cfg.deadline then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  delete from public.rsvp_events where created_at < now() - interval '1 day';

  if (select count(*) from public.rsvp_events
      where project_id = cfg.project_id and kind = 'lookup' and created_at > now() - interval '10 minutes') >= 300 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.rsvp_events (project_id, kind) values (cfg.project_id, 'lookup');
  return jsonb_build_object('ok', true, 'project_id', cfg.project_id);
end;
$$;

-- ── Submit an answer ────────────────────────────────────────────────────────
-- p_guest_id: the guest the app matched on the list, or null when nobody
-- matched (a new row is created, flagged for review). Everything below runs in
-- one transaction, so a failed plus-one never leaves a half-saved answer.
-- result: ok | closed | invalid | already_answered | plus_one_exists | rate_limited

create or replace function public.rsvp_submit(
  p_token         text,
  p_guest_id      uuid,
  p_name          text,
  p_status        text,
  p_dietary       text,
  p_plus_name     text,
  p_plus_dietary  text,
  p_consent       boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg      public.project_rsvp;
  g        public.guests;
  gid      uuid;
  nm       text := btrim(coalesce(p_name, ''));
  diet     text := nullif(btrim(coalesce(p_dietary, '')), '');
  pn       text := nullif(btrim(coalesce(p_plus_name, '')), '');
  pdiet    text := nullif(btrim(coalesce(p_plus_dietary, '')), '');
  creates  int;
begin
  select * into cfg from public.project_rsvp where token = p_token;
  if not found or not cfg.enabled then
    return jsonb_build_object('result', 'closed');
  end if;
  if cfg.deadline is not null and (now() at time zone 'Europe/Madrid')::date > cfg.deadline then
    return jsonb_build_object('result', 'closed');
  end if;

  if p_status not in ('attending', 'declined', 'maybe')
     or not coalesce(p_consent, false)
     or length(nm) not between 1 and 120
     or length(coalesce(diet, '')) > 500
     or length(coalesce(pdiet, '')) > 500
     or (pn is not null and (not cfg.allow_plus_one or p_status <> 'attending' or length(pn) > 120)) then
    return jsonb_build_object('result', 'invalid');
  end if;

  -- How many new guest rows would this answer create?
  creates := (case when p_guest_id is null then 1 else 0 end) + (case when pn is not null then 1 else 0 end);
  if creates > 0 and (select count(*) from public.rsvp_events
                      where project_id = cfg.project_id and kind = 'create' and created_at > now() - interval '1 hour') + creates > 20 then
    return jsonb_build_object('result', 'rate_limited');
  end if;

  if p_guest_id is not null then
    select * into g from public.guests where id = p_guest_id and project_id = cfg.project_id for update;
    if not found then
      return jsonb_build_object('result', 'invalid');
    end if;
    if g.rsvp_status is not null then
      return jsonb_build_object('result', 'already_answered');
    end if;
    if pn is not null and exists (select 1 from public.guests where plus_one_of = g.id) then
      return jsonb_build_object('result', 'plus_one_exists');
    end if;
    update public.guests
       set rsvp_status = p_status, rsvp_at = now(), rsvp_source = 'link', rsvp_consent_at = now(),
           dietary = coalesce(diet, dietary)
     where id = g.id;
    gid := g.id;
  else
    insert into public.guests (project_id, name, dietary, rsvp_status, rsvp_at, rsvp_source, rsvp_consent_at, rsvp_needs_review)
    values (cfg.project_id, nm, diet, p_status, now(), 'link', now(), true)
    returning id into gid;
    insert into public.rsvp_events (project_id, kind) values (cfg.project_id, 'create');
  end if;

  if pn is not null then
    insert into public.guests (project_id, name, dietary, rsvp_status, rsvp_at, rsvp_source, rsvp_consent_at, rsvp_needs_review, plus_one_of)
    values (cfg.project_id, pn, pdiet, 'attending', now(), 'link', now(), true, gid);
    insert into public.rsvp_events (project_id, kind) values (cfg.project_id, 'create');
  end if;

  return jsonb_build_object('result', 'ok', 'guest_id', gid, 'created', p_guest_id is null);
end;
$$;

revoke execute on function public.rsvp_gate(text) from public, anon, authenticated;
revoke execute on function public.rsvp_submit(text, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.rsvp_gate(text) to service_role;
grant execute on function public.rsvp_submit(text, uuid, text, text, text, text, text, boolean) to service_role;

-- ── Activity log ────────────────────────────────────────────────────────────
-- Same as migration 016, but an answer (rsvp_status change) also counts as an
-- update and is recorded in the summary. Link answers have no signed-in user,
-- so the actor is empty there.

create or replace function public.log_guest_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.guests;
  act text;
  sum jsonb;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  if tg_op = 'INSERT' then
    act := 'added';
  elsif tg_op = 'DELETE' then
    act := 'removed';
  else
    if old.name         is distinct from new.name
       or old.notes        is distinct from new.notes
       or old.is_vip       is distinct from new.is_vip
       or old.gives_speech is distinct from new.gives_speech
       or old.dietary      is distinct from new.dietary
       or old.age_group    is distinct from new.age_group
       or old.family_id    is distinct from new.family_id
       or old.photo_path   is distinct from new.photo_path
       or old.rsvp_status  is distinct from new.rsvp_status then
      act := 'updated';
    else
      return null;
    end if;
  end if;

  sum := jsonb_build_object('name', rec.name);
  if rec.rsvp_status is not null and rec.rsvp_source = 'link' then
    sum := sum || jsonb_build_object('rsvp', rec.rsvp_status, 'via', 'link');
  end if;

  insert into public.project_activity
    (project_id, room_id, actor_user_id, actor_name, entity, action, entity_id, summary)
  values
    (rec.project_id, null, auth.uid(), public.activity_actor_name(auth.uid()),
     'guest', act, rec.id, sum);

  return null;
end;
$$;
