// Power Choosers CRM Dashboard - Emails Module
// Gmail/Apollo-inspired email list with global slide-up compose

(function() {
  if (typeof window.CRMApp === 'undefined') return;

  Object.assign(CRMApp, {
    // DEV: force visibility of all status icons in the list for testing/demo
    emailsDevShowAllStatuses: true,
    // Render Emails main view
    renderEmailsPage() {
      const container = document.getElementById('emails-view');
      if (!container) return;

      // Scaffold redesigned Gmail-like layout with collapsible folders
      container.innerHTML = `
        <section class="emails-layout">
          <div class="emails-header">
            <div class="title-with-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="title-icon"><path d="M4 4h16v16H4z"></path><path d="M22 6l-10 7L2 6"></path></svg>
              <h2 class="emails-title">Emails</h2>
            </div>
            <div class="emails-actions-right">
              <button class="folder-toggle-btn active" id="emails-folder-toggle-btn" title="Toggle folders">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <div class="emails-search">
                <input id="emails-search-input" type="text" placeholder="Search mail..." />
              </div>
              <span id="gmail-status" style="margin-left:12px;color:#9aa4b2;">Gmail: Disconnected</span>
              <button class="btn btn-secondary" id="gmail-connect-btn" style="margin-left:8px;">Connect Gmail</button>
              <button class="btn btn-secondary" id="emails-manage-mailboxes">Mailboxes</button>
              <button class="btn btn-primary open-compose" id="emails-compose-new">Compose</button>
            </div>
          </div>

          <div class="emails-main-layout">
            <!-- Folders Sidebar -->
            <aside class="emails-folders-sidebar" id="emails-folders-sidebar">
              <div class="folders-header">
                <h3>Mailboxes</h3>
                <button class="folders-collapse-btn" id="emails-folders-collapse-btn" title="Collapse">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
              </div>
              <nav class="folders-list" id="emails-folders">
                <button class="folder-item active" data-folder="inbox" title="Inbox">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5 7l2-3h10l2 3"></path><path d="M5 7v10h14V7"></path></svg>
                  <span class="label">Inbox</span>
                </button>
                <button class="folder-item" data-folder="sent" title="Sent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  <span class="label">Sent</span>
                </button>
                <button class="folder-item" data-folder="drafts" title="Drafts">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
                  <span class="label">Drafts</span>
                </button>
                <button class="folder-item" data-folder="opened" title="Opened">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  <span class="label">Opened</span>
                </button>
                <button class="folder-item" data-folder="scheduled" title="Scheduled">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  <span class="label">Scheduled</span>
                </button>
                <button class="folder-item" data-folder="all" title="All Mail">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><polyline points="3 7 12 13 21 7"></polyline></svg>
                  <span class="label">All Mail</span>
                </button>
                <button class="folder-item" data-folder="spam" title="Spam">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><line x1="16" y1="8" x2="8" y2="16"></line><line x1="8" y1="8" x2="16" y2="16"></line></svg>
                  <span class="label">Spam</span>
                </button>
                <button class="folder-item" data-folder="trash" title="Trash">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
                  <span class="label">Trash</span>
                </button>
              </nav>
            </aside>

            <!-- Table Area -->
            <div class="emails-table-container" id="emails-table-container">
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
                  <span class="hint" id="emails-pagination-info"></span>
                </div>
                <div class="right">
                  <div class="pagination-controls">
                    <button class="pagination-btn" id="emails-prev-page-btn" aria-label="Previous" title="Previous">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                    </button>
                    <div class="pagination-numbers" id="emails-pagination-numbers"></div>
                    <button class="pagination-btn" id="emails-next-page-btn" aria-label="Next" title="Next">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      `;

      // Default folder state and initial load
      this.emailsFolder = this.emailsFolder || 'inbox';
      if (window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn()) {
        this.loadEmailsFromGmail();
      } else {
        const emails = this._filterSampleByFolder(this.getSampleEmails(), this.emailsFolder);
        this.emailsPerPage = this.emailsPerPage || 50;
        this.emailsCurrentPage = this.emailsCurrentPage || 1;
        this.renderEmailsTable(emails);
      }
      this.ensureComposeDrawer();
      this.bindEmailEvents();
      this.initGmailUI();
    },

    // Render Emails table with pagination
    renderEmailsTable(allEmails) {
      this.emails = allEmails || [];
      const total = this.emails.length;
      const per = this.emailsPerPage || 50;
      const totalPages = Math.max(1, Math.ceil(total / per));
      const page = Math.min(this.emailsCurrentPage || 1, totalPages);
      const startIdx = (page - 1) * per;
      const pageItems = this.emails.slice(startIdx, startIdx + per);

      // Update total count separately
      const countEl = document.getElementById('emails-count');
      if (countEl) countEl.textContent = `${total} emails`;

      this.renderEmailRows(pageItems);
      this.renderEmailsPagination(total, page, totalPages);
    },

    // Contacts/Accounts-style pagination controls
    renderEmailsPagination(total, page, totalPages) {
      const info = document.getElementById('emails-pagination-info');
      const prev = document.getElementById('emails-prev-page-btn');
      const next = document.getElementById('emails-next-page-btn');
      const nums = document.getElementById('emails-pagination-numbers');

      const per = this.emailsPerPage || 50;
      const from = total === 0 ? 0 : (page - 1) * per + 1;
      const to = Math.min(page * per, total);
      if (info) info.textContent = `Showing ${from}-${to} of ${total} emails`;

      if (prev) {
        prev.disabled = page <= 1;
        prev.onclick = () => { if (this.emailsCurrentPage > 1) { this.emailsCurrentPage--; this.renderEmailsTable(this.emails); } };
      }
      if (next) {
        next.disabled = page >= totalPages;
        next.onclick = () => { if (this.emailsCurrentPage < totalPages) { this.emailsCurrentPage++; this.renderEmailsTable(this.emails); } };
      }
      if (nums) {
        const maxButtons = Math.min(7, totalPages);
        let start = Math.max(1, page - Math.floor(maxButtons / 2));
        let end = Math.min(totalPages, start + maxButtons - 1);
        start = Math.max(1, end - maxButtons + 1);
        nums.innerHTML = '';
        for (let i = start; i <= end; i++) {
          const b = document.createElement('button');
          b.className = 'page-num' + (i === page ? ' active' : '');
          b.textContent = String(i);
          b.onclick = () => { this.emailsCurrentPage = i; this.renderEmailsTable(this.emails); };
          nums.appendChild(b);
        }
      }
    },

    renderEmailRows(emails) {
      const tbody = document.getElementById('emails-tbody');
      if (!tbody) return;
      tbody.innerHTML = emails.map(e => this.emailRowHTML(e)).join('');

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
            ${e.delivered ? `<span title="Delivered" class="st st-delivered" aria-label="Delivered"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><polyline points="3 7 12 13 21 7"></polyline></svg></span>` : ''}
            ${e.opened ? `<span title="Opened" class="st st-opened" aria-label="Opened"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></span>` : ''}
            ${e.clicked ? `<span title="Clicked" class="st st-clicked" aria-label="Clicked"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 7h3a5 5 0 0 1 0 10h-3"></path><path d="M9 17H6a5 5 0 0 1 0-10h3"></path><line x1="8" y1="12" x2="16" y2="12"></line></svg></span>` : ''}
            ${e.replied ? `<span title="Replied" class="st st-replied" aria-label="Replied"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg></span>` : ''}
          </td>
          <td>${this.formatDate(e.sentAt)}</td>
          <td>${e.sequenceName ? `${e.sequenceName} · ${e.stage}` : '—'}</td>
          <td class="message">
            <div class="subject">${e.subject || '(No subject)'}</div>
            <div class="preview">${e.preview || ''}</div>
          </td>
          <td>${e.sentBy || 'Me'}</td>
          <td class="row-actions">
            <button class="icon-btn" title="Reply" onclick="CRMApp.openCompose({to: '${(e.recipientEmail||'').replace(/'/g, "&#39;")}', subject: 'Re: ${(e.subject||'').replace(/'/g, "\\'")}'})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="9 14 4 9 9 4"></polyline>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
              </svg>
            </button>
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
        return base.map((c, idx) => {
          const row = {
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
          };
          if (this.emailsDevShowAllStatuses) {
            // Ensure first few rows showcase all icons combinations
            if (idx === 0) { row.delivered = true; row.opened = true; row.clicked = true; row.replied = true; }
            if (idx === 1) { row.delivered = true; row.opened = true; row.clicked = true; row.replied = false; }
            if (idx === 2) { row.delivered = true; row.opened = true; row.clicked = false; row.replied = true; }
          }
          return row;
        });
      }

      // Fallback synthetic
      const demo = {
        id: 'em_1',
        recipientName: 'John Smith',
        recipientEmail: 'john@abc.com',
        delivered: true,
        opened: true,
        clicked: this.emailsDevShowAllStatuses ? true : false,
        replied: this.emailsDevShowAllStatuses ? true : false,
        sentAt: new Date(now - (1 * 86400000)),
        sequenceName: 'Step 3 of Prospecting',
        stage: 'Step 1',
        subject: 'Energy contract timing (market dynamics)',
        preview: 'Power Choosers — Smart Contract. Let’s review options for your energy plan... ',
        sentBy: 'LP'
      };
      return [demo];
    },

    _filterSampleByFolder(list, folder) {
      const f = folder || 'inbox';
      if (f === 'opened') return list.filter(x => !!x.opened);
      // For demo, return all for other folders
      return list;
    },

    bindEmailEvents() {
      const search = document.getElementById('emails-search-input');
      const composeBtn = document.getElementById('emails-compose-new');
      const folderToggleBtn = document.getElementById('emails-folder-toggle-btn');
      const collapseBtn = document.getElementById('emails-folders-collapse-btn');
      if (composeBtn) composeBtn.addEventListener('click', () => this.openCompose());
      if (search) {
        search.addEventListener('input', (e) => {
          const q = (e.target.value || '').toLowerCase();
          if (window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn()) {
            this.loadEmailsFromGmail();
          } else {
            const all = this._filterSampleByFolder(this.getSampleEmails(), this.emailsFolder || 'inbox');
            const filtered = all.filter(x =>
              (x.recipientName||'').toLowerCase().includes(q) ||
              (x.recipientEmail||'').toLowerCase().includes(q) ||
              (x.subject||'').toLowerCase().includes(q)
            );
            this.emailsCurrentPage = 1;
            this.renderEmailsTable(filtered);
          }
        });
      }

      // Folder selection
      document.querySelectorAll('#emails-folders .folder-item').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#emails-folders .folder-item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.emailsFolder = btn.getAttribute('data-folder') || 'inbox';
          if (window.GmailModule && GmailModule.isSignedIn && GmailModule.isSignedIn()) {
            this.loadEmailsFromGmail();
          } else {
            const items = this._filterSampleByFolder(this.getSampleEmails(), this.emailsFolder);
            this.emailsCurrentPage = 1;
            this.renderEmailsTable(items);
          }
        });
      });

      const toggleSidebar = () => {
        const sb = document.getElementById('emails-folders-sidebar');
        if (!sb) return;
        const collapsed = sb.classList.toggle('collapsed');
        if (folderToggleBtn) folderToggleBtn.classList.toggle('active', !collapsed);
      };
      if (folderToggleBtn) folderToggleBtn.addEventListener('click', toggleSidebar);
      if (collapseBtn) collapseBtn.addEventListener('click', toggleSidebar);
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
      const folder = this.emailsFolder || 'inbox';
      const qRaw = document.getElementById('emails-search-input')?.value || '';
      const q = qRaw.trim();
      try {
        let items = [];
        if (folder === 'sent') {
          items = await GmailModule.listMessages({ labelIds: ['SENT'], maxResults: 20, q });
        } else if (folder === 'drafts') {
          items = await GmailModule.listDrafts({ maxResults: 20 });
        } else if (folder === 'all') {
          items = await GmailModule.listMessages({ labelIds: [], maxResults: 20, q });
        } else if (folder === 'spam') {
          items = await GmailModule.listMessages({ labelIds: ['SPAM'], maxResults: 20, q });
        } else if (folder === 'trash') {
          items = await GmailModule.listMessages({ labelIds: ['TRASH'], maxResults: 20, q });
        } else {
          // inbox and others default to INBOX
          items = await GmailModule.listMessages({ labelIds: ['INBOX'], maxResults: 20, q });
        }
        let rows = items.map(m => this._mapGmailToRow(m));
        if (folder === 'opened') rows = rows.filter(r => r.opened);
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
        clicked: this.emailsDevShowAllStatuses ? true : false,
        replied: this.emailsDevShowAllStatuses ? true : false,
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
