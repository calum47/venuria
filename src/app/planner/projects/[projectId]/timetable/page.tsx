import { projectTitle } from '@/lib/projectTitle'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { formatDate } from '@/lib/projectDates'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'
import TimetableApp from './TimetableApp'
import { getProjectAccess } from '@/lib/projectAccess'
import ViewOnlyBanner from '@/components/ViewOnlyBanner'

type Params = { projectId: string }

/**
 * Timetable (migration 019): one hourly calendar per event day. This is the
 * single source of truth for time — the Run-Down list reads from it.
 */
export default async function TimetablePage({ params }: { params: Promise<Params> }) {
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
  const access = await getProjectAccess(supabase, projectId)

  const [daysRes, blocksRes, vendorsRes] = await Promise.all([
    supabase.from('project_days').select('*').eq('project_id', projectId).order('position').order('created_at'),
    supabase.from('timetable_blocks').select('*').eq('project_id', projectId).order('start_min'),
    supabase.from('team_vendors').select('*').eq('team_id', ctx.team.id).order('name'),
  ])
  const loadError = daysRes.error ?? blocksRes.error ?? vendorsRes.error
  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'
  const title = projectTitle(project.couple_names, venueName)

  return (
    <main className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <Link href={`/planner/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-900">← {title}</Link>
            <h1 className="mt-2 text-3xl font-semibold text-gray-900">Timetable</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {venueName}
              {project.event_date ? ` · ${formatDate(project.event_date)}` : ''} · visible to your team only
            </p>
          </div>
          <Link href={`/planner/projects/${projectId}/rundown`} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Open the run-down list →
          </Link>
        </div>

        {loadError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Could not load everything: {loadError.message}
          </p>
        )}

        {access === 'view' && <ViewOnlyBanner />}
        <TimetableApp
          readOnly={access === 'view'}
          projectId={projectId}
          teamId={ctx.team.id}
          eventDate={project.event_date}
          initialDays={(daysRes.data ?? []) as DbProjectDay[]}
          initialBlocks={(blocksRes.data ?? []) as DbTimetableBlock[]}
          initialVendors={(vendorsRes.data ?? []) as DbTeamVendor[]}
        />
      </div>
    </main>
  )
}
