import type { SupabaseClient } from '@supabase/supabase-js'

export type PlannerRole = 'manager' | 'lead' | 'member'

export type PlannerContext = {
  userId: string
  email: string | null
  planner: { id: string; name: string; plannerCode: string | null; role: PlannerRole; teamId: string }
  team: { id: string; name: string; currency: string }
  lastProjectId: string | null
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
    .select('id, name, planner_code, role, team_id, teams(id, name, currency)')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!planner) return null

  const team = planner.teams as unknown as { id: string; name: string; currency: string } | null
  if (!team) return null

  const { data: lastVisit } = await supabase
    .from('project_visits')
    .select('project_id')
    .eq('user_id', user.id)
    .order('last_opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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
    lastProjectId: lastVisit?.project_id ?? null,
  }
}

export const ROLE_LABEL: Record<PlannerRole, string> = {
  manager: 'Manager',
  lead: 'Lead',
  member: 'Member',
}
