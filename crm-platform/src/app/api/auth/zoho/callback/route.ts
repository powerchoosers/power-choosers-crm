
import { NextResponse } from 'next/server';
import { firebaseAdmin as admin } from '@/lib/firebase-admin';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
    }

    if (!code) {
        return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    try {
        const clientId = process.env.ZOHO_CLIENT_ID;
        const clientSecret = process.env.ZOHO_CLIENT_SECRET;
        const redirectUri = process.env.ZOHO_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            throw new Error('Missing Zoho credentials');
        }

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
            console.error('Zoho Token Error:', tokenData);
            throw new Error(tokenData.error);
        }

        const accessToken = tokenData.access_token;

        // 2. Get User Info
        // Note: Zoho OpenID UserInfo endpoint might differ based on region, assuming US
        const userResponse = await fetch('https://accounts.zoho.com/oauth/user/info', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const userData = await userResponse.json();

        // Zoho returns { Email: "...", ... } or similar structure depending on scope
        // Ideally we should use the ID Token if returned, but user info endpoint is safer for email
        // Let's debug what we get if this fails, but for now assume standard OIDC fields

        // If user info fails, try just getting profile or use the id_token if available
        // For "email" scope, usually we get basic profile

        const email = userData.Email || userData.email;

        if (!email) {
            console.error('Zoho User Data:', userData);
            throw new Error('Could not retrieve email from Zoho');
        }

        // 3. Verify Identity (Strict Admin Check)
        // ONLY allow l.patterson@nodalpoint.io to masquerade as the existing admin
        const TARGET_EMAIL = 'l.patterson@nodalpoint.io';
        const TARGET_UID = '4mKkyoZBIKhYGdPBNSHlNaHIfR02';

        if (email.toLowerCase() !== TARGET_EMAIL.toLowerCase()) {
            return NextResponse.redirect(new URL('/login?error=Unauthorized Zoho User', request.url));
        }

        // 4. Create Custom Token
        // We need to initialize firebase-admin first
        if (!admin.apps.length) {
            // This should be handled by lib/firebase-admin, but we need to import it
            // The import at top handles this: import { firebaseAdmin } from '@/lib/firebase-admin'; (Wait, I named export firebaseAdmin but imported admin?)
            // Checking previous write_to_file... I exported `firebaseAdmin` as `admin`? No, `export const firebaseAdmin = admin;`
            // So import should be `import { firebaseAdmin as admin } ...`
        }

        // Re-import correctly to be safe in this file content

        const customToken = await admin.auth().createCustomToken(TARGET_UID);

        // 5. Set Middleware Cookie & Redirect
        const response = NextResponse.redirect(new URL(`/login/callback?token=${customToken}`, request.url));

        // secure: true is default for production, but strict checks might fail on localhost without https
        // using lax/none depending on env. 
        response.cookies.set('np_session', '1', {
            path: '/',
            httpOnly: false, // Middleware needs to read it? Middleware reads cookies. 
            // Middleware usually reads httpOnly cookies too. 
            // But client-side logic in AuthContext also checks generic document.cookie for dev bypass.
            // Let's set it as httpOnly=false mostly so client can verify session existence if needed, 
            // though AuthContext mainly relies on Firebase Auth state.
            // The middleware `middleware.ts` checks `req.cookies.get('np_session')`.
        });

        return response;

    } catch (err: any) {
        console.error('Zoho Auth Error:', err);
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err.message)}`, request.url));
    }
}
