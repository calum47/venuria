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

export function formatDateEn(iso: string | null): string {
  if (!iso) return 'Date not set'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${parseInt(m[3], 10)} ${months[parseInt(m[2], 10) - 1] ?? ''} ${m[1]}`
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
