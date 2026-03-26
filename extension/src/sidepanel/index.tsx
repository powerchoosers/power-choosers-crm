import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultCallState,
  formatElapsed,
  formatPhone,
  extractDomain,
  STATE_KEY,
  trimText,
  type ExtensionState,
  type MatchAccount,
  type MatchContact,
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

function formatCrmStatus(state: ExtensionState | null) {
  return state?.auth ? 'CRM synced' : 'CRM not synced'
}

function formatCallStatus(state: ExtensionState | null) {
  if (!state?.auth) return 'Calls off'
  if (state.call.state === 'error') return 'Call error'
  if (state.call.state === 'initializing') return 'Connecting calls'
  if (state.call.state === 'incoming') return 'Ringing'
  if (state.call.state === 'connected') return 'Live call'
  if (state.call.state === 'dialing') return 'Dialing'
  if (state.call.enabled && state.call.deviceReady) return 'Calls ready'
  if (state.call.enabled) return 'Connecting calls'
  return 'Calls off'
}

function entityInitials(value: string | null | undefined) {
  const text = trimText(value)
  if (!text) return '--'
  const parts = text
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean)

  if (parts.length === 0) return '--'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function EntityMark({
  name,
  logoUrl,
}: {
  name: string
  logoUrl: string | null | undefined
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [logoUrl, name])

  const initials = entityInitials(name)

  if (logoUrl && !failed) {
    return (
      <img
        className="np-entity-mark__img"
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
      />
    )
  }

  return <span className="np-entity-mark__initials">{initials}</span>
}

function contactPhone(contact: MatchContact | null) {
  return trimText(contact?.phone || contact?.mobile || contact?.workPhone || contact?.companyPhone || '') || ''
}

function primaryPhone(
  account: MatchAccount | null,
  contact: MatchContact | null,
  pagePhone: string | null,
  accountContacts: MatchContact[]
) {
  const fallbackContact = accountContacts.find((item) => Boolean(contactPhone(item))) || null
  return (
    trimText(contactPhone(contact) || contactPhone(fallbackContact) || account?.phone || pagePhone || '') ||
    ''
  )
}

function App() {
  const [state, setState] = useState<ExtensionState | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [prompt, setPrompt] = useState('')
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

  const auth = state?.auth || null
  const page = state?.page || null
  const match = state?.match || null
  const call = state?.call || defaultCallState()
  const account = match?.account || null
  const contact = match?.contact || null
  const accountContacts = state?.accountContacts || []
  const notes = state?.notes || []
  const chats = state?.chat || []
  const selectedNumber = auth?.profile?.selectedPhoneNumber || auth?.profile?.twilioNumbers?.[0]?.number || null
  const dialTarget = trimText(primaryPhone(account, contact, page?.phones?.[0] || null, accountContacts) || page?.phones?.[0] || '')
  const readyToDial = Boolean(auth && dialTarget && call.deviceReady && call.state !== 'initializing')
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
    const response = await sendMessage<{ snapshot: ExtensionState['page']; match: ExtensionState['match'] }>('CAPTURE_AND_MATCH')
    applyResponse(response)
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

  const dialCall = async () => {
    if (!dialTarget) {
      throw new Error('No phone number found on this record.')
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

  const openRecord = async (type: 'contact' | 'account', id: string | null) => {
    if (!id) throw new Error('No record selected.')
    const response = await sendMessage('OPEN_RECORD', {
      type,
      id,
      appOrigin: auth?.appOrigin || null,
    })
    applyResponse(response)
  }

  const crmPill = auth ? 'np-pill np-pill--green' : 'np-pill np-pill--amber'
  const callPill =
    call.state === 'error'
      ? 'np-pill np-pill--red'
      : call.state === 'initializing'
        ? 'np-pill np-pill--amber'
        : call.state === 'incoming'
          ? 'np-pill np-pill--red'
          : call.state === 'connected' || call.state === 'dialing'
            ? 'np-pill np-pill--blue'
            : call.enabled && call.deviceReady
              ? 'np-pill np-pill--green'
              : call.enabled
                ? 'np-pill np-pill--amber'
                : 'np-pill'

  const pageDomain = extractDomain(page?.origin || page?.url)
  const heroTitle = account?.name || contact?.accountName || contact?.name || page?.title || 'No CRM match yet'
  const heroAccountName = account?.name || null
  const heroContactAccountName = contact?.accountName || heroAccountName
  const heroSubtitle = account
    ? [account.industry, [account.city, account.state].filter(Boolean).join(', ')].filter(Boolean).join(' | ') ||
      pageDomain ||
      'Account matched from page capture.'
    : contact
      ? [contact.title, heroContactAccountName].filter(Boolean).join(' | ') ||
        pageDomain ||
        'Contact matched from page capture.'
      : pageDomain || 'Capture a page to start the match.'
  const heroSummary = match?.summary || 'Capture the active tab to resolve the record.'
  const allContacts = accountContacts.length > 0 ? accountContacts : match?.contacts || []
  const visibleContacts = allContacts.slice(0, 5)
  const hasMoreContacts = allContacts.length > visibleContacts.length
  const showRescan = Boolean(auth && page && match)
  const callLabel =
    call.state === 'incoming'
      ? `Incoming from ${call.incomingDisplay || call.incomingFrom || 'unknown'}`
      : call.state === 'connected'
        ? 'Live call'
        : call.state === 'dialing'
          ? 'Dialing'
          : call.state === 'initializing'
            ? 'Connecting calls'
            : call.deviceReady
              ? 'Ready to call'
              : 'Connecting calls'
  const callIsLive = call.state === 'incoming' || call.state === 'connected' || call.state === 'dialing'

  return (
    <div className="np-shell">
      <div className="np-header">
        <div className="np-brand">
          <div className="np-brand-mark" aria-hidden="true">
            <img src="./nodalpoint-webicon.png" alt="" />
          </div>
          <div className="np-brand-copy">
            <h1 className="np-brand-title">Nodal Point</h1>
            <div className="np-brand-subtitle">CRM Uplink</div>
          </div>
        </div>
        <div className="np-status-row">
          <span className={crmPill}>{formatCrmStatus(state)}</span>
          <span className={callPill}>{formatCallStatus(state)}</span>
          {auth?.email ? <span className="np-pill">{auth.email}</span> : <span className="np-pill np-pill--amber">Not connected</span>}
        </div>
      </div>

      {error ? (
        <div className="np-card" style={{ borderColor: 'rgba(239, 68, 68, 0.35)' }}>
          <p className="np-title" style={{ color: '#fecaca', marginBottom: 4 }}>
            Action failed
          </p>
          <p className="np-copy">{error}</p>
        </div>
      ) : null}

      <div className="np-scroll">
        <div className="np-stack">
          <section className="np-card np-card--hero">
            <div className="np-section-head np-section-head--hero">
              <div className="np-hero-identity">
                <div className="np-entity-mark np-entity-mark--large">
                  <EntityMark name={heroTitle} logoUrl={account?.logoUrl || null} />
                </div>
                <div className="np-hero-copy">
                  <div className="np-kicker">Current dossier</div>
                  <h2 className="np-hero-title">{heroTitle}</h2>
                  <p className="np-hero-subtitle">{heroSubtitle}</p>
                </div>
              </div>

              {showRescan ? (
                <div className="np-section-head__actions">
                  <button
                    className="np-button np-button--sm np-button--ghost"
                    onClick={() => void runAction('capture', captureAndMatch)}
                    disabled={!auth || busy === 'capture'}
                  >
                    {busy === 'capture' ? 'Rescanning...' : 'Rescan'}
                  </button>
                </div>
              ) : null}
            </div>

            <p className="np-copy np-copy--tight">{heroSummary}</p>

            <p className="np-micro np-dossier-meta">
              {page?.title ? `Page: ${snippet(page.title, 64)}` : 'Page not captured yet'}
              <span className="np-dossier-meta__sep">|</span>
              {pageDomain || 'No origin'}
              <span className="np-dossier-meta__sep">|</span>
              {selectedNumber ? `Caller ID: ${formatPhone(selectedNumber) || selectedNumber}` : 'Caller ID not selected'}
            </p>

            <div className="np-record__actions np-record__actions--tight">
              {!match ? (
                <button
                  className="np-button np-button--primary"
                  onClick={() => void runAction('capture', captureAndMatch)}
                  disabled={!auth || busy === 'capture'}
                >
                  {busy === 'capture' ? 'Capturing...' : 'Capture & Match'}
                </button>
              ) : null}
              <button
                className="np-button"
                onClick={() => void runAction('open-account', () => openRecord('account', account?.id || null))}
                disabled={!account || busy === 'open-account'}
              >
                Open Account
              </button>
              {dialTarget ? (
                <button className="np-button np-button--primary" onClick={() => void runAction('dial-call', dialCall)} disabled={!readyToDial || busy === 'dial-call'}>
                  Call
                </button>
              ) : null}
            </div>

            <p className="np-compact np-call-note">
              {dialTarget
                ? readyToDial
                  ? `Dial ${formatPhone(dialTarget) || dialTarget} in the background.`
                  : 'Connecting calls in the background.'
                : 'No phone number found on this record.'}
            </p>

            {visibleContacts.length > 0 ? (
              <>
                <div className="np-divider" />

                <div className="np-section-head np-section-head--compact">
                  <div>
                    <div className="np-kicker">Contacts</div>
                    <h2 className="np-title">People on this account</h2>
                  </div>
                  <span className="np-pill">{accountContacts.length > 0 ? `${accountContacts.length} loaded` : `${visibleContacts.length} shown`}</span>
                </div>

                <div className="np-contact-list">
                  {visibleContacts.map((item) => {
                    const detail =
                      item.title ||
                      formatPhone(contactPhone(item)) ||
                      item.email ||
                      item.reason ||
                      'Contact on this account'

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="np-contact-row"
                        onClick={() => void runAction(`open-contact-${item.id}`, () => openRecord('contact', item.id))}
                        disabled={!item.id || busy === `open-contact-${item.id}`}
                      >
                        <div className="np-contact-row__main">
                          <div className="np-contact-row__name">{item.name}</div>
                          <div className="np-contact-row__sub">{detail}</div>
                        </div>
                        <div className="np-contact-row__meta">Open</div>
                      </button>
                    )
                  })}
                </div>

                {hasMoreContacts ? (
                  <p className="np-compact np-copy--tight">
                    +{allContacts.length - visibleContacts.length} more contacts in CRM.
                  </p>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="np-card">
            <div className="np-section-head np-section-head--compact">
              <div>
                <div className="np-kicker">Transmission Log</div>
                <h2 className="np-title">Notes that land in CRM</h2>
              </div>
              <span className="np-pill">{notes.length ? `${notes.length} saved` : 'Empty'}</span>
            </div>

            <div className="np-field">
              <label className="np-label" htmlFor="noteDraft">
                Note
              </label>
              <textarea
                id="noteDraft"
                className="np-textarea np-textarea--tall"
                placeholder="Type the note you want saved to the log."
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
            </div>

            <div className="np-record__actions np-record__actions--tight">
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

            <div className="np-field np-field--compact">
              <label className="np-label" htmlFor="prompt">
                AI prompt
              </label>
              <input
                id="prompt"
                className="np-input"
                placeholder="Ask for a page summary, recap, or follow-up."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>

            <div className="np-record__actions np-record__actions--tight">
              <button className="np-button" onClick={() => void runAction('ai-summary', summarizePage)} disabled={!auth || busy === 'ai-summary'}>
                Summarize Page
              </button>
              <button className="np-button" onClick={() => void runAction('ai-recap', writeRecap)} disabled={!auth || busy === 'ai-recap'}>
                Write Recap
              </button>
              <button className="np-button" onClick={() => void runAction('ai-ask', askAi)} disabled={!auth || busy === 'ai-ask'}>
                Ask
              </button>
            </div>

            <p className="np-compact np-copy--tight">AI writes the summary into the log before you save it to CRM.</p>
          </section>
        </div>
      </div>

      {callIsLive ? (
        <div className="np-callbar">
          <div className="np-card np-live-strip">
            <div className="np-live-strip__top">
              <div>
                <div className="np-kicker">Live Call</div>
                <h3 className="np-title">{callLabel}</h3>
              </div>
              <span className={callPill}>
                {call.state === 'incoming' ? 'RINGING' : call.state === 'connected' ? 'LIVE' : 'DIALING'}
              </span>
            </div>

            {call.lastError ? <p className="np-copy np-copy--error">{call.lastError}</p> : null}
            <div className="np-call-meta">
              <span>{formatElapsed(call.startedAt, Date.now())}</span>
              <span>{call.incomingDisplay || call.incomingFrom || dialTarget || selectedNumber || 'Waiting'}</span>
            </div>

            <div className="np-call-actions np-call-actions--compact">
              {call.state === 'incoming' ? (
                <>
                  <button className="np-button np-button--primary" onClick={() => void runAction('answer-call', answerCall)} disabled={busy === 'answer-call'}>
                    Answer
                  </button>
                  <button className="np-button np-button--danger" onClick={() => void runAction('hangup-call', hangupCall)} disabled={busy === 'hangup-call'}>
                    Decline
                  </button>
                </>
              ) : null}

              {call.state === 'connected' || call.state === 'dialing' ? (
                <>
                  <button className="np-button" onClick={() => void runAction('toggle-mute', toggleMute)} disabled={busy === 'toggle-mute'}>
                    {call.muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button className="np-button np-button--danger" onClick={() => void runAction('hangup-call', hangupCall)} disabled={busy === 'hangup-call'}>
                    Hang Up
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)
