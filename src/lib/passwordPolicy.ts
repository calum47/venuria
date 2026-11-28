/**
 * Password rules for every login in Venuria: at least 8 characters, with at least one upper-case
 * letter, one number and one special character.
 *
 * The special-character set is the one Supabase Auth itself uses for its "required characters" setting
 * (!@#$%^&*()_+-=[]{};':"|<>?,./`~ and backslash), so these checks and a server-side Supabase rule can
 * never disagree about what counts as special.
 *
 * Safe to import from both client and server code. The checks here give friendly messages; the real
 * guarantee for direct API calls is Supabase Auth's own password-requirements setting (dashboard).
 */
import type { Tr } from '@/i18n/types'

export const PASSWORD_MIN_LENGTH = 8

const SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/

/**
 * Returns a message describing what is missing, or null when the password is acceptable.
 * `t` is the translator for the "Password" messages (the hint text is t('hint')).
 */
export function passwordProblem(password: string, t: Tr): string | null {
  const missing: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) missing.push(t('minLength', { n: PASSWORD_MIN_LENGTH }))
  if (!/\p{Lu}/u.test(password)) missing.push(t('upper'))
  if (!/\d/.test(password)) missing.push(t('digit'))
  if (!SPECIAL.test(password)) missing.push(t('special'))
  if (missing.length === 0) return null
  return t('problem', { list: missing.join(', ') })
}
