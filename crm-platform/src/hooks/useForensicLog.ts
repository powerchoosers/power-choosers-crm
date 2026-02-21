import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useMarketPulse } from './useMarketPulse';
import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';

export type LogEntryAction =
    | 'EMAIL_DISPATCHED'
    | 'UPLINK_RECEIVED'
    | 'EMAIL_OPENED'
    | 'SIGNAL_DETECTED'
    | 'VOLATILITY_ALERT'
    | 'PRICE_SPIKE'
    | 'TASK_COMPLETE';

export interface LogEntry {
    id: string;
    timestamp: number;
    time: string; // Relative format (e.g. "5 minutes ago")
    action: LogEntryAction;
    detail: string;
}

export function useForensicLog() {
    const { user } = useAuth();
    const { data: marketPulse } = useMarketPulse();

    // 1. Fetch recent signals (Apollo News)
    const { data: signals } = useQuery({
        queryKey: ['forensic-signals'],
        queryFn: async () => {
            const { data: articles } = await supabase
                .from('apollo_news_articles')
                .select('*')
                .order('published_at', { ascending: false, nullsFirst: false })
                .limit(10);

            if (!articles || articles.length === 0) return [];

            const domains = Array.from(new Set(articles.map(a => a.domain).filter(Boolean)));
            if (domains.length === 0) return articles;

            const { data: accounts } = await supabase
                .from('accounts')
                .select('domain, name')
                .in('domain', domains);

            const domainToName = new Map((accounts || []).map(a => [a.domain, a.name]));

            return articles.map(a => {
                a._accountName = domainToName.get(a.domain);
                return a;
            });
        },
        refetchInterval: 60000,
    });

    // 2. Fetch recent completed tasks
    const { data: completedTasks } = useQuery({
        queryKey: ['forensic-tasks', user?.email],
        queryFn: async () => {
            if (!user?.email) return [];
            const { data } = await supabase
                .from('tasks')
                .select('id, title, status, updatedAt, createdAt, relatedTo')
                .eq('status', 'Completed')
                // .eq('ownerId', user.email) // Optional: filter by owner
                .order('updatedAt', { ascending: false, nullsFirst: false })
                .limit(15);
            return data || [];
        },
        enabled: !!user?.email,
        refetchInterval: 30000,
    });

    // 3. Fetch recent CRM-verified emails
    const { data: crmEmails } = useQuery({
        queryKey: ['forensic-emails', user?.email],
        queryFn: async () => {
            if (!user?.email) return [];

            // Get recent 30 emails
            const { data: recentEmails } = await supabase
                .from('emails')
                .select('id, subject, from, to, type, timestamp, createdAt, openCount')
                .not('subject', 'ilike', '%mail warming%')
                .not('subject', 'ilike', '%mailwarming%')
                .order('timestamp', { ascending: false })
                .limit(30);

            if (!recentEmails || recentEmails.length === 0) return [];

            // Extract unique email addresses to cross-reference with contacts
            const addressSet = new Set<string>();
            recentEmails.forEach(e => {
                if (e.from) {
                    const match = e.from.match(/<([^>]+)>/);
                    addressSet.add((match ? match[1] : e.from).toLowerCase().trim());
                }
                if (e.to) {
                    const toStr = Array.isArray(e.to) ? e.to[0] : e.to;
                    if (toStr) {
                        const match = toStr.match(/<([^>]+)>/);
                        addressSet.add((match ? match[1] : toStr).toLowerCase().trim());
                    }
                }
            });

            const addresses = Array.from(addressSet).filter(a => a && a !== user.email?.toLowerCase());

            if (addresses.length === 0) return [];

            // Find which of these addresses exist in contacts
            const { data: contacts } = await supabase
                .from('contacts')
                .select('email, name')
                .in('email', addresses);

            const validContactEmails = new Map((contacts || []).map(c => [c.email.toLowerCase().trim(), c.name]));

            // Filter emails that involve a known contact
            const verifiedEmails = recentEmails.filter(e => {
                const fromMatch = e.from?.match(/<([^>]+)>/);
                const fromAddr = (fromMatch ? fromMatch[1] : e.from)?.toLowerCase().trim();

                let toAddr = '';
                if (e.to) {
                    const t = Array.isArray(e.to) ? e.to[0] : e.to;
                    if (t) {
                        const toMatch = t.match(/<([^>]+)>/);
                        toAddr = (toMatch ? toMatch[1] : t)?.toLowerCase().trim();
                    }
                }

                const contactName = validContactEmails.get(fromAddr) || validContactEmails.get(toAddr);
                if (contactName) {
                    (e as any)._contactName = contactName;
                    return true;
                }
                return false;
            });

            return verifiedEmails;
        },
        enabled: !!user?.email,
        refetchInterval: 15000,
    });

    // Combine and sort all streams
    const logEntries = useMemo(() => {
        const entries: LogEntry[] = [];

        // Inject Signals
        signals?.forEach(sig => {
            const ts = new Date(sig.published_at || sig.created_at).getTime();

            let accountName = sig._accountName || sig.metadata?.accountName;
            if (!accountName && sig.domain) {
                const raw = sig.domain.replace(/^www\./i, '').split('.')[0];
                accountName = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Unknown Entity';
            }
            accountName = accountName || 'Unknown Entity';

            entries.push({
                id: `sig-${sig.id}`,
                timestamp: ts,
                time: formatDistanceToNow(ts, { addSuffix: true }),
                action: 'SIGNAL_DETECTED',
                detail: `[${accountName}] -> ${sig.title}`
            });
        });

        // Inject Tasks
        completedTasks?.forEach(task => {
            const ts = new Date(task.updatedAt || task.createdAt).getTime();
            const target = task.relatedTo ? ` for ${task.relatedTo}` : '';
            entries.push({
                id: `task-${task.id}`,
                timestamp: ts,
                time: formatDistanceToNow(ts, { addSuffix: true }),
                action: 'TASK_COMPLETE',
                detail: `${task.title}${target}`
            });
        });

        // Inject CRM Emails
        crmEmails?.forEach((email: any) => {
            const ts = new Date(email.timestamp || email.createdAt).getTime();
            const timeStr = formatDistanceToNow(ts, { addSuffix: true });
            const contactName = email._contactName || 'Contact';

            if (email.type === 'sent' || email.type === 'uplink_out') {
                entries.push({
                    id: `email-sent-${email.id}`,
                    timestamp: ts,
                    time: timeStr,
                    action: 'EMAIL_DISPATCHED',
                    detail: `Sent to ${contactName} -> Subject: '${email.subject}'`
                });

                if (email.openCount > 0) {
                    // If opened, we estimate the open time or just stack it slightly after dispatch
                    entries.push({
                        id: `email-open-${email.id}`,
                        timestamp: ts + 1000, // force slight offset
                        time: timeStr,
                        action: 'EMAIL_OPENED',
                        detail: `${contactName} opened email -> '${email.subject}'`
                    });
                }
            } else {
                entries.push({
                    id: `email-recv-${email.id}`,
                    timestamp: ts,
                    time: timeStr,
                    action: 'UPLINK_RECEIVED',
                    detail: `Received from ${contactName} -> Subject: '${email.subject}'`
                });
            }
        });

        // Inject Live Market Pricing Alerts (calculated on the fly using marketPulse)
        if (marketPulse) {
            const ts = new Date(marketPulse.timestamp).getTime();
            const timeStr = formatDistanceToNow(ts, { addSuffix: true });

            if ((marketPulse.grid?.scarcity_prob || 0) > 15) {
                entries.push({
                    id: `alert-scarcity-${ts}`,
                    timestamp: ts,
                    time: timeStr,
                    action: 'VOLATILITY_ALERT',
                    detail: `Grid Scarcity Risk Spike -> ${marketPulse.grid.scarcity_prob.toFixed(1)}%`
                });
            }

            if ((marketPulse.prices?.houston || 0) > 75) {
                entries.push({
                    id: `alert-houston-${ts}`,
                    timestamp: ts,
                    time: timeStr,
                    action: 'PRICE_SPIKE',
                    detail: `LZ_HOUSTON Active Print -> $${marketPulse.prices.houston.toFixed(2)}/MWh`
                });
            }

            if ((marketPulse.prices?.north || 0) > 75) {
                entries.push({
                    id: `alert-north-${ts}`,
                    timestamp: ts,
                    time: timeStr,
                    action: 'PRICE_SPIKE',
                    detail: `LZ_NORTH Active Print -> $${marketPulse.prices.north.toFixed(2)}/MWh`
                });
            }
        }

        // Sort descending by timestamp
        return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);
    }, [signals, completedTasks, crmEmails, marketPulse]);

    return { logEntries };
}
