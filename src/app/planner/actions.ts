'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Creates a project for the currently signed-in planner and redirects into
 * its editor. Uses the normal session-scoped client (not service-role) —
 * planner_manage_own_projects RLS requires planner_id = current_planner_id(),
 * so this looks up the caller's own planner row first and inserts that id
 * explicitly rather than trusting anything from the form. A mismatched or
 * forged planner_id would just be rejected by the database regardless.
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

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ planner_id: planner.id, venue_id: venueId })
    .select('id')
    .single()

  if (error || !project) {
    return { error: error?.message ?? 'Failed to create project.' }
  }

  redirect(`/editor/${project.id}`)
}
