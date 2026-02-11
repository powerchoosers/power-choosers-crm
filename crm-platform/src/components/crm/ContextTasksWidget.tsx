'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { ListTodo, Circle, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTasks, type Task } from '@/hooks/useTasks'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { cn } from '@/lib/utils'

const EXIT_DELAY_MS = 180
const exitTransition = { duration: 0.4, ease: [0.32, 0.72, 0, 1] as const }
const layoutTransition = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as const }

interface ContextTasksWidgetProps {
  entityId: string
  entityName?: string
}

export default function ContextTasksWidget({ entityId, entityName }: ContextTasksWidgetProps) {
  const { data: tasksData, updateTask } = useTasks()
  const [exitingTask, setExitingTask] = useState<{ task: Task; index: number } | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tasks = useMemo(() => {
    if (!entityId) return []
    const allTasks = tasksData?.pages.flatMap(page => page.tasks) || []
    return allTasks.filter(t => {
      const matchesId = (t.accountId && t.accountId === entityId) ||
                       (t.contactId && t.contactId === entityId)
      const matchesName = entityName && t.relatedTo === entityName
      const matchesRelatedId = t.relatedTo === entityId
      return matchesId || matchesName || matchesRelatedId
    })
  }, [tasksData, entityId, entityName])

  const pendingTasks = useMemo(
    () => tasks.filter(t => (t.status ?? 'Pending') !== 'Completed'),
    [tasks]
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

  return (
    <div className="space-y-2 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {listToRender.length > 0 ? (
          listToRender.map((task, i) => {
            const isExiting = exitingTask?.task.id === task.id
            const isCompleted = isExiting || (task.status ?? '').toLowerCase() === 'completed'
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
                <div className="group flex items-start gap-3 p-3 rounded-xl nodal-module-glass nodal-monolith-edge hover:bg-white/5 transition-colors">
                  <button
                    type="button"
                    onClick={() => !isCompleted && handleComplete(task, i)}
                    className={cn(
                      'flex-shrink-0 mt-0.5 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20',
                      isCompleted ? 'text-emerald-500 cursor-default' : 'text-zinc-600 hover:text-zinc-400 cursor-pointer'
                    )}
                    aria-label={isCompleted ? 'Completed' : 'Mark complete'}
                  >
                    {isCompleted ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Circle size={14} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-[11px] font-medium truncate transition-colors duration-300',
                        isCompleted ? 'text-zinc-500 line-through' : 'text-zinc-300 group-hover:text-white'
                      )}
                    >
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <PriorityBadge priority={task.priority} labelStyle="suffix" completed={isCompleted} />
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
    </div>
  )
}
