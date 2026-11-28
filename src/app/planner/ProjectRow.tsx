'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { updateProjectDates, updateProjectCoupleNames, setProjectAssignees, setProjectVisibility } from './actions'
import { projectTitle } from '@/lib/projectTitle'
import { countdownLabel, daysUntil, formatDate, suggestDueBy } from '@/lib/projectDates'
import { useTranslations } from 'next-intl'

export type ProjectRowData = {
  id: string
  status: string
  event_date: string | null
  due_by: string | null
  venueName: string
  coupleNames: string | null
  creatorId: string
  creatorName: string
  assignees: { id: string; name: string }[]
  visibility: 'private' | 'public'
  /** 'view' = a Public project the viewer is not assigned to (Member): look only. */
  access: 'edit' | 'view'
}

type Props = {
  project: ProjectRowData
  meId: string
  canAssign: boolean       // manager or lead
  canToggleVisibility: boolean
  teammates: { id: string; name: string }[]
}

export default function ProjectRow({ project, meId, canAssign, canToggleVisibility, teammates }: Props) {
  const tc = useTranslations('Common')
  const tx = useTranslations('Planner')
  const locale = useLocale() as Locale
  const tdates = useTranslations('Dates')
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState(project.event_date ?? '')
  const [dueBy, setDueBy] = useState(project.due_by ?? '')

  const isPast = project.event_date ? daysUntil(project.event_date) < 0 : false
  const dueSoon = project.due_by ? daysUntil(project.due_by) <= 3 && daysUntil(project.due_by) >= 0 : false
  const dueOverdue = project.due_by && !isPast ? daysUntil(project.due_by) < 0 : false

  const run = (action: (fd: FormData) => Promise<{ error?: string }>, onOk?: () => void) => (fd: FormData) => {
    setError(null)
    startTransition(async () => {
      const r = await action(fd)
      if (r.error) setError(r.error)
      else onOk?.()
    })
  }

  const who =
    project.creatorId === meId
      ? tx('createdByYou')
      : tx('createdByName', { name: project.creatorName })
  const assignee =
    project.assignees.length === 0
      ? null
      : tx('assignedTo', { names: project.assignees.map((a) => (a.id === meId ? tx('you') : a.name)).join(', ') })
  const viewOnly = project.access === 'view'

  return (
    <li className={`px-5 py-4 text-sm ${isPast ? 'opacity-50' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="font-serif text-xl font-semibold text-gray-900">{projectTitle(project.coupleNames, project.venueName)}</span>
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] capitalize text-gray-500">{tx(`statuses.${project.status as 'in_progress'}`)}</span>
          {viewOnly && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-800 bg-amber-50 rounded-full px-2 py-0.5">{tx('viewOnly')}</span>
          )}
          {project.visibility === 'private' && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{tx('private')}</span>
          )}
          <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {project.coupleNames?.trim() && <span className="text-gray-500">{project.venueName}</span>}
            {project.event_date ? (
              <span className="text-gray-600">
                {formatDate(project.event_date, locale)}
                <span className={`ml-1.5 ${isPast ? 'text-gray-400' : 'text-gray-900 font-medium'}`}>
                  · {countdownLabel(project.event_date, tdates)}
                </span>
              </span>
            ) : (
              <span className="text-amber-600">{tx('noEventDateSet')}</span>
            )}
            {project.due_by && !isPast && (
              <span className={dueOverdue ? 'text-red-600' : dueSoon ? 'text-amber-600' : 'text-gray-400'}>
                {tc('dueBy')} {formatDate(project.due_by, locale)}
                {dueOverdue && ` — ${tx('overdueSuffix')}`}
                {dueSoon && !dueOverdue && ` — ${countdownLabel(project.due_by, tdates).toLowerCase()}`}
              </span>
            )}
            <span className="text-gray-400">
              {who}
              {assignee && ` · ${assignee}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!viewOnly && (
            <button onClick={() => { setEditing((v) => !v); setError(null) }} className="text-xs text-gray-400 hover:text-gray-700">
              {editing ? tc('close') : tc('edit')}
            </button>
          )}
          <Link href={`/planner/projects/${project.id}`} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm text-brand-800 transition-colors hover:bg-brand-100">
            {tx('openProject')}
          </Link>
        </div>
      </div>

      {editing && !viewOnly && (
        <div className="mt-3 space-y-2 rounded-xl bg-gray-50 border border-gray-100 p-3">
          <form key={project.coupleNames ?? ''} action={run(updateProjectCoupleNames)} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500">{tx('coupleSNames')}</label>
              <input name="coupleNames" defaultValue={project.coupleNames ?? ''} required maxLength={80} className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900" />
            </div>
            <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1 text-xs text-white disabled:opacity-40">
              {isPending ? tc('saving') : tx('saveNames')}
            </button>
          </form>
          <form action={run(updateProjectDates)} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500">{tc('eventDate')}</label>
              <input type="date" name="eventDate" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500">{tc('dueBy')}</label>
              <input type="date" name="dueBy" value={dueBy} onChange={(e) => setDueBy(e.target.value)} className="rounded-lg border bg-white px-2 py-1 text-sm text-gray-900" />
            </div>
            {eventDate && (
              <button type="button" onClick={() => setDueBy(suggestDueBy(eventDate))} className="text-[11px] text-gray-500 hover:text-gray-800 pb-1.5" title={tx('twoWeeksBeforeTheEvent')}>
                {tx('resetDueBy')}
              </button>
            )}
            <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1 text-xs text-white disabled:opacity-40">
              {isPending ? tc('saving') : tx('saveDates')}
            </button>
          </form>

          {(canAssign || canToggleVisibility) && (
            <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-gray-100">
              {canAssign && (
                <form
                  // key remounts the checkboxes when the saved assignees change, so they show what is stored.
                  key={project.assignees.map((x) => x.id).join(',') || 'none'}
                  action={run(setProjectAssignees)}
                  className="flex flex-col gap-1"
                >
                  <span className="text-[11px] text-gray-500">{tx('assignedToAnyNumber')}</span>
                  <input type="hidden" name="projectId" value={project.id} />
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {teammates.map((t) => (
                      <label key={t.id} className="flex items-center gap-1 text-xs text-gray-800">
                        <input
                          type="checkbox"
                          name="plannerIds"
                          value={t.id}
                          defaultChecked={project.assignees.some((x) => x.id === t.id)}
                          disabled={isPending}
                        />
                        {t.id === meId ? `${t.name} (you)` : t.name}
                      </label>
                    ))}
                  </div>
                  <button type="submit" disabled={isPending} className="self-start rounded-lg border bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-40">
                    {isPending ? tc('saving') : tx('saveAssignees')}
                  </button>
                </form>
              )}
              {canToggleVisibility && (
                <form action={run(setProjectVisibility)} className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">{tx('visibility')}</label>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="visibility" value={project.visibility === 'public' ? 'private' : 'public'} />
                  <button type="submit" disabled={isPending} className="rounded-lg border bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
                    {project.visibility === 'public' ? tx('publicMakePrivate') : tx('privateMakePublic')}
                  </button>
                </form>
              )}
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </li>
  )
}
