'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { CheckSquare, Circle, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTasks, type Task } from '@/hooks/useTasks'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { cn } from '@/lib/utils'

const DISPLAY_LIMIT = 3
const EXIT_DELAY_MS = 180
const exitTransition = { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
const layoutTransition = { duration: 0.3, ease: [0.32, 0.72, 0, 1] }

function TaskRow({
  task,
  isCompleted,
  onComplete,
}: {
  task: Task
  isCompleted: boolean
  onComplete: () => void
}) {
  return (
    <div className="group flex items-start gap-3 p-3 rounded-xl nodal-module-glass nodal-monolith-edge hover:bg-white/5 transition-colors">
      <button
        type="button"
        onClick={onComplete}
        className={cn(
          'flex-shrink-0 mt-0.5 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20',
          isCompleted ? 'text-emerald-500 cursor-default' : 'text-zinc-600 hover:text-zinc-400 cursor-pointer'
        )}
        aria-label={isCompleted ? 'Completed' : 'Mark complete'}
      >
        {isCompleted ? (
          <CheckCircle2 size={14} className="text-emerald-500" />
        ) : (
          <Circle size={14} />
        )}
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
          {task.relatedTo && (
            <span className="text-[8px] font-mono text-zinc-700 truncate">{task.relatedTo}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GlobalTasksWidget() {
  const { data: tasksData, updateTask } = useTasks()
  const [exitingTask, setExitingTask] = useState<{ task: Task; index: number } | null>(null)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tasks = useMemo(() => tasksData?.pages.flatMap(page => page.tasks) || [], [tasksData])
  const pendingTasks = useMemo(
    () => tasks.filter(t => (t.status ?? 'Pending') !== 'Completed').slice(0, DISPLAY_LIMIT + 1),
    [tasks]
  )
  const completedCount = tasks.filter(t => (t.status ?? '').toLowerCase() === 'completed').length
  const totalCount = tasks.length
  const velocity = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const listWithoutExiting = useMemo(() => {
    if (!exitingTask) return pendingTasks.slice(0, DISPLAY_LIMIT)
    return pendingTasks.filter(t => t.id !== exitingTask.task.id).slice(0, DISPLAY_LIMIT)
  }, [pendingTasks, exitingTask])

  const listToRender = useMemo(() => {
    if (!exitingTask) return listWithoutExiting
    const { task, index } = exitingTask
    const completedTask = { ...task, status: 'Completed' as const }
    return [
      ...listWithoutExiting.slice(0, index),
      completedTask,
      ...listWithoutExiting.slice(index),
    ]
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
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[9px] font-mono uppercase tracking-tighter text-zinc-500">
          <span>Velocity</span>
          <span className="text-zinc-400">{velocity.toFixed(0)}%</span>
        </div>
        <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-white transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)]"
            style={{ width: `${velocity}%` }}
          />
        </div>
      </div>

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
                  exit={{
                    x: '100%',
                    opacity: 0,
                    transition: exitTransition,
                  }}
                  transition={layoutTransition}
                  className="rounded-xl"
                >
                  <TaskRow
                    task={task}
                    isCompleted={isCompleted}
                    onComplete={() => !isCompleted && handleComplete(task, i)}
                  />
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
              <CheckSquare size={20} className="mx-auto text-zinc-800 mb-2" />
              <p className="text-[10px] font-mono text-zinc-700 uppercase">Agenda Clear</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
