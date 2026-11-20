import { NextResponse } from 'next/server'
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
  let path: unknown
  try {
    path = ((await request.json()) as { path?: unknown }).path
  } catch {
    return fail(400, 'bad_request', 'Invalid request.')
  }
  if (typeof path !== 'string' || !PATH_RE.test(path)) return fail(400, 'bad_request', 'Invalid file path.')

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return fail(401, 'unauthorized', 'Please sign in again.')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fail(503, 'not_configured', 'PDF reading is not set up yet (ANTHROPIC_API_KEY is missing on the server).')
  }

  // Storage RLS decides access: a planner who cannot open this project cannot read this path.
  const { data: blob, error: dlErr } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
  if (dlErr || !blob) return fail(404, 'not_found', 'Could not open that PDF.')
  if (blob.size === 0 || blob.size > MAX_PDF_BYTES) return fail(413, 'too_large', 'That PDF is empty or too large.')
  const bytes = Buffer.from(await blob.arrayBuffer())
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return fail(400, 'bad_pdf', 'That file does not look like a valid PDF.')

  const out = await extractWithClaude(bytes, { apiKey, model: process.env.ANTHROPIC_MODEL })
  if (!out.ok) return fail(out.status, out.code, out.message)
  return NextResponse.json(out)
}
