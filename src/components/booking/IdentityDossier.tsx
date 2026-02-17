'use client';

import { useEffect, useState } from 'react';
import { User, Building2, MapPin, ShieldCheck, Loader2, Globe, Linkedin, Mail, Phone } from 'lucide-react';
import { resolveIdentity } from '@/actions/enrich-contact';
import { motion, AnimatePresence } from 'framer-motion';

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
}

export default function IdentityDossier({ email }: { email: string }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<IdentityData | null>(null);

    useEffect(() => {
        async function fetchIdentity() {
            if (!email) {
                setLoading(false);
                return;
            }
            try {
                const result = await resolveIdentity(email);
                setData(result);
            } catch (error) {
                console.error('Enrichment failed:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchIdentity();
    }, [email]);

    return (
        <div className="h-full flex flex-col">
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                    <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                        {loading ? 'RESOLVING_IDENTITY_VECTOR...' : 'IDENTITY_VERIFIED'}
                    </span>
                </div>

                <div className="min-h-[60px]">
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
                        ) : (
                            <motion.div
                                key="data-header"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                            >
                                <h3 className="text-2xl text-white font-medium mb-1 tracking-tight">
                                    {data?.name || 'Unknown Entity'}
                                </h3>
                                <p className="text-zinc-500 text-sm font-mono lowercase">
                                    {data?.email || email}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Forensic Grid */}
            <div className="flex-1 space-y-4">
                {/* Company Node */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden group transition-all hover:border-[#002FA7]/30">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#002FA7]" />
                    <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-white/5">
                            <Building2 className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1 tracking-widest font-bold">Organization</p>
                            {loading ? (
                                <div className="h-5 w-32 bg-white/5 rounded animate-pulse mt-1" />
                            ) : (
                                <p className="text-white text-lg font-medium">{data?.company || 'Nodal Point (Legacy)'}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Role Node */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden group transition-all hover:border-zinc-700">
                    <div className="absolute top-0 left-0 w-1 h-full bg-zinc-800" />
                    <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-white/5">
                            <User className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1 tracking-widest font-bold">Role Designation</p>
                            {loading ? (
                                <div className="h-5 w-40 bg-white/5 rounded animate-pulse mt-1" />
                            ) : (
                                <p className="text-zinc-200 font-medium">{data?.title || 'Professional Entity'}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Location Node */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/5 relative overflow-hidden group transition-all hover:border-zinc-700">
                    <div className="absolute top-0 left-0 w-1 h-full bg-zinc-800" />
                    <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-white/5">
                            <MapPin className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1 tracking-widest font-bold">Geo-Location</p>
                            {loading ? (
                                <div className="h-5 w-24 bg-white/5 rounded animate-pulse mt-1" />
                            ) : (
                                <p className="text-zinc-200 font-medium">{data?.location || 'Operational Area'}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Social/Phone Node (Forensic context) */}
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
            </div>

            {/* Confirmation Action */}
            <div className="mt-8 pt-6 border-t border-white/5">
                <button
                    className="w-full group relative overflow-hidden rounded-xl bg-white text-black py-4 font-bold text-lg hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_20px_40px_-10px_rgba(255,255,255,0.1)] active:scale-95"
                    disabled={loading}
                >
                    <span className="relative z-10 flex items-center justify-center gap-2 uppercase tracking-wide">
                        <ShieldCheck className="w-5 h-5" />
                        Confirm Booking Protocol
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                </button>
            </div>
        </div>
    );
}
