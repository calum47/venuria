'use client'

import { useState, useTransition } from 'react'
import { acceptInvite } from './actions'

export default function JoinForm({ token, teamName, roleLabel }: { token: string; teamName: string; roleLabel: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const submit = (fd: FormData) => {
    setError(null)
    if (password !== confirm) return setError('Passwords don\u2019t match.')
    startTransition(async () => {
      const r = await acceptInvite(fd)
      if (r?.error) setError(r.error)
    })
  }

  const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10'

  return (
    <form action={submit} className="w-full max-w-sm space-y-4 bg-white p-8 rounded-xl shadow-sm border border-gray-100">
      <input type="hidden" name="token" value={token} />
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Join {teamName}</h1>
        <p className="text-xs text-gray-400 mt-1">You&apos;ve been invited as a {roleLabel}. Set up your login to get started.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Your name</label>
        <input name="name" required minLength={2} autoComplete="name" className={input} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Email</label>
        <input type="email" name="email" required autoComplete="email" className={input} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Password</label>
        <input type="password" name="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Confirm password</label>
        <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
      </div>
      <button type="submit" disabled={isPending} className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50">
        {isPending ? 'Creating your account…' : 'Join team'}
      </button>
    </form>
  )
}
