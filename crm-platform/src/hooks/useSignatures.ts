import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export function useCancelSignatureRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('signature_requests')
        .delete()
        .eq('id', requestId)

      if (error) throw error
      return requestId
    },
    onSuccess: () => {
      // Invalidate deals to refresh the latest signature status in UI
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
      queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })
      queryClient.invalidateQueries({ queryKey: ['deal'] })
      toast.success('Signature request cancelled')
    },
    onError: (error) => {
      console.error('Error cancelling signature request:', error)
      toast.error('Failed to cancel signature request')
    },
  })
}
