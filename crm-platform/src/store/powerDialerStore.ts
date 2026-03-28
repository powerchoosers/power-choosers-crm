import { create } from 'zustand'
import type { PowerDialSourceContact } from '@/lib/powerDialer'

interface PowerDialerState {
  contacts: PowerDialSourceContact[]
  selectedCount: number
  sourceLabel: string | null
  batchSize: number
  sessionId: number
  openPowerDialer: (payload: {
    contacts: PowerDialSourceContact[]
    selectedCount: number
    sourceLabel?: string | null
  }) => void
  clearPowerDialer: () => void
}

const initialState = {
  contacts: [] as PowerDialSourceContact[],
  selectedCount: 0,
  sourceLabel: null as string | null,
  batchSize: 3,
  sessionId: 0,
}

export const usePowerDialerStore = create<PowerDialerState>((set) => ({
  ...initialState,
  openPowerDialer: ({ contacts, selectedCount, sourceLabel = null }) => {
    set((state) => ({
      contacts: Array.isArray(contacts) ? contacts : [],
      selectedCount: Math.max(0, selectedCount || 0),
      sourceLabel,
      sessionId: state.sessionId + 1,
    }))
  },
  clearPowerDialer: () => set({ ...initialState }),
}))
