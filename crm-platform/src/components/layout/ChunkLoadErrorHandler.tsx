'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

const CHUNK_ERROR_KEY = 'np-chunk-error-handled'

/**
 * Listens for ChunkLoadError (e.g. stale chunk after deploy or Turbopack rebuild).
 * Shows a single toast with a Refresh action so the dossier/page can load after reload.
 */
export function ChunkLoadErrorHandler() {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const err = event?.reason
      const isChunkError =
        err?.name === 'ChunkLoadError' ||
        (typeof err?.message === 'string' && err.message.includes('ChunkLoadError')) ||
        (typeof err?.message === 'string' && err.message.includes('Failed to load chunk'))

      if (!isChunkError) return

      event.preventDefault()
      const alreadyHandled = sessionStorage.getItem(CHUNK_ERROR_KEY)
      if (alreadyHandled) return
      sessionStorage.setItem(CHUNK_ERROR_KEY, '1')

      toast.error('Update required', {
        description: 'A new build is available. Refresh to open this page.',
        action: {
          label: 'Refresh',
          onClick: () => {
            sessionStorage.removeItem(CHUNK_ERROR_KEY)
            window.location.reload()
          },
        },
        duration: 30_000,
      })
    }

    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return null
}
