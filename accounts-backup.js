// Power Choosers CRM Dashboard - Accounts Module
// This module contains all accounts functionality

// Extend CRMApp with accounts functions
Object.assign(CRMApp, {
    // Toggle accounts filters sidebar
    toggleAccountsFilters() {
        const sidebar = document.getElementById('accounts-filters-sidebar');
        const toggleBtn = document.getElementById('toggle-accounts-filters-btn');
        const expandBtn = document.getElementById('accounts-expand-btn');
        
        if (sidebar && toggleBtn) {
            const isCollapsed = sidebar.style.marginLeft === '-300px' || sidebar.style.marginLeft === '-280px';
            
            if (isCollapsed) {
                // Expand
                sidebar.style.marginLeft = '0px';
                sidebar.style.opacity = '1';
                toggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
                if (expandBtn) expandBtn.style.display = 'none';
            } else {
                // Collapse
                sidebar.style.marginLeft = '-280px';
                sidebar.style.opacity = '0.3';
                toggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
                this.showAccountsExpandButton();
            }
        }
    },

    // Show expand button for accounts filters
    showAccountsExpandButton() {
        // Remove existing expand button if any
        const existingBtn = document.getElementById('accounts-expand-btn');
        if (existingBtn) existingBtn.remove();
        
        // Create expand button
        const expandBtn = document.createElement('button');
        expandBtn.id = 'accounts-expand-btn';
        expandBtn.onclick = () => this.toggleAccountsFilters();
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

    // Clear accounts filters
    clearAccountsFilters() {
        const searchInput = document.getElementById('account-search-simple');
        const industryFilter = document.getElementById('account-industry-filter');
        
        if (searchInput) searchInput.value = '';
        if (industryFilter) industryFilter.value = '';
        
        // Re-render the accounts table
        this.renderSimpleAccountsTable('');
    },

    // Filter accounts by industry
    filterAccountsByIndustry(industry) {
        const searchValue = document.getElementById('account-search-simple')?.value || '';
        this.renderSimpleAccountsTable(searchValue, industry);
    },

    // Render simple accounts table with filtering
    renderSimpleAccountsTable(searchTerm = '', industryFilter = '') {
        const tableContainer = document.getElementById('accounts-table-container');
        if (!tableContainer) return;

        let filteredAccounts = this.accounts || [];

        // Apply search filter
        if (searchTerm) {
            filteredAccounts = filteredAccounts.filter(account => 
                account.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.industry?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Apply industry filter
        if (industryFilter) {
            filteredAccounts = filteredAccounts.filter(account => 
                account.industry === industryFilter
            );
        }

        // Update accounts count
        const countElement = document.getElementById('accounts-count');
        if (countElement) {
            countElement.textContent = `${filteredAccounts.length} accounts`;
        }

        // Render filtered accounts
        this.renderAccountsTable(filteredAccounts);
    },
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
        accountsView.style.cssText = 'display: flex !important; flex-direction: column !important; height: calc(100vh - 70px) !important; background: #0f1419 !important; color: #e2e8f0 !important; padding: 0 !important; overflow: hidden !important;';

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
                            <button class="filter-toggle-btn" id="accounts-filter-toggle-btn" title="Toggle filters">
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

                            <!-- Company Size Filter -->
                            <div class="filter-group">
                                <label class="filter-label">Company Size</label>
                                <select class="filter-select" id="size-filter">
                                    <option value="">All Sizes</option>
                                    <option value="startup">Startup (1-10)</option>
                                    <option value="small">Small (11-50)</option>
                                    <option value="medium">Medium (51-200)</option>
                                    <option value="large">Large (201-1000)</option>
                                    <option value="enterprise">Enterprise (1000+)</option>
                                </select>
                            </div>

                            <!-- Clear Filters -->
                            <div class="filter-actions">
                                <button class="btn-secondary btn-small" id="clear-accounts-filters-btn">Clear All</button>
                            </div>
                        </div>
                    </div>

                    <!-- Accounts Table Container -->
                    <div class="contacts-table-container" id="accounts-table-container">
                        <!-- Table Controls -->
                        <div class="table-controls">
                            <div class="table-controls-left">
                                <span class="selection-text">Select All</span>
                            </div>
                            <div class="table-controls-right">
                                <span class="results-info" id="accounts-results-info">Showing all accounts</span>
                            </div>
                        </div>
                        <!-- Accounts Table -->
                        <div class="contacts-table-wrapper">
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
                    </div>
                </div>
            </div>`;

        accountsView.innerHTML = accountsHTML;
        
        // Initialize event listeners
        this.initAccountsEventListeners();
        
        // Load and render accounts data
        this.renderAccountsTable();
        
        // Update accounts count
        this.updateAccountsCount();
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
            searchInput.addEventListener('input', (e) => {
                this.filterAndRenderAccounts();
            });
        }

        // Industry filter
        const industryFilter = document.getElementById('industry-filter');
        if (industryFilter) {
            industryFilter.addEventListener('change', () => {
                this.filterAndRenderAccounts();
            });
            this.populateIndustryFilter();
        }

        // Clear filters button
        const clearFiltersBtn = document.getElementById('clear-accounts-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (industryFilter) industryFilter.value = '';
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

    // Render accounts table with contacts-style design
    renderAccountsTable(accountsToRender = null) {
        const tableBody = document.getElementById('accounts-table-body');
        if (!tableBody) return;

        const accounts = accountsToRender || this.accounts || [];
        tableBody.innerHTML = '';

        accounts.forEach((account, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="col-number">${index + 1}</td>
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" data-account-id="${account.id}">
                </td>
                <td class="col-company">
                    <div class="cell-company">
                        <img src="${this.getCompanyFavicon(account)}" alt="${account.name}" class="favicon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNiIgZmlsbD0iIzMzMyIvPgo8cGF0aCBkPSJNOCAxMkgxNlYyMEg4VjEyWiIgZmlsbD0iIzY2NiIvPgo8L3N2Zz4K'">
                        <div class="company-lines">
                            <div class="company-name">${account.name || 'Unknown Company'}</div>
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
        });
    },

    // Get company favicon URL
    getCompanyFavicon(account) {
        if (account.website) {
            try {
                const domain = new URL(account.website).hostname;
                return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
            } catch (e) {
                // If website is not a valid URL, extract domain from company name
                return `https://www.google.com/s2/favicons?domain=${this.extractDomainFromAccountName(account.name)}&sz=32`;
            }
        }
        return `https://www.google.com/s2/favicons?domain=${this.extractDomainFromAccountName(account.name)}&sz=32`;
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
        try {
            return new Date(dateString).toLocaleDateString();
        } catch (e) {
            return 'N/A';
        }
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
    }
                    transition: all 0.3s ease;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="filters-title" style="color: #fff; margin: 0; font-size: 18px;">Filters</h3>
                        <button id="toggle-accounts-filters-btn" onclick="CRMApp.toggleAccountsFilters()" style="
                            background: #444;
                            border: 1px solid #666;
                            color: #fff;
                            padding: 6px 10px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: all 0.2s ease;
                        " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label" style="color: #ccc; font-size: 14px; margin-bottom: 5px; display: block;">Search</label>
                        <input type="text" id="account-search-simple" placeholder="Search accounts..." class="filter-input" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid #444;
                            border-radius: 8px;
                            background: #333;
                            color: #fff;
                            font-size: 14px;
                            transition: border-color 0.2s ease;
                        " oninput="CRMApp.renderSimpleAccountsTable(this.value)">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label" style="color: #ccc; font-size: 14px; margin-bottom: 5px; display: block;">Industry</label>
                        <select id="account-industry-filter" class="filter-select" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid #444;
                            border-radius: 8px;
                            background: #333;
                            color: #fff;
                            font-size: 14px;
                        " onchange="CRMApp.filterAccountsByIndustry(this.value)">
                            <option value="">All Industries</option>
                        </select>
                    </div>
                    <button onclick="CRMApp.clearAccountsFilters()" class="btn btn-clear-filters" style="
                        background: transparent;
                        border: 1px solid #555;
                        color: #ccc;
                        padding: 8px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.2s ease;
                        width: 100%;
                    " onmouseover="this.style.borderColor='#777'; this.style.color='#fff'" 
                       onmouseout="this.style.borderColor='#555'; this.style.color='#ccc'">
                        Clear Filters
                    </button>
                </div>

                <!-- Main Content Area -->
                <div class="accounts-main-content" style="
                    flex: 1;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    padding: 20px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                ">
                    <div id="accounts-table-container" style="
                        flex: 1;
                        overflow-x: auto;
                        overflow-y: auto;
                        border-radius: 12px;
                        min-height: 0;
                    ">
                    <table id="accounts-table" style="
                        width: 100%;
                        border-collapse: collapse;
                        background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
                        border-radius: 12px;
                        overflow: hidden;
                        border: 1px solid #444;
                    ">
                        <thead>
                            <tr style="
                                background: linear-gradient(135deg, #444 0%, #333 100%);
                                border-bottom: 2px solid #555;
                            ">
                                <th style="
                                    padding: 15px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    font-size: 14px;
                                ">Company</th>
                                <th style="
                                    padding: 15px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    font-size: 14px;
                                ">Industry</th>
                                <th style="
                                    padding: 15px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    font-size: 14px;
                                ">Phone</th>
                                <th style="
                                    padding: 15px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    font-size: 14px;
                                ">Location</th>
                                <th style="
                                    padding: 15px;
                                    text-align: left;
                                    font-weight: 600;
                                    color: #fff;
                                    border-bottom: 1px solid #555;
                                    font-size: 14px;
                                ">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="accounts-table-body">
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        accountsView.innerHTML = accountsHTML;
        
        // Apply layout styles
        accountsView.style.cssText = `
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - 120px) !important;
            background: #1a1a1a !important;
            color: #fff !important;
            margin-top: 32px !important;
            padding: 20px !important;
            border-radius: 20px !important;
            overflow: hidden !important;
        `;

        // Initialize accounts functionality
        this.initSimpleAccountsUI();
    },

    // Initialize simple accounts UI with basic functionality
    initSimpleAccountsUI() {
        console.log("Initializing simple accounts UI");
        
        // Populate industry filter
        this.populateAccountIndustryFilter();
        
        // Render initial accounts table
        this.renderSimpleAccountsTable();
        
        // Setup event listeners
        const searchInput = document.getElementById('account-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.renderSimpleAccountsTable(e.target.value);
            }, 300));
        }
        
        const industryFilter = document.getElementById('industry-filter');
        if (industryFilter) {
            industryFilter.addEventListener('change', (e) => {
                this.renderSimpleAccountsTable();
            });
        }
    },

    // Populate the industry filter dropdown for accounts
    populateAccountIndustryFilter() {
        const industryFilter = document.getElementById('industry-filter');
        if (!industryFilter) return;
        
        // Clear existing options except "All Industries"
        industryFilter.innerHTML = '<option value="">All Industries</option>';
        
        // Get unique industries
        const uniqueIndustries = [...new Set(this.accounts
            .filter(account => account.industry)
            .map(account => account.industry)
        )];
        
        uniqueIndustries.forEach(industry => {
            const option = document.createElement('option');
            option.value = industry;
            option.textContent = industry;
            industryFilter.appendChild(option);
        });
    },

    // Render the accounts table with search and pagination
    renderSimpleAccountsTable(searchTerm = '', accountsToRender = null) {
        const tableBody = document.getElementById('accounts-table-body');
        const accountsCount = document.getElementById('accounts-count');
        
        if (!tableBody || !accountsCount) return;
        
        // Use provided accounts or filter from all accounts
        let filteredAccounts = accountsToRender || this.accounts;
        
        // Apply search filter
        if (searchTerm) {
            filteredAccounts = filteredAccounts.filter(account => {
                const searchableText = `${account.name} ${account.industry} ${account.city} ${account.state}`.toLowerCase();
                return searchableText.includes(searchTerm.toLowerCase());
            });
        }
        
        // Apply industry filter
        const industryFilter = document.getElementById('industry-filter');
        if (industryFilter && industryFilter.value) {
            filteredAccounts = filteredAccounts.filter(account => 
                account.industry === industryFilter.value
            );
        }
        
        // Update accounts count
        accountsCount.textContent = `${filteredAccounts.length} account${filteredAccounts.length !== 1 ? 's' : ''}`;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        if (filteredAccounts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="
                        padding: 40px;
                        text-align: center;
                        color: #999;
                        font-style: italic;
                    ">No accounts found</td>
                </tr>
            `;
            return;
        }
        
        // Render account rows
        filteredAccounts.forEach(account => {
            const row = document.createElement('tr');
            row.style.cssText = `
                border-bottom: 1px solid #333;
                transition: background-color 0.2s ease;
                cursor: pointer;
            `;
            row.onmouseover = () => row.style.backgroundColor = '#2a2a2a';
            row.onmouseout = () => row.style.backgroundColor = 'transparent';
            
            const domain = this.extractDomainFromAccountName(account.name);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
            
            row.innerHTML = `
                <td style="padding: 15px; color: #fff; font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${faviconUrl}" alt="${account.name}" style="
                            width: 32px;
                            height: 32px;
                            border-radius: 6px;
                            border: 1px solid #444;
                        " onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNiIgZmlsbD0iIzMzMyIvPgo8cGF0aCBkPSJNOCAxMkgxNlYyMEg4VjEyWiIgZmlsbD0iIzY2NiIvPgo8L3N2Zz4K'">
                        <div>
                            <div style="font-weight: 600; font-size: 16px;">${account.name}</div>
                            <div style="font-size: 12px; color: #999;">${account.website || 'No website'}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 15px; color: #ccc;">${account.industry || 'N/A'}</td>
                <td style="padding: 15px; color: #ccc;">${account.phone || 'N/A'}</td>
                <td style="padding: 15px; color: #ccc;">${account.city && account.state ? `${account.city}, ${account.state}` : 'N/A'}</td>
                <td style="padding: 15px;">
                    <div style="display: flex; gap: 8px;">
                        <button onclick="CRMApp.showAccountDetails('${account.id}')" style="
                            background: #007bff;
                            border: none;
                            color: white;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: background-color 0.2s ease;
                        " onmouseover="this.style.backgroundColor='#0056b3'" 
                           onmouseout="this.style.backgroundColor='#007bff'">
                            View
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    },

    // Extract domain from account name for favicon
    extractDomainFromAccountName(accountName) {
        if (!accountName) return 'example.com';
        
        // Remove common business suffixes and clean the name
        let domain = accountName.toLowerCase()
            .replace(/\s+(inc|llc|corp|corporation|company|co|ltd|limited)\.?$/i, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '')
            .trim();
        
        // If it's too short or empty, use the original name
        if (domain.length < 2) {
            domain = accountName.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
        
        return domain + '.com';
    },

    // Show individual account details page
    showAccountDetails(accountId) {
        const account = this.accounts.find(a => a.id === accountId);
        if (!account) {
            console.error('Account not found:', accountId);
            return;
        }
        
        console.log('Showing account details for:', account);
        this.showNotification(`Viewing details for ${account.name}`, 'info');
        
        // For now, just show a notification. You can implement a detailed view later
    },

    // Clear accounts filters
    clearAccountsFilters() {
        const searchInput = document.getElementById('account-search');
        const industryFilter = document.getElementById('industry-filter');
        
        if (searchInput) searchInput.value = '';
        if (industryFilter) industryFilter.value = '';
        
        this.renderSimpleAccountsTable();
    }
});
