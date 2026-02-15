
// Zoho OAuth token management utility
import { createClient } from '@supabase/supabase-js';
import logger from '../_logger.js';

// Initialize Supabase Admin
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// In-memory token cache (per user email)
const userTokenCache = new Map();

/**
 * Refreshes the Zoho access token for a specific user or connection
 * @param {string} userEmail - User's email (or secondary email)
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<Object>} - New access token
 */
export async function refreshAccessTokenForUser(userEmail, refreshToken) {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const accountsServer = process.env.ZOHO_ACCOUNTS_SERVER || 'https://accounts.zoho.com';

    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error(`Missing Zoho OAuth credentials for ${userEmail}`);
    }

    try {
        logger.info(`[Zoho Token] Refreshing access token for ${userEmail}...`, 'zoho-token-manager');

        const body = new URLSearchParams({
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
        });

        const response = await fetch(`${accountsServer}/oauth/v2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString()
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[Zoho Token] Failed to refresh token for ${userEmail}: Status ${response.status} - ${errorText}`, 'zoho-token-manager');
            throw new Error(`Failed to refresh Zoho token: Status ${response.status}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('No access_token in refresh response');
        }

        const expiresIn = data.expires_in || 3600;
        const expiresAt = new Date(Date.now() + (expiresIn - 300) * 1000).toISOString();

        // Update cache
        userTokenCache.set(userEmail.toLowerCase(), {
            accessToken: data.access_token,
            expiresAt: new Date(expiresAt).getTime()
        });

        // Save to Supabase (Check secondary connections first, then primary users)
        const { data: connection, error: connError } = await supabaseAdmin
            .from('zoho_connections')
            .update({
                access_token: data.access_token,
                token_expires_at: expiresAt,
                updated_at: new Date().toISOString()
            })
            .eq('email', userEmail)
            .select();

        let updated = false;
        if (connection && connection.length > 0) {
            updated = true;
            logger.info(`[Zoho Token] Updated secondary connection token for ${userEmail}`);
        }

        if (!updated) {
            // Fallback to users table (Primary Identity)
            const { error: userError } = await supabaseAdmin
                .from('users')
                .update({
                    zoho_access_token: data.access_token,
                    zoho_token_expires_at: expiresAt,
                    updated_at: new Date().toISOString()
                })
                .eq('email', userEmail);

            if (!userError) {
                logger.info(`[Zoho Token] Updated primary user token for ${userEmail}`);
            } else {
                logger.error(`[Zoho Token] Failed to persist refreshed token for ${userEmail}: ${userError.message}`);
            }
        }

        return data.access_token;
    } catch (error) {
        logger.error(`[Zoho Token] Error refreshing token for ${userEmail}:`, error, 'zoho-token-manager');
        throw error;
    }
}

/**
 * Gets a valid access token for a user, checking Secondary Connections first, then Primary User.
 * @param {string} userEmail - The specific sender email address to use.
 * @returns {Promise<Object>} - { accessToken, accountId }
 */
export async function getValidAccessTokenForUser(userEmail) {
    if (!userEmail) throw new Error('User email is required for Zoho token lookup');

    const lowerEmail = userEmail.toLowerCase().trim();

    // 1. Check in-memory cache
    const cached = userTokenCache.get(lowerEmail);
    if (cached && cached.expiresAt > Date.now()) {
        // Optimization: If cached request is valid, try to avoid DB hit for Account ID if possible?
        // But we need accountID specifically. 
        // Let's rely on cache if we can, but usually we don't cache accountId here yet.
        // Let's improve cache if needed, but for now, let's keep it safe and double check or fetch metadata.
        // Actually, let's query the specific record to get the account ID, or cache it too.
        // For now, let's just proceed to DB check if we need account ID, OR add accountId to cache.
        if (cached.accountId) {
            return { accessToken: cached.accessToken, accountId: cached.accountId };
        }
    }

    // 2. Lookup in `zoho_connections` (Secondary)
    const { data: connection } = await supabaseAdmin
        .from('zoho_connections')
        .select('access_token, refresh_token, token_expires_at, account_id')
        .eq('email', lowerEmail)
        .maybeSingle();

    if (connection) {
        return handleTokenValidation(lowerEmail, {
            access_token: connection.access_token,
            refresh_token: connection.refresh_token,
            token_expires_at: connection.token_expires_at,
            account_id: connection.account_id
        }, 'secondary');
    }

    // 3. Lookup in `users` (Primary)
    const { data: user } = await supabaseAdmin
        .from('users')
        .select('zoho_access_token, zoho_refresh_token, zoho_token_expires_at, zoho_account_id')
        .eq('email', lowerEmail)
        .maybeSingle();

    if (user) {
        return handleTokenValidation(lowerEmail, {
            access_token: user.zoho_access_token,
            refresh_token: user.zoho_refresh_token,
            token_expires_at: user.zoho_token_expires_at,
            account_id: user.zoho_account_id
        }, 'primary');
    }

    // 4. Legacy/Admin Fallback
    if (lowerEmail === 'l.patterson@nodalpoint.io' && process.env.ZOHO_REFRESH_TOKEN) {
        logger.warn(`[Zoho Token] Using legacy ENV fallback for ${lowerEmail}`);
        return {
            accessToken: await getValidAccessToken(), // old method
            accountId: process.env.ZOHO_ACCOUNT_ID
        };
    }

    throw new Error(`No Zoho credentials found for ${lowerEmail}`);
}

/**
 * Common validation and refresh logic
 */
async function handleTokenValidation(email, record, type) {
    const expiresAt = record.token_expires_at ? new Date(record.token_expires_at).getTime() : 0;

    // Check if valid (with 1 min buffer)
    if (record.access_token && expiresAt > (Date.now() + 60000)) {
        let accountId = record.account_id;

        // Auto-fetch AccountID if missing
        if (!accountId) {
            try {
                accountId = await fetchZohoAccountId(email, record.access_token, type);
            } catch (e) {
                logger.warn(`[Zoho Token] Failed to auto-fetch account ID: ${e.message}`);
                accountId = process.env.ZOHO_ACCOUNT_ID; // Fallback if applicable, usually empty for secondary
            }
        }

        // Update Cache
        userTokenCache.set(email, {
            accessToken: record.access_token,
            expiresAt: expiresAt,
            accountId: accountId
        });

        return { accessToken: record.access_token, accountId };
    }

    // Expired - Refresh
    if (!record.refresh_token) {
        throw new Error(`Access token expired and no refresh token available for ${email} (${type})`);
    }

    const newAccessToken = await refreshAccessTokenForUser(email, record.refresh_token);

    // Re-fetch account ID with new token if missing
    let accountId = record.account_id;
    if (!accountId) {
        try {
            accountId = await fetchZohoAccountId(email, newAccessToken, type);
        } catch (e) {
            logger.warn(`[Zoho Token] Failed to auto-fetch account ID after refresh: ${e.message}`);
        }
    }

    return {
        accessToken: newAccessToken,
        accountId: accountId || (type === 'primary' ? process.env.ZOHO_ACCOUNT_ID : null)
    };
}

/**
 * Helper to fetch and save account ID
 */
async function fetchZohoAccountId(userEmail, accessToken, type) {
    const url = 'https://mail.zoho.com/api/accounts';
    const response = await fetch(url, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const data = await response.json();
    const accountId = data.data?.[0]?.accountId;

    if (accountId) {
        if (type === 'secondary') {
            await supabaseAdmin.from('zoho_connections').update({ account_id: accountId }).eq('email', userEmail);
        } else {
            await supabaseAdmin.from('users').update({ zoho_account_id: accountId }).eq('email', userEmail);
        }
        logger.info(`[Zoho Token] Auto-discovered and saved Account ID ${accountId} for ${userEmail}`);
        return accountId;
    }
    return null;
}

/**
 * Legacy compatibility method (uses Env vars)
 */
export async function getValidAccessToken() {
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    if (!refreshToken) throw new Error('Missing ZOHO_REFRESH_TOKEN in environment');
    return await refreshAccessTokenForUser('ADMIN_ENV', refreshToken);
}

/**
 * Clears the token cache
 */
export function clearTokenCache(userEmail) {
    if (userEmail) {
        userTokenCache.delete(userEmail.toLowerCase());
    } else {
        userTokenCache.clear();
    }
}
