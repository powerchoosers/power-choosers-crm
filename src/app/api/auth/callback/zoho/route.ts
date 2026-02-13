
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
        const idToken = tokenData.id_token; // OIDC token if scope included openid
        console.log('Zoho OAuth: Token exchange successful.');

        let email: string | null = null;

        // Try to decode email from id_token first if available (safer/faster)
        if (idToken) {
            try {
                const parts = idToken.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    email = payload.email || payload.Email;
                    console.log('Zoho OAuth: Extracted email from ID Token:', email);
                }
            } catch (e) {
                console.warn('Zoho OAuth: Failed to decode ID Token:', e);
            }
        }

        // If no email from id_token, try user info endpoint
        if (!email) {
            console.log('Zoho OAuth: Fetching user info from endpoint...');
            const userResponse = await fetch('https://accounts.zoho.com/oauth/user/info', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!userResponse.ok) {
                const errorText = await userResponse.text();
                console.error('Zoho UserInfo API Error:', userResponse.status, errorText);
                throw new Error(`Failed to fetch user info: ${userResponse.status} ${userResponse.statusText}`);
            }

            const userData = await userResponse.json();
            console.log('Zoho User Data received:', JSON.stringify(userData));
            email = userData.Email || userData.email || userData.email_id || userData.principal_name;
        }

        if (!email) {
            throw new Error('Could not retrieve email identity from Zoho');
        }

        console.log(`Zoho OAuth: Authenticating user: ${email}`);

        // 3. Verify Identity & Determine UID
        const TARGET_EMAIL = 'l.patterson@nodalpoint.io';
        const TARGET_UID = '4mKkyoZBIKhYGdPBNSHlNaHIfR02';
        const userEmail = email.toLowerCase();
        let finalUid: string | null = null;

        // Ensure Firebase Admin is ready
        if (!admin.apps.length) {
            console.error('Firebase Admin not initialized in callback');
            throw new Error('Server authentication service unavailable');
        }

        if (userEmail === TARGET_EMAIL.toLowerCase()) {
            console.log('Zoho OAuth: Admin match detected. Mapping to preserved identity.');
            finalUid = TARGET_UID;
        } else if (userEmail.endsWith('@nodalpoint.io')) {
            console.log(`Zoho OAuth: Nodal Point domain match: ${userEmail}`);
            try {
                // Check if user already exists in Firebase
                const userRecord = await admin.auth().getUserByEmail(userEmail);
                finalUid = userRecord.uid;
                console.log(`Zoho OAuth: Existing user found with UID: ${finalUid}`);
            } catch (error: any) {
                if (error.code === 'auth/user-not-found') {
                    // Create new user for Nodal Point employees
                    console.log(`Zoho OAuth: Creating new Firebase user for ${userEmail}`);
                    const newUser = await admin.auth().createUser({
                        email: userEmail,
                        emailVerified: true,
                        displayName: userEmail.split('@')[0], // Basic fallback name
                    });
                    finalUid = newUser.uid;
                } else {
                    console.error('Firebase Error during user lookup:', error);
                    throw error;
                }
            }
        } else {
            console.warn(`Zoho OAuth: Unauthorized domain attempt: ${userEmail}`);
            return NextResponse.redirect(new URL('/login?error=Only+Nodal+Point+emails+are+authorized', request.url));
        }

        if (!finalUid) {
            throw new Error('Could not resolve user identity');
        }

        // 4. Create Custom Token
        console.log(`Zoho OAuth: Minting custom token for UID: ${finalUid}`);
        const customToken = await admin.auth().createCustomToken(finalUid);

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
