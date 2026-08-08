import { createClient } from '@/lib/supabase/server'
import { getAllLayoutObjectsForProject } from '@/lib/supabase/queries'
import Link from 'next/link'
import { DbCatalogItem } from '@/types/db'

type Params = { projectId: string }

export default async function ProjectSummaryPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">Not signed in.</p>
      </main>
    )
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, venue_id, status, venues(name)')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-red-600">Project not found, or you don&apos;t have access to it.</p>
      </main>
    )
  }

  const venueName = (project.venues as unknown as { name: string } | null)?.name ?? 'Unknown venue'

  const [layoutObjects, { data: venueStockRows }, { data: rentalCompanies }] = await Promise.all([
    getAllLayoutObjectsForProject(projectId),
    supabase.from('catalog_item_stock').select('catalog_item_id, quantity').eq('owner_type', 'venue').eq('owner_id', project.venue_id),
    supabase.from('rental_companies').select('id, name').order('name'),
  ])

  // How many of each catalog item are actually placed across every room.
  const usedCounts = new Map<string, number>()
  for (const obj of layoutObjects) {
    usedCounts.set(obj.catalogItemId, (usedCounts.get(obj.catalogItemId) ?? 0) + 1)
  }
  const usedItemIds = [...usedCounts.keys()]

  if (usedItemIds.length === 0) {
    return (
      <SummaryShell projectId={projectId} venueName={venueName}>
        <p className="text-sm text-gray-400">Nothing placed in this project yet.</p>
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
  const venueStockById = new Map<string, number>((venueStockRows ?? []).map((r) => [r.catalog_item_id, r.quantity]))
  const rentalCompanyNameById = new Map<string, string>((rentalCompanies ?? []).map((rc) => [rc.id, rc.name]))

  // catalogItemId -> [{ companyName, quantity }]
  const rentalAvailabilityByItem = new Map<string, { companyName: string; quantity: number }[]>()
  for (const row of rentalStockRows ?? []) {
    if (row.quantity <= 0) continue
    const companyName = rentalCompanyNameById.get(row.owner_id) ?? 'Unknown rental company'
    const list = rentalAvailabilityByItem.get(row.catalog_item_id) ?? []
    list.push({ companyName, quantity: row.quantity })
    rentalAvailabilityByItem.set(row.catalog_item_id, list)
  }

  const rows = usedItemIds
    .map((id) => {
      const item = catalogById.get(id)
      const used = usedCounts.get(id) ?? 0
      // Stock tracking only covers tables/chairs for now — everything else
      // (decorations) has no catalog_item_stock rows, so venueStock reads as
      // 0 and every unit would look like a "shortfall." Track that
      // distinction so the UI can show "not tracked" instead of a false
      // shortfall for categories that were never in scope for stock.
      const isStockTracked = item?.category === 'tables' || item?.category === 'chairs'
      const venueStock = venueStockById.get(id) ?? 0
      const shortfall = isStockTracked ? Math.max(0, used - venueStock) : 0
      return {
        id,
        name: item?.name ?? 'Unknown item',
        category: item?.category ?? 'other',
        used,
        venueStock,
        isStockTracked,
        shortfall,
        rentalAvailability: rentalAvailabilityByItem.get(id) ?? [],
      }
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

  const totalShortfallItems = rows.filter((r) => r.shortfall > 0).length

  return (
    <SummaryShell projectId={projectId} venueName={venueName}>
      {totalShortfallItems > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {totalShortfallItems} item{totalShortfallItems === 1 ? '' : 's'} exceed what {venueName} has in stock —
          see the highlighted rows below for what to rent.
        </div>
      )}

      <table className="w-full text-sm bg-white rounded-xl border border-gray-100 overflow-hidden">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Item</th>
            <th className="text-right px-4 py-2 font-medium">Placed</th>
            <th className="text-right px-4 py-2 font-medium">Venue has</th>
            <th className="text-left px-4 py-2 font-medium">Need to rent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className={row.shortfall > 0 ? 'bg-amber-50' : undefined}>
              <td className="px-4 py-2.5 text-gray-900">{row.name}</td>
              <td className="px-4 py-2.5 text-right text-gray-700">{row.used}</td>
              <td className="px-4 py-2.5 text-right text-gray-700">
                {row.isStockTracked ? row.venueStock : <span className="text-gray-300">not tracked</span>}
              </td>
              <td className="px-4 py-2.5">
                {row.shortfall > 0 ? (
                  <div>
                    <span className="font-medium text-amber-700">{row.shortfall} short</span>
                    {row.rentalAvailability.length > 0 ? (
                      <span className="text-gray-500">
                        {' '}
                        — available:{' '}
                        {row.rentalAvailability.map((a, i) => (
                          <span key={a.companyName}>
                            {i > 0 && ', '}
                            {a.companyName} ({a.quantity})
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-red-500"> — no rental company has stock for this yet</span>
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
    </SummaryShell>
  )
}

function SummaryShell({
  projectId,
  venueName,
  children,
}: {
  projectId: string
  venueName: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold text-gray-900">Project Summary — {venueName}</h1>
          <Link href={`/editor/${projectId}`} className="text-sm text-blue-600 hover:underline">
            ← Back to editor
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Placed items compared against the venue&apos;s own stock. Only tables and chairs are stock-tracked
          right now — decorations show what&apos;s placed but aren&apos;t compared against anything yet.
        </p>
        {children}
      </div>
    </main>
  )
}
