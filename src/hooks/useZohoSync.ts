
import { useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSyncStore } from '@/store/syncStore';
import { supabase } from '@/lib/supabase';
import { showInboxEmailToast } from '@/lib/inbox-email-toast';
import { consumeInboxToastId } from '@/lib/inbox-toast-dedupe';

const CRM_PREFIXES = ['/network', '/market-data'];

const FALLBACK_SHARED_INBOX_OWNERS_BY_USER: Record<string, string[]> = {};

async function getOwnerScope(user: { id?: string; email?: string | null }) {
    const primary = String(user.email || '').toLowerCase().trim();
    if (!primary) return [];

    const fallbackShared = FALLBACK_SHARED_INBOX_OWNERS_BY_USER[primary] || [];
    const owners = new Set<string>([primary, ...fallbackShared]);

    if (user.id) {
        const { data: connections } = await supabase
            .from('zoho_connections')
            .select('email')
            .eq('user_id', user.id);

        (connections || []).forEach((conn: { email?: string | null }) => {
            const email = String(conn.email || '').toLowerCase().trim();
            if (email) owners.add(email);
        });
    }

    return Array.from(owners);
}

/**
 * Hook for automated Zoho Mail synchronization
 */
export function useZohoSync() {
    const pathname = usePathname();
    const onCrmRoute = CRM_PREFIXES.some(p => pathname?.startsWith(p));
    const { user } = useAuth();
    const { isSyncing, setIsSyncing, setLastSyncTime, syncCount, setSyncCount } = useSyncStore();
    const syncInProgress = useRef(false);
    const deliveredNotificationIdsRef = useRef(new Set<string>());

    const showSyncNotifications = useCallback((notifications: any[] = []) => {
        notifications.forEach((notification) => {
            const payload = notification?.data || {};
            const notificationId = String(payload.emailId || notification?.id || '').trim();
            if (!notificationId || deliveredNotificationIdsRef.current.has(notificationId)) return;
            if (!consumeInboxToastId(notificationId)) return;
            deliveredNotificationIdsRef.current.add(notificationId);

            const sourceLabel = String(payload.sourceLabel || notification?.metadata?.sourceLabel || '').trim();

            showInboxEmailToast({
                name: String(payload.contactName || notification?.title?.replace(/^New email from\s+/i, '') || 'CRM contact'),
                company: String(payload.company || 'Unknown company'),
                subject: String(payload.subject || notification?.message || 'New email from CRM contact'),
                snippet: String(payload.snippet || notification?.message || 'New message received'),
                hasAttachments: Boolean(payload.hasAttachments),
                photoUrl: (payload.photoUrl as string | null) ?? null,
                sourceLabel: sourceLabel || undefined,
            });

        });
    }, []);

    const performSync = useCallback(async (isSilent = false) => {
        if (!user?.email || syncInProgress.current) return;
        const syncSource = isSilent ? 'background' : 'manual';

        try {
            syncInProgress.current = true;
            if (!isSilent) setIsSyncing(true);

            const ownerScope = await getOwnerScope({ id: user.id, email: user.email });
            if (ownerScope.length === 0) return;
            console.log(`[Zoho Sync] Initiating sync for scope: ${ownerScope.join(', ')}`);

            let totalSynced = 0;
            for (const inboxEmail of ownerScope) {
                const response = await fetch('/api/email/zoho-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: inboxEmail, source: syncSource }),
                });

                const data = await response.json();

                if (data.success) {
                    totalSynced += Number(data.count || 0);
                    console.log(`[Zoho Sync] ${inboxEmail}: synced ${data.count || 0} emails.`, data.debug || '');
                    if (Array.isArray(data.notifications) && data.notifications.length > 0) {
                        showSyncNotifications(data.notifications);
                    }
                } else {
                    console.error(`[Zoho Sync] ${inboxEmail}: sync failed`, data.error);
                }
            }

            setLastSyncTime(Date.now());
            if (totalSynced > 0) {
                setSyncCount((syncCount || 0) + totalSynced);
            }
        } catch (error) {
            console.error('[Zoho Sync] Network error:', error);
        } finally {
            syncInProgress.current = false;
            setIsSyncing(false);
        }
    }, [user, setIsSyncing, setLastSyncTime, setSyncCount, syncCount, showSyncNotifications]);

    useEffect(() => {
        if (!user || !onCrmRoute) return;

        // Perform initial sync on mount
        performSync(true);

        // Setup interval for background sync (every 3 minutes)
        const interval = setInterval(() => {
            performSync(true);
        }, 3 * 60 * 1000);

        return () => clearInterval(interval);
    }, [user, performSync, onCrmRoute]);

    return { performSync, isSyncing };
}
