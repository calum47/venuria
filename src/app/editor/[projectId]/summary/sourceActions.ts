'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Requests how many of an item a project rents from one company (0 clears it). The cap is the company's stock
 * minus what it already has committed to other projects on the same event date. Everything not rented stays
 * with the venue. The RLS policies on project_item_sources are the real access gate.
 */
export async function setItemSource(projectId: string, catalogItemId: string, rentalCompanyId: string, quantity: number) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const qty = Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0))

  if (qty > 0) {
    const [{ data: stock }, { data: committed }] = await Promise.all([
      supabase.from('catalog_item_stock').select('quantity')
        .eq('catalog_item_id', catalogItemId).eq('owner_type', 'rental_company').eq('owner_id', rentalCompanyId).maybeSingle(),
      supabase.rpc('rental_committed_elsewhere', { p_project: projectId, p_items: [catalogItemId] }),
    ])
    const used = (committed ?? []).find((c: { rental_company_id: string }) => c.rental_company_id === rentalCompanyId)?.committed ?? 0
    const available = Math.max(0, (stock?.quantity ?? 0) - used)
    if (qty > available) return { error: t('sourceOverAvailable', { count: available }) }
  }

  // The function re-checks everything (access, vendor tag, availability) and tags the vendor on the project.
  const { error } = await supabase.rpc('request_item_from_vendor', { p_project: projectId, p_item: catalogItemId, p_company: rentalCompanyId, p_qty: qty })
  if (error) return { error: error.code === '42501' ? t('projectVendorNotAllowed') : error.message }
  try {
    await ensureTeamVendorForRequest(supabase, projectId, rentalCompanyId)
  } catch (e) {
    console.error('Could not add the vendor to the team vendor list:', e)
  }
  revalidatePath(`/editor/${projectId}/summary`)
  return { success: true }
}

/** A vendor you ask for items is also an option in the team's timetable / run-down vendor list (same as adding it by hand). */
async function ensureTeamVendorForRequest(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string, companyId: string) {
  const { data: project } = await supabase.from('projects').select('team_id').eq('id', projectId).maybeSingle()
  const { data: company } = await supabase.from('rental_companies').select('name').eq('id', companyId).maybeSingle()
  if (!project?.team_id || !company) return
  const { data: mine } = await supabase.from('team_vendors').select('id, name, rental_company_id').eq('team_id', project.team_id)
  const rows = (mine ?? []) as { id: string; name: string; rental_company_id: string | null }[]
  if (rows.some((v) => v.rental_company_id === companyId)) return
  const same = rows.find((v) => v.name.trim().toLowerCase() === company.name.trim().toLowerCase() && v.rental_company_id === null)
  if (same) {
    await supabase.from('team_vendors').update({ rental_company_id: companyId }).eq('id', same.id)
    return
  }
  await supabase.from('team_vendors').insert({ team_id: project.team_id, name: company.name.trim(), rental_company_id: companyId })
}
