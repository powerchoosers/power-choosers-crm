'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useState } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { createIDBPersister } from '@/lib/persister'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
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
        maxAge: 1000 * 60 * 60 * 24, // Persist for 24 hours
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: (query) => {
            const key0 = Array.isArray(query.queryKey) ? query.queryKey[0] : undefined
            if (typeof key0 !== 'string') return false
            return [
              'calls',
              'energy-plans',
              'scripts',
            ].includes(key0)
          },
        },
      }}
    >
      <AuthProvider>
        {children}
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
