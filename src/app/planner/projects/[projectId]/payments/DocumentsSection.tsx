'use client'

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { DbDocumentKind, DbProjectDocument } from '@/types/db'
import {
  deleteDocumentGroup,
  deleteProjectDocument,
  getDocumentUrl,
  updateDocumentGroup,
} from '@/lib/supabase/paymentQueries'
import { DOC_KIND_LABEL, PROJECT_DOC_KINDS, formatBytes } from '@/lib/payments'
import {
  DOC_SORT_LABEL,
  NO_VENDOR,
  filterAndSort,
  groupDocuments,
  nextVersion,
  vendorOptions,
  type DocGroup,
  type DocSort,
} from '@/lib/documents'
import { formatDate } from '@/lib/projectDates'
import { UploadForm, btn, btnPrimary, errMsg, input } from './documentUi'

type Props = {
  teamId: string
  projectId: string
  /** Project-level documents (no payment attached), every version. */
  documents: DbProjectDocument[]
  setDocuments: Dispatch<SetStateAction<DbProjectDocument[]>>
  onError: (m: string | null) => void
}

const day = (d: DbProjectDocument) => formatDate(d.created_at.slice(0, 10))

export default function DocumentsSection({ teamId, projectId, documents, setDocuments, onError }: Props) {
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
  const shown = useMemo(() => filterAndSort(groups, { query, vendors, sort }), [groups, query, vendors, sort])
  const vendorOpts = useMemo(() => vendorOptions(groups), [groups])
  const filtering = query.trim() !== '' || vendors.size > 0

  const run = async (key: string, fn: () => Promise<void>) => {
    onError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      onError(errMsg(e))
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
        const url = await getDocumentUrl(doc.storage_path)
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
      const rows = await updateDocumentGroup(g.id, v)
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
            <span className="rounded-lg bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700" title="Latest version">
              v{d.version}
            </span>
          )}
          <span className="text-gray-400">
            {DOC_KIND_LABEL[d.kind]}
            {d.vendor_name ? ` · ${d.vendor_name}` : ''} · {formatBytes(d.size_bytes)} · {day(d)}
          </span>
          <span className="ml-auto flex items-center gap-3">
            <button
              onClick={() => { setEditingId(g.id); setUpdatingId(null); setRemovingId(null) }}
              disabled={isBusy}
              className="text-gray-500 hover:text-gray-900"
              aria-label={`Edit ${d.label}`}
            >
              Edit
            </button>
            <button
              onClick={() => { setUpdatingId(g.id); setEditingId(null); setRemovingId(null) }}
              disabled={isBusy}
              className="text-gray-500 hover:text-gray-900"
              aria-label={`Upload a new version of ${d.label}`}
            >
              Update
            </button>
            <button
              onClick={() => {
                if (hasHistory) { setRemovingId(g.id); setEditingId(null); setUpdatingId(null) }
                else void removeVersion(d)
              }}
              disabled={isBusy}
              className="text-gray-400 hover:text-red-600"
              aria-label={`Remove ${d.label}`}
            >
              Remove
            </button>
          </span>
        </div>

        {removingId === g.id && hasHistory && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-gray-700">
            <span>Remove what?</span>
            <button onClick={() => removeVersion(d)} disabled={isBusy} className={btn}>
              Only v{d.version} (v{g.previous[0].version} becomes current)
            </button>
            <button onClick={() => removeGroup(g)} disabled={isBusy} className={btn + ' !border-red-300 !text-red-700'}>
              All {g.previous.length + 1} versions
            </button>
            <button onClick={() => setRemovingId(null)} className={btn}>Cancel</button>
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
              New version of <strong>{d.label}</strong>. It becomes v{nextVersion(g)}; v{d.version} stays in the history.
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
              {open ? '▾' : '▸'} Previous versions ({g.previous.length})
            </button>
            {open && (
              <ul className="mt-1 space-y-1 border-l-2 border-gray-100 pl-3">
                {g.previous.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="font-medium">v{p.version}</span>
                    <button onClick={() => openDocument(p)} disabled={busy === p.id} className="text-blue-500/80 hover:underline">
                      Open
                    </button>
                    <span>· {formatBytes(p.size_bytes)} · {day(p)}</span>
                    <span className="ml-auto">
                      {removingVersionId === p.id ? (
                        <span className="flex items-center gap-2">
                          <span className="text-gray-500">Remove v{p.version}?</span>
                          <button onClick={() => removeVersion(p)} disabled={busy === p.id} className="text-red-600 hover:underline">Remove</button>
                          <button onClick={() => setRemovingVersionId(null)} className="text-gray-500 hover:underline">Keep</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setRemovingVersionId(p.id)}
                          className="hover:text-red-600"
                          aria-label={`Remove version ${p.version} of ${d.label}`}
                        >
                          Remove
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
          <h2 className="text-sm font-semibold text-gray-900">Contracts &amp; other documents</h2>
          <p className="text-xs text-gray-500">Draft contracts, quotes, anything you want to keep with this project. PDF only, up to 10 MB.</p>
        </div>
        {!adding && <button onClick={() => setAdding(true)} className={btnPrimary}>Add document</button>}
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
            placeholder="Search name, vendor or type"
            aria-label="Search documents"
            className={input + ' w-64'}
          />
          {(vendorOpts.vendors.length > 0 || vendorOpts.hasNoVendor) && (
            <details className="relative">
              <summary className={btn + ' cursor-pointer list-none !py-1.5 !text-sm'}>
                Vendors{vendors.size > 0 ? ` (${vendors.size})` : ''} ▾
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
                    No vendor
                  </label>
                )}
                {vendors.size > 0 && (
                  <button onClick={() => setVendors(new Set())} className="mt-1 text-xs text-gray-500 hover:underline">
                    Clear vendors
                  </button>
                )}
              </div>
            </details>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as DocSort)} aria-label="Sort documents" className={input}>
            {(Object.keys(DOC_SORT_LABEL) as DocSort[]).map((s) => (
              <option key={s} value={s}>{DOC_SORT_LABEL[s]}</option>
            ))}
          </select>
          {filtering && (
            <>
              <span className="text-xs text-gray-500">{shown.length} of {groups.length}</span>
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:underline">Clear</button>
            </>
          )}
        </div>
      )}

      {groups.length === 0 && !adding ? (
        <p className="px-4 py-6 text-sm text-gray-400">No documents yet.</p>
      ) : shown.length === 0 && groups.length > 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400">
          No documents match. <button onClick={clearFilters} className="underline">Clear search and filters</button>
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 px-4">{shown.map(renderGroup)}</ul>
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
    if (!label.trim()) return setFormError('Give the document a name.')
    setFormError(null)
    onSave({ label: label.trim(), kind, vendorName: vendor.trim() || null })
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" aria-label="Document name" className={input} maxLength={150} />
        <select value={kind} onChange={(e) => setKind(e.target.value as DbDocumentKind)} aria-label="Document type" className={input}>
          {kinds.map((k) => (
            <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>
          ))}
        </select>
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (optional)" aria-label="Vendor" className={input} maxLength={120} />
      </div>
      {group.previous.length > 0 && (
        <p className="text-xs text-gray-500">Applies to all {group.previous.length + 1} versions of this document.</p>
      )}
      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={btn + ' !py-1.5 !text-sm'}>Cancel</button>
      </div>
    </form>
  )
}
