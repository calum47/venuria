'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { passwordProblem } from '@/lib/passwordPolicy'
import { getTranslations } from 'next-intl/server'

function generatePlannerCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

/**
 * Accept an invite: create the auth user + planner row in the invite's team,
 * consume the token. Service-role throughout — there is no session yet.
 *
 * Double-use is prevented by the conditional UPDATE that consumes the token
 * (`used_at is null and expires_at > now()`): two concurrent submissions
 * race on that row and exactly one wins. The loser sees "already used".
 *
 * Order matters: consume the token FIRST (cheap, reversible), then create
 * the login. If the planner insert fails after the auth user exists, the
 * auth user is deleted and the token is released again.
 */
export async function acceptInvite(formData: FormData): Promise<{ error?: string }> {
  const t = await getTranslations('Errors')
  const token = ((formData.get('token') as string | null) ?? '').trim()
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const email = ((formData.get('email') as string | null) ?? '').trim().toLowerCase()
  const password = (formData.get('password') as string | null) ?? ''

  if (!token) return { error: t('missingInvite') }
  if (name.length < 2) return { error: t('enterYourName') }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t('enterAValidEmail') }
  const passwordIssue = passwordProblem(password, await getTranslations('Password'))
  if (passwordIssue) return { error: passwordIssue }

  const admin = createAdminClient()

  // 1. Consume the token atomically. We stamp a placeholder used_at now and
  //    fill used_by_planner_id once the planner row exists.
  const { data: invite, error: consumeError } = await admin
    .from('team_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, team_id, role')
    .maybeSingle()

  if (consumeError) return { error: consumeError.message }
  if (!invite) return { error: t('thisInviteLinkHasAlready') }

  const release = () => admin.from('team_invites').update({ used_at: null }).eq('id', invite.id)

  // 2. Create the login.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // the invite from a manager is the vouch; no verification mail
  })
  if (createError || !created.user) {
    await release()
    const msg = createError?.message ?? t('failedToCreateTheLogin')
    return { error: /already|exists|registered/i.test(msg) ? t('anAccountWithThatEmail') : msg }
  }

  // 3. Planner row in the invite's team, with the invite's role.
  const { data: planner, error: plannerError } = await admin
    .from('planners')
    .insert({
      user_id: created.user.id,
      name,
      email,
      planner_code: generatePlannerCode(),
      team_id: invite.team_id,
      role: invite.role,
    })
    .select('id')
    .single()

  if (plannerError || !planner) {
    await admin.auth.admin.deleteUser(created.user.id)
    await release()
    return { error: plannerError?.message ?? t('failedToCreateThePlanner') }
  }

  await admin.from('team_invites').update({ used_by_planner_id: planner.id }).eq('id', invite.id)

  redirect('/login?joined=1')
}
