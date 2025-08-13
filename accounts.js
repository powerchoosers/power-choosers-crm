// Power Choosers CRM Dashboard - Accounts Module (Redesigned)
// This module contains all accounts functionality with contacts-style design

// Extend CRMApp with accounts functions
Object.assign(CRMApp, {
    // Render the accounts page with contacts-style design
    renderAccountsPage() {
        console.log("renderAccountsPage called");
        const accountsView = document.getElementById('accounts-view');
        if (!accountsView) {
            console.error('accounts-view element not found');
            return;
        }

        // Apply contacts-style CSS classes to accounts view
        accountsView.className = 'page-view';
        accountsView.style.cssText = 'display: flex !important; flex-direction: column !important; height: 100% !important; background: transparent !important; color: #e2e8f0 !important; padding: 0 !important; overflow: hidden !important;';

        console.log("Creating accounts HTML with contacts design");
        const accountsHTML = `
            <div class="contacts-container">
                <!-- Accounts Header -->
                <div class="contacts-header">
                    <div class="contacts-title-section">
                        <div class="title-with-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="title-icon">
                                <path d="M3 21h18"></path>
                                <path d="M5 21V7l8-4v18"></path>
                                <path d="M19 21V11l-6-4"></path>
                                <path d="M9 9v1"></path>
                                <path d="M9 12v1"></path>
                                <path d="M9 15v1"></path>
                            </svg>
                            <h1 class="contacts-title">All Accounts</h1>
                        </div>
                        <div class="contacts-meta">
                            <button class="filter-toggle-btn active" id="accounts-filter-toggle-btn" title="Toggle filters">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                            <span class="contacts-count" id="accounts-count">0 accounts</span>
                            <div class="view-options">
                                <button class="view-toggle active" data-view="table" title="Table View">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="7" height="7"></rect>
                                        <rect x="14" y="3" width="7" height="7"></rect>
                                        <rect x="3" y="14" width="7" height="7"></rect>
                                        <rect x="14" y="14" width="7" height="7"></rect>
                                    </svg>
                                </button>
                                <button class="view-toggle" data-view="list" title="List View">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="8" y1="6" x2="21" y2="6"></line>
                                        <line x1="8" y1="12" x2="21" y2="12"></line>
                                        <line x1="8" y1="18" x2="21" y2="18"></line>
                                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="contacts-actions">
                        <button class="btn-outline" id="export-accounts-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export
                        </button>
                    </div>
                </div>

                <!-- Main Accounts Layout -->
                <div class="contacts-main-layout">
                    <!-- Filters Sidebar -->
                    <div class="contacts-filters-sidebar" id="accounts-filters-sidebar">
                        <div class="filters-header">
                            <div class="filters-title">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                                <h3>Filters</h3>
                            </div>
                            <button class="filters-collapse-btn" id="accounts-filters-collapse-btn" title="Collapse filters">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </button>
                        </div>
                        
                        <div class="filters-content" id="accounts-filters-content">
                            <!-- Search Filter -->
                            <div class="filter-group">
                                <label class="filter-label">Search</label>
                                <input type="text" class="filter-input" id="account-search" placeholder="Search accounts...">
                            </div>

                            <!-- Industry Filter -->
                            <div class="filter-group">
                                <label class="filter-label">Industry</label>
                                <select class="filter-select" id="industry-filter">
                                    <option value="">All Industries</option>
                                </select>
                            </div>

                            

                            <!-- Clear Filters -->
                            <div class="filter-actions">
                                <button class="btn-secondary btn-small" id="clear-accounts-filters-btn">Clear All</button>
                            </div>
                        </div>
                    </div>

                    <!-- Accounts Table Container -->
                    <div class="contacts-table-container" id="accounts-table-container" style="--controls-h: 44px;">
                        <!-- Table Controls (top, above table) -->
                        <div class="table-controls">
                            <div class="table-controls-left">
                                <span class="selection-text">Select All</span>
                            </div>
                            <div class="table-controls-right">
                                <span class="results-info" id="accounts-results-info">Showing all accounts</span>
                                <button class="pagination-btn" id="accounts-top-prev-page-btn" aria-label="Previous" title="Previous">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="15 18 9 12 15 6"></polyline>
                                    </svg>
                                </button>
                                <button class="pagination-btn" id="accounts-top-next-page-btn" aria-label="Next" title="Next">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <!-- Accounts Table -->
                        <div class="contacts-table-wrapper" style="overflow-x:auto; width:100%;">
                            <table class="contacts-table" id="accounts-table">
                                <thead>
                                    <tr>
                                        <th class="number-column">#</th>
                                        <th class="checkbox-column">
                                            <input type="checkbox" id="select-all-accounts-checkbox">
                                        </th>
                                        <th class="sortable" data-sort="company">Company</th>
                                        <th class="sortable" data-sort="industry">Industry</th>
                                        <th class="sortable" data-sort="website">Website</th>
                                        <th class="sortable" data-sort="phone">Phone</th>
                                        <th class="sortable" data-sort="location">Location</th>
                                        <th class="sortable" data-sort="created">Created</th>
                                        <th class="actions-column">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="accounts-table-body">
                                    <!-- Accounts will be populated here -->
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Bottom Pagination (Contacts-style) -->
                        <div class="pagination-container">
                            <div class="pagination-info">
                                <span id="accounts-pagination-info"></span>
                            </div>
                            <div class="pagination-controls">
                                <button class="pagination-btn" id="accounts-prev-page-btn" aria-label="Previous" title="Previous">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="15 18 9 12 15 6"></polyline>
                                    </svg>
                                </button>
                                <div class="pagination-numbers" id="accounts-pagination-numbers"></div>
                                <button class="pagination-btn" id="accounts-next-page-btn" aria-label="Next" title="Next">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        accountsView.innerHTML = accountsHTML;
        
        // Initialize pagination state
        this.accountsPerPage = 50;
        this.accountsCurrentPage = 1;
        this.selectedAccountIds = new Set();

        // Initialize event listeners
        this.initAccountsEventListeners();
        
        // Load and render accounts data
        this.renderAccountsTable();
        
        // Update accounts count
        this.updateAccountsCount();

        // Wire select-all handler and bulk toolbar
        this.attachSelectAllAccountsHandler();
        this.updateAccountsBulkToolbar();
    },

    // Initialize event listeners for accounts page
    initAccountsEventListeners() {
        // Filter toggle button
        const filterToggleBtn = document.getElementById('accounts-filter-toggle-btn');
        if (filterToggleBtn) {
            filterToggleBtn.addEventListener('click', () => {
                const sidebar = document.getElementById('accounts-filters-sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('collapsed');
                    filterToggleBtn.classList.toggle('active');
                }
            });
        }

        // Search input
        const searchInput = document.getElementById('account-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                // Reset to first page on new filter
                this.accountsCurrentPage = 1;
                this.filterAndRenderAccounts();
            });
        }

        // Industry filter
        const industryFilter = document.getElementById('industry-filter');
        if (industryFilter) {
            industryFilter.addEventListener('change', () => {
                this.accountsCurrentPage = 1;
                this.filterAndRenderAccounts();
            });
            this.populateIndustryFilter();
        }

        // Sidebar collapse button
        const collapseBtn = document.getElementById('accounts-filters-collapse-btn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                const sidebar = document.getElementById('accounts-filters-sidebar');
                const filterToggleBtn = document.getElementById('accounts-filter-toggle-btn');
                if (sidebar) {
                    const isCollapsed = sidebar.classList.toggle('collapsed');
                    if (filterToggleBtn) {
                        if (isCollapsed) filterToggleBtn.classList.remove('active');
                        else filterToggleBtn.classList.add('active');
                    }
                }
            });
        }

        // Clear filters button
        const clearFiltersBtn = document.getElementById('clear-accounts-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (industryFilter) industryFilter.value = '';
                this.accountsCurrentPage = 1;
                this.filterAndRenderAccounts();
            });
        }

        // Export button
        const exportBtn = document.getElementById('export-accounts-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAccounts();
            });
        }

        // View toggles
        document.querySelectorAll('.view-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.view-toggle').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                // For now, we only support table view; list view can be implemented later
            });
        });

        // Select all checkbox -> open selection scope popover like contacts
        const selectAll = document.getElementById('select-all-accounts-checkbox');
        if (selectAll) {
            selectAll.onchange = (e) => {
                if (e.target.checked) {
                    this.showSelectAllAccountsPopover();
                } else {
                    // Unselect only visible rows
                    document.querySelectorAll('#accounts-table-body .row-checkbox').forEach(cb => {
                        cb.checked = false;
                        const id = cb.getAttribute('data-account-id');
                        if (id) this.selectedAccountIds.delete(id);
                    });
                    this.updateAccountsBulkToolbar();
                }
            };
        }

        // Top pagination buttons
        const topPrev = document.getElementById('accounts-top-prev-page-btn');
        const topNext = document.getElementById('accounts-top-next-page-btn');
        if (topPrev) topPrev.addEventListener('click', () => {
            if (this.accountsCurrentPage > 1) {
                this.accountsCurrentPage--;
                this.filterAndRenderAccounts();
            }
        });
        if (topNext) topNext.addEventListener('click', () => {
            this.accountsCurrentPage++;
            this.filterAndRenderAccounts();
        });
    },

    // Filter and render accounts based on current filter values
    filterAndRenderAccounts() {
        const searchTerm = document.getElementById('account-search')?.value || '';
        const industryFilter = document.getElementById('industry-filter')?.value || '';
        
        let filteredAccounts = this.accounts || [];

        // Apply search filter
        if (searchTerm) {
            filteredAccounts = filteredAccounts.filter(account => 
                account.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.industry?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.website?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Apply industry filter
        if (industryFilter) {
            filteredAccounts = filteredAccounts.filter(account => 
                account.industry === industryFilter
            );
        }

        this.renderAccountsTable(filteredAccounts);
        this.updateAccountsCount(filteredAccounts.length);
    },

    // Render accounts table with contacts-style design and pagination
    renderAccountsTable(accountsToRender = null) {
        const tableBody = document.getElementById('accounts-table-body');
        if (!tableBody) return;

        const all = accountsToRender || this.accounts || [];
        const total = all.length;
        const per = this.accountsPerPage || 50;
        const totalPages = Math.max(1, Math.ceil(total / per));
        if ((this.accountsCurrentPage||1) > totalPages) this.accountsCurrentPage = totalPages;
        const startIdx = ((this.accountsCurrentPage||1) - 1) * per;
        const pageItems = all.slice(startIdx, startIdx + per);

        // Update results info
        const resultsInfo = document.getElementById('accounts-results-info');
        if (resultsInfo) {
            const from = total === 0 ? 0 : startIdx + 1;
            const to = Math.min(startIdx + pageItems.length, total);
            const totalAll = (this.accounts || []).length;
            resultsInfo.textContent = `Showing ${from}-${to} of ${totalAll} accounts`;
        }

        // Keep header count in sync with current total
        this.updateAccountsCount(total);

        tableBody.innerHTML = '';

        pageItems.forEach((account, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="col-number"><span class="row-number">${startIdx + index + 1}</span></td>
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" data-account-id="${account.id}">
                </td>
                <td class="col-company">
                    <div class="cell-company">
                        <img src="${this.getCompanyFavicon(account)}" alt="${account.name}" class="favicon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNiIgZmlsbD0iIzMzMyIvPgo8cGF0aCBkPSJNOCAxMkgxNlYyMEg4VjEyWiIgZmlsbD0iIzY2NiIvPgo8L3N2Zz4K'">
                        <div class="company-lines">
                            <div class="company-name">
                                <span class="account-link" role="button" tabindex="0" title="View account details" style="cursor:pointer;"
                                      onclick="CRMApp.showAccountDetails('${account.id}')"
                                      onkeydown="if(event.key==='Enter'){CRMApp.showAccountDetails('${account.id}');}">
                                    ${account.name || 'Unknown Company'}
                                </span>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="col-industry">${account.industry || 'N/A'}</td>
                <td class="col-website">
                    <div class="cell-website">
                        ${account.website ? `<a href="${account.website}" target="_blank">${account.website}</a>` : 'N/A'}
                    </div>
                </td>
                <td class="col-phone">${account.phone || 'N/A'}</td>
                <td class="col-location">${this.formatLocation(account)}</td>
                <td class="col-created">${this.formatDate(account.createdAt)}</td>
                <td class="col-actions">
                    <div class="row-actions">
                        <button class="btn-icon" onclick="CRMApp.showAccountDetails('${account.id}')" title="View Details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="CRMApp.editAccount('${account.id}')" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
            // Sync row checkbox with current selection and wire change
            const cb = row.querySelector('.row-checkbox');
            if (cb) {
                cb.checked = this.selectedAccountIds.has(account.id);
                cb.addEventListener('change', () => {
                    if (cb.checked) this.selectedAccountIds.add(account.id); else this.selectedAccountIds.delete(account.id);
                    this.updateAccountsBulkToolbar();
                });
            }
        });

        this.renderAccountsPagination(total, this.accountsCurrentPage || 1, totalPages);

        // Ensure handlers and toolbar stay wired after render
        this.attachSelectAllAccountsHandler();
        this.updateAccountsBulkToolbar();
    },

    // Compute filtered accounts based on current UI controls
    getFilteredAccounts() {
        const searchTerm = (document.getElementById('account-search')?.value || '').trim().toLowerCase();
        const industryFilter = (document.getElementById('industry-filter')?.value || '').trim();
        let list = Array.isArray(this.accounts) ? [...this.accounts] : [];
        if (searchTerm) {
            list = list.filter(a => (
                (a.name||'').toLowerCase().includes(searchTerm) ||
                (a.industry||'').toLowerCase().includes(searchTerm) ||
                (a.website||'').toLowerCase().includes(searchTerm)
            ));
        }
        if (industryFilter) list = list.filter(a => a.industry === industryFilter);
        return list;
    },

    // Show a lightweight popover near Select All to choose scope
    showSelectAllAccountsPopover() {
        const visibleRowCheckboxes = Array.from(document.querySelectorAll('#accounts-table-body .row-checkbox'));
        const visibleCount = visibleRowCheckboxes.length;
        const filteredAccounts = this.getFilteredAccounts();
        const totalFiltered = filteredAccounts.length;

        // Anchor near left controls in accounts table
        const container = document.querySelector('#accounts-table-container .table-controls .table-controls-left');
        const rect = container ? container.getBoundingClientRect() : { left: 40, top: 120, height: 20 };

        // Remove existing
        document.getElementById('select-all-accounts-popover')?.remove();

        const pop = document.createElement('div');
        pop.id = 'select-all-accounts-popover';
        pop.style.cssText = `
            position: absolute; left: ${Math.round(rect.left + 110)}px; top: ${Math.round(rect.top + rect.height + 10 + window.scrollY)}px;
            background: #1a1a1a; border: 1px solid #2d2d2d; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.45);
            color: #e5e7eb; z-index: 3000; width: 360px; max-width: calc(100vw - 40px);
            opacity: 0; transform: translateY(-6px) scale(0.98); transition: opacity .18s ease, transform .18s ease; overflow:hidden;`;
        pop.innerHTML = `
            <div style="padding:14px 16px; border-bottom: 1px solid #2d2d2d; font-weight:600;">Select accounts</div>
            <div style="padding:14px 16px; display:flex; flex-direction:column; gap:10px;">
                <button id="accounts-select-current-page" style="text-align:left;background:#3a3a3a;border:1px solid #4a4a4a;border-radius:10px;color:#fff;padding:10px 12px;cursor:pointer;">Select this page (${visibleCount})</button>
                <button id="accounts-select-all-filtered" style="text-align:left;background:#3a3a3a;border:1px solid #4a4a4a;border-radius:10px;color:#fff;padding:10px 12px;cursor:pointer;">Select all matching (${totalFiltered})</button>
            </div>
            <div style="display:flex;justify-content:flex-end;padding:0 16px 14px 16px;">
                <button id="accounts-select-cancel" style="background:#f59e0b;border:1px solid #f59e0b;color:#ffffff;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;">Cancel</button>
            </div>`;
        document.body.appendChild(pop);
        requestAnimationFrame(()=>{ pop.style.opacity = '1'; pop.style.transform = 'translateY(0) scale(1)'; });

        const closePopover = () => {
            pop.style.opacity = '0'; pop.style.transform = 'translateY(-6px) scale(0.98)';
            setTimeout(()=>pop.remove(), 160);
            const headerCb = document.getElementById('select-all-accounts-checkbox');
            if (headerCb) headerCb.checked = false;
            document.removeEventListener('click', outsideHandler, true);
        };
        const outsideHandler = (e) => { if (!pop.contains(e.target)) closePopover(); };
        setTimeout(()=> document.addEventListener('click', outsideHandler, true), 0);

        const cancelBtn = pop.querySelector('#accounts-select-cancel');
        // Enforce colors to match contacts popover (override theme)
        cancelBtn.style.setProperty('background', '#f59e0b', 'important');
        cancelBtn.style.setProperty('border-color', '#f59e0b', 'important');
        cancelBtn.style.setProperty('color', '#ffffff', 'important');
        cancelBtn.onclick = closePopover;
        cancelBtn.onmouseover = () => { cancelBtn.style.setProperty('background', '#e38b06', 'important'); cancelBtn.style.setProperty('border-color', '#e38b06', 'important'); };
        cancelBtn.onmouseout  = () => { cancelBtn.style.setProperty('background', '#f59e0b', 'important'); cancelBtn.style.setProperty('border-color', '#f59e0b', 'important'); };
        const selBtns = pop.querySelectorAll('#accounts-select-current-page, #accounts-select-all-filtered');
        selBtns.forEach(b => {
            b.style.setProperty('background', '#3a3a3a', 'important');
            b.style.setProperty('border-color', '#4a4a4a', 'important');
            b.style.setProperty('color', '#ffffff', 'important');
            b.onmouseover = () => b.style.setProperty('background', '#4a4a4a', 'important');
            b.onmouseout  = () => b.style.setProperty('background', '#3a3a3a', 'important');
        });

        pop.querySelector('#accounts-select-current-page').onclick = () => {
            visibleRowCheckboxes.forEach(cb => {
                cb.checked = true;
                const id = cb.getAttribute('data-account-id');
                if (id) this.selectedAccountIds.add(id);
            });
            this.updateAccountsBulkToolbar();
            closePopover();
        };
        pop.querySelector('#accounts-select-all-filtered').onclick = () => {
            filteredAccounts.forEach(a => { if (a && a.id) this.selectedAccountIds.add(a.id); });
            this.renderAccountsTable(filteredAccounts);
            closePopover();
        };
    },

    // Create or return the bulk actions bar for accounts
    ensureAccountsBulkActionsBar() {
        const controlsLeft = document.querySelector('#accounts-table-container .table-controls .table-controls-left');
        if (!controlsLeft) return null;
        let bar = document.getElementById('accounts-bulk-actions');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'accounts-bulk-actions';
            // Keep above table so tooltips/menus don't get clipped
            bar.style.cssText = [
                'display:none',
                'align-items:center',
                'gap:8px',
                'margin-left:12px',
                'background:#1a1a1a',
                'border:1px solid #2d2d2d',
                'border-radius:10px',
                'padding:4px 6px',
                'box-shadow:0 6px 16px rgba(0,0,0,0.35)',
                'position:relative',
                'z-index:3500',
                'overflow:visible'
            ].join(';');

            const countSpan = document.createElement('span');
            countSpan.id = 'accounts-bulk-selected-count';
            countSpan.style.cssText = 'color:#e5e7eb;font-size:13px;white-space:nowrap;';
            bar.appendChild(countSpan);

            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Clear';
            clearBtn.title = 'Clear selection';
            clearBtn.style.cssText = 'background:#2a2a2a;border:1px solid #3a3a3a;color:#ffffff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;';
            clearBtn.onclick = () => this.clearSelectedAccounts();
            bar.appendChild(clearBtn);

            const mkIconBtn = (id, title, svg) => {
                const b = document.createElement('button');
                b.id = id; b.title = title; b.setAttribute('aria-label', title);
                b.style.cssText = 'width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;background:#2a2a2a;border:1px solid #3a3a3a;color:#ffffff;border-radius:8px;padding:0;cursor:pointer;position:relative;';
                b.innerHTML = svg;
                // Ensure inner SVG is centered within the square
                const iconEl = b.querySelector('svg');
                if (iconEl) {
                    iconEl.style.display = 'block';
                    iconEl.style.margin = '0';
                }
                b.onmouseover = () => b.style.setProperty('background', '#3a3a3a', 'important');
                b.onmouseout = () => b.style.setProperty('background', '#2a2a2a', 'important');
                b.onfocus = () => b.style.setProperty('background', '#3a3a3a', 'important');
                b.onblur = () => b.style.setProperty('background', '#2a2a2a', 'important');
                return b;
            };

            // Cleaned icons (remove stray dots/lines)
            // Magnifying glass only (no semicircle base)
            const iconSearchUser = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
            // Clean list icon (no plus)
            // Centered three-line list (6→18 to align within 24 viewbox)
            const iconListPlus = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M6 7H18M6 12H18M6 17H18"/></svg>';
            const iconExport = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="15"/></svg>';
            const iconTrash = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';

            const findBtn = mkIconBtn('accounts-bulk-find-btn', 'Find people', iconSearchUser); findBtn.onclick = () => this.bulkFindPeopleForAccounts(); bar.appendChild(findBtn);
            const addContactsBtn = mkIconBtn('accounts-bulk-add-contacts-btn', 'Add contacts to list', iconListPlus); addContactsBtn.onclick = () => this.bulkAddContactsToListForAccounts(); bar.appendChild(addContactsBtn);
            const exportBtn = mkIconBtn('accounts-bulk-export-btn', 'Export accounts', iconExport); exportBtn.onclick = () => this.bulkExportSelectedAccounts(); bar.appendChild(exportBtn);
            const deleteBtn = mkIconBtn('accounts-bulk-delete-btn', 'Delete accounts', iconTrash); deleteBtn.style.borderColor = '#7f1d1d'; deleteBtn.onclick = () => this.bulkDeleteSelectedAccounts(); bar.appendChild(deleteBtn);

            // Tooltips
            const addTooltip = (el, label) => {
                const show = () => {
                    const tip = document.createElement('div');
                    tip.className = 'bulk-tip';
                    tip.textContent = label;
                    tip.style.cssText = 'position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;background:#0f172a;color:#e5e7eb;border:1px solid #2d2d2d;border-radius:6px;padding:4px 8px;font-size:12px;white-space:nowrap;z-index:4000;box-shadow:0 6px 16px rgba(0,0,0,0.3)';
                    el.appendChild(tip);
                };
                const hide = () => { const tip = el.querySelector('.bulk-tip'); if (tip) tip.remove(); };
                el.addEventListener('mouseenter', show); el.addEventListener('mouseleave', hide);
                el.addEventListener('focus', show); el.addEventListener('blur', hide);
            };
            addTooltip(findBtn, 'Find people');
            addTooltip(addContactsBtn, 'Add contacts to list');
            addTooltip(exportBtn, 'Export');
            addTooltip(deleteBtn, 'Delete');

            controlsLeft.appendChild(bar);
        }
        // Enforce theme
        const restyleButtons = () => {
            const allButtons = bar.querySelectorAll('button');
            allButtons.forEach(btn => {
                btn.style.setProperty('background', '#2a2a2a', 'important');
                btn.style.setProperty('border', '1px solid #3a3a3a', 'important');
                btn.style.setProperty('color', '#ffffff', 'important');
                btn.style.setProperty('border-radius', '8px', 'important');
            });
        };
        restyleButtons();
        return bar;
    },

    // Show/hide and update accounts bulk toolbar
    updateAccountsBulkToolbar() {
        const bar = this.ensureAccountsBulkActionsBar();
        if (!bar) return;
        const selectedCount = this.selectedAccountIds ? this.selectedAccountIds.size : 0;
        const countSpan = document.getElementById('accounts-bulk-selected-count');
        if (countSpan) countSpan.textContent = `Selected ${selectedCount}`;
        const visible = bar.style.display !== 'none';
        if (selectedCount > 0 && !visible) {
            bar.style.display = 'inline-flex';
            bar.style.opacity = '0'; bar.style.transform = 'translateY(-6px)';
            bar.style.transition = 'opacity .18s ease, transform .18s ease';
            requestAnimationFrame(()=>{ bar.style.opacity = '1'; bar.style.transform = 'translateY(0)'; });
        } else if (selectedCount === 0 && visible) {
            bar.style.transition = 'opacity .18s ease, transform .18s ease';
            bar.style.opacity = '0'; bar.style.transform = 'translateY(-6px)';
            setTimeout(()=>{ bar.style.display = 'none'; }, 180);
        }
        // Fade the right results info when bar is visible
        const resultsInfo = document.getElementById('accounts-results-info');
        if (resultsInfo) {
            resultsInfo.style.transition = 'opacity 0.2s ease';
            resultsInfo.style.opacity = selectedCount > 0 ? '0' : '1';
        }
    },

    clearSelectedAccounts() {
        if (this.selectedAccountIds) this.selectedAccountIds.clear();
        const headerCb = document.getElementById('select-all-accounts-checkbox');
        if (headerCb) headerCb.checked = false;
        document.querySelectorAll('#accounts-table-body .row-checkbox').forEach(cb => { cb.checked = false; });
        this.updateAccountsBulkToolbar();
    },

    attachSelectAllAccountsHandler() {
        const selectAll = document.getElementById('select-all-accounts-checkbox');
        if (!selectAll) return;
        selectAll.onchange = (e) => {
            if (e.target.checked) {
                this.showSelectAllAccountsPopover();
            } else {
                this.clearSelectedAccounts();
            }
        };
    },

    // Bulk action handlers for accounts
    bulkFindPeopleForAccounts() {
        const count = this.selectedAccountIds ? this.selectedAccountIds.size : 0;
        this.showNotification(`Find people for ${count} account(s) (coming soon)`, 'info');
    },
    bulkAddContactsToListForAccounts() {
        const count = this.selectedAccountIds ? this.selectedAccountIds.size : 0;
        this.showNotification(`Added contacts from ${count} account(s) to list (stub)`, 'info');
    },
    bulkExportSelectedAccounts() {
        const ids = this.selectedAccountIds ? Array.from(this.selectedAccountIds) : [];
        const map = new Map((this.accounts||[]).map(a=>[a.id,a]));
        const accounts = ids.map(id=>map.get(id)).filter(Boolean);
        if (accounts.length === 0) { this.showNotification('No accounts selected to export', 'warning'); return; }
        const headers = ['Company','Industry','Website','Phone','Location','Created'];
        const rows = accounts.map(a=>[
            a.name||'', a.industry||'', a.website||'', a.phone||'', this.formatLocation(a), this.formatDate(a.createdAt)
        ]);
        const csv = [headers.join(','), ...rows.map(r=>r.map(x=>String(x).includes(',')?`"${String(x).replace(/"/g,'""')}"`:String(x)).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `accounts_selected_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        this.showNotification('Exported selected accounts', 'success');
    },
    bulkDeleteSelectedAccounts() {
        const ids = this.selectedAccountIds ? Array.from(this.selectedAccountIds) : [];
        if (ids.length === 0) return;
        const ok = window.confirm(`Delete ${ids.length} selected account(s)? This cannot be undone.`);
        if (!ok) return;
        this.accounts = (this.accounts||[]).filter(a => !ids.includes(a.id));
        if (typeof db !== 'undefined') {
            ids.forEach(id => { try { db.collection('accounts').doc(id).delete(); } catch(_){ } });
        }
        this.selectedAccountIds.clear();
        this.renderAccountsPage();
        this.showNotification('Deleted selected accounts', 'success');
    },

    // Render accounts pagination (top and bottom)
    renderAccountsPagination(total, page, totalPages) {
        const info = document.getElementById('accounts-pagination-info');
        const prev = document.getElementById('accounts-prev-page-btn');
        const next = document.getElementById('accounts-next-page-btn');
        const topPrev = document.getElementById('accounts-top-prev-page-btn');
        const topNext = document.getElementById('accounts-top-next-page-btn');
        const nums = document.getElementById('accounts-pagination-numbers');

        const per = this.accountsPerPage || 50;
        const from = total === 0 ? 0 : (page - 1) * per + 1;
        const to = Math.min(page * per, total);
        if (info) info.textContent = `Showing ${from}-${to} of ${total} accounts`;

        if (prev) {
            prev.disabled = page <= 1;
            prev.onclick = () => { if (this.accountsCurrentPage > 1) { this.accountsCurrentPage--; this.filterAndRenderAccounts(); } };
        }
        if (next) {
            next.disabled = page >= totalPages;
            next.onclick = () => { if (this.accountsCurrentPage < totalPages) { this.accountsCurrentPage++; this.filterAndRenderAccounts(); } };
        }
        if (topPrev) {
            topPrev.disabled = page <= 1;
            topPrev.onclick = () => { if (this.accountsCurrentPage > 1) { this.accountsCurrentPage--; this.filterAndRenderAccounts(); } };
        }
        if (topNext) {
            topNext.disabled = page >= totalPages;
            topNext.onclick = () => { if (this.accountsCurrentPage < totalPages) { this.accountsCurrentPage++; this.filterAndRenderAccounts(); } };
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
                b.onclick = () => { this.accountsCurrentPage = i; this.renderAccountsTable(this.accounts); };
                nums.appendChild(b);
            }
        }
    },

    // Get company favicon URL (size-aware)
    getCompanyFaviconOfSize(account, size = 32) {
        if (account && account.website) {
            try {
                const domain = new URL(account.website).hostname;
                return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
            } catch (e) {
                return `https://www.google.com/s2/favicons?domain=${this.extractDomainFromAccountName(account.name)}&sz=${size}`;
            }
        }
        return `https://www.google.com/s2/favicons?domain=${this.extractDomainFromAccountName(account?.name)}&sz=${size}`;
    },

    // Backwards-compatible 32px favicon helper
    getCompanyFavicon(account) {
        return this.getCompanyFaviconOfSize(account, 32);
    },

    // Format location for display
    formatLocation(account) {
        if (account.city && account.state) {
            return `${account.city}, ${account.state}`;
        } else if (account.city) {
            return account.city;
        } else if (account.state) {
            return account.state;
        }
        return 'N/A';
    },

    // Format date for display
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return 'N/A';
        return d.toLocaleDateString();
    },

    // Populate industry filter dropdown
    populateIndustryFilter() {
        const industryFilter = document.getElementById('industry-filter');
        if (!industryFilter || !this.accounts) return;

        const industries = [...new Set(this.accounts.map(account => account.industry).filter(Boolean))];
        industries.sort();

        // Clear existing options except "All Industries"
        while (industryFilter.children.length > 1) {
            industryFilter.removeChild(industryFilter.lastChild);
        }

        industries.forEach(industry => {
            const option = document.createElement('option');
            option.value = industry;
            option.textContent = industry;
            industryFilter.appendChild(option);
        });
    },

    // Update accounts count display
    updateAccountsCount(count = null) {
        const countElement = document.getElementById('accounts-count');
        if (countElement) {
            const total = count !== null ? count : (this.accounts ? this.accounts.length : 0);
            countElement.textContent = `${total} account${total !== 1 ? 's' : ''}`;
        }
    },

    // Export accounts functionality
    exportAccounts() {
        if (!this.accounts || this.accounts.length === 0) {
            this.showNotification('No accounts to export', 'warning');
            return;
        }

        const csvContent = this.convertAccountsToCSV(this.accounts);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `accounts_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification('Accounts exported successfully', 'success');
    },

    // Convert accounts to CSV format
    convertAccountsToCSV(accounts) {
        const headers = ['Company', 'Industry', 'Website', 'Phone', 'Location', 'Created'];
        const csvRows = [headers.join(',')];

        accounts.forEach(account => {
            const row = [
                this.escapeCsvField(account.name || ''),
                this.escapeCsvField(account.industry || ''),
                this.escapeCsvField(account.website || ''),
                this.escapeCsvField(account.phone || ''),
                this.escapeCsvField(this.formatLocation(account)),
                this.escapeCsvField(this.formatDate(account.createdAt))
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    },

    // Escape CSV field if it contains commas or quotes
    escapeCsvField(field) {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
    },

    // Extract domain from account name for favicon
    extractDomainFromAccountName(accountName) {
        if (!accountName) return 'example.com';
        
        let domain = accountName.toLowerCase()
            .replace(/\s+(inc|llc|corp|corporation|company|co|ltd|limited)\.?$/i, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '')
            .trim();
        
        if (domain.length < 2) {
            domain = accountName.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
        
        return domain + '.com';
    },

    // Show individual account details page
    showAccountDetails(accountId, originCtx = null) {
        const account = (this.accounts || []).find(a => a.id === accountId);
        if (!account) {
            console.error('Account not found:', accountId);
            return;
        }

        const accountsView = document.getElementById('accounts-view');
        if (!accountsView) {
            console.error('accounts-view element not found');
            return;
        }

        // Track origin for back navigation and label
        if (originCtx) {
            this.lastAccountOrigin = originCtx;
        } else {
            // Default to accounts list as origin when none is provided
            this.lastAccountOrigin = { from: 'accounts' };
        }

        // Ensure only the accounts view is visible (avoid showing Contacts and Account together)
        try {
            document.querySelectorAll('.page-view').forEach(view => {
                view.style.display = 'none';
                view.style.visibility = 'hidden';
                view.style.position = 'absolute';
                view.style.left = '-9999px';
            });
            accountsView.style.display = 'flex';
            accountsView.style.visibility = 'visible';
            accountsView.style.position = 'static';
            accountsView.style.left = 'auto';

            const crmWidgetsContainer = document.getElementById('crm-widgets-container');
            const coldCallingWidgetsContainer = document.getElementById('cold-calling-widgets-container');
            if (crmWidgetsContainer) crmWidgetsContainer.style.display = 'flex';
            if (coldCallingWidgetsContainer) coldCallingWidgetsContainer.style.display = 'none';
        } catch (e) {
            console.warn('View switch fallback in showAccountDetails:', e);
        }

        // Related data
        const accountContacts = (this.contacts || []).filter(c => c.accountId === accountId);
        const accountActivities = (this.activities || []).filter(a => a.accountId === accountId);

        // Favicon (prefer website when available), 64px for header
        const faviconUrl = this.getCompanyFaviconOfSize(account, 64);
        
        // Compute back navigation label and handler based on origin
        const cameFromContact = this.lastAccountOrigin && this.lastAccountOrigin.from === 'contact' && this.lastAccountOrigin.contactId;
        let contactName = '';
        if (cameFromContact) {
            const c = (this.contacts || []).find(x => x.id === this.lastAccountOrigin.contactId);
            if (c) contactName = `${(c.firstName || '').trim()} ${(c.lastName || '').trim()}`.trim();
        }
        const backLabel = cameFromContact ? `Back to ${contactName || 'Contact'}` : 'Back to Accounts';
        const backOnClick = cameFromContact 
            ? `CRMApp.showContactDetails('${this.lastAccountOrigin.contactId}')`
            : `CRMApp.renderAccountsPage()`;

        const accountDetailsHTML = `
            <div class="account-details-header" style="
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        <span>${backLabel}</span>
                    </button>
                    ${faviconUrl ? `<img src="${faviconUrl}" alt="${account.name}" style="width: 48px; height: 48px; border-radius: 8px;" onerror="this.style.display='none'">` : ''}
                    <h2 style="margin: 0; color: #fff; font-size: 28px; font-weight: 600;">${account.name}</h2>
                </div>
                <div class="account-actions" style="display:flex; gap:10px; align-items:center;">
                    <button title="Edit account" style="display:flex; align-items:center; gap:8px; background:#1f2430; border:1px solid #333; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#262c3a'" onmouseout="this.style.background='#1f2430'" onclick="CRMApp.editAccount('${account.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                        <span>Edit</span>
                    </button>
                    <button title="Add contact" style="display:flex; align-items:center; gap:8px; background:#1f2430; border:1px solid #fb923c; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#262c3a'" onmouseout="this.style.background='#1f2430'" onclick="CRMApp.showNotification('Add Contact coming soon', 'info')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                        <span>+ Add Contact</span>
                    </button>
                </div>
            </div>

            <div class="account-details-content" style="display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;">
                <div class="account-info-section" style="flex: 1; display: flex; flex-direction: column; gap: 20px; min-width: 0; min-height: 0;">
                    <div class="detail-scroll" style="flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 20px;">
                        <!-- Account Information Card -->
                        <div class="account-info-card" style="background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%); padding: 24px; border-radius: 18px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);">
                            <h3 style="margin: 0 0 20px 0; color: #fff; font-size: 20px;">Account Information</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Company Name</label>
                                    <div style="color: #fff; font-size: 16px; font-weight: 500;">${account.name || 'N/A'}</div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Phone</label>
                                    <div style="color: #fff; font-size: 16px;">${account.phone || 'N/A'}</div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Location</label>
                                    <div style="color: #fff; font-size: 16px;">${this.formatLocation(account)}</div>
                                </div>
                                <div>
                                    <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Industry</label>
                                    <div style="color: #fff; font-size: 16px;">${account.industry || 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Company Information Card -->
                        <div class="company-info-card" style="background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%); padding: 24px; border-radius: 18px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);">
                            <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Company Information</h3>
                            <div style="color: #fff; font-size: 15px; white-space: pre-wrap;">${account.companyInformation || '<span style="color:#888; font-style:italic;">No company information yet</span>'}</div>
                        </div>

                        <!-- Contacts Card -->
                        <div class="account-contacts-card" style="background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%); padding: 24px; border-radius: 18px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); display: flex; flex-direction: column;">
                            <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Contacts (${accountContacts.length})</h3>
                            <div style="flex: 1; overflow-y: auto; max-height: 300px;">
                                ${accountContacts.length > 0 ? accountContacts.map(contact => `
                                    <div style="padding: 12px; border: 1px solid #333; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" onmouseout="this.style.backgroundColor='transparent'" onclick="CRMApp.showContactDetails('${contact.id}', { from: 'account', accountId: '${account.id}' })">
                                        <div style="color: #fff; font-weight: 500; margin-bottom: 4px;">${contact.firstName || ''} ${contact.lastName || ''}</div>
                                        <div style="color: #ccc; font-size: 14px;">${(contact.title || 'No title')} • ${(contact.email || 'No email')}</div>
                                    </div>
                                `).join('') : '<div style="color: #888; font-style: italic; text-align: center; padding: 20px;">No contacts found for this account</div>'}
                            </div>
                        </div>

                        <!-- Recent Activities Card -->
                        <div class="widget-card" style="background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%); padding: 20px; border-radius: 18px; border: 1px solid #333; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);">
                            <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Recent Activities</h3>
                            <div style="max-height: 360px; overflow-y: auto;">
                                ${accountActivities.length > 0 ? accountActivities.slice(0, 20).map(activity => `
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

        accountsView.innerHTML = accountDetailsHTML;

        // Apply card container styles for detail view (big card with rounded edges and margins)
        accountsView.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - 120px) !important;
            background: #1a1a1a !important;
            color: #fff !important;
            margin: 25px calc(25px - var(--spacing-lg)) 25px calc(25px - var(--spacing-lg)) !important;
            padding: var(--spacing-lg) !important;
            border-radius: 25px !important;
            overflow: hidden !important;
        `;
    },

    // Edit account functionality
    editAccount(accountId) {
        const account = this.accounts.find(a => a.id === accountId);
        if (!account) {
            console.error('Account not found:', accountId);
            return;
        }

        // Build edit modal dynamically
        const existing = document.getElementById('edit-account-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'edit-account-modal';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2000; display: flex; align-items: center; justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            width: 560px; max-width: 90vw; background: #1a1a1a; border: 1px solid #333; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        `;

        modal.innerHTML = `
            <div style="padding: 20px 24px; border-bottom: 1px solid #2a2a2a;">
                <h3 style="margin: 0; color: #fff; font-size: 18px;">Edit Account</h3>
                <p style="margin: 6px 0 0; color: #b0b0b0; font-size: 13px;">Update the company details below.</p>
            </div>
            <form id="edit-account-form" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 14px;">
                <label style="color:#ccc; font-size:13px;">Company Name
                    <input type="text" id="edit-account-name" value="${account.name || ''}" style="width:100%; margin-top:6px; padding:10px 12px; background:#232323; border:1px solid #333; border-radius:8px; color:#fff;" required>
                </label>
                <label style="color:#ccc; font-size:13px;">Industry
                    <input type="text" id="edit-account-industry" value="${account.industry || ''}" style="width:100%; margin-top:6px; padding:10px 12px; background:#232323; border:1px solid #333; border-radius:8px; color:#fff;">
                </label>
                <label style="color:#ccc; font-size:13px;">Phone
                    <input type="tel" id="edit-account-phone" value="${account.phone || ''}" style="width:100%; margin-top:6px; padding:10px 12px; background:#232323; border:1px solid #333; border-radius:8px; color:#fff;">
                </label>
                <label style="color:#ccc; font-size:13px;">Website
                    <input type="url" id="edit-account-website" value="${account.website || ''}" style="width:100%; margin-top:6px; padding:10px 12px; background:#232323; border:1px solid #333; border-radius:8px; color:#fff;">
                </label>
                <label style="color:#ccc; font-size:13px;">Address
                    <input type="text" id="edit-account-address" value="${account.address || ''}" style="width:100%; margin-top:6px; padding:10px 12px; background:#232323; border:1px solid #333; border-radius:8px; color:#fff;">
                </label>
                <label style="color:#ccc; font-size:13px;">Company Information
                    <textarea id="edit-account-company-information" rows="5" style="width:100%; margin-top:6px; padding:10px 12px; background:#232323; border:1px solid #333; border-radius:8px; color:#fff; resize: vertical;">${account.companyInformation || ''}</textarea>
                </label>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top: 6px;">
                    <button type="button" id="edit-account-cancel" style="background:#2a2a2a; border:1px solid #444; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#2a2a2a'">Cancel</button>
                    <button type="submit" style="background:#1f2430; border:1px solid #3b82f6; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onmouseover="this.style.background='#262c3a'" onmouseout="this.style.background='#1f2430'">Save Changes</button>
                </div>
            </form>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Event handlers
        modal.querySelector('#edit-account-cancel').onclick = () => overlay.remove();
        modal.querySelector('#edit-account-form').onsubmit = async (e) => {
            e.preventDefault();
            const updated = {
                name: document.getElementById('edit-account-name').value.trim(),
                industry: document.getElementById('edit-account-industry').value.trim(),
                phone: document.getElementById('edit-account-phone').value.trim(),
                website: document.getElementById('edit-account-website').value.trim(),
                address: document.getElementById('edit-account-address').value.trim(),
                companyInformation: document.getElementById('edit-account-company-information').value,
                updatedAt: serverTimestamp()
            };

            try {
                if (typeof db !== 'undefined') {
                    await db.collection('accounts').doc(accountId).update(updated);
                }

                // Update local state
                const idx = this.accounts.findIndex(a => a.id === accountId);
                if (idx !== -1) {
                    this.accounts[idx] = { ...this.accounts[idx], ...updated };
                }

                this.showToast('Account saved successfully', 'success');
                overlay.remove();
                // Re-render details view to reflect updates
                this.showAccountDetails(accountId);
            } catch (err) {
                console.error('Error updating account:', err);
                this.showToast('Failed to save account', 'error');
            }
        };
    }
});
