import { create } from 'zustand'

interface Signal {
    id: string
    time: Date
    type: 'MARKET' | 'INTEL' | 'CALL' | 'EMAIL' | 'TASK'
    message: string
}

interface WarRoomState {
    isOpen: boolean
    signalHistory: Signal[]
    open: () => void
    close: () => void
    toggle: () => void
    addSignal: (signal: Signal) => void
}

export const useWarRoomStore = create<WarRoomState>((set) => ({
    isOpen: false,
    signalHistory: [],
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    addSignal: (signal) => set((s) => ({
        signalHistory: [signal, ...s.signalHistory].slice(0, 50)
    })),
}))
