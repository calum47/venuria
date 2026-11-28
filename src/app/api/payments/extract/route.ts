import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DOCUMENTS_BUCKET, MAX_PDF_BYTES } from '@/lib/payments'
import { extractWithClaude } from '@/lib/pdfPaymentsServer'

// Reads payment details (vendor, amount, due date…) out of a PDF already uploaded to the
// private project-documents bucket. The browser never sees the API key and never talks to
// Anthropic: it sends the storage path, this route downloads the file AS THE SIGNED-IN USER
// (so the bucket's RLS decides whether they may read it) and asks Claude to extract.

export const runtime = 'nodejs'
// PDF reading can take several seconds. Vercel caps this by plan; the value is a ceiling, not a promise.
export const maxDuration = 60

const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

export async function POST(request: Request) {
  const t = await getTranslations('Pay')
  let path: unknown
  try {
    path = ((await request.json()) as { path?: unknown }).path
  } catch {
    return fail(400, 'bad_request', t('extractBadRequest'))
  }
  if (typeof path !== 'string' || !PATH_RE.test(path)) return fail(400, 'bad_request', t('extractBadPath'))

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return fail(401, 'unauthorized', t('extractSignIn'))

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fail(503, 'not_configured', t('extractNotConfigured'))
  }

  // Storage RLS decides access: a planner who cannot open this project cannot read this path.
  const { data: blob, error: dlErr } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
  if (dlErr || !blob) return fail(404, 'not_found', t('extractNotFound'))
  if (blob.size === 0 || blob.size > MAX_PDF_BYTES) return fail(413, 'too_large', t('extractTooLarge'))
  const bytes = Buffer.from(await blob.arrayBuffer())
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return fail(400, 'bad_pdf', t('notValidPdf'))

  const out = await extractWithClaude(bytes, { apiKey, model: process.env.ANTHROPIC_MODEL }, t)
  if (!out.ok) return fail(out.status, out.code, out.message)
  return NextResponse.json(out)
}
