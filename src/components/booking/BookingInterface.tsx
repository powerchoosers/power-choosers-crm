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
    const [localEmail, setLocalEmail] = useState(email);
    const [emailInput, setEmailInput] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [identityData, setIdentityData] = useState<any>(null);
    const [isBooking, setIsBooking] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleConfirm = async () => {
        if (!selectedDate || !selectedTime || !localEmail) return;

        setIsBooking(true);
        try {
            const response = await fetch('/api/create-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contactName: identityData?.name || 'Unknown Contact',
                    companyName: identityData?.company || 'Unknown Company',
                    email: localEmail,
                    phone: identityData?.phone || '',
                    appointmentDate: format(selectedDate, 'yyyy-MM-dd'),
                    selectedTime: selectedTime,
                    source: 'forensic-briefing'
                })
            });

            if (!response.ok) {
                throw new Error('Booking protocol failed');
            }

            setIsSuccess(true);
            toast.success('Protocol Initiated: Briefing Scheduled.');

            setTimeout(() => {
                router.push('/philosophy');
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

    // Email gate — shown when accessed directly without an email param
    if (!localEmail) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="max-w-md w-full">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                            FORENSIC_BRIEFING // ACCESS
                        </span>
                    </div>
                    <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Book a Briefing</h2>
                    <p className="text-zinc-500 text-sm mb-4 leading-relaxed">
                        A 30-minute call with a Nodal Point strategist. We pull your bill apart live and show you exactly where you&apos;re exposed — demand charges, ratchet clauses, 4CP risk — before you commit to anything.
                    </p>
                    <div className="flex flex-col gap-1.5 mb-8">
                        {['No sales pitch. No script. Engineers only.', 'You see the numbers before we discuss next steps.', 'Cancellable up to 2 hours before.'].map(line => (
                            <div key={line} className="flex items-center gap-2 text-xs text-zinc-500">
                                <div className="w-1 h-1 rounded-full bg-[#002FA7] shrink-0" />
                                <span>{line}</span>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-3">
                        <input
                            type="email"
                            value={emailInput}
                            onChange={e => setEmailInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && emailInput) setLocalEmail(emailInput); }}
                            placeholder="you@company.com"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 font-mono text-sm focus:outline-none focus:border-[#002FA7]/60 focus:bg-white/[0.07] transition-all"
                            autoFocus
                        />
                        <button
                            onClick={() => { if (emailInput) setLocalEmail(emailInput); }}
                            disabled={!emailInput}
                            className="w-full bg-white text-black rounded-xl py-3.5 font-bold uppercase tracking-wide hover:bg-zinc-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Initialize Briefing
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
            {/* LEFT PANEL: Tactical Calendar */}
            <div className="flex-[7] p-4 md:p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-white/5 lg:overflow-y-auto np-scroll">
                <TacticalCalendar
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                    selectedTime={selectedTime}
                    onTimeSelect={setSelectedTime}
                />
            </div>

            {/* RIGHT PANEL: Live Recon / Context */}
            <div className="flex-[5] bg-black/20 p-4 md:p-8 lg:p-10 lg:overflow-y-auto np-scroll relative">
                <IdentityDossier
                    email={localEmail}
                    onIdentityResolved={setIdentityData}
                    onConfirm={handleConfirm}
                    isValid={!!selectedDate && !!selectedTime}
                    isBooking={isBooking}
                />
            </div>
        </div>
    );
}
