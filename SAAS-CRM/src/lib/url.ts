/**
 * Normalize website/domain from CSV or DB: trim, strip trailing " http:" / " https:" artifacts.
 * Returns a value safe for storage (full URL or bare domain like www.example.com).
 */
export function normalizeWebsiteForImport(raw: string | undefined): string {
  if (raw == null || typeof raw !== 'string') return '';
  let s = raw.trim();
  // Remove trailing fragments like " http:" or " https:" (common CSV/Excel concatenation)
  s = s.replace(/\s+https?:\s*.*$/i, '').trim();
  return s;
}

/**
 * Given a stored domain/website string (may be malformed), return a URL safe for window.open.
 * Handles "http://www.gajeske.com http:" and bare "www.gajeske.com".
 */
export function domainToClickableUrl(domain: string | undefined | null): string {
  if (domain == null || typeof domain !== 'string') return '';
  const normalized = normalizeWebsiteForImport(domain);
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}
