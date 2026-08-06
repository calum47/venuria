'use client'

import { useState, useTransition } from 'react'
import { createProject } from './actions'

type Venue = { id: string; name: string }

export default function NewProjectForm({ venues }: { venues: Venue[] }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await createProject(formData)
      // createProject redirects on success, so reaching here means it failed
      // (redirect() throws internally and never returns a value on the happy path).
      if (result?.error) setError(result.error)
    })
  }

  if (venues.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No venues exist yet — an admin needs to create one before you can start a project.
      </p>
    )
  }

  return (
    <form action={handleSubmit} className="flex items-end gap-2 rounded border bg-gray-50 p-3">
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
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        {isPending ? 'Creating…' : 'New project'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
