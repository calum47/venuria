'use client'

import { useState, useTransition } from 'react'
import { supabase } from '@/lib/supabase/client'
import { updateMyName, updateMyTeam } from './actions'
import type { PlannerRole } from '@/lib/supabase/plannerContext'
import type { PdfStyle } from '@/lib/pdfExport/style'
import ExportStyleCard from './ExportStyleCard'
import { passwordProblem, PASSWORD_HINT } from '@/lib/passwordPolicy'

type Props = {
  plannerName: string
  email: string | null
  plannerCode: string | null
  role: PlannerRole
  team: { id: string; name: string; currency: string; companyName: string | null; contactEmail: string | null }
  /** Only loaded for the manager, who is the only one who can change the export look. */
  exports: { style: PdfStyle; logoPath: string | null; projects: { id: string; title: string }[] } | null
}

export default function SettingsForms({ plannerName, email, plannerCode, role, team, exports }: Props) {
  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-6">
        <NameForm initial={plannerName} email={email} plannerCode={plannerCode} />
        <PasswordForm />
        <TeamForm team={team} canEdit={role === 'manager'} />
      </div>
      {exports ? (
        <ExportStyleCard teamId={team.id} initialStyle={exports.style} initialLogoPath={exports.logoPath} projects={exports.projects} />
      ) : (
        <div className="max-w-2xl">
          <Card title="Exports: look and logo">
            <p className="text-xs text-gray-500">
              The look of exported PDFs and the logo printed on them are set by your team manager. Your exports already use them.
            </p>
          </Card>
        </div>
      )}
      <div className="max-w-2xl">
        <ComingLater />
      </div>
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
          <input name="name" defaultValue={initial} required className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900" />
        </div>
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Saved.</p>}
    </Card>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!current) return setError('Enter your current password.')
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('Passwords don\u2019t match.')
    if (password === current) return setError('The new password must be different from the current one.')
    setIsPending(true)
    // Runs against the browser session directly — no server round trip needed.
    // Supabase checks current_password itself (Auth setting "Require current password when updating").
    const { error: err } = await supabase.auth.updateUser({ password, current_password: current })
    setIsPending(false)
    if (err) return setError(err.message)
    setCurrent('')
    setPassword('')
    setConfirm('')
    setSaved(true)
  }

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Current password</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Confirm</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900" />
        </div>
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {isPending ? 'Updating…' : 'Update password'}
        </button>
      </form>
      <p className="text-xs text-gray-400">{PASSWORD_HINT}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Password updated.</p>}
    </Card>
  )
}

function TeamForm({ team, canEdit }: { team: { id: string; name: string; currency: string; companyName: string | null; contactEmail: string | null }; canEdit: boolean }) {
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
          <input name="name" defaultValue={team.name} required disabled={!canEdit} className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
        <div className="flex flex-col gap-1 w-24">
          <label className="text-xs text-gray-500">Currency</label>
          <input name="currency" defaultValue={team.currency} required maxLength={3} disabled={!canEdit} className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900 uppercase font-mono disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
        <div className="w-full border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">
            Shown to guests on the RSVP page as the party responsible for their data. Leave the company name empty to use the team name.
          </p>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
          <label className="text-xs text-gray-500">Company name</label>
          <input name="companyName" defaultValue={team.companyName ?? ''} maxLength={120} placeholder={team.name} disabled={!canEdit} className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
          <label className="text-xs text-gray-500">Contact email for guests&apos; data requests</label>
          <input name="contactEmail" type="email" defaultValue={team.contactEmail ?? ''} maxLength={200} placeholder="hello@yourcompany.com" disabled={!canEdit} className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
        {canEdit && (
          <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">
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
