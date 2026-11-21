import { projectTitle } from '@/lib/projectTitle'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { formatDate } from '@/lib/projectDates'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'
import RundownApp from './RundownApp'

type Params = { projectId: string }

/**
 * Run-Down list (migration 019): the list-form, day-of view of the timetable.
 * Times come from the timetable rows themselves — nothing is entered twice.
 */
export default async function RundownPage({ params }: { params: Promise<Params> }) {
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
    .select('id, event_date, couple_names, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) notFound()

  const [daysRes, blocksRes, vendorsRes] = await Promise.all([
    supabase.from('project_days').select('*').eq('project_id', projectId).order('position').order('created_at'),
    supabase.from('timetable_blocks').select('*').eq('project_id', projectId).order('start_min'),
    supabase.from('team_vendors').select('*').eq('team_id', ctx.team.id).order('name'),
  ])
  const loadError = daysRes.error ?? blocksRes.error ?? vendorsRes.error
  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'
  const title = projectTitle(project.couple_names, venueName)

  return (
    <main className="p-8 print:p-0">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="print:hidden">
          <Link href={`/planner/projects/${projectId}/timetable`} className="text-sm text-gray-500 hover:text-gray-900">← Timetable</Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">Run-down list</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {venueName}{project.event_date ? ` · ${formatDate(project.event_date)}` : ''} · times come from the timetable
          </p>
        </div>

        {loadError && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
            Could not load everything: {loadError.message}
          </p>
        )}

        <RundownApp
          projectId={projectId}
          title={title}
          eventDate={project.event_date}
          days={(daysRes.data ?? []) as DbProjectDay[]}
          initialBlocks={(blocksRes.data ?? []) as DbTimetableBlock[]}
          vendors={(vendorsRes.data ?? []) as DbTeamVendor[]}
        />
      </div>
    </main>
  )
}
