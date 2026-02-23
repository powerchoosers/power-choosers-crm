/**
 * Power Choosers CRM - Avatar Hosting Handler
 * Fetches an external avatar URL (Zoho, Google, etc.) and hosts it on Imgur for stability.
 */

import { cors } from '../_cors.js';
import logger from '../_logger.js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
    },
};

export default async function handler(req, res) {
    logger.debug('[AvatarHost] Request received:', req.method);

    if (cors(req, res)) {
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        const { url, googlePhotoURL } = req.body || {};
        const photoURL = url || googlePhotoURL; // Support both for backward compatibility

        if (!photoURL) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No photo URL provided' }));
            return;
        }

        logger.debug('[AvatarHost] Fetching external photo:', photoURL);

        // Fetch the image from the external source
        const externalResponse = await fetch(photoURL);
        if (!externalResponse.ok) {
            throw new Error(`Failed to fetch external photo: ${externalResponse.statusText}`);
        }

        const buffer = await externalResponse.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');

        logger.debug('[AvatarHost] Uploading to Imgur...');

        // Imgur anonymous upload
        const imgurResponse = await fetch('https://api.imgur.com/3/image', {
            method: 'POST',
            headers: {
                'Authorization': 'Client-ID 546c25a59c58ad7',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: base64Image,
                type: 'base64',
                title: 'User Avatar'
            })
        });

        if (!imgurResponse.ok) {
            const errorText = await imgurResponse.text();
            logger.error('[AvatarHost] Imgur upload failed:', imgurResponse.status, errorText);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to upload image to hosting service' }));
            return;
        }

        const imgurResult = await imgurResponse.json();
        if (!imgurResult.success || !imgurResult.data?.link) {
            throw new Error('Image hosting service error');
        }

        const hostedUrl = imgurResult.data.link;
        logger.debug('[AvatarHost] Avatar hosted successfully:', hostedUrl);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            imageUrl: hostedUrl,
            url: hostedUrl
        }));

    } catch (error) {
        logger.error('[AvatarHost] Error:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Internal server error',
            message: error.message
        }));
    }
}
