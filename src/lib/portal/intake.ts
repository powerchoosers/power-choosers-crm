import { randomBytes } from 'node:crypto'

/**
 * Automatic bill intake: each enrolled account gets its own forwarding address,
 * bills-<token>@<BILL_INBOUND_DOMAIN>. The token is the only thing that ties an
 * incoming email to an account, so it is long, random, and never guessable from
 * the account name.
 *
 * The domain must be set up for receiving in Resend, with its webhook pointed at
 * /api/webhooks/bill-inbound. Until BILL_INBOUND_DOMAIN is set, enrollment is
 * recorded but no address is shown.
 */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no look-alikes (0/o, 1/l/i)

export function newIntakeToken(): string {
  const bytes = randomBytes(12)
  let token = ''
  for (const byte of bytes) token += ALPHABET[byte % ALPHABET.length]
  return token
}

export function inboundDomain(): string | null {
  const domain = String(process.env.BILL_INBOUND_DOMAIN || '').trim().toLowerCase()
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null
}

export function intakeAddress(token: string): string | null {
  const domain = inboundDomain()
  return domain ? `bills-${token}@${domain}` : null
}

/** Pull the account token out of a recipient address on our inbound domain, or null. */
export function tokenFromRecipient(recipient: string): string | null {
  const domain = inboundDomain()
  if (!domain) return null
  const match = /<?\s*bills-([a-z0-9]{8,24})@([a-z0-9.-]+)\s*>?\s*$/i.exec(String(recipient || '').trim())
  if (!match || match[2].toLowerCase() !== domain) return null
  return match[1].toLowerCase()
}
