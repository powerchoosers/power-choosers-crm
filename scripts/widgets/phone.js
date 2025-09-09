(function () {
  'use strict';

  // Phone Widget (Dialer) - Fully migrated to Twilio
  // Exposes: window.Widgets.openPhone(), window.Widgets.closePhone(), window.Widgets.isPhoneOpen()
  // Global call function: window.Widgets.callNumber(number, name)
  if (!window.Widgets) window.Widgets = {};

  // Business phone number for fallback calls
  const BUSINESS_PHONE = '8176630380'; // Your Twilio number without formatting

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
          channelCount: 1
        });
        
        // Set default input device
        state.device.audio.setInputDevice('default');

        // Set up device event handlers
        state.device.on('registered', () => {
          console.debug('[TwilioRTC] Device registered and ready');
          try { window.crm?.showToast && window.crm.showToast('Browser calling ready'); } catch(_) {}
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

          // Ensure the phone widget is open so UI updates work
          if (!document.getElementById(WIDGET_ID)) {
            try { openPhone(); } catch (_) {}
          }
          const cardForIncoming = document.getElementById(WIDGET_ID);

          // Set input/output devices before accepting the call
          if (state.device.audio) {
            try {
              // Use a more conservative approach for input device selection
              await state.device.audio.setInputDevice('default');
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

            // If the caller hangs up (cancels) before we accept, immediately clean up UI/state
            try {
              conn.on('cancel', () => {
                console.debug('[TwilioRTC] Incoming call canceled by remote - cleaning up UI');
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
                  }
                } catch(_) {}
                // Ensure timers/states are reset
                try { stopLiveCallTimer(document.getElementById(WIDGET_ID)); } catch(_) {}
                isCallInProgress = false;
                currentCallContext = { number: '', name: '', isActive: false };
                // Remove incoming notification if present
                try {
                  const n = document.getElementById(CALL_NOTIFY_ID);
                  if (n) n.remove();
                } catch(_) {}
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

            // Pre-populate UI while ringing: show Hang Up to allow declining, and show number/name
            try {
              if (!document.getElementById(WIDGET_ID)) openPhone();
              const card0 = document.getElementById(WIDGET_ID);
              if (card0) {
                const btn0 = card0.querySelector('.call-btn-start');
                if (btn0) {
                  btn0.textContent = 'Hang Up';
                  btn0.classList.remove('btn-primary');
                  btn0.classList.add('btn-danger');
                }
                const input0 = card0.querySelector('.phone-display');
                if (input0) {
                  console.debug('[Phone] Setting ringing input to caller number:', number);
                  input0.value = number;
                }
                const title0 = card0.querySelector('.widget-title');
                if (title0 && (meta?.name || meta?.account)) title0.innerHTML = `Phone - ${meta?.name || meta?.account}`;
              }
            } catch(_) {}

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
                    currentCallContext = { number: '', name: '', isActive: false };
                    const cardGone = document.getElementById(WIDGET_ID);
                    if (cardGone) {
                      const btnGone = cardGone.querySelector('.call-btn-start');
                      if (btnGone) { btnGone.textContent = 'Call'; btnGone.classList.remove('btn-danger'); btnGone.classList.add('btn-primary'); }
                      const inputGone = cardGone.querySelector('.phone-display');
                      if (inputGone) inputGone.value = '';
                      const titleGone = cardGone.querySelector('.widget-title');
                      if (titleGone) titleGone.innerHTML = 'Phone';
                    }
                    try { const n = document.getElementById(CALL_NOTIFY_ID); if (n) n.remove(); } catch(_) {}
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
                      if (!deviceIds.includes('default') && deviceIds.length > 0) inputDeviceId = deviceIds[0];
                    }
                    await state.device.audio.setInputDevice(inputDeviceId);
                  } catch(_) {}
                }
                conn.accept();
                isCallInProgress = true;
                // Store the connection reference
                TwilioRTC.state.connection = conn;
                currentCallContext = { number: number, name: meta?.name || '', isActive: true };
                // Start live timer banner
                startLiveCallTimer(document.getElementById(WIDGET_ID));
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
                  const title = card.querySelector('.widget-title');
                  if (title && (meta?.name || meta?.account)) title.innerHTML = `Phone - ${meta?.name || meta?.account}`;
                }
                const callStartTime = Date.now();
                const callId = `call_${callStartTime}_${(number || '').replace(/\D/g, '')}`;
                if (typeof updateCallStatus === 'function') {
                  updateCallStatus(number, 'connected', callStartTime, 0, callId, number, 'incoming');
                } else {
                  console.warn('[TwilioRTC] updateCallStatus not available - skipping status update');
                }

                conn.on('disconnect', async () => {
                  console.debug('[TwilioRTC] Incoming call disconnected - cleaning up UI');
                  const callEndTime = Date.now();
                  const duration = Math.floor((callEndTime - callStartTime) / 1000);
                  
                  // IMMEDIATE state clearing to prevent issues
                  const disconnectTime = Date.now();
                  lastCallCompleted = disconnectTime;
                  lastCalledNumber = number;
                  isCallInProgress = false;
                  autoTriggerBlockUntil = Date.now() + 15000; // Increased to 15s hard block after call
                  currentCallContext = { number: '', name: '', isActive: false };
                  
                  // Clear ALL connection state IMMEDIATELY
                  TwilioRTC.state.pendingIncoming = null;
                  TwilioRTC.state.connection = null;
                  
                  // Force UI cleanup
                  const card2 = document.getElementById(WIDGET_ID);
                  if (card2) {
                    const btn2 = card2.querySelector('.call-btn-start');
                    if (btn2) {
                      btn2.textContent = 'Call';
                      btn2.classList.remove('btn-danger');
                      btn2.classList.add('btn-primary');
                      // Disable button briefly to prevent accidental clicks
                      btn2.disabled = true;
                      setTimeout(() => { btn2.disabled = false; }, 2000);
                    }
                    // Clear input and reset title
                    const input2 = card2.querySelector('.phone-display');
                    if (input2) input2.value = '';
                    const title2 = card2.querySelector('.widget-title');
                    if (title2) title2.innerHTML = 'Phone';
                  }
                  
                  // Stop live timer and restore banner
                  stopLiveCallTimer(card2);
                  
                  // Release audio devices with error handling
                  if (TwilioRTC.state.device && TwilioRTC.state.device.audio) {
                    try { 
                      await TwilioRTC.state.device.audio.unsetInputDevice();
                      console.debug('[TwilioRTC] Audio input device released after incoming call disconnect');
                    } catch (e) {
                      console.warn('[TwilioRTC] Failed to release audio input device:', e);
                    }
                  }
                  
                  // Guard: updateCallStatus may not be defined yet if widget hasn't been created
                  if (typeof updateCallStatus === 'function') {
                    updateCallStatus(number, 'completed', callStartTime, duration, callId, number, 'incoming');
                  } else {
                    console.warn('[TwilioRTC] updateCallStatus not available - skipping status update');
                  }
                  
                  // Add call completed notification
                  if (window.Notifications && typeof window.Notifications.addCallCompleted === 'function') {
                    window.Notifications.addCallCompleted(number, meta?.name || meta?.account, duration);
                  }
                  
                  console.debug('[TwilioRTC] Incoming call cleanup complete - anti-redial protection active');
                });

                conn.on('error', (error) => {
                  console.error('[TwilioRTC] Incoming call error:', error);
                  isCallInProgress = false;
                  currentCallContext = { number: '', name: '', isActive: false };
                  
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
                  }
                  // Stop live timer and restore banner
                  stopLiveCallTimer(card3);
                  lastCallCompleted = Date.now();
                  autoTriggerBlockUntil = Date.now() + 10000;
                  // Guard: updateCallStatus may not be defined yet if widget hasn't been created
                  if (typeof updateCallStatus === 'function') {
                    updateCallStatus(number, 'error', callStartTime, 0, callId, number, 'incoming');
                  } else {
                    console.warn('[TwilioRTC] updateCallStatus not available - skipping status update');
                  }
                });
              } catch (e) {
                console.error('[TwilioRTC] Failed to accept incoming call:', e);
              }
            };

            // Show notification
            showIncomingNotification({
              number,
              meta,
              onClick: accept,
              onClose: () => { 
                // Add missed call notification when user dismisses
                if (window.Notifications && typeof window.Notifications.addMissedCall === 'function') {
                  window.Notifications.addMissedCall(number, meta?.name || meta?.account);
                }
              }
            });

            // Optional: auto-dismiss notification after 25s (typical ring window)
            setTimeout(() => {
              const n = document.getElementById(CALL_NOTIFY_ID);
              if (n && !isCallInProgress) { try { n.remove(); } catch(_) {} }
            }, 25000);
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
    
    return { state, ensureDevice, shutdown };
  })();

  const WIDGET_ID = 'phone-widget';
  const CALL_NOTIFY_ID = 'incoming-call-notification';

  // Inject minimal styles for incoming call notification (distinct from regular toasts)
  function ensureCallNotifyStyles() {
    if (document.getElementById('call-notify-styles')) return;
    const style = document.createElement('style');
    style.id = 'call-notify-styles';
    style.textContent = `
      .call-notify {
        position: fixed; z-index: 99999; right: 16px; top: 72px; max-width: 420px;
        background: linear-gradient(135deg, #0d5, #0aa); color: #fff; border-radius: 10px;
        box-shadow: 0 10px 28px rgba(0,0,0,0.25); padding: 14px 16px; display: flex; gap: 12px;
        align-items: center; cursor: pointer; border: 2px solid rgba(255,255,255,0.15);
        transition: transform .18s ease, opacity .18s ease; opacity: 0; transform: translateY(-8px);
      }
      .call-notify.show { opacity: 1; transform: translateY(0); }
      .call-notify .call-avatar { width: 40px; height: 40px; flex: 0 0 auto; border-radius: 8px; background:#fff2; display:flex; align-items:center; justify-content:center; font-weight:700; }
      .call-notify .call-meta { flex: 1 1 auto; min-width: 0; }
      .call-notify .call-title { font-size: 15px; font-weight: 700; line-height: 1.25; margin: 0; }
      .call-notify .call-sub { font-size: 12px; opacity: 0.9; line-height: 1.25; margin-top: 2px; }
      .call-notify .call-number { font-size: 13px; font-weight: 600; opacity: .95; }
      .call-notify .call-close { flex: 0 0 auto; background:#fff2; color:#fff; border: none; border-radius:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; }
      .call-notify:hover { box-shadow: 0 14px 34px rgba(0,0,0,0.3); }
    `;
    document.head.appendChild(style);
  }

  async function resolvePhoneMeta(number) {
    const digits = (number || '').replace(/\D/g, '');
    const meta = { number, name: '', account: '', title: '', city: '', state: '', domain: '' };
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
        const r1 = await fetch(`${base}/api/search?phone=${encodeURIComponent(digits)}`).catch(() => null);
        if (r1 && r1.ok) {
          const j = await r1.json().catch(() => ({}));
          if (j && (j.contact || j.account)) {
            const c = j.contact || {};
            const a = j.account || {};
            return {
              ...meta,
              name: c.name || '',
              account: a.name || c.account || '',
              title: c.title || '',
              city: c.city || a.city || '',
              state: c.state || a.state || '',
              domain: c.domain || a.domain || ''
            };
          }
        }
      }
    } catch (_) {}
    return meta;
  }

  function makeFavicon(domain) {
    if (!domain) return '';
    const d = domain.replace(/^https?:\/\//, '');
    const src = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent('https://' + d)}`;
    return src;
  }

  function computeTopForNotification() {
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) {
        const r = panel.getBoundingClientRect();
        return Math.max(56, Math.round(r.top + 12));
      }
      const header = document.querySelector('#topbar, .topbar, .pc-topbar, header, .header, .navbar');
      if (header) {
        const r2 = header.getBoundingClientRect();
        return Math.max(56, Math.round(r2.bottom + 12));
      }
    } catch(_) {}
    return 72; // default under top bar
  }

  function showIncomingNotification(opts) {
    ensureCallNotifyStyles();
    const { number, meta, onClick, onClose } = opts;
    const el = document.createElement('div');
    el.className = 'call-notify';
    el.id = CALL_NOTIFY_ID;
    el.style.top = computeTopForNotification() + 'px';

    const nameLine = meta?.name || meta?.account || 'Incoming call';
    const subLine = [meta?.account && meta?.name ? meta.account : '', meta?.title].filter(Boolean).join(' • ');
    const locLine = [meta?.city, meta?.state].filter(Boolean).join(', ');
    const favicon = makeFavicon(meta?.domain);

    el.innerHTML = `
      <div class="call-avatar">${favicon ? `<img src="${favicon}" alt="" style="width:24px;height:24px;border-radius:4px;">` : '📞'}</div>
      <div class="call-meta">
        <div class="call-title">${nameLine}</div>
        <div class="call-sub">${[locLine, meta?.account && !meta?.name ? meta.account : ''].filter(Boolean).join(' • ')}</div>
        <div class="call-number">${number}</div>
      </div>
      <button class="call-close" title="Dismiss" aria-label="Dismiss">×</button>
    `;

    const closeBtn = el.querySelector('.call-close');
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); try { el.remove(); } catch(_) {} onClose && onClose(); });
    el.addEventListener('click', () => { try { el.remove(); } catch(_) {} onClick && onClick(); });

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    return el;
  }

  // Current call context
  let currentCallContext = {
    number: '',
    name: '',
    company: '',
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    isActive: false
  };

  // Live call duration timer helpers
  let callTimerHandle = null;
  let callTimerStartedAt = 0;
  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  function setMicBanner(card, className, text) {
    const micStatus = card.querySelector('.mic-status');
    const micText = card.querySelector('.mic-text');
    if (!micStatus || !micText) return;
    micStatus.classList.remove('ok', 'warn', 'error', 'checking', 'ready', 'active');
    if (className) micStatus.classList.add(className);
    micText.textContent = text;
  }
  function startLiveCallTimer(card) {
    if (!card) card = document.getElementById(WIDGET_ID);
    if (!card) return;
    // switch banner style to active and start ticking
    callTimerStartedAt = Date.now();
    setMicBanner(card, 'active', '0:00');
    if (callTimerHandle) clearInterval(callTimerHandle);
    callTimerHandle = setInterval(() => {
      const elapsed = Date.now() - callTimerStartedAt;
      const micText = card.querySelector('.mic-text');
      if (micText) micText.textContent = formatDuration(elapsed);
    }, 1000);
  }
  function stopLiveCallTimer(card) {
    if (callTimerHandle) {
      clearInterval(callTimerHandle);
      callTimerHandle = null;
    }
    if (!card) card = document.getElementById(WIDGET_ID);
    if (!card) return;
    // restore the idle banner depending on mic permission state
    if (TwilioRTC.state.micPermissionGranted) {
      setMicBanner(card, 'ok', 'Browser calls enabled');
    } else {
      setMicBanner(card, 'warn', 'Will call your phone - click here to retry microphone access');
    }
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
        try { window.crm?.showToast && window.crm.showToast('Browser calls enabled'); } catch(_) {}
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
  // - If it starts with '+', keep country code and digits.
  // - If 10 digits, assume US and prefix +1.
  // - If 11 digits starting with 1, normalize to +1##########.
  // - Otherwise, if digits 8-15 long without '+', prefix '+' and validate.
  // Returns { ok: boolean, value: string }
  function normalizeDialedNumber(raw) {
    let s = (raw || '').trim();
    if (!s) return { ok: false, value: '' };
    // map letters to digits
    s = s.replace(/[A-Za-z]/g, (c) => letterToDigit(c) || '');
    const hasPlus = s.startsWith('+');
    const digits = s.replace(/\D/g, '');
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
      return { ok: false, value: '' };
    }
    if (/^\+\d{8,15}$/.test(e164)) return { ok: true, value: e164 };
    return { ok: false, value: '' };
  }

  function makeCard() {
    const card = document.createElement('div');
    card.className = 'widget-card phone-card';
    card.id = WIDGET_ID;

    card.innerHTML = `
      <div class="widget-card-header">
        <h4 class="widget-title">Phone</h4>
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
          <button type="button" class="btn-text clear-btn" title="Clear">Clear</button>
        </div>
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
    card.querySelectorAll('.dial-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key') || '';
        appendChar(k);
        trackUserInput();
      });
    });
    
    // Helper: lookup contact by phone and update widget title
    function enrichTitleFromPhone(rawNumber) {
      try {
        const norm = (p) => (p || '').toString().replace(/\D/g, '').slice(-10);
        const needle = norm(rawNumber);
        if (!needle || typeof window.getPeopleData !== 'function') return;
        const people = window.getPeopleData() || [];
        const hit = people.find((c) => {
          const a = norm(c.phone);
          const b = norm(c.mobile);
          return (a && a === needle) || (b && b === needle);
        });
        if (hit) {
          const fullName = [hit.firstName, hit.lastName].filter(Boolean).join(' ') || (hit.name || '');
          if (fullName) {
            const titleEl = card.querySelector('.widget-title');
            const comp = hit.companyName || hit.accountName || hit.company || '';
            if (titleEl) titleEl.innerHTML = `Phone - ${fullName}${comp ? ' • ' + comp : ''}`;
            currentCallContext.name = fullName;
            currentCallContext.company = comp;
          }
        }
      } catch (_) { /* noop */ }
    }

    // Track typing in input field
    if (input) {
      input.addEventListener('input', trackUserInput);
      input.addEventListener('keydown', trackUserInput);
      input.addEventListener('input', () => {
        enrichTitleFromPhone(input.value || '');
      });
    }

    // Actions
    const callBtn = card.querySelector('.call-btn-start');
    let currentCall = null;

    async function placeBrowserCall(number) {
      console.debug('[Phone] Attempting browser call to:', number);
      
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
            
            await device.audio.setInputDevice(inputDeviceId);
            console.log('[Phone] Input device set to:', inputDeviceId);
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
                
                // Try 'default' first, fallback to first available device
                if (!deviceIds.includes('default') && deviceIds.length > 0) {
                  outputDeviceId = deviceIds[0];
                  console.log('[Phone] Using first available output device:', outputDeviceId);
                }
              }
              
              device.audio.speakerDevices.set(outputDeviceId);
              console.log('[Phone] Output device set to:', outputDeviceId);
            } catch (e) {
              console.warn('[Phone] Failed to set output device:', e);
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
        const callId = `call_${callStartTime}_${number.replace(/\D/g, '')}`;
        let twilioCallSid = null;
        
        // Log initial call
        await logCall(number, 'browser', callId);
        
        // Handle call events
        currentCall.on('accept', () => {
          console.debug('[Phone] Call connected');
          isCallInProgress = true;
          currentCallContext.isActive = true;
          try {
            // Capture the Twilio CallSid if exposed by the SDK
            const p = (currentCall && (currentCall.parameters || currentCall._parameters)) || {};
            twilioCallSid = p.CallSid || p.callSid || null;
            if (twilioCallSid) console.debug('[Phone] Captured Twilio CallSid:', twilioCallSid);
          } catch(_) {}
          // Show live timer in banner
          const card = document.getElementById(WIDGET_ID);
          startLiveCallTimer(card);
          // Update call status to connected using same call ID
          updateCallStatus(number, 'connected', callStartTime, 0, twilioCallSid || callId);
        });
        
        currentCall.on('disconnect', async () => {
          console.debug('[Phone] Call disconnected');
          const callEndTime = Date.now();
          const duration = Math.floor((callEndTime - callStartTime) / 1000);
          
          // IMMEDIATELY set cooldown and clear context to prevent auto-redial
          const disconnectTime = Date.now();
          lastCallCompleted = disconnectTime;
          lastCalledNumber = number;
          isCallInProgress = false;
          autoTriggerBlockUntil = Date.now() + 15000; // Increased to 15s hard block
          
          // Clear current call context IMMEDIATELY to prevent auto-callback
          console.debug('[Phone] IMMEDIATE: Clearing call context after disconnect to prevent redial');
          currentCallContext = {
            number: '',
            name: '',
            company: '',
            accountId: null,
            accountName: null,
            contactId: null,
            contactName: null,
            isActive: false
          };
          
          // Clear ALL Twilio state to prevent ghost connections
          TwilioRTC.state.connection = null;
          TwilioRTC.state.pendingIncoming = null;
          
          // Update call with final status and duration using Twilio CallSid if available
          updateCallStatus(number, 'completed', callStartTime, duration, twilioCallSid || callId);
          currentCall = null;
          
          // Stop live timer and restore banner
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
          }
          
          // Force UI update to ensure button state is visible
          setInCallUI(false);
          console.debug('[Phone] DISCONNECT: UI cleanup complete, call should show as ended');
          
          // CRITICAL: Terminate any active server-side call to prevent callback loops
          if (window.currentServerCallSid) {
            try {
              const base = (window.API_BASE_URL || '').replace(/\/$/, '');
              console.debug('[Phone] DISCONNECT: Terminating server call SID:', window.currentServerCallSid);
              
              const terminateResponse = await fetch(`${base}/api/twilio/hangup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid: window.currentServerCallSid })
              });
              
              if (terminateResponse.ok) {
                console.debug('[Phone] DISCONNECT: Server call terminated successfully');
              } else {
                console.warn('[Phone] DISCONNECT: Failed to terminate server call:', terminateResponse.status);
              }
            } catch (e) {
              console.error('[Phone] DISCONNECT: Error terminating server call:', e);
            } finally {
              window.currentServerCallSid = null;
            }
          }
          
          // Release the input device to avoid the red recording symbol
          // According to Twilio best practices
          if (TwilioRTC.state.device && TwilioRTC.state.device.audio) {
            try {
              await TwilioRTC.state.device.audio.unsetInputDevice();
              console.debug('[Phone] Audio input device released');
            } catch (e) {
              console.warn('[Phone] Failed to release audio input device:', e);
            }
          }
          
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
          }
          
          // Clear context on error too
          currentCallContext = {
            number: '',
            name: '',
            isActive: false
          };
          
          // Set longer cooldown after error
          lastCallCompleted = Date.now();
          lastCalledNumber = number;
          autoTriggerBlockUntil = Date.now() + 15000;
          
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
        const callFrom = isIncoming ? (fromNumber || phoneNumber) : '+18176630380';
        const callTo = isIncoming ? '+18176630380' : phoneNumber;
        
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
            // include call context
            accountId: currentCallContext.accountId || null,
            accountName: currentCallContext.accountName || currentCallContext.company || null,
            contactId: currentCallContext.contactId || null,
            contactName: currentCallContext.contactName || currentCallContext.name || null,
            source: 'phone-widget',
            targetPhone: String(phoneNumber || '').replace(/\D/g, '').slice(-10),
            businessPhone: '+18176630380'
          })
        });
        
        const data = await response.json();
        return data.call?.id || callSid; // Return call ID for tracking
      } catch (error) {
        console.error('[Phone] Failed to log call:', error);
        return null;
      }
    }
    
    async function updateCallStatus(phoneNumber, status, startTime, duration = 0, callId = null, fromNumber = null, callType = 'outgoing') {
      try {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        if (!base) return;
        
        const callSid = callId || `call_${startTime}_${phoneNumber.replace(/\D/g, '')}`;
        const timestamp = new Date(startTime).toISOString();
        
        // For incoming calls, use the caller's number as 'from' and business number as 'to'
        // For outgoing calls, use business number as 'from' and target number as 'to'
        const isIncoming = callType === 'incoming';
        const callFrom = isIncoming ? (fromNumber || phoneNumber) : '+18176630380';
        const callTo = isIncoming ? '+18176630380' : phoneNumber;
        
        await fetch(`${base}/api/calls`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            callSid: callSid,
            to: callTo,
            from: callFrom,
            status: status,
            duration: duration,
            durationSec: duration,
            callTime: timestamp,
            timestamp: timestamp,
            // include call context
            accountId: currentCallContext.accountId || null,
            accountName: currentCallContext.accountName || currentCallContext.company || null,
            contactId: currentCallContext.contactId || null,
            contactName: currentCallContext.contactName || currentCallContext.name || null,
            source: 'phone-widget',
            targetPhone: String(phoneNumber || '').replace(/\D/g, '').slice(-10),
            businessPhone: '+18176630380'
          })
        });
        
        // Refresh calls page if it's open (immediate and delayed to catch webhooks)
        const refreshCalls = (label) => {
          if (window.callsModule && typeof window.callsModule.loadData === 'function') {
            window.callsModule.loadData();
            console.debug(`[Phone] Refreshed calls page data (${label})`);
          }
        };
        setTimeout(() => refreshCalls('t+1s'), 1000);
        setTimeout(() => refreshCalls('t+15s'), 15000);
        setTimeout(() => refreshCalls('t+30s'), 30000);
        
      } catch (error) {
        console.error('[Phone] Failed to update call status:', error);
      }
    }
    function setInCallUI(inCall) {
      if (!callBtn) return;
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
        autoTriggerBlockUntil = Date.now() + 10000;
        // Reset title and clear input
        const title = card.querySelector('.widget-title');
        if (title) title.innerHTML = 'Phone';
        if (input) input.value = '';
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
        
        // Clear UI state
        setInCallUI(false);
        stopLiveCallTimer(card);
        
        // Clear context on manual hangup
        currentCallContext = {
          number: '',
          name: '',
          isActive: false
        };
        
        // Set aggressive cooldown on manual hangup
        lastCallCompleted = Date.now();
        autoTriggerBlockUntil = Date.now() + 15000; // Increased to 15 seconds
        
        // Release audio devices to ensure proper cleanup
        if (TwilioRTC.state.device && TwilioRTC.state.device.audio) {
          try {
            await TwilioRTC.state.device.audio.unsetInputDevice();
            console.debug('[Phone] Audio input device released after manual hangup');
          } catch (e) {
            console.warn('[Phone] Failed to release audio input device:', e);
          }
        }
        
        try { window.crm?.showToast && window.crm.showToast('Call ended'); } catch (_) {}
        
        // Clear the input and reset title
        if (input) input.value = '';
        const title = card.querySelector('.widget-title');
        if (title) title.innerHTML = 'Phone';
        
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
      // update UI with normalized value and enrich title from People data
      if (input) { input.value = normalized.value; }
      enrichTitleFromPhone(normalized.value);
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
        
        // Try browser calling first if microphone permission is available
        if (hasMicPermission) {
          try { window.crm?.showToast && window.crm.showToast(`Calling ${normalized.value} from browser...`); } catch (_) {}
          try {
            const call = await placeBrowserCall(normalized.value);
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
      const { key } = e;
      // Do not intercept common shortcuts (paste/copy/select-all, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9*#]$/.test(key)) {
        appendChar(key);
        e.preventDefault();
      } else if (key === 'Backspace') {
        backspace();
        e.preventDefault();
      } else if (/^[a-zA-Z]$/.test(key)) {
        const d = letterToDigit(key);
        if (d) {
          appendChar(d);
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

    try { window.crm?.showToast && window.crm.showToast('Phone opened'); } catch (_) {}
  }

  // Track last call completion to prevent auto-callbacks
  let lastCallCompleted = 0;
  let lastCalledNumber = '';
  let isCallInProgress = false;
  const CALLBACK_COOLDOWN = 8000; // 8 seconds cooldown
  const SAME_NUMBER_COOLDOWN = 15000; // 15 seconds for same number
  // Hard global guard to suppress any auto-dial after a call ends unless there is a fresh user click
  let autoTriggerBlockUntil = 0; // ms epoch
  
  // Track user typing activity in phone widget
  let lastUserTypingTime = 0;
  const USER_TYPING_COOLDOWN = 2000; // 2 seconds after user stops typing
  
  // Global call function for CRM integration
  window.Widgets.callNumber = function(number, contactName = '', autoTrigger = false, source = 'unknown') {
    // Add stack trace to debug who's calling this function
    const stack = new Error().stack;
    console.debug('[Phone] ═══ CALLNUMBER INVOKED ═══');
    console.debug('[Phone] Parameters:', { number, contactName, autoTrigger, source, isCallInProgress });
    console.debug('[Phone] Current call context:', currentCallContext);
    console.debug('[Phone] Cooldowns:', { lastCallCompleted: new Date(lastCallCompleted || 0), lastCalledNumber });
    console.debug('[Phone] Call stack:', stack?.split('\n').slice(0, 8).join('\n')); // More stack trace
    
    const now = Date.now();
    let contactCompany = '';

    // Attempt to enrich contactName if missing by looking up People data by phone
    try {
      const normalize = (p) => (p || '').toString().replace(/\D/g, '').slice(-10);
      if (!contactName) {
        const needle = normalize(number);
        if (needle && typeof window.getPeopleData === 'function') {
          const people = window.getPeopleData() || [];
          const hit = people.find((c) => {
            const a = normalize(c.phone);
            const b = normalize(c.mobile);
            return (a && a === needle) || (b && b === needle);
          });
          if (hit) {
            const fullName = [hit.firstName, hit.lastName].filter(Boolean).join(' ') || (hit.name || '');
            if (fullName) contactName = fullName;
            contactCompany = hit.companyName || hit.accountName || hit.company || '';
          }
        }
      }
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
    
    // Set current call context
    currentCallContext = {
      number: number,
      name: contactName,
      company: contactCompany || (currentCallContext && currentCallContext.company) || '',
      isActive: autoTrigger // Mark as active only if we're auto-triggering
    };
    
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
      // Update widget header to show contact name
      if (contactName) {
        const title = card.querySelector('.widget-title');
        if (title) {
          const comp = contactCompany || currentCallContext.company || '';
          title.innerHTML = `Phone - ${contactName}${comp ? ' • ' + comp : ''}`;
        }
      }
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

  window.Widgets.openPhone = openPhone;
  window.Widgets.closePhone = closePhoneWidget;
  // Allow pages to set the current call context (account/contact attribution)
  window.Widgets.setCallContext = function(ctx){
    try {
      ctx = ctx || {};
      currentCallContext.accountId = ctx.accountId || null;
      currentCallContext.accountName = ctx.accountName || null;
      currentCallContext.contactId = ctx.contactId || null;
      currentCallContext.contactName = ctx.contactName || null;
      if (ctx.company) currentCallContext.company = ctx.company;
      if (ctx.name) currentCallContext.name = ctx.name;
    } catch(_) {}
  };
  window.Widgets.isPhoneOpen = function () { return !!document.getElementById(WIDGET_ID); };
  window.Widgets.resetMicrophonePermission = resetMicrophonePermission;
  
  // Expose for console diagnostics
  try { window.TwilioRTC = TwilioRTC; } catch(_) {}

  // Background: register Twilio Device quietly so inbound calls can reach the browser
  try {
    if (window.API_BASE_URL) {
      // Defer a moment to avoid blocking initial page work
      setTimeout(() => {
        TwilioRTC.ensureDevice().catch(e => console.warn('[Phone] Background device init failed:', e?.message || e));
      }, 800);
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
      const connection = await device.connect({
        params: { To: n, From: BUSINESS_PHONE }
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
