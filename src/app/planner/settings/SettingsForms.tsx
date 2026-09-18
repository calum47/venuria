'use client'

import { useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase/client'
import { updateMyName, updateMyTeam } from './actions'
import type { PlannerRole } from '@/lib/supabase/plannerContext'

type Props = {
  plannerName: string
  email: string | null
  plannerCode: string | null
  role: PlannerRole
  team: { id: string; name: string; currency: string }
}

export default function SettingsForms({ plannerName, email, plannerCode, role, team }: Props) {
  return (
    <div className="space-y-6">
      <NameForm initial={plannerName} email={email} plannerCode={plannerCode} />
      <PasswordForm />
      <TeamForm team={team} canEdit={role === 'manager'} />
      <ComingLater />
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function useAction(action: (fd: FormData) => Promise<{ error?: string }>) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const run = (fd: FormData) => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await action(fd)
      if (r.error) setError(r.error)
      else setSaved(true)
    })
  }
  return { run, isPending, error, saved }
}

function NameForm({ initial, email, plannerCode }: { initial: string; email: string | null; plannerCode: string | null }) {
  const { run, isPending, error, saved } = useAction(updateMyName)
  return (
    <Card title="Your account">
      <p className="text-xs text-gray-400">
        {email}
        {plannerCode && <> · Planner code <span className="font-mono text-gray-600">{plannerCode}</span></>}
      </p>
      <form action={run} className="flex items-end gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-gray-500">Name</label>
          <input name="name" defaultValue={initial} required className="rounded border bg-white px-2 py-1 text-sm text-gray-900" />
        </div>
        <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Saved.</p>}
    </Card>
  )
}

function PasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords don\u2019t match.')
    setIsPending(true)
    // Runs against the browser session directly — no server round trip needed.
    const { error: err } = await supabase.auth.updateUser({ password })
    setIsPending(false)
    if (err) return setError(err.message)
    setPassword('')
    setConfirm('')
    setSaved(true)
  }

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" className="rounded border bg-white px-2 py-1 text-sm text-gray-900" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Confirm</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" className="rounded border bg-white px-2 py-1 text-sm text-gray-900" />
        </div>
        <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {isPending ? 'Updating…' : 'Update password'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Password updated.</p>}
    </Card>
  )
}

function TeamForm({ team, canEdit }: { team: { id: string; name: string; currency: string }; canEdit: boolean }) {
  const { run, isPending, error, saved } = useAction(updateMyTeam)
  return (
    <Card title="Team">
      {!canEdit && (
        <p className="text-xs text-gray-400">Only the team manager can change these. Currency applies to the whole team.</p>
      )}
      <form action={run} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="teamId" value={team.id} />
        <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
          <label className="text-xs text-gray-500">Team name</label>
          <input name="name" defaultValue={team.name} required disabled={!canEdit} className="rounded border bg-white px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
        <div className="flex flex-col gap-1 w-24">
          <label className="text-xs text-gray-500">Currency</label>
          <input name="currency" defaultValue={team.currency} required maxLength={3} disabled={!canEdit} className="rounded border bg-white px-2 py-1 text-sm text-gray-900 uppercase font-mono disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
        {canEdit && (
          <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
            {isPending ? 'Saving…' : 'Save'}
          </button>
        )}
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Saved.</p>}
    </Card>
  )
}

function ComingLater() {
  return (
    <p className="text-xs text-gray-400 px-1">
      Dark mode, language, default landing page and measurement units are planned for a later update.
    </p>
  )
}
