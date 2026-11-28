'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

const INVITE_TTL_DAYS = 7

/**
 * Mint an invite link. RLS (manager_manage_team_invites) rejects anyone but
 * the team manager at the database, so no role check is duplicated here.
 */
export async function createInvite(formData: FormData): Promise<{ error?: string; token?: string }> {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t('notAuthenticated') }

  const role = (formData.get('role') as string) === 'lead' ? 'lead' : 'member'

  const { data: me } = await supabase.from('planners').select('id, team_id').eq('user_id', user.id).maybeSingle()
  if (!me) return { error: t('noPlannerAccountLinkedTo') }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString()

  const { error } = await supabase.from('team_invites').insert({
    team_id: me.team_id,
    token,
    role,
    created_by_planner_id: me.id,
    expires_at: expiresAt,
  })
  if (error) return { error: error.code === '42501' ? t('onlyTheTeamManagerCan2') : error.message }
  revalidatePath('/planner/team')
  return { token }
}

export async function revokeInvite(formData: FormData): Promise<{ error?: string }> {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const inviteId = formData.get('inviteId') as string
  if (!inviteId) return { error: t('missingInvite') }
  const { error } = await supabase.from('team_invites').delete().eq('id', inviteId)
  if (error) return { error: error.message }
  revalidatePath('/planner/team')
  return {}
}

export async function setMemberRole(formData: FormData): Promise<{ error?: string }> {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const plannerId = formData.get('plannerId') as string
  const role = formData.get('role') as string
  if (!plannerId || !role) return { error: t('missingFields') }
  const { error } = await supabase.rpc('set_team_member_role', { target_planner_id: plannerId, new_role: role })
  if (error) return { error: error.message }
  revalidatePath('/planner/team')
  return {}
}

export async function removeMember(formData: FormData): Promise<{ error?: string }> {
  const t = await getTranslations('Errors')
  const supabase = await createClient()
  const plannerId = formData.get('plannerId') as string
  if (!plannerId) return { error: t('missingPlanner') }
  const { error } = await supabase.rpc('remove_team_member', { target_planner_id: plannerId })
  if (error) return { error: error.message }
  revalidatePath('/planner/team')
  return {}
}
