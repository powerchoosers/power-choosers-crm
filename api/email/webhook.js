// Vercel API endpoint for email webhooks
import { cors } from '../_cors.js';
import { admin, db } from '../_firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { event, trackingId, data, _deliverability } = req.body;

    // Webhook received

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
      // Tracking disabled
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Tracking disabled' }));
      return;
    }

    // Handle different webhook events
    switch (event) {
      case 'email_opened':
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
          } catch (firebaseError) {
            console.error('[Email] Firebase update error:', firebaseError);
          }
        }
        break;
      case 'email_replied':
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
          } catch (firebaseError) {
            console.error('[Email] Firebase update error:', firebaseError);
          }
        }
        break;
      case 'email_bounced':
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
          } catch (firebaseError) {
            console.error('[Email] Firebase update error:', firebaseError);
          }
        }
        break;
      default:
        // Unknown event
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;

  } catch (error) {
    console.error('[Email] Webhook error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process webhook', message: error.message }));
    return;
  }
}
