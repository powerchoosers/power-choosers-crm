import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type DealStage } from '@/types/deals'

export type RightPanelMode = 'DEFAULT' | 'INGEST_ACCOUNT' | 'INGEST_CONTACT' | 'CREATE_TASK' | 'CREATE_DEAL' | 'CREATE_SIGNATURE_REQUEST' | 'SEND_PORTAL_ACCESS';

export interface SignatureRequestContext {
  documentId?: string
  documentName?: string
  documentUrl?: string
  storagePath?: string
  accountId?: string
  dealId?: string
}

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
  entityPhotoUrl?: string
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
  defaultTitle?: string
  mode?: 'create' | 'edit'
  dealId?: string
  stage?: DealStage
  amount?: number
  annualUsage?: number
  mills?: number
  contractLength?: number
  closeDate?: string
  probability?: number
  yearlyCommission?: number
  sellRate?: number
  metadata?: Record<string, unknown>
}

export interface PortalAccessContext {
  accountId: string
  accountName?: string
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
  /** Pre-filled context for signature requests */
  signatureRequestContext: SignatureRequestContext | null
  setSignatureRequestContext: (ctx: SignatureRequestContext | null) => void
  /** Pre-filled context for portal access provisioning */
  portalAccessContext: PortalAccessContext | null
  setPortalAccessContext: (ctx: PortalAccessContext | null) => void
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
  /** Persisted active tab for Signal Matrix (survives navigation + browser restart) */
  signalMatrixTab: 'recon' | 'monitor'
  setSignalMatrixTab: (tab: 'recon' | 'monitor') => void
  /** Global audio toggle */
  soundEnabled: boolean
  setSoundEnabled: (enabled: boolean) => void
  toggleSound: () => void

  /** Granular sound settings */
  soundIncomingEnabled: boolean
  setSoundIncomingEnabled: (enabled: boolean) => void
  soundActionEnabled: boolean
  setSoundActionEnabled: (enabled: boolean) => void
  soundNavigationEnabled: boolean
  setSoundNavigationEnabled: (enabled: boolean) => void
  soundCriticalEnabled: boolean
  setSoundCriticalEnabled: (enabled: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
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
      signatureRequestContext: null,
      setSignatureRequestContext: (ctx) => set({ signatureRequestContext: ctx }),
      portalAccessContext: null,
      setPortalAccessContext: (ctx) => set({ portalAccessContext: ctx }),
      ingestionIdentifier: null,
      setIngestionIdentifier: (id) => set({ ingestionIdentifier: id }),
      ingestionSignal: null,
      setIngestionSignal: (signal) => set({ ingestionSignal: signal }),
      lastEnrichedAccountId: null,
      setLastEnrichedAccountId: (id) => set({ lastEnrichedAccountId: id }),
      lastEnrichedContactId: null,
      setLastEnrichedContactId: (id) => set({ lastEnrichedContactId: id }),
      signalMatrixTab: 'recon',
      setSignalMatrixTab: (tab) => set({ signalMatrixTab: tab }),
      
      soundEnabled: true,
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

      soundIncomingEnabled: true,
      setSoundIncomingEnabled: (enabled) => set({ soundIncomingEnabled: enabled }),
      soundActionEnabled: true,
      setSoundActionEnabled: (enabled) => set({ soundActionEnabled: enabled }),
      soundNavigationEnabled: true,
      setSoundNavigationEnabled: (enabled) => set({ soundNavigationEnabled: enabled }),
      soundCriticalEnabled: true,
      setSoundCriticalEnabled: (enabled) => set({ soundCriticalEnabled: enabled }),
    }),
    {
      name: 'nodal-ui-storage',
    }
  )
)
