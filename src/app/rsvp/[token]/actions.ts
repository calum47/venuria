'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { RSVP_STATUSES, isPlausibleToken, matchGuest, type RsvpStatus } from '@/lib/rsvp'

/**
 * Public RSVP actions (migration 025). No session exists, so everything runs
 * with the service-role client — which is why every step re-validates and why
 * the client is never trusted to say WHICH guest it is: the typed name is
 * matched again here, on the server, on every call.
 *
 * rsvp_gate() validates the token, applies open/deadline and rate-limits name
 * lookups; rsvp_submit() does the write atomically with its own checks.
 */

export type LookupResult =
  | { state: 'match'; displayName: string }
  | { state: 'none' }
  | { state: 'ambiguous' }
  | { state: 'answered' }
  | { state: 'closed' }
  | { state: 'rate_limited' }
  | { state: 'error' }

export type SubmitResult = {
  result: 'ok' | 'closed' | 'invalid' | 'already_answered' | 'plus_one_exists' | 'rate_limited' | 'ambiguous' | 'error'
}

type GuestRow = { id: string; name: string; rsvp_status: RsvpStatus | null }

async function openProject(token: unknown): Promise<{ projectId: string } | { fail: 'closed' | 'rate_limited' | 'error' }> {
  if (!isPlausibleToken(token)) return { fail: 'closed' }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rsvp_gate', { p_token: token })
  if (error || !data) return { fail: 'error' }
  const r = data as { ok: boolean; project_id?: string; reason?: string }
  if (!r.ok || !r.project_id) return { fail: r.reason === 'rate_limited' ? 'rate_limited' : 'closed' }
  return { projectId: r.project_id }
}

async function loadGuests(projectId: string): Promise<GuestRow[] | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('guests').select('id, name, rsvp_status').eq('project_id', projectId)
  if (error) return null
  return (data ?? []) as GuestRow[]
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

export async function lookupGuest(token: string, rawName: string): Promise<LookupResult> {
  const name = cleanName(rawName)
  if (name.length < 1 || name.length > 120) return { state: 'none' }

  const gate = await openProject(token)
  if ('fail' in gate) return { state: gate.fail }

  const guests = await loadGuests(gate.projectId)
  if (!guests) return { state: 'error' }

  const m = matchGuest(name, guests)
  if (m.kind === 'none') return { state: 'none' }
  if (m.kind === 'ambiguous') return { state: 'ambiguous' }
  if (m.guest.rsvp_status) return { state: 'answered' }
  return { state: 'match', displayName: m.guest.name }
}

export type SubmitInput = {
  name: string
  status: string
  dietary: string
  plusName: string
  plusDietary: string
  consent: boolean
  /** Honeypot: real people never fill this in. */
  website?: string
}

export async function submitRsvp(token: string, input: SubmitInput): Promise<SubmitResult> {
  // A bot that fills the hidden field is told it worked and nothing is stored.
  if (input.website && input.website.trim()) return { result: 'ok' }

  const name = cleanName(input.name)
  if (name.length < 1 || name.length > 120) return { result: 'invalid' }
  if (!(RSVP_STATUSES as string[]).includes(input.status)) return { result: 'invalid' }
  const status = input.status as RsvpStatus
  if (input.consent !== true) return { result: 'invalid' }

  const gate = await openProject(token)
  if ('fail' in gate) return { result: gate.fail }

  const guests = await loadGuests(gate.projectId)
  if (!guests) return { result: 'error' }

  const m = matchGuest(name, guests)
  if (m.kind === 'ambiguous') return { result: 'ambiguous' }

  // Data minimisation: someone who is not coming is not asked, and we do not keep, dietary needs or a plus-one.
  const coming = status !== 'declined'
  const dietary = coming ? input.dietary : ''
  const plusName = status === 'attending' ? cleanName(input.plusName) : ''
  const plusDietary = plusName ? input.plusDietary : ''

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rsvp_submit', {
    p_token: token,
    p_guest_id: m.kind === 'match' ? m.guest.id : null,
    p_name: name,
    p_status: status,
    p_dietary: dietary,
    p_plus_name: plusName,
    p_plus_dietary: plusDietary,
    p_consent: true,
  })
  if (error || !data) return { result: 'error' }
  const r = (data as { result: SubmitResult['result'] }).result
  return { result: r }
}
