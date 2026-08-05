'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createVenue } from './actions'

export function CreateVenueForm() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setError(null)
    setSuccess(null)
    setIsLoading(true)

    const result = await createVenue(formData)
    setIsLoading(false)

    if (result?.error) {
      setError(result.error)
      return
    }

    setSuccess('Venue created — assign it a manager account below.')
    formRef.current?.reset()
    router.refresh()
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Create venue</h2>
      <p className="text-xs text-gray-400">
        The property itself — no login yet. Assign a manager account to it after.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Venue name</label>
        <input
          name="name"
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Max capacity (persons)</label>
        <input
          name="maxCapacityPersons"
          type="number"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Creating...' : 'Create venue'}
      </button>
    </form>
  )
}
