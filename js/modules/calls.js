// Power Choosers CRM Dashboard - Calls Module
// Renders the Calls page (Apollo-style) and manages the dialer widget in the right panel.

(function(){
  if (typeof window === 'undefined' || typeof CRMApp === 'undefined') return;

  // Resolve API base URL so the CRM can call a remote API (ngrok/prod) from any domain.
  // Priority: window.CRM_API_BASE_URL -> localStorage.CRM_API_BASE_URL -> '' (relative)
  function apiBase() {
    try {
      let base = (window.CRM_API_BASE_URL || window.localStorage.getItem('CRM_API_BASE_URL') || '').trim();
      if (base.endsWith('/')) base = base.slice(0, -1);
      return base;
    } catch (_) { return ''; }
  }
  try { console.log('[Calls] API_BASE_URL:', apiBase() || '(relative)'); } catch (_) {}

  Object.assign(CRMApp, {
    // Render the Calls page content
    renderCallsPage() {
      const container = document.getElementById('calls-view');
      if (!container) return console.error('calls-view container not found');

      // Basic layout for Calls hub
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '16px';

      container.innerHTML = `
        <section class="dashboard-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <h3 class="card-title" style="margin:0;display:flex;align-items:center;gap:8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              Calls Hub
            </h3>
            <div style="display:flex;gap:8px;">
              <button id="open-dialer-btn" class="btn btn-primary">Open Dialer</button>
              <button id="refresh-calls-btn" class="btn btn-secondary">Refresh</button>
            </div>
          </div>
        </section>

        <section class="dashboard-card">
          <h3 class="card-title" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2"/></svg>
            Recent Calls
          </h3>
          <div id="recent-calls-list" class="list" style="display:flex;flex-direction:column;gap:8px;"></div>
        </section>

        <section class="dashboard-card">
          <h3 class="card-title" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M12 14h6"/><path d="M12 8h3"/><path d="M8 8l-4 4 4 4"/></svg>
            AI Call Insights (placeholder)
          </h3>
          <div style="color:#cbd5e1;font-size:14px;">Transcripts, summaries, key moments and next steps will appear here after calls.</div>
        </section>
      `;

      // Populate dummy recent calls for now
      this.renderRecentCalls();

      // Wire buttons
      document.getElementById('open-dialer-btn')?.addEventListener('click', () => {
        this.openDialerWidget('cold');
      });
      document.getElementById('refresh-calls-btn')?.addEventListener('click', () => {
        this.renderRecentCalls();
        this.showNotification('Calls refreshed', 'success');
      });

      // Ensure the cold-calling widget area shows a dialer by default
      this.openDialerWidget('cold');
    },

    // Render some placeholder recent calls
    renderRecentCalls() {
      const list = document.getElementById('recent-calls-list');
      if (!list) return;
      const sample = (this.activities || [])
        .filter(a => a.type && a.type.includes('call'))
        .slice(0, 5);

      const fallback = [
        { name: 'Alex Johnson', number: '(469) 555-0147', when: '2h ago', result: 'Completed' },
        { name: 'Taylor Reed', number: '(214) 555-9083', when: '5h ago', result: 'Voicemail' },
        { name: 'Morgan Lee', number: '(972) 555-3321', when: 'Yesterday', result: 'No Answer' }
      ];

      const rows = (sample.length ? sample.map(a => ({ name: a.contactName || 'Unknown', number: a.phone || '—', when: new Date(a.createdAt || Date.now()).toLocaleString(), result: a.disposition || 'Completed' })) : fallback)
        .map(item => `
          <div class="list-row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="display:flex;flex-direction:column;">
              <span style="font-weight:600;">${item.name}</span>
              <span style="color:#94a3b8;font-size:12px;">${item.number}</span>
            </div>
            <div style="display:flex;gap:16px;align-items:center;">
              <span style="color:#94a3b8;font-size:12px;">${item.when}</span>
              <span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:#1f2937;border:1px solid #334155;">${item.result}</span>
              <button class="btn btn-secondary" data-action="call" data-number="${item.number}" data-name="${item.name}">Call Back</button>
            </div>
          </div>
        `).join('');

      list.innerHTML = rows;

      list.querySelectorAll('button[data-action="call"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget;
          const number = target.getAttribute('data-number') || '';
          const name = target.getAttribute('data-name') || '';
          this.openDialerWidget('cold');
          // Prefill number
          const input = document.getElementById('dialer-phone-input');
          if (input) input.value = number;
          this.showNotification(`Preparing call to ${name} ${number}`, 'info');
        });
      });
    },

    // Open the dialer widget in the right-hand widget panel.
    // targetPanel: 'crm' | 'cold'
    openDialerWidget(targetPanel = 'crm') {
      const crmPanel = document.getElementById('crm-widgets-container');
      const coldPanel = document.getElementById('cold-calling-widgets-container');
      const target = targetPanel === 'cold' ? coldPanel : crmPanel;
      if (!target) return console.warn('Target widget panel not found:', targetPanel);

      // Reuse existing dialer if present; else create
      let dialer = target.querySelector('#dialer-widget');
      if (!dialer) {
        dialer = document.createElement('section');
        dialer.className = 'widget-card';
        dialer.id = 'dialer-widget';
        dialer.innerHTML = `
          <h3 class="card-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="display:flex;align-items:center;gap:8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Dialer
            </span>
            <button id="dialer-close-btn" class="icon-button" title="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </h3>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <input id="dialer-phone-input" type="tel" class="form-input" placeholder="Enter number" />
            <div id="dialer-caller-id" style="font-size:12px;color:#94a3b8;">Caller: —</div>
            <div style="display:flex;gap:8px;">
              <button id="dialer-call-btn" class="btn btn-primary" style="flex:1;display:flex;align-items:center;gap:6px;justify-content:center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Call
              </button>
              <button id="dialer-hangup-btn" class="btn btn-secondary" style="flex:1;">Hang Up</button>
            </div>
            <div style="display:flex;gap:8px;">
              <button id="dialer-mute-btn" class="btn btn-secondary" style="flex:1;">Mute</button>
              <button id="dialer-record-btn" class="btn btn-secondary" style="flex:1;">Record</button>
            </div>
          </div>
        `;
        target.prepend(dialer);

        // Wire dialer controls
        dialer.querySelector('#dialer-close-btn')?.addEventListener('click', () => this.closeDialerWidget());
        dialer.querySelector('#dialer-call-btn')?.addEventListener('click', () => this.placeCall());
        dialer.querySelector('#dialer-hangup-btn')?.addEventListener('click', () => this.endCall());
        dialer.querySelector('#dialer-mute-btn')?.addEventListener('click', () => this.toggleMute());
        dialer.querySelector('#dialer-record-btn')?.addEventListener('click', () => this.toggleRecord());
      }

      // Make sure the correct panel is visible
      if (targetPanel === 'cold') {
        const cc = document.getElementById('cold-calling-widgets-container');
        if (cc) cc.style.display = 'flex';
        const crm = document.getElementById('crm-widgets-container');
        if (crm) crm.style.display = 'none';
      } else {
        const crm = document.getElementById('crm-widgets-container');
        if (crm) crm.style.display = 'flex';
      }

      dialer.style.display = 'block';
      return dialer;
    },

    closeDialerWidget() {
      const dialer = document.getElementById('dialer-widget');
      if (!dialer) return;
      dialer.remove();
      this.showNotification('Dialer closed', 'info');
    },

    // Place a call via backend Vonage proxy
    async placeCall() {
      const input = document.getElementById('dialer-phone-input');
      let number = input ? input.value.trim() : '';
      if (!number) return this.showNotification('Enter a phone number', 'warning');
      // Normalize US numbers to E.164
      const digits = number.replace(/\D/g, '');
      if (digits.length === 10) {
        number = `+1${digits}`;
      } else if (digits.length === 11 && digits.startsWith('1')) {
        number = `+${digits}`;
      } else if (!number.startsWith('+')) {
        number = `+${digits || number}`;
      }

      try {
        this.showNotification(`Calling ${number}...`, 'info');
        const base = apiBase();
        const res = await fetch(`${base}/api/vonage/call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: number })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data && (data.title || data.error || data.detail) || `HTTP ${res.status}`;
          this.showNotification(`Vonage call failed: ${msg}`, 'error');
          return;
        }
        // Success response typically includes uuid/status
        const uuid = data.uuid || (data._embedded && data._embedded.calls && data._embedded.calls[0] && data._embedded.calls[0].uuid);
        this.showNotification('Call request sent to Vonage', 'success');
        const id = document.getElementById('dialer-caller-id');
        if (id) id.textContent = `Caller: ${number}${uuid ? ` (uuid: ${uuid})` : ''}`;
        // Save last call UUID for debugging
        this.lastCallUuid = uuid;

        // If we have a uuid, poll backend for live status updates
        if (uuid) {
          const start = Date.now();
          const endStates = ['completed','failed','rejected','expired','cancelled','busy','timeout','hangup'];
          const poll = setInterval(async () => {
            // Stop after 60s
            if (Date.now() - start > 60000) { clearInterval(poll); return; }
            try {
              const base = apiBase();
              const r = await fetch(`${base}/api/vonage/call/status?uuid=${encodeURIComponent(uuid)}`);
              const s = await r.json().catch(() => ({}));
              const status = (s.status || s.state || s.detail || '').toString();
              const label = document.getElementById('dialer-caller-id');
              if (label) label.textContent = `Caller: ${number} (uuid: ${uuid})${status ? ` – ${status}` : ''}`;
              if (status && endStates.includes(status.toLowerCase())) {
                clearInterval(poll);
              }
            } catch (_) { /* ignore transient errors */ }
          }, 2000);
        }
      } catch (e) {
        console.error(e);
        this.showNotification('Network error placing call', 'error');
      }
    },

    endCall() {
      this.showNotification('Call ended', 'info');
      // Hide dialer shortly after to match requirement of disappearing after call
      setTimeout(() => this.closeDialerWidget(), 400);
    },

    toggleMute() {
      this.showNotification('Mute toggled (stub)', 'info');
    },

    toggleRecord() {
      this.showNotification('Recording toggled (stub)', 'info');
    },

    // Incoming call stub: show notification and open dialer
    notifyIncomingCall({ number = 'Unknown', name = '' } = {}) {
      const display = name ? `${name} (${number})` : number;
      this.showNotification(`Incoming call from ${display}`, 'info');
      this.openDialerWidget('crm');
      const id = document.getElementById('dialer-caller-id');
      if (id) id.textContent = `Caller: ${display}`;
    }
  });
})();
