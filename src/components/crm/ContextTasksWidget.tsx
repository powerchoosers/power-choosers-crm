'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ListTodo, Circle, CheckCircle2, ChevronDown, ChevronUp, CalendarCheck, CalendarX, CalendarClock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAllPendingTasks, useTasks, type Task } from '@/hooks/useTasks'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { cn } from '@/lib/utils'
import { buildTaskVariableMap, resolveTaskTemplateText } from '@/lib/task-variables'
import { compareTasksByDueDate, isPendingTask } from '@/lib/task-date'
import { taskMatchesEntityScope } from '@/hooks/useEntityTasks'

const EXIT_DELAY_MS = 180
const exitTransition = { duration: 0.4, ease: [0.32, 0.72, 0, 1] as const }
const layoutTransition = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as const }

interface ContextTasksWidgetProps {
  entityId: string
  entityName?: string
  contactId?: string
  accountId?: string
  includeContactIds?: string[]
  contactContext?: Record<string, unknown> | null
  accountContext?: Record<string, unknown> | null
}

export default function ContextTasksWidget({
  entityId,
  entityName,
  contactId,
  accountId,
  includeContactIds,
  contactContext,
  accountContext
}: ContextTasksWidgetProps) {
  const router = useRouter()
  const { data: allPendingData } = useAllPendingTasks()
  const { updateTask } = useTasks()
  const [exitingTask, setExitingTask] = useState<{ task: Task; index: number } | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const tasks = useMemo(() => {
    if (!entityId) return []
    const allTasks = allPendingData?.allPendingTasks ?? []
    return allTasks
      .filter((task) => taskMatchesEntityScope(task, { entityName, contactId, accountId, includeContactIds }))
      .sort(compareTasksByDueDate)
  }, [allPendingData?.allPendingTasks, entityId, entityName, contactId, accountId, includeContactIds])

  const pendingTasks = useMemo(
    () => tasks.filter(isPendingTask),
    [tasks]
  )

  const panelContextVariables = useMemo(
    () => buildTaskVariableMap({ contact: contactContext, account: accountContext }),
    [contactContext, accountContext]
  )

  const listWithoutExiting = useMemo(() => {
    if (!exitingTask) return pendingTasks
    return pendingTasks.filter(t => t.id !== exitingTask.task.id)
  }, [pendingTasks, exitingTask])

  const listToRender = useMemo(() => {
    if (!exitingTask) return listWithoutExiting
    const { task, index } = exitingTask
    const completedTask = { ...task, status: 'Completed' as const }
    return [...listWithoutExiting.slice(0, index), completedTask, ...listWithoutExiting.slice(index)]
  }, [listWithoutExiting, exitingTask])

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current)
    }
  }, [])

  const handleComplete = (task: Task, index: number) => {
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current)
    setExitingTask({ task, index })
    updateTask({ id: task.id, status: 'Completed' })
    exitTimeoutRef.current = setTimeout(() => {
      exitTimeoutRef.current = null
      setExitingTask(null)
    }, EXIT_DELAY_MS)
  }

  const handleNavigate = (task: Task) => {
    if (task.contactId) {
      router.push(`/network/contacts/${task.contactId}`)
    } else if (task.accountId) {
      router.push(`/network/accounts/${task.accountId}`)
    }
  }

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  return (
    <motion.div layout className="space-y-2 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {listToRender.length > 0 ? (
          listToRender.map((task, i) => {
            const isExiting = exitingTask?.task.id === task.id
            const isCompleted = isExiting || (task.status ?? '').toLowerCase() === 'completed'
            const isExpanded = expandedTaskIds.has(task.id)
            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ x: '100%', opacity: 0, transition: exitTransition }}
                transition={layoutTransition}
                className="rounded-xl"
              >
                <div 
                  onClick={() => handleNavigate(task)}
                  className={cn(
                    "group flex items-start gap-3 p-3 rounded-xl nodal-module-glass nodal-monolith-edge hover:bg-white/5 transition-colors",
                    (task.contactId || task.accountId) && "cursor-pointer"
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      !isCompleted && handleComplete(task, i)
                    }}
                    className={cn(
                      'flex-shrink-0 mt-0.5 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20',
                      isCompleted ? 'text-emerald-500 cursor-default' : 'text-zinc-600 hover:text-zinc-400 cursor-pointer'
                    )}
                    aria-label={isCompleted ? 'Completed' : 'Mark complete'}
                  >
                    {isCompleted ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Circle size={14} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    {(() => {
                      const rowVariables = buildTaskVariableMap({
                        contact: (task.contacts as Record<string, unknown> | null) || contactContext,
                        account: (task.accounts as Record<string, unknown> | null) || accountContext,
                      })
                      const variableMap = { ...panelContextVariables, ...rowVariables }
                      const title = resolveTaskTemplateText(task.title, variableMap)
                      const description = resolveTaskTemplateText(task.description, variableMap)
                      return (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn(
                                'text-[11px] font-medium transition-colors duration-300',
                                isExpanded ? 'leading-relaxed' : 'truncate',
                                isCompleted ? 'text-zinc-500 line-through' : 'text-zinc-300 group-hover:text-white'
                              )}
                            >
                              {title}
                            </p>
                            {description && (
                              <button
                                type="button"
                                className="icon-button-forensic p-1 flex items-center justify-center shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleTaskExpanded(task.id)
                                }}
                                aria-label={isExpanded ? 'Collapse step description' : 'Expand step description'}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </div>
                          {description && (
                            <motion.p
                              layout
                              className={cn(
                                'text-[10px] mt-0.5 transition-colors duration-300',
                                isExpanded ? 'line-clamp-none' : 'line-clamp-4',
                                isCompleted ? 'text-zinc-600 line-through' : 'text-zinc-500'
                              )}
                            >
                              {description}
                            </motion.p>
                          )}
                        </>
                      )
                    })()}
                    <div className="flex items-center gap-2 mt-1">
                      <PriorityBadge priority={task.priority} labelStyle="suffix" completed={isCompleted} />
                      {task.priority === 'BRIEFING' && !!task.metadata?.syncCalendar && (
                        task.metadata?.rsvpStatus === 'ACCEPTED' ? (
                          <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 rounded">
                            <CalendarCheck size={9} /> ACCEPTED
                          </span>
                        ) : task.metadata?.rsvpStatus === 'DECLINED' ? (
                          <span className="flex items-center gap-1 text-[9px] font-mono text-rose-400 border border-rose-500/30 bg-rose-500/5 px-1.5 py-0.5 rounded">
                            <CalendarX size={9} /> DECLINED
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-mono text-amber-400/70 border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 rounded">
                            <CalendarClock size={9} /> AWAITING
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={layoutTransition}
            className="text-center py-6 border border-dashed border-white/5 rounded-2xl"
          >
            <ListTodo size={20} className="mx-auto text-zinc-800 mb-2" />
            <p className="text-[10px] font-mono text-zinc-700 uppercase">No active tasks</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
