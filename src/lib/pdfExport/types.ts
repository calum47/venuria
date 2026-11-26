import type { LayoutObject, ObstacleShape, Point2D, ProjectZone } from '@/types'
import type { PdfStyle } from './style'

export type PdfRoom = {
  id: string
  name: string
  /** Traced boundary in cm; empty → fall back to the bounding box. */
  polygon: Point2D[]
  widthCm: number
  depthCm: number
  obstacles: ObstacleShape[]
}

export type PdfCatalogItem = { name: string; category: string; widthCm: number; depthCm: number }

export type PdfObject = LayoutObject & { roomId: string }

export type PdfItemRow = {
  name: string
  category: string
  used: number
  venueStock: number
  isStockTracked: boolean
  shortfall: number
  rentalAvailability: { companyName: string; quantity: number }[]
}

export type PdfGuest = {
  id: string
  name: string
  vip: boolean
  speech: boolean
  ageGroup: 'adult' | 'child' | 'baby'
  dietary: string | null
  notes: string | null
  family: string | null
  /** Planner marked this guest as not needing a seat. */
  seatDismissed: boolean
}

export type PdfExportData = {
  venueName: string
  /** Couple's names, or the venue name when the project has none: the heading of the PDF. */
  projectTitle: string
  teamName: string
  /** ISO yyyy-mm-dd or null */
  eventDate: string | null
  rooms: PdfRoom[]
  objects: PdfObject[]
  catalog: Record<string, PdfCatalogItem>
  zones: ProjectZone[]
  itemRows: PdfItemRow[]
  guests: PdfGuest[]
  /** guestId → layout object id (the chair) */
  assignments: { guestId: string; layoutObjectId: string }[]
  /** The team's saved look (validated; defaults when the team never set one). */
  teamStyle: PdfStyle
  /** Path of the team logo in the private team-logos bucket, if one is uploaded. */
  logoPath: string | null
}

export type PdfSections = {
  plans: boolean
  items: boolean
  seating: boolean
  guests: boolean
}

/** The team logo, ready to draw: an image data URL plus its pixel size (for the aspect ratio). */
export type PdfLogo = { dataUrl: string; format: 'PNG' | 'JPEG'; widthPx: number; heightPx: number }

/** Base64 of the regular and bold TTF files of the chosen font. */
export type PdfFontData = { normal: string; bold: string }

export type PdfOptions = {
  sections: PdfSections
  /** Rooms to include in plans and the seating chart. */
  roomIds: string[]
  /** The team's look. Omitted → the built-in default (same as before this setting existed). */
  style?: PdfStyle
  /** Required for any font other than Helvetica; without it the PDF falls back to Helvetica. */
  fonts?: PdfFontData | null
  /** Drawn on every page when the style has showLogo on. */
  logo?: PdfLogo | null
}
