import { create } from 'zustand'

export type RightPanelMode = 'DEFAULT' | 'INGEST_ACCOUNT' | 'INGEST_CONTACT';

export interface IngestionContext {
  accountId: string
  accountName: string
}

interface UIState {
  isEditing: boolean
  setIsEditing: (isEditing: boolean) => void
  toggleEditing: () => void
  rightPanelMode: RightPanelMode
  setRightPanelMode: (mode: RightPanelMode) => void
  /** Pre-filled context when opening INGEST_CONTACT from Account Dossier (Rapid Contact Injection) */
  ingestionContext: IngestionContext | null
  setIngestionContext: (ctx: IngestionContext | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  isEditing: false,
  setIsEditing: (isEditing) => set({ isEditing }),
  toggleEditing: () => set((state) => ({ isEditing: !state.isEditing })),
  rightPanelMode: 'DEFAULT',
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
  ingestionContext: null,
  setIngestionContext: (ctx) => set({ ingestionContext: ctx }),
}))
