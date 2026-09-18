'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { ROLE_LABEL, type PlannerRole } from '@/lib/supabase/plannerContext'

type Props = {
  plannerName: string
  role: PlannerRole
  teamName: string
  lastProjectId: string | null
}

/**
 * Persistent nav for every planner screen (Phase 22 spec). Rendered by
 * app/planner/layout.tsx; the editor gets a compact menu version instead
 * (EditorNavMenu) because its toolbar has no room for a full bar.
 *
 * "My Stock" is intentionally absent until Phase 23 exists — a dead link
 * is worse than no link.
 */
export default function PlannerNav({ plannerName, role, teamName, lastProjectId }: Props) {
  const pathname = usePathname()
  const item = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-2">
        <Link href="/planner" className="font-semibold text-gray-900 mr-4">Venuria</Link>

        {lastProjectId ? (
          item(`/editor/${lastProjectId}`, '↩ Last project', false)
        ) : (
          <span className="px-3 py-1.5 text-sm text-gray-300" title="Open a project and it will appear here">↩ Last project</span>
        )}
        {item('/planner', 'My projects', pathname === '/planner')}
        {item('/planner/team', 'My team', pathname.startsWith('/planner/team'))}
        {item('/planner/settings', 'Settings', pathname.startsWith('/planner/settings'))}

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm text-gray-900">{plannerName}</p>
            <p className="text-[11px] text-gray-400">{ROLE_LABEL[role]} · {teamName}</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}
