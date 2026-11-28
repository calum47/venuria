'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

/** The vendor answers a planner's request: accept all (qty = requested), accept part, or decline (0). */
export async function respondToRequest(projectId: string, catalogItemId: string, accepted: number) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const qty = Math.max(0, Math.floor(Number.isFinite(accepted) ? accepted : 0))
  const { error } = await supabase.rpc('respond_to_item_request', { p_project: projectId, p_item: catalogItemId, p_accepted: qty })
  if (error) return { error: error.code === '22023' ? t('requestAcceptedTooMany') : error.code === '42501' ? t('requestNotFound') : error.message }
  revalidatePath('/rental/requests')
  revalidatePath(`/rental/projects/${projectId}/materials`)
  revalidatePath(`/editor/${projectId}/summary`)
  return { success: true }
}
