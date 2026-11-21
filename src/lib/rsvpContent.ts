/**
 * Content of the public RSVP page (migration 026). Pure helpers.
 *
 * Sections: cover photo, details (schedule, dress code, map link), area (text
 * and photos), hotels. A section is shown only when the planner has it switched
 * on AND it has something in it, so an empty section never leaves a heading
 * with nothing under it.
 */

export const RSVP_MEDIA_BUCKET = 'rsvp-media'
export const MAX_AREA_PHOTOS = 6
export const MAX_HOTELS = 8
/** Longest edge, in pixels, after the browser shrinks a photo before upload. */
export const RSVP_COVER_EDGE = 1600
export const RSVP_PHOTO_EDGE = 1200
export const MAX_SCHEDULE_LINES = 30

export function scheduleLines(schedule: string | null | undefined): string[] {
  return (schedule ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_SCHEDULE_LINES)
}

/**
 * A link the planner typed. "www.hotel.com" becomes https://www.hotel.com/.
 * Only http(s) is accepted (never javascript:, data:, mailto: …), and the host
 * must look like a domain. Empty input means "no link".
 */
export function normalizeWebUrl(input: string): { ok: true; url: string | null } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: true, url: null }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return { ok: false, error: 'That does not look like a web address.' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Use a web address starting with http:// or https://.' }
  if (!u.hostname.includes('.')) return { ok: false, error: 'That does not look like a web address.' }
  const url = u.toString()
  if (url.length > 500) return { ok: false, error: 'That address is too long (500 characters at most).' }
  return { ok: true, url }
}

export type PublicHotel = {
  id: string
  name: string
  address: string | null
  url: string | null
  bookingNote: string | null
  description: string | null
  imageUrl: string | null
}

export type PublicContent = {
  coverUrl: string | null
  details: { lines: string[]; dressCode: string | null; mapUrl: string | null } | null
  area: { text: string | null; photos: { url: string; caption: string | null }[] } | null
  /** Empty = the hotels section is not shown. */
  hotels: PublicHotel[]
}

type CfgLike = {
  cover_path: string | null
  schedule: string | null
  dress_code: string | null
  map_url: string | null
  area_text: string | null
  show_details: boolean
  show_area: boolean
  show_hotels: boolean
}

/**
 * What a guest sees, from the saved settings plus signed URLs (path → URL).
 * A photo or cover whose URL could not be signed is simply left out.
 */
export function buildPublicContent(
  cfg: CfgLike,
  photos: { path: string; caption: string | null }[],
  hotels: { id: string; name: string; address: string | null; url: string | null; booking_note: string | null; description: string | null; image_path: string | null }[],
  urls: Record<string, string>,
): PublicContent {
  const lines = scheduleLines(cfg.schedule)
  const dressCode = cfg.dress_code?.trim() || null
  const mapUrl = cfg.map_url?.trim() || null
  const areaText = cfg.area_text?.trim() || null
  const areaPhotos = photos.filter((p) => urls[p.path]).map((p) => ({ url: urls[p.path], caption: p.caption?.trim() || null }))

  return {
    coverUrl: cfg.cover_path ? urls[cfg.cover_path] ?? null : null,
    details: cfg.show_details && (lines.length > 0 || dressCode || mapUrl) ? { lines, dressCode, mapUrl } : null,
    area: cfg.show_area && (areaText || areaPhotos.length > 0) ? { text: areaText, photos: areaPhotos } : null,
    hotels: cfg.show_hotels
      ? hotels.map((h) => ({
          id: h.id,
          name: h.name,
          address: h.address?.trim() || null,
          url: h.url?.trim() || null,
          bookingNote: h.booking_note?.trim() || null,
          description: h.description?.trim() || null,
          imageUrl: h.image_path ? urls[h.image_path] ?? null : null,
        }))
      : [],
  }
}
