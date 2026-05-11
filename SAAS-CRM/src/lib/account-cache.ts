import type { QueryClient, QueryKey } from '@tanstack/react-query'

type AccountLike = {
  id?: string
}

type AccountPage = {
  accounts?: AccountLike[]
  [key: string]: unknown
}

type AccountsInfiniteData = {
  pages?: AccountPage[]
  [key: string]: unknown
}

export type AccountCacheSnapshot = Array<[QueryKey, unknown]>

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

function pruneAccountsInfiniteData(cached: unknown, accountIds: Set<string>) {
  if (!cached || typeof cached !== 'object') return cached

  const data = cached as AccountsInfiniteData
  if (!Array.isArray(data.pages)) return cached

  let changed = false
  const pages = data.pages.map((page) => {
    if (!page || !Array.isArray(page.accounts)) return page

    const accounts = page.accounts.filter((account) => !account.id || !accountIds.has(account.id))
    if (accounts.length === page.accounts.length) return page

    changed = true
    return {
      ...page,
      accounts,
    }
  })

  return changed ? { ...data, pages } : cached
}

function pruneAccountsArray(cached: unknown, accountIds: Set<string>) {
  if (!Array.isArray(cached)) return cached

  const next = cached.filter((item) => !item || !accountIds.has(String((item as AccountLike).id || '')))
  return next.length === cached.length ? cached : next
}

function pruneAccountDetail(cached: unknown, accountIds: Set<string>) {
  if (!cached || typeof cached !== 'object') return cached

  const id = String((cached as AccountLike).id || '')
  return id && accountIds.has(id) ? null : cached
}

function pruneAccountMemberships(cached: unknown, queryKey: QueryKey, accountIds: Set<string>) {
  if (!Array.isArray(cached)) return cached

  const accountId = typeof queryKey[1] === 'string' ? queryKey[1] : ''
  if (!accountId || !accountIds.has(accountId)) return cached

  return []
}

export async function pruneAccountCaches(
  queryClient: QueryClient,
  accountIdsInput: readonly string[],
) {
  const accountIds = toIdSet(accountIdsInput)
  const predicate = ({ queryKey }: { queryKey: QueryKey }) =>
    Array.isArray(queryKey) &&
    ['accounts', 'accounts-search', 'account', 'account-list-memberships'].includes(getQueryRoot(queryKey))

  await queryClient.cancelQueries({ predicate })

  const snapshots = queryClient.getQueriesData({ predicate })

  for (const [queryKey, cached] of snapshots) {
    const root = getQueryRoot(queryKey)
    let next = cached

    if (root === 'accounts') {
      next = pruneAccountsInfiniteData(cached, accountIds)
    } else if (root === 'accounts-search') {
      next = pruneAccountsArray(cached, accountIds)
    } else if (root === 'account') {
      next = pruneAccountDetail(cached, accountIds)
    } else if (root === 'account-list-memberships') {
      next = pruneAccountMemberships(cached, queryKey, accountIds)
    }

    if (next !== cached) {
      queryClient.setQueryData(queryKey, next)
    }
  }

  return snapshots
}

export function restoreAccountCaches(
  queryClient: QueryClient,
  snapshots: AccountCacheSnapshot,
) {
  for (const [queryKey, cached] of snapshots) {
    queryClient.setQueryData(queryKey, cached)
  }
}
