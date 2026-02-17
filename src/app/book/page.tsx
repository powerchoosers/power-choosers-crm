import TacticalCalendar from '@/components/booking/TacticalCalendar';
import IdentityDossier from '@/components/booking/IdentityDossier';
import { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Nodal Protocol | Booking Interface',
    description: 'Finalize your forensic energy analysis with a direct consultation window.',
};

interface BookingPageProps {
    searchParams: Promise<{ email?: string }>;
}

export default async function BookingPage({ searchParams }: BookingPageProps) {
    const resolvedParams = await searchParams;
    const email = resolvedParams?.email || "";

    return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-4 md:p-8 relative overflow-hidden font-sans">
            {/* Background Ambience / Glows */}
            <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-[#002FA7]/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-[#002FA7]/5 blur-[120px] rounded-full pointer-events-none" />

            {/* Back Button */}
            <Link
                href="/bill-debugger"
                className="absolute top-8 left-8 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group z-20"
            >
                <div className="p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="font-mono text-xs uppercase tracking-widest font-bold">Return_to_Report</span>
            </Link>

            <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-0 border border-white/10 rounded-[2.5rem] bg-[#0a0a0a]/90 backdrop-blur-3xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden relative z-10">

                {/* LEFT PANEL: Tactical Calendar (Cols 1-7) */}
                <div className="lg:col-span-7 p-8 md:p-12 border-b lg:border-b-0 lg:border-r border-white/5">
                    <TacticalCalendar />
                </div>

                {/* RIGHT PANEL: Live Recon / Context (Cols 8-12) */}
                <div className="lg:col-span-5 bg-zinc-900/10 p-8 md:p-12 flex flex-col justify-between">
                    <IdentityDossier email={email} />
                </div>

            </div>

            {/* Subtle HUD Overlay */}
            <div className="fixed bottom-8 left-8 pointer-events-none opacity-20 hidden md:block">
                <div className="font-mono text-[10px] space-y-1">
                    <p>// PROTOCOL: NODAL_ACCESS_v1.0.4</p>
                    <p>// STATUS: IDENTITY_RESOLVED_SECURE</p>
                    <p>// UPLINK: STABLE</p>
                </div>
            </div>
        </div>
    );
}
