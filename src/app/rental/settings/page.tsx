import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/supabase/vendorContext'
import VendorShell from '@/components/vendor/VendorShell'
import VendorProfileForm from './VendorProfileForm'

function parseHandles(raw: unknown, legacy: string | null | undefined): { handle: string; main: boolean }[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((x) => ({ handle: String((x as { handle?: string }).handle ?? ''), main: !!(x as { main?: boolean }).main }))
  }
  return legacy ? [{ handle: legacy, main: true }] : []
}

/** The vendor's own contact details: what planners see, filled in automatically, once they add the vendor to a project. */
export default async function VendorSettingsPage() {
  const t = await getTranslations('VendorSettings')
  const tv = await getTranslations('VendorProjects')
  const supabase = await createClient()
  const ctx = await getVendorContext(supabase)
  if (!ctx) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">{tv('noAccess')}</p>
      </main>
    )
  }
  const { data: co } = await supabase
    .from('rental_companies')
    .select('contact_name, phone, contact_email, instagram, instagram_handles')
    .eq('id', ctx.companyId)
    .maybeSingle()

  return (
    <VendorShell ctx={ctx}>
      <main className="px-4 sm:px-6 py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('intro', { company: ctx.companyName })}</p>
          </div>
          <VendorProfileForm
            initial={{
              contactName: co?.contact_name ?? '',
              phone: co?.phone ?? '',
              email: co?.contact_email ?? '',
              instagrams: parseHandles(co?.instagram_handles, co?.instagram),
            }}
          />
        </div>
      </main>
    </VendorShell>
  )
}
