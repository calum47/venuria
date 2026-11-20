import { supabase } from './client'
import type { DbProjectRoomSetting } from '@/types/db'
import type { CapacityMode } from '@/lib/capacity'

// Area capacity (migration 024). Browser client; RLS (planner_can_access_project for
// the project settings, venue_manage_own_rooms for the figures) is the real gate.

export async function getRoomSettings(projectId: string): Promise<DbProjectRoomSetting[]> {
  const { data, error } = await supabase.from('project_room_settings').select('*').eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as DbProjectRoomSetting[]
}

/** Creates the setting, or changes the mode (which clears any acknowledgement — the database does that). */
export async function setRoomMode(projectId: string, roomId: string, mode: CapacityMode): Promise<DbProjectRoomSetting> {
  const { data, error } = await supabase
    .from('project_room_settings')
    .upsert({ project_id: projectId, room_id: roomId, mode }, { onConflict: 'project_id,room_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectRoomSetting
}

/** Continue past the limit: stores the note and the load it covers. Shows up in the project activity log. */
export async function acknowledgeOverLimit(projectId: string, roomId: string, note: string, load: number): Promise<DbProjectRoomSetting> {
  const { data, error } = await supabase
    .from('project_room_settings')
    .update({ override_note: note, override_load: load })
    .eq('project_id', projectId)
    .eq('room_id', roomId)
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectRoomSetting
}

/** Venue Manager: the two figures for a room. null clears one. */
export async function updateRoomCapacity(roomId: string, seated: number | null, standing: number | null): Promise<void> {
  const { error } = await supabase
    .from('rooms')
    .update({ capacity_seated: seated, capacity_standing: standing })
    .eq('id', roomId)
  if (error) throw error
}
