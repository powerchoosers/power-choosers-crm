(function () {
  'use strict';

  // Phone Widget (Dialer) - Fully migrated to Twilio
  // Exposes: window.Widgets.openPhone(), window.Widgets.closePhone(), window.Widgets.isPhoneOpen()
  // Global call function: window.Widgets.callNumber(number, name)
  if (!window.Widgets) window.Widgets = {};

  // Debug wrapper for this module (disabled by default)
  function phoneLog() {
    try { if (window.CRM_DEBUG_PHONE) console.debug.apply(console, arguments); } catch(_) {}
  }

  // Business phone number for fallback calls
  const DEFAULT_BUSINESS_E164 = '+18176630380';
  const BUSINESS_PHONE = '817-663-0380'; // legacy fallback without formatting
  function getBusinessNumberE164(){
    try {
      const arr = (window.CRM_BUSINESS_NUMBERS || []).filter(Boolean);
      if (arr && arr.length) return String(arr[0]);
    } catch(_) {}
    // Fallbacks
    if (BUSINESS_PHONE && BUSINESS_PHONE.length === 10) return `+1${BUSINESS_PHONE}`;
    return DEFAULT_BUSINESS_E164;
  }

  // --- FLIP helpers to synchronize internal element shifts with container resize ---
  function captureLayoutSnapshot(card) {
    try {
      if (!card) card = document.getElementById(WIDGET_ID);
      if (!card) return [];
      const targets = Array.from(card.querySelectorAll('.mic-status, .dialpad, .dial-actions'));
      return targets.map(el => ({ el, top: el.getBoundingClientRect().top }));
    } catch (_) { return []; }
  }
  function runFlipFromSnapshot(snapshot, card, duration = 320) {
    try {
      if (!snapshot || !snapshot.length) return;
      if (!card) card = document.getElementById(WIDGET_ID);
      requestAnimationFrame(() => {
        try { window.__pc_lastFlipAt = Date.now(); } catch(_) {}
        snapshot.forEach(({ el, top }) => {
          try {
            const newTop = el.getBoundingClientRect().top;
            const dy = top - newTop;
            if (Math.abs(dy) < 0.5) return;
            el.style.willChange = 'transform';
            el.style.transform = `translateY(${dy}px)`;
            // Force reflow
            void el.offsetHeight;
            el.style.transition = `transform ${duration}ms cubic-bezier(0.4,0,0.2,1)`;
            el.style.transform = 'translateY(0)';
            const cleanup = () => {
              el.style.willChange = '';
              el.style.transition = '';
              el.style.transform = '';
            };
            el.addEventListener('transitionend', cleanup, { once: true });
          } catch(_) {}
        });
        // Align container height animation with child movement
        smoothResize(card, duration);
      });
    } catch (_) {}
  }

  // Call Processing Web Worker
  let callWorker = null;
  try {
    callWorker = new Worker('/scripts/call-worker.js');
    callWorker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'CALL_LOGGED') {
        console.log('[Phone] Call logged in background:', data);
        // Trigger page refresh after call is logged
        try { document.dispatchEvent(new CustomEvent('pc:recent-calls-refresh', { detail: { number: data.phoneNumber } })); } catch(_) {}
      }
    };
    callWorker.onerror = (error) => {
      console.error('[Phone] Call worker error:', error);
    };
    // Initialize worker with API base URL
    callWorker.postMessage({
      type: 'SET_API_BASE_URL',
      data: { apiBaseUrl: window.API_BASE_URL || window.location.origin }
    });
  } catch (error) {
    console.warn('[Phone] Web Worker not supported, falling back to main thread:', error);
  }

  // Twilio Device state management
  const TwilioRTC = (function() {
    const state = { 
      device: null, 
      connection: null, 
      ready: false, 
      connecting: false, 
      micPermissionGranted: false, 
      micPermissionChecked: false,
      tokenRefreshTimer: null 
    };

    async function ensureDevice() {
      if (state.ready && state.device) return state.device;
      if (state.connecting) {
        // Wait briefly for concurrent init
        await new Promise(r => setTimeout(r, 500));
        if (state.ready && state.device) return state.device;
      }

      if (typeof Twilio === 'undefined' || !Twilio.Device) {
        try { window.crm?.showToast && window.crm.showToast('Twilio Voice SDK not loaded'); } catch(_) {}
        throw new Error('Twilio Voice SDK not loaded. Add script tag to HTML.');
      }

      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base) {
        try { window.crm?.showToast && window.crm.showToast('API base URL not configured'); } catch(_) {}
        throw new Error('Missing API_BASE_URL');
      }

      try { console.debug('[TwilioRTC] ensureDevice: API base =', base); } catch(_) {}
      state.connecting = true;

      try {
        // Get Twilio access token
        const resp = await fetch(`${base}/api/twilio/token?identity=agent`);
        try { console.debug('[TwilioRTC] Token fetch status =', resp.status); } catch(_) {}
        
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || !j?.token) {
          try { window.crm?.showToast && window.crm.showToast(`Token error: ${j?.error || ('HTTP ' + resp.status)}`); } catch(_) {}
          throw new Error(j?.error || `Token HTTP ${resp.status}`);
        }

        // Initialize Twilio Device
        state.device = new Twilio.Device(j.token, {
          codecPreferences: ['opus', 'pcmu'],
          fakeLocalDTMF: true,
          enableImprovedSignalingErrorPrecision: true,
          logLevel: 'debug'
        });
        
        // Set audio constraints for better audio quality
        state.device.audio.setAudioConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
        });
        
        // Set input device - use first available if 'default' doesn't exist
        try {
          const inputDevices = state.device.audio.availableInputDevices;
          let inputDeviceId = 'default';
          
          if (inputDevices && inputDevices.size > 0) {
            const deviceIds = Array.from(inputDevices.keys());
            console.debug('[TwilioRTC] Available input devices during init:', deviceIds);
            
            if (!deviceIds.includes('default') && deviceIds.length > 0) {
              inputDeviceId = deviceIds[0];
              console.debug('[TwilioRTC] Using first available input device:', inputDeviceId);
            }
          }
          
          await state.device.audio.setInputDevice(inputDeviceId);
          console.debug('[TwilioRTC] Input device set to:', inputDeviceId);
        } catch (e) {
          console.warn('[TwilioRTC] Failed to set input device:', e);
          // Try without any specific device
          try {
            await state.device.audio.unsetInputDevice();
          } catch (_) {}
        }

        // Set up device event handlers
        state.device.on('registered', () => {
          console.debug('[TwilioRTC] Device registered and ready');
          // Browser calling ready
        });

        state.device.on('error', (error) => {
          console.error('[TwilioRTC] Device error:', error);
          
          // If it's a token-related error, try to refresh immediately
          if (error.code === 20101 || error.code === 31204) {
            console.debug('[TwilioRTC] Token error detected, attempting immediate refresh...');
            setTimeout(async () => {
              try {
                const refreshResp = await fetch(`${base}/api/twilio/token?identity=agent`);
                const refreshData = await refreshResp.json().catch(() => ({}));
                
                if (refreshResp.ok && refreshData?.token && state.device) {
                  state.device.updateToken(refreshData.token);
                  console.debug('[TwilioRTC] Emergency token refresh successful');
                } else {
                  console.error('[TwilioRTC] Emergency token refresh failed');
                }
              } catch (refreshError) {
                console.error('[TwilioRTC] Emergency token refresh error:', refreshError);
              }
            }, 1000);
          }
          
          try { window.crm?.showToast && window.crm.showToast(`Device error: ${error?.message || 'Unknown error'}`); } catch(_) {}
        });
        
        // Handle device changes (e.g., headset plugged in/out)
        // According to Twilio best practices
        state.device.audio.on('deviceChange', () => {
          console.debug('[TwilioRTC] Audio devices changed');
          // Update UI with new device list if needed
        });
        
        // Set speaker device for output - use first available if 'default' doesn't exist
        if (state.device.audio.isOutputSelectionSupported) {
          try {
            const outputDevices = state.device.audio.availableOutputDevices;
            let outputDeviceId = 'default';
            
            if (outputDevices && outputDevices.size > 0) {
              const deviceIds = Array.from(outputDevices.keys());
              console.debug('[TwilioRTC] Available output devices during init:', deviceIds);
              
              if (!deviceIds.includes('default') && deviceIds.length > 0) {
                outputDeviceId = deviceIds[0];
                console.debug('[TwilioRTC] Using first available output device during init:', outputDeviceId);
              }
            }
            
            state.device.audio.speakerDevices.set(outputDeviceId);
            console.debug('[TwilioRTC] Output device set during init:', outputDeviceId);
          } catch (e) {
            console.warn('[TwilioRTC] Failed to set output device during init:', e);
          }
        }

        // Capture SDK warnings for diagnostics (e.g., ICE issues, media errors)
        try {
          state.device.on('warning', (name, data) => {
            console.warn('[TwilioRTC] Device warning:', name, data || {});
          });
        } catch (_) {}

        state.device.on('incoming', async (conn) => {
          console.debug('[TwilioRTC] Incoming call:', conn);

          // [FIX] Do NOT open widget yet - only show toast notification
          // Widget will open when user clicks "Answer" on the toast

          // Set input/output devices before accepting the call
          if (state.device.audio) {
            // Use a more conservative approach for input device selection
            try {
              const inputDevices = state.device.audio.availableInputDevices;
              let inputDeviceId = 'default';
              
              if (inputDevices && inputDevices.size > 0) {
                const deviceIds = Array.from(inputDevices.keys());
                if (!deviceIds.includes('default') && deviceIds.length > 0) {
                  inputDeviceId = deviceIds[0];
                }
              }
              
              await state.device.audio.setInputDevice(inputDeviceId);
            } catch (e) {
              console.warn('[TwilioRTC] Failed to set input device for incoming call:', e);
              // Try without any specific device if default fails
              try {
                await state.device.audio.unsetInputDevice();
              } catch (_) {}
            }
            if (state.device.audio.isOutputSelectionSupported) {
              try {
                const outputDevices = state.device.audio.availableOutputDevices;
                let outputDeviceId = 'default';
                if (outputDevices && outputDevices.size > 0) {
                  const deviceIds = Array.from(outputDevices.keys());
                  if (!deviceIds.includes('default') && deviceIds.length > 0) {
                    outputDeviceId = deviceIds[0];
                  }
                }
                state.device.audio.speakerDevices.set(outputDeviceId);
              } catch (e) {
                console.warn('[TwilioRTC] Failed to set output device for incoming call:', e);
              }
            }
          }

          try {
            // Do NOT auto-accept. Show a distinct incoming-call notification first.
            // Use originalCaller parameter if available, otherwise fall back to From
            const number = conn.customParameters?.originalCaller || conn.parameters?.From || '';
            console.debug('[TwilioRTC] Incoming call from number:', number, 'Original caller:', conn.customParameters?.originalCaller, 'Full parameters:', conn.parameters);
            const meta = await resolvePhoneMeta(number);

            // Remember connection so we can accept on click (do NOT mark as active connection yet)
            TwilioRTC.state.pendingIncoming = conn;

            // Show enhanced toast notification for incoming call
            if (window.ToastManager) {
                console.debug('[TwilioRTC] Toast notification data:', {
                    name: meta.name,
                    account: meta.account,
                    title: meta.title,
                    city: meta.city,
                    state: meta.state,
                    domain: meta.domain,
                    logoUrl: meta.logoUrl
                });
                
                const callData = {
                    callerName: meta.name || '',
                    callerNumber: number,
                    company: meta.account || '',
                    title: meta.title || '',
                    city: meta.city || '',
                    state: meta.state || '',
                    // Use logoUrl if available, otherwise generate favicon from domain
                    callerIdImage: meta.logoUrl || (meta.domain ? makeFavicon(meta.domain) : null),
                    carrierName: meta.carrierName || '',
                    carrierType: meta.carrierType || '',
                    nationalFormat: meta.nationalFormat || number,
                    connection: conn
                };
                
                const toastId = window.ToastManager.showCallNotification(callData);
                callData.toastId = toastId;
                TwilioRTC.state.pendingIncoming.toastId = toastId;
            }

            // Show browser notification for incoming call (so user sees it on other tabs)
            if ('Notification' in window && Notification.permission === 'granted') {
                const notificationTitle = meta.name || 'Incoming Call';
                const notificationBody = meta.name ? 
                    `${meta.nationalFormat || number}${meta.title ? ` (${meta.title})` : ''}${meta.account ? ` at ${meta.account}` : ''}` :
                    meta.nationalFormat || number;
                
                const browserNotification = new Notification(notificationTitle, {
                    body: notificationBody,
                    icon: 'https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png',
                    tag: 'incoming-call',
                    requireInteraction: true // Keep notification visible until user interacts
                });

                // Close browser notification when user answers via toast
                browserNotification.onclick = () => {
                    browserNotification.close();
                    // Focus the CRM window
                    window.focus();
                };
            }

            // If the caller hangs up (cancels) before we accept, immediately clean up UI/state
            try {
              conn.on('cancel', () => {
                console.debug('[TwilioRTC] Incoming call canceled by remote - cleaning up UI');
                
                // Add missed call notification to badge
                if (window.Notifications && typeof window.Notifications.addMissedCall === 'function') {
                    const callerName = meta?.name || '';
                    const callerNumber = number || '';
                    window.Notifications.addMissedCall(callerNumber, callerName);
                }
                
                // Clear pending state
                TwilioRTC.state.pendingIncoming = null;
                // Ensure any lingering connection reference is cleared
                TwilioRTC.state.connection = null;
                // Reset UI button/text
                try {
                  const cardCancel = document.getElementById(WIDGET_ID);
                  if (cardCancel) {
                    const btnCancel = cardCancel.querySelector('.call-btn-start');
                    if (btnCancel) {
                      btnCancel.textContent = 'Call';
                      btnCancel.classList.remove('btn-danger');
                      btnCancel.classList.add('btn-primary');
                    }
                    const inputCancel = cardCancel.querySelector('.phone-display');
                    if (inputCancel) inputCancel.value = '';
                    const titleCancel = cardCancel.querySelector('.widget-title');
                    if (titleCancel) titleCancel.innerHTML = 'Phone';
                    // Remove in-call contact display if present
                    try { clearContactDisplay(); } catch(_) {}
                  }
                } catch(_) {}
                // Ensure timers/states are reset
                try { stopLiveCallTimer(document.getElementById(WIDGET_ID)); } catch(_) {}
                isCallInProgress = false;
                currentCallContext = { 
                  number: '', 
                  name: '', 
                  company: '',
                  accountId: null,
                  accountName: null,
                  contactId: null,
                  contactName: null,
                  city: '',
                  state: '',
                  domain: '',
                  isCompanyPhone: false,
                  isActive: false 
                };
                // Toast notification auto-removed by ToastManager
                // Set cooldowns to prevent any auto-trigger or quick redial
                lastCallCompleted = Date.now();
                lastCalledNumber = number;
                autoTriggerBlockUntil = Date.now() + 15000;
                // Mark connection as canceled so accept() can guard
                try { conn._canceled = true; } catch(_) {}
                // Optional: notify missed call
                try {
                  const from = conn.customParameters?.originalCaller || conn.parameters?.From || '';
                  if (window.Notifications && typeof window.Notifications.addMissedCall === 'function') {
                    window.Notifications.addMissedCall(from, null);
                  }
                } catch(_) {}
                console.debug('[TwilioRTC] Incoming cancel cleanup complete');
              });
            } catch(_) {}

            // [FIX] Do NOT pre-populate UI while ringing - widget stays closed until user answers
            // Toast notification handles the ringing state visually

            const accept = async () => {
              try {
                console.debug('[TwilioRTC] Accepting incoming call after user click');
                // Guard: if call already canceled/closed, ignore accept
                try {
                  const status = (typeof conn.status === 'function') ? conn.status() : 'unknown';
                  if (conn._canceled || (status && status !== 'pending')) {
                    console.warn('[TwilioRTC] Incoming call no longer available, status:', status, '- ignoring accept');
                    TwilioRTC.state.pendingIncoming = null;
                    TwilioRTC.state.connection = null;
                    isCallInProgress = false;
                    currentCallContext = { 
                  number: '', 
                  name: '', 
                  company: '',
                  accountId: null,
                  accountName: null,
                  contactId: null,
                  contactName: null,
                  city: '',
                  state: '',
                  domain: '',
                  isCompanyPhone: false,
                  isActive: false 
                };
                    const cardGone = document.getElementById(WIDGET_ID);
                    if (cardGone) {
                      const btnGone = cardGone.querySelector('.call-btn-start');
                      if (btnGone) { btnGone.textContent = 'Call'; btnGone.classList.remove('btn-danger'); btnGone.classList.add('btn-primary'); }
                      const inputGone = cardGone.querySelector('.phone-display');
                      if (inputGone) inputGone.value = '';
                      const titleGone = cardGone.querySelector('.widget-title');
                      if (titleGone) titleGone.innerHTML = 'Phone';
                    }
                    // Toast notification auto-removed by ToastManager
                    return;
                  }
                } catch(_) {}
                // Ensure widget is open for controls
                if (!document.getElementById(WIDGET_ID)) {
                  openPhone();
                }
                // Set devices again to be safe
                if (state.device && state.device.audio) {
                  try {
                    const inputDevices = state.device.audio.availableInputDevices;
                    let inputDeviceId = 'default';
                    if (inputDevices && inputDevices.size > 0) {
                      const deviceIds = Array.from(inputDevices.keys());
                      if (!deviceIds.includes('default') && deviceIds.length > 0) {
                        inputDeviceId = deviceIds[0];
                        console.debug('[TwilioRTC] Using first available input device for call:', inputDeviceId);
                      }
                    }
                    await state.device.audio.setInputDevice(inputDeviceId);
                  } catch(_) {}
                }
                conn.accept();
                isCallInProgress = true;
                // Store the connection reference
                TwilioRTC.state.connection = conn;
                // Dispatch inbound call-start events
                let incomingCallSid = null;
                try {
                  const pp = (conn && (conn.parameters || conn._parameters)) || {};
                  incomingCallSid = pp.CallSid || pp.callSid || null;
                } catch(_) {}
                try {
                  document.dispatchEvent(new CustomEvent('callStarted', { detail: { callSid: incomingCallSid } }));
                  const el = document.getElementById(WIDGET_ID);
                  if (el) el.dispatchEvent(new CustomEvent('callStateChanged', { detail: { state: 'in-call', callSid: incomingCallSid } }));
                } catch(_) {}
                
                // Set full call context for incoming call (now that it's accepted)
                currentCallContext = {
                  number: number,
                  name: meta?.name || '',
                  company: meta?.account || '',
                  accountId: meta?.accountId || null,
                  accountName: meta?.account || null,
                  contactId: meta?.contactId || null,
                  contactName: meta?.name || '',
                  city: meta?.city || '',
                  state: meta?.state || '',
                  domain: meta?.domain || '',
                  logoUrl: meta?.logoUrl || '',
                  isCompanyPhone: !!(meta?.account && !meta?.contactId),
                  isActive: true
                };
                console.debug('[Phone] Incoming call context set on accept:', currentCallContext);
                
                // Start live timer banner
                startLiveCallTimer(document.getElementById(WIDGET_ID), incomingCallSid);
                const card = document.getElementById(WIDGET_ID);
                if (card) {
                  const btn = card.querySelector('.call-btn-start');
                  if (btn) {
                    btn.textContent = 'Hang Up';
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-danger');
                  }
                  const input = card.querySelector('.phone-display');
                  if (input) {
                    console.debug('[Phone] Setting input to caller number:', number);
                    input.value = number;
                  }
                  // Show rich contact display and keep header title clean
                  setContactDisplay(meta, number);
                }
                const callStartTime = Date.now();
                const callId = `call_${callStartTime}_${Math.random().toString(36).substr(2, 9)}`;
                if (typeof updateCallStatus === 'function') {
                  // Use Twilio CallSid if available so backend persists immediately
                  updateCallStatus(number, 'connected', callStartTime, 0, incomingCallSid || callId, number, 'incoming');
                // Immediately notify recent calls refresh so account detail updates without reload
                try { document.dispatchEvent(new CustomEvent('pc:recent-calls-refresh', { detail: { number } })); } catch(_) {}
                } else {
                  console.warn('[TwilioRTC] updateCallStatus not available - skipping status update');
                }

                conn.on('disconnect', () => {
                  console.debug('[Phone] Call disconnected');
                  
                  // [WEB WORKER FIX] Only set critical flags immediately - everything else goes to worker
                  const disconnectTime = Date.now();
                  lastCallCompleted = disconnectTime;
                  lastCalledNumber = number;
                  isCallInProgress = false;
                  autoTriggerBlockUntil = Date.now() + 3000;
                  
                  // Clear critical state immediately
                  TwilioRTC.state.connection = null;
                  TwilioRTC.state.pendingIncoming = null;
                  currentCall = null;
                  
                  // [WEB WORKER] Send call completion to background worker
                  if (callWorker) {
                    const callEndTime = Date.now();
                    const duration = Math.floor((callEndTime - callStartTime) / 1000);
                    
                    callWorker.postMessage({
                      type: 'CALL_COMPLETED',
                      data: {
                        phoneNumber: number,
                        startTime: callStartTime,
                        duration: duration,
                        callSid: incomingCallSid || callId,
                        fromNumber: number,
                        callType: 'incoming'
                      }
                    });
                  } else {
                    // Fallback to main thread if worker not available
                    console.warn('[Phone] Web Worker not available, using fallback');
                    setTimeout(() => {
                      const callEndTime = Date.now();
                      const duration = Math.floor((callEndTime - callStartTime) / 1000);
                      updateCallStatus(number, 'completed', callStartTime, duration, incomingCallSid || callId, number, 'incoming');
                      try { document.dispatchEvent(new CustomEvent('pc:recent-calls-refresh', { detail: { number } })); } catch(_) {}
                    }, 0);
                  }
                  
                  // Immediate UI cleanup (non-blocking)
                  const widget = document.getElementById(WIDGET_ID);
                  stopLiveCallTimer(widget);
                  
                  // Clear UI state completely and ensure call button shows "Call"
                  if (widget) {
                    const btn = widget.querySelector('.call-btn-start');
                    if (btn) {
                      console.debug('[Phone] DISCONNECT: Setting button to "Call" state');
                      btn.textContent = 'Call';
                      btn.classList.remove('btn-danger');
                      btn.classList.add('btn-primary');
                      // Disable button briefly to prevent accidental immediate redial
                      btn.disabled = true;
                      setTimeout(() => { btn.disabled = false; }, 200);
                    }
                    const input = widget.querySelector('.phone-display');
                    if (input) input.value = '';
                    const title = widget.querySelector('.widget-title');
                    if (title) title.innerHTML = 'Phone';
                    try { clearContactDisplay(); } catch(_) {}
                    try { widget.classList.remove('in-call'); } catch(_) {}
                  }
                  
                  // Force UI update to ensure button state is visible
                  setInCallUI(false);
                  console.debug('[Phone] DISCONNECT: UI cleanup complete, call should show as ended');
                  
                  // Fire-and-forget termination of any active server-side call to avoid UI stall
                  if (window.currentServerCallSid) {
                    try {
                      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
                      const sid = window.currentServerCallSid;
                      console.debug('[Phone] DISCONNECT: Terminating server call SID (async):', sid);
                      fetch(`${base}/api/twilio/hangup`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callSid: sid })
                      }).catch(()=>{});
                    } catch (_) {}
                      window.currentServerCallSid = null;
                  }
                  
                  // [REMOVED] Audio device release - was causing UI freeze on hangup
                  // Browser will automatically release microphone when tab closes/refreshes
                  // Trade-off: Red recording dot may linger in tab until refresh (minor UX issue vs major freeze issue)
                });

                conn.on('error', (error) => {
                  console.error('[Phone] Call error:', error);
                  isCallInProgress = false;
                  currentCallContext = { 
                  number: '', 
                  name: '', 
                  company: '',
                  accountId: null,
                  accountName: null,
                  contactId: null,
                  contactName: null,
                  city: '',
                  state: '',
                  domain: '',
                  isCompanyPhone: false,
                  isActive: false 
                };
                  
                  // Clear ALL connection state
                  TwilioRTC.state.pendingIncoming = null;
                  TwilioRTC.state.connection = null;
                  
                  const card3 = document.getElementById(WIDGET_ID);
                  if (card3) {
                    const btn3 = card3.querySelector('.call-btn-start');
                    if (btn3) {
                      btn3.textContent = 'Call';
                      btn3.classList.remove('btn-danger');
                      btn3.classList.add('btn-primary');
                    }
                    // Clear input and reset title
                    const input3 = card3.querySelector('.phone-display');
                    if (input3) input3.value = '';
                    const title3 = card3.querySelector('.widget-title');
                    if (title3) title3.innerHTML = 'Phone';
                    try { clearContactDisplay(); } catch(_) {}
                    try { card3.classList.remove('in-call'); } catch(_) {}
                  }
                  // Stop live timer and restore banner
                  stopLiveCallTimer(card3);
                  lastCallCompleted = Date.now();
                  autoTriggerBlockUntil = Date.now() + 10000;
                  // Guard: updateCallStatus may not be defined yet if widget hasn't been created
                  if (typeof updateCallStatus === 'function') {
                    updateCallStatus(number, 'error', callStartTime, 0, incomingCallSid || callId, number, 'incoming');
                  } else {
                    console.warn('[TwilioRTC] updateCallStatus not available - skipping status update');
                  }
                });
              } catch (e) {
                console.error('[Phone] Failed to accept incoming call:', e);
              }
            };

            // Old notification system removed - using ToastManager (shown above at line ~282-300)
          } catch (e) {
            console.error('[TwilioRTC] Incoming notification error:', e);
          }
        });

        // Belt-and-suspenders: device-level disconnect handler to ensure cleanup
        try {
          state.device.on('disconnect', (conn) => {
            try { console.debug('[TwilioRTC] Device-level disconnect observed', conn?.parameters || {}); } catch(_) {}
            // Clear connection state
            TwilioRTC.state.connection = null;
            TwilioRTC.state.pendingIncoming = null;
            currentCall = null;
            isCallInProgress = false;
            currentCallContext = { number: '', name: '', isActive: false };
            // Reset UI
            const cardX = document.getElementById(WIDGET_ID);
            if (cardX) {
              const btnX = cardX.querySelector('.call-btn-start');
              if (btnX) {
                btnX.textContent = 'Call';
                btnX.classList.remove('btn-danger');
                btnX.classList.add('btn-primary');
              }
              const inputX = cardX.querySelector('.phone-display');
              if (inputX) inputX.value = '';
              const titleX = cardX.querySelector('.widget-title');
              if (titleX) titleX.innerHTML = 'Phone';
              try { clearContactDisplay(); } catch(_) {}
              try { cardX.classList.remove('in-call'); } catch(_) {}
            }
            try { stopLiveCallTimer(cardX); } catch(_) {}
            lastCallCompleted = Date.now();
            autoTriggerBlockUntil = Date.now() + 10000;
            console.debug('[TwilioRTC] Device-level disconnect cleanup complete');
          });
        } catch (_) {}

        // Register the device
        await state.device.register();
        
        // Set up automatic token refresh (refresh every 50 minutes, tokens expire after 1 hour)
        if (state.tokenRefreshTimer) {
          clearInterval(state.tokenRefreshTimer);
        }
        
        state.tokenRefreshTimer = setInterval(async () => {
          try {
            console.debug('[TwilioRTC] Refreshing access token...');
            const refreshResp = await fetch(`${base}/api/twilio/token?identity=agent`);
            const refreshData = await refreshResp.json().catch(() => ({}));
            
            if (refreshResp.ok && refreshData?.token && state.device) {
              state.device.updateToken(refreshData.token);
              console.debug('[TwilioRTC] Token refreshed successfully');
            } else {
              console.warn('[TwilioRTC] Token refresh failed:', refreshData?.error || 'No token received');
            }
          } catch (refreshError) {
            console.error('[TwilioRTC] Token refresh error:', refreshError);
          }
        }, 50 * 60 * 1000); // 50 minutes
        
        try { console.debug('[TwilioRTC] Device ready with token refresh enabled'); } catch(_) {}
        state.ready = true;
        
        // Request browser notification permission for incoming calls
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then(permission => {
            console.log('[Phone] Notification permission:', permission);
          });
        }
        
        return state.device;
      } finally {
        state.connecting = false;
      }
    }

    // Clean shutdown function
    const shutdown = () => {
      if (state.tokenRefreshTimer) {
        clearInterval(state.tokenRefreshTimer);
        state.tokenRefreshTimer = null;
      }
      if (state.device) {
        try {
          state.device.destroy();
        } catch(_) {}
        state.device = null;
      }
      state.ready = false;
      state.connecting = false;
    };
    
    // Accept incoming call
    function acceptCall() {
      if (state.pendingIncoming) {
        console.debug('[TwilioRTC] Accepting incoming call');
        
        // Store toast ID before clearing pending state
        const toastId = state.pendingIncoming.toastId;
        
        state.pendingIncoming.accept();
        state.connection = state.pendingIncoming;
        state.pendingIncoming = null;
        
        // Remove toast notification
        if (toastId && window.ToastManager) {
          window.ToastManager.removeToast(toastId);
        }
        
        return true;
      }
      return false;
    }

    // Decline incoming call
    function declineCall() {
      if (state.pendingIncoming) {
        console.debug('[TwilioRTC] Declining incoming call');
        
        // Store toast ID before clearing pending state
        const toastId = state.pendingIncoming.toastId;
        
        state.pendingIncoming.reject();
        state.pendingIncoming = null;
        
        // Remove toast notification
        if (toastId && window.ToastManager) {
          window.ToastManager.removeToast(toastId);
        }
        
        return true;
      }
      return false;
    }

    return { state, ensureDevice, shutdown, acceptCall, declineCall };
  })();

  const WIDGET_ID = 'phone-widget';
  // OLD: const CALL_NOTIFY_ID = 'incoming-call-notification'; - REMOVED (using ToastManager now)

  async function resolvePhoneMeta(number) {
    const digits = (number || '').replace(/\D/g, '');
    const meta = { number, name: '', account: '', title: '', city: '', state: '', domain: '', logoUrl: '', contactId: null, accountId: null, callerIdImage: null };
    try {
      // App-provided resolver if available
      if (window.crm && typeof window.crm.resolvePhoneMeta === 'function') {
        const out = await Promise.resolve(window.crm.resolvePhoneMeta(digits));
        if (out && typeof out === 'object') return { ...meta, ...out };
      }
      // Try a generic public search endpoint if the app exposes one
      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (base) {
        // Try contacts first
        console.debug('[Phone] Searching CRM for phone:', digits);
        const r1 = await fetch(`${base}/api/search?phone=${encodeURIComponent(digits)}`).catch(() => null);
        if (r1 && r1.ok) {
          const j = await r1.json().catch(() => ({}));
          console.debug('[Phone] CRM search response:', j);
          if (j && (j.contact || j.account)) {
            const c = j.contact || {};
            const a = j.account || {};
            const resolved = {
              ...meta,
              name: c.name || '',
              account: a.name || c.account || '',
              title: c.title || '',
              city: c.city || a.city || '',
              state: c.state || a.state || '',
              domain: c.domain || a.domain || '',
              logoUrl: a.logoUrl || '',
              contactId: c.id || c.contactId || null,
              accountId: a.id || a.accountId || null
            };
            console.debug('[Phone] Resolved metadata from CRM:', resolved);
            return resolved;
          }
        } else {
          console.debug('[Phone] CRM search failed or returned no results');
        }
        
        // If no contact found, try Twilio caller ID lookup
        if (!meta.name) {
          try {
            const callerLookup = await fetch(`${base}/api/twilio/caller-lookup`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ phoneNumber: number })
            });
            
            if (callerLookup.ok) {
              const lookupData = await callerLookup.json();
              if (lookupData.success && lookupData.data) {
                const data = lookupData.data;
                meta.name = data.callerName || '';
                meta.carrier = data.carrier || '';
                meta.countryCode = data.countryCode || '';
                meta.nationalFormat = data.nationalFormat || '';
                
                // If we have a carrier, we can try to get a logo
                if (data.carrier && data.carrier.name) {
                  meta.carrierName = data.carrier.name;
                  meta.carrierType = data.carrier.type;
                }
              }
            }
          } catch (lookupError) {
            console.warn('[Phone] Caller ID lookup failed:', lookupError);
          }
        }
      }
    } catch (_) {}
    return meta;
  }

  function makeFavicon(domain) {
  if (!domain) return '';
  const d = domain.replace(/^https?:\/\//, '');
  // Use the new favicon helper system if available
  if (window.__pcFaviconHelper) {
    const faviconHTML = (typeof window.__pcFaviconHelper.generateCompanyIconHTML==='function')
      ? window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: (currentCallContext && currentCallContext.logoUrl) || '', domain: d, size: 64 })
      : window.__pcFaviconHelper.generateFaviconHTML(d, 64);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = faviconHTML;
    const img = tempDiv.querySelector('.company-favicon');
    return img ? img.src : '';
  }
  // Return empty string instead of old system to prevent flickering
  return '';
  }

  // Inject minimal styles for the in-call contact display that replaces the input
  function ensurePhoneContactStyles() {
    if (document.getElementById('phone-contact-styles')) return;
    const style = document.createElement('style');
    style.id = 'phone-contact-styles';
    style.textContent = `
      /* In-call contact display (replaces input during live call) */
      .phone-contact { 
        margin-bottom: 0px; 
        opacity: 0; 
        transform: translateY(-6px) scale(0.98); 
        transition: opacity 280ms ease, transform 280ms ease; 
      }
      .phone-contact.--show { 
        opacity: 1; 
        transform: translateY(0) scale(1); 
      }
      /* Reduce space between contact and timer even more */
      .phone-contact + .mic-status { margin-top: -12px; }

      /* Input hide/show animation */
      .phone-body .phone-display { transition: opacity 200ms ease, transform 200ms ease; }
      .phone-body .phone-display.is-hiding { opacity: 0; transform: translateY(-4px) scale(0.98); }
      .phone-body .phone-display.is-showing { opacity: 1; transform: translateY(0) scale(1); }
      .phone-contact .contact-row { display: flex; align-items: center; gap: 10px; }
      .phone-contact .contact-text { display: flex; flex-direction: column; }
      .phone-contact .contact-name { font-weight: 700; color: var(--text-primary, #fff); }
      .phone-contact .contact-sub { color: var(--text-secondary, #b5b5b5); font-size: 12px; }
      .phone-contact .company-favicon { width: 28px; height: 28px; object-fit: cover; border-radius: 4px; }
      .phone-contact .avatar-initials { width: 28px; height: 28px; border-radius: 50%; background: var(--primary-700, #ff6b35); color: #fff; display:flex; align-items:center; justify-content:center; font-size: 12px; font-weight: 700; }
    `;
    document.head.appendChild(style);
  }

  // Show contact display (name/account + favicon/initials) and hide the input while in a call
  function setContactDisplay(meta, number) {
    try {
      ensurePhoneContactStyles();
      const card = document.getElementById(WIDGET_ID);
      if (!card) return;
      // Capture layout before DOM changes (FLIP)
      const snapshot = captureLayoutSnapshot(card);
      const body = card.querySelector('.phone-body');
      if (!body) return;
      let box = body.querySelector('.phone-contact');
      const existed = !!box;
      if (!box) {
        box = document.createElement('div');
        box.className = 'phone-contact';
        box.innerHTML = `
          <div class="contact-row">
            <div class="contact-avatar"></div>
            <div class="contact-text">
              <div class="contact-name"></div>
              <div class="contact-sub"></div>
            </div>
          </div>`;
        body.insertBefore(box, body.firstChild);
      }
      const input = body.querySelector('.phone-display');
      if (input) input.style.display = 'none';

      // Populate
      // Explicitly use setCallContext's isCompanyPhone to avoid accidental flips.
      // If absent, infer company mode from account context (accountId/accountName/company) when no contact context exists.
      const hasAccountCtx = !!(currentCallContext && (currentCallContext.accountId || currentCallContext.accountName || currentCallContext.company));
      const hasContactCtx = !!(currentCallContext && (currentCallContext.contactId || currentCallContext.contactName));
      const isCompanyPhone = !!(currentCallContext && (currentCallContext.isCompanyPhone || (hasAccountCtx && !hasContactCtx)));
      // In company-call mode, prefer Account context (account-detail source) over contact/meta hints
      const city = isCompanyPhone
        ? ((currentCallContext && currentCallContext.city) || (meta && meta.city) || '')
        : ((meta && meta.city) || (currentCallContext && currentCallContext.city) || '');
      const state = isCompanyPhone
        ? ((currentCallContext && currentCallContext.state) || (meta && meta.state) || '')
        : ((meta && meta.state) || (currentCallContext && currentCallContext.state) || '');
      const account = isCompanyPhone
        ? ((currentCallContext && currentCallContext.company) || (meta && (meta.account || meta.company)) || '')
        : ((meta && (meta.account || meta.company)) || (currentCallContext && currentCallContext.company) || '');
      const domain = isCompanyPhone
        ? ((currentCallContext && currentCallContext.domain) || (meta && meta.domain) || '')
        : ((meta && meta.domain) || (currentCallContext && currentCallContext.domain) || '');
      const logoUrl = isCompanyPhone
        ? ((currentCallContext && currentCallContext.logoUrl) || (meta && meta.logoUrl) || '')
        : ((meta && meta.logoUrl) || (currentCallContext && currentCallContext.logoUrl) || '');
      
      const displayNumber = number || (currentCallContext && currentCallContext.number) || '';
      
      // For company phone calls, show company name only
      // For individual contact calls, show contact name
      let nameLine;
      if (isCompanyPhone) {
        nameLine = (currentCallContext && (currentCallContext.company || currentCallContext.accountName)) || (meta && (meta.account || meta.company)) || '';
      } else {
        nameLine = (meta && meta.name) || (currentCallContext && currentCallContext.name) || '';
      }
      
      // Build subtitle: for company calls show location + number, for individual calls show company + number
      let sub;
      if (isCompanyPhone) {
        const location = [city, state].filter(Boolean).join(', ');
        sub = [location, displayNumber].filter(Boolean).join(' • ');
      } else {
        sub = [account, displayNumber].filter(Boolean).join(' • ');
      }
      
      phoneLog('[Phone Widget] setContactDisplay', {
        meta: meta,
        currentCallContext: currentCallContext,
        nameLine: nameLine,
        account: account,
        number: displayNumber,
        isCompanyPhone: isCompanyPhone,
        city: city,
        state: state,
        domain: domain
      });
      const favicon = makeFavicon(domain);
      const avatarWrap = box.querySelector('.contact-avatar');
      if (avatarWrap) {
        if (isCompanyPhone) {
          // Absolute priority: explicit logoUrl provided by the page/widget
          if (logoUrl) {
            try {
              avatarWrap.innerHTML = `<img class="company-favicon" src="${logoUrl}" alt="" aria-hidden="true" referrerpolicy="no-referrer" loading="lazy">`;
            } catch(_) { /* noop */ }
          } else if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML==='function') {
            // Helper will try multiple favicon sources; fallback to accounts icon if it fails
            const html = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: '', domain, size: 28 });
            if (html && html.indexOf('company-favicon') !== -1) {
              avatarWrap.innerHTML = html;
            } else if (domain && typeof window.__pcFaviconHelper.generateFaviconHTML === 'function') {
              avatarWrap.innerHTML = window.__pcFaviconHelper.generateFaviconHTML(domain, 28);
            } else if (typeof window.__pcAccountsIcon === 'function') {
              avatarWrap.innerHTML = window.__pcAccountsIcon();
            }
          } else if (domain && window.__pcFaviconHelper) {
            avatarWrap.innerHTML = window.__pcFaviconHelper.generateFaviconHTML(domain, 28);
          } else if (domain) {
            // Helper not available: fall back to direct favicon URL
            const src = favicon || (domain ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}` : '');
            if (src) {
              avatarWrap.innerHTML = `<img class="company-favicon" src="${src}" alt="" aria-hidden="true" referrerpolicy="no-referrer" loading="lazy">`;
            } else if (typeof window.__pcAccountsIcon === 'function') {
              avatarWrap.innerHTML = window.__pcAccountsIcon();
            }
          } else if (typeof window.__pcAccountsIcon === 'function') {
            avatarWrap.innerHTML = window.__pcAccountsIcon();
          }
        } else {
          // Individual contact: render initials avatar (letter glyphs)
          const initials = (function(){
            const n = (nameLine || '').trim();
            if (!n) return '?';
            const parts = n.split(/\s+/).filter(Boolean);
            const a = parts[0] ? parts[0].charAt(0) : '';
            const b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
            return (a + b).toUpperCase();
          })();
          avatarWrap.innerHTML = `<div class="avatar-initials" aria-hidden="true">${initials}</div>`;
        }
      }
      const nameEl = box.querySelector('.contact-name');
      const subEl = box.querySelector('.contact-sub');
      if (nameEl) nameEl.textContent = nameLine || displayNumber || 'On call';
      if (subEl) subEl.textContent = sub;
      // Animate input out then pop-in details with synchronized shift
      const inputEl = body.querySelector('.phone-display');
      if (inputEl && inputEl.style.display !== 'none') {
        inputEl.classList.add('is-hiding');
        setTimeout(() => { try { inputEl.style.display = 'none'; inputEl.classList.remove('is-hiding'); } catch(_) {} }, 200);
      }
      // Ensure initial state for transition and trigger reliably
      box.classList.remove('--show');
      // Force explicit initial values for reliability across browsers
      try { box.style.opacity = '0'; box.style.transform = 'translateY(-6px) scale(0.98)'; } catch(_) {}
      void box.offsetHeight; // reflow to guarantee CSS transition
      requestAnimationFrame(() => {
        box.classList.add('--show');
        try { box.style.opacity = ''; box.style.transform = ''; } catch(_) {}
        runFlipFromSnapshot(snapshot, card, 320);
      });

      // Mark in-call state and add subtle pulse on first reveal only
      try {
        card.classList.add('in-call');
        if (!existed) {
          card.classList.add('placing-call');
          setTimeout(() => { try { card.classList.remove('placing-call'); } catch(_) {} }, 900);
        }
      } catch(_) {}

      // Always keep header title clean (no duplicate name next to "Phone")
      const titleEl = card.querySelector('.widget-title');
      if (titleEl) titleEl.textContent = 'Phone';

      // Height animation is handled inside runFlipFromSnapshot for sync
    } catch (_) {}
  }

  function clearContactDisplay() {
    try {
      const card = document.getElementById(WIDGET_ID);
      if (!card) return;
      const body = card.querySelector('.phone-body');
      if (!body) return;
      // Capture layout before DOM changes (FLIP)
      const snapshot = captureLayoutSnapshot(card);
      const box = body.querySelector('.phone-contact');
      const input = body.querySelector('.phone-display');
      if (box) {
        try {
          // Animate collapse + fade instead of instant remove
          const h = box.getBoundingClientRect().height;
          box.style.height = h + 'px';
          box.style.overflow = 'hidden';
          box.style.transition = 'height 280ms cubic-bezier(0.4,0,0.2,1), margin 280ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease, transform 220ms ease';
          requestAnimationFrame(() => {
            box.classList.remove('--show');
            box.style.height = '0px';
            box.style.marginBottom = '0px';
          });
          // Remove after animation ends
          const cleanup = () => { try { box.remove(); } catch(_) {} };
          box.addEventListener('transitionend', (e) => { if (e.propertyName === 'height') cleanup(); }, { once: true });
          setTimeout(cleanup, 360);
        } catch(_) { box.classList.remove('--show'); }
      }
      if (input) {
        // Prepare input to animate back in: start hidden state then animate to visible
        input.style.display = '';
        input.classList.add('is-hiding'); // start from hidden transform/opacity
        requestAnimationFrame(() => {
          input.classList.remove('is-hiding');
          input.classList.add('is-showing');
          setTimeout(() => { try { input.classList.remove('is-showing'); } catch(_) {} }, 220);
        });
      }
      // Keep header title simple
      const titleEl = card.querySelector('.widget-title');
      if (titleEl) titleEl.textContent = 'Phone';
      try { card.classList.remove('placing-call'); card.classList.remove('in-call'); } catch(_) {}
      // Run FLIP shift for internal elements in sync with container height
      runFlipFromSnapshot(snapshot, card, 320);
    } catch (_) {}
  }

  // OLD NOTIFICATION SYSTEM - REMOVED (Using new ToastManager instead)
  // The old green/orange gradient notification has been replaced with the new toast system

  // Current call context
  let currentCallContext = {
    number: '',
    name: '',
    company: '',
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    city: '',
    state: '',
    domain: '',
    logoUrl: '',
    isCompanyPhone: false,
    isActive: false
  };

  // Live call duration timer helpers
  let callTimerHandle = null;
  let callTimerStartedAt = 0;
  let currentCallSid = null; // Track current call SID for live updates
  
  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  
  // Format duration for recent calls display (e.g., "2m 15s")
  function formatDurationForRecentCalls(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}m ${s}s`;
  }
  function setMicBanner(card, className, text) {
    const micStatus = card.querySelector('.mic-status');
    const micText = card.querySelector('.mic-text');
    if (!micStatus || !micText) return;
    micStatus.classList.remove('ok', 'warn', 'error', 'checking', 'ready', 'active');
    if (className) micStatus.classList.add(className);
    micText.textContent = text;
  }
  function startLiveCallTimer(card, callSid = null) {
    if (!card) card = document.getElementById(WIDGET_ID);
    if (!card) return;
    // switch banner style to active and start ticking
    callTimerStartedAt = Date.now();
    currentCallSid = callSid; // Store current call SID
    setMicBanner(card, 'active', '0:00');
    if (callTimerHandle) clearInterval(callTimerHandle);
    callTimerHandle = setInterval(() => {
      const elapsed = Date.now() - callTimerStartedAt;
      const micText = card.querySelector('.mic-text');
      if (micText) micText.textContent = formatDuration(elapsed);
      
      // Broadcast live duration to recent calls sections (throttled every ~2s)
      if (currentCallSid) {
        const tick = Math.floor(elapsed / 2000);
        if (tick !== Math.floor((elapsed - 1000) / 2000)) {
              try {
                document.dispatchEvent(new CustomEvent('pc:live-call-duration', { 
                  detail: { 
                    callSid: currentCallSid, 
                    duration: Math.floor(elapsed / 1000),
                    durationFormatted: formatDurationForRecentCalls(elapsed)
                  } 
                }));
              } catch(_) {}
        }
            }
    }, 1000);
  }
  function stopLiveCallTimer(card) {
    if (callTimerHandle) {
      clearInterval(callTimerHandle);
      callTimerHandle = null;
    }
    currentCallSid = null; // Clear current call SID
    if (!card) card = document.getElementById(WIDGET_ID);
    if (!card) return;
    const now = Date.now();
    const lastFlip = (typeof window.__pc_lastFlipAt === 'number') ? window.__pc_lastFlipAt : 0;
    const recentlyFlipped = lastFlip && (now - lastFlip) < 260;
    // If no recent FLIP, capture snapshot so mic banner/text change is synchronized
    const snapshot = recentlyFlipped ? null : captureLayoutSnapshot(card);
    // Remove in-call spacing state on any call end
    try { card.classList.remove('in-call'); } catch(_) {}
    // Restore the idle banner depending on mic permission state
    if (TwilioRTC.state.micPermissionGranted) {
      setMicBanner(card, 'ok', 'Browser calls enabled');
    } else {
      setMicBanner(card, 'warn', 'Will call your phone - click here to retry microphone access');
    }
    if (recentlyFlipped) {
      // A FLIP just ran (likely from clearContactDisplay). Avoid a second animation.
      return;
    }
    // Run synchronized FLIP including container height
    runFlipFromSnapshot(snapshot, card, 300);
  }

  // Update microphone status UI
  function updateMicrophoneStatusUI(card, status) {
    const micStatus = card.querySelector('.mic-status');
    const micText = card.querySelector('.mic-text');
    if (!micStatus || !micText) return;

    // If a live call is active, do not override the timer banner except when explicitly stopping it
    if (callTimerHandle && status !== 'checking') return;

    micStatus.classList.remove('ok', 'warn', 'error', 'checking', 'ready', 'active');
    switch (status) {
      case 'granted':
        micStatus.classList.add('ok');
        micText.textContent = 'Browser calls enabled';
        break;
      case 'denied':
        micStatus.classList.add('warn');
        micText.textContent = 'Will call your phone - click here to retry microphone access';
        break;
      case 'checking':
        micStatus.classList.add('checking');
        micText.textContent = 'Requesting microphone access...';
        break;
      case 'error':
        micStatus.classList.add('error');
        micText.textContent = 'Will call your phone - click here to retry microphone access';
        break;
      case 'ready':
        micStatus.classList.add('ready');
        micText.textContent = 'Click here to enable browser calls (requires microphone access)';
        break;
    }
  }

  // If the card is mid-animation (inline height set), bump the height to fit content
  function adjustHeightIfAnimating(card) {
    if (!card) return;
    const h = card && card.style && card.style.height;
    if (!h) return; // no inline height means we're done animating
    const current = parseFloat(h) || 0;
    const needed = card.scrollHeight;
    if (needed > current) {
      card.style.height = needed + 'px';
    }
  }

  // Smoothly animate the widget card's height between its current size and natural size
  function smoothResize(card, duration = 360) {
    try {
      if (!card) card = document.getElementById(WIDGET_ID);
      if (!card) return;
      // Measure current and target heights
      const start = card.getBoundingClientRect().height;
      // Temporarily ensure natural height to compute target
      const prevHeight = card.style.height;
      const prevOverflow = card.style.overflow;
      card.style.height = 'auto';
      const target = card.scrollHeight;
      // If already equal, no animation needed
      if (Math.abs(target - start) < 1) {
        card.style.height = prevHeight;
        return;
      }
      // Prepare for transition
      card.style.overflow = 'hidden';
      card.style.height = start + 'px';
      void card.offsetHeight; // reflow
      card.style.transition = `height ${duration}ms cubic-bezier(0.4,0,0.2,1)`;
      try { window.__pc_lastCardResizeAt = Date.now(); } catch(_) { }
      card.style.height = target + 'px';
      const cleanup = () => {
        card.style.transition = '';
        card.style.height = '';
        card.style.overflow = prevOverflow || '';
        card.removeEventListener('transitionend', onEnd);
      };
      let timer = setTimeout(cleanup, duration + 60);
      const onEnd = (e) => {
        if (e && e.propertyName !== 'height') return;
        clearTimeout(timer);
        cleanup();
      };
      card.addEventListener('transitionend', onEnd);
    } catch(_) {}
  }

  // Microphone permission handling
  async function checkMicrophonePermission(card) {
    console.log('[Phone] checkMicrophonePermission called');
    console.log('[Phone] Current state:', {
      checked: TwilioRTC.state.micPermissionChecked,
      granted: TwilioRTC.state.micPermissionGranted,
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol,
      hasUserGesture: document.hasStoredUserActivation || 'unknown'
    });
    
    if (TwilioRTC.state.micPermissionChecked && TwilioRTC.state.micPermissionGranted) {
      console.log('[Phone] Permission already granted, returning true');
      return true;
    }
    
    // Check if we're in a secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      console.error('[Phone] Not in secure context - microphone access requires HTTPS or localhost');
      try { 
        window.crm?.showToast && window.crm.showToast('Microphone access requires HTTPS or localhost'); 
      } catch(_) {}
      return false;
    }
    
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[Phone] getUserMedia not available');
      try { 
        window.crm?.showToast && window.crm.showToast('Microphone access not supported in this browser'); 
      } catch(_) {}
      return false;
    }
    
    try {
      console.log('[Phone] Requesting microphone permission...');
      // Always attempt to request microphone permission directly
      // This will trigger the browser permission dialog if needed
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('[Phone] Microphone permission granted!');
        // Stop the stream immediately as we only need permission
        stream.getTracks().forEach(track => track.stop());
        TwilioRTC.state.micPermissionGranted = true;
        TwilioRTC.state.micPermissionChecked = true;
        return true;
      } catch (micError) {
        console.warn('[Phone] Microphone permission denied:', micError?.name, micError?.message);
        TwilioRTC.state.micPermissionGranted = false;
        TwilioRTC.state.micPermissionChecked = true;
        
        // Show helpful message based on error type
        let message = 'Microphone access needed for browser calls.';
        if (micError?.name === 'NotAllowedError') {
          message += ' Click the microphone icon in your address bar to allow.';
        } else if (micError?.name === 'NotFoundError') {
          message = 'No microphone found. Please check your audio devices.';
        } else if (micError?.name === 'NotReadableError') {
          message = 'Microphone is being used by another application.';
        }
        
        try { 
          window.crm?.showToast && window.crm.showToast(message); 
        } catch(_) {}
        return false;
      }
    } catch (error) {
      console.warn('[Phone] Permission check failed:', error?.message || error);
      TwilioRTC.state.micPermissionGranted = false;
      TwilioRTC.state.micPermissionChecked = true;
      return false;
    }
  }

  // Reset microphone permission state to force re-check
  function resetMicrophonePermission() {
    TwilioRTC.state.micPermissionGranted = false;
    TwilioRTC.state.micPermissionChecked = false;
    console.debug('[Phone] Microphone permission state reset');
  }

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  function removeExistingWidget() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  }

  function closePhoneWidget() {
    const card = document.getElementById(WIDGET_ID);
    if (!card) return;
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      if (card.parentElement) card.parentElement.removeChild(card);
      return;
    }
    // Prepare collapse animation from current height and paddings
    const cs = window.getComputedStyle(card);
    const start = card.scrollHeight; // includes padding
    card.style.overflow = 'hidden';
    card.style.height = start + 'px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    void card.offsetHeight; // reflow
    card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
    card.style.height = '0px';
    card.style.paddingTop = '0px';
    card.style.paddingBottom = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-6px)';
    const pending = new Set(['height', 'padding-top', 'padding-bottom']);
    let safetyTimer = null;
    const finalize = () => {
      card.removeEventListener('transitionend', onEnd);
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      if (card.parentElement) card.parentElement.removeChild(card);
    };
    const onEnd = (e) => {
      if (!e) return;
      if (pending.has(e.propertyName)) pending.delete(e.propertyName);
      if (pending.size > 0) return;
      finalize();
    };
    card.addEventListener('transitionend', onEnd);
    // Safety: in case transitions are interrupted (e.g., parent hidden)
    safetyTimer = setTimeout(finalize, 900);
  }

  const T9_MAP = {
    '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ'
  };

  function letterToDigit(ch) {
    const up = ch.toUpperCase();
    for (const [d, letters] of Object.entries(T9_MAP)) {
      if (letters.includes(up)) return d;
    }
    return '';
  }

  function formatT9Hint(number) {
    // T9 hint UI removed
    return '';
  }

  // Normalize a dialed number to E.164.
  // Rules:
  // - Accept letters (convert via T9), punctuation, spaces.
  // Enhanced phone number normalization with extension support
  // - If it starts with '+', keep country code and digits.
  // - If 10 digits, assume US and prefix +1.
  // - If 11 digits starting with 1, normalize to +1##########.
  // - Otherwise, if digits 8-15 long without '+', prefix '+' and validate.
  // - Extensions are preserved but not used for calling (Twilio doesn't support extensions in dialing)
  // Returns { ok: boolean, value: string, extension: string }
  function normalizeDialedNumber(raw) {
    let s = (raw || '').trim();
    if (!s) return { ok: false, value: '', extension: '' };
    
    // Parse phone number and extension
    const parsed = parsePhoneWithExtension(s);
    if (!parsed.number) return { ok: false, value: '', extension: '' };
    
    // map letters to digits for the main number
    let number = parsed.number.replace(/[A-Za-z]/g, (c) => letterToDigit(c) || '');
    const hasPlus = number.startsWith('+');
    const digits = number.replace(/\D/g, '');
    let e164 = '';
    
    if (hasPlus) {
      e164 = '+' + digits;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      e164 = '+1' + digits.slice(1);
    } else if (digits.length === 10) {
      e164 = '+1' + digits;
    } else if (digits.length >= 8 && digits.length <= 15) {
      // Assume user included country code without '+'
      e164 = '+' + digits;
    } else {
      return { ok: false, value: '', extension: parsed.extension || '' };
    }
    
    if (/^\+\d{8,15}$/.test(e164)) {
      return { ok: true, value: e164, extension: parsed.extension || '' };
    }
    return { ok: false, value: '', extension: parsed.extension || '' };
  }

  // Parse phone number and extension from various formats
  function parsePhoneWithExtension(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return { number: '', extension: '' };
    
    // Common extension patterns
    const extensionPatterns = [
      /ext\.?\s*(\d+)/i,
      /extension\s*(\d+)/i,
      /x\.?\s*(\d+)/i,
      /#\s*(\d+)/i,
      /\s+(\d{3,6})\s*$/  // 3-6 digits at the end (common extension length)
    ];
    
    let number = raw;
    let extension = '';
    
    // Try to find extension using various patterns
    for (const pattern of extensionPatterns) {
      const match = number.match(pattern);
      if (match) {
        extension = match[1];
        number = number.replace(pattern, '').trim();
        break;
      }
    }
    
    return { number, extension };
  }

  function getBusinessNumber() {
    // Get the current business number from environment or default
    // This will be dynamic when more numbers are added
    return '817-663-0380'; // Default number for now
  }

  function formatPhoneNumber(phone) {
    // Format phone number for display (e.g., +18176630380 -> 817-663-0380)
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  }

  function makeCard() {
    const card = document.createElement('div');
    card.className = 'widget-card phone-card';
    card.id = WIDGET_ID;

    const businessNumber = getBusinessNumber();
    const formattedNumber = formatPhoneNumber(businessNumber);

    card.innerHTML = `
      <div class="widget-card-header">
        <div class="phone-title-container">
          <h4 class="widget-title">Phone</h4>
          <span class="my-number-info">• My Number: ${formattedNumber}</span>
        </div>
        <button type="button" class="btn-text notes-close phone-close" aria-label="Close" data-pc-title="Close" aria-describedby="pc-tooltip">×</button>
      </div>
      <div class="phone-body">
        <input type="text" class="input-dark phone-display" placeholder="Enter number" inputmode="tel" autocomplete="off" />
        <div class="mic-status checking" role="button" tabindex="0" title="Click to retry microphone permission">
          <span class="status-dot" aria-hidden="true"></span>
          <span class="mic-text">Checking microphone access...</span>
        </div>
        <div class="dialpad">
          ${[
            {d:'1', l:''}, {d:'2', l:'ABC'}, {d:'3', l:'DEF'},
            {d:'4', l:'GHI'}, {d:'5', l:'JKL'}, {d:'6', l:'MNO'},
            {d:'7', l:'PQRS'}, {d:'8', l:'TUV'}, {d:'9', l:'WXYZ'},
            {d:'*', l:''}, {d:'0', l:'+'}, {d:'#', l:''}
          ].map(k => `
            <button type="button" class="dial-key" data-key="${k.d}">
              <div class="dial-digit">${k.d}</div>
              <div class="dial-letters">${k.l}</div>
            </button>
          `).join('')}
        </div>
        <div class="dial-actions">
          <button type="button" class="btn-primary call-btn-start" title="Call">Call</button>
          <button type="button" class="btn-text scripts-toggle" title="Scripts">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </button>
        </div>
        <div class="mini-scripts-wrap" hidden></div>
      </div>
    `;

    const input = card.querySelector('.phone-display');
    // T9 hint removed

    // Focus ring preference
    if (input) {
      input.addEventListener('focus', () => input.classList.add('focus-orange'));
      input.addEventListener('blur', () => input.classList.remove('focus-orange'));
    }

    const appendChar = (ch) => {
      if (!input) return;
      input.value = (input.value || '') + ch;
      try { input.focus(); } catch (_) {}
    };

    const clearAll = () => {
      if (!input) return;
      input.value = '';
      try { input.focus(); } catch (_) {}
    };

    // --- Mini Scripts (embedded call scripts) ---
    function ensureMiniScriptsStyles(){
      if (document.getElementById('phone-mini-scripts-styles')) return;
      const style = document.createElement('style');
      style.id = 'phone-mini-scripts-styles';
      style.textContent = `
        .mini-scripts { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 10px; padding: 10px; margin-top: 10px; }
        .mini-scripts .ms-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .mini-scripts .ms-search { position: relative; display: flex; align-items: center; gap: 8px; flex: 1; }
        .mini-scripts .ms-search input { flex: 1; }
        .mini-scripts .ms-actions { display: flex; gap: 6px; }
        .mini-scripts .ms-suggest { position: absolute; top: 34px; left: 0; right: 0; background: var(--bg-main); border: 1px solid var(--border-light); border-radius: 8px; z-index: 50; max-height: 200px; overflow: auto; padding: 6px 0; }
        .mini-scripts .ms-suggest[hidden] { display: none; }
        .mini-scripts .ms-suggest .item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; }
        .mini-scripts .ms-suggest .item:hover { background: var(--bg-subtle); }
        .mini-scripts .ms-suggest .glyph { width: 20px; height: 20px; border-radius: 50%; background: var(--orange-subtle); color: #fff; display:flex; align-items:center; justify-content:center; font-size: 11px; font-weight: 700; }
        .mini-scripts .ms-row { display: flex; gap: 8px; margin: 8px 0; }
        .mini-scripts .ms-row .btn-secondary { flex: 1; }
        .mini-scripts .ms-row.--single { justify-content: stretch; }
        .mini-scripts .ms-display { color: var(--text-primary); line-height: 1.4; background: var(--bg-main); border: 1px solid var(--border-light); border-radius: 8px; padding: 10px; margin: 8px 0; }
        .mini-scripts .ms-responses { display: flex; flex-wrap: wrap; gap: 8px; }
        .mini-scripts .ms-var { color: var(--grey-400); font-weight: 400; }
        .mini-scripts .ms-toolbar { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
        .mini-scripts .icon-btn { background: transparent; border: none; color: var(--text-primary); cursor: pointer; padding: 6px; border-radius: 6px; transition: color 0.2s ease; }
        .mini-scripts .icon-btn:hover { color: var(--text-inverse); }
      `;
      document.head.appendChild(style);
    }

    function buildMiniScriptsUI(card){
      ensureMiniScriptsStyles();
      const body = card.querySelector('.phone-body');
      const wrap = card.querySelector('.mini-scripts-wrap');
      if (!body || !wrap) return;

      // Clear and build shell
      wrap.innerHTML = '';
      const el = document.createElement('div');
      el.className = 'mini-scripts';
      el.innerHTML = `
        <div class="ms-top">
          <div class="ms-search">
            <input type="text" class="input-dark ms-input" placeholder="Search contact for this call…" aria-label="Search contact" autocomplete="off" />
            <div class="ms-suggest" role="listbox" aria-label="Contact suggestions" hidden></div>
          </div>
          <div class="ms-actions">
            <button type="button" class="icon-btn ms-back" title="Back" aria-label="Back" data-action="back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <button type="button" class="icon-btn ms-reset" title="Reset" aria-label="Reset" data-action="reset">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M20.49 15A9 9 0 1 1 17 8.5L23 10"/></svg>
            </button>
          </div>
        </div>
        <div class="ms-row">
          <button type="button" class="btn-secondary ms-gk">Gate Keeper</button>
          <button type="button" class="btn-secondary ms-vm">Voicemail</button>
        </div>
        <div class="ms-row --single">
          <button type="button" class="btn-secondary ms-dm">Decision Maker</button>
        </div>
        <div class="ms-display" aria-live="polite"></div>
        <div class="ms-responses"></div>
      `;
      wrap.appendChild(el);

      const state = { current: '', history: [], overrideContactId: null };

      // Data helpers (subset from scripts page)
      function escapeHtml(str){ if (str == null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
      function splitName(s){ const parts = String(s||'').trim().split(/\s+/); return { first: parts[0]||'', last: parts.slice(1).join(' ')||'', full: String(s||'').trim() }; }
      function normPhone(p){ return String(p||'').replace(/\D/g,'').slice(-10); }
      function normDomain(email){ return String(email||'').split('@')[1]?.toLowerCase() || ''; }
      function normName(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }
      function getPeopleCache(){ try { return (typeof window.getPeopleData==='function' ? (window.getPeopleData()||[]) : []); } catch(_) { return []; } }
      function getAccountsCache(){ try { return (typeof window.getAccountsData==='function' ? (window.getAccountsData()||[]) : []); } catch(_) { return []; } }
      function formatDateMDY(v){ try { const d = new Date(v); if (!isFinite(+d)) return String(v||''); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); const yyyy = d.getFullYear(); return `${mm}/${dd}/${yyyy}`; } catch(_) { return String(v||''); } }
      function toMDY(v){ try { const d = new Date(v); if (!isFinite(+d)) return String(v||''); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); const yyyy = d.getFullYear(); return `${mm}/${dd}/${yyyy}`; } catch(_) { return String(v||''); } }

      function normalizeAccount(a){ const obj = a ? { ...a } : {}; obj.supplier = obj.supplier || obj.currentSupplier || obj.current_supplier || obj.energySupplier || obj.electricitySupplier || obj.supplierName || ''; const end = obj.contractEnd || obj.contract_end || obj.renewalDate || obj.renewal_date || obj.contractEndDate || obj.contract_end_date || obj.contractExpiry || obj.expiration || obj.expirationDate || obj.expiresOn || ''; obj.contract_end = end || ''; obj.contractEnd = end || obj.contractEnd || ''; obj.name = obj.name || obj.accountName || obj.companyName || ''; obj.industry = obj.industry || ''; obj.city = obj.city || obj.locationCity || obj.billingCity || ''; obj.state = obj.state || obj.region || obj.billingState || ''; obj.website = obj.website || obj.domain || ''; obj.accountId = obj.accountId || obj.account_id || obj.account || obj.companyId || ''; return obj; }
      function normalizeContact(c){ const obj = c ? { ...c } : {}; const nameGuess = obj.name || ((obj.firstName||obj.first_name||'') + ' ' + (obj.lastName||obj.last_name||'')).trim(); const sp = splitName(nameGuess); obj.firstName = obj.firstName || obj.first_name || sp.first; obj.lastName = obj.lastName || obj.last_name || sp.last; obj.full_name = obj.full_name || sp.full; obj.first_name = obj.firstName; obj.last_name = obj.lastName; obj.email = obj.email || obj.work_email || obj.personal_email || ''; obj.title = obj.title || obj.jobTitle || obj.job_title || ''; obj.company = obj.company || obj.companyName || ''; obj.accountId = obj.accountId || obj.account_id || obj.account || obj.companyId || ''; return obj; }

      function findAccountForContact(contact){ if (!contact) return {}; const accounts = getAccountsCache(); try { if (contact.accountId) { const hitById = accounts.find(a => String(a.id||a.accountId||'') === String(contact.accountId)); if (hitById) return hitById; } } catch(_) {} const clean = (s)=> String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim(); const comp = clean(contact.company||contact.companyName||''); if (comp) { const hit = accounts.find(a=> { const nm = clean(a.accountName||a.name||a.companyName||''); return nm && nm === comp; }); if (hit) return hit; } const domain = normDomain(contact.email||''); if (domain) { const match = accounts.find(a=> { const d = String(a.domain||a.website||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]; return d && (domain.endsWith(d) || d.endsWith(domain)); }); if (match) return match; } return {}; }

      function getAccountKey(a){ return String((a && (a.accountName||a.name||a.companyName||''))||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }

      function getLiveData(){
        // Build from current call context + optional override contact
        const ctx = currentCallContext || {};
        let contact = null; let account = null;
        // Prefer override contact if selected
        try {
          if (state.overrideContactId) {
            const people = getPeopleCache();
            contact = people.find(p => String(p.id||p.contactId||p._id||'') === String(state.overrideContactId)) || null;
          }
        } catch(_) {}
        // If not selected, try to infer from context name
        if (!contact && ctx && ctx.name) {
          try {
            const people = getPeopleCache();
            const nm = normName(ctx.name);
            contact = people.find(p => normName(p.name || ((p.firstName||'') + ' ' + (p.lastName||''))) === nm) || null;
          } catch(_) {}
        }
        // Resolve account from contact or context
        try { account = findAccountForContact(contact) || {}; } catch(_) { account = {}; }
        if (!account || !account.name) {
          const accounts = getAccountsCache();
          const nm = String(ctx.company||'').trim();
          if (nm) {
            const hit = accounts.find(a => getAccountKey(a) === getAccountKey({ name: nm }));
            if (hit) account = hit;
          }
        }
        contact = normalizeContact(contact);
        account = normalizeAccount(account);

        // Read live Energy fields from Account Detail DOM and Health widget
        try {
          const detailSupplier = document.querySelector('#account-detail-view .info-value-wrap[data-field="electricitySupplier"] .info-value-text')?.textContent?.trim() || '';
          const detailContractEnd = document.querySelector('#account-detail-view .info-value-wrap[data-field="contractEndDate"] .info-value-text')?.textContent?.trim() || '';
          const healthSupplier = document.querySelector('#health-supplier')?.value?.trim();
          const healthContractEnd = document.querySelector('#health-contract-end')?.value;
          const finalSupplier = healthSupplier || detailSupplier;
          const finalContractEnd = healthContractEnd ? toMDY(healthContractEnd) : detailContractEnd;
          if (finalSupplier) account.supplier = finalSupplier;
          if (finalContractEnd) { account.contract_end = finalContractEnd; account.contractEnd = finalContractEnd; }
        } catch(_) {}

        // Borrow missing from contact if needed
        if (!account.supplier && contact.supplier) account.supplier = contact.supplier;
        if (!account.contract_end && contact.contract_end) account.contract_end = contact.contract_end;
        if (!account.contractEnd && contact.contract_end) account.contractEnd = contact.contract_end;

        return { contact, account };
      }

      function dayPart(){ try { const h = new Date().getHours(); if (h < 12) return 'morning'; if (h < 17) return 'afternoon'; return 'evening'; } catch(_) { return 'day'; } }
      function chip(scope, key){
        const friendly = {
          'name': 'company name',
          'first_name': 'first name',
          'last_name': 'last name',
          'full_name': 'full name',
          'phone': 'phone',
          'mobile': 'mobile',
          'email': 'email',
          'title': 'title',
          'supplier': 'supplier',
          'contract_end': 'contract end',
          'industry': 'industry',
          'city': 'city',
          'state': 'state',
          'website': 'website'
        }[key] || String(key).replace(/_/g,' ').toLowerCase();
        const token = `{{${scope}.${key}}}`;
        return `<span class="var-chip" data-var="${scope}.${key}" data-token="${token}" contenteditable="false">${friendly}</span>`;
      }
      function renderTemplateChips(str){
        if (!str) return '';
        // Replace known tokens with chips without substituting live values
        let result = String(str);
        // day.part should always render as actual text
        try {
          const dp = dayPart();
          result = result.replace(/\{\{\s*day\.part\s*\}\}/gi, escapeHtml(dp));
        } catch(_) {}
        const tokens = [
          'contact.first_name','contact.last_name','contact.full_name','contact.phone','contact.mobile','contact.email','contact.title',
          'account.name','account.industry','account.city','account.state','account.website','account.supplier','account.contract_end'
        ];
        tokens.forEach(key => {
          const [scope, k] = key.split('.');
          const pattern = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\}}`, 'gi');
          if (scope && k) result = result.replace(pattern, chip(scope, k));
        });
        return result;
      }

      function renderTemplateValues(str){
        if (!str) return '';
        const data = getLiveData();
        const values = {
          'day.part': dayPart(),
          'contact.first_name': data.contact.firstName || data.contact.first_name || '',
          'contact.last_name': data.contact.lastName || data.contact.last_name || '',
          'contact.full_name': data.contact.full_name || ((data.contact.firstName||'') + ' ' + (data.contact.lastName||'')),
          'contact.phone': data.contact.workDirectPhone || data.contact.mobile || data.contact.otherPhone || data.contact.phone || '',
          'contact.mobile': data.contact.mobile || '',
          'contact.email': data.contact.email || '',
          'contact.title': data.contact.title || data.contact.jobTitle || '',
          'account.name': data.account.name || data.account.accountName || data.account.companyName || '',
          'account.industry': data.account.industry || '',
          'account.city': data.account.city || '',
          'account.state': data.account.state || data.account.region || data.account.billingState || '',
          'account.website': data.account.website || data.account.domain || normDomain(data.contact.email) || '',
          'account.supplier': data.account.supplier || data.account.currentSupplier || data.contact.supplier || data.contact.currentSupplier || '',
          'account.contract_end': formatDateMDY(data.account.contractEnd || data.account.contract_end || data.account.renewalDate || data.contact.contract_end || data.contact.contractEnd || '')
        };
        let result = String(str);
        for (const [key, value] of Object.entries(values)) {
          const pattern = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\}}`, 'gi');
          result = result.replace(pattern, escapeHtml(value || ''));
        }
        return result;
      }

      // Flow: prefer scripts page FLOW if exported; fallback to local subset
      const FLOW = (window.callScriptsModule && window.callScriptsModule.FLOW) || {
        hook: { text: 'Good {{day.part}}, is this {{contact.first_name}}?', responses: [ { label: 'Yes, this is', next: 'awesome_told_to_speak' }, { label: 'Speaking', next: 'awesome_told_to_speak' }, { label: "Who's calling?", next: 'main_script_start' }, { label: 'Not me', next: 'gatekeeper_intro' } ] },
        awesome_told_to_speak: { text: 'Awesome I was actually told to speak with you — do you have a quick minute?', responses: [ { label: 'Yes', next: 'main_script_start' }, { label: 'What is this about?', next: 'main_script_start' } ] },
        main_script_start: { text: "Perfect — So, my name is Lewis with PowerChoosers.com, and — I understand you're responsible for electricity agreements and contracts for {{account.name}}. Is that still accurate?", responses: [ { label: "Yes, that's me / I handle that", next: 'pathA' }, { label: 'That would be someone else / not the right person', next: 'gatekeeper_intro' } ] },
        gatekeeper_intro: { text: 'Good {{day.part}}. I\'m actually needin\' to speak with someone over electricity agreements and contracts for {{account.name}} — do you know who would be responsible for that?', responses: [ { label: "What's this about?", next: 'gatekeeper_whats_about' }, { label: "I'll connect you", next: 'transfer_dialing' }, { label: "They're not available / take a message", next: 'voicemail' } ] },
        gatekeeper_whats_about: { text: 'My name is Lewis with PowerChoosers.com and I am looking to speak with someone about the future electricity agreements for {{account.name}}. Who would be the best person for that?', responses: [ { label: "I'll connect you", next: 'transfer_dialing' }, { label: "They're not available / take a message", next: 'voicemail' }, { label: 'I can help you', next: 'pathA' } ] },
        transfer_dialing: { text: 'Connecting... Ringing...', responses: [ { label: 'Call connected', next: 'hook' }, { label: 'Not connected', next: 'voicemail' } ] },
        voicemail: { text: 'Good {{day.part}}, this is Lewis. Please call me back at 817-663-0380. I also sent a short email explaining why I am reaching out today. Thank you and have a great day.', responses: [ { label: 'End call / start new call', next: 'start' } ] },
        pathA: { text: "Got it. now {{contact.first_name}}, I work directly with NRG, TXU, APG & E — and they've all let us know in advance that rates are about to go up next year... <br><br><span class=\"script-highlight\">How are <em>you</em> guys handling these — sharp increases for your future renewals?</span>", responses: [ { label: "It's tough / struggling", next: 'discovery' }, { label: 'Have not renewed / contract not up yet', next: 'pathA_not_renewed' }, { label: 'Locked in / just renewed', next: 'pathA_locked_in' }, { label: 'Shopping around / looking at options', next: 'pathA_shopping' }, { label: 'Have someone handling it / work with broker', next: 'pathA_broker' }, { label: "Haven't thought about it / what rate increase?", next: 'pathA_unaware' } ] },
        pathA_not_renewed: { text: "Makes sense — when it comes to getting the best price, it's pretty easy to renew at the wrong time and end up overpaying. When does your contract expire? Do you know who your supplier is? <br><br>Awesome — we work directly with {{account.supplier}} as well as over 30 suppliers here in Texas. I can give you access to future pricing data directly from ERCOT — that way you lock in a number you like, not one you’re forced to take. <br><br><span class=\"script-highlight\">Would you be open to a quick, free energy health check so you can see how this would work?</span>", responses: [ { label: 'Yes — schedule health check', next: 'schedule_health_check' }, { label: 'Send me details by email', next: 'send_details_email' } ] },
        discovery: { text: 'Great — let me grab a few details for {{account.name}} so we can give you an accurate baseline.', responses: [ { label: 'Continue', next: 'schedule_health_check' } ] },
        schedule_health_check: { text: "Perfect — I’ll set up a quick energy health check. What works best for you, {{contact.first_name}} — a 10-minute call today or tomorrow? I’ll bring ERCOT forward pricing so you can see it live for {{account.name}}.", responses: [ { label: 'Book on calendar', next: 'start' }, { label: 'Text me times', next: 'start' } ] },
        send_details_email: { text: "No problem — I’ll send a quick overview with ERCOT forward pricing and next steps for {{account.name}}. Do you want me to send it to {{contact.full_name}} at {{contact.email}} or is there a better address?", responses: [ { label: 'Send now', next: 'start' } ] },
        pathA_locked_in: { text: "Good to hear you’re covered. Quick sanity check — did you lock pre-increase or after the jump? If after, there may be a chance to re-rate or layer a future-start at a better position if the market relaxes. Want me to take a quick look at what’s possible for {{account.name}}?", responses: [ { label: 'Sure, take a look', next: 'discovery' }, { label: 'We’re fine as-is', next: 'voicemail' } ] },
        pathA_shopping: { text: "Great — then let’s make sure you have leverage. Other {{account.industry}} accounts in {{account.city}} are comparing fixed vs. hybrid structures and watching forward curves. I can send a clean apples-to-apples view for {{account.name}} so you’re not guessing. Want me to spin that up?", responses: [ { label: 'Yes, send apples-to-apples', next: 'discovery' }, { label: 'Already have options', next: 'discovery' }, { label: 'Circle back next week', next: 'voicemail' } ] },
        pathA_broker: { text: "All good — we work alongside existing brokers often. My angle is purely market timing and contract mechanics so {{account.name}} doesn’t overpay. If I spot a price window that beats what you’re seeing, I’ll flag it. Want me to keep an eye out and share any meaningful dips?", responses: [ { label: 'Yes, keep me posted', next: 'discovery' }, { label: 'We’re set with our broker', next: 'voicemail' }, { label: 'What would you need?', next: 'discovery' } ] },
        pathA_unaware: { text: "Fair question — rates stepped up across most markets this year, and many {{account.industry}} accounts in {{account.city}} only feel it at renewal. My role is to get ahead of that so {{account.name}} isn’t surprised. Quick baseline: when roughly is your next expiration, and do you prefer fixed or a blended approach?", responses: [ { label: 'Share expiration month', next: 'discovery' }, { label: 'Not sure / need to check', next: 'discovery' }, { label: 'We’ll deal with it later', next: 'voicemail' } ] },
        start: { text: "Click 'Dial' to begin the call.", responses: [ { label: 'Back to beginning', next: 'start' } ] }
      };

      const display = el.querySelector('.ms-display');
      const responses = el.querySelector('.ms-responses');

      function renderNode(){
        const key = state.current;
        const node = FLOW[key];
        if (!node) { display.innerHTML = ''; responses.innerHTML = ''; return; }
        const live = (function(){ try { return hasActiveCall() || (currentCallContext && currentCallContext.isActive); } catch(_) { return false; } })();
        display.innerHTML = live ? renderTemplateValues(node.text || '') : renderTemplateChips(node.text || '');
        responses.innerHTML = '';
        (node.responses || []).forEach(r => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn-secondary';
          b.textContent = r.label || '';
          b.addEventListener('click', () => { if (r.next && FLOW[r.next]) { state.history.push(state.current); state.current = r.next; renderNode(); } });
          responses.appendChild(b);
        });
      }

      function startAt(key){ state.current = key; state.history = []; renderNode(); }
      function goBack(){ if (!state.history.length) return; state.current = state.history.pop(); renderNode(); }
      function resetAll(){ state.current = ''; state.history = []; state.overrideContactId = null; display.innerHTML=''; responses.innerHTML=''; inputEl.value=''; closeSuggest(); }

      // Buttons
      el.querySelector('.ms-gk').addEventListener('click', () => startAt('gatekeeper_intro'));
      el.querySelector('.ms-vm').addEventListener('click', () => startAt('voicemail'));
      el.querySelector('.ms-dm').addEventListener('click', () => startAt('hook'));
      el.querySelector('.ms-back').addEventListener('click', goBack);
      el.querySelector('.ms-reset').addEventListener('click', resetAll);

      // Search suggestions (account-scoped)
      const inputEl = el.querySelector('.ms-input');
      const panelEl = el.querySelector('.ms-suggest');
      function closeSuggest(){ panelEl.hidden = true; }
      function openSuggest(){ panelEl.hidden = false; }
      function setSelectedContact(id){ state.overrideContactId = id ? String(id) : null; try { const people = getPeopleCache(); const sel = people.find(p => String(p.id||p.contactId||p._id||'') === String(id)); if (sel){ const name = sel.name || ((sel.firstName||'') + ' ' + (sel.lastName||'')); inputEl.value = name; } } catch(_) {} closeSuggest(); renderNode(); }
      function buildSuggestions(q){
        const people = getPeopleCache();
        const ctxData = getLiveData();
        const accKey = getAccountKey(ctxData.account);
        const qn = String(q||'').trim().toLowerCase();
        const filtered = people.filter(p => {
          const nm = (p.name || ((p.firstName||'') + ' ' + (p.lastName||''))).toLowerCase();
          const acct = getAccountKey({ name: p.company || p.companyName || '' });
          const matchAccount = !accKey || (acct === accKey);
          const matchName = !qn || nm.includes(qn);
          return matchAccount && matchName;
        }).slice(0, 8);
        if (!filtered.length){ panelEl.innerHTML = '<div class="item" aria-disabled="true">No matches</div>'; openSuggest(); return; }
        panelEl.innerHTML = filtered.map(p => {
          const nm = (p.name || ((p.firstName||'') + ' ' + (p.lastName||''))) || '';
          const first = (nm||'?').charAt(0).toUpperCase();
          return `<div class="item" role="option" data-id="${escapeHtml(p.id||p.contactId||p._id||'')}"><div class="glyph">${first}</div><div class="label">${escapeHtml(nm)}</div></div>`;
        }).join('');
        openSuggest();
      }
      inputEl.addEventListener('input', () => { const v = inputEl.value||''; if (!v.trim()){ state.overrideContactId = null; closeSuggest(); renderNode(); return; } buildSuggestions(v); });
      inputEl.addEventListener('keydown', (e) => { if (e.key==='Escape'){ closeSuggest(); return; } if (e.key==='Enter'){ const first = panelEl.querySelector('.item'); if (first){ const id = first.getAttribute('data-id'); if (id) setSelectedContact(id); closeSuggest(); e.preventDefault(); } } });
      panelEl.addEventListener('click', (e) => { const it = e.target.closest && e.target.closest('.item'); if (!it) return; const id = it.getAttribute('data-id'); if (id) setSelectedContact(id); });
      document.addEventListener('click', (e) => { if (!el.contains(e.target)) closeSuggest(); });

      // Energy updates
      let lastEnergyAt = 0; const TH = 3000;
      const onEnergy = (ev) => { try { const now = Date.now(); if (now - lastEnergyAt < TH) return; lastEnergyAt = now; const d = ev.detail||{}; const live = getLiveData(); const contactId = live.contact?.id || live.contact?.contactId || live.contact?._id; const accountId = live.account?.id || live.account?.accountId || live.account?._id; const relevant = (d.entity==='contact' && String(d.id)===String(contactId)) || (d.entity==='account' && String(d.id)===String(accountId)); if (relevant) renderNode(); } catch(_) {} };
      document.addEventListener('pc:energy-updated', onEnergy);

      // Re-render on call state changes (e.g., connected -> substitute values)
      try { card.addEventListener('callStateChanged', () => renderNode()); } catch(_) {}

      // Initialize empty
      state.current = '';
    }

    function toggleMiniScripts(card){
      const wrap = card.querySelector('.mini-scripts-wrap');
      if (!wrap) return;
      const snapshot = captureLayoutSnapshot(card);
      const isHidden = wrap.hasAttribute('hidden');
      if (isHidden) {
        buildMiniScriptsUI(card);
        wrap.removeAttribute('hidden');
        try { const si = wrap.querySelector('.ms-input'); if (si) si.focus(); } catch(_) {}
      } else {
        wrap.setAttribute('hidden','');
        wrap.innerHTML = '';
      }
      runFlipFromSnapshot(snapshot, card, 300);
    }

    const backspace = () => {
      if (!input) return;
      const current = input.value || '';
      input.value = current.slice(0, -1);
      try { input.focus(); } catch (_) {}
    };

    // Handle paste on input only and keep only allowed characters
    const onPaste = (e) => {
      if (!input) return;
      const clip = (e.clipboardData || window.clipboardData);
      if (!clip) return;
      const text = (clip.getData && (clip.getData('text') || clip.getData('Text'))) || '';
      if (!text) return;
      e.preventDefault();
      try { e.stopPropagation(); } catch (_) {}
      // Map letters to T9 digits; allow digits, *, #, and a single leading +
      const mapped = String(text).replace(/[A-Za-z]/g, (c) => letterToDigit(c) || '');
      const cleaned = mapped.replace(/[^0-9*#\+]/g, '');
      const existing = input.value || '';
      const next = existing ? (existing + cleaned.replace(/\+/g, '')) : cleaned.replace(/(.*?)(\+)(.*)/, '+$1$3');
      input.value = next;
      try { input.focus(); } catch (_) {}
    };
    if (input) input.addEventListener('paste', onPaste);

    // Track user input activity
    const trackUserInput = () => {
      lastUserTypingTime = Date.now();
    };
    
    // Dialpad clicks
    // Helper: detect active call connection
    const hasActiveCall = () => {
      try {
        if (isCallInProgress) return true;
        if (TwilioRTC.state?.connection) {
          const st = (typeof TwilioRTC.state.connection.status === 'function') ? TwilioRTC.state.connection.status() : 'open';
          return st && st !== 'closed';
        }
        if (currentCall) {
          const st2 = (typeof currentCall.status === 'function') ? currentCall.status() : 'open';
          return st2 && st2 !== 'closed';
        }
      } catch(_) {}
      return false;
    };
    const sendDTMF = (digit) => {
      try {
        const conn = currentCall || TwilioRTC.state?.connection;
        if (conn && typeof conn.sendDigits === 'function') {
          conn.sendDigits(String(digit));
          console.debug('[Phone] Sent DTMF:', digit);
        }
        // Briefly flash the corresponding dial key for visual feedback
        try {
          const card = document.getElementById(WIDGET_ID);
          if (card) {
            const keyBtn = card.querySelector(`.dial-key[data-key="${CSS.escape(String(digit))}"]`);
            if (keyBtn) {
              keyBtn.classList.add('dtmf-flash');
              setTimeout(() => { try { keyBtn.classList.remove('dtmf-flash'); } catch(_) {} }, 180);
            }
          }
        } catch(_) {}
      } catch (e) {
        console.warn('[Phone] Failed to send DTMF:', e);
      }
    };
    card.querySelectorAll('.dial-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key') || '';
        if (hasActiveCall()) {
          sendDTMF(k);
        } else {
          appendChar(k);
          trackUserInput();
        }
      });
    });
    
    // Helper: lookup contact by phone and update widget display
    function enrichTitleFromPhone(rawNumber) {
      // Suggested contact lookup disabled to avoid stale/incorrect attributions
      // Intentionally no-op to keep widget context strictly from the source page
      return;
    }

    // Track typing in input field
    if (input) {
      input.addEventListener('input', trackUserInput);
      input.addEventListener('keydown', trackUserInput);
      
      // Disable suggested-contact lookup during typing (keep context from source page only)
      input.addEventListener('input', () => {
        const value = input.value || '';
        if (!value.trim()) {
          try { clearContactDisplay(); } catch(_) {}
          // Also clear the context when input is cleared
          currentCallContext = {
            number: '',
            name: '',
            company: '',
            accountId: null,
            accountName: null,
            contactId: null,
            contactName: '',
            city: '',
            state: '',
            domain: '',
            logoUrl: '',
            isCompanyPhone: false,
            isActive: false
          };
        }
        // When user starts typing a new number, clear stale context from previous calls
        // This ensures manual entry doesn't show old company info
        if (value.trim() && currentCallContext.isActive === false) {
          console.debug('[Phone] User typing new number - clearing stale context');
          currentCallContext = {
            number: '',
            name: '',
            company: '',
            accountId: null,
            accountName: null,
            contactId: null,
            contactName: '',
            city: '',
            state: '',
            domain: '',
            logoUrl: '',
            isCompanyPhone: false,
            isActive: false
          };
        }
        
        // Also clear context if user is typing a different number than what's in context
        if (value.trim() && currentCallContext.isActive && currentCallContext.number && 
            currentCallContext.number !== value.trim()) {
          console.debug('[Phone] User typing different number - clearing existing context');
          currentCallContext = {
            number: '',
            name: '',
            company: '',
            accountId: null,
            accountName: null,
            contactId: null,
            contactName: '',
            city: '',
            state: '',
            domain: '',
            logoUrl: '',
            isCompanyPhone: false,
            isActive: false
          };
        }
      });
    }

    // Actions
    const callBtn = card.querySelector('.call-btn-start');
    const scriptsToggle = card.querySelector('.scripts-toggle');
    if (scriptsToggle && !scriptsToggle._bound) { scriptsToggle.addEventListener('click', () => toggleMiniScripts(card)); scriptsToggle._bound = true; }
    let currentCall = null;

    async function placeBrowserCall(number, extension = '') {
      console.debug('[Phone] Attempting browser call to:', number, extension ? `ext. ${extension}` : '');
      
      try {
        const device = await TwilioRTC.ensureDevice();
        
        // Set input device before making the call according to Twilio best practices
        // This ensures proper audio device selection for the call
        if (device.audio) {
          try {
            // Get available input devices and use the first one if 'default' doesn't exist
            const inputDevices = device.audio.availableInputDevices;
            let inputDeviceId = 'default';
            
            if (inputDevices && inputDevices.size > 0) {
              const deviceIds = Array.from(inputDevices.keys());
              console.log('[Phone] Available input devices:', deviceIds);
              
              // Try 'default' first, fallback to first available device
              if (!deviceIds.includes('default') && deviceIds.length > 0) {
                inputDeviceId = deviceIds[0];
                console.log('[Phone] Using first available input device:', inputDeviceId);
              }
            }
            
            try {
              await device.audio.setInputDevice(inputDeviceId);
              console.log('[Phone] Input device set to:', inputDeviceId);
            } catch (e) {
              console.warn('[Phone] Failed to set input device, trying without specific device:', e);
              try {
                await device.audio.unsetInputDevice();
              } catch (_) {}
            }
          } catch (e) {
            console.warn('[Phone] Failed to set input device:', e);
            // Continue without setting input device - Twilio will use browser default
          }
          
          // Set speaker device for output according to Twilio best practices
          if (device.audio.isOutputSelectionSupported) {
            try {
              // Get available output devices and use the first one if 'default' doesn't exist
              const outputDevices = device.audio.availableOutputDevices;
              let outputDeviceId = 'default';
              
              if (outputDevices && outputDevices.size > 0) {
                const deviceIds = Array.from(outputDevices.keys());
                console.log('[Phone] Available output devices:', deviceIds);
                
                if (!deviceIds.includes('default') && deviceIds.length > 0) {
                  outputDeviceId = deviceIds[0];
                  console.log('[Phone] Using first available output device:', outputDeviceId);
                }
              }
              
              try {
                device.audio.speakerDevices.set(outputDeviceId);
                console.log('[Phone] Output device set to:', outputDeviceId);
              } catch (e) {
                console.warn('[Phone] Failed to set output device, using browser default:', e);
              }
            } catch (e) {
              console.warn('[Phone] Failed to access output devices:', e);
              // Continue without setting output device - Twilio will use browser default
            }
          }
        }
        
        // Make the call with recording enabled via TwiML app
        currentCall = await device.connect({
          params: {
            To: number
          }
        });
        // Store outbound connection globally for unified cleanup paths
        try { TwilioRTC.state.connection = currentCall; } catch(_) {}
        
        console.debug('[Phone] Call initiated');
        
        // Set UI immediately for responsiveness
        setInCallUI(true);
        
        // Track call start time and generate consistent call ID
        const callStartTime = Date.now();
        const callId = `call_${callStartTime}_${Math.random().toString(36).substr(2, 9)}`;
        let twilioCallSid = null;
        
        // Log initial call with extension info
        const callNumber = extension ? `${number} ext. ${extension}` : number;
        await logCall(callNumber, 'browser', callId);
        
        // Handle call events
        currentCall.on('accept', async () => {
          console.debug('[Phone] Call connected');
          isCallInProgress = true;
          currentCallContext.isActive = true;
          currentCallContext.number = number;
          try {
            // Capture the Twilio CallSid if exposed by the SDK
            const p = (currentCall && (currentCall.parameters || currentCall._parameters)) || {};
            twilioCallSid = p.CallSid || p.callSid || null;
            if (twilioCallSid) console.debug('[Phone] Captured Twilio CallSid:', twilioCallSid);
          } catch(_) {}
          // Notify widgets that a call started
          try {
            document.dispatchEvent(new CustomEvent('callStarted', { detail: { callSid: twilioCallSid || callId } }));
            const el = document.getElementById(WIDGET_ID);
            if (el) el.dispatchEvent(new CustomEvent('callStateChanged', { detail: { state: 'in-call', callSid: twilioCallSid || callId } }));
          } catch(_) {}
          // Show live timer in banner
          const card = document.getElementById(WIDGET_ID);
          startLiveCallTimer(card, twilioCallSid || callId);
          // Populate in-call contact display (keep header title simple)
          try {
            const meta = await resolvePhoneMeta(number).catch(() => ({}));
            // Merge call context data with resolved meta to ensure company info is preserved
            const mergedMeta = {
              ...meta,
              ...(currentCallContext && {
                name: currentCallContext.name || meta.name,
                account: currentCallContext.company || meta.account,
                company: currentCallContext.company || meta.company,
                // In company mode, prefer account context only to avoid contact contamination
                city: currentCallContext.isCompanyPhone ? (currentCallContext.city || '') : (currentCallContext.city || meta.city),
                state: currentCallContext.isCompanyPhone ? (currentCallContext.state || '') : (currentCallContext.state || meta.state),
                // Always preserve domain from context - needed for favicon fallback
                domain: currentCallContext.domain || meta.domain,
                // Preserve logoUrl from context even if empty - prevents favicon from being cleared
                // Only use meta.logoUrl if currentCallContext doesn't have domain for fallback
                logoUrl: (currentCallContext.logoUrl !== undefined) ? currentCallContext.logoUrl : meta.logoUrl
              })
            };
            setContactDisplay(mergedMeta, number);
          } catch(_) {}
          // Update call status to connected using same call ID
          updateCallStatus(number, 'connected', callStartTime, 0, twilioCallSid || callId);
          // Immediately notify account detail to refresh recent calls (so it appears without reload)
          try { document.dispatchEvent(new CustomEvent('pc:recent-calls-refresh', { detail: { number } })); } catch(_) {}
        });
        
        currentCall.on('disconnect', () => {
          console.debug('[Phone] Call disconnected');
          
          // [WEB WORKER FIX] Only set critical flags immediately - everything else goes to worker
          const disconnectTime = Date.now();
          lastCallCompleted = disconnectTime;
          lastCalledNumber = number;
          isCallInProgress = false;
          autoTriggerBlockUntil = Date.now() + 3000;
          
          // Clear critical state immediately
          TwilioRTC.state.connection = null;
          TwilioRTC.state.pendingIncoming = null;
          currentCall = null;
          
          // [WEB WORKER] Send call completion to background worker
          if (callWorker) {
            const callEndTime = Date.now();
            const duration = Math.floor((callEndTime - callStartTime) / 1000);
            
            callWorker.postMessage({
              type: 'CALL_COMPLETED',
              data: {
                phoneNumber: number,
                startTime: callStartTime,
                duration: duration,
                callSid: twilioCallSid || callId,
                fromNumber: null,
                callType: 'outgoing'
              }
            });
          } else {
            // Fallback to main thread if worker not available
            console.warn('[Phone] Web Worker not available, using fallback');
            setTimeout(() => {
              const callEndTime = Date.now();
              const duration = Math.floor((callEndTime - callStartTime) / 1000);
              updateCallStatus(number, 'completed', callStartTime, duration, twilioCallSid || callId);
              try { document.dispatchEvent(new CustomEvent('pc:recent-calls-refresh', { detail: { number } })); } catch(_) {}
            }, 0);
          }
          
          // Immediate UI cleanup (non-blocking)
          const widget = document.getElementById(WIDGET_ID);
          stopLiveCallTimer(widget);
          
          // Clear UI state completely and ensure call button shows "Call"
          if (widget) {
            const btn = widget.querySelector('.call-btn-start');
            if (btn) {
              console.debug('[Phone] DISCONNECT: Setting button to "Call" state');
              btn.textContent = 'Call';
              btn.classList.remove('btn-danger');
              btn.classList.add('btn-primary');
              // Disable button briefly to prevent accidental immediate redial
              btn.disabled = true;
              setTimeout(() => { 
                btn.disabled = false; 
                console.debug('[Phone] DISCONNECT: Button re-enabled after 2s cooldown');
              }, 2000);
            }
            const input = widget.querySelector('.phone-display');
            if (input) input.value = '';
            const title = widget.querySelector('.widget-title');
            if (title) title.innerHTML = 'Phone';
            try { clearContactDisplay(); } catch(_) {}
            try { widget.classList.remove('in-call'); } catch(_) {}
          }
          
          // Force UI update to ensure button state is visible
          setInCallUI(false);
          console.debug('[Phone] DISCONNECT: UI cleanup complete, call should show as ended');
          
          // CRITICAL: Terminate any active server-side call without blocking UI
          if (window.currentServerCallSid) {
            const sidToTerminate = window.currentServerCallSid;
            window.currentServerCallSid = null;
            try {
              const base = (window.API_BASE_URL || '').replace(/\/$/, '');
              console.debug('[Phone] DISCONNECT: Terminating server call SID (non-blocking):', sidToTerminate);
              // Fire-and-forget; do not await
              fetch(`${base}/api/twilio/hangup`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid: sidToTerminate })
              }).catch(()=>{});
            } catch(_) { /* ignore */ }
          }
          
          // [REMOVED] Audio device release - was causing UI freeze on hangup
          // Browser will automatically release microphone when tab closes/refreshes
          // Trade-off: Red recording dot may linger in tab until refresh (minor UX issue vs major freeze issue)
          
          // Don't clear call context yet - keep it for proper attribution
          // Context will be cleared when call actually ends
          console.debug('[Phone] Call context preserved for attribution');
          
          console.debug('[Phone] Call cleanup complete - aggressive anti-redial protection active');
          console.debug('[Phone] Cooldown set:', { lastCallCompleted: disconnectTime, lastCalledNumber: number });
        });
        
        currentCall.on('error', (error) => {
          console.error('[Phone] Call error:', error);
          const callEndTime = Date.now();
          const duration = Math.floor((callEndTime - callStartTime) / 1000);
          
          // IMMEDIATE cleanup on error
          updateCallStatus(number, 'failed', callStartTime, duration, callId);
          currentCall = null;
          isCallInProgress = false;
          
          // Clear ALL Twilio state
          TwilioRTC.state.connection = null;
          TwilioRTC.state.pendingIncoming = null;
          
          setInCallUI(false);
          
          // Stop live timer and restore banner
          const widget = document.getElementById(WIDGET_ID);
          stopLiveCallTimer(widget);
          
          // Force UI reset
          if (widget) {
            const btn = widget.querySelector('.call-btn-start');
            if (btn) {
              btn.textContent = 'Call';
              btn.classList.remove('btn-danger');
              btn.classList.add('btn-primary');
              // Disable button briefly to prevent accidental immediate redial on error
              btn.disabled = true;
              setTimeout(() => { btn.disabled = false; }, 2000);
            }
            const input = widget.querySelector('.phone-display');
            if (input) input.value = '';
            const title = widget.querySelector('.widget-title');
            if (title) title.innerHTML = 'Phone';
            try { clearContactDisplay(); } catch(_) {}
          }
          
          // Clear context on error too
          currentCallContext = {
            number: '',
            name: '',
            company: '',
            accountId: null,
            accountName: null,
            contactId: null,
            contactName: null,
            city: '',
            state: '',
            domain: '',
            isCompanyPhone: false,
            isActive: false
          };
          
          // Set reasonable cooldown after error
          lastCallCompleted = Date.now();
          lastCalledNumber = number;
          autoTriggerBlockUntil = Date.now() + 3000; // Reduced to 3 seconds
          
          // Release audio devices
          if (TwilioRTC.state.device && TwilioRTC.state.device.audio) {
            try {
              TwilioRTC.state.device.audio.unsetInputDevice();
              console.debug('[Phone] Audio input device released after error');
            } catch (e) {
              console.warn('[Phone] Failed to release audio input device after error:', e);
            }
          }
        });
        
        return currentCall;
        
      } catch (error) {
        console.error('[Phone] Browser call failed:', error);
        setInCallUI(false);
        throw error;
      }
    }
    async function fallbackServerCall(number) {
      // Determine website mode: if no API base configured, treat as marketing site
      const isMainWebsite = !window.API_BASE_URL;

      if (isMainWebsite) {
        // On main website - actually initiate the call
        console.debug('[Phone] Main website call - initiating call to:', number);
        
        try {
          // Create a tel: link and simulate clicking it to trigger the phone system
          const telLink = document.createElement('a');
          telLink.href = `tel:${number}`;
          telLink.style.display = 'none';
          document.body.appendChild(telLink);
          telLink.click();
          document.body.removeChild(telLink);
          
          // Show success message
          try { window.crm?.showToast && window.crm.showToast('Call initiated - check your phone/dialer'); } catch(_) {}
          
          // Optional: Track the call attempt (for analytics)
          if (typeof gtag !== 'undefined') {
            gtag('event', 'phone_call', {
              'phone_number': number,
              'source': 'phone_widget'
            });
          }
          
          return { success: true, message: 'Call initiated via tel: link' };
        } catch (error) {
          console.error('[Phone] Error creating tel link:', error);
          try { window.crm?.showToast && window.crm.showToast('Call initiation failed'); } catch(_) {}
          throw error;
        }
      } else {
        // On CRM - use Twilio API to call your phone and connect to target
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        const callData = {
          from: BUSINESS_PHONE, // Your business number
          to: number, // Target number to call
          agent_phone: '+19728342317' // Your personal phone that will ring first
        };
        
        console.debug('[Phone] Making CRM API call:', callData);
        
        const r = await fetch(`${base}/api/twilio/call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(callData)
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
        
        // Store the server call SID for potential termination
        if (data?.callSid) {
          window.currentServerCallSid = data.callSid;
          console.debug('[Phone] Server call initiated with SID:', data.callSid);
        }
        
        // Show appropriate message based on call context
        const contactName = currentCallContext.name;
        const message = contactName ? 
          `Calling ${contactName} - your phone will ring first` : 
          'Your phone will ring first, then we\'ll connect the call';
        
        try { window.crm?.showToast && window.crm.showToast(message); } catch(_) {}
        return data;
      }
    }
    
    async function logCall(phoneNumber, callType, callId = null, fromNumber = null) {
      try {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        if (!base) return;
        
        const callSid = callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();
        
        // For incoming calls, use the caller's number as 'from' and business number as 'to'
        // For outgoing calls, use business number as 'from' and target number as 'to'
        const isIncoming = callType === 'incoming';
        const biz = getBusinessNumberE164();
        const callFrom = isIncoming ? (fromNumber || phoneNumber) : biz;
        const callTo = isIncoming ? biz : phoneNumber;
        
        const response = await fetch(`${base}/api/calls`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            callSid: callSid,
            to: callTo,
            from: callFrom,
            status: 'initiated',
            callType: callType,
            callTime: timestamp,
            timestamp: timestamp,
            // include call context (avoid stale fallback name in company-call mode)
            accountId: currentCallContext.accountId || null,
            accountName: currentCallContext.accountName || currentCallContext.company || null,
            contactId: currentCallContext.contactId || null,
            contactName: (currentCallContext.isCompanyPhone ? null : (currentCallContext.contactName || null)),
            source: 'phone-widget',
            targetPhone: String(phoneNumber || '').replace(/\D/g, '').slice(-10),
            businessPhone: biz
          })
        });
        
        const data = await response.json();
        return data.call?.id || callSid; // Return call ID for tracking
      } catch (error) {
        console.error('[Phone] Failed to log call:', error);
        return null;
      }
    }
    
    // Debounce call status updates to prevent UI stuttering
    let statusUpdateTimeout = null;
    const debouncedStatusUpdates = new Map();
    
    // [OPTIMIZATION] Made non-async to prevent any blocking - all operations are fire-and-forget
    function updateCallStatus(phoneNumber, status, startTime, duration = 0, callId = null, fromNumber = null, callType = 'outgoing') {
      try {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        if (!base) return;
        
        // Debounce rapid status updates for the same call
        const callKey = `${phoneNumber}_${callId || startTime}`;
        const now = Date.now();
        const lastUpdate = debouncedStatusUpdates.get(callKey) || 0;
        
        // Skip updates that are too frequent (less than 500ms apart)
        if (now - lastUpdate < 500 && status !== 'completed' && status !== 'failed') {
          return;
        }
        
        debouncedStatusUpdates.set(callKey, now);
        
        const callSid = callId || `call_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date(startTime).toISOString();
        
        // For incoming calls, use the caller's number as 'from' and business number as 'to'
        // For outgoing calls, use business number as 'from' and target number as 'to'
        const isIncoming = callType === 'incoming';
        const biz = getBusinessNumberE164();
        const callFrom = isIncoming ? (fromNumber || phoneNumber) : biz;
        const callTo = isIncoming ? biz : phoneNumber;
        
        const payload = {
          callSid: callSid,
          to: callTo,
          from: callFrom,
          status: status,
          duration: duration,
          durationSec: duration,
          callTime: timestamp,
          timestamp: timestamp,
          // include call context (avoid stale fallback name in company-call mode)
          accountId: currentCallContext.accountId || null,
          accountName: currentCallContext.accountName || currentCallContext.company || null,
          contactId: currentCallContext.contactId || null,
          contactName: (currentCallContext.isCompanyPhone ? null : (currentCallContext.contactName || null)),
          source: 'phone-widget',
          targetPhone: String(phoneNumber || '').replace(/\D/g, '').slice(-10),
          businessPhone: biz
        };

        // [OPTIMIZATION] Only write to /api/calls on 'completed' status to reduce Firestore commits
        // Twilio status webhooks already track call lifecycle (initiated, ringing, in-progress, etc.)
        // Frontend only needs to write final call record with CRM context (accountId, contactId, etc.)
        if (status === 'completed') {
          phoneLog('[Phone] POST /api/calls (completed status only) - FIRE AND FORGET', { base, payload });

          // [CRITICAL FIX] Fire-and-forget to prevent UI freeze/blocking
          // Don't await - let it run in background so user can navigate immediately
          fetch(`${base}/api/calls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(resp => resp.json()).then(respJson => {
            phoneLog('[Phone] /api/calls response (background)', { status: 'success', body: respJson });
          }).catch(err => {
            phoneLog('[Phone] /api/calls error (non-blocking)', err);
          });
        } else {
          phoneLog('[Phone] Skipping /api/calls POST (status:', status, ') - only writes on completed to reduce Firestore costs');
        }
        
        // Trigger refresh for Account Detail and Contact Detail pages when call completes
        if (status === 'completed') {
          try {
            // Dispatch custom event to trigger recent calls refresh on detail pages
            document.dispatchEvent(new CustomEvent('pc:call-completed', { 
              detail: { 
                callSid: callSid,
                accountId: currentCallContext.accountId,
                contactId: currentCallContext.contactId,
                phoneNumber: phoneNumber
              } 
            }));
            phoneLog('[Phone] Dispatched pc:call-completed event for page refresh');
          } catch(_) {}
        }
        
        // [OPTIMIZATION] Refresh calls page only if visible - use same debounce strategy
        const isCallsPageActive = () => {
          try {
            const el = document.getElementById('calls-page');
            if (!el) return false;
            if (typeof el.matches === 'function' && el.matches('.active, .is-active, :not([hidden])')) return true;
            return el.offsetParent !== null; // visible in layout
          } catch(_) { return false; }
        };
        const refreshCallsIfActive = (label) => {
          if (isCallInProgress) return; // do not refresh during live call
          if (!isCallsPageActive()) {
            phoneLog(`[Phone] Skipping calls page refresh - not visible`);
            return;
          }
          if (window.callsModule && typeof window.callsModule.loadData === 'function') {
            // Schedule in next tick to avoid blocking current execution
            setTimeout(() => {
              try { window.callsModule.loadData(); } catch(_) {}
              phoneLog(`[Phone] Refreshed calls page data (${label})`);
            }, 0);
          }
        };
        // Debounced refresh with 1.5s delay (same as detail pages)
        setTimeout(() => refreshCallsIfActive('t+1.5s'), 1500);
        
      } catch (error) {
        console.error('[Phone] Failed to update call status:', error);
      }
    }
    function setInCallUI(inCall) {
      if (!callBtn) return;
      // Do not toggle in-call here; handled by setContactDisplay() once details are loaded
      if (inCall) {
        callBtn.textContent = 'Hang Up';
        callBtn.classList.remove('btn-primary');
        callBtn.classList.add('btn-danger');
      } else {
        callBtn.textContent = 'Call';
        callBtn.classList.remove('btn-danger');
        callBtn.classList.add('btn-primary');
      }
    }
    if (callBtn) callBtn.addEventListener('click', async () => {
      // If there is a pending incoming call (ringing) and not yet connected, treat this button as Decline/Hang Up
      if (TwilioRTC.state && TwilioRTC.state.pendingIncoming && !isCallInProgress) {
        try {
          console.debug('[Phone] Declining pending incoming call');
          TwilioRTC.state.pendingIncoming.reject();
        } catch(_) {}
        TwilioRTC.state.pendingIncoming = null;
        isCallInProgress = false;
        setInCallUI(false);
        stopLiveCallTimer(card);
        lastCallCompleted = Date.now();
        autoTriggerBlockUntil = Date.now() + 3000; // Reduced to 3 seconds
        // Reset title and clear input
        const title = card.querySelector('.widget-title');
        if (title) title.innerHTML = 'Phone';
        if (input) input.value = '';
        try { clearContactDisplay(); } catch(_) {}
        return;
      }

      // If already in a call (currentCall exists OR isCallInProgress OR device connection), hangup
      if (currentCall || isCallInProgress || TwilioRTC.state?.connection) {
        console.debug('[Phone] Hanging up active call - currentCall:', !!currentCall, 'isCallInProgress:', isCallInProgress, 'deviceConnection:', !!TwilioRTC.state?.connection);
        
        // IMMEDIATE state clearing to prevent double-clicks and ensure proper hangup
        const wasInCall = isCallInProgress;
        isCallInProgress = false;
        
        // Try to disconnect all possible connections with retry logic
        const disconnectPromises = [];
        
        try {
          // Disconnect outbound call
          if (currentCall) {
            disconnectPromises.push(
              new Promise((resolve) => {
                try {
                  currentCall.disconnect();
                  console.debug('[Phone] Manual hangup - disconnected outbound call');
                  resolve();
                } catch(e) {
                  console.warn('[Phone] Error disconnecting outbound call:', e);
                  resolve();
                }
              })
            );
          }
          
          // Disconnect inbound call (most important for your issue)
          if (TwilioRTC.state?.connection) {
            disconnectPromises.push(
              new Promise((resolve) => {
                try {
                  TwilioRTC.state.connection.disconnect();
                  console.debug('[Phone] Manual hangup - disconnected inbound call');
                  resolve();
                } catch(e) {
                  console.warn('[Phone] Error disconnecting inbound call:', e);
                  resolve();
                }
              })
            );
          }
          
          // Also try pending incoming
          if (TwilioRTC.state?.pendingIncoming) {
            disconnectPromises.push(
              new Promise((resolve) => {
                try {
                  TwilioRTC.state.pendingIncoming.reject();
                  console.debug('[Phone] Manual hangup - rejected pending incoming');
                  resolve();
                } catch(e) {
                  console.warn('[Phone] Error rejecting pending incoming:', e);
                  resolve();
                }
              })
            );
          }
          
          // Wait for all disconnections to complete (with timeout)
          await Promise.race([
            Promise.all(disconnectPromises),
            new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout
          ]);
          
        } catch(e) {
          console.error('[Phone] Error during manual hangup:', e);
        }
        
        // Force clear ALL state immediately
        currentCall = null;
        isCallInProgress = false;
        TwilioRTC.state.connection = null;
        TwilioRTC.state.pendingIncoming = null;
        
        // Clear UI state (first remove contact display with a synchronized animation,
        // then stop the live timer to avoid double height animations)
        setInCallUI(false);
        try { clearContactDisplay(); } catch(_) {}
        stopLiveCallTimer(card);
        
        // Clear context on manual hangup but preserve important associations for recent calls
        currentCallContext = {
          number: '',
          name: '',
          isActive: false,
          // Preserve contact/account associations for recent calls display
          contactId: currentCallContext?.contactId || null,
          contactName: currentCallContext?.contactName || null,
          accountId: currentCallContext?.accountId || null,
          accountName: currentCallContext?.accountName || null,
          company: currentCallContext?.company || '',
          city: currentCallContext?.city || '',
          state: currentCallContext?.state || '',
          domain: currentCallContext?.domain || '',
          isCompanyPhone: currentCallContext?.isCompanyPhone || false
        };
        
        // Set reasonable cooldown on manual hangup
        lastCallCompleted = Date.now();
        autoTriggerBlockUntil = Date.now() + 3000; // Reduced to 3 seconds
        
        // Release audio devices to ensure proper cleanup
        if (TwilioRTC.state.device && TwilioRTC.state.device.audio) {
          try {
            await TwilioRTC.state.device.audio.unsetInputDevice();
            console.debug('[Phone] Audio input device released after manual hangup');
          } catch (e) {
            console.warn('[Phone] Failed to release audio input device:', e);
          }
        }
        
        // Call ended
        
        // Clear the input and reset title
        if (input) input.value = '';
        const title = card.querySelector('.widget-title');
        if (title) title.innerHTML = 'Phone';
        try { clearContactDisplay(); } catch(_) {}
        try { const c = document.getElementById(WIDGET_ID); if (c) c.classList.remove('in-call'); } catch(_) {}
        
        return; // CRITICAL: Exit here, do NOT continue to dialing logic
      }

      const raw = (input && input.value || '').trim();
      if (!raw) {
        try { window.crm?.showToast && window.crm.showToast('Enter a number to call'); } catch (_) {}
        return;
      }
      const normalized = normalizeDialedNumber(raw);
      if (!normalized.ok) {
        try { window.crm?.showToast && window.crm.showToast('Invalid number. Use 10-digit US or +countrycode number.'); } catch (_) {}
        return;
      }
      // Immediately switch button to Hang Up and mark call-in-progress so user can cancel immediately
      isCallInProgress = true;
      setInCallUI(true);
      try { if (callBtn) callBtn.disabled = false; } catch(_) {}
      // update UI with normalized value and enrich title from People data
      if (input) { 
        // Show the full number with extension in the input field
        const displayValue = normalized.extension ? `${normalized.value} ext. ${normalized.extension}` : normalized.value;
        input.value = displayValue;
      }
      enrichTitleFromPhone(normalized.value);
      
      // Check if this is a manual call (no existing context) or a click-to-call (has context)
      // IMPORTANT: Only consider it existing context if it's ACTIVE AND matches the current number
      // If the context is from a different number, treat it as stale and clear it
      const hasExistingContext = !!(currentCallContext && currentCallContext.isActive && 
        currentCallContext.number === normalized.value && (
        currentCallContext.accountId || 
        currentCallContext.contactId || 
        currentCallContext.company || 
        currentCallContext.name
      ));
      
      // If context exists but is for a different number, clear it first
      if (currentCallContext && currentCallContext.isActive && currentCallContext.number !== normalized.value) {
        console.debug('[Phone] Clearing context for different number - old:', currentCallContext.number, 'new:', normalized.value);
        currentCallContext = {
          number: '',
          name: '',
          company: '',
          accountId: null,
          accountName: null,
          contactId: null,
          contactName: '',
          city: '',
          state: '',
          domain: '',
          logoUrl: '',
          isCompanyPhone: false,
          isActive: false
        };
      }
      
      // Only resolve metadata if this is truly a manual entry (no active context from click-to-call)
      if (!hasExistingContext) {
        try {
          console.debug('[Phone] Manual call - resolving phone metadata for:', normalized.value);
          const freshMeta = await resolvePhoneMeta(normalized.value).catch(() => ({}));
          
          // Update current call context with fresh data from CRM/Twilio
          currentCallContext = {
            number: normalized.value,
            name: freshMeta.name || normalized.value,
            company: freshMeta.account || '',
            accountId: freshMeta.accountId || null,
            accountName: freshMeta.account || null,
            contactId: freshMeta.contactId || null,
            contactName: freshMeta.name || '',
            city: freshMeta.city || '',
            state: freshMeta.state || '',
            domain: freshMeta.domain || '',
            logoUrl: freshMeta.logoUrl || '',
            isCompanyPhone: !!(freshMeta.account && !freshMeta.contactId),
            isActive: true
          };
          
          console.debug('[Phone] Manual call context resolved:', currentCallContext);
          
          // Build meta object for setContactDisplay (expects meta.account, not meta.company)
          const displayMeta = {
            name: freshMeta.name || '',
            account: freshMeta.account || '',
            company: freshMeta.account || '',
            title: freshMeta.title || '',
            city: freshMeta.city || '',
            state: freshMeta.state || '',
            domain: freshMeta.domain || '',
            logoUrl: freshMeta.logoUrl || ''
          };
          setContactDisplay(displayMeta, normalized.value);
        } catch(metaError) {
          console.warn('[Phone] Failed to resolve phone metadata:', metaError);
          // Fallback to minimal context if resolution fails
          const earlyMeta = { 
            name: normalized.value,
            account: '', 
            domain: '',
            city: '',
            state: '',
            isCompanyPhone: false
          };
          setContactDisplay(earlyMeta, normalized.value);
        }
      } else {
        // Click-to-call scenario - use existing context
        console.debug('[Phone] Click-to-call detected - using existing context:', currentCallContext);
      try {
        const earlyMeta = { 
          name: (currentCallContext && currentCallContext.name) || '', 
          account: (currentCallContext && currentCallContext.company) || '', 
          domain: (currentCallContext && currentCallContext.domain) || '',
          city: (currentCallContext && currentCallContext.city) || '',
          state: (currentCallContext && currentCallContext.state) || '',
            logoUrl: (currentCallContext && currentCallContext.logoUrl) || '',
          isCompanyPhone: !!(currentCallContext && currentCallContext.isCompanyPhone)
        };
        setContactDisplay(earlyMeta, normalized.value);
      } catch(_) {}
      }
      // Immediately switch button to Hang Up and mark call-in-progress so user can cancel immediately
      isCallInProgress = true;
      setInCallUI(true);
      try {
        // Determine website mode: if no API base configured, treat as marketing site
        const isMainWebsite = !window.API_BASE_URL; // No API configured means main website
        
        if (isMainWebsite) {
          // On main website - skip browser calling and go straight to fallback
          console.debug('[Phone] On main website, using fallback call directly');
          try { window.crm?.showToast && window.crm.showToast(`Calling ${normalized.value}...`); } catch (_) {}
          try {
            await fallbackServerCall(normalized.value);
          } catch (e2) {
            console.error('[Phone] Fallback call failed:', e2?.message || e2);
            try { window.crm?.showToast && window.crm.showToast(`Call failed: ${e2?.message || 'Error'}`); } catch (_) {}
          }
          return;
        }
        
        // Check microphone permission before attempting browser call (CRM only)
        // This will now trigger the permission dialog since it's in response to user click
        let hasMicPermission = false;
        try {
          updateMicrophoneStatusUI(card, 'checking');
          hasMicPermission = await checkMicrophonePermission(card);
          updateMicrophoneStatusUI(card, hasMicPermission ? 'granted' : 'denied');
          console.debug('[Phone] Microphone permission check result:', hasMicPermission);
        } catch (permError) {
          console.warn('[Phone] Permission check failed, using fallback:', permError?.message || permError);
          updateMicrophoneStatusUI(card, 'error');
          hasMicPermission = false;
        }
        
        // If user already canceled during permission prompt, abort
        if (!isCallInProgress) {
          console.debug('[Phone] Aborting dial: user canceled before placement');
          return;
        }
        // Try browser calling first if microphone permission is available
        if (hasMicPermission) {
          // Calling from browser
          try {
            // If user canceled right before placing call, abort gracefully
            if (!isCallInProgress) {
              console.debug('[Phone] Aborting: user canceled after permission but before placing call');
              return;
            }
            const call = await placeBrowserCall(normalized.value, normalized.extension);
            console.debug('[Phone] Browser call successful, no fallback needed');
            // Note: initial call logging is already done in placeBrowserCall()
            return; // Exit early - browser call succeeded
          } catch (e) {
            // Fallback to server-initiated PSTN flow
            console.warn('[Phone] Browser call failed, falling back to server call:', e?.message || e);
            try { window.crm?.showToast && window.crm.showToast(`Browser call failed. Falling back...`); } catch(_) {}
            try {
              await fallbackServerCall(normalized.value);
            } catch (e2) {
              console.error('[Phone] Fallback call also failed:', e2?.message || e2);
              try { window.crm?.showToast && window.crm.showToast(`Call failed: ${e2?.message || 'Error'}`); } catch (_) {}
            }
          }
        } else {
          // Using server-based calling (browser calling disabled)
          if (!isCallInProgress) {
            console.debug('[Phone] Aborting: user canceled before server call');
            return;
          }
          console.debug('[Phone] Using server-based calling');
          try { window.crm?.showToast && window.crm.showToast(`Calling ${normalized.value} - your phone will ring first...`); } catch (_) {}
          try {
            await fallbackServerCall(normalized.value);
          } catch (e2) {
            console.error('[Phone] Fallback call failed:', e2?.message || e2);
            try { window.crm?.showToast && window.crm.showToast(`Call failed: ${e2?.message || 'Error'}`); } catch (_) {}
          }
        }
      } catch (generalError) {
        console.error('[Phone] General call error:', generalError?.message || generalError);
        try { window.crm?.showToast && window.crm.showToast(`Call error: ${generalError?.message || 'Unknown error'}`); } catch (_) {}
      }
    });
    // Backspace button removed
    const clearBtn = card.querySelector('.clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    // Close button
    const closeBtn = card.querySelector('.phone-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closePhoneWidget());

    // Microphone status click handler for retry
    const micStatus = card.querySelector('.mic-status');
    if (micStatus) {
      const handleMicRetry = async () => {
        resetMicrophonePermission();
        updateMicrophoneStatusUI(card, 'checking');
        adjustHeightIfAnimating(card);
        try {
          const hasPermission = await checkMicrophonePermission(card);
          updateMicrophoneStatusUI(card, hasPermission ? 'granted' : 'denied');
          adjustHeightIfAnimating(card);
        } catch (error) {
          console.warn('[Phone] Error retrying mic permission:', error);
          updateMicrophoneStatusUI(card, 'error');
          adjustHeightIfAnimating(card);
        }
      };
      
      micStatus.addEventListener('click', handleMicRetry);
      micStatus.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleMicRetry();
        }
      });
    }

    // Keyboard input support: digits, *, #, and letter->T9 digit mapping
    card.addEventListener('keydown', (e) => {
      // If user is typing in the mini-scripts search, don't intercept keys for dialpad
      try {
        const active = document.activeElement;
        if (active && active.classList && active.classList.contains('ms-input')) {
          return; // let the input handle typing
        }
      } catch(_) {}
      const { key } = e;
      // Do not intercept common shortcuts (paste/copy/select-all, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9*#]$/.test(key)) {
        if (hasActiveCall()) { sendDTMF(key); }
        else { appendChar(key); }
        e.preventDefault();
      } else if (key === 'Backspace') {
        backspace();
        e.preventDefault();
      } else if (/^[a-zA-Z]$/.test(key)) {
        const d = letterToDigit(key);
        if (d) {
          if (hasActiveCall()) { sendDTMF(d); }
          else { appendChar(d); }
          e.preventDefault();
        }
      } else if (key === 'Enter') {
        if (callBtn) callBtn.click();
        e.preventDefault();
      }
    });

    // Make the whole card focusable to receive key events, but keep input primary
    card.setAttribute('tabindex', '-1');
    setTimeout(() => { try { input && input.focus(); } catch (_) {} }, 0);

    return card;
  }

  function openPhone() {
    const content = getPanelContentEl();
    if (!content) {
      try { window.crm?.showToast && window.crm.showToast('Widget panel not found'); } catch (_) {}
      return;
    }

    // If already open, bring into view and focus instead of re-creating
    const existingCard = document.getElementById(WIDGET_ID);
    if (existingCard) {
      try { existingCard.parentElement && existingCard.parentElement.prepend(existingCard); } catch (_) {}
      try { existingCard.focus(); } catch (_) {}
      try { window.crm?.showToast && window.crm.showToast('Phone already open'); } catch (_) {}
      return;
    }

    const card = makeCard();

    // Smooth expand-in animation
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    // Insert hidden to measure natural height without flashing
    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    if (!prefersReduce) {
      // Temporarily hide but keep in flow to get accurate width/height
      card.style.visibility = 'hidden';
      const cs = window.getComputedStyle(card);
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const target = card.scrollHeight; // content + padding

      // Collapse to start state now that we've measured
      card.classList.add('phone-anim');
      card.style.overflow = 'hidden';
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
      // Reveal for the animation frame
      card.style.visibility = '';

      requestAnimationFrame(() => {
        card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
        // Animate to measured target height and original paddings
        card.style.height = target + 'px';
        card.style.paddingTop = pt + 'px';
        card.style.paddingBottom = pb + 'px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        const pending = new Set(['height', 'padding-top', 'padding-bottom']);
        let safetyTimer = null;

        const cleanup = () => {
          card.classList.remove('phone-anim');
          card.style.transition = '';
          card.style.height = '';
          card.style.overflow = '';
          card.style.opacity = '';
          card.style.transform = '';
          card.style.paddingTop = '';
          card.style.paddingBottom = '';
        };

        const onEnd = (e) => {
          if (!e) return;
          if (pending.has(e.propertyName)) pending.delete(e.propertyName);
          if (pending.size > 0) return;
          card.removeEventListener('transitionend', onEnd);
          if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
          cleanup();
        };
        card.addEventListener('transitionend', onEnd);

        // Safety: if transitionend doesn't fire (edge cases), force cleanup
        safetyTimer = setTimeout(() => {
          card.removeEventListener('transitionend', onEnd);
          cleanup();
        }, 900);

        // Re-measure a few times as content stabilizes (fonts, mic text, etc.)
        const bumps = [120, 260, 420];
        bumps.forEach(ms => setTimeout(() => {
          try {
            const h = parseFloat(card.style.height) || 0;
            const needed = card.scrollHeight;
            if (needed > h) card.style.height = needed + 'px';
          } catch(_) {}
        }, ms));
      });
    }

    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }

    // Automatically request microphone permission on open.
    // If permission was already granted before, checkMicrophonePermission will short-circuit.
    setTimeout(async () => {
      try {
        updateMicrophoneStatusUI(card, 'checking');
        const granted = await checkMicrophonePermission(card);
        updateMicrophoneStatusUI(card, granted ? 'granted' : 'denied');
      } catch (e) {
        console.warn('[Phone] Mic permission on-open check failed:', e?.message || e);
        updateMicrophoneStatusUI(card, 'error');
      } finally {
        adjustHeightIfAnimating(card);
      }
    }, 50);

    // Phone widget opened successfully
  }

  // Track last call completion to prevent auto-callbacks
  let lastCallCompleted = 0;
  let lastCalledNumber = '';
  let isCallInProgress = false;
  const CALLBACK_COOLDOWN = 8000; // 8 seconds cooldown
  const SAME_NUMBER_COOLDOWN = 5000; // 5 seconds for same number
  // Hard global guard to suppress any auto-dial after a call ends unless there is a fresh user click
  let autoTriggerBlockUntil = 0; // ms epoch
  
  // Track user typing activity in phone widget
  let lastUserTypingTime = 0;
  const USER_TYPING_COOLDOWN = 2000; // 2 seconds after user stops typing
  
  // Global call function for CRM integration
  window.Widgets.callNumber = function(number, contactName = '', autoTrigger = false, source = 'unknown') {
    // Add stack trace to debug who's calling this function
    phoneLog('[Phone] CALLNUMBER', { number, contactName, autoTrigger, source, isCallInProgress, lastCallCompleted, lastCalledNumber, currentCallContext });
    
    const now = Date.now();
    let contactCompany = '';

    // Do NOT auto-enrich company-mode calls; keep attribution strictly from page context
    try {
      const isCompany = !!(currentCallContext && currentCallContext.isCompanyPhone);
      // REMOVED: Contact name lookup from phone number
      // This was causing contact company info to leak into account detail phone calls
    } catch (_) { /* non-fatal */ }
    
    // Allow click-to-call to bypass most restrictions (user-initiated action)
    const isClickToCall = (source === 'click-to-call');

    const lastClickTs = (window.Widgets && window.Widgets._lastClickToCallAt) || 0;
    const isFreshClick = isClickToCall && (now - lastClickTs) <= 1500;

    // Enforce: only click-to-call with a fresh user gesture may auto-trigger
    if (autoTrigger && !isClickToCall) {
      console.warn('[Phone] FORCING autoTrigger=false for non click-to-call source', { source });
      console.debug('[Phone] Non-click autoTrigger attempt stack:', stack?.split('\n').slice(0, 8).join('\n'));
      autoTrigger = false;
    }

    // Global hard block unless there is a fresh explicit click
    if (now < autoTriggerBlockUntil && !isFreshClick) {
      console.warn('[Phone] Global auto-trigger block active. Blocking callNumber invoke.', { until: new Date(autoTriggerBlockUntil).toISOString() });
      return false;
    }

    // If this is click-to-call, require a very fresh user gesture timestamp
    if (isClickToCall) {
      const lastClick = (window.Widgets && window.Widgets._lastClickToCallAt) || 0;
      if (!lastClick || (now - lastClick) > 1500) {
        console.warn('[Phone] Stale or missing click gesture - disabling autoTrigger for click-to-call');
        autoTrigger = false;
      }
    }
    
    // Block ALL auto-triggers if a call is currently in progress (except click-to-call)
    if (isCallInProgress && !isClickToCall) {
      console.warn('[Phone] BLOCKED: Call already in progress (non-click-to-call)');
      autoTrigger = false;
    }
    
    // Aggressive cooldown check - if we just completed a call, block auto-triggers (but allow click-to-call)
    if (now - lastCallCompleted < CALLBACK_COOLDOWN && !isClickToCall) {
      console.warn('[Phone] BLOCKED: Auto-call blocked due to recent call completion cooldown (non-click-to-call)');
      console.warn('[Phone] Time since last call:', now - lastCallCompleted, 'ms, cooldown:', CALLBACK_COOLDOWN, 'ms');
      autoTrigger = false;
    }
    
    // Extra protection for the same number (but allow click-to-call after shorter cooldown)
    const sameNumberCooldown = isClickToCall ? 3000 : SAME_NUMBER_COOLDOWN; // 3s for clicks, 15s for auto
    if (lastCalledNumber === number && now - lastCallCompleted < sameNumberCooldown) {
      if (isClickToCall) {
        console.warn('[Phone] BLOCKED: Same number clicked too recently (3s cooldown for clicks)');
      } else {
        console.warn('[Phone] BLOCKED: Same number called too recently (15s cooldown for auto)');
      }
      console.warn('[Phone] Last called number:', lastCalledNumber, 'Current number:', number);
      autoTrigger = false;
    }
    
    // Don't auto-trigger if the same number/contact is already in context (but allow click-to-call)
    if (currentCallContext.number === number && currentCallContext.name === contactName && currentCallContext.isActive && !isClickToCall) {
      console.warn('[Phone] BLOCKED: Same number/contact already active in context (non-click-to-call)');
      autoTrigger = false;
    }
    
    // Extra protection: Don't auto-trigger if user has manually entered a different number (but allow click-to-call)
    const widget = document.getElementById(WIDGET_ID);
    if (widget && autoTrigger && !isClickToCall) {
      const input = widget.querySelector('.phone-display');
      if (input && input.value && input.value.trim() !== '' && input.value.replace(/\D/g, '') !== number.replace(/\D/g, '')) {
        console.warn('[Phone] BLOCKED: User has manually entered a different number:', input.value, 'vs', number);
        autoTrigger = false;
      }
    }
    
    // ABSOLUTE BLOCK: Only applies to non-click-to-call to prevent loops
    if (!isClickToCall && autoTrigger && lastCalledNumber === number && now - lastCallCompleted < 30000) {
      console.error('[Phone] ABSOLUTE BLOCK: Preventing potential callback loop for number:', number);
      console.error('[Phone] Time since last call to this number:', now - lastCallCompleted, 'ms');
      return false; // Return early, don't even open the widget
    }
    
    // EXTRA PROTECTION: Block auto-trigger if we just disconnected ANY call recently (but allow click-to-call)
    if (autoTrigger && now - lastCallCompleted < 5000 && !isClickToCall) {
      console.error('[Phone] EXTRA PROTECTION: Blocking auto-trigger due to recent call disconnect (non-click-to-call)');
      console.error('[Phone] Time since last disconnect:', now - lastCallCompleted, 'ms');
      autoTrigger = false; // Don't return false, just disable auto-trigger
    }
    
    // CRITICAL: Block auto-trigger if user has been actively typing recently (but allow click-to-call)
    if (autoTrigger && now - lastUserTypingTime < USER_TYPING_COOLDOWN && !isClickToCall) {
      console.error('[Phone] BLOCKED: User has been typing recently - preventing auto-trigger (non-click-to-call)');
      console.error('[Phone] Time since last typing:', now - lastUserTypingTime, 'ms, cooldown:', USER_TYPING_COOLDOWN, 'ms');
      autoTrigger = false;
    }
    
    // Additional safety: never auto-trigger if called within 2 seconds of previous call (but allow click-to-call)
    const timeSinceLastCall = now - (window.lastCallNumberTime || 0);
    if (autoTrigger && timeSinceLastCall < 2000 && !isClickToCall) {
      console.warn('[Phone] BLOCKED: Called too quickly after previous callNumber call (non-click-to-call)');
      autoTrigger = false;
    }
    window.lastCallNumberTime = now;
    
    // Overwrite context deterministically based on explicit page context
    // Infer company-mode if explicit flag or account context is present (and no contact)
    const hasAccountCtx = !!(currentCallContext && (currentCallContext.accountId || currentCallContext.accountName || currentCallContext.company));
    const hasContactCtx = !!(currentCallContext && (currentCallContext.contactId || currentCallContext.contactName));
    const isCompanyCall = !!(currentCallContext && (currentCallContext.isCompanyPhone || (hasAccountCtx && !hasContactCtx)));
    const nextContext = {
      number: number,
      name: isCompanyCall ? (currentCallContext.company || currentCallContext.accountName || '') : (contactName || currentCallContext.name || ''),
      company: currentCallContext.company || currentCallContext.accountName || contactCompany || '',
      accountId: currentCallContext.accountId || null,
      accountName: currentCallContext.accountName || null,
      contactId: isCompanyCall ? null : (currentCallContext.contactId || null),
      contactName: isCompanyCall ? '' : (contactName || currentCallContext.contactName || ''),
      city: currentCallContext.city || '',
      state: currentCallContext.state || '',
      domain: currentCallContext.domain || '',
      logoUrl: currentCallContext.logoUrl || '',
      isCompanyPhone: isCompanyCall,
      isActive: !!autoTrigger || !!currentCallContext.isActive
    };
    currentCallContext = nextContext;
    
    console.debug('[Phone Widget] Call context set in callNumber:', currentCallContext);
    console.debug('[Phone Widget] Attribution snapshot:', {
      accountId: currentCallContext.accountId,
      accountName: currentCallContext.accountName,
      contactId: currentCallContext.contactId,
      contactName: currentCallContext.contactName
    });
    
    // Update the widget display with the new context
    try {
      setContactDisplay(currentCallContext, number);
    } catch (e) {
      console.warn('[Phone Widget] Failed to update contact display:', e);
    }
    
    // Open phone widget if not already open
    if (!document.getElementById(WIDGET_ID)) {
      openPhone();
    }
    
    // Populate number immediately and optionally auto-trigger call within user gesture
    const card = document.getElementById(WIDGET_ID);
    if (card) {
      const input = card.querySelector('.phone-display');
      if (input) {
        input.value = number;
      }
      // Do not modify header title; in-call contact info will render inside the body instead
      // Auto-trigger call only if explicitly requested and conditions are met
      // Do NOT require contactName for auto-trigger (some contexts may not provide it)
      if (number && autoTrigger) {
        const callBtn = card.querySelector('.call-btn-start');
        if (callBtn && !isCallInProgress) {
          // Final safety check before auto-triggering for non-click-to-call only
          const finalCheck = now - lastCallCompleted;
          if (!isClickToCall && finalCheck < CALLBACK_COOLDOWN) {
            console.error('[Phone] FINAL SAFETY BLOCK: Refusing auto-trigger due to recent call (non-click-to-call)');
            console.error('[Phone] Time since last call:', finalCheck, 'ms, required:', CALLBACK_COOLDOWN, 'ms');
            return false;
          }
          console.debug('[Phone] Auto-triggering call');
          // Important: Do NOT pre-set isCallInProgress here. Doing so causes the
          // call button's click handler to interpret this as an active call and
          // immediately execute the hangup path. We only set isCallInProgress
          // upon successful connection (see placeBrowserCall 'accept' handler).
          // Click immediately to preserve user gesture for mic permission
          callBtn.click();
        } else {
          console.warn('[Phone] Auto-trigger blocked - call already in progress or button not found');
        }
      } else {
        console.debug('[Phone] Not auto-triggering call - user must click Call button');
      }
    }
    
    return true;
  };

  // Stereo/Mono toggle state
  let preferStereo = true;

  // Patch UI: add a mono/stereo toggle to the left of the call on/off button if present
  try {
    const card = document.getElementById(WIDGET_ID) || document.body;
    const ensureToggle = () => {
      const widget = document.getElementById(WIDGET_ID);
      if (!widget) return;
      const footer = widget.querySelector('.phone-footer') || widget;
      if (footer && !footer.querySelector('.stereo-toggle')){
        const btn = document.createElement('button');
        btn.className = 'stereo-toggle';
        btn.type = 'button';
        btn.style.marginRight = '8px';
        btn.style.height = '32px';
        btn.style.padding = '0 10px';
        btn.style.borderRadius = '8px';
        btn.style.border = '1px solid var(--border-light)';
        btn.style.background = 'var(--bg-item)';
        btn.style.color = 'var(--text-primary)';
        const label = () => `Audio: ${preferStereo ? 'Stereo' : 'Mono'}`;
        btn.textContent = label();
        btn.addEventListener('click', async () => {
          preferStereo = !preferStereo;
          btn.textContent = label();
          try {
            // Apply to device audio constraints immediately
            const device = await TwilioRTC.ensureDevice();
            if (device && device.audio && typeof device.audio.setAudioConstraints === 'function'){
              await device.audio.setAudioConstraints({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: preferStereo ? 2 : 1
              });
            }
          } catch(_) {}
        });
        // Insert before the main call button if found
        const callBtn = widget.querySelector('.call-btn-start') || footer.firstChild;
        if (callBtn && callBtn.parentNode){
          callBtn.parentNode.insertBefore(btn, callBtn);
        } else {
          footer.appendChild(btn);
        }
      }
    };
    // Try now and after slight delay (widget may render after)
    setTimeout(ensureToggle, 200);
    setTimeout(ensureToggle, 800);
  } catch(_) {}

  window.Widgets.openPhone = openPhone;
  window.Widgets.closePhone = closePhoneWidget;
  // Allow pages to set the current call context (account/contact attribution)
  window.Widgets.setCallContext = function(ctx){
    try {
      ctx = ctx || {};
      console.debug('[Phone Widget] Setting call context:', ctx);
      
      // Clear previous context first to prevent stale data
      currentCallContext.accountId = null;
      currentCallContext.accountName = null;
      currentCallContext.contactId = null;
      currentCallContext.contactName = null;
      currentCallContext.company = '';
      currentCallContext.name = '';
      currentCallContext.city = '';
      currentCallContext.state = '';
      currentCallContext.domain = '';
      currentCallContext.logoUrl = '';
      currentCallContext.isCompanyPhone = false;
      currentCallContext.suggestedContactId = null;
      currentCallContext.suggestedContactName = '';
      
      // Set new context
      currentCallContext.accountId = ctx.accountId || null;
      currentCallContext.accountName = ctx.accountName || null;
      currentCallContext.contactId = ctx.contactId || null;
      currentCallContext.contactName = ctx.contactName || null;
      if (ctx.company) currentCallContext.company = ctx.company;
      if (ctx.name) currentCallContext.name = ctx.name;
      if (ctx.city) currentCallContext.city = ctx.city;
      if (ctx.state) currentCallContext.state = ctx.state;
      if (ctx.domain) currentCallContext.domain = ctx.domain;
      if (ctx.logoUrl) currentCallContext.logoUrl = ctx.logoUrl;
      if (ctx.isCompanyPhone !== undefined) currentCallContext.isCompanyPhone = ctx.isCompanyPhone;
      if (ctx.suggestedContactId) currentCallContext.suggestedContactId = ctx.suggestedContactId;
      if (ctx.suggestedContactName) currentCallContext.suggestedContactName = ctx.suggestedContactName;
      
      console.debug('[Phone Widget] Call context updated:', currentCallContext);
      console.log('[Phone Widget][DEBUG] setCallContext called with:', {
        input: ctx,
        result: currentCallContext,
        nameField: currentCallContext.name,
        contactNameField: currentCallContext.contactName,
        companyField: currentCallContext.company
      });
    } catch(_) {}
  };
  window.Widgets.isPhoneOpen = function () { return !!document.getElementById(WIDGET_ID); };
  window.Widgets.resetMicrophonePermission = resetMicrophonePermission;
  
  // Expose for console diagnostics
  try { window.TwilioRTC = TwilioRTC; } catch(_) {}

  // Background: register Twilio Device only when needed (not in a loop)
  // This prevents the 800ms loop that was causing browser stuttering
  try {
    if (window.API_BASE_URL) {
      // Only initialize device once on page load, not continuously
      setTimeout(() => {
        TwilioRTC.ensureDevice().catch(e => console.warn('[Phone] Background device init failed:', e?.message || e));
      }, 2000); // Increased delay to avoid blocking initial page load
    }
  } catch (_) {}

  // Console helpers for manual dialing from DevTools
  try {
    // Server-initiated call via Twilio backend
    window.callServer = async function(number) {
      const n = (number || '').trim();
      if (!n) throw new Error('Missing number');
      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base) throw new Error('Missing API_BASE_URL');
      const r = await fetch(`${base}/api/twilio/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: n, from: BUSINESS_PHONE })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
      return data;
    };

    // Attempt browser-based call using Twilio Voice SDK
    window.callBrowser = async function(number) {
      const n = (number || '').trim();
      if (!n) throw new Error('Missing number');
      const device = await TwilioRTC.ensureDevice();
      // Prefer stereo at connection level via rtcConstraints when supported
      const rtcConstraints = { audio: { channelCount: preferStereo ? 2 : 1 } };
      const connection = await device.connect({
        params: { To: n, From: BUSINESS_PHONE },
        rtcConstraints
      });
      return connection;
    };

    // Grouped helper
    window.Call = { server: window.callServer, browser: window.callBrowser, ensureDevice: TwilioRTC.ensureDevice };
    
    // Debug helper to check Twilio configuration
    window.debugTwilio = async function() {
      try {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        console.log('API Base URL:', base);
        
        // Check token endpoint
        const resp = await fetch(`${base}/api/twilio/token?identity=agent`);
        console.log('Token Response Status:', resp.status);
        
        if (resp.ok) {
          const data = await resp.json();
          console.log('Token Data:', data);
          
          if (data.token) {
            // Decode JWT to see what's in it (just the payload, not validating signature)
            try {
              const parts = data.token.split('.');
              const payload = JSON.parse(atob(parts[1]));
              console.log('JWT Payload:', payload);
            } catch (e) {
              console.warn('Could not decode JWT:', e);
            }
          }
        } else {
          const error = await resp.text();
          console.error('Token Error Response:', error);
        }
        
        // Try to create a device
        if (typeof Twilio !== 'undefined' && Twilio.Device) {
          console.log('Twilio Voice SDK available');
          try {
            const device = await TwilioRTC.ensureDevice();
            console.log('Device created:', device);
          } catch (e) {
            console.error('Device creation error:', e);
          }
        } else {
          console.error('Twilio Voice SDK not loaded');
        }
        
      } catch (error) {
        console.error('Debug error:', error);
      }
    };
  } catch (_) {}

})();
