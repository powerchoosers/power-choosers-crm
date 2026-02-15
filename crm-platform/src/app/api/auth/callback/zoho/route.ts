
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin for persistent token storage and auth management
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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

        // Use raw origin to exactly match the request for Zoho's redirect_uri check
        const { origin } = new URL(request.url);
        const useOrigin = origin.replace(/\/$/, '');
        const redirectUriRaw = `${useOrigin}/api/auth/callback/zoho`.replace('http://', 'https://');
        const redirectUri = origin.includes('localhost') ? `${useOrigin}/api/auth/callback/zoho` : redirectUriRaw;

        if (!clientId || !clientSecret) {
            console.error('Zoho OAuth Callback: Missing environment variables');
            throw new Error('Configuration error: Missing Zoho credentials');
        }

        console.log('Zoho OAuth: Attempting token exchange...');
        // 1. Exchange code for tokens (with 10s timeout)
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
            signal: AbortSignal.timeout(10000)
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Zoho Token Exchange HTTP Error:', tokenResponse.status, errorText);
            throw new Error(`Token exchange failed (Status ${tokenResponse.status})`);
        }

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('Zoho Token Exchange Failure:', tokenData);
            throw new Error(`Token exchange failed: ${tokenData.error}`);
        }

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const idToken = tokenData.id_token;
        const expiresIn = tokenData.expires_in || 3600;

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
            const userResponse = await fetch('https://accounts.zoho.com/oauth/user/info', {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(5000)
            });

            if (!userResponse.ok) {
                console.warn('Zoho UserInfo API Error:', userResponse.status);
            } else {
                const userData = await userResponse.json();
                email = userData.Email || userData.email || userData.email_id || userData.principal_name;
            }
        }

        if (!email) {
            throw new Error('Could not retrieve email identity from Zoho');
        }

        const userEmail = email.toLowerCase().trim();

        // --- AUTHORIZATION CHECK ---
        // Allow nodalpoint.io domain or explicitly listed emails
        if (!userEmail.endsWith('@nodalpoint.io') && userEmail !== 'l.patterson@nodalpoint.io') {
            console.warn(`Zoho OAuth: Unauthorized domain attempt: ${userEmail}`);
            return NextResponse.redirect(new URL('/login?error=Only+Nodal+Point+emails+are+authorized', request.url));
        }

        // --- FETCH ZOHO ACCOUNT ID ---
        let zohoAccountId = null;
        try {
            console.log('Zoho OAuth: Fetching Zoho Mail Account ID...');
            const accountsRes = await fetch('https://mail.zoho.com/api/v1/accounts', {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                signal: AbortSignal.timeout(5000)
            });
            if (accountsRes.ok) {
                const accountsData = await accountsRes.json();
                zohoAccountId = accountsData.data?.[0]?.accountId || null;
            }
        } catch (accountErr) {
            console.error('Zoho OAuth: Error fetching accountId:', accountErr);
        }

        // Optimistically check public users table first (much faster than listUsers)
        const { data: publicUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', userEmail)
            .maybeSingle();

        let finalUid = publicUser?.id;

        if (finalUid) {
            console.log(`Zoho OAuth: Existing user resolved via DB: ${finalUid}`);
        } else {
            console.log(`Zoho OAuth: Resolving Supabase Auth identity for ${userEmail}`);
            // Fallback to auth lookup if not in public table
            const { data: { users: matchingAuths } } = await supabaseAdmin.auth.admin.listUsers();
            const existingAuth = matchingAuths?.find(u => u.email?.toLowerCase() === userEmail.toLowerCase());

            if (existingAuth) {
                finalUid = existingAuth.id;
            } else {
                console.log(`Zoho OAuth: Creating new Supabase user for ${userEmail}`);
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: userEmail,
                    email_confirm: true,
                    user_metadata: { full_name: userEmail.split('@')[0] }
                });
                if (createError) throw new Error(`Auth creation failed: ${createError.message}`);
                finalUid = newUser.user.id;
            }
        }

        // --- SYNC PROFILE & SAVE TOKENS ---
        console.log('Zoho OAuth: Updating profile and storing tokens...');
        const updatePayload: any = {
            zoho_access_token: accessToken,
            zoho_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        };

        if (refreshToken) {
            updatePayload.zoho_refresh_token = refreshToken;
        }

        if (zohoAccountId) {
            updatePayload.zoho_account_id = zohoAccountId;
        }

        const { error: upsertError } = await supabaseAdmin
            .from('users')
            .upsert({
                id: finalUid,
                email: userEmail,
                ...updatePayload
            }, { onConflict: 'id' });

        if (upsertError) {
            console.error('Supabase Error saving Zoho tokens to users table:', upsertError);
        }

        // --- SYNC TO ZOHO_CONNECTIONS (Used for sender management) ---
        console.log('Zoho OAuth: Syncing to zoho_connections...');
        const { error: connectionError } = await supabaseAdmin
            .from('zoho_connections')
            .upsert({
                user_id: finalUid,
                email: userEmail,
                access_token: accessToken,
                refresh_token: refreshToken || undefined,
                token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
                account_id: zohoAccountId,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, email' });

        if (connectionError) {
            console.warn('Supabase Error syncing to zoho_connections:', connectionError);
        }

        // --- GENERATE LOGIN SESSION ---
        // Instead of custom tokens, we use a Magick Link to create a real Supabase session
        console.log(`Zoho OAuth: Generating Supabase session link for UID: ${finalUid}`);

        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: userEmail,
            options: {
                redirectTo: `${useOrigin}/network`
            }
        });

        if (linkError || !linkData.properties?.action_link) {
            console.error('Supabase Session Link Error:', linkError);
            throw new Error('Failed to generate secure session link');
        }

        console.log('Zoho OAuth: Success. Redirecting to secure session link...');

        const actionLink = linkData.properties.action_link;
        const response = NextResponse.redirect(actionLink);

        // Ensure middleware cookie is set
        response.cookies.set('np_session', '1', {
            path: '/',
            httpOnly: false,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return response;

    } catch (err: any) {
        console.error('Zoho Auth Bridge Error:', err);
        const errorMessage = err.message || 'Authentication failed';
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url));
    }
}
