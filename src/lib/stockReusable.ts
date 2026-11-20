import type { DbStockItem, DbStockSale } from '@/types/db'

/** A sale of a reusable item whose return has not been confirmed yet. Sales made before the item was flagged reusable are ignored. */
export function isAwaitingReturn(sale: DbStockSale, item: DbStockItem | undefined): boolean {
  if (!item?.reusable || sale.return_confirmed_at) return false
  return !item.reusable_since || new Date(sale.sold_at) >= new Date(item.reusable_since)
}

/** itemId → how many units are out with clients right now (sold, return not yet confirmed). */
export function outNowByItem(items: DbStockItem[], sales: DbStockSale[]): Map<string, number> {
  const itemById = new Map(items.map((i) => [i.id, i]))
  const out = new Map<string, number>()
  for (const s of sales) {
    if (isAwaitingReturn(s, itemById.get(s.item_id))) out.set(s.item_id, (out.get(s.item_id) ?? 0) + s.qty)
  }
  return out
}

/**
 * Revenue minus cost. For a reusable sale, only the items that did NOT come
 * back cost anything; until the return is confirmed the cost is not known, so
 * it counts as 0 (the row says "awaiting return").
 */
export function saleProfit(sale: DbStockSale, item: DbStockItem | undefined): number {
  const revenue = sale.unit_price * sale.qty
  const reusableSale = !!sale.return_confirmed_at || isAwaitingReturn(sale, item)
  if (!reusableSale) return revenue - sale.unit_cost_snapshot * sale.qty
  if (!sale.return_confirmed_at) return revenue
  return revenue - sale.unit_cost_snapshot * (sale.qty - sale.returned_qty)
}
