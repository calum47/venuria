'use client'

import { useState, useRef } from 'react'
import { useGuestStore, Guest } from '@/stores/guestStore'
import { addGuest, deleteGuest, bulkAddGuests } from '@/lib/supabase/queries'
import { IMPORT_ACCEPT, namesFromText, readGuestFile, splitNew } from '@/lib/guestImport'

type Props = {
  projectId: string
  // Called when user starts dragging a guest card — passes guestId
  onDragStart: (guestId: string) => void
}

export default function GuestPanel({ projectId, onDragStart }: Props) {
  const { guests, seatAssignments, addGuest: addGuestLocal, removeGuest } = useGuestStore()
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = guests.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
  const assignedCount = seatAssignments.length
  const totalCount = guests.length

  const handleAddGuest = async () => {
    if (!newName.trim()) return
    setIsAdding(true)
    try {
      const guest = await addGuest(projectId, newName.trim())
      addGuestLocal(guest)
      setNewName('')
    } catch (err) {
      console.error('Failed to add guest:', err)
    } finally {
      setIsAdding(false)
    }
  }

  const handleDelete = async (guestId: string) => {
    try {
      await deleteGuest(guestId)
      removeGuest(guestId)
    } catch (err) {
      console.error('Failed to delete guest:', err)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    setImportError(null)
    try {
      // .txt is read here; .csv and .pdf are read by the server (/api/guests/extract), never by the browser.
      const names = await readGuestFile(file)
      setImportText(names.join('\n'))
      if (names.length === 0) setImportError('No names were found in that file. You can paste them below.')
    } catch (err) {
      setImportText('')
      setImportError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setShowImport(true)
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const importNames = namesFromText(importText)
  const { fresh: freshNames, skipped: skippedNames } = splitNew(importNames, guests.map((g) => g.name))

  const handleConfirmImport = async () => {
    if (freshNames.length === 0) return
    try {
      const newGuests = await bulkAddGuests(projectId, freshNames)
      newGuests.forEach((g: Guest) => addGuestLocal(g))
      setShowImport(false)
      setImportText('')
      setImportError(null)
    } catch (err) {
      console.error('Bulk import failed:', err)
      setImportError('Could not save the guests. Nothing was added; try again.')
    }
  }

  return (
    <div className="w-72 h-full bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Guest List</h2>
          <span className="text-xs text-gray-400">{guests.filter(g => seatAssignments.some(a => a.guestId === g.id)).length}/{totalCount} guests seated</span>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search guests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
      </div>

      {/* Guest list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-8 px-4">
            {guests.length === 0 ? 'No guests yet. Add some below.' : 'No guests match your search.'}
          </p>
        )}
        {filtered.map((guest) => {
          const assignmentCount = seatAssignments.filter((a) => a.guestId === guest.id).length
          return (
            <div
              key={guest.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('guestId', guest.id)
                onDragStart(guest.id)
              }}
              className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-grab active:cursor-grabbing group border-b border-gray-50"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${assignmentCount > 0 ? 'bg-green-400' : 'bg-gray-300'}`} />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{guest.name}</p>
                {guest.notes && (
                  <p className="text-[10px] text-gray-400 truncate">{guest.notes}</p>
                )}
                {assignmentCount > 0 && (
                  <p className="text-[10px] text-green-500">
                    Seated in {assignmentCount} room{assignmentCount > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <a
                href={`/planner/projects/${projectId}/guests?guest=${guest.id}`}
                target="_blank"
                rel="noopener noreferrer"
                draggable={false}
                title="Edit details (photo, family, dietary, hotel…) in a new tab"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[10px] text-gray-400 hover:text-gray-800 underline px-1 whitespace-nowrap"
              >
                Edit details
              </a>
              <button
                onClick={() => handleDelete(guest.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity text-xs px-1"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Add guest */}
      <div className="p-3 border-t border-gray-100 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Guest name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuest() }}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          <button
            onClick={handleAddGuest}
            disabled={isAdding || !newName.trim()}
            className="text-xs bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {/* Import */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="w-full text-xs text-gray-500 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {isImporting ? 'Reading file...' : '📎 Import from file'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* Import confirmation modal */}
      {showImport && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Review imported names</h3>
            <p className="text-xs text-gray-400 mb-3">Edit the list below before importing. One name per line.</p>
            {importError && <p className="text-xs text-red-600 mb-2" role="alert">{importError}</p>}
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="w-full text-xs border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
              placeholder="One name per line..."
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setShowImport(false); setImportText(''); setImportError(null) }}
                className="flex-1 text-xs border border-gray-200 text-gray-500 rounded-lg py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 text-xs bg-gray-900 text-white rounded-lg py-2 hover:bg-gray-700"
              >
                Import {freshNames.length} guests
              </button>
            </div>
            {skippedNames > 0 && <p className="text-[10px] text-gray-400 mt-2">{skippedNames} already in the list will be skipped.</p>}
          </div>
        </div>
      )}
    </div>
  )
}