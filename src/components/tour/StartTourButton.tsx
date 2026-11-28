'use client'

import { START_TOUR_EVENT } from '@/lib/tour/steps'
import { useTranslations } from 'next-intl'

/** Settings → Tutorial. TourGuide (root layout) does the work; this just asks it to start. */
export default function StartTourButton() {
  const t = useTranslations('Settings')
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}
      data-tour="replay-tour"
      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
    >
      {t('startTheTour')}
    </button>
  )
}
