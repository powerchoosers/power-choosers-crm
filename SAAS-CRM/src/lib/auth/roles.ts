export type UserRole = 'admin' | 'employee'

export const BOOTSTRAP_ADMIN_EMAILS = ['l.patterson@nodalpoint.io', 'admin@nodalpoint.io'] as const

export function normalizeUserRole(role: unknown): UserRole | null {
  const value = String(role || '').toLowerCase().trim()
  if (value === 'admin') return 'admin'
  if (value === 'employee') return 'employee'
  return null
}

export function isBootstrapAdminEmail(email?: string | null) {
  const normalized = String(email || '').toLowerCase().trim()
  return normalized ? BOOTSTRAP_ADMIN_EMAILS.includes(normalized as (typeof BOOTSTRAP_ADMIN_EMAILS)[number]) : false
}

export function resolveUserRole(
  settings: Record<string, unknown> | null | undefined,
  email?: string | null
): UserRole {
  const explicitRole = normalizeUserRole(settings?.role)
  if (explicitRole) return explicitRole
  return isBootstrapAdminEmail(email) ? 'admin' : 'employee'
}

export function isPrivilegedRole(role?: string | null) {
  const normalized = String(role || '').toLowerCase().trim()
  return normalized === 'admin' || normalized === 'dev'
}
