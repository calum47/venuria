import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getVendorContext, type VendorContext } from '@/lib/supabase/vendorContext'

export type VendorProject = {
  ctx: VendorContext
  project: { id: string; event_date: string | null; couple_names: string | null; venue_id: string; venueName: string | null }
}

/**
 * Shared by the vendor's project pages. The project row is only readable when a planner added this
 * vendor to it (RLS, migration 048); anything else is indistinguishable from "does not exist".
 */
export async function loadVendorProject(supabase: SupabaseClient, projectId: string): Promise<VendorProject | null> {
  const ctx = await getVendorContext(supabase)
  if (!ctx) return null
  const { data: allowed } = await supabase.rpc('vendor_can_view_project', { pid: projectId })
  if (allowed !== true) notFound()
  const { data: project } = await supabase
    .from('projects')
    .select('id, event_date, couple_names, venue_id, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()
  return {
    ctx,
    project: {
      id: project.id,
      event_date: project.event_date,
      couple_names: project.couple_names,
      venue_id: project.venue_id,
      venueName: (project.venues as unknown as { name: string } | null)?.name ?? null,
    },
  }
}
