import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import PlannerNav from '@/components/nav/PlannerNav'

/**
 * Wraps every /planner/* screen with the persistent nav (Phase 22a).
 * proxy.ts already guarantees the caller is a planner; if the planner row
 * is somehow missing, render children without the nav rather than failing.
 */
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {ctx && (
        <PlannerNav
          plannerName={ctx.planner.name}
          role={ctx.planner.role}
          teamName={ctx.team.name}
          lastProjectId={ctx.lastProjectId}
        />
      )}
      <div className="flex-1">{children}</div>
    </div>
  )
}
