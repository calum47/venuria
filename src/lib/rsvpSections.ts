/**
 * The movable blocks of the public RSVP page (the cover, names and welcome note always stay on top):
 * details = the day-by-day programme, schedule = the wedding-day schedule.
 */
export const RSVP_SECTIONS = ['details', 'schedule', 'form', 'area', 'hotels'] as const
export type RsvpSectionKey = (typeof RSVP_SECTIONS)[number]

/**
 * Same rule as the database: a permutation of the five keys. An older four-key order (before the schedule became
 * its own block) keeps its order, with the schedule right after the details. Anything else falls back to the default.
 */
export function normalizeSectionOrder(value: unknown): RsvpSectionKey[] {
  const legacy = ['details', 'form', 'area', 'hotels']
  if (Array.isArray(value) && value.length === legacy.length && legacy.every((k) => value.includes(k))) {
    return (value as string[]).flatMap((k) => (k === 'details' ? ['details', 'schedule'] : [k])) as RsvpSectionKey[]
  }
  if (Array.isArray(value) && value.length === RSVP_SECTIONS.length && RSVP_SECTIONS.every((k) => value.includes(k))) {
    return value as RsvpSectionKey[]
  }
  return [...RSVP_SECTIONS]
}

/** Moves one block a step up (-1) or down (+1). Returns the same order at the ends. */
export function moveSection(order: RsvpSectionKey[], key: RsvpSectionKey, dir: -1 | 1): RsvpSectionKey[] {
  const i = order.indexOf(key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return order
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
