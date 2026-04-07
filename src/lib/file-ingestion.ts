import { supabase } from '@/lib/supabase'

export interface IngestedAccountFileResult {
  storagePath: string
  analysisType: string | null
  documentId: string | null
}

export interface IngestAccountFileOptions {
  accountId: string
  file: File
  apiBaseUrl?: string | null
}

export interface IngestAccountFileDataOptions {
  accountId: string
  fileName: string
  fileData: Blob | ArrayBuffer | Uint8Array
  fileType?: string | null
  fileSize?: number | null
  apiBaseUrl?: string | null
  storagePath?: string | null
  metadata?: Record<string, unknown> | null
  upsert?: boolean
}

export function isCsvFile(file: Pick<File, 'name' | 'type'>) {
  return file.type === 'text/csv' || /\.csv$/i.test(file.name)
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function buildVaultStoragePath(accountId: string, fileName: string) {
  const parts = fileName.split('.')
  const extension = parts.length > 1 ? parts.pop() : 'bin'
  const safeExtension = String(extension || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin'
  const uniqueName = `${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${safeExtension}`
  return `accounts/${accountId}/${uniqueName}`
}

export function sanitizeStoragePathSegment(value: string) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 96) || 'file'
}

export function normalizeVaultRelativePath(value: string) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => sanitizeStoragePathSegment(segment))
    .filter(Boolean)
    .join('/')
}

export function buildVaultSyncStoragePath(accountId: string, syncId: string, relativePath: string) {
  const safeAccountId = sanitizeStoragePathSegment(accountId)
  const safeSyncId = sanitizeStoragePathSegment(syncId)
  const normalizedRelativePath = normalizeVaultRelativePath(relativePath)
  const pathParts = normalizedRelativePath ? normalizedRelativePath.split('/') : ['file']
  return `accounts/${safeAccountId}/folder-sync/${safeSyncId}/${pathParts.join('/')}`
}

function normalizeUploadBlob(fileData: Blob | ArrayBuffer | Uint8Array, fileType?: string | null) {
  if (fileData instanceof Blob) {
    return fileData
  }

  const mimeType = typeof fileType === 'string' && fileType.trim() ? fileType.trim() : 'application/octet-stream'
  const view = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)
  const copy = new Uint8Array(view.byteLength)
  copy.set(view)

  return new Blob([copy], { type: mimeType })
}

async function upsertVaultDocumentRow({
  accountId,
  fileName,
  fileType,
  fileSize,
  storagePath,
  metadata,
}: {
  accountId: string
  fileName: string
  fileType: string
  fileSize: number
  storagePath: string
  metadata?: Record<string, unknown> | null
}) {
  const normalizedMetadata = metadata && Object.keys(metadata).length > 0 ? metadata : null

  const { data: existingDoc, error: lookupError } = await supabase
    .from('documents')
    .select('id, metadata')
    .eq('account_id', accountId)
    .eq('storage_path', storagePath)
    .maybeSingle()

  if (lookupError) {
    throw lookupError
  }

  const payload = {
    account_id: accountId,
    name: fileName,
    size: formatBytes(fileSize),
    type: fileType,
    storage_path: storagePath,
    url: '',
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
  }
  const existingMetadata = existingDoc?.metadata && typeof existingDoc.metadata === 'object'
    ? (existingDoc.metadata as Record<string, unknown>)
    : null
  const mergedMetadata = existingMetadata || normalizedMetadata
    ? {
        ...(existingMetadata ?? {}),
        ...(normalizedMetadata ?? {}),
      }
    : null

  const payloadWithMetadata = {
    ...payload,
    ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
  }

  if (existingDoc?.id) {
    const { error: updateError } = await supabase
      .from('documents')
      .update(payloadWithMetadata)
      .eq('id', existingDoc.id)

    if (updateError) {
      throw updateError
    }

    return existingDoc.id as string
  }

  const { data: insertedDoc, error: insertError } = await supabase
    .from('documents')
    .insert(payloadWithMetadata)
    .select('id')
    .single()

  if (insertError) {
    throw insertError
  }

  return insertedDoc?.id ?? null
}

async function ingestVaultDocument({
  accountId,
  fileName,
  fileData,
  fileType,
  fileSize,
  apiBaseUrl = null,
  storagePath = null,
  metadata = null,
  upsert = false,
}: IngestAccountFileDataOptions): Promise<IngestedAccountFileResult> {
  if (!accountId) {
    throw new Error('No account selected')
  }

  const blob = normalizeUploadBlob(fileData, fileType)
  const resolvedFileType = String(fileType || blob.type || 'application/octet-stream')
  const resolvedFileSize = typeof fileSize === 'number' && Number.isFinite(fileSize) ? fileSize : blob.size
  const resolvedStoragePath = storagePath || buildVaultStoragePath(accountId, fileName)

  const { error: uploadError } = await supabase.storage
    .from('vault')
    .upload(resolvedStoragePath, blob, upsert ? { upsert: true } : undefined)

  if (uploadError) {
    throw uploadError
  }

  const documentId = await upsertVaultDocumentRow({
    accountId,
    fileName,
    fileType: resolvedFileType,
    fileSize: resolvedFileSize,
    storagePath: resolvedStoragePath,
    metadata,
  })

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  const normalizedApiBaseUrl = apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || ''
  const apiUrl = normalizedApiBaseUrl ? `${normalizedApiBaseUrl}/api/analyze-document` : '/api/analyze-document'

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      accountId,
      filePath: resolvedStoragePath,
      fileName,
    }),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = result?.error || result?.details || result?.message || `Failed to analyze ${fileName}`
    throw new Error(String(message))
  }

  return {
    storagePath: resolvedStoragePath,
    analysisType: typeof result?.analysis?.type === 'string' ? result.analysis.type : null,
    documentId,
  }
}

export async function ingestAccountFile({
  accountId,
  file,
  apiBaseUrl = null,
}: IngestAccountFileOptions): Promise<IngestedAccountFileResult> {
  return ingestVaultDocument({
    accountId,
    fileName: file.name,
    fileData: file,
    fileType: file.type,
    fileSize: file.size,
    apiBaseUrl,
  })
}

export async function ingestAccountFileData(options: IngestAccountFileDataOptions): Promise<IngestedAccountFileResult> {
  return ingestVaultDocument(options)
}
