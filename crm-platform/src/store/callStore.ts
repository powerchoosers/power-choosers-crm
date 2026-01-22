import { create } from 'zustand'

interface CallState {
  isActive: boolean
  status: 'idle' | 'dialing' | 'connected' | 'ended'
  setActive: (active: boolean) => void
  setStatus: (status: CallState['status']) => void
}

export const useCallStore = create<CallState>((set) => ({
  isActive: false,
  status: 'idle',
  setActive: (active) => set({ isActive: active }),
  setStatus: (status) => set({ status }),
}))
