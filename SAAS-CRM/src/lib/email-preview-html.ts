import { appendInternalSignaturePreviewMarker } from '@/lib/signature-telemetry'

const DEFAULT_ORIGIN = 'https://nodalpoint.io'

function safeOrigin(origin?: string) {
  return origin || DEFAULT_ORIGIN
}

function decodeTrackedUrl(value: string) {
  return String(value || '').replace(/&amp;/g, '&')
}

function unwrapEmailClickUrl(trackedUrl: string, origin?: string) {
  try {
    const parsed = new URL(decodeTrackedUrl(trackedUrl), safeOrigin(origin))
    const original = parsed.searchParams.get('url')
    if (original) {
      return decodeURIComponent(original)
    }
  } catch {
    // Keep original href if parsing fails.
  }

  return null
}

function unwrapSignatureTelemetryUrl(trackedUrl: string, origin?: string) {
  try {
    const parsed = new URL(decodeTrackedUrl(trackedUrl), safeOrigin(origin))
    const redirect = parsed.searchParams.get('redirect')
    if (redirect && redirect.startsWith('/')) {
      return appendInternalSignaturePreviewMarker(decodeURIComponent(redirect))
    }
  } catch {
    // Keep original href if parsing fails.
  }

  return null
}

/**
 * Strip tracking artifacts from email HTML shown inside the CRM.
 * This keeps internal previews from incrementing open/click telemetry.
 *
 * @param html Raw email HTML
 * @param origin Current browser origin
 * @returns HTML with tracking pixels and tracked links neutralized
 */
export function stripTrackedEmailPreviewHtml(html: string, origin?: string) {
  if (!html) return ''

  const processedHtml = html
    .replace(/src=(["'])http:\/\//gi, 'src=$1https://')
    .replace(/position:\s*fixed/gi, 'position: static')
    .replace(/position:\s*absolute/gi, 'position: static')
    .replace(/width:\s*\d+vw/gi, 'width: 100%')
    .replace(/height:\s*\d+vh/gi, 'height: auto')
    .replace(/<img([^>]*?)src=(["'])cid:[^"']+\2([^>]*)>/gi, '<span class="cid-placeholder">[Inline image not available in this view]</span>')

  const noEmailTrackingHtml = processedHtml.replace(/<img[^>]*src=(['"])[^'"]*\/api\/email\/track\/[^'"]*\1[^>]*>/gi, '')

  const noSignatureTrackingPixelsHtml = noEmailTrackingHtml.replace(/<img[^>]*src=(['"])[^'"]*\/api\/signatures\/telemetry[^'"]*\1[^>]*>/gi, '')

  const noTrackedEmailLinksHtml = noSignatureTrackingPixelsHtml.replace(/href=(["'])([^"']*\/api\/email\/click\/[^"']+)\1/gi, (match, quote, trackedUrl) => {
    const original = unwrapEmailClickUrl(trackedUrl, origin)
    return original ? `href=${quote}${original}${quote}` : match
  })

  return noTrackedEmailLinksHtml.replace(/href=(["'])([^"']*\/api\/signatures\/telemetry[^"']+)\1/gi, (match, quote, trackedUrl) => {
    const redirect = unwrapSignatureTelemetryUrl(trackedUrl, origin)
    return redirect ? `href=${quote}${redirect}${quote}` : match
  })
}
