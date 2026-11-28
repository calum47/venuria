'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveVendorProfile } from './actions'

type Handle = { handle: string; main: boolean }
type Initial = { contactName: string; phone: string; email: string; instagrams: Handle[] }

export default function VendorProfileForm({ initial }: { initial: Initial }) {
  const t = useTranslations('VendorSettings')
  const tc = useTranslations('Common')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [handles, setHandles] = useState<Handle[]>(initial.instagrams.length ? initial.instagrams : [{ handle: '', main: true }])
  const setMain = (i: number) => setHandles((hs) => hs.map((h, j) => ({ ...h, main: j === i })))
  const setHandle = (i: number, v: string) => setHandles((hs) => hs.map((h, j) => (j === i ? { ...h, handle: v } : h)))
  const remove = (i: number) =>
    setHandles((hs) => {
      const next = hs.filter((_, j) => j !== i)
      if (next.length > 0 && !next.some((h) => h.main)) next[0] = { ...next[0], main: true }
      return next
    })
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
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs text-gray-500">{t('instagram')}</legend>
        {handles.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm text-gray-400">@</span>
            <input
              value={h.handle}
              onChange={(e) => setHandle(i, e.target.value.replace(/^@+/, ''))}
              maxLength={60}
              aria-label={t('instagram')}
              className={field}
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={h.main} onChange={() => setMain(i)} />
              {t('mainInstagram')}
            </label>
            <button type="button" onClick={() => remove(i)} aria-label={t('removeInstagram')} className="shrink-0 rounded px-2 text-gray-400 hover:text-red-600">×</button>
          </div>
        ))}
        {handles.length < 10 && (
          <button type="button" onClick={() => setHandles((hs) => [...hs, { handle: '', main: hs.length === 0 }])} className="text-sm text-brand-700 hover:underline">
            {t('addInstagram')}
          </button>
        )}
        <p className="text-xs text-gray-400">{t('mainInstagramHelp')}</p>
        <input type="hidden" name="instagrams" value={JSON.stringify(handles)} />
      </fieldset>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-40">
        {pending ? tc('saving') : t('save')}
      </button>
    </form>
  )
}
