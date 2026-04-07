import { supabase } from '@/lib/supabase'

export interface IngestedAccountFileResult {
  storagePath: string
  analysisType: string | null
}

export interface IngestAccountFileOptions {
  accountId: string
  file: File
  apiBaseUrl?: string | null
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

export async function ingestAccountFile({
  accountId,
  file,
  apiBaseUrl = null,
}: IngestAccountFileOptions): Promise<IngestedAccountFileResult> {
  if (!accountId) {
    throw new Error('No account selected')
  }

  const storagePath = buildVaultStoragePath(accountId, file.name)

  const { error: uploadError } = await supabase.storage
    .from('vault')
    .upload(storagePath, file)

  if (uploadError) {
    throw uploadError
  }

  const { error: dbError } = await supabase
    .from('documents')
    .insert({
      account_id: accountId,
      name: file.name,
      size: formatBytes(file.size),
      type: file.type,
      storage_path: storagePath,
      url: '',
    })

  if (dbError) {
    throw dbError
  }

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
      filePath: storagePath,
      fileName: file.name,
    }),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = result?.error || result?.details || result?.message || `Failed to analyze ${file.name}`
    throw new Error(String(message))
  }

  return {
    storagePath,
    analysisType: typeof result?.analysis?.type === 'string' ? result.analysis.type : null,
  }
}
