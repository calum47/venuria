import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/SignOutButton'
import StockManager from '@/components/stock/StockManager'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPlannerContext } from '@/lib/supabase/plannerContext'
import StockSection from '@/app/planner/stock/StockSection'
import { getTranslations } from 'next-intl/server'

export default async function RentalPage() {
  const t = await getTranslations('Rental')
  const tc = await getTranslations('Common')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">{t('notSignedIn')}</p>
      </main>
    )
  }

  const { data: rentalManager } = await supabase
    .from('rental_managers')
    .select('rental_company_id, rental_companies(name, is_vendor, has_vendor_stock)')
    .eq('user_id', user.id)
    .maybeSingle()

  const rentalCompanyId = rentalManager?.rental_company_id as string | undefined
  const company = (rentalManager as { rental_companies: { name: string; is_vendor: boolean; has_vendor_stock: boolean } | null } | null)
    ?.rental_companies
  const rentalCompanyName = company?.name
  // Admin switches (see Admin → Vendor access). Off only hides: the data is kept.
  const isVendor = company?.is_vendor !== false
  const hasVendorStock = isVendor && company?.has_vendor_stock !== false

  // A login that is also a planner is a Vendor: same page, plus the team's retail stock (shared with My stock) and a switch back.
  const plannerCtx = await getPlannerContext(supabase)
  // A planner without Vendor stock has no Vendor page (and no switch to it): back to the planner side.
  if (rentalCompanyId && !hasVendorStock && plannerCtx) redirect('/planner')

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-gray-900">
            {plannerCtx ? t('vendor') : t('rentalManager')}{rentalCompanyName ? ` — ${rentalCompanyName}` : ''}
          </h1>
          <div className="flex items-center gap-3">
            {plannerCtx && (
              <Link href="/planner" className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs text-brand-800 hover:bg-brand-100">
                {t('plannerVendor')}
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
        {rentalCompanyId && isVendor && (
          <Link href="/rental/projects" className="mb-6 inline-block rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-100">
            {t('projectsYouAreOn')}
          </Link>
        )}
        {rentalCompanyId && isVendor && (
          <Link href="/rental/settings" className="mb-6 ml-2 inline-block rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            {t('contactSettings')}
          </Link>
        )}
        <p className="text-sm text-gray-500 mb-6">
          {tc('loggedInAs')} <span className="font-medium text-gray-900">{user.email}</span>.
        </p>

        {!rentalCompanyId ? (
          <p className="text-sm text-red-600">
            {t('noRentalCompanyIsLinked')}
          </p>
        ) : !isVendor ? (
          <p className="text-sm text-gray-500">{t('vendorAccessOff')}</p>
        ) : !hasVendorStock ? null : (
          <section>
            <h2 className="text-lg font-medium text-gray-900 mb-2">{t('stockTablesChairs')}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('stockTablesChairsHelp')}
            </p>
            <StockManager ownerType="rental_company" ownerId={rentalCompanyId} />
          </section>
        )}

        {plannerCtx && (
          <section className="mt-10">
            <h2 className="text-lg font-medium text-gray-900 mb-2">{t('stockProductsYouSell')}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {t.rich('stockProductsHelp', { team: plannerCtx.team.name, b: (c) => <span className="font-medium">{c}</span> })}
            </p>
            <StockSection supabase={supabase} ctx={plannerCtx} />
          </section>
        )}
      </div>
    </main>
  )
}
