'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Add / remove a vendor on a project (migration 048). The session client is used on purpose: the
 * project_vendors policies decide who may do this (people who can edit the project; only companies
 * that still have the Vendor tag), so a rejected request changes no rows and is reported here.
 */
export async function addProjectVendor(projectId: string, rentalCompanyId: string) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const { data: planner } = await supabase.from('planners').select('id, team_id').maybeSingle()
  const { error } = await supabase
    .from('project_vendors')
    .insert({ project_id: projectId, rental_company_id: rentalCompanyId, added_by: planner?.id ?? null })
  if (error) {
    if (error.code === '23505') return { success: true } // already there
    return { error: error.code === '42501' ? t('projectVendorNotAllowed') : error.message }
  }
  // The vendor also becomes an option in the team's vendor list (timetable / run-down), with the contact
  // details the vendor entered (a database trigger fills and refreshes them). An existing free-text vendor
  // with the same name is linked rather than duplicated. Failing here must not undo adding the vendor.
  if (planner?.team_id) {
    try {
      await ensureTeamVendor(supabase, planner.team_id as string, rentalCompanyId)
    } catch (e) {
      console.error('Could not add the vendor to the team vendor list:', e)
    }
  }
  revalidatePath(`/planner/projects/${projectId}`)
  revalidatePath(`/planner/projects/${projectId}/timetable`)
  revalidatePath(`/planner/projects/${projectId}/rundown`)
  return { success: true }
}

async function ensureTeamVendor(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, companyId: string) {
  const { data: company } = await supabase.from('rental_companies').select('name').eq('id', companyId).maybeSingle()
  if (!company) return
  const { data: mine } = await supabase.from('team_vendors').select('id, name, rental_company_id').eq('team_id', teamId)
  const rows = (mine ?? []) as { id: string; name: string; rental_company_id: string | null }[]
  if (rows.some((v) => v.rental_company_id === companyId)) return
  const key = company.name.trim().toLowerCase()
  const sameName = rows.find((v) => v.name.trim().toLowerCase() === key && v.rental_company_id === null)
  if (sameName) {
    const { error } = await supabase.from('team_vendors').update({ rental_company_id: companyId }).eq('id', sameName.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('team_vendors').insert({ team_id: teamId, name: company.name.trim(), rental_company_id: companyId })
  if (error) throw error
}

export async function removeProjectVendor(projectId: string, rentalCompanyId: string) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_vendors')
    .delete()
    .eq('project_id', projectId)
    .eq('rental_company_id', rentalCompanyId)
    .select('project_id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: t('projectVendorNotAllowed') }
  revalidatePath(`/planner/projects/${projectId}`)
  return { success: true }
}
