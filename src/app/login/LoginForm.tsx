'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { resolveUserRole } from '@/lib/supabase/role'
import { REMEMBER_COOKIE, REMEMBER_COOKIE_MAX_AGE } from '@/lib/supabase/rememberMe'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    // Set the marker BEFORE signing in: the auth cookies written by
    // signInWithPassword read it to decide persistent vs session-only.
    document.cookie = rememberMe
      ? `${REMEMBER_COOKIE}=1; Path=/; Max-Age=${REMEMBER_COOKIE_MAX_AGE}; SameSite=Lax`
      : `${REMEMBER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`

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
      setError("This account isn't linked to an Admin, Venue, Rental, or Planner profile yet.")
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
          <p className="text-xs text-gray-400 mt-1">Admin, Venue, Rental, and Planner accounts only.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {searchParams.get('error') === 'unauthorized' && !error && (
          <p className="text-sm text-amber-600">You don&apos;t have access to that area.</p>
        )}
        {searchParams.get('joined') === '1' && !error && (
          <p className="text-sm text-green-600">Your account is ready — sign in to join your team.</p>
        )}

        <div className="space-y-1">
          <label className="text-xs text-gray-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded border-gray-300"
          />
          Remember me
          <span className="text-xs text-gray-400 ml-auto">{rememberMe ? 'Stays signed in' : 'Signs out when the browser closes'}</span>
        </label>

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
