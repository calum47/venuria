import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { formatDate } from '@/lib/projectDates'
import type { DbProjectDocument, DbProjectPayment } from '@/types/db'
import PaymentsApp from './PaymentsApp'

type Params = { projectId: string }

/**
 * Payment tracker (migration 015): due dates, when each was paid, receipts,
 * and contract drafts / other PDFs. Planner team only — no client access.
 * Currency comes from the team (teams.currency), not from each payment.
 */
export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { projectId } = await params
  const { view } = await searchParams
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
    .select('id, event_date, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()

  const [{ data: payments, error: pErr }, { data: documents, error: dErr }] = await Promise.all([
    supabase.from('project_payments').select('*').eq('project_id', projectId).order('due_date'),
    supabase.from('project_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
  ])

  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'

  return (
    <main className="p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link href={`/planner/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-900">← {venueName}</Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">Payments &amp; documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {venueName}
            {project.event_date ? ` · ${formatDate(project.event_date)}` : ''} · amounts in {ctx.team.currency} · visible to your team only
          </p>
        </div>

        {(pErr || dErr) && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Could not load everything: {pErr?.message ?? dErr?.message}
          </p>
        )}

        <PaymentsApp
          projectId={projectId}
          teamId={ctx.team.id}
          currency={ctx.team.currency}
          eventDate={project.event_date}
          initialView={view === 'calendar' ? 'calendar' : 'list'}
          initialPayments={(payments ?? []) as DbProjectPayment[]}
          initialDocuments={(documents ?? []) as DbProjectDocument[]}
        />
      </div>
    </main>
  )
}
