// Email open tracking pixel endpoint (Cloud Run API route)
// Returns a 1x1 transparent PNG and records an open event

import { supabaseAdmin } from '../../_supabase.js';
import logger from '../../_logger.js';

// 1x1 transparent PNG (43 bytes)
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// Deduplication window (1 minute) to prevent rapid duplicate opens
// CRITICAL: Gmail threads load all emails when opening one, causing multiple pixel fires
// A longer window prevents false positives from threaded email views
const DEDUP_WINDOW_MS = 60000;

// In-memory cache for fast deduplication (avoids Firestore reads for rapid duplicates)
// Key: trackingId_userKey, Value: timestamp of last open
const trackingDedupeCache = new Map();

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of trackingDedupeCache.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS * 2) {
      trackingDedupeCache.delete(key);
    }
  }
}, 300000);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Extract tracking ID from URL path: /api/email/track/{trackingId}
    // The [id] in the filename means it's a path parameter, not a query parameter
    let trackingId = '';

    // Try to get from URL path first (most reliable)
    if (req.url) {
      const urlPath = req.url.split('?')[0]; // Remove query string
      const pathParts = urlPath.split('/');
      const trackIndex = pathParts.findIndex(part => part === 'track');
      if (trackIndex >= 0 && pathParts[trackIndex + 1]) {
        trackingId = String(pathParts[trackIndex + 1]).trim();
      }
    }

    // Fallback to query parameter if path extraction failed (for compatibility)
    if (!trackingId && req.query?.id) {
      trackingId = String(req.query.id).trim();
    }

    // Final fallback: try to extract from req.url directly
    if (!trackingId && req.url) {
      const match = req.url.match(/\/api\/email\/track\/([^/?]+)/);
      if (match && match[1]) {
        trackingId = String(match[1]).trim();
      }
    }

    trackingId = trackingId || '';

    // Log tracking ID extraction for debugging
    if (!trackingId) {
      logger.warn('[Email Track] Failed to extract tracking ID from URL:', {
        url: req.url,
        pathname: req.url?.split('?')[0],
        query: req.query
      });
    } else {
      logger.debug('[Email Track] Extracted tracking ID:', {
        trackingId: trackingId.substring(0, 30) + '...',
        url: req.url?.substring(0, 100)
      });
    }

    // Extract request metadata
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || 'unknown';
    const referer = req.headers.referer || '';

    // Detect device type
    const deviceType = detectDeviceType(userAgent);

    // Best-effort: record an open event if Supabase is available and id looks valid
    try {
      if (supabaseAdmin && trackingId && trackingId.length > 0) {
        // Validate tracking ID format (should start with 'gmail_' or be a valid ID)
        if (!trackingId.match(/^[a-zA-Z0-9_-]+$/)) {
          logger.warn('[Email Track] Invalid tracking ID format:', { trackingId: trackingId.substring(0, 50) });
          setPixelHeaders(res);
          res.end(PIXEL);
          return;
        }

        // CRITICAL FIX: In-memory deduplication to prevent rapid duplicate opens
        // This is especially important for Gmail threads where opening one email
        // may load/render all emails in the thread, triggering multiple pixels
        const userKey = `${userAgent}_${ip}`;
        const dedupeKey = `${trackingId}_${userKey}`;
        const now = Date.now();
        const lastOpen = trackingDedupeCache.get(dedupeKey);

        if (lastOpen && (now - lastOpen) < DEDUP_WINDOW_MS) {
          // Duplicate open within window - skip recording but still return pixel
          logger.debug('[Email Track] Duplicate open ignored (in-memory cache):', {
            trackingId: trackingId.substring(0, 30),
            timeSinceLastOpen: now - lastOpen
          });
          setPixelHeaders(res);
          res.end(PIXEL);
          return;
        }

        // Update in-memory cache first (fast path)
        trackingDedupeCache.set(dedupeKey, now);

        // Fetch current email data from Supabase (include metadata so we preserve ownerId for Realtime notifications)
        const { data: currentData, error: fetchError } = await supabaseAdmin
          .from('emails')
          .select('opens, openCount, metadata')
          .eq('id', trackingId)
          .single();

        if (!fetchError && currentData) {
          const openedAt = new Date().toISOString();
          const existingOpens = Array.isArray(currentData.opens) ? currentData.opens : [];

          // Secondary deduplication: Check Supabase for recent opens from same user
          // This catches cases where in-memory cache was cleared (server restart)
          const recentOpen = existingOpens.find(open => {
            const openTime = new Date(open.openedAt).getTime();
            return `${open.userAgent}_${open.ip}` === userKey && (now - openTime) < DEDUP_WINDOW_MS;
          });

          if (recentOpen) {
            logger.debug('[Email Track] Duplicate open ignored (Supabase check):', { trackingId: trackingId.substring(0, 30) });
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

            // Merge metadata so ownerId is preserved (needed for Realtime open notifications)
            const existingMeta = currentData.metadata && typeof currentData.metadata === 'object' ? currentData.metadata : {};
            const metadata = {
              ...existingMeta,
              lastOpened: openedAt,
              ...(deviceType === 'bot' ? { botFlagged: true } : {})
            };

            // Update Supabase record
            await supabaseAdmin
              .from('emails')
              .update({
                openCount: (currentData.openCount || 0) + 1,
                opens: [...existingOpens, openEvent],
                updatedAt: openedAt,
                metadata
              })
              .eq('id', trackingId);

            logger.debug('[Email Track] Recorded open:', {
              trackingId: trackingId.substring(0, 30),
              deviceType,
              openCount: (currentData.openCount || 0) + 1
            });

            // TRIGGER SEQUENCE ADVANCEMENT (If part of a sequence)
            // We check the metadata for member_id or sequence_id
            const memberId = existingMeta.member_id || existingMeta.memberId;
            if (memberId) {
              logger.info(`[Email Track] Advancing sequence for member: ${memberId}`, { trackingId });
              // We call the utility function via RPC or direct SQL if possible
              // For Edge Functions / API routes, we use supabaseAdmin.rpc
              const { error: rpcError } = await supabaseAdmin.rpc('advance_sequence_member', {
                p_member_id: memberId,
                p_outcome: 'opened'
              });
              if (rpcError) logger.error('[Email Track] RPC Error advancing sequence:', rpcError);
            }
          }
        } else {
          logger.debug('[Email Track] Document not found:', { trackingId: trackingId.substring(0, 30) });
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
