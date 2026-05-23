import { supabase } from './client'

export async function getVenue(venueId: string) {
  const { data, error } = await supabase.from('venues').select('*').eq('id', venueId).single()
  if (error) throw error
  return data
}

export async function getRoom(roomId: string) {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single()
  if (error) throw error
  return data
}

export async function getCatalogItems(venueId: string) {
  const { data, error } = await supabase.from('catalog_items').select('*').eq('venue_id', venueId).order('category')
  if (error) throw error
  return data
}

export async function createProject(venueId: string, roomId: string) {
  const { data, error } = await supabase
    .from('projects')
    .insert({ venue_id: venueId, room_id: roomId, status: 'in_progress' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getProject(projectId: string) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
  if (error) throw error
  return data
}

export async function saveLayoutObjects(
  projectId: string,
  roomId: string,
  objects: {
    id: string
    catalog_item_id: string
    position_x_cm: number
    position_y_cm: number
    rotation_deg: number
    quantity: number
    extra_data: Record<string, any>
  }[]
) {
  if (objects.length === 0) {
    const { error } = await supabase.from('layout_objects').delete().eq('project_id', projectId).eq('room_id', roomId)
    if (error) throw new Error(`Delete failed: ${error.message}`)
    return []
  }

  const keepIds = objects.map((o) => o.id)
  const { error: deleteError } = await supabase
    .from('layout_objects')
    .delete()
    .eq('project_id', projectId)
    .eq('room_id', roomId)
    .not('id', 'in', `(${keepIds.join(',')})`)
  if (deleteError) throw new Error(`Delete old rows failed: ${deleteError.message}`)

  const { data, error } = await supabase
    .from('layout_objects')
    .upsert(
      objects.map((obj) => ({
        id: obj.id,
        project_id: projectId,
        room_id: roomId,
        catalog_item_id: obj.catalog_item_id,
        position_x_cm: obj.position_x_cm,
        position_y_cm: obj.position_y_cm,
        rotation_deg: obj.rotation_deg,
        quantity: obj.quantity,
        extra_data: obj.extra_data,
      })),
      { onConflict: 'id' }
    )
    .select()
  if (error) throw new Error(`Upsert failed: ${error.message}`)
  return data
}

export async function getLayoutObjects(projectId: string, roomId: string) {
  const { data, error } = await supabase.from('layout_objects').select('*').eq('project_id', projectId).eq('room_id', roomId)
  if (error) throw error
  return data
}

export async function getRoomsForVenue(venueId: string) {
  const { data, error } = await supabase.from('rooms').select('*').eq('venue_id', venueId).order('created_at')
  if (error) throw error
  return data
}

// ─── Guests ───────────────────────────────────────────────────────────────────

export async function getGuests(projectId: string) {
  const { data, error } = await supabase.from('guests').select('*').eq('project_id', projectId).order('name')
  if (error) throw error
  return data
}

export async function addGuest(projectId: string, name: string, notes?: string) {
  const { data, error } = await supabase
    .from('guests')
    .insert({ project_id: projectId, name: name.trim(), notes: notes ?? null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteGuest(guestId: string) {
  const { error } = await supabase.from('guests').delete().eq('id', guestId)
  if (error) throw error
}

export async function bulkAddGuests(projectId: string, names: string[]) {
  const rows = names.map((name) => ({ project_id: projectId, name: name.trim() }))
  const { data, error } = await supabase.from('guests').insert(rows).select()
  if (error) throw error
  return data
}

// ─── Seat Assignments ─────────────────────────────────────────────────────────

export async function getSeatAssignments(projectId: string) {
  const { data, error } = await supabase.from('seat_assignments').select('*').eq('project_id', projectId)
  if (error) throw error
  return data
}

export async function assignSeat(projectId: string, guestId: string, layoutObjectId: string) {
  // Upsert by guest_id — removes old assignment for this guest automatically via unique constraint
  const { data, error } = await supabase
    .from('seat_assignments')
    .upsert(
      { project_id: projectId, guest_id: guestId, layout_object_id: layoutObjectId },
      { onConflict: 'guest_id' }
    )
    .select()
    .single()
  if (error) throw error

  // Also clear any other guest who was in this chair
  await supabase
    .from('seat_assignments')
    .delete()
    .eq('layout_object_id', layoutObjectId)
    .neq('guest_id', guestId)

  return data
}

export async function unassignSeat(guestId: string) {
  const { error } = await supabase.from('seat_assignments').delete().eq('guest_id', guestId)
  if (error) throw error
}

export async function unassignChair(layoutObjectId: string) {
  const { error } = await supabase.from('seat_assignments').delete().eq('layout_object_id', layoutObjectId)
  if (error) throw error
}