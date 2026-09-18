import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import SettingsForms from './SettingsForms'

/** Settings (Phase 22a): name, password, team name + currency (manager). The rest of the spec's fields land in 22d. */
export default async function SettingsPage() {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">No planner account linked to this login — contact an admin.</p>
      </main>
    )
  }

  return (
    <main className="p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <SettingsForms
          plannerName={ctx.planner.name}
          email={ctx.email}
          plannerCode={ctx.planner.plannerCode}
          role={ctx.planner.role}
          team={ctx.team}
        />
      </div>
    </main>
  )
}
