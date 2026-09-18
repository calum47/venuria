'use client'

import { useState, useTransition } from 'react'
import { createInvite, revokeInvite, setMemberRole, removeMember } from './actions'
import { ROLE_LABEL, type PlannerRole } from '@/lib/supabase/plannerContext'

type Member = { id: string; name: string; email: string; role: PlannerRole }
type Invite = { id: string; role: 'lead' | 'member'; expires_at: string; token: string }

type Props = {
  meId: string
  members: Member[]
  invites: Invite[]
  origin: string
}

export default function TeamManager({ meId, members, invites, origin }: Props) {
  return (
    <div className="space-y-6">
      <InviteBox origin={origin} />
      {invites.length > 0 && <PendingInvites invites={invites} origin={origin} />}
      <MemberControls meId={meId} members={members} />
    </div>
  )
}

function InviteBox({ origin }: { origin: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = (fd: FormData) => {
    setError(null)
    setLink(null)
    setCopied(false)
    startTransition(async () => {
      const r = await createInvite(fd)
      if (r.error) setError(r.error)
      else if (r.token) setLink(`${origin}/join/${r.token}`)
    })
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError('Couldn\u2019t copy \u2014 select the link and copy it manually.')
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Invite a colleague</h2>
      <p className="text-xs text-gray-400">
        Creates a one-time link, valid for 7 days. Whoever opens it sets up their own login and joins this team.
      </p>
      <form action={submit} className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">They join as</label>
          <select name="role" defaultValue="member" className="rounded border bg-white px-2 py-1 text-sm text-gray-900">
            <option value="member">Member — sees public projects and their own</option>
            <option value="lead">Lead — sees and assigns every project</option>
          </select>
        </div>
        <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {isPending ? 'Creating…' : 'Create invite link'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {link && (
        <div className="flex items-center gap-2 rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="flex-1 bg-transparent text-xs font-mono text-gray-700 outline-none" />
          <button onClick={copy} className="text-xs text-blue-600 hover:underline shrink-0">{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </section>
  )
}

function PendingInvites({ invites, origin }: { invites: Invite[]; origin: string }) {
  const [isPending, startTransition] = useTransition()
  const revoke = (fd: FormData) => startTransition(async () => { await revokeInvite(fd) })
  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">Pending invites ({invites.length})</h2>
      <ul className="divide-y divide-gray-100">
        {invites.map((i) => (
          <li key={i.id} className="py-2 flex items-center gap-3 text-xs">
            <span className="text-gray-600 shrink-0">{ROLE_LABEL[i.role]}</span>
            <input readOnly value={`${origin}/join/${i.token}`} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 bg-gray-50 rounded px-2 py-1 font-mono text-gray-500 outline-none" />
            <span className="text-gray-400 shrink-0">expires {new Date(i.expires_at).toLocaleDateString()}</span>
            <form action={revoke}>
              <input type="hidden" name="inviteId" value={i.id} />
              <button type="submit" disabled={isPending} className="text-gray-300 hover:text-red-500">Revoke</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MemberControls({ meId, members }: { meId: string; members: Member[] }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const others = members.filter((m) => m.id !== meId)
  if (others.length === 0) return null

  const run = (action: (fd: FormData) => Promise<{ error?: string }>) => (fd: FormData) => {
    setError(null)
    startTransition(async () => {
      const r = await action(fd)
      if (r.error) setError(r.error)
    })
  }

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">Manage members</h2>
      <p className="text-xs text-gray-400">Removing someone moves them to their own team — their account and projects stay with them.</p>
      <ul className="divide-y divide-gray-100">
        {others.map((m) => (
          <li key={m.id} className="py-2 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <span className="text-gray-900">{m.name}</span>
              <p className="text-xs text-gray-400 truncate">{m.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <form action={run(setMemberRole)} className="flex items-center gap-1">
                <input type="hidden" name="plannerId" value={m.id} />
                <select
                  key={m.role}
                  name="role"
                  defaultValue={m.role}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  disabled={isPending}
                  className="rounded border bg-white px-2 py-1 text-xs text-gray-900"
                >
                  <option value="member">Member</option>
                  <option value="lead">Lead</option>
                </select>
              </form>
              <form
                action={run(removeMember)}
                onSubmit={(e) => { if (!confirm(`Remove ${m.name} from the team?`)) e.preventDefault() }}
              >
                <input type="hidden" name="plannerId" value={m.id} />
                <button type="submit" disabled={isPending} className="text-xs text-gray-300 hover:text-red-500">Remove</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  )
}
