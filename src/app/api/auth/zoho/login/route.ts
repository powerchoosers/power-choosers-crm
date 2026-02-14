
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const clientId = process.env.ZOHO_CLIENT_ID;

    // Dynamically determine the redirect URI based on the request origin
    const { origin } = new URL(request.url);
    const redirectUri = `${origin}/api/auth/callback/zoho`;

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
