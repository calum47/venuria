import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/SignOutButton'
import NewProjectForm from './NewProjectForm'
import Link from 'next/link'

export default async function PlannerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
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
          .select('id, status, event_date, created_at, venues(name)')
          .eq('planner_id', planner.id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ])

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Planner{planner?.name ? ` — ${planner.name}` : ''}</h1>
          <SignOutButton />
        </div>
        <p className="text-sm text-gray-500">
          Logged in as <span className="font-medium text-gray-900">{user.email}</span>.
          {planner?.planner_code && (
            <>
              {' '}Planner code: <span className="font-mono text-gray-700">{planner.planner_code}</span>
            </>
          )}
        </p>

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
                {(projects ?? []).map((p) => (
                  <li key={p.id} className="px-4 py-2.5 text-sm flex items-center justify-between">
                    <div>
                      <span className="text-gray-900">
                        {(p.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'}
                      </span>
                      <span className="text-gray-400 ml-2 text-xs">{p.status}</span>
                    </div>
                    <Link href={`/editor/${p.id}`} className="text-blue-600 hover:underline text-sm">
                      Open editor →
                    </Link>
                  </li>
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
