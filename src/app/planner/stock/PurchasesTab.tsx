'use client'

import { useMemo, useState } from 'react'
import type { DbStockItem, DbStockPurchase } from '@/types/db'
import { addStockPurchase, deleteStockPurchase } from '@/lib/supabase/stockQueries'
import type { ProjectOption } from './StockApp'

type Props = {
  items: DbStockItem[]
  purchases: DbStockPurchase[]
  projects: ProjectOption[]
  onChanged: () => void
}

/** On Demand items are excluded from the item picker — they don't carry stock, so a purchase against one is rejected by the DB anyway (see migration 013). */
export default function PurchasesTab({ items, purchases, projects, onChanged }: Props) {
  const purchasable = useMemo(() => items.filter((i) => !i.on_demand), [items])
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p.label])), [projects])

  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [supplier, setSupplier] = useState('')
  const [projectId, setProjectId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    const q = Number(qty)
    const cost = Number(unitCost)
    if (!itemId) return setError('Pick a product.')
    if (!Number.isFinite(q) || q <= 0) return setError('Quantity must be a positive number.')
    if (!Number.isFinite(cost) || cost < 0) return setError('Unit cost must be a number.')

    setIsSaving(true)
    try {
      await addStockPurchase({ itemId, qty: q, unitCost: cost, supplier: supplier.trim() || null, projectId: projectId || null })
      setQty('1')
      setUnitCost('')
      setSupplier('')
      setProjectId('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase.')
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this purchase? Stock will be adjusted back down.')) return
    await deleteStockPurchase(id)
    onChanged()
  }

  const input = 'rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900'

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <p className="text-xs text-gray-500">Log stock bought for inventory — increases the item&apos;s stock count.</p>
        <div className="flex flex-wrap items-end gap-2">
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={input}>
            <option value="">Product…</option>
            {purchasable.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className={`${input} w-20`} />
          <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Unit cost" className={`${input} w-28`} />
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier (optional)" className={`${input} w-40`} />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
            <option value="">No wedding tag</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button onClick={submit} disabled={isSaving} className="rounded-lg bg-gray-900 text-white text-sm px-3 py-1.5 disabled:opacity-40 hover:bg-gray-800">
            {isSaving ? 'Saving…' : 'Add purchase'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
        {purchases.map((p) => (
          <li key={p.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-gray-900">{itemById.get(p.item_id)?.name ?? 'Deleted product'}</span>
              <span className="text-gray-400 ml-2">×{p.qty} @ {p.unit_cost}</span>
              {p.supplier && <span className="text-gray-400 ml-2">· {p.supplier}</span>}
              {p.project_id && <span className="text-gray-400 ml-2">· {projectById.get(p.project_id) ?? 'project'}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-400">{new Date(p.purchased_at).toLocaleDateString()}</span>
              <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-red-500">✕</button>
            </div>
          </li>
        ))}
        {purchases.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">No purchases logged yet.</li>}
      </ul>
    </div>
  )
}
