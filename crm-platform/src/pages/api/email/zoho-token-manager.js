
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
 * Refreshes the Zoho access token for a specific user
 * @param {string} userEmail - User's email
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<Object>} - New access token and expiry info
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
        userTokenCache.set(userEmail, {
            accessToken: data.access_token,
            expiresAt: new Date(expiresAt).getTime()
        });

        // Save to Supabase
        await supabaseAdmin
            .from('users')
            .update({
                zoho_access_token: data.access_token,
                zoho_token_expires_at: expiresAt,
                updated_at: new Date().toISOString()
            })
            .eq('email', userEmail);

        logger.info(`[Zoho Token] Token refreshed successfully for ${userEmail}`, 'zoho-token-manager');

        return data.access_token;
    } catch (error) {
        logger.error(`[Zoho Token] Error refreshing token for ${userEmail}:`, error, 'zoho-token-manager');
        throw error;
    }
}

/**
 * Gets a valid access token for a user, checking Supabase first
 * @param {string} userEmail - User's email
 * @returns {Promise<Object>} - { accessToken, accountId }
 */
export async function getValidAccessTokenForUser(userEmail) {
    if (!userEmail) throw new Error('User email is required for Zoho token lookup');

    const lowerEmail = userEmail.toLowerCase();

    // 1. Check in-memory cache
    const cached = userTokenCache.get(lowerEmail);
    if (cached && cached.expiresAt > Date.now()) {
        // We still need the accountId, so fetch from DB if not in cache (could cache that too)
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('zoho_account_id')
            .eq('email', lowerEmail)
            .single();

        return {
            accessToken: cached.accessToken,
            accountId: user?.zoho_account_id || process.env.ZOHO_ACCOUNT_ID
        };
    }

    // 2. Fetch from Supabase
    const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('zoho_access_token, zoho_refresh_token, zoho_token_expires_at, zoho_account_id')
        .eq('email', lowerEmail)
        .single();

    if (error || !user) {
        logger.warn(`[Zoho Token] No Zoho credentials found in Supabase for ${lowerEmail}`, 'zoho-token-manager');
        // Fallback to Env if this is the admin (compatibility)
        if (lowerEmail === 'l.patterson@nodalpoint.io' && process.env.ZOHO_REFRESH_TOKEN) {
            return {
                accessToken: await getValidAccessToken(), // old method
                accountId: process.env.ZOHO_ACCOUNT_ID
            };
        }
        throw new Error(`No Zoho credentials found for ${lowerEmail}`);
    }

    // 3. Check if current access token is still valid
    const expiresAt = user.zoho_token_expires_at ? new Date(user.zoho_token_expires_at).getTime() : 0;
    if (user.zoho_access_token && expiresAt > (Date.now() + 60000)) { // 1 min buffer
        userTokenCache.set(lowerEmail, {
            accessToken: user.zoho_access_token,
            expiresAt: expiresAt
        });
        let accountId = user.zoho_account_id;
        if (!accountId) {
            // Try to fetch it with current token
            try {
                accountId = await fetchZohoAccountId(lowerEmail, user.zoho_access_token);
            } catch (e) {
                logger.warn(`[Zoho Token] Failed to auto-fetch account ID with existing token: ${e.message}`);
                accountId = process.env.ZOHO_ACCOUNT_ID;
            }
        }

        userTokenCache.set(lowerEmail, {
            accessToken: user.zoho_access_token,
            expiresAt: expiresAt
        });
        return {
            accessToken: user.zoho_access_token,
            accountId: accountId
        };
    }

    // 4. Token expired, use refresh token
    if (!user.zoho_refresh_token) {
        throw new Error(`Access token expired and no refresh token available for ${lowerEmail}`);
    }

    const newAccessToken = await refreshAccessTokenForUser(lowerEmail, user.zoho_refresh_token);

    // Check if account ID is missing and try to fetch it
    let accountId = user.zoho_account_id;
    if (!accountId) {
        try {
            accountId = await fetchZohoAccountId(lowerEmail, newAccessToken);
        } catch (e) {
            logger.warn(`[Zoho Token] Failed to auto-fetch account ID for ${lowerEmail}: ${e.message}`);
            accountId = process.env.ZOHO_ACCOUNT_ID;
        }
    }

    return {
        accessToken: newAccessToken,
        accountId: accountId || process.env.ZOHO_ACCOUNT_ID
    };
}

/**
 * Helper to fetch and save account ID
 */
async function fetchZohoAccountId(userEmail, accessToken) {
    const url = 'https://mail.zoho.com/api/accounts';
    const response = await fetch(url, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const data = await response.json();
    const accountId = data.data?.[0]?.accountId;

    if (accountId) {
        await supabaseAdmin.from('users').update({ zoho_account_id: accountId }).eq('email', userEmail);
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

    // Simple cache check/refresh logic (same as before)
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
