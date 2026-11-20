'use client'

import { useRef, useState } from 'react'
import type { DbGuest } from '@/types/db'
import { createGuests } from '@/lib/supabase/guestQueries'
import { IMPORT_ACCEPT, MAX_IMPORT_NAMES, namesFromText, readGuestFile, splitNew } from '@/lib/guestImport'

const btn = 'rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
const btnPrimary = 'rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50'

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
}

/**
 * Import guests from a file (.txt, .csv, .pdf) or pasted text. Nothing is saved until "Import" is pressed,
 * and names that are already in the list are skipped so importing twice does not duplicate anyone.
 */
export default function GuestImport({
  projectId,
  existingNames,
  onImported,
  onClose,
}: {
  projectId: string
  existingNames: string[]
  onImported: (added: DbGuest[]) => void
  onClose: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)

  const names = namesFromText(text)
  const { fresh, skipped } = splitNew(names, existingNames)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setReading(true)
    try {
      const found = await readGuestFile(file)
      setText(found.join('\n'))
      setSource(file.name)
      if (found.length === 0) setError('No names were found in that file. You can paste them below.')
    } catch (err) {
      setError(msg(err))
    } finally {
      setReading(false)
    }
  }

  const save = async () => {
    if (fresh.length === 0) return
    setError(null)
    setSaving(true)
    try {
      onImported(await createGuests(projectId, fresh))
      onClose()
    } catch (err) {
      setError(msg(err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Import guests">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900">Import guests</h3>
        <p className="mt-1 text-xs text-gray-500">
          Choose a .txt, .csv or .pdf file, or paste names below (one per line). Review the list before importing. Only names are imported;
          VIP, speeches, family and age group are set per guest afterwards.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={reading || saving} className={btn}>
            {reading ? 'Reading file…' : 'Choose file'}
          </button>
          {source && !reading && <span className="truncate text-xs text-gray-500">{source}</span>}
          <input ref={fileInput} type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={pick} />
        </div>

        {error && <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          disabled={reading}
          placeholder="One name per line…"
          aria-label="Guest names, one per line"
          className="mt-3 w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
        />

        <p className="mt-1 text-xs text-gray-500">
          {fresh.length} new {fresh.length === 1 ? 'guest' : 'guests'}
          {skipped > 0 && ` · ${skipped} already in the list will be skipped`}
          {names.length >= MAX_IMPORT_NAMES && ` · only the first ${MAX_IMPORT_NAMES} names are used`}
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={btn + ' !py-1.5 !text-sm'}>Cancel</button>
          <button type="button" onClick={save} disabled={saving || reading || fresh.length === 0} className={btnPrimary}>
            {saving ? 'Importing…' : `Import ${fresh.length} ${fresh.length === 1 ? 'guest' : 'guests'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
