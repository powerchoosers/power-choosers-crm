'use client';

import { useId, useState } from 'react';
import TacticalCalendar, { formatSlotLabel } from './TacticalCalendar';
import IdentityDossier, { type IdentityData } from './IdentityDossier';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { buttonPrimary, focusOnLight } from '@/components/landing/ui';

const EASE = [0.23, 1, 0.32, 1] as const;

const GATE_POINTS = [
    'No sales script. We keep it practical.',
    'Bring a bill, supplier offer, or both.',
    'You can cancel up to 2 hours before.',
];

const h2Class = 'np-display text-4xl text-zinc-950 md:text-[3.25rem]';

export default function BookingInterface({ email }: { email: string }) {
    const [localEmail, setLocalEmail] = useState(email);
    const [emailInput, setEmailInput] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [identityData, setIdentityData] = useState<IdentityData | null>(null);
    const [isBooking, setIsBooking] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [bookingFailed, setBookingFailed] = useState(false);
    const reduceMotion = useReducedMotion();
    const emailId = useId();

    const handleConfirm = async () => {
        if (!selectedDate || !selectedTime || !localEmail) return;

        setIsBooking(true);
        setBookingFailed(false);
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
            toast.success('Booking confirmed.');
        } catch (error) {
            console.error(error);
            setBookingFailed(true);
            toast.error('We could not schedule that time.');
        } finally {
            setIsBooking(false);
        }
    };

    const step: 'success' | 'email' | 'schedule' = isSuccess ? 'success' : !localEmail ? 'email' : 'schedule';

    const selectionLabel =
        selectedDate && selectedTime
            ? `${format(selectedDate, 'EEEE, MMMM d')} at ${formatSlotLabel(selectedTime)} CT`
            : null;

    const stepMotion = reduceMotion
        ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
        : {
              initial: { opacity: 0, y: 14 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -8 },
              transition: { duration: 0.35, ease: EASE },
          };

    return (
        <AnimatePresence mode="wait" initial={false}>
            {step === 'success' ? (
                <motion.div key="success" {...stepMotion} role="status" className="max-w-2xl">
                    <motion.span
                        aria-hidden
                        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#002FA7] text-white"
                    >
                        <Check className="h-6 w-6" strokeWidth={2.5} />
                    </motion.span>
                    <h2 className={`${h2Class} mt-6`}>Your call is booked</h2>
                    <p className="mt-5 text-lg leading-8 text-zinc-600">Your meeting has been scheduled.</p>
                    <dl className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 px-6">
                        <div className="flex flex-col gap-1 border-b border-zinc-200 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                            <dt className="text-sm text-zinc-500">Company</dt>
                            <dd className="text-base font-medium text-zinc-950">{identityData?.company || 'Not provided'}</dd>
                        </div>
                        <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                            <dt className="text-sm text-zinc-500">When</dt>
                            <dd className="text-base font-medium tabular-nums text-zinc-950">{selectionLabel}</dd>
                        </div>
                    </dl>
                </motion.div>
            ) : step === 'email' ? (
                // Email gate: shown when the page is opened without an email param
                <motion.div
                    key="email"
                    {...stepMotion}
                    className="grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-20"
                >
                    <div>
                        <h2 className={h2Class}>Start with your work email</h2>
                        <ul className="mt-8 max-w-lg border-t border-zinc-200">
                            {GATE_POINTS.map(line => (
                                <li key={line} className="border-b border-zinc-200 py-4 text-base leading-7 text-zinc-600">
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="self-start rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
                        <label htmlFor={emailId} className="block text-sm font-medium text-zinc-950">
                            Work email
                        </label>
                        <input
                            id={emailId}
                            type="email"
                            autoComplete="email"
                            value={emailInput}
                            onChange={e => setEmailInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && emailInput) setLocalEmail(emailInput); }}
                            placeholder="you@company.com"
                            className="mt-2 block w-full rounded-[10px] border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-200 focus:border-[#002FA7] focus:outline-none focus:ring-4 focus:ring-[#002FA7]/15"
                        />
                        <p className="mt-2 text-sm text-zinc-500">We use it to look up your details.</p>
                        <button
                            type="button"
                            onClick={() => { if (emailInput) setLocalEmail(emailInput); }}
                            disabled={!emailInput}
                            className={`${buttonPrimary} ${focusOnLight} mt-6 w-full`}
                        >
                            Continue
                        </button>
                    </div>
                </motion.div>
            ) : (
                <motion.div key="schedule" {...stepMotion}>
                    <h2 className={h2Class}>Pick a time</h2>
                    <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
                        <TacticalCalendar
                            selectedDate={selectedDate}
                            onDateSelect={setSelectedDate}
                            selectedTime={selectedTime}
                            onTimeSelect={setSelectedTime}
                        />
                        <div className="lg:sticky lg:top-24 lg:self-start">
                            <IdentityDossier
                                email={localEmail}
                                onIdentityResolved={setIdentityData}
                                onConfirm={handleConfirm}
                                isValid={!!selectedDate && !!selectedTime}
                                isBooking={isBooking}
                                selectionLabel={selectionLabel}
                                errorMessage={
                                    bookingFailed
                                        ? 'We could not book that time. Try again or pick another time.'
                                        : null
                                }
                            />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
