import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import NewProjectForm from './NewProjectForm'
import ProjectRow, { type ProjectRowData } from './ProjectRow'
import { daysUntil } from '@/lib/projectDates'

/**
 * My projects (Phase 9 + 22c).
 *
 * RLS already returns exactly the projects this planner may see
 * (planner_can_access_project). This page only buckets them, per the spec:
 *   - Mine:  created by me or assigned to me
 *   - Team:  everything else I can see that's public
 *   - Other private: (manager/lead only) private projects of others —
 *     kept out of the main team list on purpose, per the spec's nuance.
 */
export default async function PlannerPage() {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)

  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">No planner account linked to this login — contact an admin.</p>
      </main>
    )
  }

  const canAssign = ctx.planner.role === 'manager' || ctx.planner.role === 'lead'

  const [{ data: venues }, { data: projects }, { data: teammates }] = await Promise.all([
    supabase.from('venues').select('id, name').order('name'),
    supabase
      .from('projects')
      .select('id, status, event_date, due_by, created_at, planner_id, assigned_to_planner_id, visibility, venues(name)'),
    supabase.from('planners').select('id, name').eq('team_id', ctx.team.id).order('name'),
  ])

  const nameById = new Map<string, string>((teammates ?? []).map((t) => [t.id, t.name]))

  const rows: ProjectRowData[] = (projects ?? []).map((p) => ({
    id: p.id,
    status: p.status,
    event_date: p.event_date,
    due_by: p.due_by,
    venueName: (p.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue',
    creatorId: p.planner_id,
    creatorName: nameById.get(p.planner_id) ?? 'Former teammate',
    assigneeId: p.assigned_to_planner_id,
    assigneeName: p.assigned_to_planner_id ? (nameById.get(p.assigned_to_planner_id) ?? 'Former teammate') : null,
    visibility: p.visibility as 'private' | 'public',
  }))

  // Phase 9 ordering: upcoming soonest-first, then undated, then past.
  const byDate = (a: ProjectRowData & { created_at?: string }, b: ProjectRowData & { created_at?: string }) => {
    const rank = (p: ProjectRowData) => (p.event_date === null ? 1 : daysUntil(p.event_date) < 0 ? 2 : 0)
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra === 0) return a.event_date!.localeCompare(b.event_date!)
    if (ra === 2) return b.event_date!.localeCompare(a.event_date!)
    return 0
  }

  const mine = rows.filter((r) => r.creatorId === ctx.planner.id || r.assigneeId === ctx.planner.id).sort(byDate)
  const team = rows.filter((r) => !mine.includes(r) && r.visibility === 'public').sort(byDate)
  const otherPrivate = rows.filter((r) => !mine.includes(r) && r.visibility === 'private').sort(byDate)

  const renderRow = (r: ProjectRowData) => (
    <ProjectRow
      key={r.id}
      project={r}
      meId={ctx.planner.id}
      canAssign={canAssign}
      canToggleVisibility={canAssign || r.creatorId === ctx.planner.id}
      teammates={teammates ?? []}
    />
  )

  return (
    <main className="px-4 sm:px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-10">
        <div>
          <h1 className="text-4xl font-semibold text-gray-900">My projects</h1>
          <p className="mt-1 text-sm text-gray-500">The weddings and events you and your team are planning.</p>
        </div>

        <section>
          <h2 className="text-xl font-medium text-gray-900 mb-3">New project</h2>
          <NewProjectForm venues={venues ?? []} />
        </section>

        <section>
          <h2 className="text-xl font-medium text-gray-900 mb-3">Mine <span className="font-sans text-sm text-gray-400">{mine.length}</span></h2>
          <ul className="divide-y divide-gray-100 overflow-hidden bg-white rounded-2xl border border-gray-200 shadow-sm">
            {mine.map(renderRow)}
            {mine.length === 0 && (
              <li className="px-5 py-4 text-sm text-gray-400">Nothing created by or assigned to you yet.</li>
            )}
          </ul>
        </section>

        {(teammates ?? []).length > 1 && (
          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-3">Team projects <span className="font-sans text-sm text-gray-400">{team.length}</span></h2>
            <ul className="divide-y divide-gray-100 overflow-hidden bg-white rounded-2xl border border-gray-200 shadow-sm">
              {team.map(renderRow)}
              {team.length === 0 && (
                <li className="px-5 py-4 text-sm text-gray-400">No public projects from teammates.</li>
              )}
            </ul>
          </section>
        )}

        {canAssign && otherPrivate.length > 0 && (
          <section>
            <h2 className="text-xl font-medium text-gray-500 mb-1">Teammates&apos; private projects <span className="font-sans text-sm text-gray-400">{otherPrivate.length}</span></h2>
            <p className="text-xs text-gray-400 mb-2">Visible to you as {ctx.planner.role}. Not shown to regular members.</p>
            <ul className="divide-y divide-gray-100 overflow-hidden bg-white rounded-2xl border border-gray-200 shadow-sm">
              {otherPrivate.map(renderRow)}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
