'use client'

import { useMemo } from 'react'
import { useAllPendingTasks, type Task } from './useTasks'
import { isPendingTask, isTodayOrOverdue } from '@/lib/task-date'

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
 * Active tasks for a single entity (contact or account).
 * Same filtering as ContextTasksWidget: by entityId, entityName, or relatedTo.
 * Future-dated tasks are excluded so dossiers only page through work that is due.
 */
export function useEntityTasks(entityId: string | undefined, entityName?: string, options?: Omit<EntityTaskScope, 'entityName'>) {
  const { data: allPendingData } = useAllPendingTasks()

  const pendingTasks = useMemo(() => {
    if (!entityId) return []
    const allTasks = allPendingData?.allPendingTasks ?? []
    const forEntity = allTasks.filter((t: Task) =>
      taskMatchesEntityScope(t, {
        entityName,
        contactId: options?.contactId,
        accountId: options?.accountId,
        includeContactIds: options?.includeContactIds,
      })
    )
    return forEntity.filter((task: Task) => isPendingTask(task) && isTodayOrOverdue(task.dueDate))
  }, [allPendingData?.allPendingTasks, entityId, entityName, options?.contactId, options?.accountId, options?.includeContactIds])

  return { pendingTasks, totalCount: pendingTasks.length }
}
