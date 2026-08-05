import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'venue' | 'planner' | 'client' | null

/**
 * Determines which role a logged-in user has by checking the admins,
 * venues, planners, and clients tables for a matching user_id (in that
 * priority order — an admin who is also linked elsewhere resolves as admin).
 *
 * Works with either the browser client (login page) or a request-scoped
 * server client (middleware) — both are plain SupabaseClient instances.
 * Relies on the RLS policies from 002_auth_roles.sql / 003_client_project_rls.sql,
 * which let a user read their own row in each of these tables.
 */
export async function resolveUserRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ role: UserRole; redirectPath: string }> {
  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (admin) return { role: 'admin', redirectPath: '/admin' }

  const { data: venueManager } = await supabase
    .from('venue_managers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (venueManager) return { role: 'venue', redirectPath: '/venue' }

  const { data: planner } = await supabase
    .from('planners')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (planner) return { role: 'planner', redirectPath: '/planner' }

  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (client) return { role: 'client', redirectPath: '/client' }

  return { role: null, redirectPath: '/login' }
}
