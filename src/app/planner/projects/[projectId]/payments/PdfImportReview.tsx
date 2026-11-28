'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { DbDocumentKind } from '@/types/db'
import { PROJECT_DOC_KINDS, formatBytes } from '@/lib/payments'
import {
  EMPTY_DRAFT,
  currencyMismatch,
  draftFromExtracted,
  validateDraft,
  type DraftField,
  type FromPdf,
  type PaymentDraft,
} from '@/lib/pdfPayments'
import type { PaymentInput } from '@/lib/supabase/paymentQueries'
import { btn, btnPrimary, input } from './documentUi'
import { PaymentFields } from './PaymentFields'
import { fileLabel, type StagedPdf } from './pdfStaging'

type Row = {
  key: number
  include: boolean
  draft: PaymentDraft
  from: FromPdf
  dueText: string | null
  dueCalc: string | null
  notFound: ReadonlySet<DraftField>
}

const REQUIRED: DraftField[] = ['vendor', 'label', 'amount', 'dueDate']

/**
 * "Add payment from PDF": shows what was read from the PDF as editable, pre-filled payments. Nothing
 * is saved until the person presses Save; Cancel discards the staged PDF (done by the parent).
 */
export default function PdfImportReview({
  staged,
  currency,
  eventDate,
  busy,
  onSave,
  onCancel,
}: {
  staged: StagedPdf
  currency: string
  /** The project's event date; relative due dates in the PDF ("1 month before the event") are worked out from it. */
  eventDate: string | null
  busy: boolean
  onSave: (payments: PaymentInput[], pdf: { kind: DbDocumentKind; label: string }) => void
  onCancel: () => void
}) {
  const t = useTranslations('Pay')
  const tDates = useTranslations('Dates')
  const locale = useLocale() as Locale
  const initial = useMemo<Row[]>(() => {
    const found = staged.result?.payments ?? []
    if (found.length === 0) return [{ key: 0, include: true, draft: EMPTY_DRAFT, from: {}, dueText: null, dueCalc: null, notFound: new Set(REQUIRED) }]
    return found.map((p, i) => {
      const { draft, from, dueCalc } = draftFromExtracted(p, eventDate, { t, tDates, locale })
      return { key: i, include: true, draft, from, dueText: p.dueText, dueCalc, notFound: new Set(REQUIRED.filter((f) => draft[f] === '')) }
    })
  }, [staged, eventDate, t, tDates, locale])

  const [rows, setRows] = useState<Row[]>(initial)
  const [kind, setKind] = useState<DbDocumentKind>('invoice')
  const [label, setLabel] = useState(fileLabel(staged.fileName))
  const [formError, setFormError] = useState<string | null>(null)

  const included = rows.filter((r) => r.include)
  const foundCount = staged.result?.payments.length ?? 0

  const update = (key: number, fn: (r: Row) => Row) => setRows((cur) => cur.map((r) => (r.key === key ? fn(r) : r)))

  const edit = (key: number, field: DraftField, v: string) =>
    update(key, (r) => {
      const { [field]: _removed, ...from } = r.from
      void _removed
      return { ...r, draft: { ...r.draft, [field]: v }, from }
    })

  const addRow = () =>
    setRows((cur) => [
      ...cur,
      { key: Math.max(-1, ...cur.map((r) => r.key)) + 1, include: true, draft: EMPTY_DRAFT, from: {}, dueText: null, dueCalc: null, notFound: new Set<DraftField>() },
    ])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (included.length === 0) return setFormError(t('tickOne'))
    const inputs: PaymentInput[] = []
    for (const r of rows) {
      if (!r.include) continue
      const v = validateDraft(r.draft, t)
      if ('error' in v) return setFormError(t('paymentRowError', { n: rows.indexOf(r) + 1, error: v.error }))
      inputs.push(v.input)
    }
    setFormError(null)
    onSave(inputs, { kind, label: label.trim() || fileLabel(staged.fileName) })
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {t('reviewBefore')} <span className="font-normal text-gray-500">— {staged.fileName} · {formatBytes(staged.size)}</span>
        </p>
        {staged.readError ? (
          <p className="mt-1 text-xs text-amber-700">{t('couldNotReadReview', { error: staged.readError })}</p>
        ) : foundCount === 0 ? (
          <p className="mt-1 text-xs text-amber-700">{t('noneFoundReview')}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-600">
            {t('foundPayments', { count: foundCount })}
          </p>
        )}
        {staged.result && currencyMismatch(staged.result.currency, currency) && (
          <p className="mt-1 text-xs text-amber-700">{t('currencyMismatchReview', { pdf: staged.result.currency ?? '', project: currency })}</p>
        )}
      </div>

      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className={`rounded-lg border bg-white p-3 ${r.include ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
            <label className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-700">
              <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, (x) => ({ ...x, include: e.target.checked }))} />
              {t('paymentN', { n: i + 1 })}{r.include ? '' : t('willNotBeSaved')}
            </label>
            <PaymentFields value={r.draft} onChange={(f, v) => edit(r.key, f, v)} from={r.from} notFound={r.notFound} dueText={r.dueText} dueCalc={r.dueCalc} />
          </li>
        ))}
      </ul>
      <button type="button" onClick={addRow} className="text-xs text-gray-500 hover:text-gray-900">{t('addAnotherPayment')}</button>

      <div className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600">
        <div className="flex flex-wrap items-center gap-2">
          <span>{t('keepPdfAs')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as DbDocumentKind)} aria-label={t('pdfType')} className={input}>
            {[...PROJECT_DOC_KINDS, 'receipt' as const].map((k) => (
              <option key={k} value={k}>{t(`docKind_${k}`)}</option>
            ))}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label={t('pdfName')} placeholder={t('pdfName')} maxLength={150} className={`${input} min-w-48 flex-1`} />
        </div>
        <p className="text-gray-500">
          {included.length > 1
            ? t('pdfAttachedEach', { count: included.length })
            : t('pdfAttachedOne')}
        </p>
      </div>

      {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? t('saving') : included.length > 1 ? t('saveNPayments', { count: included.length }) : t('savePayment')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={btn + ' !py-1.5 !text-sm'}>{t('cancel')}</button>
      </div>
    </form>
  )
}
