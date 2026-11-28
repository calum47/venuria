'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker } from 'leaflet'
import { distanceKm, formatDistance, googleMapsPointLink, type LatLng } from '@/lib/mapLocation'
import type { PublicHotel } from '@/lib/rsvpContent'

/** The words the map needs, in the guest's language (from rsvpText). */
export type MapTexts = {
  mapHint: string
  venueLabel: string
  openInGoogleMaps: string
  visitWebsite: string
  bookingInfo: string
  distanceFromVenue: string
  closeCard: string
}

type Props = {
  venue: LatLng | null
  venueName: string | null
  /** The venue's own Maps link (the one in the details block), used as its "Open in Google Maps" button. */
  venueMapUrl: string | null
  hotels: PublicHotel[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  texts: MapTexts
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
export const VENUE_KEY = '__venue__'

function pinHtml(label: string, selected: boolean, venue: boolean): string {
  const size = selected ? 34 : 28
  const bg = venue ? '#be185d' : selected ? '#111827' : '#ffffff'
  const fg = venue || selected ? '#ffffff' : '#111827'
  const border = venue ? '#ffffff' : '#111827'
  return `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};color:${fg};border:2px solid ${border};display:flex;align-items:center;justify-content:center;font:600 13px/1 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</div>`
}

/**
 * The map on the public RSVP page: the venue and the planner's hotels, each tappable.
 * Tiles come from OpenStreetMap by default (NEXT_PUBLIC_MAP_TILE_URL swaps the provider). The library and the
 * tiles are only loaded once the map scrolls into view, so a guest who never reaches it sends nothing to the
 * tile server.
 */
export default function RsvpMap({ venue, venueName, venueMapUrl, hotels, selectedId, onSelect, texts }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const markers = useRef<Map<string, Marker>>(new Map())
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const placed = hotels.map((h, i) => ({ h, n: i + 1 })).filter((x) => x.h.position)

  useEffect(() => {
    const el = box.current
    if (!el) return
    // Very old browsers without IntersectionObserver: load the map straight away, from a callback rather than the effect body.
    if (typeof IntersectionObserver === 'undefined') {
      const id = setTimeout(() => setVisible(true), 0)
      return () => clearTimeout(id)
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true)
        io.disconnect()
      }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Build the map once it is visible.
  useEffect(() => {
    if (!visible || !box.current || map.current) return
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !box.current) return
      const m = L.map(box.current, { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomControl: true, attributionControl: true })
      L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m)
      const pts: [number, number][] = []
      const add = (key: string, p: LatLng, label: string, isVenue: boolean) => {
        const mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: pinHtml(label, false, isVenue), iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: true, title: label })
        mk.on('click', () => onSelect(key))
        mk.addTo(m)
        markers.current.set(key, mk)
        pts.push([p.lat, p.lng])
      }
      if (venue) add(VENUE_KEY, venue, '♥', true)
      for (const { h, n } of placed) add(h.id, h.position!, String(n), false)
      if (pts.length === 1) m.setView(pts[0], 15)
      else m.fitBounds(pts, { padding: [36, 36], maxZoom: 16 })
      map.current = m
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; the data does not change while a guest views the page
  }, [visible])

  useEffect(
    () => () => {
      map.current?.remove()
      map.current = null
      markers.current.clear()
    },
    [],
  )

  // Highlight the selected marker and bring it into view.
  useEffect(() => {
    if (!ready) return
    void (async () => {
      const L = (await import('leaflet')).default
      for (const [key, mk] of markers.current) {
        const isVenue = key === VENUE_KEY
        const n = placed.find((x) => x.h.id === key)?.n
        const sel = key === selectedId
        mk.setIcon(L.divIcon({ className: '', html: pinHtml(isVenue ? '♥' : String(n ?? ''), sel, isVenue), iconSize: [34, 34], iconAnchor: [17, 17] }))
        mk.setZIndexOffset(sel ? 1000 : 0)
      }
      const mk = selectedId ? markers.current.get(selectedId) : null
      if (mk && map.current) map.current.panTo(mk.getLatLng(), { animate: true })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `placed` is derived from `hotels`, which never changes here
  }, [selectedId, ready])

  const hotel = hotels.find((h) => h.id === selectedId) ?? null
  const showVenue = selectedId === VENUE_KEY && venue

  return (
    <div className="space-y-3">
      <div ref={box} className="z-0 h-72 w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 sm:h-96 lg:h-[30rem]" role="region" aria-label={texts.mapHint} />
      {!hotel && !showVenue && <p className="text-center text-xs text-gray-500">{texts.mapHint}</p>}

      {showVenue && (
        <div className="space-y-1 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="font-serif text-xl font-semibold text-gray-900">{venueName || texts.venueLabel}</p>
          <p className="text-xs text-gray-500">{texts.venueLabel}</p>
          <a href={venueMapUrl ?? googleMapsPointLink(venue)} target="_blank" rel="noopener noreferrer nofollow" className="inline-block pt-1 text-sm text-brand-700 underline underline-offset-2 hover:text-brand-900">
            {texts.openInGoogleMaps} ↗
          </a>
        </div>
      )}

      {hotel?.position && (
        <div className="space-y-1 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-serif text-xl font-semibold text-gray-900">{hotel.name}</p>
            <button type="button" onClick={() => onSelect(null)} className="shrink-0 rounded-full px-2 text-lg leading-none text-gray-400 hover:text-gray-700" aria-label={texts.closeCard}>×</button>
          </div>
          {hotel.address && <p className="text-xs text-gray-500">{hotel.address}</p>}
          {venue && <p className="text-xs text-gray-600">{texts.distanceFromVenue.replace('{distance}', formatDistance(distanceKm(venue, hotel.position)))}</p>}
          {hotel.description && <p className="whitespace-pre-line text-sm text-gray-700">{hotel.description}</p>}
          {hotel.bookingNote && <p className="text-sm text-gray-700"><span className="font-medium">{texts.bookingInfo}:</span> {hotel.bookingNote}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <a href={hotel.mapsUrl ?? googleMapsPointLink(hotel.position)} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-900">
              {texts.openInGoogleMaps} ↗
            </a>
            {hotel.url && (
              <a href={hotel.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-900">
                {texts.visitWebsite} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
