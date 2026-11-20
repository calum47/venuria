import { supabase } from './client'
import type { DbGuest, DbProjectRsvp } from '@/types/db'
import { newRsvpToken, type RsvpStatus } from '@/lib/rsvp'

// RSVP data access for the planner side (migration 025). Browser client; RLS
// (planner_can_access_project) is the real gate. Guests answering through the
// public link never touch these: that path is server-only (app/rsvp/[token]).

export type RsvpSettings = {
  enabled: boolean
  deadline: string | null
  welcome_message: string | null
  allow_plus_one: boolean
}

/** Creates the project's RSVP row on first use (the database generates the token), or updates it. */
export async function saveRsvpSettings(projectId: string, s: RsvpSettings): Promise<DbProjectRsvp> {
  const { data, error } = await supabase
    .from('project_rsvp')
    .upsert(
      {
        project_id: projectId,
        enabled: s.enabled,
        deadline: s.deadline || null,
        welcome_message: s.welcome_message?.trim() || null,
        allow_plus_one: s.allow_plus_one,
      },
      { onConflict: 'project_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectRsvp
}

/** The old link stops working immediately. Answers already given are kept. */
export async function regenerateRsvpToken(projectId: string): Promise<DbProjectRsvp> {
  const { data, error } = await supabase
    .from('project_rsvp')
    .update({ token: newRsvpToken() })
    .eq('project_id', projectId)
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectRsvp
}

/** The planner records or corrects an answer (status null = back to pending). */
export async function setGuestRsvp(id: string, status: RsvpStatus | null): Promise<DbGuest> {
  const patch = status
    ? { rsvp_status: status, rsvp_at: new Date().toISOString(), rsvp_source: 'planner' as const }
    : { rsvp_status: null, rsvp_at: null, rsvp_source: null }
  const { data, error } = await supabase.from('guests').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as DbGuest
}

/** The planner has looked at a guest who was added through the link. */
export async function markRsvpReviewed(id: string): Promise<DbGuest> {
  const { data, error } = await supabase.from('guests').update({ rsvp_needs_review: false }).eq('id', id).select('*').single()
  if (error) throw error
  return data as DbGuest
}
