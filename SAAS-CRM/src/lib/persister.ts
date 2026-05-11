import { get, set, del } from 'idb-keyval'
import { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

/**
 * Creates an IndexedDB persister for TanStack Query
 * Uses idb-keyval for simple key-value storage in IndexedDB
 */
export function createIDBPersister(idbValidKey: IDBValidKey = 'reactQuery'): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(idbValidKey, client)
      } catch (error: unknown) {
        // DataCloneError when client contains non-clonable values (e.g. Promise); skip persist
        if (error instanceof Error && error.name === 'DataCloneError') return
        console.error('Error persisting query client:', error)
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(idbValidKey)
      } catch (error) {
        console.error('Error restoring query client:', error)
        return undefined
      }
    },
    removeClient: async () => {
      try {
        await del(idbValidKey)
      } catch (error) {
        console.error('Error removing query client:', error)
      }
    },
  }
}
