import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { formatDate, countdownLabel } from '@/lib/projectDates'
import { projectTitle } from '@/lib/projectTitle'
import { HubCard } from '@/components/brand/HubCard'
import VendorShell from '@/components/vendor/VendorShell'
import { loadVendorProject } from './loadVendorProject'

/** What a vendor sees of a project it was added to: four read-only views. No guests, payments or documents. */
export default async function VendorProjectHubPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const t = await getTranslations('VendorProjects')
  const tdates = await getTranslations('Dates')
  const tc = await getTranslations('Common')
  const locale = (await getLocale()) as Locale
  const supabase = await createClient()
  const v = await loadVendorProject(supabase, projectId)
  if (!v) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">{t('noAccess')}</p>
      </main>
    )
  }
  const { ctx, project } = v
  const venue = project.venueName ?? tc('unknownVenue')

  return (
    <VendorShell ctx={ctx}>
      <main className="px-4 sm:px-6 py-10">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <Link href="/rental/projects" className="text-sm text-gray-500 hover:text-gray-900">{t('backToProjects')}</Link>
            <h1 className="mt-3 text-4xl font-semibold text-gray-900">{projectTitle(project.couple_names, venue)}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {project.couple_names?.trim() ? `${venue} · ` : ''}
              {project.event_date ? `${formatDate(project.event_date, locale)} · ${countdownLabel(project.event_date, tdates)}` : t('noDate')}
            </p>
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('readOnlyNote')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <HubCard href={`/editor/${projectId}`} icon="editor" title={t('map')} hint={t('mapHint')} />
            <HubCard href={`/rental/projects/${projectId}/materials`} icon="summary" title={t('materials')} hint={t('materialsHint')} />
            <HubCard href={`/rental/projects/${projectId}/timetable`} icon="timetable" title={t('timetable')} hint={t('timetableHint')} />
            <HubCard href={`/rental/projects/${projectId}/rundown`} icon="rundown" title={t('rundown')} hint={t('rundownHint')} />
          </div>
        </div>
      </main>
    </VendorShell>
  )
}
