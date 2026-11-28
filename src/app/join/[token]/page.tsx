import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { PlannerRole } from '@/lib/supabase/plannerContext'
import JoinForm from './JoinForm'
import { getTranslations } from 'next-intl/server'

type Params = { token: string }

/**
 * Public invite landing page (Phase 22b). Not under proxy.ts protection —
 * the recipient has no account yet. Reads the invite with the service-role
 * client (no RLS path exists for an outsider, by design) but only ever
 * exposes the team name and role; the token itself is what the visitor
 * already holds.
 */
export default async function JoinPage({ params }: { params: Promise<Params> }) {
  const t = await getTranslations('Join')
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
        <Shell title={t('thisInviteIsnTValid')}>
          <p className="text-sm text-gray-500">
            {invite?.used_at
              ? t('itHasAlreadyBeenUsed')
              : invite
                ? t('itHasExpired')
                : t('theLinkIsIncompleteOr')}
            {' '}{t('askNew')}
          </p>
        </Shell>
      ) : user ? (
        <Shell title={t('title', { team: teamName ?? t('theTeam') })}>
          <p className="text-sm text-gray-500">
            {t.rich('alreadySignedIn', { email: user.email ?? '', b: (c) => <span className="text-gray-900">{c}</span> })}
          </p>
          <Link href="/planner" className="text-sm text-blue-600 hover:underline">{t('goToMyProjects')}</Link>
        </Shell>
      ) : (
        <JoinForm token={token} teamName={teamName ?? t('theTeam')} roleLabel={(await getTranslations('Roles'))(invite!.role as PlannerRole)} />
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
