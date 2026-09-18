'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DbProjectActivity, DbRoom } from '@/types/db'
import {
  getProjectLastOpenedAt,
  getProjectActivitySince,
  touchProjectVisit,
} from '@/lib/supabase/queries'

type Props = {
  projectId: string
  rooms: DbRoom[]
}

type Line = { key: string; text: string }
type Group = { actor: string; when: string; lines: Line[] }

/**
 * Mounted in the editor once the project is loaded. Reads the user's previous
 * "last opened" stamp, fetches activity by OTHER users since then, stamps
 * "opened now", and shows a summary if there's anything to show.
 *
 * Order matters: read the old stamp → query → write the new stamp. Writing
 * first would hide everything.
 *
 * First-ever open of a project shows nothing (there's no "since" to diff
 * against) — it just sets the stamp so the next open works.
 *
 * Note (18 Sep 2026): until multi-planner access exists, the only "other
 * user" who can edit a planner's project is an admin — so in practice this
 * stays empty for now. The triggers still record history from today, so
 * nothing is lost for when teams arrive.
 */
export default function ProjectActivityModal({ projectId, rooms }: Props) {
  const [events, setEvents] = useState<DbProjectActivity[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const lastOpened = await getProjectLastOpenedAt(projectId)
        if (lastOpened) {
          const since = await getProjectActivitySince(projectId, lastOpened)
          if (!cancelled && since.length > 0) {
            setEvents(since)
            setOpen(true)
          }
        }
        await touchProjectVisit(projectId)
      } catch (err) {
        // Non-fatal: the editor must never fail to load because of this.
        console.error('ProjectActivityModal failed:', err)
      }
    }
    run()
    return () => { cancelled = true }
  }, [projectId])

  const roomName = useMemo(() => {
    const map = new Map(rooms.map((r) => [r.id, r.name]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [rooms])

  const groups = useMemo<Group[]>(() => aggregate(events, roomName), [events, roomName])

  if (!open || groups.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-xl shadow-xl w-[30rem] max-h-[85vh] flex flex-col">
        <div className="px-6 pt-6 pb-3">
          <h3 className="font-semibold text-gray-900">Since you were last here</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {events.length} change{events.length === 1 ? '' : 's'} by other people on this project
          </p>
        </div>

        <div className="px-6 overflow-y-auto space-y-4 pb-4">
          {groups.map((g, i) => (
            <section key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-medium text-gray-900">{g.actor}</h4>
                <span className="text-xs text-gray-400 shrink-0">{g.when}</span>
              </div>
              <ul className="mt-1.5 space-y-1 text-sm text-gray-600 list-disc pl-5">
                {g.lines.map((l) => (
                  <li key={l.key}>{l.text}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-6 pb-6 pt-2">
          <button
            onClick={() => setOpen(false)}
            className="w-full py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Aggregation ─────────────────────────────────────────────────────────────
//
// Raw rows are one-per-object. A planner dragging five tables around a room
// should read as "moved 5 tables in Sala Principal", not five lines. Group by
// actor + calendar day, then within that collapse by (entity, action, room)
// into a count, keeping a couple of names for flavour.

function aggregate(events: DbProjectActivity[], roomName: (id: string | null) => string | null): Group[] {
  const byActorDay = new Map<string, { actor: string; when: string; events: DbProjectActivity[] }>()

  for (const e of events) {
    const actor = e.actor_name ?? (e.actor_user_id ? 'Another user' : 'System')
    const day = e.created_at.slice(0, 10)
    const key = `${actor}|${day}`
    if (!byActorDay.has(key)) byActorDay.set(key, { actor, when: formatDay(day), events: [] })
    byActorDay.get(key)!.events.push(e)
  }

  const groups: Group[] = []
  for (const { actor, when, events: evs } of byActorDay.values()) {
    const buckets = new Map<string, { count: number; names: string[]; sample: DbProjectActivity }>()
    for (const e of evs) {
      const key = `${e.entity}|${e.action}|${e.room_id ?? ''}`
      const name = displayName(e)
      const b = buckets.get(key)
      if (b) {
        b.count++
        if (name && b.names.length < 2 && !b.names.includes(name)) b.names.push(name)
      } else {
        buckets.set(key, { count: 1, names: name ? [name] : [], sample: e })
      }
    }
    const lines: Line[] = []
    for (const [key, b] of buckets) lines.push({ key, text: describe(b.sample, b.count, b.names, roomName) })
    groups.push({ actor, when, lines })
  }
  return groups
}

function displayName(e: DbProjectActivity): string | null {
  if (e.entity === 'layout_object') return e.summary.label || e.summary.name || null
  if (e.entity === 'guest') return e.summary.name ?? null
  return e.summary.guest_name ?? null
}

function describe(
  e: DbProjectActivity,
  count: number,
  names: string[],
  roomName: (id: string | null) => string | null,
): string {
  const room = roomName(e.room_id)
  const where = room ? ` in ${room}` : ''
  const plural = count === 1 ? '' : 's'
  const sample = names.length > 0 ? ` (${names.join(', ')}${count > names.length ? ', …' : ''})` : ''

  switch (e.entity) {
    case 'layout_object': {
      const verbs: Record<string, string> = { added: 'Added', moved: 'Moved', updated: 'Changed', removed: 'Removed' }
      const verb = verbs[e.action] ?? 'Changed'
      return `${verb} ${count} item${plural}${where}${sample}`
    }
    case 'guest': {
      const verbs: Record<string, string> = { added: 'Added', updated: 'Edited', removed: 'Removed' }
      const verb = verbs[e.action] ?? 'Changed'
      return `${verb} ${count} guest${plural}${sample}`
    }
    case 'seat_assignment': {
      const verbs: Record<string, string> = { assigned: 'Seated', unassigned: 'Unseated', reassigned: 'Moved' }
      const verb = verbs[e.action] ?? 'Changed seating for'
      return `${verb} ${count} guest${plural}${where}${sample}`
    }
  }
}

function formatDay(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
