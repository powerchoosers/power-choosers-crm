'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useEffect, useState } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { VoiceProvider } from '@/context/VoiceContext'
import { createIDBPersister } from '@/lib/persister'
import { ChunkLoadErrorHandler } from '@/components/layout/ChunkLoadErrorHandler'
import { WarRoomOverlay } from '@/components/war-room/WarRoomOverlay'
import { useWarRoomStore } from '@/store/warRoomStore'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle, Eye } from 'lucide-react'

function GlobalListeners() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase.channel('global-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'signature_requests' },
        (payload) => {
          const oldRecord = payload.old
          const newRecord = payload.new

          if (oldRecord.status !== 'completed' && newRecord.status === 'completed') {
            toast('Contract Secured', {
              icon: <CheckCircle className="w-4 h-4 text-emerald-500" />
            })
            // Invalidate lists to fetch real-time updates without polling
            queryClient.invalidateQueries({ queryKey: ['deals'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })
            queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
          } else if (oldRecord.status !== 'opened' && newRecord.status === 'opened') {
            toast('Signature Email Opened', {
              icon: <Eye className="w-4 h-4 text-[#002FA7]" />
            })
            queryClient.invalidateQueries({ queryKey: ['deals'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })
            queryClient.invalidateQueries({ queryKey: ['emails'] })
          } else if (oldRecord.status !== 'viewed' && newRecord.status === 'viewed') {
            toast('Contract Viewed by Signatory', {
              icon: <Eye className="w-4 h-4 text-[#002FA7]" />
            })
            queryClient.invalidateQueries({ queryKey: ['deals'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })
            queryClient.invalidateQueries({ queryKey: ['emails'] })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return null
}

function WarRoomKeyListener() {
  const toggle = useWarRoomStore((s) => s.toggle)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+W (Cmd+Shift+W on Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  return null
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: false,
      },
    },
  }))

  const [persister] = useState(() => createIDBPersister('reactQuery-v2'))

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: 'v2',
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: (query) => {
            if (query.state.fetchStatus === 'fetching') return false
            const key0 = Array.isArray(query.queryKey) ? query.queryKey[0] : undefined
            if (typeof key0 !== 'string') return false
            return [
              'calls',
              'market-pulse',
              'eia-retail-tx',
              'scripts',
            ].includes(key0)
          },
        },
      }}
    >
      <AuthProvider>
        <VoiceProvider>
          <GlobalListeners />
          <ChunkLoadErrorHandler />
          <WarRoomKeyListener />
          <WarRoomOverlay />
          {children}
        </VoiceProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
