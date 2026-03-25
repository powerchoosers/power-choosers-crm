import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  buildRecentActivityLabel,
  defaultCallState,
  formatElapsed,
  formatPhone,
  STATE_KEY,
  trimText,
  type ExtensionState,
  type MatchAccount,
  type MatchContact,
  type RecentCall,
} from '../shared'

type MessageResponse<T> = {
  ok: boolean
  error?: string
  state?: ExtensionState
} & T

function sendMessage<T = Record<string, unknown>>(type: string, payload?: unknown): Promise<MessageResponse<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response: MessageResponse<T>) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      if (!response) {
        reject(new Error(`No response from ${type}`))
        return
      }
      if (response && response.ok === false) {
        reject(new Error(response.error || `Request failed: ${type}`))
        return
      }
      resolve(response)
    })
  })
}

function snippet(value: string | null | undefined, max = 180) {
  const text = trimText(value)
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatStatusLabel(state: ExtensionState | null) {
  if (!state?.auth) return 'Disconnected'
  if (state.call.state === 'incoming') return 'Incoming call'
  if (state.call.state === 'connected') return 'Live call'
  if (state.call.state === 'dialing') return 'Dialing'
  if (state.call.enabled) return 'Calls enabled'
  return 'Connected'
}

function primaryPhone(account: MatchAccount | null, contact: MatchContact | null, pagePhone: string | null) {
  return (
    trimText(contact?.phone || contact?.mobile || contact?.workPhone || contact?.companyPhone || account?.phone || pagePhone || '') ||
    ''
  )
}

function chipList(values: string[]) {
  return values.filter(Boolean).map((value) => trimText(value))
}

function EntryRow({
  title,
  detail,
  tone = 'neutral',
}: {
  title: string
  detail: string
  tone?: 'neutral' | 'blue' | 'green' | 'red' | 'amber'
}) {
  const pillClass =
    tone === 'blue'
      ? 'np-pill np-pill--blue'
      : tone === 'green'
        ? 'np-pill np-pill--green'
        : tone === 'red'
          ? 'np-pill np-pill--red'
          : tone === 'amber'
            ? 'np-pill np-pill--amber'
            : 'np-pill'

  return (
    <div className="np-list-item">
      <div className="np-list-item__main">
        <p className="np-list-item__title">{title}</p>
        <p className="np-list-item__sub">{detail}</p>
      </div>
      <span className={pillClass}>Log</span>
    </div>
  )
}

function MatchCard({
  label,
  score,
  reason,
  children,
  actions,
}: {
  label: string
  score: number
  reason: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="np-record">
      <div className="np-section-head" style={{ marginBottom: 8 }}>
        <div>
          <p className="np-record__title">{label}</p>
          <p className="np-record__meta">Score {score}</p>
        </div>
        <span className="np-pill np-pill--blue">{score > 90 ? 'Top match' : 'Candidate'}</span>
      </div>
      <p className="np-copy" style={{ marginBottom: 10 }}>
        {reason}
      </p>
      {children}
      {actions ? <div className="np-record__actions">{actions}</div> : null}
    </div>
  )
}

function App() {
  const [state, setState] = useState<ExtensionState | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [prompt, setPrompt] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [digits, setDigits] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoCaptureRan = useRef(false)

  const loadState = async () => {
    const response = await sendMessage<{ state: ExtensionState }>('GET_STATE')
    if (response?.state) {
      setState(response.state)
    }
  }

  useEffect(() => {
    void loadState().catch(() => {})

    const handleStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local') return
      if (!changes[STATE_KEY]) return
      if (changes[STATE_KEY].newValue) {
        setState(changes[STATE_KEY].newValue as ExtensionState)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  useEffect(() => {
    if (!state?.auth) {
      autoCaptureRan.current = false
      return
    }

    if (autoCaptureRan.current) return
    autoCaptureRan.current = true

    const timer = window.setTimeout(() => {
      void runAction('auto-capture', captureAndMatch)
    }, 150)

    return () => window.clearTimeout(timer)
  }, [state?.auth])

  useEffect(() => {
    const contact = state?.match?.contact
    const account = state?.match?.account
    const pagePhone = state?.page?.phones?.[0] || null
    const target = primaryPhone(account || null, contact || null, pagePhone)
    if (!phoneDraft && target) {
      setPhoneDraft(target)
    }
  }, [phoneDraft, state?.match?.contact, state?.match?.account, state?.page?.phones])

  const auth = state?.auth || null
  const page = state?.page || null
  const match = state?.match || null
  const call = state?.call || defaultCallState()
  const account = match?.account || null
  const contact = match?.contact || null
  const recentCalls = state?.recentCalls || []
  const notes = state?.notes || []
  const chats = state?.chat || []
  const selectedNumber = auth?.profile?.selectedPhoneNumber || auth?.profile?.twilioNumbers?.[0]?.number || null
  const dialTarget = trimText(
    phoneDraft ||
      primaryPhone(account, contact, page?.phones?.[0] || null) ||
      page?.phones?.[0] ||
      ''
  )
  const readyToDial = Boolean(auth && call.enabled && dialTarget)
  const latestAssistant = [...chats].reverse().find((entry) => entry.role === 'assistant')?.content || ''

  const applyResponse = (response: MessageResponse<Record<string, unknown>>) => {
    if (response?.state) {
      setState(response.state)
    }
  }

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(trimText((err as Error)?.message || 'Request failed.'))
    } finally {
      setBusy(null)
    }
  }

  const captureAndMatch = async () => {
    const response = await sendMessage<{ snapshot: ExtensionState['page']; screenshot: string | null; match: ExtensionState['match'] }>('CAPTURE_AND_MATCH')
    applyResponse(response)
    setScreenshot((response as any)?.screenshot || null)
  }

  const saveNote = async (source: 'manual' | 'ai' = 'manual') => {
    const text = trimText(noteDraft || page?.selectedText || latestAssistant || match?.summary || '')
    if (!text) {
      throw new Error('Write a note first.')
    }

    const response = await sendMessage('SAVE_NOTE', {
      note: text,
      contactId: contact?.id || null,
      accountId: account?.id || null,
      source,
    })
    applyResponse(response)
    setNoteDraft('')
  }

  const summarizePage = async () => {
    const response = await sendMessage('CHAT_AI', {
      mode: 'summary',
      prompt: prompt.trim() || 'Summarize this page for the transmission log.',
      messages: chats,
      noteDraft,
      model: 'gemini-3-flash-preview',
    })
    applyResponse(response)
    setPrompt('')
  }

  const writeRecap = async () => {
    const response = await sendMessage('CHAT_AI', {
      mode: 'recap',
      prompt: prompt.trim() || 'Write a short follow-up recap for this account or call.',
      messages: chats,
      noteDraft,
      model: 'gemini-3-flash-preview',
    })
    applyResponse(response)
    setPrompt('')
  }

  const askAi = async () => {
    const response = await sendMessage('CHAT_AI', {
      mode: 'chat',
      prompt: prompt.trim() || 'Answer using the current page and CRM context.',
      messages: chats,
      noteDraft,
      model: 'gemini-3-flash-preview',
    })
    applyResponse(response)
    setPrompt('')
  }

  const enableCalls = async () => {
    const response = await sendMessage('ENABLE_CALLS', {
      callerId: selectedNumber || null,
      appOrigin: auth?.appOrigin || null,
    })
    applyResponse(response)
  }

  const disableCalls = async () => {
    const response = await sendMessage('DISABLE_CALLS')
    applyResponse(response)
  }

  const dialCall = async () => {
    if (!dialTarget) {
      throw new Error('Enter a number first.')
    }

    const response = await sendMessage('CALL_DIAL', {
      to: dialTarget,
      callerId: selectedNumber || null,
      contactId: contact?.id || null,
      accountId: account?.id || null,
    })
    applyResponse(response)
  }

  const answerCall = async () => {
    const response = await sendMessage('CALL_ANSWER')
    applyResponse(response)
  }

  const hangupCall = async () => {
    const response = await sendMessage('CALL_HANGUP')
    applyResponse(response)
  }

  const toggleMute = async () => {
    const response = await sendMessage('CALL_MUTE', { muted: !call.muted })
    applyResponse(response)
  }

  const sendDigits = async () => {
    const value = trimText(digits)
    if (!value) {
      throw new Error('Enter digits first.')
    }
    const response = await sendMessage('CALL_DIGITS', { digits: value })
    applyResponse(response)
    setDigits('')
  }

  const openRecord = async (type: 'contact' | 'account', id: string | null) => {
    if (!id) throw new Error('No record selected.')
    const response = await sendMessage('OPEN_RECORD', {
      type,
      id,
      appOrigin: auth?.appOrigin || null,
    })
    applyResponse(response)
  }

  const refreshRecentCalls = async () => {
    const response = await sendMessage('REQUEST_RECENT_CALLS')
    applyResponse(response)
  }

  const statePill =
    call.state === 'incoming'
      ? 'np-pill np-pill--red'
      : call.state === 'connected' || call.state === 'dialing'
        ? 'np-pill np-pill--blue'
        : call.enabled
          ? 'np-pill np-pill--green'
          : 'np-pill'

  const currentNotes = useMemo(() => notes.slice(0, 5), [notes])
  const currentCalls = useMemo(() => recentCalls.slice(0, 5), [recentCalls])
  const currentChats = useMemo(() => chats.slice(-8), [chats])

  return (
    <div className="np-shell">
      <div className="np-header">
        <div className="np-brand">
          <div className="np-brand-mark" aria-hidden="true">
            <img src="./icon.svg" alt="" />
          </div>
          <div className="np-brand-copy">
            <h1 className="np-brand-title">Nodal Point</h1>
            <div className="np-brand-subtitle">Command Deck</div>
          </div>
        </div>
        <div className="np-status-row">
          <span className={statePill}>{formatStatusLabel(state)}</span>
          {auth?.email ? <span className="np-pill">{auth.email}</span> : <span className="np-pill np-pill--amber">Not connected</span>}
        </div>
      </div>

      {error ? (
        <div className="np-card np-card--accent" style={{ borderColor: 'rgba(239, 68, 68, 0.35)' }}>
          <p className="np-title" style={{ color: '#fecaca', marginBottom: 4 }}>
            Action failed
          </p>
          <p className="np-copy">{error}</p>
        </div>
      ) : null}

      <div className="np-scroll">
        <div className="np-stack">
          <section className="np-card np-card--accent">
            <div className="np-section-head">
              <div>
                <div className="np-kicker">Session</div>
                <h2 className="np-title">{auth ? 'Connected to CRM' : 'Waiting for CRM login'}</h2>
              </div>
              <span className={auth ? 'np-pill np-pill--green' : 'np-pill np-pill--amber'}>
                {auth?.bootstrapStatus || (auth ? 'Synced' : 'Disconnected')}
              </span>
            </div>

            <div className="np-grid np-grid--two">
              <div className="np-record">
                <p className="np-record__title">{auth?.fullName || auth?.email || 'No user yet'}</p>
                <p className="np-record__meta">{auth?.profile?.jobTitle || 'Open Nodal Point in another tab to sync the session.'}</p>
              </div>
              <div className="np-record">
                <p className="np-record__title">{selectedNumber || 'No caller ID selected'}</p>
                <p className="np-record__meta">
                  {auth?.profile?.bridgeToMobile ? 'Bridge to mobile is enabled' : 'Browser calling stays inside the extension'}
                </p>
              </div>
            </div>

            <div className="np-record__actions" style={{ marginTop: 10 }}>
              <button
                className="np-button np-button--primary"
                onClick={() => void runAction('capture', captureAndMatch)}
                disabled={!auth || busy === 'capture'}
              >
                {busy === 'capture' ? 'Capturing…' : 'Capture & Match'}
              </button>
              <button className="np-button" onClick={() => void runAction('refresh', loadState)} disabled={busy === 'refresh'}>
                Refresh
              </button>
              <button
                className="np-button"
                onClick={() => void runAction('recent-calls', refreshRecentCalls)}
                disabled={busy === 'recent-calls'}
              >
                Recent Calls
              </button>
            </div>
          </section>

          <section className="np-card">
            <div className="np-section-head">
              <div>
                <div className="np-kicker">Current Page</div>
                <h2 className="np-title">{page?.title || 'No page captured yet'}</h2>
              </div>
              <span className="np-pill">{page?.origin || 'No origin'}</span>
            </div>

            <p className="np-copy" style={{ marginBottom: 10 }}>
              {snippet(page?.url || '', 180) || 'Click Capture & Match to read the active tab.'}
            </p>

            {screenshot ? <img className="np-screenshot" src={screenshot} alt="Page screenshot preview" /> : null}

            <div className="np-grid np-grid--two" style={{ marginTop: 10 }}>
              <div className="np-record">
                <p className="np-record__title">Selected text</p>
                <p className="np-record__meta" style={{ whiteSpace: 'pre-wrap' }}>
                  {snippet(page?.selectedText || '', 260) || 'Nothing selected'}
                </p>
              </div>
              <div className="np-record">
                <p className="np-record__title">Page hints</p>
                <p className="np-record__meta">
                  {chipList([
                    ...(page?.emails || []).slice(0, 3),
                    ...(page?.phones || []).slice(0, 3).map((value) => formatPhone(value) || value),
                  ]).join(' • ') || 'No hints extracted yet'}
                </p>
              </div>
            </div>

            <div className="np-record__actions" style={{ marginTop: 10 }}>
              <button
                className="np-button"
                onClick={() => void runAction('open-account', () => openRecord('account', account?.id || null))}
                disabled={!account || busy === 'open-account'}
              >
                Open Account
              </button>
              <button
                className="np-button"
                onClick={() => void runAction('open-contact', () => openRecord('contact', contact?.id || null))}
                disabled={!contact || busy === 'open-contact'}
              >
                Open Contact
              </button>
              <button
                className="np-button np-button--primary"
                onClick={() => void runAction('save-note', () => saveNote('manual'))}
                disabled={!auth || busy === 'save-note'}
              >
                Save to Log
              </button>
            </div>
          </section>

          <section className="np-card">
            <div className="np-section-head">
              <div>
                <div className="np-kicker">Match</div>
                <h2 className="np-title">{match?.summary || 'No CRM match yet'}</h2>
              </div>
              <span className="np-pill">{match ? 'Loaded' : 'Empty'}</span>
            </div>

            <div className="np-grid" style={{ gap: 10 }}>
              {account ? (
                <MatchCard
                  label={account.name}
                  score={account.score}
                  reason={account.reason}
                  actions={
                    <>
                      <button
                        className="np-button np-button--primary"
                        onClick={() => void runAction('open-match-account', () => openRecord('account', account.id))}
                      >
                        Open
                      </button>
                      {primaryPhone(account, contact, page?.phones?.[0] || null) ? (
                        <button className="np-button" onClick={() => setPhoneDraft(primaryPhone(account, contact, page?.phones?.[0] || null))}>
                          Use phone
                        </button>
                      ) : null}
                    </>
                  }
                >
                  <p className="np-compact">
                    {account.industry || 'Industry unknown'} • {chipList([account.city, account.state]).join(', ') || 'Location unknown'}
                  </p>
                </MatchCard>
              ) : null}

              {contact ? (
                <MatchCard
                  label={contact.name}
                  score={contact.score}
                  reason={contact.reason}
                  actions={
                    <>
                      <button
                        className="np-button np-button--primary"
                        onClick={() => void runAction('open-match-contact', () => openRecord('contact', contact.id))}
                      >
                        Open
                      </button>
                      {primaryPhone(account, contact, page?.phones?.[0] || null) ? (
                        <button className="np-button" onClick={() => setPhoneDraft(primaryPhone(account, contact, page?.phones?.[0] || null))}>
                          Use phone
                        </button>
                      ) : null}
                    </>
                  }
                >
                  <p className="np-compact">
                    {contact.title || 'Title unknown'} • {chipList([contact.email, contact.accountName]).join(' • ') || 'No extra detail'}
                  </p>
                </MatchCard>
              ) : null}

              {match?.accounts?.slice(0, 3).map((item) => (
                <div className="np-list-item" key={item.id}>
                  <div className="np-list-item__main">
                    <p className="np-list-item__title">{item.name}</p>
                    <p className="np-list-item__sub">{item.reason}</p>
                  </div>
                  <button className="np-button" onClick={() => void runAction('open-candidate-account', () => openRecord('account', item.id))}>
                    Open
                  </button>
                </div>
              ))}

              {match?.contacts?.slice(0, 3).map((item) => (
                <div className="np-list-item" key={item.id}>
                  <div className="np-list-item__main">
                    <p className="np-list-item__title">{item.name}</p>
                    <p className="np-list-item__sub">{item.reason}</p>
                  </div>
                  <button className="np-button" onClick={() => void runAction('open-candidate-contact', () => openRecord('contact', item.id))}>
                    Open
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="np-card">
            <div className="np-section-head">
              <div>
                <div className="np-kicker">Transmission Log</div>
                <h2 className="np-title">Notes that land in CRM</h2>
              </div>
              <span className="np-pill">{notes.length} saved</span>
            </div>

            <div className="np-field">
              <label className="np-label" htmlFor="noteDraft">
                Note
              </label>
              <textarea
                id="noteDraft"
                className="np-textarea"
                placeholder="Type the note you want saved to the log."
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
            </div>

            <div className="np-record__actions" style={{ marginTop: 10 }}>
              <button
                className="np-button np-button--primary"
                onClick={() => void runAction('save-note', () => saveNote('manual'))}
                disabled={!auth || busy === 'save-note'}
              >
                Save Note
              </button>
              <button className="np-button" onClick={() => setNoteDraft(page?.selectedText || match?.summary || '')}>
                Use selection
              </button>
              <button className="np-button" onClick={() => setNoteDraft(latestAssistant || match?.summary || '')} disabled={!latestAssistant && !match?.summary}>
                Use AI recap
              </button>
            </div>

            <div className="np-divider" />

            <div className="np-list">
              {currentNotes.length > 0 ? (
                currentNotes.map((entry) => (
                  <div className="np-list-item" key={entry.id}>
                    <div className="np-list-item__main">
                      <p className="np-list-item__title">{entry.title || 'Transmission log'}</p>
                      <p className="np-list-item__sub">
                        {snippet(entry.text, 160)}
                        <br />
                        {formatDateTime(entry.createdAt)} • {entry.source}
                      </p>
                    </div>
                    <span className={entry.source === 'ai' ? 'np-pill np-pill--blue' : 'np-pill'}>{entry.savedToCrm ? 'Saved' : 'Draft'}</span>
                  </div>
                ))
              ) : (
                <p className="np-compact">No saved notes yet.</p>
              )}
            </div>
          </section>

          <section className="np-card">
            <div className="np-section-head">
              <div>
                <div className="np-kicker">AI</div>
                <h2 className="np-title">Page summary, call recap, or follow-up question</h2>
              </div>
              <span className="np-pill np-pill--blue">Gemini</span>
            </div>

            <div className="np-field">
              <label className="np-label" htmlFor="prompt">
                Prompt
              </label>
              <textarea
                id="prompt"
                className="np-textarea"
                placeholder="Ask a follow-up, generate a page summary, or draft a call recap."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>

            <div className="np-record__actions" style={{ marginTop: 10 }}>
              <button className="np-button np-button--primary" onClick={() => void runAction('ai-summary', summarizePage)} disabled={!auth || busy === 'ai-summary'}>
                Summarize Page
              </button>
              <button className="np-button" onClick={() => void runAction('ai-recap', writeRecap)} disabled={!auth || busy === 'ai-recap'}>
                Write Recap
              </button>
              <button className="np-button" onClick={() => void runAction('ai-ask', askAi)} disabled={!auth || busy === 'ai-ask'}>
                Ask
              </button>
              <button className="np-button" onClick={() => setNoteDraft(latestAssistant || '')} disabled={!latestAssistant}>
                Put in Log
              </button>
            </div>

            <div className="np-divider" />

            <div className="np-list">
              {currentChats.length > 0 ? (
                currentChats.map((entry, index) => (
                  <div className="np-list-item" key={`${entry.role}-${entry.createdAt}-${index}`}>
                    <div className="np-list-item__main">
                      <p className="np-list-item__title">{entry.role === 'assistant' ? 'Assistant' : 'You'}</p>
                      <p className="np-list-item__sub" style={{ whiteSpace: 'pre-wrap' }}>
                        {snippet(entry.content, 220)}
                      </p>
                    </div>
                    <span className={entry.role === 'assistant' ? 'np-pill np-pill--blue' : 'np-pill'}>{formatDateTime(entry.createdAt)}</span>
                  </div>
                ))
              ) : (
                <p className="np-compact">No AI conversation yet.</p>
              )}
            </div>
          </section>

          <section className="np-card">
            <div className="np-section-head">
              <div>
                <div className="np-kicker">Recent Activity</div>
                <h2 className="np-title">Last calls in CRM</h2>
              </div>
              <button className="np-button" onClick={() => void runAction('refresh-calls', refreshRecentCalls)}>
                Refresh
              </button>
            </div>

            <div className="np-list">
              {currentCalls.length > 0 ? (
                currentCalls.map((item: RecentCall) => (
                  <EntryRow
                    key={item.id}
                    title={buildRecentActivityLabel(item)}
                    detail={`${item.direction || 'unknown'} • ${formatDateTime(item.callTime || item.timestamp)} • ${item.duration ? `${item.duration}s` : 'live'}`}
                    tone={item.status === 'completed' ? 'green' : item.status === 'failed' ? 'red' : 'blue'}
                  />
                ))
              ) : (
                <p className="np-compact">No recent calls loaded.</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="np-callbar">
        <div className="np-card np-card--accent np-callbar__inner">
          <div className="np-call-status">
            <div>
              <div className="np-kicker">Call Deck</div>
              <h3 className="np-title">
                {call.state === 'incoming'
                  ? `Incoming from ${call.incomingDisplay || call.incomingFrom || 'unknown'}`
                  : call.state === 'connected'
                    ? 'Active call'
                    : call.state === 'dialing'
                      ? 'Dialing'
                      : call.enabled
                        ? 'Ready to call'
                        : 'Calls disabled'}
              </h3>
            </div>
            <span className={statePill}>{call.state.toUpperCase()}</span>
          </div>

          {call.lastError ? <p className="np-copy" style={{ color: '#fecaca' }}>{call.lastError}</p> : null}
          <div className="np-call-timer">{formatElapsed(call.startedAt, Date.now())}</div>

          {call.state === 'incoming' ? (
            <div className="np-call-actions">
              <button className="np-button np-button--primary" onClick={() => void runAction('answer-call', answerCall)} disabled={busy === 'answer-call'}>
                Answer
              </button>
              <button className="np-button np-button--danger" onClick={() => void runAction('hangup-call', hangupCall)} disabled={busy === 'hangup-call'}>
                Decline
              </button>
              <button className="np-button" onClick={() => setPhoneDraft(call.incomingFrom || phoneDraft)}>
                Use number
              </button>
            </div>
          ) : null}

          {call.state === 'connected' || call.state === 'dialing' ? (
            <>
              <div className="np-call-actions">
                <button className="np-button" onClick={() => void runAction('toggle-mute', toggleMute)} disabled={busy === 'toggle-mute'}>
                  {call.muted ? 'Unmute' : 'Mute'}
                </button>
                <button className="np-button np-button--danger" onClick={() => void runAction('hangup-call', hangupCall)} disabled={busy === 'hangup-call'}>
                  Hang Up
                </button>
                <button className="np-button" onClick={() => void runAction('disable-calls', disableCalls)} disabled={busy === 'disable-calls'}>
                  Disable
                </button>
              </div>

              <div className="np-grid np-grid--two">
                <div className="np-field">
                  <label className="np-label" htmlFor="digits">
                    Digits
                  </label>
                  <input
                    id="digits"
                    className="np-input"
                    value={digits}
                    onChange={(event) => setDigits(event.target.value)}
                    placeholder="1234#"
                  />
                </div>
                <div className="np-field">
                  <label className="np-label" htmlFor="dialTarget">
                    Call target
                  </label>
                  <input
                    id="dialTarget"
                    className="np-input"
                    value={phoneDraft}
                    onChange={(event) => setPhoneDraft(event.target.value)}
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>

              <div className="np-call-actions np-call-actions--two">
                <button className="np-button" onClick={() => void runAction('send-digits', sendDigits)} disabled={busy === 'send-digits'}>
                  Send Digits
                </button>
                <button className="np-button" onClick={() => setPhoneDraft(primaryPhone(account, contact, page?.phones?.[0] || null))}>
                  Restore Match
                </button>
              </div>
            </>
          ) : null}

          {call.state !== 'incoming' && call.state !== 'connected' && call.state !== 'dialing' ? (
            <div className="np-call-actions">
              <button className="np-button np-button--primary" onClick={() => void runAction('enable-calls', enableCalls)} disabled={!auth || busy === 'enable-calls'}>
                Enable Calls
              </button>
              <button className="np-button" onClick={() => void runAction('dial-call', dialCall)} disabled={!readyToDial || busy === 'dial-call'}>
                {dialTarget ? `Call ${formatPhone(dialTarget) || dialTarget}` : 'Call'}
              </button>
              <button className="np-button" onClick={() => setPhoneDraft(primaryPhone(account, contact, page?.phones?.[0] || null))} disabled={!dialTarget}>
                Use Match
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)
