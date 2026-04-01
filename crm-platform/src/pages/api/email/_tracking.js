/**
 * True when a tracking request came from an internal CRM view.
 *
 * Email previews inside the CRM load tracking pixels and wrapped links from
 * nested iframe content, so the browser referrer points at the parent CRM page.
 * Anything under /network is part of the private dossier UI and should not
 * count as recipient engagement.
 *
 * @param {string} referer
 * @returns {boolean}
 */
export function isInternalEmailViewReferer(referer) {
  if (!referer) return false;

  try {
    const parsed = new URL(referer);
    return parsed.pathname.startsWith('/network');
  } catch {
    return false;
  }
}
