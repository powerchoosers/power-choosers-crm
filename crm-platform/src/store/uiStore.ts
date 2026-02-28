import { create } from 'zustand'

export type RightPanelMode = 'DEFAULT' | 'INGEST_ACCOUNT' | 'INGEST_CONTACT' | 'CREATE_TASK' | 'CREATE_DEAL';

export interface IngestionContext {
  accountId: string
  accountName: string
  accountLogoUrl?: string
  accountDomain?: string
}

export interface TaskContext {
  entityId: string
  entityName?: string
  entityType: 'contact' | 'account'
  entityLogoUrl?: string
  entityDomain?: string
  contactId?: string
  accountId?: string
}

export interface DealContext {
  accountId?: string
  accountName?: string
  accountLogoUrl?: string
  accountDomain?: string
  contactId?: string
  contactName?: string
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
  /** Pre-filled context when opening CREATE_TASK mode */
  taskContext: TaskContext | null
  setTaskContext: (ctx: TaskContext | null) => void
  /** Pre-filled context when opening CREATE_DEAL mode */
  dealContext: DealContext | null
  setDealContext: (ctx: DealContext | null) => void
  /** Initial identifier (domain/url) for ingestion from external signals */
  ingestionIdentifier: string | null
  setIngestionIdentifier: (id: string | null) => void
  /** The full signal object that triggered this ingestion, to be committed to apollo_news_articles */
  ingestionSignal: any | null
  setIngestionSignal: (signal: any | null) => void
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
  taskContext: null,
  setTaskContext: (ctx) => set({ taskContext: ctx }),
  dealContext: null,
  setDealContext: (ctx) => set({ dealContext: ctx }),
  ingestionIdentifier: null,
  setIngestionIdentifier: (id) => set({ ingestionIdentifier: id }),
  ingestionSignal: null,
  setIngestionSignal: (signal) => set({ ingestionSignal: signal }),
  lastEnrichedAccountId: null,
  setLastEnrichedAccountId: (id) => set({ lastEnrichedAccountId: id }),
  lastEnrichedContactId: null,
  setLastEnrichedContactId: (id) => set({ lastEnrichedContactId: id }),
}))
