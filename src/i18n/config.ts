/** Languages the whole app (not the guest RSVP page, which has its own per-link language) can be shown in. */
export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' }

/** Cookie holding the chosen language. Readable by the browser so the switcher can set it before sign-in. */
export const LOCALE_COOKIE = 'venuria-lang'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

/** BCP-47 tag used for dates, numbers and currency. */
export const INTL_TAG: Record<Locale, string> = { en: 'en-GB', es: 'es-ES' }
