import { supabase } from './client'
import type { DbCatalogItem, DbTableSettingTemplate } from '@/types/db'
import type { TableSettingItem } from '@/types'

// Table-setting templates (migration 033). Browser client; RLS scopes everything
// to the signed-in planner's team, so every team member sees the same templates.

/**
 * Catalog items a table setting can use: shared master rows (no venue/rental owner,
 * same as tables and chairs) that carry a scope. The editor's main catalog query only
 * loads tables and chairs, so these never reach the canvas panel.
 */
export async function getTableSettingCatalogItems(): Promise<DbCatalogItem[]> {
  const { data, error } = await supabase
    .from('catalog_items')
    .select('*')
    .is('venue_id', null)
    .is('rental_company_id', null)
    .not('scope', 'is', null)
    .order('category')
    .order('name')
  if (error) throw error
  return data as DbCatalogItem[]
}

export async function listTemplates(): Promise<DbTableSettingTemplate[]> {
  const { data, error } = await supabase
    .from('table_setting_templates')
    .select('*, table_setting_template_items(*)')
    .order('name')
  if (error) throw error
  return data as DbTableSettingTemplate[]
}

function cleanItems(items: TableSettingItem[]): TableSettingItem[] {
  return items.filter((i) => i.quantity >= 1).map((i) => ({ ...i, quantity: Math.min(50, Math.floor(i.quantity)) }))
}

async function replaceItems(templateId: string, items: TableSettingItem[]) {
  const { error: delError } = await supabase.from('table_setting_template_items').delete().eq('template_id', templateId)
  if (delError) throw delError
  const rows = cleanItems(items).map((i) => ({ template_id: templateId, catalog_item_id: i.catalogItemId, quantity: i.quantity }))
  if (rows.length === 0) return
  const { error } = await supabase.from('table_setting_template_items').insert(rows)
  if (error) throw error
}

export async function createTemplate(name: string, items: TableSettingItem[]): Promise<string> {
  const { data: teamId, error: teamError } = await supabase.rpc('current_team_id')
  if (teamError) throw teamError
  if (!teamId) throw new Error('No team found for this account.')
  const { data, error } = await supabase
    .from('table_setting_templates')
    .insert({ team_id: teamId, name: name.trim() })
    .select('id')
    .single()
  if (error) throw error
  await replaceItems(data.id as string, items)
  return data.id as string
}

export async function updateTemplate(id: string, name: string, items: TableSettingItem[]): Promise<void> {
  const { error } = await supabase.from('table_setting_templates').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
  await replaceItems(id, items)
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('table_setting_templates').delete().eq('id', id)
  if (error) throw error
}
