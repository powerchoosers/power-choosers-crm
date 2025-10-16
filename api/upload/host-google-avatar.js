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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { googlePhotoURL } = req.body || {};

    if (!googlePhotoURL) {
      return res.status(400).json({ error: 'No Google photo URL provided' });
    }

    // Validate it's a Google URL
    if (!googlePhotoURL.includes('googleusercontent.com') && !googlePhotoURL.includes('ggpht.com')) {
      return res.status(400).json({ error: 'Invalid Google photo URL' });
    }

    // Download the image from Google (server-side, no CORS issues)
    console.log('[GoogleAvatar] Downloading from Google...');
    const googleResponse = await fetch(googlePhotoURL);
    
    if (!googleResponse.ok) {
      console.error('[GoogleAvatar] Failed to download from Google:', googleResponse.status);
      return res.status(500).json({ error: 'Failed to download Google photo' });
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
      return res.status(500).json({ error: 'Failed to upload to hosting service' });
    }

    const imgurResult = await imgurResponse.json();
    
    if (!imgurResult.success) {
      console.error('[GoogleAvatar] Imgur API error:', imgurResult.data.error);
      return res.status(500).json({ error: 'Image hosting service error' });
    }

    const imageUrl = imgurResult.data.link;
    console.log('[GoogleAvatar] Avatar hosted successfully:', imageUrl);

    return res.status(200).json({
      success: true,
      imageUrl: imageUrl,
      message: 'Google avatar hosted successfully'
    });

  } catch (error) {
    console.error('[GoogleAvatar] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}

