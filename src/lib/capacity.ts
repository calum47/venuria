/**
 * Area capacity (migration 024). A PEOPLE limit per room with two figures set by
 * the Venue Manager: seated and standing. The planner chooses per project and room
 * which scene it is.
 *
 * What counts against the limit (decided as an assumption on 20 Nov 2026 — Notion
 * does not say):
 *   seated   -> chairs placed in that room (one chair = one person)
 *   standing -> the project's guest total (everyone is in the room; a few chairs
 *               are expected and do not matter)
 */
import type { Tr } from '@/i18n/types'

export type CapacityMode = 'seated' | 'standing'

export type RoomCapacity = { capacity_seated: number | null; capacity_standing: number | null }

export function capacityLimit(room: RoomCapacity, mode: CapacityMode): number | null {
  return mode === 'seated' ? room.capacity_seated : room.capacity_standing
}

export function capacityLoad(mode: CapacityMode, chairsInRoom: number, guestTotal: number): number {
  return mode === 'seated' ? chairsInRoom : guestTotal
}

/** `t` = translator for "Capacity". */
export const modeLabel = (m: CapacityMode, t: Tr) => t(m)
export const unitLabel = (m: CapacityMode, n: number, t: Tr) => t(m === 'seated' ? 'seats' : 'guests', { count: n })

export type CapacityState = 'unknown' | 'ok' | 'near' | 'over' | 'acknowledged'

export type CapacityStatus = {
  state: CapacityState
  limit: number | null
  load: number
}

/**
 * 'unknown'      the venue has not set a figure for this scene
 * 'near'         at 90% or more of the limit, not over
 * 'over'         above the limit and not acknowledged
 * 'acknowledged' above the limit, but the planner continued with a note and the
 *                load has not grown beyond what that note covered
 */
export function capacityStatus(limit: number | null, load: number, overrideLoad: number | null): CapacityStatus {
  if (limit === null) return { state: 'unknown', limit, load }
  if (load > limit) {
    const acknowledged = overrideLoad !== null && load <= overrideLoad
    return { state: acknowledged ? 'acknowledged' : 'over', limit, load }
  }
  return { state: load >= limit * 0.9 ? 'near' : 'ok', limit, load }
}

/** One line for a hub card, e.g. "Seated · 96 of 120 seats" or "Seated up to 120 · standing up to 200". `t` = "Capacity". */
export function capacityLine(
  room: RoomCapacity,
  mode: CapacityMode | null,
  chairsInRoom: number,
  guestTotal: number,
  overrideLoad: number | null,
  t: Tr,
): { text: string; state: CapacityState | 'venue' } | null {
  if (!mode) {
    const parts: string[] = []
    if (room.capacity_seated !== null) parts.push(t('seatedUpTo', { n: room.capacity_seated }))
    if (room.capacity_standing !== null) parts.push(parts.length ? t('standingUpToLower', { n: room.capacity_standing }) : t('standingUpTo', { n: room.capacity_standing }))
    return parts.length ? { text: parts.join(' · '), state: 'venue' } : null
  }
  const limit = capacityLimit(room, mode)
  const load = capacityLoad(mode, chairsInRoom, guestTotal)
  const st = capacityStatus(limit, load, overrideLoad)
  if (limit === null) return { text: t('noLimit', { mode: modeLabel(mode, t) }), state: 'unknown' }
  const base = t('base', { mode: modeLabel(mode, t), load, limit, unit: unitLabel(mode, limit, t) })
  return { text: st.state === 'over' ? t('over', { base }) : st.state === 'acknowledged' ? t('acknowledged', { base }) : base, state: st.state }
}
