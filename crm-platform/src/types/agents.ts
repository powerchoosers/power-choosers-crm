export type OwnerKind = 'human' | 'inbox' | 'unassigned' | 'raw'

export interface OwnerDirectoryEntry {
  key: string
  displayName: string
  kind: OwnerKind
  userId: string | null
  email: string | null
  firstName: string | null
  lastName: string | null
  aliases?: string[]
}

export interface TwilioNumberRecord {
  name: string | null
  number: string
  selected?: boolean | null
}

export interface AgentProgressTotals {
  owners: number
  accounts: number
  contacts: number
  calls: number
  emails: number
  tasks: number
  bills: number
  assignedNumbers: number
}

export interface AgentProgressRow extends OwnerDirectoryEntry {
  title: string | null
  territory: string | null
  status: string | null
  role: string | null
  assignedPhoneNumber: string | null
  assignedEmailAddress: string | null
  twilioNumbers: TwilioNumberRecord[]
  accountCount: number
  contactCount: number
  callCount: number
  emailCount: number
  taskCount: number
  billCount: number
  invoiceCount: number
  usageCount: number
  totalDocuments: number
  lastCallAt: string | null
  lastEmailAt: string | null
  lastBillAt: string | null
  lastActivityAt: string | null
  activeNumbers: number
  goals: Record<string, unknown> | null
  performance: Record<string, unknown> | null
}

export interface AgentProgressReport {
  generatedAt: string
  totals: AgentProgressTotals
  agents: AgentProgressRow[]
}

export interface AgentProfileInput {
  name?: string | null
  email?: string | null
  territory?: string | null
  status?: string | null
  role?: string | null
  assignedPhoneNumber?: string | null
  assignedEmailAddress?: string | null
  goals?: Record<string, unknown> | null
  performance?: Record<string, unknown> | null
  lastActive?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UserIdentityRecord {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  firstName?: string | null
  lastName?: string | null
  job_title?: string | null
  phone?: string | null
  photo_url?: string | null
  hosted_photo_url?: string | null
}

export interface AgentProfileRow {
  id: string
  name?: string | null
  email?: string | null
  territory?: string | null
  skills?: string[] | null
  status?: string | null
  role?: string | null
  goals?: Record<string, unknown> | null
  performance?: Record<string, unknown> | null
  assignedPhoneNumber?: string | null
  assignedEmailAddress?: string | null
  lastActive?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  metadata?: Record<string, unknown> | null
}
