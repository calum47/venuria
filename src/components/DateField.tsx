'use client'

import { useState } from 'react'
import { displayToIso, isoToDisplay } from '@/lib/dateInput'

/**
 * A date box that always reads and writes dd/mm/yyyy, whatever the device's language or region
 * (a native <input type="date"> shows the device's own format and cannot be forced).
 * The value going in and out is an ISO date ("2027-05-21"), or '' while empty / incomplete / not a real date.
 * The calendar icon opens the device's own date picker as a shortcut.
 */
export function DateField({
  id,
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  id?: string
  value: string
  onChange: (iso: string) => void
  className?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const [seen, setSeen] = useState(value)
  // The value changed from outside (PDF fill, calculated due date, opening the form): show it.
  // Skipped when it only echoes what was just typed, so half-typed text is never overwritten.
  if (value !== seen) {
    setSeen(value)
    if (value !== displayToIso(text)) setText(isoToDisplay(value))
  }
  const invalid = text.trim() !== '' && displayToIso(text) === ''

  return (
    <div className="relative">
      <input
        id={id}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const iso = displayToIso(e.target.value)
          setSeen(iso)
          onChange(iso)
        }}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={`${className} w-full pr-9${invalid ? ' !border-red-400' : ''}`}
      />
      {/* Transparent native date input laid over the icon: tapping it opens the device's picker (works on iOS too). */}
      <span className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-gray-400" aria-hidden>
        📅
        <input
          type="date"
          tabIndex={-1}
          value={value}
          onChange={(e) => {
            setText(isoToDisplay(e.target.value))
            setSeen(e.target.value)
            onChange(e.target.value)
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      {invalid && <span className="sr-only">Use the format dd/mm/yyyy</span>}
    </div>
  )
}
