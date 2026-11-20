/**
 * RSVP over a shared link (migration 025). Pure helpers, no I/O, so the matching
 * rules and the counts can be tested without a database.
 */

export type RsvpStatus = 'attending' | 'declined' | 'maybe'
export const RSVP_STATUSES: RsvpStatus[] = ['attending', 'declined', 'maybe']
export const RSVP_LABEL: Record<RsvpStatus, string> = {
  attending: 'Attending',
  declined: 'Declined',
  maybe: 'Maybe',
}

/** The token is 64 hex characters (two UUIDs). Reject anything else before touching the database. */
export function isPlausibleToken(t: unknown): t is string {
  return typeof t === 'string' && /^[0-9a-f]{40,128}$/.test(t)
}

// ── Name matching ───────────────────────────────────────────────────────────

/** Lowercase, accents and punctuation removed, spaces collapsed. "María  García-López" → "maria garcia lopez". */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const tokens = (s: string) => normalizeName(s).split(' ').filter(Boolean)

export type MatchResult<G> =
  | { kind: 'none' }
  | { kind: 'match'; guest: G }
  /** More than one guest fits, or the typed name is too short to tell. The guest is asked for a fuller name. */
  | { kind: 'ambiguous' }

/**
 * Finds the one guest a typed name refers to.
 *  1. Same name once accents, case and punctuation are ignored (word order ignored too).
 *  2. Otherwise a name that contains, or is contained in, a guest name, as long as
 *     the shorter side has at least two words ("Maria Garcia" ↔ "Maria Garcia Lopez").
 * A single word never matches loosely: if it is part of any guest's name we say
 * "ambiguous" (ask for the full name) instead of creating a duplicate.
 * Exactly one candidate is a match; several is ambiguous; none is none.
 */
export function matchGuest<G extends { id: string; name: string }>(typed: string, guests: G[]): MatchResult<G> {
  const t = tokens(typed)
  if (t.length === 0) return { kind: 'none' }
  const sortedKey = [...t].sort().join(' ')

  const exact = guests.filter((g) => [...tokens(g.name)].sort().join(' ') === sortedKey)
  if (exact.length === 1) return { kind: 'match', guest: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous' }

  if (t.length < 2) {
    return guests.some((g) => tokens(g.name).includes(t[0])) ? { kind: 'ambiguous' } : { kind: 'none' }
  }

  const tset = new Set(t)
  const loose = guests.filter((g) => {
    const gt = tokens(g.name)
    if (gt.length < 2) return false
    const gset = new Set(gt)
    return t.every((x) => gset.has(x)) || gt.every((x) => tset.has(x))
  })
  if (loose.length === 1) return { kind: 'match', guest: loose[0] }
  if (loose.length > 1) return { kind: 'ambiguous' }
  return { kind: 'none' }
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** Today's calendar date in Madrid (YYYY-MM-DD), the same day the database uses for deadlines. */
export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The last day to answer is still open: closed only AFTER the deadline date. */
export function rsvpOpen(deadline: string | null, today: string = madridToday()): boolean {
  return !deadline || today <= deadline
}

// ── Counts for the planner ──────────────────────────────────────────────────

export type RsvpGuestLike = {
  rsvp_status: RsvpStatus | null
  rsvp_needs_review: boolean
  dietary: string | null
}

export type RsvpSummary = {
  total: number
  attending: number
  declined: number
  maybe: number
  pending: number
  needsReview: number
  /** Attending or maybe guests who gave dietary needs. */
  dietaryAmongComing: number
}

export function rsvpSummary(guests: RsvpGuestLike[]): RsvpSummary {
  const s: RsvpSummary = { total: guests.length, attending: 0, declined: 0, maybe: 0, pending: 0, needsReview: 0, dietaryAmongComing: 0 }
  for (const g of guests) {
    if (g.rsvp_status === 'attending') s.attending++
    else if (g.rsvp_status === 'declined') s.declined++
    else if (g.rsvp_status === 'maybe') s.maybe++
    else s.pending++
    if (g.rsvp_needs_review) s.needsReview++
    if ((g.rsvp_status === 'attending' || g.rsvp_status === 'maybe') && g.dietary && g.dietary.trim()) s.dietaryAmongComing++
  }
  return s
}

export function rsvpPath(token: string): string {
  return `/rsvp/${token}`
}

/** A fresh link token: 32 random bytes as 64 hex characters. Browser or Node (both have Web Crypto). */
export function newRsvpToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
