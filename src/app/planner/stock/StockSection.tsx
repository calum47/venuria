import type { SupabaseClient } from '@supabase/supabase-js'
import { projectTitle } from '@/lib/projectTitle'
import type { PlannerContext } from '@/lib/supabase/plannerContext'
import StockApp from './StockApp'

/**
 * The retail stock (catalogue, purchases, sales, orders) of a planner's team. Shared by the planner's
 * My Stock page and the Vendor page of a login that is both, so the two are literally the same data:
 * a sale logged on one side is on the other. Role rules (Members add sales only, no profit) come
 * from the database and `canManage`, the same on both.
 */
export default async function StockSection({ supabase, ctx }: { supabase: SupabaseClient; ctx: PlannerContext }) {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, event_date, couple_names, venues(name)')
    .order('event_date', { ascending: false, nullsFirst: false })

  return (
    <StockApp
      teamId={ctx.team.id}
      currency={ctx.team.currency}
      canManage={ctx.planner.role !== 'member'}
      projects={(projects ?? []).map((p) => ({
        id: p.id,
        label: `${projectTitle(p.couple_names, (p.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue')}${p.event_date ? ` — ${p.event_date}` : ''}`,
      }))}
    />
  )
}
