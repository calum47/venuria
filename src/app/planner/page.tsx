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
    <main className="p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-xl font-semibold text-gray-900">My projects</h1>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">New project</h2>
          <NewProjectForm venues={venues ?? []} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Mine ({mine.length})</h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {mine.map(renderRow)}
            {mine.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">Nothing created by or assigned to you yet.</li>
            )}
          </ul>
        </section>

        {(teammates ?? []).length > 1 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Team projects ({team.length})</h2>
            <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
              {team.map(renderRow)}
              {team.length === 0 && (
                <li className="px-4 py-2.5 text-sm text-gray-400">No public projects from teammates.</li>
              )}
            </ul>
          </section>
        )}

        {canAssign && otherPrivate.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">Teammates&apos; private projects ({otherPrivate.length})</h2>
            <p className="text-xs text-gray-400 mb-2">Visible to you as {ctx.planner.role}. Not shown to regular members.</p>
            <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
              {otherPrivate.map(renderRow)}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
