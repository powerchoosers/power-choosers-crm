'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Clock, Calendar, Search, Loader2, Check, AlertTriangle } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { refreshTaskCaches, useTasks, type Task } from '@/hooks/useTasks'
import { useSearchContacts } from '@/hooks/useContacts'
import { useSearchAccounts } from '@/hooks/useAccounts'
import { useUIStore } from '@/store/uiStore'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { panelTheme, useEscClose } from '@/components/right-panel/panelTheme'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const PRIORITIES = ['Low', 'Medium', 'High', 'BRIEFING'] as const
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
    const queryClient = useQueryClient()
    const [selectedEntity, setSelectedEntity] = useState(taskContext)

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
    const [reminders, setReminders] = useState<number[]>([])
    const [taskType, setTaskType] = useState<TaskType>('Call')
    const [sendCalendarInvite, setSendCalendarInvite] = useState(false)
    const [notes, setNotes] = useState('')
    const [manualIntro, setManualIntro] = useState('')
    const [isCommitting, setIsCommitting] = useState(false)
    const [entityQuery, setEntityQuery] = useState('')
    const [debouncedEntityQuery, setDebouncedEntityQuery] = useState('')

    const [dailyTasks, setDailyTasks] = useState<Task[]>([])
    const [isDailyLoading, setIsDailyLoading] = useState(false)

    const activeEntity = selectedEntity || null
    const entityId = activeEntity?.entityId || ''
    const entityName = activeEntity?.entityName || ''
    const entityType = activeEntity?.entityType || 'account'
    const entityLogoUrl = activeEntity?.entityLogoUrl
    const entityPhotoUrl = activeEntity?.entityPhotoUrl
    const entityDomain = activeEntity?.entityDomain

    const taskTypeOptions = entityType === 'contact' ? TASK_TYPES_CONTACT : TASK_TYPES_ACCOUNT

    const { addTaskAsync } = useTasks()
    const { data: contactResults = [], isLoading: isSearchingContacts } = useSearchContacts(debouncedEntityQuery)
    const { data: accountResults = [], isLoading: isSearchingAccounts } = useSearchAccounts(debouncedEntityQuery)

    useEffect(() => {
        setIsReady(true)
    }, [])

    useEffect(() => {
        setSelectedEntity(taskContext)
    }, [taskContext])

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedEntityQuery(entityQuery.trim())
        }, 250)
        return () => clearTimeout(timer)
    }, [entityQuery])

    useEffect(() => {
        if (entityType === 'account' && taskType === 'LinkedIn') {
            setTaskType('Call')
        }
    }, [entityType, taskType])

    // Auto-select BRIEFING on calendar invite
    useEffect(() => {
        if (sendCalendarInvite) {
            setPriority('BRIEFING')
        } else if (priority === 'BRIEFING') {
            setPriority('Medium')
        }
    }, [sendCalendarInvite])

    // Fetch daily tasks for double-booking check
    useEffect(() => {
        const fetchDaily = async () => {
            setIsDailyLoading(true)
            try {
                const start = startOfDay(selectedDate).toISOString()
                const end = addDays(startOfDay(selectedDate), 1).toISOString()
                const { data, error } = await supabase
                    .from('tasks')
                    .select('*')
                    .gte('dueDate', start)
                    .lt('dueDate', end)
                    .order('dueDate', { ascending: true })

                if (!error) setDailyTasks(data || [])
            } catch (err) {
                console.error('Error fetching daily tasks:', err)
            } finally {
                setIsDailyLoading(false)
            }
        }
        fetchDaily()
    }, [selectedDate])

    const calendarDays = useMemo(() => {
        const start = startOfMonth(viewMonth)
        const end = endOfMonth(viewMonth)
        const days = eachDayOfInterval({ start, end })
        const firstDow = start.getDay()
        const leading = Array(firstDow).fill(null)
        return [...leading, ...days]
    }, [viewMonth])

    const isPast = (d: Date) => isBefore(d, startOfDay(now))
    const isSearchingEntities = isSearchingContacts || isSearchingAccounts

    const handleSelectContact = (contact: { id: string; name: string; avatarUrl?: string; logoUrl?: string; accountId?: string }) => {
        const nextContext = {
            entityId: contact.id,
            entityName: contact.name,
            entityType: 'contact' as const,
            entityPhotoUrl: contact.avatarUrl,
            entityLogoUrl: contact.logoUrl,
            accountId: contact.accountId,
        }
        setSelectedEntity(nextContext)
        setTaskContext(nextContext)
        setEntityQuery('')
        setDebouncedEntityQuery('')
    }

    const handleSelectAccount = (account: { id: string; name: string; logoUrl?: string; domain?: string }) => {
        const nextContext = {
            entityId: account.id,
            entityName: account.name,
            entityType: 'account' as const,
            entityLogoUrl: account.logoUrl,
            entityDomain: account.domain,
        }
        setSelectedEntity(nextContext)
        setTaskContext(nextContext)
        setEntityQuery('')
        setDebouncedEntityQuery('')
    }

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

    const parsedDue = useMemo(() => {
        let [h, m] = timeStr.split(':').map(Number)
        if (isNaN(h)) h = 12
        if (isNaN(m)) m = 0
        let finalH = h
        if (ampm === 'PM' && h < 12) finalH += 12
        if (ampm === 'AM' && h === 12) finalH = 0
        
        try {
            return parseTimeToDate(selectedDate, `${String(finalH).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
        } catch(e) {
            return new Date()
        }
    }, [timeStr, ampm, selectedDate])

    const hasTemporalConflict = useMemo(() => {
        if (priority !== 'BRIEFING') return false;
        
        return dailyTasks.some((t: any) => {
            if (!t.dueDate) return false;
            const tDate = new Date(t.dueDate);
            const diffMins = Math.abs(tDate.getTime() - parsedDue.getTime()) / (1000 * 60);
            return diffMins < 45 && (t.priority === 'BRIEFING' || t.priority === 'High');
        });
    }, [parsedDue, dailyTasks, priority]);

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
            const payload: any = {
                title,
                description: notes.trim() || undefined,
                priority,
                status: 'Pending',
                dueDate: due.toISOString(),
                contactId: entityType === 'contact' ? entityId : undefined,
                accountId: entityType === 'account' ? entityId : activeEntity?.accountId,
                relatedTo: entityName,
                relatedType: entityType === 'contact' ? 'Person' : 'Account',
                reminders: sendCalendarInvite ? [15, 60] : null,
                metadata: {
                    taskType,
                    ...(sendCalendarInvite ? { syncCalendar: true, inviteContext: 'forensic_diagnostic' } : {}),
                    manualIntro: manualIntro.trim() || undefined
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

                // Get current user email for identity fallback
                const { data: { user } } = await supabase.auth.getUser()
                const currentUserEmail = user?.email

                const res = await fetch('/api/tasks/create-task-with-invite', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        ...payload,
                        userEmail: currentUserEmail
                    })
                })

                if (!res.ok) {
                    const err = await res.json()
                    throw new Error(err.error || 'Failed to initialize transmission')
                }

                void refreshTaskCaches(queryClient)
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

    const handleClose = useCallback(() => {
        setRightPanelMode('DEFAULT')
        setTaskContext(null)
    }, [setRightPanelMode, setTaskContext])

    useEscClose(handleClose)

    if (!isReady) return null

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
            className={panelTheme.shell}
        >
            {/* HEADER */}
            <div className={panelTheme.header}>
                <div className={panelTheme.headerTitleWrap}>
                    <div className="h-8 w-8 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
                        Schedule Task
                    </span>
                </div>
                <ForensicClose onClick={handleClose} size={16} />
            </div>

            <div className={`${panelTheme.body} space-y-8`}>
                {/* ENTITY CONTEXT */}
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                        Assign To
                    </div>
                    {entityId ? (
                        <div className="px-4 py-3 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                {entityType === 'contact' ? (
                                    <ContactAvatar name={entityName || 'Contact'} photoUrl={entityPhotoUrl} size={40} />
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
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedEntity(null)
                                    setTaskContext(null)
                                }}
                                className="h-8 px-3 rounded-lg border border-white/10 text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white hover:border-white/20 transition-all"
                            >
                                Change
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3 p-4 rounded-xl bg-transparent border border-white/10">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                                <input
                                    type="text"
                                    value={entityQuery}
                                    onChange={(e) => setEntityQuery(e.target.value)}
                                    placeholder="Search account or contact..."
                                    className={`${panelTheme.field} pl-9 pr-3 h-10 text-xs`}
                                />
                            </div>

                            {entityQuery.trim().length < 2 ? (
                                <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                                    Type at least 2 characters to select a node.
                                </div>
                            ) : isSearchingEntities ? (
                                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Scanning_Nodes
                                </div>
                            ) : (
                                <div className="max-h-48 overflow-y-auto np-scroll space-y-1 pr-1">
                                    {contactResults.map((contact) => (
                                        <button
                                            key={`contact-${contact.id}`}
                                            type="button"
                                            onClick={() => handleSelectContact(contact)}
                                            className="w-full px-3 py-2 rounded-lg border border-white/5 hover:border-white/15 hover:bg-white/[0.02] transition-all text-left flex items-center gap-2"
                                        >
                                            <ContactAvatar name={contact.name} photoUrl={contact.avatarUrl} size={24} />
                                            <div className="min-w-0">
                                                <div className="text-xs text-zinc-200 truncate">{contact.name}</div>
                                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider truncate">contact</div>
                                            </div>
                                        </button>
                                    ))}
                                    {accountResults.map((account) => (
                                        <button
                                            key={`account-${account.id}`}
                                            type="button"
                                            onClick={() => handleSelectAccount(account)}
                                            className="w-full px-3 py-2 rounded-lg border border-white/5 hover:border-white/15 hover:bg-white/[0.02] transition-all text-left flex items-center gap-2"
                                        >
                                            <CompanyIcon
                                                logoUrl={account.logoUrl}
                                                domain={account.domain}
                                                name={account.name}
                                                size={24}
                                            />
                                            <div className="min-w-0">
                                                <div className="text-xs text-zinc-200 truncate">{account.name}</div>
                                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider truncate">account</div>
                                            </div>
                                        </button>
                                    ))}
                                    {contactResults.length === 0 && accountResults.length === 0 && (
                                        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest px-1 py-2">
                                            No matching nodes.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* DAILY BREAKDOWN */}
                <div className="space-y-4">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" /> Daily Schedule
                        </div>
                        <span className="text-[9px] text-zinc-600">{format(selectedDate, 'MMM d').toUpperCase()}</span>
                    </div>

                    <div className="bg-zinc-950/40 rounded-xl border border-white/5 min-h-[120px] max-h-[240px] overflow-y-auto np-scroll p-3 space-y-2">
                        {isDailyLoading ? (
                            <div className="space-y-2 p-1">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-10 rounded-lg bg-zinc-800/10 border border-white/[0.02] flex items-center p-2 gap-3 overflow-hidden animate-pulse">
                                        <div className="w-8 h-3 rounded bg-zinc-800/50" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="w-2/3 h-3 rounded bg-zinc-800/50" />
                                            <div className="w-1/3 h-2 rounded bg-zinc-800/30" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : dailyTasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center py-8 opacity-40">
                                <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">No Conflicts Detected</div>
                            </div>
                        ) : (
                            dailyTasks.map((t) => (
                                <div
                                    key={t.id}
                                    className="p-2 rounded-lg bg-zinc-950/60 border border-white/[0.05] flex items-center gap-3 group hover:border-[#002FA7]/30 transition-all"
                                >
                                    <div className="text-[10px] font-mono text-zinc-500 tabular-nums whitespace-nowrap">
                                        {t.dueDate ? format(new Date(t.dueDate), 'h:mm a') : '--:--'} CST
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] text-zinc-300 truncate font-medium group-hover:text-white transition-colors">{t.title}</div>
                                        <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">
                                            {t.priority} // {t.status}
                                        </div>
                                    </div>
                                    {t.priority === 'BRIEFING' && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* CALENDAR SELECTION */}
                <div className="space-y-4">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Select Date
                    </div>

                    <div className="bg-transparent rounded-xl border border-white/10 p-4 space-y-4">
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
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Scheduled Time</div>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <input
                                    value={timeStr}
                                    onChange={(e) => handleTimeChange(e.target.value)}
                                    placeholder="09:00"
                                    className={`${panelTheme.field} w-20 text-center`}
                                    maxLength={5}
                                />
                                <div className="flex gap-2">
                                    {(['AM', 'PM'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setAmpm(mode)}
                                            className={cn(
                                                "h-9 px-3 rounded-xl text-xs font-mono border transition-all whitespace-nowrap",
                                                ampm === mode
                                                    ? "bg-[#002FA7]/20 border-[#002FA7]/50 text-white"
                                                    : "bg-transparent border-white/5 text-zinc-500 hover:text-zinc-300"
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
                                className="w-full py-2 rounded-xl bg-transparent border border-white/5 text-[10px] font-mono text-zinc-500 hover:text-white transition-all uppercase tracking-widest"
                            >
                                [ Add Hour ]
                            </button>
                        </div>
                    </div>

                    {/* CALENDAR INVITE TOGGLE (Contacts Only) */}
                    {entityType === 'contact' && (
                        <div className="space-y-3">
                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
                                Zoho Calendar Sync
                            </div>
                            <button
                                type="button"
                                onClick={() => setSendCalendarInvite(!sendCalendarInvite)}
                                className={cn(
                                    "w-full py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest border transition-all flex items-center justify-center gap-2 px-4 group",
                                    sendCalendarInvite
                                        ? "bg-[#002FA7]/10 border-[#002FA7]/50 text-indigo-400 shadow-[0_0_15px_-5px_#002FA7]"
                                        : "bg-transparent border-white/5 text-zinc-500 hover:text-white"
                                )}
                            >
                                {sendCalendarInvite && <Check className="w-3 h-3" />}
                                <span className="tracking-wider">
                                    [ {sendCalendarInvite ? 'INVITE WILL BE SENT' : 'SEND CALENDAR INVITE'} ]
                                </span>
                            </button>
                        </div>
                    )}

                    {/* PRIORITY */}
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Priority Level</div>
                        <div className="flex flex-wrap gap-2">
                            {PRIORITIES.filter(p => p !== 'BRIEFING').map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPriority(p)}
                                    className={cn(
                                        'px-4 h-9 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all border flex-1 min-w-[80px]',
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
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Task Category</div>
                    <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                        <SelectTrigger className={`${panelTheme.selectTrigger} text-xs`}>
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
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Internal Notes</div>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Private details for this task..."
                        className={`${panelTheme.textarea} bg-transparent h-24 p-4 placeholder:text-zinc-800`}
                    />
                </div>

                {/* MANUAL_INTRO (Shown only for Invites) */}
                {sendCalendarInvite && (
                    <div className="space-y-4">
                        <div className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest font-bold">Email Introduction (Customer Facing)</div>
                        <textarea
                            value={manualIntro}
                            onChange={(e) => setManualIntro(e.target.value)}
                            placeholder="Overwrite the default email opening with a custom message..."
                            className={`${panelTheme.textarea} bg-[#002FA7]/5 border-[#002FA7]/20 h-24 p-4 placeholder:text-zinc-800 focus:border-[#002FA7]/50`}
                        />
                    </div>
                )}

                {/* ACTION */}
                <div className="-mt-2 pb-8">
                    {hasTemporalConflict && (
                        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest">
                                [ Schedule Conflict Detected ]
                            </span>
                        </div>
                    )}
                    <Button
                        onClick={handleSubmit}
                        disabled={isCommitting || !entityId || hasTemporalConflict}
                        className={panelTheme.cta}
                    >
                        {isCommitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                CREATING...
                            </>
                        ) : hasTemporalConflict ? (
                            '[ SCHEDULE BLOCKED ]'
                        ) : (
                            '[ CREATE TASK ]'
                        )}
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}
