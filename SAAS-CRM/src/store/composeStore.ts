import { create } from 'zustand'
import type { ComposeContext } from '@/components/emails/ComposeModal'

type ComposePayload = {
  to?: string
  subject?: string
  context?: ComposeContext | null
}

interface ComposeState {
  isOpen: boolean
  to: string
  subject: string
  context: ComposeContext | null
  openCompose: (payload?: ComposePayload) => void
  closeCompose: () => void
  setComposeContext: (context: ComposeContext | null) => void
}

export const useComposeStore = create<ComposeState>((set) => ({
  isOpen: false,
  to: '',
  subject: '',
  context: null,
  openCompose: (payload) =>
    set((state) => ({
      isOpen: true,
      to: payload?.to ?? state.to ?? '',
      subject: payload?.subject ?? state.subject ?? '',
      context: payload?.context ?? state.context ?? null,
    })),
  closeCompose: () =>
    set({
      isOpen: false,
      to: '',
      subject: '',
      context: null,
    }),
  setComposeContext: (context) => set({ context }),
}))

