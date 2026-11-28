'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setItemSource } from './sourceActions'

export type SourceOption = {
  companyId: string
  companyName: string
  stock: number
  /** Already promised to other projects on the same event date. */
  committed: number
  /** What this project currently rents from the company. */
  chosen: number
}

/** Per item: the venue covers whatever is not rented; the planner picks how many to rent from each company. */
export default function SourcingCell({
  projectId, itemId, used, venueStock, options, editable, hasEventDate,
}: {
  projectId: string; itemId: string; used: number; venueStock: number
  options: SourceOption[]; editable: boolean; hasEventDate: boolean
}) {
  const t = useTranslations('Summary')
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(options.map((o) => [o.companyId, o.chosen])))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const rented = Object.values(values).reduce((a, b) => a + b, 0)
  const fromVenue = Math.max(0, used - rented)
  const stillShort = Math.max(0, fromVenue - venueStock)

  const save = (o: SourceOption, raw: string) => {
    const qty = Math.max(0, Math.floor(Number(raw) || 0))
    setError(null)
    setValues((v) => ({ ...v, [o.companyId]: qty }))
    startTransition(async () => {
      const r = await setItemSource(projectId, itemId, o.companyId, qty)
      if (r.error) {
        setError(r.error)
        setValues((v) => ({ ...v, [o.companyId]: o.chosen }))
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-600">
        {t('fromVenue', { count: fromVenue })}
        {stillShort > 0 && <span className="ml-1 font-medium text-amber-700">{t('short', { count: stillShort })}</span>}
      </p>
      {options.length === 0 ? (
        stillShort > 0 && <p className="text-xs text-red-500">{t('noRentalStock')}</p>
      ) : (
        options.map((o) => {
          const available = Math.max(0, o.stock - o.committed)
          const cap = available
          return (
            <div key={o.companyId} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-[7rem] text-gray-900">{o.companyName}</span>
              {editable ? (
                <input
                  type="number" min={0} max={cap} value={values[o.companyId] ?? 0}
                  onChange={(e) => setValues((v) => ({ ...v, [o.companyId]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  onBlur={(e) => save(o, e.target.value)}
                  disabled={pending}
                  aria-label={t('rentFrom', { company: o.companyName })}
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-right"
                />
              ) : (
                <span className="font-medium">{values[o.companyId] ?? 0}</span>
              )}
              <span className="text-gray-400">
                {hasEventDate
                  ? t('availableOnDate', { available, stock: o.stock, committed: o.committed })
                  : t('availableNoDate', { stock: o.stock })}
              </span>
            </div>
          )
        })
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
