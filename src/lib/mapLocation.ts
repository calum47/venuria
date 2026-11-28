/**
 * Finding a place on the map from what a planner typed. Pure helpers (no I/O), so they are easy to test;
 * the lookups that need the network live in /api/rsvp/locate.
 *
 * A Google Maps link can hold the position in several ways. In order of how exact they are:
 *   …!3d36.7213!4d-4.4217      the place itself (what a "place" link carries)
 *   ?q=36.72,-4.42  ?ll=…      an explicit position
 *   …/@36.72,-4.42,17z         the CENTRE OF THE VIEW, usually close to the place but not exactly it
 * A link with only a name (/maps/place/Hotel+Name) has no position: the name is returned so it can be looked up.
 */

export type LatLng = { lat: number; lng: number }

const validPoint = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'

export type ParsedMapsUrl = { point: LatLng } | { place: string } | null

export function parseMapsUrl(input: string): ParsedMapsUrl {
  let s = input.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep the raw text */
  }
  const place = new RegExp(`!3d${NUM}!4d${NUM}`).exec(s)
  if (place) {
    const p = validPoint(Number(place[1]), Number(place[2]))
    if (p) return { point: p }
  }
  const query = new RegExp(`[?&](?:q|query|ll|destination|daddr|center)=\\s*${NUM}\\s*,\\s*${NUM}(?:[&#]|$)`, 'i').exec(s)
  if (query) {
    const p = validPoint(Number(query[1]), Number(query[2]))
    if (p) return { point: p }
  }
  const view = new RegExp(`/@${NUM},${NUM}`).exec(s)
  if (view) {
    const p = validPoint(Number(view[1]), Number(view[2]))
    if (p) return { point: p }
  }
  const name = /\/maps\/place\/([^/@?#]+)/i.exec(s) ?? /[?&](?:q|query)=([^&#]+)/i.exec(s)
  if (name) {
    const text = name[1].replace(/\+/g, ' ').trim()
    if (text && !new RegExp(`^${NUM}\\s*,\\s*${NUM}$`).test(text)) return { place: text.slice(0, 200) }
  }
  return null
}

/** Hosts that only redirect to the real link (their address holds no position, so the server follows them). */
export function isShortMapsHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'maps.app.goo.gl' || h === 'goo.gl'
}

/**
 * Google sometimes answers a first visit from the EU with a cookie-consent page; the link we wanted is
 * kept in its `continue` parameter. Returns that link, or the address unchanged.
 */
export function unwrapConsent(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.toLowerCase() === 'consent.google.com') return u.searchParams.get('continue') ?? url
  } catch {
    /* not a URL */
  }
  return url
}

/** Straight-line distance in km (haversine). Not a driving or walking distance. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "350 m" under a kilometre, otherwise "1.2 km" (one decimal; whole km from 10 km on). */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

/** A Google Maps link for a position (used when the hotel has no Maps link of its own). */
export function googleMapsPointLink(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
}
