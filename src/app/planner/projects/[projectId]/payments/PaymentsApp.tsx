'use client'

import { useMemo, useState } from 'react'
import type { DbProjectDocument, DbProjectPayment } from '@/types/db'
import {
  createPayment,
  deletePayment,
  deleteProjectDocument,
  getDocumentUrl,
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
  parseAmount,
  paymentStatus,
  paymentTotals,
  shiftMonth,
  sortPayments,
  sumAmounts,
} from '@/lib/payments'
import { formatDate, isIsoDate, todayIso } from '@/lib/projectDates'
import DocumentsSection from './DocumentsSection'
import { UploadForm, btn, btnPrimary, errMsg, input } from './documentUi'

type View = 'list' | 'calendar'

type Props = {
  projectId: string
  teamId: string
  currency: string
  eventDate: string | null
  initialView: View
  initialPayments: DbProjectPayment[]
  initialDocuments: DbProjectDocument[]
}

export default function PaymentsApp({ projectId, teamId, currency, eventDate, initialView, initialPayments, initialDocuments }: Props) {
  // numeric(12,2) can arrive as a string from some clients — normalise once.
  const [payments, setPayments] = useState<DbProjectPayment[]>(() =>
    initialPayments.map((p) => ({ ...p, amount: Number(p.amount) })),
  )
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

  const sorted = useMemo(() => sortPayments(payments), [payments])
  const totals = useMemo(() => paymentTotals(payments), [payments])
  const docsByPayment = useMemo(() => {
    const m = new Map<string, DbProjectDocument[]>()
    for (const d of documents) if (d.payment_id) m.set(d.payment_id, [...(m.get(d.payment_id) ?? []), d])
    return m
  }, [documents])
  const generalDocs = useMemo(() => documents.filter((d) => !d.payment_id), [documents])
  const money = (n: number) => formatMoney(n, currency)

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

  const savePayment = (id: string | null, v: PaymentInput) =>
    run(id ?? 'new', async () => {
      if (id) {
        replacePayment(await updatePayment(id, v))
        setEditingId(null)
      } else {
        const p = await createPayment(projectId, v)
        setPayments((cur) => [...cur, { ...p, amount: Number(p.amount) }])
        setShowAdd(false)
      }
    })

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
            initial={p}
            submitLabel="Save"
            busy={busy === p.id}
            onSubmit={(v) => savePayment(p.id, v)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{p.vendor_name}</span> — {p.label}
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
                  <label className="text-xs text-gray-500">Paid on</label>
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={input} />
                  <button onClick={() => markPaid(p.id)} disabled={busy === p.id} className={btnPrimary + ' !py-1 !text-xs'}>Confirm</button>
                  <button onClick={() => setPayingId(null)} className={btn}>Cancel</button>
                </span>
              ) : (
                <button onClick={() => { setPayingId(p.id); setPayDate(todayIso()) }} className={btn}>Mark paid</button>
              )}
              <button onClick={() => { setEditingId(p.id); setShowAdd(false) }} className={btn}>Edit</button>
              <button onClick={() => setAttachingFor(attachingFor === p.id ? null : p.id)} className={btn}>Attach receipt (PDF)</button>
              {confirmDeleteId === p.id ? (
                <span className="flex items-center gap-2 text-xs text-gray-600">
                  Delete this payment?
                  <button onClick={() => removePayment(p.id)} disabled={busy === p.id} className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700">Delete</button>
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
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3">
                <UploadForm
                  teamId={teamId}
                  projectId={projectId}
                  fixedKind="receipt"
                  paymentId={p.id}
                  vendorName={p.vendor_name}
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
      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
            <div role="group" aria-label="Payments view" className="flex overflow-hidden rounded border border-gray-300 text-xs">
              {(['list', 'calendar'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => changeView(v)}
                  className={`px-2.5 py-1 ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {v === 'list' ? 'List' : 'Calendar'}
                </button>
              ))}
            </div>
          </div>
          {!showAdd && <button onClick={() => { setShowAdd(true); setEditingId(null) }} className={btnPrimary}>Add payment</button>}
        </div>

        {showAdd && (
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
            <PaymentForm submitLabel="Add payment" busy={busy === 'new'} onSubmit={(v) => savePayment(null, v)} onCancel={() => setShowAdd(false)} />
          </div>
        )}

        {sorted.length === 0 && !showAdd && (
          <p className="px-4 py-6 text-sm text-gray-400">No payments yet. Add each deposit, instalment or balance with its due date.</p>
        )}

        {view === 'list' ? (
          <ul className="divide-y divide-gray-100">
            {sorted.map(renderPayment)}
          </ul>
        ) : (
          <CalendarView payments={payments} eventDate={eventDate} money={money} renderPayment={renderPayment} />
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
}: {
  payments: DbProjectPayment[]
  eventDate: string | null
  money: (n: number) => string
  renderPayment: (p: DbProjectPayment) => React.ReactNode
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
              className={`min-h-20 border-b border-r border-gray-100 p-1 text-left align-top ${cell.inMonth ? 'bg-white' : 'bg-gray-50'} ${isSelected ? 'ring-2 ring-inset ring-gray-900' : 'hover:bg-gray-50'}`}
            >
              <span className="flex items-center gap-1">
                <span className={isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[11px] text-white' : `text-[11px] ${cell.inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                  {cell.day}
                </span>
                {cell.iso === eventDate && <span className="rounded bg-purple-100 px-1 text-[10px] text-purple-700">Event</span>}
              </span>
              <span className="mt-0.5 block space-y-0.5">
                {ps.slice(0, 2).map((p) => (
                  <span key={p.id} title={`${p.vendor_name} — ${p.label}: ${money(p.amount)}`} className={`block truncate rounded px-1 text-[10px] ${chipTone(paymentStatus(p))}`}>
                    {p.vendor_name} {money(p.amount)}
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

function PaymentForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: DbProjectPayment
  submitLabel: string
  busy: boolean
  onSubmit: (v: PaymentInput) => void
  onCancel: () => void
}) {
  const [vendor, setVendor] = useState(initial?.vendor_name ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseAmount(amount)
    if (!vendor.trim()) return setFormError('Enter the vendor or supplier.')
    if (!label.trim()) return setFormError('Enter what the payment is for, e.g. Deposit.')
    if (parsed === null) return setFormError('Enter an amount like 1500 or 1500,50 (no thousands separators).')
    if (!isIsoDate(dueDate)) return setFormError('Enter a due date.')
    setFormError(null)
    onSubmit({ vendorName: vendor.trim(), label: label.trim(), amount: parsed, dueDate, notes: notes.trim() || null })
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-4">
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor / supplier" aria-label="Vendor" className={input} maxLength={120} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For (Deposit, Balance…)" aria-label="Label" className={input} maxLength={120} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount" inputMode="decimal" className={input} />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" className={input} />
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" className={`${input} w-full`} maxLength={500} />
      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : submitLabel}</button>
        <button type="button" onClick={onCancel} className={btn + ' !py-1.5 !text-sm'}>Cancel</button>
      </div>
    </form>
  )
}
