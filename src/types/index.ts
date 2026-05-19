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
  floorPolygon: Point2D[]       // points in cm, traces the room shape
  boundingBox: {
    widthCm: number
    depthCm: number
  }
  hotspots: Hotspot[]
}

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