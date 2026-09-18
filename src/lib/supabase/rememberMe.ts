import type { CookieOptions } from '@supabase/ssr'

/**
 * "Remember me" (Phase 22a).
 *
 * Supabase stores the session in cookies. By default those cookies carry a
 * long max-age, so a login survives closing the browser. With "remember me"
 * unchecked we want the opposite: session cookies, gone when the browser
 * closes.
 *
 * Mechanism: the login form sets a small persistent marker cookie when the
 * box is checked (and clears it when not). Every place that writes auth
 * cookies — browser client, server client, middleware refresh — runs the
 * options through `rememberAwareOptions`, which strips max-age/expires when
 * the marker is absent. Deletions (max-age 0) are always left alone so
 * sign-out still works.
 *
 * The marker is on its own so the server-side refresh in middleware (which
 * re-issues auth cookies on every request) keeps honouring the choice
 * without any per-request state.
 */
export const REMEMBER_COOKIE = 'venuria_remember'
export const REMEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 400 // browsers cap at ~400 days anyway

export function rememberAwareOptions(options: CookieOptions | undefined, remembered: boolean): CookieOptions {
  const opts: CookieOptions = { ...(options ?? {}) }
  if (remembered) return opts
  if (opts.maxAge === 0) return opts // a deletion — keep it a deletion
  delete opts.maxAge
  delete opts.expires
  return opts
}
