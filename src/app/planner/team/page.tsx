import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext, ROLE_LABEL, type PlannerRole } from '@/lib/supabase/plannerContext'

/**
 * My Team — roster (Phase 22a). Read-only for now: inviting, removing, and
 * role changes arrive with 22b (invite links). Team name and currency are
 * edited in Settings by the manager, per the spec.
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

        {ctx.planner.role === 'manager' && roster.length === 1 && (
          <p className="text-sm text-gray-400">
            It&apos;s just you for now. Inviting colleagues is coming next.
          </p>
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
