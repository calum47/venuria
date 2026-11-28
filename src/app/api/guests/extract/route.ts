import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { GUEST_IMPORT_MAX_BYTES, importKind } from '@/lib/guestImport'
import { extractGuestsWithClaude } from '@/lib/guestImportServer'

// Reads guests (names, VIP, speeches, age group, dietary, notes, families) out of an uploaded PDF or CSV. The browser sends the file here, never to
// Anthropic, and never sees the API key. Signed-in users only. Nothing is stored: the file is
// read in memory, sent to Claude and discarded.

export const runtime = 'nodejs'
// Reading can take several seconds. Vercel caps this by plan; the value is a ceiling, not a promise.
export const maxDuration = 60

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

export async function POST(request: Request) {
  const t = await getTranslations('Guests')
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return fail(401, 'unauthorized', t('extractSignIn'))

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fail(503, 'not_configured', t('extractNotConfigured'))

  let file: unknown
  try {
    file = (await request.formData()).get('file')
  } catch {
    return fail(400, 'bad_request', t('extractBadUpload'))
  }
  if (!(file instanceof File)) return fail(400, 'bad_request', t('extractNoFile'))
  if (file.size === 0 || file.size > GUEST_IMPORT_MAX_BYTES) return fail(413, 'too_large', t('extractEmptyOrLarge'))

  const kind = importKind(file)
  if (kind !== 'pdf' && kind !== 'csv') return fail(400, 'bad_type', t('extractBadType'))

  const bytes = Buffer.from(await file.arrayBuffer())
  let source
  if (kind === 'pdf') {
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return fail(400, 'bad_pdf', t('extractBadPdf'))
    source = { kind: 'pdf' as const, data: bytes }
  } else {
    source = { kind: 'text' as const, text: bytes.toString('utf8') }
  }

  const out = await extractGuestsWithClaude(source, { apiKey, model: process.env.ANTHROPIC_MODEL }, t)
  if (!out.ok) return fail(out.status, out.code, out.message)
  return NextResponse.json({ ok: true, guests: out.guests, families: out.families })
}
