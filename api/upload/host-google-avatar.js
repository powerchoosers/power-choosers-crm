/**
 * Power Choosers CRM - Google Avatar Hosting Handler
 * Downloads Google profile photos server-side and re-hosts to Imgur
 */

import { cors } from '../_cors.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.writeHead(405, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Method not allowed' }));
return;
  }

  try {
    const { googlePhotoURL } = req.body || {};

    if (!googlePhotoURL) {
      return res.writeHead(400, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'No Google photo URL provided' }));
return;
    }

    // Validate it's a Google URL
    if (!googlePhotoURL.includes('googleusercontent.com') && !googlePhotoURL.includes('ggpht.com')) {
      return res.writeHead(400, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Invalid Google photo URL' }));
return;
    }

    // Download the image from Google (server-side, no CORS issues)
    console.log('[GoogleAvatar] Downloading from Google...');
    const googleResponse = await fetch(googlePhotoURL);
    
    if (!googleResponse.ok) {
      console.error('[GoogleAvatar] Failed to download from Google:', googleResponse.status);
      return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Failed to download Google photo' }));
return;
    }

    // Convert to base64
    const buffer = await googleResponse.arrayBuffer();
    const base64Image = Buffer.from(buffer).toString('base64');

    // Upload to Imgur
    console.log('[GoogleAvatar] Uploading to Imgur...');
    const imgurResponse = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': 'Client-ID 546c25a59c58ad7',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: base64Image, type: 'base64' })
    });

    if (!imgurResponse.ok) {
      console.error('[GoogleAvatar] Imgur upload failed:', await imgurResponse.text());
      return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Failed to upload to hosting service' }));
return;
    }

    const imgurResult = await imgurResponse.json();
    
    if (!imgurResult.success) {
      console.error('[GoogleAvatar] Imgur API error:', imgurResult.data.error);
      return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Image hosting service error' }));
return;
    }

    const imageUrl = imgurResult.data.link;
    console.log('[GoogleAvatar] Avatar hosted successfully:', imageUrl);

    return res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({
      success: true,
      imageUrl: imageUrl,
      message: 'Google avatar hosted successfully'
    }));
return;

  } catch (error) {
    console.error('[GoogleAvatar] Error:', error);
    return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ 
      error: 'Internal server error', 
      message: error.message 
    }));
return;
  }
}

