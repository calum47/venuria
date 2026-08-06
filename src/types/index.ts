// ─── Shared ───────────────────────────────────────────────────────────────────

export type UserRole = 'client' | 'planner' | 'venue' | 'rental'

export type Point2D = {
  x: number
  y: number
}

// ─── Venue ────────────────────────────────────────────────────────────────────

export type Venue = {
  id: string
  name: string
  rooms: Room[]
  maxCapacityPersons: number
}

export type Room = {
  id: string
  venueId: string
  name: string
  type: 'indoor' | 'outdoor'
  // Traced wall boundary in cm, ordered polygon points — the source of truth for
  // room shape once the venue manager has traced it. Furniture must stay inside;
  // the boundary line itself (the wall) is not placeable-on either. Empty until
  // traced, in which case the editor falls back to the boundingBox rectangle.
  floorPolygon: Point2D[]
  // Cached/derived fallback — bounding rect of floorPolygon once traced, or the
  // legacy manually-set rectangle for rooms that haven't uploaded a plan yet.
  boundingBox: {
    widthCm: number
    depthCm: number
  }
  // Pillars, columns, planters, etc — furniture must stay outside every one.
  obstacles: ObstacleShape[]
  // Reference floor-plan PNG uploaded by the venue manager, and its calibration.
  floorPlanImageUrl: string | null
  floorPlanImageWidthPx: number | null
  floorPlanImageHeightPx: number | null
  cmPerPx: number | null // real-world cm per image pixel; null until calibrated
  hotspots: Hotspot[]
}

// ─── Restricted zones (obstacles) ────────────────────────────────────────────
// Drawn by the venue manager on top of the uploaded floor plan to mark areas
// furniture can never occupy — pillars/columns (circle or rect) or irregular
// features like planters or built-in fixtures (freeform polygon).

export type ObstacleShape =
  | { id: string; type: 'rect'; label?: string; center: Point2D; widthCm: number; depthCm: number; rotationDeg: number }
  | { id: string; type: 'circle'; label?: string; center: Point2D; radiusCm: number }
  | { id: string; type: 'polygon'; label?: string; points: Point2D[] }

export type Hotspot = {
  id: string
  roomId: string
  positionCm: Point2D           // where camera stood in the room
  heightCm: number              // camera height off the floor
  equirectImageUrl: string      // the 360° photo
  fovDeg: number                // field of view
  linkedHotspotIds: string[]    // connected hotspots for walkthrough
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export type ItemOwner =
  | { type: 'venue'; venueId: string }
  | { type: 'rental'; companyId: string }

export type CatalogItem = {
  id: string
  name: string
  category: string
  ownedBy: ItemOwner
  dimensions: {
    widthCm: number
    depthCm: number
    heightCm: number
  }
  modelUrl: string              // GLTF/GLB file for 3D rendering
  imageUrl: string              // photo for catalog browsing
  pricePerUnit: number | null   // null if included with venue
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export type ChairEdge = 'top' | 'bottom' | 'left' | 'right' | 'orbit'

export type ChairArrangement = 'all-sides' | 'long-only' | 'short-only'

export type ChairSides = {
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}

export type LayoutObject = {
  id: string
  catalogItemId: string
  positionCm: Point2D
  rotationDeg: number
  quantity: number
  // Smart seating
  chairCount?: number
  chairCatalogItemId?: string
  chairIds?: string[]
  isChairFor?: string
  chairArrangement?: ChairArrangement
  chairEdge?: ChairEdge
  chairSides?: ChairSides
  mirrorEnabled?: boolean  // default true — controls mirror drag behaviour
  // Labels & notes
  tableLabel?: string
  tableNote?: string
}

// ─── Project ──────────────────────────────────────────────────────────────────

export type ProjectStatus =
  | 'in_progress'
  | 'awaiting_client_input'
  | 'changes_suggested'
  | 'approved'
  | 'finalised'

export type Project = {
  id: string
  venueId: string
  roomId: string
  clientId: string | null
  plannerId: string | null
  status: ProjectStatus
  eventDate: string | null
  dueBy: string | null
  guestCount: number | null
  layoutObjects: LayoutObject[]
  createdAt: string
  updatedAt: string
}

// ─── Users ────────────────────────────────────────────────────────────────────

export type Planner = {
  id: string
  name: string
  email: string
  plannerCode: string
}

export type Client = {
  id: string
  name: string
  email: string | null
  linkedPlannerId: string | null
  partnerName: string | null
}

export type RentalCompany = {
  id: string
  name: string
  contactEmail: string
}