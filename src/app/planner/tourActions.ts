'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { suggestDueBy } from '@/lib/projectDates'

type Result = { projectId: string; sample: boolean } | { error: string }

/**
 * Called when a planner starts the guided tour: which project the tour should walk through.
 *
 * - Planner already has a project they created: use the most recent one (sample = false, so the tour
 *   only explains; it never asks them to change a real project).
 * - Planner has none: create a practice project ("Alex & Sam (sample)") on a venue that has at least
 *   one room, so the tour can ask them to place a table and add guests (sample = true).
 *
 * Runs with the caller's own session, like createProject: RLS decides what is allowed.
 * Venue choice: venues whose name says test/demo/sample first, otherwise any venue with a room.
 */
export async function getOrCreateTourProject(): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: planner } = await supabase.from('planners').select('id').eq('user_id', user.id).maybeSingle()
  if (!planner) return { error: 'No planner account linked to this login.' }

  const { data: own } = await supabase
    .from('projects')
    .select('id')
    .eq('planner_id', planner.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (own) return { projectId: own.id, sample: false }

  const [{ data: venues, error: venueError }, { data: roomRows }] = await Promise.all([
    supabase.from('venues').select('id, name'),
    supabase.from('rooms').select('venue_id'),
  ])
  if (venueError) return { error: venueError.message }
  const venuesWithRooms = new Set((roomRows ?? []).map((r) => r.venue_id as string))
  const withRooms = (venues ?? []).filter((v) => venuesWithRooms.has(v.id))
  if (withRooms.length === 0) return { error: 'No venue with a room is set up yet, so there is nothing to practise on.' }
  const preferred = withRooms.filter((v) => /\b(test|demo|sample)\b/i.test(v.name))
  const pool = preferred.length > 0 ? preferred : withRooms
  const venue = pool[Math.floor(Math.random() * pool.length)]

  const date = new Date()
  date.setMonth(date.getMonth() + 6)
  const eventDate = date.toISOString().slice(0, 10)

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ planner_id: planner.id, venue_id: venue.id, event_date: eventDate, due_by: suggestDueBy(eventDate), couple_names: 'Alex & Sam (sample)' })
    .select('id')
    .single()
  if (error || !project) return { error: error?.message ?? 'Could not create the sample project.' }

  // Pre-answer "seated or standing" for every room, so the editor doesn't open with that dialog on top of the
  // tour's first editor step. Not critical: if it fails, the dialog just appears and the tour waits for the answer.
  const { data: rooms } = await supabase.from('rooms').select('id').eq('venue_id', venue.id)
  if (rooms && rooms.length > 0) {
    const { error: settingError } = await supabase
      .from('project_room_settings')
      .insert(rooms.map((r) => ({ project_id: project.id, room_id: r.id as string, mode: 'seated' })))
    if (settingError) console.error('Tour: could not preset room modes:', settingError.message)
  }

  // An example day for the timetable (and so the run-down, which is built from it), so those pages aren't empty
  // in the tour. Deliberately no vendors: that would add entries to the team's real vendor list.
  const { data: day } = await supabase
    .from('project_days')
    .insert({ project_id: project.id, label: 'Wedding day', day_date: eventDate, position: 0 })
    .select('id')
    .single()
  if (day) {
    const h = (hh: number, mm = 0) => hh * 60 + mm
    const { error: blockError } = await supabase.from('timetable_blocks').insert([
      { title: 'Getting ready', start_min: h(12), end_min: h(13, 30), notes: 'Photographer arrives at 12:30.' },
      { title: 'Guests arrive', start_min: h(16, 30), end_min: h(17), materials: ['Welcome sign', 'Order of service'] },
      { title: 'Ceremony', start_min: h(17), end_min: h(17, 45), person: 'Officiant' },
      { title: 'Cocktail hour', start_min: h(17, 45), end_min: h(19) },
      { title: 'Dinner', start_min: h(19), end_min: h(21) },
      { title: 'First dance', start_min: h(21), end_min: h(21, 15) },
      { title: 'Party', start_min: h(21, 15), end_min: h(23, 30) },
    ].map((b) => ({ ...b, project_id: project.id, day_id: day.id })))
    if (blockError) console.error('Tour: could not add example timetable blocks:', blockError.message)
  }

  revalidatePath('/planner')
  return { projectId: project.id, sample: true }
}
