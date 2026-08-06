'use client'

import { useState } from 'react'
import { DbRoom } from '@/types/db'
import FloorPlanEditor from './FloorPlanEditor'

type Props = {
  venueId: string
  rooms: DbRoom[]
}

export default function RoomFloorPlanManager({ venueId, rooms: initialRooms }: Props) {
  const [rooms, setRooms] = useState(initialRooms)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRooms[0]?.id ?? null)

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null

  const handleRoomUpdated = (updated: DbRoom) => {
    setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  if (rooms.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No rooms set up for this venue yet — an admin needs to add one before you can upload a floor plan.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Room:</label>
        <select
          value={selectedRoomId ?? ''}
          onChange={(e) => setSelectedRoomId(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {selectedRoom && (
        // key forces a remount on room switch so FloorPlanEditor's local draft
        // state (boundary/obstacles/tool/calibration) resets cleanly — see the
        // note at the top of that component.
        <FloorPlanEditor key={selectedRoom.id} venueId={venueId} room={selectedRoom} onRoomUpdated={handleRoomUpdated} />
      )}
    </div>
  )
}
