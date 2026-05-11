'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
  isBefore,
  startOfDay,
  setHours,
  setMinutes,
  addDays
} from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useTasks, type Task } from '@/hooks/useTasks'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const PRIORITIES = ['Low', 'Medium', 'High'] as const
type Priority = (typeof PRIORITIES)[number]

const TASK_TYPES_CONTACT = ['Call', 'Email', 'Meeting', 'Follow-up', 'LinkedIn'] as const
const TASK_TYPES_ACCOUNT = ['Call', 'Email', 'Meeting', 'Follow-up'] as const
type TaskTypeContact = (typeof TASK_TYPES_CONTACT)[number]
type TaskTypeAccount = (typeof TASK_TYPES_ACCOUNT)[number]
type TaskType = TaskTypeContact | TaskTypeAccount

function getNextHour(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1)
  d.setMinutes(0)
  return format(d, 'HH:mm')
}

function getNextBusinessDay(): Date {
  const d = startOfDay(new Date())
  const dow = d.getDay()
  if (dow === 0) return addDays(d, 1)
  if (dow === 6) return addDays(d, 2)
  if (dow === 5) return addDays(d, 3)
  return addDays(d, 1)
}

function parseTimeToDate(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  return setMinutes(setHours(new Date(date), h ?? 0), m ?? 0)
}

interface TaskInjectionPopoverProps {
  entityId: string
  entityName?: string
  entityType: 'contact' | 'account'
  contactId?: string
  accountId?: string
  trigger: React.ReactNode
}

export function TaskInjectionPopover({
  entityId,
  entityName,
  entityType,
  contactId,
  accountId,
  trigger
}: TaskInjectionPopoverProps) {
  const [open, setOpen] = useState(false)
  const now = new Date()
  const nextBusiness = getNextBusinessDay()
  const [viewMonth, setViewMonth] = useState(nextBusiness)
  const [selectedDate, setSelectedDate] = useState(nextBusiness)
  const [timeStr, setTimeStr] = useState(getNextHour())
  const [priority, setPriority] = useState<Priority>('Medium')
  const [taskType, setTaskType] = useState<TaskType>('Call')
  const [notes, setNotes] = useState('')

  const taskTypeOptions = entityType === 'contact' ? TASK_TYPES_CONTACT : TASK_TYPES_ACCOUNT

  const { addTaskAsync } = useTasks()

  useEffect(() => {
    if (open) {
      const next = getNextBusinessDay()
      setSelectedDate(next)
      setViewMonth(next)
      setTimeStr(getNextHour())
      setTaskType('Call')
    }
  }, [open])

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewMonth)
    const end = endOfMonth(viewMonth)
    const days = eachDayOfInterval({ start, end })
    const firstDow = start.getDay()
    const leading = Array(firstDow).fill(null)
    return [...leading, ...days]
  }, [viewMonth])

  const isPast = (d: Date) => isBefore(d, startOfDay(now))

  const handleTimeChange = (v: string) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 4)
    if (cleaned.length <= 2) {
      setTimeStr(cleaned ? `${cleaned.padStart(2, '0')}:00` : '00:00')
      return
    }
    const h = cleaned.slice(0, 2)
    const m = cleaned.slice(2, 4).padEnd(2, '0')
    setTimeStr(`${h}:${m}`)
  }

  const handleAmPm = (ampm: 'AM' | 'PM') => {
    const [h, m] = timeStr.split(':').map(Number)
    let h24 = h ?? 12
    if (ampm === 'AM' && h24 >= 12) h24 -= 12
    if (ampm === 'PM' && h24 < 12) h24 += 12
    setTimeStr(`${String(h24).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`)
  }

  const handleNextHr = () => {
    const [h, m] = timeStr.split(':').map(Number)
    const next = (h ?? 0) + 1
    setTimeStr(`${String(next % 24).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`)
  }

  const formatTaskTitle = (due: Date): string => {
    const name = entityName?.trim() || (entityType === 'contact' ? 'Contact' : 'Account')
    const when = format(due, 'EEE MMM d, h:mm a')
    if (taskType === 'LinkedIn') {
      return `Add ${name} on LinkedIn at ${when}`
    }
    return `${taskType} (${name}) at ${when}`
  }

  const handleSubmit = async () => {
    const due = parseTimeToDate(selectedDate, timeStr)
    const title = formatTaskTitle(due)
    const payload: Omit<Task, 'id' | 'createdAt'> = {
      title,
      description: notes.trim() || undefined,
      priority,
      status: 'Pending',
      dueDate: due.toISOString(),
      contactId: entityType === 'contact' ? entityId : undefined,
      accountId: entityType === 'account' ? entityId : undefined,
      relatedTo: entityName,
      relatedType: entityType === 'contact' ? 'Person' : 'Account',
      metadata: { taskType }
    }
    await addTaskAsync(payload)
    setOpen(false)
    setNotes('')
    setSelectedDate(getNextBusinessDay())
    setTimeStr(getNextHour())
    setPriority('Medium')
    setTaskType('Call')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[320px] p-0 bg-zinc-950/90 backdrop-blur-xl border-white/10 rounded-lg overflow-hidden"
      >
        <div className="p-4 space-y-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">TASK_INJECTION</div>

          {/* Temporal Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-zinc-300 tabular-nums">
                {format(viewMonth, 'MMMM yyyy').toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((d, i) => (
                <div key={i} className="text-[9px] font-mono text-zinc-500 py-0.5">
                  {d}
                </div>
              ))}
              {calendarDays.map((d, i) => {
                if (!d) return <div key={`empty-${i}`} />
                const day = d as Date
                const past = isPast(day)
                const selected = isSameDay(day, selectedDate)
                const today = isToday(day)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={past}
                    onClick={() => !past && setSelectedDate(day)}
                    className={cn(
                      'aspect-square rounded-sm text-[10px] font-mono tabular-nums transition-colors',
                      past && 'text-zinc-800 cursor-not-allowed',
                      !past && 'text-zinc-400 hover:bg-white/10',
                      selected && 'bg-[#002FA7] text-white hover:bg-[#002FA7]',
                      today && !selected && 'underline decoration-emerald-500 decoration-1'
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Chrono-Selector */}
          <div className="space-y-2">
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">CHRONO</div>
            <div className="flex items-center gap-2">
              <Input
                value={timeStr}
                onChange={(e) => handleTimeChange(e.target.value)}
                placeholder="09:00"
                className="w-20 font-mono text-xs tabular-nums bg-black/20 border-white/10 text-white h-8"
                maxLength={5}
              />
              <div className="flex gap-1">
                {(['AM', 'PM'] as const).map((ampm) => (
                  <button
                    key={ampm}
                    type="button"
                    onClick={() => handleAmPm(ampm)}
                    className="px-2 py-1 rounded text-[10px] font-mono border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                  >
                    {ampm}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleNextHr}
                  className="px-2 py-1 rounded text-[10px] font-mono border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  NEXT_HR
                </button>
              </div>
            </div>
          </div>

          {/* Heatmap Priority */}
          <div className="space-y-2">
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">HEATMAP</div>
            <div className="flex gap-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex-1 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all',
                    p === 'Low' && 'text-zinc-500 hover:bg-zinc-500/10 hover:text-zinc-300',
                    p === 'Low' && priority === p && 'bg-zinc-500/20 text-zinc-300 shadow-[0_0_12px_rgba(113,113,122,0.2)]',
                    p === 'Medium' && 'text-amber-500 hover:bg-amber-500/10 hover:text-amber-400',
                    p === 'Medium' && priority === p && 'bg-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
                    p === 'High' && 'text-rose-500 hover:bg-rose-500/10 hover:text-rose-400',
                    p === 'High' && priority === p && 'bg-rose-500/20 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                  )}
                >
                  {p === 'Medium' ? 'MED' : p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Task Type */}
          <div className="space-y-2">
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">TASK_TYPE</div>
            <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
              <SelectTrigger className="w-full h-9 bg-black/20 border-white/10 text-zinc-300 font-mono text-xs rounded-md">
                <SelectValue placeholder="Call" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-white/10">
                {taskTypeOptions.map((type) => (
                  <SelectItem
                    key={type}
                    value={type}
                    className="text-xs font-mono text-zinc-300 focus:bg-white/10 focus:text-white"
                  >
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* INTEL_NOTES */}
          <div className="space-y-2">
            <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">INTEL_NOTES</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Brief or full intel..."
              className="w-full h-20 resize-none rounded bg-black/20 border border-white/10 text-white text-xs font-mono p-2 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#002FA7]/50"
              rows={3}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            className="w-full py-2.5 rounded bg-[#002FA7] text-white text-[10px] font-mono uppercase tracking-widest hover:bg-[#002FA7]/90 transition-colors"
          >
            INITIATE_TASK
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
