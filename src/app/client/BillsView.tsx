'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, Copy, ExternalLink, FileText, Mail, RefreshCw, UploadCloud, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buttonOutlineOnLight, buttonPrimary, focusOnLight } from '@/components/landing/ui';
import { displayFontClass } from '@/components/landing/fonts';
import { Callout, EASE, Panel, PanelHeading, Row, StatusTag, billMonth, money, plainDate, portalFetch, smallButton, wholeNumber, type Tone } from './portal-ui';

export interface ClientBill {
    id: string;
    source: 'upload' | 'email' | 'advisor';
    status: 'processing' | 'ready' | 'needs_review' | 'failed';
    file_name: string;
    mime_type: string;
    size_bytes: number;
    supplier_name: string | null;
    account_number: string | null;
    esid: string | null;
    service_address: string | null;
    period_start: string | null;
    period_end: string | null;
    due_date: string | null;
    total_amount: number | null;
    usage_kwh: number | null;
    billed_demand_kw: number | null;
    actual_demand_kw: number | null;
    energy_rate: number | null;
    supply_charges: number | null;
    delivery_charges: number | null;
    taxes_and_fees: number | null;
    confidence: number | null;
    review_reason: string | null;
    error_message: string | null;
    source_sender: string | null;
    created_at: string;
}

interface IntakeState {
    enrolled: boolean;
    status: 'active' | 'paused' | null;
    address: string | null;
    enrolledAt: string | null;
    lastReceivedAt: string | null;
}

const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 15 * 1024 * 1024;

const STATUS: Record<ClientBill['status'], { tone: Tone; label: string }> = {
    ready: { tone: 'emerald', label: 'Read' },
    needs_review: { tone: 'amber', label: 'Check this one' },
    failed: { tone: 'rose', label: 'Could not read' },
    processing: { tone: 'blue', label: 'Reading' },
};

const SOURCE_LABEL: Record<ClientBill['source'], string> = {
    upload: 'You uploaded this',
    email: 'Arrived by email',
    advisor: 'Added by your advisor',
};

type UploadStage = 'uploading' | 'reading' | 'done' | 'duplicate' | 'error';
interface UploadItem {
    key: string;
    name: string;
    stage: UploadStage;
    message?: string;
}

const STAGE_TEXT: Record<UploadStage, string> = {
    uploading: 'Uploading',
    reading: 'Reading the bill',
    done: 'Added',
    duplicate: 'Already on file',
    error: 'Not added',
};

/** All-in price for a bill: what was paid divided by what was used. */
function allInCents(bill: ClientBill): number | null {
    if (!bill.total_amount || !bill.usage_kwh || bill.usage_kwh <= 0) return null;
    return (Number(bill.total_amount) / Number(bill.usage_kwh)) * 100;
}

// ─────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────
function UploadPanel({ onAdded }: { onAdded: (bill: ClientBill) => void }) {
    const reduceMotion = useReducedMotion();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [items, setItems] = useState<UploadItem[]>([]);
    const busy = items.some((item) => item.stage === 'uploading' || item.stage === 'reading');

    const setStage = (key: string, stage: UploadStage, message?: string) =>
        setItems((current) => current.map((item) => (item.key === key ? { ...item, stage, message } : item)));

    const uploadOne = useCallback(async (file: File, key: string) => {
        try {
            if (!ACCEPT.split(',').includes(file.type)) throw new Error('Upload a PDF, JPG, or PNG.');
            if (file.size > MAX_BYTES) throw new Error('That file is larger than 15 MB.');

            const slot = await portalFetch<{ path: string; token: string }>('/api/portal/bills/upload-url', {
                method: 'POST',
                body: { mimeType: file.type, size: file.size },
            });
            const { error } = await supabase.storage.from('vault').uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
            if (error) throw new Error('The upload did not finish. Check your connection and try again.');

            setStage(key, 'reading');
            const result = await portalFetch<{ bill: ClientBill | null; duplicate: boolean }>('/api/portal/bills/process', {
                method: 'POST',
                body: { path: slot.path, fileName: file.name },
            });
            if (result.bill) onAdded(result.bill);
            setStage(key, result.duplicate ? 'duplicate' : 'done');
        } catch (err) {
            setStage(key, 'error', err instanceof Error ? err.message : 'Something went wrong. Try again.');
        }
    }, [onAdded]);

    const addFiles = useCallback(async (list: FileList | File[]) => {
        const files = Array.from(list).slice(0, 12);
        if (!files.length) return;
        const queued = files.map((file, i) => ({ file, key: `${Date.now()}-${i}-${file.name}` }));
        setItems(queued.map(({ file, key }) => ({ key, name: file.name, stage: 'uploading' as const })));
        // One at a time: each bill is read before the next starts.
        for (const { file, key } of queued) await uploadOne(file, key);
    }, [uploadOne]);

    return (
        <Panel className="h-full p-6 sm:p-8">
            <PanelHeading title="Add a bill" sub="We read it and file it by month. PDF, JPG or PNG, up to 15 MB each." />

            <motion.div
                onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) void addFiles(e.dataTransfer.files); }}
                animate={reduceMotion ? undefined : { scale: dragging ? 1.01 : 1 }}
                transition={{ duration: 0.2, ease: EASE }}
                className={`mt-6 flex flex-col items-start gap-5 rounded-xl border border-dashed p-6 transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between ${
                    dragging ? 'border-[#002FA7] bg-[#002FA7]/5' : 'border-zinc-300 bg-zinc-50'
                }`}
            >
                <div className="flex items-start gap-4">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-200 ${dragging ? 'bg-[#002FA7] text-white' : 'bg-white text-[#002FA7] ring-1 ring-zinc-200'}`}>
                        <UploadCloud className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <p className="text-base font-medium text-zinc-950">{dragging ? 'Drop to add' : 'Drop bills here'}</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-500">You can add several at once. The same bill is never filed twice.</p>
                    </div>
                </div>
                <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={`${buttonPrimary} ${focusOnLight} w-full shrink-0 sm:w-auto`}>
                    Choose files
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    className="sr-only"
                    aria-label="Choose bill files"
                    onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }}
                />
            </motion.div>

            <AnimatePresence initial={false}>
                {items.length > 0 && (
                    <motion.ul
                        key="upload-list"
                        initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                        aria-live="polite"
                    >
                        {items.map((item) => {
                            const working = item.stage === 'uploading' || item.stage === 'reading';
                            return (
                                <li key={item.key} className="flex items-start gap-3 border-b border-zinc-100 py-3.5 first:mt-4 first:border-t last:border-b-0">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                                        {working ? (
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-[#002FA7]" aria-hidden />
                                        ) : item.stage === 'error' ? (
                                            <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden />
                                        ) : (
                                            <motion.span
                                                initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ duration: 0.25, ease: EASE }}
                                                className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white"
                                            >
                                                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                                            </motion.span>
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-zinc-950">{item.name}</p>
                                        <p className={`text-sm ${item.stage === 'error' ? 'text-rose-700' : 'text-zinc-500'}`}>
                                            {item.message || STAGE_TEXT[item.stage]}
                                            {item.stage === 'reading' && '. This can take up to a minute.'}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </motion.ul>
                )}
            </AnimatePresence>
        </Panel>
    );
}

// ─────────────────────────────────────────────
// Automatic intake
// ─────────────────────────────────────────────
function IntakePanel() {
    const reduceMotion = useReducedMotion();
    const [intake, setIntake] = useState<IntakeState | null>(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        portalFetch<{ intake: IntakeState }>('/api/portal/intake').then((d) => setIntake(d.intake)).catch(() => setIntake(null));
    }, []);

    const act = async (action: 'enroll' | 'pause' | 'resume') => {
        setWorking(true);
        setError('');
        try {
            const d = await portalFetch<{ intake: IntakeState }>('/api/portal/intake', { method: 'POST', body: { action } });
            setIntake(d.intake);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        } finally {
            setWorking(false);
        }
    };

    const copy = async () => {
        if (!intake?.address) return;
        try {
            await navigator.clipboard.writeText(intake.address);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard blocked: the address is selectable */ }
    };

    const active = intake?.enrolled && intake.status === 'active';

    return (
        <Panel className="flex h-full flex-col p-6 sm:p-8">
            <PanelHeading
                title="Automatic bill intake"
                sub="Have new bills filed for you as they arrive."
                aside={intake?.enrolled ? <StatusTag tone={active ? 'emerald' : 'zinc'}>{active ? 'On' : 'Paused'}</StatusTag> : undefined}
            />

            <div className="mt-6 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                    {!intake?.enrolled ? (
                        <motion.div
                            key="off"
                            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                            transition={{ duration: 0.25, ease: EASE }}
                        >
                            <ol className="space-y-3 text-sm leading-6 text-zinc-600">
                                <li className="flex gap-3"><span className="font-medium tabular-nums text-zinc-950">1.</span>Turn it on and you get a private email address for your account.</li>
                                <li className="flex gap-3"><span className="font-medium tabular-nums text-zinc-950">2.</span>Add that address to your supplier&apos;s paperless billing, or forward bills to it.</li>
                                <li className="flex gap-3"><span className="font-medium tabular-nums text-zinc-950">3.</span>Each bill is read and filed here. Anything that is not an electricity bill is ignored.</li>
                            </ol>
                            <button type="button" disabled={working || intake === null} onClick={() => act('enroll')} className={`${buttonOutlineOnLight} ${focusOnLight} mt-6 w-full sm:w-auto`}>
                                {working ? 'Turning on…' : 'Turn on automatic intake'}
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="on"
                            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                            transition={{ duration: 0.25, ease: EASE }}
                        >
                            {intake.address ? (
                                <>
                                    <p className="text-sm font-medium text-zinc-950">Your bill address</p>
                                    <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 p-1.5 pl-3.5">
                                        <Mail className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                                        <span className="min-w-0 flex-1 select-all truncate text-sm font-medium text-zinc-950">{intake.address}</span>
                                        <button type="button" onClick={copy} className={`${smallButton} ${focusOnLight}`} aria-live="polite">
                                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                                            {copied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-zinc-500">
                                        Add it as a recipient on your supplier&apos;s paperless billing, or forward bills to it. Keep it private: anything sent there is filed to your account.
                                    </p>
                                </>
                            ) : (
                                <Callout tone="blue" title="You are signed up">
                                    Your advisor is finishing the setup. Your private bill address will show here when it is ready. Until then, add bills with the upload box.
                                </Callout>
                            )}
                            <dl className="mt-5 border-t border-zinc-100">
                                <Row label="Last bill received">{intake.lastReceivedAt ? plainDate(intake.lastReceivedAt) : 'None yet'}</Row>
                            </dl>
                            <button type="button" disabled={working} onClick={() => act(active ? 'pause' : 'resume')} className={`${smallButton} ${focusOnLight} mt-4`}>
                                {active ? 'Pause intake' : 'Turn back on'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
                {error && <p className="mt-4 text-sm text-rose-700" role="alert">{error}</p>}
            </div>
        </Panel>
    );
}

// ─────────────────────────────────────────────
// Bill detail (side sheet)
// ─────────────────────────────────────────────
function BillSheet({ bill, onClose, onUpdated }: { bill: ClientBill; onClose: () => void; onUpdated: (bill: ClientBill) => void }) {
    const reduceMotion = useReducedMotion();
    const closeRef = useRef<HTMLButtonElement>(null);
    const [opening, setOpening] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
    }, [onClose]);

    const openFile = async () => {
        setOpening(true);
        setError('');
        // Open the tab now, while this is still a click, so pop-up blockers allow it.
        const tab = window.open('', '_blank');
        try {
            const d = await portalFetch<{ url: string }>(`/api/portal/bills/${bill.id}/file`);
            if (tab) { tab.opener = null; tab.location.href = d.url; } else { window.location.href = d.url; }
        } catch (err) {
            tab?.close();
            setError(err instanceof Error ? err.message : 'Could not open the file.');
        } finally {
            setOpening(false);
        }
    };

    const retry = async () => {
        setRetrying(true);
        setError('');
        try {
            const d = await portalFetch<{ bill: ClientBill | null }>(`/api/portal/bills/${bill.id}/retry`, { method: 'POST', body: {} });
            if (d.bill) onUpdated(d.bill);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read the bill again.');
        } finally {
            setRetrying(false);
        }
    };

    const parts = [
        { label: 'Energy supply', value: bill.supply_charges, color: 'bg-[#002FA7]' },
        { label: 'Delivery', value: bill.delivery_charges, color: 'bg-zinc-900' },
        { label: 'Taxes and fees', value: bill.taxes_and_fees, color: 'bg-zinc-400' },
    ].filter((p): p is { label: string; value: number; color: string } => typeof p.value === 'number' && p.value > 0);
    const partsTotal = parts.reduce((sum, p) => sum + Number(p.value), 0);
    const allIn = allInCents(bill);
    const status = STATUS[bill.status];

    return (
        <div className={`${displayFontClass} fixed inset-0 z-50 font-sans text-zinc-600 antialiased`} role="dialog" aria-modal="true" aria-label={bill.period_end ? `Bill for ${billMonth(bill.period_end)}` : `Bill ${bill.file_name}`}>
            <motion.button
                type="button"
                aria-label="Close"
                tabIndex={-1}
                onClick={onClose}
                className="absolute inset-0 h-full w-full cursor-default bg-zinc-950/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
            />
            <motion.aside
                className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.35)]"
                initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                transition={{ duration: 0.4, ease: EASE }}
            >
                <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5 sm:px-8">
                    <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-500">{bill.supplier_name || bill.file_name}</p>
                        <h2 className="np-display mt-1 text-3xl text-zinc-950">{bill.period_end ? billMonth(bill.period_end) : 'Bill not read yet'}</h2>
                    </div>
                    <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={`rounded-[10px] border border-zinc-200 p-2 text-zinc-600 transition-[border-color,transform] duration-200 hover:border-zinc-950 hover:text-zinc-950 active:scale-[0.95] ${focusOnLight}`}>
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
                    <div className="flex flex-wrap items-center gap-3">
                        <StatusTag tone={status.tone}>{status.label}</StatusTag>
                        <span className="text-sm text-zinc-500">{SOURCE_LABEL[bill.source]}{bill.source === 'email' && bill.source_sender ? ` from ${bill.source_sender}` : ''}</span>
                    </div>

                    {bill.status === 'needs_review' && bill.review_reason && (
                        <div className="mt-5"><Callout tone="amber" title="Check the numbers against the bill">{bill.review_reason}</Callout></div>
                    )}
                    {bill.status === 'failed' && (
                        <div className="mt-5"><Callout tone="rose" title="We could not read this one">{bill.error_message || 'You can still open the original file.'}</Callout></div>
                    )}

                    <p className="mt-8 text-sm font-medium text-zinc-950">Amount due</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                        <span className="np-display text-6xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">{money(bill.total_amount)}</span>
                        {bill.due_date && <span className="text-base text-zinc-500">due {plainDate(bill.due_date)}</span>}
                    </p>

                    {parts.length >= 2 && (
                        <div className="mt-8">
                            <p className="text-sm font-medium text-zinc-950">Where the money went</p>
                            <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
                                {parts.map((p, i) => (
                                    <motion.span
                                        key={p.label}
                                        className={`h-full origin-left ${p.color}`}
                                        style={{ width: `${(Number(p.value) / partsTotal) * 100}%` }}
                                        initial={reduceMotion ? false : { scaleX: 0 }}
                                        animate={{ scaleX: 1 }}
                                        transition={{ duration: 0.45, delay: 0.15 + i * 0.07, ease: EASE }}
                                    />
                                ))}
                            </div>
                            <dl className="mt-3">
                                {parts.map((p) => (
                                    <div key={p.label} className="flex items-baseline justify-between gap-6 border-b border-zinc-100 py-2.5 last:border-b-0">
                                        <dt className="flex items-center gap-2 text-sm text-zinc-600"><span className={`h-2.5 w-2.5 rounded-sm ${p.color}`} aria-hidden />{p.label}</dt>
                                        <dd className="text-sm font-medium tabular-nums text-zinc-950">
                                            {money(p.value)} <span className="font-normal text-zinc-500">({Math.round((Number(p.value) / partsTotal) * 100)}%)</span>
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}

                    <dl className="mt-8 border-t border-zinc-100">
                        <Row label="Billing period">{bill.period_start && bill.period_end ? `${plainDate(bill.period_start)} to ${plainDate(bill.period_end)}` : plainDate(bill.period_end)}</Row>
                        <Row label="Energy used">{wholeNumber(bill.usage_kwh, 'kWh')}</Row>
                        <Row label="Supply price on the bill">{bill.energy_rate ? `${(Number(bill.energy_rate) * 100).toFixed(2)}¢ per kWh` : '—'}</Row>
                        <Row label="All-in price (amount ÷ usage)">{allIn ? `${allIn.toFixed(2)}¢ per kWh` : '—'}</Row>
                        <Row label="Peak demand billed">{wholeNumber(bill.billed_demand_kw, 'kW')}</Row>
                        <Row label="Peak demand measured">{wholeNumber(bill.actual_demand_kw, 'kW')}</Row>
                        <Row label="Account number">{bill.account_number || '—'}</Row>
                        <Row label="Meter ID (ESI ID)">{bill.esid || '—'}</Row>
                        <Row label="Service address"><span className="[text-wrap:balance]">{bill.service_address || '—'}</span></Row>
                    </dl>

                    <p className="mt-6 text-xs leading-5 text-zinc-500">
                        These figures were read from your bill by software. The original file is the record; open it to check anything that matters.
                    </p>
                    {error && <p className="mt-4 text-sm text-rose-700" role="alert">{error}</p>}
                </div>

                <footer className="flex flex-col gap-3 border-t border-zinc-100 px-6 py-5 sm:flex-row sm:px-8">
                    <button type="button" onClick={openFile} disabled={opening} className={`${buttonPrimary} ${focusOnLight} flex-1 !py-3`}>
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        {opening ? 'Opening…' : 'Open the original bill'}
                    </button>
                    {(bill.status === 'failed' || bill.status === 'needs_review') && (
                        <button type="button" onClick={retry} disabled={retrying} className={`${smallButton} ${focusOnLight} !px-5 !py-3 !text-base`}>
                            <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden />
                            {retrying ? 'Reading…' : 'Read it again'}
                        </button>
                    )}
                </footer>
            </motion.aside>
        </div>
    );
}

// ─────────────────────────────────────────────
// Bills view
// ─────────────────────────────────────────────
export function BillsView({ bills, loaded, onChange }: { bills: ClientBill[]; loaded: boolean; onChange: (bills: ClientBill[]) => void }) {
    const reduceMotion = useReducedMotion();
    const [openId, setOpenId] = useState<string | null>(null);
    const openBill = bills.find((b) => b.id === openId) || null;

    const upsert = useCallback((bill: ClientBill) => {
        const without = bills.filter((b) => b.id !== bill.id);
        const next = [bill, ...without].sort((a, b) => (b.period_end || '9999').localeCompare(a.period_end || '9999') || b.created_at.localeCompare(a.created_at));
        onChange(next);
    }, [bills, onChange]);

    const read = bills.filter((b) => b.status === 'ready' || b.status === 'needs_review');
    const latest = read.find((b) => b.period_end) || null;
    const latestAllIn = latest ? allInCents(latest) : null;
    const needAttention = bills.filter((b) => b.status === 'needs_review' || b.status === 'failed').length;

    return (
        <div className="space-y-6">
            {/* At a glance */}
            <Panel className="grid divide-y divide-zinc-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-6">
                    <p className="text-sm text-zinc-500">Bills on file</p>
                    <p className="np-display mt-2 text-5xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">{loaded ? bills.length : '—'}</p>
                    <p className="mt-2 text-sm text-zinc-500">{needAttention > 0 ? `${needAttention} to check` : 'Nothing waiting on you'}</p>
                </div>
                <div className="p-6">
                    <p className="text-sm text-zinc-500">Latest bill</p>
                    <p className="np-display mt-2 text-5xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">{latest ? money(latest.total_amount, 0) : '—'}</p>
                    <p className="mt-2 text-sm text-zinc-500">{latest ? `${billMonth(latest.period_end)}${latest.due_date ? `, due ${plainDate(latest.due_date)}` : ''}` : 'Add a bill to see it here'}</p>
                </div>
                <div className="p-6">
                    <p className="text-sm text-zinc-500">All-in price on that bill</p>
                    <p className="mt-2 flex items-baseline gap-2">
                        <span className="np-display text-5xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">{latestAllIn ? latestAllIn.toFixed(2) : '—'}</span>
                        {latestAllIn ? <span className="text-base text-zinc-500">¢ per kWh</span> : null}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500">Amount due divided by energy used, delivery and taxes included.</p>
                </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3"><UploadPanel onAdded={upsert} /></div>
                <div className="lg:col-span-2"><IntakePanel /></div>
            </div>

            {/* Bill list */}
            <Panel className="p-6 sm:p-8">
                <PanelHeading title="Your bills" sub="Newest first. Select a bill to see what we read and open the original." />
                {!loaded ? (
                    <div className="mt-6 space-y-3" aria-hidden>
                        {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />)}
                    </div>
                ) : bills.length === 0 ? (
                    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
                        <p className="text-base font-medium text-zinc-950">No bills on file yet</p>
                        <p className="mt-1 max-w-lg text-sm leading-6 text-zinc-500">
                            Add your most recent bill above. The more months you add, the more complete your usage history becomes.
                        </p>
                    </div>
                ) : (
                    <ul className="mt-6 border-t border-zinc-100">
                        <AnimatePresence initial={false}>
                            {bills.map((bill, i) => {
                                const status = STATUS[bill.status];
                                return (
                                    <motion.li
                                        key={bill.id}
                                        layout={reduceMotion ? false : 'position'}
                                        initial={reduceMotion ? false : { opacity: 0, y: 10, filter: 'blur(4px)' }}
                                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                        exit={reduceMotion ? undefined : { opacity: 0 }}
                                        transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.03, ease: EASE }}
                                        className="border-b border-zinc-100"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setOpenId(bill.id)}
                                            className={`group -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-4 rounded-xl px-3 py-4 text-left transition-[background-color,transform] duration-200 ease-out hover:-translate-y-px hover:bg-zinc-50 active:scale-[0.995] ${focusOnLight}`}
                                        >
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-zinc-100 text-zinc-500 transition-colors duration-200 group-hover:bg-[#002FA7] group-hover:text-white">
                                                <FileText className="h-5 w-5" aria-hidden />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-base font-medium text-zinc-950">{bill.period_end ? billMonth(bill.period_end) : bill.file_name}</span>
                                                <span className="block truncate text-sm text-zinc-500">
                                                    {[bill.supplier_name, bill.usage_kwh ? wholeNumber(bill.usage_kwh, 'kWh') : null, bill.source === 'email' ? 'By email' : null].filter(Boolean).join(', ') || bill.file_name}
                                                </span>
                                            </span>
                                            <span className="hidden shrink-0 sm:block"><StatusTag tone={status.tone}>{status.label}</StatusTag></span>
                                            <span className="w-24 shrink-0 text-right text-base font-semibold tabular-nums text-zinc-950">{money(bill.total_amount)}</span>
                                        </button>
                                    </motion.li>
                                );
                            })}
                        </AnimatePresence>
                    </ul>
                )}
            </Panel>

            {/* On <body>: the tab's blur transition would otherwise trap a fixed-position sheet inside it. */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {openBill && <BillSheet key={openBill.id} bill={openBill} onClose={() => setOpenId(null)} onUpdated={upsert} />}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
