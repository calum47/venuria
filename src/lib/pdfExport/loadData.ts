import type { SupabaseClient } from '@supabase/supabase-js'
import { projectTitle } from '@/lib/projectTitle'
import { mapDbObject } from '@/lib/supabase/queries'
import { getAllProjectZones } from '@/lib/supabase/queries'
import { STOCK_TRACKED_CATEGORIES, tableSettingDemand } from '@/lib/tableSetting'
import type { DbCatalogItem, DbGuest, DbGuestFamily, DbLayoutObject, DbRoom } from '@/types/db'
import { normalizePdfStyle } from './style'
import type { PdfExportData, PdfItemRow } from './types'
import type { Tr } from '@/i18n/types'

/**
 * Everything the project PDF needs, read with the caller's own session (RLS is the real gate).
 * Used by the project's Summary page (the Export PDF button) and by Settings → Exports (the
 * live preview), so both always show the same thing.
 *
 * Returns null when the project is missing or the caller is not on the planner team that owns it.
 */
export async function loadPdfExportData(supabase: SupabaseClient, projectId: string, t: Tr): Promise<PdfExportData | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('id, venue_id, team_id, event_date, couple_names, venues(name)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return null

  const { data: canPlan } = await supabase.rpc('planner_can_access_project', { pid: projectId })
  if (canPlan !== true) return null

  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? t('unknownVenue')
  const venueId = project.venue_id as string

  const [
    { data: team },
    { data: fullRooms },
    { data: rawObjects },
    { data: guestRows },
    { data: familyRows },
    { data: seatRows },
    { data: venueStockRows },
    { data: rentalCompanies },
    zones,
  ] = await Promise.all([
    project.team_id
      ? supabase.from('teams').select('name, export_style, logo_path').eq('id', project.team_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('rooms').select('*').eq('venue_id', venueId).order('name'),
    supabase.from('layout_objects').select('*').eq('project_id', projectId),
    supabase.from('guests').select('*').eq('project_id', projectId),
    supabase.from('guest_families').select('*').eq('project_id', projectId),
    supabase.from('seat_assignments').select('guest_id, layout_object_id').eq('project_id', projectId),
    supabase.from('catalog_item_stock').select('catalog_item_id, quantity').eq('owner_type', 'venue').eq('owner_id', venueId),
    supabase.from('rental_companies').select('id, name').order('name'),
    getAllProjectZones(projectId, supabase),
  ])

  const objects = ((rawObjects ?? []) as DbLayoutObject[]).map((o) => ({ ...mapDbObject(o), roomId: o.room_id }))

  // ── Items: how many of each catalog item the project uses (placed + on the tables' settings) ──
  const placedCounts = new Map<string, number>()
  for (const o of objects) placedCounts.set(o.catalogItemId, (placedCounts.get(o.catalogItemId) ?? 0) + 1)
  const settingItemIds = new Set<string>()
  for (const o of objects) {
    if (o.isChairFor) continue
    for (const line of o.tableSetting?.items ?? []) settingItemIds.add(line.catalogItemId)
  }
  const usedItemIds = [...new Set([...placedCounts.keys(), ...settingItemIds])]

  let catalogItems: DbCatalogItem[] = []
  let rentalStockRows: { catalog_item_id: string; owner_id: string; quantity: number }[] = []
  if (usedItemIds.length > 0) {
    const [{ data: items }, { data: stock }] = await Promise.all([
      supabase.from('catalog_items').select('*').in('id', usedItemIds),
      supabase
        .from('catalog_item_stock')
        .select('catalog_item_id, owner_id, quantity')
        .eq('owner_type', 'rental_company')
        .in('catalog_item_id', usedItemIds),
    ])
    catalogItems = (items ?? []) as DbCatalogItem[]
    rentalStockRows = (stock ?? []) as typeof rentalStockRows
  }
  const catalogById = new Map(catalogItems.map((c) => [c.id, c]))

  const onTables = tableSettingDemand(objects, new Map([...catalogById].map(([id, c]) => [id, c.scope ?? null])))
  const venueStockById = new Map<string, number>((venueStockRows ?? []).map((r) => [r.catalog_item_id as string, r.quantity as number]))
  const companyName = new Map<string, string>((rentalCompanies ?? []).map((rc) => [rc.id as string, rc.name as string]))
  const rentalByItem = new Map<string, { companyName: string; quantity: number }[]>()
  for (const row of rentalStockRows) {
    if (row.quantity <= 0) continue
    const list = rentalByItem.get(row.catalog_item_id) ?? []
    list.push({ companyName: companyName.get(row.owner_id) ?? t('unknownRental'), quantity: row.quantity })
    rentalByItem.set(row.catalog_item_id, list)
  }

  const itemRows: PdfItemRow[] = usedItemIds
    .map((id) => {
      const item = catalogById.get(id)
      const used = (placedCounts.get(id) ?? 0) + (onTables.get(id) ?? 0)
      // Only tables, chairs and the table-setting categories have stock rows; decorations are "not tracked".
      const isStockTracked = !!item && STOCK_TRACKED_CATEGORIES.includes(item.category)
      const venueStock = venueStockById.get(id) ?? 0
      return {
        name: item?.name ?? t('unknownItem'),
        category: item?.category ?? 'other',
        used,
        venueStock,
        isStockTracked,
        shortfall: isStockTracked ? Math.max(0, used - venueStock) : 0,
        rentalAvailability: rentalByItem.get(id) ?? [],
      }
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

  const familyName = new Map(((familyRows ?? []) as DbGuestFamily[]).map((f) => [f.id, f.name]))
  const teamRow = team as { name: string; export_style: unknown; logo_path: string | null } | null

  return {
    venueName,
    projectTitle: projectTitle(project.couple_names as string | null, venueName),
    teamName: teamRow?.name ?? '',
    eventDate: (project as { event_date: string | null }).event_date ?? null,
    rooms: ((fullRooms ?? []) as DbRoom[]).map((r) => ({
      id: r.id,
      name: r.name,
      polygon: r.floor_polygon ?? [],
      widthCm: r.bounding_box_width_cm,
      depthCm: r.bounding_box_depth_cm,
      obstacles: r.obstacles ?? [],
    })),
    objects,
    catalog: Object.fromEntries(
      catalogItems.map((c) => [c.id, { name: c.name, category: c.category, widthCm: c.width_cm, depthCm: c.depth_cm }]),
    ),
    zones,
    itemRows,
    // Guests who declined are not coming: leave them out of the counts, the guest list and the "not seated" list.
    guests: ((guestRows ?? []) as DbGuest[])
      .filter((g) => g.rsvp_status !== 'declined')
      .map((g) => ({
        id: g.id,
        name: g.name,
        vip: g.is_vip,
        speech: g.gives_speech,
        ageGroup: g.age_group,
        dietary: g.dietary,
        notes: g.notes,
        family: g.family_id ? (familyName.get(g.family_id) ?? null) : null,
        seatDismissed: !!g.seat_dismissed_at,
      })),
    assignments: (seatRows ?? []).map((a) => ({ guestId: a.guest_id as string, layoutObjectId: a.layout_object_id as string })),
    teamStyle: normalizePdfStyle(teamRow?.export_style),
    logoPath: teamRow?.logo_path ?? null,
  }
}
