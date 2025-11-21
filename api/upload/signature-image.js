/**
 * Power Choosers CRM - Signature Image Upload Handler
 * Handles signature image uploads and returns hosted URLs
 */

import { cors } from '../_cors.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increased for featured images which may be larger
    },
  },
};

export default async function handler(req, res) {
  console.log('[SignatureUpload] Request received:', req.method);
  
  if (cors(req, res)) {
    console.log('[SignatureUpload] CORS preflight handled');
    return;
  }

  if (req.method !== 'POST') {
    console.log('[SignatureUpload] Invalid method:', req.method);
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    console.log('[SignatureUpload] Parsing request body...');
    // Expect JSON { image: <base64>, type: 'signature' }
    const { image, type } = req.body || {};
    console.log('[SignatureUpload] Request body parsed:', {
      hasImage: !!image,
      imageLength: image?.length || 0,
      type: type
    });

    if (!image) {
      console.log('[SignatureUpload] No image provided');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No image provided' }));
      return;
    }

    // Accept signature, post-image, or featured-image types
    const validTypes = ['signature', 'post-image', 'featured-image'];
    if (!validTypes.includes(type)) {
      console.log('[SignatureUpload] Invalid type:', type);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid upload type. Must be one of: ' + validTypes.join(', ') }));
      return;
    }

    // Upload to Imgur with timeout
    console.log('[SignatureUpload] Uploading to Imgur...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('[SignatureUpload] Imgur request timed out after 25 seconds');
      controller.abort();
    }, 25000); // 25 second timeout for Imgur
    
    let imgurResponse;
    try {
      imgurResponse = await fetch('https://api.imgur.com/3/image', {
        method: 'POST',
        headers: {
          'Authorization': 'Client-ID 546c25a59c58ad7', // Public Imgur client ID
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image, type: 'base64' }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      console.log('[SignatureUpload] Imgur response status:', imgurResponse.status);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('[SignatureUpload] Imgur fetch error:', fetchError.name, fetchError.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to upload image to hosting service',
        details: fetchError.message 
      }));
      return;
    }

    if (!imgurResponse.ok) {
      const errorText = await imgurResponse.text();
      console.error('[SignatureUpload] Imgur upload failed:', imgurResponse.status, errorText);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to upload image to hosting service' }));
      return;
    }

    const imgurResult = await imgurResponse.json();
    console.log('[SignatureUpload] Imgur result:', {
      success: imgurResult.success,
      hasData: !!imgurResult.data,
      hasLink: !!imgurResult.data?.link
    });
    
    if (!imgurResult.success || !imgurResult.data?.link) {
      console.error('[SignatureUpload] Imgur API error:', imgurResult.data?.error || 'No link in response');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image hosting service error' }));
      return;
    }

    const imageUrl = imgurResult.data.link;
    console.log('[SignatureUpload] Image uploaded successfully:', imageUrl);

    const responsePayload = {
      success: true,
      imageUrl: imageUrl,
      message: 'Signature image uploaded successfully'
    };
    
    console.log('[SignatureUpload] Sending response:', responsePayload);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responsePayload));
    console.log('[SignatureUpload] Response sent successfully');
    return;

  } catch (error) {
    console.error('[SignatureUpload] Upload error:', error.name, error.message);
    console.error('[SignatureUpload] Error stack:', error.stack);
    
    const errorPayload = { 
      error: 'Internal server error', 
      message: error.message 
    };
    
    console.log('[SignatureUpload] Sending error response:', errorPayload);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorPayload));
    console.log('[SignatureUpload] Error response sent');
    return;
  }
}

