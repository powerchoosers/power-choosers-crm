import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { BILL_MAX_BYTES, BILL_MIME_TYPES, VAULT_BUCKET, billFolder, safeFileName, sniffBillType } from '@/lib/portal/server'
import { BILL_SCHEMA_VERSION, extractEnergyBill, type BillExtraction } from '@/lib/portal/bill-extract'
import { findSupplier } from '@/lib/portal/suppliers'

export type BillSource = 'upload' | 'email' | 'advisor'

/** The columns a client is allowed to see. Storage paths and hashes stay on the server. */
export const CLIENT_BILL_COLUMNS =
  'id, source, status, file_name, mime_type, size_bytes, supplier_name, account_number, esid, service_address, period_start, period_end, due_date, total_amount, usage_kwh, billed_demand_kw, actual_demand_kw, energy_rate, supply_charges, delivery_charges, taxes_and_fees, confidence, review_reason, error_message, source_sender, created_at'

export class BillRejected extends Error {}

interface IngestInput {
  accountId: string
  source: BillSource
  bytes: Uint8Array
  fileName: string
  uploadedByEmail?: string | null
  sourceSender?: string | null
}

export interface IngestResult {
  billId: string
  duplicate: boolean
}

function patchFromExtraction(result: BillExtraction, supplierId: string | null) {
  const f = result.facts
  return {
    status: result.reviewReason ? 'needs_review' : 'ready',
    review_reason: result.reviewReason,
    error_message: null,
    supplier_id: supplierId,
    supplier_name: f.supplierName,
    account_number: f.accountNumber,
    esid: f.esid,
    service_address: f.serviceAddress,
    period_start: f.periodStart,
    period_end: f.periodEnd,
    due_date: f.dueDate,
    total_amount: f.totalAmount,
    usage_kwh: f.usageKwh,
    billed_demand_kw: f.billedDemandKw,
    actual_demand_kw: f.actualDemandKw,
    energy_rate: f.energyRate,
    supply_charges: f.supplyCharges,
    delivery_charges: f.deliveryCharges,
    taxes_and_fees: f.taxesAndFees,
    confidence: f.confidence,
    extracted: { schema: BILL_SCHEMA_VERSION, model: result.model, readAt: new Date().toISOString(), facts: f },
  }
}

/** Read a stored bill and save what was found. Failures are recorded on the bill, not thrown. */
export async function readStoredBill(billId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from('client_bills')
    .select('id, storage_path, file_name, mime_type, attempts')
    .eq('id', billId)
    .limit(1)
  const bill = rows?.[0]
  if (!bill) return

  await supabaseAdmin
    .from('client_bills')
    .update({ status: 'processing', attempts: (bill.attempts || 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', billId)

  try {
    const { data: file, error } = await supabaseAdmin.storage.from(VAULT_BUCKET).download(bill.storage_path)
    if (error || !file) throw new Error('The stored file could not be opened.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await extractEnergyBill(bytes, bill.file_name, bill.mime_type)
    const supplier = result.facts.supplierName ? await findSupplier(result.facts.supplierName) : null
    await supabaseAdmin
      .from('client_bills')
      .update({ ...patchFromExtraction(result, supplier?.id ?? null), updated_at: new Date().toISOString() })
      .eq('id', billId)
  } catch (err) {
    console.error('[Client Bills] Reading failed:', billId, err instanceof Error ? err.message : err)
    await supabaseAdmin
      .from('client_bills')
      .update({
        status: 'failed',
        error_message: 'We could not read this bill automatically. You can still open the file, and you can try reading it again.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
  }
}

/**
 * Store one bill file for an account and read it.
 * The same file (by SHA-256) is only ever stored once per account.
 */
export async function ingestBill(input: IngestInput): Promise<IngestResult> {
  const { accountId, bytes } = input
  if (bytes.length === 0) throw new BillRejected('That file is empty.')
  if (bytes.length > BILL_MAX_BYTES) throw new BillRejected('That file is larger than 15 MB.')
  const mimeType = sniffBillType(bytes)
  if (!mimeType) throw new BillRejected('Upload a PDF, JPG, or PNG.')

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const { data: existing } = await supabaseAdmin
    .from('client_bills')
    .select('id')
    .eq('account_id', accountId)
    .eq('sha256', sha256)
    .limit(1)
  if (existing?.[0]) return { billId: existing[0].id, duplicate: true }

  const storagePath = `${billFolder(accountId)}/${sha256}.${BILL_MIME_TYPES[mimeType]}`
  const { error: uploadError } = await supabaseAdmin.storage
    .from(VAULT_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true })
  if (uploadError) throw new Error(`Storing the bill failed: ${uploadError.message}`)

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('client_bills')
    .insert({
      account_id: accountId,
      source: input.source,
      status: 'processing',
      storage_path: storagePath,
      file_name: safeFileName(input.fileName),
      mime_type: mimeType,
      size_bytes: bytes.length,
      sha256,
      uploaded_by_email: input.uploadedByEmail ?? null,
      source_sender: input.sourceSender ?? null,
    })
    .select('id')
    .limit(1)

  if (insertError || !inserted?.[0]) {
    // Two copies of the same file arriving together: the unique key lets one win.
    const { data: raced } = await supabaseAdmin.from('client_bills').select('id').eq('account_id', accountId).eq('sha256', sha256).limit(1)
    if (raced?.[0]) return { billId: raced[0].id, duplicate: true }
    throw new Error(`Saving the bill failed: ${insertError?.message || 'unknown error'}`)
  }

  await readStoredBill(inserted[0].id)
  return { billId: inserted[0].id, duplicate: false }
}

/** Remove a bill and its file. Used when an emailed attachment turns out not to be a bill. */
export async function discardBill(billId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin.from('client_bills').select('storage_path').eq('id', billId).limit(1)
  const path = rows?.[0]?.storage_path
  await supabaseAdmin.from('client_bills').delete().eq('id', billId)
  if (path) await supabaseAdmin.storage.from(VAULT_BUCKET).remove([path])
}
