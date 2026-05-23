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

export type DbGuest = {
  id: string
  project_id: string
  name: string
  notes: string | null
  created_at: string
}

export type DbSeatAssignment = {
  id: string
  project_id: string
  guest_id: string
  layout_object_id: string
}