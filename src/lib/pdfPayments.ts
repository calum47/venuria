/**
 * Pure helpers for reading payment details out of a PDF (invoice, quote, contract).
 * No Supabase, no React, no network — the model's answer is untrusted input, so
 * everything that comes back is validated here before it can reach a form.
 */
import { MAX_AMOUNT, parseAmount } from '@/lib/payments'
import { applyDueRule, describeDueRule, formatDate, isIsoDate, type DueRule, type DueUnit } from '@/lib/projectDates'
import type { PaymentInput } from '@/lib/supabase/paymentQueries'
import type { Locale } from '@/i18n/config'
import type { Tr } from '@/i18n/types'

/** Translators for draftFromExtracted: `t` is the "Pay" namespace, `tDates` the "Dates" one. */
export type DraftI18n = { t: Tr; tDates: Tr; locale: Locale }

export const MAX_EXTRACTED_PAYMENTS = 12

/** One payment found in a PDF. Every field is null when the PDF does not say. */
export type ExtractedPayment = {
  vendor: string | null
  label: string | null
  /** Plain decimal, e.g. "1500.50" — no thousands separators or symbols. */
  amount: string | null
  /** YYYY-MM-DD, only when an explicit calendar date is written. */
  dueDate: string | null
  /** The due date as written when it could not be turned into a date ("30 days before the event"). */
  dueText: string | null
  /**
   * The due date when the PDF states it relative to the event/wedding date ("1 month before the event").
   * Turned into a real date from the project's event date by draftFromExtracted — never by the model.
   */
  dueRule: DueRule | null
  /** A short quote from the PDF supporting the amount/date, shown next to the field. */
  evidence: string | null
}

export type ExtractionResult = {
  /** ISO 4217 code, e.g. "EUR", or null when unclear. */
  currency: string | null
  payments: ExtractedPayment[]
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t.slice(0, max)
}

/** Accepts "1500", "1500.5", "1500.50" or a finite number; anything else (thousands separators, symbols) is null. */
function cleanAmount(v: unknown): string | null {
  let t: string
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    t = (Math.round(v * 100) / 100).toFixed(2)
  } else if (typeof v === 'string') {
    t = v.trim()
  } else {
    return null
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  if (!(n > 0) || n > MAX_AMOUNT) return null
  return t
}

const UNITS: Record<string, DueUnit> = { day: 'days', days: 'days', week: 'weeks', weeks: 'weeks', month: 'months', months: 'months' }
const MAX_RULE_AMOUNT: Record<DueUnit, number> = { days: 1100, weeks: 156, months: 36 }

/** Accepts only a whole, sane "N days/weeks/months before/after the event"; anything else is null. */
function cleanRule(v: unknown): DueRule | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const unit = typeof r.unit === 'string' ? UNITS[r.unit.trim().toLowerCase()] : undefined
  const dir = typeof r.direction === 'string' ? r.direction.trim().toLowerCase() : ''
  const n = typeof r.amount === 'number' ? r.amount : typeof r.amount === 'string' && /^\d{1,4}$/.test(r.amount.trim()) ? Number(r.amount) : NaN
  if (!unit || (dir !== 'before' && dir !== 'after')) return null
  if (!Number.isInteger(n) || n < 0 || n > MAX_RULE_AMOUNT[unit]) return null
  return { amount: n, unit, direction: dir }
}

function cleanDate(v: unknown): string | null {
  return typeof v === 'string' && isIsoDate(v.trim()) ? v.trim() : null
}

/** Turns whatever the model returned into a safe ExtractionResult. Never throws. */
export function sanitizeExtraction(raw: unknown): ExtractionResult {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const cur = typeof obj.currency === 'string' ? obj.currency.trim().toUpperCase() : ''
  const currency = /^[A-Z]{3}$/.test(cur) ? cur : null

  const list = Array.isArray(obj.payments) ? obj.payments : []
  const payments: ExtractedPayment[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const p: ExtractedPayment = {
      vendor: str(r.vendor, 120),
      label: str(r.label, 120),
      amount: cleanAmount(r.amount),
      dueDate: cleanDate(r.due_date ?? r.dueDate),
      dueText: str(r.due_text ?? r.dueText, 120),
      dueRule: cleanRule(r.due_rule ?? r.dueRule),
      evidence: str(r.evidence, 300),
    }
    // A row with nothing usable is noise.
    if (!p.vendor && !p.label && !p.amount && !p.dueDate) continue
    // The wording only matters when there is no real date.
    if (p.dueDate) {
      p.dueText = null
      p.dueRule = null
    }
    payments.push(p)
    if (payments.length >= MAX_EXTRACTED_PAYMENTS) break
  }
  return { currency, payments }
}

/** What the payment form edits: strings, exactly as typed. */
export type PaymentDraft = {
  vendor: string
  label: string
  amount: string
  dueDate: string
  notes: string
}

export type DraftField = keyof PaymentDraft

export const EMPTY_DRAFT: PaymentDraft = { vendor: '', label: '', amount: '', dueDate: '', notes: '' }

/** Fields the PDF actually provided, with the text to show next to each ("found in the PDF"). */
export type FromPdf = Partial<Record<DraftField, string>>

export function draftFromExtracted(
  p: ExtractedPayment,
  eventDate: string | null,
  i18n: DraftI18n,
): { draft: PaymentDraft; from: FromPdf; dueCalc: string | null } {
  const from: FromPdf = {}
  const hint = p.evidence ?? i18n.t('readFromPdf')
  if (p.vendor) from.vendor = hint
  if (p.label) from.label = hint
  if (p.amount) from.amount = hint
  let dueDate = p.dueDate ?? ''
  let dueCalc: string | null = null
  if (p.dueDate) {
    from.dueDate = hint
  } else if (p.dueRule) {
    // "1 month before the event" + the project's event date = a real date. Done here, in code, so the
    // calendar arithmetic is exact; the person still checks it like every other field read from a PDF.
    const rule = describeDueRule(p.dueRule, i18n.tDates)
    if (eventDate && isIsoDate(eventDate)) {
      dueDate = applyDueRule(eventDate, p.dueRule)
      from.dueDate = hint
      dueCalc = i18n.t('dueCalculated', { text: p.dueText ?? rule, eventDate: formatDate(eventDate, i18n.locale), rule, dueDate: formatDate(dueDate, i18n.locale) })
    } else {
      dueCalc = i18n.t('dueNoEventDate', { rule })
    }
  }
  return {
    draft: { vendor: p.vendor ?? '', label: p.label ?? '', amount: p.amount ?? '', dueDate, notes: '' },
    from,
    dueCalc,
  }
}

/** Same rules as the payment form, in one place so the review window and the form cannot drift apart. */
export function validateDraft(d: PaymentDraft, t: Tr): { input: PaymentInput } | { error: string } {
  const amount = parseAmount(d.amount)
  if (!d.vendor.trim()) return { error: t('enterVendor') }
  if (!d.label.trim()) return { error: t('enterLabel') }
  if (amount === null) return { error: t('enterAmount') }
  if (!isIsoDate(d.dueDate)) return { error: t('enterDueDate') }
  return {
    input: { vendorName: d.vendor.trim(), label: d.label.trim(), amount, dueDate: d.dueDate, notes: d.notes.trim() || null },
  }
}

/** True when the PDF is in a different currency than the team's — the amounts would be wrong, so warn. */
export function currencyMismatch(pdfCurrency: string | null, teamCurrency: string): boolean {
  return pdfCurrency !== null && pdfCurrency.toUpperCase() !== teamCurrency.toUpperCase()
}

/** "30% deposit — 1500.00 — due 2027-03-01" for a picker. */
export function describeExtracted(p: ExtractedPayment, i: number, t: Tr): string {
  const bits = [p.label ?? t('paymentN', { n: i + 1 }), p.amount, p.dueDate ?? p.dueText].filter(Boolean)
  return bits.join(' — ')
}

/** The vendor to put on a project-level document: the shared one if every payment agrees, else none. */
export function commonVendor(vendors: string[]): string | null {
  const set = new Set(vendors.map((v) => v.trim().toLowerCase()).filter(Boolean))
  if (set.size !== 1) return null
  return vendors.find((v) => v.trim() !== '')!.trim()
}
