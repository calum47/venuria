import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isShortMapsHost, parseMapsUrl, unwrapConsent, type LatLng } from '@/lib/mapLocation'

/**
 * Finds a place's position for the RSVP map, from a Google Maps link and/or an address.
 * Planners only (any signed-in user; guests never reach this). The planner's browser calls it when they save,
 * and stores the result: guests viewing the page cause no lookups.
 *
 * Order: position inside the link → short link followed to its real address (server side, only the two short-link
 * hosts are ever fetched, so this cannot be pointed at other sites) → the place name from the link → the address.
 * Address and name lookups use OpenStreetMap's public Nominatim service, whose policy asks for a real
 * User-Agent and at most one request per second; a few lookups per save is well inside that.
 */

type Result = { ok: true; lat: number; lng: number; source: 'link' | 'link-name' | 'address' } | { ok: false; reason: 'none' | 'unreachable' }

const SHORT_HOPS = 4
const TIMEOUT_MS = 6000

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

/** Follows maps.app.goo.gl / goo.gl links by hand (one hop at a time) until the address is no longer a short link. */
async function expandShortLink(url: string): Promise<{ url: string; unreachable: boolean }> {
  let current = url
  for (let i = 0; i < SHORT_HOPS; i++) {
    let host: string
    try {
      host = new URL(current).hostname
    } catch {
      return { url: current, unreachable: false }
    }
    if (!isShortMapsHost(host)) return { url: current, unreachable: false }
    let res: Response
    try {
      res = await withTimeout(current, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; VenuriaMapLookup/1.0)', 'accept-language': 'en' } })
    } catch {
      return { url: current, unreachable: true }
    }
    const loc = res.headers.get('location')
    if (!loc) return { url: current, unreachable: false }
    try {
      current = unwrapConsent(new URL(loc, current).toString())
    } catch {
      return { url: current, unreachable: false }
    }
  }
  return { url: current, unreachable: false }
}

async function geocode(query: string): Promise<{ point: LatLng | null; unreachable: boolean }> {
  const q = query.trim().slice(0, 250)
  if (!q) return { point: null, unreachable: false }
  try {
    const res = await withTimeout(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'user-agent': 'Venuria/1.0 (wedding planning app; RSVP page map)', 'accept-language': 'en' },
    })
    if (!res.ok) return { point: null, unreachable: true }
    const rows = (await res.json()) as { lat?: string; lon?: string }[]
    const lat = Number(rows[0]?.lat)
    const lng = Number(rows[0]?.lon)
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { point: { lat, lng }, unreachable: false }
    return { point: null, unreachable: false }
  } catch {
    return { point: null, unreachable: true }
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, reason: 'none' } satisfies Result, { status: 401 })

  const body = (await request.json().catch(() => null)) as { mapsUrl?: unknown; address?: unknown; name?: unknown } | null
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const mapsUrl = str(body?.mapsUrl, 500)
  const address = str(body?.address, 200)
  const name = str(body?.name, 120)

  let unreachable = false
  let place: string | null = null

  if (mapsUrl) {
    const expanded = await expandShortLink(mapsUrl)
    unreachable ||= expanded.unreachable
    const parsed = parseMapsUrl(expanded.url)
    if (parsed && 'point' in parsed) return NextResponse.json({ ok: true, ...parsed.point, source: 'link' } satisfies Result)
    if (parsed && 'place' in parsed) place = parsed.place
  }

  if (address) {
    const g = await geocode(name ? `${name}, ${address}` : address)
    unreachable ||= g.unreachable
    if (g.point) return NextResponse.json({ ok: true, ...g.point, source: 'address' } satisfies Result)
    // The name + address together can be too specific for the geocoder; the address alone often works.
    if (name) {
      const g2 = await geocode(address)
      unreachable ||= g2.unreachable
      if (g2.point) return NextResponse.json({ ok: true, ...g2.point, source: 'address' } satisfies Result)
    }
  }

  if (place) {
    const g = await geocode(place)
    unreachable ||= g.unreachable
    if (g.point) return NextResponse.json({ ok: true, ...g.point, source: 'link-name' } satisfies Result)
  }

  return NextResponse.json({ ok: false, reason: unreachable ? 'unreachable' : 'none' } satisfies Result)
}
