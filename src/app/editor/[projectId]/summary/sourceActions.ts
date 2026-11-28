'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Sets how many of an item a project rents from one company (0 clears it). The cap is the company's stock
 * minus what it already has committed to other projects on the same event date. Everything not rented stays
 * with the venue. The RLS policies on project_item_sources are the real access gate.
 */
export async function setItemSource(projectId: string, catalogItemId: string, rentalCompanyId: string, quantity: number) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const qty = Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0))

  if (qty === 0) {
    const { error } = await supabase.from('project_item_sources').delete()
      .eq('project_id', projectId).eq('catalog_item_id', catalogItemId).eq('rental_company_id', rentalCompanyId)
    if (error) return { error: error.message }
    revalidatePath(`/editor/${projectId}/summary`)
    return { success: true }
  }

  const [{ data: stock }, { data: committed }] = await Promise.all([
    supabase.from('catalog_item_stock').select('quantity')
      .eq('catalog_item_id', catalogItemId).eq('owner_type', 'rental_company').eq('owner_id', rentalCompanyId).maybeSingle(),
    supabase.rpc('rental_committed_elsewhere', { p_project: projectId, p_items: [catalogItemId] }),
  ])
  const used = (committed ?? []).find((c: { rental_company_id: string }) => c.rental_company_id === rentalCompanyId)?.committed ?? 0
  const available = Math.max(0, (stock?.quantity ?? 0) - used)
  if (qty > available) return { error: t('sourceOverAvailable', { count: available }) }

  const { error } = await supabase.from('project_item_sources').upsert(
    { project_id: projectId, catalog_item_id: catalogItemId, rental_company_id: rentalCompanyId, quantity: qty, updated_at: new Date().toISOString() },
    { onConflict: 'project_id,catalog_item_id,rental_company_id' },
  )
  if (error) return { error: error.message }
  revalidatePath(`/editor/${projectId}/summary`)
  return { success: true }
}
