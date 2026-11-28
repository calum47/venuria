import { supabase } from '@/lib/supabase/client'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, type Locale } from '@/i18n/config'

/** The language cookie's current value in this browser, or null if the visitor never chose one. */
export function readLanguageCookie(): Locale | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
  const v = m?.slice(LOCALE_COOKIE.length + 1)
  return isLocale(v) ? v : null
}

export function writeLanguageCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
}

/** Saves the language on the signed-in user's account. Never throws: the app must work even if this fails
 *  (not signed in, offline, or migration 046 not applied yet). */
export async function saveLanguageToAccount(locale: Locale, userId?: string): Promise<void> {
  try {
    const id = userId ?? (await supabase.auth.getUser()).data.user?.id
    if (!id) return
    await supabase.from('user_preferences').upsert({ user_id: id, language: locale, updated_at: new Date().toISOString() })
  } catch {
    /* ignore */
  }
}

/** The language saved on the account, or null if none (or unreadable). */
export async function loadLanguageFromAccount(userId: string): Promise<Locale | null> {
  try {
    const { data } = await supabase.from('user_preferences').select('language').eq('user_id', userId).maybeSingle()
    const v = (data as { language?: string | null } | null)?.language
    return isLocale(v) ? v : null
  } catch {
    return null
  }
}

/**
 * Called right after a successful sign-in. A language the visitor picked on this device (cookie) wins and is
 * saved to the account; with no cookie, the account's saved language is applied. Returns true if the cookie
 * changed (so the caller should refresh the page).
 */
export async function reconcileLanguageAtSignIn(userId: string): Promise<boolean> {
  const chosen = readLanguageCookie()
  if (chosen) {
    await saveLanguageToAccount(chosen, userId)
    return false
  }
  const saved = await loadLanguageFromAccount(userId)
  if (saved) {
    writeLanguageCookie(saved)
    return true
  }
  return false
}
