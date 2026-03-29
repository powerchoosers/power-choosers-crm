import { cors } from '../../../_cors.js';
import logger from '../../../_logger.js';
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

        // 2. Fetch Zoho Thumbnail
        const photoResp = await fetch('https://contacts.zoho.com/file?fs=thumb', {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });
        
        if (!photoResp.ok) {
            throw new Error(`Failed to fetch photo from Zoho API: ${photoResp.status}`);
        }

        // Validate not empty
        const buffer = Buffer.from(await photoResp.arrayBuffer());
        if (buffer.length < 100) {
            throw new Error(`Photo response too small to be valid (${buffer.length} bytes)`);
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
