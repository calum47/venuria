import type { ReactNode } from 'react'

/** A form control with its name written above it (clicking the name focuses the control). */
export function Labelled({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-0.5 block text-[11px] text-gray-500">{label}</span>
      {children}
    </label>
  )
}
