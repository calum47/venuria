import { LOGO_MAX_ASPECT, type LogoPosition, type LogoSize } from './style'
import type { PdfLogo } from './types'

/** The team's logo plus where and how big to print it. */
export type ExportLogo = { logo: PdfLogo; position: LogoPosition; size: LogoSize }

/** What goes on the plan JPG besides the plan: the team's own logo (optional) and the Venuria mark (always). */
export type ExportBranding = { team: ExportLogo | null; brand: PdfLogo | null }

/** Logo height as a fraction of the image width, per size choice. */
const HEIGHT_FRACTION: Record<LogoSize, number> = { small: 0.03, medium: 0.045, large: 0.065 }
/** The Venuria mark is a fixed small size. */
const BRAND_FRACTION = 0.028

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
 * and adds a white band under it: the team logo bottom left or centre if they set one, and the
 * Venuria mark at the bottom right, always. The band keeps both clear of the plan itself.
 */
export async function flattenForJpg(shot: HTMLCanvasElement, branding: ExportBranding | null): Promise<HTMLCanvasElement> {
  const teamImg = branding?.team ? await loadImage(branding.team.logo.dataUrl).catch(() => null) : null
  const brandImg = branding?.brand ? await loadImage(branding.brand.dataUrl).catch(() => null) : null

  const teamH = branding?.team && teamImg ? Math.max(16, Math.round(shot.width * HEIGHT_FRACTION[branding.team.size])) : 0
  const brandH = Math.max(14, Math.round(shot.width * BRAND_FRACTION))
  const tallest = Math.max(teamH, brandH)
  const pad = Math.round(tallest * 0.4)
  const band = tallest + pad * 2

  const out = document.createElement('canvas')
  out.width = shot.width
  out.height = shot.height + band
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Could not create the export canvas.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(shot, 0, 0)

  const margin = Math.round(out.width * 0.02)
  const midY = shot.height + band / 2

  if (branding?.team && teamImg) {
    const aspect = Math.min(branding.team.logo.widthPx / branding.team.logo.heightPx, LOGO_MAX_ASPECT)
    const w = teamH * aspect
    const x = branding.team.position === 'bottom-left' ? margin : (out.width - w) / 2
    ctx.drawImage(teamImg, x, midY - teamH / 2, w, teamH)
  }

  if (branding?.brand && brandImg) {
    const w = brandH * (branding.brand.widthPx / branding.brand.heightPx)
    ctx.drawImage(brandImg, out.width - margin - w, midY - brandH / 2, w, brandH)
  } else {
    // The mark could not be loaded: the name is still printed.
    ctx.fillStyle = '#4b5563'
    ctx.font = `600 ${brandH}px serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText('Venuria', out.width - margin, midY)
  }
  return out
}
