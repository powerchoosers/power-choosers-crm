'use client'

import { useMemo } from 'react'
import { useTasks, type Task } from './useTasks'

/**
 * Pending tasks for a single entity (contact or account).
 * Same filtering as ContextTasksWidget: by entityId, entityName, or relatedTo.
 */
export function useEntityTasks(entityId: string | undefined, entityName?: string) {
  const { data: tasksData } = useTasks()

  const pendingTasks = useMemo(() => {
    if (!entityId) return []
    const allTasks = tasksData?.pages.flatMap((p) => p.tasks) ?? []
    const forEntity = allTasks.filter((t: Task) => {
      const matchesId =
        (t.accountId && t.accountId === entityId) || (t.contactId && t.contactId === entityId)
      const matchesName = entityName && t.relatedTo === entityName
      const matchesRelatedId = t.relatedTo === entityId
      return matchesId || matchesName || matchesRelatedId
    })
    return forEntity.filter((t: Task) => (t.status ?? 'Pending') !== 'Completed')
  }, [tasksData, entityId, entityName])

  return { pendingTasks, totalCount: pendingTasks.length }
}
