import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface Signal {
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
    clearSignals: () => void
}

export const useWarRoomStore = create<WarRoomState>()(
    persist(
        (set) => ({
            isOpen: false,
            signalHistory: [],
            open: () => set({ isOpen: true }),
            close: () => set({ isOpen: false }),
            toggle: () => set((s) => ({ isOpen: !s.isOpen })),
            addSignal: (signal) => set((s) => {
                // Dedup: skip if last signal has the same type + message
                const last = s.signalHistory[0]
                if (last && last.type === signal.type && last.message === signal.message) {
                    return s
                }
                return { signalHistory: [signal, ...s.signalHistory].slice(0, 50) }
            }),
            clearSignals: () => set({ signalHistory: [] }),
        }),
        {
            name: 'war-room-signals',
            storage: createJSONStorage(() => sessionStorage),
            // Only persist signalHistory, not open/close state
            partialize: (state) => ({ signalHistory: state.signalHistory }),
        }
    )
)
