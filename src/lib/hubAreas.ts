/**
 * Project Hub: one summary row per room of the venue (all of them — decided 28 Sep 2026, no
 * per-project selection). Pure so it can be tested without a database.
 */

export type HubRoom = { id: string; name: string; type: string | null }
export type HubObject = { id: string; room_id: string | null; catalog_item_id: string | null }
export type HubAssignment = { layout_object_id: string }

export type AreaSummary = {
  id: string
  name: string
  type: string | null
  tables: number
  chairs: number
  other: number
  /** Chairs in this room that have a guest assigned. */
  seated: number
  empty: boolean
}

export function summariseAreas(
  rooms: HubRoom[],
  objects: HubObject[],
  categoryByItemId: Map<string, string>,
  assignments: HubAssignment[],
): AreaSummary[] {
  const roomOfObject = new Map<string, string | null>()
  const acc = new Map<string, { tables: number; chairs: number; other: number; seated: number }>()
  for (const r of rooms) acc.set(r.id, { tables: 0, chairs: 0, other: 0, seated: 0 })

  for (const o of objects) {
    roomOfObject.set(o.id, o.room_id)
    const a = o.room_id ? acc.get(o.room_id) : undefined
    if (!a) continue // belongs to a room of another venue / no room: not shown
    const cat = o.catalog_item_id ? categoryByItemId.get(o.catalog_item_id) : undefined
    if (cat === 'tables') a.tables++
    else if (cat === 'chairs') a.chairs++
    else a.other++
  }
  for (const s of assignments) {
    const room = roomOfObject.get(s.layout_object_id)
    const a = room ? acc.get(room) : undefined
    if (a) a.seated++
  }

  return rooms.map((r) => {
    const a = acc.get(r.id)!
    return { id: r.id, name: r.name, type: r.type, ...a, empty: a.tables + a.chairs + a.other === 0 }
  })
}

/** One-line description of an area card, e.g. "12 tables · 96 chairs · 80 seated". */
export function areaHint(a: AreaSummary): string {
  if (a.empty) return 'Nothing placed yet'
  const parts: string[] = []
  if (a.tables) parts.push(`${a.tables} ${a.tables === 1 ? 'table' : 'tables'}`)
  if (a.chairs) parts.push(`${a.chairs} ${a.chairs === 1 ? 'chair' : 'chairs'}`)
  if (a.other) parts.push(`${a.other} other ${a.other === 1 ? 'item' : 'items'}`)
  if (a.chairs) parts.push(`${a.seated} seated`)
  return parts.join(' · ')
}
