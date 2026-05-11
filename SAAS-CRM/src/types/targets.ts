export interface Target {
  id: string
  name: string
  kind: 'people' | 'person' | 'contact' | 'contacts' | 'account' | 'accounts' | 'company' | 'companies'
  ownerId?: string
  assignedTo?: string
  createdBy?: string
  createdAt: string
  metadata?: Record<string, unknown>
  count?: number // Computed property
}

export interface TargetMember {
  id: string
  targetGroupId: string
  targetId: string
  targetType: string
  addedAt: string
}
