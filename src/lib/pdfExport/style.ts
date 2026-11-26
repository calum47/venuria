/**
 * Per-team look of the exported PDFs and JPGs (Settings → Exports).
 * Stored as JSON on `teams.export_style`; anything missing or out of range falls
 * back to the default, so old or hand-edited rows can never break an export.
 */

export type PdfFontKey = 'helvetica' | 'inter' | 'dmsans' | 'montserrat' | 'lora' | 'playfair' | 'cormorant'

export type PdfFontOption = {
  key: PdfFontKey
  label: string
  kind: 'Sans' | 'Serif'
  /** Files in /public/fonts/pdf. Helvetica is built into the PDF format, so it has none. */
  files: { normal: string; bold: string } | null
  /** CSS family for the preview in the Settings form. */
  css: string
}

export const PDF_FONTS: PdfFontOption[] = [
  { key: 'helvetica', label: 'Helvetica (classic)', kind: 'Sans', files: null, css: 'Helvetica, Arial, sans-serif' },
  { key: 'inter', label: 'Inter', kind: 'Sans', files: { normal: 'Inter_400Regular.ttf', bold: 'Inter_700Bold.ttf' }, css: 'Inter, sans-serif' },
  { key: 'dmsans', label: 'DM Sans', kind: 'Sans', files: { normal: 'DMSans_400Regular.ttf', bold: 'DMSans_700Bold.ttf' }, css: '"DM Sans", sans-serif' },
  {
    key: 'montserrat',
    label: 'Montserrat',
    kind: 'Sans',
    files: { normal: 'Montserrat_400Regular.ttf', bold: 'Montserrat_700Bold.ttf' },
    css: 'Montserrat, sans-serif',
  },
  { key: 'lora', label: 'Lora', kind: 'Serif', files: { normal: 'Lora_400Regular.ttf', bold: 'Lora_700Bold.ttf' }, css: 'Lora, serif' },
  {
    key: 'playfair',
    label: 'Playfair Display',
    kind: 'Serif',
    files: { normal: 'PlayfairDisplay_400Regular.ttf', bold: 'PlayfairDisplay_700Bold.ttf' },
    css: '"Playfair Display", serif',
  },
  {
    key: 'cormorant',
    label: 'Cormorant Garamond',
    kind: 'Serif',
    files: { normal: 'CormorantGaramond_400Regular.ttf', bold: 'CormorantGaramond_700Bold.ttf' },
    css: '"Cormorant Garamond", serif',
  },
]

export type PdfSpacing = 'compact' | 'normal' | 'roomy'
/** The Venuria mark always owns the bottom-right of every page, so the team logo can only take the other two slots. */
export type LogoPosition = 'bottom-left' | 'bottom-center'
export type LogoSize = 'small' | 'medium' | 'large'

export type PdfStyle = {
  font: PdfFontKey
  /** Section headings, pt. */
  titleSize: number
  /** Table and body text, pt (the tables' 9 pt text is "9"). */
  baseSize: number
  /** Headings, table headers and the header rule. #rrggbb */
  accent: string
  spacing: PdfSpacing
  /** Left of the page footer (centre when the team logo is bottom-left). Empty → nothing. */
  footerText: string
  showLogo: boolean
  logoPosition: LogoPosition
  logoSize: LogoSize
}

export const DEFAULT_PDF_STYLE: PdfStyle = {
  font: 'helvetica',
  titleSize: 15,
  baseSize: 9,
  accent: '#282828',
  spacing: 'normal',
  footerText: '',
  showLogo: true,
  logoPosition: 'bottom-center',
  logoSize: 'medium',
}

export const TITLE_SIZE_RANGE = { min: 12, max: 24 } as const
export const BASE_SIZE_RANGE = { min: 7, max: 12 } as const
export const FOOTER_TEXT_MAX = 60

/** Logo height in pt (PDF) — the footer band is 40 pt tall, so "large" still fits. */
export const LOGO_HEIGHT_PT: Record<LogoSize, number> = { small: 16, medium: 24, large: 32 }
/** Height of the always-on Venuria mark in the PDF footer, pt. Not configurable. */
export const BRAND_HEIGHT_PT = 14
/** Longest side a logo may have, as a multiple of its height, so a very wide banner cannot swallow the footer. */
export const LOGO_MAX_ASPECT = 4.5

const FONT_KEYS = new Set<string>(PDF_FONTS.map((f) => f.key))
const SPACINGS = new Set<string>(['compact', 'normal', 'roomy'])
const POSITIONS = new Set<string>(['bottom-left', 'bottom-center'])
const SIZES = new Set<string>(['small', 'medium', 'large'])

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n * 2) / 2))
}

/** Turns whatever is stored (or posted) into a complete, valid PdfStyle. */
export function normalizePdfStyle(raw: unknown): PdfStyle {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_PDF_STYLE
  return {
    font: typeof r.font === 'string' && FONT_KEYS.has(r.font) ? (r.font as PdfFontKey) : d.font,
    titleSize: clampNum(r.titleSize, TITLE_SIZE_RANGE.min, TITLE_SIZE_RANGE.max, d.titleSize),
    baseSize: clampNum(r.baseSize, BASE_SIZE_RANGE.min, BASE_SIZE_RANGE.max, d.baseSize),
    accent: typeof r.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.accent) ? r.accent.toLowerCase() : d.accent,
    spacing: typeof r.spacing === 'string' && SPACINGS.has(r.spacing) ? (r.spacing as PdfSpacing) : d.spacing,
    footerText: typeof r.footerText === 'string' ? r.footerText.replace(/\s+/g, ' ').trim().slice(0, FOOTER_TEXT_MAX) : d.footerText,
    showLogo: typeof r.showLogo === 'boolean' ? r.showLogo : d.showLogo,
    logoPosition: typeof r.logoPosition === 'string' && POSITIONS.has(r.logoPosition) ? (r.logoPosition as LogoPosition) : d.logoPosition,
    logoSize: typeof r.logoSize === 'string' && SIZES.has(r.logoSize) ? (r.logoSize as LogoSize) : d.logoSize,
  }
}

export function fontOption(key: PdfFontKey): PdfFontOption {
  return PDF_FONTS.find((f) => f.key === key) ?? PDF_FONTS[0]
}

/** Spacing preset → multiplier for cell padding and line gaps. */
export const SPACING_FACTOR: Record<PdfSpacing, number> = { compact: 0.65, normal: 1, roomy: 1.45 }

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [40, 40, 40]
}
