import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Globe, Building2, ArrowUpRight, Star, MapPin, Mail, Smartphone, Landmark, Clock, Grid3X3, Radio, Plus } from 'lucide-react'
import {
  defaultCallState,
  formatElapsed,
  formatPhone,
  extractDomain,
  normalizeTwilioPhone,
  resolveCallerId,
  STATE_KEY,
  trimText,
  type ExtensionState,
  type MatchAccount,
  type MatchContact,
} from '../shared'
import { mapLocationToZone, LOAD_ZONE_COLOR_MAP, ERCOT_ZONES, type ErcotZone } from '../../../src/lib/market-mapping'
import { resolveContactPhotoUrl } from '../../../src/lib/contactAvatar'
import { ContactAvatar } from '../contactAvatar'

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
  const call = state.call
  if (call.state === 'error') {
    if (call.lastError) console.warn('[Extension] Active Twilio Error:', call.lastError)
    return `Call Error: ${call.lastError?.slice(0, 16) || 'check settings'}`
  }
  if (call.state === 'initializing') return 'Connecting calls'
  if (call.state === 'incoming') return 'Ringing'
  if (call.state === 'connected') return 'Live call'
  if (call.state === 'dialing') return 'Dialing'
  if (call.enabled && call.deviceReady) return 'Calls ready'
  if (call.enabled) return 'Connecting'
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

function EntityAvatar({
  name,
  imageUrl,
  size = 56,
  className,
}: {
  name: string
  imageUrl: string | null | undefined
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
  }, [imageUrl, name])

  const initials = entityInitials(name)
  const showPhoto = Boolean(imageUrl && !failed)

  return (
    <motion.div
      className={className || 'np-entity-mark'}
      style={{ width: size, height: size }}
      initial={false}
    >
      <AnimatePresence mode="wait" initial={false}>
        {showPhoto && loaded ? (
          <motion.img
            key={`photo-${imageUrl}`}
            src={imageUrl || ''}
            alt={name}
            initial={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
            transition={{ duration: 0.28, ease: FORENSIC_EASE }}
            className="np-entity-mark__img"
            onError={() => setFailed(true)}
          />
        ) : (
          <motion.span
            key={`initials-${name}-${imageUrl || 'none'}`}
            initial={{ opacity: 0.75, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2, ease: FORENSIC_EASE }}
            className="np-entity-mark__initials"
          >
            {initials}
          </motion.span>
        )}
      </AnimatePresence>

      {showPhoto && !loaded && (
        <img
          src={imageUrl || ''}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </motion.div>
  )
}

function resolveContactPhoto(contact: MatchContact | null) {
  if (!contact) return null
  return trimText(
    resolveContactPhotoUrl(
      contact as unknown as Record<string, unknown>,
      (contact as any)?.metadata || null
    ) || ''
  ) || null
}

function contactPhone(contact: MatchContact | null) {
  return trimText(
    contact?.phone ||
      contact?.mobile ||
      contact?.workPhone ||
      contact?.companyPhone ||
      contact?.otherPhone ||
      contact?.directPhone ||
      ''
  ) || ''
}

function accountPhone(account: MatchAccount | null) {
  return trimText(
    account?.phone ||
      (account as any)?.companyPhone ||
      (account as any)?.company_phone ||
      (account as any)?.phoneNumber ||
      (account as any)?.phone_number ||
      ''
  ) || ''
}

function useCallDuration(startedAt: string | null) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!startedAt) {
      setSeconds(0)
      return
    }
    const start = new Date(startedAt).getTime()
    const update = () => {
      setSeconds(Math.floor((Date.now() - start) / 1000))
    }
    update()
    const i = setInterval(update, 1000)
    return () => clearInterval(i)
  }, [startedAt])
  return seconds
}

function CallBars() {
  return (
    <div className="np-call-bars">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="np-call-bar"
          animate={{ height: [2, 14, 2], opacity: [0.3, 0.8, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function ActiveCallFooter({ 
  state, 
  onAnswer,
  onHangup, 
  onDigits 
}: { 
  state: ExtensionState; 
  onAnswer: () => void;
  onHangup: () => void;
  onDigits: (d: string) => void;
}) {
  useCallDuration(state.call.startedAt)
  const [showDialpad, setShowDialpad] = useState(false)
  const name = state.match?.contact?.name || state.match?.account?.name || state.call.incomingFrom || "Active Session"
  const meta = state.match?.account?.name && state.match.contact ? `via ${state.match.account.name}` : (state.call.state === 'incoming' ? "Incoming Call" : "Voice Uplink")

  return (
    <motion.div
      className="np-call-footer"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="np-call-footer__identity">
        <CallBars />
        <div className="np-call-footer__copy">
          <p className="np-call-footer__name">{name}</p>
          <p className="np-call-footer__meta font-mono">{meta}</p>
        </div>
      </div>

      <div className="np-call-footer__stats">
        <span className="np-call-footer__duration font-mono">
          {state.call.state === 'incoming' ? 'RINGING' : formatElapsed(state.call.startedAt)}
        </span>
      </div>

      <div className="np-call-footer__actions">
        {state.call.state === 'incoming' ? (
          <>
            <button
              className="np-call-footer__btn np-call-footer__btn--answer"
              onClick={onAnswer}
              aria-label="Answer incoming call"
              title="Answer"
            >
              <Phone size={16} />
            </button>
            <button
              className="np-call-footer__btn np-call-footer__btn--hangup"
              onClick={onHangup}
              aria-label="Decline incoming call"
              title="Decline"
            >
              <Phone size={18} style={{ transform: 'rotate(135deg)' }} />
            </button>
          </>
        ) : (
          <>
            <div className="relative">
              <button 
                className="np-call-footer__btn np-call-footer__btn--dialpad" 
                onClick={() => setShowDialpad(!showDialpad)}
              >
                <Grid3X3 size={16} />
              </button>
              
              <AnimatePresence>
                {showDialpad && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="np-dialpad-panel"
                  >
                    {[
                          { digit: '1', letters: '' },
                          { digit: '2', letters: 'ABC' },
                          { digit: '3', letters: 'DEF' },
                          { digit: '4', letters: 'GHI' },
                          { digit: '5', letters: 'JKL' },
                          { digit: '6', letters: 'MNO' },
                          { digit: '7', letters: 'PQRS' },
                          { digit: '8', letters: 'TUV' },
                          { digit: '9', letters: 'WXYZ' },
                          { digit: '*', letters: '' },
                          { digit: '0', letters: '+' },
                          { digit: '#', letters: '' },
                        ].map(item => (
                          <button
                            key={item.digit}
                            onClick={() => onDigits(item.digit)}
                            className="np-dialpad-key"
                          >
                            <span className="np-dialpad-digit">{item.digit}</span>
                            {item.letters && <span className="np-dialpad-letters">{item.letters}</span>}
                          </button>
                        ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              className="np-call-footer__btn np-call-footer__btn--hangup" 
              onClick={onHangup}
            >
              <Phone size={18} style={{ transform: 'rotate(135deg)' }} />
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}

function primaryPhone(
  account: MatchAccount | null,
  contact: MatchContact | null,
  pagePhone: string | null | undefined,
  accountContacts: MatchContact[]
) {
  const fallbackContact = accountContacts.find((item) => Boolean(contactPhone(item))) || null
  return (
    trimText(contactPhone(contact) || accountPhone(account) || contactPhone(fallbackContact) || pagePhone || '') ||
    ''
  )
}

function App() {
  const [state, setState] = useState<ExtensionState | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(state?.call?.state === 'error' ? state.call.lastError : null)
  const [initStuckMs, setInitStuckMs] = useState(0)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [currentView, setCurrentView] = useState<'main' | 'settings'>('main')
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

  const ingestPageAccount = async () => {
    const response = await sendMessage('INGEST_PAGE_ACCOUNT')
    if (response?.state) setState(response.state)
  }

  const requestMicrophone = async () => {
    setBusy('mic')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setBusy(null)
      // Once granted in sidepanel, the extension origin is authorized.
      // Re-bootstrap to let the offscreen worker take over.
      void bootstrapProfile()
    } catch (err) {
      console.error('[Extension] Mic request failed:', err)
      setError('Microphone access is BLOCKED. You must manually unblock it in Chrome settings.')
      setBusy(null)
    }
  }

  const openExtensionSettings = () => {
    const eid = chrome.runtime.id
    chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=chrome-extension://${eid}` })
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

  const sendDigits = async (digits: string) => {
    const response = await sendMessage('CALL_DIGITS', { digits })
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

  const recoverCalls = async () => {
    const response = await sendMessage('ENABLE_CALLS', {
      appOrigin: auth?.appOrigin || null,
      callerId: selectedNumber || null,
    })
    if (response?.state) setState(response.state)
  }

  const loginToCrm = () => {
    const origin = state?.auth?.appOrigin || 'https://www.nodalpoint.io'
    chrome.tabs.create({ url: origin })
  }

  if (!state) return null

  const { auth, page, pageStatus, match, call, accountContacts, notes } = state
  const account = match?.account
  const contact = match?.contact
  const hasMatchedAccount = Boolean(account?.id)
  const pageDomain = extractDomain(page?.origin || page?.url) || null
  const selectedNumber = resolveCallerId(auth)
  const accountLocation = trimText((account as any)?.city || (account as any)?.state || (account as any)?.address || '')
  const accountZone = mapLocationToZone((account as any)?.city || undefined, (account as any)?.state || undefined, accountLocation || undefined)
  const zoneColor = LOAD_ZONE_COLOR_MAP[accountZone] || LOAD_ZONE_COLOR_MAP[ERCOT_ZONES.NORTH]
  const zoneStyle = {
    color: zoneColor,
    backgroundColor: `${zoneColor}1f`,
    borderColor: `${zoneColor}2f`,
  }

  const pagePhoneCandidate = ((page as any)?.phones?.[0] || (page as any)?.phoneNumber || null) as string | null
  const dialTarget = normalizeTwilioPhone(primaryPhone(account as any, contact as any, pagePhoneCandidate, accountContacts) || '')
  const outboundTarget = dialTarget
  const accountLocationValue = trimText((account as any)?.address || [account?.city, account?.state].filter(Boolean).join(', ')) || ''

  const crmStatus = formatCrmStatus(state)
  const callStatus = formatCallStatus(state)
  const crmPill = `np-pill font-mono ${auth ? 'np-pill--blue' : 'np-pill--amber'}`
  const callPill = `np-pill font-mono ${call.state === 'error' ? 'np-pill--red' : call.deviceReady ? 'np-pill--blue' : 'np-pill--amber'}`

  const heroTitle = (account as any)?.name || (contact as any)?.name || page?.title || 'No record identified'
  const heroSubtitle = account
    ? [account.industry, [account.city, account.state].filter(Boolean).join(', ')].filter(Boolean).join(' | ') ||
      pageDomain ||
      'Account matched from page capture.'
    : contact
      ? [(contact as any).title, (contact as any).accountName || (account as any)?.name].filter(Boolean).join(' | ') ||
        pageDomain ||
        'Contact matched from page capture.'
      : pageDomain || 'Identify a session to start the match.'

  const rawSummary = account?.description || match?.summary || ''
  const isBoilerplate = rawSummary.toLowerCase().startsWith('matched the page to')
  const heroSummary = isBoilerplate && account?.description ? account.description : rawSummary
  const summaryToDisplay = isBoilerplate && !account?.description ? '' : heroSummary
  
  const MAX_SUMMARY = 120
  const isTruncated = summaryToDisplay.length > MAX_SUMMARY && !descriptionExpanded
  const finalSummary = isTruncated ? `${summaryToDisplay.slice(0, MAX_SUMMARY).trimEnd()}…` : summaryToDisplay
  const allContacts = accountContacts.length > 0 ? accountContacts : match?.contacts || []
  const visibleContacts = allContacts.slice(0, 5)
  const accountLogoUrl = trimText(
    (account as any)?.logoUrl ||
      (account as any)?.logo_url ||
      (account as any)?.metadata?.logoUrl ||
      (account as any)?.metadata?.logo_url ||
      ''
  ) || null
  
  const callIsLive = call.state === 'incoming' || call.state === 'connected' || call.state === 'dialing'
  const showCallButton = Boolean(selectedNumber && dialTarget)
  const loadingMode = pageStatus === 'ingesting'
    ? 'ingest'
    : pageStatus === 'capturing'
      ? 'capture'
      : !pageStatus || pageStatus === 'idle'
        ? 'startup'
        : null
  const syncTitle =
    loadingMode === 'ingest'
      ? 'Ingesting account...'
      : loadingMode === 'capture'
        ? 'Scanning page...'
        : 'Identifying session context...'
  const syncBody =
    loadingMode === 'ingest'
      ? 'Creating the account in CRM and enriching it with Apollo.'
      : loadingMode === 'capture'
        ? 'Reading the active tab before matching it to CRM.'
        : 'Loading the Nodal Point command deck...'

  // Branded Loading Splash
  const isSyncing =
    busy === 'auto-capture' ||
    busy === 'initial-sync' ||
    busy === 'capture' ||
    busy === 'ingest' ||
    busy === 'sync-profile' ||
    loadingMode === 'startup' ||
    pageStatus === 'capturing' ||
    pageStatus === 'ingesting'

  let viewNode;
  if (isSyncing) {
    viewNode = (
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
            <div className="np-sync-title font-mono">{syncTitle}</div>
            <div className="np-sync-body font-sans">{syncBody}</div>
          </div>
        </div>
      </motion.div>
    );
  } else if (currentView === 'settings') {
    viewNode = (
      <motion.div
        key="settings"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3, ease: FORENSIC_EASE }}
        className="np-scroll"
      >
        <div className="np-stack" style={{ padding: '20px' }}>
          <div className="np-section-head" style={{ marginBottom: 20 }}>
            <div className="np-kicker font-mono">00 // CONFIGURATION</div>
            <button 
              className="np-micro font-mono" 
              style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}
              onClick={() => setCurrentView('main')}
            >
              BACK_TO_RECON
            </button>
          </div>

          <div className="np-card">
            <div className="np-section-head">
              <div className="np-kicker font-mono text-[10px]">SESSION_CONTEXT</div>
            </div>
            <div className="np-status-row" style={{ marginTop: 8, flexFlow: 'wrap' }}>
              <span className={crmPill}>{crmStatus}</span>
              <span className={callPill} title={state.call.lastError || callStatus}>{callStatus}</span>
              {auth?.email ? (
                <span className="np-pill" title={auth.email}>{auth.email}</span>
              ) : (
                <span className="np-pill np-pill--amber">OFFLINE</span>
              )}
            </div>
            
            <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <p className="np-micro" style={{ marginBottom: 12, opacity: 0.6 }}>Authenticated as:</p>
              <p className="font-mono text-xs">{auth?.email || 'Unauthorized session'}</p>
            </div>

            <div style={{ marginTop: 20 }}>
              <button className="np-button np-button--sm np-button--ghost np-button--full" onClick={loginToCrm}>
                Open Platform Profile
              </button>
              <button className="np-button np-button--sm np-button--ghost np-button--full" style={{ marginTop: 8, color: '#fca5a5' }} onClick={() => sendMessage('AUTH_CLEAR')}>
                Disconnect Session
              </button>
            </div>
          </div>

          <div className="np-card" style={{ marginTop: 12 }}>
            <div className="np-section-head">
              <div className="np-kicker font-mono text-[10px]">TELEMETRY</div>
            </div>
            <div style={{ marginTop: 8 }}>
              <p className="np-micro" style={{ opacity: 0.5 }}>Active Origin:</p>
              <p className="font-mono text-[10px] break-all text-zinc-400">{page?.url || 'Scanning...'}</p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  } else {
    viewNode = (
      <motion.div
        key="content"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
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

          {call.state === 'error' && (call.lastError?.includes('Permission') || call.lastError?.includes('mic')) ? (
            <div className="np-error-box np-void-card" style={{ marginBottom: 12, border: '1px solid rgba(239, 68, 68, 0.2)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
              <p className="np-copy" style={{ color: '#fca5a5', fontSize: '11px', marginBottom: '8px' }}>
                {error?.includes('BLOCKED') 
                  ? "The microphone is blocked in your browser for this extension. Please open settings and set Microphone to 'Allow'." 
                  : "Microphone access is required to make calls."}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="np-btn np-btn--primary" 
                  style={{ flex: 1, height: '32px', fontSize: '12px' }}
                  onClick={requestMicrophone}
                  disabled={busy === 'mic' || !!error?.includes('BLOCKED')}
                >
                  {busy === 'mic' ? 'Requesting...' : 'Grant Permission'}
                </button>
                {!!error?.includes('BLOCKED') && (
                  <button 
                    className="np-btn np-btn--secondary" 
                    style={{ flex: 1, height: '32px', fontSize: '12px' }}
                    onClick={openExtensionSettings}
                  >
                    Site Settings
                  </button>
                )}
              </div>
            </div>
          ) : null}


          {auth && hasMatchedAccount ? (
            <>
              <button
                type="button"
                className="np-hero-identity-link"
                onClick={() => account?.id && window.open(`${auth?.appOrigin}/network/accounts/${account.id}`, '_blank')}
                title="Open Account Dossier"
              >
                <motion.section 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.4, ease: FORENSIC_EASE }}
                  className="np-card np-card--hero"
                >
                  <div className="np-hero-identity">
                    <EntityAvatar name={heroTitle} imageUrl={accountLogoUrl} size={60} className="np-entity-mark np-entity-mark--large" />
                    <div className="np-hero-copy">
                      <div className="np-kicker font-mono">ACCOUNT DOSSIER</div>
                      <h2 className="np-hero-title font-sans">{heroTitle}</h2>
                      <p className="np-hero-subtitle font-sans" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {heroSubtitle}
                        <ArrowUpRight style={{ width: 12, height: 12, opacity: 0.3 }} />
                      </p>
                    </div>
                  </div>

                  {summaryToDisplay && (
                    <div className="np-summary-box-card" style={{ marginTop: 16 }}>
                      <p className="np-copy--tight font-sans leading-relaxed text-zinc-300">
                        {finalSummary}
                        {summaryToDisplay.length > MAX_SUMMARY && (
                          <span 
                            className="np-read-more"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDescriptionExpanded((prev) => !prev)
                            }}
                          >
                            {descriptionExpanded ? 'READ LESS' : 'READ MORE'}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="np-dossier-meta font-mono" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--np-border)' }}>
                    <span className="opacity-60 font-sans">Page context: </span>
                    {page?.title ? snippet(page.title, 42) : 'No nexus'}
                  </div>
                </motion.section>
              </button>

              <motion.section 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4, ease: FORENSIC_EASE }}
                className="np-card"
              >
                  <div className="np-section-head">
                  <div className="np-kicker font-mono">01 // UPLINKS</div>
                </div>

                <div className="np-action-grid">
                  {showCallButton && (
                    <button
                      className="np-uplink-primary"
                      onClick={() => void runAction('dial', () => dialCall(dialTarget || '', contact?.id, account?.id || undefined))}
                      disabled={busy === 'dial'}
                    >
                      <div className="np-uplink-primary__row">
                        <div className="np-uplink-icon--phone">
                          <Phone style={{ width: 22, height: 22 }} />
                          <Star 
                            size={8} 
                            style={{ 
                              fill: '#eab308', 
                              color: '#eab308', 
                              position: 'absolute', 
                              top: 0, 
                              right: 0 
                            }} 
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="np-uplink-primary__label">CORPORATE PHONE</span>
                          <span className="np-uplink-primary__value font-mono">{formatPhone(dialTarget)}</span>
                        </div>
                        <ArrowUpRight style={{ width: 14, height: 14, opacity: 0.5, marginLeft: 'auto' }} />
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    className="np-uplink-row"
                    onClick={() => {
                      const domain = trimText((account as any)?.website || account?.domain || '')
                      if (!domain) return
                      const normalized = domain.startsWith('http') ? domain : `https://${domain}`
                      window.open(normalized, '_blank')
                    }}
                    disabled={!trimText((account as any)?.website || account?.domain || '')}
                  >
                    <div className="np-uplink-row__main">
                      <Globe style={{ width: 16, height: 16, color: 'var(--np-dim)', marginTop: 2 }} />
                      <div className="min-w-0 flex-1">
                        <span className="np-uplink-row__kicker">DIGITAL DOMAIN</span>
                        <span className="np-uplink-row__value">{trimText((account as any)?.website || account?.domain || '') || 'No domain matched'}</span>
                      </div>
                      <ArrowUpRight style={{ width: 12, height: 12, opacity: 0.3, marginLeft: 'auto' }} />
                    </div>
                  </button>

                  {accountLocationValue && (
                    <button
                      type="button"
                      className="np-uplink-row"
                      onClick={() => {
                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accountLocationValue)}`, '_blank')
                      }}
                    >
                      <div className="np-uplink-row__main">
                        <MapPin style={{ width: 16, height: 16, color: 'var(--np-dim)', marginTop: 2 }} />
                        <div className="min-w-0 flex-1">
                          <span className="np-uplink-row__kicker">LOCATION CONTEXT</span>
                          <span className="np-uplink-row__value">{accountLocationValue}</span>
                        </div>
                        <ArrowUpRight style={{ width: 12, height: 12, opacity: 0.3, marginLeft: 'auto' }} />
                      </div>
                    </button>
                  )}

                  <div className="np-uplink-row np-uplink-row--static">
                    <div className="np-uplink-row__main">
                      <Building2 style={{ width: 16, height: 16, color: 'var(--np-dim)', marginTop: 2 }} />
                      <div className="min-w-0 flex-1">
                        <span className="np-uplink-row__kicker">ZONE IDENTIFIER</span>
                        <span className="np-uplink-row__value" style={{ display: 'flex' }}>
                          <span className="np-zone-chip" style={zoneStyle}>{accountZone}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              <motion.section 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4, ease: FORENSIC_EASE }}
                className="np-card"
              >
                <div className="np-section-head">
                  <div className="np-kicker font-mono">02 // INTELLIGENCE</div>
                  <span className="np-micro font-mono">{notes.length} total</span>
                </div>

                <div className="np-note-composer" style={{ marginBottom: 16 }}>
                  <textarea
                    className="nodal-input nodal-input--textarea"
                    placeholder="Log forensic findings..."
                    rows={3}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    style={{ minHeight: '80px', marginBottom: 8 }}
                  />
                  <div className="np-composer-actions">
                    <button
                      className="np-button np-button--primary np-button--full"
                      onClick={() => void runAction('save-note', async () => {
                        await saveNote({ note: noteDraft, contactId: contact?.id, accountId: account?.id })
                        setNoteDraft('')
                      })}
                      disabled={!noteDraft.trim() || busy === 'save-note'}
                    >
                      {busy === 'save-note' ? 'COMMITTING...' : 'COMMIT LOG'}
                    </button>
                  </div>
                </div>

                <div className="np-note-list np-scroll" style={{ maxHeight: '200px' }}>
                  {notes.map((note) => (
                    <div key={note.id} className="np-note-entry font-mono" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)', marginBottom: 8, padding: 10, borderRadius: 8 }}>
                      <div className="np-note-meta" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="text-[9px] uppercase tracking-tighter" style={{ color: 'var(--np-blue)' }}>{note.source === 'ai' ? 'AI_SYS' : 'USER'}</span>
                        <span className="text-[9px] opacity-40">{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-zinc-300 m-0">{note.text}</p>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="np-micro text-center py-2 opacity-30">No intelligence logs found.</p>}
                </div>
              </motion.section>

              <motion.section 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4, ease: FORENSIC_EASE }}
                className="np-card"
              >
                <div className="np-section-head">
                  <div className="np-kicker font-mono">03 // NETWORK</div>
                  <span className="np-micro font-mono">{allContacts.length} nodes</span>
                </div>
                <div className="np-contact-list">
                  {visibleContacts.map((c) => (
                    <div key={c.id} className="np-contact-entry" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div className="np-contact-info" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ContactAvatar name={c.name} photoUrl={resolveContactPhoto(c)} size={32} />
                        <div className="np-contact-copy">
                          <div className="text-sm font-semibold text-white">{c.name}</div>
                          <div className="text-[10px] text-zinc-500 uppercase">{c.title || 'Executive'}</div>
                        </div>
                      </div>
                      {contactPhone(c) && (
                        <button
                          className="np-button-forensic text-zinc-400 hover:text-white"
                          onClick={() => void runAction('dial', () => dialCall(contactPhone(c) || '', c.id, c.accountId || undefined))}
                          disabled={busy === 'dial'}
                        >
                          <Phone size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.section>
            </>
          ) : auth && pageStatus === 'unmatched' ? (
            <>
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: FORENSIC_EASE }}
                className="np-card np-card--hero"
              >
                <div className="np-hero-identity">
                  <EntityAvatar name={page?.title || pageDomain || 'Unmatched page'} imageUrl={null} size={60} className="np-entity-mark np-entity-mark--large" />
                  <div className="np-hero-copy">
                    <div className="np-kicker font-mono">UNMATCHED PAGE</div>
                    <h2 className="np-hero-title font-sans">{page?.title || pageDomain || 'No CRM record found'}</h2>
                    <p className="np-hero-subtitle font-sans" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {pageDomain || 'This site is not in CRM yet.'}
                      <ArrowUpRight style={{ width: 12, height: 12, opacity: 0.3 }} />
                    </p>
                  </div>
                </div>

                <div className="np-summary-box-card" style={{ marginTop: 16 }}>
                  <p className="np-copy--tight font-sans leading-relaxed text-zinc-300">
                    Click the plus badge or ingest button to create the account in CRM and enrich it with Apollo.
                  </p>
                </div>

                <div className="np-dossier-meta font-mono" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--np-border)' }}>
                  <span className="opacity-60 font-sans">Page context: </span>
                  {page?.title ? snippet(page.title, 42) : pageDomain || 'No nexus'}
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4, ease: FORENSIC_EASE }}
                className="np-card"
              >
                <div className="np-section-head">
                  <div className="np-kicker font-mono">01 // UPLINKS</div>
                </div>

                <div className="np-action-grid">
                  <button
                    className="np-uplink-primary"
                    onClick={() => void runAction('ingest', () => ingestPageAccount())}
                    disabled={busy === 'ingest'}
                  >
                    <div className="np-uplink-primary__row">
                      <div className="np-uplink-icon--phone">
                        <Plus size={22} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="np-uplink-primary__label">ADD TO CRM</span>
                        <span className="np-uplink-primary__value font-mono">Ingest account from this site</span>
                      </div>
                      <ArrowUpRight style={{ width: 14, height: 14, opacity: 0.5, marginLeft: 'auto' }} />
                    </div>
                  </button>

                  <button
                    type="button"
                    className="np-uplink-row"
                    onClick={() => {
                      const domain = trimText(page?.url || page?.origin || '')
                      if (!domain) return
                      const normalized = domain.startsWith('http') ? domain : `https://${domain}`
                      window.open(normalized, '_blank')
                    }}
                  >
                    <div className="np-uplink-row__main">
                      <Globe style={{ width: 16, height: 16, color: 'var(--np-dim)', marginTop: 2 }} />
                      <div className="min-w-0 flex-1">
                        <span className="np-uplink-row__kicker">SITE SOURCE</span>
                        <span className="np-uplink-row__value">{pageDomain || page?.url || 'No domain matched'}</span>
                      </div>
                      <ArrowUpRight style={{ width: 12, height: 12, opacity: 0.3, marginLeft: 'auto' }} />
                    </div>
                  </button>
                </div>
              </motion.section>
            </>
          ) : auth ? (
            <section className="np-card np-card--hero" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <h3 className="np-hero-title">CRM Loading</h3>
              <p className="np-copy" style={{ marginTop: 12, marginBottom: 24 }}>
                Reading the current page and resolving the account context.
              </p>
              <button className="np-button np-button--primary np-button--full" onClick={loginToCrm}>
                Open Platform Profile
              </button>
            </section>
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
    );
  }

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
      </div>

      <AnimatePresence mode="wait">
        {viewNode}
      </AnimatePresence>

      <div className="np-footer">
        <div className="np-footer-left">
          <span className="np-micro font-mono">v1.2.4</span>
        </div>
        <div className="np-footer-right">
          <button className="np-button-forensic" title="Help">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button 
            className={`np-button-forensic ${currentView === 'settings' ? 'text-[#002FA7]' : ''}`} 
            title="Settings" 
            onClick={() => setCurrentView(currentView === 'settings' ? 'main' : 'settings')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {callIsLive && (
          <ActiveCallFooter 
            state={state} 
            onAnswer={answerCall}
            onHangup={hangupCall} 
            onDigits={sendDigits}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(<App />)
}
