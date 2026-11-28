'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { getBell, markPaymentsSeen } from '@/app/planner/notificationActions'
import { BELL_REFRESH_EVENT, EMPTY_BELL, paymentWhen, type BellData } from '@/lib/notifications'
import { formatMoney } from '@/lib/payments'
import { formatDate } from '@/lib/projectDates'

const POLL_MS = 120_000

/**
 * The bell in the planner nav. The layout is not re-rendered on client-side
 * navigation, so the list is fetched here: on mount, on every route change,
 * when the tab regains focus, every two minutes, and when a page that changes
 * something the bell shows (mark reviewed, mark paid) asks for a refresh.
 */
export default function NotificationBell() {
  const t = useTranslations('Bell')
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const [bell, setBell] = useState<BellData>(EMPTY_BELL)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    getBell().then(setBell, () => {})
  }, [])

  useEffect(() => {
    load()
  }, [load, pathname])

  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    window.addEventListener(BELL_REFRESH_EVENT, onFocus)
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(BELL_REFRESH_EVENT, onFocus)
      window.clearInterval(timer)
    }
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      const unseen = bell.payments.filter((p) => !p.seenToday).map((p) => p.paymentId)
      if (unseen.length > 0) {
        // Optimistic: the badge drops now; the server write follows.
        setBell((b) => ({
          ...b,
          payments: b.payments.map((p) => ({ ...p, seenToday: true })),
          unseen: b.reviews.length,
        }))
        markPaymentsSeen(unseen).catch(() => {})
      }
    }
  }

  const total = bell.reviews.length + bell.payments.length

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={bell.unseen > 0 ? t('ariaNew', { count: bell.unseen }) : t('aria')}
        aria-expanded={open}
        className="relative p-2 rounded-md text-gray-600 hover:bg-gray-100"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {bell.unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] leading-4 text-center">
            {bell.unseen > 9 ? '9+' : bell.unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg z-50">
          {total === 0 ? (
            <p className="p-4 text-sm text-gray-500">{t('empty')}</p>
          ) : (
            <>
              {bell.reviews.length > 0 && (
                <section>
                  <h3 className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{t('rsvpsToReview')}</h3>
                  <ul>
                    {bell.reviews.map((r) => (
                      <li key={r.projectId}>
                        <Link
                          href={`/planner/projects/${r.projectId}/guests`}
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span className="text-gray-900">
                            {t('guestsToReview', { count: r.count })}
                          </span>
                          <span className="block text-xs text-gray-500">{r.projectLabel}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {bell.payments.length > 0 && (
                <section>
                  <h3 className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{t('payments')}</h3>
                  <ul>
                    {bell.payments.map((p) => (
                      <li key={p.paymentId}>
                        <Link
                          href={`/planner/projects/${p.projectId}/payments`}
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-gray-900 truncate">{p.vendorName} · {p.label}</span>
                            <span className="text-gray-900 shrink-0">{formatMoney(p.amount, bell.currency, locale)}</span>
                          </span>
                          <span className={`block text-xs ${p.daysLeft < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                            {paymentWhen(p.daysLeft, t)} · {formatDate(p.dueDate, locale)}
                          </span>
                          <span className="block text-xs text-gray-500">{p.projectLabel}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
                {t('footer')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
