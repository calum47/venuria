'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { projectPageOf } from '@/lib/lastPage'

/**
 * Remembers the last project page (hub, editor, guests, payments, …) the signed-in user opened, so the
 * nav's "Last project" can return there. Mounted once in the root layout; writes one row per user.
 * Waits a moment before writing so quickly clicking through pages doesn't write each one.
 */
export default function LastPageTracker() {
  const pathname = usePathname()
  const lastWritten = useRef<string | null>(null)

  useEffect(() => {
    const page = projectPageOf(pathname)
    if (!page || page.path === lastWritten.current) return
    const timer = window.setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { error } = await supabase
        .from('user_last_page')
        .upsert({ user_id: session.user.id, project_id: page.projectId, path: page.path, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) console.error('Failed to store last page:', error)
      else lastWritten.current = page.path
    }, 800)
    return () => window.clearTimeout(timer)
  }, [pathname])

  return null
}
