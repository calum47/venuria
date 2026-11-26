/**
 * Project date helpers (Phase 9). Pure, no timezone library: every value here
 * is a calendar date ('YYYY-MM-DD'), which is what the DB columns hold, and
 * all maths is done at UTC midnight so a date never shifts by a day
 * depending on the browser's zone.
 */

export const DUE_BY_LEAD_DAYS = 14

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  // Date.parse silently rolls '2026-02-30' over to March — round-trip to catch that.
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Calendar-month arithmetic on a YYYY-MM-DD date. If the target month is shorter, the day is clamped (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return new Date(Date.UTC(ny, nm, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

export type DueUnit = 'days' | 'weeks' | 'months'

/** A payment due date written relative to the event date in a contract: "1 month before the event". */
export type DueRule = { amount: number; unit: DueUnit; direction: 'before' | 'after' }

/** The actual due date for a rule, given the project's event date. */
export function applyDueRule(eventDate: string, rule: DueRule): string {
  const n = rule.direction === 'before' ? -rule.amount : rule.amount
  if (rule.unit === 'months') return addMonths(eventDate, n)
  return addDays(eventDate, rule.unit === 'weeks' ? n * 7 : n)
}

/** "1 month before the event", "2 weeks before the event", "on the event day". */
export function describeDueRule(rule: DueRule): string {
  if (rule.amount === 0) return 'on the event day'
  const unit = rule.amount === 1 ? rule.unit.slice(0, -1) : rule.unit
  return `${rule.amount} ${unit} ${rule.direction} the event`
}

/** Default Due By: two weeks before the event — the point at which the layout should be locked with the venue and rental companies. */
export function suggestDueBy(eventDate: string): string {
  return addDays(eventDate, -DUE_BY_LEAD_DAYS)
}

/** Whole days from today (UTC calendar) to the date. Negative = past. */
export function daysUntil(isoDate: string, today = todayIso()): number {
  const a = Date.parse(`${today}T00:00:00Z`)
  const b = Date.parse(`${isoDate}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function countdownLabel(isoDate: string): string {
  const n = daysUntil(isoDate)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 0) return `In ${n} days`
  return `${-n} days ago`
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
