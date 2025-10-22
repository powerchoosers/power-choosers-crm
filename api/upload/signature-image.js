/**
 * Power Choosers CRM - Signature Image Upload Handler
 * Handles signature image uploads and returns hosted URLs
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
    // Expect JSON { image: <base64>, type: 'signature' }
    const { image, type } = req.body || {};

    if (!image) {
      return res.writeHead(400, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'No image provided' }));
return;
    }

    if (type !== 'signature') {
      return res.writeHead(400, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Invalid upload type' }));
return;
    }

    // Upload to Imgur
    const imgurResponse = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': 'Client-ID 546c25a59c58ad7', // Public Imgur client ID
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image, type: 'base64' })
    });

    if (!imgurResponse.ok) {
      console.error('[SignatureUpload] Imgur upload failed:', await imgurResponse.text());
      return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Failed to upload image to hosting service' }));
return;
    }

    const imgurResult = await imgurResponse.json();
    
    if (!imgurResult.success) {
      console.error('[SignatureUpload] Imgur API error:', imgurResult.data.error);
      return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Image hosting service error' }));
return;
    }

    const imageUrl = imgurResult.data.link;
    console.log('[SignatureUpload] Image uploaded successfully:', imageUrl);

    return res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({
      success: true,
      imageUrl: imageUrl,
      message: 'Signature image uploaded successfully'
    }));
return;

  } catch (error) {
    console.error('[SignatureUpload] Upload error:', error);
    return res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ 
      error: 'Internal server error', 
      message: error.message 
    }));
return;
  }
}
