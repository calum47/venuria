import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for use inside Server Components / route
 * handlers. Reads the session from the request's cookies (set by the
 * browser client + refreshed by middleware).
 *
 * Must be called fresh per-request — don't cache the returned client.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component that can't set cookies directly.
            // Safe to ignore as long as middleware.ts is refreshing sessions.
          }
        },
      },
    },
  )
}
