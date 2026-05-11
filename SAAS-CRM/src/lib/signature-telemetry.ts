const INTERNAL_SIGNATURE_PREVIEW_PARAM = 'crmPreview'

function hasInternalSignaturePreviewFlag(parsed: URL) {
  const flag = parsed.searchParams.get(INTERNAL_SIGNATURE_PREVIEW_PARAM)
  return flag === '1' || flag === 'true'
}

/**
 * True when a signature tracking request came from an internal CRM view.
 *
 * CRM previews live under /network, and internal preview links also carry a
 * crmPreview=1 marker. Either signal should stay out of recipient telemetry.
 *
 * @param referer Browser referer header or document.referrer
 * @returns boolean
 */
export function isInternalSignatureViewReferer(referer?: string | null) {
  if (!referer) return false

  try {
    const parsed = new URL(referer)
    return parsed.pathname.startsWith('/network') || hasInternalSignaturePreviewFlag(parsed)
  } catch {
    return false
  }
}

/**
 * Marks a signing URL as internal-only so the CRM can open it without
 * inflating the recipient's open count.
 */
export function appendInternalSignaturePreviewMarker(path: string) {
  const trimmed = String(path || '').trim()
  if (!trimmed || !trimmed.startsWith('/')) return trimmed

  try {
    const parsed = new URL(trimmed, 'https://nodalpoint.local')
    if (hasInternalSignaturePreviewFlag(parsed)) {
      return trimmed
    }

    parsed.searchParams.set(INTERNAL_SIGNATURE_PREVIEW_PARAM, '1')
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    const [withoutHash, hash = ''] = trimmed.split('#')
    const separator = withoutHash.includes('?') ? '&' : '?'
    const marked = withoutHash.includes(`${INTERNAL_SIGNATURE_PREVIEW_PARAM}=`)
      ? withoutHash
      : `${withoutHash}${separator}${INTERNAL_SIGNATURE_PREVIEW_PARAM}=1`
    return hash ? `${marked}#${hash}` : marked
  }
}
