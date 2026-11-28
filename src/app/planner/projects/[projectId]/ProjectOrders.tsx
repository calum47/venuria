'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DbStockOrder } from '@/types/db'
import { addStockOrder, getProjectStockOrders } from '@/lib/supabase/stockQueries'

type Item = { id: string; name: string }

const input = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900'

/**
 * My Stock orders tagged to this project. Shows the list and lets any planner on the team add an
 * order that is already tagged to the project. Changing status or deleting stays in My Stock
 * (managers and leads only, enforced by the database). Only catalogue products can be ordered here:
 * a one-off order has nowhere to store its description yet (open item in the Stock spec).
 */
export default function ProjectOrders({
  projectId,
  teamId,
  items,
  initialOrders,
}: {
  projectId: string
  teamId: string
  items: Item[]
  initialOrders: DbStockOrder[]
}) {
  const [orders, setOrders] = useState(initialOrders)
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameById = new Map(items.map((i) => [i.id, i.name]))

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const q = Number(qty)
    if (!itemId) return setError('Pick a product.')
    if (!Number.isInteger(q) || q <= 0) return setError('Quantity must be a whole number above zero.')
    setBusy(true)
    try {
      await addStockOrder({ teamId, itemId, projectId, qty: q })
      setOrders(await getProjectStockOrders(projectId))
      setItemId('')
      setQty('1')
    } catch (err) {
      setError(err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Could not add the order.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="orders-h">
      <div className="flex items-baseline justify-between">
        <h2 id="orders-h" className="text-xl font-medium text-gray-900">Stock orders for this project</h2>
        <Link href="/planner/stock" className="text-xs text-gray-500 underline hover:text-gray-900">Open My Stock</Link>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={input} aria-label="Product">
          <option value="">{items.length ? 'Product…' : 'No products in My Stock yet'}</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={input + ' w-20'} aria-label="Quantity" />
        <button type="submit" disabled={busy || !itemId} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Adding…' : 'Add order'}
        </button>
      </form>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">No stock orders yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-900">
                {o.item_id ? nameById.get(o.item_id) ?? 'Deleted product' : 'One-off order'}
                <span className="ml-2 text-gray-400">×{o.qty}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-gray-400">{new Date(o.ordered_at).toLocaleDateString()}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${o.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {o.status === 'received' ? 'Received' : 'Pending'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
