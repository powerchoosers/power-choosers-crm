'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
import { focusOnLight } from '@/components/landing/ui';

const EASE = [0.23, 1, 0.32, 1] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Display-only: "09:00 AM" reads as "9:00 AM". The stored value is left untouched. */
export function formatSlotLabel(time: string) {
    return time.replace(/^0/, '');
}

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
    const reduceMotion = useReducedMotion();

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

    const monthButtonClass = cn(
        'flex h-10 w-10 items-center justify-center rounded-[10px] border border-zinc-300 bg-white text-zinc-950 transition-[border-color,transform] duration-200 hover:border-zinc-950 active:scale-[0.98]',
        focusOnLight
    );

    const fade = reduceMotion
        ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
        : {
              initial: { opacity: 0, y: 8 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0 },
              transition: { duration: 0.25, ease: EASE },
          };

    return (
        <div>
            {/* Month header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h3 aria-live="polite" className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">
                        {format(currentMonth, 'MMMM yyyy')}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">Times shown in Central Time (CT)</p>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={handlePrevMonth} aria-label="Previous month" className={monthButtonClass}>
                        <ChevronLeft aria-hidden className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={handleNextMonth} aria-label="Next month" className={monthButtonClass}>
                        <ChevronRight aria-hidden className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Calendar grid */}
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
                <div className="mb-2 grid grid-cols-7 gap-1 text-center">
                    {WEEKDAYS.map((d) => (
                        <div key={d} className="py-2 text-xs font-medium text-zinc-500 sm:text-sm">
                            <span aria-hidden className="sm:hidden">{d.charAt(0)}</span>
                            <span className="sr-only sm:not-sr-only">{d}</span>
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, idx) => {
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isSelected = !!selectedDate && isSameDay(day, selectedDate);
                        const today = isToday(day);
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                        return (
                            <button
                                key={idx}
                                type="button"
                                disabled={!isCurrentMonth}
                                aria-label={format(day, 'EEEE, MMMM d')}
                                aria-pressed={isSelected}
                                aria-current={today ? 'date' : undefined}
                                onClick={() => {
                                    if (isCurrentMonth) {
                                        onDateSelect(day);
                                        onTimeSelect(''); // Reset time on date change
                                    }
                                }}
                                className={cn(
                                    'h-11 w-full rounded-[10px] text-sm tabular-nums transition-[background-color,color,transform] duration-200',
                                    focusOnLight,
                                    !isCurrentMonth && 'cursor-default text-zinc-300',
                                    isCurrentMonth && 'active:scale-[0.98]',
                                    isSelected
                                        ? 'bg-[#002FA7] font-semibold text-white'
                                        : isCurrentMonth && (isWeekend
                                            ? 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950'
                                            : 'font-medium text-zinc-950 hover:bg-zinc-100'),
                                    today && !isSelected && 'ring-1 ring-inset ring-zinc-400'
                                )}
                            >
                                {format(day, 'd')}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Time slots */}
            <div className="mt-8">
                <AnimatePresence mode="wait" initial={false}>
                    {selectedDate ? (
                        <motion.div key={format(selectedDate, 'yyyy-MM-dd')} {...fade}>
                            <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">
                                Times on {format(selectedDate, 'EEEE, MMMM d')}
                            </h3>
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                                {timeSlots.map((time) => {
                                    const isSelected = selectedTime === time;
                                    return (
                                        <button
                                            key={time}
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => onTimeSelect(time)}
                                            className={cn(
                                                'rounded-[10px] border px-3 py-3 text-base font-medium tabular-nums transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98]',
                                                focusOnLight,
                                                isSelected
                                                    ? 'border-[#002FA7] bg-[#002FA7] text-white'
                                                    : 'border-zinc-300 bg-white text-zinc-950 hover:border-zinc-950'
                                            )}
                                        >
                                            {formatSlotLabel(time)}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.p
                            key="empty"
                            {...fade}
                            className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-8 text-base leading-7 text-zinc-600"
                        >
                            Select a date to see available times.
                        </motion.p>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
