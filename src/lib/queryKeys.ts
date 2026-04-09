export function matchesQueryKeyById(queryKey: unknown, root: string, id: string) {
  return Array.isArray(queryKey) && queryKey[0] === root && queryKey.some((segment) => segment === id)
}

export function queryPredicateById(root: string, id: string) {
  return ({ queryKey }: { queryKey: unknown }) => matchesQueryKeyById(queryKey, root, id)
}
