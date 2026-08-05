import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Uses @supabase/ssr's browser client instead of a plain supabase-js client
// so the session is stored in cookies (not just localStorage) — this is what
// lets middleware.ts and server components see the same logged-in session.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
