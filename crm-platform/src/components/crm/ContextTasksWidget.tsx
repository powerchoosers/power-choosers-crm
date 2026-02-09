'use client'

import { ListTodo, Circle } from 'lucide-react'
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
    if (!entityId) return []
    const allTasks = tasksData?.pages.flatMap(page => page.tasks) || []
    return allTasks.filter(t => {
      const matchesId = (t.accountId && t.accountId === entityId) || 
                       (t.contactId && t.contactId === entityId);
      const matchesName = entityName && t.relatedTo === entityName;
      const matchesRelatedId = t.relatedTo === entityId;
      
      return matchesId || matchesName || matchesRelatedId;
    })
  }, [tasksData, entityId, entityName])

  const pendingTasks = tasks.filter(t => t.status !== 'Completed')

  return (
    <div className="space-y-2">
      {pendingTasks.length > 0 ? (
        pendingTasks.map((task) => (
          <div 
            key={task.id}
            className="group flex items-start gap-3 p-3 rounded-xl nodal-module-glass nodal-monolith-edge hover:bg-white/5 transition-all"
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
  )
}
