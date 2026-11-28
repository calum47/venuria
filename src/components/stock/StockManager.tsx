'use client'

import { useEffect, useState } from 'react'
import { DbCatalogItem } from '@/types/db'
import { getMasterCatalogItems, getStock, upsertStockQuantity } from '@/lib/supabase/queries'
import { STOCK_TRACKED_CATEGORIES } from '@/lib/tableSetting'
import { useTranslations } from 'next-intl'
import { categoryLabel } from '@/lib/categories'

const STOCK_CATEGORIES = STOCK_TRACKED_CATEGORIES

type Props = {
  ownerType: 'venue' | 'rental_company'
  ownerId: string
}

/** Which groups are collapsed is remembered per owner in this browser (localStorage), so a group closed stays closed. */
const collapsedKey = (ownerType: string, ownerId: string) => `venuria:stock-collapsed:${ownerType}:${ownerId}`

function readCollapsed(key: string): Record<string, boolean> {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export default function StockManager({ ownerType, ownerId }: Props) {
  const t = useTranslations('Stock')
  const tc = useTranslations('Common')
  const tcat = useTranslations('Categories')
  const storageKey = collapsedKey(ownerType, ownerId)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => readCollapsed(storageKey))
  const toggleGroup = (category: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [category]: !prev[category] }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Storage can be blocked (private mode): the group still toggles, it just is not remembered.
      }
      return next
    })
  }
  const [items, setItems] = useState<DbCatalogItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [savedQuantities, setSavedQuantities] = useState<Record<string, number>>({})
  // Keyed by ownerId so a stale in-flight load (e.g. from a fast owner switch)
  // can't overwrite state for the wrong owner — same "derive, don't reset"
  // approach as FloorPlanCanvas/FloorPlanEditor's image-loading effects, so
  // there's no synchronous setState at the top of the effect body.
  const [loadedForOwnerId, setLoadedForOwnerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const loading = loadedForOwnerId !== ownerId

  useEffect(() => {
    let cancelled = false
    Promise.all([getMasterCatalogItems(STOCK_CATEGORIES), getStock(ownerType, ownerId)])
      .then(([masterItems, stock]) => {
        if (cancelled) return
        const stockMap: Record<string, number> = {}
        for (const row of stock) stockMap[row.catalog_item_id] = row.quantity
        setItems(masterItems)
        setQuantities(stockMap)
        setSavedQuantities(stockMap)
        setLoadedForOwnerId(ownerId)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('failedToLoadStock'))
      })
    return () => {
      cancelled = true
    }
  }, [ownerType, ownerId, t])

  const handleSave = async (catalogItemId: string) => {
    const quantity = quantities[catalogItemId] ?? 0
    setSaving(catalogItemId)
    setError(null)
    try {
      await upsertStockQuantity(catalogItemId, ownerType, ownerId, quantity)
      setSavedQuantities((prev) => ({ ...prev, [catalogItemId]: quantity }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">{t('loadingStock')}</p>

  const byCategory = STOCK_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => i.category === category),
  }))

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {byCategory.map(({ category, items: categoryItems }) => (
        <div key={category}>
          <button
            type="button"
            onClick={() => toggleGroup(category)}
            aria-expanded={!collapsed[category]}
            className="mb-1 flex w-full items-center gap-2 text-left text-xs font-semibold uppercase text-gray-500 hover:text-gray-800"
          >
            <span aria-hidden="true" className={`inline-block w-3 transition-transform ${collapsed[category] ? '' : 'rotate-90'}`}>▸</span>
            {categoryLabel(tcat, category)}
            <span className="font-normal normal-case text-gray-400">
              {t('inStock', { count: categoryItems.reduce((sum, i) => sum + (savedQuantities[i.id] ?? 0), 0) })}
            </span>
          </button>
          {!collapsed[category] && (
          <ul className="divide-y divide-gray-100 bg-white rounded-lg border border-gray-100">
            {categoryItems.map((item) => {
              const dirty = quantities[item.id] !== savedQuantities[item.id]
              return (
                <li key={item.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="text-gray-900">{item.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">
                      {item.width_cm}×{item.depth_cm}×{item.height_cm}cm
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor={`qty-${item.id}`} className="text-[11px] text-gray-500">{t('quantity')}</label>
                    <input
                      id={`qty-${item.id}`}
                      type="number"
                      min={0}
                      value={quantities[item.id] ?? 0}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-16 rounded-lg border bg-white px-2 py-1 text-sm text-gray-900"
                    />
                    <button
                      onClick={() => handleSave(item.id)}
                      disabled={!dirty || saving === item.id}
                      className="rounded-lg bg-brand-600 px-2 py-1 text-xs text-white disabled:opacity-30"
                    >
                      {saving === item.id ? tc('saving') : tc('save')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          )}
        </div>
      ))}
    </div>
  )
}
