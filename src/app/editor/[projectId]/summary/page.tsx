import { projectTitle } from '@/lib/projectTitle'
import { createClient } from '@/lib/supabase/server'
import { getAllLayoutObjectsForProject, getAllProjectZones } from '@/lib/supabase/queries'
import { zoneAreaM2 } from '@/lib/zones'
import type { ProjectZone } from '@/types'
import Link from 'next/link'
import type { DbCatalogItem } from '@/types/db'
import type { PdfExportData } from '@/lib/pdfExport/types'
import { loadPdfExportData } from '@/lib/pdfExport/loadData'
import ExportPanel from './ExportPanel'
import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { STOCK_TRACKED_CATEGORIES, tableSettingDemand } from '@/lib/tableSetting'

type Params = { projectId: string }

export default async function ProjectSummaryPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params
  const t = await getTranslations('Summary')
  const tpdf = await getTranslations('Pdf')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">{t('notSignedIn')}</p>
      </main>
    )
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, venue_id, team_id, event_date, status, couple_names, venues(name)')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-red-600">{t('notFound')}</p>
      </main>
    )
  }

  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? tpdf('unknownVenue')
  const title = projectTitle(project.couple_names, venueName)

  const [layoutObjects, { data: venueStockRows }, { data: rentalCompanies }, zones, { data: roomRows }] = await Promise.all([
    getAllLayoutObjectsForProject(projectId, supabase),
    supabase.from('catalog_item_stock').select('catalog_item_id, quantity').eq('owner_type', 'venue').eq('owner_id', project.venue_id),
    supabase.from('rental_companies').select('id, name').order('name'),
    getAllProjectZones(projectId, supabase),
    supabase.from('rooms').select('id, name').eq('venue_id', project.venue_id),
  ])
  const roomNameById = new Map<string, string>((roomRows ?? []).map((r) => [r.id, r.name]))

  // PDF export data (planner team only; null for anyone else). RLS on the tables it reads is the real gate.
  const exportData: PdfExportData | null = await loadPdfExportData(supabase, projectId, tpdf)

  const zoneLegend = <ZoneLegend zones={zones} roomNameById={roomNameById} />

  // How many of each catalog item are actually placed across every room, plus the plates,
  // glasses, candles… that the tables' settings call for (those aren't placed objects).
  const placedCounts = new Map<string, number>()
  for (const obj of layoutObjects) {
    placedCounts.set(obj.catalogItemId, (placedCounts.get(obj.catalogItemId) ?? 0) + 1)
  }
  const settingItemIds = new Set<string>()
  for (const obj of layoutObjects) {
    if (obj.isChairFor) continue
    for (const line of obj.tableSetting?.items ?? []) settingItemIds.add(line.catalogItemId)
  }
  const usedItemIds = [...new Set([...placedCounts.keys(), ...settingItemIds])]

  if (usedItemIds.length === 0) {
    return (
      <SummaryShell projectId={projectId} title={title}>
        {exportData && <ExportPanel data={exportData} />}
        <p className="text-sm text-gray-400">{t('nothingPlaced')}</p>
        {zoneLegend}
      </SummaryShell>
    )
  }

  const [{ data: catalogItems }, { data: rentalStockRows }] = await Promise.all([
    supabase.from('catalog_items').select('*').in('id', usedItemIds),
    supabase
      .from('catalog_item_stock')
      .select('catalog_item_id, owner_id, quantity')
      .eq('owner_type', 'rental_company')
      .in('catalog_item_id', usedItemIds),
  ])

  const catalogById = new Map<string, DbCatalogItem>((catalogItems ?? []).map((c) => [c.id, c]))

  // Per-seat items multiply by each table's chairs; per-table items count once per table.
  const onTablesCounts = tableSettingDemand(layoutObjects, new Map([...catalogById].map(([id, c]) => [id, c.scope ?? null])))
  const usedCounts = new Map<string, number>()
  for (const id of usedItemIds) usedCounts.set(id, (placedCounts.get(id) ?? 0) + (onTablesCounts.get(id) ?? 0))
  const venueStockById = new Map<string, number>((venueStockRows ?? []).map((r) => [r.catalog_item_id, r.quantity]))
  const rentalCompanyNameById = new Map<string, string>((rentalCompanies ?? []).map((rc) => [rc.id, rc.name]))

  // catalogItemId -> [{ companyName, quantity }]
  const rentalAvailabilityByItem = new Map<string, { companyName: string; quantity: number }[]>()
  for (const row of rentalStockRows ?? []) {
    if (row.quantity <= 0) continue
    const companyName = rentalCompanyNameById.get(row.owner_id) ?? tpdf('unknownRental')
    const list = rentalAvailabilityByItem.get(row.catalog_item_id) ?? []
    list.push({ companyName, quantity: row.quantity })
    rentalAvailabilityByItem.set(row.catalog_item_id, list)
  }

  const rows = usedItemIds
    .map((id) => {
      const item = catalogById.get(id)
      const used = usedCounts.get(id) ?? 0
      // Stock tracking covers tables, chairs and the table-setting categories (plates,
      // cutlery, glassware, candles, flowers). Everything else (decorations) has no
      // catalog_item_stock rows, so venueStock reads as 0 and every unit would look like
      // a "shortfall." Track that distinction so the UI can show "not tracked" instead
      // of a false shortfall for categories that were never in scope for stock.
      const isStockTracked = !!item && STOCK_TRACKED_CATEGORIES.includes(item.category)
      const venueStock = venueStockById.get(id) ?? 0
      const shortfall = isStockTracked ? Math.max(0, used - venueStock) : 0
      return {
        id,
        name: item?.name ?? tpdf('unknownItem'),
        category: item?.category ?? 'other',
        used,
        onTables: onTablesCounts.get(id) ?? 0,
        venueStock,
        isStockTracked,
        shortfall,
        rentalAvailability: rentalAvailabilityByItem.get(id) ?? [],
      }
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

  const totalShortfallItems = rows.filter((r) => r.shortfall > 0).length

  return (
    <SummaryShell projectId={projectId} title={title}>
      {exportData && <ExportPanel data={exportData} />}
      {totalShortfallItems > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('exceed', { count: totalShortfallItems, venue: venueName })}
        </div>
      )}

      <table className="w-full text-sm bg-white rounded-xl border border-gray-100 overflow-hidden">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2 font-medium">{t('colItem')}</th>
            <th className="text-right px-4 py-2 font-medium">{t('colPlaced')}</th>
            <th className="text-right px-4 py-2 font-medium">{t('colVenueHas')}</th>
            <th className="text-left px-4 py-2 font-medium">{t('colNeedRent')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className={row.shortfall > 0 ? 'bg-amber-50' : undefined}>
              <td className="px-4 py-2.5 text-gray-900">
                {row.name}
                {row.onTables > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    {row.onTables === row.used ? t('onTables') : t('nOnTables', { count: row.onTables })}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-700">{row.used}</td>
              <td className="px-4 py-2.5 text-right text-gray-700">
                {row.isStockTracked ? row.venueStock : <span className="text-gray-300">{t('notTracked')}</span>}
              </td>
              <td className="px-4 py-2.5">
                {row.shortfall > 0 ? (
                  <div>
                    <span className="font-medium text-amber-700">{t('short', { count: row.shortfall })}</span>
                    {row.rentalAvailability.length > 0 ? (
                      <span className="text-gray-500">
                        {' '}
                        — {t('available')}{' '}
                        {row.rentalAvailability.map((a, i) => (
                          <span key={a.companyName}>
                            {i > 0 && ', '}
                            {a.companyName} ({a.quantity})
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-red-500"> — {t('noRentalStock')}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {zoneLegend}
    </SummaryShell>
  )
}

/** Phase 4b: zone legend per room. Renders nothing when the project has no zones. */
function ZoneLegend({ zones, roomNameById }: { zones: ProjectZone[]; roomNameById: Map<string, string> }) {
  const t = useTranslations('Summary')
  if (zones.length === 0) return null
  const byRoom = new Map<string, ProjectZone[]>()
  for (const z of zones) byRoom.set(z.roomId, [...(byRoom.get(z.roomId) ?? []), z])
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">{t('zones')}</h2>
      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
        {[...byRoom.entries()].map(([roomId, roomZones]) => (
          <div key={roomId} className="px-4 py-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">{roomNameById.get(roomId) ?? t('room')}</p>
            <ul className="space-y-1">
              {roomZones.map((z) => (
                <li key={z.id} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-sm border border-black/10" style={{ backgroundColor: z.color }} />
                  <span className="text-gray-900">{z.name}</span>
                  <span className="text-gray-400 text-xs ml-auto">{zoneAreaM2(z).toFixed(1)} m²</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function SummaryShell({
  projectId,
  title,
  children,
}: {
  projectId: string
  title: string
  children: React.ReactNode
}) {
  const t = useTranslations('Summary')
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-semibold text-gray-900">{t('title', { title })}</h1>
          <Link href={`/editor/${projectId}`} className="text-sm text-blue-600 hover:underline">
            {t('backToEditor')}
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          {t('intro')}
        </p>
        {children}
      </div>
    </main>
  )
}
