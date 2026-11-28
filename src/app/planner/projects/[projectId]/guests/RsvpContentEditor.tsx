'use client'

import { useState } from 'react'
import type { DbProjectRsvp, DbRsvpHotel, DbRsvpPhoto } from '@/types/db'
import {
  addAreaPhoto,
  createHotel,
  deleteAreaPhoto,
  deleteHotel,
  removeCoverPhoto,
  removeHotelImage,
  saveRsvpContent,
  setCoverPhoto,
  setHotelImage,
  updateAreaPhotoCaption,
  updateHotel,
  type HotelInput,
  type RsvpContentPatch,
} from '@/lib/supabase/rsvpQueries'
import { prepareGuestPhoto } from '@/lib/guestPhoto'
import { useTranslations } from 'next-intl'
import { MAX_AREA_PHOTOS, MAX_HOTELS, RSVP_COVER_EDGE, RSVP_PHOTO_EDGE, normalizeWebUrl } from '@/lib/rsvpContent'
import { rsvpPath } from '@/lib/rsvp'

const input = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900'
const btn = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50'
const section = 'space-y-2 border-t border-gray-100 pt-4'

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : fallback
}

type Props = {
  projectId: string
  teamId: string
  origin: string
  cfg: DbProjectRsvp | null
  onCfg: (c: DbProjectRsvp) => void
  initialPhotos: DbRsvpPhoto[]
  initialHotels: DbRsvpHotel[]
  /** Signed URLs (path → URL) for the images already saved. */
  initialUrls: Record<string, string>
}

/** A button that opens the file picker; resets so the same file can be picked twice. */
function FilePick({ label, disabled, onFile }: { label: string; disabled?: boolean; onFile: (f: File) => void }) {
  return (
    <label className={`${btn} inline-block cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
      {label}
    </label>
  )
}

function Thumb({ url, alt, className }: { url: string | undefined; alt: string; className: string }) {
  const t = useTranslations('Rsvp')
  if (!url) return <div className={`${className} flex items-center justify-center bg-gray-100 text-[10px] text-gray-400`}>{t('noPreview')}</div>
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket, not a local asset
  return <img src={url} alt={alt} className={`${className} object-cover`} />
}

/**
 * The content of the public RSVP page: cover photo, details (schedule, dress
 * code, map link), the area (text + photos) and recommended hotels. Every
 * section can be switched off without losing what was typed. Hotels here are a
 * list on the page only; a guest's own hotel per night stays free text.
 */
export default function RsvpContentEditor({ projectId, teamId, origin, cfg, onCfg, initialPhotos, initialHotels, initialUrls }: Props) {
  const t = useTranslations('Rsvp')
  const tg = useTranslations('Guests')
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls)
  const [photos, setPhotos] = useState<DbRsvpPhoto[]>(initialPhotos)
  const [hotels, setHotels] = useState<DbRsvpHotel[]>(initialHotels)
  const [schedule, setSchedule] = useState(cfg?.schedule ?? '')
  const [dress, setDress] = useState(cfg?.dress_code ?? '')
  const [mapUrl, setMapUrl] = useState(cfg?.map_url ?? '')
  const [areaText, setAreaText] = useState(cfg?.area_text ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addingHotel, setAddingHotel] = useState(false)
  const [editingHotel, setEditingHotel] = useState<string | null>(null)

  const showDetails = cfg?.show_details ?? true
  const showArea = cfg?.show_area ?? true
  const showHotels = cfg?.show_hotels ?? true

  const detailsDirty =
    (schedule.trim() || null) !== (cfg?.schedule ?? null) || (dress.trim() || null) !== (cfg?.dress_code ?? null) || (mapUrl.trim() || null) !== (cfg?.map_url ?? null)
  const areaDirty = (areaText.trim() || null) !== (cfg?.area_text ?? null)

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e, tg('somethingWrong')))
    } finally {
      setBusy(null)
    }
  }

  const save = async (patch: RsvpContentPatch) => onCfg(await saveRsvpContent(projectId, patch))
  const addUrl = (path: string, url: string | null) => url && setUrls((u) => ({ ...u, [path]: url }))

  const saveDetails = () =>
    run('details', async () => {
      const link = normalizeWebUrl(mapUrl, tg)
      if (!link.ok) throw new Error(t('mapLinkError', { error: link.error }))
      await save({ schedule: schedule.trim() || null, dress_code: dress.trim() || null, map_url: link.url })
      setMapUrl(link.url ?? '')
    })

  const saveArea = () => run('area', () => save({ area_text: areaText.trim() || null }))

  const toggle = (key: 'show_details' | 'show_area' | 'show_hotels', value: boolean) => run(`toggle-${key}`, () => save({ [key]: value }))

  const pickCover = (file: File) =>
    run('cover', async () => {
      const jpeg = await prepareGuestPhoto(file, tg, RSVP_COVER_EDGE)
      const r = await setCoverPhoto({ teamId, projectId, jpeg, previousPath: cfg?.cover_path ?? null })
      onCfg(r.cfg)
      if (r.cfg.cover_path) addUrl(r.cfg.cover_path, r.url)
    })

  const dropCover = () =>
    run('cover', async () => {
      if (cfg?.cover_path) onCfg(await removeCoverPhoto(projectId, cfg.cover_path))
    })

  const pickAreaPhoto = (file: File) =>
    run('photo', async () => {
      const jpeg = await prepareGuestPhoto(file, tg, RSVP_PHOTO_EDGE)
      const position = photos.reduce((m, p) => Math.max(m, p.position), 0) + 1
      const r = await addAreaPhoto({ teamId, projectId, jpeg, position })
      setPhotos((prev) => [...prev, r.photo])
      addUrl(r.photo.path, r.url)
    })

  const saveCaption = (p: DbRsvpPhoto, caption: string) => {
    if ((caption.trim() || null) === p.caption) return
    return run(`cap-${p.id}`, async () => {
      const u = await updateAreaPhotoCaption(p.id, caption)
      setPhotos((prev) => prev.map((x) => (x.id === u.id ? u : x)))
    })
  }

  const dropPhoto = (p: DbRsvpPhoto) =>
    run(`photo-${p.id}`, async () => {
      await deleteAreaPhoto(p)
      setPhotos((prev) => prev.filter((x) => x.id !== p.id))
    })

  const saveHotel = (id: string | null, data: HotelInput) =>
    run('hotel', async () => {
      if (id) {
        const u = await updateHotel(id, data)
        setHotels((prev) => prev.map((x) => (x.id === u.id ? u : x)))
        setEditingHotel(null)
      } else {
        const position = hotels.reduce((m, h) => Math.max(m, h.position), 0) + 1
        const c = await createHotel(projectId, data, position)
        setHotels((prev) => [...prev, c])
        setAddingHotel(false)
      }
    })

  const dropHotel = (h: DbRsvpHotel) =>
    run(`hotel-${h.id}`, async () => {
      await deleteHotel(h)
      setHotels((prev) => prev.filter((x) => x.id !== h.id))
    })

  const pickHotelImage = (h: DbRsvpHotel, file: File) =>
    run(`hotel-${h.id}`, async () => {
      const jpeg = await prepareGuestPhoto(file, tg, RSVP_PHOTO_EDGE)
      const r = await setHotelImage({ teamId, projectId, hotelId: h.id, jpeg, previousPath: h.image_path })
      setHotels((prev) => prev.map((x) => (x.id === r.hotel.id ? r.hotel : x)))
      if (r.hotel.image_path) addUrl(r.hotel.image_path, r.url)
    })

  const dropHotelImage = (h: DbRsvpHotel) =>
    run(`hotel-${h.id}`, async () => {
      if (!h.image_path) return
      const u = await removeHotelImage(h.id, h.image_path)
      setHotels((prev) => prev.map((x) => (x.id === u.id ? u : x)))
    })

  const showToggle = (key: 'show_details' | 'show_area' | 'show_hotels', on: boolean, label: string) => (
    <label className="flex items-center gap-2 text-xs text-gray-700">
      <input type="checkbox" checked={on} disabled={busy !== null} onChange={(e) => toggle(key, e.target.checked)} />
      {label}
    </label>
  )

  return (
    <div className="space-y-4 border-t border-gray-200 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{t('pageContent')}</p>
        {cfg ? (
          <a href={`${origin}${rsvpPath(cfg.token)}?preview=1`} target="_blank" rel="noopener noreferrer" className={btn}>{t('previewPage')}</a>
        ) : (
          <span className="text-xs text-gray-500">{t('saveToPreview')}</span>
        )}
      </div>
      <p className="text-xs text-gray-500">
        {t('sectionsIntro')}
      </p>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <p className="text-xs text-gray-500">{t('coupleNamesNote')}</p>

      {/* Cover */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-900">{t('coverPhoto')}</p>
        <div className="flex flex-wrap items-center gap-3">
          {cfg?.cover_path && <Thumb url={urls[cfg.cover_path]} alt={t('coverPhoto')} className="h-20 w-36 rounded-lg" />}
          <FilePick label={cfg?.cover_path ? t('replacePhoto') : t('addAPhoto')} disabled={busy !== null} onFile={pickCover} />
          {cfg?.cover_path && <button type="button" className={btn} disabled={busy !== null} onClick={dropCover}>{t('remove')}</button>}
          {busy === 'cover' && <span className="text-xs text-gray-500">{t('working')}</span>}
        </div>
        <p className="text-xs text-gray-500">{t('coverHelp')}</p>
      </div>

      {/* Details */}
      <div className={section}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900">{t('details')}</p>
          {showToggle('show_details', showDetails, t('showOnPage'))}
        </div>
        <label className="block text-xs text-gray-600">
          {t('schedule')}
          <textarea value={schedule} onChange={(e) => setSchedule(e.target.value)} maxLength={1000} rows={4} className={input + ' mt-1 block w-full'} />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-gray-600">
            {t('dressCode')}
            <input value={dress} onChange={(e) => setDress(e.target.value)} maxLength={300} className={input + ' mt-1 block w-full'} />
          </label>
          <label className="block text-xs text-gray-600">
            {t('mapLink')}
            <input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} maxLength={500} placeholder="https://maps.app.goo.gl/…" className={input + ' mt-1 block w-full'} />
          </label>
        </div>
        <button type="button" onClick={saveDetails} disabled={!detailsDirty || busy !== null} className={btnPrimary}>{busy === 'details' ? tg('saving') : t('saveDetails')}</button>
      </div>

      {/* Area */}
      <div className={section}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900">{t('gettingThere')}</p>
          {showToggle('show_area', showArea, t('showOnPage'))}
        </div>
        <label className="block text-xs text-gray-600">
          {t('areaText')}
          <textarea value={areaText} onChange={(e) => setAreaText(e.target.value)} maxLength={2000} rows={5} className={input + ' mt-1 block w-full'} />
        </label>
        <button type="button" onClick={saveArea} disabled={!areaDirty || busy !== null} className={btnPrimary}>{busy === 'area' ? tg('saving') : t('saveText')}</button>

        <div className="space-y-2 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-gray-700">{t('photosCount', { count: photos.length, max: MAX_AREA_PHOTOS })}</p>
            <FilePick label={t('addAPhoto')} disabled={busy !== null || photos.length >= MAX_AREA_PHOTOS} onFile={pickAreaPhoto} />
            {busy === 'photo' && <span className="text-xs text-gray-500">{t('uploading')}</span>}
          </div>
          {photos.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {photos.map((p) => (
                <li key={p.id} className="space-y-1 rounded-lg border border-gray-200 p-2">
                  <Thumb url={urls[p.path]} alt={p.caption ?? t('areaPhoto')} className="aspect-[4/3] w-full rounded-lg" />
                  <input
                    defaultValue={p.caption ?? ''}
                    maxLength={120}
                    placeholder={t('captionOptional')}
                    aria-label={t('photoCaption')}
                    onBlur={(e) => saveCaption(p, e.target.value)}
                    className={input + ' w-full text-xs'}
                  />
                  <button type="button" className={btn} disabled={busy !== null} onClick={() => dropPhoto(p)}>{t('removePhoto')}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Hotels */}
      <div className={section}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900">{t('hotelsCount', { count: hotels.length, max: MAX_HOTELS })}</p>
          {showToggle('show_hotels', showHotels, t('showOnPage'))}
        </div>
        <p className="text-xs text-gray-500">{t('hotelsHelp')}</p>

        {hotels.map((h) =>
          editingHotel === h.id ? (
            <HotelForm key={h.id} initial={h} busy={busy === 'hotel'} onSave={(d) => saveHotel(h.id, d)} onCancel={() => setEditingHotel(null)} />
          ) : (
            <div key={h.id} className="flex flex-wrap gap-3 rounded-lg border border-gray-200 p-2">
              {h.image_path && <Thumb url={urls[h.image_path]} alt={h.name} className="h-20 w-28 rounded-lg" />}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium text-gray-900">{h.name}</p>
                {h.address && <p className="text-xs text-gray-500">{h.address}</p>}
                {h.description && <p className="text-xs text-gray-700">{h.description}</p>}
                {h.booking_note && <p className="text-xs text-gray-700">{t('bookingLine', { note: h.booking_note })}</p>}
                {h.url && <p className="truncate text-xs text-gray-500">{h.url}</p>}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button type="button" className={btn} disabled={busy !== null} onClick={() => { setEditingHotel(h.id); setAddingHotel(false) }}>{t('edit')}</button>
                  <FilePick label={h.image_path ? t('replacePhoto') : t('addPhoto')} disabled={busy !== null} onFile={(f) => pickHotelImage(h, f)} />
                  {h.image_path && <button type="button" className={btn} disabled={busy !== null} onClick={() => dropHotelImage(h)}>{t('removePhoto')}</button>}
                  <button type="button" className={btn} disabled={busy !== null} onClick={() => dropHotel(h)}>{t('deleteHotel')}</button>
                </div>
              </div>
            </div>
          ),
        )}

        {addingHotel ? (
          <HotelForm initial={null} busy={busy === 'hotel'} onSave={(d) => saveHotel(null, d)} onCancel={() => setAddingHotel(false)} />
        ) : (
          <button type="button" className={btn} disabled={busy !== null || hotels.length >= MAX_HOTELS} onClick={() => { setAddingHotel(true); setEditingHotel(null) }}>{t('addHotelBtn')}</button>
        )}
      </div>
    </div>
  )
}

function HotelForm({ initial, busy, onSave, onCancel }: { initial: DbRsvpHotel | null; busy: boolean; onSave: (d: HotelInput) => void; onCancel: () => void }) {
  const t = useTranslations('Rsvp')
  const tg = useTranslations('Guests')
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [booking, setBooking] = useState(initial?.booking_note ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [err, setErr] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setErr(t('hotelNeedsName'))
    const link = normalizeWebUrl(url, tg)
    if (!link.ok) return setErr(t('websiteError', { error: link.error }))
    setErr(null)
    onSave({ name: name.trim(), address: address.trim() || null, url: link.url, booking_note: booking.trim() || null, description: desc.trim() || null })
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-gray-300 bg-gray-50 p-3">
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-gray-600">{t('hotelName')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={input + ' mt-1 block w-full'} /></label>
        <label className="block text-xs text-gray-600">{t('hotelAddress')}<input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className={input + ' mt-1 block w-full'} /></label>
        <label className="block text-xs text-gray-600">{t('hotelWebsite')}<input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="www.hotel.com" className={input + ' mt-1 block w-full'} /></label>
        <label className="block text-xs text-gray-600">{t('hotelBooking')}<input value={booking} onChange={(e) => setBooking(e.target.value)} maxLength={300} className={input + ' mt-1 block w-full'} /></label>
      </div>
      <label className="block text-xs text-gray-600">{t('hotelDescription')}<textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={2} className={input + ' mt-1 block w-full'} /></label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? tg('saving') : initial ? t('saveHotel') : t('addHotel')}</button>
        <button type="button" onClick={onCancel} className={btn}>{tg('cancel')}</button>
      </div>
      {!initial && <p className="text-xs text-gray-500">{t('hotelPhotoLater')}</p>}
    </form>
  )
}
