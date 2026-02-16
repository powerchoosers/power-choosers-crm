
import { createClient } from '@supabase/supabase-js';
import logger from '../../_logger.js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // AUTH CHECK: Ensure user is logged in
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized', details: authError });
    }

    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Missing code' });
    }

    try {
        // Exchange Code
        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;

        // CANONICAL REDIRECT URI LOGIC (Must match connect-secondary.js exactly)
        const host = req.headers.host || 'www.nodalpoint.io';
        const isLocal = host.includes('localhost');
        const redirectUri = isLocal
            ? 'http://localhost:3000/api/auth/callback/zoho-secondary'
            : 'https://www.nodalpoint.io/api/auth/callback/zoho-secondary';
        const accountsServer = process.env.ZOHO_ACCOUNTS_SERVER || 'https://accounts.zoho.com';

        const tokenResponse = await fetch(`${accountsServer}/oauth/v2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code: code,
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }).toString()
        });

        if (!tokenResponse.ok) {
            const errText = await tokenResponse.text();
            throw new Error(`Token Exchange Failed: ${errText}`);
        }

        const tokenData = await tokenResponse.json();

        // Fetch Zoho Identity
        const profileResponse = await fetch('https://mail.zoho.com/api/accounts', {
            headers: { 'Authorization': `Zoho-oauthtoken ${tokenData.access_token}` }
        });

        if (!profileResponse.ok) {
            throw new Error('Failed to fetch Zoho profile');
        }

        const profileData = await profileResponse.json();
        const primaryAccount = profileData.data?.[0];

        if (!primaryAccount?.primaryEmailAddress) {
            throw new Error('Could not identify email address');
        }

        const email = primaryAccount.primaryEmailAddress.toLowerCase();
        const accountId = primaryAccount.accountId;

        // Save to zoho_connections
        const expiresIn = tokenData.expires_in || 3600;
        const expiresAt = new Date(Date.now() + (expiresIn - 300) * 1000).toISOString();

        const connectionPayload = {
            user_id: user.id,
            email: email,
            access_token: tokenData.access_token,
            token_expires_at: expiresAt,
            account_id: accountId,
            updated_at: new Date().toISOString()
        };

        if (tokenData.refresh_token) {
            connectionPayload.refresh_token = tokenData.refresh_token;
        }

        const { error: dbError } = await supabaseAdmin
            .from('zoho_connections')
            .upsert(connectionPayload, { onConflict: 'user_id, email' });

        if (dbError) throw dbError;

        return res.status(200).json({ success: true, email, accountId });

    } catch (error) {
        logger.error('Zoho Finalize Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
