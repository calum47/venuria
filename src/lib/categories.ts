import type { Tr } from '@/i18n/types'

const KNOWN = new Set(['tables', 'chairs', 'decorations', 'plates', 'cutlery', 'glassware', 'candles', 'flowers'])

/** Display name of a catalog category. `t` = translator for "Categories". Unknown categories show as stored. */
export function categoryLabel(t: Tr, category: string): string {
  return KNOWN.has(category) ? t(category) : category
}
