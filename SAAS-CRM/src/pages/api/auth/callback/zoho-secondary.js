
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const { code, location, 'accounts-server': accountsServer, error } = req.query;

    if (error) {
        return res.redirect(`/settings?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
    }

    try {
        // Redirect to frontend to handle the token exchange securely with user session
        // format: /network/settings?action=zoho_callback&code=...
        return res.redirect(`/network/settings?action=zoho_callback&code=${code}&status=success`);
    } catch (error) {
        console.error('Callback error:', error);
        return res.redirect(`/network/settings?error=${encodeURIComponent(error.message)}`);
    }
}
