'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday
} from 'date-fns';
import { cn } from '@/lib/utils';

interface TacticalCalendarProps {
    selectedDate: Date | null;
    onDateSelect: (date: Date) => void;
    selectedTime: string | null;
    onTimeSelect: (time: string) => void;
}

export default function TacticalCalendar({
    selectedDate,
    onDateSelect,
    selectedTime,
    onTimeSelect
}: TacticalCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Calendar logic
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = useMemo(() => {
        return eachDayOfInterval({
            start: startDate,
            end: endDate,
        });
    }, [startDate, endDate]);

    // CST 12-hour Time Slots
    const timeSlots = [
        "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
        "11:00 AM", "11:30 AM", "01:00 PM", "01:30 PM",
        "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
        "04:00 PM", "04:30 PM"
    ];

    const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-xl font-medium text-white tracking-tight">
                        {format(currentMonth, 'MMMM yyyy')}
                    </h2>
                    <p className="text-xs font-mono text-zinc-500 mt-1 uppercase tracking-widest">
                        // TIME_ZONE: CST (UTC-06:00)
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handlePrevMonth}
                        className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleNextMonth}
                        className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="mb-8 p-4 bg-black/20 rounded-2xl border border-white/5">
                <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                        <div key={d} className="text-[10px] font-mono text-zinc-600 uppercase py-2">
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, idx) => {
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const today = isToday(day);

                        return (
                            <button
                                key={idx}
                                onClick={() => {
                                    if (isCurrentMonth) {
                                        onDateSelect(day);
                                        onTimeSelect(''); // Reset time on date change
                                    }
                                }}
                                className={cn(
                                    "h-11 w-full rounded-lg text-sm font-mono transition-all duration-200 relative group",
                                    !isCurrentMonth && "opacity-10 cursor-default",
                                    isSelected
                                        ? "bg-[#002FA7] text-white shadow-[0_0_15px_rgba(0,47,167,0.5)] border border-transparent"
                                        : isCurrentMonth
                                            ? "text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/10"
                                            : "text-zinc-800",
                                    today && !isSelected && "border-zinc-700"
                                )}
                            >
                                {format(day, 'd')}
                                {/* Availability Indicator */}
                                {isCurrentMonth && day.getDay() !== 0 && day.getDay() !== 6 && !isSelected && (
                                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 bg-emerald-500/50 rounded-full" />
                                )}
                                {today && !isSelected && (
                                    <span className="absolute top-1 right-1 w-1 h-1 bg-[#002FA7] rounded-full" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Time Slots Stream */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar min-h-[300px]">
                {selectedDate ? (
                    <>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Available Vectors // {format(selectedDate, 'MMM dd')}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {timeSlots.map((time) => (
                                <button
                                    key={time}
                                    onClick={() => onTimeSelect(time)}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-4 rounded-xl border transition-all duration-200 group",
                                        selectedTime === time
                                            ? "bg-[#002FA7]/10 border-[#002FA7] text-white shadow-[0_0_20px_rgba(0,47,167,0.1)]"
                                            : "bg-black/40 border-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                                    )}
                                >
                                    <span className="font-mono text-xs">{time}</span>
                                    {selectedTime === time ? (
                                        <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_#fff]" />
                                    ) : (
                                        <Clock className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="h-full min-h-[300px] flex items-center justify-center text-zinc-600 font-mono text-[10px] border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                        [ SELECT_DATE_TO_INITIALIZE_STREAM ]
                    </div>
                )}
            </div>
        </div>
    );
}
