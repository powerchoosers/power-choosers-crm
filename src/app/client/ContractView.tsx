'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Download, ExternalLink, FileSignature, FileText, Globe, Mail, Phone } from 'lucide-react';
import { focusOnLight, TextLink } from '@/components/landing/ui';
import { Reveal } from '@/components/landing/Reveal';
import { Callout, EASE, Panel, PanelHeading, Row, billMonth, plainDate, portalFetch, smallButton } from './portal-ui';
import type { ClientBill } from './BillsView';

export interface SignedDoc {
    id: string;
    name: string;
    signedAt: string;
    downloadUrl: string | null;
}

export interface ContractSummary {
    title: string | null;
    supplier: string | null;
    lengthMonths: number | null;
    startDate: string | null;
    endDate: string | null;
    daysLeft: number | null;
    rateCents: number | null;
    annualValue: number | null;
}

interface SupplierInfo {
    name: string;
    phone: string | null;
    phoneSource: 'advisor' | 'bill' | 'web' | null;
    phoneSourceUrl: string | null;
    phoneBillDate: string | null;
    hours: string | null;
    email: string | null;
    website: string | null;
    accountNumber: string | null;
}

function hostName(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ─────────────────────────────────────────────
// Supplier: who to call
// ─────────────────────────────────────────────
function SupplierPanel({ userEmail }: { userEmail: string }) {
    const [supplier, setSupplier] = useState<SupplierInfo | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        portalFetch<{ supplier: SupplierInfo | null }>('/api/portal/supplier')
            .then((d) => { setSupplier(d.supplier); setState('ready'); })
            .catch(() => setState('error'));
    }, []);

    const bookHref = `/book${userEmail ? `?email=${encodeURIComponent(userEmail)}&from=/client` : ''}`;

    return (
        <Panel className="flex h-full flex-col p-6 sm:p-8">
            <PanelHeading title="Your supplier" sub="The company that bills you for electricity, and how to reach them." />

            {state === 'loading' ? (
                <div className="mt-6 space-y-3" role="status" aria-label="Looking up your supplier">
                    <div className="h-8 w-2/3 animate-pulse rounded-lg bg-zinc-100" />
                    <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
                    <p className="text-sm text-zinc-500">Looking up contact details…</p>
                </div>
            ) : !supplier ? (
                <p className="mt-6 text-sm leading-6 text-zinc-500">
                    {state === 'error'
                        ? 'We could not load your supplier details right now. Reload the page to try again.'
                        : 'No supplier on file yet. Add a bill and we will read it from there.'}
                </p>
            ) : (
                <div className="mt-6 flex flex-1 flex-col">
                    <p className="np-display text-4xl text-zinc-950">{supplier.name}</p>

                    {supplier.phone ? (
                        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                            <p className="text-sm text-zinc-500">Customer service</p>
                            <a
                                href={`tel:+1${supplier.phone.replace(/\D/g, '')}`}
                                className={`group mt-1 inline-flex items-center gap-3 rounded-md text-3xl font-semibold tracking-[-0.02em] tabular-nums text-zinc-950 ${focusOnLight}`}
                            >
                                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#002FA7] text-white transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95">
                                    <Phone className="h-4 w-4" aria-hidden />
                                </span>
                                <span className="np-link">{supplier.phone}</span>
                            </a>
                            {supplier.hours && <p className="mt-2 text-sm text-zinc-600">{supplier.hours}</p>}
                            <p className="mt-3 text-xs leading-5 text-zinc-500">
                                {supplier.phoneSource === 'advisor' && 'Confirmed by your Nodal Point advisor.'}
                                {supplier.phoneSource === 'bill' && `Printed on your ${supplier.phoneBillDate ? billMonth(supplier.phoneBillDate) : 'latest'} bill.`}
                                {supplier.phoneSource === 'web' && (
                                    <>
                                        Found by a web search, not confirmed by us yet. Check it on{' '}
                                        {supplier.phoneSourceUrl ? (
                                            <a href={supplier.phoneSourceUrl} target="_blank" rel="noopener noreferrer" className={`np-link font-medium text-[#002FA7] ${focusOnLight}`}>
                                                {hostName(supplier.phoneSourceUrl)}
                                            </a>
                                        ) : 'the supplier\'s website'}
                                        {' '}or your bill before you rely on it.
                                    </>
                                )}
                            </p>
                        </div>
                    ) : (
                        <div className="mt-6">
                            <Callout tone="zinc" title="No customer service number on file yet">
                                It is usually printed near the top of your bill. Add a recent bill and we will read it from there, or ask your advisor.
                            </Callout>
                        </div>
                    )}

                    <dl className={supplier.accountNumber || supplier.email || supplier.website ? 'mt-5 border-t border-zinc-100' : 'hidden'}>
                        {supplier.accountNumber && <Row label="Your account number">{supplier.accountNumber}</Row>}
                        {supplier.email && (
                            <Row label="Email">
                                <a href={`mailto:${supplier.email}`} className={`inline-flex items-center gap-1.5 text-[#002FA7] ${focusOnLight}`}>
                                    <Mail className="h-3.5 w-3.5" aria-hidden /><span className="np-link">{supplier.email}</span>
                                </a>
                            </Row>
                        )}
                        {supplier.website && (
                            <Row label="Website">
                                <a href={supplier.website} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 text-[#002FA7] ${focusOnLight}`}>
                                    <Globe className="h-3.5 w-3.5" aria-hidden /><span className="np-link">{hostName(supplier.website)}</span>
                                </a>
                            </Row>
                        )}
                    </dl>

                    <div className="mt-auto border-t border-zinc-100 pt-5">
                        <p className="text-sm leading-6 text-zinc-600">
                            Have your account number ready when you call. For anything about your contract or price, talk to us first.
                        </p>
                        <div className="mt-3"><TextLink href={bookHref}>Book a call with your advisor</TextLink></div>
                    </div>
                </div>
            )}
        </Panel>
    );
}

// ─────────────────────────────────────────────
// Contract and files
// ─────────────────────────────────────────────
export function ContractView({
    contract,
    signedDocs,
    bills,
    userEmail,
    onOpenBills,
}: {
    contract: ContractSummary | null;
    signedDocs: SignedDoc[];
    bills: ClientBill[];
    userEmail: string;
    onOpenBills: () => void;
}) {
    const reduceMotion = useReducedMotion();
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [fileError, setFileError] = useState('');

    const openBillFile = async (id: string) => {
        setOpeningId(id);
        setFileError('');
        const tab = window.open('', '_blank');
        try {
            const d = await portalFetch<{ url: string }>(`/api/portal/bills/${id}/file`);
            if (tab) { tab.opener = null; tab.location.href = d.url; } else { window.location.href = d.url; }
        } catch (err) {
            tab?.close();
            setFileError(err instanceof Error ? err.message : 'Could not open the file.');
        } finally {
            setOpeningId(null);
        }
    };

    const progress = contract?.startDate && contract.endDate
        ? (() => {
            const start = new Date(contract.startDate).getTime();
            const end = new Date(contract.endDate).getTime();
            if (!(end > start)) return null;
            return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
        })()
        : null;

    const recentBills = bills.slice(0, 6);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Contract */}
                <Panel className="flex h-full flex-col p-6 sm:p-8">
                    <PanelHeading title="Your contract" sub="The energy agreement you are on now." />
                    {contract ? (
                        <>
                            <p className="np-display mt-6 text-4xl text-zinc-950 [text-wrap:balance]">{contract.title || 'Energy agreement'}</p>
                            <dl className="mt-6 border-t border-zinc-100">
                                <Row label="Supplier">{contract.supplier || '—'}</Row>
                                <Row label="Your rate">{contract.rateCents ? `${contract.rateCents.toFixed(2)}¢ per kWh` : '—'}</Row>
                                <Row label="Length">{contract.lengthMonths ? `${contract.lengthMonths} months` : '—'}</Row>
                                <Row label="Ends">{contract.endDate ? plainDate(contract.endDate, 'long') : '—'}</Row>
                                <Row label="Time left">
                                    {contract.daysLeft === null ? '—' : contract.daysLeft < 0 ? 'Ended' : `${contract.daysLeft.toLocaleString()} days`}
                                </Row>
                                <Row label="Value per year">{contract.annualValue ? `$${contract.annualValue.toLocaleString()}` : '—'}</Row>
                            </dl>
                            {progress !== null && (
                                <div className="mt-6">
                                    <div className="flex justify-between text-xs text-zinc-500">
                                        <span>How far through the contract</span>
                                        <span className="tabular-nums">{Math.round(progress)}%</span>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                                        <motion.div
                                            className={`h-full origin-left rounded-full ${progress > 80 ? 'bg-amber-500' : 'bg-[#002FA7]'}`}
                                            style={{ width: `${progress}%` }}
                                            initial={reduceMotion ? false : { scaleX: 0 }}
                                            animate={{ scaleX: 1 }}
                                            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="mt-6 text-sm leading-6 text-zinc-500">No active contract on file yet. It will show here once your agreement is signed.</p>
                    )}
                </Panel>

                <SupplierPanel userEmail={userEmail} />
            </div>

            {/* Signed agreements */}
            <Reveal>
                <Panel className="p-6 sm:p-8">
                    <PanelHeading
                        title="Signed agreements"
                        sub="Your customer copies, ready to download as PDF."
                        aside={signedDocs.length > 0 ? <span className="text-sm tabular-nums text-zinc-500">{signedDocs.length} signed</span> : undefined}
                    />
                    {signedDocs.length > 0 ? (
                        <ul className="mt-6 border-t border-zinc-100">
                            {signedDocs.map((doc) => (
                                <li key={doc.id} className="flex items-center justify-between gap-4 border-b border-zinc-100 py-4 last:border-b-0">
                                    <div className="flex min-w-0 items-center gap-4">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#002FA7]/[0.07] text-[#002FA7]">
                                            <FileSignature className="h-5 w-5" aria-hidden />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-base font-medium text-zinc-950">{doc.name}</p>
                                            <p className="text-sm text-zinc-500">Signed {plainDate(doc.signedAt)}</p>
                                        </div>
                                    </div>
                                    {doc.downloadUrl ? (
                                        <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className={`${smallButton} ${focusOnLight}`}>
                                            <Download className="h-3.5 w-3.5" aria-hidden />
                                            Download
                                        </a>
                                    ) : (
                                        <span className="shrink-0 text-sm text-zinc-500">Processing</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
                            <p className="text-base font-medium text-zinc-950">No signed agreements yet</p>
                            <p className="mt-1 max-w-lg text-sm leading-6 text-zinc-500">Contracts appear here automatically once everyone has signed.</p>
                        </div>
                    )}
                    {signedDocs.length > 0 && (
                        <p className="mt-5 border-t border-zinc-100 pt-4 text-xs leading-5 text-zinc-500">
                            Download links stop working after 1 hour. Reload the page for a fresh one.
                        </p>
                    )}
                </Panel>
            </Reveal>

            {/* Bill files */}
            <Reveal>
                <Panel className="p-6 sm:p-8">
                    <PanelHeading
                        title="Bill files"
                        sub="The original bills you have on file with us."
                        aside={bills.length > 0 ? (
                            <button type="button" onClick={onOpenBills} className={`np-link rounded-sm text-sm font-medium text-[#002FA7] ${focusOnLight}`}>
                                See all {bills.length} in Bills
                            </button>
                        ) : undefined}
                    />
                    {recentBills.length > 0 ? (
                        <ul className="mt-6 border-t border-zinc-100">
                            {recentBills.map((bill) => (
                                <li key={bill.id} className="flex items-center justify-between gap-4 border-b border-zinc-100 py-4 last:border-b-0">
                                    <div className="flex min-w-0 items-center gap-4">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-zinc-100 text-zinc-500">
                                            <FileText className="h-5 w-5" aria-hidden />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-base font-medium text-zinc-950">{bill.period_end ? `${billMonth(bill.period_end)} bill` : bill.file_name}</p>
                                            <p className="truncate text-sm text-zinc-500">{[bill.supplier_name, `Added ${plainDate(bill.created_at)}`].filter(Boolean).join(', ')}</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => openBillFile(bill.id)} disabled={openingId === bill.id} className={`${smallButton} ${focusOnLight}`}>
                                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                        {openingId === bill.id ? 'Opening…' : 'Open'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
                            <p className="text-base font-medium text-zinc-950">No bills on file yet</p>
                            <p className="mt-1 max-w-lg text-sm leading-6 text-zinc-500">
                                Add a bill and the original file is kept here for you.
                            </p>
                            <button type="button" onClick={onOpenBills} className={`np-link mt-3 rounded-sm text-sm font-medium text-[#002FA7] ${focusOnLight}`}>
                                Go to Bills
                            </button>
                        </div>
                    )}
                    {fileError && <p className="mt-4 text-sm text-rose-700" role="alert">{fileError}</p>}
                </Panel>
            </Reveal>
        </div>
    );
}
