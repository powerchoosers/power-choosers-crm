import { create } from 'zustand'

interface SyncStore {
  isSyncing: boolean
  lastSyncTime: number | null
  syncCount: number
  setIsSyncing: (syncing: boolean) => void
  setLastSyncTime: (time: number) => void
  incrementSyncCount: () => void
}

export const useSyncStore = create<SyncStore>((set) => ({
  isSyncing: false,
  lastSyncTime: null,
  syncCount: 0,
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  incrementSyncCount: () => set((state) => ({ syncCount: state.syncCount + 1 })),
}))
