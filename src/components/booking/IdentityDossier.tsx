'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { resolveIdentity, updateContactManualData } from '@/actions/enrich-contact';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { buttonPrimary, focusOnLight } from '@/components/landing/ui';

const EASE = [0.23, 1, 0.32, 1] as const;

export interface IdentityData {
    name: string;
    firstName?: string;
    lastName?: string;
    title: string;
    company: string;
    email: string;
    location: string;
    linkedinUrl?: string;
    phone?: string;
    logoUrl?: string;
}

interface IdentityDossierProps {
    email: string;
    onIdentityResolved?: (data: IdentityData) => void;
    onConfirm?: () => void;
    isValid?: boolean;
    isBooking?: boolean;
    /** The chosen day and time in plain words, shown above the booking button. */
    selectionLabel?: string | null;
    /** Shown under the booking button when the last attempt failed. */
    errorMessage?: string | null;
}

const labelClass = 'block text-sm font-medium text-zinc-950';
const optionalClass = 'font-normal text-zinc-500';
const inputClass =
    'mt-2 block w-full rounded-[10px] border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-200 focus:border-[#002FA7] focus:outline-none focus:ring-4 focus:ring-[#002FA7]/15';
const skeletonClass = 'block h-5 animate-pulse rounded bg-zinc-200 motion-reduce:animate-none';

export default function IdentityDossier({
    email,
    onIdentityResolved,
    onConfirm,
    isValid = false,
    isBooking = false,
    selectionLabel = null,
    errorMessage = null
}: IdentityDossierProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<IdentityData | null>(null);
    const [isManualEntry, setIsManualEntry] = useState(false);
    const [manualFields, setManualFields] = useState({ name: '', company: '', title: '', phone: '' });
    const [isSavingManual, setIsSavingManual] = useState(false);
    const { user, loading: authLoading } = useAuth();
    const reduceMotion = useReducedMotion();
    const fieldId = useId();

    useEffect(() => {
        async function fetchIdentity() {
            if (authLoading) {
                return;
            }
            if (!email) {
                setLoading(false);
                return;
            }
            try {
                const result = await resolveIdentity(email, { ownerId: user?.email?.toLowerCase() || null });
                setData(result);
                const name = result?.name?.trim() ?? '';
                const isUnknown = !name || name === 'Unknown Entity' || /^null(\s|$)/i.test(name);
                const genericCompany = ['Unknown Corp', 'Unknown Entity', 'Nodal Point (Legacy)'];
                if (isUnknown) {
                    const preCompany = result?.company && !genericCompany.includes(result.company) ? result.company : '';
                    setManualFields(prev => ({ ...prev, company: preCompany }));
                    setIsManualEntry(true);
                } else if (onIdentityResolved && result) {
                    onIdentityResolved(result);
                }
            } catch (error) {
                console.error('Enrichment failed:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchIdentity();
    }, [email, authLoading, user?.email]);

    const handleManualSubmit = async () => {
        if (!manualFields.name || !manualFields.company) return;
        setIsSavingManual(true);
        try {
            const nameParts = manualFields.name.trim().split(' ');
            const assembled: IdentityData = {
                name: manualFields.name.trim(),
                firstName: nameParts[0],
                lastName: nameParts.slice(1).join(' ') || undefined,
                title: manualFields.title || 'Professional',
                company: manualFields.company.trim(),
                email,
                location: 'CST',
                phone: manualFields.phone || undefined,
            };
            if (email) {
                await updateContactManualData(email, {
                    name: manualFields.name,
                    title: manualFields.title,
                    phone: manualFields.phone,
                }, {
                    ownerId: user?.email?.toLowerCase() || null,
                });
            }
            setData(assembled);
            setIsManualEntry(false);
            if (onIdentityResolved) onIdentityResolved(assembled);
        } finally {
            setIsSavingManual(false);
        }
    };

    const view: 'loading' | 'manual' | 'found' = loading ? 'loading' : isManualEntry ? 'manual' : 'found';
    const manualIncomplete = !manualFields.name || !manualFields.company;

    const swap = reduceMotion
        ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
        : {
              initial: { opacity: 0, y: 8 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0 },
              transition: { duration: 0.25, ease: EASE },
          };

    const rowClass = 'flex flex-col gap-1 border-b border-zinc-200 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6';
    const termClass = 'shrink-0 text-sm text-zinc-500';
    const valueClass = 'min-w-0 break-words text-base font-medium text-zinc-950 sm:text-right';

    return (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Your details</h3>

            <AnimatePresence mode="wait" initial={false}>
                {view === 'loading' ? (
                    <motion.div key="loading" {...swap} role="status" className="mt-2">
                        <p className="text-sm text-zinc-500">Looking up your details...</p>
                        <div aria-hidden className="mt-6 space-y-5">
                            <span className={`${skeletonClass} w-48`} />
                            <span className={`${skeletonClass} w-36`} />
                            <span className={`${skeletonClass} w-28`} />
                        </div>
                    </motion.div>
                ) : view === 'manual' ? (
                    <motion.div key="manual" {...swap} className="mt-2">
                        <p className="text-sm text-zinc-500">
                            Tell us who we&apos;ll be speaking with. Booking for{' '}
                            <span className="break-all text-zinc-950">{email}</span>.
                        </p>
                        <div className="mt-6 space-y-5">
                            <div>
                                <label htmlFor={`${fieldId}-name`} className={labelClass}>Full name</label>
                                <input
                                    id={`${fieldId}-name`}
                                    type="text"
                                    autoComplete="name"
                                    required
                                    value={manualFields.name}
                                    onChange={e => setManualFields(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Jane Smith"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label htmlFor={`${fieldId}-company`} className={labelClass}>Company</label>
                                <input
                                    id={`${fieldId}-company`}
                                    type="text"
                                    autoComplete="organization"
                                    required
                                    value={manualFields.company}
                                    onChange={e => setManualFields(p => ({ ...p, company: e.target.value }))}
                                    placeholder="Acme Corp"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label htmlFor={`${fieldId}-title`} className={labelClass}>
                                    Job title <span className={optionalClass}>(optional)</span>
                                </label>
                                <input
                                    id={`${fieldId}-title`}
                                    type="text"
                                    autoComplete="organization-title"
                                    value={manualFields.title}
                                    onChange={e => setManualFields(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Facilities Manager"
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label htmlFor={`${fieldId}-phone`} className={labelClass}>
                                    Phone number <span className={optionalClass}>(optional)</span>
                                </label>
                                <input
                                    id={`${fieldId}-phone`}
                                    type="tel"
                                    autoComplete="tel"
                                    value={manualFields.phone}
                                    onChange={e => setManualFields(p => ({ ...p, phone: e.target.value }))}
                                    placeholder="+1 (817) 000-0000"
                                    className={`${inputClass} tabular-nums`}
                                />
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.dl key="found" {...swap} className="mt-4 border-t border-zinc-200">
                        <div className={rowClass}>
                            <dt className={termClass}>Name</dt>
                            <dd className={valueClass}>{data?.name}</dd>
                        </div>
                        <div className={rowClass}>
                            <dt className={termClass}>Email</dt>
                            <dd className={`${valueClass} break-all`}>{data?.email || email}</dd>
                        </div>
                        <div className={rowClass}>
                            <dt className={termClass}>Company</dt>
                            <dd className={valueClass}>{data?.company || 'Unknown company'}</dd>
                        </div>
                        <div className={rowClass}>
                            <dt className={termClass}>Job title</dt>
                            <dd className={valueClass}>{data?.title || 'Professional'}</dd>
                        </div>
                        <div className={rowClass}>
                            <dt className={termClass}>Location</dt>
                            <dd className={valueClass}>{data?.location || 'Not provided'}</dd>
                        </div>
                        {data?.phone ? (
                            <div className={rowClass}>
                                <dt className={termClass}>Phone</dt>
                                <dd className={`${valueClass} tabular-nums`}>{data.phone}</dd>
                            </div>
                        ) : null}
                        {data?.linkedinUrl ? (
                            <div className={rowClass}>
                                <dt className={termClass}>LinkedIn</dt>
                                <dd className={valueClass}>
                                    <a
                                        href={data.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`np-link rounded-sm text-[#002FA7] ${focusOnLight}`}
                                    >
                                        View profile
                                    </a>
                                </dd>
                            </div>
                        ) : null}
                    </motion.dl>
                )}
            </AnimatePresence>

            {/* Action */}
            <div className="mt-6">
                {isManualEntry ? (
                    <>
                        <button
                            type="button"
                            className={`${buttonPrimary} ${focusOnLight} w-full`}
                            disabled={manualIncomplete || isSavingManual}
                            onClick={handleManualSubmit}
                        >
                            {isSavingManual ? (
                                <>
                                    <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Continue'
                            )}
                        </button>
                        {manualIncomplete ? (
                            <p className="mt-3 text-sm text-zinc-500">Add your full name and company to continue.</p>
                        ) : null}
                    </>
                ) : (
                    <>
                        <p aria-live="polite" className="mb-4 text-base leading-7 text-zinc-600">
                            {selectionLabel ? (
                                <>
                                    Your call: <span className="font-medium tabular-nums text-zinc-950">{selectionLabel}</span>
                                </>
                            ) : (
                                'Select a date and time to finish booking.'
                            )}
                        </p>
                        <button
                            type="button"
                            className={`${buttonPrimary} ${focusOnLight} w-full`}
                            disabled={loading || !isValid || isBooking}
                            onClick={onConfirm}
                        >
                            {isBooking ? (
                                <>
                                    <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                                    Booking...
                                </>
                            ) : (
                                'Book this time'
                            )}
                        </button>
                        {errorMessage ? (
                            <p role="alert" className="mt-3 text-sm text-red-600">{errorMessage}</p>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}
