import { create } from 'zustand'

interface GeminiState {
  activeContext: {
    type: string
    id: string
    label: string
    data?: any
  } | null
  setContext: (context: { type: string; id: string; label: string; data?: any } | null) => void
  isOpen: boolean
  isHistoryOpen: boolean
  setIsOpen: (open: boolean) => void
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  toggleHistory: () => void
  resetCounter: number
  resetSession: () => void
}

export const useGeminiStore = create<GeminiState>((set) => ({
  activeContext: null,
  setContext: (context) => set({ activeContext: context }),
  isOpen: false,
  isHistoryOpen: false,
  setIsOpen: (open) => set({ isOpen: open }),
  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
  toggleHistory: () => set((state) => ({ isHistoryOpen: !state.isHistoryOpen })),
  resetCounter: 0,
  resetSession: () => set((state) => ({ 
    resetCounter: state.resetCounter + 1,
    isHistoryOpen: false 
  })),
}))
