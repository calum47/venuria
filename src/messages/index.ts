import en from './en.json'
import es from './es.json'
import type { Locale } from '@/i18n/config'

export type Messages = typeof en

/** es.json must have exactly the keys of en.json: scripts/check-messages.mjs enforces it. */
const ALL: Record<Locale, Messages> = { en, es: es as Messages }

export function getMessages(locale: Locale): Messages {
  return ALL[locale]
}
