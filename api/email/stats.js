// Vercel API endpoint for email statistics
import { cors } from '../_cors.js';
import { admin, db } from '../_firebase.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { trackingId, _deliverability } = req.query;
    
    if (!trackingId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing trackingId parameter' }));
      return;
    }

    // Get deliverability settings (default to enabled if not provided)
    const deliverabilitySettings = _deliverability ? JSON.parse(_deliverability) : {
      enableTracking: true,
      includeBulkHeaders: false,
      includeListUnsubscribe: false,
      includePriorityHeaders: false,
      forceGmailOnly: true,
      useBrandedHtmlTemplate: false,
      signatureImageEnabled: true
    };

    // If tracking is disabled, return empty stats
    if (!deliverabilitySettings.enableTracking) {
      logger.log('[Email] Tracking disabled by settings, returning empty stats:', trackingId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        trackingId,
        openCount: 0,
        replyCount: 0,
        lastOpened: null,
        lastReplied: null,
        opens: [],
        replies: [],
        trackingDisabled: true
      }));
    }

    // Fetch email stats from Firebase if available
    let stats = {
      trackingId,
      openCount: 0,
      replyCount: 0,
      lastOpened: null,
      lastReplied: null,
      opens: [],
      replies: []
    };

    if (db) {
      try {
        const emailDoc = await db.collection('emails').doc(trackingId).get();
        if (emailDoc.exists) {
          const emailData = emailDoc.data();
          stats = {
            trackingId,
            openCount: emailData.openCount || 0,
            replyCount: emailData.replyCount || 0,
            lastOpened: emailData.lastOpened || null,
            lastReplied: emailData.lastReplied || null,
            opens: emailData.opens || [],
            replies: emailData.replies || [],
            status: emailData.status || 'unknown',
            sentAt: emailData.sentAt || null,
            subject: emailData.subject || '',
            to: emailData.to || []
          };
        } else {
          logger.log('[Email] Email document not found:', trackingId);
        }
      } catch (firebaseError) {
        logger.error('[Email] Firebase fetch error:', firebaseError);
        // Return default stats if Firebase fails
      }
    } else {
      logger.warn('[Email] Firebase not available, returning default stats');
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;

  } catch (error) {
    logger.error('[Email] Stats error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch email stats', message: error.message }));
    return;
  }
}
