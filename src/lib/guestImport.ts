import type { Tr } from '@/i18n/types'
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

export type ImportAge = 'adult' | 'child' | 'baby'

/** One guest as read from a file. `family` is a key into ImportResult.families ('' = none). */
export type ImportGuest = {
  name: string
  vip: boolean
  speech: boolean
  age: ImportAge
  dietary: string
  notes: string
  family: string
}
export type ImportFamily = { key: string; name: string }
export type ImportResult = { guests: ImportGuest[]; families: ImportFamily[] }

export const MAX_DIETARY = 500 // guests.dietary check in migration 016
export const MAX_NOTES = 300
export const MAX_FAMILY_NAME = 80 // guest_families.name check in migration 016

export const blankGuest = (name: string): ImportGuest => ({ name, vip: false, speech: false, age: 'adult', dietary: '', notes: '', family: '' })

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/**
 * Sanitises an untrusted model/file result: names cleaned and de-duplicated, flags only when strictly `true`,
 * unknown ages become 'adult', family keys must exist, and a family needs at least two members.
 */
export function cleanImport(raw: unknown): ImportResult {
  const r = (raw ?? {}) as { guests?: unknown; families?: unknown }
  const rawGuests = Array.isArray(r.guests) ? r.guests : []
  const famName = new Map<string, string>()
  for (const f of Array.isArray(r.families) ? r.families : []) {
    const o = f as { key?: unknown; name?: unknown }
    const key = text(o?.key, 40)
    const name = text(o?.name, MAX_FAMILY_NAME)
    if (key && name && !famName.has(key)) famName.set(key, name)
  }
  const guests: ImportGuest[] = []
  const seen = new Set<string>()
  for (const g of rawGuests) {
    const o = (typeof g === 'string' ? { name: g } : g) as Record<string, unknown> | null
    const name = cleanNames([o?.name])[0]
    if (!name || seen.has(fold(name))) continue
    seen.add(fold(name))
    const age = o?.age_group === 'child' || o?.age_group === 'baby' ? o.age_group : 'adult'
    const fam = text(o?.family_key, 40)
    guests.push({
      name,
      vip: o?.vip === true,
      speech: o?.speech === true,
      age,
      dietary: text(o?.dietary, MAX_DIETARY),
      notes: text(o?.notes, MAX_NOTES),
      family: famName.has(fam) ? fam : '',
    })
    if (guests.length >= MAX_IMPORT_NAMES) break
  }
  const count = new Map<string, number>()
  for (const g of guests) if (g.family) count.set(g.family, (count.get(g.family) ?? 0) + 1)
  for (const g of guests) if (g.family && (count.get(g.family) ?? 0) < 2) g.family = ''
  const families = [...famName].filter(([k]) => (count.get(k) ?? 0) >= 2).map(([key, name]) => ({ key, name }))
  return { guests, families }
}

/** Browser side. Resolves to the guests found; rejects with a message that is safe to show. */
export async function readGuestFile(file: File, t: Tr): Promise<ImportResult> {
  const kind = importKind(file)
  if (!kind) throw new Error(t('importUnsupported'))
  if (file.size === 0) throw new Error(t('importEmptyFile'))
  if (file.size > GUEST_IMPORT_MAX_BYTES) throw new Error(t('importTooLarge'))

  if (kind === 'text') return { guests: namesFromText(await file.text()).map(blankGuest), families: [] }

  const body = new FormData()
  body.append('file', file)
  let res: Response
  try {
    res = await fetch('/api/guests/extract', { method: 'POST', body })
  } catch {
    throw new Error(t('importNetwork'))
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; guests?: unknown; families?: unknown; message?: string } | null
  if (!res.ok || !json?.ok || !Array.isArray(json.guests)) {
    throw new Error(json?.message || t('importUnreadable'))
  }
  return cleanImport(json)
}
