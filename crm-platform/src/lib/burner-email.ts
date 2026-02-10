/**
 * Burner domain for cold/sequence emails.
 * From address is derived from the logged-in user's email: localPart@burnerDomain
 * e.g. l.patterson@nodalpoint.io -> l.patterson@getnodalpoint.com
 */
export const BURNER_DOMAIN = 'getnodalpoint.com'

/**
 * Derive the burner "from" address for sequence/cold emails from the user's login (or settings) email.
 * @param userEmail - e.g. l.patterson@nodalpoint.io or from user settings
 * @param domain - override domain (default: getnodalpoint.com)
 * @returns e.g. l.patterson@getnodalpoint.com
 */
export function getBurnerFromEmail(
  userEmail: string | null | undefined,
  domain: string = BURNER_DOMAIN
): string {
  if (!userEmail || typeof userEmail !== 'string') return `hello@${domain}`
  const at = userEmail.indexOf('@')
  const localPart = at > 0 ? userEmail.slice(0, at).trim() : 'hello'
  return `${localPart}@${domain}`
}

/**
 * Sender display name for sequence emails: "First Name | Nodal Point"
 * @param firstName - user's first name (e.g. from profile/settings)
 * @returns e.g. "Lewis | Nodal Point" or "Nodal Point" if no first name
 */
export function getBurnerSenderName(firstName: string | null | undefined): string {
  if (!firstName || typeof firstName !== 'string') return 'Nodal Point'
  const name = firstName.trim()
  return name ? `${name} | Nodal Point` : 'Nodal Point'
}
