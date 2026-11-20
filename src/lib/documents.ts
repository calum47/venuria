/**
 * Pure helpers for the "Contracts & other documents" list (migration 021):
 * grouping versions, searching, vendor filtering and sorting. No Supabase,
 * no React — so the rules live in one place and can be checked on their own.
 */
import type { DbProjectDocument } from '@/types/db'
import { DOC_KIND_LABEL } from '@/lib/payments'

/** One document = all its versions. `current` is the highest version; `previous` is newest-first. */
export type DocGroup = {
  id: string // version_group_id
  current: DbProjectDocument
  previous: DbProjectDocument[]
}

export type DocSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc'

export const DOC_SORT_LABEL: Record<DocSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name_asc: 'Name A–Z',
  name_desc: 'Name Z–A',
}

/** Sentinel for "documents with no vendor" in the vendor filter. Not a possible vendor name. */
export const NO_VENDOR = '\u0000none'

export type DocFilters = {
  query: string
  /** Normalised vendor keys (see vendorKey) and/or NO_VENDOR. Empty = no vendor filter. */
  vendors: ReadonlySet<string>
  sort: DocSort
}

/** Lower-case, accent-insensitive, trimmed: "Sensación " and "sensacion" match. */
export function normalise(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function vendorKey(name: string | null): string {
  const k = normalise(name ?? '')
  return k === '' ? NO_VENDOR : k
}

const byVersionDesc = (a: DbProjectDocument, b: DbProjectDocument) => b.version - a.version

export function groupDocuments(docs: readonly DbProjectDocument[]): DocGroup[] {
  const m = new Map<string, DbProjectDocument[]>()
  for (const d of docs) {
    const list = m.get(d.version_group_id)
    if (list) list.push(d)
    else m.set(d.version_group_id, [d])
  }
  const groups: DocGroup[] = []
  for (const [id, list] of m) {
    const sorted = [...list].sort(byVersionDesc)
    groups.push({ id, current: sorted[0], previous: sorted.slice(1) })
  }
  return groups
}

/** The next version number for a group (max + 1). */
export function nextVersion(group: DocGroup): number {
  return group.current.version + 1
}

export type VendorOption = { key: string; label: string }

/** Distinct vendors across the groups (case/accent-insensitive; first spelling wins), A–Z. */
export function vendorOptions(groups: readonly DocGroup[]): { vendors: VendorOption[]; hasNoVendor: boolean } {
  const seen = new Map<string, string>()
  let hasNoVendor = false
  for (const g of groups) {
    const key = vendorKey(g.current.vendor_name)
    if (key === NO_VENDOR) hasNoVendor = true
    else if (!seen.has(key)) seen.set(key, (g.current.vendor_name ?? '').trim())
  }
  const vendors = [...seen].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  return { vendors, hasNoVendor }
}

function haystack(g: DocGroup): string {
  const d = g.current
  return normalise(`${d.label} ${d.vendor_name ?? ''} ${DOC_KIND_LABEL[d.kind]}`)
}

export function filterAndSort(groups: readonly DocGroup[], f: DocFilters): DocGroup[] {
  const terms = normalise(f.query).split(/\s+/).filter(Boolean)
  const out = groups.filter((g) => {
    if (f.vendors.size > 0 && !f.vendors.has(vendorKey(g.current.vendor_name))) return false
    if (terms.length === 0) return true
    const h = haystack(g)
    return terms.every((t) => h.includes(t))
  })
  const name = (g: DocGroup) => g.current.label
  const cmpName = (a: DocGroup, b: DocGroup) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true })
  // "Date uploaded" is the current version's date — the one the row displays.
  const cmpDate = (a: DocGroup, b: DocGroup) =>
    a.current.created_at < b.current.created_at ? -1 : a.current.created_at > b.current.created_at ? 1 : 0
  const cmp: Record<DocSort, (a: DocGroup, b: DocGroup) => number> = {
    newest: (a, b) => cmpDate(b, a) || cmpName(a, b),
    oldest: (a, b) => cmpDate(a, b) || cmpName(a, b),
    name_asc: (a, b) => cmpName(a, b) || cmpDate(b, a),
    name_desc: (a, b) => cmpName(b, a) || cmpDate(b, a),
  }
  return [...out].sort(cmp[f.sort])
}
