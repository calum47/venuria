'use client'

import { useState, useTransition } from 'react'
import { createProject } from './actions'
import { suggestDueBy, isIsoDate, DUE_BY_LEAD_DAYS } from '@/lib/projectDates'

type Venue = { id: string; name: string }

export default function NewProjectForm({ venues }: { venues: Venue[] }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState('')
  const [dueBy, setDueBy] = useState('')
  const [dueByTouched, setDueByTouched] = useState(false)

  const handleSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await createProject(formData)
      // createProject redirects on success, so reaching here means it failed
      // (redirect() throws internally and never returns a value on the happy path).
      if (result?.error) setError(result.error)
    })
  }

  // Due By follows the event date (−14 days) until the planner edits it by hand.
  const handleEventDateChange = (value: string) => {
    setEventDate(value)
    if (!dueByTouched) setDueBy(isIsoDate(value) ? suggestDueBy(value) : '')
  }

  if (venues.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No venues exist yet — an admin needs to create one before you can start a project.
      </p>
    )
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-2 rounded border bg-gray-50 p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Venue</label>
        <select name="venueId" required className="rounded border bg-white px-2 py-1 text-sm text-gray-900">
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Event date</label>
        <input
          type="date"
          name="eventDate"
          required
          value={eventDate}
          onChange={(e) => handleEventDateChange(e.target.value)}
          className="rounded border bg-white px-2 py-1 text-sm text-gray-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500" title={`Defaults to ${DUE_BY_LEAD_DAYS} days before the event`}>
          Due by
        </label>
        <input
          type="date"
          name="dueBy"
          value={dueBy}
          onChange={(e) => { setDueByTouched(true); setDueBy(e.target.value) }}
          className="rounded border bg-white px-2 py-1 text-sm text-gray-900"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        {isPending ? 'Creating…' : 'New project'}
      </button>
      {error && <p className="text-sm text-red-600 w-full">{error}</p>}
    </form>
  )
}
