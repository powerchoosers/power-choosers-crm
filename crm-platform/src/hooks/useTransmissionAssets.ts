import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TransmissionAsset {
  id: string
  name: string
  type: 'market_signal' | 'invoice_req' | 'educational'
  content_json: any
  compiled_html: string
  variables: string[]
  created_at: string
}

export function useTransmissionAssets() {
  return useQuery({
    queryKey: ['transmission_assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transmission_assets')
        .select('*')
        .order('name', { ascending: true })
      
      if (error) throw error
      return data as TransmissionAsset[]
    }
  })
}
