'use client'

import { useRef, useState } from 'react'
import type { DbDocumentKind, DbProjectPayment } from '@/types/db'
import { DOC_KIND_LABEL, PROJECT_DOC_KINDS, formatBytes } from '@/lib/payments'
import {
  EMPTY_DRAFT,
  currencyMismatch,
  describeExtracted,
  draftFromExtracted,
  validateDraft,
  type DraftField,
  type ExtractedPayment,
  type FromPdf,
  type PaymentDraft,
} from '@/lib/pdfPayments'
import { removeStagedPdf, type PaymentInput } from '@/lib/supabase/paymentQueries'
import { btn, btnPrimary, errMsg, input } from './documentUi'
import { PaymentFields } from './PaymentFields'
import { fileLabel, stagePdf, type StagedPdf } from './pdfStaging'

/** A PDF staged in the bucket that will be attached to the payment when the form is saved. */
export type PendingPdf = { path: string; size: number; label: string; kind: DbDocumentKind }

export default function PaymentForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  fill,
}: {
  initial?: DbProjectPayment
  submitLabel: string
  busy: boolean
  onSubmit: (v: PaymentInput, pdf?: PendingPdf) => void
  onCancel: () => void
  /** Set (edit mode) to offer "Fill from PDF". */
  fill?: { teamId: string; projectId: string; currency: string }
}) {
  const [draft, setDraft] = useState<PaymentDraft>(
    initial
      ? { vendor: initial.vendor_name, label: initial.label, amount: String(initial.amount), dueDate: initial.due_date, notes: initial.notes ?? '' }
      : EMPTY_DRAFT,
  )
  const [from, setFrom] = useState<FromPdf>({})
  const [formError, setFormError] = useState<string | null>(null)

  const [staged, setStaged] = useState<StagedPdf | null>(null)
  const [reading, setReading] = useState(false)
  const [pick, setPick] = useState(0)
  const [dueText, setDueText] = useState<string | null>(null)
  const [pdfKind, setPdfKind] = useState<DbDocumentKind>('invoice')
  const [pdfLabel, setPdfLabel] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const change = (field: DraftField, v: string) => {
    setDraft((d) => ({ ...d, [field]: v }))
    setFrom((f) => {
      if (f[field] === undefined) return f
      const { [field]: _removed, ...rest } = f
      void _removed
      return rest
    })
  }

  /** Copies what the PDF provided into the form; fields the PDF did not provide keep their current value. */
  const apply = (p: ExtractedPayment) => {
    const { draft: d, from: f } = draftFromExtracted(p)
    setDraft((cur) => ({
      ...cur,
      vendor: d.vendor || cur.vendor,
      label: d.label || cur.label,
      amount: d.amount || cur.amount,
      dueDate: d.dueDate || cur.dueDate,
    }))
    setFrom(f)
    setDueText(p.dueText)
  }

  const choosePdf = async (file: File | null) => {
    if (!file || !fill) return
    setFormError(null)
    setReading(true)
    try {
      const next = await stagePdf(file, fill.teamId, fill.projectId)
      if (staged) void removeStagedPdf(staged.path) // replaced
      setStaged(next)
      setPdfLabel(fileLabel(next.fileName))
      setPick(0)
      if (next.result && next.result.payments.length > 0) apply(next.result.payments[0])
    } catch (e) {
      setFormError(errMsg(e))
    } finally {
      setReading(false)
    }
  }

  const cancel = () => {
    if (staged) void removeStagedPdf(staged.path)
    onCancel()
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = validateDraft(draft)
    if ('error' in v) return setFormError(v.error)
    setFormError(null)
    onSubmit(v.input, staged ? { path: staged.path, size: staged.size, label: pdfLabel.trim() || fileLabel(staged.fileName), kind: pdfKind } : undefined)
  }

  const found = staged?.result?.payments ?? []

  return (
    <form onSubmit={submit} className="space-y-2">
      {fill && (
        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              e.target.value = ''
              void choosePdf(f)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={reading || busy} className={btn}>
              {reading ? 'Reading PDF…' : staged ? 'Use a different PDF' : 'Fill from PDF'}
            </button>
            {staged && !reading && (
              <span className="text-xs text-gray-500">{staged.fileName} · {formatBytes(staged.size)}</span>
            )}
          </div>

          {staged && !reading && (
            <div className="space-y-1.5 rounded border border-gray-200 bg-white p-2 text-xs text-gray-600">
              {staged.readError && (
                <p className="text-amber-700">Could not read the PDF: {staged.readError} You can still fill the form by hand; the PDF will be attached when you save.</p>
              )}
              {staged.result && found.length === 0 && (
                <p className="text-amber-700">No payment details found in this PDF. Fill the form by hand; the PDF will be attached when you save.</p>
              )}
              {staged.result && currencyMismatch(staged.result.currency, fill.currency) && (
                <p className="text-amber-700">
                  The PDF seems to be in {staged.result.currency}, but this project uses {fill.currency}. Check the amount.
                </p>
              )}
              {found.length > 1 && (
                <label className="flex flex-wrap items-center gap-2">
                  The PDF lists {found.length} payments. Fill from:
                  <select
                    value={pick}
                    onChange={(e) => {
                      const i = Number(e.target.value)
                      setPick(i)
                      apply(found[i])
                    }}
                    className={input}
                  >
                    {found.map((p, i) => (
                      <option key={i} value={i}>{describeExtracted(p, i)}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span>Attach the PDF as</span>
                <select value={pdfKind} onChange={(e) => setPdfKind(e.target.value as DbDocumentKind)} aria-label="PDF type" className={input}>
                  {[...PROJECT_DOC_KINDS, 'receipt' as const].map((k) => (
                    <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>
                  ))}
                </select>
                <input value={pdfLabel} onChange={(e) => setPdfLabel(e.target.value)} aria-label="PDF name" placeholder="PDF name" maxLength={150} className={`${input} min-w-48 flex-1`} />
              </div>
            </div>
          )}
        </div>
      )}

      <PaymentFields value={draft} onChange={change} from={from} showLabels={staged !== null} dueText={dueText} />

      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || reading} className={btnPrimary}>{busy ? 'Saving…' : submitLabel}</button>
        <button type="button" onClick={cancel} disabled={busy} className={btn + ' !py-1.5 !text-sm'}>Cancel</button>
      </div>
    </form>
  )
}
