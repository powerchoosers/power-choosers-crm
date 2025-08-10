// Power Choosers CRM Dashboard - Emails Module
// Gmail/Apollo-inspired email list with global slide-up compose

(function() {
  if (typeof window.CRMApp === 'undefined') return;

  Object.assign(CRMApp, {
    // Render Emails main view
    renderEmailsPage() {
      const container = document.getElementById('emails-view');
      if (!container) return;

      // Scaffold layout once
      container.innerHTML = `
        <section class="emails-layout">
          <div class="emails-header">
            <h2 class="emails-title">Emails</h2>
            <div class="emails-actions-right">
              <button class="btn btn-secondary" id="emails-manage-mailboxes">Manage mailboxes</button>
              <button class="btn btn-secondary" id="emails-deliverability">Deliverability stats</button>
              <span id="gmail-status" style="margin-left:12px;color:#9aa4b2;">Gmail: Disconnected</span>
              <button class="btn btn-primary" id="gmail-connect-btn" style="margin-left:8px;">Connect Gmail</button>
            </div>
          </div>

          <div class="emails-toolbar">
            <div class="inbox-select">
              <select id="emails-inbox-filter">
                <option value="all">All inboxes</option>
                <option value="primary">Primary</option>
                <option value="sent">Sent</option>
                <option value="drafts">Drafts</option>
              </select>
              <button class="show-filters">Show Filters</button>
            </div>
            <div class="emails-search">
              <input id="emails-search-input" type="text" placeholder="Search emails..." />
            </div>
            <div class="emails-view-options">
              <button class="btn btn-tertiary" id="emails-save-view">Save as new view</button>
              <button class="btn btn-tertiary" id="emails-view-options">View options</button>
              <button class="btn btn-primary open-compose" id="emails-compose-new">Compose</button>
            </div>
          </div>

          <div class="emails-table-wrapper">
            <table class="emails-table" id="emails-table">
              <thead>
                <tr>
                  <th style="width:32px"><input type="checkbox" id="emails-select-all"/></th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Sequence / Stage</th>
                  <th>Message</th>
                  <th>Sent By</th>
                  <th style="width:48px">Actions</th>
                </tr>
              </thead>
              <tbody id="emails-tbody"></tbody>
            </table>
          </div>

          <div class="emails-pagination">
            <div class="left">
              <select id="emails-bulk-select">
                <option value="">Select...</option>
                <option value="mark-read">Mark as read</option>
                <option value="mark-unread">Mark as unread</option>
                <option value="delete">Delete</option>
              </select>
              <span class="hint" id="emails-count"></span>
            </div>
            <div class="right">
              <button class="pager" id="emails-prev">Prev</button>
              <button class="pager" id="emails-next">Next</button>
            </div>
          </div>
        </section>
      `;

      // Default: if Gmail connected, load from Gmail; else, sample emails
      if (window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn()) {
        this.loadEmailsFromGmail();
      } else {
        const emails = this.getSampleEmails();
        this.renderEmailRows(emails);
      }
      this.ensureComposeDrawer();
      this.bindEmailEvents();
      this.initGmailUI();
    },

    renderEmailRows(emails) {
      const tbody = document.getElementById('emails-tbody');
      const countEl = document.getElementById('emails-count');
      if (!tbody) return;
      tbody.innerHTML = emails.map(e => this.emailRowHTML(e)).join('');
      if (countEl) countEl.textContent = `${emails.length} emails`;

      // Row click -> open compose (reply)
      tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', (ev) => {
          // ignore clicks on buttons/inputs
          const t = ev.target;
          if (t.closest('button') || t.closest('input') || t.tagName === 'A') return;
          const to = row.dataset.recipientEmail || '';
          const subject = row.dataset.subject ? `Re: ${row.dataset.subject}` : '';
          const body = `\n\n---\n${row.dataset.preview || ''}`;
          this.openCompose({ to, subject, body });
        });
      });
    },

    emailRowHTML(e) {
      return `
        <tr data-recipient-email='${(e.recipientEmail||'').replace(/'/g, "&#39;")}' data-subject='${(e.subject||'').replace(/'/g, "&#39;")}' data-preview='${(e.preview||'').replace(/'/g, "&#39;")}'>
          <td><input type="checkbox" /></td>
          <td class="recipient">
            <div class="name">${e.recipientName}</div>
            <div class="email">${e.recipientEmail}</div>
          </td>
          <td class="status">
            ${e.delivered ? '<span title="Delivered" class="st st-delivered">📬</span>' : ''}
            ${e.opened ? '<span title="Opened" class="st st-opened">👁️</span>' : ''}
            ${e.clicked ? '<span title="Clicked" class="st st-clicked">🔗</span>' : ''}
            ${e.replied ? '<span title="Replied" class="st st-replied">💬</span>' : ''}
          </td>
          <td>${this.formatDate(e.sentAt)}</td>
          <td>${e.sequenceName ? `${e.sequenceName} · ${e.stage}` : '—'}</td>
          <td class="message">
            <div class="subject">${e.subject || '(No subject)'}</div>
            <div class="preview">${e.preview || ''}</div>
          </td>
          <td>${e.sentBy || 'Me'}</td>
          <td class="row-actions">
            <button class="icon-btn" title="Reply" onclick="CRMApp.openCompose({to: '${(e.recipientEmail||'').replace(/'/g, "&#39;")}', subject: 'Re: ${(e.subject||'').replace(/'/g, "\\'")}'})">↩</button>
          </td>
        </tr>
      `;
    },

    // Simple format helper (fallback if utils has one)
    formatDate(d) {
      try {
        const dt = (d instanceof Date) ? d : new Date(d);
        return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
      } catch { return '—'; }
    },

    getSampleEmails() {
      // Create lightweight sample data mapped from contacts when available
      const base = (this.contacts || []).slice(0, 15);
      const now = Date.now();
      if (base.length) {
        return base.map((c, idx) => ({
          id: `em_${idx}`,
          recipientName: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.accountName || 'Contact',
          recipientEmail: c.email || 'unknown@example.com',
          delivered: true,
          opened: Math.random() > 0.3,
          clicked: Math.random() > 0.7,
          replied: Math.random() > 0.85,
          sentAt: new Date(now - (idx * 86400000)),
          sequenceName: idx % 2 === 0 ? 'Step 3 of Prospecting' : '',
          stage: idx % 2 === 0 ? `Step ${1 + (idx % 4)}` : '',
          subject: idx % 3 === 0 ? 'Energy contract timing (market dynamics)' : 'Follow up on your energy analysis',
          preview: 'Power Choosers — Smart Contract. Let’s review options for your energy plan... ',
          sentBy: 'LP'
        }));
      }

      // Fallback synthetic
      return [
        {
          id: 'em_1',
          recipientName: 'John Smith',
          recipientEmail: 'john@abc.com',
          delivered: true,
          opened: true,
          clicked: false,
          replied: false,
          sentAt: new Date(now - 86400000),
          sequenceName: 'Step 1 of Prospecting',
          stage: 'Intro',
          subject: 'Energy analysis review',
          preview: 'Thanks for taking the time, attaching the analysis...',
          sentBy: 'LP'
        }
      ];
    },

    bindEmailEvents() {
      const search = document.getElementById('emails-search-input');
      const composeBtn = document.getElementById('emails-compose-new');
      const filterSel = document.getElementById('emails-inbox-filter');
      if (composeBtn) composeBtn.addEventListener('click', () => this.openCompose());
      if (search) {
        search.addEventListener('input', (e) => {
          const q = (e.target.value || '').toLowerCase();
          if (window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn()) {
            // Re-fetch from Gmail using q as search
            this.loadEmailsFromGmail();
          } else {
            const all = this.getSampleEmails();
            const filtered = all.filter(x =>
              (x.recipientName||'').toLowerCase().includes(q) ||
              (x.recipientEmail||'').toLowerCase().includes(q) ||
              (x.subject||'').toLowerCase().includes(q)
            );
            this.renderEmailRows(filtered);
          }
        });
      }
      if (filterSel) {
        filterSel.addEventListener('change', () => {
          if (window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn()) {
            this.loadEmailsFromGmail();
          } else {
            this.renderEmailRows(this.getSampleEmails());
          }
        });
      }
    },

    // --- Compose Drawer ---
    ensureComposeDrawer() {
      if (document.getElementById('compose-drawer')) return;
      const drawer = document.createElement('div');
      drawer.id = 'compose-drawer';
      drawer.className = 'compose-drawer';
      drawer.innerHTML = `
        <div class="compose-header">
          <div class="title">New Message</div>
          <div class="actions">
            <button class="icon-btn" id="compose-minimize" title="Minimize">_</button>
            <button class="icon-btn" id="compose-close" title="Close">×</button>
          </div>
        </div>
        <div class="compose-body">
          <div class="row"><label>To</label><input type="text" id="compose-to" placeholder="Type a name or email..."/></div>
          <div class="row"><label>CC</label><input type="text" id="compose-cc" placeholder="Optional"/></div>
          <div class="row"><label>Subject</label><input type="text" id="compose-subject" placeholder="Subject"/></div>
          <div class="toolbar">
            <button class="tbtn" data-cmd="bold"><b>B</b></button>
            <button class="tbtn" data-cmd="italic"><i>I</i></button>
            <button class="tbtn" data-cmd="underline"><u>U</u></button>
            <button class="tbtn" id="toggle-html">HTML</button>
            <button class="tbtn" id="add-attachment">Attachment</button>
            <select id="template-select">
              <option value="">Templates</option>
              <option value="followup">Follow Up</option>
              <option value="intro">Introduction</option>
            </select>
          </div>
          <div id="compose-editor" class="editor" contenteditable="true"></div>
        </div>
        <div class="compose-footer">
          <div class="left">
            <button class="btn btn-primary" id="compose-send">Send</button>
            <button class="btn btn-secondary" id="compose-schedule">Schedule</button>
          </div>
          <div class="right">
            <span class="hint">Email tracking enabled</span>
          </div>
        </div>
      `;
      document.body.appendChild(drawer);

      // Events
      drawer.querySelector('#compose-close')?.addEventListener('click', () => this.closeCompose());
      drawer.querySelector('#compose-minimize')?.addEventListener('click', () => drawer.classList.toggle('minimized'));
      drawer.querySelector('#compose-send')?.addEventListener('click', async () => {
        const to = document.getElementById('compose-to')?.value || '';
        const cc = document.getElementById('compose-cc')?.value || '';
        const subject = document.getElementById('compose-subject')?.value || '';
        const html = document.getElementById('compose-editor')?.innerHTML || '';
        if (window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn()) {
          try {
            await GmailModule.sendMessage({ to, cc, subject, bodyHtml: html });
            this.notify('Email sent via Gmail', 'success');
            this.closeCompose();
            // Refresh current list
            this.loadEmailsFromGmail();
          } catch (err) {
            console.error(err);
            this.notify('Failed to send email via Gmail', 'error');
          }
        } else {
          this.notify('Connect Gmail to send emails', 'warning');
        }
      });

      drawer.querySelectorAll('.tbtn[data-cmd]')?.forEach(btn => {
        btn.addEventListener('click', () => {
          const cmd = btn.getAttribute('data-cmd');
          document.execCommand(cmd, false, null);
        });
      });

      drawer.querySelector('#template-select')?.addEventListener('change', (e) => {
        const v = e.target.value;
        const ed = document.getElementById('compose-editor');
        if (!ed) return;
        if (v === 'followup') ed.innerHTML = 'Hi {{first_name}},<br><br>Following up on the energy analysis we shared...';
        if (v === 'intro') ed.innerHTML = 'Hi {{first_name}},<br><br>Great to meet you. We help optimize energy spend...';
      });

      drawer.querySelector('#toggle-html')?.addEventListener('click', () => {
        const ed = document.getElementById('compose-editor');
        if (!ed) return;
        if (ed.getAttribute('contenteditable') === 'true') {
          ed.setAttribute('contenteditable', 'false');
          const pre = ed.textContent || ed.innerHTML;
          ed.textContent = pre;
        } else {
          ed.setAttribute('contenteditable', 'true');
          ed.innerHTML = ed.textContent || '';
        }
      });
    },

    openCompose(initial = {}) {
      this.ensureComposeDrawer();
      const drawer = document.getElementById('compose-drawer');
      if (!drawer) return;
      drawer.classList.add('open');
      const to = document.getElementById('compose-to');
      const cc = document.getElementById('compose-cc');
      const subj = document.getElementById('compose-subject');
      const ed = document.getElementById('compose-editor');
      if (to) to.value = initial.to || '';
      if (cc) cc.value = initial.cc || '';
      if (subj) subj.value = initial.subject || '';
      if (ed) ed.innerHTML = (initial.body || '').replace(/\n/g, '<br>');
    },

    closeCompose() {
      const drawer = document.getElementById('compose-drawer');
      if (!drawer) return;
      drawer.classList.remove('open');
    }
  });

  // Extend CRMApp with Gmail helpers
  Object.assign(CRMApp, {
    initGmailUI() {
      const statusEl = document.getElementById('gmail-status');
      const btn = document.getElementById('gmail-connect-btn');
      if (!btn || !statusEl) return;
      const update = () => {
        const connected = window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn();
        statusEl.textContent = connected ? 'Gmail: Connected' : 'Gmail: Disconnected';
        btn.textContent = connected ? 'Disconnect' : 'Connect Gmail';
      };
      btn.onclick = async () => {
        if (!window.GmailModule) return;
        const connected = GmailModule.isSignedIn && GmailModule.isSignedIn();
        if (connected) {
          GmailModule.signOut();
          this.renderEmailRows(this.getSampleEmails());
        } else {
          try {
            GmailModule.signIn();
            // Allow time for token callback
            setTimeout(() => {
              update();
              this.loadEmailsFromGmail();
            }, 500);
          } catch (e) { console.warn(e); }
        }
        update();
      };
      update();
    },

    async loadEmailsFromGmail() {
      if (!(window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn())) return;
      const filter = document.getElementById('emails-inbox-filter')?.value || 'primary';
      const qRaw = document.getElementById('emails-search-input')?.value || '';
      const q = qRaw.trim();
      try {
        let items = [];
        if (filter === 'sent') {
          items = await GmailModule.listMessages({ labelIds: ['SENT'], maxResults: 20, q });
        } else if (filter === 'drafts') {
          items = await GmailModule.listDrafts({ maxResults: 20 });
        } else if (filter === 'all') {
          items = await GmailModule.listMessages({ labelIds: [], maxResults: 20, q });
        } else {
          // primary/default -> INBOX
          items = await GmailModule.listMessages({ labelIds: ['INBOX'], maxResults: 20, q });
        }
        const rows = items.map(m => this._mapGmailToRow(m));
        this.renderEmailRows(rows);
      } catch (err) {
        console.error('Failed loading Gmail:', err);
        this.notify('Failed to load Gmail messages', 'error');
      }
    },

    _mapGmailToRow(m) {
      // Choose other party: if message has SENT/DRAFT label, show To; else show From
      const isSentLike = (m.labelIds || []).includes('SENT') || (m.labelIds || []).includes('DRAFT');
      const party = this._parseAddress(isSentLike ? (m.to || '') : (m.from || ''));
      return {
        id: m.id,
        recipientName: party.name || party.email || 'Unknown',
        recipientEmail: party.email || '',
        delivered: true,
        opened: !(m.labelIds || []).includes('UNREAD'),
        clicked: false,
        replied: false,
        sentAt: m.internalDate || m.date || new Date(),
        sequenceName: '',
        stage: '',
        subject: m.subject || '(No subject)',
        preview: m.snippet || '',
        sentBy: isSentLike ? 'Me' : (m.from || '')
      };
    },

    _parseAddress(raw) {
      const s = (raw || '').trim();
      if (!s) return { name: '', email: '' };
      const m = s.match(/^(.*)<([^>]+)>$/);
      if (m) {
        return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() };
      }
      return { name: '', email: s };
    },

    notify(msg, type = 'info') {
      if (this.showToast) return this.showToast(msg, type);
      if (this.showNotification) return this.showNotification(msg, type);
      console.log(type.toUpperCase() + ': ' + msg);
    }
  });

  // Global compose triggers from anywhere in the app
  document.addEventListener('click', (e) => {
    const mailto = e.target.closest && e.target.closest('a[href^="mailto:"]');
    const composeEl = e.target.closest && e.target.closest('[data-open-compose]');
    if (mailto) {
      e.preventDefault();
      const href = mailto.getAttribute('href') || '';
      const email = href.replace(/^mailto:/i, '').split('?')[0];
      CRMApp.openCompose({ to: email });
    } else if (composeEl) {
      e.preventDefault();
      const to = composeEl.getAttribute('data-to') || '';
      const subject = composeEl.getAttribute('data-subject') || '';
      const body = composeEl.getAttribute('data-body') || '';
      CRMApp.openCompose({ to, subject, body });
    }
  }, true);
})();
