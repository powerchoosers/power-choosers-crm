// Power Choosers CRM Dashboard - Contacts Module
// This module contains all contacts functionality

// Extend CRMApp with contacts functions
Object.assign(CRMApp, {
    // Toggle contacts filters sidebar with modern design
    toggleContactsFilters() {
        const sidebar = document.getElementById('contacts-filters-sidebar');
        const toggleBtn = document.getElementById('filters-collapse-btn');
        const filterToggleBtn = document.getElementById('filter-toggle-btn');
        
        if (!sidebar) return;

        const isCollapsed = sidebar.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand
            sidebar.classList.remove('collapsed');
            if (toggleBtn) {
                toggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
            }
            if (filterToggleBtn) {
                filterToggleBtn.classList.add('active');
            }
        } else {
            // Collapse
            sidebar.classList.add('collapsed');
            if (toggleBtn) {
                toggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
            }
            if (filterToggleBtn) {
                filterToggleBtn.classList.remove('active');
            }
        }
    },

    // Populate simple sidebar filters from current contacts/accounts
    populateContactsFilters() {
        const contacts = Array.isArray(this.contacts) ? this.contacts : [];
        const accounts = Array.isArray(this.accounts) ? this.accounts : [];

        // Account select (by id)
        const accountSel = document.getElementById('account-filter');
        if (accountSel) {
            const seen = new Set();
            accountSel.innerHTML = '<option value="">All Accounts</option>';
            contacts.forEach(c => {
                if (c.accountId && c.accountName && !seen.has(c.accountId)) {
                    seen.add(c.accountId);
                    const opt = document.createElement('option');
                    opt.value = c.accountId;
                    opt.textContent = c.accountName;
                    accountSel.appendChild(opt);
                }
            });
        }

        // Title select
        const titleSel = document.getElementById('title-filter');
        if (titleSel) {
            const titles = [...new Set(contacts.map(c => (c.title||'').trim()).filter(Boolean))].sort();
            titleSel.innerHTML = '<option value="">All Titles</option>' + titles.map(t=>`<option value="${t}">${t}</option>`).join('');
        }

        // Location select (use account address)
        const locationSel = document.getElementById('location-filter');
        if (locationSel) {
            const locations = [...new Set(accounts.map(a => (a.address||'').trim()).filter(Boolean))].sort();
            locationSel.innerHTML = '<option value="">All Locations</option>' + locations.map(l=>`<option value="${l}">${l}</option>`).join('');
        }

        // Industry select
        const industrySel = document.getElementById('industry-filter');
        if (industrySel) {
            const industries = [...new Set(accounts.map(a => (a.industry||'').trim()).filter(Boolean))].sort();
            industrySel.innerHTML = '<option value="">All Industries</option>' + industries.map(i=>`<option value="${i}">${i}</option>`).join('');
        }
    },

    // === New Advanced Contacts Page Logic ===
    initContactsPage() {
        // State
        this.contactsFilters = this.contactsFilters || [];
        this.contactsPerPage = 50;
        this.contactsCurrentPage = 1;
        // Match header: [number, checkbox, name, title, account, email, phone, location, created, actions]
        this.contactsColumnOrder = ['number', 'checkbox', 'name', 'title', 'account', 'email', 'phone', 'location', 'created', 'actions'];

        // Wire up UI: simple search + select filters
        const searchEl = document.getElementById('contact-search');
        if (searchEl) {
            searchEl.addEventListener('input', debounce(()=>{
                this.contactsCurrentPage = 1;
                this.renderContactsTableAdvanced();
            }, 250));
        }

        // Populate select filters
        this.populateContactsFilters();

        const accountSel = document.getElementById('account-filter');
        const titleSel = document.getElementById('title-filter');
        const locationSel = document.getElementById('location-filter');
        const industrySel = document.getElementById('industry-filter');
        const dateSel = document.getElementById('date-filter');

        [accountSel, titleSel, locationSel, industrySel, dateSel].forEach(sel => {
            if (sel) sel.addEventListener('change', () => {
                this.contactsCurrentPage = 1;
                this.renderContactsTableAdvanced();
            });
        });

        const clearBtn = document.getElementById('clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.contactsCurrentPage = 1;
                if (searchEl) searchEl.value = '';
                [accountSel, titleSel, locationSel, industrySel, dateSel].forEach(sel => { if (sel) sel.value = ''; });
                this.renderContactsTableAdvanced();
            });
        }

        const collapseBtn = document.getElementById('filters-collapse-btn');
        if (collapseBtn) {
            collapseBtn.onclick = () => this.toggleContactsFilters();
        }



        // Wire up the new filter toggle button in the header
        const filterToggleBtn = document.getElementById('filter-toggle-btn');
        if (filterToggleBtn) {
            filterToggleBtn.onclick = () => this.toggleContactsFilters();
            // Set initial state - filters are expanded by default
            filterToggleBtn.classList.add('active');
        }

        // Column drag & drop
        this.initContactsColumnDnD();

        // Initial render
        this.renderContactsTableAdvanced();
        
        // Ensure contacts are loaded and displayed
        console.log('Contacts data available:', this.contacts ? this.contacts.length : 0, 'contacts');
    },

    addFilterChip(chip) {
        this.contactsFilters.push({ id: Date.now() + Math.random(), ...chip });
        this.contactsCurrentPage = 1;
        this.renderActiveFilterChips();
    },

    setOrReplaceFilterChip(chip, replaceSameField = false) {
        if (replaceSameField) {
            this.contactsFilters = this.contactsFilters.filter(c => c.field !== chip.field);
        }
        if (chip.value) this.contactsFilters.push({ id: Date.now() + Math.random(), ...chip });
        this.contactsCurrentPage = 1;
        this.renderActiveFilterChips();
    },

    removeFilterChip(id) {
        this.contactsFilters = this.contactsFilters.filter(c => c.id !== id);
        this.contactsCurrentPage = 1;
        this.renderActiveFilterChips();
        this.renderContactsTableAdvanced();
    },

    renderActiveFilterChips() {
        const mk = () => this.contactsFilters.map(c => `
            <span class="chip" data-id="${c.id}">
                <span class="chip-label">${c.label}</span>
                <button class="chip-x" data-id="${c.id}" aria-label="Remove">×</button>
            </span>
        `).join('');
        const chipsEl = document.getElementById('active-filter-chips');
        const chipsInline = document.getElementById('active-filter-chips-inline');
        if (chipsEl) chipsEl.innerHTML = mk();
        if (chipsInline) chipsInline.innerHTML = mk();
        [chipsEl, chipsInline].forEach(root => {
            if (!root) return;
            root.querySelectorAll('.chip-x').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = Number(btn.getAttribute('data-id'));
                    this.removeFilterChip(id);
                });
            });
        });
    },

    getFilteredContacts() {
        let list = Array.isArray(this.contacts) ? [...this.contacts] : [];

        // DOM values
        const searchVal = (document.getElementById('contact-search')?.value || '').trim().toLowerCase();
        const accountId = (document.getElementById('account-filter')?.value || '').trim();
        const titleVal = (document.getElementById('title-filter')?.value || '').trim().toLowerCase();
        const locationVal = (document.getElementById('location-filter')?.value || '').trim().toLowerCase();
        const industryVal = (document.getElementById('industry-filter')?.value || '').trim().toLowerCase();
        const dateVal = (document.getElementById('date-filter')?.value || '').trim();

        // Map accounts
        const accountsById = new Map((this.accounts || []).map(a => [a.id, a]));

        // Search over name + email
        if (searchVal) {
            list = list.filter(c => (`${c.firstName||''} ${c.lastName||''} ${c.email||''}`.toLowerCase().includes(searchVal)));
        }

        if (accountId) {
            list = list.filter(c => c.accountId === accountId);
        }

        if (titleVal) {
            list = list.filter(c => (c.title||'').toLowerCase() === titleVal);
        }

        if (locationVal) {
            list = list.filter(c => ((accountsById.get(c.accountId)||{}).address||'').toLowerCase() === locationVal);
        }

        if (industryVal) {
            list = list.filter(c => ((accountsById.get(c.accountId)||{}).industry||'').toLowerCase() === industryVal);
        }

        if (dateVal) {
            const now = new Date();
            const start = new Date(0);
            if (dateVal === 'today') {
                start.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
            } else if (dateVal === 'week') {
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
                start.setFullYear(now.getFullYear(), now.getMonth(), diff);
            } else if (dateVal === 'month') {
                start.setFullYear(now.getFullYear(), now.getMonth(), 1);
            } else if (dateVal === 'quarter') {
                const q = Math.floor(now.getMonth()/3);
                start.setFullYear(now.getFullYear(), q*3, 1);
            }
            list = list.filter(c => {
                const created = c.createdAt ? (c.createdAt.toDate? c.createdAt.toDate(): c.createdAt) : null;
                return created ? created >= start : false;
            });
        }

        return list;
    },

    renderContactsTableAdvanced() {
        console.log('renderContactsTableAdvanced: Starting table render');
        const tbody = document.getElementById('contacts-table-body');
        const countEl = document.getElementById('contacts-count');
        
        console.log('Table body element found:', !!tbody);
        console.log('Count element found:', !!countEl);
        
        if (!tbody) {
            console.error('contacts-table-body element not found!');
            return;
        }

        const contacts = this.getFilteredContacts();
        const total = contacts.length;
        console.log('Filtered contacts:', total, contacts);
        
        if (countEl) countEl.textContent = `${total} contact${total!==1?'s':''}`;

        // Update top-right results info (filtered vs total)
        const resultsInfo = document.getElementById('results-info');
        if (resultsInfo) {
            const totalAll = Array.isArray(this.contacts) ? this.contacts.length : 0;
            resultsInfo.textContent = `Showing ${total} of ${totalAll} contacts`;
        }

        // Pagination
        const per = this.contactsPerPage;
        const totalPages = Math.max(1, Math.ceil(total / per));
        if (this.contactsCurrentPage > totalPages) this.contactsCurrentPage = totalPages;
        const startIdx = (this.contactsCurrentPage - 1) * per;
        const pageItems = contacts.slice(startIdx, startIdx + per);

        // Render rows with current column order
        console.log('Column order:', this.contactsColumnOrder);
        console.log('Page items to render:', pageItems.length);
        
        tbody.innerHTML = '';
        pageItems.forEach((c, index) => {
            console.log(`Rendering contact ${index + 1}:`, c.firstName, c.lastName);
            const row = document.createElement('tr');
            row.className = 'contact-row';
            const cells = this.buildContactRowCells(c, index);
            console.log('Built cells for contact:', Object.keys(cells));
            
            this.contactsColumnOrder.forEach(col => {
                const td = document.createElement('td');
                td.className = `col-${col}`;
                td.innerHTML = cells[col] || '';
                row.appendChild(td);
            });
            tbody.appendChild(row);
            console.log('Added row to tbody');
        });
        
        console.log('Final tbody children count:', tbody.children.length);

        this.renderContactsPagination(total, this.contactsCurrentPage, totalPages);
        this.refreshContactsHeaderOrder();
    },

    buildContactRowCells(contact, index) {
        const account = (this.accounts||[]).find(a => a.id === contact.accountId);
        const fullName = `${contact.firstName||''} ${contact.lastName||''}`.trim() || 'Unnamed';
        const avatar = this.getFaviconForContact(contact, account);
        const acctFav = this.getFaviconForAccount(account, contact);
        const created = contact.createdAt ? (contact.createdAt.toDate? contact.createdAt.toDate(): contact.createdAt) : null;
        const createdStr = created ? new Date(created).toLocaleDateString() : '';
        return {
            number: `<span class="row-number">${index + 1}</span>`,
            checkbox: `
                <div class="row-select">
                    <input type="checkbox" class="row-checkbox" data-id="${contact.id}">
                </div>
            </div>
            `,
            name: `
                <div class="cell-name">
                    <img class="avatar" src="${avatar}" alt="${fullName}"/>
                    <div class="name-lines">
                        <div class="full-name contact-link" title="View contact"
                             onclick="CRMApp.showContactDetails('${contact.id}')"
                             onkeydown="if(event.key==='Enter'){CRMApp.showContactDetails('${contact.id}');}"
                             tabindex="0">${fullName}</div>
                    </div>
                </div>`,
            title: `<span>${contact.title||''}</span>`,
            account: `
                <div class="cell-account">
                    ${acctFav ? `<img class="favicon" src="${acctFav}" alt="${contact.accountName||''}"/>` : ''}
                    <span
                        title="${contact.accountName||''}"
                        ${account ? `class="account-link" role="button" tabindex="0" style="cursor:pointer;"
                            onclick="CRMApp.showAccountDetails('${account.id}', { from: 'contact', contactId: '${contact.id}' })"
                            onkeydown="if(event.key==='Enter'){CRMApp.showAccountDetails('${account.id}', { from: 'contact', contactId: '${contact.id}' });}"
                        ` : ''}
                    >${contact.accountName||''}</span>
                </div>`,
            email: `<a href="mailto:${contact.email||''}" title="${contact.email||''}">${contact.email||''}</a>`,
            phone: `<a href="tel:${(contact.phone||'').replace(/[^\d+]/g,'')}">${contact.phone||''}</a>`,
            location: `<span>${(account && account.address) ? account.address : (contact.location||'')}</span>`,
            created: `<span>${createdStr}</span>`,
            actions: `
                <div class="row-actions">
                    <button class="btn-icon" title="Call" onclick="CRMApp.callContact('${contact.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.86.31 1.7.57 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.13a2 2 0 0 1 2.11-.45c.8.26 1.64.45 2.5.57A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon" title="Email" onclick="CRMApp.emailContact('${contact.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M4 4h16v16H4z" fill="none"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                    </button>
                    <button class="btn-icon" title="Add to Sequence" onclick="CRMApp.addToSequence('${contact.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="5 12 9 16 19 6"></polyline>
                        </svg>
                    </button>
                </div>`
        };
    },

    renderContactsPagination(total, page, totalPages) {
        const info = document.getElementById('pagination-info');
        const prev = document.getElementById('prev-page-btn');
        const next = document.getElementById('next-page-btn');
        // Top controls (near results-info in table header)
        const topPrev = document.getElementById('top-prev-page-btn');
        const topNext = document.getElementById('top-next-page-btn');
        const nums = document.getElementById('pagination-numbers');
        const from = total === 0 ? 0 : (page-1)*this.contactsPerPage + 1;
        const to = Math.min(page*this.contactsPerPage, total);
        if (info) info.textContent = `Showing ${from}-${to} of ${total} contacts`;
        if (prev) {
            prev.disabled = page <= 1;
            prev.onclick = () => { if (this.contactsCurrentPage>1){ this.contactsCurrentPage--; this.renderContactsTableAdvanced(); } };
        }
        if (next) {
            next.disabled = page >= totalPages;
            next.onclick = () => { if (this.contactsCurrentPage<totalPages){ this.contactsCurrentPage++; this.renderContactsTableAdvanced(); } };
        }
        if (topPrev) {
            topPrev.disabled = page <= 1;
            topPrev.onclick = () => { if (this.contactsCurrentPage>1){ this.contactsCurrentPage--; this.renderContactsTableAdvanced(); } };
        }
        if (topNext) {
            topNext.disabled = page >= totalPages;
            topNext.onclick = () => { if (this.contactsCurrentPage<totalPages){ this.contactsCurrentPage++; this.renderContactsTableAdvanced(); } };
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
                b.onclick = () => { this.contactsCurrentPage = i; this.renderContactsTableAdvanced(); };
                nums.appendChild(b);
            }
        }
    },

    // Column Drag & Drop
    initContactsColumnDnD() {
        const thead = document.getElementById('contacts-thead');
        if (!thead) return;
        const headerRow = thead.querySelector('tr');
        // Ensure header order follows saved order
        this.refreshContactsHeaderOrder();
        let dragSrcCol = null;
        headerRow.querySelectorAll('th[draggable="true"]').forEach(th => {
            th.addEventListener('dragstart', (e) => {
                dragSrcCol = th.getAttribute('data-col');
                e.dataTransfer.effectAllowed = 'move';
            });
            th.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            th.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetCol = th.getAttribute('data-col');
                if (!dragSrcCol || dragSrcCol === targetCol) return;
                this.reorderContactsColumns(dragSrcCol, targetCol);
            });
        });
    },

    reorderContactsColumns(srcCol, targetCol) {
        const order = [...this.contactsColumnOrder];
        const srcIdx = order.indexOf(srcCol);
        const tgtIdx = order.indexOf(targetCol);
        if (srcIdx === -1 || tgtIdx === -1) return;
        order.splice(tgtIdx, 0, order.splice(srcIdx, 1)[0]);
        this.contactsColumnOrder = order;
        this.persistContactsColumnOrder(order);
        this.renderContactsTableAdvanced();
    },

    refreshContactsHeaderOrder() {
        const thead = document.getElementById('contacts-thead');
        if (!thead) return;
        const row = thead.querySelector('tr');
        const map = {};
        Array.from(row.children).forEach(th => { map[th.getAttribute('data-col')||'actions'] = th; });
        this.contactsColumnOrder.forEach(col => {
            const th = map[col];
            if (th) row.appendChild(th);
        });
    },

    persistContactsColumnOrder(order) {
        try { localStorage.setItem('contacts_column_order_v2', JSON.stringify(order)); } catch(e) {}
    },
    loadContactsColumnOrder() {
        try { const s = localStorage.getItem('contacts_column_order_v2'); return s? JSON.parse(s): null; } catch(e) { return null; }
    },

    // Avatar helpers
    // Always use Gravatar for contact profile pictures
    getFaviconForContact(contact, account) {
        return this.getFallbackAvatar(contact);
    },
    getFaviconForAccount(account, contact) {
        const domain = this.deriveDomain(account?.website, contact?.email);
        return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32` : '';
    },
    deriveDomain(website, email) {
        let domain = '';
        if (website) {
            try {
                const u = new URL(website.startsWith('http')? website: 'https://'+website);
                domain = u.hostname;
            } catch {}
        }
        if (!domain && email && email.includes('@')) {
            domain = email.split('@')[1];
        }
        return domain || '';
    },
    getFallbackAvatar(contact) {
        const hash = md5((contact?.email||'').toLowerCase().trim());
        return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=64`;
    },

    // Quick action stubs
    addToSequence(id) {
        const c = (this.contacts||[]).find(x=>x.id===id);
        if (c) this.showNotification(`Added ${c.firstName||''} ${c.lastName||''} to sequence (stub)`, 'info');
    },

    // Show expand button for contacts filters
    showContactsExpandButton() {
        // Remove existing expand button if any
        const existingBtn = document.getElementById('contacts-expand-btn');
        if (existingBtn) existingBtn.remove();
        
        // Create expand button
        const expandBtn = document.createElement('button');
        expandBtn.id = 'contacts-expand-btn';
        expandBtn.onclick = () => this.toggleContactsFilters();
        expandBtn.style.cssText = `
            position: fixed;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: #444;
            border: 1px solid #666;
            color: #fff;
            padding: 12px 8px;
            border-radius: 0 8px 8px 0;
            cursor: pointer;
            z-index: 1000;
            transition: all 0.2s ease;
            box-shadow: 2px 0 8px rgba(0,0,0,0.3);
        `;
        expandBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        expandBtn.onmouseover = () => expandBtn.style.background = '#555';
        expandBtn.onmouseout = () => expandBtn.style.background = '#444';
        
        document.body.appendChild(expandBtn);
    },

    
    // Render the contacts page by injecting the external HTML and initializing behavior
    async renderContactsPage() {
        console.log('renderContactsPage: loading contacts-content.html');
        console.log('Available contacts data:', this.contacts ? this.contacts.length : 'undefined', 'contacts');
        console.log('Available accounts data:', this.accounts ? this.accounts.length : 'undefined', 'accounts');
        
        const container = document.getElementById('contacts-view');
        if (!container) {
            console.error('contacts-view container not found');
            return;
        }
        // Reset any inline styles from detail layout so list view returns to full-width style
        try { container.removeAttribute('style'); } catch (_) { container.style.cssText = ''; }
        // Ensure global widget panel is visible in list view
        const widgetPanel = document.getElementById('widget-panel');
        if (widgetPanel) { widgetPanel.style.display = ''; }

        try {
            const res = await fetch('contacts-content.html', { cache: 'no-store' });
            const html = await res.text();
            container.innerHTML = html;
            console.log('contacts-content.html loaded successfully');
            
            // Force update the table header to fix layout issues
            this.fixTableHeader();
            
        } catch (e) {
            console.error('Failed to load contacts-content.html, falling back to inline skeleton', e);
            container.innerHTML = `
                <div class="contacts-page">
                    <div class="contacts-header"><h2>All Contacts</h2><span id="contacts-count">0</span></div>
                    <div class="contacts-layout">
                        <aside id="contacts-filters-sidebar">
                            <div class="filters-header">
                                <h3>Filters</h3>
                                <button id="filters-collapse-btn" title="Collapse">⮜</button>
                            </div>
                            <div id="contacts-filter-builder">
                                <div class="filter-row">
                                    <select id="filter-field-select">
                                        <option value="name">Name</option>
                                        <option value="title">Title</option>
                                        <option value="email">Email</option>
                                        <option value="phone">Phone</option>
                                        <option value="account">Account</option>
                                        <option value="industry">Industry</option>
                                        <option value="location">Location</option>
                                    </select>
                                    <input id="filter-value-input" placeholder="Type value..."/>
                                    <button id="add-filter-btn">Add</button>
                                </div>
                                <div id="active-filter-chips" class="chips"></div>
                                <button id="clear-filters-btn">Clear All</button>
                            </div>
                        </aside>
                        <section class="contacts-table-section">
                            <div class="table-controls">
                                <span id="results-info"></span>
                            </div>
                            <div class="contacts-table-wrapper">
                                <table id="contacts-table">
                                    <thead id="contacts-thead"><tr>
                                        <th draggable="true" data-col="name">Name</th>
                                        <th draggable="true" data-col="title">Title</th>
                                        <th draggable="true" data-col="account">Account</th>
                                        <th draggable="true" data-col="email">Email</th>
                                        <th draggable="true" data-col="phone">Phone</th>
                                        <th draggable="true" data-col="created">Created</th>
                                        <th data-col="actions">Actions</th>
                                    </tr></thead>
                                    <tbody id="contacts-table-body"></tbody>
                                </table>
                            </div>
                            <div class="pagination-container">
                                <button id="prev-page-btn">Previous</button>
                                <div id="pagination-numbers"></div>
                                <button id="next-page-btn">Next</button>
                                <div id="pagination-info"></div>
                            </div>
                        </section>
                    </div>
                </div>`;
        }

        // Initialize advanced contacts UI
        this.initContactsPage();
        
        // If no contacts data is available, try to load it
        if (!this.contacts || this.contacts.length === 0) {
            console.warn('No contacts data available, attempting to load...');
            // Try to get data from the main CRM app or load fallback data
            if (window.CRMApp && window.CRMApp.contacts) {
                this.contacts = window.CRMApp.contacts;
                this.accounts = window.CRMApp.accounts;
                console.log('Loaded contacts from CRMApp:', this.contacts.length);
                // Re-render with the loaded data
                this.renderContactsTableAdvanced();
            }
        }
    },

    // Fix table header structure to ensure proper layout
    fixTableHeader() {
        console.log('Fixing table header structure...');
        const thead = document.getElementById('contacts-thead');
        if (!thead) {
            console.error('Table header not found');
            return;
        }

        // Create the correct header row with number column
        const headerRow = thead.querySelector('tr');
        if (headerRow) {
            headerRow.innerHTML = `
                <th class="number-column" data-col="number">#</th>
                <th class="checkbox-column" data-col="checkbox">
                    <input type="checkbox" id="select-all-checkbox">
                </th>
                <th class="sortable" data-sort="name" data-col="name" draggable="true">
                    Name
                    <svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </th>
                <th class="sortable" data-sort="title" data-col="title" draggable="true">
                    Title
                    <svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </th>
                <th class="sortable" data-sort="account" data-col="account" draggable="true">
                    Account
                    <svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </th>
                <th class="sortable" data-sort="email" data-col="email" draggable="true">
                    Email
                    <svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </th>
                <th class="sortable" data-sort="phone" data-col="phone" draggable="true">
                    Phone
                    <svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </th>
                <th class="sortable" data-sort="location" data-col="location" draggable="true">
                    Location
                    <svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </th>
                <th class="sortable" data-sort="createdAt" data-col="created" draggable="true">
                    Created
                    <svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </th>
                <th class="actions-column" data-col="actions">Actions</th>
            `;
            console.log('Table header structure fixed');
        }

        // Remove any table controls that might be in the wrong place
        const tbody = document.getElementById('contacts-table-body');
        if (tbody) {
            // Remove the table controls row if it exists
            const controlsRow = tbody.querySelector('.table-controls-row');
            if (controlsRow) {
                controlsRow.remove();
                console.log('Removed misplaced table controls row');
            }
        }
    },

    initSimpleContactsUI() {
        console.log("Initializing simple contacts UI");
        
        // Populate account filter
        this.populateSimpleAccountFilter();
        
        // Render initial contacts table
        this.renderSimpleContactsTable();
        
        // Setup event listeners
        const searchInput = document.getElementById('contact-search-simple');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.renderSimpleContactsTable(e.target.value);
            }, 300));
        }
        
        const accountFilter = document.getElementById('account-filter-simple');
        if (accountFilter) {
            accountFilter.addEventListener('change', (e) => {
                this.renderSimpleContactsTable();
            });
        }
    },

    // Render the contacts table with optional search filter
    renderSimpleContactsTable(searchTerm = '', contactsToRender = null) {
        const tableBody = document.getElementById('contacts-table-body-simple');
        const contactsCount = document.getElementById('contacts-count-simple');
        
        if (!tableBody || !contactsCount) return;
        
        // Use provided contacts or filter from all contacts
        let filteredContacts = contactsToRender || this.contacts;
        
        // Apply search filter
        if (searchTerm) {
            filteredContacts = filteredContacts.filter(contact => {
                const searchableText = `${contact.firstName} ${contact.lastName} ${contact.email} ${contact.title} ${contact.accountName}`.toLowerCase();
                return searchableText.includes(searchTerm.toLowerCase());
            });
        }
        
        // Apply account filter
        const accountFilter = document.getElementById('account-filter-simple');
        if (accountFilter && accountFilter.value) {
            filteredContacts = filteredContacts.filter(contact => 
                contact.accountId === accountFilter.value
            );
        }
        
        // Update contacts count
        contactsCount.textContent = `${filteredContacts.length} contact${filteredContacts.length !== 1 ? 's' : ''}`;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        if (filteredContacts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="
                        padding: 40px;
                        text-align: center;
                        color: #999;
                        font-style: italic;
                    ">No contacts found</td>
                </tr>
            `;
            return;
        }
        
        // Render contact rows
        filteredContacts.forEach(contact => {
            const row = document.createElement('tr');
            row.style.cssText = `
                border-bottom: 1px solid #333;
                transition: background-color 0.2s ease;
                cursor: pointer;
            `;
            row.onmouseover = () => row.style.backgroundColor = '#2a2a2a';
            row.onmouseout = () => row.style.backgroundColor = 'transparent';
            
            const fullName = `${contact.firstName} ${contact.lastName}`.trim();
            const gravatarHash = md5((contact.email || '').toLowerCase().trim());
            const gravatarUrl = `https://www.gravatar.com/avatar/${gravatarHash}?d=identicon&s=32`;
            
            row.innerHTML = `
                <td style="padding: 12px; color: #fff; font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${gravatarUrl}" alt="${fullName}" style="
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            border: 2px solid #444;
                        ">
                        <div>
                            <div style="font-weight: 600;">${fullName}</div>
                            <div style="font-size: 12px; color: #999;">${contact.title || 'No title'}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 12px; color: #ccc;">${contact.phone || 'N/A'}</td>
                <td style="padding: 12px; color: #ccc;">${contact.email || 'N/A'}</td>
                <td style="padding: 12px; color: #ccc;">${
                    contact.accountId
                        ? `<span class="account-link" role="button" tabindex="0" title="View ${contact.accountName || 'account'}" style="cursor:pointer;"
                              onclick="CRMApp.showAccountDetails('${contact.accountId}', { from: 'contact', contactId: '${contact.id}' })"
                              onkeydown="if(event.key==='Enter'){CRMApp.showAccountDetails('${contact.accountId}', { from: 'contact', contactId: '${contact.id}' });}"
                          >${contact.accountName || 'No company'}</span>`
                        : (contact.accountName || 'No company')
                }</td>
                <td style="padding: 12px;">
                    <div style="display: flex; gap: 8px;">
                        <button onclick="CRMApp.showContactDetails('${contact.id}')" style="
                            background: #007bff;
                            border: none;
                            color: white;
                            padding: 6px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: background-color 0.2s ease;
                        " onmouseover="this.style.backgroundColor='#0056b3'" 
                           onmouseout="this.style.backgroundColor='#007bff'">
                            View
                        </button>
                        <button onclick="CRMApp.callContact('${contact.id}')" style="
                            background: #28a745;
                            border: none;
                            color: white;
                            padding: 6px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: background-color 0.2s ease;
                        " onmouseover="this.style.backgroundColor='#1e7e34'" 
                           onmouseout="this.style.backgroundColor='#28a745'">
                            Call
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    },

    // Populate account filter dropdown
    populateSimpleAccountFilter() {
        const accountFilter = document.getElementById('account-filter-simple');
        if (!accountFilter) return;
        
        // Clear existing options except "All Accounts"
        accountFilter.innerHTML = '<option value="">All Accounts</option>';
        
        // Add unique accounts
        const uniqueAccounts = [...new Set(this.contacts
            .filter(contact => contact.accountName && contact.accountId)
            .map(contact => ({ id: contact.accountId, name: contact.accountName }))
        )];
        
        uniqueAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = account.name;
            accountFilter.appendChild(option);
        });
    },

    // Clear all filters
    clearContactsFilters() {
        const searchInput = document.getElementById('contact-search-simple');
        const accountFilter = document.getElementById('account-filter-simple');
        
        if (searchInput) searchInput.value = '';
        if (accountFilter) accountFilter.value = '';
        
        this.renderSimpleContactsTable();
    },

    // Show individual contact details page
    showContactDetails(contactId, originCtx = null) {
        const contact = (this.contacts || []).find(c => c.id === contactId);
        if (!contact) {
            console.error('Contact not found:', contactId);
            return;
        }

        const contactsView = document.getElementById('contacts-view');
        if (!contactsView) {
            console.error('contacts-view element not found');
            return;
        }

        // Track origin for back navigation and label
        if (originCtx) {
            this.lastContactOrigin = originCtx;
        } else if (!this.lastContactOrigin) {
            this.lastContactOrigin = { from: 'contacts' };
        }

        // Ensure only the contacts view is visible (avoid showing Accounts and Contacts together)
        try {
            document.querySelectorAll('.page-view').forEach(view => {
                view.style.display = 'none';
                view.style.visibility = 'hidden';
                view.style.position = 'absolute';
                view.style.left = '-9999px';
            });
            contactsView.style.display = 'flex';
            contactsView.style.visibility = 'visible';
            contactsView.style.position = 'static';
            contactsView.style.left = 'auto';

            const crmWidgetsContainer = document.getElementById('crm-widgets-container');
            const coldCallingWidgetsContainer = document.getElementById('cold-calling-widgets-container');
            if (crmWidgetsContainer) crmWidgetsContainer.style.display = 'flex';
            if (coldCallingWidgetsContainer) coldCallingWidgetsContainer.style.display = 'none';
        } catch (e) {
            console.warn('View switch fallback in showContactDetails:', e);
        }

        // Related data
        const account = (this.accounts || []).find(a => a.id === contact.accountId);
        const contactActivities = (this.activities || []).filter(a => a.contactId === contactId);

        // Avatar/favicon
        const avatarUrl = this.getFaviconForContact(contact, account);

        // Safe helpers
        const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unnamed Contact';
        const title = contact.title || 'N/A';
        const email = contact.email || 'N/A';
        const phone = contact.phone || contact.mobile || 'N/A';
        const locationStr = (contact.city && contact.state)
            ? `${contact.city}, ${contact.state}`
            : (contact.city || contact.state || contact.location || 'N/A');
        const created = contact.createdAt ? (contact.createdAt.toDate ? contact.createdAt.toDate() : contact.createdAt) : null;
        const createdStr = created && !isNaN(new Date(created).getTime()) ? new Date(created).toLocaleDateString() : 'N/A';

        // Compute back navigation label and handler based on origin
        const cameFromAccount = this.lastContactOrigin && this.lastContactOrigin.from === 'account' && this.lastContactOrigin.accountId;
        let accountNameForBack = '';
        if (cameFromAccount) {
            const acc = (this.accounts || []).find(a => a.id === this.lastContactOrigin.accountId) || account;
            if (acc) accountNameForBack = acc.name || '';
        }
        const backLabel = cameFromAccount ? `Back to ${accountNameForBack || 'Account'}` : 'Back to Contacts';
        const backOnClick = cameFromAccount
            ? `CRMApp.showAccountDetails('${this.lastContactOrigin.accountId}')`
            : `CRMApp.renderContactsPage()`;

        const contactDetailsHTML = `
            <div class="contact-details-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid #333;
            ">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <button onclick="${backOnClick}" style="
                        background: #444;
                        border: 1px solid #666;
                        color: #fff;
                        padding: 8px 12px;
                        border-radius: 8px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        ${backLabel}
                    </button>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        ${avatarUrl ? `<img src="${avatarUrl}" alt="${fullName}" style="width: 48px; height: 48px; border-radius: 8px;" onerror="this.style.display='none'">` : ''}
                        <h2 style="margin: 0; color: #fff; font-size: 28px; font-weight: 600;">${fullName}</h2>
                    </div>
                </div>
                <div class="contact-actions" style="display:flex; gap:10px; align-items:center;">
                    <button class="btn-icon" title="Edit contact" style="display:flex; align-items:center; gap:8px; background:#1f2430; border:1px solid #333; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#2a3144'; this.style.borderColor='#3b82f6'" onmouseout="this.style.background='#1f2430'; this.style.borderColor='#333'" onclick="CRMApp.editContact('${contact.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                        <span>Edit</span>
                    </button>
                    <button class="btn-icon" title="Email" style="display:flex; align-items:center; gap:8px; background:#1f2430; border:1px solid #333; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#2a3144'; this.style.borderColor='#3b82f6'" onmouseout="this.style.background='#1f2430'; this.style.borderColor='#333'" onclick="CRMApp.emailContact('${contact.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>
                        <span>Email</span>
                    </button>
                    <button class="btn-icon" title="Call" style="display:flex; align-items:center; gap:8px; background:#1f2430; border:1px solid #333; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#2a3144'; this.style.borderColor='#3b82f6'" onmouseout="this.style.background='#1f2430'; this.style.borderColor='#333'" onclick="CRMApp.callContact('${contact.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92V21a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 5.18 2 2 0 0 1 4 3h4.09a2 2 0 0 1 2 1.72l.57 3.2a2 2 0 0 1-.5 1.72L8.09 11a16 16 0 0 0 6 6l1.36-2.07a2 2 0 0 1 1.72-.5l3.2.57A2 2 0 0 1 22 16.92z"/></svg>
                        <span>Call</span>
                    </button>
                    <button class="btn-icon" title="Add to sequence" style="display:flex; align-items:center; gap:8px; background:#1f2430; border:1px solid #fb923c; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#2a3144'; this.style.borderColor='#fb923c'" onmouseout="this.style.background='#1f2430'; this.style.borderColor='#fb923c'" onclick="CRMApp.addToSequence('${contact.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                        <span>+ Add to sequence</span>
                    </button>
                </div>
            </div>

            <div class="contact-details-content" style="display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                <div class="contact-info-section" style="display:flex; flex-direction:column; gap:20px; min-width:0; flex:1; min-height:0;">
                    <div class="detail-scroll" style="flex:1; overflow-y:auto; min-height:0; display:flex; flex-direction:column; gap:20px;">
                        <!-- Contact Information Card -->
                        <div class="contact-info-card" style="
                            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                            padding: 24px;
                            border-radius: 18px;
                            border: 1px solid #333;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        ">
                            <h3 style="margin: 0 0 20px 0; color: #fff; font-size: 20px;">Contact Information</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Full Name</label>
                                    <div style="color: #fff; font-size: 16px; font-weight: 500;">${fullName}</div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Title</label>
                                    <div style="color: #fff; font-size: 16px;">${title}</div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Email</label>
                                    <div style="color: #fff; font-size: 16px;"><a href="mailto:${contact.email || ''}" style="color: #9ecbff; text-decoration: none;">${email}</a></div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Phone</label>
                                    <div style="color: #fff; font-size: 16px;"><a href="tel:${(contact.phone || contact.mobile || '').replace(/[^\d+]/g,'')}" style="color: #9ecbff; text-decoration: none;">${phone}</a></div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Location</label>
                                    <div style="color: #fff; font-size: 16px;">${locationStr}</div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Created</label>
                                    <div style="color: #fff; font-size: 16px;">${createdStr}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Related Account Card -->
                        <div class="related-account-card" style="
                            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                            padding: 24px;
                            border-radius: 18px;
                            border: 1px solid #333;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                            display: flex;
                            flex-direction: column;
                            gap: 12px;
                        ">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <h3 style="margin: 0; color: #fff; font-size: 18px;">Related Account</h3>
                                ${account ? `<button style="
                                    background: #444;
                                    border: 1px solid #666;
                                    color: #fff;
                                    padding: 8px 12px;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    font-size: 14px;
                                    transition: all 0.2s ease;
                                " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'" onclick="CRMApp.showAccountDetails('${account.id}', { from: 'contact', contactId: '${contact.id}' })">View Account</button>` : ''}
                            </div>
                            ${account ? `
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <img src="${this.getFaviconForAccount(account, contact)}" alt="${account.name}" style="width: 24px; height: 24px; border-radius: 4px;" onerror="this.style.display='none'">
                                    <div style="color: #fff; font-size: 16px; font-weight: 500;">${account.name}</div>
                                </div>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
                                    <div>
                                        <label style="color: #ccc; font-size: 13px; margin-bottom: 4px; display: block;">Industry</label>
                                        <div style="color: #fff; font-size: 15px;">${account.industry || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label style="color: #ccc; font-size: 13px; margin-bottom: 4px; display: block;">Company Information</label>
                                        <div style="color: #fff; font-size: 15px; white-space: pre-wrap;">${account.companyInformation || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label style="color: #ccc; font-size: 13px; margin-bottom: 4px; display: block;">Website</label>
                                        <div style="color: #9ecbff; font-size: 15px; overflow-wrap: anywhere;">${account.website || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label style="color: #ccc; font-size: 13px; margin-bottom: 4px; display: block;">Phone</label>
                                        <div style="color: #fff; font-size: 15px;">${account.phone || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label style="color: #ccc; font-size: 13px; margin-bottom: 4px; display: block;">Location</label>
                                        <div style="color: #fff; font-size: 15px;">${(account.city && account.state) ? `${account.city}, ${account.state}` : (account.city || account.state || 'N/A')}</div>
                                    </div>
                                </div>
                            ` : '<div style="color: #888; font-style: italic;">No related account</div>'}
                        </div>

                        <div class="widget-card" style="
                            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                            padding: 20px;
                            border-radius: 18px;
                            border: 1px solid #333;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        ">
                            <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Recent Activities</h3>
                            <div style="max-height: 360px; overflow-y: auto;">
                                ${contactActivities.length > 0 ? contactActivities.slice(0, 20).map(activity => `
                                    <div style="padding: 12px 0; border-bottom: 1px solid #333;">
                                        <div style="color: #fff; font-size: 14px; margin-bottom: 4px;">${activity.description || 'Activity'}</div>
                                        <div style="color: #888; font-size: 12px;">${activity.createdAt ? new Date(activity.createdAt).toLocaleDateString() : ''}</div>
                                    </div>
                                `).join('') : '<div style="color: #888; font-style: italic; text-align: center; padding: 20px;">No recent activities</div>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        contactsView.innerHTML = contactDetailsHTML;

        // Ensure global widget panel is visible on detail view
        const widgetPanel = document.getElementById('widget-panel');
        if (widgetPanel) { widgetPanel.style.display = ''; }

        // Apply card container styles for detail view (big card with rounded edges and margins)
        contactsView.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - 120px) !important;
            background: #1a1a1a !important;
            color: #fff !important;
            margin: 20px !important;
            padding: 20px !important;
            border-radius: 20px !important;
            overflow: hidden !important;
        `;
    },

    // Place a call to a contact (opens tel: and shows a notification)
    callContact(id) {
        const contact = (this.contacts || []).find(c => c.id === id);
        if (!contact) return;

        const rawPhone = contact.phone || contact.mobile || '';
        const phone = (rawPhone || '').replace(/[^\d+]/g, '');
        if (!phone) {
            this.showNotification(`No phone number found for ${contact.firstName || ''} ${contact.lastName || ''}`.trim(), 'warning');
            return;
        }

        // Attempt to trigger the OS dialer (works on mobile / configured desktops)
        try {
            window.location.href = `tel:${phone}`;
        } catch (e) {
            // Ignore if not supported
        }
        this.showNotification(`Calling ${`${contact.firstName || ''} ${contact.lastName || ''}`.trim()} (${phone})...`, 'info');
    },

    // Edit a contact (stub)
    editContact(id) {
        const c = (this.contacts || []).find(x => x.id === id);
        if (!c) {
            this.showNotification('Contact not found', 'warning');
            return;
        }
        const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contact';
        this.showNotification(`Editing ${name} (coming soon)`, 'info');
    },

// Open compose to email a contact. Accepts optional options for future sequence/tool integration.
// Usage:
//  - emailContact(contactId)
//  - emailContact(contactId, { source: 'sequence', sequenceId, silent })
emailContact(id, options = {}) {
    const contact = (this.contacts || []).find(c => c.id === id);
    if (!contact) return;

    // Maintain compatibility: set currentContact for other parts of the app
    this.currentContact = contact;

    // Normalize options and set a context that the compose tool can read later
    const ctx = typeof options === 'string' ? { source: options } : { ...options };
    const source = ctx.source || 'contacts';
    this.pendingEmailContext = {
        to: contact.email || '',
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        contactId: id,
        source,
        sequenceId: ctx.sequenceId || null,
        meta: ctx.meta || null
    };

    if (!ctx.silent) {
        const dest = this.pendingEmailContext.to ? ` (${this.pendingEmailContext.to})` : '';
        this.showNotification(`Opening email to ${this.pendingEmailContext.name}${dest}...`, 'info');
    }

    // Open the global compose drawer now that it's available
    if (typeof this.openCompose === 'function') {
        this.openCompose(this.pendingEmailContext);
    }
}
});
