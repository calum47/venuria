'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function CreateAccountForm() {
  const router = useRouter()
  const [targetRole, setTargetRole] = useState<'venue' | 'planner'>('venue')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [maxCapacity, setMaxCapacity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
        maxCapacityPersons:
          targetRole === 'venue' && maxCapacity ? Number(maxCapacity) : undefined,
      }),
    })

    const data = await res.json()
    setIsLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.')
      return
    }

    setSuccess(`${targetRole === 'venue' ? 'Venue' : 'Planner'} account created — share the email/password with them directly.`)
    setName('')
    setEmail('')
    setPassword('')
    setMaxCapacity('')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Create account</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTargetRole('venue')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            targetRole === 'venue'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'border-gray-200 text-gray-600'
          }`}
        >
          Venue
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

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">Login email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
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
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
        />
      </div>

      {targetRole === 'venue' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Max capacity (persons)</label>
          <input
            type="number"
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Creating...' : `Create ${targetRole}`}
      </button>
    </form>
  )
}
