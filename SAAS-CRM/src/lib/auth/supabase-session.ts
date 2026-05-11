import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

const REFRESH_BUFFER_MS = 5 * 60 * 1000

function getErrorMessage(error: unknown): string {
  if (!error) return ''
  if (error instanceof Error) return error.message || ''
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const candidate = error as { message?: unknown; error?: unknown }
    if (typeof candidate.message === 'string') return candidate.message
    if (typeof candidate.error === 'string') return candidate.error
  }
  return ''
}

export function isSupabaseAuthTokenError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return /jwt expired|expired jwt|invalid jwt|token expired|session expired|refresh token.*expired|could not validate/i.test(message)
}

async function resolveCurrentSession(forceRefresh = false): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return null

  const expiresAtMs = typeof session.expires_at === 'number'
    ? session.expires_at * 1000
    : null
  const shouldRefresh = forceRefresh || expiresAtMs === null || expiresAtMs <= Date.now() + REFRESH_BUFFER_MS

  if (!shouldRefresh) {
    return session
  }

  const { data, error } = await supabase.auth.refreshSession()
  if (error) {
    console.warn('[SupabaseSession] Failed to refresh session:', error.message)
    return session
  }

  return data.session ?? session
}

export async function ensureFreshSupabaseSession(forceRefresh = false): Promise<Session | null> {
  return resolveCurrentSession(forceRefresh)
}

export async function getFreshSupabaseAccessToken(forceRefresh = false): Promise<string | null> {
  const session = await resolveCurrentSession(forceRefresh)
  return session?.access_token ?? null
}
