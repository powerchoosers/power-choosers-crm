'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Clock, Calendar, AlertTriangle, CheckCircle } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useTasks, type Task } from '@/hooks/useTasks'
import { useUIStore } from '@/store/uiStore'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

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

export function TaskCreationPanel() {
    const { taskContext, setRightPanelMode, setTaskContext } = useUIStore()
    const { entityId, entityName, entityType } = taskContext || { entityId: '', entityType: 'account' }

    const [isReady, setIsReady] = useState(false)
    const now = new Date()
    const nextBusiness = getNextBusinessDay()
    const [viewMonth, setViewMonth] = useState(nextBusiness)
    const [selectedDate, setSelectedDate] = useState(nextBusiness)
    const [timeStr, setTimeStr] = useState(getNextHour())
    const [priority, setPriority] = useState<Priority>('Medium')
    const [taskType, setTaskType] = useState<TaskType>('Call')
    const [notes, setNotes] = useState('')
    const [isCommitting, setIsCommitting] = useState(false)

    const taskTypeOptions = entityType === 'contact' ? TASK_TYPES_CONTACT : TASK_TYPES_ACCOUNT

    const { addTaskAsync } = useTasks()

    useEffect(() => {
        setIsReady(true)
    }, [])

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
        if (!entityId) return
        setIsCommitting(true)
        try {
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
            setRightPanelMode('DEFAULT')
            setTaskContext(null)
        } finally {
            setIsCommitting(false)
        }
    }

    const handleClose = () => {
        setRightPanelMode('DEFAULT')
        setTaskContext(null)
    }

    if (!isReady) return null

    return (
        <div className="h-full flex flex-col bg-zinc-950 text-white relative overflow-hidden">
            {/* HEADER */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 nodal-recessed">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-white" />
                    <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
                        INITIALIZE_TASK_VECTOR
                    </span>
                </div>
                <button onClick={handleClose} className="text-zinc-500 hover:text-white text-[10px] font-mono tracking-wider transition-colors">
                    [ ESC ]
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
                {/* ENTITY CONTEXT */}
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                        Node_Context
                    </div>
                    <div className="px-4 py-3 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20 flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">{entityType}</span>
                            <span className="text-sm font-semibold text-white truncate">{entityName || 'Unlabeled Node'}</span>
                        </div>
                    </div>
                </div>

                {/* CALENDAR SELECTION */}
                <div className="space-y-4">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Temporal_Target
                    </div>

                    <div className="bg-black/40 rounded-xl border border-white/5 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors border border-transparent hover:border-white/10"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-mono text-zinc-200 tabular-nums font-bold tracking-widest">
                                {format(viewMonth, 'MMMM yyyy').toUpperCase()}
                            </span>
                            <button
                                type="button"
                                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors border border-transparent hover:border-white/10"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {WEEKDAYS.map((d, i) => (
                                <div key={i} className="text-[10px] font-mono text-zinc-600 py-2 text-center">
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
                                            'aspect-square flex items-center justify-center rounded-lg text-xs font-mono tabular-nums transition-all border border-transparent',
                                            past && 'text-zinc-800 cursor-not-allowed',
                                            !past && 'text-zinc-400 hover:bg-white/5 hover:border-white/10',
                                            today && !selected && 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5',
                                            selected && 'bg-[#002FA7] text-white border-[#002FA7]/50 shadow-[0_0_15px_-5px_#002FA7] scale-110 z-10'
                                        )}
                                    >
                                        {format(day, 'd')}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* TIME & PRIORITY GRID */}
                <div className="grid grid-cols-1 gap-8">
                    {/* CHRONO */}
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Chrono_Anchor</div>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <input
                                    value={timeStr}
                                    onChange={(e) => handleTimeChange(e.target.value)}
                                    placeholder="09:00"
                                    className="w-32 bg-black/40 border border-white/5 rounded-xl p-3 text-lg font-mono text-white text-center focus:border-[#002FA7] outline-none transition-all"
                                    maxLength={5}
                                />
                                <div className="flex flex-1 gap-2">
                                    {(['AM', 'PM'] as const).map((ampm) => (
                                        <button
                                            key={ampm}
                                            type="button"
                                            onClick={() => handleAmPm(ampm)}
                                            className={cn(
                                                "flex-1 py-3 rounded-xl text-xs font-mono border transition-all",
                                                timeStr.startsWith('12') || (parseInt(timeStr.split(':')[0]) < 12 && ampm === 'AM') || (parseInt(timeStr.split(':')[0]) >= 12 && ampm === 'PM')
                                                    ? "bg-[#002FA7]/20 border-[#002FA7]/50 text-white"
                                                    : "bg-black/20 border-white/5 text-zinc-500 hover:text-zinc-300"
                                            )}
                                        >
                                            {ampm}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleNextHr}
                                className="w-full py-2 rounded-lg bg-white/5 border border-white/5 text-[10px] font-mono text-zinc-500 hover:text-white transition-all uppercase tracking-widest"
                            >
                                [ Increment_Hour ]
                            </button>
                        </div>
                    </div>

                    {/* PRIORITY */}
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Heatmap_Intensity</div>
                        <div className="flex gap-2">
                            {PRIORITIES.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPriority(p)}
                                    className={cn(
                                        'flex-1 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all border',
                                        p === 'Low' && 'border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400',
                                        p === 'Low' && priority === p && 'bg-zinc-500/10 border-zinc-500 text-zinc-300',
                                        p === 'Medium' && 'border-amber-900/50 text-amber-900 hover:border-amber-500 hover:text-amber-500',
                                        p === 'Medium' && priority === p && 'bg-amber-500/10 border-amber-500 text-amber-500',
                                        p === 'High' && 'border-rose-900/50 text-rose-900 hover:border-rose-500 hover:text-rose-500',
                                        p === 'High' && priority === p && 'bg-rose-500/10 border-rose-500 text-rose-500'
                                    )}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* TASK TYPE */}
                <div className="space-y-4">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Operational_Vector</div>
                    <div className="grid grid-cols-2 gap-2">
                        {taskTypeOptions.map((type) => (
                            <button
                                key={type}
                                onClick={() => setTaskType(type as TaskType)}
                                className={cn(
                                    "p-3 rounded-xl border text-xs font-mono transition-all text-left flex items-center justify-between",
                                    taskType === type
                                        ? "bg-[#002FA7]/10 border-[#002FA7] text-[#002FA7]"
                                        : "bg-black/20 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300"
                                )}
                            >
                                {type.toUpperCase()}
                                {taskType === type && <CheckCircle className="w-3 h-3" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* INTEL_NOTES */}
                <div className="space-y-4">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Intel_Payload</div>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Input operational briefing..."
                        className="w-full h-32 bg-black/40 border border-white/5 rounded-xl p-4 text-sm font-mono text-white placeholder:text-zinc-800 focus:border-[#002FA7] outline-none transition-all resize-none"
                    />
                </div>

                {/* ACTION */}
                <div className="pt-4 pb-12">
                    <Button
                        onClick={handleSubmit}
                        disabled={isCommitting || !entityId}
                        className="w-full h-14 bg-white text-black hover:bg-zinc-200 font-mono text-xs font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                        {isCommitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                INITIATING...
                            </>
                        ) : (
                            '[ INITIATE_TASK_SEQUENCE ]'
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
