import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Globe, Building2, ArrowUpRight, Star, MapPin, Mail, Smartphone, Landmark, Clock } from 'lucide-react'
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
  return trimText(contact?.phone || contact?.mobile || contact?.workPhone || contact?.companyPhone || '') || ''
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

function primaryPhone(
  account: MatchAccount | null,
  contact: MatchContact | null,
  pagePhone: string | null | undefined,
  accountContacts: MatchContact[]
) {
  const fallbackContact = accountContacts.find((item) => Boolean(contactPhone(item))) || null
  return (
    trimText(contactPhone(contact) || contactPhone(fallbackContact) || accountPhone(account) || pagePhone || '') ||
    ''
  )
}

function App() {
  const [state, setState] = useState<ExtensionState | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initStuckMs, setInitStuckMs] = useState(0)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
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

  const { auth, page, match, call, accountContacts, notes } = state
  const account = match?.account
  const contact = match?.contact
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
  const hasMoreContacts = allContacts.length > visibleContacts.length
  const accountLogoUrl = trimText(
    (account as any)?.logoUrl ||
      (account as any)?.logo_url ||
      (account as any)?.metadata?.logoUrl ||
      (account as any)?.metadata?.logo_url ||
      ''
  ) || null
  
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
  const showCallButton = Boolean(selectedNumber && dialTarget && !callIsLive)

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
          <span className={callPill} title={state.call.lastError || callStatus}>{callStatus}</span>
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
                    {error?.includes('BLOCKED') && (
                      <button 
                        className="np-btn" 
                        style={{ flex: 1, height: '32px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        onClick={openExtensionSettings}
                      >
                        Open Settings
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              <motion.section 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: FORENSIC_EASE }}
                className="np-card np-card--hero"
              >
                <div className="np-hero-identity">
                  <EntityAvatar name={heroTitle} imageUrl={accountLogoUrl} size={56} className="np-entity-mark np-entity-mark--large" />
                  <div className="np-hero-copy">
                    <div className="np-kicker font-mono">CURRENT DOSSIER</div>
                    <h2 className="np-hero-title font-sans">{heroTitle}</h2>
                    <p className="np-hero-subtitle font-sans">{heroSubtitle}</p>
                  </div>
                </div>

                {summaryToDisplay && (
                  <p className="np-copy np-copy--tight font-sans">
                    {finalSummary}
                    {summaryToDisplay.length > MAX_SUMMARY && (
                      <button 
                        className="np-read-more"
                        onClick={() => setDescriptionExpanded((prev) => !prev)}
                      >
                        {descriptionExpanded ? 'Read Less' : 'Read More'}
                      </button>
                    )}
                  </p>
                )}

                <p className="np-micro np-dossier-meta font-mono">
                  <span className="opacity-60 font-sans">Page: </span>
                  {page?.title ? snippet(page.title, 48) : 'No page nexus'}
                  <span className="np-dossier-meta__sep">|</span>
                  <span className="opacity-60 font-sans">Caller ID: </span>
                  {selectedNumber
                    ? formatPhone(selectedNumber)
                    : <span className="text-amber-400">MISSING</span>}
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
                      <div className="np-kicker font-mono">01 // UPLINKS</div>
                      <div className="np-section-head__actions">
                        {call.state === 'error' && (
                          <button
                            className="np-button np-button--sm np-button--ghost"
                            onClick={() => void runAction('recover-calls', recoverCalls)}
                            disabled={busy === 'recover-calls'}
                          >
                            {busy === 'recover-calls' ? 'Recovering...' : 'Recover Calls'}
                          </button>
                        )}
                        {callIsLive && (
                          <div className="np-pulse-tag">
                            <span className="np-pulse-dot" />
                            {callLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="np-action-grid">
                      <button
                        className="np-uplink-primary"
                        onClick={() => {
                          if (!outboundTarget) return
                          void runAction('dial', () => dialCall(outboundTarget, contact?.id, account?.id))
                        }}
                        disabled={busy === 'dial' || !showCallButton}
                      >
                        <div className="np-uplink-primary__row">
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <Phone style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.7)' }} />
                            <Star style={{ width: 8, height: 8, fill: '#eab308', color: '#eab308', position: 'absolute', top: -4, right: -4 }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="np-uplink-primary__label">Corporate Phone</span>
                            <span className="np-uplink-primary__value">
                              {busy === 'dial'
                                ? 'Connecting...'
                                : outboundTarget
                                  ? formatPhone(outboundTarget) || outboundTarget
                                  : 'No matched phone found'}
                            </span>
                          </div>
                          <ArrowUpRight style={{ width: 12, height: 12, flexShrink: 0, color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }} />
                        </div>
                      </button>

                      <button
                        type="button"
                        className="np-uplink-row"
                        onClick={() => {
                          const domain = trimText((account as any)?.website || account?.domain || '')
                          if (!domain) return
                          const normalized = domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`
                          window.open(normalized, '_blank')
                        }}
                        disabled={!trimText((account as any)?.website || account?.domain || '')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minWidth: 0 }}>
                          <Globe style={{ width: 16, height: 16, color: '#71717a', flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span className="np-uplink-row__kicker">Digital Domain</span>
                            <span className="np-uplink-row__value">{trimText((account as any)?.website || account?.domain || '') || 'No domain'}</span>
                          </div>
                          <ArrowUpRight style={{ width: 12, height: 12, flexShrink: 0, color: '#3f3f46' }} />
                        </div>
                      </button>

                      <button
                        type="button"
                        className="np-uplink-row"
                        onClick={() => {
                          const location = accountLocationValue
                          if (!location) return
                          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank')
                        }}
                        disabled={!accountLocationValue}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minWidth: 0 }}>
                          <MapPin style={{ width: 16, height: 16, color: '#71717a', flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span className="np-uplink-row__kicker">Asset Recon (Location)</span>
                            <span className="np-uplink-row__value">{accountLocationValue || 'No location'}</span>
                          </div>
                          <ArrowUpRight style={{ width: 12, height: 12, flexShrink: 0, color: '#3f3f46' }} />
                        </div>
                      </button>

                      <div className="np-uplink-row np-uplink-row--static" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Building2 style={{ width: 16, height: 16, color: '#71717a', flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span className="np-uplink-row__kicker">Zone Identifier</span>
                          <span className="np-uplink-row__value np-uplink-row__value--chip">
                            <span className="np-zone-chip" style={zoneStyle}>{accountZone}</span>
                          </span>
                        </div>
                      </div>

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

                    {!selectedNumber ? (
                      <div className="np-alert-card">
                        <p className="np-micro" style={{ marginBottom: 12 }}>
                          No Caller ID selected in CRM settings.
                        </p>
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
                      </div>
                    ) : null}
                  </motion.section>

                  <motion.section 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4, ease: FORENSIC_EASE }}
                    className="np-card"
                  >
                    <div className="np-section-head">
                      <div className="np-kicker font-mono">02 // INTELLIGENCE</div>
                      <span className="np-micro font-mono">{notes.length} log{notes.length === 1 ? '' : 's'}</span>
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
                        <div key={note.id} className="np-note-entry font-mono border-white/5 bg-zinc-900/40">
                          <div className="np-note-meta">
                            <span className="np-note-source text-zinc-500 uppercase tracking-widest text-[9px]">{note.source === 'ai' ? 'AI_FORENSIC' : 'USER_RECON'}</span>
                            <span className="np-note-date opacity-40">{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="np-note-text leading-relaxed text-zinc-300">{note.text}</p>
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
                      <div className="np-kicker font-mono">03 // NETWORK</div>
                      <span className="np-micro font-mono">{allContacts.length} total</span>
                    </div>
                    <div className="np-contact-list">
                      {visibleContacts.map((c) => (
                        <div key={c.id} className="np-contact-entry">
                          <div className="np-contact-info">
                            <EntityAvatar name={c.name} imageUrl={resolveContactPhoto(c)} size={32} className="np-entity-mark np-entity-mark--sm" />
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
