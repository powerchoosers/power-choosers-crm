import { create } from 'zustand'

export type RightPanelMode = 'DEFAULT' | 'INGEST_ACCOUNT' | 'INGEST_CONTACT';

interface UIState {
  isEditing: boolean
  setIsEditing: (isEditing: boolean) => void
  toggleEditing: () => void
  rightPanelMode: RightPanelMode
  setRightPanelMode: (mode: RightPanelMode) => void
}

export const useUIStore = create<UIState>((set) => ({
  isEditing: false,
  setIsEditing: (isEditing) => set({ isEditing }),
  toggleEditing: () => set((state) => ({ isEditing: !state.isEditing })),
  rightPanelMode: 'DEFAULT',
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
}))
