import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * What the signed-in planner may do with a project (migration 038):
 *   edit  creator, an assignee, or a Lead/Manager of the team
 *   view  a Public project of the team they are not assigned to: read everything except
 *         Payments & Documents, change nothing
 *   none  cannot see it
 * Decided by the database (planner_project_access), so the UI and the RLS policies never disagree.
 */
export type ProjectAccess = 'edit' | 'view' | 'none'

export async function getProjectAccess(supabase: SupabaseClient, projectId: string): Promise<ProjectAccess> {
  const { data, error } = await supabase.rpc('planner_project_access', { pid: projectId })
  if (error) return 'none'
  return data === 'edit' || data === 'view' ? data : 'none'
}
