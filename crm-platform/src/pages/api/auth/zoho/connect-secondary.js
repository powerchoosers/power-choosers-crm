
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Get the user from the session (JWT) provided in Authorization header if possible, 
    // or rely on the fact that this is an authenticated call from the frontend action.
    // For security, checking the session is best.
    // Since this is a Pages API route, we can use Supabase helper if available, or just standard token check.
    // BUT the existing `zoho/login/route.ts` (App Router) just redirects. 
    // Here, we want to start a flow that redirects BACK to `callback/zoho-secondary`.

    const clientId = process.env.ZOHO_CLIENT_ID;

    // CANONICAL REDIRECT URI LOGIC
    const host = req.headers.host || 'www.nodalpoint.io';
    const isLocal = host.includes('localhost');
    const redirectUri = isLocal
        ? 'http://localhost:3000/api/auth/callback/zoho-secondary'
        : 'https://www.nodalpoint.io/api/auth/callback/zoho-secondary';
    const scope = 'ZohoMail.messages.ALL,ZohoMail.accounts.READ';
    const accessType = 'offline';
    const prompt = 'consent';

    const zohoAuthUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=${scope}&client_id=${clientId}&response_type=code&access_type=${accessType}&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=${prompt}`;

    // Redirect the user to Zoho's consent screen
    res.redirect(zohoAuthUrl);
}
