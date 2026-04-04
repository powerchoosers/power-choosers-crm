'use client'

import React, { KeyboardEvent, useMemo } from 'react'
import { CheckCircle2, Circle, Clock, AlertCircle, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { useTasks, type Task } from '@/hooks/useTasks'
import { useUIStore } from '@/store/uiStore'
import { compareTasksByDueDate, isOverdue, isPendingTask } from '@/lib/task-date'

function formatDueDate(dueDate?: string) {
  if (!dueDate) return '--'
  const d = new Date(dueDate)
  if (Number.isNaN(d.getTime())) return dueDate
  return format(d, 'yyyy-MM-dd')
}

export function TaskManagement() {
  const { data: tasksData, isLoading } = useTasks()
  const { setRightPanelMode, setTaskContext } = useUIStore()
  const router = useRouter()

  const handleTaskKeyDown = (event: KeyboardEvent<HTMLDivElement>, task: Task) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigateToTaskTarget(task)
    }
  }

  const navigateToTaskTarget = (task: Task) => {
    if (task.contactId) {
      router.push(`/network/contacts/${task.contactId}?taskId=${encodeURIComponent(task.id)}`)
      return
    }
    if (task.accountId) {
      router.push(`/network/accounts/${task.accountId}?taskId=${encodeURIComponent(task.id)}`)
    }
  }

  const tasks = useMemo(() => {
    const allTasks = tasksData?.pages.flatMap((page) => page.tasks) || []
    return allTasks
      .filter((task) => !!task.dueDate)
      .filter(isPendingTask)
      .sort(compareTasksByDueDate)
      .slice(0, 6)
  }, [tasksData])

  return (
    <div className="nodal-void-card p-6 flex flex-col h-full relative overflow-hidden group">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white tracking-tight">Task Management</h3>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Operational Directives</p>
        </div>
        <button
          className="icon-button-forensic h-8 w-8 flex items-center justify-center text-zinc-400"
          type="button"
          onClick={() => {
            setTaskContext(null)
            setRightPanelMode('CREATE_TASK')
          }}
          aria-label="Create task"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-transparent border border-white/[0.05] rounded-xl p-3">
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Visible</p>
          <p className="text-xl font-mono tabular-nums text-zinc-300 font-bold">{tasks.length}</p>
        </div>
        <div className="bg-transparent border border-white/[0.05] rounded-xl p-3">
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Overdue</p>
          <p className="text-xl font-mono tabular-nums text-rose-500 font-bold">{tasks.filter((task) => isOverdue(task.dueDate)).length}</p>
        </div>
        <div className="bg-transparent border border-white/[0.05] rounded-xl p-3">
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Upcoming</p>
          <p className="text-xl font-mono tabular-nums text-amber-500 font-bold">{tasks.filter((task) => !isOverdue(task.dueDate)).length}</p>
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 np-scroll flex-1">
        {isLoading ? (
          <div className="text-sm text-zinc-500 font-mono px-2 py-8 text-center">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-zinc-500 font-mono px-2 py-8 text-center">No open dated tasks.</div>
        ) : (
          tasks.map((task) => {
            const overdue = isOverdue(task.dueDate)
            const completed = task.status === 'Completed'

            return (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 rounded-xl bg-transparent border border-white/[0.03] hover:border-white/10 transition-all cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => navigateToTaskTarget(task)}
                onKeyDown={(event) => handleTaskKeyDown(event, task)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : overdue ? (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-600 transition-colors" />
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium transition-colors ${completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <PriorityBadge priority={task.priority} labelStyle="suffix" />
                      <div className="flex items-center gap-1 text-[10px] text-zinc-600 font-mono tabular-nums">
                        <Clock className="w-3 h-3" />
                        {formatDueDate(task.dueDate)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        <div>Open_Task_Queue</div>
        <div className="text-zinc-600">
          {tasks.length}_Visible
        </div>
      </div>
    </div>
  )
}
