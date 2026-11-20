'use client'

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import Link from 'next/link'
import type { DbAgeGroup, DbGuest, DbGuestFamily, DbGuestStay } from '@/types/db'
import {
  createFamily,
  createGuest,
  deleteGuestAndPhoto,
  deleteStays,
  dismissSeatFlag,
  removeGuestPhoto,
  renameFamily,
  restoreSeatFlag,
  saveStays,
  setGuestFamily,
  updateGuest,
  uploadGuestPhoto,
} from '@/lib/supabase/guestQueries'
import {
  AGE_LABEL,
  NO_FILTERS,
  filterGuests,
  familyMembers,
  guestStats,
  hasDietary,
  initials,
  nightsInRange,
  runLabel,
  seatLabel,
  sortGuests,
  stayRuns,
  staySummary,
  type GuestFilters,
  type SeatInfo,
} from '@/lib/guests'
import { prepareGuestPhoto } from '@/lib/guestPhoto'
import GuestImport from './GuestImport'
import { addDays, todayIso } from '@/lib/projectDates'

type Props = {
  projectId: string
  teamId: string
  eventDate: string | null
  initialGuests: DbGuest[]
  initialFamilies: DbGuestFamily[]
  initialStays: DbGuestStay[]
  seats: Record<string, SeatInfo[]>
  initialPhotoUrls: Record<string, string>
  /** From ?guest=ID (the editor's "Edit details" link): open this guest's panel on load. */
  initialSelectedId?: string | null
}

const input = 'rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900'
const btn = 'rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50'
const chipBase = 'rounded-full border px-3 py-1 text-xs'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
}

export default function GuestsApp({ projectId, teamId, eventDate, initialGuests, initialFamilies, initialStays, seats, initialPhotoUrls, initialSelectedId = null }: Props) {
  const [guests, setGuests] = useState<DbGuest[]>(initialGuests)
  const [families, setFamilies] = useState<DbGuestFamily[]>(initialFamilies)
  const [stays, setStays] = useState<DbGuestStay[]>(initialStays)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(initialPhotoUrls)
  const [filters, setFilters] = useState<GuestFilters>(NO_FILTERS)
  const [sortMode, setSortMode] = useState<'name' | 'family'>('name')
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)

  const staysByGuest = useMemo(() => {
    const m: Record<string, DbGuestStay[]> = {}
    for (const s of stays) (m[s.guest_id] ??= []).push(s)
    return m
  }, [stays])
  const famById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families])
  const stats = useMemo(() => guestStats(guests, seats), [guests, seats])
  const visible = useMemo(
    () => sortGuests(filterGuests(guests, filters, { families, seats, stays: staysByGuest }), families, sortMode),
    [guests, filters, families, seats, staysByGuest, sortMode],
  )
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)
  const multiRoom = useMemo(() => new Set(Object.values(seats).flat().map((s) => s.room)).size > 1, [seats])
  const selected = selectedId ? guests.find((g) => g.id === selectedId) ?? null : null

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError(null)
    setAdding(true)
    try {
      const g = await createGuest(projectId, name)
      setGuests((prev) => [...prev, g])
      setNewName('')
      setSelectedId(g.id)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setAdding(false)
    }
  }

  const toggle = (k: 'vip' | 'speech' | 'dietary' | 'unseated') => setFilters((f) => ({ ...f, [k]: !f[k] }))
  const chip = (on: boolean) => `${chipBase} ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`

  return (
    <div className="space-y-4">
      {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a guest — full name"
          maxLength={120}
          className={input + ' w-64'}
          aria-label="New guest name"
        />
        <button type="submit" disabled={adding || !newName.trim()} className={btnPrimary}>{adding ? 'Adding…' : 'Add guest'}</button>
        <button type="button" onClick={() => setImporting(true)} className={btn}>Import from file…</button>
      </form>

      {importing && (
        <GuestImport
          projectId={projectId}
          existingNames={guests.map((g) => g.name)}
          onImported={(added) => setGuests((prev) => [...prev, ...added])}
          onClose={() => setImporting(false)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          placeholder="Search name, family, dietary, hotel, notes…"
          className={input + ' w-72'}
          aria-label="Search guests"
        />
        <button type="button" onClick={() => toggle('vip')} aria-pressed={filters.vip} className={chip(filters.vip)}>VIP ({stats.vip})</button>
        <button type="button" onClick={() => toggle('speech')} aria-pressed={filters.speech} className={chip(filters.speech)}>Speeches ({stats.speech})</button>
        <button type="button" onClick={() => toggle('dietary')} aria-pressed={filters.dietary} className={chip(filters.dietary)}>Dietary ({stats.dietary})</button>
        <button type="button" onClick={() => toggle('unseated')} aria-pressed={filters.unseated} className={chip(filters.unseated)}>Needs a seat ({stats.unseated})</button>
        <select
          value={filters.familyId}
          onChange={(e) => setFilters((f) => ({ ...f, familyId: e.target.value }))}
          className={input}
          aria-label="Filter by family"
        >
          <option value="">All families</option>
          {[...families].sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as 'name' | 'family')} className={input} aria-label="Sort guests">
          <option value="name">Sort: name</option>
          <option value="family">Sort: families together</option>
        </select>
        {filtering && <button type="button" onClick={() => setFilters(NO_FILTERS)} className={btn}>Clear filters</button>}
      </div>

      <p className="text-sm text-gray-500">
        {filtering ? `${visible.length} of ${stats.total} guests` : `${stats.total} ${stats.total === 1 ? 'guest' : 'guests'}`}
        {stats.families > 0 ? ` · ${stats.families} ${stats.families === 1 ? 'family' : 'families'}` : ''}
        {' · click a guest or Edit to change details, add a photo, family or hotel'}
      </p>

      {guests.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No guests yet. Add one above, or import a list from a file.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No guests match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-14 px-3 py-2"><span className="sr-only">Photo</span></th>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Family</th>
                <th className="hidden px-3 py-2 md:table-cell">Dietary</th>
                <th className="px-3 py-2">Seat</th>
                <th className="hidden px-3 py-2 lg:table-cell">Hotel</th>
                <th className="w-20 px-3 py-2"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g, i) => {
                const fam = g.family_id ? famById.get(g.family_id) : undefined
                const newBlock = sortMode === 'family' && i > 0 && visible[i - 1].family_id !== g.family_id
                const gSeats = seats[g.id] ?? []
                const gStays = staysByGuest[g.id] ?? []
                return (
                  <tr
                    key={g.id}
                    onClick={() => setSelectedId(g.id)}
                    className={`cursor-pointer border-t hover:bg-gray-50 ${newBlock ? 'border-t-2 border-gray-300' : 'border-gray-100'} ${selectedId === g.id ? 'bg-amber-50' : ''}`}
                  >
                    <td className="px-3 py-2"><Avatar name={g.name} url={g.photo_path ? photoUrls[g.photo_path] : undefined} size={36} /></td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setSelectedId(g.id)} className="text-left font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900">{g.name}</button>
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {g.is_vip && <Pill tone="amber">VIP</Pill>}
                        {g.gives_speech && <Pill tone="blue">Speech</Pill>}
                      </span>
                      {g.notes && <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500" title={g.notes}>{g.notes}</p>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {fam ? fam.name : <span className="text-gray-400">—</span>}
                      {g.age_group !== 'adult' && <span className="ml-1.5"><Pill tone="gray">{AGE_LABEL[g.age_group]}</Pill></span>}
                    </td>
                    <td className="hidden max-w-[14rem] px-3 py-2 text-gray-700 md:table-cell">
                      {hasDietary(g) ? <span className="line-clamp-2" title={g.dietary ?? ''}>{g.dietary}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {gSeats.length > 0
                        ? gSeats.map((s, i) => <div key={i}>{seatLabel(s, multiRoom)}</div>)
                        : g.age_group === 'baby'
                          ? <span className="text-gray-400">No seat needed</span>
                          : g.seat_dismissed_at
                            ? <span className="text-gray-500" title={g.seat_dismissed_note ?? ''}>No seat needed <span className="text-xs text-gray-400">(dismissed)</span></span>
                            : <span className="font-medium text-amber-700">Needs a seat</span>}
                    </td>
                    <td className="hidden max-w-[16rem] px-3 py-2 text-gray-700 lg:table-cell">
                      {gStays.length === 0 ? <span className="text-gray-400">—</span> : <span className="line-clamp-2" title={staySummary(gStays)}>{staySummary(gStays)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setSelectedId(g.id)} className={btn} aria-label={`Edit ${g.name}`}>Edit</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <GuestPanel
          key={selected.id}
          guest={selected}
          guests={guests}
          families={families}
          stays={staysByGuest[selected.id] ?? []}
          allStays={stays}
          seats={seats[selected.id] ?? []}
          multiRoom={multiRoom}
          photoUrl={selected.photo_path ? photoUrls[selected.photo_path] : undefined}
          projectId={projectId}
          teamId={teamId}
          eventDate={eventDate}
          setGuests={setGuests}
          setFamilies={setFamilies}
          setStays={setStays}
          setPhotoUrls={setPhotoUrls}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ── Small pieces ───────────────────────────────────────────────────────────────

function Pill({ tone, children }: { tone: 'amber' | 'blue' | 'gray'; children: React.ReactNode }) {
  const c = tone === 'amber' ? 'bg-amber-100 text-amber-800' : tone === 'blue' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c}`}>{children}</span>
}

function Avatar({ name, url, size }: { name: string; url?: string; size: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket, not a local asset
      <img src={url} alt="" style={style} className="rounded-full object-cover" onError={() => setFailed(true)} />
    )
  }
  return (
    <span style={{ ...style, fontSize: size * 0.36 }} className="flex items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600" aria-hidden="true">
      {initials(name)}
    </span>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────

type PanelProps = {
  guest: DbGuest
  guests: DbGuest[]
  families: DbGuestFamily[]
  stays: DbGuestStay[]
  allStays: DbGuestStay[]
  seats: SeatInfo[]
  multiRoom: boolean
  photoUrl: string | undefined
  projectId: string
  teamId: string
  eventDate: string | null
  setGuests: Dispatch<SetStateAction<DbGuest[]>>
  setFamilies: Dispatch<SetStateAction<DbGuestFamily[]>>
  setStays: Dispatch<SetStateAction<DbGuestStay[]>>
  setPhotoUrls: Dispatch<SetStateAction<Record<string, string>>>
  onSelect: (id: string) => void
  onClose: () => void
}

function GuestPanel(p: PanelProps) {
  const { guest } = p
  const [name, setName] = useState(guest.name)
  const [notes, setNotes] = useState(guest.notes ?? '')
  const [dietary, setDietary] = useState(guest.dietary ?? '')
  const [age, setAge] = useState<DbAgeGroup>(guest.age_group)
  const [vip, setVip] = useState(guest.is_vip)
  const [speech, setSpeech] = useState(guest.gives_speech)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dismissNote, setDismissNote] = useState('')
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // family
  const [creatingFamily, setCreatingFamily] = useState(false)
  const [familyName, setFamilyName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // stays
  const [from, setFrom] = useState(p.eventDate ? addDays(p.eventDate, -1) : todayIso())
  const [to, setTo] = useState(p.eventDate ?? todayIso())
  const [hotel, setHotel] = useState('')

  const dirty =
    name.trim() !== guest.name ||
    (notes.trim() || null) !== guest.notes ||
    (dietary.trim() || null) !== guest.dietary ||
    age !== guest.age_group ||
    vip !== guest.is_vip ||
    speech !== guest.gives_speech

  const { onClose } = p
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dirty) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, onClose])

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const replaceGuest = (g: DbGuest) => p.setGuests((prev) => prev.map((x) => (x.id === g.id ? g : x)))

  const save = () =>
    run('save', async () => {
      if (!name.trim()) throw new Error('A guest needs a name.')
      const g = await updateGuest(guest.id, {
        name: name.trim(),
        notes: notes.trim() || null,
        dietary: dietary.trim() || null,
        age_group: age,
        is_vip: vip,
        gives_speech: speech,
      })
      replaceGuest(g)
    })

  const dismissFlag = () =>
    run('dismiss', async () => {
      replaceGuest(await dismissSeatFlag(guest.id, dismissNote))
      setDismissNote('')
    })

  const restoreFlag = () =>
    run('restore', async () => {
      replaceGuest(await restoreSeatFlag(guest.id))
    })

  const choosePhoto = (file: File | null) =>
    run('photo', async () => {
      if (!file) return
      const jpeg = await prepareGuestPhoto(file)
      const { guest: g, url } = await uploadGuestPhoto({
        teamId: p.teamId,
        projectId: p.projectId,
        guestId: guest.id,
        jpeg,
        previousPath: guest.photo_path,
      })
      replaceGuest(g)
      if (g.photo_path && url) p.setPhotoUrls((prev) => ({ ...prev, [g.photo_path as string]: url }))
    })

  const dropPhoto = () =>
    run('photo', async () => {
      if (!guest.photo_path) return
      const g = await removeGuestPhoto(guest.id, guest.photo_path)
      replaceGuest(g)
      setConfirmRemovePhoto(false)
    })

  // ── family ──
  const familySizes = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of p.guests) if (g.family_id) m.set(g.family_id, (m.get(g.family_id) ?? 0) + 1)
    return m
  }, [p.guests])
  const family = guest.family_id ? p.families.find((f) => f.id === guest.family_id) : undefined
  const others = familyMembers(p.guests, guest.family_id, guest.id)

  const moveToFamily = (familyId: string | null) =>
    run('family', async () => {
      const { guest: g, removedFamilyId } = await setGuestFamily(guest.id, familyId, guest.family_id)
      replaceGuest(g)
      if (removedFamilyId) p.setFamilies((prev) => prev.filter((f) => f.id !== removedFamilyId))
      setRenaming(false)
    })

  const startNewFamily = () => {
    const last = guest.name.trim().split(/\s+/).slice(-1)[0]
    setFamilyName(last && guest.name.trim().includes(' ') ? `${last} family` : '')
    setCreatingFamily(true)
  }

  const makeFamily = () =>
    run('family', async () => {
      if (!familyName.trim()) throw new Error('Give the family a name.')
      const f = await createFamily(p.projectId, familyName)
      p.setFamilies((prev) => [...prev, f])
      const { guest: g, removedFamilyId } = await setGuestFamily(guest.id, f.id, guest.family_id)
      replaceGuest(g)
      if (removedFamilyId) p.setFamilies((prev) => prev.filter((x) => x.id !== removedFamilyId))
      setCreatingFamily(false)
    })

  const doRename = () =>
    run('family', async () => {
      if (!family) return
      if (!renameValue.trim()) throw new Error('Give the family a name.')
      const f = await renameFamily(family.id, renameValue)
      p.setFamilies((prev) => prev.map((x) => (x.id === f.id ? f : x)))
      setRenaming(false)
    })

  // ── stays ──
  const runs = useMemo(() => stayRuns(p.stays), [p.stays])
  const knownHotels = useMemo(() => [...new Set(p.allStays.map((s) => s.hotel))].sort((a, b) => a.localeCompare(b)), [p.allStays])

  const addStay = () =>
    run('stay', async () => {
      if (!hotel.trim()) throw new Error('Enter the hotel name.')
      const range = nightsInRange(from, to)
      if (!range.ok) throw new Error(range.error)
      const saved = await saveStays(p.projectId, guest.id, range.nights, hotel)
      const nights = new Set(range.nights)
      p.setStays((prev) => [...prev.filter((s) => !(s.guest_id === guest.id && nights.has(s.night))), ...saved])
    })

  const removeRun = (r: { hotel: string; from: string; to: string }) =>
    run('stay', async () => {
      const ids = p.stays.filter((s) => s.hotel === r.hotel && s.night >= r.from && s.night <= r.to).map((s) => s.id)
      await deleteStays(ids)
      const gone = new Set(ids)
      p.setStays((prev) => prev.filter((s) => !gone.has(s.id)))
    })

  const removeGuest = () =>
    run('delete', async () => {
      await deleteGuestAndPhoto(guest)
      p.setGuests((prev) => prev.filter((g) => g.id !== guest.id))
      p.setStays((prev) => prev.filter((s) => s.guest_id !== guest.id))
      if (guest.family_id && familySizes.get(guest.family_id) === 1) {
        p.setFamilies((prev) => prev.filter((f) => f.id !== guest.family_id))
      }
      p.onClose()
    })

  const label = 'block text-xs font-medium text-gray-600 mb-1'
  const section = 'space-y-2 border-t border-gray-100 pt-4'

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={() => { if (!dirty) p.onClose() }} aria-hidden="true" />
      <aside role="dialog" aria-label={`Details for ${guest.name}`} className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">{guest.name}</h2>
          <button type="button" onClick={p.onClose} className={btn} aria-label="Close details">Close</button>
        </div>
        {dirty && <p className="mt-1 text-xs text-amber-700">Unsaved changes — save, or revert by reopening this guest.</p>}
        {error && <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <div className="mt-4 space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <Avatar name={guest.name} url={p.photoUrl} size={96} />
            <div className="space-y-1.5">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  void choosePhoto(f)
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileInput.current?.click()} disabled={busy === 'photo'} className={btn}>
                  {busy === 'photo' ? 'Uploading…' : guest.photo_path ? 'Replace photo…' : 'Choose photo…'}
                </button>
                {guest.photo_path && !confirmRemovePhoto && <button type="button" onClick={() => setConfirmRemovePhoto(true)} className={btn}>Remove</button>}
                {guest.photo_path && confirmRemovePhoto && (
                  <>
                    <button type="button" onClick={dropPhoto} disabled={busy === 'photo'} className={btn + ' !border-red-300 !text-red-700'}>Confirm remove</button>
                    <button type="button" onClick={() => setConfirmRemovePhoto(false)} className={btn}>Keep</button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500">JPEG, PNG or WebP. Resized on your device and stored privately for your team.</p>
            </div>
          </div>

          {/* Basics */}
          <div className={section}>
            <div>
              <label className={label} htmlFor="g-name">Name</label>
              <input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={input + ' w-full'} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} /> VIP</label>
              <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" checked={speech} onChange={(e) => setSpeech(e.target.checked)} /> Giving a speech</label>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                Age
                <select value={age} onChange={(e) => setAge(e.target.value as DbAgeGroup)} className={input}>
                  {(Object.keys(AGE_LABEL) as DbAgeGroup[]).map((k) => <option key={k} value={k}>{AGE_LABEL[k]}</option>)}
                </select>
              </label>
            </div>
            <div>
              <label className={label} htmlFor="g-diet">Dietary needs / allergies</label>
              <textarea id="g-diet" value={dietary} onChange={(e) => setDietary(e.target.value)} maxLength={500} rows={2} className={input + ' w-full'} placeholder="e.g. coeliac, no nuts, vegetarian" />
            </div>
            <div>
              <label className={label} htmlFor="g-notes">Notes</label>
              <textarea id="g-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input + ' w-full'} />
            </div>
            <button type="button" onClick={save} disabled={!dirty || busy === 'save'} className={btnPrimary}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
          </div>

          {/* Family */}
          <div className={section}>
            <p className="text-sm font-medium text-gray-900">Family</p>
            <p className="text-xs text-gray-500">Link parents with their children and babies so they show together.</p>
            {!creatingFamily ? (
              <select
                value={guest.family_id ?? ''}
                disabled={busy === 'family'}
                onChange={(e) => (e.target.value === '__new' ? startNewFamily() : void moveToFamily(e.target.value || null))}
                className={input + ' w-full'}
                aria-label="Family"
              >
                <option value="">No family</option>
                {[...p.families].sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({familySizes.get(f.id) ?? 0})</option>
                ))}
                <option value="__new">+ New family…</option>
              </select>
            ) : (
              <div className="flex flex-wrap gap-2">
                <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={80} placeholder="Family name" className={input + ' flex-1'} aria-label="New family name" />
                <button type="button" onClick={makeFamily} disabled={busy === 'family'} className={btnPrimary + ' !py-1 !text-xs'}>Create</button>
                <button type="button" onClick={() => setCreatingFamily(false)} className={btn}>Cancel</button>
              </div>
            )}
            {family && !renaming && (
              <button type="button" onClick={() => { setRenameValue(family.name); setRenaming(true) }} className="text-xs text-gray-500 underline hover:text-gray-900">Rename “{family.name}”</button>
            )}
            {family && renaming && (
              <div className="flex flex-wrap gap-2">
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={80} className={input + ' flex-1'} aria-label="Rename family" />
                <button type="button" onClick={doRename} disabled={busy === 'family'} className={btn}>Save name</button>
                <button type="button" onClick={() => setRenaming(false)} className={btn}>Cancel</button>
              </div>
            )}
            {others.length > 0 && (
              <p className="text-xs text-gray-600">
                Also in this family:{' '}
                {others.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ', '}
                    <button type="button" onClick={() => p.onSelect(o.id)} disabled={dirty} className="underline hover:text-gray-900 disabled:no-underline disabled:opacity-60">{o.name}</button>
                    {o.age_group !== 'adult' ? ` (${AGE_LABEL[o.age_group].toLowerCase()})` : ''}
                  </span>
                ))}
              </p>
            )}
          </div>

          {/* Seats */}
          <div className={section}>
            <p className="text-sm font-medium text-gray-900">Seat</p>
            {p.seats.length > 0 ? (
              <ul className="text-sm text-gray-700">{p.seats.map((s, i) => <li key={i}>{seatLabel(s, true)}</li>)}</ul>
            ) : guest.age_group === 'baby' ? (
              <p className="text-sm text-gray-500">Babies don&rsquo;t need a seat.</p>
            ) : guest.seat_dismissed_at ? (
              <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
                <p>No seat needed: {guest.seat_dismissed_note}</p>
                <button type="button" disabled={busy !== null} onClick={restoreFlag} className={btn + ' mt-1.5'}>Flag as needing a seat again</button>
              </div>
            ) : (
              <div className="space-y-1.5 rounded border border-amber-200 bg-amber-50 p-2">
                <p className="text-sm font-medium text-amber-800">Needs a seat</p>
                <p className="text-xs text-amber-800">Seat them in the editor, or dismiss this if they will not sit (say why).</p>
                <div className="flex gap-1.5">
                  <input value={dismissNote} onChange={(e) => setDismissNote(e.target.value)} maxLength={300} placeholder="Why no seat? e.g. leaves after the ceremony" aria-label="Reason no seat is needed" className={input + ' min-w-0 flex-1'} />
                  <button type="button" disabled={busy !== null || !dismissNote.trim()} onClick={dismissFlag} className={btn}>Dismiss</button>
                </div>
              </div>
            )}
            <Link href={`/editor/${p.projectId}`} className="text-xs text-gray-500 underline hover:text-gray-900">Change seats in the editor</Link>
          </div>

          {/* Hotel per night */}
          <div className={section}>
            <p className="text-sm font-medium text-gray-900">Hotel per night</p>
            <p className="text-xs text-gray-500">A night is the evening of that date. Entering a night that already has a hotel replaces it.</p>
            {runs.length === 0 ? <p className="text-sm text-gray-500">No stays recorded.</p> : (
              <ul className="space-y-1">
                {runs.map((r) => (
                  <li key={`${r.hotel}-${r.from}`} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                    <span>{runLabel(r)} <span className="text-gray-400">({r.nights} {r.nights === 1 ? 'night' : 'nights'})</span></span>
                    <button type="button" onClick={() => removeRun(r)} disabled={busy === 'stay'} className={btn}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-600">First night<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input + ' mt-1 block'} /></label>
              <label className="text-xs text-gray-600">Last night<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input + ' mt-1 block'} /></label>
              <label className="min-w-[8rem] flex-1 text-xs text-gray-600">Hotel
                <input value={hotel} onChange={(e) => setHotel(e.target.value)} list="known-hotels" maxLength={120} className={input + ' mt-1 block w-full'} />
              </label>
              <datalist id="known-hotels">{knownHotels.map((h) => <option key={h} value={h} />)}</datalist>
              <button type="button" onClick={addStay} disabled={busy === 'stay'} className={btn}>{busy === 'stay' ? 'Saving…' : 'Add'}</button>
            </div>
          </div>

          {/* Delete */}
          <div className={section}>
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} className={btn + ' !text-red-700'}>Delete guest…</button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                <span>Delete {guest.name}, their seat, stays and photo?</span>
                <button type="button" onClick={removeGuest} disabled={busy === 'delete'} className={btn + ' !border-red-300 !text-red-700'}>Yes, delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={btn}>Keep</button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
