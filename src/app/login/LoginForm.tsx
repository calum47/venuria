'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { resolveUserRole } from '@/lib/supabase/role'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !data.user) {
      setError('Incorrect email or password.')
      setIsLoading(false)
      return
    }

    const { role, redirectPath } = await resolveUserRole(supabase, data.user.id)

    if (!role) {
      setError("This account isn't linked to an Admin, Venue, or Planner profile yet.")
      await supabase.auth.signOut()
      setIsLoading(false)
      return
    }

    router.push(searchParams.get('redirectTo') ?? redirectPath)
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 bg-white p-8 rounded-xl shadow-sm border border-gray-100"
      >
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sign in to Venuria</h1>
          <p className="text-xs text-gray-400 mt-1">Admin, Venue, and Planner accounts only.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {searchParams.get('error') === 'unauthorized' && !error && (
          <p className="text-sm text-amber-600">You don&apos;t have access to that area.</p>
        )}

        <div className="space-y-1">
          <label className="text-xs text-gray-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
