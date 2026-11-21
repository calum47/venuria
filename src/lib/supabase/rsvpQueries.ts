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

// ── Page content (migration 026) ────────────────────────────────────────────
// Images go to the private rsvp-media bucket as {team_id}/{project_id}/{uuid}.jpg.
// The browser has already shrunk them (and dropped EXIF). Order of work is
// always upload → database row → delete the old file, so a failure part-way
// leaves the page working, with at worst an unreferenced file.

import { RSVP_MEDIA_BUCKET } from '@/lib/rsvpContent'
import type { DbRsvpHotel, DbRsvpPhoto } from '@/types/db'

export type RsvpContentPatch = Partial<{
  schedule: string | null
  dress_code: string | null
  map_url: string | null
  area_text: string | null
  show_details: boolean
  show_area: boolean
  show_hotels: boolean
  cover_path: string | null
}>

/** Upserts only the given content columns (creates the row, switched off, on first use). */
export async function saveRsvpContent(projectId: string, patch: RsvpContentPatch): Promise<DbProjectRsvp> {
  const { data, error } = await supabase
    .from('project_rsvp')
    .upsert({ project_id: projectId, ...patch }, { onConflict: 'project_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectRsvp
}

export async function signMediaUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (paths.length === 0) return out
  const { data } = await supabase.storage.from(RSVP_MEDIA_BUCKET).createSignedUrls(paths, 3600)
  for (const s of data ?? []) if (s.path && s.signedUrl) out[s.path] = s.signedUrl
  return out
}

async function uploadImage(teamId: string, projectId: string, jpeg: Blob): Promise<string> {
  const path = `${teamId}/${projectId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(RSVP_MEDIA_BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

const removeFiles = (paths: (string | null)[]) => {
  const list = paths.filter((p): p is string => !!p)
  return list.length ? supabase.storage.from(RSVP_MEDIA_BUCKET).remove(list) : Promise.resolve()
}

export async function setCoverPhoto(a: { teamId: string; projectId: string; jpeg: Blob; previousPath: string | null }): Promise<{ cfg: DbProjectRsvp; url: string | null }> {
  const path = await uploadImage(a.teamId, a.projectId, a.jpeg)
  try {
    const cfg = await saveRsvpContent(a.projectId, { cover_path: path })
    await removeFiles([a.previousPath])
    return { cfg, url: (await signMediaUrls([path]))[path] ?? null }
  } catch (e) {
    await removeFiles([path])
    throw e
  }
}

export async function removeCoverPhoto(projectId: string, path: string): Promise<DbProjectRsvp> {
  const cfg = await saveRsvpContent(projectId, { cover_path: null })
  await removeFiles([path])
  return cfg
}

export async function addAreaPhoto(a: { teamId: string; projectId: string; jpeg: Blob; position: number }): Promise<{ photo: DbRsvpPhoto; url: string | null }> {
  const path = await uploadImage(a.teamId, a.projectId, a.jpeg)
  const { data, error } = await supabase
    .from('project_rsvp_photos')
    .insert({ project_id: a.projectId, path, position: a.position })
    .select('*')
    .single()
  if (error) {
    await removeFiles([path])
    throw error
  }
  return { photo: data as DbRsvpPhoto, url: (await signMediaUrls([path]))[path] ?? null }
}

export async function updateAreaPhotoCaption(id: string, caption: string | null): Promise<DbRsvpPhoto> {
  const { data, error } = await supabase.from('project_rsvp_photos').update({ caption: caption?.trim() || null }).eq('id', id).select('*').single()
  if (error) throw error
  return data as DbRsvpPhoto
}

export async function deleteAreaPhoto(photo: Pick<DbRsvpPhoto, 'id' | 'path'>): Promise<void> {
  const { error } = await supabase.from('project_rsvp_photos').delete().eq('id', photo.id)
  if (error) throw error
  await removeFiles([photo.path])
}

export type HotelInput = {
  name: string
  address: string | null
  url: string | null
  booking_note: string | null
  description: string | null
}

export async function createHotel(projectId: string, input: HotelInput, position: number): Promise<DbRsvpHotel> {
  const { data, error } = await supabase
    .from('project_rsvp_hotels')
    .insert({ project_id: projectId, ...input, name: input.name.trim(), position })
    .select('*')
    .single()
  if (error) throw error
  return data as DbRsvpHotel
}

export async function updateHotel(id: string, input: HotelInput): Promise<DbRsvpHotel> {
  const { data, error } = await supabase
    .from('project_rsvp_hotels')
    .update({ ...input, name: input.name.trim() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbRsvpHotel
}

export async function deleteHotel(hotel: Pick<DbRsvpHotel, 'id' | 'image_path'>): Promise<void> {
  const { error } = await supabase.from('project_rsvp_hotels').delete().eq('id', hotel.id)
  if (error) throw error
  await removeFiles([hotel.image_path])
}

export async function setHotelImage(a: { teamId: string; projectId: string; hotelId: string; jpeg: Blob; previousPath: string | null }): Promise<{ hotel: DbRsvpHotel; url: string | null }> {
  const path = await uploadImage(a.teamId, a.projectId, a.jpeg)
  const { data, error } = await supabase.from('project_rsvp_hotels').update({ image_path: path }).eq('id', a.hotelId).select('*').single()
  if (error) {
    await removeFiles([path])
    throw error
  }
  await removeFiles([a.previousPath])
  return { hotel: data as DbRsvpHotel, url: (await signMediaUrls([path]))[path] ?? null }
}

export async function removeHotelImage(hotelId: string, path: string): Promise<DbRsvpHotel> {
  const { data, error } = await supabase.from('project_rsvp_hotels').update({ image_path: null }).eq('id', hotelId).select('*').single()
  if (error) throw error
  await removeFiles([path])
  return data as DbRsvpHotel
}
