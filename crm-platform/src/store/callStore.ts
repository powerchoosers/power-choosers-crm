import { create } from 'zustand'

interface CallState {
  isActive: boolean
  status: 'idle' | 'dialing' | 'connected' | 'ended' | 'error'
  phoneNumber: string
  /** Increments every time initiateCall fires — use as key to force fresh component instances */
  callSessionId: number
  metadata: {
    name?: string
    account?: string
    title?: string
    logoUrl?: string
    domain?: string
    industry?: string
    description?: string
    linkedinUrl?: string
    annualUsage?: string
    supplier?: string
    currentRate?: string
    contractEnd?: string
    location?: string
    isAccountOnly?: boolean
    contactId?: string
    accountId?: string
    metadata?: any
  } | null
  setActive: (active: boolean) => void
  setStatus: (status: CallState['status']) => void
  setPhoneNumber: (phone: string) => void
  setMetadata: (metadata: CallState['metadata']) => void
  initiateCall: (phone: string, metadata?: CallState['metadata']) => void
  clearCallTrigger: () => void
  callTriggered: boolean
  isCallHUDOpen: boolean
  setIsCallHUDOpen: (isOpen: boolean) => void
}

export const useCallStore = create<CallState>((set) => ({
  isActive: false,
  status: 'idle',
  phoneNumber: '',
  callSessionId: 0,
  metadata: null,
  callTriggered: false,
  isCallHUDOpen: false,
  setActive: (active) => set((state) => ({
    isActive: active,
    // Auto-close HUD when call ends
    isCallHUDOpen: active ? state.isCallHUDOpen : false
  })),
  setStatus: (status) => set({ status }),
  setPhoneNumber: (phoneNumber) => set({ phoneNumber }),
  setMetadata: (metadata) => set({ metadata }),
  setIsCallHUDOpen: (isCallHUDOpen) => set({ isCallHUDOpen }),
  initiateCall: (phoneNumber, metadata = null) => set((state) => ({
    phoneNumber,
    metadata,
    callTriggered: true,
    callSessionId: state.callSessionId + 1,
  })),
  clearCallTrigger: () => set({ callTriggered: false }),
}))
