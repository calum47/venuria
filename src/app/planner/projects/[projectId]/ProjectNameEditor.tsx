'use client'

import { useState, useTransition } from 'react'
import { updateProjectCoupleNames } from '@/app/planner/actions'
import { useTranslations } from 'next-intl'

/** Small t('editNames') control under the project title on the hub. */
export default function ProjectNameEditor({ projectId, coupleNames }: { projectId: string; coupleNames: string | null }) {
  const t = useTranslations('Hub')
  const tc = useTranslations('Common')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (fd: FormData) => {
    setError(null)
    startTransition(async () => {
      const r = await updateProjectCoupleNames(fd)
      if (r.error) setError(r.error)
      else setOpen(false)
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-gray-700">
        {coupleNames ? t('editNames') : t('addTheCoupleSNames')}
      </button>
    )
  }

  return (
    <form action={submit} className="mt-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="coupleNames"
        defaultValue={coupleNames ?? ''}
        required
        maxLength={80}
        autoFocus
        placeholder={t('annaTom')}
        aria-label={t('coupleSNames')}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900"
      />
      <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">
        {isPending ? tc('saving') : tc('save')}
      </button>
      <button type="button" onClick={() => { setOpen(false); setError(null) }} className="text-sm text-gray-500 hover:text-gray-800">{tc('cancel')}</button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}
