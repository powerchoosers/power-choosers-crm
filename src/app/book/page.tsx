import BookingInterface from '@/components/booking/BookingInterface';
import { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PageHero } from '@/components/landing/PageHero';
import { PublicShell } from '@/components/landing/PublicShell';
import { focusOnDark } from '@/components/landing/ui';

export const metadata: Metadata = {
    title: 'Nodal Point | Schedule a Strategy Call',
    description: 'Schedule a 30-minute strategy call with the Nodal Point team. We will review your bill or supplier offer live, compare options, and show the biggest cost drivers.',
    alternates: { canonical: 'https://nodalpoint.io/book' },
};

const BACK_LABELS: Record<string, string> = {
    '/bill-debugger': 'Return to report',
    '/portal': 'Return to portal',
    '/client': 'Return to dashboard',
    '/': 'Return to home',
};

interface BookingPageProps {
    searchParams: Promise<{ email?: string; from?: string }>;
}

export default async function BookingPage({ searchParams }: BookingPageProps) {
    const resolvedParams = await searchParams;
    const email = resolvedParams?.email || "";

    // Validate `from` to prevent open redirect. It must be a path on this site: one leading
    // slash only ("//host" and "/\host" are treated by browsers as another website).
    const rawFrom = resolvedParams?.from ?? '';
    const isLocalPath = /^\/(?![/\\])/.test(rawFrom) && !rawFrom.includes('\\');
    const from = isLocalPath ? rawFrom : '/';
    const backLabel = BACK_LABELS[from] ?? 'Return to home';

    return (
        <PublicShell>
            <PageHero
                title="Book a call"
                lead="A 30-minute call with the Nodal Point team. Bring a bill, a supplier offer, or both. We'll review the numbers live, compare the options, and point out the biggest cost drivers before you commit to anything."
            >
                <Link
                    href={from}
                    className={`group inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-zinc-300 transition-colors duration-200 hover:text-white ${focusOnDark}`}
                >
                    <ArrowLeft
                        aria-hidden
                        className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-x-1"
                    />
                    <span className="np-link">{backLabel}</span>
                </Link>
            </PageHero>

            <section className="bg-white px-6 py-16 lg:px-10 lg:py-24">
                <div className="mx-auto max-w-7xl">
                    <BookingInterface email={email} />
                </div>
            </section>
        </PublicShell>
    );
}
