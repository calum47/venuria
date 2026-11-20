/**
 * Guest-list import helpers shared by the editor's guest panel and the Guests page.
 * Pure functions first (easy to test), then the browser-side file reader.
 *
 * - .txt is read right here in the browser: one name per line, no AI involved.
 * - .csv and .pdf are sent to /api/guests/extract, which asks Claude on the server.
 *   The browser never talks to Anthropic and never holds an API key.
 */

/** Keep well under Vercel's request-body limit (about 4.5 MB on serverless functions; not verified for every plan). */
export const GUEST_IMPORT_MAX_BYTES = 3_000_000
export const MAX_IMPORT_NAMES = 500
export const MAX_NAME_LENGTH = 120

// "1. Ana", "2) Ana", "- Ana", "• Ana", "3 - Ana" -> "Ana"
const LEADING_MARK = /^(?:[-*•·–—]+|\(?\d{1,3}[.)\]])\s+|^\d{1,3}\s+[-–—]\s+/

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Trim, drop list markers, collapse spaces, remove blanks/over-long lines, de-duplicate (case/accent-insensitive), cap. */
export function cleanNames(raw: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    let s = item.replace(/^﻿/, '').trim()
    s = s.replace(LEADING_MARK, '').replace(/\s+/g, ' ').replace(/^["“”']+|["“”']+$/g, '').trim()
    if (!s || s.length > MAX_NAME_LENGTH) continue
    const key = fold(s)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= MAX_IMPORT_NAMES) break
  }
  return out
}

export function namesFromText(text: string): string[] {
  return cleanNames(text.split(/\r?\n/))
}

/** Names not already in the list (case/accent-insensitive), plus how many were skipped. */
export function splitNew(names: string[], existing: string[]): { fresh: string[]; skipped: number } {
  const have = new Set(existing.map(fold))
  const fresh: string[] = []
  for (const n of names) if (!have.has(fold(n))) fresh.push(n)
  return { fresh, skipped: names.length - fresh.length }
}

export type ImportKind = 'text' | 'csv' | 'pdf'

export function importKind(file: { name: string; type: string }): ImportKind | null {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (n.endsWith('.csv') || file.type === 'text/csv') return 'csv'
  if (n.endsWith('.txt') || file.type === 'text/plain') return 'text'
  return null
}

export const IMPORT_ACCEPT = '.txt,.csv,.pdf'

/** Browser side. Resolves to cleaned names; rejects with a message that is safe to show. */
export async function readGuestFile(file: File): Promise<string[]> {
  const kind = importKind(file)
  if (!kind) throw new Error('Unsupported file. Use a .txt, .csv or .pdf file.')
  if (file.size === 0) throw new Error('That file is empty.')
  if (file.size > GUEST_IMPORT_MAX_BYTES) throw new Error('That file is too large (limit 3 MB).')

  if (kind === 'text') return namesFromText(await file.text())

  const body = new FormData()
  body.append('file', file)
  let res: Response
  try {
    res = await fetch('/api/guests/extract', { method: 'POST', body })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; names?: unknown; message?: string } | null
  if (!res.ok || !json?.ok || !Array.isArray(json.names)) {
    throw new Error(json?.message || 'Could not read that file. Paste the names instead.')
  }
  return cleanNames(json.names)
}
