'use client'

import { useState, useRef } from 'react'
import { useGuestStore, Guest } from '@/stores/guestStore'
import { addGuest, deleteGuest, bulkAddGuests } from '@/lib/supabase/queries'

type Props = {
  projectId: string
  // Called when user starts dragging a guest card — passes guestId
  onDragStart: (guestId: string) => void
}

export default function GuestPanel({ projectId, onDragStart }: Props) {
  const { guests, seatAssignments, addGuest: addGuestLocal, removeGuest, getAssignmentForGuest } = useGuestStore()
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
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

    try {
      // Read file as base64 for Claude API
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })

      const isText = file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.csv')

      let messages: any[]
      if (isText) {
        // For text/csv read as plain text
        const text = await file.text()
        messages = [{ role: 'user', content: `Extract all guest/person names from this text. Return ONLY a JSON array of name strings, nothing else, no markdown.\n\n${text}` }]
      } else {
        // For PDF/DOCX send as document to Claude
        const mediaType = file.type || 'application/pdf'
        messages = [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extract all guest/person names from this document. Return ONLY a JSON array of name strings, nothing else, no markdown.' }
          ]
        }]
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages }),
      })

      const result = await response.json()
      const raw = result.content?.[0]?.text ?? '[]'
      const names: string[] = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setImportText(names.join('\n'))
      setShowImport(true)
    } catch (err) {
      console.error('File parse failed:', err)
      setShowImport(true)
      setImportText('')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    const names = importText
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
    if (names.length === 0) return

    try {
      const newGuests = await bulkAddGuests(projectId, names)
      newGuests.forEach((g: Guest) => addGuestLocal(g))
      setShowImport(false)
      setImportText('')
    } catch (err) {
      console.error('Bulk import failed:', err)
    }
  }

  return (
    <div className="w-72 h-full bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Guest List</h2>
          <span className="text-xs text-gray-400">{assignedCount}/{totalCount} seated</span>
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
          const assignment = getAssignmentForGuest(guest.id)
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
              {/* Colour dot — green if seated, gray if not */}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${assignment ? 'bg-green-400' : 'bg-gray-300'}`} />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{guest.name}</p>
                {guest.notes && (
                  <p className="text-[10px] text-gray-400 truncate">{guest.notes}</p>
                )}
                {assignment && (
                  <p className="text-[10px] text-green-500">Seated</p>
                )}
              </div>

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
          accept=".txt,.csv,.pdf,.docx,.doc"
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
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="w-full text-xs border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
              placeholder="One name per line..."
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setShowImport(false); setImportText('') }}
                className="flex-1 text-xs border border-gray-200 text-gray-500 rounded-lg py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 text-xs bg-gray-900 text-white rounded-lg py-2 hover:bg-gray-700"
              >
                Import {importText.split('\n').filter((n) => n.trim()).length} guests
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}