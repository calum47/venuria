'use client'

import { useEffect, useState } from 'react'
import { DbCatalogItem } from '@/types/db'
import { getMasterCatalogItems, getStock, upsertStockQuantity } from '@/lib/supabase/queries'

const STOCK_CATEGORIES = ['tables', 'chairs']

type Props = {
  ownerType: 'venue' | 'rental_company'
  ownerId: string
}

export default function StockManager({ ownerType, ownerId }: Props) {
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stock.')
      })
    return () => {
      cancelled = true
    }
  }, [ownerType, ownerId])

  const handleSave = async (catalogItemId: string) => {
    const quantity = quantities[catalogItemId] ?? 0
    setSaving(catalogItemId)
    setError(null)
    try {
      await upsertStockQuantity(catalogItemId, ownerType, ownerId, quantity)
      setSavedQuantities((prev) => ({ ...prev, [catalogItemId]: quantity }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading stock…</p>

  const byCategory = STOCK_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => i.category === category),
  }))

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {byCategory.map(({ category, items: categoryItems }) => (
        <div key={category}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">{category}</h4>
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
                    <input
                      type="number"
                      min={0}
                      value={quantities[item.id] ?? 0}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [item.id]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="w-16 rounded border bg-white px-2 py-1 text-sm text-gray-900"
                    />
                    <button
                      onClick={() => handleSave(item.id)}
                      disabled={!dirty || saving === item.id}
                      className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-30"
                    >
                      {saving === item.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
