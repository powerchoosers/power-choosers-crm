/**
 * Power Choosers CRM - Google Avatar Hosting Handler
 * Downloads Google profile photos server-side and re-hosts to Imgur
 */

import { cors } from '../_cors.js';
import logger from '../_logger.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (cors(req, res)) return;

  // Set CORS headers for all responses (cors() already did this, but ensure they persist)
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://powerchoosers.com',
    'https://www.powerchoosers.com',
    'https://nodalpoint.io'
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Vary', 'Origin');

  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { googlePhotoURL } = req.body || {};

    if (!googlePhotoURL) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'No Google photo URL provided' }));
      return;
    }

    // Validate it's a Google URL
    if (!googlePhotoURL.includes('googleusercontent.com') && !googlePhotoURL.includes('ggpht.com')) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid Google photo URL' }));
      return;
    }

    // Download the image from Google (server-side, no CORS issues)
    logger.log('[GoogleAvatar] Downloading from Google...');
    const googleResponse = await fetch(googlePhotoURL);
    
    if (!googleResponse.ok) {
      logger.error('[GoogleAvatar] Failed to download from Google:', googleResponse.status);
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to download Google photo' }));
      return;
    }

    // Convert to base64
    const buffer = await googleResponse.arrayBuffer();
    const base64Image = Buffer.from(buffer).toString('base64');

    // Upload to Imgur
    logger.log('[GoogleAvatar] Uploading to Imgur...');
    const imgurResponse = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': 'Client-ID 546c25a59c58ad7',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: base64Image, type: 'base64' })
    });

    if (!imgurResponse.ok) {
      const errorText = await imgurResponse.text().catch(() => 'Unknown error');
      logger.error('[GoogleAvatar] Imgur upload failed:', errorText);
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to upload to hosting service' }));
      return;
    }

    const imgurResult = await imgurResponse.json();
    
    if (!imgurResult.success) {
      logger.error('[GoogleAvatar] Imgur API error:', imgurResult.data?.error || 'Unknown error');
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Image hosting service error' }));
      return;
    }

    const imageUrl = imgurResult.data.link;
    logger.log('[GoogleAvatar] Avatar hosted successfully:', imageUrl);

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      imageUrl: imageUrl,
      message: 'Google avatar hosted successfully'
    }));
    return;

  } catch (error) {
    logger.error('[GoogleAvatar] Error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(500);
    res.end(JSON.stringify({ 
      error: 'Internal server error', 
      message: error.message 
    }));
    return;
  }
}

