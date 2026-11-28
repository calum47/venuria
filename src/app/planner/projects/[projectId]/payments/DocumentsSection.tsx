'use client'

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { DbDocumentKind, DbProjectDocument } from '@/types/db'
import {
  deleteDocumentGroup,
  deleteProjectDocument,
  getDocumentUrl,
  updateDocumentGroup,
} from '@/lib/supabase/paymentQueries'
import { PROJECT_DOC_KINDS, formatBytes } from '@/lib/payments'
import {
  docSortLabel,
  NO_VENDOR,
  filterAndSort,
  groupDocuments,
  nextVersion,
  vendorKey,
  vendorOptions,
  type DocGroup,
  type DocSort,
} from '@/lib/documents'
import { formatDate } from '@/lib/projectDates'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { Labelled, UploadForm, btn, btnPrimary, errMsg, input } from './documentUi'

type Props = {
  teamId: string
  projectId: string
  /** Project-level documents (no payment attached), every version. */
  documents: DbProjectDocument[]
  setDocuments: Dispatch<SetStateAction<DbProjectDocument[]>>
  onError: (m: string | null) => void
}

export default function DocumentsSection({ teamId, projectId, documents, setDocuments, onError }: Props) {
  const t = useTranslations('Pay')
  const locale = useLocale() as Locale
  const day = (d: DbProjectDocument) => formatDate(d.created_at.slice(0, 10), locale)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null) // group id
  const [updatingId, setUpdatingId] = useState<string | null>(null) // group id
  const [removingId, setRemovingId] = useState<string | null>(null) // group id asking how to remove
  const [removingVersionId, setRemovingVersionId] = useState<string | null>(null) // doc id asking to confirm
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [vendors, setVendors] = useState<ReadonlySet<string>>(new Set())
  const [sort, setSort] = useState<DocSort>('newest')

  const groups = useMemo(() => groupDocuments(documents), [documents])
  const shown = useMemo(() => filterAndSort(groups, { query, vendors, sort }, t), [groups, query, vendors, sort, t])
  const vendorOpts = useMemo(() => vendorOptions(groups), [groups])
  const filtering = query.trim() !== '' || vendors.size > 0

  // One collapsible section per vendor (A–Z, "No vendor" last); order inside follows the chosen sort.
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set())
  const sections = useMemo(() => {
    const m = new Map<string, { key: string; name: string; groups: DocGroup[] }>()
    for (const g of shown) {
      const key = vendorKey(g.current.vendor_name)
      const sec = m.get(key)
      if (sec) sec.groups.push(g)
      else m.set(key, { key, name: key === NO_VENDOR ? t('noVendor') : (g.current.vendor_name ?? '').trim(), groups: [g] })
    }
    return [...m.values()].sort((a, b) =>
      a.key === NO_VENDOR ? 1 : b.key === NO_VENDOR ? -1 : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
  }, [shown, t])
  const isSectionOpen = (sec: { key: string; groups: DocGroup[] }) =>
    openSections.has(sec.key) ||
    // Keep a section open while searching (so matches are visible) or while one of its documents has a form open.
    query.trim() !== '' ||
    sec.groups.some((g) => g.id === editingId || g.id === updatingId || g.id === removingId)
  const allOpen = sections.length > 0 && sections.every(isSectionOpen)
  const toggleSection = (key: string) =>
    setOpenSections((cur) => {
      const n = new Set(cur)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const run = async (key: string, fn: () => Promise<void>) => {
    onError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      onError(errMsg(e, t('somethingWrong')))
    } finally {
      setBusy(null)
    }
  }

  const openDocument = (doc: DbProjectDocument) =>
    run(doc.id, async () => {
      // Open the tab synchronously (inside the click) so popup blockers allow it,
      // then point it at the short-lived signed URL.
      const w = window.open('', '_blank')
      try {
        const url = await getDocumentUrl(doc.storage_path, t)
        if (w) {
          w.opener = null
          w.location.href = url
        } else {
          window.location.href = url
        }
      } catch (e) {
        w?.close()
        throw e
      }
    })

  const toggleExpanded = (id: string) =>
    setExpanded((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const onUploaded = (doc: DbProjectDocument) => {
    setDocuments((cur) => [doc, ...cur])
    setAdding(false)
    setUpdatingId(null)
    // Make the new version's history visible: the old one is now one click away.
    if (doc.version > 1) setExpanded((cur) => new Set(cur).add(doc.version_group_id))
  }

  const saveEdit = (g: DocGroup, v: { label: string; kind: DbDocumentKind; vendorName: string | null }) =>
    run(g.id, async () => {
      const rows = await updateDocumentGroup(g.id, v, t)
      const byId = new Map(rows.map((r) => [r.id, r]))
      setDocuments((cur) => cur.map((d) => byId.get(d.id) ?? d))
      setEditingId(null)
    })

  const removeGroup = (g: DocGroup) =>
    run(g.id, async () => {
      await deleteDocumentGroup(g.id)
      setDocuments((cur) => cur.filter((d) => d.version_group_id !== g.id))
      setRemovingId(null)
    })

  const removeVersion = (doc: DbProjectDocument) =>
    run(doc.id, async () => {
      await deleteProjectDocument(doc)
      setDocuments((cur) => cur.filter((d) => d.id !== doc.id))
      setRemovingId(null)
      setRemovingVersionId(null)
    })

  const clearFilters = () => {
    setQuery('')
    setVendors(new Set())
  }

  const toggleVendor = (key: string) =>
    setVendors((cur) => {
      const n = new Set(cur)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const renderGroup = (g: DocGroup) => {
    const d = g.current
    const hasHistory = g.previous.length > 0
    const open = expanded.has(g.id)
    const isBusy = busy === d.id || busy === g.id
    return (
      <li key={g.id} className="py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
          <span aria-hidden>📄</span>
          <button onClick={() => openDocument(d)} disabled={isBusy} className="text-left text-sm text-blue-600 hover:underline">
            {d.label}
          </button>
          {hasHistory && (
            <span className="rounded-lg bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700" title={t('latestVersion')}>
              v{d.version}
            </span>
          )}
          <span className="text-gray-400">
            {t(`docKind.${d.kind}`)}
            {d.vendor_name ? ` · ${d.vendor_name}` : ''} · {formatBytes(d.size_bytes)} · {day(d)}
          </span>
          <span className="ml-auto flex items-center gap-3">
            <button
              onClick={() => { setEditingId(g.id); setUpdatingId(null); setRemovingId(null) }}
              disabled={isBusy}
              className="text-gray-500 hover:text-gray-900"
              aria-label={t('editLabel', { label: d.label })}
            >
              {t('edit')}
            </button>
            <button
              onClick={() => { setUpdatingId(g.id); setEditingId(null); setRemovingId(null) }}
              disabled={isBusy}
              className="text-gray-500 hover:text-gray-900"
              aria-label={t('uploadNewVersionOf', { label: d.label })}
            >
              {t('update')}
            </button>
            <button
              onClick={() => {
                if (hasHistory) { setRemovingId(g.id); setEditingId(null); setUpdatingId(null) }
                else void removeVersion(d)
              }}
              disabled={isBusy}
              className="text-gray-400 hover:text-red-600"
              aria-label={t('removeLabel', { label: d.label })}
            >
              {t('remove')}
            </button>
          </span>
        </div>

        {removingId === g.id && hasHistory && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-gray-700">
            <span>{t('removeWhat')}</span>
            <button onClick={() => removeVersion(d)} disabled={isBusy} className={btn}>
              {t('onlyVersion', { version: d.version, next: g.previous[0].version })}
            </button>
            <button onClick={() => removeGroup(g)} disabled={isBusy} className={btn + ' !border-red-300 !text-red-700'}>
              {t('allVersions', { count: g.previous.length + 1 })}
            </button>
            <button onClick={() => setRemovingId(null)} className={btn}>{t('cancel')}</button>
          </div>
        )}

        {editingId === g.id && (
          <EditForm
            group={g}
            busy={busy === g.id}
            onSave={(v) => saveEdit(g, v)}
            onCancel={() => setEditingId(null)}
          />
        )}

        {updatingId === g.id && (
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs text-gray-600">
              {t.rich('newVersionIntro', { label: d.label, next: nextVersion(g), current: d.version, b: (c) => <strong>{c}</strong> })}
            </p>
            <UploadForm
              teamId={teamId}
              projectId={projectId}
              paymentId={null}
              version={{ groupId: g.id, version: nextVersion(g), label: d.label, kind: d.kind, vendorName: d.vendor_name }}
              onUploaded={onUploaded}
              onCancel={() => setUpdatingId(null)}
              onError={onError}
            />
          </div>
        )}

        {hasHistory && (
          <div className="mt-1 pl-6">
            <button
              onClick={() => toggleExpanded(g.id)}
              aria-expanded={open}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              {open ? '▾' : '▸'} {t('previousVersions', { count: g.previous.length })}
            </button>
            {open && (
              <ul className="mt-1 space-y-1 border-l-2 border-gray-100 pl-3">
                {g.previous.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="font-medium">v{p.version}</span>
                    <button onClick={() => openDocument(p)} disabled={busy === p.id} className="text-blue-500/80 hover:underline">
                      {t('open')}
                    </button>
                    <span>· {formatBytes(p.size_bytes)} · {day(p)}</span>
                    <span className="ml-auto">
                      {removingVersionId === p.id ? (
                        <span className="flex items-center gap-2">
                          <span className="text-gray-500">{t('removeVersionQ', { version: p.version })}</span>
                          <button onClick={() => removeVersion(p)} disabled={busy === p.id} className="text-red-600 hover:underline">{t('remove')}</button>
                          <button onClick={() => setRemovingVersionId(null)} className="text-gray-500 hover:underline">{t('keep')}</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setRemovingVersionId(p.id)}
                          className="hover:text-red-600"
                          aria-label={t('removeVersionAria', { version: p.version, label: d.label })}
                        >
                          {t('remove')}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('docsTitle')}</h2>
          <p className="text-xs text-gray-500">{t('docsHelp')}</p>
        </div>
        {!adding && <button onClick={() => setAdding(true)} className={btnPrimary}>{t('addDocument')}</button>}
      </div>

      {adding && (
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <UploadForm
            teamId={teamId}
            projectId={projectId}
            paymentId={null}
            onUploaded={onUploaded}
            onCancel={() => setAdding(false)}
            onError={onError}
          />
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchDocsPlaceholder')}
            aria-label={t('searchDocs')}
            className={input + ' w-64'}
          />
          {(vendorOpts.vendors.length > 0 || vendorOpts.hasNoVendor) && (
            <details className="relative">
              <summary className={btn + ' cursor-pointer list-none !py-1.5 !text-sm'}>
                {t('vendorsFilter')}{vendors.size > 0 ? ` (${vendors.size})` : ''} ▾
              </summary>
              <div className="absolute left-0 z-10 mt-1 max-h-60 min-w-48 overflow-auto rounded-lg border border-gray-200 bg-white p-2 shadow">
                {vendorOpts.vendors.map((v) => (
                  <label key={v.key} className="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                    <input type="checkbox" checked={vendors.has(v.key)} onChange={() => toggleVendor(v.key)} />
                    {v.label}
                  </label>
                ))}
                {vendorOpts.hasNoVendor && (
                  <label className="flex items-center gap-2 py-0.5 text-sm text-gray-500">
                    <input type="checkbox" checked={vendors.has(NO_VENDOR)} onChange={() => toggleVendor(NO_VENDOR)} />
                    {t('noVendor')}
                  </label>
                )}
                {vendors.size > 0 && (
                  <button onClick={() => setVendors(new Set())} className="mt-1 text-xs text-gray-500 hover:underline">
                    {t('clearVendors')}
                  </button>
                )}
              </div>
            </details>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as DocSort)} aria-label={t('sortDocs')} className={input}>
            {(['newest', 'oldest', 'name_asc', 'name_desc'] as DocSort[]).map((s) => (
              <option key={s} value={s}>{docSortLabel(s, t)}</option>
            ))}
          </select>
          {filtering && (
            <>
              <span className="text-xs text-gray-500">{t('shownOf', { shown: shown.length, total: groups.length })}</span>
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:underline">{t('clear')}</button>
            </>
          )}
        </div>
      )}

      {groups.length === 0 && !adding ? (
        <p className="px-4 py-6 text-sm text-gray-400">{t('noDocsYet')}</p>
      ) : shown.length === 0 && groups.length > 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400">
          {t('noDocsMatch')} <button onClick={clearFilters} className="underline">{t('clearSearchFilters')}</button>
        </p>
      ) : (
        <div>
          {sections.length > 1 && (
            <div className="flex justify-end border-b border-gray-100 px-4 py-2 text-xs">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                onClick={() => setOpenSections(allOpen ? new Set() : new Set(sections.map((x) => x.key)))}
              >
                {allOpen ? t('closeAll') : t('openAll')}
              </button>
            </div>
          )}
          {sections.map((sec) => {
            const open = isSectionOpen(sec)
            const locked = sec.groups.some((g) => g.id === editingId || g.id === updatingId || g.id === removingId)
            const panelId = `docs-${sec.key.replace(/[^a-z0-9]/gi, '')}`
            return (
              <section key={sec.key} className="border-b border-gray-100 last:border-b-0">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  disabled={locked || query.trim() !== ''}
                  onClick={() => toggleSection(sec.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span aria-hidden className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{sec.name}</span>
                  <span className="text-xs text-gray-500">{t('docCount', { count: sec.groups.length })}</span>
                </button>
                {open && (
                  <ul id={panelId} className="divide-y divide-gray-100 border-t border-gray-100 px-4">
                    {sec.groups.map(renderGroup)}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

function EditForm({
  group,
  busy,
  onSave,
  onCancel,
}: {
  group: DocGroup
  busy: boolean
  onSave: (v: { label: string; kind: DbDocumentKind; vendorName: string | null }) => void
  onCancel: () => void
}) {
  const t = useTranslations('Pay')
  const d = group.current
  const [label, setLabel] = useState(d.label)
  const [kind, setKind] = useState<DbDocumentKind>(d.kind)
  const [vendor, setVendor] = useState(d.vendor_name ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  // 'receipt' is not offered for new project-level documents, but a receipt whose payment
  // was deleted lands here — keep its own type selectable so the dropdown never shows blank.
  const kinds = PROJECT_DOC_KINDS.includes(d.kind) ? PROJECT_DOC_KINDS : [d.kind, ...PROJECT_DOC_KINDS]

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return setFormError(t('nameDocument'))
    setFormError(null)
    onSave({ label: label.trim(), kind, vendorName: vendor.trim() || null })
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Labelled label={t('name')}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('namePlaceholder')} className={`${input} w-full`} maxLength={150} />
        </Labelled>
        <Labelled label={t('type')}>
          <select value={kind} onChange={(e) => setKind(e.target.value as DbDocumentKind)} className={`${input} w-full`}>
            {kinds.map((k) => (
              <option key={k} value={k}>{t(`docKind.${k}`)}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label={t('vendorOptional')}>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={`${input} w-full`} maxLength={120} />
        </Labelled>
      </div>
      {group.previous.length > 0 && (
        <p className="text-xs text-gray-500">{t('appliesToAll', { count: group.previous.length + 1 })}</p>
      )}
      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? t('saving') : t('save')}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={btn + ' !py-1.5 !text-sm'}>{t('cancel')}</button>
      </div>
    </form>
  )
}
