
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

        // CANONICAL REDIRECT URI LOGIC
        // To prevent mismatches between login (frontend) and callback (backend),
        // we force the canonical 'www.nodalpoint.io' URI for all production requests.
        const host = request.headers.get('host') || 'www.nodalpoint.io';
        const isLocal = host.includes('localhost');
        const redirectUri = isLocal
            ? 'http://localhost:3000/api/auth/callback/zoho'
            : 'https://www.nodalpoint.io/api/auth/callback/zoho';

        console.log(`Zoho OAuth Callback: Host header: ${host}`);
        console.log(`Zoho OAuth Callback: Using dynamic redirect URI: ${redirectUri}`);

        if (!clientId || !clientSecret) {
            console.error('Zoho OAuth Callback: Missing environment variables');
            throw new Error('Configuration error: Missing Zoho credentials');
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
            })
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
                headers: { Authorization: `Bearer ${accessToken}` }
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
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
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
                // FORCE explicit production redirection
                // If we are on localhost, go to localhost. 
                // If we are ANYWHERE else (nodalpoint.io, www.nodalpoint.io), go to https://www.nodalpoint.io/network
                redirectTo: host.includes('localhost')
                    ? 'http://localhost:3000/network'
                    : 'https://www.nodalpoint.io/network'
            }
        });

        if (linkError || !linkData.properties?.action_link) {
            console.error('Supabase Session Link Error:', linkError);
            throw new Error('Failed to generate secure session link');
        }

        const actionLink = linkData.properties.action_link;

        // FINAL HAND-OFF: Premium Transition
        console.log(`Zoho OAuth: Themed hand-off to: ${actionLink.split('?')[0]}...`);

        // Wildcard domain cookie for maximal persistence
        const isProd = !redirectUri.includes('localhost');
        const domainSuffix = isProd ? '; Domain=.nodalpoint.io' : '';
        const cookieOptions = `np_session=1; Path=/; Max-Age=604800; SameSite=Lax${domainSuffix}${isProd ? '; Secure' : ''}`;

        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', 'text/html');
        responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        responseHeaders.append('Set-Cookie', cookieOptions);

        return new Response(`
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Nodal Point Identity</title>
                    <style>
                        body { 
                            background: #0a0a0a; 
                            color: #71717a; 
                            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            height: 100vh; 
                            margin: 0; 
                            overflow: hidden;
                        }
                        .container { text-align: center; }
                        .loader { 
                            width: 24px; 
                            height: 24px; 
                            border: 1px solid rgba(255,255,255,0.05); 
                            border-top-color: #002FA7; 
                            border-radius: 50%; 
                            animation: spin 0.6s cubic-bezier(0.23, 1, 0.32, 1) infinite; 
                            margin: 0 auto 24px;
                        }
                        .status { 
                            font-size: 10px; 
                            letter-spacing: 0.3em; 
                            text-transform: uppercase; 
                            font-weight: 500;
                            animation: pulse 2s ease-in-out infinite;
                        }
                        @keyframes spin { to { transform: rotate(360deg); } }
                        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="loader"></div>
                        <div class="status">Identity_Verifying // Accessing_Forensic_Deck</div>
                    </div>
                    <script>
                        // Visual delay for premium feel, then auto-navigate
                        setTimeout(function() {
                            window.location.replace("${actionLink}");
                        }, 800);
                    </script>
                </body>
            </html>
        `, {
            status: 200,
            headers: responseHeaders
        });

    } catch (error: any) {
        console.error('Zoho Auth Bridge Error:', error);
        const errorMessage = encodeURIComponent(error.message || 'Authentication failed');
        const originUrl = new URL(request.url);
        return NextResponse.redirect(new URL(`/login?error=${errorMessage}`, originUrl.origin));
    }
}
