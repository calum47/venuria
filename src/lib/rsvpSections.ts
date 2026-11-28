/** The four movable blocks of the public RSVP page (the cover, names and welcome note always stay on top). */
export const RSVP_SECTIONS = ['details', 'form', 'area', 'hotels'] as const
export type RsvpSectionKey = (typeof RSVP_SECTIONS)[number]

/** Same rule as the database: a permutation of the four keys. Anything else falls back to the default order. */
export function normalizeSectionOrder(value: unknown): RsvpSectionKey[] {
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
