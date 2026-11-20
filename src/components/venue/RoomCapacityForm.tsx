'use client'

import { useState } from 'react'
import type { DbRoom } from '@/types/db'
import { updateRoomCapacity } from '@/lib/supabase/capacityQueries'

type Props = {
  room: DbRoom
  onSaved: (updated: DbRoom) => void
}

/** Venue Manager: how many people the room holds when set up seated, and when standing. */
export default function RoomCapacityForm({ room, onSaved }: Props) {
  const [seated, setSeated] = useState(room.capacity_seated?.toString() ?? '')
  const [standing, setStanding] = useState(room.capacity_standing?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const parse = (v: string): number | null | undefined => {
    const t = v.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : undefined
  }

  const save = async () => {
    const s = parse(seated)
    const st = parse(standing)
    if (s === undefined || st === undefined) return setMessage({ ok: false, text: 'Use whole numbers from 0 to 100000, or leave empty.' })
    setSaving(true)
    setMessage(null)
    try {
      await updateRoomCapacity(room.id, s, st)
      onSaved({ ...room, capacity_seated: s, capacity_standing: st })
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save.' })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-28 rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900'
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 space-y-2">
      <h3 className="text-sm font-medium text-gray-900">Capacity of {room.name}</h3>
      <p className="text-xs text-gray-500">
        Maximum number of people. Planners choose per project whether this room is seated (dinner, ceremony) or
        standing (cocktail, dancing, a few chairs are fine) and see the matching limit. Leave empty if unknown.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Seated</span>
          <input type="number" min="0" inputMode="numeric" value={seated} onChange={(e) => setSeated(e.target.value)} className={field} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Standing</span>
          <input type="number" min="0" inputMode="numeric" value={standing} onChange={(e) => setStanding(e.target.value)} className={field} />
        </label>
        <button onClick={save} disabled={saving} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {saving ? 'Saving…' : 'Save capacity'}
        </button>
        {message && <span className={`text-xs ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</span>}
      </div>
    </div>
  )
}
