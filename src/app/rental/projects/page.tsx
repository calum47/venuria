import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/supabase/vendorContext'
import { formatDate, countdownLabel } from '@/lib/projectDates'
import { projectTitle } from '@/lib/projectTitle'
import { hubCardClass as card } from '@/components/brand/HubCard'
import VendorShell from '@/components/vendor/VendorShell'

/** The projects a planner has added this vendor to. RLS only returns those. */
export default async function VendorProjectsPage() {
  const t = await getTranslations('VendorProjects')
  const tdates = await getTranslations('Dates')
  const tc = await getTranslations('Common')
  const locale = (await getLocale()) as Locale
  const supabase = await createClient()
  const ctx = await getVendorContext(supabase)
  if (!ctx) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">{t('noAccess')}</p>
      </main>
    )
  }

  const { data: rows } = await supabase
    .from('project_vendors')
    .select('project_id, projects(id, event_date, couple_names, venues(name))')
    .eq('rental_company_id', ctx.companyId)
  type P = { id: string; event_date: string | null; couple_names: string | null; venues: { name: string } | null }
  const projects = (rows ?? [])
    .map((r) => r.projects as unknown as P | null)
    .filter((p): p is P => !!p)
    .sort((a, b) => (a.event_date ?? '9999').localeCompare(b.event_date ?? '9999'))

  return (
    <VendorShell ctx={ctx}>
      <main className="px-4 sm:px-6 py-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
          </div>
          {projects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">{t('none')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const venue = p.venues?.name ?? tc('unknownVenue')
                return (
                  <Link key={p.id} href={`/rental/projects/${p.id}`} className={card}>
                    <p className="font-medium text-gray-900">{projectTitle(p.couple_names, venue)}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {p.couple_names?.trim() ? `${venue} · ` : ''}
                      {p.event_date ? `${formatDate(p.event_date, locale)} · ${countdownLabel(p.event_date, tdates)}` : t('noDate')}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </VendorShell>
  )
}
