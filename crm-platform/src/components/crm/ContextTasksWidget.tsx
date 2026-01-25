'use client'

import { ListTodo, Plus, Circle } from 'lucide-react'
import { useTasks } from '@/hooks/useTasks'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface ContextTasksWidgetProps {
  entityId: string
  entityName?: string
}

export default function ContextTasksWidget({ entityId, entityName }: ContextTasksWidgetProps) {
  const { data: tasksData } = useTasks()
  
  const tasks = useMemo(() => {
    const allTasks = tasksData?.pages.flatMap(page => page.tasks) || []
    // In a real scenario, we would filter by relatedId or similar.
    // For now, let's filter by relatedTo name matching entityName as a fallback if relatedId isn't present
    return allTasks.filter(t => t.relatedTo === entityName || t.relatedTo === entityId)
  }, [tasksData, entityId, entityName])

  const pendingTasks = tasks.filter(t => t.status !== 'Completed')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Context Tasks</h3>
        <button className="p-1 hover:bg-white/10 rounded-md transition-colors text-zinc-500 hover:text-white">
          <Plus size={14} />
        </button>
      </div>

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
                    task.priority === 'Sequence' && "text-[#002FA7]/70"
                  )}>
                    {task.priority}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6 border border-dashed border-white/5 rounded-2xl">
            <ListTodo size={20} className="mx-auto text-zinc-800 mb-2" />
            <p className="text-[10px] font-mono text-zinc-700 uppercase">No active tasks</p>
          </div>
        )}
      </div>
    </div>
  )
}
