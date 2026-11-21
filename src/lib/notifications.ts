/**
 * Bell notifications (planner nav). Pure helpers: no Supabase, no React.
 *
 * Nothing here is stored as a "notification". The list is derived on every
 * load from the data the planner can already see, so it cannot go stale:
 *   - RSVP guests waiting for review (guests.rsvp_needs_review)
 *   - unpaid payments due within PAYMENT_LEAD_DAYS days, or overdue, shown
 *     every day until they are paid
 */
import { daysUntil } from '@/lib/projectDates'

/** A payment starts appearing this many days before its due date (due date included). */
export const PAYMENT_LEAD_DAYS = 7

export type ReviewNotification = {
  kind: 'rsvp_review'
  projectId: string
  projectLabel: string
  count: number
}

export type PaymentNotification = {
  kind: 'payment'
  paymentId: string
  projectId: string
  projectLabel: string
  vendorName: string
  label: string
  amount: number
  dueDate: string
  /** Negative = overdue by that many days; 0 = due today. */
  daysLeft: number
  /** The user has already opened the bell today while this payment was listed. */
  seenToday: boolean
}

export type BellData = {
  currency: string
  reviews: ReviewNotification[]
  payments: PaymentNotification[]
  /** Badge number: reviews still open + payment reminders not yet seen today. */
  unseen: number
}

export const EMPTY_BELL: BellData = { currency: 'EUR', reviews: [], payments: [], unseen: 0 }

type PaymentRow = {
  id: string
  project_id: string
  vendor_name: string
  label: string
  amount: number | string
  due_date: string
  paid_at: string | null
}

/** Unpaid and due within the lead window (or overdue). `today` is a YYYY-MM-DD calendar day. */
export function paymentNeedsReminder(p: Pick<PaymentRow, 'due_date' | 'paid_at'>, today: string): boolean {
  return !p.paid_at && daysUntil(p.due_date, today) <= PAYMENT_LEAD_DAYS
}

export function buildBell(input: {
  today: string
  currency: string
  payments: PaymentRow[]
  /** guest rows that still need review: one entry per guest */
  reviewGuests: { project_id: string }[]
  /** payment id -> last day the user opened the bell while it was listed */
  seen: Record<string, string>
  projectLabel: (projectId: string) => string
}): BellData {
  const { today, currency, seen, projectLabel } = input

  const counts = new Map<string, number>()
  for (const g of input.reviewGuests) counts.set(g.project_id, (counts.get(g.project_id) ?? 0) + 1)
  const reviews: ReviewNotification[] = [...counts.entries()]
    .map(([projectId, count]) => ({ kind: 'rsvp_review' as const, projectId, projectLabel: projectLabel(projectId), count }))
    .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel))

  const payments: PaymentNotification[] = input.payments
    .filter((p) => paymentNeedsReminder(p, today))
    .map((p) => ({
      kind: 'payment' as const,
      paymentId: p.id,
      projectId: p.project_id,
      projectLabel: projectLabel(p.project_id),
      vendorName: p.vendor_name,
      label: p.label,
      amount: Number(p.amount),
      dueDate: p.due_date,
      daysLeft: daysUntil(p.due_date, today),
      seenToday: seen[p.id] === today,
    }))
    // Most urgent first: most overdue, then soonest.
    .sort((a, b) => a.daysLeft - b.daysLeft || a.vendorName.localeCompare(b.vendorName))

  const unseen = reviews.length + payments.filter((p) => !p.seenToday).length
  return { currency, reviews, payments, unseen }
}

export function paymentWhen(daysLeft: number): string {
  if (daysLeft < -1) return `${-daysLeft} days overdue`
  if (daysLeft === -1) return '1 day overdue'
  if (daysLeft === 0) return 'Due today'
  if (daysLeft === 1) return 'Due tomorrow'
  return `Due in ${daysLeft} days`
}

/** Pages call this after they change something the bell shows (mark reviewed, mark paid). */
export const BELL_REFRESH_EVENT = 'venuria:bell-refresh'
export function requestBellRefresh(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BELL_REFRESH_EVENT))
}
