'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { DbProjectRoomSetting, DbRoom } from '@/types/db'
import { acknowledgeOverLimit, getRoomSettings, setRoomMode } from '@/lib/supabase/capacityQueries'
import {
  capacityLimit,
  capacityLoad,
  capacityStatus,
  modeLabel,
  unitLabel,
  type CapacityMode,
} from '@/lib/capacity'

type Props = {
  projectId: string
  room: DbRoom | null
  /** Chairs placed in the room that is open right now. */
  chairsInRoom: number
  /** The project's guest total. */
  guestTotal: number
}

/**
 * Area capacity in the editor (migration 024):
 *  - the first time a room is opened in a project the planner must choose Seated or Standing,
 *  - a small "load / limit" badge in the toolbar with a way to change the scene,
 *  - a warning (not a block) when the room is over the venue's limit; "Continue anyway" asks for
 *    a note, which is stored and logged. The warning returns if the room grows past what the note covered.
 * Only people who can edit the project (planner team) are asked or can change anything.
 */
export default function RoomCapacity({ projectId, room, chairsInRoom, guestTotal }: Props) {
  const [settings, setSettings] = useState<DbProjectRoomSetting[] | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getRoomSettings(projectId), supabase.rpc('planner_can_access_project', { pid: projectId })])
      .then(([rows, access]) => {
        if (cancelled) return
        setSettings(rows)
        setCanEdit(access.data === true)
      })
      .catch((err) => !cancelled && console.error('Failed to load room capacity settings:', err))
    return () => { cancelled = true }
  }, [projectId])

  const setting = useMemo(() => settings?.find((s) => s.room_id === room?.id) ?? null, [settings, room?.id])

  const upsertLocal = useCallback((s: DbProjectRoomSetting) => {
    setSettings((prev) => [...(prev ?? []).filter((x) => x.room_id !== s.room_id), s])
  }, [])

  if (!room || settings === null) return null
  // key: switching rooms starts with a clean note / error state.
  return (
    <RoomCapacityBody
      key={room.id}
      projectId={projectId}
      room={room}
      setting={setting}
      canEdit={canEdit}
      onChanged={upsertLocal}
      chairsInRoom={chairsInRoom}
      guestTotal={guestTotal}
    />
  )
}

export function RoomCapacityBody({
  projectId,
  room,
  setting,
  canEdit,
  onChanged,
  chairsInRoom,
  guestTotal,
}: {
  projectId: string
  room: DbRoom
  setting: DbProjectRoomSetting | null
  canEdit: boolean
  onChanged: (s: DbProjectRoomSetting) => void
  chairsInRoom: number
  guestTotal: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const upsertLocal = onChanged

  const chooseMode = async (mode: CapacityMode) => {
    setBusy(true)
    setError(null)
    try {
      upsertLocal(await setRoomMode(projectId, room.id, mode))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the choice.')
    } finally {
      setBusy(false)
    }
  }

  // First visit to this room in this project: the planner must choose.
  if (!setting) {
    if (!canEdit) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Seated or standing">
        <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-3">
          <h2 className="text-base font-semibold text-gray-900">How is “{room.name}” used in this project?</h2>
          <p className="text-sm text-gray-500">This decides which capacity limit applies to the room.</p>
          <div className="grid grid-cols-2 gap-3">
            {(['seated', 'standing'] as CapacityMode[]).map((m) => {
              const limit = capacityLimit(room, m)
              return (
                <button
                  key={m}
                  disabled={busy}
                  onClick={() => chooseMode(m)}
                  className="rounded-lg border border-gray-200 p-3 text-left hover:border-gray-900 disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-gray-900">{modeLabel(m)}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {m === 'seated' ? 'Dinner, ceremony' : 'Cocktail, dancing'}
                  </span>
                  <span className="block text-xs text-gray-700 mt-2">
                    {limit !== null ? `Up to ${limit} people` : 'No limit set by the venue'}
                  </span>
                </button>
              )
            })}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-gray-400">You can change this later from the toolbar.</p>
        </div>
      </div>
    )
  }

  const mode = setting.mode
  const limit = capacityLimit(room, mode)
  const load = capacityLoad(mode, chairsInRoom, guestTotal)
  const status = capacityStatus(limit, load, setting.override_load)

  const submitNote = async () => {
    const text = note.trim()
    if (!text) return setError('Write a short note first (what was agreed, or why it is fine).')
    setBusy(true)
    setError(null)
    try {
      upsertLocal(await acknowledgeOverLimit(projectId, room.id, text.slice(0, 300), load))
      setAsking(false)
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note.')
    } finally {
      setBusy(false)
    }
  }

  const tone =
    status.state === 'over' ? 'bg-red-50 text-red-700 border-red-200'
    : status.state === 'acknowledged' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : status.state === 'near' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'

  return (
    <>
      <span className="flex items-center gap-1.5">
        <span
          className={`rounded-md border px-2 py-1 text-xs ${tone}`}
          title={setting.override_note ? `Over the limit, acknowledged: ${setting.override_note}` : undefined}
        >
          {limit === null
            ? `${load} ${unitLabel(mode, load)} · no limit set`
            : `${load} / ${limit} ${unitLabel(mode, limit)}`}
          {status.state === 'acknowledged' ? ' · over, acknowledged' : ''}
        </span>
        {canEdit && (
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as CapacityMode
              if (next === mode) return
              if (setting.override_note && !confirm('Changing the scene clears the note you wrote for going over the limit. Continue?')) return
              chooseMode(next)
            }}
            aria-label="Seated or standing"
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700"
          >
            <option value="seated">Seated</option>
            <option value="standing">Standing</option>
          </select>
        )}
      </span>

      {status.state === 'over' && (
        <div role="alert" className="fixed left-1/2 top-14 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-red-200 bg-white p-3 shadow-lg">
          <p className="text-sm font-medium text-red-700">
            {room.name} is over its {mode} limit: {load} {unitLabel(mode, load)} against a maximum of {limit}.
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {mode === 'seated' ? 'Counted from the chairs placed in this room.' : 'Counted from the project’s guest total.'} This is a warning, not a block.
          </p>
          {canEdit && !asking && (
            <button onClick={() => setAsking(true)} className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
              Continue anyway…
            </button>
          )}
          {canEdit && asking && (
            <div className="mt-2 space-y-1.5">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={2}
                autoFocus
                placeholder="Note: what was agreed with the venue, or why this is fine"
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-900"
              />
              <div className="flex items-center gap-2">
                <button onClick={submitNote} disabled={busy} className="rounded bg-gray-900 px-2.5 py-1 text-xs text-white disabled:opacity-40">Save note and continue</button>
                <button onClick={() => { setAsking(false); setError(null) }} className="text-xs text-gray-500">Cancel</button>
              </div>
            </div>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </>
  )
}
