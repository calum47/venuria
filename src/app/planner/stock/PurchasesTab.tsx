'use client'

import { useMemo, useState } from 'react'
import type { DbStockItem, DbStockPurchase } from '@/types/db'
import { addStockPurchase, deleteStockPurchase } from '@/lib/supabase/stockQueries'
import type { ProjectOption } from './StockApp'
import { Labelled } from '@/components/Labelled'
import { useTranslations } from 'next-intl'

type Props = {
  items: DbStockItem[]
  purchases: DbStockPurchase[]
  projects: ProjectOption[]
  canManage: boolean
  onChanged: () => void
}

/** On Demand items are excluded from the item picker — they don't carry stock, so a purchase against one is rejected by the DB anyway (see migration 013). */
export default function PurchasesTab({ items, purchases, projects, canManage, onChanged }: Props) {
  const t = useTranslations('Stock')
  const tc = useTranslations('Common')
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
    if (!itemId) return setError(t('pickAProduct'))
    if (!Number.isFinite(q) || q <= 0) return setError(t('quantityMustBeAPositive'))
    if (!Number.isFinite(cost) || cost < 0) return setError(t('unitCostMustBeA'))

    setIsSaving(true)
    try {
      await addStockPurchase({ itemId, qty: q, unitCost: cost, supplier: supplier.trim() || null, projectId: projectId || null })
      setQty('1')
      setUnitCost('')
      setSupplier('')
      setProjectId('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSavePurchase'))
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm(t('removeThisPurchaseStockWill'))) return
    await deleteStockPurchase(id)
    onChanged()
  }

  const input = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900'

  return (
    <div className="space-y-4">
      {canManage ? <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <p className="text-xs text-gray-500">{t('logStockBoughtForInventory')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Labelled label={t('product')}>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={input}>
              <option value="">{t('chooseAProduct')}</option>
              {purchasable.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </Labelled>
          <Labelled label={t('quantity')}>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} w-20`} />
          </Labelled>
          <Labelled label={t('unitCost')}>
            <input type="number" step="0.0001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={`${input} w-28`} />
          </Labelled>
          <Labelled label={t('vendorSupplierOptional')}>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${input} w-48`} />
          </Labelled>
          <Labelled label={t('wedding')}>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
              <option value="">{t('noWeddingTag')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Labelled>
          <button onClick={submit} disabled={isSaving} className="rounded-lg bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40 hover:bg-brand-700">
            {isSaving ? tc('saving') : t('addPurchase')}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div> : <p className="text-xs text-gray-400">{t('viewOnlyManagersAndLeads2')}</p>}

      <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
        {purchases.map((p) => (
          <li key={p.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-gray-900">{itemById.get(p.item_id)?.name ?? t('deletedProduct')}</span>
              <span className="text-gray-400 ml-2">×{p.qty} @ {p.unit_cost}</span>
              {p.supplier && <span className="text-gray-400 ml-2">· {p.supplier}</span>}
              {p.project_id && <span className="text-gray-400 ml-2">· {projectById.get(p.project_id) ?? 'project'}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-400">{new Date(p.purchased_at).toLocaleDateString()}</span>
              {canManage && <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-red-500">✕</button>}
            </div>
          </li>
        ))}
        {purchases.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">{t('noPurchasesLoggedYet')}</li>}
      </ul>
    </div>
  )
}
