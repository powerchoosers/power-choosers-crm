import { cors } from '../../_cors.js';
import logger from '../../_logger.js';
import { getValidAccessTokenForUser } from '../../email/zoho-token-manager.js';
import { createClient } from '@supabase/supabase-js';

const supabaseTokenAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
    logger.debug('[ZohoAvatarSync] Request received:', req.method, 'zoho-avatar');

    if (cors(req, res)) {
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        const { email } = req.body || {};
        
        if (!email) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email is required' }));
            return;
        }

        logger.debug(`[ZohoAvatarSync] Processing for ${email}`, 'zoho-avatar');

        // 1. Fetch Zoho Access Token
        let accessToken;
        try {
            const tokenCache = await getValidAccessTokenForUser(email);
            accessToken = tokenCache.accessToken;
        } catch (e) {
            logger.error(`[ZohoAvatarSync] No Zoho token available for ${email}`, 'zoho-avatar');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No Zoho credentials available' }));
            return;
        }

        // 2. Fetch Zoho UserInfo (OIDC endpoint for master profile)
        const userInfoResp = await fetch('https://accounts.zoho.com/oauth/v2/userinfo', {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });
        
        if (!userInfoResp.ok) {
            throw new Error(`Failed to fetch userinfo from Zoho API: ${userInfoResp.status}`);
        }

        const userInfo = await userInfoResp.json();
        const pictureUrl = userInfo.picture;

        if (!pictureUrl) {
            throw new Error(`No picture URL found in Zoho profile for ${email}`);
        }

        // Fetch the actual image blob using the authenticated picture URL
        const photoResp = await fetch(pictureUrl, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });

        if (!photoResp.ok) {
            throw new Error(`Failed to download profile picture: ${photoResp.status}`);
        }

        // Validate not empty
        const buffer = Buffer.from(await photoResp.arrayBuffer());
        if (buffer.length < 5000) {
            // Usually the default silhouette is around 2.8KB from contacts, but OIDC might just not return one
            logger.warn(`[ZohoAvatarSync] Image size is suspiciously small (${buffer.length} bytes), might be a placeholder.`, 'zoho-avatar');
        }

        const base64Image = buffer.toString('base64');

        // 3. Upload to Imgur
        logger.debug(`[ZohoAvatarSync] Uploading to Imgur...`, 'zoho-avatar');
        const imgurResponse = await fetch('https://api.imgur.com/3/image', {
            method: 'POST',
            headers: {
                'Authorization': 'Client-ID 546c25a59c58ad7',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: base64Image,
                type: 'base64',
                title: 'User Avatar (Zoho Sync)'
            })
        });

        if (!imgurResponse.ok) {
            const err = await imgurResponse.text();
            throw new Error(`Imgur upload failed: ${err}`);
        }

        const imgurResult = await imgurResponse.json();
        const hostedUrl = imgurResult.data.link;

        if (!hostedUrl) {
            throw new Error('No hosted URL returned from Imgur');
        }

        // 4. Update Database
        logger.debug(`[ZohoAvatarSync] DB updated with URL: ${hostedUrl}`, 'zoho-avatar');
        const { error } = await supabaseTokenAdmin
            .from('users')
            .update({ 
                hosted_photo_url: hostedUrl,
                updated_at: new Date().toISOString()
            })
            .eq('email', email);

        if (error) {
            throw new Error(`Failed to update user profile in DB: ${error.message}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            imageUrl: hostedUrl
        }));

    } catch (error) {
        logger.error('[ZohoAvatarSync] Error:', error.message, 'zoho-avatar');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Internal server error',
            message: error.message
        }));
    }
}
