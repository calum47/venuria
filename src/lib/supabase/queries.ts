import { supabase } from './client'
import { LayoutObject } from '@/types'
import { DbLayoutObject } from '@/types/db'

// ─── Venues & Rooms ───────────────────────────────────────────────────────────

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

export async function getRoomsForVenue(venueId: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at')
  if (error) throw error
  return data
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export async function getCatalogItems(venueId: string) {
  const { data, error } = await supabase
    .from('catalog_items')
    .select('*')
    .eq('venue_id', venueId)
    .order('category')
  if (error) throw error
  return data
}

// ─── Projects ─────────────────────────────────────────────────────────────────

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
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()
  if (error) throw error
  return data
}

// ─── Layout Objects ───────────────────────────────────────────────────────────

/** Map a raw DB row back to the LayoutObject shape used in the store and canvas. */
export function mapDbObject(obj: DbLayoutObject): LayoutObject {
  const extra = obj.extra_data ?? {}
  return {
    id: obj.id,
    catalogItemId: obj.catalog_item_id,
    positionCm: { x: obj.position_x_cm, y: obj.position_y_cm },
    rotationDeg: obj.rotation_deg,
    quantity: obj.quantity,
    isChairFor:         (extra.isChairFor as string | undefined)        ?? undefined,
    chairIds:           (extra.chairIds as string[] | undefined)         ?? undefined,
    chairCount:         (extra.chairCount as number | undefined)         ?? undefined,
    chairCatalogItemId: (extra.chairCatalogItemId as string | undefined) ?? undefined,
    chairEdge:          (extra.chairEdge as LayoutObject['chairEdge'])   ?? undefined,
    chairSides:         (extra.chairSides as LayoutObject['chairSides']) ?? undefined,
    chairArrangement:   (extra.chairArrangement as LayoutObject['chairArrangement']) ?? undefined,
    tableLabel:         (extra.tableLabel as string | undefined)         ?? undefined,
    tableNote:          (extra.tableNote as string | undefined)          ?? undefined,
    mirrorEnabled:      (extra.mirrorEnabled as boolean | undefined)     ?? undefined,
  }
}

/** Serialize a LayoutObject to the flat DB row shape expected by Supabase. */
export function buildSavePayload(
  objects: LayoutObject[],
  projectId: string,
  roomId: string,
): Omit<DbLayoutObject, 'extra_data'> & { extra_data: Record<string, unknown> } extends infer T
  ? T[]
  : never {
  return objects.map((obj) => ({
    id: obj.id,
    project_id: projectId,
    room_id: roomId,
    catalog_item_id: obj.catalogItemId,
    position_x_cm: Math.round(obj.positionCm.x),
    position_y_cm: Math.round(obj.positionCm.y),
    rotation_deg: obj.rotationDeg,
    quantity: obj.quantity,
    extra_data: {
      isChairFor:         obj.isChairFor,
      chairIds:           obj.chairIds,
      chairCount:         obj.chairCount,
      chairCatalogItemId: obj.chairCatalogItemId,
      chairEdge:          obj.chairEdge,
      chairSides:         obj.chairSides,
      chairArrangement:   obj.chairArrangement,
      tableLabel:         obj.tableLabel,
      tableNote:          obj.tableNote,
      mirrorEnabled:      obj.mirrorEnabled,
    },
  })) as any
}

export async function getLayoutObjects(projectId: string, roomId: string): Promise<LayoutObject[]> {
  const { data, error } = await supabase
    .from('layout_objects')
    .select('*')
    .eq('project_id', projectId)
    .eq('room_id', roomId)
  if (error) throw error
  return (data as DbLayoutObject[]).map(mapDbObject)
}

/**
 * Upsert the full list of layout objects for a project+room.
 * Any DB rows not in the current list are deleted (they were removed by the user).
 */
export async function saveLayoutObjects(
  projectId: string,
  roomId: string,
  objects: LayoutObject[],
): Promise<void> {
  if (objects.length === 0) {
    const { error } = await supabase
      .from('layout_objects')
      .delete()
      .eq('project_id', projectId)
      .eq('room_id', roomId)
    if (error) throw new Error(`Delete failed: ${error.message}`)
    return
  }

  const payload = buildSavePayload(objects, projectId, roomId)
  const keepIds = payload.map((o) => o.id)

  const { error: deleteError } = await supabase
    .from('layout_objects')
    .delete()
    .eq('project_id', projectId)
    .eq('room_id', roomId)
    .not('id', 'in', `(${keepIds.join(',')})`)
  if (deleteError) throw new Error(`Delete stale rows failed: ${deleteError.message}`)

  const { error } = await supabase
    .from('layout_objects')
    .upsert(payload, { onConflict: 'id' })
  if (error) throw new Error(`Upsert failed: ${error.message}`)
}

// ─── Guests ───────────────────────────────────────────────────────────────────

export async function getGuests(projectId: string) {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('project_id', projectId)
    .order('name')
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

/**
 * Fetch all seat assignments for a project.
 *
 * Avoids a Supabase join (which requires an explicit FK in the schema) by
 * fetching layout_objects separately and building a lookup map locally.
 * This gives us room_id per assignment so the store can enforce
 * one seat per guest per room.
 */
export async function getSeatAssignments(projectId: string) {
  const { data: assignments, error: assignError } = await supabase
    .from('seat_assignments')
    .select('*')
    .eq('project_id', projectId)
  if (assignError) throw assignError
  if (!assignments || assignments.length === 0) return []

  // Fetch id → room_id for every layout object in this project
  const { data: layoutObjects, error: loError } = await supabase
    .from('layout_objects')
    .select('id, room_id')
    .eq('project_id', projectId)
  if (loError) throw loError

  const roomById = new Map((layoutObjects ?? []).map((o: any) => [o.id, o.room_id]))

  return assignments.map((a: any) => ({
    id: a.id,
    projectId: a.project_id,
    roomId: roomById.get(a.layout_object_id) ?? '',
    guestId: a.guest_id,
    layoutObjectId: a.layout_object_id,
  }))
}

/**
 * Assign a guest to a chair.
 *
 * Enforces at DB level:
 *   1. Only one guest per chair — clears the previous occupant of this chair.
 *   2. Only one seat per guest per room — clears any other chair this guest
 *      already holds in the same room (leaving other-room assignments intact).
 */
export async function assignSeat(
  projectId: string,
  guestId: string,
  layoutObjectId: string,
  roomId: string,
) {
  // 1. Clear the previous occupant of this chair
  await supabase
    .from('seat_assignments')
    .delete()
    .eq('layout_object_id', layoutObjectId)

  // 2. Clear any seat the guest already holds in this room
  const { data: roomObjects } = await supabase
    .from('layout_objects')
    .select('id')
    .eq('project_id', projectId)
    .eq('room_id', roomId)

  if (roomObjects && roomObjects.length > 0) {
    const roomObjectIds = roomObjects.map((o: any) => o.id)
    await supabase
      .from('seat_assignments')
      .delete()
      .eq('guest_id', guestId)
      .in('layout_object_id', roomObjectIds)
  }

  // 3. Insert the new assignment
  const { data, error } = await supabase
    .from('seat_assignments')
    .insert({ project_id: projectId, guest_id: guestId, layout_object_id: layoutObjectId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function unassignSeat(guestId: string) {
  const { error } = await supabase
    .from('seat_assignments')
    .delete()
    .eq('guest_id', guestId)
  if (error) throw error
}

export async function unassignChair(layoutObjectId: string) {
  const { error } = await supabase
    .from('seat_assignments')
    .delete()
    .eq('layout_object_id', layoutObjectId)
  if (error) throw error
}