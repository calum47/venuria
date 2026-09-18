import { createClient } from '@/lib/supabase/server'
import NewProjectForm from './NewProjectForm'
import ProjectRow from './ProjectRow'
import { daysUntil } from '@/lib/projectDates'

export default async function PlannerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="p-8">
        <p className="text-sm text-gray-500">Not signed in.</p>
      </main>
    )
  }

  const { data: planner } = await supabase
    .from('planners')
    .select('id, name, planner_code')
    .eq('user_id', user.id)
    .maybeSingle()

  // planner_read_venues RLS lets any signed-in planner read the full venue
  // list — needed to pick one when starting a new project.
  const [{ data: venues }, { data: projects }] = await Promise.all([
    supabase.from('venues').select('id, name').order('name'),
    planner
      ? supabase
          .from('projects')
          .select('id, status, event_date, due_by, created_at, venues(name)')
          .eq('planner_id', planner.id)
      : Promise.resolve({ data: [] as never[] }),
  ])

  // Phase 9 ordering: upcoming events soonest-first, then undated (newest
  // first), then past events sinking to the bottom most-recent-first.
  const sortedProjects = [...(projects ?? [])].sort((a, b) => {
    const rank = (p: { event_date: string | null }) =>
      p.event_date === null ? 1 : daysUntil(p.event_date) < 0 ? 2 : 0
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra === 0) return a.event_date!.localeCompare(b.event_date!)
    if (ra === 2) return b.event_date!.localeCompare(a.event_date!)
    return b.created_at.localeCompare(a.created_at)
  })

  return (
    <main className="p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-xl font-semibold text-gray-900">My projects</h1>

        {!planner ? (
          <p className="text-sm text-red-600">No planner account linked to this login — contact an admin.</p>
        ) : (
          <>
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-2">New project</h2>
              <NewProjectForm venues={venues ?? []} />
            </section>

            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-2">
                Your projects ({projects?.length ?? 0})
              </h2>
              <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
                {sortedProjects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={{
                      id: p.id,
                      status: p.status,
                      event_date: p.event_date,
                      due_by: p.due_by,
                      venueName: (p.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue',
                    }}
                  />
                ))}
                {(!projects || projects.length === 0) && (
                  <li className="px-4 py-2.5 text-sm text-gray-400">No projects yet — start one above.</li>
                )}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
