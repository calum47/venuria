'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createVenue } from './actions'
import { useTranslations } from 'next-intl'

export function CreateVenueForm() {
  const t = useTranslations('Admin')
  const tc = useTranslations('Common')
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setError(null)
    setSuccess(null)
    setIsLoading(true)

    const result = await createVenue(formData)
    setIsLoading(false)

    if (result?.error) {
      setError(result.error)
      return
    }

    setSuccess(t('venueCreatedAssignItA'))
    formRef.current?.reset()
    router.refresh()
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">{t('createVenue')}</h2>
      <p className="text-xs text-gray-400">
        {t('thePropertyItselfNoLogin')}
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('venueName')}</label>
        <input
          name="name"
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('maxCapacityPersons')}</label>
        <input
          name="maxCapacityPersons"
          type="number"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {isLoading ? tc('creating') : t('createVenue')}
      </button>
    </form>
  )
}
