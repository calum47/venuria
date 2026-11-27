'use client'

import { useState, type FormEvent } from 'react'
import { PASSWORD_HINT, passwordProblem } from '@/lib/passwordPolicy'

export type ResettableAccount = { userId: string; label: string }

/** Admin: set a temporary password on an account whose owner has forgotten theirs. */
export function ResetPasswordForm({ accounts }: { accounts: ResettableAccount[] }) {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    const account = accounts.find((a) => a.userId === userId)
    if (!account) return setError('Choose an account.')

    setIsLoading(true)
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    })
    const data = await res.json().catch(() => ({}))
    setIsLoading(false)

    if (!res.ok) return setError(data.error ?? 'Something went wrong.')
    setSuccess(`Temporary password set for ${account.label}. Give it to them directly and ask them to change it in Settings.`)
    setPassword('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Reset a password</h2>
        <p className="text-xs text-gray-400 mt-1">
          For someone who forgot theirs. You type a temporary password and give it to them; they can then change it in Settings. Passwords are stored only as one-way hashes, so nobody (including you) can look an existing one up.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Account</label>
        <select
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
        >
          <option value="">Choose an account…</option>
          {accounts.map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Temporary password</label>
        {/* Plain text on purpose: you need to read it back to hand it over */}
        <input
          type="text"
          required
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono"
        />
        <p className="text-xs text-gray-400">{PASSWORD_HINT}</p>
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Setting…' : 'Set temporary password'}
      </button>
    </form>
  )
}
