'use client'

import { START_TOUR_EVENT } from '@/lib/tour/steps'

/** Settings → Tutorial. TourGuide (root layout) does the work; this just asks it to start. */
export default function StartTourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}
      data-tour="replay-tour"
      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
    >
      Start the tour
    </button>
  )
}
