import { LOGO_MAX_ASPECT, type LogoPosition, type LogoSize } from './style'
import type { PdfLogo } from './types'

/** The team's logo plus where and how big to print it. */
export type ExportLogo = { logo: PdfLogo; position: LogoPosition; size: LogoSize }

/** Logo height as a fraction of the image width, per size choice. */
const HEIGHT_FRACTION: Record<LogoSize, number> = { small: 0.03, medium: 0.045, large: 0.065 }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the logo.'))
    img.src = src
  })
}

/**
 * Puts the plan on a white canvas (a JPG has no transparency; transparent pixels would turn black)
 * and, when the team has a logo, adds a white band under the plan carrying it at the chosen
 * bottom left / centre / right position, so it never covers the plan itself.
 */
export async function flattenForJpg(shot: HTMLCanvasElement, exportLogo: ExportLogo | null): Promise<HTMLCanvasElement> {
  const img = exportLogo ? await loadImage(exportLogo.logo.dataUrl).catch(() => null) : null
  const logoH = exportLogo && img ? Math.max(16, Math.round(shot.width * HEIGHT_FRACTION[exportLogo.size])) : 0
  const pad = Math.round(logoH * 0.4)
  const band = img ? logoH + pad * 2 : 0

  const out = document.createElement('canvas')
  out.width = shot.width
  out.height = shot.height + band
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not create the export canvas.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(shot, 0, 0)

  if (exportLogo && img) {
    const aspect = Math.min(exportLogo.logo.widthPx / exportLogo.logo.heightPx, LOGO_MAX_ASPECT)
    const w = logoH * aspect
    const margin = Math.round(out.width * 0.02)
    const x =
      exportLogo.position === 'bottom-left' ? margin : exportLogo.position === 'bottom-right' ? out.width - margin - w : (out.width - w) / 2
    ctx.drawImage(img, x, shot.height + pad, w, logoH)
  }
  return out
}
