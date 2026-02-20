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
  /** Initial identifier (domain/url) for ingestion from external signals */
  ingestionIdentifier: string | null
  setIngestionIdentifier: (id: string | null) => void
  /** Set when Org Intelligence enriches an account – dossier uses this to trigger blur-in */
  lastEnrichedAccountId: string | null
  setLastEnrichedAccountId: (id: string | null) => void
  /** Set when Org Intelligence enriches/acquires a contact – dossier uses this to trigger blur-in */
  lastEnrichedContactId: string | null
  setLastEnrichedContactId: (id: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  isEditing: false,
  setIsEditing: (isEditing) => set({ isEditing }),
  toggleEditing: () => set((state) => ({ isEditing: !state.isEditing })),
  rightPanelMode: 'DEFAULT',
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
  ingestionContext: null,
  setIngestionContext: (ctx) => set({ ingestionContext: ctx }),
  ingestionIdentifier: null,
  setIngestionIdentifier: (id) => set({ ingestionIdentifier: id }),
  lastEnrichedAccountId: null,
  setLastEnrichedAccountId: (id) => set({ lastEnrichedAccountId: id }),
  lastEnrichedContactId: null,
  setLastEnrichedContactId: (id) => set({ lastEnrichedContactId: id }),
}))
