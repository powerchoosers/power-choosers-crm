
import { NextResponse } from 'next/server';

export async function GET() {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const redirectUri = process.env.ZOHO_REDIRECT_URI; // Check .env.local matches this

    if (!clientId || !redirectUri) {
        return NextResponse.json({ error: 'Missing Zoho Client ID or Redirect URI' }, { status: 500 });
    }

    // Zoho Accounts URL (US Region)
    // https://accounts.zoho.com/oauth/v2/auth
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'openid email profile', // Standard OIDC scopes for better identity reliability
        redirect_uri: redirectUri,
        access_type: 'offline',
        prompt: 'consent',
    });

    const url = `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;

    return NextResponse.redirect(url);
}
