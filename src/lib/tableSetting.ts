import type { LayoutObject, TableSettingItem } from '@/types'
import type { DbCatalogItem } from '@/types/db'

// Table settings (plates, cutlery, glasses, candles, flowers…).
//
// A table carries a snapshot of items. Each catalog item has a scope:
//   per_seat  → quantity × chairs placed at the table
//   per_table → quantity counted once
// Applying a template copies its items onto the table; editing one table later
// never touches the others, and editing a template never changes tables that
// already used it.

/** Categories whose items can go on a table. Existing decorations opt in through their `scope`. */
export const TABLE_SETTING_CATEGORY_ORDER = ['plates', 'cutlery', 'glassware', 'candles', 'flowers', 'decorations']

export const TABLE_SETTING_CATEGORY_LABELS: Record<string, string> = {
  plates: 'Plates',
  cutlery: 'Cutlery',
  glassware: 'Glassware',
  candles: 'Candles',
  flowers: 'Flowers',
  decorations: 'Decorations',
}

/**
 * Tables that "Apply to all tables in this room" skips — the planner sets these
 * one by one. Sweetheart is the couple's table; the cocktail and tall tables are
 * standing tables, so per-seat items would multiply by zero or an unrelated
 * chair count.
 */
const INDIVIDUAL_ONLY_TABLES = ['Sweetheart Table', 'Round Cocktail Table', 'Round Tall Table']

export function isIndividualOnlyTable(catalogItemName: string | undefined): boolean {
  return !!catalogItemName && INDIVIDUAL_ONLY_TABLES.includes(catalogItemName)
}

/** Categories whose stock is tracked per venue / rental company (Stock screens and the planner summary). */
export const STOCK_TRACKED_CATEGORIES = ['tables', 'chairs', 'plates', 'cutlery', 'glassware', 'candles', 'flowers']

/** Real tables only: not chairs, and not a placed decoration such as a Flower Arch. */
export function isTableObject(object: LayoutObject, catalogItems: DbCatalogItem[]): boolean {
  if (object.isChairFor) return false
  return catalogItems.find((i) => i.id === object.catalogItemId)?.category === 'tables'
}

/** Tables the bulk apply button reaches in the current room. */
export function bulkApplyTargets(objects: LayoutObject[], catalogItems: DbCatalogItem[]): LayoutObject[] {
  return objects.filter((o) => {
    if (!isTableObject(o, catalogItems)) return false
    const name = catalogItems.find((i) => i.id === o.catalogItemId)?.name
    return !isIndividualOnlyTable(name)
  })
}

export function chairsAtTable(tableId: string, objects: LayoutObject[]): number {
  return objects.filter((o) => o.isChairFor === tableId).length
}

/** How many of one setting line the table needs, after the per-seat multiplier. */
export function lineTotal(item: TableSettingItem, scope: DbCatalogItem['scope'], chairs: number): number {
  return scope === 'per_seat' ? item.quantity * chairs : item.quantity
}

/**
 * How many of each catalog item all tables' settings need, across every room.
 * Per-seat items multiply by the chairs placed at that table. Items missing from
 * `scopeById` (deleted from the catalog) are skipped.
 */
export function tableSettingDemand(
  objects: LayoutObject[],
  scopeById: Map<string, DbCatalogItem['scope']>,
): Map<string, number> {
  const chairsPerTable = new Map<string, number>()
  for (const o of objects) {
    if (o.isChairFor) chairsPerTable.set(o.isChairFor, (chairsPerTable.get(o.isChairFor) ?? 0) + 1)
  }
  const demand = new Map<string, number>()
  for (const table of objects) {
    if (table.isChairFor || !table.tableSetting) continue
    const chairs = chairsPerTable.get(table.id) ?? 0
    for (const line of table.tableSetting.items) {
      if (!scopeById.has(line.catalogItemId) || line.quantity < 1) continue
      const n = lineTotal(line, scopeById.get(line.catalogItemId) ?? null, chairs)
      if (n > 0) demand.set(line.catalogItemId, (demand.get(line.catalogItemId) ?? 0) + n)
    }
  }
  return demand
}

/** Copy items so a table never shares an array with a template or another table. */
export function cloneItems(items: TableSettingItem[]): TableSettingItem[] {
  return items.map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.quantity }))
}

/** Group scoped catalog items for pickers, in a stable category order. */
export function groupByCategory(items: DbCatalogItem[]): { category: string; items: DbCatalogItem[] }[] {
  const map = new Map<string, DbCatalogItem[]>()
  for (const item of items) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      const ai = TABLE_SETTING_CATEGORY_ORDER.indexOf(a)
      const bi = TABLE_SETTING_CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b)
    })
    .map(([category, list]) => ({ category, items: list.sort((x, y) => x.name.localeCompare(y.name)) }))
}
