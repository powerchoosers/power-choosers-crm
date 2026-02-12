// API endpoint for downloading Gmail attachments
import { cors } from '../_cors.js';
import logger from '../_logger.js';

const GMAIL_TOKEN_KEY = 'gmail_oauth_token';

export default async function handler(req, res) {
  logger.info(`[Gmail Attachment] Incoming request: ${req.method} ${req.url}`, 'attachment');
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    logger.warn(`[Gmail Attachment] Method not allowed: ${req.method}`, 'attachment');
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { messageId, attachmentId, accessToken } = req.body;
    logger.info(`[Gmail Attachment] Downloading attachment: messageId=${messageId}, attachmentId=${attachmentId}`, 'attachment');

    if (!messageId || !attachmentId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: messageId, attachmentId' }));
      return;
    }

    // Get access token from request body (passed from frontend)
    const token = accessToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing Gmail access token' }));
      return;
    }

    // Fetch attachment from Gmail API
    const attachmentUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
    const response = await fetch(attachmentUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      logger.error(`[Gmail Attachment] Gmail API error: ${response.status}`, 'attachment');
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Gmail API error: ${response.status}` }));
      return;
    }

    const data = await response.json();
    
    // Decode base64url data
    const base64Data = data.data.replace(/-/g, '+').replace(/_/g, '/');
    const buffer = Buffer.from(base64Data, 'base64');

    // Send the attachment as a binary response
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length
    });
    res.end(buffer);

    logger.info(`[Gmail Attachment] Successfully downloaded attachment`, 'attachment');
  } catch (error) {
    logger.error('[Gmail Attachment] Error:', error, 'attachment');
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error.message || 'Internal server error',
      details: error.details || null
    }));
  }
}
