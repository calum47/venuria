import { createClient } from '@supabase/supabase-js'

/**
 * ⚠️ Service-role client — bypasses RLS entirely.
 *
 * Only ever import this inside app/api/**\/route.ts files (server-only).
 * Never import it in a 'use client' component or anything that could end
 * up in a browser bundle — that would hand out full database access to
 * anyone who opens devtools.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
