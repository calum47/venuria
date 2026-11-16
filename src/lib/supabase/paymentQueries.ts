import { supabase } from './client'
import type { DbDocumentKind, DbProjectDocument, DbProjectPayment } from '@/types/db'
import { DOCUMENTS_BUCKET } from '@/lib/payments'

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
}

/**
 * Uploads to the private bucket, then records the row. If the row insert
 * fails the just-uploaded object is removed so a failed attach leaves nothing
 * behind. Path is {team_id}/{project_id}/{uuid}.pdf — the storage policy and
 * a table CHECK both key off the project segment.
 */
export async function uploadProjectDocument(u: DocumentUpload): Promise<DbProjectDocument> {
  const path = `${u.teamId}/${u.projectId}/${crypto.randomUUID()}.pdf`
  const { error: upErr } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, u.file, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('project_documents')
    .insert({
      project_id: u.projectId,
      payment_id: u.paymentId,
      vendor_name: u.vendorName,
      kind: u.kind,
      label: u.label,
      storage_path: path,
      size_bytes: u.file.size,
    })
    .select('*')
    .single()
  if (error) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path])
    throw error
  }
  return data as DbProjectDocument
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

/** Private bucket → short-lived signed URL, minted on click rather than stored. */
export async function getDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, 60)
  if (error || !data) throw error ?? new Error('Could not create a download link.')
  return data.signedUrl
}
