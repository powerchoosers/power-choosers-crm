import { cors } from '../_cors.js';
import { createClient } from '@supabase/supabase-js';
import { refreshAccessTokenForUser } from './zoho-token-manager.js';
import logger from '../_logger.js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Canonical app URL — used by pg_cron calls that don't have a host context
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nodalpoint.io';

/**
 * POST /api/email/zoho-refresh-all
 *
 * Refreshes expired/expiring tokens for ALL Zoho-connected accounts and
 * optionally triggers inbox sync for each.
 * Called by Supabase pg_cron (via pg_net HTTP POST) or manually from the UI.
 *
 * Auth: Requires x-service-role header matching SUPABASE_SERVICE_ROLE_KEY,
 *       OR called internally (same-origin in dev).
 *
 * Body: { syncAfterRefresh?: boolean }
 */
export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Lightweight auth: pg_cron passes a shared cron secret as a header.
    // Set CRON_SECRET env var in Vercel to match the value in the pg_cron job.
    // Skip check in dev so local testing works easily.
    const cronSecret = process.env.CRON_SECRET;
    const callerSecret = req.headers['x-cron-secret'];
    if (process.env.NODE_ENV !== 'development' && cronSecret && callerSecret !== cronSecret) {
        logger.warn('[ZohoRefreshAll] Unauthorized call blocked');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { syncAfterRefresh = false } = req.body || {};

    const now = Date.now();
    // Refresh all tokens expiring within the next 10 minutes
    const EXPIRY_BUFFER_MS = 10 * 60 * 1000;
    const expiryThreshold = new Date(now + EXPIRY_BUFFER_MS).toISOString();

    const results = {
        connections: [],
        users: [],
        errors: [],
    };

    try {
        // --- 1. Refresh secondary connections (zoho_connections table) ---
        const { data: connections, error: connError } = await supabaseAdmin
            .from('zoho_connections')
            .select('email, refresh_token, token_expires_at, account_id')
            .not('refresh_token', 'is', null)
            .lt('token_expires_at', expiryThreshold);

        if (connError) {
            logger.error('[ZohoRefreshAll] Error fetching connections:', connError);
        } else {
            for (const conn of (connections || [])) {
                try {
                    logger.info(`[ZohoRefreshAll] Refreshing secondary token for ${conn.email}...`);
                    await refreshAccessTokenForUser(conn.email, conn.refresh_token);
                    results.connections.push({ email: conn.email, status: 'refreshed' });
                    logger.info(`[ZohoRefreshAll] \u2713 Refreshed token for ${conn.email}`);

                    if (syncAfterRefresh) {
                        await triggerSync(conn.email);
                    }
                } catch (err) {
                    logger.error(`[ZohoRefreshAll] Failed to refresh token for ${conn.email}:`, err);
                    results.errors.push({ email: conn.email, source: 'connections', error: err.message });
                }
            }
        }

        // --- 2. Refresh primary users with Zoho tokens (users table) ---
        const { data: usersWithTokens, error: userError } = await supabaseAdmin
            .from('users')
            .select('email, zoho_refresh_token, zoho_token_expires_at')
            .not('zoho_refresh_token', 'is', null)
            .lt('zoho_token_expires_at', expiryThreshold);

        if (userError) {
            logger.error('[ZohoRefreshAll] Error fetching users:', userError);
        } else {
            for (const u of (usersWithTokens || [])) {
                try {
                    logger.info(`[ZohoRefreshAll] Refreshing primary token for ${u.email}...`);
                    await refreshAccessTokenForUser(u.email, u.zoho_refresh_token);
                    results.users.push({ email: u.email, status: 'refreshed' });
                    logger.info(`[ZohoRefreshAll] \u2713 Refreshed primary token for ${u.email}`);

                    if (syncAfterRefresh) {
                        await triggerSync(u.email);
                    }
                } catch (err) {
                    logger.error(`[ZohoRefreshAll] Failed to refresh primary token for ${u.email}:`, err);
                    results.errors.push({ email: u.email, source: 'users', error: err.message });
                }
            }
        }

        const totalRefreshed = results.connections.length + results.users.length;
        logger.info(`[ZohoRefreshAll] Done. ${totalRefreshed} tokens refreshed, ${results.errors.length} errors.`);

        return res.status(200).json({
            success: true,
            refreshed: totalRefreshed,
            results,
        });

    } catch (error) {
        logger.error('[ZohoRefreshAll] Global error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Triggers zoho-sync for a single agent inbox.
 * Uses APP_URL so this works when called from pg_cron (no req.host context).
 */
async function triggerSync(userEmail) {
    try {
        const response = await fetch(`${APP_URL}/api/email/zoho-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail }),
        });
        const data = await response.json();
        logger.info(`[ZohoRefreshAll] Sync for ${userEmail}: ${data.count ?? 0} new emails`);
    } catch (err) {
        logger.warn(`[ZohoRefreshAll] Sync trigger failed for ${userEmail}: ${err.message}`);
    }
}
