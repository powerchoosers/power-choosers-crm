import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Call {
  id: string
  contactName: string
  phoneNumber: string
  type: 'Inbound' | 'Outbound'
  status: 'Completed' | 'Missed' | 'Voicemail'
  duration: string
  date: string
  note?: string
}

export function useCalls() {
  return useQuery({
    queryKey: ['calls'],
    queryFn: async () => {
      // Mock Data Fallback
      return [
        { 
          id: '1', 
          contactName: 'Alice Johnson', 
          phoneNumber: '(555) 123-4567', 
          type: 'Outbound', 
          status: 'Completed', 
          duration: '5m 23s', 
          date: '2024-03-15 14:30' 
        },
        { 
          id: '2', 
          contactName: 'Bob Smith', 
          phoneNumber: '(555) 987-6543', 
          type: 'Inbound', 
          status: 'Missed', 
          duration: '0s', 
          date: '2024-03-14 09:15' 
        },
        { 
          id: '3', 
          contactName: 'Charlie Brown', 
          phoneNumber: '(555) 555-5555', 
          type: 'Outbound', 
          status: 'Voicemail', 
          duration: '1m 05s', 
          date: '2024-03-13 16:45' 
        },
        { 
          id: '4', 
          contactName: 'Unknown', 
          phoneNumber: '(555) 000-0000', 
          type: 'Inbound', 
          status: 'Completed', 
          duration: '2m 10s', 
          date: '2024-03-12 11:00' 
        },
      ] as Call[]
    }
  })
}
