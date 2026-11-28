/**
 * Content of the public RSVP page (migration 026). Pure helpers.
 *
 * Sections: cover photo, day-by-day, the big day (title, schedule, venue map link), area (text
 * and photos), hotels. A section is shown only when the planner has it switched
 * on AND it has something in it, so an empty section never leaves a heading
 * with nothing under it.
 */
import type { Tr } from '@/i18n/types'
import { pickText, type TranslationLang } from './rsvpTranslations'

export const RSVP_MEDIA_BUCKET = 'rsvp-media'
export const MAX_AREA_PHOTOS = 6
export const MAX_HOTELS = 8
export const MAX_EVENTS = 14
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

export type PublicEvent = {
  id: string
  date: string | null
  startsAt: string | null
  endsAt: string | null
  title: string
  location: string | null
  description: string | null
  tag: string | null
}

export type PublicContent = {
  coverUrl: string | null
  /** The day-by-day programme. */
  details: { events: PublicEvent[] } | null
  /** The wedding-day block: its title (null = the page's default), the schedule one line per row, the venue map link. */
  schedule: { title: string | null; lines: string[]; mapUrl: string | null } | null
  /** The venue's map link, also used by the map in the hotels section. */
  venueMapUrl: string | null
  area: { text: string | null; photos: { url: string; caption: string | null }[] } | null
  /** Empty (and no map) = the hotels section is not shown. */
  hotels: PublicHotel[]
  /** The map of the venue and hotels; null = the planner has not switched it on, or nothing could be placed. */
  map: { venue: { lat: number; lng: number } | null } | null
}

type CfgLike = {
  cover_path: string | null
  schedule: string | null
  schedule_title: string | null
  map_url: string | null
  area_text: string | null
  show_details: boolean
  show_schedule: boolean
  show_area: boolean
  show_hotels: boolean
  show_map: boolean
  map_lat: number | null
  map_lng: number | null
  translations: unknown
}

/**
 * What a guest sees, from the saved settings plus signed URLs (path → URL).
 * A photo or cover whose URL could not be signed is simply left out.
 */
export function buildPublicContent(
  cfg: CfgLike,
  photos: { path: string; caption: string | null; translations: unknown }[],
  hotels: { id: string; name: string; address: string | null; url: string | null; booking_note: string | null; description: string | null; image_path: string | null; maps_url: string | null; lat: number | null; lng: number | null; translations: unknown }[],
  urls: Record<string, string>,
  lang: TranslationLang,
  eventRows: { id: string; position: number; event_date: string | null; starts_at: string | null; ends_at: string | null; title: string; location: string | null; description: string | null; tag: string | null; translations: unknown }[] = [],
): PublicContent {
  // The planner's own wording, in the guest's language when a translation is stored for it (migration 055).
  const events: PublicEvent[] = [...eventRows]
    .sort((a, b) => (a.event_date ?? '9999').localeCompare(b.event_date ?? '9999') || (a.starts_at ?? '99').localeCompare(b.starts_at ?? '99') || a.position - b.position)
    .map((e) => ({
      id: e.id,
      date: e.event_date,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      title: pickText(e.translations, lang, 'title', e.title)?.trim() || e.title,
      location: pickText(e.translations, lang, 'location', e.location)?.trim() || null,
      description: pickText(e.translations, lang, 'description', e.description)?.trim() || null,
      tag: pickText(e.translations, lang, 'tag', e.tag)?.trim() || null,
    }))
  const lines = scheduleLines(pickText(cfg.translations, lang, 'schedule', cfg.schedule))
  const scheduleTitle = pickText(cfg.translations, lang, 'schedule_title', cfg.schedule_title)?.trim() || null
  const mapUrl = cfg.map_url?.trim() || null
  const areaText = pickText(cfg.translations, lang, 'area_text', cfg.area_text)?.trim() || null
  const areaPhotos = photos.filter((p) => urls[p.path]).map((p) => ({ url: urls[p.path], caption: pickText(p.translations, lang, 'caption', p.caption)?.trim() || null }))

  const hotelList = cfg.show_hotels
    ? hotels.map((h) => ({
        id: h.id,
        name: h.name,
        address: h.address?.trim() || null,
        url: h.url?.trim() || null,
        bookingNote: pickText(h.translations, lang, 'booking_note', h.booking_note)?.trim() || null,
        description: pickText(h.translations, lang, 'description', h.description)?.trim() || null,
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
    details: cfg.show_details && events.length > 0 ? { events } : null,
    schedule: cfg.show_schedule && (lines.length > 0 || mapUrl) ? { title: scheduleTitle, lines, mapUrl } : null,
    venueMapUrl: mapUrl,
    area: cfg.show_area && (areaText || areaPhotos.length > 0) ? { text: areaText, photos: areaPhotos } : null,
    hotels: hotelList,
    map,
  }
}
