import { supabase } from './client'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'

// Timetable / Run-Down data access (migration 019). Browser client; RLS is the
// real gate (planner_can_access_project for days and blocks, team for vendors).

// ── Days ─────────────────────────────────────────────────────────────────────

export async function createDay(projectId: string, label: string, dayDate: string | null, position: number): Promise<DbProjectDay> {
  const { data, error } = await supabase
    .from('project_days')
    .insert({ project_id: projectId, label: label.trim(), day_date: dayDate, position })
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectDay
}

export async function updateDay(id: string, patch: { label?: string; day_date?: string | null }): Promise<DbProjectDay> {
  const next = { ...patch, ...(patch.label !== undefined ? { label: patch.label.trim() } : {}) }
  const { data, error } = await supabase.from('project_days').update(next).eq('id', id).select('*').single()
  if (error) throw error
  return data as DbProjectDay
}

/** Deletes the day and (by cascade) every block on it. */
export async function deleteDay(id: string): Promise<void> {
  const { error } = await supabase.from('project_days').delete().eq('id', id)
  if (error) throw error
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export type BlockInput = {
  title: string
  start_min: number
  end_min: number
  vendor_id: string | null
  person: string | null
  notes: string | null
}

export async function createBlock(projectId: string, dayId: string, input: BlockInput): Promise<DbTimetableBlock> {
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('timetable_blocks')
    .insert({ project_id: projectId, day_id: dayId, ...input, title: input.title.trim(), created_by: auth.user?.id ?? null })
    .select('*')
    .single()
  if (error) throw error
  return data as DbTimetableBlock
}

export type BlockPatch = Partial<
  BlockInput & { materials: string[]; show_vendor: boolean; show_contact: boolean; show_instagram: boolean }
>

export async function updateBlock(id: string, patch: BlockPatch): Promise<DbTimetableBlock> {
  const next = { ...patch, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}) }
  const { data, error } = await supabase.from('timetable_blocks').update(next).eq('id', id).select('*').single()
  if (error) throw error
  return data as DbTimetableBlock
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('timetable_blocks').delete().eq('id', id)
  if (error) throw error
}

// ── Vendors ──────────────────────────────────────────────────────────────────

export type VendorInput = {
  name: string
  colour: string
  contact_name: string | null
  phone: string | null
  email: string | null
  instagram: string | null
  notes: string | null
}

export async function createVendor(teamId: string, input: VendorInput): Promise<DbTeamVendor> {
  const { data, error } = await supabase
    .from('team_vendors')
    .insert({ team_id: teamId, ...input, name: input.name.trim() })
    .select('*')
    .single()
  if (error) throw error
  return data as DbTeamVendor
}

export async function updateVendor(id: string, input: VendorInput): Promise<DbTeamVendor> {
  const { data, error } = await supabase
    .from('team_vendors')
    .update({ ...input, name: input.name.trim() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbTeamVendor
}

/** Blocks that used this vendor keep existing, just untagged (on delete set null). */
export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase.from('team_vendors').delete().eq('id', id)
  if (error) throw error
}
