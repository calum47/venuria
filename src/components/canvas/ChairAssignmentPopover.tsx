'use client'

import { useState } from 'react'
import { useGuestStore } from '@/stores/guestStore'
import { assignSeat, unassignSeat, addGuest } from '@/lib/supabase/queries'

type Props = {
  chairId: string
  projectId: string
  chairLabel: string  // seat number or table label
  onClose: () => void
}

export default function ChairAssignmentPopover({ chairId, projectId, chairLabel, onClose }: Props) {
  const {
    guests,
    getGuestForChair,
    assignGuest,
    unassignGuest,
    addGuest: addGuestLocal,
  } = useGuestStore()

  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const assignedGuest = getGuestForChair(chairId)
  const unassignedGuests = guests.filter(
    (g) => !useGuestStore.getState().getAssignmentForGuest(g.id)
  )
  const filtered = unassignedGuests.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAssign = async (guestId: string) => {
    setIsWorking(true)
    try {
      const assignment = await assignSeat(projectId, guestId, chairId)
      assignGuest({
        id: assignment.id,
        projectId,
        guestId,
        layoutObjectId: chairId,
      })
      onClose()
    } catch (err) {
      console.error('Failed to assign:', err)
    } finally {
      setIsWorking(false)
    }
  }

  const handleUnassign = async () => {
    if (!assignedGuest) return
    setIsWorking(true)
    try {
      await unassignSeat(assignedGuest.id)
      unassignGuest(assignedGuest.id)
      onClose()
    } catch (err) {
      console.error('Failed to unassign:', err)
    } finally {
      setIsWorking(false)
    }
  }

  const handleAddAndAssign = async () => {
    if (!newName.trim()) return
    setIsWorking(true)
    try {
      const guest = await addGuest(projectId, newName.trim())
      addGuestLocal(guest)
      const assignment = await assignSeat(projectId, guest.id, chairId)
      assignGuest({
        id: assignment.id,
        projectId,
        guestId: guest.id,
        layoutObjectId: chairId,
      })
      onClose()
    } catch (err) {
      console.error('Failed to add & assign:', err)
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute bg-white rounded-xl shadow-2xl border border-gray-100 w-72 p-4"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Seat {chairLabel}</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg leading-none">✕</button>
        </div>

        {/* Currently assigned */}
        {assignedGuest ? (
          <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2 mb-3">
            <div>
              <p className="text-xs font-medium text-green-800">{assignedGuest.name}</p>
              {assignedGuest.notes && (
                <p className="text-[10px] text-green-500">{assignedGuest.notes}</p>
              )}
            </div>
            <button
              onClick={handleUnassign}
              disabled={isWorking}
              className="text-[10px] text-red-400 hover:text-red-600 transition-colors"
            >
              Remove
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-3">No guest assigned</p>
        )}

        {/* Search unassigned guests */}
        <input
          type="text"
          placeholder="Search guests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />

        {/* Guest list */}
        <div className="max-h-40 overflow-y-auto mb-3 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">
              {guests.length === 0 ? 'No guests in list yet' : 'No unassigned guests match'}
            </p>
          )}
          {filtered.map((guest) => (
            <button
              key={guest.id}
              onClick={() => handleAssign(guest.id)}
              disabled={isWorking}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <p className="text-xs font-medium text-gray-700">{guest.name}</p>
              {guest.notes && <p className="text-[10px] text-gray-400">{guest.notes}</p>}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] text-gray-400 mb-2 uppercase tracking-wide">Add new & assign</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Guest name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAndAssign() }}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
            <button
              onClick={handleAddAndAssign}
              disabled={isWorking || !newName.trim()}
              className="text-xs bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}