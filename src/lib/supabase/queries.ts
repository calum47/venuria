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
  objects: {
    catalog_item_id: string
    position_x_cm: number
    position_y_cm: number
    rotation_deg: number
    quantity: number
  }[]
) {
  // Delete existing objects for this project first
  const { error: deleteError } = await supabase
    .from('layout_objects')
    .delete()
    .eq('project_id', projectId)

  if (deleteError) throw deleteError

  if (objects.length === 0) return []

  const { data, error } = await supabase
    .from('layout_objects')
    .insert(objects.map((obj) => ({ ...obj, project_id: projectId })))
    .select()

  if (error) throw error
  return data
}

export async function getLayoutObjects(projectId: string) {
  const { data, error } = await supabase
    .from('layout_objects')
    .select('*')
    .eq('project_id', projectId)

  if (error) throw error
  return data
}