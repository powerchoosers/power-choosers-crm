// Vercel API endpoint for email tracking pixels
import { cors } from '../../_cors.js';
import { admin, db } from '../../_firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { trackingId, _deliverability } = req.query;
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    
    console.log('[Email] Tracking pixel hit:', { trackingId, userAgent, ip });

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

    // If tracking is disabled, return pixel but don't track
    if (!deliverabilitySettings.enableTracking) {
      console.log('[Email] Tracking disabled by settings, returning pixel without tracking:', trackingId);
      const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', pixel.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.writeHead(200, { 'Content-Type': 'image/gif' });
      res.end(pixel);
      return;
    }

    // Detect common image proxy user agents
    const ua = String(userAgent).toLowerCase();
    const isGoogleProxy = ua.includes('googleimageproxy');
    const isGenericProxy = isGoogleProxy || ua.includes('proxy');

    // Create a unique session key for this user/email combination
    const sessionKey = `${trackingId}_${ip}_${isGenericProxy ? 'proxy' : userAgent}`;
    
    // Initialize tracking sessions if not exists
    if (!global.emailTrackingSessions) {
      global.emailTrackingSessions = new Map();
    }
    
    // Check if this session has already been tracked recently
    const now = Date.now();
    // Proxies can hammer the pixel repeatedly; use a long window for proxies
    const windowMs = isGenericProxy ? (12 * 60 * 60 * 1000) : 5000; // 12h for proxies, 5s for real clients
    const windowStart = now - windowMs;
    
    const existingSession = global.emailTrackingSessions.get(sessionKey);
    if (existingSession && existingSession.lastTracked > windowStart) {
      console.log('[Email] Session already tracked recently, skipping:', trackingId);
      // Still return the pixel but don't create duplicate events
    } else {
      // Create new tracking event
      const openEvent = {
        trackingId,
        openedAt: new Date().toISOString(),
        userAgent,
        ip
      };

      
      // Store the session
      global.emailTrackingSessions.set(sessionKey, {
        lastTracked: now,
        openEvent
      });
      
      // Update Firebase database with tracking event
      if (db) {
        try {
          const emailRef = db.collection('emails').doc(trackingId);
          await emailRef.update({
            opens: admin.firestore.FieldValue.arrayUnion(openEvent),
            openCount: admin.firestore.FieldValue.increment(1),
            lastOpened: openEvent.openedAt,
            updatedAt: new Date().toISOString()
          });
        } catch (firebaseError) {
          console.error('[Email] Firebase update error:', firebaseError);
          // Continue to return pixel even if Firebase fails
        }
      } else {
      }
    }

    // Return a 1x1 transparent pixel with appropriate cache headers
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pixel.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Set cache headers based on proxy detection
    if (isGenericProxy) {
      // Encourage proxy to cache to avoid repeated refetches
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Expires', new Date(Date.now() + 3600000).toUTCString());
    } else {
      // For real user agents, avoid caching so a true reopen can refetch
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(pixel);
    return;

  } catch (error) {
    console.error('[Email] Track error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to track email', message: error.message }));
    return;
  }
}
