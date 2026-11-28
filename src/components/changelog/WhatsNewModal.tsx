'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { formatDate } from '@/lib/projectDates'
import { supabase } from '@/lib/supabase/client'
import { resolveUserRole } from '@/lib/supabase/role'
import { CHANGELOG, localizedEntry, unseenEntries, whatsNewAllowedOn, type ChangelogEntry } from '@/lib/changelog'

const SEEN_KEY = 'last_seen_changelog_id'

/**
 * Mounted once in the root layout. On load, if there's a session and there
 * are release-notes entries this user hasn't acknowledged, shows them.
 *
 * The "seen" marker is the id of the newest entry the user dismissed, stored
 * in Supabase auth user_metadata — per user, follows them across devices, no
 * table needed, and only the user themselves can write it.
 *
 * Cheap in the common case: if the stored marker already equals the newest
 * entry's id, we bail before resolving the role (which costs up to five
 * lookups). Role is only resolved when something might be unseen.
 */
export default function WhatsNewModal() {
  const t = useTranslations('WhatsNew')
  const locale = useLocale() as Locale
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const allowed = whatsNewAllowedOn(usePathname())

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!allowed || CHANGELOG.length === 0) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const lastSeenId = (user.user_metadata?.[SEEN_KEY] as string | undefined) ?? null
      if (lastSeenId === CHANGELOG[0].id) return // already caught up — no role lookup needed

      const { role } = await resolveUserRole(supabase, user.id)
      const unseen = unseenEntries(role, lastSeenId)
      if (!cancelled && unseen.length > 0) setEntries(unseen)
    }

    check().catch((err) => console.error('WhatsNewModal check failed:', err))

    // This component lives in the root layout and is never unmounted, so drop any open notes
    // the moment the user signs out instead of leaving them on screen over the login page.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setEntries([])
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [allowed])

  if (!allowed || entries.length === 0) return null

  const dismiss = async () => {
    setIsSaving(true)
    try {
      // updateUser merges into existing user_metadata server-side; other keys are kept.
      const { error } = await supabase.auth.updateUser({ data: { [SEEN_KEY]: entries[0].id } })
      if (error) console.error('Failed to store changelog seen marker:', error)
    } finally {
      setIsSaving(false)
      setEntries([])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-xl shadow-xl w-[30rem] max-h-[85vh] flex flex-col">
        <div className="px-6 pt-6 pb-3">
          <h3 className="font-semibold text-gray-900">{t('title')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t('subtitle')}</p>
        </div>

        <div className="px-6 overflow-y-auto space-y-5 pb-4">
          {entries.map((entry) => {
            const text = localizedEntry(entry, locale)
            return (
              <section key={entry.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-sm font-medium text-gray-900">{text.title}</h4>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(entry.date, locale)}</span>
                </div>
                <ul className="mt-2 space-y-1.5 text-sm text-gray-600 list-disc pl-5">
                  {text.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        <div className="px-6 pb-6 pt-2">
          <button
            onClick={dismiss}
            disabled={isSaving}
            className="w-full py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {t('gotIt')}
          </button>
        </div>
      </div>
    </div>
  )
}
