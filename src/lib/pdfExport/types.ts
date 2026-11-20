import type { LayoutObject, ObstacleShape, Point2D, ProjectZone } from '@/types'

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
}

export type PdfSections = {
  plans: boolean
  items: boolean
  seating: boolean
  guests: boolean
}

export type PdfOptions = {
  sections: PdfSections
  /** Rooms to include in plans and the seating chart. */
  roomIds: string[]
}
