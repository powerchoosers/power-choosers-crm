'use client'

import type { Task } from '@/hooks/useTasks'

function parseDueDate(dueDate?: string): Date | null {
  if (!dueDate) return null

  const parsed = new Date(dueDate)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed
}

export function isDueToday(dueDate?: string): boolean {
  const parsed = parseDueDate(dueDate)
  if (!parsed) return false

  const now = new Date()
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  )
}

export function isOverdue(dueDate?: string): boolean {
  const parsed = parseDueDate(dueDate)
  if (!parsed) return false

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  return parsed.getTime() < startOfToday.getTime()
}

export function isTodayOrOverdue(dueDate?: string): boolean {
  return isDueToday(dueDate) || isOverdue(dueDate)
}

export function isPendingTask(task: Task): boolean {
  return (task.status ?? 'Pending') !== 'Completed'
}

export function compareTasksByDueDate(a: Task, b: Task): number {
  const aDate = parseDueDate(a.dueDate)
  const bDate = parseDueDate(b.dueDate)

  if (aDate && bDate) return aDate.getTime() - bDate.getTime()
  if (aDate) return -1
  if (bDate) return 1

  const aCreated = new Date(a.createdAt).getTime()
  const bCreated = new Date(b.createdAt).getTime()
  return bCreated - aCreated
}
