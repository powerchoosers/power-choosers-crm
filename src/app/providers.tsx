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

  const [persister] = useState(() => createIDBPersister())

  return (
    <PersistQueryClientProvider 
      client={queryClient} 
      persistOptions={{ 
        persister, 
        maxAge: 1000 * 60 * 60 * 24 // Persist for 24 hours
      }}
    >
      <AuthProvider>
        {children}
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}