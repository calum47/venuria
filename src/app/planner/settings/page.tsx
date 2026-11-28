import { createClient } from '@/lib/supabase/server'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import SettingsForms from './SettingsForms'
import { normalizePdfStyle } from '@/lib/pdfExport/style'
import { projectTitle } from '@/lib/projectTitle'
import { getTranslations } from 'next-intl/server'
import { getVendorContext } from '@/lib/supabase/vendorContext'
import VendorProfileForm from '@/app/rental/settings/VendorProfileForm'

/** Settings (Phase 22a): name, password, team name + currency (manager). The rest of the spec's fields land in 22d. */
export default async function SettingsPage() {
  const t = await getTranslations('Settings')
  const supabase = await createClient()
  const ctx = await getPlannerContext(supabase)
  if (!ctx) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-600">{t('noPlannerAccountLinkedTo')}</p>
      </main>
    )
  }

  // Export look + preview projects: the manager edits them, everyone else just uses them.
  let exports: React.ComponentProps<typeof SettingsForms>['exports'] = null
  if (ctx.planner.role === 'manager') {
    const [{ data: teamRow }, { data: projectRows }] = await Promise.all([
      supabase.from('teams').select('export_style, logo_path').eq('id', ctx.team.id).maybeSingle(),
      supabase
        .from('projects')
        .select('id, couple_names, venues(name)')
        .eq('team_id', ctx.team.id)
        .order('event_date', { ascending: false, nullsFirst: false })
        .limit(50),
    ])
    exports = {
      style: normalizePdfStyle((teamRow as { export_style?: unknown } | null)?.export_style),
      logoPath: (teamRow as { logo_path?: string | null } | null)?.logo_path ?? null,
      projects: (projectRows ?? []).map((p) => ({
        id: p.id as string,
        title: projectTitle(p.couple_names as string | null, (p.venues as unknown as { name: string } | null)?.name ?? t('project')),
      })),
    }
  }

  // A planner login that also manages a vendor company edits the company's contact details here too.
  const vendor = await getVendorContext(supabase)
  const tv = await getTranslations('VendorSettings')
  let vendorCard: React.ReactNode = null
  if (vendor) {
    const { data: co } = await supabase
      .from('rental_companies')
      .select('contact_name, phone, contact_email, instagram, instagram_handles')
      .eq('id', vendor.companyId)
      .maybeSingle()
    const raw = co?.instagram_handles
    const handles: { handle: string; main: boolean }[] =
      Array.isArray(raw) && raw.length > 0
        ? raw.map((x: { handle?: string; main?: boolean }) => ({ handle: String(x.handle ?? ''), main: !!x.main }))
        : co?.instagram ? [{ handle: co.instagram, main: true }] : []
    vendorCard = (
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{tv('vendorSectionTitle', { company: vendor.companyName })}</h2>
          <p className="mt-1 text-sm text-gray-500">{tv('intro', { company: vendor.companyName })}</p>
        </div>
        <VendorProfileForm initial={{ contactName: co?.contact_name ?? '', phone: co?.phone ?? '', email: co?.contact_email ?? '', instagrams: handles }} />
      </section>
    )
  }

  return (
    <main className="p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-semibold text-gray-900">{t('settings')}</h1>
        <SettingsForms
          plannerName={ctx.planner.name}
          email={ctx.email}
          plannerCode={ctx.planner.plannerCode}
          role={ctx.planner.role}
          team={ctx.team}
          exports={exports}
        />
        {vendorCard}
      </div>
    </main>
  )
}
