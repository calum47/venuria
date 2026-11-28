/**
 * Content of the public RSVP page (migration 026). Pure helpers.
 *
 * Sections: cover photo, details (schedule, dress code, map link), area (text
 * and photos), hotels. A section is shown only when the planner has it switched
 * on AND it has something in it, so an empty section never leaves a heading
 * with nothing under it.
 */
import type { Tr } from '@/i18n/types'

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
export function normalizeWebUrl(input: string, t: Tr): { ok: true; url: string | null } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: true, url: null }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return { ok: false, error: t('urlInvalid') }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: t('urlScheme') }
  if (!u.hostname.includes('.')) return { ok: false, error: t('urlInvalid') }
  const url = u.toString()
  if (url.length > 500) return { ok: false, error: t('urlLong') }
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
  /** The planner's Google Maps link for this hotel, if any. */
  mapsUrl: string | null
  /** Where the hotel is on the map; null = not found, so it is left off the map. */
  position: { lat: number; lng: number } | null
}

export type PublicContent = {
  coverUrl: string | null
  details: { lines: string[]; dressCode: string | null; mapUrl: string | null } | null
  area: { text: string | null; photos: { url: string; caption: string | null }[] } | null
  /** Empty (and no map) = the hotels section is not shown. */
  hotels: PublicHotel[]
  /** The map of the venue and hotels; null = the planner has not switched it on, or nothing could be placed. */
  map: { venue: { lat: number; lng: number } | null } | null
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
  show_map: boolean
  map_lat: number | null
  map_lng: number | null
}

/**
 * What a guest sees, from the saved settings plus signed URLs (path → URL).
 * A photo or cover whose URL could not be signed is simply left out.
 */
export function buildPublicContent(
  cfg: CfgLike,
  photos: { path: string; caption: string | null }[],
  hotels: { id: string; name: string; address: string | null; url: string | null; booking_note: string | null; description: string | null; image_path: string | null; maps_url: string | null; lat: number | null; lng: number | null }[],
  urls: Record<string, string>,
): PublicContent {
  const lines = scheduleLines(cfg.schedule)
  const dressCode = cfg.dress_code?.trim() || null
  const mapUrl = cfg.map_url?.trim() || null
  const areaText = cfg.area_text?.trim() || null
  const areaPhotos = photos.filter((p) => urls[p.path]).map((p) => ({ url: urls[p.path], caption: p.caption?.trim() || null }))

  const hotelList = cfg.show_hotels
    ? hotels.map((h) => ({
        id: h.id,
        name: h.name,
        address: h.address?.trim() || null,
        url: h.url?.trim() || null,
        bookingNote: h.booking_note?.trim() || null,
        description: h.description?.trim() || null,
        imageUrl: h.image_path ? urls[h.image_path] ?? null : null,
        mapsUrl: h.maps_url?.trim() || null,
        position: h.lat != null && h.lng != null ? { lat: h.lat, lng: h.lng } : null,
      }))
    : []
  const venue = cfg.map_lat != null && cfg.map_lng != null ? { lat: cfg.map_lat, lng: cfg.map_lng } : null
  // The map needs the hotels section to live in; it is shown when something can be placed on it.
  const map = cfg.show_map && (venue || hotelList.some((h) => h.position)) ? { venue } : null

  return {
    coverUrl: cfg.cover_path ? urls[cfg.cover_path] ?? null : null,
    details: cfg.show_details && (lines.length > 0 || dressCode || mapUrl) ? { lines, dressCode, mapUrl } : null,
    area: cfg.show_area && (areaText || areaPhotos.length > 0) ? { text: areaText, photos: areaPhotos } : null,
    hotels: hotelList,
    map,
  }
}
