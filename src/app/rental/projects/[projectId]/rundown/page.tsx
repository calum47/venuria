import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/projectDates'
import { projectTitle } from '@/lib/projectTitle'
import type { DbProjectDay, DbTeamVendor, DbTimetableBlock } from '@/types/db'
import RundownApp from '@/app/planner/projects/[projectId]/rundown/RundownApp'
import ViewOnlyBanner from '@/components/ViewOnlyBanner'
import VendorShell from '@/components/vendor/VendorShell'
import { loadVendorProject } from '../loadVendorProject'

/** The run-down list, read-only, for a vendor added to the project. Printable. */
export default async function VendorRundownPage({ params }: { params: Promise<{ projectId: string }> }) {
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
      <main className="p-8 print:p-0">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="print:hidden">
            <Link href={`/rental/projects/${projectId}/timetable`} className="text-sm text-gray-500 hover:text-gray-900">{t('backToTimetable')}</Link>
            <h1 className="mt-2 text-3xl font-semibold text-gray-900">{t('rundownTitle')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {venueName}{project.event_date ? ` · ${formatDate(project.event_date, locale)}` : ''} · {t('timesFromTimetable')}
            </p>
          </div>
          {loadError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{t('loadError', { message: loadError.message })}</p>
          )}
          <ViewOnlyBanner />
          <RundownApp
            readOnly
            projectId={projectId}
            title={title}
            eventDate={project.event_date}
            days={(daysRes.data ?? []) as DbProjectDay[]}
            initialBlocks={(blocksRes.data ?? []) as DbTimetableBlock[]}
            vendors={(vendorsRes.data ?? []) as DbTeamVendor[]}
            timetableHref={`/rental/projects/${projectId}/timetable`}
          />
        </div>
      </main>
    </VendorShell>
  )
}
