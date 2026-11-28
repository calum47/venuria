import { INTL_TAG, type Locale } from '@/i18n/config'
import type { Tr } from '@/i18n/types'

/**
 * jsPDF's built-in fonts only cover WinAnsi (Latin-1 plus a few symbols).
 * Accented ES/FR text is fine; anything else (Cyrillic, CJK, emoji…) would
 * come out as garbage, so replace it with '?' rather than corrupting a line.
 */
const EXTRA_OK = new Set(['€', '‘', '’', '“', '”', '–', '—', '•', '…', '™', 'Œ', 'œ', 'Š', 'š', 'Ž', 'ž', 'Ÿ', 'Ÿ'])

export function pdfText(s: string | null | undefined): string {
  if (!s) return ''
  let out = ''
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    if (c === 0x0a || c === 0x09) out += ' '
    else if (c < 0x20) continue
    else if (c <= 0xff || EXTRA_OK.has(ch)) out += ch
    else out += '?'
  }
  return out
}

/** "7 June 2026" / "7 de junio de 2026". `t` = translator for "Pdf". */
export function formatDateLong(iso: string | null, locale: Locale, t: Tr): string {
  if (!iso) return t('dateNotSet')
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)))
  return pdfText(d.toLocaleDateString(INTL_TAG[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
}

export function safeFilePart(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'project'
  )
}
