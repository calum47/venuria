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
  const { data: planner } = await supabase.from('planners').select('id').maybeSingle()
  const { error } = await supabase
    .from('project_vendors')
    .insert({ project_id: projectId, rental_company_id: rentalCompanyId, added_by: planner?.id ?? null })
  if (error) {
    if (error.code === '23505') return { success: true } // already there
    return { error: error.code === '42501' ? t('projectVendorNotAllowed') : error.message }
  }
  revalidatePath(`/planner/projects/${projectId}`)
  return { success: true }
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
