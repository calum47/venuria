'use server'

import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { loadPdfExportData } from '@/lib/pdfExport/loadData'
import { normalizePdfStyle } from '@/lib/pdfExport/style'
import type { PdfExportData } from '@/lib/pdfExport/types'
import { revalidatePath } from 'next/cache'

/** Update the caller's own display name. RLS (planner_update_self) + the field-protection trigger keep this to the name only. */
export async function updateMyName(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (name.length < 2) return { error: 'Name must be at least 2 characters.' }

  const { error } = await supabase.from('planners').update({ name }).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/planner', 'layout')
  return {}
}

const CURRENCY_RE = /^[A-Z]{3}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Update team name / currency / the company details shown to RSVP guests. RLS (manager_update_team) rejects non-managers server-side regardless of the UI. */
export async function updateMyTeam(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const teamId = formData.get('teamId') as string
  const name = ((formData.get('name') as string | null) ?? '').trim()
  const currency = ((formData.get('currency') as string | null) ?? '').trim().toUpperCase()
  const companyName = ((formData.get('companyName') as string | null) ?? '').trim().replace(/\s+/g, ' ')
  const contactEmail = ((formData.get('contactEmail') as string | null) ?? '').trim()
  if (!teamId) return { error: 'Missing team.' }
  if (companyName && (companyName.length < 2 || companyName.length > 120)) return { error: 'Company name must be 2 to 120 characters.' }
  if (contactEmail && (contactEmail.length > 200 || !EMAIL_RE.test(contactEmail))) return { error: 'Enter a valid contact email.' }
  if (name.length < 2) return { error: 'Team name must be at least 2 characters.' }
  if (!CURRENCY_RE.test(currency)) return { error: 'Currency must be a 3-letter code, e.g. EUR.' }

  const { data, error } = await supabase
    .from('teams')
    .update({ name, currency, company_name: companyName || null, contact_email: contactEmail || null })
    .eq('id', teamId)
    .select('id')
  if (error) return { error: error.message }
  // RLS silently filters rather than erroring, so 0 rows = not allowed.
  if (!data || data.length === 0) return { error: 'Only the team manager can change this.' }
  revalidatePath('/planner', 'layout')
  return {}
}

// ── Exports: PDF/JPG look + team logo (manager only; RLS enforces it again) ──────────

const LOGO_BUCKET = 'team-logos'

/** Saves the team's export look. The style is re-validated here, so the stored JSON is always complete and in range. */
export async function saveExportStyle(raw: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) return { error: 'Not authenticated.' }
  if (ctx.planner.role !== 'manager') return { error: 'Only the team manager can change this.' }

  const style = normalizePdfStyle(raw)
  const { data, error } = await supabase.from('teams').update({ export_style: style }).eq('id', ctx.team.id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Only the team manager can change this.' }
  revalidatePath('/planner', 'layout')
  return {}
}

/**
 * Points the team at a freshly uploaded logo (or clears it with null) and removes the previous file.
 * The browser uploads the file itself (it re-encodes it first); this only records the path.
 */
export async function saveTeamLogo(path: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) return { error: 'Not authenticated.' }
  if (ctx.planner.role !== 'manager') return { error: 'Only the team manager can change this.' }
  if (path !== null && !(path.startsWith(`${ctx.team.id}/`) && path.length <= 200 && !path.includes('..'))) {
    return { error: 'Invalid logo path.' }
  }

  const { data: before } = await supabase.from('teams').select('logo_path').eq('id', ctx.team.id).maybeSingle()
  const { data, error } = await supabase.from('teams').update({ logo_path: path }).eq('id', ctx.team.id).select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'Only the team manager can change this.' }

  const old = (before as { logo_path: string | null } | null)?.logo_path
  if (old && old !== path) await supabase.storage.from(LOGO_BUCKET).remove([old]) // best effort; an orphan is harmless
  revalidatePath('/planner', 'layout')
  return {}
}

/** The data behind the live preview in Settings → Exports: a real project of the caller's team. */
export async function loadPreviewData(projectId: string): Promise<PdfExportData | null> {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx || ctx.planner.role !== 'manager') return null
  return loadPdfExportData(supabase, projectId)
}
