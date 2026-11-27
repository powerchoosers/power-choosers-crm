import type { NextApiRequest } from 'next'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

export interface PortalIdentity {
  email: string
  contactId: string
  accountId: string
}

/**
 * Who is calling a /api/portal route, and which account they belong to.
 * The link is the same one the dashboard uses: sign-in email -> contact -> account.
 * Returns null when the caller is not signed in or has no linked account.
 */
export async function resolvePortalAccount(req: NextApiRequest): Promise<PortalIdentity | null> {
  const { email } = await requireUser(req)
  if (!email) return null

  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .select('id, accountId')
    .eq('email', email.toLowerCase())
    .not('accountId', 'is', null)
    .limit(1)

  const contact = contacts?.[0]
  if (!contact?.accountId) return null
  return { email: email.toLowerCase(), contactId: contact.id, accountId: contact.accountId }
}

export const VAULT_BUCKET = 'vault'

/** Where client bill files live inside the private vault bucket. */
export function billFolder(accountId: string) {
  return `client-bills/${accountId}`
}

export const BILL_MAX_BYTES = 15 * 1024 * 1024

export const BILL_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/** Trust the bytes, not the label. Returns the real type or null. */
export function sniffBillType(bytes: Uint8Array): keyof typeof BILL_MIME_TYPES | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  return null
}

export function safeFileName(name: string) {
  const cleaned = String(name || '').replace(/[\\/]/g, ' ').replace(/[^\w .()&,+-]/g, '').replace(/\s+/g, ' ').trim()
  return (cleaned || 'bill').slice(0, 120)
}
