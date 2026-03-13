'use client'

import { useMemo } from 'react'
import { useTasks, type Task } from './useTasks'
import { isPendingTask } from '@/lib/task-date'

interface EntityTaskScope {
  contactId?: string
  accountId?: string
  entityName?: string
  includeContactIds?: string[]
}

export function taskMatchesEntityScope(task: Task, scope: EntityTaskScope): boolean {
  const contactId = scope.contactId?.trim()
  const accountId = scope.accountId?.trim()
  const entityName = scope.entityName?.trim()
  const includeContactIds = (scope.includeContactIds ?? []).filter(Boolean)

  const taskContactId = task.contactId?.trim()
  const taskAccountId = task.accountId?.trim()
  const taskRelatedTo = task.relatedTo?.trim()

  if (contactId && taskContactId === contactId) return true
  if (accountId && taskAccountId === accountId) return true
  if (entityName && taskRelatedTo === entityName) return true
  if (contactId && taskRelatedTo === contactId) return true
  if (accountId && taskRelatedTo === accountId) return true

  // Account context should also include tasks tied directly to contacts under that account.
  if (includeContactIds.length > 0 && taskContactId && includeContactIds.includes(taskContactId)) return true

  return false
}

/**
 * Pending tasks for a single entity (contact or account).
 * Same filtering as ContextTasksWidget: by entityId, entityName, or relatedTo.
 */
export function useEntityTasks(entityId: string | undefined, entityName?: string, options?: Omit<EntityTaskScope, 'entityName'>) {
  const { data: tasksData } = useTasks()

  const pendingTasks = useMemo(() => {
    if (!entityId) return []
    const allTasks = tasksData?.pages.flatMap((p) => p.tasks) ?? []
    const forEntity = allTasks.filter((t: Task) =>
      taskMatchesEntityScope(t, {
        entityName,
        contactId: options?.contactId,
        accountId: options?.accountId,
        includeContactIds: options?.includeContactIds,
      })
    )
    return forEntity.filter(isPendingTask)
  }, [tasksData, entityId, entityName, options?.contactId, options?.accountId, options?.includeContactIds])

  return { pendingTasks, totalCount: pendingTasks.length }
}
