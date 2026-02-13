
import { NextResponse } from 'next/server';
import { firebaseAdmin as admin } from '@/lib/firebase-admin';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        console.error('Zoho OAuth Callback Error:', error);
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
    }

    if (!code) {
        console.error('Zoho OAuth Callback: Missing code');
        return NextResponse.redirect(new URL('/login?error=Missing+authorization+code', request.url));
    }

    try {
        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;
        const redirectUri = process.env.ZOHO_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            console.error('Zoho OAuth Callback: Missing environment variables');
            throw new Error('Configuration error: Missing Zoho credentials');
        }

        console.log('Zoho OAuth: Attempting token exchange...');
        // 1. Exchange code for tokens
        const tokenResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code: code,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('Zoho Token Exchange Failure:', tokenData);
            throw new Error(`Token exchange failed: ${tokenData.error}`);
        }

        const accessToken = tokenData.access_token;
        console.log('Zoho OAuth: Token exchange successful. Fetching user info...');

        // 2. Get User Info
        const userResponse = await fetch('https://accounts.zoho.com/oauth/user/info', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('Zoho UserInfo API Error:', errorText);
            throw new Error(`Failed to fetch user info: ${userResponse.statusText}`);
        }

        const userData = await userResponse.json();
        console.log('Zoho User Data received:', JSON.stringify(userData));

        // Zoho can return email in several field names depending on scopes/API
        const email = userData.Email || userData.email || userData.email_id || userData.principal_name;

        if (!email) {
            console.error('Zoho User Data missing email:', userData);
            throw new Error('Could not retrieve email identity from Zoho');
        }

        console.log(`Zoho OAuth: Authenticating user: ${email}`);

        // 3. Verify Identity (Strict Admin Check)
        const TARGET_EMAIL = 'l.patterson@nodalpoint.io';
        const TARGET_UID = '4mKkyoZBIKhYGdPBNSHlNaHIfR02';

        if (email.toLowerCase() !== TARGET_EMAIL.toLowerCase()) {
            console.warn(`Zoho OAuth: Unauthorized email attempt: ${email}`);
            return NextResponse.redirect(new URL('/login?error=Unauthorized+Zoho+account', request.url));
        }

        // 4. Create Custom Token
        if (!admin.apps.length) {
            console.error('Firebase Admin not initialized in callback');
            throw new Error('Server authentication service unavailable');
        }

        console.log(`Zoho OAuth: Minting custom token for UID: ${TARGET_UID}`);
        const customToken = await admin.auth().createCustomToken(TARGET_UID);

        // 5. Set Middleware Cookie & Redirect
        const response = NextResponse.redirect(new URL(`/login/callback?token=${customToken}`, request.url));

        response.cookies.set('np_session', '1', {
            path: '/',
            httpOnly: false,
            sameSite: 'lax',
        });

        console.log('Zoho OAuth: Login process complete. Redirecting to client callback...');
        return response;

    } catch (err: any) {
        console.error('Zoho Auth Flow Exception:', err);
        const errorMessage = err.message || 'Authentication flow failed';
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url));
    }
}
