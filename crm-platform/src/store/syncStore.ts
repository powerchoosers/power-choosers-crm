import { create } from 'zustand'

interface SyncStore {
  isSyncing: boolean
  lastSyncTime: number | null
  syncCount: number
  setIsSyncing: (syncing: boolean) => void
  setLastSyncTime: (time: number) => void
  incrementSyncCount: () => void
  setSyncCount: (count: number) => void
  
  // Ingestion State
  isIngesting: boolean
  ingestProgress: number
  ingestTotal: number
  ingestVector: 'CONTACTS' | 'ACCOUNTS' | null
  startIngestion: (total: number, vector: 'CONTACTS' | 'ACCOUNTS') => void
  updateIngestProgress: (progress: number) => void
  finishIngestion: () => void
}

export const useSyncStore = create<SyncStore>((set) => ({
  isSyncing: false,
  lastSyncTime: null,
  syncCount: 0,
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  incrementSyncCount: () => set((state) => ({ syncCount: state.syncCount + 1 })),
  setSyncCount: (count) => set({ syncCount: count }),

  // Ingestion State
  isIngesting: false,
  ingestProgress: 0,
  ingestTotal: 0,
  ingestVector: null,
  startIngestion: (total, vector) => set({ isIngesting: true, ingestProgress: 0, ingestTotal: total, ingestVector: vector }),
  updateIngestProgress: (progress) => set({ ingestProgress: progress }),
  finishIngestion: () => set({ isIngesting: false, ingestProgress: 0, ingestTotal: 0, ingestVector: null })
}))
