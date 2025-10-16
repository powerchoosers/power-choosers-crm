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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Expect JSON { image: <base64>, type: 'signature' }
    const { image, type } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    if (type !== 'signature') {
      return res.status(400).json({ error: 'Invalid upload type' });
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
      return res.status(500).json({ error: 'Failed to upload image to hosting service' });
    }

    const imgurResult = await imgurResponse.json();
    
    if (!imgurResult.success) {
      console.error('[SignatureUpload] Imgur API error:', imgurResult.data.error);
      return res.status(500).json({ error: 'Image hosting service error' });
    }

    const imageUrl = imgurResult.data.link;
    console.log('[SignatureUpload] Image uploaded successfully:', imageUrl);

    return res.status(200).json({
      success: true,
      imageUrl: imageUrl,
      message: 'Signature image uploaded successfully'
    });

  } catch (error) {
    console.error('[SignatureUpload] Upload error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}
