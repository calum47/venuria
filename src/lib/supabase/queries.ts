import { supabase } from './client'

export async function getVenue(venueId: string) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('id', venueId)
    .single()

  if (error) throw error
  return data
}

export async function getRoom(roomId: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (error) throw error
  return data
}

export async function getCatalogItems(venueId: string) {
  const { data, error } = await supabase
    .from('catalog_items')
    .select('*')
    .eq('venue_id', venueId)
    .order('category')

  if (error) throw error
  return data
}

export async function createProject(venueId: string, roomId: string) {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      venue_id: venueId,
      room_id: roomId,
      status: 'in_progress',
    })
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
  // Step 1: delete objects that are no longer present (by ID)
  // This avoids wiping rows we're about to upsert
  if (objects.length === 0) {
    // If canvas is empty, delete everything for this room
    const { error } = await supabase
      .from('layout_objects')
      .delete()
      .eq('project_id', projectId)
      .eq('room_id', roomId)
    if (error) throw new Error(`Delete failed: ${error.message}`)
    return []
  }

  // Step 2: delete rows that are no longer in the current layout
  const keepIds = objects.map((o) => o.id)
  const { error: deleteError } = await supabase
    .from('layout_objects')
    .delete()
    .eq('project_id', projectId)
    .eq('room_id', roomId)
    .not('id', 'in', `(${keepIds.join(',')})`)

  if (deleteError) throw new Error(`Delete old rows failed: ${deleteError.message}`)

  // Step 3: upsert current objects (insert or update by id)
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
  const { data, error } = await supabase
    .from('layout_objects')
    .select('*')
    .eq('project_id', projectId)
    .eq('room_id', roomId)

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