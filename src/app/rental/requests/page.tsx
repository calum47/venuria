import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getVendorContext } from '@/lib/supabase/vendorContext'
import { projectTitle } from '@/lib/projectTitle'
import VendorShell from '@/components/vendor/VendorShell'
import RequestRow, { type RequestItem } from './RequestRow'

/** A planner asks this vendor for N of an item for a project; here the vendor accepts, accepts part, or declines. */
export default async function VendorRequestsPage() {
  const t = await getTranslations('VendorRequests')
  const tv = await getTranslations('VendorProjects')
  const tc = await getTranslations('Common')
  const supabase = await createClient()
  const ctx = await getVendorContext(supabase)
  if (!ctx) return <main className="p-8"><p className="text-sm text-gray-500">{tv('noAccess')}</p></main>

  const { data } = await supabase
    .from('project_item_sources')
    .select('project_id, catalog_item_id, requested_quantity, quantity, status, projects(event_date, couple_names, venues(name)), catalog_items(name)')
    .eq('rental_company_id', ctx.companyId)
  const { data: stockRows } = await supabase
    .from('catalog_item_stock').select('catalog_item_id, quantity').eq('owner_type', 'rental_company').eq('owner_id', ctx.companyId)
  const stockById = new Map((stockRows ?? []).map((s) => [s.catalog_item_id, s.quantity as number]))

  const rows: RequestItem[] = await Promise.all(
    (data ?? []).map(async (r) => {
      const p = r.projects as unknown as { event_date: string | null; couple_names: string | null; venues: { name: string } | null } | null
      const { data: booked } = await supabase.rpc('my_committed_that_day', { p_project: r.project_id, p_item: r.catalog_item_id })
      return {
        projectId: r.project_id,
        itemId: r.catalog_item_id,
        itemName: (r.catalog_items as unknown as { name: string } | null)?.name ?? tv('unknownItem'),
        projectTitle: projectTitle(p?.couple_names ?? null, p?.venues?.name ?? tc('unknownVenue')),
        eventDate: p?.event_date ?? null,
        requested: r.requested_quantity,
        granted: r.quantity,
        status: r.status as RequestItem['status'],
        stock: stockById.get(r.catalog_item_id) ?? 0,
        bookedElsewhere: (booked as number | null) ?? 0,
      }
    }),
  )
  const byDate = (a: RequestItem, b: RequestItem) => (a.eventDate ?? '9999').localeCompare(b.eventDate ?? '9999')
  const pending = rows.filter((r) => r.status === 'pending').sort(byDate)
  const answered = rows.filter((r) => r.status !== 'pending').sort(byDate)

  return (
    <VendorShell ctx={ctx}>
      <main className="px-4 sm:px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('intro')}</p>
          </div>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">{t('waiting', { count: pending.length })}</h2>
            {pending.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">{t('nothingWaiting')}</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                {pending.map((r) => <RequestRow key={`${r.projectId}:${r.itemId}`} r={r} />)}
              </ul>
            )}
          </section>
          {answered.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">{t('answered')}</h2>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                {answered.map((r) => <RequestRow key={`${r.projectId}:${r.itemId}`} r={r} />)}
              </ul>
            </section>
          )}
        </div>
      </main>
    </VendorShell>
  )
}
