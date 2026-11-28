'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { loadLanguageFromAccount, readLanguageCookie, writeLanguageCookie } from '@/lib/languageSync'

/**
 * On a device where the language cookie is missing (new browser, cleared cookies) but the user is signed in,
 * applies the language saved on their account once. Renders nothing; does nothing if a cookie exists.
 */
export default function LanguageRestore() {
  const router = useRouter()
  useEffect(() => {
    if (readLanguageCookie()) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user || cancelled) return
        const saved = await loadLanguageFromAccount(data.user.id)
        if (saved && !cancelled && !readLanguageCookie()) {
          writeLanguageCookie(saved)
          router.refresh()
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])
  return null
}
