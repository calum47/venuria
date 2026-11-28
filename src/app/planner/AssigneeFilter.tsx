'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

/** Managers and Leads: narrow My Projects (and its payments) to one teammate's projects, or to unassigned ones. */
export default function AssigneeFilter({
  teammates,
  value,
  meId,
}: {
  teammates: { id: string; name: string }[]
  value: string
  meId: string
}) {
  const tx = useTranslations('Planner')
  const router = useRouter()
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      {tx('showProjectsOf')}
      <select
        value={value}
        onChange={(e) => router.replace(e.target.value ? `/planner?assignee=${encodeURIComponent(e.target.value)}` : '/planner')}
        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
      >
        <option value="">{tx('everyone')}</option>
        <option value="none">{tx('unassigned')}</option>
        {teammates.map((t) => (
          <option key={t.id} value={t.id}>{t.id === meId ? tx('nameYou', { name: t.name }) : t.name}</option>
        ))}
      </select>
    </label>
  )
}
