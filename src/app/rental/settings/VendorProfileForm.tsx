'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveVendorProfile } from './actions'

type Initial = { contactName: string; phone: string; email: string; instagram: string }

export default function VendorProfileForm({ initial }: { initial: Initial }) {
  const t = useTranslations('VendorSettings')
  const tc = useTranslations('Common')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900'

  const submit = (fd: FormData) => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await saveVendorProfile(fd)
      if (r.error) setError(r.error)
      else setSaved(true)
    })
  }

  return (
    <form action={submit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">{t('saved')}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-gray-500">
          {t('contactName')}
          <input name="contactName" defaultValue={initial.contactName} maxLength={120} className={field} />
        </label>
        <label className="space-y-1 text-xs text-gray-500">
          {t('phone')}
          <input name="phone" defaultValue={initial.phone} maxLength={40} inputMode="tel" className={field} />
        </label>
        <label className="space-y-1 text-xs text-gray-500">
          {t('email')}
          <input name="email" type="email" defaultValue={initial.email} maxLength={120} className={field} />
        </label>
        <label className="space-y-1 text-xs text-gray-500">
          {t('instagram')}
          <input name="instagram" defaultValue={initial.instagram} maxLength={60} placeholder="handle" className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-40">
        {pending ? tc('saving') : t('save')}
      </button>
    </form>
  )
}
