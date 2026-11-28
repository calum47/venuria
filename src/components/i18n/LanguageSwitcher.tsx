'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LOCALES, LOCALE_NAMES, isLocale } from '@/i18n/config'
import { saveLanguageToAccount, writeLanguageCookie } from '@/lib/languageSync'

/** English / Español drop-down. Sets the cookie, saves to the account when signed in, then re-renders in the new language. */
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale()
  const t = useTranslations('Language')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const change = (value: string) => {
    if (!isLocale(value) || value === locale) return
    writeLanguageCookie(value)
    startTransition(async () => {
      await saveLanguageToAccount(value)
      router.refresh()
    })
  }

  return (
    <label className={`inline-flex items-center gap-1.5 text-xs text-gray-500 ${className}`}>
      <span className="sr-only">{t('label')}</span>
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:opacity-60"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
