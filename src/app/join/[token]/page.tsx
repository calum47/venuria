import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABEL, type PlannerRole } from '@/lib/supabase/plannerContext'
import JoinForm from './JoinForm'

type Params = { token: string }

/**
 * Public invite landing page (Phase 22b). Not under proxy.ts protection —
 * the recipient has no account yet. Reads the invite with the service-role
 * client (no RLS path exists for an outsider, by design) but only ever
 * exposes the team name and role; the token itself is what the visitor
 * already holds.
 */
export default async function JoinPage({ params }: { params: Promise<Params> }) {
  const { token } = await params

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('team_invites')
    .select('role, expires_at, used_at, teams(name)')
    .eq('token', token)
    .maybeSingle()

  const teamName = (invite?.teams as unknown as { name: string } | null)?.name ?? null
  const valid = !!invite && !invite.used_at && new Date(invite.expires_at) > new Date()

  // Someone already signed in shouldn't create a second account by accident.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-gray-50">
      {!valid ? (
        <Shell title="This invite isn't valid">
          <p className="text-sm text-gray-500">
            {invite?.used_at
              ? 'It has already been used.'
              : invite
                ? 'It has expired.'
                : 'The link is incomplete or was revoked.'}
            {' '}Ask your team manager for a new one.
          </p>
        </Shell>
      ) : user ? (
        <Shell title={`Join ${teamName}`}>
          <p className="text-sm text-gray-500">
            You&apos;re already signed in as <span className="text-gray-900">{user.email}</span>. Invite links create a new
            account — sign out first if this invite is for a different login.
          </p>
          <Link href="/planner" className="text-sm text-blue-600 hover:underline">Go to my projects →</Link>
        </Shell>
      ) : (
        <JoinForm token={token} teamName={teamName ?? 'the team'} roleLabel={ROLE_LABEL[invite!.role as PlannerRole]} />
      )}
    </main>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm space-y-3 bg-white p-8 rounded-xl shadow-sm border border-gray-100">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {children}
    </div>
  )
}
