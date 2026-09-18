'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateProjectDates, assignProject, setProjectVisibility } from './actions'
import { countdownLabel, daysUntil, formatDate, suggestDueBy } from '@/lib/projectDates'

export type ProjectRowData = {
  id: string
  status: string
  event_date: string | null
  due_by: string | null
  venueName: string
  creatorId: string
  creatorName: string
  assigneeId: string | null
  assigneeName: string | null
  visibility: 'private' | 'public'
}

type Props = {
  project: ProjectRowData
  meId: string
  canAssign: boolean       // manager or lead
  canToggleVisibility: boolean
  teammates: { id: string; name: string }[]
}

export default function ProjectRow({ project, meId, canAssign, canToggleVisibility, teammates }: Props) {
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
      ? 'Created by you'
      : `Created by ${project.creatorName}`
  const assignee =
    project.assigneeId === null ? null : project.assigneeId === meId ? 'assigned to you' : `assigned to ${project.assigneeName}`

  return (
    <li className={`px-4 py-2.5 text-sm ${isPast ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-gray-900">{project.venueName}</span>
          <span className="text-gray-400 ml-2 text-xs">{project.status}</span>
          {project.visibility === 'private' && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">Private</span>
          )}
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {project.event_date ? (
              <span className="text-gray-600">
                {formatDate(project.event_date)}
                <span className={`ml-1.5 ${isPast ? 'text-gray-400' : 'text-gray-900 font-medium'}`}>
                  · {countdownLabel(project.event_date)}
                </span>
              </span>
            ) : (
              <span className="text-amber-600">No event date set</span>
            )}
            {project.due_by && !isPast && (
              <span className={dueOverdue ? 'text-red-600' : dueSoon ? 'text-amber-600' : 'text-gray-400'}>
                Due by {formatDate(project.due_by)}
                {dueOverdue && ' — overdue'}
                {dueSoon && !dueOverdue && ` — ${countdownLabel(project.due_by).toLowerCase()}`}
              </span>
            )}
            <span className="text-gray-400">
              {who}
              {assignee && ` · ${assignee}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => { setEditing((v) => !v); setError(null) }} className="text-xs text-gray-400 hover:text-gray-700">
            {editing ? 'Close' : 'Edit'}
          </button>
          <Link href={`/editor/${project.id}`} className="text-blue-600 hover:underline text-sm">
            Open editor →
          </Link>
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 rounded bg-gray-50 border border-gray-100 p-2">
          <form action={run(updateProjectDates)} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500">Event date</label>
              <input type="date" name="eventDate" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="rounded border bg-white px-2 py-1 text-sm text-gray-900" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500">Due by</label>
              <input type="date" name="dueBy" value={dueBy} onChange={(e) => setDueBy(e.target.value)} className="rounded border bg-white px-2 py-1 text-sm text-gray-900" />
            </div>
            {eventDate && (
              <button type="button" onClick={() => setDueBy(suggestDueBy(eventDate))} className="text-[11px] text-gray-500 hover:text-gray-800 pb-1.5" title="Two weeks before the event">
                Reset due-by
              </button>
            )}
            <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40">
              {isPending ? 'Saving…' : 'Save dates'}
            </button>
          </form>

          {(canAssign || canToggleVisibility) && (
            <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-gray-100">
              {canAssign && (
                <form action={run(assignProject)} className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Assigned to</label>
                  <input type="hidden" name="projectId" value={project.id} />
                  <select
                    name="plannerId"
                    defaultValue={project.assigneeId ?? ''}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                    disabled={isPending}
                    className="rounded border bg-white px-2 py-1 text-xs text-gray-900"
                  >
                    <option value="">Nobody</option>
                    {teammates.map((t) => (
                      <option key={t.id} value={t.id}>{t.id === meId ? `${t.name} (you)` : t.name}</option>
                    ))}
                  </select>
                </form>
              )}
              {canToggleVisibility && (
                <form action={run(setProjectVisibility)} className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-500">Visibility</label>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="visibility" value={project.visibility === 'public' ? 'private' : 'public'} />
                  <button type="submit" disabled={isPending} className="rounded border bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100">
                    {project.visibility === 'public' ? 'Public — make private' : 'Private — make public'}
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
