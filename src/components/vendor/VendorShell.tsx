import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { Rings } from '@/components/brand/Rings'
import type { VendorContext } from '@/lib/supabase/vendorContext'
import { createClient } from '@/lib/supabase/server'

/** Header for the vendor's project pages (/rental/projects/…): works for pure vendor logins, which have no planner nav. */
export default async function VendorShell({ ctx, children }: { ctx: VendorContext; children: React.ReactNode }) {
  const t = await getTranslations('VendorProjects')
  const supabase = await createClient()
  const { count: pendingCount } = await supabase
    .from('project_item_sources').select('project_id', { count: 'exact', head: true })
    .eq('rental_company_id', ctx.companyId).eq('status', 'pending')
  const pill = 'shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-brand-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={ctx.isPlanner ? '/planner' : '/rental'} className="mr-2 flex items-center gap-2 text-gray-900" aria-label="Venuria">
            <Rings className="h-5 w-7 text-brand-500" />
            <span className="font-serif text-2xl font-semibold leading-none tracking-tight">Venuria</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/rental/projects" className={pill}>{t('myProjects')}</Link>
            {ctx.hasVendorStock && <Link href="/rental" className={pill}>{t('vendorPage')}</Link>}
            <Link href="/rental/requests" className={pill}>
              {t('requests')}
              {!!pendingCount && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">{pendingCount}</span>}
            </Link>
            <Link href="/rental/settings" className={pill}>{t('settings')}</Link>
            {ctx.isPlanner && <Link href="/planner" className={pill}>{t('plannerSide')}</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-sm text-gray-500">{ctx.companyName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  )
}
