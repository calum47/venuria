'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

/**
 * Compact version of the planner nav for the editor toolbar, which has no
 * room for a full bar. Before this, the editor had no way back to the
 * dashboard except the browser's back button.
 */
export default function EditorNavMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const item = 'block px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-gray-800 hover:text-gray-600 flex items-center gap-1"
        title="Menu"
      >
        ☰ Venuria
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-50">
          <Link href="/planner" className={item} onClick={() => setOpen(false)}>My projects</Link>
          <Link href="/planner/stock" className={item} onClick={() => setOpen(false)}>My stock</Link>
          <Link href="/planner/team" className={item} onClick={() => setOpen(false)}>My team</Link>
          <Link href="/planner/settings" className={item} onClick={() => setOpen(false)}>Settings</Link>
          <div className="my-1 border-t border-gray-100" />
          <button onClick={signOut} className={`${item} w-full text-left text-gray-500`}>Sign out</button>
        </div>
      )}
    </div>
  )
}
