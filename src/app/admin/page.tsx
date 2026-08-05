import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { CreateAccountForm } from './CreateAccountForm'

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: venues }, { data: planners }] = await Promise.all([
    supabase
      .from('venues')
      .select('id, name, max_capacity_persons, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('planners')
      .select('id, name, email, planner_code, created_at')
      .order('created_at', { ascending: false }),
  ])

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Admin</h1>
          <SignOutButton />
        </div>
        <p className="text-sm text-gray-500">
          Logged in as <span className="font-medium text-gray-900">{user?.email}</span>.
        </p>

        <CreateAccountForm />

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Venues ({venues?.length ?? 0})
          </h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {venues?.map((v) => (
              <li key={v.id} className="px-4 py-2.5 text-sm flex justify-between">
                <span className="text-gray-900">{v.name}</span>
                <span className="text-gray-400">{v.max_capacity_persons ?? '—'} max</span>
              </li>
            ))}
            {venues?.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">No venues yet.</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Planners ({planners?.length ?? 0})
          </h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {planners?.map((p) => (
              <li key={p.id} className="px-4 py-2.5 text-sm flex justify-between">
                <span className="text-gray-900">
                  {p.name} <span className="text-gray-400">({p.email})</span>
                </span>
                <span className="text-gray-400 font-mono text-xs">{p.planner_code}</span>
              </li>
            ))}
            {planners?.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">No planners yet.</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  )
}
