import { create } from 'zustand'

interface GeminiState {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
}

export const useGeminiStore = create<GeminiState>((set) => ({
  isOpen: false,
  setIsOpen: (open) => set({ isOpen: open }),
  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
}))
