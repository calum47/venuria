import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { countdownLabel, formatDate } from '@/lib/projectDates'
import { paymentStatus } from '@/lib/payments'

type Params = { projectId: string }

/**
 * The project's landing page: what you see after clicking a project in My
 * Projects, before choosing where to go. It is deliberately only a
 * navigation/aggregation layer (see "Project Hub" in the Ideas doc) — each
 * card links to a screen that owns its own data, so new sections (Timetable,
 * Music, Invoices…) are one more card, not a rewrite.
 *
 * Lives under /planner so proxy.ts already restricts it to planners and the
 * planner nav wraps it. Access is whatever RLS lets this planner read; a
 * project they cannot see is indistinguishable from one that does not exist.
 */
export default async function ProjectHubPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">No planner account linked to this login — contact an admin.</p>
      </main>
    )
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, status, event_date, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()

  const { data: payments } = await supabase
    .from('project_payments')
    .select('due_date, paid_at')
    .eq('project_id', projectId)

  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'
  const all = payments ?? []
  const overdue = all.filter((p) => paymentStatus(p).kind === 'overdue').length
  const unpaid = all.filter((p) => !p.paid_at).length
  const paymentsHint =
    all.length === 0
      ? 'No payments added yet'
      : overdue > 0
        ? `${overdue} overdue · ${unpaid} unpaid of ${all.length}`
        : unpaid > 0
          ? `${unpaid} unpaid of ${all.length}`
          : `All ${all.length} paid`

  const card = 'block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-400'

  return (
    <main className="p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link href="/planner" className="text-sm text-gray-500 hover:text-gray-900">← My projects</Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">{venueName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {project.event_date ? `${formatDate(project.event_date)} · ${countdownLabel(project.event_date)}` : 'No event date set'}
            {project.status ? ` · ${project.status}` : ''}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href={`/editor/${projectId}`} className={card}>
            <p className="font-medium text-gray-900">Project editor</p>
            <p className="text-sm text-gray-500 mt-1">Floor plan, seating and 3D view</p>
          </Link>

          <Link href={`/editor/${projectId}/summary`} className={card}>
            <p className="font-medium text-gray-900">Layout summary</p>
            <p className="text-sm text-gray-500 mt-1">Everything placed, stock shortfalls and zones</p>
          </Link>

          <Link href={`/planner/projects/${projectId}/payments`} className={card}>
            <p className="font-medium text-gray-900">Payments &amp; documents</p>
            <p className={`text-sm mt-1 ${overdue > 0 ? 'text-red-600' : 'text-gray-500'}`}>{paymentsHint}</p>
          </Link>

          {/* Not built yet — shown so the hub reads as the full picture, but not clickable. */}
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4" aria-disabled="true">
            <p className="font-medium text-gray-400">Guest list details</p>
            <p className="text-sm text-gray-400 mt-1">Coming soon — dietary needs, VIP photos, hotel per day</p>
          </div>
        </div>
      </div>
    </main>
  )
}
