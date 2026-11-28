'use client'

import { useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { resolveUserRole } from '@/lib/supabase/role'
import { REMEMBER_COOKIE, REMEMBER_COOKIE_MAX_AGE } from '@/lib/supabase/rememberMe'
import { Rings } from '@/components/brand/Rings'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { reconcileLanguageAtSignIn } from '@/lib/languageSync'

export function LoginForm() {
  const t = useTranslations('Login')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    // Set the marker BEFORE signing in: the auth cookies written by
    // signInWithPassword read it to decide persistent vs session-only.
    document.cookie = rememberMe
      ? `${REMEMBER_COOKIE}=1; Path=/; Max-Age=${REMEMBER_COOKIE_MAX_AGE}; SameSite=Lax`
      : `${REMEMBER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !data.user) {
      setError(t('errorBadCredentials'))
      setIsLoading(false)
      return
    }

    const { role, redirectPath } = await resolveUserRole(supabase, data.user.id)

    if (!role) {
      setError(t('errorNoProfile'))
      await supabase.auth.signOut()
      setIsLoading(false)
      return
    }

    // A language picked on this screen is saved to the account; otherwise the account's language is applied.
    await reconcileLanguageAtSignIn(data.user.id)
    router.push(searchParams.get('redirectTo') ?? redirectPath)
    router.refresh()
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-brand-50 via-gray-50 to-gray-50 px-4 py-10">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 bg-white p-8 rounded-2xl shadow-md border border-brand-100"
      >
        <div className="text-center pb-2">
          <Rings className="mx-auto h-6 w-9 text-brand-500" />
          <h1 className="mt-3 font-serif text-3xl font-semibold text-gray-900">Venuria</h1>
          <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('accountsNote')}</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {searchParams.get('error') === 'unauthorized' && !error && (
          <p className="text-sm text-amber-600">{t('unauthorized')}</p>
        )}
        {searchParams.get('joined') === '1' && !error && (
          <p className="text-sm text-green-600">{t('joined')}</p>
        )}

        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('email')}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('password')}</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded-lg border-gray-300"
          />
          {t('rememberMe')}
          <span className="text-xs text-gray-400 ml-auto">{rememberMe ? t('staysSignedIn') : t('signsOutOnClose')}</span>
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? t('signingIn') : t('signIn')}
        </button>
      </form>
    </main>
  )
}
