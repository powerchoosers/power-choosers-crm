'use client'

import React, { useState, useMemo } from 'react'
import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameDay,
    isToday,
    startOfDay,
    isSameMonth
} from 'date-fns'
import { ChevronLeft, ChevronRight, Clock, Plus, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { type Task } from '@/hooks/useTasks'
import { priorityColorClasses } from '@/components/ui/PriorityBadge'

interface TaskCalendarViewProps {
    tasks: Task[]
    onSelectDate: (date: Date) => void
    onCreateTask?: (date: Date) => void
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function TaskCalendarView({ tasks, onSelectDate, onCreateTask }: TaskCalendarViewProps) {
    const [viewMonth, setViewMonth] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState(new Date())

    const calendarDays = useMemo(() => {
        const start = startOfMonth(viewMonth)
        const end = endOfMonth(viewMonth)
        const days = eachDayOfInterval({ start, end })
        const firstDow = start.getDay()
        const leading = Array(firstDow).fill(null)
        return [...leading, ...days]
    }, [viewMonth])

    const tasksByDay = useMemo(() => {
        const map: Record<string, Task[]> = {}
        tasks.forEach(task => {
            if (!task.dueDate) return
            const dayKey = format(new Date(task.dueDate), 'yyyy-MM-dd')
            if (!map[dayKey]) map[dayKey] = []
            map[dayKey].push(task)
        })
        return map
    }, [tasks])

    const selectedDayTasks = useMemo(() => {
        const key = format(selectedDate, 'yyyy-MM-dd')
        return tasksByDay[key] || []
    }, [selectedDate, tasksByDay])

    return (
        <div className="flex h-full gap-4 overflow-hidden">
            {/* MONTHLY GRID */}
            <div className="flex-1 nodal-void-card flex flex-col p-6 min-w-0">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">Temporal_Surface</span>
                        <h2 className="text-xl font-mono uppercase tracking-widest text-zinc-100 tabular-nums">
                            {format(viewMonth, 'MMMM yyyy')}
                        </h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                            className="w-10 h-10 rounded-xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] flex items-center justify-center transition-all group"
                        >
                            <ChevronLeft className="w-5 h-5 text-zinc-500 group-hover:text-white" />
                        </button>
                        <button
                            onClick={() => setViewMonth(new Date())}
                            className="px-4 h-10 rounded-xl border border-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-white hover:bg-white/[0.02] flex items-center justify-center transition-all"
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                            className="w-10 h-10 rounded-xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] flex items-center justify-center transition-all group"
                        >
                            <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-white" />
                        </button>
                    </div>
                </div>

                {/* WEEKDAYS HEADER */}
                <div className="grid grid-cols-7 gap-px mb-2">
                    {WEEKDAYS.map(day => (
                        <div key={day} className="text-center py-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                            {day}
                        </div>
                    ))}
                </div>

                {/* DAYS GRID */}
                <div className="flex-1 grid grid-cols-7 gap-2 overflow-y-auto np-scroll pr-2 pb-4">
                    {calendarDays.map((date, idx) => {
                        if (!date) return <div key={`empty-${idx}`} />
                        
                        const dayTasks = tasksByDay[format(date, 'yyyy-MM-dd')] || []
                        const isSelected = isSameDay(date, selectedDate)
                        const currentMonth = isSameMonth(date, viewMonth)
                        const today = isToday(date)

                        return (
                            <button
                                key={date.toISOString()}
                                onClick={() => setSelectedDate(date)}
                                className={cn(
                                    "relative h-28 p-3 rounded-2xl border transition-all text-left flex flex-col group",
                                    currentMonth ? "bg-white/[0.02]" : "opacity-30 grayscale",
                                    isSelected 
                                        ? "border-[#002FA7] bg-[#002FA7]/5 ring-1 ring-[#002FA7]/20" 
                                        : "border-white/5 hover:border-white/15",
                                    today && !isSelected && "border-emerald-500/30"
                                )}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className={cn(
                                        "text-sm font-mono tabular-nums tracking-wider",
                                        today ? "text-emerald-400 font-bold" : isSelected ? "text-white" : "text-zinc-500"
                                    )}>
                                        {format(date, 'd')}
                                    </span>
                                    {dayTasks.length > 0 && (
                                        <span className={cn(
                                            "text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 transition-colors group-hover:text-zinc-300",
                                            isSelected && "bg-zinc-700 text-zinc-300"
                                        )}>
                                            {dayTasks.length.toString().padStart(2, '0')}_NODE
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 space-y-1 overflow-hidden">
                                    {dayTasks.slice(0, 3).map(task => (
                                        <div 
                                            key={task.id} 
                                            className="h-1.5 rounded-full w-full bg-zinc-800 relative overflow-hidden group/bar"
                                        >
                                            <div 
                                                className={cn(
                                                    "absolute inset-0 transition-opacity",
                                                    task.priority === 'High' ? "bg-rose-500" :
                                                    task.priority === 'Medium' ? "bg-amber-500" :
                                                    task.priority === 'BRIEFING' ? "bg-indigo-500" :
                                                    "bg-zinc-500"
                                                )}
                                            />
                                        </div>
                                    ))}
                                    {dayTasks.length > 3 && (
                                        <div className="text-[8px] font-mono text-zinc-600 text-center flex items-center justify-center gap-1 mt-1">
                                            <span>+{(dayTasks.length - 3)}</span>
                                            <Plus className="w-2 h-2" />
                                        </div>
                                    )}
                                </div>

                                {today && (
                                    <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* DAILY BREAKDOWN (SIDEBAR) */}
            <div className="w-80 flex flex-col gap-4">
                <div className="nodal-void-card flex-1 flex flex-col p-5 overflow-hidden border border-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Selected_Pulse</span>
                            <div className="text-sm font-semibold text-zinc-100 uppercase tracking-tight">
                                {format(selectedDate, 'EEEE d')}
                            </div>
                        </div>
                        <button 
                            onClick={() => onCreateTask?.(selectedDate)}
                            className="w-10 h-10 rounded-xl bg-[#002FA7] hover:bg-[#002FA7]/90 flex items-center justify-center shadow-[0_4px_15px_-5px_#002FA7] transition-all"
                        >
                            <Plus className="w-5 h-5 text-white" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto np-scroll space-y-3">
                        {selectedDayTasks.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center py-10 opacity-30 gap-3 grayscale">
                                <Target className="w-8 h-8 text-zinc-500" />
                                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-center">
                                    No_Nodes // Clear_Signal
                                </div>
                            </div>
                        ) : (
                            selectedDayTasks.sort((a, b) => {
                                const ta = a.dueDate ? new Date(a.dueDate).getTime() : 0
                                const tb = b.dueDate ? new Date(b.dueDate).getTime() : 0
                                return ta - tb
                            }).map(task => (
                                <motion.div
                                    key={task.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-xl bg-white/[0.03] border border-white/5 group hover:border-[#002FA7]/30 transition-all cursor-pointer"
                                    onClick={() => onSelectDate(selectedDate)} // Or navigate to task
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-1.5 h-1.5 rounded-full", 
                                                task.priority === 'High' ? "bg-rose-500" :
                                                task.priority === 'Medium' ? "bg-amber-500" :
                                                task.priority === 'BRIEFING' ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" :
                                                "bg-zinc-500"
                                            )} />
                                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider tabular-nums whitespace-nowrap">
                                                {task.dueDate ? format(new Date(task.dueDate), 'h:mm a') : '--:--'} CST
                                            </span>
                                        </div>
                                        {task.priority === 'BRIEFING' && (
                                            <span className="text-[8px] font-mono text-indigo-400 border border-indigo-500/30 px-1 rounded uppercase tracking-[0.1em] bg-indigo-500/5">
                                                Book Briefing
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors line-clamp-2">
                                        {task.title}
                                    </h4>
                                    {task.relatedTo && (
                                        <div className="mt-2 text-[10px] font-mono text-zinc-600 truncate">
                                            @ {task.relatedTo.toUpperCase()}
                                        </div>
                                    )}
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>

                <div className="nodal-void-card h-40 border border-white/5 p-5 bg-indigo-500/[0.03]">
                    <div className="flex flex-col h-full justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-400" />
                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Briefing_Queue</span>
                        </div>
                        <div className="flex items-end justify-between">
                            <div className="text-2xl font-mono text-indigo-100 tabular-nums">
                                {tasks.filter(t => t.priority === 'BRIEFING' && t.status !== 'Completed').length.toString().padStart(2, '0')}
                            </div>
                            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest text-right">
                                Scheduled_Diagnostic<br/>Events
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
