'use client'

import { useRef, useState } from 'react'
import type { DbDocumentKind, DbProjectDocument } from '@/types/db'
import { uploadProjectDocument } from '@/lib/supabase/paymentQueries'
import { DOC_KIND_LABEL, PROJECT_DOC_KINDS, checkPdf, formatBytes } from '@/lib/payments'

// Shared by the payments page and the documents section: class strings, the error
// formatter and the PDF upload form (also used for "Update" = upload a new version).

export const input = 'rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900'
export const btn = 'rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50'
export const btnPrimary = 'rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50'

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
}

export function UploadForm({
  teamId,
  projectId,
  fixedKind,
  paymentId,
  vendorName,
  defaultLabel,
  version,
  onUploaded,
  onCancel,
  onError,
}: {
  teamId: string
  projectId: string
  fixedKind?: DbDocumentKind
  paymentId: string | null
  vendorName?: string
  defaultLabel?: string
  /** Upload the next version of an existing document: name, type and vendor are inherited, only the PDF is chosen. */
  version?: { groupId: string; version: number; label: string; kind: DbDocumentKind; vendorName: string | null }
  onUploaded: (d: DbProjectDocument) => void
  onCancel: () => void
  onError: (m: string | null) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState(defaultLabel ?? '')
  const [kind, setKind] = useState<DbDocumentKind>(fixedKind ?? 'contract_draft')
  const [vendor, setVendor] = useState(vendorName ?? '')
  const [uploading, setUploading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = async (f: File | null) => {
    setFile(null)
    setFormError(null)
    if (!f) return
    const problem = await checkPdf(f)
    if (problem) return setFormError(problem)
    setFile(f)
    if (!label && !version) setLabel(f.name.replace(/\.pdf$/i, ''))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setFormError('Choose a PDF first.')
    if (!version && !label.trim()) return setFormError('Give the document a name.')
    setUploading(true)
    setFormError(null)
    onError(null)
    try {
      const doc = await uploadProjectDocument({
        teamId,
        projectId,
        file,
        kind: version ? version.kind : kind,
        label: version ? version.label : label.trim(),
        vendorName: version ? version.vendorName : vendor.trim() || null,
        paymentId,
        ...(version ? { versionGroupId: version.groupId, version: version.version } : {}),
      })
      onUploaded(doc)
    } catch (err) {
      setFormError(errMsg(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {/* The native file input is hidden on purpose: rendered as-is it is a full-width,
          browser-language control (e.g. "Seleccionar archivo") where a click anywhere along
          it opens the picker. Only the explicit button below opens it now. */}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          // Clear the value so choosing the same file again (after a rejected one) still fires onChange.
          e.target.value = ''
          void pick(f)
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className={btn + ' !py-1.5 !text-sm'}>
          {file ? 'Change PDF' : 'Choose PDF…'}
        </button>
        <span className="text-sm text-gray-600" aria-live="polite">
          {file ? `${file.name} · ${formatBytes(file.size)}` : 'No file chosen'}
        </span>
      </div>
      {!version && (
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" aria-label="Document name" className={input} maxLength={150} />
        {!fixedKind && (
          <select value={kind} onChange={(e) => setKind(e.target.value as DbDocumentKind)} aria-label="Document type" className={input}>
            {PROJECT_DOC_KINDS.map((k) => (
              <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>
            ))}
          </select>
        )}
        {!fixedKind && (
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (optional)" aria-label="Vendor" className={input} maxLength={120} />
        )}
      </div>
      )}
      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={uploading || !file} className={btnPrimary}>{uploading ? 'Uploading…' : version ? `Upload as v${version.version}` : 'Upload'}</button>
        <button type="button" onClick={onCancel} disabled={uploading} className={btn + ' !py-1.5 !text-sm'}>Cancel</button>
      </div>
    </form>
  )
}
