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
import { GlobalComposeModal } from '@/components/emails/GlobalComposeModal'
import { GlobalSync } from '@/components/layout/GlobalSync'
import { DesktopUpdateBanner } from '@/components/layout/DesktopUpdateBanner'
import { DesktopFolderSyncBridge } from '@/components/layout/DesktopFolderSyncBridge'


import { useUIStore } from '@/store/uiStore'
import { SequenceIntelModal } from '@/components/sequences/SequenceIntelModal'

const PERSISTED_QUERY_FAMILIES = new Set([
  'accounts',
  'account',
  'account-bill-intel',
  'contacts',
  'contact',
  'calls',
  'emails',
  'email',
  'email-thread',
  'entity-emails',
  'tasks',
  'tasks-all-pending',
  'tasks-count',
  'tasks-metrics',
  'targets',
  'vault-documents',
  'notification-center-feed',
  'signature-requests',
  'market-pulse',
  'eia-retail-tx',
  'scripts',
])

function GlobalShortcuts() {
  const toggleWarRoom = useWarRoomStore((s) => s.toggle)
  const toggleSequenceIntel = useUIStore((s) => s.toggleSequenceIntel)

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

      // Sequence Intel: Ctrl+Alt+I
      if (isCtrl && isAlt && key === 'i') {
        e.preventDefault()
        e.stopPropagation()
        toggleSequenceIntel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleWarRoom, toggleSequenceIntel])

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
            buster: 'v3',
            maxAge: 1000 * 60 * 60 * 24,
            dehydrateOptions: {
              shouldDehydrateMutation: () => false,
              shouldDehydrateQuery: (query) => {
                if (query.state.fetchStatus === 'fetching') return false
                const key0 = Array.isArray(query.queryKey) ? query.queryKey[0] : undefined
                if (typeof key0 !== 'string') return false
                return PERSISTED_QUERY_FAMILIES.has(key0)
              },
            },
          }}
    >
      <AuthProvider>
        <VoiceProvider>
          <ChunkLoadErrorHandler />
          <GlobalShortcuts />
          <DesktopUpdateBanner />
          <DesktopFolderSyncBridge />
          <GlobalSync />
          <WarRoomOverlay />
          <GlobalComposeModal />
          <SequenceIntelModal 
            isOpen={sequenceIntelOpen} 
            onClose={() => setSequenceIntelOpen(false)} 
            sequenceId={activeSequenceId || undefined} 
          />
          {children}
        </VoiceProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
