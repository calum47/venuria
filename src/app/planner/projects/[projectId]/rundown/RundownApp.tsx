'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'
import { updateBlock } from '@/lib/supabase/timetableQueries'
import { durationLabel, formatRange, readableText, rundownRows } from '@/lib/timetable'
import { formatDate } from '@/lib/projectDates'

type Props = {
  projectId: string
  title: string
  eventDate: string | null
  days: DbProjectDay[]
  initialBlocks: DbTimetableBlock[]
  vendors: DbTeamVendor[]
  readOnly?: boolean
}

const btn = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const chipBase = 'rounded-full border px-3 py-1 text-xs'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
}

export default function RundownApp({ projectId, title, eventDate, days, initialBlocks, vendors, readOnly = false }: Props) {
  const [blocks, setBlocks] = useState<DbTimetableBlock[]>(initialBlocks)
  const [filter, setFilter] = useState<Set<string>>(new Set())
  const [dayFilter, setDayFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])
  const sortedDays = useMemo(() => [...days].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [days])
  const shownDays = dayFilter === 'all' ? sortedDays : sortedDays.filter((d) => d.id === dayFilter)
  const usedVendorIds = useMemo(() => new Set(blocks.map((b) => b.vendor_id).filter((x): x is string => !!x)), [blocks])
  const filterVendors = vendors.filter((v) => usedVendorIds.has(v.id))
  const filtered = filter.size > 0

  const toggleVendor = (id: string) =>
    setFilter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const patch = async (b: DbTimetableBlock, fields: Parameters<typeof updateBlock>[1]) => {
    setError(null)
    const before = b
    setBlocks((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...fields } : x)))
    try {
      const saved = await updateBlock(b.id, fields)
      setBlocks((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
    } catch (e) {
      setBlocks((prev) => prev.map((x) => (x.id === before.id ? before : x)))
      setError(errMsg(e))
    }
  }

  if (days.length === 0 || blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center print:hidden">
        <p className="text-sm text-gray-600">Nothing yet — add blocks in the timetable.</p>
        <Link href={`/planner/projects/${projectId}/timetable`} className="mt-3 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">Go to the timetable</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 print:hidden">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {sortedDays.length > 1 && (
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} aria-label="Day" className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm">
              <option value="all">All days</option>
              {sortedDays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          )}
          <span className="text-xs text-gray-500">Export for:</span>
          <button type="button" aria-pressed={!filtered} onClick={() => setFilter(new Set())} className={`${chipBase} ${!filtered ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>Everyone</button>
          {filterVendors.map((v) => {
            const on = filter.has(v.id)
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleVendor(v.id)}
                className={`${chipBase} ${on ? 'border-transparent' : 'border-gray-300 bg-white text-gray-700'}`}
                style={on ? { background: v.colour, color: readableText(v.colour) } : undefined}
              >
                {v.name}
              </button>
            )
          })}
          <span className="flex-1" />
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">Print / save as PDF</button>
        </div>
        <p className="text-xs text-gray-500">
          {filtered ? 'Only the selected vendors’ entries are listed and printed. ' : ''}
          Each entry has its own switches for the vendor details shown. Choose “Save as PDF” in the print dialog.
        </p>
      </div>

      <header className="hidden print:block">
        <h1 className="text-xl font-semibold">Run-down — {title}</h1>
        {eventDate && <p className="text-sm">{formatDate(eventDate)}</p>}
      </header>

      {shownDays.map((d) => {
        const rows = rundownRows(blocks.filter((b) => b.day_id === d.id), vendorById, filter)
        if (rows.length === 0 && filtered) return null
        return (
          <section key={d.id} className="space-y-2 break-inside-avoid-page">
            <h2 className="text-base font-semibold text-gray-900">
              {d.label}{d.day_date ? ` · ${formatDate(d.day_date)}` : ''}
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">No blocks on this day.</p>
            ) : (
              <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white print:border-0">
                {rows.map((r) => (
                  <RundownEntry key={r.block.id} row={r} vendor={r.block.vendor_id ? vendorById.get(r.block.vendor_id) : undefined} onPatch={patch} readOnly={readOnly} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function RundownEntry({
  row,
  vendor,
  onPatch,
  readOnly,
}: {
  row: ReturnType<typeof rundownRows<DbTimetableBlock>>[number]
  vendor: DbTeamVendor | undefined
  onPatch: (b: DbTimetableBlock, f: Parameters<typeof updateBlock>[1]) => Promise<void>
  readOnly: boolean
}) {
  const { block: b } = row
  const [editMaterials, setEditMaterials] = useState(false)
  const [draft, setDraft] = useState(b.materials.join('\n'))

  const saveMaterials = async () => {
    const items = draft.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 50)
    setEditMaterials(false)
    if (items.join('\n') !== b.materials.join('\n')) await onPatch(b, { materials: items })
    setDraft(items.join('\n'))
  }

  const sw = 'inline-flex items-center gap-1 text-xs text-gray-600'

  return (
    <li className="flex gap-4 px-4 py-3 text-sm break-inside-avoid">
      <div className="w-36 shrink-0">
        <p className="font-medium text-gray-900">{formatRange(b.start_min, b.end_min)}</p>
        <p className="text-xs text-gray-500">{durationLabel(b.start_min, b.end_min)}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-gray-900">{b.title}</p>
        {(row.vendorName || row.contact.length > 0 || row.instagram) && (
          <p className="text-gray-700">
            {row.vendorName && (
              <span className="mr-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={vendor ? { background: vendor.colour, color: readableText(vendor.colour) } : undefined}>
                {row.vendorName}
              </span>
            )}
            {row.contact.length > 0 && <span className="mr-2">{row.contact.join(' · ')}</span>}
            {row.instagram && <span className="text-gray-600">{row.instagram}</span>}
          </p>
        )}
        {b.person && <p className="text-gray-700">In charge: {b.person}</p>}
        {b.notes && <p className="whitespace-pre-line text-gray-600">{b.notes}</p>}
        {b.materials.length > 0 && !editMaterials && (
          <div>
            <p className="text-xs font-medium text-gray-500">Materials</p>
            <ul className="list-inside list-disc text-gray-700">{b.materials.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
        {editMaterials && (
          <div className="space-y-1 print:hidden">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              aria-label="Materials, one per line"
              placeholder="One item per line"
              className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={saveMaterials} className={btn}>Save materials</button>
              <button type="button" onClick={() => { setDraft(b.materials.join('\n')); setEditMaterials(false) }} className={btn}>Cancel</button>
            </div>
          </div>
        )}

        {/* Editing controls never print */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 print:hidden">
          {vendor ? (
            <>
              <label className={sw}><input type="checkbox" disabled={readOnly} checked={b.show_vendor} onChange={(e) => onPatch(b, { show_vendor: e.target.checked })} /> Show vendor</label>
              <label className={sw}><input type="checkbox" disabled={readOnly} checked={b.show_contact} onChange={(e) => onPatch(b, { show_contact: e.target.checked })} /> Show contact</label>
              <label className={sw}><input type="checkbox" disabled={readOnly} checked={b.show_instagram} onChange={(e) => onPatch(b, { show_instagram: e.target.checked })} /> Show Instagram</label>
            </>
          ) : (
            <span className="text-xs text-gray-400">No vendor tagged</span>
          )}
          {!readOnly && !editMaterials && <button type="button" onClick={() => setEditMaterials(true)} className={btn}>{b.materials.length > 0 ? 'Edit materials' : '+ Materials'}</button>}
        </div>
      </div>
    </li>
  )
}
