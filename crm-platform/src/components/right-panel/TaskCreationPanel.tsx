'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Clock, Calendar, AlertTriangle, CheckCircle, Building2 } from 'lucide-react'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
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
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

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
    const { entityId, entityName, entityType, entityLogoUrl, entityDomain } = taskContext || { entityId: '', entityType: 'account' }
    const queryClient = useQueryClient()

    const [isReady, setIsReady] = useState(false)
    const now = new Date()
    const nextBusiness = getNextBusinessDay()
    const [viewMonth, setViewMonth] = useState(nextBusiness)
    const [selectedDate, setSelectedDate] = useState(nextBusiness)

    // Initialize with 12-hour format
    const initialTime = getNextHour() // This returns HH:mm (24h)
    const [h24, m24] = initialTime.split(':').map(Number)
    const initialH12 = h24 % 12 || 12
    const initialTimeStr = `${String(initialH12).padStart(2, '0')}:${String(m24).padStart(2, '0')}`
    const [timeStr, setTimeStr] = useState(initialTimeStr)
    const [ampm, setAmpm] = useState<'AM' | 'PM'>(h24 >= 12 ? 'PM' : 'AM')

    const [priority, setPriority] = useState<Priority>('Medium')
    const [taskType, setTaskType] = useState<TaskType>('Call')
    const [sendCalendarInvite, setSendCalendarInvite] = useState(false)
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
        // Allow more flexible typing
        let cleaned = v.replace(/[^\d:]/g, '')
        if (cleaned.length === 2 && !cleaned.includes(':') && v.length > timeStr.length) {
            cleaned += ':'
        }
        if (cleaned.length > 5) cleaned = cleaned.slice(0, 5)
        setTimeStr(cleaned)
    }

    const handleNextHr = () => {
        const [h, m] = timeStr.split(':').map(Number)
        let nextH = (h || 12) + 1
        if (nextH > 12) nextH = 1
        if (nextH === 12) {
            setAmpm(prev => prev === 'AM' ? 'PM' : 'AM')
        }
        setTimeStr(`${String(nextH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`)
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
            // Parse 12h time back to 24h for Date object
            let [h, m] = timeStr.split(':').map(Number)
            if (isNaN(h)) h = 12
            if (isNaN(m)) m = 0

            let finalH = h
            if (ampm === 'PM' && h < 12) finalH += 12
            if (ampm === 'AM' && h === 12) finalH = 0

            const time24Str = `${String(finalH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            const due = parseTimeToDate(selectedDate, time24Str)
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
                metadata: {
                    taskType,
                    ...(sendCalendarInvite ? { syncCalendar: true, inviteContext: 'forensic_diagnostic' } : {})
                }
            }

            if (sendCalendarInvite) {
                const { data: { session } } = await supabase.auth.getSession()

                // Dev Bypass Logic
                let token = session?.access_token
                const isDev = process.env.NODE_ENV === 'development'
                if (!token && isDev) {
                    token = 'dev-bypass-token'
                }

                if (!token) {
                    throw new Error('Authentication session expired. Please refresh.')
                }

                const res = await fetch('/api/tasks/create-task-with-invite', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                })

                if (!res.ok) {
                    const err = await res.json()
                    throw new Error(err.error || 'Failed to initialize transmission')
                }

                queryClient.invalidateQueries({ queryKey: ['tasks'] })
                toast.success('TRANSMISSION_COMPLETE // INVITE_SENT')
            } else {
                await addTaskAsync(payload)
            }

            setRightPanelMode('DEFAULT')
            setTaskContext(null)
        } catch (error: any) {
            toast.error(error.message || 'System error during initialization')
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
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
            className="h-full flex flex-col bg-zinc-950 text-white relative overflow-hidden"
        >
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

            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-0 custom-scrollbar space-y-8">
                {/* ENTITY CONTEXT */}
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                        Node_Context
                    </div>
                    <div className="px-4 py-3 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20 flex items-center gap-4">
                        {entityType === 'contact' ? (
                            <ContactAvatar name={entityName || 'Contact'} size={40} />
                        ) : (
                            <CompanyIcon
                                logoUrl={entityLogoUrl}
                                domain={entityDomain}
                                name={entityName || 'Account'}
                                size={40}
                            />
                        )}
                        <div className="flex flex-col min-w-0">
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
                                    className="w-32 h-12 bg-black/40 border border-white/5 rounded-xl p-3 text-lg font-mono text-white text-center focus:border-[#002FA7] outline-none transition-all"
                                    maxLength={5}
                                />
                                <div className="flex flex-1 gap-2">
                                    {(['AM', 'PM'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setAmpm(mode)}
                                            className={cn(
                                                "flex-1 h-12 rounded-xl text-xs font-mono border transition-all",
                                                ampm === mode
                                                    ? "bg-[#002FA7]/20 border-[#002FA7]/50 text-white"
                                                    : "bg-black/20 border-white/5 text-zinc-500 hover:text-zinc-300"
                                            )}
                                        >
                                            {mode}
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

                    {/* CALENDAR INVITE TOGGLE (Contacts Only) */}
                    {entityType === 'contact' && (
                        <div className="space-y-4">
                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                                Transmit_Calendar_Invite
                            </div>
                            <button
                                type="button"
                                onClick={() => setSendCalendarInvite(!sendCalendarInvite)}
                                className={cn(
                                    "w-full h-12 rounded-xl text-[10px] font-mono uppercase tracking-widest border transition-all flex items-center justify-between px-4 relative group",
                                    sendCalendarInvite
                                        ? "bg-[#002FA7]/10 border-[#002FA7]/50 text-white shadow-[0_0_20px_-10px_#002FA7]"
                                        : "bg-black/20 border-white/5 text-zinc-500 hover:text-white/80"
                                )}
                            >
                                <span className="tracking-[0.2em]">
                                    {sendCalendarInvite ? '[ PAYLOAD_ATTACHED ]' : '[ STANDBY ]'}
                                </span>
                                {sendCalendarInvite && (
                                    <div className="w-1.5 h-1.5 bg-[#002FA7] rounded-full animate-pulse shadow-[0_0_10px_2px_#002FA7]" />
                                )}
                            </button>
                        </div>
                    )}

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
                    <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                        <SelectTrigger className="w-full h-12 bg-black/40 border-white/5 text-zinc-300 font-mono text-xs rounded-xl focus:ring-[#002FA7]/50 focus:border-[#002FA7]">
                            <SelectValue placeholder="Select Vector" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-white/10">
                            {taskTypeOptions.map((type) => (
                                <SelectItem
                                    key={type}
                                    value={type}
                                    className="text-xs font-mono text-zinc-300 focus:bg-[#002FA7]/10 focus:text-white"
                                >
                                    {type.toUpperCase()}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                <div className="-mt-2 pb-8">
                    <Button
                        onClick={handleSubmit}
                        disabled={isCommitting || !entityId}
                        className="w-full h-11 bg-white text-black hover:bg-zinc-200 font-mono text-xs font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                    >
                        {isCommitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                INITIATING...
                            </>
                        ) : (
                            '[ INITIATE_TASK ]'
                        )}
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}
