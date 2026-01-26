export interface List {
  id: string
  name: string
  kind: 'people' | 'account'
  ownerId?: string
  assignedTo?: string
  createdBy?: string
  createdAt: string
  metadata?: Record<string, any>
  count?: number // Computed property
}

export interface ListMember {
  id: string
  listId: string
  targetId: string
  targetType: string
  addedAt: string
}
