import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/projectDates'
import { projectTitle } from '@/lib/projectTitle'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'
import TimetableApp from '@/app/planner/projects/[projectId]/timetable/TimetableApp'
import ViewOnlyBanner from '@/components/ViewOnlyBanner'
import VendorShell from '@/components/vendor/VendorShell'
import { loadVendorProject } from '../loadVendorProject'

/** The whole day's timetable, read-only, for a vendor added to the project. */
export default async function VendorTimetablePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const t = await getTranslations('Timetable')
  const tv = await getTranslations('VendorProjects')
  const tc = await getTranslations('Common')
  const locale = (await getLocale()) as Locale
  const supabase = await createClient()
  const v = await loadVendorProject(supabase, projectId)
  if (!v) return <main className="p-8"><p className="text-sm text-gray-500">{tv('noAccess')}</p></main>
  const { ctx, project } = v
  const venueName = project.venueName ?? tc('unknownVenue')
  const title = projectTitle(project.couple_names, venueName)

  const [daysRes, blocksRes] = await Promise.all([
    supabase.from('project_days').select('*').eq('project_id', projectId).order('position').order('created_at'),
    supabase.from('timetable_blocks').select('*').eq('project_id', projectId).order('start_min'),
  ])
  const vendorIds = [...new Set((blocksRes.data ?? []).map((b) => b.vendor_id as string | null).filter((x): x is string => !!x))]
  const vendorsRes = vendorIds.length > 0 ? await supabase.from('team_vendors').select('*').in('id', vendorIds).order('name') : { data: [], error: null }
  const loadError = daysRes.error ?? blocksRes.error ?? vendorsRes.error

  return (
    <VendorShell ctx={ctx}>
      <main className="p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Link href={`/rental/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-900">← {title}</Link>
              <h1 className="mt-2 text-3xl font-semibold text-gray-900">{t('pageTitle')}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {venueName}{project.event_date ? ` · ${formatDate(project.event_date, locale)}` : ''}
              </p>
            </div>
            <Link href={`/rental/projects/${projectId}/rundown`} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              {t('openRundown')}
            </Link>
          </div>
          {loadError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t('loadError', { message: loadError.message })}</p>
          )}
          <ViewOnlyBanner />
          <TimetableApp
            readOnly
            projectId={projectId}
            teamId=""
            eventDate={project.event_date}
            initialDays={(daysRes.data ?? []) as DbProjectDay[]}
            initialBlocks={(blocksRes.data ?? []) as DbTimetableBlock[]}
            initialVendors={(vendorsRes.data ?? []) as DbTeamVendor[]}
          />
        </div>
      </main>
    </VendorShell>
  )
}
