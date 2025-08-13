// Power Choosers CRM Dashboard - Contacts Module
// This module contains all contacts functionality

// Extend CRMApp with contacts functions
Object.assign(CRMApp, {
    // Render the contacts page
    renderContactsPage() {
        console.log('renderContactsPage called');
        console.log('Available contacts data:', CRMApp.contacts ? CRMApp.contacts.length : 'undefined', 'contacts');
        console.log('Available accounts data:', CRMApp.accounts ? CRMApp.accounts.length : 'undefined', 'accounts');
        
        // Check if data is loaded
        if (!CRMApp.contacts || CRMApp.contacts.length === 0) {
            console.warn('No contacts data available, waiting for data to load...');
            setTimeout(() => {
                this.renderContactsPage();
            }, 500);
            return;
        }
        
        const contactsView = document.getElementById('contacts-view');
        if (!contactsView) {
            console.error('contacts-view element not found');
            return;
        }

        // Apply page styles
        contactsView.className = 'page-view';
        contactsView.style.cssText = 'display: flex !important; flex-direction: column !important; height: 100% !important; background: transparent !important; color: #e2e8f0 !important; padding: 0 !important; overflow: hidden !important;';

        console.log('Creating contacts HTML');
        const contactsHTML = `
            <div class="contacts-container">
                <!-- Contacts Header -->
                <div class="contacts-header">
                    <div class="contacts-title-section">
                        <div class="title-with-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="title-icon">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            <h1 class="contacts-title">All Contacts</h1>
                        </div>
                        <div class="contacts-meta">
                            <button class="filter-toggle-btn active" id="contacts-filter-toggle-btn" title="Toggle filters">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                            </button>
                            <span class="contacts-count" id="contacts-count">${CRMApp.contacts.length} contacts</span>
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
                        <button class="btn-outline" id="export-contacts-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export
                        </button>
                    </div>
                </div>

                <!-- Main Contacts Layout -->
                <div class="contacts-main-layout">
                    <!-- Filters Sidebar -->
                    <div class="contacts-filters-sidebar" id="contacts-filters-sidebar">
                        <div class="filters-header">
                            <div class="filters-title">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                                <h3>Filters</h3>
                            </div>
                            <button class="filters-collapse-btn" id="contacts-filters-collapse-btn" title="Collapse filters">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </button>
                        </div>
                        
                        <div class="filters-content" id="contacts-filters-content">
                            <!-- Search Filter -->
                            <div class="filter-group">
                                <label class="filter-label">Search</label>
                                <input type="text" class="filter-input" id="contact-search" placeholder="Search contacts...">
                            </div>

                            <!-- Account Filter -->
                            <div class="filter-group">
                                <label class="filter-label">Account</label>
                                <select class="filter-select" id="account-filter">
                                    <option value="">All Accounts</option>
                                </select>
                            </div>

                            <!-- Title Filter -->
                            <div class="filter-group">
                                <label class="filter-label">Title</label>
                                <select class="filter-select" id="title-filter">
                                    <option value="">All Titles</option>
                                </select>
                            </div>

                            <!-- Clear Filters -->
                            <div class="filter-actions">
                                <button class="btn-secondary btn-small" id="clear-contacts-filters-btn">Clear All</button>
                            </div>
                        </div>
                    </div>

                    <!-- Contacts Table Container -->
                    <div class="contacts-table-container" id="contacts-table-container" style="--controls-h: 44px;">
                        <!-- Table Controls (top, above table) -->
                        <div class="table-controls">
                            <div class="table-controls-left">
                                <span class="selection-text">Select All</span>
                            </div>
                            <div class="table-controls-right">
                                <span class="results-info" id="contacts-results-info">Showing all contacts</span>
                                <button class="pagination-btn" id="contacts-top-prev-page-btn" aria-label="Previous" title="Previous">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="15 18 9 12 15 6"></polyline>
                                    </svg>
                                </button>
                                <button class="pagination-btn" id="contacts-top-next-page-btn" aria-label="Next" title="Next">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <!-- Contacts Table -->
                        <div class="contacts-table-wrapper" style="overflow-x:auto; width:100%;">
                            <table class="contacts-table" id="contacts-table">
                                <thead>
                                    <tr>
                                        <th class="number-column">#</th>
                                        <th class="checkbox-column">
                                            <input type="checkbox" id="select-all-contacts-checkbox">
                                        </th>
                                        <th class="sortable" data-sort="name">NAME</th>
                                        <th class="sortable" data-sort="title">TITLE</th>
                                        <th class="sortable" data-sort="account">AC</th>
                                        <th class="sortable" data-sort="email">EMAIL</th>
                                        <th class="sortable" data-sort="phone">PHONE</th>
                                        <th class="sortable" data-sort="created">CREATED</th>
                                        <th class="actions-column">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="contacts-table-body">
                                    <!-- Contacts will be populated here -->
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Bottom Pagination -->
                        <div class="pagination-container">
                            <div class="pagination-info">
                                <span id="contacts-pagination-info"></span>
                            </div>
                            <div class="pagination-controls">
                                <button class="pagination-btn" id="contacts-prev-page-btn" aria-label="Previous" title="Previous">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="15 18 9 12 15 6"></polyline>
                                    </svg>
                                </button>
                                <div class="pagination-numbers" id="contacts-pagination-numbers"></div>
                                <button class="pagination-btn" id="contacts-next-page-btn" aria-label="Next" title="Next">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        contactsView.innerHTML = contactsHTML;
        
        // Initialize pagination state
        this.contactsPerPage = 50;
        this.contactsCurrentPage = 1;
        this.selectedContactIds = new Set();

        // Initialize event listeners
        this.initContactsEventListeners();
        
        // Load and render contacts data
        setTimeout(() => {
            this.renderContactsTable();
        }, 100);
        
        // Update contacts count
        this.updateContactsCount();

        // Wire select-all handler and bulk toolbar
        this.attachSelectAllContactsHandler();
        this.updateContactsBulkToolbar();
    },

    // Initialize event listeners for contacts page
    initContactsEventListeners() {
        // Filter toggle button
        const filterToggleBtn = document.getElementById('contacts-filter-toggle-btn');
        if (filterToggleBtn) {
            filterToggleBtn.addEventListener('click', () => {
                const sidebar = document.getElementById('contacts-filters-sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('collapsed');
                    filterToggleBtn.classList.toggle('active');
                }
            });
        }

        // Search input
        const searchInput = document.getElementById('contact-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                // Reset to first page on new filter
                this.contactsCurrentPage = 1;
                this.filterAndRenderContacts();
            });
        }

        // Account filter
        const accountFilter = document.getElementById('account-filter');
        if (accountFilter) {
            accountFilter.addEventListener('change', () => {
                this.contactsCurrentPage = 1;
                this.filterAndRenderContacts();
            });
            this.populateAccountFilter();
        }

        // Title filter
        const titleFilter = document.getElementById('title-filter');
        if (titleFilter) {
            titleFilter.addEventListener('change', () => {
                this.contactsCurrentPage = 1;
                this.filterAndRenderContacts();
            });
            this.populateTitleFilter();
        }

        // Sidebar collapse button
        const collapseBtn = document.getElementById('contacts-filters-collapse-btn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                const sidebar = document.getElementById('contacts-filters-sidebar');
                const filterToggleBtn = document.getElementById('contacts-filter-toggle-btn');
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
        const clearFiltersBtn = document.getElementById('clear-contacts-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (accountFilter) accountFilter.value = '';
                if (titleFilter) titleFilter.value = '';
                this.contactsCurrentPage = 1;
                this.filterAndRenderContacts();
            });
        }

        // Export button
        const exportBtn = document.getElementById('export-contacts-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportContacts();
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

        // Select all checkbox
        const selectAll = document.getElementById('select-all-contacts-checkbox');
        if (selectAll) {
            selectAll.onchange = (e) => {
                if (e.target.checked) {
                    this.showSelectAllContactsPopover();
                } else {
                    // Unselect only visible rows
                    document.querySelectorAll('#contacts-table-body .row-checkbox').forEach(cb => {
                        cb.checked = false;
                        const id = cb.getAttribute('data-contact-id');
                        if (id) this.selectedContactIds.delete(id);
                    });
                    this.updateContactsBulkToolbar();
                }
            };
        }

        // Top pagination buttons
        const topPrev = document.getElementById('contacts-top-prev-page-btn');
        const topNext = document.getElementById('contacts-top-next-page-btn');
        if (topPrev) topPrev.addEventListener('click', () => {
            if (this.contactsCurrentPage > 1) {
                this.contactsCurrentPage--;
                this.filterAndRenderContacts();
            }
        });
        if (topNext) topNext.addEventListener('click', () => {
            this.contactsCurrentPage++;
            this.filterAndRenderContacts();
        });
    },

    // Filter and render contacts based on current filter values
    filterAndRenderContacts() {
        const searchTerm = document.getElementById('contact-search')?.value || '';
        const accountFilter = document.getElementById('account-filter')?.value || '';
        const titleFilter = document.getElementById('title-filter')?.value || '';
        
        let filteredContacts = CRMApp.contacts || [];

        // Apply search filter
        if (searchTerm) {
            filteredContacts = filteredContacts.filter(contact => 
                `${contact.firstName || ''} ${contact.lastName || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.title?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Apply account filter
        if (accountFilter) {
            filteredContacts = filteredContacts.filter(contact => 
                contact.accountId === accountFilter
            );
        }

        // Apply title filter
        if (titleFilter) {
            filteredContacts = filteredContacts.filter(contact => 
                contact.title === titleFilter
            );
        }

        this.renderContactsTable(filteredContacts);
        this.updateContactsCount(filteredContacts.length);
    },

    // Render contacts table with pagination
    renderContactsTable(contactsToRender = null) {
        console.log('renderContactsTable called');
        console.log('CRMApp.contacts:', CRMApp.contacts);
        console.log('contactsToRender:', contactsToRender);
        
        const tableBody = document.getElementById('contacts-table-body');
        if (!tableBody) {
            console.error('contacts-table-body element not found');
            return;
        }

        const all = contactsToRender || CRMApp.contacts || [];
        console.log('all contacts to render:', all);
        
        const total = all.length;
        const per = this.contactsPerPage || 50;
        const totalPages = Math.max(1, Math.ceil(total / per));
        if ((this.contactsCurrentPage||1) > totalPages) this.contactsCurrentPage = totalPages;
        const startIdx = ((this.contactsCurrentPage||1) - 1) * per;
        const pageItems = all.slice(startIdx, startIdx + per);
        
        console.log('pageItems to render:', pageItems);

        // Update results info
        const resultsInfo = document.getElementById('contacts-results-info');
        if (resultsInfo) {
            const from = total === 0 ? 0 : startIdx + 1;
            const to = Math.min(startIdx + pageItems.length, total);
            const totalAll = (CRMApp.contacts || []).length;
            resultsInfo.textContent = `Showing ${from}-${to} of ${totalAll} contacts`;
        }

        // Keep header count in sync with current total
        this.updateContactsCount(total);

        tableBody.innerHTML = '';

        pageItems.forEach((contact, index) => {
            console.log('Rendering contact:', contact);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="col-number"><span class="row-number">${startIdx + index + 1}</span></td>
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" data-contact-id="${contact.id}">
                </td>
                <td class="col-name">
                    <div class="cell-name">
                        <div class="contact-avatar">
                            <span class="avatar-text">${(contact.firstName || '').charAt(0)}${(contact.lastName || '').charAt(0)}</span>
                        </div>
                        <div class="contact-info">
                            <div class="contact-name">
                                <span class="contact-link" role="button" tabindex="0" title="View contact details" style="cursor:pointer;"
                                      onclick="CRMApp.showContactDetails('${contact.id}')"
                                      onkeydown="if(event.key==='Enter'){CRMApp.showContactDetails('${contact.id}');}">
                                    ${contact.firstName || ''} ${contact.lastName || ''}
                                </span>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="col-title">${contact.title || 'N/A'}</td>
                <td class="col-account">${contact.accountName || 'N/A'}</td>
                <td class="col-email">${contact.email || 'N/A'}</td>
                <td class="col-phone">${contact.phone || 'N/A'}</td>
                <td class="col-created">${this.formatDate(contact.createdAt)}</td>
                <td class="col-actions">
                    <div class="row-actions">
                        <button class="btn-icon" onclick="CRMApp.showContactDetails('${contact.id}')" title="View Details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="CRMApp.editContact('${contact.id}')" title="Edit">
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
                cb.checked = this.selectedContactIds.has(contact.id);
                cb.addEventListener('change', () => {
                    if (cb.checked) this.selectedContactIds.add(contact.id); else this.selectedContactIds.delete(contact.id);
                    this.updateContactsBulkToolbar();
                });
            }
        });

        this.renderContactsPagination(total, this.contactsCurrentPage || 1, totalPages);

        // Ensure handlers and toolbar stay wired after render
        this.attachSelectAllContactsHandler();
        this.updateContactsBulkToolbar();
    },

    // Populate account filter dropdown
    populateAccountFilter() {
        const accountFilter = document.getElementById('account-filter');
        if (!accountFilter) return;

        const accounts = CRMApp.accounts || [];
        const seen = new Set();
        
        accountFilter.innerHTML = '<option value="">All Accounts</option>';
        accounts.forEach(account => {
            if (account.name && !seen.has(account.name)) {
                seen.add(account.name);
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.name;
                accountFilter.appendChild(option);
            }
        });
    },

    // Populate title filter dropdown
    populateTitleFilter() {
        const titleFilter = document.getElementById('title-filter');
        if (!titleFilter) return;

        const contacts = CRMApp.contacts || [];
        const seen = new Set();
        
        titleFilter.innerHTML = '<option value="">All Titles</option>';
        contacts.forEach(contact => {
            if (contact.title && !seen.has(contact.title)) {
                seen.add(contact.title);
                const option = document.createElement('option');
                option.value = contact.title;
                option.textContent = contact.title;
                titleFilter.appendChild(option);
            }
        });
    },

    // Update contacts count display
    updateContactsCount(count = null) {
        const countElement = document.getElementById('contacts-count');
        if (countElement) {
            const total = count !== null ? count : (CRMApp.contacts ? CRMApp.contacts.length : 0);
            countElement.textContent = `${total} contact${total !== 1 ? 's' : ''}`;
        }
    },

    // Render pagination controls
    renderContactsPagination(total, currentPage, totalPages) {
        const paginationInfo = document.getElementById('contacts-pagination-info');
        const paginationNumbers = document.getElementById('contacts-pagination-numbers');
        const prevBtn = document.getElementById('contacts-prev-page-btn');
        const nextBtn = document.getElementById('contacts-next-page-btn');

        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${total} of ${total} contacts`;
        }

        if (paginationNumbers) {
            paginationNumbers.innerHTML = '';
            for (let i = 1; i <= totalPages; i++) {
                const pageBtn = document.createElement('button');
                pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
                pageBtn.textContent = i;
                pageBtn.onclick = () => {
                    this.contactsCurrentPage = i;
                    this.filterAndRenderContacts();
                };
                paginationNumbers.appendChild(pageBtn);
            }
        }

        if (prevBtn) {
            prevBtn.disabled = currentPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = currentPage >= totalPages;
        }
    },

    // Attach select all handler
    attachSelectAllContactsHandler() {
        const selectAll = document.getElementById('select-all-contacts-checkbox');
        if (selectAll) {
            selectAll.onchange = (e) => {
                if (e.target.checked) {
                    this.showSelectAllContactsPopover();
                } else {
                    document.querySelectorAll('#contacts-table-body .row-checkbox').forEach(cb => {
                        cb.checked = false;
                        const id = cb.getAttribute('data-contact-id');
                        if (id) this.selectedContactIds.delete(id);
                    });
                    this.updateContactsBulkToolbar();
                }
            };
        }
    },

    // Show select all popover
    showSelectAllContactsPopover() {
        const visibleRowCheckboxes = Array.from(document.querySelectorAll('#contacts-table-body .row-checkbox'));
        const visibleCount = visibleRowCheckboxes.length;
        const filteredContacts = this.getFilteredContacts();
        const totalFiltered = filteredContacts.length;

        const container = document.querySelector('#contacts-table-container .table-controls .table-controls-left');
        const rect = container ? container.getBoundingClientRect() : { left: 40, top: 120, height: 20 };

        document.getElementById('select-all-contacts-popover')?.remove();

        const pop = document.createElement('div');
        pop.id = 'select-all-contacts-popover';
        pop.style.cssText = `
            position: absolute; left: ${Math.round(rect.left + 110)}px; top: ${Math.round(rect.top + rect.height + 10 + window.scrollY)}px;
            background: #1a1a1a; border: 1px solid #2d2d2d; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.45);
            color: #e5e7eb; z-index: 3000; width: 360px; max-width: calc(100vw - 40px);
            opacity: 0; transform: translateY(-6px) scale(0.98); transition: opacity .18s ease, transform .18s ease; overflow:hidden;`;
        pop.innerHTML = `
            <div style="padding:14px 16px; border-bottom: 1px solid #2d2d2d; font-weight:600;">Select contacts</div>
            <div style="padding:14px 16px; display:flex; flex-direction:column; gap:10px;">
                <button id="contacts-select-current-page" style="text-align:left;background:#3a3a3a;border:1px solid #4a4a4a;border-radius:10px;color:#fff;padding:10px 12px;cursor:pointer;">Select this page (${visibleCount})</button>
                <button id="contacts-select-all-filtered" style="text-align:left;background:#3a3a3a;border:1px solid #4a4a4a;border-radius:10px;color:#fff;padding:10px 12px;cursor:pointer;">Select all matching (${totalFiltered})</button>
            </div>
            <div style="display:flex;justify-content:flex-end;padding:0 16px 14px 16px;">
                <button id="contacts-select-cancel" style="background:#f59e0b;border:1px solid #f59e0b;color:#ffffff;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;">Cancel</button>
            </div>`;
        document.body.appendChild(pop);
        requestAnimationFrame(()=>{ pop.style.opacity = '1'; pop.style.transform = 'translateY(0) scale(1)'; });

        const closePopover = () => {
            pop.style.opacity = '0'; pop.style.transform = 'translateY(-6px) scale(0.98)';
            setTimeout(()=>pop.remove(), 160);
            const headerCb = document.getElementById('select-all-contacts-checkbox');
            if (headerCb) headerCb.checked = false;
            document.removeEventListener('click', outsideHandler, true);
        };
        const outsideHandler = (e) => { if (!pop.contains(e.target)) closePopover(); };
        setTimeout(()=> document.addEventListener('click', outsideHandler, true), 0);

        const cancelBtn = pop.querySelector('#contacts-select-cancel');
        cancelBtn.onclick = closePopover;

        const currentPageBtn = pop.querySelector('#contacts-select-current-page');
        currentPageBtn.onclick = () => {
            visibleRowCheckboxes.forEach(cb => {
                cb.checked = true;
                const id = cb.getAttribute('data-contact-id');
                if (id) this.selectedContactIds.add(id);
            });
            this.updateContactsBulkToolbar();
            closePopover();
        };

        const allFilteredBtn = pop.querySelector('#contacts-select-all-filtered');
        allFilteredBtn.onclick = () => {
            filteredContacts.forEach(contact => {
                this.selectedContactIds.add(contact.id);
            });
            this.updateContactsBulkToolbar();
            closePopover();
        };
    },

    // Get filtered contacts
    getFilteredContacts() {
        const searchTerm = (document.getElementById('contact-search')?.value || '').trim().toLowerCase();
        const accountFilter = (document.getElementById('account-filter')?.value || '').trim();
        const titleFilter = (document.getElementById('title-filter')?.value || '').trim();
        
        let list = Array.isArray(CRMApp.contacts) ? [...CRMApp.contacts] : [];
        
        if (searchTerm) {
            list = list.filter(c => 
                `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().includes(searchTerm) ||
                (c.email || '').toLowerCase().includes(searchTerm) ||
                (c.title || '').toLowerCase().includes(searchTerm)
            );
        }
        
        if (accountFilter) {
            list = list.filter(c => c.accountId === accountFilter);
        }
        
        if (titleFilter) {
            list = list.filter(c => c.title === titleFilter);
        }
        
        return list;
    },

    // Update bulk toolbar
    updateContactsBulkToolbar() {
        const selectedCount = this.selectedContactIds.size;
        const bulkToolbar = document.getElementById('bulk-actions-toolbar');
        
        if (selectedCount > 0) {
            if (!bulkToolbar) {
                const toolbar = document.createElement('div');
                toolbar.id = 'bulk-actions-toolbar';
                toolbar.className = 'bulk-actions-toolbar';
                toolbar.innerHTML = `
                    <div class="bar-left">
                        <span>${selectedCount} selected</span>
                    </div>
                    <div class="bar-actions">
                        <button class="bar-btn" onclick="CRMApp.exportSelectedContacts()">Export</button>
                        <button class="bar-btn" onclick="CRMApp.deleteSelectedContacts()">Delete</button>
                    </div>
                `;
                document.body.appendChild(toolbar);
            } else {
                const countSpan = bulkToolbar.querySelector('.bar-left span');
                if (countSpan) countSpan.textContent = `${selectedCount} selected`;
            }
        } else {
            bulkToolbar?.remove();
        }
    },

    // Export contacts
    exportContacts() {
        console.log('Exporting contacts...');
        // Implementation for exporting contacts
        this.showToast('Export functionality coming soon!', 'info');
    },

    // Show contact details
    showContactDetails(contactId) {
        console.log('Showing contact details for:', contactId);
        // Implementation for showing contact details
        this.showToast('Contact details coming soon!', 'info');
    },

    // Edit contact
    editContact(contactId) {
        console.log('Editing contact:', contactId);
        // Implementation for editing contact
        this.showToast('Edit functionality coming soon!', 'info');
    },

    // Format date for display
    formatDate(date) {
        if (!date) return 'N/A';
        try {
            const d = new Date(date);
            return d.toLocaleDateString();
        } catch (e) {
            return 'N/A';
        }
    },

    // Show toast notification
    showToast(message, type = 'info') {
        if (typeof CRMApp.showToast === 'function') {
            CRMApp.showToast(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
});
