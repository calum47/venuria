'use client'

import { useMemo, useState } from 'react'
import type { DbStockItem, DbStockSale } from '@/types/db'
import { addStockSale, confirmSaleReturn, deleteStockSale } from '@/lib/supabase/stockQueries'
import { isAwaitingReturn, saleProfit } from '@/lib/stockReusable'
import type { ProjectOption } from './StockApp'
import { money } from './StockApp'
import { Labelled } from '@/components/Labelled'
import { useTranslations } from 'next-intl'

type Props = {
  items: DbStockItem[]
  sales: DbStockSale[]
  projects: ProjectOption[]
  canManage: boolean
  currency: string
  onChanged: () => void
}

export default function SalesTab({ items, sales, projects, canManage, currency, onChanged }: Props) {
  const t = useTranslations('Stock')
  const tc = useTranslations('Common')
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
    // Members never see prices; the database prices their sale from the catalogue.
    if (item && canManage) setUnitPrice(String(item.sell_price))
  }

  const submit = async () => {
    setError(null)
    const q = Number(qty)
    const price = Number(unitPrice)
    const item = itemById.get(itemId)
    if (!item) return setError(t('pickAProduct'))
    // Members can only record items used on a wedding (enforced by the database too).
    if (!canManage && !projectId) return setError(t('pickTheWeddingTheseItems'))
    if (!Number.isFinite(q) || q <= 0) return setError(t('quantityMustBeAPositive'))
    if (canManage && (!Number.isFinite(price) || price < 0)) return setError(t('salePriceMustBeA'))

    setIsSaving(true)
    try {
      await addStockSale({
        itemId,
        qty: q,
        // The database re-takes the cost snapshot from the item's current average cost (migration 036),
        // and for a Member also the price, so those two values only matter for managers and leads.
        unitPrice: canManage ? price : 0,
        unitCostSnapshot: canManage ? item.cost_price : 0,
        projectId: projectId || null,
      })
      setQty('1')
      setUnitPrice('')
      setProjectId('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSaveSale'))
    } finally {
      setIsSaving(false)
    }
  }

  const confirmReturn = async (id: string, qty: number) => {
    setError(null)
    const n = Number(returnedQty)
    if (!Number.isInteger(n) || n < 0 || n > qty) return setError(t('returnedMustBeAWhole', { qty: qty }))
    try {
      await confirmSaleReturn(id, n)
      setConfirmingId(null)
      setReturnedQty('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToConfirmTheReturn'))
    }
  }

  const remove = async (id: string) => {
    if (!confirm(t('removeThisSaleStockWill'))) return
    await deleteStockSale(id)
    onChanged()
  }

  const input = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900'

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <p className="text-xs text-gray-500">{canManage ? t('logStockSoldToA') : t('recordItemsUsedOnA')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Labelled label={t('product')}>
            <select value={itemId} onChange={(e) => onPickItem(e.target.value)} className={input}>
              <option value="">{t('chooseAProduct')}</option>
              {sellable.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.current_stock} in stock)</option>
              ))}
            </select>
          </Labelled>
          <Labelled label={t('quantity')}>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} w-20`} />
          </Labelled>
          {canManage && (
            <Labelled label={t('salePrice')}>
              <input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={`${input} w-28`} />
            </Labelled>
          )}
          <Labelled label={canManage ? 'Wedding' : t('weddingRequired')}>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
              <option value="">{canManage ? t('noWedding') : t('chooseAWedding')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Labelled>
          <button onClick={submit} disabled={isSaving} className="rounded-lg bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40 hover:bg-brand-700">
            {isSaving ? tc('saving') : t('addSale')}
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
                <span className="text-gray-900">{itemById.get(s.item_id)?.name ?? t('deletedProduct')}</span>
                <span className="text-gray-400 ml-2">×{s.qty}{canManage ? ` @ ${money(s.unit_price, currency)}` : ''}</span>
                {canManage && <span className={`ml-2 ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{money(profit, currency)} profit{awaiting ? ' so far' : ''}</span>}
                {s.project_id && <span className="text-gray-400 ml-2">· {projectById.get(s.project_id) ?? t('projectFallback')}</span>}
                {s.return_confirmed_at && (
                  <span className="text-indigo-600 ml-2">
                    {t('returnedSummary', { returned: s.returned_qty, qty: s.qty })}{s.returned_qty < s.qty ? t('lostSuffix', { count: s.qty - s.returned_qty }) : ''}
                  </span>
                )}
                {awaiting && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-amber-700">{t('awaitingReturn')}</span>
                    {canManage && confirmingId !== s.id && (
                      <button onClick={() => { setConfirmingId(s.id); setReturnedQty(String(s.qty)) }} className="text-indigo-600 hover:underline">
                        {t('confirmReturn')}
                      </button>
                    )}
                    {canManage && confirmingId === s.id && (
                      <>
                        <Labelled label={t('cameBack')}><input type="number" min="0" max={s.qty} value={returnedQty} onChange={(e) => setReturnedQty(e.target.value)} className={`${input} w-20 py-0.5`} /></Labelled>
                        <span className="text-gray-400">{t('ofCameBack', { qty: s.qty })}</span>
                        <button onClick={() => confirmReturn(s.id, s.qty)} className="rounded-lg bg-brand-600 text-white px-2 py-0.5">{tc('save')}</button>
                        <button onClick={() => setConfirmingId(null)} className="text-gray-400">{tc('cancel')}</button>
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
        {sales.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">{t('noSalesLoggedYet')}</li>}
      </ul>
    </div>
  )
}
