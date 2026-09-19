'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DbStockGroup, DbStockItem, DbStockPurchase, DbStockSale, DbStockOrder } from '@/types/db'
import {
  getStockGroups,
  getStockItems,
  getStockPurchases,
  getStockSales,
  getStockOrders,
} from '@/lib/supabase/stockQueries'
import CatalogueTab from './CatalogueTab'
import PurchasesTab from './PurchasesTab'
import SalesTab from './SalesTab'
import OrdersTab from './OrdersTab'

export type ProjectOption = { id: string; label: string }

type Props = {
  teamId: string
  currency: string
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
export default function StockApp({ teamId, currency, projects }: Props) {
  const [tab, setTab] = useState<Tab>('catalogue')
  const [groups, setGroups] = useState<DbStockGroup[]>([])
  const [items, setItems] = useState<DbStockItem[]>([])
  const [purchases, setPurchases] = useState<DbStockPurchase[]>([])
  const [sales, setSales] = useState<DbStockSale[]>([])
  const [orders, setOrders] = useState<DbStockOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reloadItems = async () => setItems(await getStockItems())
  const reloadGroups = async () => setGroups(await getStockGroups())
  const reloadPurchases = async () => setPurchases(await getStockPurchases())
  const reloadSales = async () => setSales(await getStockSales())
  const reloadOrders = async () => setOrders(await getStockOrders())

  useEffect(() => {
    let cancelled = false
    Promise.all([getStockGroups(), getStockItems(), getStockPurchases(), getStockSales(), getStockOrders()])
      .then(([g, i, p, s, o]) => {
        if (cancelled) return
        setGroups(g)
        setItems(i)
        setPurchases(p)
        setSales(s)
        setOrders(o)
      })
      .catch((err) => !cancelled && setError(err.message ?? 'Failed to load stock.'))
      .finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [])

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const stats = useMemo(() => {
    const trackable = items.filter((i) => !i.on_demand)
    const lowStock = trackable.filter((i) => i.current_stock <= i.min_stock_alert)
    const costValue = trackable.reduce((sum, i) => sum + i.current_stock * i.cost_price, 0)
    const sellValue = trackable.reduce((sum, i) => sum + i.current_stock * i.sell_price, 0)
    return { products: items.length, lowStockCount: lowStock.length, costValue, sellValue }
  }, [items])

  const pendingOrders = orders.filter((o) => o.status === 'pending').length

  if (isLoading) return <p className="text-sm text-gray-400">Loading stock…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Products" value={String(stats.products)} />
        <StatTile label="Stock value (cost)" value={money(stats.costValue, currency)} />
        <StatTile label="Stock value (sell)" value={money(stats.sellValue, currency)} />
        <StatTile
          label="Low stock"
          value={String(stats.lowStockCount)}
          tone={stats.lowStockCount > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            ['catalogue', 'Catalogue'],
            ['purchases', 'Purchases'],
            ['sales', 'Sales'],
            ['orders', `Orders${pendingOrders > 0 ? ` (${pendingOrders})` : ''}`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-gray-900 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'
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
          onItemsChanged={reloadItems}
          onGroupsChanged={reloadGroups}
        />
      )}
      {tab === 'purchases' && (
        <PurchasesTab
          items={items}
          purchases={purchases}
          projects={projects}
          onChanged={() => { reloadPurchases(); reloadItems() }}
        />
      )}
      {tab === 'sales' && (
        <SalesTab
          items={items}
          sales={sales}
          projects={projects}
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
          itemById={itemById}
          onChanged={reloadOrders}
        />
      )}
    </div>
  )
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
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
