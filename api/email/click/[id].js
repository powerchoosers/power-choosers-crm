// Email click tracking endpoint (Cloud Run API route)
// Redirects to original URL after recording click event

import { db } from '../../_firebase.js';
import logger from '../../_logger.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const { id } = req.query || {};
    const trackingId = String(id || '').trim();
    const originalUrl = req.query?.url ? decodeURIComponent(req.query.url) : null;
    const linkIndex = parseInt(req.query?.idx || '0', 10);

    // Extract request metadata
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || 'unknown';
    const referer = req.headers.referer || '';

    // Validate we have a URL to redirect to
    if (!originalUrl) {
      logger.warn('[Email Click] Missing redirect URL:', { trackingId });
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing redirect URL');
      return;
    }

    // Best-effort: record click event if Firestore is available
    try {
      if (db && trackingId && trackingId.length > 0) {
        const ref = db.collection('emails').doc(trackingId);
        const snap = await ref.get();

        if (snap.exists) {
          const clickedAt = new Date().toISOString();
          const currentData = snap.data() || {};

          // Detect device type from user agent
          const deviceType = detectDeviceType(userAgent);

          // Create click event object
          const clickEvent = {
            clickedAt,
            url: originalUrl,
            linkIndex,
            userAgent,
            ip: maskIp(ip), // Mask IP for privacy
            deviceType,
            referer
          };

          await ref.update({
            clickCount: (currentData.clickCount || 0) + 1,
            clicks: (currentData.clicks || []).concat([clickEvent]),
            updatedAt: clickedAt,
            lastClicked: clickedAt
          });

          logger.debug('[Email Click] Recorded click:', {
            trackingId,
            url: originalUrl.substring(0, 50) + '...',
            deviceType
          });
        }
      }
    } catch (error) {
      // Log error but don't block redirect - tracking is best-effort
      logger.error('[Email Click] Error recording click event:', error.message || error);
    }

    // Always redirect to original URL (even if tracking fails)
    // Use 302 (temporary redirect) to allow tracking on repeat clicks
    res.writeHead(302, {
      'Location': originalUrl,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end();

  } catch (error) {
    logger.error('[Email Click] Unexpected error:', error.message || error);

    // Try to redirect to original URL even on error
    const originalUrl = req.query?.url ? decodeURIComponent(req.query.url) : null;
    if (originalUrl) {
      res.writeHead(302, { 'Location': originalUrl });
      res.end();
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  }
}

/**
 * Detect device type from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} Device type
 */
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';

  const ua = userAgent.toLowerCase();

  if (/mobile|android|iphone|ipad|phone|webos|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'mobile';
  }
  if (/bot|crawler|spider|googleimageproxy|feedfetcher|slurp/i.test(ua)) {
    return 'bot';
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

