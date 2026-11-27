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
export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_HINT = 'At least 8 characters, with one upper-case letter, one number and one special character (for example ! @ # $ % &).'

const SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/

/** Returns a message describing what is missing, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  const missing: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) missing.push(`be at least ${PASSWORD_MIN_LENGTH} characters long`)
  if (!/\p{Lu}/u.test(password)) missing.push('contain an upper-case letter')
  if (!/\d/.test(password)) missing.push('contain a number')
  if (!SPECIAL.test(password)) missing.push('contain a special character (for example ! @ # $ % &)')
  if (missing.length === 0) return null
  return `Password must ${missing.join(', ')}.`
}
