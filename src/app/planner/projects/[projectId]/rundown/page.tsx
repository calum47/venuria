import { projectTitle } from '@/lib/projectTitle'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import { formatDate } from '@/lib/projectDates'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'
import RundownApp, { type RequestedLine } from './RundownApp'
import { getProjectAccess } from '@/lib/projectAccess'
import ViewOnlyBanner from '@/components/ViewOnlyBanner'

type Params = { projectId: string }

/**
 * Run-Down list (migration 019): the list-form, day-of view of the timetable.
 * Times come from the timetable rows themselves — nothing is entered twice.
 */
export default async function RundownPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getTranslations('Timetable')
  const locale = (await getLocale()) as Locale
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">{(await getTranslations('Planner'))('noPlannerAccountLinkedTo')}</p>
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
  // What was requested from each Venuria vendor in the planner summary (pending or accepted), keyed by the team's vendor entry.
  const teamVendors = (vendorsRes.data ?? []) as DbTeamVendor[]
  const { data: sourceRows } = await supabase
    .from('project_item_sources')
    .select('catalog_item_id, rental_company_id, requested_quantity, quantity, status')
    .eq('project_id', projectId)
    .neq('status', 'declined')
  const itemIds = [...new Set((sourceRows ?? []).map((r) => r.catalog_item_id))]
  const { data: itemRows } = itemIds.length > 0 ? await supabase.from('catalog_items').select('id, name').in('id', itemIds) : { data: [] }
  const itemName = new Map((itemRows ?? []).map((i) => [i.id as string, i.name as string]))
  const tpdf = await getTranslations('Pdf')
  const requested: Record<string, RequestedLine[]> = {}
  for (const row of sourceRows ?? []) {
    const tv = teamVendors.find((v) => v.rental_company_id === row.rental_company_id)
    if (!tv) continue
    ;(requested[tv.id] ??= []).push({
      item: itemName.get(row.catalog_item_id) ?? tpdf('unknownItem'),
      vendor: tv.name,
      requested: row.requested_quantity,
      granted: row.quantity,
      status: row.status as 'pending' | 'accepted',
    })
  }
  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? (await getTranslations('Common'))('unknownVenue')
  const title = projectTitle(project.couple_names, venueName)

  return (
    <main className="p-8 print:p-0">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="print:hidden">
          <Link href={`/planner/projects/${projectId}/timetable`} className="text-sm text-gray-500 hover:text-gray-900">{t('backToTimetable')}</Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">{t('rundownTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {venueName}{project.event_date ? ` · ${formatDate(project.event_date, locale)}` : ''} · {t('timesFromTimetable')}
          </p>
        </div>

        {loadError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
            {t('loadError', { message: loadError.message })}
          </p>
        )}

        {access === 'view' && <ViewOnlyBanner />}
        <RundownApp
          readOnly={access === 'view'}
          projectId={projectId}
          title={title}
          eventDate={project.event_date}
          days={(daysRes.data ?? []) as DbProjectDay[]}
          initialBlocks={(blocksRes.data ?? []) as DbTimetableBlock[]}
          vendors={teamVendors}
          requested={requested}
        />
      </div>
    </main>
  )
}
