/**
 * Pure helpers for the payment tracker (migration 015). No Supabase, no
 * React — so the money and date rules can be reasoned about (and tested) in
 * one place.
 */
import type { DbDocumentKind, DbProjectPayment } from '@/types/db'
import { daysUntil, isIsoDate } from '@/lib/projectDates'

export const DOCUMENTS_BUCKET = 'project-documents'
/** Mirrors the bucket's file_size_limit — the bucket is the real enforcement, this is for a friendly message. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024
/** numeric(12,2) holds 10 integer digits. */
export const MAX_AMOUNT = 9_999_999_999.99

export const DOC_KIND_LABEL: Record<DbDocumentKind, string> = {
  contract_draft: 'Contract draft',
  receipt: 'Receipt',
  other: 'Other',
}

export type PaymentStatus =
  | { kind: 'paid'; paidAt: string }
  | { kind: 'overdue'; days: number }
  | { kind: 'due'; days: number }

/** Derived, never stored: paid_at wins; otherwise compare due_date with today (UTC calendar, like the rest of the app). */
export function paymentStatus(p: Pick<DbProjectPayment, 'due_date' | 'paid_at'>, today?: string): PaymentStatus {
  if (p.paid_at) return { kind: 'paid', paidAt: p.paid_at }
  const d = daysUntil(p.due_date, today)
  return d < 0 ? { kind: 'overdue', days: -d } : { kind: 'due', days: d }
}

/**
 * Parses what a person types into an amount. Accepts "1500", "1500.50" and
 * the Spanish "1500,50"; rejects thousands separators (ambiguous: is "1.500"
 * one-and-a-half or fifteen hundred?) rather than guessing. Returns null if invalid.
 */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n <= MAX_AMOUNT ? n : null
}

/** Sum in integer cents so 0.1 + 0.2 style drift can never reach the screen. */
export function sumAmounts(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export type PaymentTotals = {
  total: number
  paid: number
  outstanding: number
  overdueCount: number
  overdueAmount: number
}

export function paymentTotals(payments: DbProjectPayment[], today?: string): PaymentTotals {
  const paid = payments.filter((p) => p.paid_at)
  const unpaid = payments.filter((p) => !p.paid_at)
  const overdue = unpaid.filter((p) => paymentStatus(p, today).kind === 'overdue')
  return {
    total: sumAmounts(payments.map((p) => p.amount)),
    paid: sumAmounts(paid.map((p) => p.amount)),
    outstanding: sumAmounts(unpaid.map((p) => p.amount)),
    overdueCount: overdue.length,
    overdueAmount: sumAmounts(overdue.map((p) => p.amount)),
  }
}

/** Unpaid first by due date (what needs attention), then paid by due date. */
export function sortPayments(payments: DbProjectPayment[]): DbProjectPayment[] {
  return [...payments].sort((a, b) => {
    if (!!a.paid_at !== !!b.paid_at) return a.paid_at ? 1 : -1
    return a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at)
  })
}

export function validDate(s: string): boolean {
  return isIsoDate(s)
}

/**
 * UI-level PDF check: type, size and the "%PDF-" magic bytes (a renamed .exe
 * would otherwise pass on file name alone). The bucket enforces size and MIME
 * type server-side; this only produces an early, readable error. The MIME
 * type is whatever the browser claims, so the bucket is not a content check.
 */
export async function checkPdf(file: File): Promise<string | null> {
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_PDF_BYTES) return `PDFs can be at most ${MAX_PDF_BYTES / 1024 / 1024} MB (this one is ${(file.size / 1024 / 1024).toFixed(1)} MB).`
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Only PDF files can be attached.'
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer())
  if (head !== '%PDF-') return 'That file does not look like a valid PDF.'
  return null
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}
