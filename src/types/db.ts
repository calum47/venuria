// ─── Raw DB row shapes ─────────────────────────────────────────────────────────
//
// These represent the snake_case column names returned directly from Supabase.
// They intentionally mirror the SQL schema rather than our camelCase domain
// types in index.ts. Components that query Supabase receive these; the editor
// page maps them to LayoutObject / Room / etc. before passing into stores.

export type DbCatalogItem = {
  id: string
  name: string
  category: string
  owner_type: 'venue' | 'rental'
  venue_id: string | null
  rental_company_id: string | null
  width_cm: number
  depth_cm: number
  height_cm: number
  price_per_unit: number | null
  image_url: string | null
  model_url: string | null
}

export type DbRoom = {
  id: string
  venue_id: string
  name: string
  type: 'indoor' | 'outdoor'
  bounding_box_width_cm: number
  bounding_box_depth_cm: number
  // floor_polygon already existed in the DB (jsonb, default '[]') but was never
  // part of this type or read anywhere — dead field. Now the traced boundary.
  floor_polygon: { x: number; y: number }[]
  obstacles: import('./index').ObstacleShape[]
  /** People limit when the room is set up seated / standing, set by the Venue Manager (migration 024). null = not set. */
  capacity_seated: number | null
  capacity_standing: number | null
  floor_plan_image_url: string | null
  floor_plan_image_width_px: number | null
  floor_plan_image_height_px: number | null
  cm_per_px: number | null
}

export type DbLayoutObject = {
  id: string
  project_id: string
  room_id: string
  catalog_item_id: string
  position_x_cm: number
  position_y_cm: number
  rotation_deg: number
  quantity: number
  extra_data: Record<string, unknown> | null
}

export type DbAgeGroup = 'adult' | 'child' | 'baby'

export type DbGuest = {
  id: string
  project_id: string
  name: string
  notes: string | null
  created_at: string
  // Migration 016
  is_vip: boolean
  gives_speech: boolean
  dietary: string | null
  age_group: DbAgeGroup
  family_id: string | null
  /** Path in the private `guest-photos` bucket: {team_id}/{project_id}/{uuid}.jpg */
  photo_path: string | null
  // Migration 018: planner says this guest will not sit (flag dismissed, with a reason)
  seat_dismissed_note: string | null
  seat_dismissed_at: string | null
  seat_dismissed_by: string | null
  // Migration 025: RSVP over a shared link. rsvp_status null = pending.
  rsvp_status: 'attending' | 'declined' | 'maybe' | null
  rsvp_at: string | null
  rsvp_source: 'link' | 'planner' | null
  rsvp_consent_at: string | null
  /** Added through the link (not on the list) or a plus-one: the planner has not looked at it yet. */
  rsvp_needs_review: boolean
  /** Set on a plus-one: the guest who brought them. */
  plus_one_of: string | null
}

/** One row per project (migration 025): the shared RSVP link and its settings. */
export type DbProjectRsvp = {
  project_id: string
  token: string
  enabled: boolean
  deadline: string | null
  welcome_message: string | null
  allow_plus_one: boolean
  created_at: string
  updated_at: string
}

export type DbGuestFamily = {
  id: string
  project_id: string
  name: string
  created_at: string
}

/** One night of one guest's stay. `night` = the evening of that date. */
export type DbGuestStay = {
  id: string
  project_id: string
  guest_id: string
  night: string
  hotel: string
  created_at: string
}

export type DbSeatAssignment = {
  id: string
  project_id: string
  guest_id: string
  layout_object_id: string
}
export type DbProjectActivity = {
  id: string
  project_id: string
  room_id: string | null
  actor_user_id: string | null
  actor_name: string | null
  entity: 'layout_object' | 'guest' | 'seat_assignment' | 'payment' | 'document' | 'timetable' | 'capacity'
  action:
    | 'added' | 'moved' | 'updated' | 'removed' | 'assigned' | 'unassigned' | 'reassigned'
    | 'marked_paid' | 'marked_unpaid' | 'new_version' | 'override'
  entity_id: string | null
  summary: {
    name?: string | null
    label?: string | null
    guest_name?: string | null
    vendor?: string | null // payment events
    kind?: string | null // document events
    version?: number | null // document events
    title?: string | null // timetable events
  }
  created_at: string
}

/** project_payments (migration 015). `paid_at` null = unpaid; overdue is derived, never stored. */
export type DbProjectPayment = {
  id: string
  project_id: string
  vendor_name: string
  /** Link to the team vendor list (migration 023); null = free text, not in the list. */
  vendor_id: string | null
  label: string
  amount: number // numeric(12,2)
  due_date: string // YYYY-MM-DD
  paid_at: string | null // YYYY-MM-DD
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type DbDocumentKind =
  | 'contract_draft' | 'signed_contract' | 'quote' | 'invoice' | 'insurance_permit' | 'receipt' | 'other'

/**
 * project_documents (migration 015, versions in 021). The file lives in the private `project-documents` bucket.
 * A document is a group of rows sharing `version_group_id`; the highest `version` is the current one.
 */
export type DbProjectDocument = {
  id: string
  project_id: string
  payment_id: string | null
  vendor_name: string | null
  kind: DbDocumentKind
  label: string
  storage_path: string // {team_id}/{project_id}/{uuid}.pdf
  size_bytes: number
  uploaded_by: string | null
  created_at: string
  version_group_id: string
  version: number
}

export type DbProjectZone = {
  id: string
  project_id: string
  room_id: string
  name: string
  color: string
  shape: Record<string, unknown>
  sort_order: number
  created_at: string
}

// ─── Stock Tracking (Phase 23) ─────────────────────────────────────────────

export type DbStockGroup = {
  id: string
  team_id: string
  name: string
  sort_order: number
  created_at: string
}

export type DbStockItem = {
  id: string
  team_id: string
  group_id: string | null
  name: string
  icon_type: 'emoji' | 'photo'
  icon_value: string | null
  cost_price: number
  sell_price: number
  min_stock_alert: number
  on_demand: boolean
  /** Sold every wedding but comes back afterwards (migration 022). */
  reusable: boolean
  reusable_since: string | null
  notes: string | null
  current_stock: number
  created_at: string
}

export type DbStockPurchase = {
  id: string
  item_id: string
  qty: number
  unit_cost: number
  supplier: string | null
  project_id: string | null
  purchased_at: string
}

export type DbStockSale = {
  id: string
  item_id: string
  qty: number
  unit_price: number
  unit_cost_snapshot: number
  project_id: string | null
  sold_at: string
  /** Reusable items: how many came back (0 until confirmed). Migration 022. */
  returned_qty: number
  return_confirmed_at: string | null
}

export type DbStockOrder = {
  id: string
  team_id: string
  item_id: string | null
  project_id: string | null
  qty: number
  status: 'pending' | 'received'
  ordered_at: string
}

// Migration 019 — Timetable & Run-Down

export type DbTeamVendor = {
  id: string
  team_id: string
  name: string
  colour: string
  contact_name: string | null
  phone: string | null
  email: string | null
  instagram: string | null
  notes: string | null
  created_at: string
}

export type DbProjectDay = {
  id: string
  project_id: string
  label: string
  day_date: string | null
  position: number
  created_at: string
}

export type DbTimetableBlock = {
  id: string
  project_id: string
  day_id: string
  title: string
  /** Minutes from midnight of the block's day (0–1439). */
  start_min: number
  /** Minutes from midnight of the same day; up to 1800 (06:00 next day). */
  end_min: number
  vendor_id: string | null
  person: string | null
  notes: string | null
  materials: string[]
  show_vendor: boolean
  show_contact: boolean
  show_instagram: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Per project and room: is the room a Seated or a Standing scene here, and an acknowledged over-the-limit note (migration 024). */
export type DbProjectRoomSetting = {
  id: string
  project_id: string
  room_id: string
  mode: 'seated' | 'standing'
  override_note: string | null
  override_load: number | null
  created_at: string
  updated_at: string
}
