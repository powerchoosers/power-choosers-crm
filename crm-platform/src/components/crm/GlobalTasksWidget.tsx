'use client'

import { CheckSquare, Circle } from 'lucide-react'
import { useTasks } from '@/hooks/useTasks'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

export default function GlobalTasksWidget() {
  const { data: tasksData } = useTasks()
  
  const tasks = useMemo(() => {
    return tasksData?.pages.flatMap(page => page.tasks) || []
  }, [tasksData])

  const pendingTasks = tasks.filter(t => t.status !== 'Completed').slice(0, 3)
  const completedCount = tasks.filter(t => t.status === 'Completed').length
  const totalCount = tasks.length
  const velocity = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Velocity Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[9px] font-mono uppercase tracking-tighter text-zinc-500">
          <span>Velocity</span>
          <span className="text-zinc-400">{velocity.toFixed(0)}%</span>
        </div>
        <div className="h-1 w-full bg-zinc-800/50 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)]" 
            style={{ width: `${velocity}%` }}
          />
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {pendingTasks.length > 0 ? (
          pendingTasks.map((task) => (
            <div 
              key={task.id}
              className="group flex items-start gap-3 p-3 rounded-xl bg-zinc-900/40 border border-white/5 hover:bg-white/5 transition-all"
            >
              <Circle size={14} className="mt-0.5 text-zinc-600 group-hover:text-zinc-400" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-zinc-300 group-hover:text-white truncate">
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn(
                    "text-[8px] font-mono uppercase tracking-widest",
                    task.priority === 'High' && "text-red-500/70",
                    task.priority === 'Medium' && "text-yellow-500/70",
                    task.priority === 'Low' && "text-zinc-600",
                    task.priority === 'Protocol' && "text-[#002FA7]/70"
                  )}>
                    {task.priority}
                  </span>
                  {task.relatedTo && (
                    <span className="text-[8px] font-mono text-zinc-700 truncate">
                      {task.relatedTo}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6 border border-dashed border-white/5 rounded-2xl">
            <CheckSquare size={20} className="mx-auto text-zinc-800 mb-2" />
            <p className="text-[10px] font-mono text-zinc-700 uppercase">Agenda Clear</p>
          </div>
        )}
      </div>
    </div>
  )
}
