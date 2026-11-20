import { supabase } from './client'
import type { DbAgeGroup, DbGuest, DbGuestFamily, DbGuestStay } from '@/types/db'
import { GUEST_PHOTOS_BUCKET } from '@/lib/guests'

// Guest list details data access (migration 016). Browser client, like
// paymentQueries — RLS (planner_can_access_project) is the real gate; nothing
// here is trusted for security.

export type GuestPatch = Partial<{
  name: string
  notes: string | null
  is_vip: boolean
  gives_speech: boolean
  dietary: string | null
  age_group: DbAgeGroup
}>

export async function createGuest(projectId: string, name: string): Promise<DbGuest> {
  const { data, error } = await supabase
    .from('guests')
    .insert({ project_id: projectId, name: name.trim() })
    .select('*')
    .single()
  if (error) throw error
  return data as DbGuest
}

/** Adds several guests in ONE insert, so a failure adds none of them. */
export async function createGuests(projectId: string, names: string[]): Promise<DbGuest[]> {
  const rows = names.map((n) => ({ project_id: projectId, name: n.trim() })).filter((r) => r.name)
  if (rows.length === 0) return []
  const { data, error } = await supabase.from('guests').insert(rows).select('*')
  if (error) throw error
  return (data ?? []) as DbGuest[]
}

export async function updateGuest(id: string, patch: GuestPatch): Promise<DbGuest> {
  const { data, error } = await supabase.from('guests').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as DbGuest
}

/** Deletes the row (stays cascade), then the photo file. A leftover file is harmless, a leftover row is not. */
export async function deleteGuestAndPhoto(guest: Pick<DbGuest, 'id' | 'photo_path' | 'family_id'>): Promise<void> {
  const { error } = await supabase.from('guests').delete().eq('id', guest.id)
  if (error) throw error
  if (guest.photo_path) await supabase.storage.from(GUEST_PHOTOS_BUCKET).remove([guest.photo_path])
  if (guest.family_id) await removeFamilyIfEmpty(guest.family_id)
}

// ── Families ─────────────────────────────────────────────────────────────────

export async function createFamily(projectId: string, name: string): Promise<DbGuestFamily> {
  const { data, error } = await supabase
    .from('guest_families')
    .insert({ project_id: projectId, name: name.trim() })
    .select('*')
    .single()
  if (error) throw error
  return data as DbGuestFamily
}

export async function renameFamily(id: string, name: string): Promise<DbGuestFamily> {
  const { data, error } = await supabase
    .from('guest_families')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbGuestFamily
}

/** Returns true when the family was empty and has been removed. */
export async function removeFamilyIfEmpty(familyId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)
  if (error) throw error
  if ((count ?? 0) > 0) return false
  const { error: delErr } = await supabase.from('guest_families').delete().eq('id', familyId)
  if (delErr) throw delErr
  return true
}

/** Moves a guest into a family (or out, with null) and tidies the family they left. */
export async function setGuestFamily(
  guestId: string,
  newFamilyId: string | null,
  previousFamilyId: string | null,
): Promise<{ guest: DbGuest; removedFamilyId: string | null }> {
  const { data, error } = await supabase
    .from('guests')
    .update({ family_id: newFamilyId })
    .eq('id', guestId)
    .select('*')
    .single()
  if (error) throw error
  let removedFamilyId: string | null = null
  if (previousFamilyId && previousFamilyId !== newFamilyId) {
    if (await removeFamilyIfEmpty(previousFamilyId)) removedFamilyId = previousFamilyId
  }
  return { guest: data as DbGuest, removedFamilyId }
}

// ── Hotel per night ──────────────────────────────────────────────────────────

/** One row per night; a night that already has a hotel is overwritten. */
export async function saveStays(
  projectId: string,
  guestId: string,
  nights: string[],
  hotel: string,
): Promise<DbGuestStay[]> {
  const rows = nights.map((night) => ({ project_id: projectId, guest_id: guestId, night, hotel: hotel.trim() }))
  const { data, error } = await supabase
    .from('guest_stays')
    .upsert(rows, { onConflict: 'guest_id,night' })
    .select('*')
  if (error) throw error
  return (data ?? []) as DbGuestStay[]
}

export async function deleteStays(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('guest_stays').delete().in('id', ids)
  if (error) throw error
}

// ── Photos ───────────────────────────────────────────────────────────────────

const PHOTO_URL_TTL_S = 3600

export async function getPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(GUEST_PHOTOS_BUCKET).createSignedUrl(path, PHOTO_URL_TTL_S)
  if (error) return null
  return data.signedUrl
}

/**
 * Stores an already-downsized JPEG as the guest's photo and removes the old
 * one. Order matters: upload, point the row at it, and only then delete the
 * previous file — so a failure anywhere leaves the guest with a working photo.
 */
export async function uploadGuestPhoto(args: {
  teamId: string
  projectId: string
  guestId: string
  jpeg: Blob
  previousPath: string | null
}): Promise<{ guest: DbGuest; url: string | null }> {
  const path = `${args.teamId}/${args.projectId}/${crypto.randomUUID()}.jpg`
  const { error: upErr } = await supabase.storage
    .from(GUEST_PHOTOS_BUCKET)
    .upload(path, args.jpeg, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('guests')
    .update({ photo_path: path })
    .eq('id', args.guestId)
    .select('*')
    .single()
  if (error) {
    await supabase.storage.from(GUEST_PHOTOS_BUCKET).remove([path])
    throw error
  }
  if (args.previousPath) await supabase.storage.from(GUEST_PHOTOS_BUCKET).remove([args.previousPath])
  return { guest: data as DbGuest, url: await getPhotoUrl(path) }
}

export async function removeGuestPhoto(guestId: string, path: string): Promise<DbGuest> {
  const { data, error } = await supabase
    .from('guests')
    .update({ photo_path: null })
    .eq('id', guestId)
    .select('*')
    .single()
  if (error) throw error
  await supabase.storage.from(GUEST_PHOTOS_BUCKET).remove([path])
  return data as DbGuest
}

// ── Seat flag ────────────────────────────────────────────────────────────────

/** Dismisses the "needs a seat" flag. The reason is required (1–300 chars, also enforced by the DB). */
export async function dismissSeatFlag(id: string, note: string): Promise<DbGuest> {
  const trimmed = note.trim()
  if (!trimmed) throw new Error('Say why this guest does not need a seat.')
  if (trimmed.length > 300) throw new Error('Keep the reason under 300 characters.')
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('guests')
    .update({ seat_dismissed_note: trimmed, seat_dismissed_at: new Date().toISOString(), seat_dismissed_by: auth.user?.id ?? null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbGuest
}

export async function restoreSeatFlag(id: string): Promise<DbGuest> {
  const { data, error } = await supabase
    .from('guests')
    .update({ seat_dismissed_note: null, seat_dismissed_at: null, seat_dismissed_by: null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbGuest
}
