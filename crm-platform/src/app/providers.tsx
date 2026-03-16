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
import { GlobalComposeModal } from '@/components/emails/GlobalComposeModal'


import { useUIStore } from '@/store/uiStore'
import { SequenceIntelModal } from '@/components/sequences/SequenceIntelModal'

function GlobalShortcuts() {
  const toggleWarRoom = useWarRoomStore((s) => s.toggle)
  const toggleSequenceIntel = useUIStore((s) => s.toggleSequenceIntel)
  const activeSequenceId = useUIStore((s) => s.activeSequenceId)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isAlt = e.altKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();

      // War Room: Ctrl+Alt+W OR Ctrl+Shift+W
      if (isCtrl && (isAlt || isShift) && key === 'w') {
        e.preventDefault()
        toggleWarRoom()
      }

      // Sequence Intel: Ctrl+Alt+S OR Ctrl+Shift+S
      if (isCtrl && (isAlt || isShift) && key === 's' && activeSequenceId) {
        e.preventDefault()
        toggleSequenceIntel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleWarRoom, toggleSequenceIntel, activeSequenceId])

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
  const { sequenceIntelOpen, setSequenceIntelOpen, activeSequenceId } = useUIStore()

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
          <ChunkLoadErrorHandler />
          <GlobalShortcuts />
          <WarRoomOverlay />
          <GlobalComposeModal />
          {activeSequenceId && (
            <SequenceIntelModal 
              isOpen={sequenceIntelOpen} 
              onClose={() => setSequenceIntelOpen(false)} 
              sequenceId={activeSequenceId as string} 
            />
          )}
          {children}
        </VoiceProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
