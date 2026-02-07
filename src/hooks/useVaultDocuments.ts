'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type DocumentTypeFilter = 'ALL_ASSETS' | 'CONTRACT' | 'INVOICE' | 'USAGE_DATA' | 'PROPOSAL'

export interface VaultDocument {
  id: string
  account_id: string | null
  name: string
  size: string | null
  type: string | null
  url: string | null
  storage_path: string
  created_at: string
  document_type?: string | null
}

export function useVaultDocuments(filter?: DocumentTypeFilter) {
  return useQuery({
    queryKey: ['vault-documents', filter ?? 'ALL_ASSETS'],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select('id, account_id, name, size, type, storage_path, created_at, document_type')
        .order('created_at', { ascending: false })

      if (filter && filter !== 'ALL_ASSETS') {
        query = query.eq('document_type', filter)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as VaultDocument[]
    },
  })
}

export function useVaultDocumentsInvalidate() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
  }
}
