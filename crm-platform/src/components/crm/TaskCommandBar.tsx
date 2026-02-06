'use client'

import { ChevronLeft, ChevronRight, Check, SkipForward } from 'lucide-react'
import { type Task } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'

function getTaskTypeLabel(task: Task): string {
  const meta = task.metadata as { taskType?: string } | null | undefined
  if (meta?.taskType) return String(meta.taskType).toUpperCase().replace(/-/g, '_')
  const first = task.title?.trim().split(/\s+/)[0]
  return first ? first.toUpperCase().replace(/-/g, '_') : 'TASK'
}

interface TaskCommandBarProps {
  pendingTasks: Task[]
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  onCompleteAndAdvance: () => void
  isCompleting?: boolean
}

export function TaskCommandBar({
  pendingTasks,
  currentIndex,
  onPrev,
  onNext,
  onSkip,
  onCompleteAndAdvance,
  isCompleting = false
}: TaskCommandBarProps) {
  if (pendingTasks.length === 0) return null
  const current = pendingTasks[currentIndex]
  if (!current) return null
  const total = pendingTasks.length
  const label = getTaskTypeLabel(current)

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-zinc-500 tabular-nums whitespace-nowrap">
        TASK {currentIndex + 1}/{total}: {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Previous task"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={currentIndex >= total - 1}
          className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Next task"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-widest border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
      >
        SKIP
      </button>
      <button
        type="button"
        onClick={onCompleteAndAdvance}
        disabled={isCompleting}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-widest transition-all',
          'bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/70',
          'disabled:opacity-50 disabled:pointer-events-none'
        )}
      >
        <Check className="w-3.5 h-3.5" />
        COMPLETE & ADVANCE
      </button>
    </div>
  )
}
