/**
 * Project date helpers (Phase 9). Pure, no timezone library: every value here
 * is a calendar date ('YYYY-MM-DD'), which is what the DB columns hold, and
 * all maths is done at UTC midnight so a date never shifts by a day
 * depending on the browser's zone.
 */

import type { Tr } from '@/i18n/types'
import { INTL_TAG, type Locale } from '@/i18n/config'

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

/** "1 month before the event", "2 weeks before the event", "on the event day". `t` = translator for "Dates". */
export function describeDueRule(rule: DueRule, t: Tr): string {
  if (rule.amount === 0) return t('ruleEventDay')
  const unit = t(rule.unit === 'days' ? 'unitDay' : rule.unit === 'weeks' ? 'unitWeek' : 'unitMonth', { count: rule.amount })
  return t(rule.direction === 'before' ? 'ruleBefore' : 'ruleAfter', { amount: rule.amount, unit })
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

/** `t` = translator for "Dates". */
export function countdownLabel(isoDate: string, t: Tr): string {
  const n = daysUntil(isoDate)
  if (n === 0) return t('today')
  if (n === 1) return t('tomorrow')
  if (n === -1) return t('yesterday')
  if (n > 0) return t('inDays', { count: n })
  return t('daysAgo', { count: -n })
}

/** Like formatDate but without the weekday ("12 Mar 2027"). */
export function formatDateNoWeekday(isoDate: string, locale: Locale): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(INTL_TAG[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDate(isoDate: string, locale: Locale): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(INTL_TAG[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
