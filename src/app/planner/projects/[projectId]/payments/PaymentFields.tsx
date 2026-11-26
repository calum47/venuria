'use client'

import type { DraftField, FromPdf, PaymentDraft } from '@/lib/pdfPayments'
import { useId } from 'react'
import { DateField } from '@/components/DateField'
import { input } from './documentUi'

const FIELDS: { field: DraftField; label: string; placeholder: string; extra?: Record<string, string> }[] = [
  { field: 'vendor', label: 'Vendor / supplier', placeholder: '' },
  { field: 'label', label: 'For', placeholder: 'Deposit, First payment, etc.' },
  { field: 'amount', label: 'Amount', placeholder: '', extra: { inputMode: 'decimal' } },
  { field: 'dueDate', label: 'Due date', placeholder: 'dd/mm/yyyy' },
]

/**
 * The four payment fields + notes, controlled. Fields the PDF filled are tinted blue and tagged
 * "from PDF"; fields it could not find are tinted amber so the gap is obvious while reviewing.
 * `from` entries are dropped by the parent as soon as the person edits that field.
 */
export function PaymentFields({
  value,
  onChange,
  from,
  notFound,
  dueText,
  dueCalc,
}: {
  value: PaymentDraft
  onChange: (field: DraftField, v: string) => void
  from?: FromPdf
  notFound?: ReadonlySet<DraftField>
  /** The due date as written in the PDF when it was relative ("30 days before the event"). */
  dueText?: string | null
  /** How the due date was worked out from a relative wording + the event date (or why it could not be). */
  dueCalc?: string | null
}) {
  const uid = useId()
  const hints = [...new Set(Object.values(from ?? {}))]
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-4">
        {FIELDS.map(({ field, label, placeholder, extra }) => {
          const fromPdf = from?.[field] !== undefined
          const missing = !fromPdf && notFound?.has(field) && value[field] === ''
          const tint = fromPdf ? ' !border-blue-300 bg-blue-50' : missing ? ' !border-amber-300 bg-amber-50' : ''
          return (
            <div key={field} className="min-w-0">
              <label htmlFor={`${uid}-${field}`} className="mb-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                {label}
                {fromPdf && <span className="rounded-lg bg-blue-100 px-1 text-blue-700">from PDF</span>}
                {missing && <span className="rounded-lg bg-amber-100 px-1 text-amber-700">not found — enter it</span>}
              </label>
              {field === 'dueDate' ? (
                <DateField id={`${uid}-${field}`} value={value.dueDate} onChange={(iso) => onChange('dueDate', iso)} className={`${input}${tint}`} />
              ) : (
                <input
                  id={`${uid}-${field}`}
                  value={value[field]}
                  onChange={(e) => onChange(field, e.target.value)}
                  placeholder={placeholder}
                  maxLength={field === 'vendor' || field === 'label' ? 120 : undefined}
                  list={field === 'vendor' ? 'team-vendor-names' : undefined}
                  className={`${input} w-full${tint}`}
                  {...extra}
                />
              )}
            </div>
          )
        })}
      </div>
      <div>
        <label htmlFor={`${uid}-notes`} className="mb-0.5 block text-[11px] text-gray-500">Notes (optional)</label>
        <input
          id={`${uid}-notes`}
          value={value.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          placeholder="e.g. Bank transfer, send receipt to the planner"
          className={`${input} w-full`}
          maxLength={500}
        />
      </div>
      {dueCalc && <p className="text-xs text-blue-700">{dueCalc}</p>}
      {dueText && !dueCalc && !value.dueDate && (
        <p className="text-xs text-amber-700">The PDF gives the due date as “{dueText}” — enter the actual date.</p>
      )}
      {hints.length > 0 && (
        <p className="text-xs text-gray-500">
          Found in the PDF: {hints.map((h) => `“${h}”`).join(' · ')}
        </p>
      )}
    </div>
  )
}

