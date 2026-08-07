'use client'

import { useState } from 'react'
import { DbRoom } from '@/types/db'
import { createRoom } from '@/lib/supabase/queries'
import FloorPlanEditor from './FloorPlanEditor'
import StockManager from '@/components/stock/StockManager'

type Props = {
  venueId: string
  rooms: DbRoom[]
}

export default function RoomFloorPlanManager({ venueId, rooms: initialRooms }: Props) {
  const [rooms, setRooms] = useState(initialRooms)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRooms[0]?.id ?? null)
  const [showNewRoomForm, setShowNewRoomForm] = useState(initialRooms.length === 0)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomType, setNewRoomType] = useState<'indoor' | 'outdoor'>('indoor')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null

  const handleRoomUpdated = (updated: DbRoom) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const room = await createRoom(venueId, newRoomName.trim(), newRoomType)
      setRooms((prev) => [...prev, room])
      setSelectedRoomId(room.id)
      setNewRoomName('')
      setShowNewRoomForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {rooms.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Room:</label>
          <select
            value={selectedRoomId ?? ''}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="rounded border px-2 py-1 text-sm text-gray-900"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowNewRoomForm((v) => !v)}
            className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
          >
            + New room
          </button>
        </div>
      )}

      {rooms.length === 0 && (
        <p className="text-sm text-gray-500">No rooms set up for this venue yet — add one below.</p>
      )}

      {showNewRoomForm && (
        <form onSubmit={handleCreateRoom} className="flex items-end gap-2 rounded border bg-gray-50 p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Room name</label>
            <input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="e.g. Main Hall"
              className="rounded border bg-white px-2 py-1 text-sm text-gray-900"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Type</label>
            <select
              value={newRoomType}
              onChange={(e) => setNewRoomType(e.target.value as 'indoor' | 'outdoor')}
              className="rounded border bg-white px-2 py-1 text-sm text-gray-900"
            >
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating || !newRoomName.trim()}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            {creating ? 'Creating…' : 'Create room'}
          </button>
          {rooms.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNewRoomForm(false)}
              className="rounded bg-gray-100 px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-200"
            >
              Cancel
            </button>
          )}
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {selectedRoom && (
        // key forces a remount on room switch so FloorPlanEditor's local draft
        // state (boundary/obstacles/tool/calibration) resets cleanly — see the
        // note at the top of that component.
        <FloorPlanEditor key={selectedRoom.id} venueId={venueId} room={selectedRoom} onRoomUpdated={handleRoomUpdated} />
      )}

      <div className="border-t pt-4 mt-2">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Stock — tables &amp; chairs</h3>
        <p className="text-xs text-gray-500 mb-3">
          How many of each standard item this venue physically owns. Not a hard limit yet — a planner
          can still place more than you have; this just tracks what&apos;s yours vs. what would need
          renting later.
        </p>
        <StockManager ownerType="venue" ownerId={venueId} />
      </div>
    </div>
  )
}
