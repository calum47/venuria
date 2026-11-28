'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { SignOutButton } from '@/components/auth/SignOutButton'
import NotificationBell from '@/components/nav/NotificationBell'
import { Rings } from '@/components/brand/Rings'
import type { PlannerRole } from '@/lib/supabase/plannerContext'
import { lastPageHref } from '@/lib/lastPage'

type Props = {
  plannerName: string
  role: PlannerRole
  teamName: string
  lastProjectId: string | null
  /** Last project page they had open; null = open the project hub. */
  lastPath: string | null
  /** Set when this login is also a Vendor: shows the Planner / Vendor switch. */
  vendorName: string | null
  /** The login is a Vendor (tag on): show its "Vendor projects" link even without a Vendor page. */
  vendorTag?: boolean
}

/**
 * Persistent nav for every planner screen (Phase 22 spec). Rendered by
 * app/planner/layout.tsx; the editor gets a compact menu version instead
 * (EditorNavMenu) because its toolbar has no room for a full bar.
 *
 * "My Stock" links to Phase 23's inventory page, added once that existed.
 */
export default function PlannerNav({ plannerName, role, teamName, lastProjectId, lastPath, vendorName, vendorTag = false }: Props) {
  const pathname = usePathname()
  const t = useTranslations('Nav')
  const tRoles = useTranslations('Roles')
  const item = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm transition-colors ${
        active ? 'bg-brand-50 text-brand-800 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <header className="bg-white border-b border-brand-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 md:py-0 md:h-14 flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-1">
        <Link href="/planner" className="mr-2 md:mr-4 flex items-center gap-2 text-gray-900" aria-label={t('home')}>
          <Rings className="h-5 w-7 text-brand-500" />
          <span className="font-serif text-2xl font-semibold leading-none tracking-tight">Venuria</span>
        </Link>

        {/* On phones the links drop to their own scrollable row under the logo. */}
        <nav aria-label={t('main')} data-tour="nav" className="order-last md:order-none w-full md:w-auto flex items-center gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {lastProjectId ? (
            item(lastPageHref(lastProjectId, lastPath), t('lastProject'), false)
          ) : (
            <span className="shrink-0 whitespace-nowrap px-3 py-1.5 text-sm text-gray-300" title={t('lastProjectHint')}>{t('lastProject')}</span>
          )}
          {item('/planner', t('myProjects'), pathname === '/planner')}
          {item('/planner/stock', t('myStock'), pathname.startsWith('/planner/stock'))}
          {item('/planner/team', t('myTeam'), pathname.startsWith('/planner/team'))}
          {item('/planner/settings', t('settings'), pathname.startsWith('/planner/settings'))}
          {vendorTag && item('/rental/projects', t('vendorProjects'), false)}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {vendorName && (
            <Link
              href="/rental"
              title={t('switchToVendor', { name: vendorName })}
              className="hidden sm:inline-flex shrink-0 whitespace-nowrap rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs text-brand-800 hover:bg-brand-100"
            >
              {t('plannerVendor')}
            </Link>
          )}
          <NotificationBell />
          <div className="hidden xl:block text-right leading-tight">
            <p className="text-sm text-gray-900">{plannerName}</p>
            <p className="text-[11px] text-gray-400">{tRoles(role)} · {teamName}</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}
