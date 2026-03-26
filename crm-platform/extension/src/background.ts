import {
  DEFAULT_CALL_LIMIT,
  DEFAULT_CHAT_LIMIT,
  DEFAULT_NOTE_LIMIT,
  STATE_KEY,
  buildContextPrompt,
  buildTransmissionNoteBody,
  buildTransmissionTaskTitle,
  defaultCallState,
  defaultState,
  extractPhoneCandidates,
  normalizeAuthPayload,
  normalizeOrigin,
  resolveCallerId,
  trimText,
  type ExtensionState,
  type MatchResult,
  type PageSnapshot,
  type RecentCall,
} from './shared'

const DEFAULT_APP_ORIGIN = 'https://www.nodalpoint.io'
const INCOMING_NOTIFICATION_ID = 'nodal-point-incoming-call'

type TabActiveInfo = {
  tabId: number
  windowId: number
}

type TabChangeInfo = {
  status?: string
  url?: string
}

type CapturedTab = {
  active?: boolean
  url?: string | null
  windowId: number
}

type PageBadgePayload = {
  accountName: string
  accountId: string
  domain: string | null
  contactCount: number
}

let state: ExtensionState = defaultState()
let latestBodyText = ''
let latestScreenshot: string | null = null
let hydrated = false

function nowIso() {
  return new Date().toISOString()
}

function cloneState() {
  return JSON.parse(JSON.stringify(state)) as ExtensionState
}

function isAuthMessageError(error: unknown) {
  const message = String((error as Error | undefined)?.message ?? error ?? '')
  return message.includes('401') || message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('forbidden')
}

async function setState(mutator: (draft: ExtensionState) => void) {
  mutator(state)
  state.lastUpdatedAt = nowIso()
  await chrome.storage.local.set({ [STATE_KEY]: cloneState() })
  await updateBadge()
}

async function hydrateState() {
  if (hydrated) return
  const stored = await chrome.storage.local.get(STATE_KEY)
  const saved = stored?.[STATE_KEY]
  if (saved && typeof saved === 'object') {
    state = {
      ...defaultState(),
      ...saved,
      call: {
        ...defaultCallState(),
        ...(saved.call || {}),
      },
      accountContacts: Array.isArray(saved.accountContacts) ? saved.accountContacts : [],
      notes: Array.isArray(saved.notes) ? saved.notes : [],
      chat: Array.isArray(saved.chat) ? saved.chat : [],
      recentCalls: Array.isArray(saved.recentCalls) ? saved.recentCalls : [],
    }
  }
  hydrated = true
  await updateBadge()

  try {
    if (state.match?.account?.id && state.page?.url) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id && tab.url && trimText(tab.url) === trimText(state.page.url)) {
        await syncPageBadge(tab.id, state.match)
      }
    }
  } catch (error) {
    console.warn('[Extension] Failed to restore page badge:', error)
  }
}

function getApiOrigin(fallbackOrigin?: string | null) {
  return normalizeOrigin(state.auth?.appOrigin || fallbackOrigin || DEFAULT_APP_ORIGIN) || DEFAULT_APP_ORIGIN
}

function getCallerId() {
  return resolveCallerId(state.auth)
}

async function sendExtensionMessage(message: Record<string, unknown>) {
  return await new Promise<any>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: any) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      resolve(response)
    })
  })
}

async function ensureOffscreenDocument() {
  try {
    await sendExtensionMessage({ type: 'OFFSCREEN_PING' })
    return
  } catch {
    // create the offscreen document if it is not already alive
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Keep the Twilio Voice client alive for browser calling.',
    })
  } catch (error) {
    const message = String((error as Error | undefined)?.message ?? error ?? '').toLowerCase()
    if (!message.includes('offscreen document') && !message.includes('already exists')) {
      throw error
    }
  }

  for (let i = 0; i < 10; i += 1) {
    try {
      await sendExtensionMessage({ type: 'OFFSCREEN_PING' })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { response, data }
}

async function refreshAuthSession(fallbackOrigin?: string | null) {
  const currentAuth = state.auth
  if (!currentAuth?.refreshToken) {
    throw new Error('Connect your Nodal Point session first.')
  }

  const origin = getApiOrigin(fallbackOrigin)
  const headers = new Headers({
    'Content-Type': 'application/json',
  })

  const { response, data } = await fetchJson(`${origin}/api/extension/refresh`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      refreshToken: currentAuth.refreshToken,
      appOrigin: origin,
    }),
  })

  if (!response.ok) {
    const message = typeof data === 'object' && data ? (data.message || data.error) : data
    throw new Error(String(message || `Session refresh failed (${response.status})`))
  }

  const refreshed = normalizeAuthPayload(data?.session || data?.auth || data, origin)
  if (!refreshed?.accessToken) {
    throw new Error('Session refresh did not return a usable token.')
  }

  await setState((draft) => {
    draft.auth = {
      ...(currentAuth || {}),
      ...refreshed,
      profile: currentAuth?.profile || refreshed.profile || null,
      bootstrapStatus: 'refreshed',
    }
  })

  return state.auth
}

async function fetchAuthedJson(path: string, init?: RequestInit, fallbackOrigin?: string | null) {
  const auth = state.auth
  if (!auth?.accessToken) {
    throw new Error('Connect your Nodal Point session first.')
  }

  const origin = getApiOrigin(fallbackOrigin)
  const buildHeaders = (token: string) => {
    const headers = new Headers(init?.headers || {})
    headers.set('Authorization', `Bearer ${token}`)
    if (!headers.has('Content-Type') && init?.body) {
      headers.set('Content-Type', 'application/json')
    }
    return headers
  }

  const makeRequest = (token: string) =>
    fetchJson(`${origin}${path}`, {
      ...init,
      headers: buildHeaders(token),
    })

  let { response, data } = await makeRequest(auth.accessToken)

  if (!response.ok && response.status === 401 && state.auth?.refreshToken) {
    try {
      const refreshedAuth = await refreshAuthSession(fallbackOrigin)
      if (refreshedAuth?.accessToken) {
        ;({ response, data } = await makeRequest(refreshedAuth.accessToken))
      }
    } catch (error) {
      console.warn('[Extension] Session refresh failed:', error)
    }
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data ? (data.message || data.error) : data
    throw new Error(String(message || `Request failed (${response.status})`))
  }

  return data
}

async function loadBootstrapProfile(fallbackOrigin?: string | null) {
  const data = await fetchAuthedJson('/api/extension/bootstrap', { method: 'GET' }, fallbackOrigin)
  const profile = data?.profile || null

  if (!state.auth) return

  state.auth = {
    ...state.auth,
    appOrigin: normalizeOrigin(data?.appOrigin || fallbackOrigin || state.auth.appOrigin || DEFAULT_APP_ORIGIN),
    profile: profile
      ? {
          email: profile.email ?? state.auth.email,
          name: profile.name ?? state.auth.fullName,
          firstName: profile.firstName ?? state.auth.firstName,
          lastName: profile.lastName ?? state.auth.lastName,
          jobTitle: profile.jobTitle ?? null,
          hostedPhotoUrl: profile.hostedPhotoUrl ?? null,
          city: profile.city ?? null,
          state: profile.state ?? null,
          website: profile.website ?? null,
          twilioNumbers: Array.isArray(profile.twilioNumbers) ? profile.twilioNumbers : [],
          selectedPhoneNumber: profile.selectedPhoneNumber ?? null,
          bridgeToMobile: Boolean(profile.bridgeToMobile),
        }
      : state.auth.profile,
    bootstrapStatus: 'bootstrapped',
  }

  await setState((draft) => {
    draft.auth = state.auth
  })
}

async function refreshRecentCalls(fallbackOrigin?: string | null) {
  if (!state.auth?.accessToken) return
  try {
    const data = await fetchAuthedJson(`/api/calls?limit=${DEFAULT_CALL_LIMIT}`, { method: 'GET' }, fallbackOrigin)
    const calls: RecentCall[] = Array.isArray(data?.calls) ? data.calls.slice(0, DEFAULT_CALL_LIMIT) : []
    await setState((draft) => {
      draft.recentCalls = calls
    })
  } catch (error) {
    if (!isAuthMessageError(error)) {
      console.warn('[Extension] Failed to load recent calls:', error)
    }
  }
}

async function loadAccountContacts(accountId?: string | null, fallbackOrigin?: string | null) {
  const normalizedAccountId = trimText(accountId || '')

  if (!normalizedAccountId) {
    await setState((draft) => {
      draft.accountContacts = []
    })
    return []
  }

  const data = await fetchAuthedJson(
    `/api/extension/account-contacts?accountId=${encodeURIComponent(normalizedAccountId)}`,
    { method: 'GET' },
    fallbackOrigin
  )

  const contacts: NonNullable<MatchResult['contact']>[] = Array.isArray(data?.contacts)
    ? data.contacts
        .map((item: unknown) => normalizeMatchContact(item))
        .filter((item: NonNullable<MatchResult['contact']>) => Boolean(item))
    : []

  await setState((draft) => {
    draft.accountContacts = contacts
  })

  return contacts
}

function collectPageSnapshot() {
  const normalize = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ')

  const title = normalize(document.title)
  const description = normalize(
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      ''
  )
  const selectedText = normalize(window.getSelection?.()?.toString?.() || '')
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map((node) => normalize((node as HTMLElement).innerText || node.textContent || ''))
    .filter(Boolean)
    .slice(0, 8)
  const bodyText = normalize(document.body?.innerText || document.documentElement?.innerText || '').slice(0, 5000)
  const emails = Array.from(new Set((bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((value) => value.toLowerCase().trim())))
  const phones = Array.from(
    new Set(
      (bodyText.match(/(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}/g) || [])
        .map((value) => value.replace(/\D/g, '').slice(-10))
        .filter((value) => value.length >= 10)
    )
  )

  return { title, url: location.href, selectedText, description, headings, emails, phones, bodyText }
}

async function captureActiveTab(windowId?: number | null) {
  const query = windowId != null ? { active: true, windowId } : { active: true, currentWindow: true }
  const [tab] = await chrome.tabs.query(query)
  if (!tab?.id || !tab.url) {
    throw new Error('No active tab found.')
  }

  let probe: any = null
  try {
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageSnapshot,
    })
    probe = injection?.[0]?.result || null
  } catch (error) {
    console.warn('[Extension] Page probe failed:', error)
  }

  let screenshot: string | null = null
  const now = Date.now()
  if (now - lastScreenshotTaken >= SCREENSHOT_COOLDOWN_MS) {
    try {
      screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
      lastScreenshotTaken = now
    } catch (error) {
      console.warn('[Extension] Screenshot capture failed:', error)
    }
  } else {
    screenshot = latestScreenshot
  }

  const snapshot: PageSnapshot = {
    url: trimText(probe?.url || tab.url),
    origin: normalizeOrigin(probe?.url || tab.url) || trimText(new URL(tab.url).origin),
    title: trimText(probe?.title || tab.title || ''),
    selectedText: trimText(probe?.selectedText || ''),
    description: trimText(probe?.description || ''),
    headings: Array.isArray(probe?.headings) ? probe.headings.map((item: unknown) => trimText(item)).filter(Boolean) : [],
    emails: Array.isArray(probe?.emails) ? probe.emails.map((item: unknown) => trimText(item).toLowerCase()).filter(Boolean) : [],
    phones: Array.isArray(probe?.phones) ? probe.phones.map((item: unknown) => trimText(item)).filter(Boolean) : [],
    capturedAt: nowIso(),
  }

  latestBodyText = trimText(probe?.bodyText || '')
  latestScreenshot = screenshot

  return { tab, snapshot, screenshot }
}

function renderPageBadge(payload: PageBadgePayload | null) {
  const existing = document.getElementById('nodal-point-page-badge-root')
  if (existing) {
    existing.remove()
  }

  if (!payload) return

  const root = document.createElement('div')
  root.id = 'nodal-point-page-badge-root'
  root.style.position = 'fixed'
  root.style.top = '120px'
  root.style.right = '0'
  root.style.zIndex = '2147483647'
  root.style.pointerEvents = 'auto'

  const host = document.createElement('button')
  host.type = 'button'
  host.setAttribute('aria-label', `Open Nodal Point for ${payload.accountName}`)
  host.style.all = 'unset'
  host.style.display = 'flex'
  host.style.alignItems = 'center'
  host.style.justifyContent = 'center'
  host.style.width = '42px'
  host.style.height = '42px'
  host.style.marginRight = '0'
  host.style.borderTopLeftRadius = '12px'
  host.style.borderBottomLeftRadius = '12px'
  host.style.borderTopRightRadius = '0'
  host.style.borderBottomRightRadius = '0'
  host.style.border = '1px solid rgba(255,255,255,0.12)'
  host.style.borderRight = 'none'
  host.style.background = 'rgba(0, 47, 167, 0.92)'
  host.style.boxShadow = '0 10px 24px rgba(0,0,0,0.4)'
  host.style.cursor = 'pointer'
  host.style.position = 'relative'
  host.style.overflow = 'hidden'

  const icon = document.createElement('img')
  icon.src = (chrome.runtime?.getURL ? chrome.runtime.getURL('icon32.png') : '') || ''
  icon.alt = ''
  icon.style.width = '26px'
  icon.style.height = '26px'
  icon.style.objectFit = 'contain'
  icon.style.pointerEvents = 'none'

  host.appendChild(icon)

  host.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }, () => {
      void chrome.runtime.lastError
    })
  })

  root.appendChild(host)
  document.documentElement.appendChild(root)
}

function normalizeMatchAccount(raw: any): MatchResult['account'] {
  if (!raw) return null
  return {
    id: trimText(raw.id),
    name: trimText(raw.name || raw.domain || raw.website || 'Unknown account'),
    domain: trimText(raw.domain) || null,
    industry: trimText(raw.industry || raw.metadata?.industry) || null,
    city: trimText(raw.city) || null,
    state: trimText(raw.state) || null,
    phone: trimText(raw.phone) || null,
    logoUrl: trimText(raw.logoUrl || raw.logo_url || raw.metadata?.logoUrl || raw.metadata?.logo_url) || null,
    description: trimText(raw.description) || null,
    website: trimText(raw.website || raw.metadata?.website) || null,
    score: Number(raw.score || raw.matchScore || 0) || 0,
    reason: trimText(raw.reason || raw.matchReason || 'Matched from CRM data') || 'Matched from CRM data',
  }
}

function normalizeMatchContact(raw: any): MatchResult['contact'] {
  if (!raw) return null
  const firstName = trimText(raw.firstName || raw.first_name)
  const lastName = trimText(raw.lastName || raw.last_name)
  const name = trimText(raw.name || [firstName, lastName].filter(Boolean).join(' ') || raw.email || 'Unknown contact')
  return {
    id: trimText(raw.id),
    accountId: trimText(raw.accountId || raw.account_id) || null,
    accountName: trimText(raw.accountName || raw.accounts?.name) || null,
    accountDomain: trimText(raw.accountDomain || raw.accounts?.domain) || null,
    name,
    email: trimText(raw.email) || null,
    title: trimText(raw.title) || null,
    phone: trimText(raw.phone) || null,
    mobile: trimText(raw.mobile) || null,
    workPhone: trimText(raw.workPhone) || null,
    companyPhone: trimText(raw.companyPhone) || null,
    city: trimText(raw.city) || null,
    state: trimText(raw.state) || null,
    score: Number(raw.score || raw.matchScore || 0) || 0,
    reason: trimText(raw.reason || raw.matchReason || 'Matched from CRM data') || 'Matched from CRM data',
  }
}

async function matchPageAgainstCrm(snapshot: PageSnapshot) {
  if (!state.auth?.accessToken) {
    throw new Error('Connect your Nodal Point session before matching a page.')
  }

  const payload = {
    ...snapshot,
    bodyText: latestBodyText,
    screenshot: null,
    appOrigin: state.auth.appOrigin || snapshot.origin || DEFAULT_APP_ORIGIN,
  }

  const data = await fetchAuthedJson(
    '/api/extension/match',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    snapshot.origin
  )

  const match: MatchResult = {
    account: normalizeMatchAccount(data?.account),
    contact: normalizeMatchContact(data?.contact),
    accounts: Array.isArray(data?.accounts) ? data.accounts.map(normalizeMatchAccount).filter(Boolean) : [],
    contacts: Array.isArray(data?.contacts) ? data.contacts.map(normalizeMatchContact).filter(Boolean) : [],
    summary: trimText(data?.summary || 'No existing CRM match found.'),
    matchedAt: trimText(data?.matchedAt || nowIso()) || nowIso(),
  }

  await setState((draft) => {
    draft.page = snapshot
    draft.match = match
  })

  try {
    await loadAccountContacts(match.account?.id || null, snapshot.origin)
  } catch (error) {
    console.warn('[Extension] Account contacts load failed:', error)
    await setState((draft) => {
      draft.accountContacts = []
    })
  }

  return match
}

async function syncPageBadge(tabId: number | null | undefined, match: MatchResult | null) {
  if (!tabId || !match?.account?.id) {
    try {
      if (tabId) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: renderPageBadge,
          args: [null],
        })
      }
    } catch (error) {
      console.warn('[Extension] Page badge clear failed:', error)
    }
    return
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderPageBadge,
      args: [
        {
          accountName: match.account.name,
          accountId: match.account.id,
          domain: match.account.domain || match.account.website || null,
          contactCount: Array.isArray(match.contacts) ? match.contacts.length : 0,
        },
      ],
    })
  } catch (error) {
    console.warn('[Extension] Page badge inject failed:', error)
  }
}

async function captureAndMatch(windowId?: number | null) {
  if (!state.auth?.accessToken) {
    throw new Error('Connect your Nodal Point session before capturing CRM records.')
  }

  const { tab, snapshot, screenshot } = await captureActiveTab(windowId)
  await setState((draft) => {
    draft.page = snapshot
    draft.match = null
    draft.accountContacts = []
  })
  const match = await matchPageAgainstCrm(snapshot)
  await syncPageBadge(tab?.id || null, match)
  return { snapshot, screenshot, match }
}

let activeTabCaptureTimer: ReturnType<typeof setTimeout> | null = null

function isCaptureableTabUrl(url: string | null | undefined) {
  const value = trimText(url || '')
  return /^https?:\/\//i.test(value)
}

function scheduleActiveTabCapture(windowId?: number | null) {
  if (activeTabCaptureTimer !== null) {
    clearTimeout(activeTabCaptureTimer)
  }

  activeTabCaptureTimer = setTimeout(() => {
    void (async () => {
      await hydrateState()
      if (!state.auth?.accessToken) return

      try {
        const query = windowId != null ? { active: true, windowId } : { active: true, currentWindow: true }
        const [tab] = await chrome.tabs.query(query)
        if (!tab?.url || !isCaptureableTabUrl(tab.url)) return
        if (trimText(state.page?.url || '') === trimText(tab.url)) {
          await syncPageBadge(tab.id || null, state.match)
          return
        }
        await captureAndMatch(windowId)
      } catch (error) {
        console.warn('[Extension] Auto capture after tab change failed:', error)
      }
    })()
  }, 800)
}

let lastScreenshotTaken = 0
const SCREENSHOT_COOLDOWN_MS = 5000

async function saveTransmissionNote(payload: any) {
  if (!state.auth?.accessToken) {
    throw new Error('Connect your Nodal Point session before saving notes.')
  }

  const note = trimText(payload?.note || payload?.text || '')
  if (!note) {
    throw new Error('Enter a note before saving it.')
  }

  const contactId = trimText(payload?.contactId || state.match?.contact?.id) || ''
  const accountId = trimText(payload?.accountId || state.match?.account?.id) || ''
  const title = buildTransmissionTaskTitle(state.page, state.match)
  const description = buildTransmissionNoteBody({
    note,
    page: state.page,
    match: state.match,
    auth: state.auth,
  })

  const taskPayload = {
    title,
    description,
    priority: payload?.priority || 'low',
    status: payload?.status || 'pending',
    contactId: contactId || undefined,
    accountId: accountId || undefined,
    userEmail: state.auth.email || undefined,
    metadata: {
      source: 'browser-extension',
      noteType: 'transmission_log',
      page: state.page
        ? {
            title: state.page.title,
            url: state.page.url,
            origin: state.page.origin,
            selectedText: state.page.selectedText,
          }
        : null,
      match: state.match
        ? {
            accountId: state.match.account?.id || null,
            contactId: state.match.contact?.id || null,
            summary: state.match.summary,
          }
        : null,
      screenshot: false,
    },
  }

  const data = await fetchAuthedJson(
    '/api/tasks/create-task-with-invite',
    {
      method: 'POST',
      body: JSON.stringify(taskPayload),
    },
    state.auth.appOrigin
  )

  const noteEntry = {
    id: crypto.randomUUID(),
    text: description,
    createdAt: nowIso(),
    source: payload?.source === 'ai' ? 'ai' : 'manual',
    targetType: contactId ? 'contact' : accountId ? 'account' : 'page',
    targetId: contactId || accountId || null,
    title,
    savedToCrm: true,
  } as const

  await setState((draft) => {
    draft.notes = [noteEntry, ...draft.notes].slice(0, DEFAULT_NOTE_LIMIT)
  })

  return { ok: true, task: data?.task || null, note: noteEntry }
}

async function loadRecentCallsForState() {
  await refreshRecentCalls(state.auth?.appOrigin || null)
}

async function chatWithAi(payload: any) {
  if (!state.auth?.accessToken) {
    throw new Error('Connect your Nodal Point session before using AI.')
  }

  const prompt = trimText(payload?.prompt || '')
  const focus = payload?.mode === 'summary' ? 'summary' : payload?.mode === 'recap' ? 'recap' : 'chat'
  const userMessages = Array.isArray(payload?.messages)
    ? payload.messages
        .filter((item: any) => item && typeof item === 'object')
        .slice(-10)
        .map((item: any) => ({ role: item.role === 'assistant' ? 'model' : 'user', content: trimText(item.content || '') }))
        .filter((item: any) => item.content)
    : []

  const systemPrompt = buildContextPrompt({
    page: state.page,
    match: state.match,
    call: state.call,
    noteDraft: trimText(payload?.noteDraft || ''),
    focus,
  })

  const messages = [
    { role: 'system', content: systemPrompt },
    ...userMessages,
    { role: 'user', content: prompt || 'Continue.' },
  ]

  const data = await fetchAuthedJson(
    '/api/gemini/chat',
    {
      method: 'POST',
      body: JSON.stringify({
        model: payload?.model || 'gemini-3-flash-preview',
        messages,
      }),
    },
    state.auth.appOrigin
  )

  const content = trimText(data?.content || data?.message || '')
  if (!content) {
    throw new Error('The AI service returned an empty response.')
  }

  const userEntry = { role: 'user' as const, content: prompt || 'Continue.', createdAt: nowIso() }
  const assistantEntry = { role: 'assistant' as const, content, createdAt: nowIso() }

  await setState((draft) => {
    draft.chat = [...draft.chat, userEntry, assistantEntry].slice(-DEFAULT_CHAT_LIMIT)
  })

  return { content, provider: data?.provider || 'gemini', model: data?.model || payload?.model || 'gemini-3-flash-preview' }
}

function updateBadgeFromState() {
  const call = state.call
  let text = ''
  let color = '#0f172a'

  if (call.state === 'incoming') {
    text = '1'
    color = '#ef4444'
  } else if (call.state === 'connected' || call.state === 'dialing') {
    text = 'LIVE'
    color = '#002fa7'
  } else if (call.enabled) {
    text = 'ON'
    color = '#2563eb'
  }

  chrome.action.setBadgeText({ text }).catch(() => {})
  if (text) {
    chrome.action.setBadgeBackgroundColor({ color }).catch(() => {})
  }

  const title = call.state === 'incoming'
    ? `Nodal Point Command Deck • Incoming call ${call.incomingDisplay ? `from ${call.incomingDisplay}` : ''}`
    : call.state === 'connected'
      ? 'Nodal Point Command Deck • Call connected'
      : call.enabled
        ? 'Nodal Point Command Deck • Calls enabled'
        : 'Nodal Point Command Deck'

  chrome.action.setTitle({ title }).catch(() => {})
}

async function updateBadge() {
  await updateBadgeFromState()
}

async function openSidePanelForCurrentWindow() {
  const windowInfo = await chrome.windows.getLastFocused()
  if (windowInfo?.id != null) {
    await chrome.sidePanel.open({ windowId: windowInfo.id })
  }
}

async function handleAuthSync(payload: any, sender: { origin?: string | null }) {
  const appOrigin = normalizeOrigin(payload?.appOrigin || sender.origin || state.auth?.appOrigin || DEFAULT_APP_ORIGIN)
  const normalized = normalizeAuthPayload(payload, appOrigin)
  if (!normalized) {
    await handleAuthClear()
    return { ok: false, error: 'Missing session payload' }
  }

  const previousIdentity = state.auth?.userId || state.auth?.email || ''
  const nextIdentity = normalized.userId || normalized.email || ''
  const identityChanged = Boolean(previousIdentity && nextIdentity && previousIdentity !== nextIdentity)

  await setState((draft) => {
    draft.auth = normalized
    draft.call = identityChanged ? defaultCallState() : draft.call
    draft.page = identityChanged ? null : draft.page
    draft.match = identityChanged ? null : draft.match
    draft.accountContacts = identityChanged ? [] : draft.accountContacts
  })

  try {
    await loadBootstrapProfile(appOrigin)
  } catch (error) {
    console.warn('[Extension] Bootstrap profile load failed:', error)
  }

  try {
    await refreshRecentCalls(appOrigin)
  } catch (error) {
    console.warn('[Extension] Recent calls refresh failed:', error)
  }

  try {
    if (state.match?.account?.id) {
      await loadAccountContacts(state.match.account.id, appOrigin)
    }
  } catch (error) {
    console.warn('[Extension] Account contacts refresh failed:', error)
  }

  try {
    await handleAutoCallBootstrap(appOrigin)
  } catch (error) {
    await setState((draft) => {
      draft.call.state = 'error'
      draft.call.enabled = true
      draft.call.lastError = trimText((error as Error)?.message || 'Failed to initialize calls.')
    })
  }

  return { ok: true, state: cloneState() }
}

async function handleAuthClear() {
  const priorNotes = state.notes
  await setState((draft) => {
    draft.auth = null
    draft.page = null
    draft.match = null
    draft.accountContacts = []
    draft.call = defaultCallState()
    draft.recentCalls = []
    draft.notes = priorNotes
    draft.chat = draft.chat.slice(-DEFAULT_CHAT_LIMIT)
  })

  try {
    await sendExtensionMessage({ type: 'TWILIO_DISPOSE' })
  } catch {
    // ignore
  }

  try {
    await chrome.notifications.clear(INCOMING_NOTIFICATION_ID)
  } catch {
    // ignore
  }

  return { ok: true, state: cloneState() }
}

async function handleEnableCalls(payload: any) {
  return handleAutoCallBootstrap(payload?.appOrigin || state.auth?.appOrigin || null, payload?.callerId || null)
}

async function handleAutoCallBootstrap(fallbackOrigin?: string | null, callerId?: string | null) {
  if (!state.auth?.accessToken) {
    throw new Error('Connect your Nodal Point session before enabling calls.')
  }

  if (
    state.call.enabled &&
    state.call.deviceReady &&
    (state.call.state === 'ready' || state.call.state === 'incoming' || state.call.state === 'connected' || state.call.state === 'dialing')
  ) {
    return { ok: true, state: cloneState() }
  }

  await setState((draft) => {
    draft.call.enabled = true
    draft.call.state = 'initializing'
    draft.call.deviceReady = false
    draft.call.lastError = null
  })

  await ensureOffscreenDocument()
  const initResult = await sendExtensionMessage({
    type: 'TWILIO_INIT',
    payload: {
      identity: `agent-${state.auth.userId || state.auth.email || 'agent'}`,
      apiBase: getApiOrigin(fallbackOrigin || state.auth.appOrigin),
      callerId: callerId || getCallerId(),
      auth: state.auth,
    },
  })

  if (initResult && initResult.ok === false) {
    const errMsg = trimText(initResult.error || 'Twilio failed to initialize.')
    console.error('[Extension] TWILIO_INIT failed:', errMsg)
    await setState((draft) => {
      draft.call.state = 'error'
      draft.call.lastError = errMsg
    })
    return { ok: false, state: cloneState() }
  }

  // Recovery: if the device is still stuck in 'initializing' after 15s, retry once automatically
  setTimeout(() => {
    void (async () => {
      if (state.call.state === 'initializing' && state.call.enabled && !state.call.deviceReady && state.auth?.accessToken) {
        console.warn('[Extension] Call device stuck in initializing — auto-retrying bootstrap')
        try {
          await ensureOffscreenDocument()
          const retryResult = await sendExtensionMessage({
            type: 'TWILIO_INIT',
            payload: {
              identity: `agent-${state.auth?.userId || state.auth?.email || 'agent'}`,
              apiBase: getApiOrigin(state.auth?.appOrigin),
              callerId: getCallerId(),
              auth: state.auth,
            },
          })
          if (retryResult && retryResult.ok === false) {
            const errMsg = trimText(retryResult.error || 'Twilio failed to initialize on retry.')
            console.error('[Extension] TWILIO_INIT retry failed:', errMsg)
            await setState((draft) => {
              draft.call.state = 'error'
              draft.call.lastError = errMsg
            })
          }
        } catch (error) {
          console.warn('[Extension] Auto-retry bootstrap failed:', error)
          await setState((draft) => {
            draft.call.state = 'error'
            draft.call.lastError = trimText((error as Error)?.message || 'Call device failed to initialize. Check microphone permission.')
          })
        }
      }
    })()
  }, 15000)

  return { ok: true, state: cloneState() }
}

async function handleDisableCalls() {
  await setState((draft) => {
    draft.call.enabled = false
    draft.call.state = 'idle'
    draft.call.deviceReady = false
    draft.call.muted = false
    draft.call.startedAt = null
    draft.call.durationSec = 0
    draft.call.activeCallSid = null
    draft.call.incomingFrom = null
    draft.call.incomingDisplay = null
    draft.call.incomingContactId = null
    draft.call.incomingAccountId = null
    draft.call.incomingContactName = null
    draft.call.incomingAccountName = null
    draft.call.lineStatus = null
    draft.call.lastError = null
  })

  try {
    await sendExtensionMessage({ type: 'TWILIO_DISPOSE' })
  } catch {
    // ignore
  }

  try {
    await chrome.notifications.clear(INCOMING_NOTIFICATION_ID)
  } catch {
    // ignore
  }

  return { ok: true, state: cloneState() }
}

async function handleDialCall(payload: any) {
  if (!state.auth?.accessToken) {
    throw new Error('Connect your Nodal Point session before making calls.')
  }

  const destination = trimText(payload?.to || payload?.phone || state.match?.contact?.phone || state.match?.account?.phone)
  if (!destination) {
    throw new Error('Enter a phone number to call.')
  }

  await ensureOffscreenDocument()
  await setState((draft) => {
    draft.call.state = 'dialing'
    draft.call.startedAt = nowIso()
    draft.call.durationSec = 0
    draft.call.activeCallSid = null
    draft.call.lastError = null
  })

  await sendExtensionMessage({
    type: 'TWILIO_DIAL',
    payload: {
      to: destination,
      callerId: trimText(payload?.from || getCallerId()),
      metadata: {
        contactId: payload?.contactId || state.match?.contact?.id || null,
        accountId: payload?.accountId || state.match?.account?.id || null,
        page: state.page
          ? { title: state.page.title, url: state.page.url, origin: state.page.origin }
          : null,
        match: state.match
          ? {
              summary: state.match.summary,
              contactId: state.match.contact?.id || null,
              accountId: state.match.account?.id || null,
            }
          : null,
      },
    },
  })

  return { ok: true, state: cloneState() }
}

async function handleAnswerCall() {
  await ensureOffscreenDocument()
  await sendExtensionMessage({ type: 'TWILIO_ANSWER' })
  return { ok: true, state: cloneState() }
}

async function handleHangupCall() {
  await sendExtensionMessage({ type: 'TWILIO_HANGUP' })
  return { ok: true, state: cloneState() }
}

async function handleMuteCall(payload: any) {
  await sendExtensionMessage({
    type: 'TWILIO_MUTE',
    payload: { muted: Boolean(payload?.muted) },
  })
  await setState((draft) => {
    draft.call.muted = Boolean(payload?.muted)
  })
  return { ok: true, state: cloneState() }
}

async function handleDigits(payload: any) {
  const digits = trimText(payload?.digits)
  if (!digits) throw new Error('Enter digits to send.')
  await sendExtensionMessage({ type: 'TWILIO_DIGITS', payload: { digits } })
  return { ok: true, state: cloneState() }
}

async function handleOpenRecord(payload: any) {
  const type = trimText(payload?.type || payload?.recordType)
  const id = trimText(payload?.id || payload?.recordId)
  const origin = getApiOrigin(payload?.appOrigin || state.auth?.appOrigin || state.page?.origin)
  const finalType = type || (state.match?.contact ? 'contact' : 'account')
  const finalId = id || (finalType === 'contact' ? state.match?.contact?.id : state.match?.account?.id) || ''

  if (!finalId) {
    throw new Error('No CRM record is selected yet.')
  }

  const path = finalType === 'contact' ? `/network/contacts/${finalId}` : `/network/accounts/${finalId}`
  await chrome.tabs.create({ url: `${origin}${path}` })
  return { ok: true }
}

async function handlePageMatchRequest() {
  const { snapshot, screenshot, match } = await captureAndMatch()
  return { ok: true, snapshot, screenshot, match, state: cloneState() }
}

async function handleTaskSave(payload: any) {
  const result = await saveTransmissionNote(payload)
  return { ...result, state: cloneState() }
}

async function handleAiChat(payload: any) {
  const result = await chatWithAi(payload)
  return { ok: true, ...result, state: cloneState() }
}

async function handlePhoneLookup(payload: any) {
  const phone = trimText(payload?.phone || '')
  if (!phone) throw new Error('Enter a phone number first.')
  const data = await fetchAuthedJson(`/api/search?phone=${encodeURIComponent(phone)}`, { method: 'GET' }, payload?.appOrigin)
  return { ok: true, data, state: cloneState() }
}

async function handleTwilioEvent(payload: any) {
  const kind = trimText(payload?.kind || payload?.status || '')
  const from = trimText(payload?.from || payload?.caller || payload?.incomingFrom || '')
  const callSid = trimText(payload?.callSid || payload?.sid || payload?.activeCallSid || '')

  if (kind === 'ready') {
    await setState((draft) => {
      draft.call.state = 'ready'
      draft.call.deviceReady = true
      draft.call.lineStatus = 'registered'
      draft.call.lastError = null
    })
    try {
      await chrome.notifications.clear(INCOMING_NOTIFICATION_ID)
    } catch {
      // ignore
    }
    return { ok: true, state: cloneState() }
  }

  if (kind === 'incoming') {
    let incomingDisplay = trimText(payload?.displayName || payload?.label || '')
    let incomingContactId: string | null = trimText(payload?.contactId || '') || null
    let incomingAccountId: string | null = trimText(payload?.accountId || '') || null
    let incomingContactName: string | null = trimText(payload?.contactName || '') || null
    let incomingAccountName: string | null = trimText(payload?.accountName || '') || null

    const candidates = extractPhoneCandidates(from)
    if ((!incomingDisplay || !incomingContactName) && candidates.length > 0 && state.auth?.accessToken) {
      try {
        const lookup = await fetchAuthedJson(`/api/search?phone=${encodeURIComponent(candidates[0])}`, { method: 'GET' }, state.auth.appOrigin)
        incomingContactId = trimText(lookup?.contact?.contactId || lookup?.contact?.id || incomingContactId || '') || null
        incomingAccountId = trimText(lookup?.account?.accountId || lookup?.account?.id || incomingAccountId || '') || null
        incomingContactName = trimText(lookup?.contact?.name || incomingContactName || '') || null
        incomingAccountName = trimText(lookup?.contact?.account || lookup?.account?.name || incomingAccountName || '') || null
        incomingDisplay = trimText([incomingContactName, incomingAccountName].filter(Boolean).join(' • ') || lookup?.contact?.name || lookup?.account?.name || from)
      } catch (error) {
        console.warn('[Extension] Caller lookup failed:', error)
      }
    }

    await setState((draft) => {
      draft.call.state = 'incoming'
      draft.call.deviceReady = true
      draft.call.activeCallSid = callSid || draft.call.activeCallSid
      draft.call.startedAt = draft.call.startedAt || nowIso()
      draft.call.durationSec = 0
      draft.call.incomingFrom = from || draft.call.incomingFrom
      draft.call.incomingDisplay = incomingDisplay || from || draft.call.incomingDisplay
      draft.call.incomingContactId = incomingContactId
      draft.call.incomingAccountId = incomingAccountId
      draft.call.incomingContactName = incomingContactName
      draft.call.incomingAccountName = incomingAccountName
      draft.call.lineStatus = 'incoming'
      draft.call.lastError = null
    })

    try {
      await chrome.notifications.clear(INCOMING_NOTIFICATION_ID)
    } catch {
      // ignore
    }

    try {
      await chrome.notifications.create(INCOMING_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon.svg'),
        title: 'Incoming call',
        message: incomingDisplay || from || 'A call is ringing in Nodal Point.',
        priority: 2,
        requireInteraction: true,
      })
    } catch (error) {
      console.warn('[Extension] Notification failed:', error)
    }

    return { ok: true, state: cloneState() }
  }

  if (kind === 'dialing') {
    await setState((draft) => {
      draft.call.state = 'dialing'
      draft.call.deviceReady = true
      draft.call.activeCallSid = callSid || draft.call.activeCallSid
      draft.call.startedAt = draft.call.startedAt || nowIso()
      draft.call.lineStatus = 'dialing'
      draft.call.lastError = null
      draft.call.incomingFrom = from || draft.call.incomingFrom
    })
    return { ok: true, state: cloneState() }
  }

  if (kind === 'connected') {
    await setState((draft) => {
      draft.call.state = 'connected'
      draft.call.deviceReady = true
      draft.call.activeCallSid = callSid || draft.call.activeCallSid
      draft.call.startedAt = draft.call.startedAt || nowIso()
      draft.call.lineStatus = 'connected'
      draft.call.lastError = null
      draft.call.durationSec = 0
      draft.call.incomingFrom = from || draft.call.incomingFrom
    })
    try {
      await chrome.notifications.clear(INCOMING_NOTIFICATION_ID)
    } catch {
      // ignore
    }
    return { ok: true, state: cloneState() }
  }

  if (kind === 'muted') {
    await setState((draft) => {
      draft.call.muted = Boolean(payload?.muted)
    })
    return { ok: true, state: cloneState() }
  }

  if (kind === 'ended' || kind === 'disconnected' || kind === 'cancelled') {
    const durationSec = Number(payload?.durationSec || payload?.duration || state.call.durationSec || 0) || 0
    await setState((draft) => {
      draft.call.state = 'ended'
      draft.call.deviceReady = true
      draft.call.activeCallSid = null
      draft.call.startedAt = null
      draft.call.durationSec = durationSec
      draft.call.muted = false
      draft.call.incomingFrom = null
      draft.call.incomingDisplay = null
      draft.call.incomingContactId = null
      draft.call.incomingAccountId = null
      draft.call.incomingContactName = null
      draft.call.incomingAccountName = null
      draft.call.lineStatus = kind
      draft.call.lastError = null
    })

    try {
      await refreshRecentCalls(state.auth?.appOrigin || null)
    } catch (error) {
      console.warn('[Extension] Refreshing recent calls after hangup failed:', error)
    }

    try {
      await chrome.notifications.clear(INCOMING_NOTIFICATION_ID)
    } catch {
      // ignore
    }

    return { ok: true, state: cloneState() }
  }

  if (kind === 'error') {
    await setState((draft) => {
      draft.call.state = 'error'
      draft.call.deviceReady = false
      draft.call.lastError = trimText(payload?.message || payload?.error || 'Unexpected Twilio error.')
      draft.call.lineStatus = 'error'
    })
    try {
      await chrome.notifications.clear(INCOMING_NOTIFICATION_ID)
    } catch {
      // ignore
    }
    return { ok: true, state: cloneState() }
  }

  if (kind === 'state') {
    return { ok: true, state: cloneState() }
  }

  return { ok: false, state: cloneState() }
}

async function handleRecentCallsRefresh() {
  await loadRecentCallsForState()
  return { ok: true, state: cloneState() }
}

async function handleOpenSidePanel(sender?: { tab?: { id?: number } }) {
  if (sender?.tab?.id) {
    await chrome.sidePanel.open({ tabId: sender.tab.id })
    return { ok: true, state: cloneState() }
  }
  await openSidePanelForCurrentWindow()
  return { ok: true, state: cloneState() }
}

// Configure side panel behavior to open on toolbar icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

chrome.action.onClicked.addListener((tab: any) => {
  if (tab.windowId) {
    void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
  }
})

chrome.runtime.onStartup.addListener(() => {
  void hydrateState().then(() => {
    if (state.call.enabled && state.auth?.accessToken) {
      void ensureOffscreenDocument().then(() => {
        void sendExtensionMessage({
          type: 'TWILIO_INIT',
          payload: {
            identity: `agent-${state.auth?.userId || state.auth?.email || 'agent'}`,
            apiBase: getApiOrigin(),
            callerId: getCallerId(),
            auth: state.auth,
          },
        }).catch((error) => {
          console.warn('[Extension] Failed to restart Twilio after startup:', error)
        })
      })
    }
  })
})

chrome.tabs.onActivated.addListener((activeInfo: TabActiveInfo) => {
  scheduleActiveTabCapture(activeInfo.windowId)
})

chrome.tabs.onUpdated.addListener((_tabId: number, changeInfo: TabChangeInfo, tab: CapturedTab) => {
  if (changeInfo.status !== 'complete') return
  if (!tab?.active) return
  if (!isCaptureableTabUrl(tab.url)) return
  scheduleActiveTabCapture(tab.windowId)
})

chrome.windows.onFocusChanged.addListener((windowId: number) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  scheduleActiveTabCapture(windowId)
})

chrome.notifications.onClicked.addListener(() => {
  void openSidePanelForCurrentWindow().catch((error) => {
    console.warn('[Extension] Failed to open side panel from notification click:', error)
  })
})

chrome.notifications.onButtonClicked.addListener(() => {
  void openSidePanelForCurrentWindow().catch((error) => {
    console.warn('[Extension] Failed to open side panel from notification button:', error)
  })
})

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (value: any) => void) => {
  void (async () => {
    await hydrateState()

    try {
      if (!message || typeof message !== 'object') {
        sendResponse({ ok: false, error: 'Invalid message' })
        return
      }

      switch (message.type) {
        case 'GET_STATE':
          sendResponse({ ok: true, state: cloneState() })
          return
        case 'AUTH_SYNC':
          sendResponse(await handleAuthSync(message.payload, sender))
          return
        case 'AUTH_CLEAR':
          sendResponse(await handleAuthClear())
          return
        case 'CAPTURE_AND_MATCH':
          sendResponse(await handlePageMatchRequest())
          return
        case 'ENABLE_CALLS':
          sendResponse(await handleEnableCalls(message.payload))
          return
        case 'DISABLE_CALLS':
          sendResponse(await handleDisableCalls())
          return
        case 'CALL_DIAL':
          sendResponse(await handleDialCall(message.payload))
          return
        case 'CALL_ANSWER':
          sendResponse(await handleAnswerCall())
          return
        case 'CALL_HANGUP':
          sendResponse(await handleHangupCall())
          return
        case 'CALL_MUTE':
          sendResponse(await handleMuteCall(message.payload))
          return
        case 'CALL_DIGITS':
          sendResponse(await handleDigits(message.payload))
          return
        case 'SAVE_NOTE':
          sendResponse(await handleTaskSave(message.payload))
          return
        case 'CHAT_AI':
          sendResponse(await handleAiChat(message.payload))
          return
        case 'OPEN_RECORD':
          sendResponse(await handleOpenRecord(message.payload))
          return
        case 'OFFSCREEN_PING':
          sendResponse({ ok: true, state: cloneState() })
          return
        case 'TWILIO_EVENT':
          sendResponse(await handleTwilioEvent(message.payload))
          return
        case 'PHONE_LOOKUP':
          sendResponse(await handlePhoneLookup(message.payload))
          return
        case 'REQUEST_RECENT_CALLS':
          sendResponse(await handleRecentCallsRefresh())
          return
        case 'OPEN_SIDE_PANEL':
          sendResponse(await handleOpenSidePanel(sender))
          return
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${message.type}` })
          return
      }
    } catch (error) {
      const messageText = trimText((error as Error)?.message || 'Extension request failed.')
      if (message.type === 'CALL_DIAL' || message.type === 'ENABLE_CALLS' || message.type === 'CHAT_AI' || message.type === 'SAVE_NOTE') {
        await setState((draft) => {
          draft.call.lastError = messageText
          if (message.type !== 'CHAT_AI' && message.type !== 'SAVE_NOTE') {
            draft.call.state = 'error'
          }
        }).catch(() => {})
      }
      sendResponse({ ok: false, error: messageText })
    }
  })()

  return true
})

void hydrateState().then(() => {
  if (state.auth?.accessToken) {
    void handleAutoCallBootstrap(state.auth.appOrigin, getCallerId()).catch((error) => {
      console.warn('[Extension] Initial Twilio bootstrap failed:', error)
    })
  }
})

setInterval(() => {
  const call = state.call
  if (call.state === 'connected' || call.state === 'dialing' || call.state === 'incoming') {
    const startedAt = call.startedAt
    const duration = startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : call.durationSec
    if (duration !== call.durationSec) {
      void setState((draft) => {
        draft.call.durationSec = duration
      })
    }
  }
  void updateBadgeFromState()
}, 1000)
