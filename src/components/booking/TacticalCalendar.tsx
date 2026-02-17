'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TacticalCalendar() {
    const [selectedDate, setSelectedDate] = useState<number | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);

    // Mock Data generation (Real booking logic can be integrated later)
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const timeSlots = ["09:00", "09:30", "10:00", "11:30", "13:00", "14:30", "15:00"];

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-xl font-medium text-white tracking-tight">Select Protocol Window</h2>
                    <p className="text-xs font-mono text-zinc-500 mt-1 uppercase tracking-widest">
                        // Time_Zone: CST (UTC-06:00)
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors">
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
                    {days.map((day) => (
                        <button
                            key={day}
                            onClick={() => { setSelectedDate(day); setSelectedTime(null); }}
                            className={cn(
                                "h-10 w-full rounded-lg text-sm font-mono transition-all duration-200 relative group",
                                selectedDate === day
                                    ? "bg-[#002FA7] text-white shadow-[0_0_15px_rgba(0,47,167,0.5)] border border-transparent"
                                    : "text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/5"
                            )}
                        >
                            {day}
                            {/* Active Indicator Dot for dates with availability */}
                            {day % 3 === 0 && selectedDate !== day && (
                                <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 bg-emerald-500 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Time Slots Stream */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {selectedDate ? (
                    <>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Available Vectors
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {timeSlots.map((time) => (
                                <button
                                    key={time}
                                    onClick={() => setSelectedTime(time)}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 group",
                                        selectedTime === time
                                            ? "bg-white/5 border-[#002FA7] text-white shadow-[0_0_20px_rgba(0,47,167,0.1)]"
                                            : "bg-black/20 border-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                                    )}
                                >
                                    <span className="font-mono text-sm">{time}</span>
                                    {selectedTime === time && <div className="w-1.5 h-1.5 bg-[#002FA7] rounded-full shadow-[0_0_5px_#002FA7]" />}
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="h-full min-h-[200px] flex items-center justify-center text-zinc-600 font-mono text-xs border border-dashed border-white/10 rounded-2xl">
                        [ SELECT_DATE_TO_INITIALIZE_STREAM ]
                    </div>
                )}
            </div>
        </div>
    );
}
