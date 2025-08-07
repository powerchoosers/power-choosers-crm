// Power Choosers CRM Dashboard - Main JavaScript File (UPDATED)
// This file contains the complete application logic for the redesigned Power Choosers CRM.
// Updated with white SVG activity icons for better theme consistency
// Added Call Scripts button functionality
// Integrated Cold Calling Hub with auto-population and Firebase updates

// --- 1. Firebase Configuration & Initialization ---
// Use the firebaseConfig, app, db, and serverTimestamp from firebase-config.js
// (No need to redeclare here)


// --- 2. Global Application State and Data ---
const CRMApp = {
    accounts: [],
    contacts: [],
    activities: [],
    tasks: [],
    notifications: [],
    currentView: 'dashboard-view',
    currentContact: null,
    currentAccount: null,
    
    // State for the activity carousel
    activitiesPageIndex: 0,
    activitiesPerPage: 4,

    // Application initialization
    async init() {
        try {
            await this.loadInitialData();
            this.setupEventListeners();
            this.showView('dashboard-view');
            this.updateNotifications();
            console.log('CRM App initialized successfully');
        } catch (error) {
            console.error('Error initializing CRM App:', error);
            this.showToast('Failed to initialize application', 'error');
        }
    },

    // Load initial data from Firestore
    async loadInitialData() {
        try {
            const [accountsSnapshot, contactsSnapshot, activitiesSnapshot] = await Promise.all([
                db.collection('accounts').get(),
                db.collection('contacts').get(),
                db.collection('activities').orderBy('createdAt', 'desc').limit(50).get()
            ]);
            
            this.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.contacts = contactsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.activities = activitiesSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date() 
            }));
            
            console.log('Initial data loaded:', {
                accounts: this.accounts.length,
                contacts: this.contacts.length,
                activities: this.activities.length
            });
            
            return true;
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showToast('Failed to load data. Using sample data.', 'warning');
            return this.loadSampleData();
        }
    },

    // Load sample data if Firebase fails
    loadSampleData() {
        console.log('Loading sample data...');
        this.accounts = [
            { id: 'acc1', name: 'ABC Manufacturing', phone: '(214) 555-0123', city: 'Dallas', state: 'TX', industry: 'Manufacturing', createdAt: new Date() },
            { id: 'acc2', name: 'XYZ Energy Solutions', phone: '(972) 555-0456', city: 'Plano', state: 'TX', industry: 'Energy', createdAt: new Date() }
        ];
        this.contacts = [
            { id: 'con1', firstName: 'John', lastName: 'Smith', title: 'CEO', accountId: 'acc1', accountName: 'ABC Manufacturing', email: 'john@abcmfg.com', phone: '(214) 555-0123', createdAt: new Date() },
            { id: 'con2', firstName: 'Sarah', lastName: 'Johnson', title: 'CFO', accountId: 'acc1', accountName: 'ABC Manufacturing', email: 'sarah@abcmfg.com', phone: '(214) 555-0124', createdAt: new Date() },
            { id: 'con3', firstName: 'Mike', lastName: 'Davis', title: 'Operations Manager', accountId: 'acc2', accountName: 'XYZ Energy Solutions', email: 'mike@xyzenergy.com', phone: '(972) 555-0456', createdAt: new Date() }
        ];
        this.activities = [
            { id: 'act1', type: 'call_note', description: 'Call with John Smith - Q1 Energy Contract', noteContent: 'Discussed renewal options', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            { id: 'act2', type: 'email', description: 'Sent energy analysis to Sarah Johnson', contactId: 'con2', contactName: 'Sarah Johnson', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
            { id: 'act3', type: 'call_note', description: 'Follow-up with Mike Davis - Multi-site proposal', noteContent: 'Reviewing proposal details', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
            { id: 'act4', type: 'note', description: 'Added a note for John Smith', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
            { id: 'act5', type: 'email', description: 'Sent follow up email to Mike Davis', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
            { id: 'act6', type: 'call_note', description: 'Call with new prospect', noteContent: 'No answer', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
            { id: 'act7', type: 'note', description: 'Reviewed account status for ABC Manufacturing', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            { id: 'act8', type: 'call_note', description: 'Final call with Sarah Johnson', noteContent: 'Call ended with a successful contract', contactId: 'con2', contactName: 'Sarah Johnson', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
            { id: 'act9', type: 'call_note', description: 'Intro call with XYZ Energy', noteContent: 'Introduced services to Mike Davis', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) },
        ];
        this.tasks = [
            { id: 't1', title: 'Follow up with John Smith - Q1 Energy Contract', time: '3:00 PM', contactId: 'con1', dueDate: new Date(Date.now() - 1000), completed: false },
            { id: 't2', title: 'Prepare energy analysis for Sarah Johnson', time: '3:30 PM', contactId: 'con2', dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), completed: false },
            { id: 't3', title: 'Review Mike Davis multi-site proposal', time: '9:00 AM', contactId: 'con3', dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), completed: false }
        ];
        return true;
    },

    // Setup event listeners
    setupEventListeners() {
        // Navigation links
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                const viewName = e.currentTarget.getAttribute('data-view');
                // If it's a view-switching link, prevent default and switch view
                if (viewName) {
                    e.preventDefault();
                    this.showView(viewName);
                    this.updateActiveNavButton(e.currentTarget);
                }
                // If no data-view attribute, the default link behavior will execute.
            });
        });

        // Search functionality
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                this.handleSearch(e.target.value);
            }, 300));
        }

        // Notification button
        const notificationBtn = document.getElementById('notification-btn');
        const notificationDropdown = document.getElementById('notification-dropdown');
        if (notificationBtn && notificationDropdown) {
            notificationBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notificationDropdown.classList.toggle('active');
            });
            
            document.addEventListener('click', (e) => {
                if (!notificationDropdown.contains(e.target) && notificationDropdown.classList.contains('active')) {
                    notificationDropdown.classList.remove('active');
                }
            });
        }

        // Call Scripts button
        const callScriptsBtn = document.getElementById('call-scripts-btn');
        if (callScriptsBtn) {
            callScriptsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showCallScriptsView(); // Directly call the function to show the view
            });
        }
        
        // Activity carousel navigation buttons
        const activityPrevBtn = document.getElementById('activity-prev-btn');
        const activityNextBtn = document.getElementById('activity-next-btn');
        if (activityPrevBtn) {
            activityPrevBtn.addEventListener('click', () => this.scrollActivityCarousel('prev'));
        }
        if (activityNextBtn) {
            activityNextBtn.addEventListener('click', () => this.scrollActivityCarousel('next'));
        }

        this.setupModalHandlers();

        window.addAccount = () => this.addAccount();
        window.addContact = () => this.addContact();
        window.bulkImport = () => this.bulkImport();
        window.closeModal = (modalId) => this.closeModal(modalId);
    },

    // Setup modal event handlers
    setupModalHandlers() {
        const addAccountForm = document.getElementById('add-account-form');
        if (addAccountForm) {
            addAccountForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAddAccount(e);
            });
        }

        const addContactForm = document.getElementById('add-contact-form');
        if (addContactForm) {
            addContactForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAddContact(e);
            });
        }

        const bulkImportForm = document.getElementById('bulk-import-form');
        if (bulkImportForm) {
            bulkImportForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleBulkImport(e);
            });
        }
    },

    // Show/hide views in the single-page application
    showView(viewName) {
        // Special: Contacts view
        if (viewName === 'contacts-view') {
            this.renderContactsPage();
        }
        console.log(`Switching to view: ${viewName}`);
        this.currentView = viewName;
        
        // Hide all main content views with explicit display none
        document.querySelectorAll('.page-view').forEach(view => {
            view.style.display = 'none';
            view.style.visibility = 'hidden';
            view.style.position = 'absolute';
            view.style.left = '-9999px';
        });
        
        // Hide both widget containers
        const crmWidgetsContainer = document.getElementById('crm-widgets-container');
        const coldCallingWidgetsContainer = document.getElementById('cold-calling-widgets-container');
        const mainContentWrapper = document.getElementById('main-content-wrapper');
        const widgetPanel = document.getElementById('widget-panel');
        
        if (crmWidgetsContainer) crmWidgetsContainer.style.display = 'none';
        if (coldCallingWidgetsContainer) coldCallingWidgetsContainer.style.display = 'none';
        
        // Reset flex properties to default dashboard ratios
        if (mainContentWrapper) mainContentWrapper.style.flex = '3';
        if (widgetPanel) widgetPanel.style.flex = '1';
        
        // Show the requested view
        const activeView = document.getElementById(viewName);
        if (activeView) {
            // Reset positioning for active view
            activeView.style.position = 'relative';
            activeView.style.left = 'auto';
            activeView.style.visibility = 'visible';
            
            if (viewName === 'call-scripts-view') {
                // Call Scripts View - Use same layout as dashboard
                console.log('Activating call scripts view');
                activeView.style.display = 'flex';
                if (coldCallingWidgetsContainer) {
                    coldCallingWidgetsContainer.style.display = 'flex';
                    console.log('Showing cold calling widgets');
                }
                // Keep the same flex ratio as dashboard for consistent layout
                if (mainContentWrapper) mainContentWrapper.style.flex = '3';
            } else {
                // All other CRM views - Standard Layout
                console.log('Activating standard CRM view');
                activeView.style.display = (viewName === 'dashboard-view') ? 'flex' : 'block';
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                    console.log('Showing CRM widgets');
                }
            }
        }
        
        if (viewName === 'dashboard-view') {
            this.renderDashboard();
        } else {
            console.log(`Mapped to: ${viewName}`);
        }
    },

    // Update the active state of navigation buttons
    updateActiveNavButton(activeNav) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        // If the clicked item is the Call Scripts button (which is not a nav-item in the sidebar)
        // ensure the dashboard nav item remains active if we're just switching content within the main area
        if (activeNav.id === 'call-scripts-btn') {
            document.querySelector('.nav-item[data-view="dashboard-view"]').classList.add('active');
        } else {
            activeNav.classList.add('active');
        }
    },

    // Render the contacts page using class-based HTML for maintainability
    renderContactsPage() {
        console.log("renderContactsPage called");
        const contactsView = document.getElementById('contacts-view');
        if (!contactsView) {
            console.log("contactsView not found, returning");
            return;
        }
        if (contactsView.getAttribute('data-loaded') === 'true') {
            console.log("contacts already loaded, returning");
            return;
        }

        console.log("Creating contacts HTML with classes");
        // Move layout classes to contacts-view element
        contactsView.classList.add('contacts-container');
        const contactsHTML = `
            <div class="contacts-header">
                <h2 class="contacts-title">All Contacts</h2>
            </div>
            <div class="contacts-content">
                <!-- Filters Sidebar -->
                <div class="filters-sidebar">
                    <h3 class="filters-title">Filters</h3>
                    <div class="filter-group">
                        <label class="filter-label">Search</label>
                        <input type="text" id="contact-search-simple" placeholder="Search contacts..." class="filter-input">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">Account</label>
                        <select id="account-filter-simple" class="filter-input">
                            <option value="">All Accounts</option>
                        </select>
                    </div>
                    <button onclick="CRMApp.clearContactsFilters()" class="btn btn-clear-filters">Clear Filters</button>
                </div>
                <!-- Contacts Table -->
                <div class="contacts-table-section">
                    <div id="contacts-count-simple" class="contacts-count">Loading contacts...</div>
                    <div id="contacts-table-container" class="contacts-table-wrapper">
                        <table class="contacts-table">
                            <thead>
                                <tr class="table-header-row">
                                    <th class="table-header-cell">Name</th>
                                    <th class="table-header-cell">Email</th>
                                    <th class="table-header-cell">Company</th>
                                    <th class="table-header-cell">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="contacts-table-body-simple"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        contactsView.innerHTML = contactsHTML;
        contactsView.setAttribute('data-loaded', 'true');
        console.log("Contacts HTML created and injected");

        // Force remove all inline styles and ensure CSS takes effect
        contactsView.removeAttribute('style');
        contactsView.style.cssText = 'display: block !important;';
        
        // Force a reflow to ensure styles are applied
        setTimeout(() => {
            contactsView.style.cssText = 'display: block !important;';
        }, 10);

        // Initialize the simple contacts functionality
        this.initSimpleContactsUI();
        console.log("Simple contacts UI initialized");
    },

    // Initialize simple contacts UI with basic functionality
    initSimpleContactsUI() {
        console.log("Initializing simple contacts UI");
        
        // Populate contacts table
        this.renderSimpleContactsTable();
        
        // Set up search functionality
        const searchInput = document.getElementById('contact-search-simple');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.renderSimpleContactsTable(searchInput.value);
            });
        }
        
        // Set up account filter
        this.populateSimpleAccountFilter();
        const accountFilter = document.getElementById('account-filter-simple');
        if (accountFilter) {
            accountFilter.addEventListener('change', () => {
                this.renderSimpleContactsTable();
            });
        }
    },
    
    // Render the contacts table with optional search filter
    renderSimpleContactsTable(searchTerm = '') {
        console.log("Rendering simple contacts table, search:", searchTerm);
        
        const tableBody = document.getElementById('contacts-table-body-simple');
        const contactsCount = document.getElementById('contacts-count-simple');
        const accountFilter = document.getElementById('account-filter-simple');
        
        if (!tableBody || !contactsCount) {
            console.log("Table elements not found");
            return;
        }
        
        // Filter contacts
        let filteredContacts = this.contacts || [];
        
        if (searchTerm) {
            filteredContacts = filteredContacts.filter(contact => 
                (contact.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (contact.lastName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (contact.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (contact.company || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        if (accountFilter && accountFilter.value) {
            filteredContacts = filteredContacts.filter(contact => 
                contact.company === accountFilter.value
            );
        }
        
        // Update count
        contactsCount.textContent = `${filteredContacts.length} contacts`;
        
        // Render table rows
        if (filteredContacts.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #888;">No contacts found</td></tr>';
        } else {
            tableBody.innerHTML = filteredContacts.map(contact => `
                <tr style="border-bottom: 1px solid #555;">
                    <td style="padding: 12px; color: #fff;">${(contact.firstName || '') + ' ' + (contact.lastName || '')}</td>
                    <td style="padding: 12px; color: #fff;">${contact.email || 'N/A'}</td>
                    <td style="padding: 12px; color: #fff;">${contact.company || 'N/A'}</td>
                    <td style="padding: 12px;">
                        <button onclick="alert('Call ${contact.firstName}')" style="margin-right: 5px; padding: 4px 8px; background: #28a745; color: #fff; border: none; border-radius: 3px; font-size: 12px;">Call</button>
                        <button onclick="alert('Email ${contact.email}')" style="margin-right: 5px; padding: 4px 8px; background: #007bff; color: #fff; border: none; border-radius: 3px; font-size: 12px;">Email</button>
                    </td>
                </tr>
            `).join('');
        }
        
        console.log(`Rendered ${filteredContacts.length} contacts`);
    },
    
    // Populate account filter dropdown
    populateSimpleAccountFilter() {
        const accountFilter = document.getElementById('account-filter-simple');
        if (!accountFilter) return;
        
        const companies = [...new Set((this.contacts || []).map(c => c.company).filter(Boolean))];
        
        accountFilter.innerHTML = '<option value="">All Accounts</option>' + 
            companies.map(company => `<option value="${company}">${company}</option>`).join('');
    },
    
    // Clear all filters
    clearContactsFilters() {
        const searchInput = document.getElementById('contact-search-simple');
        const accountFilter = document.getElementById('account-filter-simple');
        
        if (searchInput) searchInput.value = '';
        if (accountFilter) accountFilter.value = '';
        
        this.renderSimpleContactsTable();
    },
    
    // Initialize contacts UI, filtering, and Firebase data (LEGACY - keeping for compatibility)
    initContactsUI() {
        const contactsTableBody = document.getElementById('contacts-table-body');
        const resultsInfo = document.getElementById('results-info');
        const contactsCount = document.getElementById('contacts-count');
        const paginationInfo = document.getElementById('pagination-info');
        const accountFilter = document.getElementById('account-filter');
        const titleFilter = document.getElementById('title-filter');
        const locationFilter = document.getElementById('location-filter');
        const industryFilter = document.getElementById('industry-filter');
        const dateFilter = document.getElementById('date-filter');
        const searchInput = document.getElementById('contact-search');
        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        const prevPageBtn = document.getElementById('prev-page-btn');
        const nextPageBtn = document.getElementById('next-page-btn');
        const paginationNumbers = document.getElementById('pagination-numbers');
        // State
        let filteredContacts = [...this.contacts];
        let currentPage = 1;
        let pageSize = 50;
        // Populate filter options
        this.populateContactsFilters(accountFilter, titleFilter, locationFilter, industryFilter);
        // Filtering logic
        function applyFilters() {
            let filtered = [...CRMApp.contacts];
            // Account
            if (accountFilter.value) filtered = filtered.filter(c => c.accountName === accountFilter.value);
            // Title
            if (titleFilter.value) filtered = filtered.filter(c => c.title === titleFilter.value);
            // Location
            if (locationFilter.value) filtered = filtered.filter(c => [c.city, c.state].join(', ').includes(locationFilter.value));
            // Industry
            if (industryFilter.value) filtered = filtered.filter(c => c.industry === industryFilter.value);
            // Date
            if (dateFilter.value) {
                const now = new Date();
                filtered = filtered.filter(c => {
                    if (!c.createdAt) return false;
                    let created = c.createdAt instanceof Date ? c.createdAt : c.createdAt.toDate();
                    if (dateFilter.value === 'today') {
                        return created.toDateString() === now.toDateString();
                    } else if (dateFilter.value === 'week') {
                        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
                        return created >= weekAgo;
                    } else if (dateFilter.value === 'month') {
                        const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
                        return created >= monthAgo;
                    } else if (dateFilter.value === 'quarter') {
                        const quarterAgo = new Date(now); quarterAgo.setMonth(now.getMonth() - 3);
                        return created >= quarterAgo;
                    }
                    return true;
                });
            }
            // Search
            if (searchInput.value) {
                const q = searchInput.value.toLowerCase();
                filtered = filtered.filter(c =>
                    [c.firstName, c.lastName, c.email, c.accountName, c.title, c.phone].some(f => f && f.toLowerCase().includes(q))
                );
            }
            filteredContacts = filtered;
            currentPage = 1;
            renderTable();
        }
        // Populate filters
        [accountFilter, titleFilter, locationFilter, industryFilter, dateFilter].forEach(f => f && f.addEventListener('change', applyFilters));
        searchInput && searchInput.addEventListener('input', CRMApp.debounce(applyFilters, 300));
        clearFiltersBtn && clearFiltersBtn.addEventListener('click', () => {
            [accountFilter, titleFilter, locationFilter, industryFilter, dateFilter].forEach(f => f && (f.value = ''));
            searchInput.value = '';
            applyFilters();
        });
        // Pagination
        prevPageBtn && prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); }});
        nextPageBtn && nextPageBtn.addEventListener('click', () => { if (currentPage < Math.ceil(filteredContacts.length / pageSize)) { currentPage++; renderTable(); }});
        // Render table
        function renderTable() {
            // Pagination
            let start = (currentPage - 1) * pageSize;
            let end = start + pageSize;
            let pageContacts = filteredContacts.slice(start, end);
            // Update info
            resultsInfo.textContent = `Showing ${pageContacts.length} of ${filteredContacts.length} contacts`;
            contactsCount.textContent = `${filteredContacts.length} contacts`;
            paginationInfo.textContent = `Showing ${start + 1}-${Math.min(end, filteredContacts.length)} of ${filteredContacts.length} contacts`;
            // Pagination numbers
            paginationNumbers.innerHTML = '';
            let totalPages = Math.ceil(filteredContacts.length / pageSize);
            for (let i = 1; i <= totalPages; i++) {
                let btn = document.createElement('button');
                btn.textContent = i;
                btn.className = (i === currentPage) ? 'active' : '';
                btn.onclick = () => { currentPage = i; renderTable(); };
                paginationNumbers.appendChild(btn);
            }
            prevPageBtn.disabled = currentPage === 1;
            nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
            // Render rows
            contactsTableBody.innerHTML = '';
            if (pageContacts.length === 0) {
                contactsTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No contacts found.</td></tr>';
                return;
            }
            for (let c of pageContacts) {
                let tr = document.createElement('tr');
                // Checkbox
                let tdCheck = document.createElement('td');
                tdCheck.className = 'checkbox-column';
                tdCheck.innerHTML = `<input type="checkbox" data-id="${c.id}">`;
                tr.appendChild(tdCheck);
                // Name with profile image
                let tdName = document.createElement('td');
                tdName.innerHTML = `<img src="https://www.gravatar.com/avatar/${CRMApp.md5(c.email || '')}?s=32&d=identicon" class="profile-pic" style="border-radius:50%;width:32px;height:32px;margin-right:8px;vertical-align:middle;"> ${c.firstName || ''} ${c.lastName || ''}`;
                tr.appendChild(tdName);
                // Title
                let tdTitle = document.createElement('td');
                tdTitle.textContent = c.title || '';
                tr.appendChild(tdTitle);
                // Account with favicon
                let tdAccount = document.createElement('td');
                tdAccount.innerHTML = `<img src="https://www.google.com/s2/favicons?domain=${(c.email || '').split('@')[1] || ''}" class="company-favicon" style="width:20px;height:20px;margin-right:7px;vertical-align:middle;"> ${c.accountName || ''}`;
                tr.appendChild(tdAccount);
                // Email
                let tdEmail = document.createElement('td');
                tdEmail.textContent = c.email || '';
                tr.appendChild(tdEmail);
                // Phone
                let tdPhone = document.createElement('td');
                tdPhone.textContent = c.phone || '';
                tr.appendChild(tdPhone);
                // Location
                let tdLoc = document.createElement('td');
                tdLoc.textContent = [c.city, c.state].filter(Boolean).join(', ');
                tr.appendChild(tdLoc);
                // Created
                let tdCreated = document.createElement('td');
                tdCreated.textContent = CRMApp.formatDate(c.createdAt);
                tr.appendChild(tdCreated);
                // Actions
                let tdActions = document.createElement('td');
                tdActions.className = 'actions-column';
                tdActions.innerHTML = `
                    <button class="action-btn" title="Call" onclick="CRMApp.callContact('${c.id}')"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92V21a2 2 0 0 1-2.18 2A19.72 19.72 0 0 1 3 5.18 2 2 0 0 1 5 3h4.09a2 2 0 0 1 2 1.72c.13.81.37 1.6.72 2.34a2 2 0 0 1-.45 2.11l-1.27 1.27a16 16 0 0 0 6.29 6.29l1.27-1.27a2 2 0 0 1 2.11-.45c.74.35 1.53.59 2.34.72A2 2 0 0 1 21 18.91V21z"></path></svg></button>
                    <button class="action-btn" title="Email" onclick="CRMApp.emailContact('${c.id}')"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><polyline points="16 3 12 7 8 3"></polyline></svg></button>
                    <button class="action-btn" title="Add to Sequence" onclick="CRMApp.addToSequence('${c.id}')"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></button>
                `;
                tr.appendChild(tdActions);
                contactsTableBody.appendChild(tr);
            }
        }
        // Initial render
        applyFilters();
    },

    // Populate filter dropdowns for contacts
    populateContactsFilters(accountFilter, titleFilter, locationFilter, industryFilter) {
        // Account
        let accounts = Array.from(new Set(this.contacts.map(c => c.accountName))).filter(Boolean);
        accountFilter.innerHTML = '<option value="">All Accounts</option>' + accounts.map(a => `<option value="${a}">${a}</option>`).join('');
        // Title
        let titles = Array.from(new Set(this.contacts.map(c => c.title))).filter(Boolean);
        titleFilter.innerHTML = '<option value="">All Titles</option>' + titles.map(t => `<option value="${t}">${t}</option>`).join('');
        // Location
        let locations = Array.from(new Set(this.contacts.map(c => [c.city, c.state].filter(Boolean).join(', ')))).filter(Boolean);
        locationFilter.innerHTML = '<option value="">All Locations</option>' + locations.map(l => `<option value="${l}">${l}</option>`).join('');
        // Industry
        let industries = Array.from(new Set(this.contacts.map(c => c.industry))).filter(Boolean);
        industryFilter.innerHTML = '<option value="">All Industries</option>' + industries.map(i => `<option value="${i}">${i}</option>`).join('');
    },

    // Utility for gravatar hash
    md5(str) {
        // Simple MD5 for gravatar (use a library in production)
        function L(k, d) { return (k << d) | (k >>> (32 - d)); }
        function K(G, k) { let I, d, F, H, x; F = (G & 2147483648); H = (k & 2147483648); I = (G & 1073741824); d = (k & 1073741824); x = (G & 1073741823) + (k & 1073741823); if (I & d) return (x ^ 2147483648 ^ F ^ H); if (I | d) { if (x & 1073741824) return (x ^ 3221225472 ^ F ^ H); else return (x ^ 1073741824 ^ F ^ H); } else { return (x ^ F ^ H); } }
        function r(d, F, k) { return (d & F) | (~d & k); }
        function q(d, F, k) { return (d & k) | (F & ~k); }
        function p(d, F, k) { return d ^ F ^ k; }
        function n(d, F, k) { return F ^ (d | ~k); }
        function u(G, F, aa, Z, k, H, I) { G = K(G, K(K(r(F, aa, Z), k), I)); return K(L(G, H), F); }
        function f(G, F, aa, Z, k, H, I) { G = K(G, K(K(q(F, aa, Z), k), I)); return K(L(G, H), F); }
        function D(G, F, aa, Z, k, H, I) { G = K(G, K(K(p(F, aa, Z), k), I)); return K(L(G, H), F); }
        function t(G, F, aa, Z, k, H, I) { G = K(G, K(K(n(F, aa, Z), k), I)); return K(L(G, H), F); }
        function e(G) { let Z, F = G.length, x = F + 8, k = (x - (x % 64)) / 64, I = 16 * (k + 1), aa = Array(I - 1), d = 0, H = 0; while (H < F) { Z = (H - (H % 4)) / 4; d = (H % 4) * 8; aa[Z] = (aa[Z] | (G.charCodeAt(H) << d)); H++; } Z = (H - (H % 4)) / 4; d = (H % 4) * 8; aa[Z] = aa[Z] | (128 << d); aa[I - 2] = F << 3; aa[I - 1] = F >>> 29; return aa; }
        function B(x) { let k = '', F = '', G, d; for (d = 0; d <= 3; d++) { G = (x >>> (d * 8)) & 255; F = '0' + G.toString(16); k += F.substr(F.length - 2, 2); } return k; }
        function J(k) { k = k.replace(/\r\n/g, '\n'); let d = ''; for (let F = 0; F < k.length; F++) { let G = k.charCodeAt(F); if (G < 128) { d += String.fromCharCode(G); } else if ((G > 127) && (G < 2048)) { d += String.fromCharCode((G >> 6) | 192); d += String.fromCharCode((G & 63) | 128); } else { d += String.fromCharCode((G >> 12) | 224); d += String.fromCharCode(((G >> 6) & 63) | 128); d += String.fromCharCode((G & 63) | 128); } } return d; }
        let C = Array(); let P, h, E, v, g, Y, X, W, V; let S = 7, Q = 12, N = 17, M = 22, A = 5, z = 9, y = 14, w = 20, o = 4, m = 11, l = 16, j = 23, U = 6, T = 10, R = 15, O = 21; str = J(str); C = e(str); Y = 1732584193; X = 4023233417; W = 2562383102; V = 271733878; for (P = 0; P < C.length; P += 16) { h = Y; E = X; v = W; g = V; Y = u(Y, X, W, V, C[P + 0], S, 3614090360); V = u(V, Y, X, W, C[P + 1], Q, 3905402710); W = u(W, V, Y, X, C[P + 2], N, 606105819); X = u(X, W, V, Y, C[P + 3], M, 3250441966); Y = u(Y, X, W, V, C[P + 4], A, 4118548399); V = u(V, Y, X, W, C[P + 5], z, 1200080426); W = u(W, V, Y, X, C[P + 6], y, 2821735955); X = u(X, W, V, Y, C[P + 7], w, 4249261313); Y = u(Y, X, W, V, C[P + 8], S, 1770035416); V = u(V, Y, X, W, C[P + 9], Q, 2336552879); W = u(W, V, Y, X, C[P + 10], N, 4294925233); X = u(X, W, V, Y, C[P + 11], M, 2304563134); Y = u(Y, X, W, V, C[P + 12], A, 1804603682); V = u(V, Y, X, W, C[P + 13], z, 4254626195); W = u(W, V, Y, X, C[P + 14], y, 2792965006); X = u(X, W, V, Y, C[P + 15], w, 1236535329); Y = f(Y, X, W, V, C[P + 1], o, 4129170786); V = f(V, Y, X, W, C[P + 6], m, 3225465664); W = f(W, V, Y, X, C[P + 11], l, 643717713);
        X = f(X, W, V, Y, C[P + 0], j, 3921069994); Y = f(Y, X, W, V, C[P + 5], U, 3593408605); V = f(V, Y, X, W, C[P + 10], T, 38016083); W = f(W, V, Y, X, C[P + 15], R, 3634488961); X = f(X, W, V, Y, C[P + 4], o, 3889429448); Y = f(Y, X, W, V, C[P + 9], m, 568446438); V = f(V, Y, X, W, C[P + 14], l, 3275163606); W = f(W, V, Y, X, C[P + 3], j, 4107603335); X = f(X, W, V, Y, C[P + 8], U, 1163531501); Y = D(Y, X, W, V, C[P + 6], o, 2850285829); V = D(V, Y, X, W, C[P + 11], m, 4243563512); W = D(W, V, Y, X, C[P + 0], l, 1735328473); X = D(X, W, V, Y, C[P + 5], j, 2368359562); Y = D(Y, X, W, V, C[P + 10], U, 4294588738); V = D(V, Y, X, W, C[P + 15], T, 2272392833); W = D(W, V, Y, X, C[P + 4], R, 1839030562); X = D(X, W, V, Y, C[P + 13], o, 4259657749); Y = t(Y, X, W, V, C[P + 8], m, 2763975236); V = t(V, Y, X, W, C[P + 3], l, 1272893353); W = t(W, V, Y, X, C[P + 10], j, 4139469664); X = t(X, W, V, Y, C[P + 1], U, 3200235594); Y = t(Y, X, W, V, C[P + 6], T, 681279174); V = t(V, Y, X, W, C[P + 11], R, 3936430074); W = t(W, V, Y, X, C[P + 0], o, 3572445317); X = t(X, W, V, Y, C[P + 5], m, 76029189); Y = t(Y, X, W, V, C[P + 12], l, 3654602809); V = t(V, Y, X, W, C[P + 3], j, 3873151461); W = t(W, V, Y, X, C[P + 10], o, 530742520); X = t(X, W, V, Y, C[P + 15], m, 3299628640); Y = K(Y, h); X = K(X, E); W = K(W, v); V = K(V, g); } var i = B(Y) + B(X) + B(W) + B(V); return i.toLowerCase();
    },

    // Call, email, sequence actions (stub)
    callContact(id) { alert('Call contact ' + id); },
    emailContact(id) { alert('Email contact ' + id); },
    addToSequence(id) { alert('Add to sequence ' + id); },

// Main dashboard rendering function
    renderDashboard() {
        this.renderDashboardStats();
        this.renderTodayTasks();
        this.renderActivityCarousel();
        this.renderEnergyMarketNews();
    },

    // Render dashboard statistics cards
    renderDashboardStats() {
        const totalAccounts = this.accounts.length;
        const totalContacts = this.contacts.length;
        const recentActivities = this.activities.length;
        const hotLeads = this.contacts.filter(c => c.isHotLead).length;

        this.updateElement('total-accounts-value', totalAccounts);
        this.updateElement('total-contacts-value', totalContacts);
        this.updateElement('recent-activities-value', recentActivities);
        this.updateElement('hot-leads-value', hotLeads);
    },

    // Render today's tasks in the sidebar
    renderTodayTasks() {
        const tasksList = document.getElementById('tasks-list');
        if (!tasksList) return;
        
        tasksList.innerHTML = '';
        
        const today = new Date();
        const todaysTasks = this.tasks.filter(task => !task.completed && new Date(task.dueDate).toDateString() === today.toDateString());
        
        if (todaysTasks.length > 0) {
            todaysTasks.forEach(task => {
                const li = document.createElement('li');
                li.className = 'task-item';
                li.innerHTML = `
                    <div class="task-content">
                        <p class="task-title">${task.title}</p>
                        <p class="task-due-time">Due: ${task.time}</p>
                    </div>
                `;
                tasksList.appendChild(li);
            });
        } else {
            tasksList.innerHTML = '<li class="no-items">No tasks for today!</li>';
        }
    },

    // Renders the recent activities carousel
    renderActivityCarousel() {
        const carouselWrapper = document.getElementById('activity-list-wrapper');
        const prevBtn = document.getElementById('activity-prev-btn');
        const nextBtn = document.getElementById('activity-next-btn');

        if (!carouselWrapper) return;
        
        // Sort activities by date (most recent first)
        const sortedActivities = this.activities.sort((a, b) => b.createdAt - a.createdAt);
        const totalPages = Math.ceil(sortedActivities.length / this.activitiesPerPage);

        // Clear existing content
        carouselWrapper.innerHTML = '';

        if (sortedActivities.length === 0) {
            carouselWrapper.innerHTML = '<div class="no-items">No recent activity.</div>';
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            return;
        } else {
            prevBtn.style.display = 'block';
            nextBtn.style.display = 'block';
        }
        
        // Render each page of activities
        for (let i = 0; i < totalPages; i++) {
            const page = document.createElement('div');
            page.className = 'activity-page';
            
            const startIndex = i * this.activitiesPerPage;
            const endIndex = startIndex + this.activitiesPerPage;
            const pageActivities = sortedActivities.slice(startIndex, endIndex);

            pageActivities.forEach(activity => {
                const item = document.createElement('div');
                item.className = 'activity-item';
                item.innerHTML = `
                    <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
                    <div class="activity-content">
                        <p class="activity-text">${activity.description}</p>
                        <span class="activity-timestamp">${this.formatDate(activity.createdAt)}</span>
                    </div>
                `;
                page.appendChild(item);
            });
            carouselWrapper.appendChild(page);
        }
        
        // Set the carousel to the current page and update buttons
        carouselWrapper.style.width = `${totalPages * 100}%`;
        carouselWrapper.style.transform = `translateX(-${this.activitiesPageIndex * (100 / totalPages)}%)`;
        this.updateActivityCarouselButtons(totalPages);
    },
    
    // Scrolls the activity carousel
    scrollActivityCarousel(direction) {
        const totalPages = Math.ceil(this.activities.length / this.activitiesPerPage);
        if (direction === 'next' && this.activitiesPageIndex < totalPages - 1) {
            this.activitiesPageIndex++;
        } else if (direction === 'prev' && this.activitiesPageIndex > 0) {
            this.activitiesPageIndex--;
        }
        this.renderActivityCarousel();
    },

    // Updates the state of the carousel navigation buttons
    updateActivityCarouselButtons(totalPages) {
        const prevBtn = document.getElementById('activity-prev-btn');
        const nextBtn = document.getElementById('activity-next-btn');
        if (prevBtn) prevBtn.disabled = this.activitiesPageIndex === 0;
        if (nextBtn) nextBtn.disabled = this.activitiesPageIndex >= totalPages - 1;
    },

    // Get activity icon based on type - Updated with white SVG icons
    getActivityIcon(type) {
        const icons = {
            'call_note': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>`,
            'email': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
            </svg>`,
            'note': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <line x1="10" y1="9" x2="8" y2="9"></line>
            </svg>`,
            'task_completed': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>`,
            'contact_added': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>`,
            'account_added': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 21h18"></path>
                <path d="M5 21V7l8-4v18"></path>
                <path d="M19 21V11l-6-4"></path>
            </svg>`,
            'bulk_import': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>`,
            'health_check_updated': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>`,
            'call_log_saved': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>`
        };
        return icons[type] || `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <line x1="10" y1="9" x2="8" y2="9"></line>
        </svg>`;
    },

    // Render energy market news feed
    renderEnergyMarketNews() {
        const newsFeed = document.getElementById('news-feed');
        if (!newsFeed) return;
        
        newsFeed.innerHTML = '';
        
        const newsItems = [
            { 
                title: 'ERCOT Demand Rises', 
                content: 'ERCOT demand is increasing due to summer heat, putting pressure on grid reliability.',
                time: '2 hours ago'
            },
            { 
                title: 'Natural Gas Prices Fluctuate', 
                content: 'Recent geopolitical events have caused volatility in natural gas prices, impacting futures.',
                time: '4 hours ago'
            },
            { 
                title: 'Renewable Energy Growth', 
                content: 'Texas continues to lead in renewable energy adoption with new wind and solar projects.',
                time: '6 hours ago'
            }
        ];
        
        if (newsItems.length > 0) {
            newsItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'news-item';
                div.innerHTML = `
                    <h4 class="news-title">${item.title}</h4>
                    <p class="news-content">${item.content}</p>
                    <span class="news-time">${item.time}</span>
                `;
                newsFeed.appendChild(div);
            });
        } else {
            newsFeed.innerHTML = '<p class="no-items">No news to display.</p>';
        }
    },

    // Handle search functionality
    handleSearch(query) {
        if (query.length < 2) return;
        
        const results = [];
        
        this.accounts.forEach(account => {
            if (account.name.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    type: 'account',
                    id: account.id,
                    name: account.name,
                    subtitle: account.industry || 'Account'
                });
            }
        });
        
        this.contacts.forEach(contact => {
            const fullName = `${contact.firstName} ${contact.lastName}`;
            if (fullName.toLowerCase().includes(query.toLowerCase()) || 
                (contact.email && contact.email.toLowerCase().includes(query.toLowerCase()))) {
                results.push({
                    type: 'contact',
                    id: contact.id,
                    name: fullName,
                    subtitle: contact.accountName || 'Contact'
                });
            }
        });
        
        console.log('Search results:', results);
    },

    // Quick action functions
    addAccount() {
        this.openModal('add-account-modal');
    },

    addContact() {
        const accountSelect = document.getElementById('contact-account');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">Select an account</option>';
            this.accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.name;
                accountSelect.appendChild(option);
            });
        }
        this.openModal('add-contact-modal');
    },

    bulkImport() {
        this.openModal('bulk-import-modal');
    },

    // Function to load and display the Call Scripts view
    async showCallScriptsView() {
        const callScriptsView = document.getElementById('call-scripts-view');
        const coldCallingWidgetsContainer = document.getElementById('cold-calling-widgets-container');
        
        if (!callScriptsView) {
            console.error('Call scripts view element not found.');
            this.showToast('Call scripts view not available.', 'error');
            return;
        }

        // Clear any existing content first
        callScriptsView.innerHTML = '';
        if (coldCallingWidgetsContainer) {
            coldCallingWidgetsContainer.innerHTML = '';
        }

        // Ensure the call scripts view is visible and other views are hidden
        this.showView('call-scripts-view'); 
        this.updateActiveNavButton(document.querySelector('.nav-item[data-view="dashboard-view"]'));

        try {
            // Fetch the content of call-scripts-content.html
            const response = await fetch('call-scripts-content.html');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const htmlContent = await response.text();
            
            // Parse the HTML to separate main content from sidebar widgets
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            // Extract main call scripts content (everything except the sidebar)
            const mainContent = doc.querySelector('.calls-hub-main');
            if (mainContent) {
                callScriptsView.innerHTML = mainContent.outerHTML;
            }
            
            // Extract sidebar widgets and inject into the cold calling widgets container
            const sidebarContent = doc.querySelector('.calls-hub-sidebar');
            if (sidebarContent && coldCallingWidgetsContainer) {
                coldCallingWidgetsContainer.innerHTML = sidebarContent.innerHTML;
            }

            // Initialize call scripts functionality
            this.initializeCallScripts();
            this.autoPopulateCallScripts();
            console.log('Call scripts content loaded and initialized.');
        } catch (error) {
            console.error('Error loading call scripts content:', error);
            this.showToast('Failed to load call scripts. Please check the file path or network.', 'error');
        }
    },

    // Auto-populate fields in the Call Scripts page
    autoPopulateCallScripts() {
        // Find a contact and their associated account to pre-populate
        let contactToPopulate = null;
        let accountToPopulate = null;

        // Try to find a contact with an associated account
        if (this.contacts.length > 0) {
            contactToPopulate = this.contacts[0]; // Take the first contact
            if (contactToPopulate.accountId) {
                accountToPopulate = this.accounts.find(acc => acc.id === contactToPopulate.accountId);
            }
        }
        // If no contact with account, just try to find any account
        if (!accountToPopulate && this.accounts.length > 0) {
            accountToPopulate = this.accounts[0];
        }

        // Populate Prospect Info fields
        const inputPhone = document.getElementById('input-phone');
        const inputCompanyName = document.getElementById('input-company-name');
        const inputName = document.getElementById('input-name');
        const inputTitle = document.getElementById('input-title');
        const inputCompanyIndustry = document.getElementById('input-company-industry');

        if (inputPhone && contactToPopulate) inputPhone.value = contactToPopulate.phone || '';
        if (inputCompanyName && accountToPopulate) inputCompanyName.value = accountToPopulate.name || '';
        if (inputName && contactToPopulate) inputName.value = `${contactToPopulate.firstName || ''} ${contactToPopulate.lastName || ''}`.trim();
        if (inputTitle && contactToPopulate) inputTitle.value = contactToPopulate.title || '';
        if (inputCompanyIndustry && accountToPopulate) inputCompanyIndustry.value = accountToPopulate.industry || '';

        // Populate Energy Health Check fields
        const currentSupplierInput = document.getElementById('currentSupplier');
        const monthlyBillInput = document.getElementById('monthlyBill');
        const currentRateInput = document.getElementById('currentRate');
        const contractEndDateInput = document.getElementById('contractEndDate');
        const sellRateInput = document.getElementById('sellRate');

        if (currentSupplierInput && accountToPopulate) currentSupplierInput.value = accountToPopulate.currentSupplier || '';
        if (monthlyBillInput && accountToPopulate) monthlyBillInput.value = accountToPopulate.monthlyBill || '';
        if (currentRateInput && accountToPopulate) currentRateInput.value = accountToPopulate.currentRate || '';
        if (contractEndDateInput && accountToPopulate) contractEndDateInput.value = accountToPopulate.contractEndDate || '';
        if (sellRateInput && accountToPopulate) sellRateInput.value = accountToPopulate.sellRate || '';

        // Trigger updateScript in the call scripts page to update placeholders
        if (typeof window.updateScript === 'function') {
            window.updateScript();
        }

        // If all Energy Health Check fields are known, run the report automatically
        const allHealthCheckFieldsKnown = 
            (currentSupplierInput && currentSupplierInput.value) &&
            (monthlyBillInput && monthlyBillInput.value) &&
            (currentRateInput && currentRateInput.value) &&
            (contractEndDateInput && contractEndDateInput.value) &&
            (sellRateInput && sellRateInput.value);

        if (allHealthCheckFieldsKnown && typeof window.runCalculation === 'function') {
            console.log("All health check fields populated, running calculation automatically.");
            window.validateSection1(); // Re-validate section 1 to ensure internal state is correct
            window.validateSection2(); // Re-validate section 2
            window.runCalculation();
        }
    },

    // Initialize call scripts functionality
    initializeCallScripts() {
        // Make call script functions globally available
        window.handleDialClick = this.handleDialClick.bind(this);
        window.selectResponse = this.selectResponse.bind(this);
        window.goBack = this.goBack.bind(this);
        window.restart = this.restart.bind(this);
        window.saveProspectAndNotes = this.saveProspectAndNotes.bind(this);
        window.clearNotes = this.clearNotes.bind(this);
        window.updateScript = this.updateScript.bind(this);
        
        // Initialize call script state
        this.callScriptState = {
            currentStep: 'start',
            history: [],
            currentDisposition: ''
        };
        
        // Initialize the script display
        this.updateScript();
    },

    // Handle dial button click
    handleDialClick() {
        const phoneInput = document.getElementById('input-phone');
        if (!phoneInput || !phoneInput.value.trim()) {
            this.showToast('Please enter a phone number to dial.', 'error');
            return;
        }
        
        const scriptDisplay = document.getElementById('script-display');
        const responsesContainer = document.getElementById('responses-container');
        
        if (scriptDisplay && responsesContainer) {
            scriptDisplay.innerHTML = 'Dialing... Ringing...';
            scriptDisplay.className = 'script-display mood-neutral ringing';
            
            // Simulate dialing delay
            setTimeout(() => {
                scriptDisplay.classList.remove('ringing');
                responsesContainer.innerHTML = `
                    <button class="response-btn" onclick="selectResponse('connected')">📞 Call Connected</button>
                    <button class="response-btn" onclick="selectResponse('voicemail')">📧 Voicemail</button>
                    <button class="response-btn" onclick="selectResponse('no-answer')">🚫 No Answer</button>
                `;
            }, 2000);
        }
    },

    // Handle response selection
    selectResponse(response) {
        const scriptDisplay = document.getElementById('script-display');
        const responsesContainer = document.getElementById('responses-container');
        
        if (!scriptDisplay || !responsesContainer) return;
        
        switch(response) {
            case 'connected':
                scriptDisplay.innerHTML = 'Great! You\'re connected. Begin your script...';
                responsesContainer.innerHTML = `
                    <button class="response-btn" onclick="selectResponse('interested')">✅ Interested</button>
                    <button class="response-btn" onclick="selectResponse('not-interested')">❌ Not Interested</button>
                    <button class="response-btn" onclick="selectResponse('callback')">📞 Callback</button>
                `;
                break;
            case 'voicemail':
                scriptDisplay.innerHTML = 'Leave a professional voicemail message.';
                this.callScriptState.currentDisposition = 'Left Voicemail';
                responsesContainer.innerHTML = `
                    <button class="response-btn" onclick="saveProspectAndNotes()">💾 Save & End Call</button>
                `;
                break;
            case 'no-answer':
                scriptDisplay.innerHTML = 'No answer. Try again later.';
                this.callScriptState.currentDisposition = 'No Answer';
                responsesContainer.innerHTML = `
                    <button class="response-btn" onclick="saveProspectAndNotes()">💾 Save & End Call</button>
                `;
                break;
            case 'interested':
                scriptDisplay.innerHTML = 'Excellent! Schedule a follow-up meeting.';
                this.callScriptState.currentDisposition = 'Interested - Meeting Scheduled';
                responsesContainer.innerHTML = `
                    <button class="response-btn" onclick="saveProspectAndNotes()">📅 Schedule Meeting</button>
                `;
                break;
            case 'not-interested':
                scriptDisplay.innerHTML = 'Thank them for their time and end professionally.';
                this.callScriptState.currentDisposition = 'Not Interested';
                responsesContainer.innerHTML = `
                    <button class="response-btn" onclick="saveProspectAndNotes()">💾 Save & End Call</button>
                `;
                break;
            case 'callback':
                scriptDisplay.innerHTML = 'Schedule a callback time.';
                this.callScriptState.currentDisposition = 'Callback Scheduled';
                responsesContainer.innerHTML = `
                    <button class="response-btn" onclick="saveProspectAndNotes()">📞 Schedule Callback</button>
                `;
                break;
        }
    },

    // Go back in call script
    goBack() {
        // Simple implementation - restart the call
        this.restart();
    },

    // Restart call script
    restart() {
        const scriptDisplay = document.getElementById('script-display');
        const responsesContainer = document.getElementById('responses-container');
        
        if (scriptDisplay && responsesContainer) {
            scriptDisplay.innerHTML = 'Click \'Dial\' to begin the call';
            scriptDisplay.className = 'script-display start';
            responsesContainer.innerHTML = `
                <button class="dial-button" onclick="handleDialClick()">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    Dial
                </button>
            `;
        }
        
        // Reset state
        this.callScriptState = {
            currentStep: 'start',
            history: [],
            currentDisposition: ''
        };
    },

    // Save prospect and notes
    saveProspectAndNotes() {
        const companyName = document.getElementById('input-company-name')?.value || '';
        const contactName = document.getElementById('input-name')?.value || '';
        const contactTitle = document.getElementById('input-title')?.value || '';
        const phoneNumber = document.getElementById('input-phone')?.value || '';
        const notes = document.getElementById('call-notes')?.value || '';
        const disposition = this.callScriptState.currentDisposition || 'Call Completed';
        
        if (!companyName && !contactName) {
            this.showToast('Please fill in at least Company Name or Contact Name before saving.', 'error');
            return;
        }
        
        const callLogData = {
            companyName,
            contactName,
            contactTitle,
            phoneNumber,
            notes,
            outcome: disposition,
            timestamp: new Date().toISOString()
        };
        
        this.saveCallLog(callLogData, disposition);
        this.restart(); // Reset for next call
    },

    // Clear notes
    clearNotes() {
        const notesTextarea = document.getElementById('call-notes');
        if (notesTextarea) {
            if (confirm('Are you sure you want to clear all notes?')) {
                notesTextarea.value = '';
            }
        }
    },

    // Update script display
    updateScript() {
        // This function can be used to update dynamic content in the script
        // For now, it's a placeholder that can be extended as needed
        console.log('Script updated');
    },

    // Save call log to Firebase and update notifications
    async saveCallLog(logData, disposition) {
        try {
            const docRef = await db.collection('call_logs').add({
                ...logData,
                createdAt: serverTimestamp()
            });

            // Find or create contact based on prospect info
            let contactId = null;
            let contactFound = this.contacts.find(c => 
                c.firstName === logData.prospect.name.split(' ')[0] && 
                c.lastName === logData.prospect.name.split(' ')[1]
            );

            if (contactFound) {
                contactId = contactFound.id;
                // Update existing contact details if provided
                await db.collection('contacts').doc(contactId).update({
                    phone: logData.prospect.phone || contactFound.phone,
                    title: logData.prospect.title || contactFound.title,
                    // Potentially update accountName if it changed or was newly provided
                    accountName: logData.prospect.company || contactFound.accountName,
                    updatedAt: serverTimestamp()
                });
                // Update local contacts array
                const index = this.contacts.findIndex(c => c.id === contactId);
                if (index !== -1) {
                    this.contacts[index] = { 
                        ...this.contacts[index], 
                        phone: logData.prospect.phone || this.contacts[index].phone,
                        title: logData.prospect.title || this.contacts[index].title,
                        accountName: logData.prospect.company || this.contacts[index].accountName,
                        updatedAt: new Date()
                    };
                }
            } else {
                // Create new contact if not found
                const newContactData = {
                    firstName: logData.prospect.name.split(' ')[0] || '',
                    lastName: logData.prospect.name.split(' ')[1] || '',
                    phone: logData.prospect.phone || '',
                    title: logData.prospect.title || '',
                    accountName: logData.prospect.company || '', // Link to company name
                    createdAt: serverTimestamp()
                };
                const newContactRef = await db.collection('contacts').add(newContactData);
                contactId = newContactRef.id;
                this.contacts.push({ id: contactId, ...newContactData, createdAt: new Date() });
            }

            // Save activity for the call log
            await this.saveActivity({
                type: 'call_log_saved',
                description: `Call Log saved for ${logData.prospect.company || 'Unknown Company'} (${disposition})`,
                contactId: contactId,
                contactName: logData.prospect.name,
                accountId: this.accounts.find(acc => acc.name === logData.prospect.company)?.id || null, // Link to account if exists
                accountName: logData.prospect.company
            });

            this.showToast(`Note added and prospect contact details updated for ${logData.prospect.name}!`, 'success');
            this.updateNotifications();
            this.renderDashboardStats(); // Update stats if new contacts/accounts were added
        } catch (error) {
            console.error('Error saving call log or updating contact:', error);
            this.showToast('Failed to save call notes or update contact details.', 'error');
        }
    },

    // Update account details from Energy Health Check results
    async updateAccountDetailsFromHealthCheck(companyName, healthCheckData) {
        try {
            const account = this.accounts.find(acc => acc.name === companyName);
            if (account) {
                const accountRef = db.collection('accounts').doc(account.id);
                await accountRef.update({
                    ...healthCheckData,
                    updatedAt: serverTimestamp()
                });

                // Update local accounts array
                const index = this.accounts.findIndex(acc => acc.id === account.id);
                if (index !== -1) {
                    this.accounts[index] = { ...this.accounts[index], ...healthCheckData, updatedAt: new Date() };
                }

                this.showToast(`Account details for ${companyName} updated from Health Check!`, 'success');
                await this.saveActivity({
                    type: 'health_check_updated',
                    description: `Energy Health Check updated for ${companyName}`,
                    accountId: account.id,
                    accountName: companyName
                });
                this.updateNotifications();
            } else {
                this.showToast(`Account "${companyName}" not found. Cannot update health check details.`, 'warning');
            }
        } catch (error) {
            console.error('Error updating account details from health check:', error);
            this.showToast('Failed to update account details from health check.', 'error');
        }
    },

    // Modal functions
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    },

    async handleAddAccount(e) {
        const accountData = {
            name: document.getElementById('account-name').value,
            industry: document.getElementById('account-industry').value,
            phone: document.getElementById('account-phone').value,
            website: document.getElementById('account-website').value,
            address: document.getElementById('account-address').value,
            createdAt: new Date()
        };
        
        try {
            const tempId = 'temp_' + Date.now();
            this.accounts.push({ id: tempId, ...accountData });
            
            const docRef = await db.collection('accounts').add({
                ...accountData,
                createdAt: serverTimestamp()
            });
            
            const accountIndex = this.accounts.findIndex(a => a.id === tempId);
            if (accountIndex !== -1) {
                this.accounts[accountIndex].id = docRef.id;
            }
            
            console.log('Account saved successfully with ID:', docRef.id);
            this.showToast('Account created successfully!', 'success');
            this.closeModal('add-account-modal');
            this.renderDashboardStats();
            this.updateNotifications();
            
            await this.saveActivity({
                type: 'account_added',
                description: `New account created: ${accountData.name}`,
                accountId: docRef.id,
                accountName: accountData.name
            });
            
        } catch (error) {
            this.accounts = this.accounts.filter(a => a.id !== tempId);
            console.error('Error saving account:', error);
            this.showToast('Failed to create account', 'error');
        }
    },

    async handleAddContact(e) {
        const contactData = {
            firstName: document.getElementById('contact-first-name').value,
            lastName: document.getElementById('contact-last-name').value,
            email: document.getElementById('contact-email').value,
            phone: document.getElementById('contact-phone').value,
            title: document.getElementById('contact-title').value,
            accountId: document.getElementById('contact-account').value,
            accountName: document.getElementById('contact-account').selectedOptions[0]?.textContent || '',
            createdAt: new Date()
        };
        
        try {
            const tempId = 'temp_' + Date.now();
            this.contacts.push({ id: tempId, ...contactData });
            
            const docRef = await db.collection('contacts').add({
                ...contactData,
                createdAt: serverTimestamp()
            });
            
            const contactIndex = this.contacts.findIndex(c => c.id === tempId);
            if (contactIndex !== -1) {
                this.contacts[contactIndex].id = docRef.id;
            }
            
            console.log('Contact saved successfully with ID:', docRef.id);
            this.showToast('Contact created successfully!', 'success');
            this.closeModal('add-contact-modal');
            this.renderDashboardStats();
            this.updateNotifications();
            
            await this.saveActivity({
                type: 'contact_added',
                description: `New contact added: ${contactData.firstName} ${contactData.lastName}`,
                contactId: docRef.id,
                contactName: `${contactData.firstName} ${contactData.lastName}`,
                accountId: contactData.accountId,
                accountName: contactData.accountName
            });
            
        } catch (error) {
            this.contacts = this.contacts.filter(c => c.id !== tempId);
            console.error('Error saving contact:', error);
            this.showToast('Failed to create contact', 'error');
        }
    },

    async handleBulkImport(e) {
        const importType = document.getElementById('import-type').value;
        const fileInput = document.getElementById('csv-file');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showToast('Please select a CSV file', 'error');
            return;
        }
        
        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showToast('Please select a valid CSV file', 'error');
            return;
        }
        
        try {
            this.showToast('Processing CSV file...', 'info');
            
            const text = await file.text();
            const rows = text.split('\n').map(row => 
                row.split(',').map(cell => cell.trim().replace(/"/g, ''))
            );
            const headers = rows[0].map(h => h.trim().toLowerCase());
            const data = rows.slice(1).filter(row => row.length > 1 && row.some(cell => cell.trim()));
            
            let imported = 0;
            let errors = 0;
            
            for (const row of data) {
                try {
                    if (importType === 'contacts') {
                        const contactData = {
                            firstName: this.getColumnValue(row, headers, ['first name', 'firstname', 'first']),
                            lastName: this.getColumnValue(row, headers, ['last name', 'lastname', 'last']),
                            email: this.getColumnValue(row, headers, ['email', 'email address']),
                            phone: this.getColumnValue(row, headers, ['phone', 'phone number', 'telephone']),
                            title: this.getColumnValue(row, headers, ['title', 'job title', 'position']),
                            accountName: this.getColumnValue(row, headers, ['company', 'account', 'organization']),
                            createdAt: new Date()
                        };
                        
                        if (contactData.firstName && contactData.lastName && contactData.email) {
                            const tempId = 'temp_' + Date.now() + '_' + imported;
                            this.contacts.push({ id: tempId, ...contactData });
                            
                            const docRef = await db.collection('contacts').add({
                                ...contactData,
                                createdAt: serverTimestamp()
                            });
                            
                            const contactIndex = this.contacts.findIndex(c => c.id === tempId);
                            if (contactIndex !== -1) {
                                this.contacts[contactIndex].id = docRef.id;
                            }
                            
                            imported++;
                        } else {
                            errors++;
                        }
                    } else if (importType === 'accounts') {
                        const accountData = {
                            name: this.getColumnValue(row, headers, ['company', 'name', 'company name']),
                            industry: this.getColumnValue(row, headers, ['industry', 'sector']),
                            phone: this.getColumnValue(row, headers, ['phone', 'phone number', 'telephone']),
                            website: this.getColumnValue(row, headers, ['website', 'url', 'web']),
                            address: this.getColumnValue(row, headers, ['address', 'location']),
                            createdAt: new Date()
                        };
                        
                        if (accountData.name) {
                            const tempId = 'temp_' + Date.now() + '_' + imported;
                            this.accounts.push({ id: tempId, ...accountData });
                            
                            const docRef = await db.collection('accounts').add({
                                ...accountData,
                                createdAt: serverTimestamp()
                            });
                            
                            const accountIndex = this.accounts.findIndex(a => a.id === tempId);
                            if (accountIndex !== -1) {
                                this.accounts[accountIndex].id = docRef.id;
                            }
                            
                            imported++;
                        } else {
                            errors++;
                        }
                    }
                } catch (rowError) {
                    console.error('Error processing row:', rowError);
                    errors++;
                }
            }
            
            let message = `Successfully imported ${imported} ${importType}`;
            if (errors > 0) {
                message += ` (${errors} rows had errors and were skipped)`;
            }
            
            this.showToast(message, imported > 0 ? 'success' : 'warning');
            this.closeModal('bulk-import-modal');
            
            this.renderDashboardStats();
            this.updateNotifications();
            
            if (imported > 0) {
                await this.saveActivity({
                    type: 'bulk_import',
                    description: `Bulk imported ${imported} ${importType} from CSV`,
                });
            }
            
        } catch (error) {
            console.error('Error importing CSV:', error);
            this.showToast('Error processing CSV file. Please check the format.', 'error');
        }
    },

    getColumnValue(row, headers, columnNames) {
        for (const name of columnNames) {
            const index = headers.indexOf(name);
            if (index !== -1 && row[index]) {
                return row[index].trim();
            }
        }
        return '';
    },

    updateNotifications() {
        this.notifications = [];
        
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const newContacts = this.contacts.filter(c => new Date(c.createdAt) > yesterday);
        const newAccounts = this.accounts.filter(a => new Date(a.createdAt) > yesterday);
        const today = new Date();
        const pendingTasks = this.tasks.filter(t => !t.completed && new Date(t.dueDate) <= today);
        
        if (newContacts.length > 0) {
            this.notifications.push({
                type: 'contact',
                message: `${newContacts.length} new contact(s) added`,
                count: newContacts.length,
                time: 'Recently'
            });
        }
        
        if (newAccounts.length > 0) {
            this.notifications.push({
                type: 'account',
                message: `${newAccounts.length} new account(s) added`,
                count: newAccounts.length,
                time: 'Recently'
            });
        }
        
        if (pendingTasks.length > 0) {
            this.notifications.push({
                type: 'task',
                message: `${pendingTasks.length} pending task(s) for today`,
                count: pendingTasks.length,
                time: 'Due today'
            });
        }
        
        this.renderNotifications();
        this.updateNavigationBadges();
    },

    renderNotifications() {
        const notificationList = document.getElementById('notification-list');
        const notificationBadge = document.getElementById('notification-badge');
        const notificationCount = document.getElementById('notification-count');
        
        const totalCount = this.notifications.reduce((sum, n) => sum + n.count, 0); 
        
        if (notificationBadge) {
            notificationBadge.textContent = totalCount;
            notificationBadge.style.display = totalCount > 0 ? 'flex' : 'none';
        }
        
        if (notificationCount) {
            notificationCount.textContent = totalCount;
        }
        
        if (notificationList) {
            if (this.notifications.length === 0) {
                notificationList.innerHTML = '<div class="notification-empty">No new notifications</div>';
            } else {
                notificationList.innerHTML = this.notifications.map(notification => `
                    <div class="notification-item">
                        <div class="notification-icon ${notification.type}">
                            ${this.getNotificationIcon(notification.type)}
                        </div>
                        <div class="notification-text">
                            <div class="notification-message">${notification.message}</div>
                            <div class="notification-time">${notification.time}</div>
                        </div>
                    </div>
                `).join('');
            }
        }
    },

    updateNavigationBadges() {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const newContacts = this.contacts.filter(c => new Date(c.createdAt) > yesterday).length;
        this.updateBadge('contacts-badge', newContacts);
        
        const newAccounts = this.accounts.filter(a => new Date(a.createdAt) > yesterday).length;
        this.updateBadge('accounts-badge', newAccounts);
        
        const today = new Date();
        const pendingTasks = this.tasks.filter(t => !t.completed && new Date(t.dueDate) <= today).length;
        this.updateBadge('tasks-badge', pendingTasks);
        
        this.updateBadge('emails-badge', 0);
    },

    updateBadge(badgeId, count) {
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    },

    getNotificationIcon(type) {
        const icons = {
            contact: '👤',
            account: '🏢',
            email: '📧',
            task: '✅',
            health_check_updated: '📈',
            call_log_saved: '📞'
        };
        return icons[type] || '📋';
    },

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    },

    formatDate(date) {
        if (!date) return 'Unknown';
        const now = new Date();
        const dateObj = new Date(date);
        const diffMs = now - dateObj;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        
        return dateObj.toLocaleDateString();
    },

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });
        
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 4000);
    },

    async saveActivity(activityData) {
        try {
            const docRef = await db.collection('activities').add({
                ...activityData,
                createdAt: serverTimestamp()
            });
            
            this.activities.unshift({
                id: docRef.id,
                ...activityData,
                createdAt: new Date()
            });
            
            console.log('Activity saved successfully with ID:', docRef.id);
            this.renderActivityCarousel();
            return docRef.id;
        } catch (error) {
            console.error('Error saving activity:', error);
            return null;
        }
    },

    async saveAccount(accountData) {
        try {
            const docRef = await db.collection('accounts').add({
                ...accountData,
                createdAt: serverTimestamp()
            });
            
            console.log('Account saved successfully with ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error saving account:', error);
            throw error;
        }
    },

    async saveContact(contactData) {
        try {
            const docRef = await db.collection('contacts').add({
                ...contactData,
                createdAt: serverTimestamp()
            });
            
            console.log('Contact saved successfully with ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error saving contact:', error);
            throw error;
        }
    }
};

// Make CRMApp globally accessible for onclick handlers
window.CRMApp = CRMApp;

// --- 3. Initialize the application when DOM is loaded ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing CRM App...');
    CRMApp.init();




});

// --- 4. Make CRMApp globally available for debugging ---
window.CRMApp = CRMApp;

// --- 5. Additional utility functions ---
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
