
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const clientId = process.env.ZOHO_CLIENT_ID;

    // STABILIZED REDIRECT URI LOGIC
    // Dynamic origin detection is causing mismatches behind Vercel's proxy.
    // We must use a deterministic URI that matches Zoho Console exactly.
    const isLocal = request.url.includes('localhost');
    const redirectUri = isLocal
        ? 'http://localhost:3000/api/auth/callback/zoho'
        : 'https://www.nodalpoint.io/api/auth/callback/zoho';

    // NOTE: Ensure 'https://www.nodalpoint.io/api/auth/callback/zoho' is added to Zoho Developer Console
    console.log(`Zoho Login: Using stabilized redirect URI: ${redirectUri}`);

    if (!clientId) {
        return NextResponse.json({ error: 'Missing Zoho Client ID' }, { status: 500 });
    }

    console.log(`Zoho Login: Using dynamic redirect URI: ${redirectUri}`);

    // Zoho Accounts URL (US Region)
    // https://accounts.zoho.com/oauth/v2/auth
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'openid email profile ZohoMail.messages.READ ZohoMail.messages.CREATE ZohoMail.accounts.READ ZohoMail.folders.READ',
        redirect_uri: redirectUri,
        access_type: 'offline',
        prompt: 'consent',
    });

    const url = `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;

    return NextResponse.redirect(url);
}
