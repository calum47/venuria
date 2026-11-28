/**
 * Guest list details — pure helpers (no React, no Supabase), so they can be
 * unit-tested on their own. Types are structural so tests don't need the DB
 * types.
 */
import { addDays, isIsoDate } from '@/lib/projectDates'
import { INTL_TAG, type Locale } from '@/i18n/config'
import type { Tr } from '@/i18n/types'

export const GUEST_PHOTOS_BUCKET = 'guest-photos'
/** The bucket limit. Photos are downsized long before this (see PHOTO_MAX_EDGE). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
/** Largest original we will try to decode in the browser before resizing. */
export const MAX_SOURCE_PHOTO_BYTES = 20 * 1024 * 1024
/** Longest edge of the stored photo, px. Plenty for an avatar/card, tiny on disk. */
export const PHOTO_MAX_EDGE = 640
export const MAX_STAY_RANGE_NIGHTS = 31

export type AgeGroup = 'adult' | 'child' | 'baby'
/** `t` is the "Guests" translator. */
export function ageLabel(group: AgeGroup, t: Tr): string {
  return t(`age.${group}`)
}

// ── Small display helpers ────────────────────────────────────────────────────

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** '4 Jun' — no year; the stay is always near the event date. */
export function shortDate(isoDate: string, locale: Locale): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(INTL_TAG[locale], {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

// ── Photos ───────────────────────────────────────────────────────────────────

export type ImageKind = 'jpeg' | 'png' | 'webp'

/** What the bytes really are — the browser-claimed type and file name are not trusted. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) return 'webp'
  return null
}

/** Scale (w,h) down so the longest edge is at most `max`. Never upscales; never returns 0. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: 1, height: 1 }
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

// ── Hotel per night ──────────────────────────────────────────────────────────

export type Stay = { night: string; hotel: string }
export type StayRun = { hotel: string; from: string; to: string; nights: number }

/** Every night from `from` to `to` inclusive, or why it can't be done. */
export function nightsInRange(from: string, to: string, t: Tr): { ok: true; nights: string[] } | { ok: false; error: string } {
  if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, error: t('stayInvalid') }
  if (to < from) return { ok: false, error: t('stayReversed') }
  const nights: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    nights.push(d)
    if (nights.length > MAX_STAY_RANGE_NIGHTS) {
      return { ok: false, error: t('stayTooLong', { max: MAX_STAY_RANGE_NIGHTS }) }
    }
  }
  return { ok: true, nights }
}

/** Consecutive nights at the same hotel collapse into one run. Sorted by date. */
export function stayRuns(stays: Stay[]): StayRun[] {
  const sorted = [...stays].sort((a, b) => a.night.localeCompare(b.night))
  const runs: StayRun[] = []
  for (const s of sorted) {
    const last = runs[runs.length - 1]
    if (last && last.hotel === s.hotel && addDays(last.to, 1) === s.night) {
      last.to = s.night
      last.nights += 1
    } else {
      runs.push({ hotel: s.hotel, from: s.night, to: s.night, nights: 1 })
    }
  }
  return runs
}

export function runLabel(r: StayRun, locale: Locale): string {
  return r.from === r.to ? `${r.hotel} · ${shortDate(r.from, locale)}` : `${r.hotel} · ${shortDate(r.from, locale)}–${shortDate(r.to, locale)}`
}

/** One line for the table: runs joined, empty string when no stays. */
export function staySummary(stays: Stay[], locale: Locale): string {
  return stayRuns(stays).map((r) => runLabel(r, locale)).join(' · ')
}

// ── Seats ────────────────────────────────────────────────────────────────────

export type SeatObject = {
  id: string
  room_id: string
  catalog_item_id: string
  extra_data: Record<string, unknown> | null
}
export type SeatAssignmentRow = { guest_id: string; layout_object_id: string }
export type SeatInfo = { room: string; table: string; seat: number | null }

/**
 * Where each guest sits, per room. A chair points at its table through
 * extra_data.isChairFor; the table's label is extra_data.tableLabel, else its
 * catalog name. The seat number mirrors the editor: the chair's position among
 * the chairs of the same table in the same room.
 */
export function buildSeatIndex(
  objects: SeatObject[],
  assignments: SeatAssignmentRow[],
  roomNames: Record<string, string>,
  catalogNames: Record<string, string>,
  t: Tr,
): Record<string, SeatInfo[]> {
  const byId = new Map(objects.map((o) => [o.id, o]))
  const out: Record<string, SeatInfo[]> = {}

  const labelOf = (o: SeatObject) => {
    const custom = o.extra_data?.tableLabel
    if (typeof custom === 'string' && custom.trim()) return custom.trim()
    return catalogNames[o.catalog_item_id] ?? t('table')
  }

  for (const a of assignments) {
    const obj = byId.get(a.layout_object_id)
    if (!obj) continue
    const tableId = obj.extra_data?.isChairFor
    const room = roomNames[obj.room_id] ?? t('room')
    let info: SeatInfo
    if (typeof tableId === 'string' && byId.has(tableId)) {
      const table = byId.get(tableId)!
      const sameTable = objects.filter(
        (o) => o.room_id === obj.room_id && o.extra_data?.isChairFor === tableId,
      )
      const idx = sameTable.findIndex((o) => o.id === obj.id)
      info = { room, table: labelOf(table), seat: idx >= 0 ? idx + 1 : null }
    } else {
      // Assigned to something that is not a chair of a known table.
      info = { room, table: labelOf(obj), seat: null }
    }
    ;(out[a.guest_id] ??= []).push(info)
  }
  for (const k of Object.keys(out)) {
    out[k].sort((x, y) => x.room.localeCompare(y.room) || x.table.localeCompare(y.table) || (x.seat ?? 0) - (y.seat ?? 0))
  }
  return out
}

export function seatLabel(s: SeatInfo, showRoom: boolean, t: Tr): string {
  const base = s.seat != null ? t('seatLabel', { table: s.table, seat: s.seat }) : s.table
  return showRoom ? `${s.room}: ${base}` : base
}

// ── Filtering, sorting, stats ────────────────────────────────────────────────

export type GuestLike = {
  id: string
  name: string
  notes: string | null
  is_vip: boolean
  gives_speech: boolean
  dietary: string | null
  age_group: AgeGroup
  family_id: string | null
  seat_dismissed_at?: string | null
  rsvp_status?: string | null
}
export type FamilyLike = { id: string; name: string }

export type GuestFilters = {
  query: string
  vip: boolean
  speech: boolean
  dietary: boolean
  unseated: boolean
  /** '' = any family, otherwise a family id. */
  familyId: string
}
export const NO_FILTERS: GuestFilters = { query: '', vip: false, speech: false, dietary: false, unseated: false, familyId: '' }

export function hasDietary(g: { dietary: string | null }): boolean {
  return !!g.dietary && g.dietary.trim().length > 0
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

/**
 * True when the guest should have a seat but has none: babies are exempt (they
 * sit on a lap) and a planner can dismiss the flag with a reason.
 */
export function needsSeat(
  g: { age_group: AgeGroup; seat_dismissed_at?: string | null; rsvp_status?: string | null },
  seatCount: number,
): boolean {
  // Someone who answered "declined" is not coming, so they need no seat.
  return seatCount === 0 && g.age_group !== 'baby' && !g.seat_dismissed_at && g.rsvp_status !== 'declined'
}

export function filterGuests<G extends GuestLike>(
  guests: G[],
  f: GuestFilters,
  ctx: { families: FamilyLike[]; seats: Record<string, SeatInfo[]>; stays: Record<string, Stay[]> },
): G[] {
  const q = f.query.trim().toLowerCase()
  const famName = new Map(ctx.families.map((x) => [x.id, x.name]))
  return guests.filter((g) => {
    if (f.vip && !g.is_vip) return false
    if (f.speech && !g.gives_speech) return false
    if (f.dietary && !hasDietary(g)) return false
    if (f.unseated && !needsSeat(g, ctx.seats[g.id]?.length ?? 0)) return false
    if (f.familyId && g.family_id !== f.familyId) return false
    if (q) {
      const hay = [
        g.name,
        g.notes ?? '',
        g.dietary ?? '',
        g.family_id ? famName.get(g.family_id) ?? '' : '',
        ...(ctx.stays[g.id] ?? []).map((s) => s.hotel),
      ].join('\n').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

const AGE_ORDER: Record<AgeGroup, number> = { adult: 0, child: 1, baby: 2 }

/**
 * 'name': alphabetical. 'family': a family sorts as one block (by family name)
 * with adults before children before babies, so linked guests sit together;
 * guests with no family sort by their own name among them.
 */
export function sortGuests<G extends GuestLike>(guests: G[], families: FamilyLike[], mode: 'name' | 'family'): G[] {
  if (mode === 'name') return [...guests].sort((a, b) => collator.compare(a.name, b.name))
  const famName = new Map(families.map((f) => [f.id, f.name]))
  const key = (g: G) => (g.family_id ? famName.get(g.family_id) ?? g.name : g.name)
  return [...guests].sort((a, b) => {
    const k = collator.compare(key(a), key(b))
    if (k !== 0) return k
    // Same key: two different families (or a guest) can share a name — keep blocks together by id.
    if ((a.family_id ?? '') !== (b.family_id ?? '')) return (a.family_id ?? '').localeCompare(b.family_id ?? '')
    return AGE_ORDER[a.age_group] - AGE_ORDER[b.age_group] || collator.compare(a.name, b.name)
  })
}

export type GuestStats = {
  total: number
  vip: number
  speech: number
  dietary: number
  unseated: number
  families: number
}

export function guestStats(guests: GuestLike[], seats: Record<string, SeatInfo[]>): GuestStats {
  return {
    total: guests.length,
    vip: guests.filter((g) => g.is_vip).length,
    speech: guests.filter((g) => g.gives_speech).length,
    dietary: guests.filter(hasDietary).length,
    unseated: guests.filter((g) => needsSeat(g, seats[g.id]?.length ?? 0)).length,
    families: new Set(guests.map((g) => g.family_id).filter(Boolean)).size,
  }
}

/** Other members of the same family, for the detail panel. */
export function familyMembers<G extends { id: string; family_id: string | null }>(guests: G[], familyId: string | null, exceptId?: string): G[] {
  if (!familyId) return []
  return guests.filter((g) => g.family_id === familyId && g.id !== exceptId)
}
