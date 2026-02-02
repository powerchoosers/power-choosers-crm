import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Protocol } from './useProtocols'
import { Node, Edge } from '@xyflow/react'

export function useProtocolBuilder(id: string) {
  const queryClient = useQueryClient()

  const protocolQuery = useQuery({
    queryKey: ['protocol', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sequences')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Protocol
    },
    enabled: !!id && id !== '123', // Don't fetch for mock ID
  })

  const saveProtocolMutation = useMutation({
    mutationFn: async (data: { 
      nodes: Node[], 
      edges: Edge[], 
      name?: string, 
      description?: string 
    }) => {
      const { error } = await supabase
        .from('sequences')
        .update({
          bgvector: {
            nodes: data.nodes,
            edges: data.edges
          },
          updatedAt: new Date().toISOString(),
          ...(data.name && { name: data.name }),
          ...(data.description && { description: data.description })
        })
        .eq('id', id)

      if (error) throw error
      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', id] })
      toast.success('Protocol saved successfully')
    },
    onError: (error) => {
      console.error('Error saving protocol:', error)
      toast.error('Failed to save protocol')
    }
  })

  return {
    protocol: protocolQuery.data,
    isLoading: protocolQuery.isLoading,
    saveProtocol: saveProtocolMutation.mutateAsync,
    isSaving: saveProtocolMutation.isPending
  }
}
