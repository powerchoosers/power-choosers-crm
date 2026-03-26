import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, AnimatePresence } from 'framer-motion'
import {
  defaultCallState,
  formatElapsed,
  formatPhone,
  extractDomain,
  resolveCallerId,
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

const FORENSIC_EASE: any = [0.23, 1, 0.32, 1]

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
  pagePhone: string | null | undefined,
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
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualDial, setManualDial] = useState('')
  const [initStuckMs, setInitStuckMs] = useState(0)
  const autoCaptureRan = useRef(false)
  const initStuckTimer = useRef<ReturnType<typeof setInterval> | null>(null)

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
    const callState = state?.call?.state
    const isStuck = callState === 'initializing'
    
    if (isStuck && !initStuckTimer.current) {
      initStuckTimer.current = setInterval(() => {
        setInitStuckMs((prev) => prev + 1000)
      }, 1000)
    } else if (!isStuck && initStuckTimer.current) {
      clearInterval(initStuckTimer.current)
      initStuckTimer.current = null
      setInitStuckMs(0)
    }
    
    return () => {
      if (initStuckTimer.current) clearInterval(initStuckTimer.current)
    }
  }, [state?.call?.state])

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message || 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const captureAndMatch = async () => {
    const response = await sendMessage('CAPTURE_AND_MATCH')
    if (response?.state) setState(response.state)
  }

  const dialCall = async (phone: string, contactId?: string, accountId?: string) => {
    const response = await sendMessage('CALL_DIAL', { phone, contactId, accountId })
    if (response?.state) setState(response.state)
  }

  const answerCall = async () => {
    const response = await sendMessage('CALL_ANSWER')
    if (response?.state) setState(response.state)
  }

  const hangupCall = async () => {
    const response = await sendMessage('CALL_HANGUP')
    if (response?.state) setState(response.state)
  }

  const muteCall = async (muted: boolean) => {
    const response = await sendMessage('CALL_MUTE', { muted })
    if (response?.state) setState(response.state)
  }

  const saveNote = async (payload: { note: string; contactId?: string; accountId?: string }) => {
    const response = await sendMessage('SAVE_NOTE', payload)
    if (response?.state) setState(response.state)
    return response
  }

  const bootstrapProfile = async () => {
    const response = await sendMessage('AUTH_SYNC')
    if (response?.state) setState(response.state)
  }

  const loginToCrm = () => {
    const origin = state?.auth?.appOrigin || 'https://www.nodalpoint.io'
    chrome.tabs.create({ url: origin })
  }

  if (!state) return null

  const { auth, page, match, call, accountContacts, notes } = state
  const account = match?.account
  const contact = match?.contact
  const pageDomain = extractDomain(page?.origin || page?.url) || null
  const selectedNumber = resolveCallerId(auth)

  const dialTarget = primaryPhone(account as any, contact as any, (page as any)?.phoneNumber || null, accountContacts)
  let manualDialTarget = trimText(manualDial).replace(/[^0-9+]/g, '')
  if (manualDialTarget.length < 3) manualDialTarget = ''

  const crmStatus = formatCrmStatus(state)
  const callStatus = formatCallStatus(state)
  const crmPill = `np-pill ${auth ? 'np-pill--blue' : 'np-pill--amber'}`
  const callPill = `np-pill ${call.state === 'error' ? 'np-pill--red' : call.deviceReady ? 'np-pill--blue' : 'np-pill--amber'}`

  const heroTitle = (account as any)?.name || (contact as any)?.name || page?.title || 'No record identified'
  const heroSubtitle = account
    ? [account.industry, [account.city, account.state].filter(Boolean).join(', ')].filter(Boolean).join(' | ') ||
      pageDomain ||
      'Account matched from page capture.'
    : contact
      ? [(contact as any).title, (contact as any).accountName || (account as any)?.name].filter(Boolean).join(' | ') ||
        pageDomain ||
        'Contact matched from page capture.'
      : pageDomain || 'Capture a page to start the match.'
  const heroSummary = match?.summary || 'Capture the active tab to resolve the record.'
  const allContacts = accountContacts.length > 0 ? accountContacts : match?.contacts || []
  const visibleContacts = allContacts.slice(0, 5)
  const hasMoreContacts = allContacts.length > visibleContacts.length
  
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
  const callNeedsManualNumber = !dialTarget && !callIsLive
  const showCallButton = Boolean(selectedNumber && (dialTarget || manualDialTarget || callNeedsManualNumber))

  // Branded Loading Splash
  const isSyncing = busy === 'auto-capture' || (auth && !match && busy !== 'capture' && busy !== 'sync-profile') || busy === 'initial-sync'

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
          <span className={crmPill}>{crmStatus}</span>
          <span className={callPill}>{callStatus}</span>
          {auth?.email ? (
            <span className="np-pill" title={auth.email}>{snippet(auth.email, 12)}</span>
          ) : (
            <span className="np-pill np-pill--amber">Offline</span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isSyncing ? (
          <motion.div
            key="sync-splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="np-sync-splash"
          >
            <div className="np-sync-loader">
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="np-sync-logo"
              >
                 <img src="./nodalpoint-webicon.png" alt="" />
              </motion.div>
              <div className="np-sync-meta">
                <div className="np-sync-title font-mono">QUANTUM UPLINK</div>
                <div className="np-sync-body font-sans">Identifying session context...</div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: FORENSIC_EASE }}
            className="np-scroll"
          >
            <div className="np-stack">
              {error ? (
                <div className="np-card np-card--error">
                  <p className="np-title" style={{ color: '#fecaca', marginBottom: 4 }}>
                    Action failed
                  </p>
                  <p className="np-copy">{error}</p>
                </div>
              ) : null}

              <motion.section 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: FORENSIC_EASE }}
                className="np-card np-card--hero"
              >
                <div className="np-hero-identity">
                  <div className="np-entity-mark np-entity-mark--large">
                    <EntityMark name={heroTitle} logoUrl={account?.logoUrl || null} />
                  </div>
                  <div className="np-hero-copy">
                    <div className="np-kicker font-mono">CURRENT DOSSIER</div>
                    <h2 className="np-hero-title">{heroTitle}</h2>
                    <p className="np-hero-subtitle">{heroSubtitle}</p>
                  </div>
                </div>

                <p className="np-copy np-copy--tight">{heroSummary}</p>

                <p className="np-micro np-dossier-meta font-mono">
                  {page?.title ? `Page: ${snippet(page.title, 64)}` : 'No page nexus'}
                  <span className="np-dossier-meta__sep">|</span>
                  {selectedNumber
                    ? `Caller ID: ${formatPhone(selectedNumber)}`
                    : <span className="text-amber-400">CALLER ID: MISSING IN SETTINGS</span>}
                </p>
              </motion.section>

              {auth ? (
                <>
                  <motion.section 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4, ease: FORENSIC_EASE }}
                    className="np-card"
                  >
                    <div className="np-section-head">
                      <h3 className="np-title">Transmission</h3>
                      <div className="np-section-head__actions">
                        {callIsLive && (
                          <div className="np-pulse-tag">
                            <span className="np-pulse-dot" />
                            {callLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    {!callIsLive && (
                      <div className="np-dialer-input">
                        <input
                          type="tel"
                          className="nodal-input"
                          placeholder="Manual entry..."
                          value={manualDial}
                          onChange={(e) => setManualDial(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="np-action-grid">
                      {showCallButton ? (
                        <button
                          className="np-button np-button--primary np-button--full"
                          onClick={() => void runAction('dial', () => dialCall(manualDialTarget || dialTarget, contact?.id, account?.id))}
                          disabled={busy === 'dial'}
                        >
                          {busy === 'dial' ? 'Connecting...' : `Call ${formatPhone(manualDialTarget || dialTarget) || '...'} via ${formatPhone(selectedNumber)}`}
                        </button>
                      ) : (
                        <div className="np-alert-card">
                           <p className="np-micro" style={{ marginBottom: 12 }}>
                            {selectedNumber 
                              ? 'Enter a number to initiate transmission.' 
                              : 'No Caller ID selected in CRM settings.'}
                           </p>
                           {!selectedNumber && (
                             <div className="np-stack--tight">
                                <button 
                                  className="np-button np-button--sm np-button--primary np-button--full" 
                                  onClick={() => void runAction('sync-profile', bootstrapProfile)}
                                  disabled={busy === 'sync-profile'}
                                >
                                  {busy === 'sync-profile' ? 'SYNCING...' : 'RE-SYNC CRM PROFILE'}
                                </button>
                                <button className="np-button np-button--sm np-button--ghost np-button--full" onClick={loginToCrm}>
                                  Verify in Settings
                                </button>
                                <p className="np-micro" style={{ fontSize: 8, marginTop: 4, opacity: 0.6 }}>
                                  If sync persists, ensure a number is saved in your CRM profile.
                                </p>
                             </div>
                           )}
                        </div>
                      )}

                      {call.state === 'incoming' && (
                        <button className="np-button np-button--success np-button--full" onClick={() => void runAction('answer', answerCall)}>
                          Answer Incoming
                        </button>
                      )}

                      {callIsLive && (
                        <div className="np-live-controls">
                          <div className="np-live-stats font-mono">
                            {formatElapsed(call.startedAt)}
                          </div>
                          <div className="np-live-actions">
                            <button
                              className={`np-button np-button--sm ${call.muted ? 'np-button--amber' : 'np-button--ghost'}`}
                              onClick={() => void muteCall(!call.muted)}
                            >
                              {call.muted ? 'Unmute' : 'Mute'}
                            </button>
                            <button className="np-button np-button--sm np-button--danger" onClick={() => void runAction('hangup', hangupCall)}>
                              Hangup
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.section>

                  <motion.section 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4, ease: FORENSIC_EASE }}
                    className="np-card"
                  >
                    <div className="np-section-head">
                      <h3 className="np-title">Intelligence</h3>
                      <span className="np-micro">{notes.length} log{notes.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="np-note-composer">
                      <textarea
                        className="nodal-input nodal-input--textarea"
                        placeholder="Log forensic findings..."
                        rows={3}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                      />
                      <div className="np-composer-actions">
                        <button
                          className="np-button np-button--primary"
                          onClick={() => void runAction('save-note', async () => {
                            await saveNote({ note: noteDraft, contactId: contact?.id, accountId: account?.id })
                            setNoteDraft('')
                          })}
                          disabled={!noteDraft.trim() || busy === 'save-note'}
                        >
                          {busy === 'save-note' ? 'Saving...' : 'Commit Note'}
                        </button>
                      </div>
                    </div>

                    <div className="np-note-list">
                      {notes.map((note) => (
                        <div key={note.id} className="np-note-entry">
                          <div className="np-note-meta">
                            <span className="np-note-source">{note.source === 'ai' ? 'Forensic AI' : 'Field Agent'}</span>
                            <span className="np-note-date">{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="np-note-text">{note.text}</p>
                        </div>
                      ))}
                      {notes.length === 0 && <p className="np-micro text-center pt-2">No logs captured for this session.</p>}
                    </div>
                  </motion.section>

                  <motion.section 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.4, ease: FORENSIC_EASE }}
                    className="np-card"
                  >
                    <div className="np-section-head">
                      <h3 className="np-title">Contacts</h3>
                      <span className="np-micro">{allContacts.length} total</span>
                    </div>
                    <div className="np-contact-list">
                      {visibleContacts.map((c) => (
                        <div key={c.id} className="np-contact-entry">
                          <div className="np-contact-info">
                            <div className="np-entity-mark np-entity-mark--sm">
                              <EntityMark name={c.name} logoUrl={null} />
                            </div>
                            <div className="np-contact-copy">
                              <div className="np-contact-name">{c.name}</div>
                              <div className="np-micro">{c.title || 'Executive'}</div>
                            </div>
                          </div>
                          {contactPhone(c) && !callIsLive && (
                            <button
                              className="np-button np-button--sm np-button--ghost"
                              onClick={() => void runAction('dial', () => dialCall(contactPhone(c), c.id, c.accountId || undefined))}
                              disabled={busy === 'dial'}
                            >
                              Call
                            </button>
                          )}
                        </div>
                      ))}
                      {allContacts.length === 0 && <p className="np-micro text-center pt-2">No contact records found.</p>}
                      {hasMoreContacts && (
                        <button className="np-button np-button--xs np-button--full np-button--ghost" style={{ marginTop: 8 }}>
                          View all {allContacts.length} contacts
                        </button>
                      )}
                    </div>
                  </motion.section>
                </>
              ) : (
                <section className="np-card np-card--hero" style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <h3 className="np-hero-title">CRM Disconnected</h3>
                  <p className="np-copy" style={{ marginTop: 12, marginBottom: 24 }}>
                    Your forensic session has expired or is not yet initialized.
                  </p>
                  <button className="np-button np-button--primary np-button--full" onClick={loginToCrm}>
                    Uplink Now
                  </button>
                </section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="np-footer">
        <div className="np-footer-left">
          <span className="np-micro font-mono">v1.2.4</span>
        </div>
        <div className="np-footer-right">
          <button className="np-button-forensic" title="Help">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button className="np-button-forensic" title="Settings" onClick={loginToCrm}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(<App />)
}
