import { formatToE164 } from '@/lib/utils'

export interface PowerDialSourceContact {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  workPhone?: string | null
  workDirectPhone?: string | null
  otherPhone?: string | null
  companyPhone?: string | null
  primaryPhoneField?: 'mobile' | 'workDirectPhone' | 'otherPhone' | 'companyPhone' | string | null
  additionalPhones?: Array<{ number: string; type?: string } | null> | null
  accountId?: string | null
  accountName?: string | null
  company?: string | null
  companyName?: string | null
  title?: string | null
  avatarUrl?: string | null
  logoUrl?: string | null
  companyDomain?: string | null
}

export interface PowerDialTarget {
  id: string
  contactId: string
  name: string
  phoneNumber: string
  accountId?: string | null
  accountName?: string | null
  title?: string | null
  photoUrl?: string | null
  logoUrl?: string | null
  domain?: string | null
}

function normalizeDialNumber(value: unknown): string | null {
  const formatted = formatToE164(value == null ? '' : String(value))
  return formatted || null
}

function pushCandidate(candidates: string[], value: unknown) {
  const normalized = normalizeDialNumber(value)
  if (normalized) candidates.push(normalized)
}

export function resolvePowerDialPhone(contact: PowerDialSourceContact): string | null {
  const candidates: string[] = []
  const seen = new Set<string>()

  const primaryField = contact.primaryPhoneField
  if (primaryField && typeof primaryField === 'string') {
    pushCandidate(candidates, contact[primaryField as keyof PowerDialSourceContact])
  }

  pushCandidate(candidates, contact.mobile)
  pushCandidate(candidates, contact.workDirectPhone)
  pushCandidate(candidates, contact.workPhone)
  pushCandidate(candidates, contact.otherPhone)
  pushCandidate(candidates, contact.companyPhone)

  if (Array.isArray(contact.additionalPhones)) {
    contact.additionalPhones.forEach((entry) => {
      if (!entry) return
      if (typeof entry === 'string') {
        pushCandidate(candidates, entry)
        return
      }
      pushCandidate(candidates, entry.number)
    })
  }

  pushCandidate(candidates, contact.phone)

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    return candidate
  }

  return null
}

export function buildPowerDialTargets(contacts: PowerDialSourceContact[]): PowerDialTarget[] {
  const out: PowerDialTarget[] = []
  const seenNumbers = new Set<string>()

  contacts.forEach((contact) => {
    if (!contact?.id) return

    const phoneNumber = resolvePowerDialPhone(contact)
    if (!phoneNumber || seenNumbers.has(phoneNumber)) return

    seenNumbers.add(phoneNumber)
    out.push({
      id: contact.id,
      contactId: contact.id,
      name: contact.name?.trim() || contact.companyName?.trim() || contact.company?.trim() || 'Unknown Contact',
      phoneNumber,
      accountId: contact.accountId || null,
      accountName: contact.accountName || contact.companyName || contact.company || null,
      title: contact.title || null,
      photoUrl: contact.avatarUrl || null,
      logoUrl: contact.logoUrl || null,
      domain: contact.companyDomain || null,
    })
  })

  return out
}

export function chunkPowerDialTargets(targets: PowerDialTarget[], size = 3): PowerDialTarget[][] {
  if (!Array.isArray(targets) || targets.length === 0) return []
  const batchSize = Math.max(1, size)
  const batches: PowerDialTarget[][] = []

  for (let i = 0; i < targets.length; i += batchSize) {
    batches.push(targets.slice(i, i + batchSize))
  }

  return batches
}
