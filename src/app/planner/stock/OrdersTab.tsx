'use client'

import { useMemo, useState } from 'react'
import type { DbStockItem, DbStockOrder } from '@/types/db'
import { addStockOrder, setStockOrderStatus, deleteStockOrder } from '@/lib/supabase/stockQueries'
import type { ProjectOption } from './StockApp'

type Props = {
  teamId: string
  items: DbStockItem[]
  orders: DbStockOrder[]
  projects: ProjectOption[]
  itemById: Map<string, DbStockItem>
  onChanged: () => void
}

/**
 * A single place for every order the planner places — not limited to
 * On Demand items, per the spec. `item_id` and `project_id` are both
 * optional: a one-off personalized order may have no matching catalogue
 * row at all, and tagging a wedding is the planner's choice per entry.
 * Deliberately no tracking-number field yet — Order Tracking Integration
 * (17TRACK) is v2, built after this core CRUD ships.
 */
export default function OrdersTab({ teamId, items, orders, projects, itemById, onChanged }: Props) {
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p.label])), [projects])

  const [itemId, setItemId] = useState('')
  const [freeText, setFreeText] = useState('')
  const [qty, setQty] = useState('1')
  const [projectId, setProjectId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    const q = Number(qty)
    if (!itemId && !freeText.trim()) return setError('Pick a product or describe a one-off order.')
    if (!Number.isFinite(q) || q <= 0) return setError('Quantity must be a positive number.')

    setIsSaving(true)
    try {
      // A one-off with no catalogue item still needs somewhere to record
      // what it is — there's no free-text column on stock_orders, so a
      // one-off without a matching item goes in as a note-only entry via
      // a temporary catalogue-less item is NOT how this works: item_id
      // stays null and the description lives only in this form, not
      // persisted. Flagging this as a real v1 gap, not a silent choice.
      await addStockOrder({ teamId, itemId: itemId || null, projectId: projectId || null, qty: q })
      setItemId('')
      setFreeText('')
      setQty('1')
      setProjectId('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save order.')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleStatus = async (order: DbStockOrder) => {
    await setStockOrderStatus(order.id, order.status === 'pending' ? 'received' : 'pending')
    onChanged()
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this order?')) return
    await deleteStockOrder(id)
    onChanged()
  }

  const input = 'rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900'

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <p className="text-xs text-gray-500">
          Anything you&apos;ve ordered in — from a catalogue product to a one-off personalized piece. Doesn&apos;t change stock counts.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={itemId}
            onChange={(e) => { setItemId(e.target.value); if (e.target.value) setFreeText('') }}
            className={input}
          >
            <option value="">Catalogue product…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">or</span>
          <input
            value={freeText}
            onChange={(e) => { setFreeText(e.target.value); if (e.target.value) setItemId('') }}
            placeholder="One-off order (not saved — see note below)"
            disabled={!!itemId}
            title="v1 limitation: only tracked as a reminder while filling this form — not persisted without a catalogue product"
            className={`${input} w-56 disabled:bg-gray-50`}
          />
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className={`${input} w-20`} />
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
            <option value="">No wedding tag</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button onClick={submit} disabled={isSaving || (!itemId && !freeText.trim())} className="rounded-lg bg-gray-900 text-white text-sm px-3 py-1.5 disabled:opacity-40 hover:bg-gray-800">
            {isSaving ? 'Saving…' : 'Add order'}
          </button>
        </div>
        {!itemId && freeText.trim() && (
          <p className="text-xs text-amber-600">
            One-off orders with no catalogue product aren&apos;t saved with a description yet — add it as a catalogue item first (mark it On Demand) to keep a real record.
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
        {orders.map((o) => (
          <li key={o.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-gray-900">{o.item_id ? itemById.get(o.item_id)?.name ?? 'Deleted product' : 'One-off order'}</span>
              <span className="text-gray-400 ml-2">×{o.qty}</span>
              {o.project_id && <span className="text-gray-400 ml-2">· {projectById.get(o.project_id) ?? 'project'}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-400">{new Date(o.ordered_at).toLocaleDateString()}</span>
              <button
                onClick={() => toggleStatus(o)}
                className={`text-xs px-2 py-0.5 rounded-full ${o.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {o.status === 'received' ? 'Received' : 'Pending'}
              </button>
              <button onClick={() => remove(o.id)} className="text-gray-300 hover:text-red-500">✕</button>
            </div>
          </li>
        ))}
        {orders.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">No orders logged yet.</li>}
      </ul>
    </div>
  )
}
