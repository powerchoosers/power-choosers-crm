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
  
  // Get selected phone number from settings (for caller ID)
  function getSelectedPhoneNumber() {
    try {
      // First try to get from SettingsPage instance
      if (window.SettingsPage && window.SettingsPage.instance) {
        const settings = window.SettingsPage.instance.getSettings();
        if (settings) {
          // Use selectedPhoneNumber if set, otherwise fallback to first number
          let selectedNumber = settings.selectedPhoneNumber;
          if (!selectedNumber && settings.twilioNumbers && settings.twilioNumbers.length > 0) {
            selectedNumber = settings.twilioNumbers[0].number;
          }
          if (selectedNumber) {
            // Normalize to E.164 format if needed
            const normalized = normalizeToE164(selectedNumber);
            if (normalized) return normalized;
          }
        }
      }
      
      // Fallback to static method
      const settings = window.SettingsPage?.getSettings?.();
      if (settings) {
        let selectedNumber = settings.selectedPhoneNumber;
        if (!selectedNumber && settings.twilioNumbers && settings.twilioNumbers.length > 0) {
          selectedNumber = settings.twilioNumbers[0].number;
        }
        if (selectedNumber) {
          const normalized = normalizeToE164(selectedNumber);
          if (normalized) return normalized;
        }
      }
      
      // Fallback to localStorage
      const savedSettings = localStorage.getItem('crm-settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          let selectedNumber = parsed.selectedPhoneNumber;
          if (!selectedNumber && parsed.twilioNumbers && parsed.twilioNumbers.length > 0) {
            selectedNumber = parsed.twilioNumbers[0].number;
          }
          if (selectedNumber) {
            const normalized = normalizeToE164(selectedNumber);
            if (normalized) return normalized;
          }
        } catch(_) {}
      }
    } catch(_) {}
    
    // Final fallback to default
    return getBusinessNumberE164();
  }
  
  // Check if bridge to mobile is enabled (admin only feature)
  function isBridgeToMobileEnabled() {
    try {
      // First try to get from SettingsPage instance
      if (window.SettingsPage && window.SettingsPage.instance) {
        const settings = window.SettingsPage.instance.getSettings();
        if (settings && settings.bridgeToMobile === true) {
          return true;
        }
      }
      
      // Fallback to static method
      const settings = window.SettingsPage?.getSettings?.();
      if (settings && settings.bridgeToMobile === true) {
        return true;
      }
      
      // Fallback to localStorage
      const savedSettings = localStorage.getItem('crm-settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          if (parsed.bridgeToMobile === true) {
            return true;
          }
        } catch(_) {}
      }
    } catch(_) {}
    
    return false;
  }
  
  // Normalize phone number to E.164 format
  function normalizeToE164(phone) {
    if (!phone) return null;
    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 10) return `+1${cleaned}`;
    if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
    if (String(phone).startsWith('+')) return String(phone);
    return null;
  }
  
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
          const errorMsg = j?.error || j?.message || `HTTP ${resp.status}`;
          console.error('[TwilioRTC] Token fetch failed:', {
            status: resp.status,
            error: errorMsg,
            response: j
          });
          try { window.crm?.showToast && window.crm.showToast(`Token error: ${errorMsg}`); } catch(_) {}
          throw new Error(errorMsg);
        }
        
        // Validate token format (JWT should be 3 parts separated by dots)
        if (!j.token || typeof j.token !== 'string' || j.token.split('.').length !== 3) {
          console.error('[TwilioRTC] Invalid token format received');
          try { window.crm?.showToast && window.crm.showToast('Invalid token format from server'); } catch(_) {}
          throw new Error('Invalid token format');
        }

        // Initialize Twilio Device
        state.device = new Twilio.Device(j.token, {
          codecPreferences: ['opus', 'pcmu'],
          fakeLocalDTMF: true,
          enableImprovedSignalingErrorPrecision: true,
          logLevel: 'warn'
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
          // Changed from console.warn to console.debug as this is often expected noise when 'default' device isn't available
          console.debug('[TwilioRTC] Failed to set input device (expected if default not found):', e);
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
            console.error('[TwilioRTC] Token validation error:', {
              code: error.code,
              message: error.message,
              name: error.name
            });
            
            // For 20101 (AccessTokenInvalid), this usually means credentials are wrong
            if (error.code === 20101) {
              console.error('[TwilioRTC] CRITICAL: Token is invalid - check Twilio credentials in environment variables');
              try { 
                window.crm?.showToast && window.crm.showToast('Twilio authentication failed. Please check server configuration.'); 
              } catch(_) {}
            }
            
            console.debug('[TwilioRTC] Token error detected, attempting immediate refresh...');
            setTimeout(async () => {
              try {
                const refreshResp = await fetch(`${base}/api/twilio/token?identity=agent`);
                const refreshData = await refreshResp.json().catch(() => ({}));
                
                if (refreshResp.ok && refreshData?.token && state.device) {
                  // Validate new token before updating
                  if (refreshData.token.split('.').length === 3) {
                    state.device.updateToken(refreshData.token);
                    console.debug('[TwilioRTC] Emergency token refresh successful');
                  } else {
                    console.error('[TwilioRTC] Emergency token refresh failed - invalid token format');
                  }
                } else {
                  console.error('[TwilioRTC] Emergency token refresh failed:', {
                    status: refreshResp.status,
                    error: refreshData?.error || refreshData?.message
                  });
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
                  
                  // Fire-and-forget termination of all related call legs
                  const callSidsToTerminate = [];
                  if (window.currentServerCallSid) {
                    callSidsToTerminate.push(window.currentServerCallSid);
                  }
                  try {
                    const browserCallSid = twilioCallSid || (currentCall?.parameters?.CallSid || currentCall?.parameters?.callSid);
                    if (browserCallSid && !callSidsToTerminate.includes(browserCallSid)) {
                      callSidsToTerminate.push(browserCallSid);
                    }
                  } catch(_) {}
                  try {
                    if (window.storedDialCallSids && Array.isArray(window.storedDialCallSids)) {
                      window.storedDialCallSids.forEach(sid => {
                        if (sid && !callSidsToTerminate.includes(sid)) {
                          callSidsToTerminate.push(sid);
                        }
                      });
                    }
                  } catch(_) {}
                  
                  if (callSidsToTerminate.length > 0) {
                    try {
                      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
                      console.debug('[Phone] DISCONNECT: Terminating all call legs:', callSidsToTerminate);
                      fetch(`${base}/api/twilio/hangup`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callSids: callSidsToTerminate })
                      }).catch(()=>{});
                    } catch (_) {}
                    window.currentServerCallSid = null;
                    window.storedDialCallSids = null;
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
          Notification.requestPermission();
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

  const CONTACT_PHONE_FIELDS = [
    'phone', 'mobile', 'workDirectPhone', 'otherPhone', 'homePhone',
    'directPhone', 'mainPhone', 'primaryPhone', 'cellPhone', 'officePhone'
  ];
  const ACCOUNT_PHONE_FIELDS = ['companyPhone', 'phone', 'primaryPhone', 'mainPhone', 'billingPhone'];

  function extractDigits(value) {
    return (value || '').toString().replace(/\D/g, '');
  }

  function normalizeCandidateDigits(candidates, fallback) {
    const set = new Set();
    (candidates || []).forEach((candidate) => {
      const digits = extractDigits(candidate);
      if (!digits) return;
      set.add(digits);
      if (digits.length > 10) {
        set.add(digits.slice(-10));
      }
    });
    if (fallback) {
      const fallbackDigits = extractDigits(fallback);
      if (fallbackDigits) {
        set.add(fallbackDigits);
        if (fallbackDigits.length > 10) {
          set.add(fallbackDigits.slice(-10));
        }
      }
    }
    return Array.from(set);
  }

  function matchesCandidate(value, candidates) {
    if (!value) return false;
    const digits = extractDigits(value);
    if (!digits || !candidates || !candidates.length) return false;
    return candidates.some((candidate) => {
      if (!candidate) return false;
      if (digits === candidate) return true;
      if (digits.endsWith(candidate)) return true;
      if (candidate.endsWith(digits)) return true;
      return false;
    });
  }

  function getCRMData(getterName) {
    try {
      const getter = window[getterName];
      if (typeof getter === 'function') {
        const data = getter();
        if (Array.isArray(data)) {
          return data;
        }
      }
    } catch (_) {}
    return [];
  }

  function getContactPhones(contact) {
    if (!contact || typeof contact !== 'object') return [];
    const phones = [];
    CONTACT_PHONE_FIELDS.forEach((field) => {
      const value = contact[field];
      if (value) phones.push(value);
    });
    if (Array.isArray(contact.phoneNumbers)) {
      contact.phoneNumbers.forEach((item) => {
        if (item && typeof item === 'object' && item.phone) {
          phones.push(item.phone);
        } else if (typeof item === 'string') {
          phones.push(item);
        }
      });
    }
    return Array.from(new Set(phones));
  }

  function getAccountPhones(account) {
    if (!account || typeof account !== 'object') return [];
    const phones = [];
    ACCOUNT_PHONE_FIELDS.forEach((field) => {
      const value = account[field];
      if (value) phones.push(value);
    });
    if (Array.isArray(account.phoneNumbers)) {
      account.phoneNumbers.forEach((item) => {
        if (item && typeof item === 'object' && item.phone) {
          phones.push(item.phone);
        } else if (typeof item === 'string') {
          phones.push(item);
        }
      });
    }
    return Array.from(new Set(phones));
  }

  function findAccountByContact(contact, accountsData) {
    if (!contact || !accountsData || !accountsData.length) return null;
    const candidateIds = new Set();
    ['accountId', 'account_id', 'accountID', 'accountIdLegacy', 'account_id_legacy'].forEach((key) => {
      const value = contact[key];
      if (value) candidateIds.add(String(value).toLowerCase());
    });
    if (candidateIds.size) {
      const match = accountsData.find((account) => {
        const accountId = String(account.id || account.accountId || account._id || '').toLowerCase();
        return accountId && candidateIds.has(accountId);
      });
      if (match) return match;
    }
    const accountNames = new Set();
    ['accountName', 'company', 'account', 'name', 'companyName'].forEach((field) => {
      const value = contact[field];
      if (value) accountNames.add(String(value).trim().toLowerCase());
    });
    if (accountNames.size) {
      return accountsData.find((account) => {
        const candidate = String(account.accountName || account.name || account.company || account.companyName || '').trim().toLowerCase();
        return candidate && accountNames.has(candidate);
      });
    }
    return null;
  }

  function buildAccountBranding(account) {
    if (!account || typeof account !== 'object') return { logoUrl: '', domain: '' };
    const logo = account.logoUrl || account.iconUrl || account.logo || account.companyLogo || account.accountLogo || '';
    let domain = account.domain || account.website || account.url || '';
    if (domain) domain = domain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return { logoUrl: (logo || '').toString().trim(), domain };
  }

  function findMatchingAccount(candidateDigits, accountsData) {
    if (!candidateDigits.length || !accountsData.length) return null;
    for (const account of accountsData) {
      const phones = getAccountPhones(account);
      if (phones.some((phone) => matchesCandidate(phone, candidateDigits))) {
        return account;
      }
    }
    return null;
  }

  function buildContactMeta(contact, accountMatch) {
    if (!contact) return null;
    const nameParts = [contact.firstName, contact.lastName].filter(Boolean);
    const name = contact.name || nameParts.join(' ').trim() || '';
    const accountInfo = accountMatch || {};
    const accountName = accountInfo.accountName || accountInfo.name || accountInfo.company || accountInfo.companyName || contact.accountName || contact.company || '';
    const contactId = contact.id || contact.contactId || contact._id || contact.idValue || null;
    const accountId = accountInfo.id || accountInfo.accountId || accountInfo._id || contact.accountId || null;
    const branding = buildAccountBranding(accountInfo);
    return {
      name,
      account: accountName,
      accountId,
      contactId,
      title: contact.title || contact.jobTitle || contact.position || '',
      city: contact.city || (accountInfo && (accountInfo.city || '')) || '',
      state: contact.state || (accountInfo && (accountInfo.state || '')) || '',
      domain: branding.domain || contact.domain || contact.website || '',
      logoUrl: branding.logoUrl || ''
    };
  }

  function buildAccountMeta(account) {
    if (!account) return null;
    const accountName = account.accountName || account.name || account.company || account.companyName || '';
    const branding = buildAccountBranding(account);
    return {
      name: '',
      account: accountName,
      accountId: account.id || account.accountId || account._id || null,
      title: '',
      city: account.city || '',
      state: account.state || '',
      domain: branding.domain,
      logoUrl: branding.logoUrl || '',
      contactId: null
    };
  }

  function findLocalCRMMeta(candidateDigits) {
    if (!candidateDigits.length) return null;
    const peopleData = getCRMData('getPeopleData');
    const accountsData = getCRMData('getAccountsData');
    for (const contact of peopleData) {
      const phones = getContactPhones(contact);
      if (!phones.length) continue;
      if (phones.some((phone) => matchesCandidate(phone, candidateDigits))) {
        const matchedAccount = findAccountByContact(contact, accountsData);
        return buildContactMeta(contact, matchedAccount);
      }
    }
    const directAccount = findMatchingAccount(candidateDigits, accountsData);
    if (directAccount) {
      return buildAccountMeta(directAccount);
    }
    return null;
  }

  async function resolvePhoneMeta(number, preserveContext = null) {
    const digits = (number || '').replace(/\D/g, '');
    const e164 = digits && digits.length === 10 ? `+1${digits}` : (digits && digits.startsWith('1') && digits.length === 11 ? `+${digits}` : (String(number||'').startsWith('+') ? String(number) : ''));
    const candidates = Array.from(new Set([digits, e164.replace(/\D/g,'')] )).filter(Boolean);
    const candidateDigits = normalizeCandidateDigits(candidates, number);
    
    // CRITICAL: If we have existing context with IDs/names, preserve it and only enrich missing fields
    // This prevents CRM lookup from overwriting context that was set by click-to-call
    // ALWAYS prefer preserveContext if it has data, even if currentCallContext is empty
    // Also check for stored programmatic context on the input element (set before input.value assignment)
    let storedProgrammaticContext = null;
    try {
      const card = document.getElementById(WIDGET_ID);
      if (card) {
        const input = card.querySelector('.phone-display');
        if (input && input._programmaticContext) {
          storedProgrammaticContext = input._programmaticContext;
          // If we found stored context and currentCallContext is empty, restore it immediately
          if (storedProgrammaticContext && (!currentCallContext || !currentCallContext.accountId) && !currentCallContext?.contactId && !currentCallContext?.name && !currentCallContext?.company) {
            console.debug('[Phone] resolvePhoneMeta: Restoring context from stored programmatic context');
            currentCallContext = {
              number: storedProgrammaticContext.number || '',
              name: storedProgrammaticContext.name || '',
              company: storedProgrammaticContext.company || '',
              accountId: storedProgrammaticContext.accountId || null,
              accountName: storedProgrammaticContext.company || null,
              contactId: storedProgrammaticContext.contactId || null,
              contactName: storedProgrammaticContext.name || '',
              city: storedProgrammaticContext.city || '',
              state: storedProgrammaticContext.state || '',
              domain: storedProgrammaticContext.domain || '',
              logoUrl: storedProgrammaticContext.logoUrl || '',
              isCompanyPhone: storedProgrammaticContext.isCompanyPhone || false,
              isActive: true
            };
          }
        }
      }
    } catch(_) {}
    
    // Check if preserveContext is an empty object (has keys but no data) - treat as null
    const preserveContextHasData = preserveContext && (
      preserveContext.accountId || preserveContext.contactId || 
      preserveContext.name || preserveContext.company || preserveContext.accountName
    );
    
    const existingContext = preserveContextHasData
      ? preserveContext 
      : (storedProgrammaticContext && (storedProgrammaticContext.accountId || storedProgrammaticContext.contactId || storedProgrammaticContext.name || storedProgrammaticContext.company))
        ? storedProgrammaticContext
        : (currentCallContext && (currentCallContext.accountId || currentCallContext.contactId || currentCallContext.name || currentCallContext.company || currentCallContext.accountName))
          ? currentCallContext
          : null;
    const hasExistingContext = !!(existingContext && (
      existingContext.accountId || existingContext.contactId || 
      existingContext.name || existingContext.contactName || 
      existingContext.company || existingContext.accountName
    ));
    
    const meta = { 
      number, 
      name: hasExistingContext ? (existingContext.name || existingContext.contactName || '') : '', 
      account: hasExistingContext ? (existingContext.company || existingContext.accountName || '') : '', 
      title: '', 
      city: hasExistingContext ? (existingContext.city || '') : '', 
      state: hasExistingContext ? (existingContext.state || '') : '', 
      domain: hasExistingContext ? (existingContext.domain || '') : '', 
      logoUrl: hasExistingContext ? (existingContext.logoUrl || '') : '', 
      contactId: hasExistingContext ? (existingContext.contactId || null) : null, 
      accountId: hasExistingContext ? (existingContext.accountId || null) : null, 
      callerIdImage: null 
    };
    
    const localMeta = !hasExistingContext ? findLocalCRMMeta(candidateDigits) : null;
    if (localMeta) {
      return { ...meta, ...localMeta };
    }

    // If we already have context, skip CRM lookup to prevent overwriting
    if (hasExistingContext) {
      return meta;
    }
    
    try {
      // App-provided resolver if available
      if (window.crm && typeof window.crm.resolvePhoneMeta === 'function') {
        const out = await Promise.resolve(window.crm.resolvePhoneMeta(digits));
        if (out && typeof out === 'object') return { ...meta, ...out };
      }
      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (base) {
        // Try memoized successful route first to reduce extra calls/costs
        try {
          const memo = window.__pcPhoneSearchRoute;
          if (memo && memo.url && memo.method) {
            const primaryCandidate = candidates[0] || digits;
            const url = memo.url.replace(/\{phone\}/g, encodeURIComponent(primaryCandidate));
            const opt = memo.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memo.bodyTemplate ? { ...memo.bodyTemplate, phone: primaryCandidate } : { phone: primaryCandidate }) } : undefined;
            const resp = await fetch(url, opt);
            if (resp && resp.ok) {
              const j = await resp.json().catch(() => ({}));
                  if (j) {
                    // Skip disabled endpoints
                    if (j.success === false && j.disabled) {
                      console.debug('[Phone] Memoized route is disabled, invalidating memo');
                      window.__pcPhoneSearchRoute = null;
                    } else {
                      let c = j.contact || (Array.isArray(j.contacts) && j.contacts[0]) || j.person || ((j.name || j.title || j.email) ? j : null);
                      let a = j.account || (Array.isArray(j.accounts) && j.accounts[0]) || j.company || ((j.company || j.accountName || j.domain) ? j : null);
                      if (c || a) {
                        // Merge CRM results with existing context (preserve existing context fields)
                        const resolved = {
                          ...meta, // This already has existing context if preserveContext was passed
                          // Only overwrite fields that are empty in existing context
                          name: meta.name || (c && (c.name || ((c.firstName||c.first_name||'') + ' ' + (c.lastName||c.last_name||'')).trim())) || '',
                          account: meta.account || (a && (a.name || a.accountName || a.company || '')) || (c && (c.account || c.company || '')) || '',
                          title: meta.title || (c && (c.title || c.jobTitle || c.job_title)) || '',
                          city: meta.city || (c && c.city) || (a && a.city) || '',
                          state: meta.state || (c && c.state) || (a && a.state) || '',
                          domain: meta.domain || (c && (c.domain || (c.email||'').split('@')[1])) || (a && (a.domain || a.website)) || '',
                          logoUrl: meta.logoUrl || (a && a.logoUrl) || '',
                          contactId: meta.contactId || (c && (c.id || c.contactId || c._id)) || null,
                          accountId: meta.accountId || (a && (a.id || a.accountId || a._id)) || null
                        };
                        console.debug('[Phone] Resolved metadata (memoized route):', { url, resolved });
                        return resolved;
                      }
                    }
                  }
            } else {
              // Invalidate memo on failure
              window.__pcPhoneSearchRoute = null;
            }
          }
        } catch(_) { /* ignore memo errors */ }
        // Try multiple likely routes and payloads to avoid 404s when backend changes
        async function tryFetches() {
          const routes = [];
          // GET variants (try these first - they're the primary working endpoints)
          candidates.forEach(p => {
            routes.push({ url: `${base}/api/search?phone=${encodeURIComponent(p)}`, method: 'GET' });
            routes.push({ url: `${base}/api/contacts/search?phone=${encodeURIComponent(p)}`, method: 'GET' });
            routes.push({ url: `${base}/api/v1/search?phone=${encodeURIComponent(p)}`, method: 'GET' });
          });
          // POST variants (try these second - some may be disabled)
          const bodies = candidates.map(p => ([
            { phone: p },
            { e164: (p.length===10?`+1${p}`:(p.startsWith('1')&&p.length===11?`+${p}`:`+${p}`)) },
            { query: { phone: p } }
          ])).flat();
          ['search', 'contacts/search', 'v1/search', 'lookup/phone', 'contacts/lookup'].forEach(path => {
            bodies.forEach(b => routes.push({ url: `${base}/api/${path}`, method: 'POST', body: b }));
          });
          for (const r of routes) {
            try {
              const resp = await fetch(r.url, r.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) } : undefined);
              if (!resp || !resp.ok) { 
                console.debug('[Phone] Search route failed:', r.url, resp.status);
                continue; 
              }
              const j = await resp.json().catch(() => ({}));
              if (!j) {
                console.debug('[Phone] Search route returned no JSON:', r.url);
                continue;
              }
              // Skip disabled endpoints (they return success: false with message)
              if (j.success === false && j.disabled) {
                console.debug('[Phone] Search route is disabled:', r.url);
                continue;
              }
              // Accept several shapes
              // { contact, account }
              let c = j.contact || null;
              let a = j.account || null;
              // { contacts:[...], accounts:[...] }
              if (!c && Array.isArray(j.contacts) && j.contacts.length) c = j.contacts[0];
              if (!a && Array.isArray(j.accounts) && j.accounts.length) a = j.accounts[0];
              // { person, company }
              if (!c && j.person) c = j.person;
              if (!a && j.company) a = j.company;
              // Flat shape { name, company/account }
              if (!c && (j.name || j.title || j.email)) c = j;
              if (!a && (j.company || j.accountName || j.domain)) a = j;
              if (c || a) {
                // Merge CRM results with existing context (preserve existing context fields)
                const resolved = {
                  ...meta, // This already has existing context if preserveContext was passed
                  // Only overwrite fields that are empty in existing context
                  name: meta.name || (c && (c.name || ((c.firstName||c.first_name||'') + ' ' + (c.lastName||c.last_name||'')).trim())) || '',
                  account: meta.account || (a && (a.name || a.accountName || a.company || '')) || (c && (c.account || c.company || '')) || '',
                  title: meta.title || (c && (c.title || c.jobTitle || c.job_title)) || '',
                  city: meta.city || (c && c.city) || (a && a.city) || '',
                  state: meta.state || (c && c.state) || (a && a.state) || '',
                  domain: meta.domain || (c && (c.domain || (c.email||'').split('@')[1])) || (a && (a.domain || a.website)) || '',
                  logoUrl: meta.logoUrl || (a && a.logoUrl) || '',
                  contactId: meta.contactId || (c && (c.id || c.contactId || c._id)) || null,
                  accountId: meta.accountId || (a && (a.id || a.accountId || a._id)) || null
                };
                console.debug('[Phone] Resolved metadata from CRM (flex routes):', { route: r.url, resolved });
                // Remember a winning route to reduce future attempts
                try {
                  if (r.method === 'GET') {
                    // Store a template with a placeholder token to inject future phones
                    window.__pcPhoneSearchRoute = { method: 'GET', url: r.url.replace(/(phone=)[^&]+/, '$1{phone}') };
                  } else {
                    window.__pcPhoneSearchRoute = { method: 'POST', url: r.url, bodyTemplate: (typeof r.body === 'object' && r.body && r.body.query) ? { query: {} } : {} };
                  }
                } catch(_) {}
                return resolved;
              }
            } catch(_) { /* try next */ }
          }
          return null;
        }
        const found = await tryFetches();
        if (found) {
          return found;
        }
        
        // Twilio caller ID lookup disabled by user (feature deactivated in Twilio console)
        // Skipping Twilio lookup to avoid unnecessary API calls and console errors
        // CRM search results above should be sufficient for existing contacts/accounts
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
      // CRITICAL: Always prioritize currentCallContext.logoUrl to prevent flickering
      // Only use meta.logoUrl if currentCallContext doesn't have one
      // This prevents the logo from being cleared when setContactDisplay is called multiple times
      const logoUrl = (currentCallContext && currentCallContext.logoUrl) 
        ? currentCallContext.logoUrl
        : (meta && meta.logoUrl) || '';
      
      const displayNumber = number || (currentCallContext && currentCallContext.number) || '';
      
      // For company phone calls, show company name only
      // For individual contact calls, show contact name
      let nameLine;
      if (isCompanyPhone) {
        nameLine = (currentCallContext && (currentCallContext.company || currentCallContext.accountName)) || (meta && (meta.account || meta.company)) || '';
      } else {
        // FIX: Prioritize currentCallContext.name over meta.name since callNumber passes currentCallContext as meta
        // This ensures first call shows the name correctly
        nameLine = (currentCallContext && currentCallContext.name) || (currentCallContext && currentCallContext.contactName) || (meta && meta.name) || '';
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
          // CRITICAL: Prevent flickering by checking if logo URL hasn't changed
          const existingImg = avatarWrap.querySelector('.company-favicon');
          const existingSrc = existingImg ? existingImg.src : '';
          const newSrc = logoUrl || '';
          
          // Only update if the logo URL has actually changed
          // If newSrc is empty but we have an existing logo, preserve it (prevents flickering on call connect)
          if (newSrc && existingSrc !== newSrc) {
            // Absolute priority: explicit logoUrl provided by the page/widget
            if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
              avatarWrap.innerHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: newSrc, domain, size: 28 });
            } else {
              avatarWrap.innerHTML = `<img class="company-favicon" src="${newSrc}" alt="" aria-hidden="true" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'">`;
            }
          } else if (!newSrc && existingImg && existingSrc) {
            // New logoUrl is empty but we have an existing logo - preserve it to prevent flickering
            // Don't update the DOM, just skip the logo rendering logic
            // Continue with the rest of the function (name/sub updates, animations, etc.)
          } else if (!newSrc && !existingImg) {
            // No logo and no existing image - try fallbacks
            if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
              // Helper will try multiple favicon sources; fallback to accounts icon if it fails
              avatarWrap.innerHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: '', domain, size: 28 });
            } else if (typeof window.__pcAccountsIcon === 'function') {
              avatarWrap.innerHTML = window.__pcAccountsIcon(28);
            }
          }
          // If logoUrl is empty but we have an existing image, don't clear it (prevents flickering)
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
    if (TwilioRTC.state.micPermissionChecked && TwilioRTC.state.micPermissionGranted) {
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
      // Always attempt to request microphone permission directly
      // This will trigger the browser permission dialog if needed
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
    // Get the selected phone number from settings and format it
    const selected = getSelectedPhoneNumber();
    return formatPhoneNumber(selected);
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
    const formattedNumber = businessNumber; // Already formatted by getBusinessNumber()

    card.innerHTML = `
      <div class="widget-card-header">
        <div class="phone-title-container">
          <h4 class="widget-title">Phone</h4>
          <div class="my-number-badge">My Number · ${formattedNumber}</div>
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
        .mini-scripts { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 10px; padding: 10px; margin-top: 10px; max-height: 600px; overflow-y: auto; overflow-x: hidden; opacity: 0; transform: translateY(-4px); transition: opacity 250ms ease, transform 250ms ease; }
        .mini-scripts.--show { opacity: 1; transform: translateY(0); }
        .mini-scripts .ms-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .mini-scripts .ms-search { position: relative; display: flex; align-items: center; gap: 8px; flex: 1; }
        .mini-scripts .ms-search input { flex: 1; }
        .mini-scripts .ms-actions { display: flex; gap: 8px; }
        .mini-scripts .ms-suggest { position: absolute; top: 34px; left: 0; right: 0; background: var(--bg-main); border: 1px solid var(--border-light); border-radius: 8px; z-index: 50; max-height: 200px; overflow: auto; padding: 6px 0; }
        .mini-scripts .ms-suggest[hidden] { display: none; }
        .mini-scripts .ms-suggest .item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; }
        .mini-scripts .ms-suggest .item:hover { background: var(--bg-subtle); }
        .mini-scripts .ms-suggest .glyph { width: 20px; height: 20px; border-radius: 50%; background: var(--orange-subtle); color: #fff; display:flex; align-items:center; justify-content:center; font-size: 11px; font-weight: 700; }
        .mini-scripts .ms-stage-nav { display: flex; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
        .mini-scripts .ms-stage-btn { flex: 1; min-width: 80px; padding: 10px 14px; border-radius: 8px; background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border-light); cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: transform 120ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease; text-align: center; }
        .mini-scripts .ms-stage-btn:hover { background: var(--grey-600); transform: translateY(-1px); }
        .mini-scripts .ms-stage-btn:active { transform: translateY(0); filter: brightness(0.98); }
        .mini-scripts .ms-stage-btn.active { background: var(--orange-primary); color: var(--text-inverse); border-color: var(--orange-primary); box-shadow: 0 2px 8px rgba(255, 107, 53, 0.25); }
        .mini-scripts .ms-display { color: var(--text-primary); line-height: 1.4; background: var(--bg-main); border: 1px solid var(--border-light); border-radius: 8px; padding: 10px; margin: 8px 0; min-height: 60px; max-height: 300px; overflow-y: auto; overflow-x: hidden; word-wrap: break-word; opacity: 0; transition: opacity 200ms ease; scrollbar-width: thin; scrollbar-color: var(--grey-600) var(--bg-main); }
        .mini-scripts .ms-display::-webkit-scrollbar { width: 6px; }
        .mini-scripts .ms-display::-webkit-scrollbar-track { background: var(--bg-main); border-radius: 4px; }
        .mini-scripts .ms-display::-webkit-scrollbar-thumb { background: var(--grey-600); border-radius: 4px; }
        .mini-scripts .ms-display::-webkit-scrollbar-thumb:hover { background: var(--grey-500); }
        /* Scrollbar for mini-scripts container */
        .mini-scripts { scrollbar-width: thin; scrollbar-color: var(--grey-600) var(--bg-card); }
        .mini-scripts::-webkit-scrollbar { width: 6px; }
        .mini-scripts::-webkit-scrollbar-track { background: var(--bg-card); border-radius: 4px; }
        .mini-scripts::-webkit-scrollbar-thumb { background: var(--grey-600); border-radius: 4px; }
        .mini-scripts::-webkit-scrollbar-thumb:hover { background: var(--grey-500); }
        .mini-scripts .ms-display.--visible { opacity: 1; }
        .mini-scripts .ms-display:empty { display: none; }
        .mini-scripts .ms-responses { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 8px; }
        .mini-scripts .ms-responses:empty { display: none; }
        .mini-scripts .ms-responses .btn-secondary { width: 100%; padding: 12px 16px; border-radius: 10px; background: var(--bg-item); color: var(--text-primary); border: 1px solid var(--border-light); box-shadow: var(--elevation-card); cursor: pointer; font-size: 14px; font-weight: 500; text-align: center; transition: opacity 200ms ease, transform 120ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease; white-space: normal; word-wrap: break-word; opacity: 0; }
        .mini-scripts .ms-responses .btn-secondary.--visible { opacity: 1; }
        .mini-scripts .ms-responses .btn-secondary:hover { background: var(--grey-600); transform: translateY(-1px); }
        .mini-scripts .ms-responses .btn-secondary:active { transform: translateY(0); filter: brightness(0.98); }
        .mini-scripts .ms-var { color: var(--grey-400); font-weight: 400; }
        .mini-scripts .icon-btn { flex: 0 0 auto; padding: 10px; border-radius: 10px; background: var(--bg-item); color: var(--text-primary); border: 1px solid var(--border-light); box-shadow: var(--elevation-card); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 120ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease; overflow: visible; }
        .mini-scripts .icon-btn:hover { background: var(--grey-600); transform: translateY(-1px); }
        .mini-scripts .icon-btn:active { transform: translateY(0); filter: brightness(0.98); }
        .mini-scripts .icon-btn svg { display: block; overflow: visible; }
        
        /* === Tone Markers (Color-coded) - Same as call-scripts page === */
        .mini-scripts .tone-marker {
          display: inline-block;
          padding: 3px 8px;
          font-size: 0.85em;
          font-weight: 600;
          margin: 0 4px;
          border-radius: 4px;
          border: 1px solid;
          vertical-align: baseline;
        }
        
        .mini-scripts .tone-marker.curious {
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
          border-color: #3b82f6;
        }
        
        .mini-scripts .tone-marker.concerned {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border-color: #ef4444;
        }
        
        .mini-scripts .tone-marker.confident {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border-color: #10b981;
        }
        
        .mini-scripts .tone-marker.serious {
          background: rgba(139, 92, 246, 0.15);
          color: #8b5cf6;
          border-color: #8b5cf6;
        }
        
        .mini-scripts .tone-marker.understanding {
          background: rgba(251, 191, 36, 0.15);
          color: #fbbf24;
          border-color: #fbbf24;
        }
        
        .mini-scripts .tone-marker.hopeful {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border-color: #22c55e;
        }
        
        .mini-scripts .tone-marker.professional {
          background: rgba(107, 114, 128, 0.15);
          color: #6b7280;
          border-color: #6b7280;
        }
        
        .mini-scripts .tone-marker.friendly {
          background: rgba(249, 115, 22, 0.15);
          color: #f97316;
          border-color: #f97316;
        }
        
        /* === Pause Indicator (Pulsing) - Same as call-scripts page === */
        @keyframes pausePulse {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
          }
        }
        
        .mini-scripts .pause-indicator {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--orange-primary);
          margin: 0 3px;
          animation: pausePulse 1.5s ease-in-out infinite;
          vertical-align: middle;
        }
        
        .mini-scripts .pause-indicator:nth-of-type(1) { animation-delay: 0s; }
        .mini-scripts .pause-indicator:nth-of-type(2) { animation-delay: 0.2s; }
        .mini-scripts .pause-indicator:nth-of-type(3) { animation-delay: 0.4s; }
        .mini-scripts .pause-indicator:nth-of-type(4) { animation-delay: 0.6s; }
        .mini-scripts .pause-indicator:nth-of-type(5) { animation-delay: 0.8s; }
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>
        </div>
        <div class="ms-stage-nav"></div>
        <div class="ms-display" aria-live="polite"></div>
        <div class="ms-responses"></div>
      `;
      wrap.appendChild(el);

      const state = { current: '', history: [], overrideContactId: null, monthlySpend: null };

      // Data helpers (subset from scripts page)
      function escapeHtml(str){ if (str == null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
      function splitName(s){ const parts = String(s||'').trim().split(/\s+/); return { first: parts[0]||'', last: parts.slice(1).join(' ')||'', full: String(s||'').trim() }; }
      function normPhone(p){ return String(p||'').replace(/\D/g,'').slice(-10); }
      function normDomain(email){ return String(email||'').split('@')[1]?.toLowerCase() || ''; }
      function normName(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }
      function getPeopleCache(){ try { return (typeof window.getPeopleData==='function' ? (window.getPeopleData()||[]) : []); } catch(_) { return []; } }
      function getAccountsCache(){ try { return (typeof window.getAccountsData==='function' ? (window.getAccountsData()||[]) : []); } catch(_) { return []; } }
      function formatDateMDY(v){
        try {
          if (!v) return '';
          const str = String(v).trim();
          let d;
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const parts = str.split('-');
            d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          } else {
            const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
            if (mdy) {
              d = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
            } else {
              d = new Date(str + 'T00:00:00');
            }
          }
          if (isNaN(d.getTime())) return String(v);
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          const yyyy = d.getFullYear();
          return `${mm}/${dd}/${yyyy}`;
        } catch(_) { return String(v||''); }
      }
      function toMDY(v){
        try {
          if (!v) return '';
          const str = String(v).trim();
          let d;
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const parts = str.split('-');
            d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          } else {
            const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
            if (mdy) {
              d = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
            } else {
              d = new Date(str + 'T00:00:00');
            }
          }
          if (isNaN(d.getTime())) return String(v);
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          const yyyy = d.getFullYear();
          return `${mm}/${dd}/${yyyy}`;
        } catch(_) { return String(v||''); }
      }

      function normalizeAccount(a){ const obj = a ? { ...a } : {}; obj.supplier = obj.supplier || obj.currentSupplier || obj.current_supplier || obj.energySupplier || obj.electricitySupplier || obj.supplierName || ''; const end = obj.contractEnd || obj.contract_end || obj.renewalDate || obj.renewal_date || obj.contractEndDate || obj.contract_end_date || obj.contractExpiry || obj.expiration || obj.expirationDate || obj.expiresOn || ''; obj.contract_end = end || ''; obj.contractEnd = end || obj.contractEnd || ''; obj.name = obj.name || obj.accountName || obj.companyName || ''; obj.industry = obj.industry || ''; obj.city = obj.city || obj.locationCity || obj.billingCity || ''; obj.state = obj.state || obj.region || obj.billingState || ''; obj.website = obj.website || obj.domain || ''; obj.accountId = obj.accountId || obj.account_id || obj.account || obj.companyId || ''; return obj; }
      function normalizeContact(c){
        const obj = c ? { ...c } : {};
        const nameGuess = obj.name || ((obj.firstName||obj.first_name||'') + ' ' + (obj.lastName||obj.last_name||'')).trim();
        const sp = splitName(nameGuess);
        obj.firstName = obj.firstName || obj.first_name || sp.first;
        obj.lastName = obj.lastName || obj.last_name || sp.last;
        obj.fullName = obj.fullName || obj.full_name || nameGuess;
        obj.company = obj.company || obj.companyName || obj.accountName || obj.account_name || '';
        try {
          const pref = (obj.preferredPhoneField || '').trim();
          if (pref && obj[pref]) {
            obj.phone = obj[pref];
          } else {
            obj.phone = obj.phone || obj.workDirectPhone || obj.mobile || obj.otherPhone || obj.mobile_phone || '';
          }
        } catch(_) {
          obj.phone = obj.phone || obj.workDirectPhone || obj.mobile || obj.otherPhone || obj.mobile_phone || '';
        }
        obj.mobile = obj.mobile || obj.mobile_phone || '';
        obj.email = obj.email || obj.work_email || obj.personal_email || '';
        obj.title = obj.title || obj.jobTitle || obj.job_title || '';
        obj.supplier = obj.supplier || obj.currentSupplier || obj.current_supplier || '';
        const cEnd = obj.contractEnd || obj.contract_end || obj.renewalDate || obj.renewal_date || '';
        obj.contract_end = obj.contract_end || cEnd || '';
        obj.industry = obj.industry || '';
        obj.city = obj.city || obj.locationCity || obj.billingCity || '';
        obj.state = obj.state || obj.region || obj.billingState || '';
        obj.accountId = obj.accountId || obj.account_id || obj.account || obj.companyId || '';
        return obj;
      }

      function findAccountForContact(contact){ if (!contact) return {}; const accounts = getAccountsCache(); try { if (contact.accountId) { const hitById = accounts.find(a => String(a.id||a.accountId||'') === String(contact.accountId)); if (hitById) return hitById; } } catch(_) {} const clean = (s)=> String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim(); const comp = clean(contact.company||contact.companyName||''); if (comp) { const hit = accounts.find(a=> { const nm = clean(a.accountName||a.name||a.companyName||''); return nm && nm === comp; }); if (hit) return hit; } const domain = normDomain(contact.email||''); if (domain) { const match = accounts.find(a=> { const d = String(a.domain||a.website||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]; return d && (domain.endsWith(d) || d.endsWith(domain)); }); if (match) return match; } return {}; }

      function getAccountKey(a){ return String((a && (a.accountName||a.name||a.companyName||''))||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }

      function getLiveData(){
        // Build from current call context + optional override contact
        const ctx = currentCallContext || {};
        let contact = null; let account = null;
        
        // Priority 1: Prefer override contact if manually selected
        try {
          if (state.overrideContactId) {
            const people = getPeopleCache();
            const found = people.find(p => {
              const pid = String(p.id||'');
              const alt1 = String(p.contactId||'');
              const alt2 = String(p._id||'');
              const target = String(state.overrideContactId||'');
              return pid === target || alt1 === target || alt2 === target;
            });
            if (found) {
              contact = found;
            }
          }
        } catch(_) {}
        
        // Priority 2: If phone widget has contactId in context, use that (direct contact call)
        if (!contact && ctx.contactId) {
          try {
            const people = getPeopleCache();
            const found = people.find(p => {
              const pid = String(p.id||'');
              const alt1 = String(p.contactId||'');
              const alt2 = String(p._id||'');
              const target = String(ctx.contactId||'');
              return pid === target || alt1 === target || alt2 === target;
            });
            if (found) {
              contact = found;
            }
          } catch(_) {}
        }
        
        // Priority 3: If not selected, try to infer from context name or number
        if (!contact && ctx) {
          try {
            const people = getPeopleCache();
            if (ctx.name) {
            const nm = normName(ctx.name);
            contact = people.find(p => normName(p.name || ((p.firstName||'') + ' ' + (p.lastName||''))) === nm) || null;
            }
            // If still no contact, try by number
            if (!contact && ctx.number) {
              const n10 = normPhone(ctx.number);
              contact = people.find(p => {
                const candidates = [p.workDirectPhone, p.mobile, p.otherPhone, p.phone];
                return candidates.some(ph => normPhone(ph) === n10);
              }) || null;
            }
          } catch(_) {}
        }
        // Resolve account - prefer accountId from context, then from contact
        if (ctx.accountId) {
          try {
            const accounts = getAccountsCache();
            const found = accounts.find(a => {
              const aid = String(a.id||'');
              const alt1 = String(a.accountId||'');
              const alt2 = String(a._id||'');
              const target = String(ctx.accountId||'');
              return aid === target || alt1 === target || alt2 === target;
            });
            if (found) account = found;
          } catch(_) {}
        }
        
        // If no account found via accountId, try finding from contact
        if (!account) {
        try { account = findAccountForContact(contact) || {}; } catch(_) { account = {}; }
        }
        
        // If still no account, try by company name from context
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
        
        // If no account found, fall back to using the selected contact's company for {{account.name}}
        if (!account.name && (contact.company || contact.companyName)) {
          account.name = contact.company || contact.companyName;
        }
        if (!account.name && ctx && ctx.company) account.name = ctx.company;

        return { contact, account };
      }

      function dayPart(){ try { const h = new Date().getHours(); if (h >= 5 && h < 12) return 'Good morning'; if (h >= 12 && h < 17) return 'Good afternoon'; if (h >= 17 && h <= 20) return 'Good evening'; return 'Hello'; } catch(_) { return 'Hello'; } }
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
        const dp = dayPart();
        const data = getLiveData();

        // Get agent name from settings (first name only from general settings)
        let agentFirstName = '';
        try {
          if (window.SettingsPage && typeof window.SettingsPage.getSettings === 'function') {
            const settings = window.SettingsPage.getSettings();
            if (settings && settings.general) {
              agentFirstName = settings.general.firstName || '';
            }
          }
        } catch (_) {
          agentFirstName = '';
        }
        
        // Calculate savings based on monthly spend from state
        let monthlySpend = 0;
        let annualSpend = 0;
        let potentialSavings = 0;
        
        // Use stored monthly spend value if available
        if (state.monthlySpend && state.monthlySpend > 0) {
          monthlySpend = state.monthlySpend;
          annualSpend = monthlySpend * 12;
          potentialSavings = Math.round(annualSpend * 0.25); // 25% savings estimate
        }
        
        // Format numbers with commas
        const formatCurrency = (num) => {
          if (num === 0 || !num) return 'an estimated amount';
          return '$' + num.toLocaleString();
        };
        
        const values = {
          'day.part': dp,
          'agent.first_name': agentFirstName,
          'contact.first_name': data.contact.firstName || data.contact.first_name || splitName(data.contact.name || '').first || splitName(data.contact.fullName || '').first || '',
          'contact.last_name': data.contact.lastName || data.contact.last_name || splitName(data.contact.name || '').last || splitName(data.contact.fullName || '').last || '',
          'contact.full_name': data.contact.fullName || data.contact.name || (data.contact.firstName && data.contact.lastName ? `${data.contact.firstName} ${data.contact.lastName}` : (data.contact.firstName || data.contact.lastName || '')),
          'contact.phone': data.contact.workDirectPhone || data.contact.mobile || data.contact.otherPhone || data.contact.phone || '',
          'contact.mobile': data.contact.mobile || '',
          'contact.email': data.contact.email || '',
          'contact.title': data.contact.title || data.contact.jobTitle || '',
          'account.name': data.account.accountName || data.account.name || data.contact.company || '',
          'account.industry': data.account.industry || data.contact.industry || '',
          'account.city': data.account.city || data.account.billingCity || data.account.locationCity || data.contact.city || 'Texas',
          'account.state': data.account.state || data.account.region || data.account.billingState || data.contact.state || '',
          'account.website': data.account.website || data.account.domain || normDomain(data.contact.email) || '',
          'account.supplier': data.account.supplier || data.account.currentSupplier || data.contact.supplier || data.contact.currentSupplier || '',
          'account.contract_end': formatDateMDY(data.account.contractEnd || data.account.contract_end || data.account.renewalDate || data.contact.contract_end || data.contact.contractEnd || ''),
          'monthly_spend': formatCurrency(monthlySpend),
          'annual_spend': formatCurrency(annualSpend),
          'potential_savings': formatCurrency(potentialSavings)
        };
        
        let result = String(str);
        
        // Replace {{variable}} placeholders with actual values
        for (const [key, value] of Object.entries(values)) {
          const pattern = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
          result = result.replace(pattern, escapeHtml(value || ''));
        }
        
        // Handle badge placeholders - replace (contact name) etc. with actual data if available
        // Use the actual contact data from getLiveData() for better accuracy
        const actualContact = data.contact || {};
        const actualAccount = data.account || {};
        // For contact name, prefer first_name for badges, fallback to full_name
        const contactName = values['contact.first_name'] || actualContact.firstName || actualContact.first_name || splitName(actualContact.name || '').first || splitName(actualContact.fullName || '').first || '';
        // For company name, try account first, then contact company
        const companyName = values['account.name'] || actualAccount.name || actualAccount.accountName || actualAccount.companyName || actualContact.company || actualContact.companyName || '';
        
        // Get your name from settings (first name only from general settings)
        // Use synchronous method to avoid async issues
        let yourName = '';
        try {
          if (window.SettingsPage && typeof window.SettingsPage.getSettings === 'function') {
            const settings = window.SettingsPage.getSettings();
            if (settings && settings.general) {
              yourName = settings.general.firstName || '';
            }
          }
        } catch (_) {
          // Fallback if settings not available
          yourName = '';
        }
        
        // Replace badge placeholders - handle both HTML-wrapped and plain text versions
        // Plain text placeholders: (contact name), (your name), (company name)
        if (contactName) {
          // HTML-wrapped versions
          result = result.replace(/<span class="badge contact">\(contact name\)<\/span>/gi, escapeHtml(contactName));
          result = result.replace(/<span class="name-badge">\(contact name\)<\/span>/gi, escapeHtml(contactName));
          // Plain text version (no HTML)
          result = result.replace(/\(contact name\)/gi, escapeHtml(contactName));
        }
        if (yourName) {
          // HTML-wrapped versions
          result = result.replace(/<span class="name-badge">\(your name\)<\/span>/gi, escapeHtml(yourName));
          // Plain text version (no HTML)
          result = result.replace(/\(your name\)/gi, escapeHtml(yourName));
        } else {
          // If your name not found, replace with empty string
          result = result.replace(/\(your name\)/gi, '');
        }
        if (companyName) {
          // HTML-wrapped versions
          result = result.replace(/<span class="badge company">\(company name\)<\/span>/gi, escapeHtml(companyName));
          // Plain text version (no HTML)
          result = result.replace(/\(company name\)/gi, escapeHtml(companyName));
        }
        
        // Tone markers and pause indicators are kept as-is (they're already properly formatted HTML)
        // No additional processing needed - they render correctly
        
        return result;
      }

      // Opener management - same as call-scripts.js
      const OPENER_CONFIGS = {
        default: {
          key: 'pattern_interrupt_opening',
          label: 'Bold Direct (Default)',
          state: 'pattern_interrupt_opening'
        },
        direct_question: {
          key: 'opener_direct_question',
          label: 'Direct Question',
          state: 'opener_direct_question'
        },
        transparent: {
          key: 'opener_transparent',
          label: 'Transparent',
          state: 'opener_transparent'
        },
        social_proof: {
          key: 'opener_social_proof',
          label: 'Social Proof',
          state: 'opener_social_proof'
        },
        quick_check: {
          key: 'opener_quick_check',
          label: 'Quick Check',
          state: 'opener_quick_check'
        }
      };

      let currentOpener = OPENER_CONFIGS.default;
      let availableOpeners = [
        OPENER_CONFIGS.direct_question,
        OPENER_CONFIGS.transparent,
        OPENER_CONFIGS.social_proof,
        OPENER_CONFIGS.quick_check
      ];

      // Firebase persistence for opener selection
      async function loadSavedOpener() {
        try {
          if (!window.firebaseDB) return;
          const getUserEmail = () => {
            try {
              if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                return window.DataManager.getCurrentUserEmail();
              }
              return (window.currentUserEmail || '').toLowerCase();
            } catch(_) {
              return (window.currentUserEmail || '').toLowerCase();
            }
          };
          const email = getUserEmail();
          if (!email) return;
          
          // Use per-user document like settings.js
          const docId = `call-scripts-${email}`;
          const doc = await window.firebaseDB.collection('settings').doc(docId).get();
          
          if (doc.exists) {
            const data = doc.data();
            if (data && data.openerKey) {
              const savedOpener = Object.values(OPENER_CONFIGS).find(o => o.key === data.openerKey);
              if (savedOpener) {
                // Update currentOpener
                const oldDefault = currentOpener;
                currentOpener = savedOpener;
                
                // Update availableOpeners - remove saved opener, add old default back
                availableOpeners = availableOpeners.filter(o => o.key !== savedOpener.key);
                if (oldDefault && oldDefault.key !== savedOpener.key) {
                  // Only add old default if it's different
                  availableOpeners.push(oldDefault);
                }
                
                // Sync with call-scripts module if available
                if (window.callScriptsModule) {
                  try {
                    window.callScriptsModule.currentOpener = currentOpener;
                    window.callScriptsModule.availableOpeners = availableOpeners;
                  } catch(_) {}
                }
                
                updateHookOpener();
              }
            }
          }
        } catch(err) {
          console.warn('[Phone Widget] Could not load saved opener:', err);
        }
      }

      async function saveOpenerSelection(openerKey) {
        try {
          if (!window.firebaseDB) return;
          const getUserEmail = () => {
            try {
              if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                return window.DataManager.getCurrentUserEmail();
              }
              return (window.currentUserEmail || '').toLowerCase();
            } catch(_) {
              return (window.currentUserEmail || '').toLowerCase();
            }
          };
          const getCurrentUserId = () => {
            try {
              if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
                return window.firebase.auth().currentUser.uid;
              }
            } catch(_) {}
            return null;
          };
          
          const email = getUserEmail();
          const userId = getCurrentUserId();
          if (!email) return;
          
          // Use per-user document pattern from settings.js
          const docId = `call-scripts-${email}`;
          const docRef = window.firebaseDB.collection('settings').doc(docId);
          
          const updateData = {
            openerKey: openerKey,
            ownerId: email,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
          };
          if (userId) updateData.userId = userId;
          
          // Check if document exists
          const doc = await docRef.get();
          if (doc.exists) {
            await docRef.update(updateData);
          } else {
            // Create new document with proper ownerId
            await docRef.set({
              ...updateData,
              createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        } catch(err) {
          console.warn('[Phone Widget] Could not save opener selection:', err);
        }
      }

      // Update hook responses to use current opener
      function updateHookOpener() {
        const FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
        if (FLOW && FLOW.hook && FLOW.hook.responses) {
          FLOW.hook.responses.forEach(response => {
            if (response.label === 'Yes, speaking' || response.label === "Who's calling?") {
              response.next = currentOpener.state;
            }
          });
        }
        // Also update gatekeeper transfer to point to current opener
        if (FLOW && FLOW.gatekeeper_transferred && FLOW.gatekeeper_transferred.responses) {
          FLOW.gatekeeper_transferred.responses.forEach(response => {
            if (response.label === 'Connected to decision maker') {
              response.next = currentOpener.state;
            }
          });
        }
      }

      // Flow: ALWAYS use scripts page FLOW (must be exported from call-scripts.js)
      // Note: call-scripts.js loads before phone.js, so FLOW should be available
      // But we'll handle the case where it's not ready yet gracefully
      const FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
      if (!FLOW) {
        // call-scripts.js may still be loading - this is OK, FLOW will be available when scripts button is clicked
        console.warn('[Phone Widget] FLOW not available yet (call-scripts.js may still be loading) - will retry when scripts button is clicked');
        // Don't return - continue building the UI structure, just scripts won't work until FLOW loads
      }

      const display = el.querySelector('.ms-display');
      const responses = el.querySelector('.ms-responses');

      // Load saved opener FIRST - phone widget loads independently so it works immediately
      // This ensures the saved opener is ready when user clicks scripts button
      let openerLoadPromise = loadSavedOpener().then(() => {
        // After loading, sync with call-scripts module if it exists
        if (window.callScriptsModule) {
          try {
            window.callScriptsModule.currentOpener = currentOpener;
            window.callScriptsModule.availableOpeners = availableOpeners;
          } catch(_) {}
        }
        // Wait a bit for FLOW to be available from call-scripts.js
        setTimeout(() => {
          updateHookOpener();
        }, 300);
      }).catch(() => {
        // If load fails, just use default
        updateHookOpener();
      });
      
      // Also sync with call-scripts module if it's already loaded (eager load)
      if (window.callScriptsModule && window.callScriptsModule.currentOpener) {
        const csOpener = window.callScriptsModule.currentOpener;
        if (csOpener && csOpener.key !== OPENER_CONFIGS.default.key) {
          // call-scripts module has the saved opener already loaded, use it
          currentOpener = csOpener;
          availableOpeners = window.callScriptsModule.availableOpeners || availableOpeners;
        }
      }

      function renderNode(){
        // Ensure FLOW is available - get fresh reference each time
        let FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
        if (!FLOW) {
          console.warn('[Phone Widget] FLOW not available yet, waiting for call-scripts.js...');
          if (display) {
            display.innerHTML = '<p style="color: var(--text-muted); padding: var(--spacing-md);">Loading scripts...</p>';
          }
          if (responses) responses.innerHTML = '';
          // Retry after a short delay
          setTimeout(() => {
            FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
            if (FLOW) {
              renderNode();
            } else {
              if (display) {
                display.innerHTML = '<p style="color: var(--text-error); padding: var(--spacing-md);">Scripts not available. Please refresh the page.</p>';
              }
            }
          }, 500);
          return;
        }
        
        const key = state.current;
        // Ensure hook is updated before rendering
        if (key === 'hook' || (FLOW && FLOW[key] && (FLOW[key].stage === 'Opening' || FLOW[key].stage.includes('Gatekeeper')))) {
          updateHookOpener();
        }
        const node = FLOW[key];
        if (!node) { display.innerHTML = ''; responses.innerHTML = ''; buildStageNavigation(); return; }
        
        // Update stage navigation
        buildStageNavigation();
        
        // Measure current height before changes
        const currentHeight = card.getBoundingClientRect().height;
        
        // Fade out current content
        display.classList.remove('--visible');
        const oldButtons = responses.querySelectorAll('.btn-secondary');
        oldButtons.forEach(b => b.classList.remove('--visible'));
        
        // Update DOM after brief fade
        setTimeout(() => {
          const live = (function(){ try { return hasActiveCall() || (currentCallContext && currentCallContext.isActive); } catch(_) { return false; } })();
          // Always render with values when contact is selected, even if not in live call
          const hasSelectedContact = !!(state.overrideContactId);
          const shouldRenderValues = live || hasSelectedContact;
          display.innerHTML = shouldRenderValues ? renderTemplateValues(node.text || '') : renderTemplateChips(node.text || '');
          responses.innerHTML = '';
          
          // Special handling for situation_discovery and all acknowledgment states that ask about monthly spending - show input field
          if (key === 'situation_discovery' || 
              key === 'ack_confident_handle' || 
              key === 'ack_struggling' || 
              key === 'ack_no_idea' ||
              key === 'ack_dq_confident' ||
              key === 'ack_dq_struggling' ||
              key === 'ack_vendor_handling') {
            const inputWrap = document.createElement('div');
            inputWrap.className = 'monthly-spend-input-wrap';
            inputWrap.style.cssText = 'width: 100%; margin-bottom: 12px;';
            
            const label = document.createElement('label');
            label.textContent = 'Monthly Spend:';
            label.style.cssText = 'display: block; margin-bottom: 6px; color: var(--text-primary); font-size: 14px;';
            inputWrap.appendChild(label);
            
            const inputContainer = document.createElement('div');
            inputContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';
            
            const dollarSign = document.createElement('span');
            dollarSign.textContent = '$';
            dollarSign.style.cssText = 'color: var(--text-primary); font-size: 16px; font-weight: 500;';
            inputContainer.appendChild(dollarSign);
            
            const input = document.createElement('input');
            input.type = 'number';
            input.placeholder = 'Enter amount (e.g., 5000)';
            input.min = '0';
            input.step = '100';
            input.className = 'monthly-spend-input';
            input.style.cssText = 'flex: 1; padding: 10px 12px; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-main); color: var(--text-primary); font-size: 16px;';
            if (state.monthlySpend) {
              input.value = state.monthlySpend;
            }
            // Prevent dialpad clicks from interfering with input - stop propagation
            input.addEventListener('click', (e) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              input.focus();
            });
            input.addEventListener('focus', (e) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
            });
            input.addEventListener('mousedown', (e) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
            });
            input.addEventListener('keydown', (e) => {
              e.stopPropagation();
            });
            // Also stop propagation on the container and wrap
            inputContainer.addEventListener('click', (e) => {
              e.stopPropagation();
            });
            inputWrap.addEventListener('click', (e) => {
              e.stopPropagation();
            });
            inputContainer.appendChild(input);
            inputWrap.appendChild(inputContainer);
            responses.appendChild(inputWrap);
            
            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'btn-secondary';
            nextBtn.textContent = 'Continue';
            nextBtn.style.cssText = 'width: 100%; margin-bottom: 8px;';
            const handleContinue = () => {
              const value = parseFloat(input.value);
              if (value && value > 0) {
                state.monthlySpend = value;
                if (FLOW['situation_monthly_spend']) {
                  state.history.push(state.current);
                  state.current = 'situation_monthly_spend';
                  renderNode();
                }
              } else {
                alert('Please enter a valid monthly spend amount.');
              }
            };
            nextBtn.addEventListener('click', handleContinue);
            input.addEventListener('keypress', (e) => {
              if (e.key === 'Enter') {
                handleContinue();
              }
            });
            responses.appendChild(nextBtn);
            
            // Add "Don't know offhand" button (different labels based on state)
            const dontKnowLabel = key === 'ack_no_idea' ? "Honestly don't have a guess" : 
                                  key === 'ack_confident_handle' || key === 'ack_dq_confident' || key === 'ack_dq_struggling' ? "Don't know exact amount" :
                                  "Don't know offhand";
            const dontKnowBtn = document.createElement('button');
            dontKnowBtn.type = 'button';
            dontKnowBtn.className = 'btn-secondary';
            dontKnowBtn.textContent = dontKnowLabel;
            dontKnowBtn.style.cssText = 'width: 100%;';
            dontKnowBtn.addEventListener('click', () => {
              state.monthlySpend = null;
              if (FLOW['situation_monthly_spend']) {
                state.history.push(state.current);
                state.current = 'situation_monthly_spend';
                renderNode();
              }
            });
            responses.appendChild(dontKnowBtn);
          } else {
            (node.responses || []).forEach(r => {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'btn-secondary';
              b.textContent = r.label || '';
              b.addEventListener('click', () => { if (r.next && FLOW[r.next]) { state.history.push(state.current); state.current = r.next; renderNode(); } });
              responses.appendChild(b);
            });
          }
          
          // Let CSS transition handle height smoothly
          requestAnimationFrame(() => {
            // Set explicit start height
            card.style.height = currentHeight + 'px';
            card.style.overflow = 'hidden';
            
            requestAnimationFrame(() => {
              // Get target height with new content
              const tempHeight = card.style.height;
              card.style.height = 'auto';
              const targetHeight = card.scrollHeight;
              card.style.height = tempHeight;
              
              // Trigger CSS transition to target
              requestAnimationFrame(() => {
                card.style.height = targetHeight + 'px';
                
                // Fade in new content
                display.classList.add('--visible');
                const newButtons = responses.querySelectorAll('.btn-secondary');
                newButtons.forEach(b => b.classList.add('--visible'));
                
                // Clean up after transition
                const cleanup = () => {
                  card.style.height = '';
                  card.style.overflow = '';
                };
                setTimeout(cleanup, 300);
              });
            });
          });
        }, 80);
      }

      function startAt(key){ state.current = key; state.history = []; renderNode(); }
      function goBack(){ if (!state.history.length) return; state.current = state.history.pop(); renderNode(); }
      function resetAll(){ 
        // Smooth animation when resetting
        state.current = ''; 
        state.history = []; 
        state.overrideContactId = null;
        state.monthlySpend = null; 
        inputEl.value = ''; 
        closeSuggest();
        
        // Animate collapse smoothly
        const currentHeight = card.getBoundingClientRect().height;
        
        // Fade out content
        display.classList.remove('--visible');
        const oldButtons = responses.querySelectorAll('.btn-secondary');
        oldButtons.forEach(b => b.classList.remove('--visible'));
        
        setTimeout(() => {
          // Clear content
          display.innerHTML = '';
          responses.innerHTML = '';
          
          // Animate height collapse
          requestAnimationFrame(() => {
            card.style.height = currentHeight + 'px';
            card.style.overflow = 'hidden';
            
            requestAnimationFrame(() => {
              // Measure collapsed height
              const tempHeight = card.style.height;
              card.style.height = 'auto';
              const targetHeight = card.scrollHeight;
              card.style.height = tempHeight;
              
              requestAnimationFrame(() => {
                // Trigger CSS transition
                card.style.height = targetHeight + 'px';
                
                // Clean up after transition
                setTimeout(() => {
                  card.style.height = '';
                  card.style.overflow = '';
                }, 300);
              });
            });
          });
        }, 80);
      }

      // Phase definitions (same as call-scripts.js)
      const PHASES = [
        { name: 'Pre-Call', stagePattern: 'Pre-Call Prep', entryPoint: 'pre_call_qualification' },
        { name: 'Opening', stagePattern: 'Opening', entryPoint: 'hook' },
        { name: 'Situation', stagePattern: 'Discovery - Situation', entryPoint: 'situation_discovery' },
        { name: 'Problem', stagePattern: 'Discovery - Problem', entryPoint: 'problem_discovery' },
        { name: 'Consequence', stagePattern: 'Discovery - Consequence', entryPoint: 'consequence_discovery' },
        { name: 'Solution', stagePattern: 'Discovery - Solution', entryPoint: 'solution_discovery' },
        { name: 'Closing', stagePattern: 'Closing', entryPoint: 'trial_close_1' },
        { name: 'Objections', stagePattern: 'Objection Handling', entryPoint: 'objection_not_interested' },
        { name: 'Success', stagePattern: 'Success', entryPoint: 'meeting_scheduled' }
      ];

      // Build stage navigation
      function buildStageNavigation() {
        const stageNav = el.querySelector('.ms-stage-nav');
        if (!stageNav) return;
        
        // Get fresh FLOW reference each time
        const FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
        if (!FLOW) {
          console.warn('[Phone Widget] buildStageNavigation: FLOW not available yet');
          return;
        }

        const node = FLOW[state.current] || FLOW.start;
        const currentStage = node.stage || '';
        // Handle gatekeeper states as part of Opening phase
        let currentPhaseName = '';
        if (state.current && state.current.startsWith('gatekeeper_')) {
          currentPhaseName = 'Opening';
        } else {
          currentPhaseName = PHASES.find(p => currentStage.includes(p.stagePattern))?.name || '';
          // Also check for Opening or Gatekeeper stages
          if (!currentPhaseName && (currentStage === 'Opening' || currentStage.includes('Gatekeeper'))) {
            currentPhaseName = 'Opening';
          }
        }

        stageNav.innerHTML = PHASES.map(phase => {
          const isActive = currentPhaseName === phase.name;
          let classes = 'btn-secondary ms-stage-btn';
          if (isActive) classes += ' active';
          return `<button type="button" class="${classes}" data-phase="${phase.name}" data-entry="${phase.entryPoint}">${phase.name}</button>`;
        }).join('');

        // Attach click handlers
        stageNav.querySelectorAll('.ms-stage-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const entryPoint = btn.getAttribute('data-entry');
            if (entryPoint && FLOW[entryPoint]) {
              startAt(entryPoint);
            }
          });
        });
      }

      // Buttons
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

      // Initialize empty and build stage navigation
      state.current = '';
      // Ensure opener is loaded and FLOW is available before first render
      openerLoadPromise.then(() => {
        // Check FLOW is available before building navigation
        const FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
        if (FLOW) {
          buildStageNavigation();
        } else {
          // FLOW not ready yet, wait a bit and retry
          setTimeout(() => {
            const retryFLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
            if (retryFLOW) {
              buildStageNavigation();
            } else {
              console.warn('[Phone Widget] FLOW not available during initialization, will build navigation when scripts button is clicked');
            }
          }, 500);
        }
      }).catch(() => {
        // On error, still try to build navigation if FLOW is available
        const FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
        if (FLOW) {
          buildStageNavigation();
        }
      });
    }

    function toggleMiniScripts(card){
      if (!card) return;
      const wrap = card.querySelector('.mini-scripts-wrap');
      if (!wrap) return;
      
      // If scripts UI hasn't been built yet, build it now
      // This ensures FLOW is available when scripts button is clicked
      const miniScripts = wrap.querySelector('.mini-scripts');
      if (!miniScripts) {
        // Wait a moment to ensure call-scripts.js has finished loading
        setTimeout(() => {
          buildMiniScriptsUI(card);
        }, 100);
        return;
      }
      
      // Ensure FLOW is available before showing scripts
      const displaySelector = '.ms-display';
      let display = card.querySelector(displaySelector);
      const FLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
      if (!FLOW) {
        console.warn('[Phone Widget] FLOW not available yet, waiting...');
        // Wait a bit and retry
        setTimeout(() => {
          const retryFLOW = window.callScriptsModule && window.callScriptsModule.FLOW;
          if (retryFLOW) {
            toggleMiniScripts(card); // Retry toggle
          } else {
            console.error('[Phone Widget] FLOW still not available after wait');
            if (!display && card) {
              display = card.querySelector(displaySelector);
            }
            if (display) {
              display.innerHTML = '<p style="color: var(--text-error); padding: var(--spacing-md);">Scripts not available. Please refresh the page.</p>';
            }
          }
        }, 500);
        return;
      }
      
      const isHidden = wrap.hasAttribute('hidden');
      
      if (isHidden) {
        // OPENING: Use CSS transition for smooth expansion
        const currentHeight = card.getBoundingClientRect().height;
        
        // Build UI and unhide
        buildMiniScriptsUI(card);
        wrap.removeAttribute('hidden');
        const miniScripts = wrap.querySelector('.mini-scripts');
        
        requestAnimationFrame(() => {
          // Set explicit start height
          card.style.height = currentHeight + 'px';
          card.style.overflow = 'hidden';
          
          requestAnimationFrame(() => {
            // Measure target height
            const tempHeight = card.style.height;
            card.style.height = 'auto';
            const targetHeight = card.scrollHeight;
            card.style.height = tempHeight;
            
            requestAnimationFrame(() => {
              // Trigger CSS transition
              card.style.height = targetHeight + 'px';
              if (miniScripts) miniScripts.classList.add('--show');
              
              // Focus input and cleanup after transition
              try { const si = wrap.querySelector('.ms-input'); if (si) setTimeout(() => si.focus(), 100); } catch(_) {}
              setTimeout(() => {
                card.style.height = '';
                card.style.overflow = '';
              }, 300);
            });
          });
        });
      } else {
        // CLOSING: Use CSS transition for smooth collapse
        const miniScripts = wrap.querySelector('.mini-scripts');
        const currentHeight = card.getBoundingClientRect().height;
        
        // Fade out content
        if (miniScripts) miniScripts.classList.remove('--show');
        
        requestAnimationFrame(() => {
          // Set explicit start height
          card.style.height = currentHeight + 'px';
          card.style.overflow = 'hidden';
          
          requestAnimationFrame(() => {
            // Measure target height (after hiding mini-scripts)
            wrap.setAttribute('hidden', '');
            const tempHeight = card.style.height;
            card.style.height = 'auto';
            const targetHeight = card.scrollHeight;
            card.style.height = tempHeight;
            wrap.removeAttribute('hidden');
            
            requestAnimationFrame(() => {
              // Trigger CSS transition
              card.style.height = targetHeight + 'px';
              
              // Clean up after transition
              setTimeout(() => {
                card.style.height = '';
                card.style.overflow = '';
                wrap.setAttribute('hidden', '');
                wrap.innerHTML = '';
              }, 300);
            });
          });
        });
      }
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
        
        // CRITICAL: Skip context clearing if this input matches the current call context number
        // This indicates it's a programmatic set from callNumber, not user typing
        // Check if we have context data (IDs, names, company) even if isActive isn't set yet
        const normalizedValue = value.replace(/\D/g, '');
        const normalizedContextNumber = (currentCallContext?.number || '').replace(/\D/g, '');
        // Check for stored programmatic context on the input element (set before input.value assignment)
        const storedContext = input._programmaticContext;
        const normalizedStoredNumber = (storedContext?.number || '').replace(/\D/g, '');
        const hasContextData = !!(currentCallContext && (
          currentCallContext.accountId || currentCallContext.contactId || 
          currentCallContext.name || currentCallContext.company || currentCallContext.accountName
        ));
        const hasStoredContextData = !!(storedContext && (
          storedContext.accountId || storedContext.contactId || 
          storedContext.name || storedContext.company
        ));
        // Check both currentCallContext and stored programmatic context
        const isProgrammaticSet = (normalizedValue === normalizedContextNumber && hasContextData) ||
                                  (normalizedValue === normalizedStoredNumber && hasStoredContextData);
        
        if (isProgrammaticSet) {
          console.debug('[Phone] Input event from programmatic set - preserving context');
          // If we have stored context but currentCallContext was cleared, restore it
          if (hasStoredContextData && !hasContextData && storedContext) {
            console.debug('[Phone] Restoring context from stored programmatic context');
            currentCallContext = {
              number: storedContext.number || '',
              name: storedContext.name || '',
              company: storedContext.company || '',
              accountId: storedContext.accountId || null,
              accountName: storedContext.company || null,
              contactId: storedContext.contactId || null,
              contactName: storedContext.name || '',
              city: storedContext.city || '',
              state: storedContext.state || '',
              domain: storedContext.domain || '',
              logoUrl: storedContext.logoUrl || '',
              isCompanyPhone: storedContext.isCompanyPhone || false,
              isActive: true
            };
          }
          // Clear the stored context after using it
          if (input._programmaticContext) {
            delete input._programmaticContext;
          }
          return;
        }
        
        if (!value.trim()) {
          try { clearContactDisplay(); } catch(_) {}
          // Also clear the context when input is cleared
          // BUT: Don't clear if a call is in progress
          if (!isCallInProgress) {
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
        }
        // When user starts typing a new number, clear stale context from previous calls
        // This ensures manual entry doesn't show old company info
        // BUT: Don't clear context if a call is currently in progress (isCallInProgress)
        // CRITICAL: Also don't clear if the input value matches the current context number
        // This prevents clearing context when callNumber programmatically sets the input value
        // Reuse normalizedValue and normalizedContextNumber already declared above
        const valueMatchesContext = normalizedValue && normalizedContextNumber && normalizedValue === normalizedContextNumber;
        // Reuse hasContextData already declared above
        
        if (value.trim() && currentCallContext.isActive === false && !isCallInProgress && !valueMatchesContext && !hasContextData) {
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
        // BUT: Don't clear context if a call is currently in progress
        if (value.trim() && currentCallContext.isActive && currentCallContext.number && 
            currentCallContext.number !== value.trim() && !isCallInProgress) {
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
              
              // Try 'default' first, fallback to first available device
              if (!deviceIds.includes('default') && deviceIds.length > 0) {
                inputDeviceId = deviceIds[0];
              }
            }
            
            try {
              await device.audio.setInputDevice(inputDeviceId);
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
                
                if (!deviceIds.includes('default') && deviceIds.length > 0) {
                  outputDeviceId = deviceIds[0];
                }
              }
              
              try {
                device.audio.speakerDevices.set(outputDeviceId);
              } catch (e) {
                console.warn('[Phone] Failed to set output device, using browser default:', e);
              }
            } catch (e) {
              console.warn('[Phone] Failed to access output devices:', e);
              // Continue without setting output device - Twilio will use browser default
            }
          }
        }
        
        // Get selected phone number from settings for caller ID
        const selectedCallerId = getSelectedPhoneNumber();
        console.debug('[Phone] Using caller ID:', selectedCallerId);
        
        // Verify TwiML App configuration before making call
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        const expectedVoiceUrl = `${base}/api/twilio/voice`;
        console.debug('[Phone] Expected TwiML App Voice URL:', expectedVoiceUrl);
        console.debug('[Phone] Make sure your TwiML App (configured in TWILIO_TWIML_APP_SID) has Voice URL set to:', expectedVoiceUrl);
        
        // Make the call with recording enabled via TwiML app
        // Pass From parameter so TwiML webhook can use it as callerId
        try {
          currentCall = await device.connect({
            params: {
              To: number,
              From: selectedCallerId  // Pass selected Twilio number as caller ID
            }
          });
          console.debug('[Phone] Browser call initiated successfully via TwiML App');
        } catch (connectError) {
          console.error('[Phone] device.connect() failed:', connectError);
          console.error('[Phone] Error details:', {
            message: connectError?.message,
            code: connectError?.code,
            name: connectError?.name,
            stack: connectError?.stack
          });
          // Check if error suggests wrong TwiML App URL
          if (connectError?.message?.includes('external') || connectError?.message?.includes('url') || connectError?.message?.includes('webhook')) {
            console.error('[Phone] ERROR: TwiML App Voice URL may be misconfigured!');
            console.error('[Phone] Please verify in Twilio Console that your TwiML App Voice URL points to:', expectedVoiceUrl);
            try { window.crm?.showToast && window.crm.showToast('TwiML App configuration error - check console'); } catch(_) {}
          }
          throw connectError;
        }
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
            // Check if we have existing context - look for IDs, names, or company info
            // This prevents losing context when navigating away before call connects
            // CRITICAL: Check for context data (IDs, names, company) even if isActive isn't set yet
            // This ensures we preserve context that was set by click-to-call before the call connects
            const hasExistingContext = !!(currentCallContext && (
              currentCallContext.accountId ||
              currentCallContext.contactId ||
              currentCallContext.name || 
              currentCallContext.contactName ||
              currentCallContext.company || 
              currentCallContext.accountName
            ));
            
            console.debug('[Phone] Call accept - hasExistingContext:', hasExistingContext, 'currentCallContext:', currentCallContext);
            
            let meta = {};
            // CRITICAL: Capture context snapshot BEFORE async operations to prevent it from being cleared
            const contextSnapshot = hasExistingContext ? {
              ...currentCallContext,
              accountId: currentCallContext.accountId || null,
              contactId: currentCallContext.contactId || null,
              name: currentCallContext.name || currentCallContext.contactName || '',
              contactName: currentCallContext.contactName || '',
              company: currentCallContext.company || currentCallContext.accountName || '',
              accountName: currentCallContext.accountName || '',
              city: currentCallContext.city || '',
              state: currentCallContext.state || '',
              domain: currentCallContext.domain || '',
              logoUrl: currentCallContext.logoUrl || '',
              isCompanyPhone: currentCallContext.isCompanyPhone || false
            } : null;
            
            if (!hasExistingContext) {
              // Only resolve if we don't have context - prevents DOM lookup after navigation
              console.debug('[Phone] No existing context, resolving phone meta for:', number);
              // Pass contextSnapshot (or currentCallContext if snapshot is null) to preserve any context that might exist
              meta = await resolvePhoneMeta(number, contextSnapshot || currentCallContext).catch((err) => {
                console.warn('[Phone] Failed to resolve phone meta:', err);
                return {};
              });
            } else {
              console.debug('[Phone] Using existing context, skipping phone meta resolution');
              // Use the context snapshot to build meta for display
              if (contextSnapshot) {
                meta = {
                  name: contextSnapshot.name || contextSnapshot.contactName || '',
                  account: contextSnapshot.company || contextSnapshot.accountName || '',
                  company: contextSnapshot.company || contextSnapshot.accountName || '',
                  city: contextSnapshot.city || '',
                  state: contextSnapshot.state || '',
                  domain: contextSnapshot.domain || '',
                  logoUrl: contextSnapshot.logoUrl || '',
                  contactId: contextSnapshot.contactId || null,
                  accountId: contextSnapshot.accountId || null
                };
              }
            }
            
            // Merge call context data with resolved meta to ensure company info is preserved
            // ALWAYS prefer existing context over resolved meta to preserve names after navigation
            // Use contextSnapshot if available (captured before async operations), otherwise fall back to currentCallContext
            const contextToMerge = contextSnapshot || currentCallContext;
            const mergedMeta = {
              ...meta,
              // Always merge context if it exists, preserving all fields
              ...(contextToMerge && {
                // Preserve IDs first (these are the most reliable identifiers)
                contactId: contextToMerge.contactId || meta.contactId || null,
                accountId: contextToMerge.accountId || meta.accountId || null,
                // Always prefer existing context over resolved meta to preserve names after navigation
                name: contextToMerge.name || contextToMerge.contactName || meta.name || '',
                account: contextToMerge.company || contextToMerge.accountName || meta.account || '',
                company: contextToMerge.company || contextToMerge.accountName || meta.company || '',
                accountName: contextToMerge.accountName || meta.accountName || '',
                contactName: contextToMerge.contactName || meta.contactName || '',
                // In company mode, prefer account context only to avoid contact contamination
                city: contextToMerge.isCompanyPhone ? (contextToMerge.city || meta.city || '') : (contextToMerge.city || meta.city || ''),
                state: contextToMerge.isCompanyPhone ? (contextToMerge.state || meta.state || '') : (contextToMerge.state || meta.state || ''),
                // Always preserve domain from context - needed for favicon fallback
                domain: contextToMerge.domain || meta.domain || '',
                // Preserve logoUrl from context even if empty - prevents favicon from being cleared
                // Only use meta.logoUrl if contextToMerge doesn't have domain for fallback
                logoUrl: (contextToMerge.logoUrl !== undefined && contextToMerge.logoUrl !== null) ? contextToMerge.logoUrl : (meta.logoUrl || ''),
                // Preserve phone type and other flags
                isCompanyPhone: contextToMerge.isCompanyPhone !== undefined ? contextToMerge.isCompanyPhone : (meta.isCompanyPhone || false),
                phoneType: contextToMerge.phoneType || meta.phoneType || null
              })
            };
            
            console.debug('[Phone] Merged meta for contact display:', mergedMeta);
            setContactDisplay(mergedMeta, number);
          } catch(err) {
            console.error('[Phone] Error setting contact display on call accept:', err);
          }
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
          
          // CRITICAL: Terminate all related call legs BEFORE disconnecting browser client
          // Collect all CallSids: server call, browser call, and any stored child SIDs
          const callSidsToTerminate = [];
          
          // Add server-side call SID (parent call from API)
          if (window.currentServerCallSid) {
            callSidsToTerminate.push(window.currentServerCallSid);
          }
          
          // Add browser client CallSid if available
          try {
            if (currentCall && currentCall.parameters) {
              const browserCallSid = currentCall.parameters.CallSid || currentCall.parameters.callSid;
              if (browserCallSid && !callSidsToTerminate.includes(browserCallSid)) {
                callSidsToTerminate.push(browserCallSid);
              }
            }
            if (TwilioRTC.state?.connection?.parameters) {
              const connCallSid = TwilioRTC.state.connection.parameters.CallSid || TwilioRTC.state.connection.parameters.callSid;
              if (connCallSid && !callSidsToTerminate.includes(connCallSid)) {
                callSidsToTerminate.push(connCallSid);
              }
            }
          } catch(_) {}
          
          // Add any stored child CallSids (from status callbacks)
          try {
            if (window.storedDialCallSids && Array.isArray(window.storedDialCallSids)) {
              window.storedDialCallSids.forEach(sid => {
                if (sid && !callSidsToTerminate.includes(sid)) {
                  callSidsToTerminate.push(sid);
                }
              });
            }
          } catch(_) {}
          
          // Terminate all call legs BEFORE disconnecting browser client (per Twilio recommendation)
          if (callSidsToTerminate.length > 0) {
            try {
              const base = (window.API_BASE_URL || '').replace(/\/$/, '');
              console.debug('[Phone] DISCONNECT: Terminating all call legs before browser disconnect:', callSidsToTerminate);
              // Fire-and-forget; do not await
              fetch(`${base}/api/twilio/hangup`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSids: callSidsToTerminate })
              }).catch(()=>{});
            } catch(_) { /* ignore */ }
            window.currentServerCallSid = null;
            window.storedDialCallSids = null;
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
        
        // Get selected phone number from settings for caller ID
        const selectedCallerId = getSelectedPhoneNumber();
        
        const callData = {
          from: selectedCallerId, // Use selected Twilio number from settings
          to: number, // Target number to call
          agent_phone: '+19728342317' // Your personal phone that will ring first
        };
        
        console.debug('[Phone] Making CRM API call with caller ID:', selectedCallerId, callData);
        
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
        // For outgoing calls, use selected phone number as 'from' and target number as 'to'
        const isIncoming = callType === 'incoming';
        const biz = isIncoming ? getBusinessNumberE164() : getSelectedPhoneNumber();
        const callFrom = isIncoming ? (fromNumber || phoneNumber) : biz;
        const callTo = isIncoming ? biz : phoneNumber;
        
        // Get current user email for ownership tracking
        const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
          ? window.DataManager.getCurrentUserEmail()
          : ((window.currentUserEmail || '').toLowerCase());
        
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
            // CRITICAL: Add userEmail for ownership tracking (allows employees to see their own calls)
            userEmail: userEmail || null,
            agentEmail: userEmail || null,
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
        
        // Get current user email for ownership tracking
        const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
          ? window.DataManager.getCurrentUserEmail()
          : ((window.currentUserEmail || '').toLowerCase());
        
        const payload = {
          callSid: callSid,
          to: callTo,
          from: callFrom,
          status: status,
          duration: duration,
          durationSec: duration,
          callTime: timestamp,
          timestamp: timestamp,
          // CRITICAL: Add userEmail for ownership tracking (allows employees to see their own calls)
          userEmail: userEmail || null,
          agentEmail: userEmail || null,
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
            // Dispatch event to update "No Calls" badges on People/Accounts pages
            try {
              const eventDetail = { 
                call: respJson.call || payload,
                targetPhone: payload.targetPhone,
                accountId: payload.accountId,
                contactId: payload.contactId
              };
              document.dispatchEvent(new CustomEvent('pc:call-logged', { detail: eventDetail }));
            } catch (e) { 
              console.error('[Phone] Error dispatching pc:call-logged event:', e);
            }
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
        
        // CRITICAL: Terminate all related call legs BEFORE clearing state
        // Collect all CallSids: server call, browser call, and any stored child SIDs
        const callSidsToTerminate = [];
        
        // Add server-side call SID
        if (window.currentServerCallSid) {
          callSidsToTerminate.push(window.currentServerCallSid);
        }
        
        // Add browser client CallSids
        try {
          if (currentCall && currentCall.parameters) {
            const browserCallSid = currentCall.parameters.CallSid || currentCall.parameters.callSid;
            if (browserCallSid && !callSidsToTerminate.includes(browserCallSid)) {
              callSidsToTerminate.push(browserCallSid);
            }
          }
          if (TwilioRTC.state?.connection?.parameters) {
            const connCallSid = TwilioRTC.state.connection.parameters.CallSid || TwilioRTC.state.connection.parameters.callSid;
            if (connCallSid && !callSidsToTerminate.includes(connCallSid)) {
              callSidsToTerminate.push(connCallSid);
            }
          }
        } catch(_) {}
        
        // Add stored child CallSids
        try {
          if (window.storedDialCallSids && Array.isArray(window.storedDialCallSids)) {
            window.storedDialCallSids.forEach(sid => {
              if (sid && !callSidsToTerminate.includes(sid)) {
                callSidsToTerminate.push(sid);
              }
            });
          }
        } catch(_) {}
        
        // Terminate all call legs BEFORE disconnecting browser client (per Twilio recommendation)
        if (callSidsToTerminate.length > 0) {
          try {
            const base = (window.API_BASE_URL || '').replace(/\/$/, '');
            console.debug('[Phone] Manual hangup - terminating all call legs:', callSidsToTerminate);
            fetch(`${base}/api/twilio/hangup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callSids: callSidsToTerminate })
            }).catch(() => {});
          } catch(_) {}
          window.currentServerCallSid = null;
          window.storedDialCallSids = null;
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
          // Pass currentCallContext to preserve any context that might exist
          const freshMeta = await resolvePhoneMeta(normalized.value, currentCallContext).catch(() => ({}));
          
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
            
            // Check if bridge to mobile is enabled - if so, skip browser call and go straight to server call
            const bridgeToMobile = isBridgeToMobileEnabled();
            if (bridgeToMobile) {
              console.debug('[Phone] Bridge to mobile enabled - using server call (mobile phone)');
              try { window.crm?.showToast && window.crm.showToast(`Calling ${normalized.value} - your phone will ring first...`); } catch (_) {}
              try {
                await fallbackServerCall(normalized.value);
              } catch (e2) {
                console.error('[Phone] Server call failed:', e2?.message || e2);
                try { window.crm?.showToast && window.crm.showToast(`Call failed: ${e2?.message || 'Error'}`); } catch (_) {}
              }
              return; // Exit early - server call attempted
            }
            
            // Bridge to mobile is OFF - try browser call first
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
          // No microphone permission or browser calling disabled
          // Check if bridge to mobile is enabled (even without mic permission, we can still bridge)
          const bridgeToMobile = isBridgeToMobileEnabled();
          if (!isCallInProgress) {
            console.debug('[Phone] Aborting: user canceled before server call');
            return;
          }
          
          if (bridgeToMobile) {
            console.debug('[Phone] Using server-based calling (bridge to mobile enabled)');
            try { window.crm?.showToast && window.crm.showToast(`Calling ${normalized.value} - your phone will ring first...`); } catch (_) {}
          } else {
            console.debug('[Phone] Using server-based calling (no mic permission)');
            try { window.crm?.showToast && window.crm.showToast(`Calling ${normalized.value} - your phone will ring first...`); } catch (_) {}
          }
          
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
    
    // Open phone widget if not already open
    const wasClosed = !document.getElementById(WIDGET_ID);
    if (wasClosed) {
      openPhone();
    }
    
    // Get the card element (it should exist now, either from openPhone() or already in DOM)
    let card = document.getElementById(WIDGET_ID);
    
    // CRITICAL: Store context snapshot on input element AFTER openPhone() to ensure it exists
    // This allows the input handler to detect programmatic sets even if currentCallContext is cleared
    if (card) {
      const input = card.querySelector('.phone-display');
      if (input && (nextContext.accountId || nextContext.contactId || nextContext.name || nextContext.company)) {
        // Store a snapshot of the context on the input element
        input._programmaticContext = {
          number: nextContext.number,
          name: nextContext.name || nextContext.contactName || '',
          company: nextContext.company || nextContext.accountName || '',
          accountId: nextContext.accountId || null,
          contactId: nextContext.contactId || null,
          city: nextContext.city || '',
          state: nextContext.state || '',
          domain: nextContext.domain || '',
          logoUrl: nextContext.logoUrl || '',
          isCompanyPhone: nextContext.isCompanyPhone || false
        };
        // Clear the snapshot after a short delay to allow input event to fire
        setTimeout(() => {
          if (input._programmaticContext) {
            delete input._programmaticContext;
          }
        }, 100);
      }
    }
    
    // Update the widget display with the new context
    try {
      // Build proper meta object for setContactDisplay
      // setContactDisplay expects meta.name, meta.account, etc., not currentCallContext directly
      const displayMeta = {
        name: currentCallContext.name || currentCallContext.contactName || '',
        account: currentCallContext.company || currentCallContext.accountName || '',
        company: currentCallContext.company || currentCallContext.accountName || '',
        city: currentCallContext.city || '',
        state: currentCallContext.state || '',
        domain: currentCallContext.domain || '',
        logoUrl: currentCallContext.logoUrl || ''
      };
      setContactDisplay(displayMeta, number);
    } catch (e) {
      console.warn('[Phone Widget] Failed to update contact display:', e);
    }
    
    // Populate number immediately and optionally auto-trigger call within user gesture
    if (card) {
      const input = card.querySelector('.phone-display');
      if (input) {
        input.value = number;
      }
      // Do not modify header title; in-call contact info will render inside the body instead
      // Auto-trigger call only if explicitly requested and conditions are met
      // Do NOT require contactName for auto-trigger (some contexts may not provide it)
      if (number && autoTrigger) {
        // If widget was just opened, wait a bit for DOM to settle before looking for button
        const findAndClickButton = () => {
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
        };
        
        // If widget was just opened, wait for DOM to settle before looking for button
        if (wasClosed) {
          // Use requestAnimationFrame to wait for DOM to be ready
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              findAndClickButton();
            });
          });
        } else {
          // Widget was already open, button should be available immediately
          findAndClickButton();
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
      
      // Set new context - preserve all fields including empty strings and nulls
      // Use explicit checks to preserve empty strings (which are falsy but valid)
      currentCallContext.accountId = (ctx.accountId !== undefined && ctx.accountId !== null) ? ctx.accountId : null;
      currentCallContext.accountName = (ctx.accountName !== undefined && ctx.accountName !== null) ? ctx.accountName : null;
      currentCallContext.contactId = (ctx.contactId !== undefined && ctx.contactId !== null) ? ctx.contactId : null;
      currentCallContext.contactName = (ctx.contactName !== undefined && ctx.contactName !== null) ? ctx.contactName : null;
      currentCallContext.company = (ctx.company !== undefined) ? ctx.company : '';
      currentCallContext.name = (ctx.name !== undefined) ? ctx.name : '';
      currentCallContext.city = (ctx.city !== undefined) ? ctx.city : '';
      currentCallContext.state = (ctx.state !== undefined) ? ctx.state : '';
      currentCallContext.domain = (ctx.domain !== undefined) ? ctx.domain : '';
      currentCallContext.logoUrl = (ctx.logoUrl !== undefined) ? ctx.logoUrl : '';
      currentCallContext.isCompanyPhone = (ctx.isCompanyPhone !== undefined) ? ctx.isCompanyPhone : false;
      currentCallContext.suggestedContactId = (ctx.suggestedContactId !== undefined && ctx.suggestedContactId !== null) ? ctx.suggestedContactId : null;
      currentCallContext.suggestedContactName = (ctx.suggestedContactName !== undefined) ? ctx.suggestedContactName : '';
      // Preserve phoneType if provided
      if (ctx.phoneType !== undefined) currentCallContext.phoneType = ctx.phoneType;
      
      console.debug('[Phone Widget] Call context updated:', currentCallContext);
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
    
    // Expose currentCallContext globally so call-scripts.js can access contact/account IDs
    Object.defineProperty(window, 'currentCallContext', {
      get: () => currentCallContext,
      set: (val) => { currentCallContext = val; },
      configurable: true,
      enumerable: true
    });
    
    // Debug helper to check Twilio configuration
    window.debugTwilio = async function() {
      try {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        
        // Check token endpoint
        const resp = await fetch(`${base}/api/twilio/token?identity=agent`);
        
        if (resp.ok) {
          const data = await resp.json();
          
          if (data.token) {
            // Decode JWT to see what's in it (just the payload, not validating signature)
            try {
              const parts = data.token.split('.');
              const payload = JSON.parse(atob(parts[1]));
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
          try {
            const device = await TwilioRTC.ensureDevice();
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
