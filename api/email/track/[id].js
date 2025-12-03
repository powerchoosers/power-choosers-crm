// Email open tracking pixel endpoint (Cloud Run API route)
// Returns a 1x1 transparent PNG and records an open event

import { db } from '../../_firebase.js';
import logger from '../../_logger.js';

// 1x1 transparent PNG (43 bytes)
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// Deduplication window (5 seconds) to prevent rapid duplicate opens
const DEDUP_WINDOW_MS = 5000;

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const { id } = req.query || {};
    const trackingId = String(id || '').trim();

    // Extract request metadata
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || 'unknown';
    const referer = req.headers.referer || '';

    // Detect device type
    const deviceType = detectDeviceType(userAgent);

    // Best-effort: record an open event if Firestore is available and id looks valid
    try {
      if (db && trackingId && trackingId.length > 0) {
        const ref = db.collection('emails').doc(trackingId);
        const snap = await ref.get();

        if (snap.exists) {
          const openedAt = new Date().toISOString();
          const currentData = snap.data() || {};
          const existingOpens = currentData.opens || [];

          // Deduplication: Check if same user/IP opened within last 5 seconds
          const userKey = `${userAgent}_${ip}`;
          const now = Date.now();
          const recentOpen = existingOpens.find(open => {
            const openTime = new Date(open.openedAt).getTime();
            return `${open.userAgent}_${open.ip}` === userKey && (now - openTime) < DEDUP_WINDOW_MS;
          });

          if (recentOpen) {
            logger.debug('[Email Track] Duplicate open ignored (within 5s window):', { trackingId });
          } else {
            // Create open event object
            const openEvent = {
              openedAt,
              userAgent,
              ip: maskIp(ip), // Mask IP for privacy
              deviceType,
              referer,
              isBotFlagged: deviceType === 'bot'
            };

            await ref.update({
              openCount: (currentData.openCount || 0) + 1,
              opens: existingOpens.concat([openEvent]),
              updatedAt: openedAt,
              lastOpened: openedAt,
              // Flag if this looks like a bot/proxy open
              ...(deviceType === 'bot' ? { botFlagged: true } : {})
            });

            logger.debug('[Email Track] Recorded open:', {
              trackingId,
              deviceType,
              openCount: (currentData.openCount || 0) + 1
            });
          }
        } else {
          logger.debug('[Email Track] Document not found:', { trackingId });
        }
      }
    } catch (error) {
      // Log error but don't block pixel - tracking is best-effort
      logger.error('[Email Track] Error recording open event:', error.message || error);
    }

    // Return pixel with cache-busting headers to ensure each open is tracked
    // Note: Some email clients (Gmail) may cache, but we handle dedup server-side
    setPixelHeaders(res);
    res.end(PIXEL);

  } catch (error) {
    // Always return pixel even on error - tracking failures shouldn't break email rendering
    logger.error('[Email Track] Unexpected error:', error.message || error);
    try {
      setPixelHeaders(res);
      res.end(PIXEL);
    } catch (sendError) {
      // Last resort - try to send pixel without headers
      try {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(PIXEL);
      } catch (finalError) {
        // If all else fails, send minimal response
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('');
      }
    }
  }
}

/**
 * Set response headers for tracking pixel
 * Uses no-cache to ensure each email open triggers a request
 */
function setPixelHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': PIXEL.length,
    'X-Content-Type-Options': 'nosniff',
    // Prevent caching to ensure opens are tracked
    'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
}

/**
 * Detect device type from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} Device type
 */
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  // Check for bots/proxies first (Gmail Image Proxy, etc.)
  if (/bot|crawler|spider|googleimageproxy|feedfetcher|slurp|yahoo|bing|baidu/i.test(ua)) {
    return 'bot';
  }
  if (/mobile|android|iphone|phone|webos|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'mobile';
  }
  if (/tablet|ipad/i.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Mask IP address for privacy (keep first 2 octets for geolocation)
 * @param {string} ip - Full IP address
 * @returns {string} Masked IP address
 */
function maskIp(ip) {
  if (!ip || ip === 'unknown') return 'unknown';

  // IPv4: mask last 2 octets
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`;
    }
  }

  // IPv6: mask last half
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length > 4) {
      return parts.slice(0, 4).join(':') + ':****';
    }
  }

  return ip.substring(0, 10) + '***';
}
