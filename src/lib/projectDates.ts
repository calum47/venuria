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
