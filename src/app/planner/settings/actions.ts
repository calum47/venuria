'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/** Update the caller's own display name. RLS (planner_update_self) + the field-protection trigger keep this to the name only. */
export async function updateMyName(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (name.length < 2) return { error: 'Name must be at least 2 characters.' }

  const { error } = await supabase.from('planners').update({ name }).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/planner', 'layout')
  return {}
}

const CURRENCY_RE = /^[A-Z]{3}$/

/** Update team name / currency. RLS (manager_update_team) rejects non-managers server-side regardless of the UI. */
export async function updateMyTeam(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const teamId = formData.get('teamId') as string
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const currency = ((formData.get('currency') as string | null) ?? '').trim().toUpperCase()
  if (!teamId) return { error: 'Missing team.' }
  if (name.length < 2) return { error: 'Team name must be at least 2 characters.' }
  if (!CURRENCY_RE.test(currency)) return { error: 'Currency must be a 3-letter code, e.g. EUR.' }

  const { data, error } = await supabase
    .from('teams')
    .update({ name, currency })
    .eq('id', teamId)
    .select('id')
  if (error) return { error: error.message }
  // RLS silently filters rather than erroring, so 0 rows = not allowed.
  if (!data || data.length === 0) return { error: 'Only the team manager can change this.' }
  revalidatePath('/planner', 'layout')
  return {}
}
