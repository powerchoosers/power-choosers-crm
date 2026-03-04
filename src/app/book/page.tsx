import BookingInterface from '@/components/booking/BookingInterface';
import { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
    title: 'Nodal Protocol | Booking Interface',
    description: 'Finalize your forensic energy analysis with a direct consultation window.',
};

const BACK_LABELS: Record<string, string> = {
    '/bill-debugger': 'Return to Report',
    '/portal': 'Return to Portal',
    '/client': 'Return to Dashboard',
    '/': 'Return to Home',
};

interface BookingPageProps {
    searchParams: Promise<{ email?: string; from?: string }>;
}

export default async function BookingPage({ searchParams }: BookingPageProps) {
    const resolvedParams = await searchParams;
    const email = resolvedParams?.email || "";

    // Validate `from` to prevent open redirect — must be a relative path
    const rawFrom = resolvedParams?.from ?? '';
    const from = rawFrom.startsWith('/') ? rawFrom : '/';
    const backLabel = BACK_LABELS[from] ?? 'Return to Home';

    return (
        <div className="flex flex-col min-h-[100dvh] lg:h-[100dvh] bg-[#050505] text-white lg:overflow-hidden font-sans selection:bg-pc-blue/30">
            {/* Header */}
            <header className="flex-none h-14 md:h-20 flex items-center px-4 md:px-8 border-b border-white/5 bg-zinc-950/20 backdrop-blur-md relative z-40">
                <Link
                    href={from}
                    className="flex items-center gap-2 md:gap-3 text-zinc-500 hover:text-white transition-all group"
                >
                    <div className="p-1.5 md:p-2 rounded-lg bg-white/5 border border-white/5 group-hover:border-white/10 group-hover:bg-white/10 transition-all">
                        <ArrowLeft className="w-4 h-4" />
                    </div>
                    <span className="text-sm md:text-lg font-mono uppercase tracking-tighter text-zinc-300 group-hover:text-white transition-colors">{backLabel}</span>
                </Link>

                <div className="ml-auto">
                    <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest hidden sm:block">NODAL_ACCESS_v1.0.4</span>
                </div>
            </header>

            {/* Main Application Frame */}
            <main className="flex-1 p-2 md:p-6 lg:p-8 flex flex-col relative lg:overflow-hidden">
                {/* Background Ambience */}
                <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-[#002FA7]/5 blur-[120px] rounded-full pointer-events-none animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#002FA7]/3 blur-[100px] rounded-full pointer-events-none" />

                <div className="flex-1 nodal-void-card flex flex-col relative z-10 lg:overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)]">
                    <BookingInterface email={email} />
                </div>
            </main>

            {/* Footer — hidden on mobile to reclaim space */}
            <footer className="hidden sm:flex flex-none h-11 border-t border-white/5 bg-black/40 backdrop-blur-md items-center justify-between px-6 z-40">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span>Identity_Resolved: {email ? 'SECURE' : 'ANONYMOUS'}</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/5 hidden md:block" />
                    <div className="hidden md:flex items-center gap-4 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                        <span>Uplink_Node: stable</span>
                        <span>Protocol: Signal_Transmission</span>
                    </div>
                </div>
                <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest space-x-4">
                    <span>Nodal_Ref // V2.1</span>
                    <span className="hidden sm:inline">System_Clock: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
                </div>
            </footer>
        </div>
    );
}
