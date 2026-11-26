import type { SupabaseClient } from '@supabase/supabase-js'
import { fontOption, normalizePdfStyle, type PdfFontKey } from './style'
import type { ExportLogo } from './jpgLogo'
import type { PdfFontData, PdfLogo } from './types'

/** Browser-only helpers: fetch the font files and the team logo that the PDF/JPG exports embed. */

export const LOGO_BUCKET = 'team-logos'
/** The bucket allows 1 MB; stay clear of it after re-encoding. */
const MAX_LOGO_BYTES = 900 * 1024
/** Longest side of the stored logo, px. Plenty for a 32 pt-tall mark printed at 300 dpi. */
const MAX_LOGO_SIDE = 800

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const fontCache = new Map<PdfFontKey, Promise<PdfFontData | null>>()

/** Base64 TTFs of a font (cached for the session). Null for Helvetica, or when the files cannot be fetched. */
export function loadFontData(key: PdfFontKey): Promise<PdfFontData | null> {
  const files = fontOption(key).files
  if (!files) return Promise.resolve(null)
  let p = fontCache.get(key)
  if (!p) {
    p = (async () => {
      try {
        const [n, b] = await Promise.all(
          [files.normal, files.bold].map(async (f) => {
            const res = await fetch(`/fonts/pdf/${f}`)
            if (!res.ok) throw new Error(`Font ${f}: HTTP ${res.status}`)
            return toBase64(await res.arrayBuffer())
          }),
        )
        return { normal: n, bold: b }
      } catch (e) {
        console.error('Could not load the PDF font; falling back to Helvetica.', e)
        fontCache.delete(key) // let a later attempt retry
        return null
      }
    })()
    fontCache.set(key, p)
  }
  return p
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This file could not be read as an image.'))
    img.src = src
  })
}

function drawScaled(img: HTMLImageElement, whiteBackground: boolean): HTMLCanvasElement {
  const w0 = img.naturalWidth
  const h0 = img.naturalHeight
  const scale = Math.min(1, MAX_LOGO_SIDE / Math.max(w0, h0))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w0 * scale))
  canvas.height = Math.max(1, Math.round(h0 * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process images.')
  if (whiteBackground) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), type, quality))
}

/**
 * Turns whatever the manager picked (PNG, JPG, WebP, SVG) into a bounded PNG (JPG when a PNG would be
 * too large), so jsPDF never has to deal with SVG or WebP and the bucket's 1 MB limit holds.
 */
export async function prepareLogoFile(file: File): Promise<{ blob: Blob; ext: 'png' | 'jpg' }> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('Use a PNG, JPG, WebP or SVG image.')
  if (file.size > 8 * 1024 * 1024) throw new Error('That file is too large. Use an image under 8 MB.')
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('This image has no size information. Export it again with a width and height.')
    const png = await canvasBlob(drawScaled(img, false), 'image/png')
    if (png.size <= MAX_LOGO_BYTES) return { blob: png, ext: 'png' }
    const jpg = await canvasBlob(drawScaled(img, true), 'image/jpeg', 0.9)
    if (jpg.size > MAX_LOGO_BYTES) throw new Error('This image is too detailed. Use a simpler or smaller logo.')
    return { blob: jpg, ext: 'jpg' }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const logoCache = new Map<string, Promise<PdfLogo | null>>()

/** Downloads the team logo (private bucket, RLS-checked) and returns it ready to draw. Null when it cannot be read. */
export function loadLogo(supabase: SupabaseClient, path: string): Promise<PdfLogo | null> {
  let p = logoCache.get(path)
  if (!p) {
    p = (async () => {
      const url = await (async () => {
        const { data, error } = await supabase.storage.from(LOGO_BUCKET).download(path)
        if (error || !data) throw new Error(error?.message ?? 'Logo not found.')
        return URL.createObjectURL(data)
      })().catch((e) => {
        console.error('Could not load the team logo.', e)
        return null
      })
      if (!url) return null
      try {
        const img = await loadImage(url)
        // Re-encoded as PNG so every source format (incl. WebP) draws the same way in jsPDF.
        const canvas = drawScaled(img, false)
        return { dataUrl: canvas.toDataURL('image/png'), format: 'PNG' as const, widthPx: canvas.width, heightPx: canvas.height }
      } catch (e) {
        console.error('Could not decode the team logo.', e)
        return null
      } finally {
        URL.revokeObjectURL(url)
      }
    })().then((r) => {
      if (!r) logoCache.delete(path)
      return r
    })
    logoCache.set(path, p)
  }
  return p
}

/**
 * The logo (and its position/size) for a project's plan JPG, or null when the team has none, turned
 * it off, or the caller cannot read the team (e.g. a client in guest mode). Never throws.
 */
export async function loadExportLogoForProject(supabase: SupabaseClient, projectId: string): Promise<ExportLogo | null> {
  try {
    const { data: project } = await supabase.from('projects').select('team_id').eq('id', projectId).maybeSingle()
    const teamId = (project as { team_id: string | null } | null)?.team_id
    if (!teamId) return null
    const { data: team, error } = await supabase.from('teams').select('export_style, logo_path').eq('id', teamId).maybeSingle()
    const row = team as { export_style: unknown; logo_path: string | null } | null
    if (error || !row?.logo_path) return null
    const style = normalizePdfStyle(row.export_style)
    if (!style.showLogo) return null
    const logo = await loadLogo(supabase, row.logo_path)
    return logo ? { logo, position: style.logoPosition, size: style.logoSize } : null
  } catch (e) {
    console.error('Could not load the team logo for the JPG.', e)
    return null
  }
}
