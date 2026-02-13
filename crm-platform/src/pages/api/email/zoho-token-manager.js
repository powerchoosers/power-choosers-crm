// Zoho OAuth token management utility
import logger from '../_logger.js';

// In-memory token cache
let tokenCache = {
    accessToken: null,
    expiresAt: null,
};

/**
 * Refreshes the Zoho access token using the refresh token
 * @param {string} refreshToken - The refresh token from environment
 * @returns {Promise<string>} - New access token
 */
export async function refreshAccessToken(refreshToken) {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const accountsServer = process.env.ZOHO_ACCOUNTS_SERVER || 'https://accounts.zoho.com';

    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error('Missing Zoho OAuth credentials in environment variables');
    }

    try {
        logger.info('[Zoho Token] Refreshing access token...', 'zoho-token-manager');

        const params = new URLSearchParams({
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
        });

        const response = await fetch(`${accountsServer}/oauth/v2/token?${params.toString()}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[Zoho Token] Failed to refresh token: ${response.status} ${errorText}`, 'zoho-token-manager');
            throw new Error(`Failed to refresh Zoho token: ${response.status}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('No access_token in refresh response');
        }

        // Cache the new token with expiry (subtract 5 minutes for safety margin)
        const expiresIn = data.expires_in || 3600;
        tokenCache.accessToken = data.access_token;
        tokenCache.expiresAt = Date.now() + (expiresIn - 300) * 1000;

        logger.info(`[Zoho Token] Token refreshed successfully, expires in ${expiresIn}s`, 'zoho-token-manager');

        return data.access_token;
    } catch (error) {
        logger.error('[Zoho Token] Error refreshing token:', error, 'zoho-token-manager');
        throw error;
    }
}

/**
 * Gets a valid access token, refreshing if necessary
 * @returns {Promise<string>} - Valid access token
 */
export async function getValidAccessToken() {
    // Check if we have a cached token that's still valid
    if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
        logger.debug('[Zoho Token] Using cached access token', 'zoho-token-manager');
        return tokenCache.accessToken;
    }

    // Try to use the token from environment first
    const envToken = process.env.ZOHO_ACCESS_TOKEN;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

    // If we have an env token and no cached token, use it and cache it
    if (envToken && !tokenCache.accessToken) {
        logger.info('[Zoho Token] Using access token from environment', 'zoho-token-manager');
        // Assume it's valid for 1 hour minus 5 minutes
        tokenCache.accessToken = envToken;
        tokenCache.expiresAt = Date.now() + (3600 - 300) * 1000;
        return envToken;
    }

    // Token expired or not available, refresh it
    if (!refreshToken) {
        throw new Error('No refresh token available and access token expired');
    }

    return await refreshAccessToken(refreshToken);
}

/**
 * Clears the token cache (useful for testing or forced refresh)
 */
export function clearTokenCache() {
    tokenCache = {
        accessToken: null,
        expiresAt: null,
    };
    logger.info('[Zoho Token] Token cache cleared', 'zoho-token-manager');
}
