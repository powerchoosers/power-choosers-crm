
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const clientId = process.env.ZOHO_CLIENT_ID;

    // DYNAMIC REDIRECT URI LOGIC
    // We must match the host that initiated the request (www vs non-www)
    const host = request.headers.get('host') || 'www.nodalpoint.io';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/callback/zoho`;

    console.log(`Zoho Login: Dynamic redirect URI: ${redirectUri}`);

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
