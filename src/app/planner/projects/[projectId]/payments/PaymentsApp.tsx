'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DbDocumentKind, DbProjectDocument, DbProjectPayment } from '@/types/db'
import {
  createPayment,
  createPayments,
  deletePayment,
  deleteProjectDocument,
  getDocumentUrl,
  copyPdfObject,
  registerDocument,
  removeStagedPdf,
  setPaymentPaid,
  updatePayment,
  type PaymentInput,
} from '@/lib/supabase/paymentQueries'
import {
  DOC_KIND_LABEL,
  formatBytes,
  formatMoney,
  initialCalendarMonth,
  monthGrid,
  monthLabel,
  paymentStatus,
  paymentTotals,
  shiftMonth,
  sortPayments,
  sumAmounts,
} from '@/lib/payments'
import { formatDate, isIsoDate, todayIso } from '@/lib/projectDates'
import { DateField } from '@/components/DateField'
import DocumentsSection from './DocumentsSection'
import PaymentForm, { type PendingPdf } from './PaymentForm'
import PdfImportReview from './PdfImportReview'
import { stagePdf, type StagedPdf } from './pdfStaging'
import { UploadForm, btn, btnPrimary, errMsg, input } from './documentUi'
import { requestBellRefresh } from '@/lib/notifications'

type View = 'list' | 'calendar'

type Props = {
  projectId: string
  teamId: string
  currency: string
  eventDate: string | null
  initialView: View
  initialPayments: DbProjectPayment[]
  initialDocuments: DbProjectDocument[]
  /** The team's vendor list (team_vendors): suggestions while typing, and the current name of linked vendors. */
  vendors: { id: string; name: string }[]
}

export default function PaymentsApp({ projectId, teamId, currency, eventDate, initialView, initialPayments, initialDocuments, vendors }: Props) {
  const vendorNameById = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors])
  /** A linked vendor shows its current name (it may have been renamed since the payment was saved). */
  const vendorOf = (p: DbProjectPayment) => (p.vendor_id ? vendorNameById.get(p.vendor_id) : undefined) ?? p.vendor_name
  // numeric(12,2) can arrive as a string from some clients — normalise once.
  const [payments, setPayments] = useState<DbProjectPayment[]>(() =>
    initialPayments.map((p) => ({ ...p, amount: Number(p.amount) })),
  )
  // The nav bell lists payments due soon: tell it whenever the payments change here.
  useEffect(() => {
    requestBellRefresh()
  }, [payments])
  const [documents, setDocuments] = useState<DbProjectDocument[]>(initialDocuments)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payDate, setPayDate] = useState(todayIso())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [attachingFor, setAttachingFor] = useState<string | null>(null) // payment id, or 'general'
  const [busy, setBusy] = useState<string | null>(null)
  const [view, setView] = useState<View>(initialView)
  // "Add payment from PDF": null | reading the PDF | reviewing what was read (nothing saved yet)
  const [importing, setImporting] = useState<{ stage: 'reading'; fileName: string } | { stage: 'review'; staged: StagedPdf } | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const sorted = useMemo(() => sortPayments(payments), [payments])
  const totals = useMemo(() => paymentTotals(payments), [payments])
  const docsByPayment = useMemo(() => {
    const m = new Map<string, DbProjectDocument[]>()
    for (const d of documents) if (d.payment_id) m.set(d.payment_id, [...(m.get(d.payment_id) ?? []), d])
    return m
  }, [documents])
  const generalDocs = useMemo(() => documents.filter((d) => !d.payment_id), [documents])
  const money = (n: number) => formatMoney(n, currency)

  /** List view: one group per vendor, vendors A–Z; inside a group unpaid first by due date (sortPayments). */
  const vendorGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; payments: DbProjectPayment[] }>()
    for (const p of sorted) {
      const name = vendorOf(p).trim()
      const key = p.vendor_id ?? `name:${name.toLowerCase()}`
      const g = groups.get(key)
      if (g) g.payments.push(p)
      else groups.set(key, { key, name, payments: [p] })
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, vendorNameById])
  const [openVendors, setOpenVendors] = useState<Set<string>>(() => new Set())
  const allVendorsOpen = vendorGroups.length > 0 && vendorGroups.every((g) => openVendors.has(g.key))
  const toggleVendor = (key: string) =>
    setOpenVendors((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  // The choice lives in the URL (?view=calendar) so a refresh or a shared link keeps it.
  // replaceState integrates with the Next router (see the SPA guide) — no navigation, no reload.
  const changeView = (v: View) => {
    setView(v)
    const url = new URL(window.location.href)
    if (v === 'calendar') url.searchParams.set('view', 'calendar')
    else url.searchParams.delete('view')
    window.history.replaceState(null, '', url)
  }

  const replacePayment = (p: DbProjectPayment) =>
    setPayments((cur) => cur.map((x) => (x.id === p.id ? { ...p, amount: Number(p.amount) } : x)))

  const savePayment = (id: string | null, v: PaymentInput, pdf?: PendingPdf) =>
    run(id ?? 'new', async () => {
      if (id) {
        replacePayment(await updatePayment(id, v))
        setEditingId(null)
        if (pdf) await attachPdf(pdf, id, v.vendorName)
      } else {
        const p = await createPayment(projectId, v)
        setPayments((cur) => [...cur, { ...p, amount: Number(p.amount) }])
        setShowAdd(false)
      }
    })

  /**
   * Records the database row for a PDF that was staged in the bucket. If that fails the payment is
   * already saved, so say exactly that instead of pretending everything failed.
   */
  const attachPdf = async (pdf: PendingPdf, paymentId: string | null, vendorName: string | null) => {
    try {
      const doc = await registerDocument({
        projectId,
        paymentId,
        vendorName,
        kind: pdf.kind,
        label: pdf.label,
        storagePath: pdf.path,
        sizeBytes: pdf.size,
      })
      setDocuments((cur) => [doc, ...cur])
    } catch (e) {
      await removeStagedPdf(pdf.path)
      setError(`The payment was saved, but the PDF could not be attached: ${errMsg(e)} Use “Attach receipt” to add it again.`)
    }
  }

  // ── Add payment from PDF ──
  const startImport = async (file: File | null) => {
    if (!file) return
    setError(null)
    setShowAdd(false)
    setEditingId(null)
    setImporting({ stage: 'reading', fileName: file.name })
    try {
      setImporting({ stage: 'review', staged: await stagePdf(file, teamId, projectId) })
    } catch (e) {
      setError(errMsg(e))
      setImporting(null)
    }
  }

  const cancelImport = () => {
    if (importing?.stage === 'review') void removeStagedPdf(importing.staged.path)
    setImporting(null)
  }

  const saveImport = (inputs: PaymentInput[], pdf: { kind: DbDocumentKind; label: string }) => {
    if (importing?.stage !== 'review') return
    const staged = importing.staged
    return run('import', async () => {
      // One insert for all rows: they are all saved or none are.
      const created = await createPayments(projectId, inputs)
      setPayments((cur) => [...cur, ...created.map((p) => ({ ...p, amount: Number(p.amount) }))])
      setImporting(null)
      // The PDF is attached to every payment it created. The first uses the uploaded file itself; each
      // further payment gets its own copy (one file per document row), so removing the PDF from one
      // payment never touches the others. A failure on one payment does not stop the rest.
      const attached: DbProjectDocument[] = []
      const failed: string[] = []
      let usedOriginal = false
      for (const [i, p] of created.entries()) {
        let path = staged.path
        try {
          if (i > 0) path = await copyPdfObject(staged.path)
          const doc = await registerDocument({
            projectId,
            paymentId: p.id,
            vendorName: p.vendor_name,
            kind: pdf.kind,
            label: pdf.label,
            storagePath: path,
            sizeBytes: staged.size,
          })
          attached.push(doc)
          if (i === 0) usedOriginal = true
        } catch (e) {
          console.error('[payments/import] could not attach the PDF to', p.id, e)
          if (i > 0) await removeStagedPdf(path) // the copy exists but has no row
          failed.push(`${p.vendor_name} — ${p.label}`)
        }
      }
      // The uploaded file is only needed as the source for the copies; if it was not used, drop it.
      if (!usedOriginal) await removeStagedPdf(staged.path)
      if (attached.length > 0) setDocuments((cur) => [...attached.slice().reverse(), ...cur])
      if (failed.length > 0) {
        setError(`The payments were saved, but the PDF could not be attached to: ${failed.join('; ')}. Use “Attach receipt” on ${failed.length === 1 ? 'that payment' : 'those payments'} to add it again.`)
      }
    })
  }

  const markPaid = (id: string) =>
    run(id, async () => {
      if (!isIsoDate(payDate)) throw new Error('Enter a valid payment date.')
      replacePayment(await setPaymentPaid(id, payDate))
      setPayingId(null)
    })

  const markUnpaid = (id: string) => run(id, async () => replacePayment(await setPaymentPaid(id, null)))

  const removePayment = (id: string) =>
    run(id, async () => {
      await deletePayment(id)
      setPayments((cur) => cur.filter((p) => p.id !== id))
      // The database keeps the documents and nulls their payment link — mirror that.
      setDocuments((cur) => cur.map((d) => (d.payment_id === id ? { ...d, payment_id: null } : d)))
      setConfirmDeleteId(null)
    })

  const removeDocument = (doc: DbProjectDocument) =>
    run(doc.id, async () => {
      await deleteProjectDocument(doc)
      setDocuments((cur) => cur.filter((d) => d.id !== doc.id))
    })

  const openDocument = (doc: DbProjectDocument) =>
    run(doc.id, async () => {
      // Open the tab synchronously (inside the click) so popup blockers allow it,
      // then point it at the short-lived signed URL.
      const w = window.open('', '_blank')
      try {
        const url = await getDocumentUrl(doc.storage_path)
        if (w) {
          w.opener = null
          w.location.href = url
        } else {
          window.location.href = url
        }
      } catch (e) {
        w?.close()
        throw e
      }
    })

  const onUploaded = (doc: DbProjectDocument) => {
    setDocuments((cur) => [doc, ...cur])
    setAttachingFor(null)
  }

  const renderDoc = (doc: DbProjectDocument) => (
    <li key={doc.id} className="flex items-center gap-2 text-xs text-gray-600">
      <span aria-hidden>📄</span>
      <button onClick={() => openDocument(doc)} disabled={busy === doc.id} className="text-blue-600 hover:underline text-left">
        {doc.label}
      </button>
      <span className="text-gray-400">
        {DOC_KIND_LABEL[doc.kind]}
        {doc.vendor_name ? ` · ${doc.vendor_name}` : ''} · {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at.slice(0, 10))}
      </span>
      <button onClick={() => removeDocument(doc)} disabled={busy === doc.id} className="ml-auto text-gray-400 hover:text-red-600" aria-label={`Remove ${doc.label}`}>
        Remove
      </button>
    </li>
  )

  const renderPayment = (p: DbProjectPayment) => {
    const st = paymentStatus(p)
    const receipts = docsByPayment.get(p.id) ?? []
    return (
      <li key={p.id} className="px-4 py-3">
        {editingId === p.id ? (
          <PaymentForm
            initial={{ ...p, vendor_name: vendorOf(p) }}
            submitLabel="Save"
            busy={busy === p.id}
            onSubmit={(v, pdf) => savePayment(p.id, v, pdf)}
            onCancel={() => setEditingId(null)}
            fill={{ teamId, projectId, currency, eventDate }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{vendorOf(p)}</span> — {p.label}
                  {!p.vendor_id && <span className="ml-2 text-[11px] text-gray-400">not in vendor list</span>}
                </p>
                {p.notes && <p className="text-xs text-gray-500 mt-0.5">{p.notes}</p>}
              </div>
              <p className="text-sm font-medium text-gray-900 tabular-nums">{money(p.amount)}</p>
              <p className="text-xs text-gray-500 w-28">Due {formatDate(p.due_date).replace(/^\w+, /, '')}</p>
              <StatusPill status={st} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {p.paid_at ? (
                <button onClick={() => markUnpaid(p.id)} disabled={busy === p.id} className={btn}>Mark unpaid</button>
              ) : payingId === p.id ? (
                <span className="flex items-center gap-2">
                  <label htmlFor={`paid-on-${p.id}`} className="text-xs text-gray-500">Paid on</label>
                  <span className="w-36"><DateField id={`paid-on-${p.id}`} value={payDate} onChange={setPayDate} className={input} /></span>
                  <button onClick={() => markPaid(p.id)} disabled={busy === p.id} className={btnPrimary + ' !py-1 !text-xs'}>Confirm</button>
                  <button onClick={() => setPayingId(null)} className={btn}>Cancel</button>
                </span>
              ) : (
                <button onClick={() => { setPayingId(p.id); setPayDate(todayIso()) }} className={btn}>Mark paid</button>
              )}
              <button onClick={() => { setEditingId(p.id); setShowAdd(false) }} className={btn}>Edit</button>
              <button onClick={() => setAttachingFor(attachingFor === p.id ? null : p.id)} className={btn}>Attach receipt</button>
              {confirmDeleteId === p.id ? (
                <span className="flex items-center gap-2 text-xs text-gray-600">
                  Delete this payment?
                  <button onClick={() => removePayment(p.id)} disabled={busy === p.id} className="rounded-lg bg-red-600 px-2 py-1 text-white hover:bg-red-700">Delete</button>
                  <button onClick={() => setConfirmDeleteId(null)} className={btn}>Keep</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDeleteId(p.id)} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
              )}
            </div>

            {receipts.length > 0 && (
              <ul className="mt-2 space-y-1 border-l-2 border-gray-100 pl-3">
                {receipts.map(renderDoc)}
              </ul>
            )}
            {attachingFor === p.id && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <UploadForm
                  teamId={teamId}
                  projectId={projectId}
                  fixedKind="receipt"
                  paymentId={p.id}
                  vendorName={vendorOf(p)}
                  defaultLabel={`Receipt — ${p.label}`}
                  onUploaded={onUploaded}
                  onCancel={() => setAttachingFor(null)}
                  onError={setError}
                />
              </div>
            )}
          </>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      {/* Vendor suggestions for every payment form on this page; PaymentFields points its vendor input at this id. */}
      <datalist id="team-vendor-names">
        {vendors.map((v) => (
          <option key={v.id} value={v.name} />
        ))}
      </datalist>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* ── Totals ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={money(totals.total)} />
        <Stat label="Paid" value={money(totals.paid)} />
        <Stat label="Outstanding" value={money(totals.outstanding)} />
        <Stat
          label="Overdue"
          value={totals.overdueCount === 0 ? 'None' : `${totals.overdueCount} · ${money(totals.overdueAmount)}`}
          tone={totals.overdueCount > 0 ? 'bad' : undefined}
        />
      </div>

      {/* ── Payments ── */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Payments</h2>
            <div role="group" aria-label="Payments view" className="flex overflow-hidden rounded-lg border border-gray-300 text-xs">
              {(['list', 'calendar'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => changeView(v)}
                  className={`px-2.5 py-1 ${view === v ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {v === 'list' ? 'List' : 'Calendar'}
                </button>
              ))}
            </div>
          </div>
          {!showAdd && !importing && (
            <div className="flex items-center gap-2">
              <input
                ref={importInput}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  void startImport(f)
                }}
              />
              <button onClick={() => importInput.current?.click()} className={btn + ' !py-1.5 !text-sm'}>Add payment from PDF</button>
              <button onClick={() => { setShowAdd(true); setEditingId(null) }} className={btnPrimary}>Add payment</button>
            </div>
          )}
        </div>

        {importing?.stage === 'reading' && (
          <p role="status" className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Reading <strong>{importing.fileName}</strong>… this can take a few seconds.
          </p>
        )}
        {importing?.stage === 'review' && (
          <PdfImportReview staged={importing.staged} currency={currency} eventDate={eventDate} busy={busy === 'import'} onSave={saveImport} onCancel={cancelImport} />
        )}

        {showAdd && (
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
            <PaymentForm submitLabel="Add payment" busy={busy === 'new'} onSubmit={(v) => savePayment(null, v)} onCancel={() => setShowAdd(false)} />
          </div>
        )}

        {sorted.length === 0 && !showAdd && !importing && (
          <p className="px-4 py-6 text-sm text-gray-400">No payments yet.</p>
        )}

        {view === 'list' ? (
          <div>
            {vendorGroups.length > 1 && (
              <div className="flex justify-end border-b border-gray-100 px-4 py-2 text-xs">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  onClick={() => setOpenVendors(allVendorsOpen ? new Set() : new Set(vendorGroups.map((g) => g.key)))}
                >
                  {allVendorsOpen ? 'Close all' : 'Open all'}
                </button>
              </div>
            )}
            {vendorGroups.map((g) => {
              // A group with a payment being edited / marked paid / deleted stays open so its form can't be hidden.
              const busyHere = g.payments.some((p) => p.id === editingId || p.id === payingId || p.id === confirmDeleteId || p.id === attachingFor)
              const open = openVendors.has(g.key) || busyHere
              const unpaid = g.payments.filter((p) => !p.paid_at)
              const overdue = unpaid.filter((p) => paymentStatus(p).kind === 'overdue').length
              const outstanding = paymentTotals(g.payments).outstanding
              const nextDue = unpaid[0]?.due_date
              const receiptCount = g.payments.reduce((n, p) => n + (docsByPayment.get(p.id)?.length ?? 0), 0)
              const panelId = `vendor-${g.key.replace(/[^a-z0-9]/gi, '')}`
              return (
                <section key={g.key} className="border-b border-gray-100 last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    disabled={busyHere}
                    onClick={() => toggleVendor(g.key)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span aria-hidden className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-gray-900 truncate">{g.name}</span>
                    <span className="text-xs text-gray-500">
                      {g.payments.length} payment{g.payments.length === 1 ? '' : 's'}
                      {receiptCount > 0 && ` · ${receiptCount} file${receiptCount === 1 ? '' : 's'}`}
                    </span>
                    {overdue > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">{overdue} overdue</span>}
                    <span className="text-xs text-gray-500">
                      {unpaid.length === 0 ? 'All paid' : `${money(outstanding)} left${nextDue ? ` · next ${formatDate(nextDue)}` : ''}`}
                    </span>
                  </button>
                  {open && (
                    <ul id={panelId} className="divide-y divide-gray-100 border-t border-gray-100 bg-white">
                      {g.payments.map(renderPayment)}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        ) : (
          <CalendarView payments={payments} eventDate={eventDate} money={money} renderPayment={renderPayment} vendorOf={vendorOf} />
        )}
      </section>

      {/* ── Contracts & other documents (versions, search, edit) ── */}
      <DocumentsSection
        teamId={teamId}
        projectId={projectId}
        documents={generalDocs}
        setDocuments={setDocuments}
        onError={setError}
      />
    </div>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function chipTone(status: ReturnType<typeof paymentStatus>): string {
  if (status.kind === 'paid') return 'bg-green-50 text-green-700'
  if (status.kind === 'overdue') return 'bg-red-50 text-red-700'
  return status.days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
}

/**
 * Month grid of payments by due date. Clicking a day opens its payments
 * underneath using the same row as the list, so Mark paid / Edit / Attach
 * receipt work identically in both views. Read-only otherwise: nothing here
 * can move a due date by dragging.
 */
function CalendarView({
  payments,
  eventDate,
  money,
  renderPayment,
  vendorOf,
}: {
  payments: DbProjectPayment[]
  eventDate: string | null
  money: (n: number) => string
  renderPayment: (p: DbProjectPayment) => React.ReactNode
  vendorOf: (p: DbProjectPayment) => string
}) {
  const today = todayIso()
  const [ym, setYm] = useState(() => initialCalendarMonth(payments, today))
  const [selected, setSelected] = useState<string | null>(null)

  const [y, m] = ym.split('-').map(Number)
  const weeks = useMemo(() => monthGrid(y, m - 1), [y, m])
  const byDay = useMemo(() => {
    const map = new Map<string, DbProjectPayment[]>()
    for (const p of sortPayments(payments)) map.set(p.due_date, [...(map.get(p.due_date) ?? []), p])
    return map
  }, [payments])

  const inMonth = payments.filter((p) => p.due_date.startsWith(ym))
  const selectedPayments = selected ? byDay.get(selected) ?? [] : []

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setYm(shiftMonth(ym, -1)); setSelected(null) }} className={btn} aria-label="Previous month">←</button>
          <button type="button" onClick={() => { setYm(shiftMonth(ym, 1)); setSelected(null) }} className={btn} aria-label="Next month">→</button>
          <button type="button" onClick={() => { setYm(today.slice(0, 7)); setSelected(null) }} className={btn}>Today</button>
        </div>
        <p className="text-sm font-medium text-gray-900">{monthLabel(ym)}</p>
        <p className="text-xs text-gray-500">
          {inMonth.length === 0 ? 'Nothing due this month' : `${inMonth.length} due · ${money(sumAmounts(inMonth.map((p) => p.amount)))}`}
        </p>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-100 text-center text-[11px] text-gray-400">
        {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell) => {
          const ps = byDay.get(cell.iso) ?? []
          const isToday = cell.iso === today
          const isSelected = cell.iso === selected
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => setSelected(isSelected ? null : cell.iso)}
              aria-pressed={isSelected}
              aria-label={`${formatDate(cell.iso)}${ps.length ? `, ${ps.length} payment${ps.length === 1 ? '' : 's'} due` : ''}${cell.iso === eventDate ? ', event day' : ''}`}
              className={`min-h-20 border-b border-r border-gray-100 p-1 text-left align-top ${cell.inMonth ? 'bg-white' : 'bg-gray-50'} ${isSelected ? 'ring-2 ring-inset ring-brand-600' : 'hover:bg-gray-50'}`}
            >
              <span className="flex items-center gap-1">
                <span className={isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] text-white' : `text-[11px] ${cell.inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                  {cell.day}
                </span>
                {cell.iso === eventDate && <span className="rounded-lg bg-purple-100 px-1 text-[10px] text-purple-700">Event</span>}
              </span>
              <span className="mt-0.5 block space-y-0.5">
                {ps.slice(0, 2).map((p) => (
                  <span key={p.id} title={`${vendorOf(p)} — ${p.label}: ${money(p.amount)}`} className={`block truncate rounded-lg px-1 text-[10px] ${chipTone(paymentStatus(p))}`}>
                    {vendorOf(p)} {money(p.amount)}
                  </span>
                ))}
                {ps.length > 2 && <span className="block px-1 text-[10px] text-gray-500">+{ps.length - 2} more</span>}
              </span>
            </button>
          )
        })}
      </div>

      <p className="px-4 py-2 text-[11px] text-gray-400">
        <span className="text-green-700">Green</span> paid · <span className="text-red-700">red</span> overdue · <span className="text-amber-700">amber</span> due within 7 days · grey later. Click a day to see and edit its payments.
      </p>

      {selected && (
        <div className="border-t border-gray-100">
          <p className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
            {formatDate(selected)}{selectedPayments.length === 0 ? ' — no payments due' : ''}
          </p>
          {selectedPayments.length > 0 && <ul className="divide-y divide-gray-100">{selectedPayments.map(renderPayment)}</ul>}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${tone === 'bad' ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: ReturnType<typeof paymentStatus> }) {
  const base = 'w-36 rounded-full px-2.5 py-0.5 text-center text-xs font-medium'
  if (status.kind === 'paid') return <span className={`${base} bg-green-50 text-green-700`}>Paid {formatDate(status.paidAt).replace(/^\w+, /, '')}</span>
  if (status.kind === 'overdue') return <span className={`${base} bg-red-50 text-red-700`}>Overdue {status.days} day{status.days === 1 ? '' : 's'}</span>
  if (status.days === 0) return <span className={`${base} bg-amber-50 text-amber-700`}>Due today</span>
  return <span className={`${base} ${status.days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>Due in {status.days} day{status.days === 1 ? '' : 's'}</span>
}

