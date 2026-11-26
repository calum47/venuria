import { supabase } from './client'
import type { DbStockGroup, DbStockItem, DbStockPurchase, DbStockSale, DbStockOrder } from '@/types/db'

// ─── Groups ──────────────────────────────────────────────────────────────────

export async function getStockGroups(): Promise<DbStockGroup[]> {
  const { data, error } = await supabase.from('stock_groups').select('*').order('sort_order').order('name')
  if (error) throw error
  return data as DbStockGroup[]
}

export async function createStockGroup(teamId: string, name: string): Promise<DbStockGroup> {
  const { data, error } = await supabase
    .from('stock_groups')
    .insert({ team_id: teamId, name })
    .select('*')
    .single()
  if (error) throw error
  return data as DbStockGroup
}

export async function deleteStockGroup(id: string): Promise<void> {
  const { error } = await supabase.from('stock_groups').delete().eq('id', id)
  if (error) throw error
}

// ─── Items ───────────────────────────────────────────────────────────────────

/**
 * Read through stock_items_for_me() (migration 036), not the table: Members have no direct
 * access to the table, and for them the function returns cost_price and sell_price as 0.
 */
export async function getStockItems(): Promise<DbStockItem[]> {
  const { data, error } = await supabase.rpc('stock_items_for_me').order('name')
  if (error) throw error
  return data as DbStockItem[]
}

export type StockItemInput = {
  teamId: string
  groupId: string | null
  name: string
  iconType: 'emoji' | 'photo'
  iconValue: string | null
  costPrice: number
  sellPrice: number
  minStockAlert: number
  onDemand: boolean
  reusable: boolean
  notes: string | null
}

export async function createStockItem(input: StockItemInput): Promise<DbStockItem> {
  const { data, error } = await supabase
    .from('stock_items')
    .insert({
      team_id: input.teamId,
      group_id: input.groupId,
      name: input.name,
      icon_type: input.iconType,
      icon_value: input.iconValue,
      cost_price: input.costPrice,
      sell_price: input.sellPrice,
      min_stock_alert: input.minStockAlert,
      on_demand: input.onDemand,
      reusable: input.reusable,
      notes: input.notes,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as DbStockItem
}

export async function updateStockItem(id: string, input: Omit<StockItemInput, 'teamId'>): Promise<DbStockItem> {
  const { data, error } = await supabase
    .from('stock_items')
    .update({
      group_id: input.groupId,
      name: input.name,
      icon_type: input.iconType,
      icon_value: input.iconValue,
      cost_price: input.costPrice,
      sell_price: input.sellPrice,
      min_stock_alert: input.minStockAlert,
      on_demand: input.onDemand,
      reusable: input.reusable,
      notes: input.notes,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbStockItem
}

export async function deleteStockItem(id: string): Promise<void> {
  const { error } = await supabase.from('stock_items').delete().eq('id', id)
  if (error) throw error
}

/** Uploads an item photo to the team-scoped stock-photos bucket and returns its public URL. Path is team-prefixed to satisfy the storage RLS policy. */
export async function uploadStockPhoto(teamId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${teamId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('stock-photos').upload(path, file, { upsert: false })
  if (error) throw error
  return supabase.storage.from('stock-photos').getPublicUrl(path).data.publicUrl
}

// ─── Purchases ───────────────────────────────────────────────────────────────

export async function getStockPurchases(itemId?: string): Promise<DbStockPurchase[]> {
  let query = supabase.from('stock_purchases').select('*').order('purchased_at', { ascending: false }).limit(200)
  if (itemId) query = query.eq('item_id', itemId)
  const { data, error } = await query
  if (error) throw error
  return data as DbStockPurchase[]
}

export async function addStockPurchase(input: {
  itemId: string
  qty: number
  unitCost: number
  supplier: string | null
  projectId: string | null
}): Promise<void> {
  const { error } = await supabase.from('stock_purchases').insert({
    item_id: input.itemId,
    qty: input.qty,
    unit_cost: input.unitCost,
    supplier: input.supplier,
    project_id: input.projectId,
  })
  if (error) throw error
}

export async function deleteStockPurchase(id: string): Promise<void> {
  const { error } = await supabase.from('stock_purchases').delete().eq('id', id)
  if (error) throw error
}

// ─── Sales ───────────────────────────────────────────────────────────────────

/** Read through stock_sales_for_me() (migration 036): for Members unit_price and unit_cost_snapshot come back as 0. */
export async function getStockSales(itemId?: string): Promise<DbStockSale[]> {
  let query = supabase.rpc('stock_sales_for_me').order('sold_at', { ascending: false }).limit(200)
  if (itemId) query = query.eq('item_id', itemId)
  const { data, error } = await query
  if (error) throw error
  return data as DbStockSale[]
}

/**
 * The database now fills unit_cost_snapshot from the item's current (average) cost, and for a Member
 * also the unit price from the item's sell price (migration 036), so Members may pass 0 for both. */
export async function addStockSale(input: {
  itemId: string
  qty: number
  unitPrice: number
  unitCostSnapshot: number
  projectId: string | null
}): Promise<void> {
  const { error } = await supabase.from('stock_sales').insert({
    item_id: input.itemId,
    qty: input.qty,
    unit_price: input.unitPrice,
    unit_cost_snapshot: input.unitCostSnapshot,
    project_id: input.projectId,
  })
  if (error) throw error
}

/** Planner confirms how many of a reusable sale came back (0 = all lost). Manager / lead only — enforced by RLS. */
export async function confirmSaleReturn(id: string, returnedQty: number): Promise<void> {
  const { error } = await supabase
    .from('stock_sales')
    .update({ returned_qty: returnedQty, return_confirmed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteStockSale(id: string): Promise<void> {
  const { error } = await supabase.from('stock_sales').delete().eq('id', id)
  if (error) throw error
}

// ─── Orders ──────────────────────────────────────────────────────────────────
// Deliberately no tracking fields yet — Order Tracking Integration (17TRACK)
// is v2 per the spec, built after this core CRUD.

export async function getStockOrders(): Promise<DbStockOrder[]> {
  const { data, error } = await supabase.from('stock_orders').select('*').order('ordered_at', { ascending: false }).limit(200)
  if (error) throw error
  return data as DbStockOrder[]
}

/** Orders tagged to one project (Project Hub). RLS already limits this to the signed-in planner's team. */
export async function getProjectStockOrders(projectId: string): Promise<DbStockOrder[]> {
  const { data, error } = await supabase
    .from('stock_orders')
    .select('*')
    .eq('project_id', projectId)
    .order('ordered_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data as DbStockOrder[]
}

export async function addStockOrder(input: {
  teamId: string
  itemId: string | null
  projectId: string | null
  qty: number
}): Promise<void> {
  const { error } = await supabase.from('stock_orders').insert({
    team_id: input.teamId,
    item_id: input.itemId,
    project_id: input.projectId,
    qty: input.qty,
  })
  if (error) throw error
}

export async function setStockOrderStatus(id: string, status: 'pending' | 'received'): Promise<void> {
  const { error } = await supabase.from('stock_orders').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteStockOrder(id: string): Promise<void> {
  const { error } = await supabase.from('stock_orders').delete().eq('id', id)
  if (error) throw error
}
