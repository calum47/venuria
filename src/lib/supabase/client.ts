import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { REMEMBER_COOKIE, rememberAwareOptions } from './rememberMe'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Uses @supabase/ssr's browser client instead of a plain supabase-js client
// so the session is stored in cookies (not just localStorage) — this is what
// lets middleware.ts and server components see the same logged-in session.
//
// Custom cookie handlers (Phase 22a) so "remember me" can decide whether the
// auth cookies are persistent or session-only — see rememberMe.ts. Reads the
// marker on every write, so a change at login takes effect immediately
// without recreating this singleton.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookies: {
    getAll() {
      if (typeof document === 'undefined') return []
      return parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? '' }))
    },
    setAll(cookiesToSet) {
      if (typeof document === 'undefined') return
      const remembered = parseCookieHeader(document.cookie).some((c) => c.name === REMEMBER_COOKIE && c.value === '1')
      for (const { name, value, options } of cookiesToSet) {
        document.cookie = serializeCookieHeader(name, value, rememberAwareOptions(options, remembered))
      }
    },
  },
})
