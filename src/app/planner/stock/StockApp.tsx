'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DbStockGroup, DbStockItem, DbStockPurchase, DbStockSale, DbStockOrder } from '@/types/db'
import {
  getStockGroups,
  getStockItems,
  getStockPurchases,
  getStockSales,
  getStockOrders,
  getStockItemTotals,
  type StockItemTotals,
} from '@/lib/supabase/stockQueries'
import CatalogueTab from './CatalogueTab'
import PurchasesTab from './PurchasesTab'
import SalesTab from './SalesTab'
import OrdersTab from './OrdersTab'

export type ProjectOption = { id: string; label: string }

type Props = {
  teamId: string
  currency: string
  /** Manager or lead. Members get the reduced set of actions (see migration 017). */
  canManage: boolean
  projects: ProjectOption[]
}

type Tab = 'catalogue' | 'purchases' | 'sales' | 'orders'

/**
 * Loads everything once at the top and passes it down, rather than each tab
 * fetching its own slice — the stat tiles need items+groups regardless of
 * which tab is open, and Purchases/Sales/Orders all need the item list for
 * their "which item" pickers, so a shared cache avoids re-fetching it four
 * times as the planner switches tabs.
 */
export default function StockApp({ teamId, currency, canManage, projects }: Props) {
  const [tab, setTab] = useState<Tab>('catalogue')
  const [groups, setGroups] = useState<DbStockGroup[]>([])
  const [items, setItems] = useState<DbStockItem[]>([])
  const [purchases, setPurchases] = useState<DbStockPurchase[]>([])
  const [sales, setSales] = useState<DbStockSale[]>([])
  const [orders, setOrders] = useState<DbStockOrder[]>([])
  const [totals, setTotals] = useState<StockItemTotals[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Items and the sales totals move together: any sale, return, purchase or edit can change both.
  const reloadItems = async () => {
    const [i, t] = await Promise.all([getStockItems(), getStockItemTotals()])
    setItems(i)
    setTotals(t)
  }
  const reloadGroups = async () => setGroups(await getStockGroups())
  const reloadPurchases = async () => setPurchases(await getStockPurchases())
  const reloadSales = async () => setSales(await getStockSales())
  const reloadOrders = async () => setOrders(await getStockOrders())

  useEffect(() => {
    let cancelled = false
    Promise.all([getStockGroups(), getStockItems(), getStockPurchases(), getStockSales(), getStockOrders(), getStockItemTotals()])
      .then(([g, i, p, s, o, t]) => {
        if (cancelled) return
        setGroups(g)
        setItems(i)
        setPurchases(p)
        setSales(s)
        setOrders(o)
        setTotals(t)
      })
      .catch((err) => !cancelled && setError(err.message ?? 'Failed to load stock.'))
      .finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [])

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const outByItem = useMemo(() => new Map(totals.filter((t) => t.units_out > 0).map((t) => [t.item_id, t.units_out])), [totals])
  const soldByItem = useMemo(() => new Map(totals.map((t) => [t.item_id, t.units_sold])), [totals])
  const stats = useMemo(() => {
    const trackable = items.filter((i) => !i.on_demand)
    const lowStock = trackable.filter((i) => i.current_stock <= i.min_stock_alert)
    // Units of a reusable product out with clients are still owned, so they count in what the stock cost.
    const costValue = trackable.reduce((sum, i) => sum + (i.current_stock + (outByItem.get(i.id) ?? 0)) * i.cost_price, 0)
    const profit = totals.reduce((sum, t) => sum + t.profit, 0)
    const outTotal = totals.reduce((sum, t) => sum + t.units_out, 0)
    return { lowStockCount: lowStock.length, costValue, profit, outTotal, hasReusable: items.some((i) => i.reusable) }
  }, [items, totals, outByItem])

  const pendingOrders = orders.filter((o) => o.status === 'pending').length

  if (isLoading) return <p className="text-sm text-gray-400">Loading stock…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {canManage && <StatTile label="Stock cost" hint="What the stock you own cost, at average cost" value={money(stats.costValue, currency)} />}
        {canManage && <StatTile label="Profit to date" hint="Everything sold, all time" value={money(stats.profit, currency)} />}
        <StatTile
          label="Low stock"
          value={String(stats.lowStockCount)}
          tone={stats.lowStockCount > 0 ? 'warn' : undefined}
        />
        {stats.hasReusable && <StatTile label="Out with clients" hint="Reusable units not yet returned" value={String(stats.outTotal)} />}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            ['catalogue', 'Catalogue'],
            ['purchases', 'Purchases'],
            ['sales', 'Sales'],
            ['orders', `Orders${pendingOrders > 0 ? ` (${pendingOrders})` : ''}`],
          ] as [Tab, string][]
        )
          // Purchases carry unit costs, which Members must not see (migration 036).
          .filter(([t]) => canManage || t !== 'purchases')
          .map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-brand-600 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'catalogue' && (
        <CatalogueTab
          teamId={teamId}
          currency={currency}
          items={items}
          groups={groups}
          canManage={canManage}
          outByItem={outByItem}
          soldByItem={soldByItem}
          onItemsChanged={reloadItems}
          onGroupsChanged={reloadGroups}
        />
      )}
      {tab === 'purchases' && (
        <PurchasesTab
          items={items}
          purchases={purchases}
          projects={projects}
          canManage={canManage}
          onChanged={() => { reloadPurchases(); reloadItems() }}
        />
      )}
      {tab === 'sales' && (
        <SalesTab
          items={items}
          sales={sales}
          projects={projects}
          canManage={canManage}
          currency={currency}
          onChanged={() => { reloadSales(); reloadItems() }}
        />
      )}
      {tab === 'orders' && (
        <OrdersTab
          teamId={teamId}
          items={items}
          orders={orders}
          projects={projects}
          canManage={canManage}
          itemById={itemById}
          onChanged={reloadOrders}
        />
      )}
    </div>
  )
}

function StatTile({ label, value, tone, hint }: { label: string; value: string; tone?: 'warn'; hint?: string }) {
  return (
    <div title={hint} className={`rounded-xl border p-3 ${tone === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}
