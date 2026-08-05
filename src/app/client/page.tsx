import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ClientLandingPage() {
  const supabase = await createClient()

  // RLS (client_read_own_project) already scopes this to the logged-in
  // client's own project(s) — no need to filter by client_id here.
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)

  const project = projects?.[0]

  if (!project) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <p className="text-sm text-gray-500">
          No project has been set up for your account yet — check with your planner.
        </p>
      </main>
    )
  }

  redirect(`/editor/${project.id}`)
}
