'use client'

import { useMemo, useRef, useState } from 'react'
import type { DbGuest, DbGuestFamily } from '@/types/db'
import { importGuests } from '@/lib/supabase/guestQueries'
import {
  IMPORT_ACCEPT,
  MAX_IMPORT_NAMES,
  blankGuest,
  namesFromText,
  readGuestFile,
  type ImportAge,
  type ImportFamily,
  type ImportGuest,
} from '@/lib/guestImport'

const btn = 'rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50'
const cell = 'w-full rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-900'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
}

type Row = ImportGuest & { include: boolean }

/**
 * Import guests from a file (.txt, .csv, .pdf) or pasted names. The file can also carry VIP, speeches,
 * age group, dietary needs, notes and families; they appear in the table below for review and editing.
 * Nothing is saved until "Import" is pressed. Names already in the list are skipped.
 */
export default function GuestImport({
  projectId,
  existingNames,
  onImported,
  onClose,
}: {
  projectId: string
  existingNames: string[]
  onImported: (added: DbGuest[], families: DbGuestFamily[]) => void
  onClose: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [families, setFamilies] = useState<ImportFamily[]>([])
  const [paste, setPaste] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)

  const existing = useMemo(() => new Set(existingNames.map(fold)), [existingNames])
  const isDup = (r: Row) => existing.has(fold(r.name))
  const chosen = rows.filter((r) => r.include && r.name.trim() && !isDup(r))
  const dupCount = rows.filter(isDup).length
  const famName = (key: string) => families.find((f) => f.key === key)?.name ?? ''

  const patch = (i: number, p: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...p } : r)))

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setReading(true)
    try {
      const res = await readGuestFile(file)
      setRows(res.guests.map((g) => ({ ...g, include: true })))
      setFamilies(res.families)
      setSource(file.name)
      if (res.guests.length === 0) setError('No guests were found in that file. You can paste names below.')
    } catch (err) {
      setError(msg(err))
    } finally {
      setReading(false)
    }
  }

  const addPasted = () => {
    const have = new Set(rows.map((r) => fold(r.name)))
    const add = namesFromText(paste).filter((n) => !have.has(fold(n)))
    setRows((prev) => [...prev, ...add.map((n) => ({ ...blankGuest(n), include: true }))])
    setPaste('')
  }

  const save = async () => {
    if (chosen.length === 0) return
    setError(null)
    setSaving(true)
    try {
      const usedKeys = new Set(chosen.map((r) => r.family).filter(Boolean))
      const used = families.filter((f) => usedKeys.has(f.key) && chosen.filter((r) => r.family === f.key).length >= 2)
      const okKeys = new Set(used.map((f) => f.key))
      const res = await importGuests(
        projectId,
        used,
        chosen.map((r) => ({
          name: r.name,
          notes: r.notes.trim() || null,
          is_vip: r.vip,
          gives_speech: r.speech,
          dietary: r.dietary.trim() || null,
          age_group: r.age,
          familyKey: okKeys.has(r.family) ? r.family : '',
        })),
      )
      onImported(res.guests, res.families)
      onClose()
    } catch (err) {
      setError(msg(err))
      setSaving(false)
    }
  }

  const vipN = chosen.filter((r) => r.vip).length
  const speechN = chosen.filter((r) => r.speech).length
  const kidsN = chosen.filter((r) => r.age !== 'adult').length
  const famN = new Set(chosen.filter((r) => r.family && chosen.filter((x) => x.family === r.family).length >= 2).map((r) => r.family)).size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Import guests">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900">Import guests</h3>
        <p className="mt-1 text-xs text-gray-500">
          Choose a .txt, .csv or .pdf file, or paste names. A .csv or .pdf can also carry VIP, speeches, age group, dietary needs, notes and
          families; only what the file states is filled in. Review and edit below. Nothing is saved until you press Import.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={reading || saving} className={btn}>
            {reading ? 'Reading file…' : 'Choose file'}
          </button>
          {source && !reading && <span className="truncate text-xs text-gray-500">{source}</span>}
          <input ref={fileInput} type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={pick} />
        </div>

        {error && <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}

        {rows.length > 0 && (
          <div className="mt-3 min-h-0 flex-1 overflow-auto rounded border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 font-medium"><span className="sr-only">Include</span></th>
                  <th className="px-2 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 font-medium">VIP</th>
                  <th className="px-2 py-1.5 font-medium">Speech</th>
                  <th className="px-2 py-1.5 font-medium">Age</th>
                  <th className="px-2 py-1.5 font-medium">Family</th>
                  <th className="px-2 py-1.5 font-medium">Dietary</th>
                  <th className="px-2 py-1.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const dup = isDup(r)
                  return (
                    <tr key={i} className={`border-t border-gray-100 ${dup || !r.include ? 'bg-gray-50 text-gray-400' : ''}`}>
                      <td className="px-2 py-1">
                        <input type="checkbox" checked={r.include && !dup} disabled={dup} onChange={(e) => patch(i, { include: e.target.checked })} aria-label={`Import ${r.name}`} />
                      </td>
                      <td className="min-w-40 px-2 py-1">
                        <input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} maxLength={120} className={cell} aria-label="Name" />
                        {dup && <span className="text-[10px]">already in the list</span>}
                      </td>
                      <td className="px-2 py-1"><input type="checkbox" checked={r.vip} onChange={(e) => patch(i, { vip: e.target.checked })} aria-label={`${r.name} VIP`} /></td>
                      <td className="px-2 py-1"><input type="checkbox" checked={r.speech} onChange={(e) => patch(i, { speech: e.target.checked })} aria-label={`${r.name} gives a speech`} /></td>
                      <td className="px-2 py-1">
                        <select value={r.age} onChange={(e) => patch(i, { age: e.target.value as ImportAge })} className={cell} aria-label={`${r.name} age group`}>
                          <option value="adult">Adult</option>
                          <option value="child">Child</option>
                          <option value="baby">Baby</option>
                        </select>
                      </td>
                      <td className="min-w-32 px-2 py-1">
                        <select value={r.family} onChange={(e) => patch(i, { family: e.target.value })} className={cell} aria-label={`${r.name} family`}>
                          <option value="">None</option>
                          {families.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                        </select>
                      </td>
                      <td className="min-w-28 px-2 py-1"><input value={r.dietary} onChange={(e) => patch(i, { dietary: e.target.value })} maxLength={500} className={cell} aria-label={`${r.name} dietary`} /></td>
                      <td className="min-w-32 px-2 py-1"><input value={r.notes} onChange={(e) => patch(i, { notes: e.target.value })} maxLength={300} className={cell} aria-label={`${r.name} notes`} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex items-start gap-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={rows.length ? 2 : 6}
            disabled={reading}
            placeholder="Or paste names here, one per line…"
            aria-label="Paste guest names, one per line"
            className="min-w-0 flex-1 rounded border border-gray-300 p-2 text-sm text-gray-900"
          />
          <button type="button" onClick={addPasted} disabled={!paste.trim() || reading} className={btn}>Add names</button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {chosen.length} to import
          {chosen.length > 0 && ` · ${vipN} VIP · ${speechN} speeches · ${kidsN} children/babies · ${famN} ${famN === 1 ? 'family' : 'families'}`}
          {dupCount > 0 && ` · ${dupCount} already in the list (skipped)`}
          {rows.length >= MAX_IMPORT_NAMES && ` · only the first ${MAX_IMPORT_NAMES} are read`}
          {families.length > 0 && chosen.some((r) => r.family) && ` · families: ${families.filter((f) => chosen.some((r) => r.family === f.key)).map((f) => famName(f.key)).join(', ')}`}
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={btn + ' !py-1.5 !text-sm'}>Cancel</button>
          <button type="button" onClick={save} disabled={saving || reading || chosen.length === 0} className={btnPrimary}>
            {saving ? 'Importing…' : `Import ${chosen.length} ${chosen.length === 1 ? 'guest' : 'guests'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
