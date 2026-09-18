import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import TeamManager from './TeamManager'
import { getPlannerContext, ROLE_LABEL, type PlannerRole } from '@/lib/supabase/plannerContext'

/**
 * My Team (Phase 22a/22b). Everyone sees the roster; the manager also gets
 * invite links, pending invites, and per-member role/remove controls. Team
 * name and currency are edited in Settings, per the spec.
 */
export default async function TeamPage() {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">No planner account linked to this login — contact an admin.</p>
      </main>
    )
  }

  // planner_read_teammates RLS scopes this to the caller's own team.
  const { data: members } = await supabase
    .from('planners')
    .select('id, name, email, role, created_at')
    .eq('team_id', ctx.team.id)
    .order('created_at')

  // Manager-only data: RLS returns nothing for anyone else, so no branching needed.
  const { data: invites } = ctx.planner.role === 'manager'
    ? await supabase
        .from('team_invites')
        .select('id, role, expires_at, token')
        .eq('team_id', ctx.team.id)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
    : { data: [] }

  // Absolute origin for the invite links, from the request itself so it's
  // right in local dev and production without an env var.
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const origin = `${proto}://${host}`

  const order: Record<PlannerRole, number> = { manager: 0, lead: 1, member: 2 }
  const roster = [...(members ?? [])].sort(
    (a, b) => order[a.role as PlannerRole] - order[b.role as PlannerRole] || a.name.localeCompare(b.name),
  )

  return (
    <main className="p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{ctx.team.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {roster.length} member{roster.length === 1 ? '' : 's'} · currency {ctx.team.currency}
            </p>
          </div>
          {ctx.planner.role === 'manager' && (
            <Link href="/planner/settings" className="text-sm text-blue-600 hover:underline">
              Team settings →
            </Link>
          )}
        </div>

        <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
          {roster.map((m) => (
            <li key={m.id} className="px-4 py-3 text-sm flex items-center justify-between">
              <div>
                <span className="text-gray-900">{m.name}</span>
                {m.id === ctx.planner.id && <span className="text-gray-400 ml-2 text-xs">(you)</span>}
                <p className="text-xs text-gray-400">{m.email}</p>
              </div>
              <RoleBadge role={m.role as PlannerRole} />
            </li>
          ))}
        </ul>

        {ctx.planner.role === 'manager' && (
          <TeamManager
            meId={ctx.planner.id}
            members={roster.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role as PlannerRole }))}
            invites={(invites ?? []) as { id: string; role: 'lead' | 'member'; expires_at: string; token: string }[]}
            origin={origin}
          />
        )}
      </div>
    </main>
  )
}

function RoleBadge({ role }: { role: PlannerRole }) {
  const style =
    role === 'manager'
      ? 'bg-gray-900 text-white'
      : role === 'lead'
        ? 'bg-indigo-100 text-indigo-700'
        : 'bg-gray-100 text-gray-600'
  return <span className={`text-xs px-2 py-0.5 rounded-md ${style}`}>{ROLE_LABEL[role]}</span>
}
