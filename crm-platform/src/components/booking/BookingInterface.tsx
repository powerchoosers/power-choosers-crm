'use client';

import { useState } from 'react';
import TacticalCalendar from './TacticalCalendar';
import IdentityDossier from './IdentityDossier';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function BookingInterface({ email }: { email: string }) {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [identityData, setIdentityData] = useState<any>(null);
    const [isBooking, setIsBooking] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleConfirm = async () => {
        if (!selectedDate || !selectedTime || !email) return;

        setIsBooking(true);
        try {
            const response = await fetch('/api/create-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contactName: identityData?.name || 'Unknown Contact',
                    companyName: identityData?.company || 'Unknown Company',
                    email: email,
                    phone: identityData?.phone || '',
                    appointmentDate: format(selectedDate, 'yyyy-MM-dd'),
                    selectedTime: selectedTime,
                    source: 'forensic-briefing' // Special source for this flow
                })
            });

            if (!response.ok) {
                throw new Error('Booking protocol failed');
            }

            // Success State
            setIsSuccess(true);
            toast.success('Protocol Initiated: Briefing Scheduled.');

            // Redirect after delay
            setTimeout(() => {
                router.push('/bill-debugger'); // Or a thank you page
            }, 3000);

        } catch (error) {
            console.error(error);
            toast.error('Protocol Failure: System Error.');
        } finally {
            setIsBooking(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md p-10 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 animate-pulse">
                    <ShieldCheck className="w-12 h-12 text-emerald-500" />
                </div>
                <h2 className="text-3xl font-mono font-bold text-white mb-2 tracking-tight">PROTOCOL_ESTABLISHED</h2>
                <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest mb-8">
                    Your forensic briefing has been secured.
                </p>
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl max-w-md w-full">
                    <div className="flex justify-between text-sm py-2 border-b border-white/5">
                        <span className="text-zinc-500">VECTOR_TARGET</span>
                        <span className="text-white font-mono">{identityData?.company || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm py-2 border-b border-white/5">
                        <span className="text-zinc-500">TIME_WINDOW</span>
                        <span className="text-white font-mono">{selectedDate ? format(selectedDate, 'MMM dd') : ''} @ {selectedTime}</span>
                    </div>
                    <div className="flex justify-between text-sm py-2 pt-4">
                        <span className="text-emerald-500 animate-pulse">● SIGNAL_LOCKED</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* LEFT PANEL: Tactical Calendar (Cols 1-7) */}
            <div className="flex-[7] p-6 md:p-10 border-b lg:border-b-0 lg:border-r border-white/5 overflow-y-auto np-scroll">
                <TacticalCalendar
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                    selectedTime={selectedTime}
                    onTimeSelect={setSelectedTime}
                />
            </div>

            {/* RIGHT PANEL: Live Recon / Context (Cols 8-12) */}
            <div className="flex-[5] bg-black/20 p-6 md:p-10 overflow-y-auto np-scroll relative">
                {/* Background Text Removed per user request */}
                <IdentityDossier
                    email={email}
                    onIdentityResolved={setIdentityData}
                    onConfirm={handleConfirm}
                    isValid={!!selectedDate && !!selectedTime}
                    isBooking={isBooking}
                />
            </div>
        </div>
    );
}
