/**
 * Translations of the planner's own text on the public RSVP page (migration 055). Pure helpers.
 *
 * Stored per row as {h: {field: hash}, es: {field: text}, en: {...}, fr: {...}}. A translation is used only while
 * `h[field]` equals the hash of the field's current text, so editing the text can never leave an old translation on show.
 */
export type TranslationLang = 'es' | 'en' | 'fr'
export const TRANSLATION_LANGS: TranslationLang[] = ['es', 'en', 'fr']

export type Translations = { h?: Record<string, string> } & Partial<Record<TranslationLang, Record<string, string>>>

/** Which columns of which tables are translated. */
export const TRANSLATED_FIELDS = {
  project_rsvp: ['welcome_message', 'schedule', 'schedule_title', 'area_text'],
  project_rsvp_photos: ['caption'],
  project_rsvp_hotels: ['description', 'booking_note'],
  project_rsvp_events: ['title', 'location', 'description', 'tag'],
} as const

/** FNV-1a, 32 bit. Only used to notice that a text changed, not for security. */
export function textHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** The text in the guest's language, or the planner's own text when there is no up-to-date translation. */
export function pickText(tr: unknown, lang: TranslationLang, field: string, text: string | null): string | null {
  const t = tr as Translations | null | undefined
  if (!text?.trim() || !t) return text
  const hit = t[lang]?.[field]
  return typeof hit === 'string' && hit.trim() && t.h?.[field] === textHash(text.trim()) ? hit : text
}

/** True when this field has text but no translation matching it. */
export function needsTranslation(tr: unknown, field: string, text: string | null | undefined): boolean {
  const v = text?.trim()
  if (!v) return false
  const t = tr as Translations | null | undefined
  return !t?.h || t.h[field] !== textHash(v) || TRANSLATION_LANGS.some((l) => typeof t[l]?.[field] !== 'string')
}

/** Adds the new translations for some fields to what is stored, dropping translations of fields whose text was cleared. */
export function mergeTranslations(
  current: unknown,
  texts: Record<string, string | null | undefined>,
  fresh: Record<string, Record<TranslationLang, string>>,
): Translations {
  const old = (current ?? {}) as Translations
  const out: Translations = { h: {}, es: {}, en: {}, fr: {} }
  for (const [field, raw] of Object.entries(texts)) {
    const text = raw?.trim()
    if (!text) continue
    const f = fresh[field]
    if (f) {
      out.h![field] = textHash(text)
      for (const l of TRANSLATION_LANGS) out[l]![field] = f[l]
    } else if (old.h?.[field] === textHash(text)) {
      out.h![field] = old.h[field]
      for (const l of TRANSLATION_LANGS) if (typeof old[l]?.[field] === 'string') out[l]![field] = old[l]![field]
    }
  }
  return out
}
