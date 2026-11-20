import { checkPdf } from '@/lib/payments'
import type { ExtractionResult } from '@/lib/pdfPayments'
import { extractPaymentsFromPdf, uploadPdfObject } from '@/lib/supabase/paymentQueries'
import { errMsg } from './documentUi'

/**
 * A PDF that is uploaded to the bucket (so it can be read server-side, whatever its size) but has
 * no database row yet. Until the person presses Save it is only a file: Cancel removes it.
 */
export type StagedPdf = {
  path: string
  size: number
  fileName: string
  /** null when reading failed — the PDF is still staged so the details can be typed by hand. */
  result: ExtractionResult | null
  /** Why reading failed, in words for the person. */
  readError: string | null
}

/** Validates, uploads, then reads. Throws only when the file is unusable or cannot be uploaded. */
export async function stagePdf(file: File, teamId: string, projectId: string): Promise<StagedPdf> {
  const problem = await checkPdf(file)
  if (problem) throw new Error(problem)
  const path = await uploadPdfObject(teamId, projectId, file)
  try {
    const result = await extractPaymentsFromPdf(path)
    return { path, size: file.size, fileName: file.name, result, readError: null }
  } catch (e) {
    return { path, size: file.size, fileName: file.name, result: null, readError: errMsg(e) }
  }
}

export const fileLabel = (fileName: string) => fileName.replace(/\.pdf$/i, '')
