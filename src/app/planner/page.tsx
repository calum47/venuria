import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/SignOutButton'

export default async function PlannerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-gray-900">Planner</h1>
          <SignOutButton />
        </div>
        <p className="text-sm text-gray-500">
          Logged in as <span className="font-medium text-gray-900">{user?.email}</span>.
        </p>
        <p className="text-sm text-gray-400 mt-4">
          Your projects dashboard already exists at the editor routes — this landing page is just
          the auth checkpoint. Wire your project list in here when ready.
        </p>
      </div>
    </main>
  )
}
