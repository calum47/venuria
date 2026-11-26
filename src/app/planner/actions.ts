'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isIsoDate, suggestDueBy } from '@/lib/projectDates'
import { parseCoupleNames } from '@/lib/projectTitle'

/**
 * Creates a project for the currently signed-in planner and redirects into
 * its editor. Uses the normal session-scoped client (not service-role) —
 * planner_manage_own_projects RLS requires planner_id = current_planner_id(),
 * so this looks up the caller's own planner row first and inserts that id
 * explicitly rather than trusting anything from the form. A mismatched or
 * forged planner_id would just be rejected by the database regardless.
 *
 * Phase 9: event date is required. Due By defaults to two weeks before it
 * (suggestDueBy) unless the form supplied one.
 */
export async function createProject(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated.' }
  }

  const { data: planner } = await supabase
    .from('planners')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!planner) {
    return { error: 'No planner account linked to this login.' }
  }

  const venueId = formData.get('venueId') as string
  if (!venueId) {
    return { error: 'Pick a venue.' }
  }

  const names = parseCoupleNames((formData.get('coupleNames') as string | null) ?? '', true)
  if (!names.ok) return { error: names.error }

  const eventDate = (formData.get('eventDate') as string | null)?.trim() ?? ''
  if (!isIsoDate(eventDate)) {
    return { error: 'Enter the event date.' }
  }
  const dueByRaw = (formData.get('dueBy') as string | null)?.trim() ?? ''
  const dueBy = isIsoDate(dueByRaw) ? dueByRaw : suggestDueBy(eventDate)

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ planner_id: planner.id, venue_id: venueId, event_date: eventDate, due_by: dueBy, couple_names: names.value })
    .select('id')
    .single()

  if (error || !project) {
    return { error: error?.message ?? 'Failed to create project.' }
  }

  redirect(`/editor/${project.id}`)
}

/** Changes the couple's names that title the project. RLS decides who may update the project. */
export async function updateProjectCoupleNames(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const projectId = formData.get('projectId') as string
  if (!projectId) return { error: 'Missing project.' }
  const names = parseCoupleNames((formData.get('coupleNames') as string | null) ?? '', true)
  if (!names.ok) return { error: names.error }

  const { data, error } = await supabase.from('projects').update({ couple_names: names.value }).eq('id', projectId).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Project not found, or you cannot edit it.' }
  revalidatePath('/planner')
  revalidatePath(`/planner/projects/${projectId}`)
  return {}
}

/**
 * Inline edit of a project's dates from the dashboard. RLS restricts the
 * update to the caller's own projects, so no ownership check is needed here.
 * Either field may be blank to clear it.
 */
export async function updateProjectDates(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const projectId = formData.get('projectId') as string
  if (!projectId) return { error: 'Missing project.' }

  const eventRaw = (formData.get('eventDate') as string | null)?.trim() ?? ''
  const dueRaw = (formData.get('dueBy') as string | null)?.trim() ?? ''
  if (eventRaw && !isIsoDate(eventRaw)) return { error: 'Invalid event date.' }
  if (dueRaw && !isIsoDate(dueRaw)) return { error: 'Invalid due-by date.' }

  const { error } = await supabase
    .from('projects')
    .update({ event_date: eventRaw || null, due_by: dueRaw || null })
    .eq('id', projectId)

  if (error) return { error: error.message }
  revalidatePath('/planner')
  return {}
}

/**
 * Set who a project is assigned to (migration 038): any number of teammates.
 * Only Leads and Managers may do this; the project_assignees RLS policies enforce it
 * and that every assignee belongs to the project's own team. The UI only decides
 * whether to show the control.
 *
 * Projects assigned before 038 still carry the old single `assigned_to_planner_id`. It was
 * copied into project_assignees by the migration, but is cleared here as well so that
 * unassigning someone really removes their access (the access function honours both).
 */
export async function setProjectAssignees(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const projectId = formData.get('projectId') as string
  if (!projectId) return { error: 'Missing project.' }
  const wanted = new Set(formData.getAll('plannerIds').map(String).filter(Boolean))

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: me } = await supabase.from('planners').select('id').eq('user_id', user?.id ?? '').maybeSingle()
  if (!me) return { error: 'No planner account linked to this login.' }

  const { data: project } = await supabase.from('projects').select('id, assigned_to_planner_id').eq('id', projectId).maybeSingle()
  if (!project) return { error: 'You don\u2019t have access to that project.' }

  const { data: current, error: curErr } = await supabase.from('project_assignees').select('planner_id').eq('project_id', projectId)
  if (curErr) return { error: curErr.message }
  const have = new Set((current ?? []).map((r) => r.planner_id as string))

  const toAdd = [...wanted].filter((id) => !have.has(id))
  const toRemove = [...have].filter((id) => !wanted.has(id))
  const denied = 'Only a manager or lead can assign projects.'

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('project_assignees')
      .insert(toAdd.map((plannerId) => ({ project_id: projectId, planner_id: plannerId, assigned_by: me.id })))
    if (error) return { error: error.code === '42501' ? denied : error.message }
  }
  if (toRemove.length > 0) {
    const { data: removed, error } = await supabase
      .from('project_assignees')
      .delete()
      .eq('project_id', projectId)
      .in('planner_id', toRemove)
      .select('planner_id')
    if (error) return { error: error.message }
    // RLS hides rows you may not delete instead of failing, so count what really went.
    if ((removed ?? []).length !== toRemove.length) return { error: denied }
  }
  if (project.assigned_to_planner_id) {
    const { error } = await supabase.from('projects').update({ assigned_to_planner_id: null }).eq('id', projectId)
    if (error) return { error: error.code === '42501' ? denied : error.message }
  }
  revalidatePath('/planner')
  revalidatePath(`/planner/projects/${projectId}`)
  return {}
}

/** Toggle private/public. Trigger allows the creator, a manager, or a lead. */
export async function setProjectVisibility(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const projectId = formData.get('projectId') as string
  const visibility = formData.get('visibility') as string
  if (!projectId || (visibility !== 'private' && visibility !== 'public')) return { error: 'Invalid request.' }
  const { data, error } = await supabase.from('projects').update({ visibility }).eq('id', projectId).select('id')
  if (error) return { error: error.code === '42501' ? 'Only the creator, a manager or a lead can change this.' : error.message }
  if (!data || data.length === 0) return { error: 'You don\u2019t have access to that project.' }
  revalidatePath('/planner')
  return {}
}
