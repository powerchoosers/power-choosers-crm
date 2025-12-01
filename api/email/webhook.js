// Vercel API endpoint for email webhooks
import { cors } from '../_cors.js';
import { admin, db } from '../_firebase.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { event, trackingId, data, _deliverability } = req.body;

    logger.log('[Email] Webhook received:', { event, trackingId, data });

    // Get deliverability settings (default to enabled if not provided)
    const deliverabilitySettings = _deliverability || {
      enableTracking: true,
      includeBulkHeaders: false,
      includeListUnsubscribe: false,
      includePriorityHeaders: false,
      forceGmailOnly: true,
      useBrandedHtmlTemplate: false,
      signatureImageEnabled: true
    };

    // If tracking is disabled, don't process webhook events
    if (!deliverabilitySettings.enableTracking) {
      logger.log('[Email] Tracking disabled by settings, ignoring webhook:', trackingId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Tracking disabled' }));
      return;
    }

    // Handle different webhook events
    switch (event) {
      case 'email_opened':
        logger.log('[Email] Email opened:', trackingId);
        // Update database with open event if Firebase is available
        if (db) {
          try {
            const emailRef = db.collection('emails').doc(trackingId);
            await emailRef.update({
              opens: admin.firestore.FieldValue.arrayUnion({
                openedAt: new Date().toISOString(),
                userAgent: data?.userAgent || '',
                ip: data?.ip || '',
                referer: data?.referer || ''
              }),
              openCount: admin.firestore.FieldValue.increment(1),
              lastOpened: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            logger.log('[Email] Successfully updated Firebase with open event');
          } catch (firebaseError) {
            logger.error('[Email] Firebase update error:', firebaseError);
          }
        }
        break;
      case 'email_replied':
        logger.log('[Email] Email replied:', trackingId);
        // Update database with reply event if Firebase is available
        if (db) {
          try {
            const emailRef = db.collection('emails').doc(trackingId);
            await emailRef.update({
              replies: admin.firestore.FieldValue.arrayUnion({
                repliedAt: new Date().toISOString(),
                replyContent: data?.content || '',
                from: data?.from || ''
              }),
              replyCount: admin.firestore.FieldValue.increment(1),
              lastReplied: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            logger.log('[Email] Successfully updated Firebase with reply event');
          } catch (firebaseError) {
            logger.error('[Email] Firebase update error:', firebaseError);
          }
        }
        break;
      case 'email_bounced':
        logger.log('[Email] Email bounced:', trackingId);
        // Update database with bounce event if Firebase is available
        if (db) {
          try {
            const emailRef = db.collection('emails').doc(trackingId);
            await emailRef.update({
              status: 'bounced',
              bounceReason: data?.reason || 'Unknown',
              bouncedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            logger.log('[Email] Successfully updated Firebase with bounce event');
          } catch (firebaseError) {
            logger.error('[Email] Firebase update error:', firebaseError);
          }
        }
        break;
      default:
        logger.log('[Email] Unknown webhook event:', event);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;

  } catch (error) {
    logger.error('[Email] Webhook error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process webhook', message: error.message }));
    return;
  }
}
