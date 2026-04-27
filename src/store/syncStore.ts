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
  isIngestAborted: boolean
  ingestProgress: number
  ingestTotal: number
  ingestVector: 'CONTACTS' | 'ACCOUNTS' | null
  ingestLogs: string[]
  ingestErrors: any[]
  startIngestion: (total: number, vector: 'CONTACTS' | 'ACCOUNTS') => void
  updateIngestProgress: (progress: number) => void
  addIngestLog: (log: string) => void
  addIngestError: (error: any) => void
  cancelIngestion: () => void
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
  isIngestAborted: false,
  ingestProgress: 0,
  ingestTotal: 0,
  ingestVector: null,
  ingestLogs: [],
  ingestErrors: [],
  startIngestion: (total, vector) => set({ isIngesting: true, isIngestAborted: false, ingestProgress: 0, ingestTotal: total, ingestVector: vector, ingestLogs: [], ingestErrors: [] }),
  updateIngestProgress: (progress) => set({ ingestProgress: progress }),
  addIngestLog: (log) => set(state => ({ ingestLogs: [...state.ingestLogs, log].slice(-100) })),
  addIngestError: (error) => set(state => ({ ingestErrors: [...state.ingestErrors, error] })),
  cancelIngestion: () => set({ isIngestAborted: true, isIngesting: false }),
  finishIngestion: () => set({ isIngesting: false, isIngestAborted: false, ingestProgress: 0, ingestTotal: 0, ingestVector: null, ingestLogs: [], ingestErrors: [] })
}))
