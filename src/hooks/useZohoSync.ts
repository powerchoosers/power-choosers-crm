
import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSyncStore } from '@/store/syncStore';
import { supabase } from '@/lib/supabase';

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
    const { user } = useAuth();
    const { isSyncing, setIsSyncing, setLastSyncTime, syncCount, setSyncCount } = useSyncStore();
    const syncInProgress = useRef(false);

    const performSync = useCallback(async (isSilent = false) => {
        if (!user?.email || syncInProgress.current) return;

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
                    body: JSON.stringify({ userEmail: inboxEmail }),
                });

                const data = await response.json();

                if (data.success) {
                    totalSynced += Number(data.count || 0);
                    console.log(`[Zoho Sync] ${inboxEmail}: synced ${data.count || 0} emails.`, data.debug || '');
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
    }, [user, setIsSyncing, setLastSyncTime, setSyncCount, syncCount]);

    useEffect(() => {
        if (!user) return;

        // Perform initial sync on mount
        performSync(true);

        // Setup interval for background sync (every 3 minutes)
        const interval = setInterval(() => {
            performSync(true);
        }, 3 * 60 * 1000);

        return () => clearInterval(interval);
    }, [user, performSync]);

    return { performSync, isSyncing };
}
