/**
 * A project is titled by the couple's names. Projects created before that
 * field existed have none, so the venue name stands in for them.
 */
export const MAX_COUPLE_NAMES = 80

export function projectTitle(coupleNames: string | null | undefined, venueName: string): string {
  return coupleNames?.trim() || venueName
}

import type { Tr } from '@/i18n/types'

export type CoupleNamesResult = { ok: true; value: string | null } | { ok: false; error: string }

/** Tidies what was typed (trim, collapse spaces). `required` rejects an empty value. */
export function parseCoupleNames(raw: string, required: boolean, t: Tr): CoupleNamesResult {
  const v = raw.trim().replace(/\s+/g, ' ')
  if (!v) return required ? { ok: false, error: t('required') } : { ok: true, value: null }
  if (v.length > MAX_COUPLE_NAMES) return { ok: false, error: t('tooLong', { max: MAX_COUPLE_NAMES }) }
  return { ok: true, value: v }
}
