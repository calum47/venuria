'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addProjectVendor, removeProjectVendor } from '@/app/planner/projectVendorActions'

export type VendorOption = { id: string; name: string }

/**
 * "Vendors on this project" (project hub). Adding a vendor lets that vendor's logins look at the
 * project, read-only: materials, 2D map, timetable and run-down. Never guests, payments or documents.
 */
export default function ProjectVendors({
  projectId,
  options,
  addedIds,
}: {
  projectId: string
  options: VendorOption[]
  addedIds: string[]
}) {
  const t = useTranslations('ProjectVendors')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const [pending, startTransition] = useTransition()

  const added = options.filter((o) => addedIds.includes(o.id))
  const available = options.filter((o) => !addedIds.includes(o.id))

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3" aria-labelledby="pv-h">
      <div>
        <h2 id="pv-h" className="text-xl font-medium text-gray-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('help')}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {added.length === 0 ? (
        <p className="text-sm text-gray-400">{t('none')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {added.map((v) => (
            <li key={v.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-900">{v.name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeProjectVendor(projectId, v.id))}
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="flex items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label={t('choose')}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">{t('choose')}</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !pick}
            onClick={() => { const id = pick; setPick(''); run(() => addProjectVendor(projectId, id)) }}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {t('add')}
          </button>
        </div>
      ) : options.length === 0 ? (
        <p className="text-xs text-gray-400">{t('noVendorsExist')}</p>
      ) : null}
    </section>
  )
}
