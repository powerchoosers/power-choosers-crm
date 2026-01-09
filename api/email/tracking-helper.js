// Email tracking helper - injects tracking pixel and wraps links for click tracking
// Replaces SendGrid's native tracking with custom pixel tracking
import logger from '../_logger.js';

// Base URL for tracking endpoints
const getBaseUrl = () => {
  return process.env.PUBLIC_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app';
};

/**
 * Generate a tracking pixel HTML tag for open tracking
 * @param {string} trackingId - The email document ID in Firestore
 * @returns {string} HTML img tag for tracking pixel
 */
export function generateTrackingPixel(trackingId) {
  if (!trackingId) {
    logger.warn('[TrackingHelper] No tracking ID provided for pixel generation');
    return '';
  }

  const baseUrl = getBaseUrl();
  // Add cache-buster to prevent email client caching
  const cacheBuster = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const pixelUrl = `${baseUrl}/api/email/track/${trackingId}?r=${cacheBuster}`;

  // Invisible 1x1 pixel - multiple fallback styles for email client compatibility
  return `<img src="${pixelUrl}" width="1" height="1" style="display:none !important; width:1px !important; height:1px !important; border:0 !important; margin:0 !important; padding:0 !important;" alt="" aria-hidden="true" />`;
}

/**
 * Generate a click-tracked URL
 * @param {string} originalUrl - The original link URL
 * @param {string} trackingId - The email document ID
 * @param {number} linkIndex - Index of the link in the email (for analytics)
 * @returns {string} Wrapped tracking URL
 */
export function generateTrackedLink(originalUrl, trackingId, linkIndex = 0) {
  if (!trackingId || !originalUrl) {
    return originalUrl;
  }

  // Don't track mailto: or tel: links
  if (originalUrl.startsWith('mailto:') || originalUrl.startsWith('tel:')) {
    return originalUrl;
  }

  // Don't track tracking pixel URLs (avoid infinite loops)
  if (originalUrl.includes('/api/email/track/')) {
    return originalUrl;
  }

  const normalizedUrl = normalizeTrackableUrl(originalUrl);
  if (!normalizedUrl) {
    return originalUrl;
  }

  const baseUrl = getBaseUrl();
  const encodedUrl = encodeURIComponent(normalizedUrl);
  return `${baseUrl}/api/email/click/${trackingId}?url=${encodedUrl}&idx=${linkIndex}`;
}

function normalizeTrackableUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  if (u.startsWith('mailto:') || u.startsWith('tel:')) return u;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('//')) return `https:${u}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  if (u.startsWith('/') || u.startsWith('#')) return null;
  if (/[.][a-z]{2,}([/?#]|$)/i.test(u)) return `https://${u}`;
  return null;
}

/**
 * Wrap all links in HTML content with click tracking
 * @param {string} html - The email HTML content
 * @param {string} trackingId - The email document ID
 * @param {boolean} enableClickTracking - Whether to enable click tracking
 * @returns {string} HTML with wrapped links
 */
export function wrapLinksWithTracking(html, trackingId, enableClickTracking = true) {
  if (!html || !trackingId || !enableClickTracking) {
    return html;
  }

  let linkIndex = 0;

  // Match href attributes in anchor tags
  // Handles: href="url", href='url', href=url
  const linkRegex = /<a\s+([^>]*?)href\s*=\s*(["']?)([^"'\s>]+)\2([^>]*)>/gi;

  return html.replace(linkRegex, (match, before, quote, url, after) => {
    // Skip mailto:, tel:, and tracking URLs
    if (url.startsWith('mailto:') || url.startsWith('tel:') || url.includes('/api/email/track/') || url.includes('/api/email/click/')) {
      return match;
    }

    // Skip anchor links (same page)
    if (url.startsWith('#')) {
      return match;
    }

    const trackedUrl = generateTrackedLink(url, trackingId, linkIndex++);
    const quoteChar = quote || '"';
    return `<a ${before}href=${quoteChar}${trackedUrl}${quoteChar}${after}>`;
  });
}

/**
 * Inject tracking pixel into HTML email content
 * @param {string} html - The email HTML content
 * @param {string} trackingId - The email document ID
 * @param {Object} options - Tracking options
 * @param {boolean} options.enableOpenTracking - Whether to add open tracking pixel (default: true)
 * @param {boolean} options.enableClickTracking - Whether to wrap links for click tracking (default: true)
 * @returns {string} HTML with tracking pixel and wrapped links
 */
export function injectTracking(html, trackingId, options = {}) {
  const {
    enableOpenTracking = true,
    enableClickTracking = true
  } = options;

  if (!html || !trackingId) {
    logger.warn('[TrackingHelper] Missing html or trackingId for tracking injection');
    return html;
  }

  let trackedHtml = html;

  // Step 1: Wrap links with click tracking
  if (enableClickTracking) {
    trackedHtml = wrapLinksWithTracking(trackedHtml, trackingId, true);
  }

  // Step 2: Inject open tracking pixel
  if (enableOpenTracking) {
    const pixel = generateTrackingPixel(trackingId);

    // Try to inject before </body> tag for proper HTML emails
    if (trackedHtml.includes('</body>')) {
      trackedHtml = trackedHtml.replace('</body>', `${pixel}</body>`);
    } else if (trackedHtml.includes('</html>')) {
      // Fallback: inject before </html>
      trackedHtml = trackedHtml.replace('</html>', `${pixel}</html>`);
    } else {
      // Final fallback: append to end
      trackedHtml = trackedHtml + pixel;
    }
  }

  logger.debug('[TrackingHelper] Injected tracking into email:', {
    trackingId,
    openTracking: enableOpenTracking,
    clickTracking: enableClickTracking,
    pixelAdded: enableOpenTracking
  });

  return trackedHtml;
}

/**
 * Check if HTML already has a tracking pixel
 * @param {string} html - The email HTML content
 * @returns {boolean} Whether tracking pixel is already present
 */
export function hasTrackingPixel(html) {
  if (!html) return false;
  return html.includes('/api/email/track/');
}

export default {
  generateTrackingPixel,
  generateTrackedLink,
  wrapLinksWithTracking,
  injectTracking,
  hasTrackingPixel
};

