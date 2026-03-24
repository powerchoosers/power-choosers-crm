'use client';

import { useEffect, useState } from 'react';
import { User, MapPin, ShieldCheck, Loader2, Linkedin, Phone } from 'lucide-react';
import { resolveIdentity, updateContactManualData } from '@/actions/enrich-contact';
import { motion, AnimatePresence } from 'framer-motion';
import { CompanyIcon } from '@/components/ui/CompanyIcon';

interface IdentityData {
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
}

export default function IdentityDossier({
    email,
    onIdentityResolved,
    onConfirm,
    isValid = false,
    isBooking = false
}: IdentityDossierProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<IdentityData | null>(null);
    const [isManualEntry, setIsManualEntry] = useState(false);
    const [manualFields, setManualFields] = useState({ name: '', company: '', title: '', phone: '' });
    const [isSavingManual, setIsSavingManual] = useState(false);

    useEffect(() => {
        async function fetchIdentity() {
            if (!email) {
                setLoading(false);
                return;
            }
            try {
                const result = await resolveIdentity(email);
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
    }, [email]);

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
                });
            }
            setData(assembled);
            setIsManualEntry(false);
            if (onIdentityResolved) onIdentityResolved(assembled);
        } finally {
            setIsSavingManual(false);
        }
    };

    const inputClass = "w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 font-mono text-sm focus:outline-none focus:border-zinc-600 transition-all";

    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : isManualEntry ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                        {loading ? 'RESOLVING_IDENTITY_VECTOR...' : isManualEntry ? 'CONTACT_DETAILS' : 'IDENTITY_VERIFIED'}
                    </span>
                </div>

                <div className="min-h-[52px]">
                    <AnimatePresence mode="wait">
                        {loading ? (
                            <motion.div
                                key="loading-header"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="space-y-2"
                            >
                                <div className="h-6 w-48 bg-white/5 rounded animate-pulse" />
                                <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
                            </motion.div>
                        ) : isManualEntry ? (
                            <motion.div
                                key="manual-header"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                            >
                                <p className="text-zinc-500 text-sm font-mono lowercase">{email}</p>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="data-header"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                            >
                                <h3 className="text-2xl text-white font-medium mb-1 tracking-tight">
                                    {data?.name}
                                </h3>
                                <p className="text-zinc-500 text-sm font-mono lowercase">
                                    {data?.email || email}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Forensic Grid or Silent Manual Entry Form */}
            <div className="space-y-3">
                {isManualEntry ? (
                    <motion.div
                        key="manual-entry"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                    >
                        <div>
                            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mb-1.5">Full Name *</label>
                            <input
                                type="text"
                                value={manualFields.name}
                                onChange={e => setManualFields(p => ({ ...p, name: e.target.value }))}
                                placeholder="Jane Smith"
                                className={inputClass}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mb-1.5">Company *</label>
                            <input
                                type="text"
                                value={manualFields.company}
                                onChange={e => setManualFields(p => ({ ...p, company: e.target.value }))}
                                placeholder="Acme Corp"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mb-1.5">Title</label>
                            <input
                                type="text"
                                value={manualFields.title}
                                onChange={e => setManualFields(p => ({ ...p, title: e.target.value }))}
                                placeholder="Facilities Manager"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mb-1.5">Phone</label>
                            <input
                                type="tel"
                                value={manualFields.phone}
                                onChange={e => setManualFields(p => ({ ...p, phone: e.target.value }))}
                                placeholder="+1 (817) 000-0000"
                                className={inputClass}
                            />
                        </div>
                    </motion.div>
                ) : (
                    <>
                        {/* Company Node */}
                        <div className="p-3 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden group transition-all hover:border-[#002FA7]/30">
                            <div className="absolute top-0 left-0 w-1 h-full bg-[#002FA7]" />
                            <div className="flex items-start gap-4">
                                <div className="p-1.5 rounded-lg bg-white/5 w-10 h-10 flex items-center justify-center overflow-hidden">
                                    <CompanyIcon
                                        logoUrl={data?.logoUrl}
                                        domain={data?.email?.split('@')[1]}
                                        name={data?.company || 'Company'}
                                        className="w-6 h-6 object-contain"
                                    />
                                </div>
                                <div>
                                    <p className="text-[9px] font-mono text-zinc-500 uppercase mb-0.5 tracking-widest font-bold">Organization</p>
                                    {loading ? (
                                        <div className="h-4 w-28 bg-white/5 rounded animate-pulse mt-0.5" />
                                    ) : (
                                        <p className="text-white text-base font-medium">{data?.company || 'Nodal Point (Legacy)'}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Role Node */}
                        <div className="p-3 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden group transition-all hover:border-zinc-700">
                            <div className="absolute top-0 left-0 w-1 h-full bg-zinc-800" />
                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-white/5">
                                    <User className="w-4 h-4 text-zinc-400" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-mono text-zinc-500 uppercase mb-0.5 tracking-widest font-bold">Role Designation</p>
                                    {loading ? (
                                        <div className="h-4 w-32 bg-white/5 rounded animate-pulse mt-0.5" />
                                    ) : (
                                        <p className="text-zinc-200 text-sm font-medium">{data?.title || 'Professional Entity'}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Location Node */}
                        <div className="p-3 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden group transition-all hover:border-zinc-700">
                            <div className="absolute top-0 left-0 w-1 h-full bg-zinc-800" />
                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-white/5">
                                    <MapPin className="w-4 h-4 text-zinc-400" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-mono text-zinc-500 uppercase mb-0.5 tracking-widest font-bold">Geo-Location</p>
                                    {loading ? (
                                        <div className="h-4 w-20 bg-white/5 rounded animate-pulse mt-0.5" />
                                    ) : (
                                        <p className="text-zinc-200 text-sm font-medium">{data?.location || 'Operational Area'}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Social/Phone Node */}
                        {!loading && (data?.linkedinUrl || data?.phone) && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex gap-2"
                            >
                                {data?.linkedinUrl && (
                                    <a
                                        href={data.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all font-mono text-[10px] uppercase tracking-tighter"
                                    >
                                        <Linkedin className="w-3 h-3" />
                                        Linkedin_Profile
                                    </a>
                                )}
                                {data?.phone && (
                                    <div className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5 text-zinc-400 font-mono text-[10px] uppercase tracking-tighter">
                                        <Phone className="w-3 h-3" />
                                        {data.phone}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </>
                )}
            </div>

            {/* Action Button */}
            <div className="mt-6 pt-5 border-t border-white/5">
                {isManualEntry ? (
                    <button
                        className="w-full group relative overflow-hidden rounded-xl bg-white text-black py-4 font-bold text-lg hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_20px_40px_-10px_rgba(255,255,255,0.1)] active:scale-95"
                        disabled={!manualFields.name || !manualFields.company || isSavingManual}
                        onClick={handleManualSubmit}
                    >
                        <span className="relative z-10 flex items-center justify-center gap-2 uppercase tracking-wide">
                            {isSavingManual ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-5 h-5" />
                                    Continue
                                </>
                            )}
                        </span>
                    </button>
                ) : (
                    <button
                        className="w-full group relative overflow-hidden rounded-xl bg-white text-black py-4 font-bold text-lg hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_20px_40px_-10px_rgba(255,255,255,0.1)] active:scale-95"
                        disabled={loading || !isValid || isBooking}
                        onClick={onConfirm}
                    >
                        <span className="relative z-10 flex items-center justify-center gap-2 uppercase tracking-wide">
                            {isBooking ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Initializing Protocol...
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-5 h-5" />
                                    {isValid ? 'Confirm Booking Protocol' : 'Select Date & Time'}
                                </>
                            )}
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    </button>
                )}
            </div>
        </div>
    );
}
