'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
  const tc = useTranslations('Capacity')
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
      setError(err instanceof Error ? err.message : tc('saveChoiceError'))
    } finally {
      setBusy(false)
    }
  }

  // First visit to this room in this project: the planner must choose.
  if (!setting) {
    if (!canEdit) return null
    return (
      <div data-tour="room-mode-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={tc('seatedOrStanding')}>
        <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-3">
          <h2 className="text-base font-semibold text-gray-900">{tc('howUsedQ', { room: room.name })}</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['seated', 'standing'] as CapacityMode[]).map((m) => {
              const limit = capacityLimit(room, m)
              return (
                <button
                  key={m}
                  disabled={busy}
                  onClick={() => chooseMode(m)}
                  className="rounded-lg border border-gray-200 p-3 text-left hover:border-brand-400 disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-gray-900">{modeLabel(m, tc)}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {m === 'seated' ? tc('seatedHint') : tc('standingHint')}
                  </span>
                  <span className="block text-xs text-gray-700 mt-2">
                    {limit !== null ? tc('upToPeople', { limit }) : tc('noLimitVenue')}
                  </span>
                </button>
              )
            })}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
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
    if (!text) return setError(tc('noteRequired'))
    setBusy(true)
    setError(null)
    try {
      upsertLocal(await acknowledgeOverLimit(projectId, room.id, text.slice(0, 300), load))
      setAsking(false)
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : tc('saveNoteError'))
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
          title={setting.override_note ? tc('overAckTitle', { note: setting.override_note }) : undefined}
        >
          {limit === null
            ? tc('loadNoLimit', { load, unit: unitLabel(mode, load, tc) })
            : tc('loadOfLimit', { load, limit, unit: unitLabel(mode, limit, tc) })}
          {status.state === 'acknowledged' ? tc('overAckShort') : ''}
        </span>
        {canEdit && (
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as CapacityMode
              if (next === mode) return
              if (setting.override_note && !confirm(tc('changeSceneConfirm'))) return
              chooseMode(next)
            }}
            aria-label={tc('seatedOrStanding')}
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700"
          >
            <option value="seated">{tc('seated')}</option>
            <option value="standing">{tc('standing')}</option>
          </select>
        )}
      </span>

      {status.state === 'over' && (
        <div role="alert" className="fixed left-1/2 top-14 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-red-200 bg-white p-3 shadow-lg">
          <p className="text-sm font-medium text-red-700">
            {tc('overLimitMsg', { room: room.name, mode: mode === 'seated' ? tc('modeSeatedLower') : tc('modeStandingLower'), load, unit: unitLabel(mode, load, tc), limit: limit ?? 0 })}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {mode === 'seated' ? tc('countedChairs') : tc('countedGuests')} {tc('warningNotBlock')}
          </p>
          {canEdit && !asking && (
            <button onClick={() => setAsking(true)} className="mt-2 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
              {tc('continueAnyway')}
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
                placeholder={tc('notePlaceholder')}
                className="w-full rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900"
              />
              <div className="flex items-center gap-2">
                <button onClick={submitNote} disabled={busy} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs text-white disabled:opacity-40">{tc('saveNoteContinue')}</button>
                <button onClick={() => { setAsking(false); setError(null) }} className="text-xs text-gray-500">{tc('cancel')}</button>
              </div>
            </div>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </>
  )
}
