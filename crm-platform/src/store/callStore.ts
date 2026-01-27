import { create } from 'zustand'

interface CallState {
  isActive: boolean
  status: 'idle' | 'dialing' | 'connected' | 'ended' | 'error'
  phoneNumber: string
  metadata: {
    name?: string
    account?: string
    title?: string
    logoUrl?: string
  } | null
  setActive: (active: boolean) => void
  setStatus: (status: CallState['status']) => void
  setPhoneNumber: (phone: string) => void
  setMetadata: (metadata: CallState['metadata']) => void
  initiateCall: (phone: string, metadata?: CallState['metadata']) => void
  clearCallTrigger: () => void
  callTriggered: boolean
}

export const useCallStore = create<CallState>((set) => ({
  isActive: false,
  status: 'idle',
  phoneNumber: '',
  metadata: null,
  callTriggered: false,
  setActive: (active) => set({ isActive: active }),
  setStatus: (status) => set({ status }),
  setPhoneNumber: (phoneNumber) => set({ phoneNumber }),
  setMetadata: (metadata) => set({ metadata }),
  initiateCall: (phoneNumber, metadata = null) => set({ 
    phoneNumber, 
    metadata, 
    callTriggered: true 
  }),
  clearCallTrigger: () => set({ callTriggered: false }),
}))
