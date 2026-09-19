import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import StockApp from './StockApp'

/**
 * My Stock (Phase 23 core CRUD). Team-shared retail inventory — welcome
 * bags, favours, personalized items sold as add-ons — kept entirely
 * separate from the floor-plan catalog (layout_objects). No visibility
 * split: every team member sees and edits everything here, per the spec.
 *
 * Order Tracking Integration (17TRACK) is explicitly v2 in the spec and is
 * not part of this page — Orders here is a plain status log (pending/received).
 */
export default async function StockPage() {
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">No planner account linked to this login — contact an admin.</p>
      </main>
    )
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, event_date, venues(name)')
    .order('event_date', { ascending: false, nullsFirst: false })

  return (
    <main className="p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ctx.team.name}&apos;s inventory — shared with everyone on the team, currency {ctx.team.currency}
          </p>
        </div>
        <StockApp
          teamId={ctx.team.id}
          currency={ctx.team.currency}
          projects={(projects ?? []).map((p) => ({
            id: p.id,
            label: `${(p.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'}${p.event_date ? ` — ${p.event_date}` : ''}`,
          }))}
        />
      </div>
    </main>
  )
}
