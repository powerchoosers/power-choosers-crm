/**
 * Power Choosers CRM - Signature Image Upload Handler
 * Handles signature image uploads and returns hosted URLs
 */

import { cors } from '../_cors.js';
import logger from '../_logger.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increased for featured images which may be larger
    },
  },
};

export default async function handler(req, res) {
  logger.debug('[SignatureUpload] Request received:', req.method);
  
  if (cors(req, res)) {
    logger.debug('[SignatureUpload] CORS preflight handled');
    return;
  }

  if (req.method !== 'POST') {
    logger.debug('[SignatureUpload] Invalid method:', req.method);
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    logger.debug('[SignatureUpload] Parsing request body...');
    // Expect JSON { image: <base64>, type: 'signature' }
    const { image, type } = req.body || {};
    logger.debug('[SignatureUpload] Request body parsed:', {
      hasImage: !!image,
      imageLength: image?.length || 0,
      type: type
    });

    if (!image) {
      logger.debug('[SignatureUpload] No image provided');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No image provided' }));
      return;
    }

    // Accept signature, post-image, or featured-image types
    const validTypes = ['signature', 'post-image', 'featured-image'];
    if (!validTypes.includes(type)) {
      logger.debug('[SignatureUpload] Invalid type:', type);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid upload type. Must be one of: ' + validTypes.join(', ') }));
      return;
    }

    // Upload to Imgur with timeout
    logger.debug('[SignatureUpload] Uploading to Imgur...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn('[SignatureUpload] Imgur request timed out after 25 seconds');
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
      logger.debug('[SignatureUpload] Imgur response status:', imgurResponse.status);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      logger.error('[SignatureUpload] Imgur fetch error:', fetchError.name, fetchError.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Failed to upload image to hosting service',
        details: fetchError.message 
      }));
      return;
    }

    if (!imgurResponse.ok) {
      const errorText = await imgurResponse.text();
      logger.error('[SignatureUpload] Imgur upload failed:', imgurResponse.status, errorText);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to upload image to hosting service' }));
      return;
    }

    const imgurResult = await imgurResponse.json();
    logger.debug('[SignatureUpload] Imgur result:', {
      success: imgurResult.success,
      hasData: !!imgurResult.data,
      hasLink: !!imgurResult.data?.link
    });
    
    if (!imgurResult.success || !imgurResult.data?.link) {
      logger.error('[SignatureUpload] Imgur API error:', imgurResult.data?.error || 'No link in response');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image hosting service error' }));
      return;
    }

    const imageUrl = imgurResult.data.link;
    logger.debug('[SignatureUpload] Image uploaded successfully:', imageUrl);

    const responsePayload = {
      success: true,
      imageUrl: imageUrl,
      message: 'Signature image uploaded successfully'
    };
    
    logger.debug('[SignatureUpload] Sending response:', responsePayload);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responsePayload));
    logger.debug('[SignatureUpload] Response sent successfully');
    return;

  } catch (error) {
    logger.error('[SignatureUpload] Upload error:', error.name, error.message);
    logger.error('[SignatureUpload] Error stack:', error.stack);
    
    const errorPayload = { 
      error: 'Internal server error', 
      message: error.message 
    };
    
    logger.debug('[SignatureUpload] Sending error response:', errorPayload);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorPayload));
    logger.debug('[SignatureUpload] Error response sent');
    return;
  }
}

