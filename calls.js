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
    // Render the Calls page content (rebuilt)
    renderCallsPage() {
      const container = document.getElementById('calls-view');
      if (!container) return console.error('calls-view container not found');

      // Ensure the Calls view is visible and behaves like other modules (single card inside a 25px-margined view)
      container.style.display = 'block';

      // Sample rows (stub). Replace with real data when backend wiring is ready.
      const rows = [
        { id: 'c1', contact: 'Belinda Palm', company: 'Ram Winch & Hoist Ltd.', direction: 'Outbound', purpose: '-', disposition: '-', duration: '01:10', note: '-', date: '4 months ago', user: 'LP' },
        { id: 'c2', contact: 'Saadat Khan', company: 'Firehouse Subs', direction: 'Outbound', purpose: '-', disposition: '-', duration: '00:11', note: '-', date: '4 months ago', user: 'LP' },
        { id: 'c3', contact: 'Joseph Badarack', company: "Jersey Mike's Subs", direction: 'Outbound', purpose: 'Prospecting Call', disposition: 'Left Voicemail', duration: '00:45', note: 'check on contract end dates no answer', date: '4 months ago', user: 'LP' },
      ];

      container.innerHTML = `
        <div class="calls-container">
          <div class="calls-top-card">
            <div class="calls-header">
              <div class="title-with-icon">
                <span class="title-icon-badge title-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </span>
                <h1 class="contacts-title">Calls</h1>
              </div>
            </div>
            
            <!-- Top tools row (inside the top card) -->
            <div class="calls-toolbar">
              <div class="left">
                <button id="calls-filter-toggle-btn" class="filter-toggle-btn" title="Toggle filters">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                </button>
                <input id="calls-search" class="form-input calls-search" placeholder="Quick search" />
              </div>
            </div>
          </div>

          <div class="calls-main-layout">
            <!-- Main content row: sidebar + table -->
            <div class="calls-content">
              <!-- Sidebar placeholder to be populated by ensureFilters() -->
              <aside id="calls-filters-sidebar" class="calls-filters-sidebar collapsed"></aside>

              <!-- Table card (controls + table + bottom pagination) -->
              <div class="calls-table-container" style="--controls-h: 44px;">
                <!-- Top controls: selection + compact pagination -->
                <div class="table-controls">
                  <div class="table-controls-left">
                    <span class="selection-text" id="calls-select-all">Select All</span>
                  </div>
                  <div class="table-controls-right">
                    <span class="results-info" id="calls-results-info">Showing 0 of 0 calls</span>
                    <button class="pagination-btn" id="calls-top-prev" aria-label="Previous" title="Previous">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button class="pagination-btn" id="calls-top-next" aria-label="Next" title="Next">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                  </div>
                </div>

                <!-- Scrollable table area -->
                <div class="calls-table-wrapper">
                  <table class="calls-table">
                    <thead>
                      <tr>
                        <th class="col-number">#</th>
                        <th class="col-checkbox"><input type="checkbox" id="calls-header-select-all" aria-label="Select all on page"></th>
                        <th>Contact</th>
                        <th>Insights</th>
                        <th>Company</th>
                        <th>Direction</th>
                        <th>Purpose</th>
                        <th>Disposition</th>
                        <th>Duration</th>
                        <th>Note</th>
                        <th>Date</th>
                        <th>User</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody id="calls-tbody"></tbody>
                  </table>
                </div>

                <!-- Bottom pagination (inside the card) -->
                <div class="pagination-container">
                  <div class="pagination-info"><span id="calls-pagination-info2">Showing 0-0 of 0 calls</span></div>
                  <div class="pagination-controls">
                    <button class="pagination-btn" id="calls-prev" aria-label="Previous" title="Previous">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div class="pagination-numbers" id="calls-page-nums"></div>
                    <button class="pagination-btn" id="calls-next" aria-label="Next" title="Next">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind actions
      // (Removed New call button)

      // State and helpers
      this.callsPerPage = this.callsPerPage || 50;
      this.callsCurrentPage = this.callsCurrentPage || 1;
      this.callsSelectedIds = this.callsSelectedIds || new Set();
      this.callsFilters = this.callsFilters || { accountId: '', title: '', date: '', search: '' };

      const tbody = container.querySelector('#calls-tbody');
      const search = container.querySelector('#calls-search');

      const getFiltered = () => {
        const q = (this.callsFilters.search || '').toLowerCase();
        // Derive title/account matching via global datasets when available
        const accounts = Array.isArray(this.accounts) ? this.accounts : [];
        const contacts = Array.isArray(this.contacts) ? this.contacts : [];

        const selectedAccountId = this.callsFilters.accountId || '';
        const selectedTitle = (this.callsFilters.title || '').toLowerCase();
        const selectedDate = this.callsFilters.date || '';

        return rows.filter(r => {
          let ok = true;
          const hay = `${r.contact} ${r.company} ${r.purpose} ${r.disposition} ${r.note}`.toLowerCase();
          if (q) ok = ok && hay.includes(q);

          if (selectedAccountId) {
            const acct = accounts.find(a => a.id === selectedAccountId);
            if (acct) ok = ok && (r.company === acct.name || r.company === acct.accountName);
          }

          if (selectedTitle) {
            const c = contacts.find(c0 => `${(c0.firstName||'').trim()} ${(c0.lastName||'').trim()}`.trim().toLowerCase() === (r.contact||'').toLowerCase());
            if (c) ok = ok && ((c.title||'').toLowerCase() === selectedTitle);
            else ok = ok && false; // if filtering by title but no match, exclude
          }

          if (selectedDate) {
            // Basic relative date filter using r.date string (fallback heuristic)
            const d = (r.date||'').toLowerCase();
            if (selectedDate === 'today') ok = ok && d.includes('today');
            else if (selectedDate === 'week') ok = ok && (d.includes('day') || d.includes('week'));
            else if (selectedDate === 'month') ok = ok && (d.includes('week') || d.includes('month'));
          }

          return ok;
        });
      };

      // Ensure header select-all reflects current page checkboxes
      function updateHeaderSelectState() {
        const headerSelectAll = document.getElementById('calls-header-select-all');
        if (!headerSelectAll) return;
        const boxes = tbody.querySelectorAll('.row-checkbox');
        const allChecked = boxes.length > 0 && [...boxes].every(cb => cb.checked);
        const someChecked = boxes.length > 0 && [...boxes].some(cb => cb.checked);
        headerSelectAll.checked = allChecked;
        headerSelectAll.indeterminate = !allChecked && someChecked;
      }

      const renderPagination = (total, page, totalPages) => {
        const infoTop = document.getElementById('calls-results-info');
        const prevTop = document.getElementById('calls-top-prev');
        const nextTop = document.getElementById('calls-top-next');
        const prev = document.getElementById('calls-prev');
        const next = document.getElementById('calls-next');
        const nums = document.getElementById('calls-page-nums');
        const info2 = document.getElementById('calls-pagination-info2');
        const from = total === 0 ? 0 : (page-1)*this.callsPerPage + 1;
        const to = Math.min(page*this.callsPerPage, total);
        if (infoTop) infoTop.textContent = `Showing ${total} of ${rows.length} calls`;
        if (info2) info2.textContent = `Showing ${from}-${to} of ${total} calls`;

        if (prevTop) {
          prevTop.disabled = page <= 1;
          prevTop.onclick = () => { if (this.callsCurrentPage>1){ this.callsCurrentPage--; renderRows(); } };
        }
        if (nextTop) {
          nextTop.disabled = page >= totalPages;
          nextTop.onclick = () => { if (this.callsCurrentPage<totalPages){ this.callsCurrentPage++; renderRows(); } };
        }
        if (prev) {
          prev.disabled = page <= 1;
          prev.onclick = () => { if (this.callsCurrentPage>1){ this.callsCurrentPage--; renderRows(); } };
        }
        if (next) {
          next.disabled = page >= totalPages;
          next.onclick = () => { if (this.callsCurrentPage<totalPages){ this.callsCurrentPage++; renderRows(); } };
        }
        if (nums) {
          const maxButtons = Math.min(7, totalPages);
          let start = Math.max(1, page - Math.floor(maxButtons/2));
          let end = Math.min(totalPages, start + maxButtons - 1);
          start = Math.max(1, end - maxButtons + 1);
          nums.innerHTML = '';
          for (let i=start; i<=end; i++) {
            const b = document.createElement('button');
            b.className = 'page-num' + (i===page ? ' active':'');
            b.textContent = String(i);
            b.onclick = () => { this.callsCurrentPage = i; renderRows(); };
            nums.appendChild(b);
          }
        }
      };

      const renderRows = () => {
        const all = getFiltered();
        const total = all.length;
        const per = this.callsPerPage;
        const totalPages = Math.max(1, Math.ceil(total / per));
        if (this.callsCurrentPage > totalPages) this.callsCurrentPage = totalPages;
        const startIdx = (this.callsCurrentPage - 1) * per;
        const pageItems = all.slice(startIdx, startIdx + per);

        tbody.innerHTML = pageItems.map((r, idx) => {
          const i = startIdx + idx + 1;
          const checked = this.callsSelectedIds.has(r.id) ? 'checked' : '';
          return `
            <tr class="call-row" data-id="${r.id}">
              <td class="col-number"><span class="row-number">${i}</span></td>
              <td class="col-checkbox">
                <div class="row-select">
                  <input type="checkbox" class="row-checkbox" data-id="${r.id}" ${checked}>
                </div>
              </td>
              <td class="contact">${r.contact}</td>
              <td class="insights"><button class="link-btn insights-btn" data-id="${r.id}">Call insights</button></td>
              <td class="company">${r.company}</td>
              <td class="direction">${r.direction}</td>
              <td class="purpose">${r.purpose}</td>
              <td class="disposition">${r.disposition}</td>
              <td class="duration">${r.duration}</td>
              <td class="note">${r.note}</td>
              <td class="date">${r.date}</td>
              <td class="user">${r.user}</td>
              <td class="row-actions">
                <button class="icon-btn play-btn" title="Play recording" data-id="${r.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
              </td>
            </tr>`;
        }).join('');

        // Checkbox wiring for current page
        tbody.querySelectorAll('.row-checkbox').forEach(cb => {
          cb.addEventListener('change', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (e.currentTarget.checked) this.callsSelectedIds.add(id);
            else this.callsSelectedIds.delete(id);
            updateHeaderSelectState();
          });
        });

        renderPagination(total, this.callsCurrentPage, totalPages);
        updateHeaderSelectState();
      };

      // Initial render and bindings
      renderRows();
      if (search && !search._calls_bound) {
        search._calls_bound = true;
        search.addEventListener('input', (e) => { this.callsFilters.search = (e.target && e.target.value) || ''; this.callsCurrentPage = 1; renderRows(); });
      }
      if (tbody && !tbody._calls_bound) {
        tbody._calls_bound = true;
        tbody.addEventListener('click', (e) => {
          const t = e.target;
          const btn = t && t.closest ? t.closest('.insights-btn, .play-btn') : null;
          if (!btn) return;
          const id = btn.getAttribute('data-id');
          const row = rows.find(r => r.id === id);
          if (row) this.openCallInsightsModal(row);
        });
      }

      // Select all current page
      const selectAllText = document.getElementById('calls-select-all');
      const headerSelectAll = document.getElementById('calls-header-select-all');
      const toggleSelectAll = () => {
        const boxes = tbody.querySelectorAll('.row-checkbox');
        const shouldSelect = [...boxes].some(cb => !cb.checked);
        boxes.forEach(cb => { cb.checked = shouldSelect; const id = cb.getAttribute('data-id'); if (shouldSelect) this.callsSelectedIds.add(id); else this.callsSelectedIds.delete(id); });
        updateHeaderSelectState();
      };
      if (selectAllText && !selectAllText._calls_bound) { selectAllText._calls_bound = true; selectAllText.addEventListener('click', toggleSelectAll); }
      if (headerSelectAll && !headerSelectAll._calls_bound) { headerSelectAll._calls_bound = true; headerSelectAll.addEventListener('change', toggleSelectAll); }

      // Filters sidebar wiring (populate from Contacts/Accounts when available)
      const ensureFilters = () => {
        let el = document.getElementById('calls-filters-sidebar');
        if (!el) {
          const contentRow = container.querySelector('.calls-content') || container.querySelector('.calls-main-layout') || container;
          el = document.createElement('aside');
          el.id = 'calls-filters-sidebar';
          el.className = 'calls-filters-sidebar collapsed';
          contentRow.insertBefore(el, contentRow.firstElementChild || null);
        }
        // Populate/refresh inner content
        el.innerHTML = `
          <div class="filters-header">
            <div class="filters-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              <h3>Filters</h3>
            </div>
            <button class="filters-collapse-btn" id="calls-filters-collapse-btn" title="Collapse filters">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
          </div>
          <div class="filters-content">
            <div class="filter-group">
              <label class="filter-label">Search</label>
              <input type="text" class="filter-input" id="calls-filter-search" placeholder="Search calls..." />
            </div>
            <div class="filter-group">
              <label class="filter-label">Account</label>
              <select class="filter-select" id="calls-account-filter"><option value="">All Accounts</option></select>
            </div>
            <div class="filter-group">
              <label class="filter-label">Title</label>
              <select class="filter-select" id="calls-title-filter"><option value="">All Titles</option></select>
            </div>
            <div class="filter-group">
              <label class="filter-label">Created Date</label>
              <select class="filter-select" id="calls-date-filter">
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>
            <div class="filter-actions"><button class="btn btn-secondary" id="calls-clear-filters">Clear All</button></div>
          </div>`;
      };

      const populateFilters = () => {
        const accounts = Array.isArray(this.accounts) ? this.accounts : [];
        const contacts = Array.isArray(this.contacts) ? this.contacts : [];
        const accountSel = document.getElementById('calls-account-filter');
        if (accountSel) {
          const seen = new Set();
          accountSel.innerHTML = '<option value="">All Accounts</option>';
          accounts.forEach(a => {
            if (a.id && a.name && !seen.has(a.id)) {
              seen.add(a.id);
              const opt = document.createElement('option');
              opt.value = a.id; opt.textContent = a.name; accountSel.appendChild(opt);
            }
          });
          // If still empty, derive from rows
          if (accountSel.children.length === 1) {
            const names = [...new Set(rows.map(r => r.company).filter(Boolean))].sort();
            names.forEach(n => { const opt = document.createElement('option'); opt.value=''; opt.textContent=n; accountSel.appendChild(opt); });
          }
        }
        const titleSel = document.getElementById('calls-title-filter');
        if (titleSel) {
          const titles = [...new Set(contacts.map(c => (c.title||'').trim()).filter(Boolean))].sort();
          titleSel.innerHTML = '<option value="">All Titles</option>' + titles.map(t=>`<option value="${t}">${t}</option>`).join('');
        }
      };

      document.getElementById('calls-filter-toggle-btn')?.addEventListener('click', (e) => {
        ensureFilters();
        const sidebar = document.getElementById('calls-filters-sidebar');
        if (!sidebar) return;
        const open = !sidebar.classList.contains('collapsed');
        if (open) {
          sidebar.classList.add('collapsed');
          e.currentTarget.classList.remove('active');
        } else {
          sidebar.classList.remove('collapsed');
          e.currentTarget.classList.add('active');
        }
        populateFilters();
      });

      document.addEventListener('change', (e) => {
        const t = e.target;
        if (!t) return;
        if (t.id === 'calls-filter-search') { this.callsFilters.search = t.value || ''; this.callsCurrentPage = 1; renderRows(); }
        if (t.id === 'calls-account-filter') { this.callsFilters.accountId = t.value || ''; this.callsCurrentPage = 1; renderRows(); }
        if (t.id === 'calls-title-filter') { this.callsFilters.title = t.value || ''; this.callsCurrentPage = 1; renderRows(); }
        if (t.id === 'calls-date-filter') { this.callsFilters.date = t.value || ''; this.callsCurrentPage = 1; renderRows(); }
        if (t.id === 'calls-header-select-all') { /* handled above */ }
      });

      // Click handlers for Clear/Collapse
      document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t) return;
        if (t.id === 'calls-clear-filters') {
          this.callsFilters = { accountId: '', title: '', date: '', search: '' };
          const fs = document.getElementById('calls-filters-sidebar');
          if (fs) {
            const selA = fs.querySelector('#calls-account-filter'); if (selA) selA.value = '';
            const selT = fs.querySelector('#calls-title-filter'); if (selT) selT.value = '';
            const selD = fs.querySelector('#calls-date-filter'); if (selD) selD.value = '';
            const inpS = fs.querySelector('#calls-filter-search'); if (inpS) inpS.value = '';
          }
          const topSearch = document.getElementById('calls-search'); if (topSearch) topSearch.value = '';
          this.callsCurrentPage = 1; renderRows();
        }
        // Make collapse work even when clicking the SVG or its children
        const collapseBtn = t.closest ? t.closest('#calls-filters-collapse-btn') : null;
        if (collapseBtn) {
          const sidebar = document.getElementById('calls-filters-sidebar');
          if (sidebar) sidebar.classList.add('collapsed');
        }
      });

      // Ensure the standard widget panel shows the dialer and remains visible
      this.openDialerWidget('crm');
      const crm = document.getElementById('crm-widgets-container');
      if (crm) crm.style.display = 'flex';
      const cc = document.getElementById('cold-calling-widgets-container');
      if (cc) cc.style.display = 'none';
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
          <div class="list-row">
            <div class="list-main">
              <span class="list-name">${item.name}</span>
              <span class="list-sub">${item.number}</span>
            </div>
            <div class="list-meta">
              <span class="list-timestamp">${item.when}</span>
              <span class="badge">${item.result}</span>
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
          this.openDialerWidget('crm');
          // Prefill number
          const input = document.getElementById('dialer-phone-input');
          if (input) input.value = number;
          this.showNotification(`Preparing call to ${name} ${number}`, 'info');
        });
      });
    },

    // Render a simple call queue with mock data
    renderCallQueue() {
      const list = document.getElementById('call-queue-list');
      if (!list) return;
      const items = [
        { name: 'Jordan Blake', number: '(469) 555-0147', stage: 'New', priority: 'High' },
        { name: 'Leslie Gomez', number: '(214) 555-9083', stage: 'Follow-up', priority: 'Medium' },
        { name: 'Taylor Kim', number: '(972) 555-3321', stage: 'Demo', priority: 'Low' }
      ];
      const q = (document.getElementById('queue-search') || {}).value?.toLowerCase?.() || '';
      const filtered = q ? items.filter(i => i.name.toLowerCase().includes(q) || i.number.toLowerCase().includes(q)) : items;
      list.innerHTML = filtered.map(i => `
        <div class="list-row">
          <div class="list-main">
            <span class="list-name">${i.name}</span>
            <span class="list-sub">${i.number}</span>
          </div>
          <div class="list-meta">
            <span class="badge">${i.stage}</span>
            <span class="badge">${i.priority}</span>
            <button class="btn btn-primary" data-action="queue-call" data-number="${i.number}" data-name="${i.name}">Call</button>
          </div>
        </div>
      `).join('');
      list.querySelectorAll('button[data-action="queue-call"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const t = e.currentTarget;
          const number = t.getAttribute('data-number') || '';
          const name = t.getAttribute('data-name') || '';
          this.openDialerWidget('crm');
          const input = document.getElementById('dialer-phone-input');
          if (input) input.value = number;
          this.showNotification(`Calling ${name} ${number}`, 'success');
        });
      });
      const search = document.getElementById('queue-search');
      if (search && !search._calls_bound) {
        search._calls_bound = true;
        search.addEventListener('input', () => this.renderCallQueue());
      }
    },

    // Open the dialer widget in the right-hand widget panel.
    // targetPanel: 'crm' | 'cold'
    openDialerWidget(targetPanel = 'crm') {
      const crmPanel = document.getElementById('crm-widgets-container');
      const coldPanel = document.getElementById('cold-calling-widgets-container');
      const target = targetPanel === 'cold' ? coldPanel : crmPanel;
      if (!target) return console.warn('Target widget panel not found:', targetPanel);

      // Reuse existing dialer if present anywhere; otherwise create new
      const existing = document.getElementById('dialer-widget');
      let dialer = existing || null;
      if (existing && existing.parentElement !== target) {
        target.prepend(existing);
      }
      if (!dialer || dialer.parentElement !== target) {
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

      let callBtn = document.getElementById('dialer-call-btn');
      let prevText = callBtn ? callBtn.textContent : '';
      try {
        this.showNotification(`Calling ${number}...`, 'info');
        // Disable the Call button while the request is in flight
        callBtn = document.getElementById('dialer-call-btn');
        prevText = callBtn ? callBtn.textContent : '';
        if (callBtn) {
          callBtn.disabled = true;
          callBtn.textContent = 'Calling...';
        }
        const base = apiBase();
        const res = await fetch(`${base}/api/vonage/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': '1'
          },
          body: JSON.stringify({ to: number })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const baseMsg = (data && (data.title || data.error || data.detail)) || `HTTP ${res.status}`;
          let hint = '';
          if (res.status === 400) {
            hint = ' Check the phone number format (use E.164 like +19725551234).';
          } else if (res.status === 401 || res.status === 403) {
            hint = ' Auth error: verify VONAGE_APPLICATION_ID and private key on the backend.';
          } else if (res.status >= 500) {
            hint = ' Server/upstream error: check backend logs and Vonage status.';
          }
          this.showNotification(`Vonage call failed: ${baseMsg}.${hint}`, 'error');
          const id = document.getElementById('dialer-caller-id');
          if (id) id.textContent = `Caller: ${number} – Error: ${baseMsg}`;
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
              const r = await fetch(`${base}/api/vonage/call/status?uuid=${encodeURIComponent(uuid)}`, {
                headers: { 'ngrok-skip-browser-warning': '1' }
              });
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
        let advice = 'Network error placing call';
        try {
          const base = apiBase();
          if (!base) advice += ' – API base is relative. If your backend is remote, set window.CRM_API_BASE_URL or localStorage.CRM_API_BASE_URL.';
        } catch (_) {}
        advice += ' Check CORS allowlist on the backend and confirm the API URL is reachable.';
        this.showNotification(advice, 'error');
        const id = document.getElementById('dialer-caller-id');
        if (id) id.textContent = `Caller: ${number} – Network error`;
      }
      finally {
        callBtn = document.getElementById('dialer-call-btn');
        if (callBtn) {
          callBtn.disabled = false;
          callBtn.textContent = prevText || 'Call';
        }
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
    },

    // --- Calls modal helpers ---
    ensureCallsModalRoot() {
      if (document.getElementById('call-insights-modal')) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div id="call-insights-modal" class="calls-modal-overlay" aria-hidden="true">
          <div class="calls-modal" role="dialog" aria-modal="true" aria-labelledby="calls-modal-title">
            <div class="modal-header">
              <h3 id="calls-modal-title" class="modal-title">Call insights</h3>
              <button class="icon-btn modal-close" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="modal-sections">
                <section class="insights-section">
                  <h4>AI Insights</h4>
                  <div id="modal-insights-content" class="content">—</div>
                </section>
                <section class="transcription-section">
                  <h4>Transcription</h4>
                  <div id="modal-transcript" class="transcript"></div>
                </section>
                <section class="recording-section">
                  <h4>Recording</h4>
                  <audio id="modal-audio" controls preload="none"></audio>
                </section>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrap.firstElementChild);
      document.querySelector('#call-insights-modal .modal-close')?.addEventListener('click', () => this.closeCallInsightsModal());
      document.getElementById('call-insights-modal')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'call-insights-modal') this.closeCallInsightsModal();
      });
      document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('call-insights-modal');
        if (!modal || modal.getAttribute('aria-hidden') !== 'false') return;
        if (e.key === 'Escape') this.closeCallInsightsModal();
      });
    },

    openCallInsightsModal(row, opts = {}) {
      this.ensureCallsModalRoot();
      const modal = document.getElementById('call-insights-modal');
      if (!modal) return;
      // Populate content
      const insights = document.getElementById('modal-insights-content');
      const transcript = document.getElementById('modal-transcript');
      const audio = document.getElementById('modal-audio');

      if (insights) insights.innerHTML = `
        <ul>
          <li><strong>Contact:</strong> ${row.contact}</li>
          <li><strong>Company:</strong> ${row.company}</li>
          <li><strong>Summary:</strong> Prospect showed mild interest. Next step: send follow-up email and schedule a demo.</li>
          <li><strong>Sentiment:</strong> Neutral → Positive</li>
          <li><strong>Action items:</strong> Send pricing, book 30-min demo, confirm decision maker.</li>
        </ul>`;

      if (transcript) transcript.textContent = `00:00 Caller: Hi ${row.contact}, thanks for taking the call.\n00:08 Prospect: Sure, I have a few minutes.\n00:31 Caller: We help teams automate ...\n01:02 Prospect: Send the details and we can schedule.\n${row.duration} End.`;

      if (audio) {
        // Placeholder recording (none provided). Keep control visible without src.
        audio.removeAttribute('src');
      }

      // Show modal
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.add('open');
    },

    closeCallInsightsModal() {
      const modal = document.getElementById('call-insights-modal');
      if (!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  });
})();
