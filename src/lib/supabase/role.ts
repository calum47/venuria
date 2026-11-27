import type { SupabaseClient } from '@supabase/supabase-js'

export type AuthRole = 'admin' | 'venue' | 'rental' | 'planner' | 'client' | null

/**
 * Determines which role(s) a logged-in user has by checking the admins,
 * venue_managers, planners, rental_managers and clients tables for a
 * matching user_id. The first match in that order is the role the login opens as
 * (an admin who is also linked elsewhere resolves as admin; a planner who is also
 * a Vendor opens as the planner).
 *
 * Works with either the browser client (login page) or a request-scoped
 * server client (middleware) — both are plain SupabaseClient instances.
 * Relies on the RLS policies from 002_auth_roles.sql / 003_client_project_rls.sql
 * / rental_company_role_and_stock.sql, which let a user read their own row
 * in each of these tables.
 */
export async function resolveUserRoles(supabase: SupabaseClient, userId: string): Promise<AuthRole[]> {
  const has = async (table: string) => {
    const { data } = await supabase.from(table).select('id').eq('user_id', userId).maybeSingle()
    return !!data
  }
  const [admin, venue, planner, rental, client] = await Promise.all([
    has('admins'),
    has('venue_managers'),
    has('planners'),
    has('rental_managers'),
    has('clients'),
  ])
  const roles: AuthRole[] = []
  if (admin) roles.push('admin')
  if (venue) roles.push('venue')
  // A planner who is also a Vendor (a rental company manager) opens as the planner and switches to Vendor from the nav.
  if (planner) roles.push('planner')
  if (rental) roles.push('rental')
  if (client) roles.push('client')
  return roles
}

const HOME: Record<Exclude<AuthRole, null>, string> = {
  admin: '/admin',
  venue: '/venue',
  planner: '/planner',
  rental: '/rental',
  client: '/client',
}

/** The role a login opens as (first in priority), plus where that role lives. Everyone's roles: resolveUserRoles. */
export async function resolveUserRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ role: AuthRole; redirectPath: string }> {
  const [role] = await resolveUserRoles(supabase, userId)
  if (!role) return { role: null, redirectPath: '/login' }
  return { role, redirectPath: HOME[role] }
}
