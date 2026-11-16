/**
 * Timetable helpers (migration 019). Pure — no React, no Supabase — so the
 * time maths can be tested on its own.
 *
 * Times are minutes from midnight of the block's day. A block may run past
 * midnight (end up to 1800 = 06:00 next day).
 */

export const MIN_PER_DAY = 1440
export const MAX_END_MIN = 1800
export const DRAG_SNAP_MIN = 15
export const MIN_BLOCK_MIN = 15
export const DEFAULT_VISIBLE_FROM = 8 * 60
export const DEFAULT_VISIBLE_TO = 24 * 60

export type BlockLike = { id: string; start_min: number; end_min: number }

/** "18:30", or "02:00 (+1)" when past midnight. */
export function formatMin(min: number): string {
  const day = Math.floor(min / MIN_PER_DAY)
  const m = ((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY
  const hh = String(Math.floor(m / 60)).padStart(2, '0')
  const mm = String(m % 60).padStart(2, '0')
  return `${hh}:${mm}${day > 0 ? ` (+${day})` : ''}`
}

export function formatRange(start: number, end: number): string {
  return `${formatMin(start)} – ${formatMin(end)}`
}

export function durationLabel(start: number, end: number): string {
  const d = end - start
  const h = Math.floor(d / 60)
  const m = d % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * Parses what a planner types: "18:30", "8:05", "18", "18.30", "6pm", "6:30 pm".
 * Returns minutes from midnight (0–1439) or null when it is not a time.
 */
export function parseTime(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\./g, ':')
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  if (min > 59) return null
  if (m[3]) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0)
  } else if (h > 23) {
    return null
  }
  return h * 60 + min
}

export function snap(min: number, step = DRAG_SNAP_MIN): number {
  return Math.round(min / step) * step
}

/**
 * Validates a typed start/end. `endIsNextDay` says an end earlier than the
 * start belongs to the next day (a 22:00 → 02:00 party).
 */
export function resolveTimes(
  startText: string,
  endText: string,
): { ok: true; start: number; end: number } | { ok: false; error: string } {
  const start = parseTime(startText)
  const endClock = parseTime(endText)
  if (start === null) return { ok: false, error: 'Start time is not a time (try 18:30).' }
  if (endClock === null) return { ok: false, error: 'End time is not a time (try 19:30).' }
  if (endClock === start) return { ok: false, error: 'End must be after start.' }
  // An end before the start can only mean "after midnight".
  const end = endClock > start ? endClock : endClock + MIN_PER_DAY
  if (end > MAX_END_MIN) return { ok: false, error: 'A block can run until 06:00 the next day at most.' }
  if (end - start < 1) return { ok: false, error: 'End must be after start.' }
  return { ok: true, start, end }
}

/** Moves a block by `delta` minutes, keeping its length and staying within the day window. */
export function shiftBlock(start: number, end: number, delta: number): { start: number; end: number } {
  const len = end - start
  let s = start + delta
  s = Math.max(0, Math.min(s, MAX_END_MIN - len, MIN_PER_DAY - 1))
  return { start: s, end: s + len }
}

/** Changes only the end (bottom-handle resize). */
export function resizeEnd(start: number, end: number, delta: number): { start: number; end: number } {
  const e = Math.max(start + MIN_BLOCK_MIN, Math.min(end + delta, MAX_END_MIN))
  return { start, end: e }
}

/**
 * Lays overlapping blocks side by side. Returns, per block id, its column and
 * how many columns its overlap cluster needs, so the UI can split the width.
 */
export function layoutColumns<B extends BlockLike>(blocks: B[]): Map<string, { col: number; cols: number }> {
  const sorted = [...blocks].sort((a, b) => a.start_min - b.start_min || b.end_min - a.end_min || a.id.localeCompare(b.id))
  const out = new Map<string, { col: number; cols: number }>()
  let cluster: { id: string; col: number }[] = []
  let clusterEnd = -1
  let colEnds: number[] = []

  const flush = () => {
    const cols = colEnds.length
    for (const c of cluster) out.set(c.id, { col: c.col, cols })
    cluster = []
    colEnds = []
    clusterEnd = -1
  }

  for (const b of sorted) {
    if (cluster.length > 0 && b.start_min >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= b.start_min)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(b.end_min)
    } else {
      colEnds[col] = b.end_min
    }
    cluster.push({ id: b.id, col })
    clusterEnd = Math.max(clusterEnd, b.end_min)
  }
  flush()
  return out
}

/** Hour range the calendar shows: 08:00–24:00 by default, widened to fit every block. */
export function visibleRange(blocks: BlockLike[]): { from: number; to: number } {
  let from = DEFAULT_VISIBLE_FROM
  let to = DEFAULT_VISIBLE_TO
  for (const b of blocks) {
    from = Math.min(from, Math.floor(b.start_min / 60) * 60)
    to = Math.max(to, Math.ceil(b.end_min / 60) * 60)
  }
  return { from, to }
}

export function sortBlocks<B extends BlockLike>(blocks: B[]): B[] {
  return [...blocks].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min || a.id.localeCompare(b.id))
}

/** Black or white text, whichever reads better on this background colour. */
export function readableText(hex: string): '#111827' | '#ffffff' {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#111827'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // Perceived brightness (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff'
}

/** "@handle" from "handle", "@handle" or an instagram.com URL; null when empty or unusable. */
export function instagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.trim()
  const url = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(s)
  if (url) s = url[1]
  s = s.replace(/^@+/, '').replace(/\/+$/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) return null
  return `@${s}`
}

export type VendorLike = {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  instagram: string | null
}

export type RundownBlock = BlockLike & {
  title: string
  vendor_id: string | null
  person: string | null
  notes: string | null
  materials: string[]
  show_vendor: boolean
  show_contact: boolean
  show_instagram: boolean
}

export type RundownRow<B extends RundownBlock> = {
  block: B
  vendorName: string | null
  /** Vendor contact lines (name, phone, email) — empty when the entry switches contact off or the vendor has none. The block's own "person in charge" is separate and always shown. */
  contact: string[]
  instagram: string | null
}

/**
 * Rows of the run-down for one day. `vendorFilter` is a set of vendor ids; an
 * empty/null filter means everything. A block with no vendor only appears in
 * the unfiltered view. Each entry's own switches decide what vendor info shows.
 */
export function rundownRows<B extends RundownBlock>(
  blocks: B[],
  vendors: Map<string, VendorLike>,
  vendorFilter: ReadonlySet<string> | null,
): RundownRow<B>[] {
  const filtered = vendorFilter && vendorFilter.size > 0
  return sortBlocks(blocks)
    .filter((b) => !filtered || (b.vendor_id !== null && vendorFilter!.has(b.vendor_id)))
    .map((block) => {
      const v = block.vendor_id ? vendors.get(block.vendor_id) : undefined
      const contact: string[] = []
      if (v && block.show_contact) {
        if (v.contact_name?.trim()) contact.push(v.contact_name.trim())
        if (v.phone) contact.push(v.phone)
        if (v.email) contact.push(v.email)
      }
      return {
        block,
        vendorName: v && block.show_vendor ? v.name : null,
        contact,
        instagram: v && block.show_instagram ? instagramHandle(v.instagram) : null,
      }
    })
}
