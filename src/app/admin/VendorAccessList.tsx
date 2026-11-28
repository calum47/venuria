'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { setVendorAccess } from './actions'

export type VendorAccessRow = {
  id: string
  name: string
  /** Logins linked to this company (name — email), if any. */
  logins: string[]
  isVendor: boolean
  hasVendorStock: boolean
}

/**
 * One row per vendor / rental company with two switches:
 *  - Vendor: the Vendor tag (Planner ⇄ Vendor switch and Vendor page).
 *  - Vendor stock: the tables & chairs it rents out (not the team's retail stock, "My stock").
 * Switching off only hides; the data stays and ticking again restores it.
 */
export function VendorAccessList({ rows }: { rows: VendorAccessRow[] }) {
  const t = useTranslations('Admin')
  const [state, setState] = useState(() => new Map(rows.map((r) => [r.id, { isVendor: r.isVendor, hasVendorStock: r.hasVendorStock }])))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const change = async (id: string, patch: Partial<{ isVendor: boolean; hasVendorStock: boolean }>) => {
    const prev = state.get(id)!
    const next = { ...prev, ...patch }
    setError(null)
    setBusy(id)
    setState((m) => new Map(m).set(id, next))
    const res = await setVendorAccess(id, next.isVendor, next.hasVendorStock)
    setBusy(null)
    if (res.error) {
      setState((m) => new Map(m).set(id, prev))
      setError(res.error)
    }
  }

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">{t('vendorAccess')}</h2>
      <p className="text-xs text-gray-400">{t('vendorAccessHelp')}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const s = state.get(r.id)!
          const disabled = busy === r.id
          return (
            <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-400">{r.logins.length > 0 ? r.logins.join(' · ') : t('noLoginLinked')}</p>
              </div>
              <div className="flex items-center gap-5 text-sm text-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.isVendor}
                    disabled={disabled}
                    onChange={(e) => change(r.id, { isVendor: e.target.checked })}
                  />
                  {t('vendorTag')}
                </label>
                <label
                  className={`flex items-center gap-2 ${s.isVendor ? '' : 'opacity-40'}`}
                  title={s.isVendor ? undefined : t('vendorStockNeedsTag')}
                >
                  <input
                    type="checkbox"
                    checked={s.hasVendorStock}
                    disabled={disabled || !s.isVendor}
                    onChange={(e) => change(r.id, { hasVendorStock: e.target.checked })}
                  />
                  {t('vendorStock')}
                </label>
              </div>
            </li>
          )
        })}
        {rows.length === 0 && <li className="py-2 text-sm text-gray-400">{t('noRentalCompaniesYet')}</li>}
      </ul>
    </section>
  )
}
