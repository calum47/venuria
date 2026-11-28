import type { SupabaseClient } from '@supabase/supabase-js'

export type PlannerRole = 'manager' | 'lead' | 'member'

export type PlannerContext = {
  userId: string
  email: string | null
  planner: { id: string; name: string; plannerCode: string | null; role: PlannerRole; teamId: string }
  team: { id: string; name: string; currency: string; companyName: string | null; contactEmail: string | null }
  lastProjectId: string | null
  /** The last project page they had open (validated against known pages), or null. */
  lastPath: string | null
  /** Set when this login is also a Vendor (a rental company manager): the company to switch to. */
  vendor: { companyName: string } | null
}

/**
 * Everything the planner shell (nav, My Team, Settings) needs about the
 * signed-in planner, in one round of queries. Server-side only — pass the
 * request-scoped client from createClient(). Returns null when the login has
 * no planner row (proxy.ts already blocks those from /planner, but pages
 * still guard).
 *
 * "Last project" reuses project_visits (Phase 22 spec) — the editor already
 * stamps it on every open, so the nav gets this for free.
 */
export async function getPlannerContext(supabase: SupabaseClient): Promise<PlannerContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: planner } = await supabase
    .from('planners')
    .select('id, name, planner_code, role, team_id, teams(id, name, currency, company_name, contact_email)')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!planner) return null

  const t = planner.teams as unknown as { id: string; name: string; currency: string; company_name: string | null; contact_email: string | null } | null
  if (!t) return null
  const team = { id: t.id, name: t.name, currency: t.currency, companyName: t.company_name, contactEmail: t.contact_email }

  // Newest source first: the last project page they opened; older accounts fall back to the last editor visit.
  const { data: lastPage } = await supabase
    .from('user_last_page')
    .select('project_id, path')
    .eq('user_id', user.id)
    .maybeSingle()
  const { data: lastVisit } = lastPage
    ? { data: null }
    : await supabase
        .from('project_visits')
        .select('project_id')
        .eq('user_id', user.id)
        .order('last_opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()

  const { data: vendorRow } = await supabase
    .from('rental_managers')
    .select('rental_companies(name)')
    .eq('user_id', user.id)
    .maybeSingle()
  const vendorCompany = (vendorRow as { rental_companies: { name: string } | null } | null)?.rental_companies?.name

  return {
    userId: user.id,
    email: user.email ?? null,
    planner: {
      id: planner.id,
      name: planner.name,
      plannerCode: planner.planner_code,
      role: planner.role as PlannerRole,
      teamId: planner.team_id,
    },
    team,
    lastProjectId: lastPage?.project_id ?? lastVisit?.project_id ?? null,
    lastPath: lastPage?.path ?? null,
    vendor: vendorRow ? { companyName: vendorCompany ?? 'Vendor' } : null,
  }
}

// The role names themselves are translated: use t(role) with the "Roles" messages.
export const PLANNER_ROLES: PlannerRole[] = ['manager', 'lead', 'member']
