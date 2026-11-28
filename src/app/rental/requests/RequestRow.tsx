'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { respondToRequest } from './actions'

export type RequestItem = {
  projectId: string
  itemId: string
  itemName: string
  projectTitle: string
  eventDate: string | null
  requested: number
  granted: number
  status: 'pending' | 'accepted' | 'declined'
  stock: number
  /** Promised to other events on the same date. */
  bookedElsewhere: number
}

export default function RequestRow({ r }: { r: RequestItem }) {
  const t = useTranslations('VendorRequests')
  const [qty, setQty] = useState(r.status === 'accepted' ? r.granted : r.requested)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const free = Math.max(0, r.stock - r.bookedElsewhere)
  const overFree = qty > free

  const answer = (n: number) => {
    setError(null)
    startTransition(async () => {
      const res = await respondToRequest(r.projectId, r.itemId, n)
      if (res.error) setError(res.error)
    })
  }

  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-gray-900">
          <span className="font-medium">{r.requested} × {r.itemName}</span>
          <span className="ml-2 text-gray-500">{r.projectTitle}{r.eventDate ? ` · ${r.eventDate}` : ''}</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            r.status === 'accepted' ? 'bg-green-100 text-green-800' : r.status === 'declined' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {r.status === 'pending' && t('statusPending')}
          {r.status === 'accepted' && (r.granted < r.requested ? t('statusAcceptedPart', { granted: r.granted, asked: r.requested }) : t('statusAccepted'))}
          {r.status === 'declined' && t('statusDeclined')}
        </span>
      </div>
      <p className="text-xs text-gray-400">{r.eventDate ? t('availability', { stock: r.stock, booked: r.bookedElsewhere, free }) : t('noDate', { stock: r.stock })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number" min={1} max={r.requested} value={qty}
          onChange={(e) => setQty(Math.min(r.requested, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
          aria-label={t('quantityToAccept')} disabled={pending}
          className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
        />
        <button
          type="button" disabled={pending || qty < 1}
          onClick={() => answer(qty)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {qty >= r.requested ? t('accept') : t('acceptPart', { count: qty, asked: r.requested })}
        </button>
        <button
          type="button" disabled={pending}
          onClick={() => answer(0)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {t('decline')}
        </button>
        {overFree && <span className="text-xs text-amber-700">{t('overFree', { free })}</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  )
}
