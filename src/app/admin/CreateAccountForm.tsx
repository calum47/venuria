'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type Venue = { id: string; name: string }
type RentalCompany = { id: string; name: string }

export function CreateAccountForm({ venues, rentalCompanies }: { venues: Venue[]; rentalCompanies: RentalCompany[] }) {
  const router = useRouter()
  const [targetRole, setTargetRole] = useState<'venue_manager' | 'rental_manager' | 'planner'>('venue_manager')
  const [venueId, setVenueId] = useState('')
  const [rentalCompanyId, setRentalCompanyId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const roleLabel =
    targetRole === 'venue_manager' ? 'Venue manager' : targetRole === 'rental_manager' ? 'Rental manager' : 'Planner'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setIsLoading(true)

    const res = await fetch('/api/admin/create-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetRole,
        name,
        email,
        password,
        venueId: targetRole === 'venue_manager' ? venueId : undefined,
        rentalCompanyId: targetRole === 'rental_manager' ? rentalCompanyId : undefined,
      }),
    })

    const data = await res.json()
    setIsLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.')
      return
    }

    setSuccess(`${roleLabel} account created — share the email/password with them directly.`)
    setName('')
    setEmail('')
    setPassword('')
    setVenueId('')
    setRentalCompanyId('')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Create login account</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTargetRole('venue_manager')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            targetRole === 'venue_manager'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'border-gray-200 text-gray-600'
          }`}
        >
          Venue Manager
        </button>
        <button
          type="button"
          onClick={() => setTargetRole('rental_manager')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            targetRole === 'rental_manager'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'border-gray-200 text-gray-600'
          }`}
        >
          Rental Manager
        </button>
        <button
          type="button"
          onClick={() => setTargetRole('planner')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            targetRole === 'planner'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'border-gray-200 text-gray-600'
          }`}
        >
          Planner
        </button>
      </div>

      {targetRole === 'venue_manager' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Venue</label>
          <select
            required
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
          >
            <option value="" disabled>
              Select a venue...
            </option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {venues.length === 0 && (
            <p className="text-xs text-amber-600">No venues created yet — create one above first.</p>
          )}
        </div>
      )}

      {targetRole === 'rental_manager' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Rental company</label>
          <select
            required
            value={rentalCompanyId}
            onChange={(e) => setRentalCompanyId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
          >
            <option value="" disabled>
              Select a rental company...
            </option>
            {rentalCompanies.map((rc) => (
              <option key={rc.id} value={rc.id}>
                {rc.name}
              </option>
            ))}
          </select>
          {rentalCompanies.length === 0 && (
            <p className="text-xs text-amber-600">No rental companies created yet — create one above first.</p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-gray-500">
          {targetRole === 'planner' ? 'Name' : "Manager's name"}
        </label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Login email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Temporary password</label>
        {/* Plain text on purpose — you need to actually read this back to hand it to them */}
        <input
          type="text"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Creating...' : `Create ${roleLabel.toLowerCase()}`}
      </button>
    </form>
  )
}
