'use client'

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'
import {
  createBlock,
  createDay,
  createVendor,
  deleteBlock,
  deleteDay,
  deleteVendor,
  updateBlock,
  updateDay,
  updateVendor,
  type VendorInput,
} from '@/lib/supabase/timetableQueries'
import {
  DRAG_SNAP_MIN,
  durationLabel,
  formatMin,
  formatRange,
  layoutColumns,
  readableText,
  resizeEnd,
  resolveTimes,
  shiftBlock,
  snap,
  visibleRange,
} from '@/lib/timetable'

type Props = {
  projectId: string
  teamId: string
  eventDate: string | null
  initialDays: DbProjectDay[]
  initialBlocks: DbTimetableBlock[]
  /** View-only access: no adding, dragging, editing or deleting. */
  readOnly?: boolean
  initialVendors: DbTeamVendor[]
}

const PX_PER_MIN = 1 // 60 px per hour
const MIN_BLOCK_PX = 22
const NO_VENDOR_COLOUR = '#e5e7eb'

const input = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900'
const btn = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
}

type Editing = { kind: 'block'; id: string } | { kind: 'new'; start: number; end: number } | null
type Drag = { id: string; mode: 'move' | 'resize'; delta: number }

export default function TimetableApp({ projectId, teamId, eventDate, initialDays, initialBlocks, initialVendors, readOnly = false }: Props) {
  const [days, setDays] = useState<DbProjectDay[]>(initialDays)
  const [blocks, setBlocks] = useState<DbTimetableBlock[]>(initialBlocks)
  const [vendors, setVendors] = useState<DbTeamVendor[]>(initialVendors)
  const [activeDayId, setActiveDayId] = useState<string | null>(initialDays[0]?.id ?? null)
  const [editing, setEditing] = useState<Editing>(null)
  const [showVendors, setShowVendors] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startY: number; moved: boolean; delta: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const sortedDays = useMemo(() => [...days].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [days])
  const day = sortedDays.find((d) => d.id === activeDayId) ?? sortedDays[0] ?? null
  const dayBlocks = useMemo(() => blocks.filter((b) => b.day_id === day?.id), [blocks, day?.id])
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])
  const columns = useMemo(() => layoutColumns(dayBlocks), [dayBlocks])
  const range = useMemo(() => visibleRange(dayBlocks), [dayBlocks])
  const heightPx = (range.to - range.from) * PX_PER_MIN
  const editingBlock = editing?.kind === 'block' ? blocks.find((b) => b.id === editing.id) ?? null : null

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEditing(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  // ── Days ───────────────────────────────────────────────────────────────────
  const addDay = () =>
    run(async () => {
      const first = days.length === 0
      const label = first ? 'Wedding day' : `Day ${days.length + 1}`
      const position = days.reduce((m, d) => Math.max(m, d.position), -1) + 1
      const d = await createDay(projectId, label, first ? eventDate : null, position)
      setDays((prev) => [...prev, d])
      setActiveDayId(d.id)
    })

  // ── Drag / resize ──────────────────────────────────────────────────────────
  const previewTimes = (b: DbTimetableBlock) => {
    if (!drag || drag.id !== b.id) return { start: b.start_min, end: b.end_min }
    return drag.mode === 'move'
      ? shiftBlock(b.start_min, b.end_min, drag.delta)
      : resizeEnd(b.start_min, b.end_min, drag.delta)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, b: DbTimetableBlock, mode: 'move' | 'resize') => {
    if (readOnly || e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { id: b.id, mode, startY: e.clientY, moved: false, delta: 0 }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (!d) return
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dy) < 4) return
    d.moved = true
    d.delta = snap(dy / PX_PER_MIN, DRAG_SNAP_MIN)
    setDrag({ id: d.id, mode: d.mode, delta: d.delta })
  }

  const onPointerUp = (b: DbTimetableBlock) => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d) return
    if (!d.moved) {
      if (d.mode === 'move') setEditing({ kind: 'block', id: b.id })
      return
    }
    if (d.delta === 0) return
    const next = d.mode === 'move' ? shiftBlock(b.start_min, b.end_min, d.delta) : resizeEnd(b.start_min, b.end_min, d.delta)
    if (next.start === b.start_min && next.end === b.end_min) return
    const before = b
    setBlocks((prev) => prev.map((x) => (x.id === b.id ? { ...x, start_min: next.start, end_min: next.end } : x)))
    updateBlock(b.id, { start_min: next.start, end_min: next.end })
      .then((saved) => setBlocks((prev) => prev.map((x) => (x.id === saved.id ? saved : x))))
      .catch((err) => {
        setBlocks((prev) => prev.map((x) => (x.id === before.id ? before : x)))
        setError(errMsg(err))
      })
  }

  const onPointerCancel = () => {
    dragRef.current = null
    setDrag(null)
  }

  const onGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !day || e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const start = Math.min(1439, snap(range.from + (e.clientY - rect.top) / PX_PER_MIN, DRAG_SNAP_MIN))
    setEditing({ kind: 'new', start, end: Math.min(start + 60, 1800) })
  }

  const hours: number[] = []
  for (let m = range.from; m <= range.to; m += 60) hours.push(m)

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Day switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {sortedDays.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => { setActiveDayId(d.id); setEditing(null) }}
            aria-pressed={d.id === day?.id}
            className={`rounded-full border px-3 py-1 text-sm ${d.id === day?.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            {d.label}{d.day_date ? ` · ${shortDay(d.day_date)}` : ''}
          </button>
        ))}
        {!readOnly && <button type="button" onClick={addDay} disabled={busy} className={btn}>+ Add day</button>}
        <span className="flex-1" />
        {!readOnly && <button type="button" onClick={() => setShowVendors(true)} className={btn}>Vendors ({vendors.length})</button>}
        {!readOnly && day && <button type="button" onClick={() => setEditing({ kind: 'new', start: 18 * 60, end: 19 * 60 })} className={btnPrimary}>+ Add block</button>}
      </div>

      {!day ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">A project can span several days: the wedding itself, a welcome party, a brunch.</p>
          {!readOnly && <button type="button" onClick={addDay} disabled={busy} className={btnPrimary + ' mt-3'}>Add the first day</button>}
        </div>
      ) : (
        <>
          {!readOnly && <DayBar key={day.id} day={day} blockCount={dayBlocks.length} setDays={setDays} setBlocks={setBlocks} setActiveDayId={setActiveDayId} run={run} />}

          {vendors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs text-gray-600" aria-label="Vendor colours">
              {vendors.map((v) => (
                <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: v.colour }} />
                  {v.name}
                </span>
              ))}
            </div>
          )}

          {!readOnly && <p className="text-xs text-gray-500">
            Click an empty slot to add a block. Drag a block up or down to shift it (snaps to {DRAG_SNAP_MIN} min), drag its bottom edge to change its length, or click it to type exact times.
          </p>}

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <div className="flex" style={{ minWidth: 480 }}>
              <div className="relative w-20 shrink-0 border-r border-gray-100" style={{ height: heightPx }} aria-hidden>
                {hours.map((m) => (
                  <span key={m} className="absolute right-2 -translate-y-1/2 text-xs text-gray-400" style={{ top: (m - range.from) * PX_PER_MIN }}>
                    {m === range.from ? '' : formatMin(m)}
                  </span>
                ))}
              </div>
              <div ref={gridRef} className={`relative flex-1 ${readOnly ? '' : 'cursor-cell'}`} style={{ height: heightPx }} onClick={onGridClick} data-testid="timetable-grid">
                {hours.map((m) => (
                  <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-gray-100" style={{ top: (m - range.from) * PX_PER_MIN }} />
                ))}
                {dayBlocks.map((b) => {
                  const t = previewTimes(b)
                  const layout = columns.get(b.id) ?? { col: 0, cols: 1 }
                  const v = b.vendor_id ? vendorById.get(b.vendor_id) : undefined
                  const bg = v?.colour ?? NO_VENDOR_COLOUR
                  const fg = v ? readableText(v.colour) : '#111827'
                  const height = Math.max(MIN_BLOCK_PX, (t.end - t.start) * PX_PER_MIN)
                  const isDragging = drag?.id === b.id
                  return (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${b.title}, ${formatRange(b.start_min, b.end_min)}`}
                      onKeyDown={(e) => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEditing({ kind: 'block', id: b.id }) } }}
                      onPointerDown={(e) => onPointerDown(e, b, 'move')}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => onPointerUp(b)}
                      onPointerCancel={onPointerCancel}
                      className={`absolute touch-none select-none overflow-hidden rounded-lg border text-left shadow-sm ${isDragging ? 'z-20 cursor-grabbing opacity-90 ring-2 ring-brand-600' : readOnly ? '' : 'cursor-grab'} ${editing?.kind === 'block' && editing.id === b.id ? 'ring-2 ring-brand-600' : ''}`}
                      style={{
                        top: (t.start - range.from) * PX_PER_MIN,
                        height,
                        left: `calc(${(layout.col / layout.cols) * 100}% + 2px)`,
                        width: `calc(${100 / layout.cols}% - 4px)`,
                        background: bg,
                        color: fg,
                        borderColor: 'rgba(0,0,0,0.15)',
                      }}
                    >
                      <div className="px-2 py-1 text-xs leading-tight">
                        <p className="truncate font-medium">{b.title}</p>
                        <p className="truncate opacity-80">{formatRange(t.start, t.end)}{v ? ` · ${v.name}` : ''}</p>
                      </div>
                      <div
                        onPointerDown={(e) => onPointerDown(e, b, 'resize')}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => onPointerUp(b)}
                        onPointerCancel={onPointerCancel}
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize bg-black/10 hover:bg-black/25"
                        aria-hidden
                        title="Drag to change the length"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {editing && day && (
        <BlockPanel
          key={editing.kind === 'block' ? editing.id : `new-${editing.start}`}
          projectId={projectId}
          day={day}
          block={editingBlock}
          initialStart={editing.kind === 'new' ? editing.start : undefined}
          initialEnd={editing.kind === 'new' ? editing.end : undefined}
          vendors={vendors}
          setBlocks={setBlocks}
          onManageVendors={() => setShowVendors(true)}
          onClose={() => setEditing(null)}
        />
      )}

      {showVendors && (
        <VendorManager teamId={teamId} vendors={vendors} setVendors={setVendors} setBlocks={setBlocks} onClose={() => setShowVendors(false)} />
      )}
    </div>
  )
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Day bar: rename, date, delete ────────────────────────────────────────────

function DayBar(p: {
  day: DbProjectDay
  blockCount: number
  setDays: Dispatch<SetStateAction<DbProjectDay[]>>
  setBlocks: Dispatch<SetStateAction<DbTimetableBlock[]>>
  setActiveDayId: (id: string | null) => void
  run: (fn: () => Promise<void>) => Promise<void>
}) {
  const { day } = p
  const [label, setLabel] = useState(day.label)
  const [date, setDate] = useState(day.day_date ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dirty = label.trim() !== day.label || date !== (day.day_date ?? '')

  const save = () =>
    p.run(async () => {
      if (!label.trim()) throw new Error('A day needs a name.')
      const saved = await updateDay(day.id, { label, day_date: date || null })
      p.setDays((prev) => prev.map((d) => (d.id === saved.id ? saved : d)))
    })

  const remove = () =>
    p.run(async () => {
      await deleteDay(day.id)
      p.setDays((prev) => prev.filter((d) => d.id !== day.id))
      p.setBlocks((prev) => prev.filter((b) => b.day_id !== day.id))
      p.setActiveDayId(null)
    })

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} aria-label="Day name" className={input + ' w-44'} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day date" className={input} />
      {dirty && <button type="button" onClick={save} className={btn}>Save day</button>}
      <span className="flex-1" />
      {confirmDelete ? (
        <span className="flex items-center gap-2 text-xs text-gray-700">
          Delete this day{p.blockCount > 0 ? ` and its ${p.blockCount} block${p.blockCount === 1 ? '' : 's'}` : ''}?
          <button type="button" onClick={remove} className={btn + ' border-red-300 text-red-700'}>Yes, delete</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className={btn}>Cancel</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className={btn}>Delete day</button>
      )}
    </div>
  )
}

// ── Block editor ─────────────────────────────────────────────────────────────

function BlockPanel(p: {
  projectId: string
  day: DbProjectDay
  block: DbTimetableBlock | null
  initialStart?: number
  initialEnd?: number
  vendors: DbTeamVendor[]
  setBlocks: Dispatch<SetStateAction<DbTimetableBlock[]>>
  onManageVendors: () => void
  onClose: () => void
}) {
  const { block } = p
  const [title, setTitle] = useState(block?.title ?? '')
  const [start, setStart] = useState(formatClock(block?.start_min ?? p.initialStart ?? 18 * 60))
  const [end, setEnd] = useState(formatClock(block?.end_min ?? p.initialEnd ?? 19 * 60))
  const [vendorId, setVendorId] = useState(block?.vendor_id ?? '')
  const [person, setPerson] = useState(block?.person ?? '')
  const [notes, setNotes] = useState(block?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async () => {
    setError(null)
    if (!title.trim()) return setError('Give the block a title.')
    const t = resolveTimes(start, end)
    if (!t.ok) return setError(t.error)
    setBusy(true)
    try {
      const fields = {
        title,
        start_min: t.start,
        end_min: t.end,
        vendor_id: vendorId || null,
        person: person.trim() || null,
        notes: notes.trim() || null,
      }
      if (block) {
        const saved = await updateBlock(block.id, fields)
        p.setBlocks((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      } else {
        const saved = await createBlock(p.projectId, p.day.id, fields)
        p.setBlocks((prev) => [...prev, saved])
      }
      p.onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!block) return
    setBusy(true)
    setError(null)
    try {
      await deleteBlock(block.id)
      p.setBlocks((prev) => prev.filter((x) => x.id !== block.id))
      p.onClose()
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  const label = 'block text-xs font-medium text-gray-600 mb-1'
  const parsed = resolveTimes(start, end)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={p.onClose}>
      <aside
        role="dialog"
        aria-label={block ? 'Edit block' : 'New block'}
        className="h-full w-full max-w-sm space-y-4 overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{block ? 'Edit block' : 'New block'}</h2>
          <button type="button" onClick={p.onClose} className={btn} aria-label="Close">✕</button>
        </div>

        <div>
          <label className={label} htmlFor="tb-title">Title</label>
          <input id="tb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Cocktail hour" className={input + ' w-full'} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor="tb-start">Start</label>
            <input id="tb-start" value={start} onChange={(e) => setStart(e.target.value)} placeholder="18:00" className={input + ' w-full'} />
          </div>
          <div>
            <label className={label} htmlFor="tb-end">End</label>
            <input id="tb-end" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="19:00" className={input + ' w-full'} />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {parsed.ok ? `${formatRange(parsed.start, parsed.end)} · ${durationLabel(parsed.start, parsed.end)}` : parsed.error}
          {parsed.ok && parsed.end >= 1440 ? ' · an end before the start means after midnight' : ''}
        </p>

        <div>
          <label className={label} htmlFor="tb-vendor">Vendor</label>
          <div className="flex gap-1.5">
            <select id="tb-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={input + ' min-w-0 flex-1'}>
              <option value="">No vendor</option>
              {p.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button type="button" onClick={p.onManageVendors} className={btn}>Manage…</button>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="tb-person">Person in charge (optional)</label>
          <input id="tb-person" value={person} onChange={(e) => setPerson(e.target.value)} maxLength={120} className={input + ' w-full'} />
        </div>

        <div>
          <label className={label} htmlFor="tb-notes">Notes</label>
          <textarea id="tb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className={input + ' w-full'} />
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={busy} className={btnPrimary}>{block ? 'Save' : 'Add block'}</button>
          <button type="button" onClick={p.onClose} className={btn}>Cancel</button>
          <span className="flex-1" />
          {block && (confirmDelete ? (
            <button type="button" onClick={remove} disabled={busy} className={btn + ' border-red-300 text-red-700'}>Confirm delete</button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={btn}>Delete</button>
          ))}
        </div>
      </aside>
    </div>
  )
}

/** "18:00" for the editor fields (no "(+1)" suffix, so it round-trips through parseTime). */
function formatClock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// ── Vendor manager ───────────────────────────────────────────────────────────

const EMPTY_VENDOR: VendorInput = { name: '', colour: '#6366f1', contact_name: null, phone: null, email: null, instagram: null, notes: null }

function VendorManager(p: {
  teamId: string
  vendors: DbTeamVendor[]
  setVendors: Dispatch<SetStateAction<DbTeamVendor[]>>
  setBlocks: Dispatch<SetStateAction<DbTimetableBlock[]>>
  onClose: () => void
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(p.vendors.length === 0 ? 'new' : null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={p.onClose}>
      <div role="dialog" aria-label="Vendors" className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Vendors</h2>
          <button type="button" onClick={p.onClose} className={btn} aria-label="Close">✕</button>
        </div>
        <p className="text-xs text-gray-500">Shared with your whole team. A vendor&rsquo;s colour tints its blocks on the timetable; contact details and Instagram appear in the run-down.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {p.vendors.map((v) => (
            <li key={v.id} className="p-2">
              {editingId === v.id ? (
                <VendorForm
                  key={v.id}
                  initial={toInput(v)}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (input) => {
                    const saved = await updateVendor(v.id, input)
                    p.setVendors((prev) => prev.map((x) => (x.id === saved.id ? saved : x)).sort(byName))
                    setEditingId(null)
                  }}
                  onDelete={async () => {
                    await deleteVendor(v.id)
                    p.setVendors((prev) => prev.filter((x) => x.id !== v.id))
                    // The database untags the blocks (on delete set null); mirror that here.
                    p.setBlocks((prev) => prev.map((b) => (b.vendor_id === v.id ? { ...b, vendor_id: null } : b)))
                    setEditingId(null)
                  }}
                  setError={setError}
                />
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: v.colour }} />
                  <span className="min-w-0 flex-1 truncate text-gray-900">{v.name}</span>
                  <button type="button" onClick={() => { setError(null); setEditingId(v.id) }} className={btn}>Edit</button>
                </div>
              )}
            </li>
          ))}
          {p.vendors.length === 0 && <li className="p-3 text-sm text-gray-500">No vendors yet.</li>}
        </ul>

        {editingId === 'new' ? (
          <VendorForm
            initial={EMPTY_VENDOR}
            submitLabel="Add vendor"
            onCancel={() => setEditingId(null)}
            onSubmit={async (input) => {
              const created = await createVendor(p.teamId, input)
              p.setVendors((prev) => [...prev, created].sort(byName))
              setEditingId(null)
            }}
            setError={setError}
          />
        ) : (
          <button type="button" onClick={() => { setError(null); setEditingId('new') }} className={btn}>+ New vendor</button>
        )}
      </div>
    </div>
  )
}

const byName = (a: DbTeamVendor, b: DbTeamVendor) => a.name.localeCompare(b.name)
const toInput = (v: DbTeamVendor): VendorInput => ({
  name: v.name, colour: v.colour, contact_name: v.contact_name, phone: v.phone, email: v.email, instagram: v.instagram, notes: v.notes,
})

function VendorForm(p: {
  initial: VendorInput
  submitLabel: string
  onSubmit: (input: VendorInput) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
  setError: (m: string | null) => void
}) {
  const [f, setF] = useState({
    name: p.initial.name, colour: p.initial.colour, contact_name: p.initial.contact_name ?? '', phone: p.initial.phone ?? '',
    email: p.initial.email ?? '', instagram: p.initial.instagram ?? '', notes: p.initial.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const nul = (s: string) => s.trim() || null

  const guard = async (fn: () => Promise<void>) => {
    p.setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      const m = errMsg(e)
      p.setError(/duplicate|unique/i.test(m) ? 'You already have a vendor with that name.' : m)
      setBusy(false)
    }
  }

  const submit = () =>
    guard(async () => {
      if (!f.name.trim()) throw new Error('A vendor needs a name.')
      await p.onSubmit({
        name: f.name, colour: f.colour, contact_name: nul(f.contact_name), phone: nul(f.phone),
        email: nul(f.email), instagram: nul(f.instagram), notes: nul(f.notes),
      })
    })

  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-2">
        <input value={f.name} onChange={set('name')} maxLength={80} placeholder="Vendor name" aria-label="Vendor name" className={input + ' min-w-0 flex-1'} />
        <input type="color" value={f.colour} onChange={set('colour')} aria-label="Vendor colour" className="h-8 w-10 cursor-pointer rounded-lg border border-gray-300 bg-white p-0.5" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={f.contact_name} onChange={set('contact_name')} maxLength={120} placeholder="Contact name" aria-label="Contact name" className={input} />
        <input value={f.phone} onChange={set('phone')} maxLength={40} placeholder="Phone" aria-label="Phone" className={input} />
        <input value={f.email} onChange={set('email')} maxLength={120} placeholder="Email" aria-label="Email" className={input} />
        <input value={f.instagram} onChange={set('instagram')} maxLength={60} placeholder="Instagram (@handle)" aria-label="Instagram" className={input} />
      </div>
      <textarea value={f.notes} onChange={set('notes')} maxLength={500} rows={2} placeholder="Notes" aria-label="Vendor notes" className={input + ' w-full'} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className={btnPrimary}>{p.submitLabel}</button>
        <button type="button" onClick={p.onCancel} disabled={busy} className={btn}>Cancel</button>
        <span className="flex-1" />
        {p.onDelete && (confirmDelete ? (
          <button type="button" disabled={busy} onClick={() => guard(p.onDelete!)} className={btn + ' border-red-300 text-red-700'} title="Blocks keep their times and just lose the vendor tag">Confirm delete</button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className={btn}>Delete</button>
        ))}
      </div>
    </div>
  )
}
