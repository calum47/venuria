'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isIsoDate, suggestDueBy } from '@/lib/projectDates'

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

  const eventDate = (formData.get('eventDate') as string | null)?.trim() ?? ''
  if (!isIsoDate(eventDate)) {
    return { error: 'Enter the event date.' }
  }
  const dueByRaw = (formData.get('dueBy') as string | null)?.trim() ?? ''
  const dueBy = isIsoDate(dueByRaw) ? dueByRaw : suggestDueBy(eventDate)

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ planner_id: planner.id, venue_id: venueId, event_date: eventDate, due_by: dueBy })
    .select('id')
    .single()

  if (error || !project) {
    return { error: error?.message ?? 'Failed to create project.' }
  }

  redirect(`/editor/${project.id}`)
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
