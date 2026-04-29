import type { QueryClient, QueryKey } from '@tanstack/react-query'

type ContactLike = {
  id?: string
  accountId?: string | null
  linkedAccountId?: string | null
}

type ContactPage = {
  contacts?: ContactLike[]
  [key: string]: unknown
}

type ContactsInfiniteData = {
  pages?: ContactPage[]
  [key: string]: unknown
}

export type ContactCacheSnapshot = Array<[QueryKey, unknown]>

export type ContactCacheRemovalScope = {
  contactIds?: readonly string[]
  accountIds?: readonly string[]
}

const CONTACT_CACHE_ROOTS = new Set([
  'contacts',
  'contacts-search',
  'account-contacts',
  'contact',
  'contact-list-memberships',
  'list-memberships',
  'list-membership',
  'page-list-memberships',
])

function toIdSet(ids?: readonly string[]) {
  return new Set(
    (ids ?? [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
}

function getQueryRoot(queryKey: QueryKey) {
  return Array.isArray(queryKey) ? String(queryKey[0] ?? '') : ''
}

function shouldRemoveContact(
  contact: ContactLike | null | undefined,
  contactIds: Set<string>,
  accountIds: Set<string>,
) {
  if (!contact) return false

  if (contact.id && contactIds.has(contact.id)) return true

  const linkedAccountId = contact.accountId || contact.linkedAccountId || null
  if (linkedAccountId && accountIds.has(linkedAccountId)) return true

  return false
}

function pruneContactsInfiniteData(
  cached: unknown,
  contactIds: Set<string>,
  accountIds: Set<string>,
) {
  if (!cached || typeof cached !== 'object') return cached

  const data = cached as ContactsInfiniteData
  if (!Array.isArray(data.pages)) return cached

  let changed = false
  const pages = data.pages.map((page) => {
    if (!page || !Array.isArray(page.contacts)) return page

    const contacts = page.contacts.filter((contact) => !shouldRemoveContact(contact, contactIds, accountIds))
    if (contacts.length === page.contacts.length) return page

    changed = true
    return {
      ...page,
      contacts,
    }
  })

  return changed ? { ...data, pages } : cached
}

function pruneContactsArray(
  cached: unknown,
  contactIds: Set<string>,
  accountIds: Set<string>,
) {
  if (!Array.isArray(cached)) return cached

  const next = cached.filter((item) => !shouldRemoveContact(item as ContactLike, contactIds, accountIds))
  return next.length === cached.length ? cached : next
}

function pruneContactsSet(
  cached: unknown,
  contactIds: Set<string>,
  accountIds: Set<string>,
) {
  if (!(cached instanceof Set)) return cached

  let changed = false
  const next = new Set<string>()

  for (const value of cached.values()) {
    const contact = { id: String(value) } as ContactLike
    if (shouldRemoveContact(contact, contactIds, accountIds)) {
      changed = true
      continue
    }
    next.add(String(value))
  }

  return changed ? next : cached
}

function prunePageListMemberships(
  cached: unknown,
  contactIds: Set<string>,
) {
  if (!(cached instanceof Map)) return cached

  let changed = false
  const next = new Map<string, unknown>()

  for (const [contactId, memberships] of cached.entries()) {
    if (contactIds.has(contactId)) {
      changed = true
      continue
    }
    next.set(contactId, memberships)
  }

  return changed ? next : cached
}

function pruneContactDetail(
  cached: unknown,
  contactIds: Set<string>,
  accountIds: Set<string>,
) {
  if (!cached || typeof cached !== 'object') return cached

  return shouldRemoveContact(cached as ContactLike, contactIds, accountIds) ? null : cached
}

function pruneContactListMemberships(
  cached: unknown,
  queryKey: QueryKey,
  contactIds: Set<string>,
) {
  if (!Array.isArray(cached)) return cached

  const contactId = typeof queryKey[1] === 'string' ? queryKey[1] : ''
  if (!contactId || !contactIds.has(contactId)) return cached

  return []
}

function pruneContactBoolean(
  cached: unknown,
  queryKey: QueryKey,
  contactIds: Set<string>,
) {
  if (typeof cached !== 'boolean') return cached

  const contactId = typeof queryKey[1] === 'string' ? queryKey[1] : ''
  if (!contactId || !contactIds.has(contactId)) return cached

  return false
}

export async function pruneContactCaches(
  queryClient: QueryClient,
  scope: ContactCacheRemovalScope,
) {
  const contactIds = toIdSet(scope.contactIds)
  const accountIds = toIdSet(scope.accountIds)

  const predicate = ({ queryKey }: { queryKey: QueryKey }) => CONTACT_CACHE_ROOTS.has(getQueryRoot(queryKey))

  await queryClient.cancelQueries({ predicate })

  const snapshots = queryClient.getQueriesData({ predicate })

  for (const [queryKey, cached] of snapshots) {
    const root = getQueryRoot(queryKey)
    let next = cached

    if (root === 'contacts') {
      next = pruneContactsInfiniteData(cached, contactIds, accountIds)
    } else if (root === 'contacts-search') {
      next = pruneContactsArray(cached, contactIds, accountIds)
    } else if (root === 'account-contacts') {
      next = pruneContactsArray(cached, contactIds, accountIds)
    } else if (root === 'contact') {
      next = pruneContactDetail(cached, contactIds, accountIds)
    } else if (root === 'contact-list-memberships') {
      next = pruneContactListMemberships(cached, queryKey, contactIds)
    } else if (root === 'list-memberships') {
      next = pruneContactsSet(cached, contactIds, accountIds)
    } else if (root === 'list-membership') {
      next = pruneContactBoolean(cached, queryKey, contactIds)
    } else if (root === 'page-list-memberships') {
      next = prunePageListMemberships(cached, contactIds)
    }

    if (next !== cached) {
      queryClient.setQueryData(queryKey, next)
    }
  }

  return snapshots
}

export function restoreContactCaches(
  queryClient: QueryClient,
  snapshots: ContactCacheSnapshot,
) {
  for (const [queryKey, cached] of snapshots) {
    queryClient.setQueryData(queryKey, cached)
  }
}
