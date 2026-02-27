export type DealStage =
  | 'IDENTIFIED'
  | 'AUDITING'
  | 'BRIEFED'
  | 'ENGAGED'
  | 'SECURED'
  | 'TERMINATED'

export const DEAL_STAGES: DealStage[] = [
  'IDENTIFIED',
  'AUDITING',
  'BRIEFED',
  'ENGAGED',
  'SECURED',
  'TERMINATED',
]

export interface Deal {
  id: string
  title: string
  accountId: string
  contactId?: string
  stage: DealStage
  amount?: number           // annual contract value ($)
  annualUsage?: number      // kWh/year
  mills?: number            // price per kWh in mills (1 mill = $0.001)
  contractLength?: number   // term in months
  commissionType?: string
  yearlyCommission?: number
  closeDate?: string        // ISO date string
  probability?: number      // 0–100
  ownerId?: string
  assignedTo?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
  // Joined from accounts (populated by useDeals query)
  account?: {
    name: string
    domain?: string
  }
}

export interface CreateDealInput {
  title: string
  accountId: string
  contactId?: string
  stage?: DealStage
  amount?: number
  annualUsage?: number
  mills?: number
  contractLength?: number
  commissionType?: string
  yearlyCommission?: number
  closeDate?: string
  probability?: number
}

export interface UpdateDealInput {
  id: string
  title?: string
  accountId?: string
  contactId?: string | null
  stage?: DealStage
  amount?: number
  annualUsage?: number
  mills?: number
  contractLength?: number
  commissionType?: string
  yearlyCommission?: number
  closeDate?: string
  probability?: number
  metadata?: Record<string, unknown>
}
