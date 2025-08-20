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
      micPermissionChecked: false 
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

        // Set up device event handlers
        state.device.on('registered', () => {
          console.debug('[TwilioRTC] Device registered and ready');
          try { window.crm?.showToast && window.crm.showToast('Browser calling ready'); } catch(_) {}
        });

        state.device.on('error', (error) => {
          console.error('[TwilioRTC] Device error:', error);
          try { window.crm?.showToast && window.crm.showToast(`Device error: ${error?.message || 'Unknown error'}`); } catch(_) {}
        });

        // Capture SDK warnings for diagnostics (e.g., ICE issues, media errors)
        try {
          state.device.on('warning', (name, data) => {
            console.warn('[TwilioRTC] Device warning:', name, data || {});
          });
        } catch (_) {}

        state.device.on('incoming', (conn) => {
          console.debug('[TwilioRTC] Incoming call:', conn);
          state.connection = conn;
          // Handle incoming calls if needed
        });

        // Register the device
        await state.device.register();
        
        try { console.debug('[TwilioRTC] Device ready'); } catch(_) {}
        state.ready = true;
        return state.device;
      } finally {
        state.connecting = false;
      }
    }

    return { state, ensureDevice };
  })();

  const WIDGET_ID = 'phone-widget';

  // Current call context
  let currentCallContext = {
    number: '',
    name: '',
    isActive: false
  };

  // Phone number lookup cache
  let contactsCache = null;
  let accountsCache = null;
  let cacheExpiry = 0;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Normalize phone number for comparison (remove all non-digits)
  function normalizePhoneForComparison(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  // Check if two phone numbers match (handles various formats)
  function phoneNumbersMatch(phone1, phone2) {
    const clean1 = normalizePhoneForComparison(phone1);
    const clean2 = normalizePhoneForComparison(phone2);
    if (!clean1 || !clean2) return false;
    
    // Handle US numbers with/without country code
    const normalize = (num) => {
      if (num.length === 11 && num.startsWith('1')) {
        return num.slice(1); // Remove leading 1
      }
      return num;
    };
    
    return normalize(clean1) === normalize(clean2);
  }

  // Load contacts and accounts for phone lookup
  async function loadContactsForLookup() {
    const now = Date.now();
    if (contactsCache && accountsCache && now < cacheExpiry) {
      return { contacts: contactsCache, accounts: accountsCache };
    }

    try {
      const base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base) {
        console.debug('[Phone] No API base URL configured, skipping contact lookup');
        return { contacts: [], accounts: [] };
      }

      // Load contacts from Firebase if available
      let contacts = [];
      let accounts = [];

      if (window.firebaseDB) {
        try {
          // Load contacts
          const contactsSnapshot = await window.firebaseDB.collection('contacts').get();
          contacts = contactsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            name: `${doc.data().firstName || ''} ${doc.data().lastName || ''}`.trim() || 'Unknown Contact'
          }));

          // Load accounts  
          const accountsSnapshot = await window.firebaseDB.collection('accounts').get();
          accounts = accountsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            name: doc.data().accountName || 'Unknown Account'
          }));

          console.debug(`[Phone] Loaded ${contacts.length} contacts and ${accounts.length} accounts for lookup`);
        } catch (firebaseError) {
          console.warn('[Phone] Failed to load from Firebase:', firebaseError);
        }
      }

      // Cache the results
      contactsCache = contacts;
      accountsCache = accounts;
      cacheExpiry = now + CACHE_DURATION;

      return { contacts, accounts };
    } catch (error) {
      console.error('[Phone] Failed to load contacts for lookup:', error);
      return { contacts: [], accounts: [] };
    }
  }

  // Lookup contact/account by phone number
  async function lookupContactByPhone(phoneNumber) {
    if (!phoneNumber) return null;
    
    const { contacts, accounts } = await loadContactsForLookup();
    
    // First check contacts
    for (const contact of contacts) {
      if (contact.phone && phoneNumbersMatch(contact.phone, phoneNumber)) {
        return {
          type: 'contact',
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email || '',
          company: contact.companyName || ''
        };
      }
    }
    
    // Then check accounts
    for (const account of accounts) {
      if (account.phone && phoneNumbersMatch(account.phone, phoneNumber)) {
        return {
          type: 'account', 
          id: account.id,
          name: account.name,
          phone: account.phone,
          email: '',
          company: account.name
        };
      }
    }
    
    return null;
  }

  // Update widget title and call context based on phone lookup
  async function updateContactAssociation(card, phoneNumber) {
    if (!card || !phoneNumber) return;
    
    const contact = await lookupContactByPhone(phoneNumber);
    const title = card.querySelector('.widget-title');
    
    if (contact && title) {
      // Update widget title to show contact name
      title.innerHTML = `Phone - ${contact.name}`;
      
      // Update call context
      currentCallContext.name = contact.name;
      currentCallContext.number = phoneNumber;
      
      console.debug('[Phone] Associated number with contact:', contact);
      
      // Show a subtle notification
      try { 
        window.crm?.showToast && window.crm.showToast(`📞 Recognized ${contact.name}`);
      } catch(_) {}
    } else if (title) {
      // Reset to default title if no contact found
      title.innerHTML = 'Phone';
      currentCallContext.name = '';
    }
  }

  // Update microphone status UI
  function updateMicrophoneStatusUI(card, status) {
    const micStatus = card.querySelector('.mic-status');
    const micText = card.querySelector('.mic-text');
    if (!micStatus || !micText) return;

    micStatus.classList.remove('ok', 'warn', 'error', 'checking');
    switch (status) {
      case 'granted':
        micStatus.classList.add('ok');
        micText.textContent = 'Browser calls enabled - will try browser first';
        break;
      case 'denied':
        micStatus.classList.add('warn');
        micText.textContent = 'Will call your phone - click address bar mic for browser calls';
        break;
      case 'checking':
        micStatus.classList.add('checking');
        micText.textContent = 'Checking microphone access...';
        break;
      case 'error':
        micStatus.classList.add('error');
        micText.textContent = 'Will call your phone (browser calls unavailable)';
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
    if (TwilioRTC.state.micPermissionChecked && TwilioRTC.state.micPermissionGranted) {
      return true;
    }
    
    try {
      // Check current permission status
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        if (permissionStatus.state === 'granted') {
          TwilioRTC.state.micPermissionGranted = true;
          TwilioRTC.state.micPermissionChecked = true;
          return true;
        } else if (permissionStatus.state === 'denied') {
          TwilioRTC.state.micPermissionGranted = false;
          TwilioRTC.state.micPermissionChecked = true;
          return false;
        }
      }
      
      // Request microphone permission explicitly
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        // Stop the stream immediately as we only need permission
        stream.getTracks().forEach(track => track.stop());
        TwilioRTC.state.micPermissionGranted = true;
        TwilioRTC.state.micPermissionChecked = true;
        try { window.crm?.showToast && window.crm.showToast('Microphone access granted - browser calls enabled'); } catch(_) {}
        return true;
      } catch (micError) {
        console.warn('[Phone] Microphone permission denied:', micError?.message || micError);
        TwilioRTC.state.micPermissionGranted = false;
        TwilioRTC.state.micPermissionChecked = true;
        
        // Show helpful message to user
        try { 
          window.crm?.showToast && window.crm.showToast('Microphone access needed for browser calls. Click the microphone icon in your address bar to allow.'); 
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
        <div class="mic-status checking">
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
          <button type="button" class="btn-secondary backspace-btn" title="Backspace">Backspace</button>
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
      
      // Add input event listener for manual typing (not just dialpad)
      input.addEventListener('input', async (e) => {
        const value = e.target.value.trim();
        
        // Clear any existing timeout
        clearTimeout(input.lookupTimeout);
        
        if (value.length >= 10) {
          // Debounce the lookup to avoid too many requests
          input.lookupTimeout = setTimeout(async () => {
            await updateContactAssociation(card, value);
          }, 500);
        } else if (value.length === 0) {
          // Clear contact association when input is empty
          const title = card.querySelector('.widget-title');
          if (title) {
            title.innerHTML = 'Phone';
          }
          currentCallContext.name = '';
          currentCallContext.number = '';
        }
      });
    }

    const appendChar = (ch) => {
      if (!input) return;
      input.value = (input.value || '') + ch;
      try { input.focus(); } catch (_) {}
      
      // Debounced contact lookup on input change
      clearTimeout(input.lookupTimeout);
      input.lookupTimeout = setTimeout(async () => {
        const currentValue = input.value.trim();
        if (currentValue.length >= 10) { // Only lookup for complete numbers
          await updateContactAssociation(card, currentValue);
        }
      }, 500);
    };

    const backspace = () => {
      if (!input) return;
      const v = input.value || '';
      input.value = v.slice(0, -1);
      try { input.focus(); } catch (_) {}
    };

    const clearAll = () => {
      if (!input) return;
      input.value = '';
      
      // Clear contact association when clearing input
      const title = card.querySelector('.widget-title');
      if (title) {
        title.innerHTML = 'Phone';
      }
      currentCallContext.name = '';
      currentCallContext.number = '';
      
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
      
      // Trigger contact lookup after paste
      setTimeout(async () => {
        if (input.value.trim().length >= 10) {
          await updateContactAssociation(card, input.value.trim());
        }
      }, 100);
      
      try { input.focus(); } catch (_) {}
    };
    if (input) input.addEventListener('paste', onPaste);

    // Dialpad clicks
    card.querySelectorAll('.dial-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key') || '';
        appendChar(k);
      });
    });

    // Actions
    const callBtn = card.querySelector('.call-btn-start');
    let currentCall = null;

    async function placeBrowserCall(number) {
      console.debug('[Phone] Attempting browser call to:', number);
      
      try {
        const device = await TwilioRTC.ensureDevice();
        
        // Make the call with recording enabled via TwiML app
        currentCall = await device.connect({
          params: {
            To: number
          }
        });
        
        console.debug('[Phone] Call initiated');
        
        // Set UI immediately for responsiveness
        setInCallUI(true);
        
        // Track call start time and generate consistent call ID
        const callStartTime = Date.now();
        const callId = `call_${callStartTime}_${number.replace(/\D/g, '')}`;
        
        // Log initial call
        await logCall(number, 'browser', callId);
        
        // Handle call events
        currentCall.on('accept', () => {
          console.debug('[Phone] Call connected');
          // Update call status to connected using same call ID
          updateCallStatus(number, 'connected', callStartTime, 0, callId);
        });
        
        currentCall.on('disconnect', () => {
          console.debug('[Phone] Call disconnected');
          const callEndTime = Date.now();
          const duration = Math.floor((callEndTime - callStartTime) / 1000);
          // Update call with final status and duration using same call ID
          updateCallStatus(number, 'completed', callStartTime, duration, callId);
          currentCall = null;
          setInCallUI(false);
          
          // Clear the call context to prevent auto-redial
          currentCallContext = {
            number: '',
            name: '',
            isActive: false
          };
        });
        
        currentCall.on('error', (error) => {
          console.error('[Phone] Call error:', error);
          const callEndTime = Date.now();
          const duration = Math.floor((callEndTime - callStartTime) / 1000);
          updateCallStatus(number, 'failed', callStartTime, duration, callId);
          currentCall = null;
          setInCallUI(false);
          
          // Clear the call context to prevent auto-redial
          currentCallContext = {
            number: '',
            name: '',
            isActive: false
          };
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
        
        // Show appropriate message based on call context
        const contactName = currentCallContext.name;
        const message = contactName ? 
          `Calling ${contactName} - your phone will ring first` : 
          'Your phone will ring first, then we\'ll connect the call';
        
        try { window.crm?.showToast && window.crm.showToast(message); } catch(_) {}
        return data;
      }
    }
    
    async function logCall(phoneNumber, callType, callId = null) {
      try {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        if (!base) return;
        
        const callSid = callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();
        
        // Get contact association for better call logging
        const contact = await lookupContactByPhone(phoneNumber);
        const contextName = currentCallContext.name || '';
        const contactName = contact ? contact.name : contextName;
        
        console.debug('[Phone] Logging call with contact data:', {
          phoneNumber,
          contact: contact,
          contextName: contextName,
          finalContactName: contactName
        });
        
        const callData = {
          callSid: callSid,
          to: phoneNumber,
          from: '+18176630380', // Your business number
          status: 'initiated',
          callType: callType,
          callTime: timestamp,
          timestamp: timestamp
        };
        
        // Add contact information if available
        if (contact) {
          callData.contactId = contact.id;
          callData.contactType = contact.type; // 'contact' or 'account'
          callData.contactName = contact.name;
          callData.contactCompany = contact.company;
          console.debug('[Phone] Adding contact data from lookup:', contact);
        } else if (contextName) {
          callData.contactName = contextName;
          console.debug('[Phone] Adding contact name from context:', contextName);
        }
        
        console.debug('[Phone] Final call data being sent:', callData);
        
        const response = await fetch(`${base}/api/calls`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(callData)
        });
        
        const data = await response.json();
        console.debug('[Phone] Call logged successfully:', {
          callSid,
          contactName: callData.contactName,
          response: data
        });
        
        return data.call?.id || callSid; // Return call ID for tracking
      } catch (error) {
        console.error('[Phone] Failed to log call to API:', error);
        
        // Fallback: Store call data locally for now
        const localCallData = {
          ...callData,
          timestamp: new Date().toISOString(),
          stored: 'local_fallback'
        };
        
        // Try to store in localStorage as backup
        try {
          const existingCalls = JSON.parse(localStorage.getItem('crm_calls') || '[]');
          existingCalls.unshift(localCallData);
          // Keep only last 50 calls
          existingCalls.splice(50);
          localStorage.setItem('crm_calls', JSON.stringify(existingCalls));
          console.debug('[Phone] Call stored locally as backup:', localCallData);
        } catch (localError) {
          console.error('[Phone] Failed to store call locally:', localError);
        }
        
        return callSid;
      }
    }
    
    async function updateCallStatus(phoneNumber, status, startTime, duration = 0, callId = null) {
      try {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        if (!base) return;
        
        const callSid = callId || `call_${startTime}_${phoneNumber.replace(/\D/g, '')}`;
        const timestamp = new Date(startTime).toISOString();
        
        await fetch(`${base}/api/calls`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            callSid: callSid,
            to: phoneNumber,
            from: '+18176630380',
            status: status,
            duration: duration,
            durationSec: duration,
            callTime: timestamp,
            timestamp: timestamp
          })
        });
        
        // Refresh calls page if it's open
        setTimeout(() => {
          if (window.callsModule && typeof window.callsModule.loadData === 'function') {
            window.callsModule.loadData();
            console.debug('[Phone] Refreshed calls page data');
          }
        }, 1000);
        
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
      // update UI with normalized value
      if (input) { input.value = normalized.value; }
      // If already in a call, hangup
      if (currentCall) {
        try { 
          currentCall.disconnect(); 
          console.debug('[Phone] Hanging up current call');
        } catch(_) {}
        currentCall = null;
        setInCallUI(false);
        
        // Clear the call context to prevent auto-redial
        currentCallContext = {
          number: '',
          name: '',
          isActive: false
        };
        
        try { window.crm?.showToast && window.crm.showToast('Call ended'); } catch (_) {}
        return;
      }
      
      // Ensure we have the latest contact association before making the call
      if (!currentCallContext.name) {
        console.debug('[Phone] No contact name in context, attempting lookup for:', normalized.value);
        try {
          await updateContactAssociation(card, normalized.value);
          console.debug('[Phone] Contact context after lookup:', currentCallContext);
        } catch (error) {
          console.warn('[Phone] Failed to lookup contact before call:', error);
        }
      }
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
        let hasMicPermission = false;
        try {
          hasMicPermission = await checkMicrophonePermission(card);
          console.debug('[Phone] Microphone permission check result:', hasMicPermission);
        } catch (permError) {
          console.warn('[Phone] Permission check failed, using fallback:', permError?.message || permError);
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
            try { window.crm?.showToast && window.crm.showToast(`Browser call error (${e?.message || 'SDK error'}). Falling back...`); } catch(_) {}
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
    const backspaceBtn = card.querySelector('.backspace-btn');
    if (backspaceBtn) backspaceBtn.addEventListener('click', backspace);
    const clearBtn = card.querySelector('.clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    // Close button
    const closeBtn = card.querySelector('.phone-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closePhoneWidget());

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

    // Check microphone permission when widget opens
    setTimeout(async () => {
      try {
        updateMicrophoneStatusUI(card, 'checking');
        adjustHeightIfAnimating(card);
        const hasPermission = await checkMicrophonePermission(card);
        updateMicrophoneStatusUI(card, hasPermission ? 'granted' : 'denied');
        adjustHeightIfAnimating(card);
      } catch (error) {
        console.warn('[Phone] Error checking mic permission:', error);
        updateMicrophoneStatusUI(card, 'error');
        adjustHeightIfAnimating(card);
      }
    }, 100);

    try { window.crm?.showToast && window.crm.showToast('Phone opened'); } catch (_) {}
  }

  // Global call function for CRM integration
  window.Widgets.callNumber = function(number, contactName = '') {
    console.debug('[Phone] Global call function:', { number, contactName });
    
    // Set current call context
    currentCallContext = {
      number: number,
      name: contactName,
      isActive: false
    };
    
    // Open phone widget if not already open
    if (!document.getElementById(WIDGET_ID)) {
      openPhone();
    }
    
    // Wait for widget to be ready, then populate number
    setTimeout(() => {
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
            title.innerHTML = `Phone - ${contactName}`;
          }
        }
        
        // Auto-trigger call if we have both number and name (click-to-call scenario)
        // Only auto-dial if this is a fresh call context (not a redial after hangup)
        if (number && contactName && !currentCallContext.isActive) {
          currentCallContext.isActive = true;
          const callBtn = card.querySelector('.call-btn-start');
          if (callBtn) {
            setTimeout(() => callBtn.click(), 100);
          }
        }
      }
    }, 50);
    
    return true;
  };

  window.Widgets.openPhone = openPhone;
  window.Widgets.closePhone = closePhoneWidget;
  window.Widgets.isPhoneOpen = function () { return !!document.getElementById(WIDGET_ID); };
  
  // Expose for console diagnostics
  try { window.TwilioRTC = TwilioRTC; } catch(_) {}

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
