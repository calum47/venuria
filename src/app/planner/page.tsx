import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import NewProjectForm from './NewProjectForm'
import ProjectRow, { type ProjectRowData } from './ProjectRow'
import { daysUntil } from '@/lib/projectDates'
import { projectTitle } from '@/lib/projectTitle'
import AssigneeFilter from './AssigneeFilter'
import PaymentsOverview, { type OverviewPayment } from './PaymentsOverview'

/**
 * My projects (Phase 9 + 22c, access levels in migration 038).
 *
 * RLS decides what each planner gets back:
 *   - Member: projects they created or are assigned to (edit), plus Public ones of the team (view only)
 *   - Lead / Manager: every project of the team (edit), with a filter by assignee
 * This page only buckets them:
 *   - Mine:  created by me or assigned to me
 *   - Team:  everything else that is Public
 *   - Teammates' private: (Lead/Manager only) kept out of the main team list on purpose
 * The payments calendar/list covers the same projects, restricted to the ones the planner can edit.
 */
export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ assignee?: string | string[] }> }) {
  const { assignee: assigneeParam } = await searchParams
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

  const [{ data: venues }, { data: projects }, { data: teammates }, { data: assigneeRows }, { data: paymentRows }] = await Promise.all([
    supabase.from('venues').select('id, name').order('name'),
    supabase
      .from('projects')
      .select('id, status, event_date, due_by, created_at, planner_id, assigned_to_planner_id, visibility, couple_names, venues(name)'),
    supabase.from('planners').select('id, name').eq('team_id', ctx.team.id).order('name'),
    supabase.from('project_assignees').select('project_id, planner_id'),
    supabase.from('project_payments').select('id, project_id, vendor_name, label, amount, due_date, paid_at'),
  ])

  const nameById = new Map<string, string>((teammates ?? []).map((t) => [t.id, t.name]))

  // Everyone assigned to a project: the new table, plus the old single column for rows it does not cover yet.
  const assigneesOf = new Map<string, Set<string>>()
  for (const r of assigneeRows ?? []) assigneesOf.set(r.project_id, (assigneesOf.get(r.project_id) ?? new Set()).add(r.planner_id))
  for (const p of projects ?? []) {
    if (p.assigned_to_planner_id) assigneesOf.set(p.id, (assigneesOf.get(p.id) ?? new Set()).add(p.assigned_to_planner_id))
  }

  const allRows: ProjectRowData[] = (projects ?? []).map((p) => {
    const assignees = [...(assigneesOf.get(p.id) ?? [])].map((id) => ({ id, name: nameById.get(id) ?? 'Former teammate' }))
    const isMine = p.planner_id === ctx.planner.id || assignees.some((a) => a.id === ctx.planner.id)
    return {
      id: p.id,
      status: p.status,
      event_date: p.event_date,
      due_by: p.due_by,
      venueName: (p.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue',
      coupleNames: p.couple_names,
      creatorId: p.planner_id,
      creatorName: nameById.get(p.planner_id) ?? 'Former teammate',
      assignees,
      visibility: p.visibility as 'private' | 'public',
      // Same rule as planner_can_access_project; the database enforces it either way.
      access: canAssign || isMine ? 'edit' : 'view',
    }
  })

  // Lead/Manager filter by assignee. Members never get one: their list is already only theirs plus Public.
  const assigneeFilter = canAssign && typeof assigneeParam === 'string' ? assigneeParam : ''
  const rows = assigneeFilter
    ? allRows.filter((r) => (assigneeFilter === 'none' ? r.assignees.length === 0 : r.assignees.some((a) => a.id === assigneeFilter)))
    : allRows

  // Payments are only readable on projects you can edit (RLS); keep the ones in the filtered list.
  const titleById = new Map(rows.map((r) => [r.id, projectTitle(r.coupleNames, r.venueName)]))
  const payments: OverviewPayment[] = (paymentRows ?? [])
    .filter((p) => titleById.has(p.project_id))
    .map((p) => ({
      id: p.id,
      projectId: p.project_id,
      projectTitle: titleById.get(p.project_id)!,
      vendor: p.vendor_name,
      label: p.label,
      amount: Number(p.amount),
      due_date: p.due_date,
      paid_at: p.paid_at,
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

  const mine = rows.filter((r) => r.creatorId === ctx.planner.id || r.assignees.some((a) => a.id === ctx.planner.id)).sort(byDate)
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
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-4xl font-semibold text-gray-900">My projects</h1>
          <p className="mt-1 text-sm text-gray-500">The weddings and events you and your team are planning.</p>
          {canAssign && (
            <div className="mt-3">
              <AssigneeFilter teammates={teammates ?? []} value={assigneeFilter} meId={ctx.planner.id} />
            </div>
          )}
        </div>

        <section>
          <h2 className="text-xl font-medium text-gray-900 mb-3">New project</h2>
          <NewProjectForm venues={venues ?? []} />
        </section>

        <section>
          <h2 className="text-xl font-medium text-gray-900 mb-3">Payments <span className="font-sans text-sm text-gray-400">{payments.length}</span></h2>
          <PaymentsOverview payments={payments} currency={ctx.team.currency} />
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
