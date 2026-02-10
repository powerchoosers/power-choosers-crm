import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Email } from './useEmails'

export function useEmail(id: string) {
  return useQuery({
    queryKey: ['email', id],
    queryFn: async () => {
      if (!id) return null
      
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) {
        console.error('Error fetching email from Supabase:', error)
        return null
      }
      
      if (data) {
        return {
          id: data.id,
          subject: data.subject,
          from: data.from,
          to: data.to,
          html: data.html,
          text: data.text,
          snippet: data.text?.slice(0, 100),
          date: data.timestamp || data.created_at,
          timestamp: new Date(data.timestamp || data.created_at).getTime(),
          unread: !data.is_read,
          type: data.type,
          status: data.status,
          ownerId: data.metadata?.ownerId,
          openCount: data.openCount,
          clickCount: data.clickCount,
          attachments: data.attachments || data.metadata?.attachments
        } as Email
      }
      return null
    },
    enabled: !!id
  })
}

export function useMarkEmailAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('emails')
        .update({ is_read: true })
        .eq('id', id)

      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      // Invalidate both the individual email and the list
      queryClient.invalidateQueries({ queryKey: ['email', id] })
      queryClient.invalidateQueries({ queryKey: ['emails'] })
    }
  })
}
