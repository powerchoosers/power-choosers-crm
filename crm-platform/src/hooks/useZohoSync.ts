
import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { useSyncStore } from '@/store/syncStore';
import { supabase } from '@/lib/supabase';

/**
 * Hook for automated Zoho Mail synchronization
 */
export function useZohoSync() {
    const { user } = useAuth();
    const { isSyncing, setSyncing, setLastSyncTime, syncCount, setSyncCount } = useSyncStore();
    const syncInProgress = useRef(false);

    const performSync = useCallback(async (isSilent = false) => {
        if (!user?.email || syncInProgress.current) return;

        try {
            syncInProgress.current = true;
            if (!isSilent) setSyncing(true);

            console.log(`[Zoho Sync] Initiating sync for ${user.email}...`);

            const response = await fetch('/api/email/zoho-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userEmail: user.email }),
            });

            const data = await response.json();

            if (data.success) {
                console.log(`[Zoho Sync] Successfully synced ${data.count} emails.`);
                setLastSyncTime(new Date().toISOString());
                if (data.count > 0) {
                    setSyncCount((syncCount || 0) + data.count);
                    // Refresh current view if needed (could emit an event)
                }
            } else {
                console.error('[Zoho Sync] Sync failed:', data.error);
            }
        } catch (error) {
            console.error('[Zoho Sync] Network error:', error);
        } finally {
            syncInProgress.current = false;
            setSyncing(false);
        }
    }, [user, setSyncing, setLastSyncTime, setSyncCount, syncCount]);

    useEffect(() => {
        if (!user) return;

        // Perform initial sync on mount
        performSync(true);

        // Setup interval for background sync (every 5 minutes)
        const interval = setInterval(() => {
            performSync(true);
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [user, performSync]);

    return { performSync, isSyncing };
}
