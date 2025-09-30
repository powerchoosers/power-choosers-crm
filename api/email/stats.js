// Vercel API endpoint for email statistics
import { cors } from '../_cors';
import { admin, db } from '../_firebase';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { trackingId, _deliverability } = req.query;
    
    if (!trackingId) {
      return res.status(400).json({ error: 'Missing trackingId parameter' });
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
      console.log('[Email] Tracking disabled by settings, returning empty stats:', trackingId);
      return res.status(200).json({
        trackingId,
        openCount: 0,
        replyCount: 0,
        lastOpened: null,
        lastReplied: null,
        opens: [],
        replies: [],
        trackingDisabled: true
      });
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
          console.log('[Email] Email document not found:', trackingId);
        }
      } catch (firebaseError) {
        console.error('[Email] Firebase fetch error:', firebaseError);
        // Return default stats if Firebase fails
      }
    } else {
      console.warn('[Email] Firebase not available, returning default stats');
    }

    return res.status(200).json(stats);

  } catch (error) {
    console.error('[Email] Stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch email stats', message: error.message });
  }
}
