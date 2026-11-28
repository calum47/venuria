'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { Tr } from '@/i18n/types'
import { formatMoney, monthGrid, monthLabel, paymentStatus, shiftMonth, sumAmounts, weekdayLabels } from '@/lib/payments'
import { formatDate, todayIso } from '@/lib/projectDates'

export type OverviewPayment = {
  id: string
  projectId: string
  projectTitle: string
  vendor: string
  label: string
  amount: number
  due_date: string
  paid_at: string | null
}

type View = 'calendar' | 'list'
type Filter = 'all' | 'pending' | 'paid'


const btn = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50'

function tone(p: OverviewPayment): string {
  const st = paymentStatus(p)
  if (st.kind === 'paid') return 'bg-green-50 text-green-700'
  if (st.kind === 'overdue') return 'bg-red-50 text-red-700'
  return st.days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
}

function statusText(p: OverviewPayment, t: Tr, locale: Locale): string {
  const st = paymentStatus(p)
  if (st.kind === 'paid') return t('paidOn', { date: formatDate(st.paidAt, locale).replace(/^[^,]+, /, '') })
  if (st.kind === 'overdue') return t('overdueDays', { count: st.days })
  if (st.days === 0) return t('dueToday')
  return t('dueInDays', { count: st.days })
}

/**
 * Every payment, paid and pending, across the projects the planner can edit: a month calendar
 * (the default) or a list. Read-only: each payment links to its project's Payments page, where
 * it is marked paid or edited. Which payments appear is decided by the database, so a Member
 * only gets projects they created or are assigned to.
 */
export default function PaymentsOverview({ payments, currency }: { payments: OverviewPayment[]; currency: string }) {
  const [view, setView] = useState<View>('calendar')
  const [filter, setFilter] = useState<Filter>('all')
  const today = todayIso()
  const t = useTranslations('Payments')
  const tc = useTranslations('Common')
  const locale = useLocale() as Locale
  const WEEKDAYS = weekdayLabels(locale)
  const money = (n: number) => formatMoney(n, currency, locale)

  const next = payments.filter((p) => !p.paid_at && p.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  const [ym, setYm] = useState((next ? next.due_date : today).slice(0, 7))
  const [selected, setSelected] = useState<string | null>(null)

  const [y, m] = ym.split('-').map(Number)
  const weeks = useMemo(() => monthGrid(y, m - 1), [y, m])
  const byDay = useMemo(() => {
    const map = new Map<string, OverviewPayment[]>()
    for (const p of payments) map.set(p.due_date, [...(map.get(p.due_date) ?? []), p])
    return map
  }, [payments])

  const inMonth = payments.filter((p) => p.due_date.startsWith(ym))
  const selectedPayments = selected ? byDay.get(selected) ?? [] : []

  const listed = useMemo(
    () =>
      payments
        .filter((p) => (filter === 'all' ? true : filter === 'paid' ? !!p.paid_at : !p.paid_at))
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.projectTitle.localeCompare(b.projectTitle)),
    [payments, filter],
  )

  const row = (p: OverviewPayment) => (
    <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
      <span className="w-28 shrink-0 text-gray-600">{formatDate(p.due_date, locale)}</span>
      <span className="min-w-0 flex-1">
        <Link href={`/planner/projects/${p.projectId}/payments`} className="font-medium text-gray-900 hover:underline">{p.vendor}</Link>
        <span className="text-gray-500"> · {p.label} · {p.projectTitle}</span>
      </span>
      <span className="tabular-nums text-gray-900">{money(p.amount)}</span>
      <span className={`w-36 rounded-full px-2.5 py-0.5 text-center text-xs font-medium ${tone(p)}`}>{statusText(p, t, locale)}</span>
    </li>
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
        <div className="flex gap-1">
          {(['calendar', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-full border px-3 py-1 text-xs ${view === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {v === 'calendar' ? t('viewCalendar') : t('viewList')}
            </button>
          ))}
        </div>
        {view === 'list' ? (
          <div className="flex gap-1">
            {(['all', 'pending', 'paid'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs capitalize ${filter === f ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {f === 'all' ? t('filterAll') : f === 'pending' ? t('filterPending') : t('filterPaid')}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            {inMonth.length === 0 ? t('nothingDueMonth') : t('dueSummary', { count: inMonth.length, amount: money(sumAmounts(inMonth.map((p) => p.amount))) })}
          </p>
        )}
      </div>

      {payments.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400">{t('noPaymentsYet')}</p>
      ) : view === 'list' ? (
        listed.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">{t('nothingInFilter')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">{listed.map(row)}</ul>
        )
      ) : (
        <div>
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setYm(shiftMonth(ym, -1)); setSelected(null) }} className={btn} aria-label={tc('previousMonth')}>←</button>
              <button type="button" onClick={() => { setYm(shiftMonth(ym, 1)); setSelected(null) }} className={btn} aria-label={tc('nextMonth')}>→</button>
              <button type="button" onClick={() => { setYm(today.slice(0, 7)); setSelected(null) }} className={btn}>{tc('today')}</button>
            </div>
            <p className="text-sm font-medium text-gray-900">{monthLabel(ym, locale)}</p>
            <span className="w-16" />
          </div>
          <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] text-gray-400">
            {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {weeks.flat().map((cell) => {
              const ps = byDay.get(cell.iso) ?? []
              const isToday = cell.iso === today
              const isSelected = cell.iso === selected
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : cell.iso)}
                  aria-pressed={isSelected}
                  aria-label={t('dayAria', { date: formatDate(cell.iso, locale), count: ps.length })}
                  className={`min-h-20 border-b border-r border-gray-100 p-1 text-left align-top ${cell.inMonth ? 'bg-white' : 'bg-gray-50'} ${isSelected ? 'ring-2 ring-inset ring-brand-600' : 'hover:bg-gray-50'}`}
                >
                  <span className={isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] text-white' : `text-[11px] ${cell.inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                    {cell.day}
                  </span>
                  <span className="mt-0.5 block space-y-0.5">
                    {ps.slice(0, 2).map((p) => (
                      <span key={p.id} title={`${p.projectTitle} — ${p.vendor}, ${p.label}: ${money(p.amount)}`} className={`block truncate rounded-lg px-1 text-[10px] ${tone(p)}`}>
                        {p.vendor} {money(p.amount)}
                      </span>
                    ))}
                    {ps.length > 2 && <span className="block px-1 text-[10px] text-gray-500">{t('moreCount', { count: ps.length - 2 })}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="px-4 py-2 text-[11px] text-gray-400">
            {t.rich('legend', {
              g: (c) => <span className="text-green-700">{c}</span>,
              r: (c) => <span className="text-red-700">{c}</span>,
              a: (c) => <span className="text-amber-700">{c}</span>,
            })}
          </p>
          {selected && (
            <div className="border-t border-gray-100">
              <p className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
                {formatDate(selected, locale)}{selectedPayments.length === 0 ? ` — ${t('noPaymentsDue')}` : ''}
              </p>
              {selectedPayments.length > 0 && <ul className="divide-y divide-gray-100">{selectedPayments.map(row)}</ul>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
