import { supabase } from './client'
import type { DbDocumentKind, DbProjectDocument, DbProjectPayment } from '@/types/db'
import { DOCUMENTS_BUCKET, detectAttachment } from '@/lib/payments'
import type { ExtractionResult } from '@/lib/pdfPayments'

// Payment tracker data access (migration 015). Browser client, like
// stockQueries — RLS (planner_can_access_project) is the real gate; nothing
// here is trusted for security.

export type PaymentInput = {
  vendorName: string
  label: string
  amount: number
  dueDate: string
  notes: string | null
}

export async function createPayment(projectId: string, input: PaymentInput): Promise<DbProjectPayment> {
  const { data, error } = await supabase
    .from('project_payments')
    .insert({
      project_id: projectId,
      vendor_name: input.vendorName,
      label: input.label,
      amount: input.amount,
      due_date: input.dueDate,
      notes: input.notes,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectPayment
}

/** Several payments in ONE insert, so they are all saved or none are (used by "Add from PDF"). */
export async function createPayments(projectId: string, inputs: PaymentInput[]): Promise<DbProjectPayment[]> {
  const { data, error } = await supabase
    .from('project_payments')
    .insert(
      inputs.map((input) => ({
        project_id: projectId,
        vendor_name: input.vendorName,
        label: input.label,
        amount: input.amount,
        due_date: input.dueDate,
        notes: input.notes,
      })),
    )
    .select('*')
  if (error) throw error
  return (data ?? []) as DbProjectPayment[]
}

export async function updatePayment(id: string, input: PaymentInput): Promise<DbProjectPayment> {
  const { data, error } = await supabase
    .from('project_payments')
    .update({
      vendor_name: input.vendorName,
      label: input.label,
      amount: input.amount,
      due_date: input.dueDate,
      notes: input.notes,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectPayment
}

/** paidAt = 'YYYY-MM-DD' marks it paid on that day; null marks it unpaid again. */
export async function setPaymentPaid(id: string, paidAt: string | null): Promise<DbProjectPayment> {
  const { data, error } = await supabase
    .from('project_payments')
    .update({ paid_at: paidAt })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectPayment
}

/**
 * Deleting a payment keeps its documents (the FK nulls payment_id) so no file
 * is ever silently orphaned — the caller should re-point them in local state.
 */
export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('project_payments').delete().eq('id', id)
  if (error) throw error
}

export type DocumentUpload = {
  teamId: string
  projectId: string
  file: File
  kind: DbDocumentKind
  label: string
  vendorName: string | null
  paymentId: string | null
  /** Set both to upload a new version of an existing document (migration 021). Omit for a brand-new document. */
  versionGroupId?: string
  version?: number
}

/**
 * Uploads to the private bucket, then records the row. If the row insert
 * fails the just-uploaded object is removed so a failed attach leaves nothing
 * behind. Path is {team_id}/{project_id}/{uuid}.pdf — the storage policy and
 * a table CHECK both key off the project segment.
 */
export async function uploadProjectDocument(u: DocumentUpload): Promise<DbProjectDocument> {
  const path = await uploadDocumentObject(u.teamId, u.projectId, u.file)
  try {
    return await registerDocument({
      projectId: u.projectId,
      paymentId: u.paymentId,
      vendorName: u.vendorName,
      kind: u.kind,
      label: u.label,
      storagePath: path,
      sizeBytes: u.file.size,
      versionGroupId: u.versionGroupId,
      version: u.version,
    })
  } catch (error) {
    await removeStagedPdf(path)
    // The (group, version) unique index: someone else uploaded this version number first.
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === '23505' && u.versionGroupId) {
      throw new Error('Someone just uploaded another version of this document. Refresh the page and try again.')
    }
    throw error
  }
}

/**
 * Uploads only the file (no database row yet). Returns its storage path {team_id}/{project_id}/{uuid}.{ext}.
 * The extension and content type come from the file's own bytes (PDF, JPG, PNG or WebP), not its name.
 */
export async function uploadDocumentObject(teamId: string, projectId: string, file: File): Promise<string> {
  const type = await detectAttachment(file)
  if (!type) throw new Error('Only PDF, JPG, PNG or WebP files can be attached.')
  const path = `${teamId}/${projectId}/${crypto.randomUUID()}.${type.ext}`
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: type.mime, upsert: false })
  if (error) throw error
  return path
}

/**
 * Server-side copy of an already uploaded PDF, into the same {team_id}/{project_id}/ folder under a new
 * name. Each document row needs its own file (storage_path is unique, and deleting one document deletes
 * its file), so attaching one PDF to several payments means one copy per payment.
 */
export async function copyPdfObject(fromPath: string): Promise<string> {
  const ext = fromPath.slice(fromPath.lastIndexOf('.') + 1)
  const to = `${fromPath.slice(0, fromPath.lastIndexOf('/'))}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).copy(fromPath, to)
  if (error) throw error
  return to
}

/** Best-effort removal of an uploaded file that never got a database row (cancelled review, failed save). */
export async function removeStagedPdf(path: string): Promise<void> {
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([path])
  if (error) console.warn('Could not remove staged PDF (orphaned object):', path, error.message)
}

export type DocumentRegistration = {
  projectId: string
  paymentId: string | null
  vendorName: string | null
  kind: DbDocumentKind
  label: string
  storagePath: string
  sizeBytes: number
  versionGroupId?: string
  version?: number
}

/** Records the database row for a file that is already in the bucket. */
export async function registerDocument(d: DocumentRegistration): Promise<DbProjectDocument> {
  const { data, error } = await supabase
    .from('project_documents')
    .insert({
      project_id: d.projectId,
      payment_id: d.paymentId,
      vendor_name: d.vendorName,
      kind: d.kind,
      label: d.label,
      storage_path: d.storagePath,
      size_bytes: d.sizeBytes,
      ...(d.versionGroupId && d.version ? { version_group_id: d.versionGroupId, version: d.version } : {}),
    })
    .select('*')
    .single()
  if (error) throw error
  return data as DbProjectDocument
}

/** Asks the server to read payment details out of an uploaded PDF. Throws an Error with a user-readable message. */
export async function extractPaymentsFromPdf(storagePath: string): Promise<ExtractionResult> {
  let res: Response
  try {
    res = await fetch('/api/payments/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: storagePath }),
    })
  } catch {
    throw new Error('Could not reach the server to read the PDF.')
  }
  const body = (await res.json().catch(() => null)) as
    | { ok: true; currency: string | null; payments: ExtractionResult['payments'] }
    | { ok: false; message?: string }
    | null
  if (!res.ok || !body || body.ok !== true) {
    throw new Error((body && body.ok === false && body.message) || 'Could not read the PDF.')
  }
  return { currency: body.currency, payments: body.payments }
}

/**
 * Row first, then file: if the second step fails you are left with an
 * invisible orphan file (harmless) rather than a visible link to a file that
 * no longer exists (confusing).
 */
export async function deleteProjectDocument(doc: Pick<DbProjectDocument, 'id' | 'storage_path'>): Promise<void> {
  const { error } = await supabase.from('project_documents').delete().eq('id', doc.id)
  if (error) throw error
  const { error: rmErr } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path])
  if (rmErr) console.warn('Document row deleted but file removal failed (orphaned object):', doc.storage_path, rmErr.message)
}

export type DocumentEdit = { label: string; kind: DbDocumentKind; vendorName: string | null }

/** Edits the whole document (every version) so versions never disagree on name, type or vendor. */
export async function updateDocumentGroup(groupId: string, e: DocumentEdit): Promise<DbProjectDocument[]> {
  const { data, error } = await supabase
    .from('project_documents')
    .update({ label: e.label, kind: e.kind, vendor_name: e.vendorName })
    .eq('version_group_id', groupId)
    .select('*')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Could not save — the document may have been removed.')
  return data as DbProjectDocument[]
}

/** Removes every version of a document (rows first, then the files — same order as deleteProjectDocument). */
export async function deleteDocumentGroup(groupId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('project_documents')
    .delete()
    .eq('version_group_id', groupId)
    .select('id, storage_path')
  if (error) throw error
  const rows = (data ?? []) as Pick<DbProjectDocument, 'id' | 'storage_path'>[]
  if (rows.length > 0) {
    const { error: rmErr } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(rows.map((r) => r.storage_path))
    if (rmErr) console.warn('Document rows deleted but file removal failed (orphaned objects):', rmErr.message)
  }
  return rows.map((r) => r.id)
}

/** Private bucket → short-lived signed URL, minted on click rather than stored. */
export async function getDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, 60)
  if (error || !data) throw error ?? new Error('Could not create a download link.')
  return data.signedUrl
}
