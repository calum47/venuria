'use client'

import { useMemo, useState } from 'react'
import type { DbStockItem, DbStockSale } from '@/types/db'
import { addStockSale, confirmSaleReturn, deleteStockSale } from '@/lib/supabase/stockQueries'
import { isAwaitingReturn, saleProfit } from '@/lib/stockReusable'
import type { ProjectOption } from './StockApp'
import { money } from './StockApp'

type Props = {
  items: DbStockItem[]
  sales: DbStockSale[]
  projects: ProjectOption[]
  canManage: boolean
  currency: string
  onChanged: () => void
}

export default function SalesTab({ items, sales, projects, canManage, currency, onChanged }: Props) {
  const sellable = useMemo(() => items.filter((i) => !i.on_demand), [items])
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p.label])), [projects])

  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [projectId, setProjectId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [returnedQty, setReturnedQty] = useState('')

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
    // Members can only record items used on a wedding (enforced by the database too).
    if (!canManage && !projectId) return setError('Pick the wedding these items were used on.')
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

  const confirmReturn = async (id: string, qty: number) => {
    setError(null)
    const n = Number(returnedQty)
    if (!Number.isInteger(n) || n < 0 || n > qty) return setError(`Returned must be a whole number from 0 to ${qty}.`)
    try {
      await confirmSaleReturn(id, n)
      setConfirmingId(null)
      setReturnedQty('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm the return.')
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
        <p className="text-xs text-gray-500">{canManage ? 'Log stock sold to a client — decreases the item\'s stock count.' : 'Record items used on a wedding — decreases the item\'s stock count.'}</p>
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
            <option value="">{canManage ? 'Which wedding?' : 'Which wedding? (required)'}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button onClick={submit} disabled={isSaving} className="rounded-lg bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40 hover:bg-brand-700">
            {isSaving ? 'Saving…' : 'Add sale'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
        {sales.map((s) => {
          const item = itemById.get(s.item_id)
          const profit = saleProfit(s, item)
          const awaiting = isAwaitingReturn(s, item)
          return (
            <li key={s.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-gray-900">{itemById.get(s.item_id)?.name ?? 'Deleted product'}</span>
                <span className="text-gray-400 ml-2">×{s.qty} @ {money(s.unit_price, currency)}</span>
                <span className={`ml-2 ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{money(profit, currency)} profit{awaiting ? ' so far' : ''}</span>
                {s.project_id && <span className="text-gray-400 ml-2">· {projectById.get(s.project_id) ?? 'project'}</span>}
                {s.return_confirmed_at && (
                  <span className="text-indigo-600 ml-2">
                    · {s.returned_qty} of {s.qty} came back{s.returned_qty < s.qty ? ` (${s.qty - s.returned_qty} lost)` : ''}
                  </span>
                )}
                {awaiting && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-amber-700">Out with the client, awaiting return</span>
                    {canManage && confirmingId !== s.id && (
                      <button onClick={() => { setConfirmingId(s.id); setReturnedQty(String(s.qty)) }} className="text-indigo-600 hover:underline">
                        Confirm return
                      </button>
                    )}
                    {canManage && confirmingId === s.id && (
                      <>
                        <input type="number" min="0" max={s.qty} value={returnedQty} onChange={(e) => setReturnedQty(e.target.value)} className={`${input} w-20 py-0.5`} />
                        <span className="text-gray-400">of {s.qty} came back</span>
                        <button onClick={() => confirmReturn(s.id, s.qty)} className="rounded bg-brand-600 text-white px-2 py-0.5">Save</button>
                        <button onClick={() => setConfirmingId(null)} className="text-gray-400">Cancel</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{new Date(s.sold_at).toLocaleDateString()}</span>
                {canManage && <button onClick={() => remove(s.id)} className="text-gray-300 hover:text-red-500">✕</button>}
              </div>
            </li>
          )
        })}
        {sales.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">No sales logged yet.</li>}
      </ul>
    </div>
  )
}
