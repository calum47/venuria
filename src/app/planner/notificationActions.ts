'use server'

import { projectTitle } from '@/lib/projectTitle'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { madridToday } from '@/lib/rsvp'
import { addDays } from '@/lib/projectDates'
import { PAYMENT_LEAD_DAYS, buildBell, EMPTY_BELL, type BellData } from '@/lib/notifications'
import { formatDate } from '@/lib/projectDates'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'

/**
 * Loads the bell for the signed-in planner. Everything is read with the
 * caller's own session, so row-level security (planner_can_access_project)
 * decides which projects show up — there is no separate permission logic here.
 * Returns an empty bell (never throws) so a failed poll cannot break the nav.
 */
export async function getBell(): Promise<BellData> {
  try {
    const supabase = await createClient()
    const ctx = await getPlannerContext(supabase)
    if (!ctx) return EMPTY_BELL

    const today = madridToday()
    const horizon = addDays(today, PAYMENT_LEAD_DAYS)

    const [payRes, reviewRes] = await Promise.all([
      supabase
        .from('project_payments')
        .select('id, project_id, vendor_name, label, amount, due_date, paid_at')
        .is('paid_at', null)
        .lte('due_date', horizon)
        .order('due_date')
        .limit(200),
      supabase.from('guests').select('project_id').eq('rsvp_needs_review', true).limit(1000),
    ])
    if (payRes.error || reviewRes.error) return { ...EMPTY_BELL, currency: ctx.team.currency }

    const payments = payRes.data ?? []
    const reviewGuests = reviewRes.data ?? []
    const projectIds = [...new Set([...payments.map((p) => p.project_id), ...reviewGuests.map((g) => g.project_id)])]

    const locale = (await getLocale()) as Locale
    const tc = await getTranslations('Common')
    const labels = new Map<string, string>()
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, event_date, couple_names, venues(name)')
        .in('id', projectIds)
      for (const p of projects ?? []) {
        const title = projectTitle(p.couple_names, (p.venues as unknown as { name: string } | null)?.name ?? tc('project'))
        labels.set(p.id, p.event_date ? `${title} · ${formatDate(p.event_date, locale)}` : title)
      }
    }

    const seen: Record<string, string> = {}
    if (payments.length > 0) {
      const { data: seenRows } = await supabase
        .from('notification_payment_seen')
        .select('payment_id, seen_on')
        .eq('user_id', ctx.userId)
        .in('payment_id', payments.map((p) => p.id))
      for (const r of seenRows ?? []) seen[r.payment_id] = r.seen_on
    }

    return buildBell({
      today,
      currency: ctx.team.currency,
      payments,
      reviewGuests,
      seen,
      projectLabel: (id) => labels.get(id) ?? 'Project',
    })
  } catch {
    return EMPTY_BELL
  }
}

/** The user opened the bell: today's payment reminders count as seen until tomorrow. */
export async function markPaymentsSeen(paymentIds: string[]): Promise<void> {
  try {
    const ids = [...new Set(paymentIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200)
    if (ids.length === 0) return
    const supabase = await createClient()
    const ctx = await getPlannerContext(supabase)
    if (!ctx) return
    const today = madridToday()
    await supabase
      .from('notification_payment_seen')
      .upsert(ids.map((payment_id) => ({ user_id: ctx.userId, payment_id, seen_on: today })), { onConflict: 'user_id,payment_id' })
  } catch {
    // Best effort: the worst case is the badge shows again on the next load.
  }
}
