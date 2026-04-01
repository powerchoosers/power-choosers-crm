import { normalizeAuthPayload, trimText } from './shared'

type SessionProbe = Record<string, unknown>

let lastSignature = ''
let hasSyncedSession = false
let lastPageSignature = ''
let pageChangeTimer: number | null = null
let pageNavigationHooksInstalled = false

function isCandidateKey(key: string) {
  return key.startsWith('sb-') && key.includes('auth-token')
}

function readSessionFromStorage(): SessionProbe | null {
  try {
    const storage = window.localStorage
    const keys = Object.keys(storage).filter(isCandidateKey)
    for (const key of keys) {
      const raw = storage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as SessionProbe
        if (parsed && typeof parsed === 'object') {
          if (parsed.currentSession && typeof parsed.currentSession === 'object') {
            return parsed.currentSession as SessionProbe
          }
          if (
            typeof parsed.access_token === 'string' ||
            typeof parsed.accessToken === 'string' ||
            typeof parsed.token === 'string'
          ) {
            return parsed
          }
        }
      } catch {
        continue
      }
    }
  } catch {
    return null
  }

  return null
}

function buildSignature(session: SessionProbe | null): string {
  if (!session) return 'none'
  const accessToken = trimText(session.access_token ?? session.accessToken ?? session.token)
  const refreshToken = trimText(session.refresh_token ?? session.refreshToken)
  const user = session.user as SessionProbe | undefined
  const email = trimText(session.email ?? user?.email)
  const userId = trimText(session.userId ?? user?.id)
  const expiresAt = trimText(session.expires_at ?? session.expiresAt)
  return [accessToken, refreshToken, email, userId, expiresAt].join('|')
}

function buildPageSignature(): string {
  return [window.location.origin, window.location.pathname, window.location.search, window.location.hash, document.title].join('|')
}

function sendPageContext() {
  const signature = buildPageSignature()
  if (signature === lastPageSignature) return
  lastPageSignature = signature

  chrome.runtime.sendMessage(
    {
      type: 'PAGE_CONTEXT_CHANGED',
      payload: {
        appOrigin: window.location.origin,
        title: document.title,
        url: window.location.href,
      },
    },
    () => {
      void chrome.runtime.lastError
    }
  )
}

function schedulePageContextSend() {
  if (pageChangeTimer !== null) {
    window.clearTimeout(pageChangeTimer)
  }

  pageChangeTimer = window.setTimeout(() => {
    pageChangeTimer = null
    sendPageContext()
  }, 650)
}

function installPageNavigationHooks() {
  if (pageNavigationHooksInstalled) return
  pageNavigationHooksInstalled = true

  const notify = () => {
    schedulePageContextSend()
  }

  const patchHistoryMethod = (method: 'pushState' | 'replaceState') => {
    const original = window.history[method]
    const patched = function patchedHistoryMethod(this: History, ...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args)
      window.dispatchEvent(new Event('nodal-point-locationchange'))
      return result
    }

    ;(patched as any).__nodalPointPatched = true
    window.history[method] = patched as History[typeof method]
  }

  try {
    const pushState = window.history.pushState as any
    if (!pushState.__nodalPointPatched) patchHistoryMethod('pushState')

    const replaceState = window.history.replaceState as any
    if (!replaceState.__nodalPointPatched) patchHistoryMethod('replaceState')
  } catch {
    // Ignore history patch failures and rely on popstate/hashchange.
  }

  window.addEventListener('popstate', notify)
  window.addEventListener('hashchange', notify)
  window.addEventListener('nodal-point-locationchange', notify)
}

function sendAuthState() {
  const session = readSessionFromStorage()
  const signature = buildSignature(session)
  if (!session) {
    if (hasSyncedSession) {
      hasSyncedSession = false
      lastSignature = 'none'
      chrome.runtime.sendMessage(
        {
          type: 'AUTH_CLEAR',
          payload: {
            appOrigin: window.location.origin,
          },
        },
        () => {
          void chrome.runtime.lastError
        }
      )
    }
    return
  }

  if (signature === lastSignature) return
  lastSignature = signature
  hasSyncedSession = true

  const payload = normalizeAuthPayload(
    {
      ...session,
      appOrigin: window.location.origin,
    },
    window.location.origin
  )

  if (!payload) return

  chrome.runtime.sendMessage(
    {
      type: 'AUTH_SYNC',
      payload,
    },
    () => {
      void chrome.runtime.lastError
    }
  )
}

function scheduleSync() {
  installPageNavigationHooks()
  sendAuthState()
  window.setInterval(sendAuthState, 5000)
  window.addEventListener('storage', sendAuthState)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendAuthState()
    }
  })

  // Listen for CRM settings changes
  window.addEventListener('nodal-point-settings-updated', (event: any) => {
    console.log('[Content] Settings change detected from page event:', event.detail)
    chrome.runtime.sendMessage({ type: 'PROFILE_REFRESH' }, () => {
      void chrome.runtime.lastError
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleSync, { once: true })
} else {
  scheduleSync()
}
