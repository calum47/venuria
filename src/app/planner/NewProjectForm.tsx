'use client'

import { useState, useTransition } from 'react'
import { createProject } from './actions'
import { suggestDueBy, isIsoDate, DUE_BY_LEAD_DAYS } from '@/lib/projectDates'
import { useTranslations } from 'next-intl'

type Venue = { id: string; name: string }

export default function NewProjectForm({ venues }: { venues: Venue[] }) {
  const t = useTranslations('Planner')
  const tc = useTranslations('Common')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState('')
  const [dueBy, setDueBy] = useState('')
  const [dueByTouched, setDueByTouched] = useState(false)

  const handleSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await createProject(formData)
      // createProject redirects on success, so reaching here means it failed
      // (redirect() throws internally and never returns a value on the happy path).
      if (result?.error) setError(result.error)
    })
  }

  // Due By follows the event date (−14 days) until the planner edits it by hand.
  const handleEventDateChange = (value: string) => {
    setEventDate(value)
    if (!dueByTouched) setDueBy(isIsoDate(value) ? suggestDueBy(value) : '')
  }

  if (venues.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        {t('noVenuesYetAskAn')}
      </p>
    )
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">{t('coupleSNames')}</label>
        <input
          name="coupleNames"
          required
          maxLength={80}
          placeholder={t('annaTom')}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">{tc('venue')}</label>
        <select name="venueId" required className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900">
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">{tc('eventDate')}</label>
        <input
          type="date"
          name="eventDate"
          required
          value={eventDate}
          onChange={(e) => handleEventDateChange(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500" title={t('defaultsToDaysDaysBefore', { days: DUE_BY_LEAD_DAYS })}>
          {tc('dueBy')}
        </label>
        <input
          type="date"
          name="dueBy"
          value={dueBy}
          onChange={(e) => { setDueByTouched(true); setDueBy(e.target.value) }}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
      >
        {isPending ? tc('creating') : t('newProject')}
      </button>
      {error && <p className="text-sm text-red-600 w-full">{error}</p>}
    </form>
  )
}
