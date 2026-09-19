'use client'

import { useMemo, useState } from 'react'
import type { DbStockItem, DbStockSale } from '@/types/db'
import { addStockSale, deleteStockSale } from '@/lib/supabase/stockQueries'
import type { ProjectOption } from './StockApp'
import { money } from './StockApp'

type Props = {
  items: DbStockItem[]
  sales: DbStockSale[]
  projects: ProjectOption[]
  currency: string
  onChanged: () => void
}

export default function SalesTab({ items, sales, projects, currency, onChanged }: Props) {
  const sellable = useMemo(() => items.filter((i) => !i.on_demand), [items])
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p.label])), [projects])

  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [projectId, setProjectId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefilling sell price from the item's current price when picked, but
  // still editable — a planner may sell at a discount.
  const onPickItem = (id: string) => {
    setItemId(id)
    const item = itemById.get(id)
    if (item) setUnitPrice(String(item.sell_price))
  }

  const submit = async () => {
    setError(null)
    const q = Number(qty)
    const price = Number(unitPrice)
    const item = itemById.get(itemId)
    if (!item) return setError('Pick a product.')
    if (!Number.isFinite(q) || q <= 0) return setError('Quantity must be a positive number.')
    if (!Number.isFinite(price) || price < 0) return setError('Sale price must be a number.')

    setIsSaving(true)
    try {
      await addStockSale({
        itemId,
        qty: q,
        unitPrice: price,
        unitCostSnapshot: item.cost_price, // captured now, per spec, so later cost changes don't rewrite historical margin
        projectId: projectId || null,
      })
      setQty('1')
      setUnitPrice('')
      setProjectId('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sale.')
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this sale? Stock will be added back.')) return
    await deleteStockSale(id)
    onChanged()
  }

  const input = 'rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900'

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <p className="text-xs text-gray-500">Log stock sold to a client — decreases the item&apos;s stock count.</p>
        <div className="flex flex-wrap items-end gap-2">
          <select value={itemId} onChange={(e) => onPickItem(e.target.value)} className={input}>
            <option value="">Product…</option>
            {sellable.map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.current_stock} in stock)</option>
            ))}
          </select>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className={`${input} w-20`} />
          <input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Sale price" className={`${input} w-28`} />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
            <option value="">Which wedding?</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button onClick={submit} disabled={isSaving} className="rounded-lg bg-gray-900 text-white text-sm px-3 py-1.5 disabled:opacity-40 hover:bg-gray-800">
            {isSaving ? 'Saving…' : 'Add sale'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
        {sales.map((s) => {
          const profit = (s.unit_price - s.unit_cost_snapshot) * s.qty
          return (
            <li key={s.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-gray-900">{itemById.get(s.item_id)?.name ?? 'Deleted product'}</span>
                <span className="text-gray-400 ml-2">×{s.qty} @ {money(s.unit_price, currency)}</span>
                <span className={`ml-2 ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{money(profit, currency)} profit</span>
                {s.project_id && <span className="text-gray-400 ml-2">· {projectById.get(s.project_id) ?? 'project'}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{new Date(s.sold_at).toLocaleDateString()}</span>
                <button onClick={() => remove(s.id)} className="text-gray-300 hover:text-red-500">✕</button>
              </div>
            </li>
          )
        })}
        {sales.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">No sales logged yet.</li>}
      </ul>
    </div>
  )
}
