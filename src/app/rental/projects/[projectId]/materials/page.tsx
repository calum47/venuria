import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getAllLayoutObjectsForProject } from '@/lib/supabase/queries'
import { tableSettingDemand } from '@/lib/tableSetting'
import { categoryLabel } from '@/lib/categories'
import { projectTitle } from '@/lib/projectTitle'
import type { DbCatalogItem } from '@/types/db'
import VendorShell from '@/components/vendor/VendorShell'
import { loadVendorProject } from '../loadVendorProject'

/**
 * Materials for a vendor: how many of each item the project uses (placed on the plans plus what the
 * tables' settings call for). Counts only: no stock, no prices, no guests.
 */
export default async function VendorMaterialsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const t = await getTranslations('VendorProjects')
  const tcat = await getTranslations('Categories')
  const tc = await getTranslations('Common')
  const supabase = await createClient()
  const v = await loadVendorProject(supabase, projectId)
  if (!v) return <main className="p-8"><p className="text-sm text-gray-500">{t('noAccess')}</p></main>
  const { ctx, project } = v
  const title = projectTitle(project.couple_names, project.venueName ?? tc('unknownVenue'))

  const objects = await getAllLayoutObjectsForProject(projectId, supabase)
  const placed = new Map<string, number>()
  for (const o of objects) placed.set(o.catalogItemId, (placed.get(o.catalogItemId) ?? 0) + 1)
  const settingIds = new Set<string>()
  for (const o of objects) {
    if (o.isChairFor) continue
    for (const line of o.tableSetting?.items ?? []) settingIds.add(line.catalogItemId)
  }
  const ids = [...new Set([...placed.keys(), ...settingIds])]
  const { data: items } = ids.length > 0 ? await supabase.from('catalog_items').select('*').in('id', ids) : { data: [] }
  const byId = new Map<string, DbCatalogItem>(((items ?? []) as DbCatalogItem[]).map((c) => [c.id, c]))
  const onTables = tableSettingDemand(objects, new Map([...byId].map(([id, c]) => [id, c.scope ?? null])))

  const rows = ids
    .map((id) => {
      const c = byId.get(id)
      return { id, name: c?.name ?? t('unknownItem'), category: c?.category ?? 'other', qty: (placed.get(id) ?? 0) + (onTables.get(id) ?? 0), onTables: onTables.get(id) ?? 0 }
    })
    .filter((r) => r.qty > 0)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  const categories = [...new Set(rows.map((r) => r.category))]

  // What the planner has asked THIS vendor for on this project, and the answer given.
  const { data: asked } = await supabase
    .from('project_item_sources')
    .select('catalog_item_id, requested_quantity, quantity, status')
    .eq('project_id', projectId)
    .eq('rental_company_id', ctx.companyId)
  const askedNames = new Map(rows.map((r) => [r.id, r.name]))
  const missingIds = (asked ?? []).map((a) => a.catalog_item_id).filter((id) => !askedNames.has(id))
  if (missingIds.length > 0) {
    const { data: more } = await supabase.from('catalog_items').select('id, name').in('id', missingIds)
    for (const m of more ?? []) askedNames.set(m.id, m.name)
  }

  return (
    <VendorShell ctx={ctx}>
      <main className="px-4 sm:px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <Link href={`/rental/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-900">← {title}</Link>
            <h1 className="mt-2 text-3xl font-semibold text-gray-900">{t('materials')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('materialsIntro')}</p>
          </div>
          {(asked ?? []).length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-gray-900">{t('requestedFromYou')}</h2>
                <Link href="/rental/requests" className="text-xs text-brand-700 hover:underline">{t('answerRequests')}</Link>
              </div>
              <ul className="divide-y divide-gray-100 rounded-xl border border-brand-100 bg-white">
                {(asked ?? []).map((a) => (
                  <li key={a.catalog_item_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="text-gray-900">{askedNames.get(a.catalog_item_id) ?? t('unknownItem')}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{a.requested_quantity}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${a.status === 'accepted' ? 'bg-green-100 text-green-800' : a.status === 'declined' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                        {a.status === 'pending' && t('requestPending')}
                        {a.status === 'accepted' && (a.quantity < a.requested_quantity ? t('requestAcceptedPart', { granted: a.quantity, asked: a.requested_quantity }) : t('requestAccepted'))}
                        {a.status === 'declined' && t('requestDeclined')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">{t('nothingPlaced')}</p>
          ) : (
            categories.map((cat) => (
              <section key={cat}>
                <h2 className="text-sm font-semibold text-gray-900 mb-2">{categoryLabel(tcat, cat)}</h2>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                  {rows.filter((r) => r.category === cat).map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-900">
                        {r.name}
                        {r.onTables > 0 && <span className="ml-2 text-xs text-gray-400">{t('onTables', { count: r.onTables })}</span>}
                      </span>
                      <span className="font-medium text-gray-900">{r.qty}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </main>
    </VendorShell>
  )
}
