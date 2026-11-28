import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { translateTexts } from '@/lib/rsvpTranslateServer'
import { TRANSLATED_FIELDS, mergeTranslations, needsTranslation } from '@/lib/rsvpTranslations'

/**
 * Translates the planner's RSVP page text for a project into ES / EN / FR and stores it (migration 055).
 * Called by the planner's browser after saving text. Everything is read and written with the planner's own session,
 * so row-level security decides whether they may touch this project. Only text without an up-to-date translation
 * is sent to Claude, so calling it when nothing changed costs nothing.
 */
export const runtime = 'nodejs'
export const maxDuration = 60

type Row = Record<string, unknown> & { id?: string; translations?: unknown }

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 })

  const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ ok: false, reason: 'bad_request' }, { status: 400 })

  const [cfgQ, photosQ, hotelsQ] = await Promise.all([
    supabase.from('project_rsvp').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('project_rsvp_photos').select('*').eq('project_id', projectId),
    supabase.from('project_rsvp_hotels').select('*').eq('project_id', projectId),
  ])
  const cfg = cfgQ.data as Row | null
  if (!cfg) return NextResponse.json({ ok: true, translated: 0 })

  type Target = { table: keyof typeof TRANSLATED_FIELDS; key: Record<string, string>; row: Row }
  const targets: Target[] = [
    { table: 'project_rsvp', key: { project_id: projectId }, row: cfg },
    ...((photosQ.data ?? []) as Row[]).map((row) => ({ table: 'project_rsvp_photos' as const, key: { id: String(row.id) }, row })),
    ...((hotelsQ.data ?? []) as Row[]).map((row) => ({ table: 'project_rsvp_hotels' as const, key: { id: String(row.id) }, row })),
  ]

  // One request for everything that is out of date.
  const todo: { id: string; text: string }[] = []
  targets.forEach((tg, i) => {
    for (const f of TRANSLATED_FIELDS[tg.table]) {
      const text = tg.row[f] as string | null
      if (needsTranslation(tg.row.translations, f, text)) todo.push({ id: `${i}:${f}`, text: text!.trim() })
    }
  })
  if (todo.length === 0) return NextResponse.json({ ok: true, translated: 0 })

  const out = await translateTexts(todo, { apiKey, model: process.env.ANTHROPIC_MODEL })
  if (!out.ok) return NextResponse.json({ ok: false, reason: out.reason }, { status: 502 })

  let failed = 0
  for (let i = 0; i < targets.length; i++) {
    const tg = targets[i]
    const fresh: Record<string, Record<'es' | 'en' | 'fr', string>> = {}
    for (const f of TRANSLATED_FIELDS[tg.table]) if (out.items[`${i}:${f}`]) fresh[f] = out.items[`${i}:${f}`]
    if (Object.keys(fresh).length === 0) continue
    const texts = Object.fromEntries(TRANSLATED_FIELDS[tg.table].map((f) => [f, tg.row[f] as string | null]))
    const translations = mergeTranslations(tg.row.translations, texts, fresh)
    let q = supabase.from(tg.table).update({ translations })
    for (const [k, v] of Object.entries(tg.key)) q = q.eq(k, v)
    const { error } = await q
    if (error) failed++
  }
  const missing = todo.filter((t) => !out.items[t.id]).length
  return NextResponse.json({ ok: failed === 0 && missing === 0, translated: Object.keys(out.items).length })
}
