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
            console.error('Error saving call log:', error);
            this.showNotification('Error saving call log: ' + error.message, 'error');
        }
    },

    // Load initial data from Firestore
    async loadInitialData() {
        console.log('Attempting to load data from Firebase...');
        
        // Check if Firebase is properly initialized
        if (typeof db === 'undefined') {
            console.error('Firebase db is not defined. Check Firebase initialization.');
            this.showToast('Firebase not initialized. Using sample data.', 'warning');
            return this.loadSampleData();
        }
        
        try {
            // Test Firebase connection first
            console.log('Testing Firebase connection...');
            const testQuery = await db.collection('contacts').limit(1).get();
            console.log('Firebase connection successful, loading all data...');
            
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
            
            console.log('✅ Firebase data loaded successfully:', {
                accounts: this.accounts.length,
                contacts: this.contacts.length,
                activities: this.activities.length
            });
            
            if (this.contacts.length === 0) {
                console.log('⚠️  No contacts found in Firebase. Your Firebase contacts collection might be empty.');
                this.showToast('No contacts found in Firebase database. Add some contacts first!', 'info');
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error loading Firebase data:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                code: error.code
            });
            
            // Show specific error message based on error type
            if (error.code === 'permission-denied') {
                this.showToast('Firebase permission denied. Check your Firestore security rules.', 'error');
            } else if (error.code === 'unavailable') {
                this.showToast('Firebase is unavailable. Check your internet connection.', 'error');
            } else {
                this.showToast(`Firebase error: ${error.message}. Using sample data.`, 'warning');
            }
            
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
            { id: 'con3', firstName: 'Mike', lastName: 'Davis', title: 'Operations Manager', accountId: 'acc2', accountName: 'XYZ Energy Solutions', email: 'mike@xyzenergy.com', phone: '(972) 555-0456', createdAt: new Date() },
            { id: 'con4', firstName: 'potter', lastName: '', title: '', accountId: '', accountName: '', email: 'N/A', phone: '', createdAt: new Date() },
            { id: 'con5', firstName: 'Contact', lastName: '', title: '', accountId: '', accountName: '', email: 'N/A', phone: '', createdAt: new Date() },
            { id: 'con6', firstName: 'Lewis', lastName: 'Patterson', title: '', accountId: '', accountName: '', email: 'l.patterson@powerchooser.com', phone: '', createdAt: new Date() }
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
        console.log(`Switching to view: ${viewName}`);
        this.currentView = viewName;
        
        // Hide all main content views with explicit display none
        document.querySelectorAll('.page-view').forEach(view => {
            view.style.display = 'none';
            view.style.visibility = 'hidden';
            view.style.position = 'absolute';
            view.style.left = '-9999px';
            // Clear any content that might be lingering
            if (view.id !== viewName && (view.id === 'contacts-view' || view.id === 'accounts-view')) {
                view.innerHTML = '';
            }
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
            
            console.log(`Showing view: ${viewName}`);
            
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
            } else if (viewName === 'contacts-view') {
                // Contacts View - Render contacts page
                console.log('Activating contacts view');
                this.renderContactsPage();
                activeView.style.display = 'block';
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                    console.log('Showing CRM widgets for contacts');
                }
                // Update navigation highlight
                this.updateActiveNavButton(document.querySelector('.nav-item[data-view="contacts-view"]'));
            } else if (viewName === 'accounts-view') {
                // Accounts View - Render accounts page
                console.log('Activating accounts view');
                this.renderAccountsPage();
                activeView.style.display = 'block';
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                    console.log('Showing CRM widgets for accounts');
                }
                // Update navigation highlight
                this.updateActiveNavButton(document.querySelector('.nav-item[data-view="accounts-view"]'));
            } else if (viewName === 'tasks-view') {
                // Tasks View - Render tasks page
                console.log('Activating tasks view');
                this.renderTasksPage();
                activeView.style.display = 'block';
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                    console.log('Showing CRM widgets for tasks');
                }
                // Update navigation highlight
                this.updateActiveNavButton(document.querySelector('.nav-item[data-view="tasks-view"]'));
            } else if (viewName === 'sequences-view') {
                // Sequences View - Render sequences page
                console.log('Activating sequences view');
                activeView.style.display = 'block';
                if (crmWidgetsContainer) {
                    crmWidgetsContainer.style.display = 'flex';
                    console.log('Showing CRM widgets for sequences');
                }
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
        // Remove the data-loaded check to allow re-rendering
        // This ensures contacts page always renders properly

        console.log("Creating contacts HTML with classes");
        // Rebuild contacts HTML with enhanced inline styling
        const contactsHTML = `
            <div class="contacts-header" style="
                margin-bottom: 20px;
                padding: 20px;
                background: linear-gradient(135deg, #2c2c2c 0%, #1e1e1e 100%);
                border-radius: 18px;
                border: 1px solid #333;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            ">
                <h2 class="contacts-title" style="
                    font-size: 24px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                ">All Contacts</h2>
            </div>
            <div class="contacts-content" style="display: flex; gap: 20px; flex: 1; overflow: hidden;">
                <!-- Filters Sidebar -->
                <div id="filters-sidebar" class="filters-sidebar" style="
                    min-width: 280px;
                    max-width: 320px;
                    flex-shrink: 0;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 20px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    transition: all 0.3s ease;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="filters-title" style="color: #fff; margin: 0; font-size: 18px;">Filters</h3>
                        <button id="toggle-filters-btn" onclick="toggleFilters()" style="
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
                        <input type="text" id="contact-search-simple" placeholder="Search contacts..." class="filter-input" style="
                            width: 100%;
                            padding: 10px;
                            background: #333;
                            color: #fff;
                            border: 1px solid #555;
                            border-radius: 6px;
                            font-size: 14px;
                        ">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label" style="color: #ccc; font-size: 14px; margin-bottom: 5px; display: block;">Account</label>
                        <select id="account-filter-simple" class="filter-input" style="
                            width: 100%;
                            padding: 10px;
                            background: #333;
                            color: #fff;
                            border: 1px solid #555;
                            border-radius: 6px;
                            font-size: 14px;
                        ">
                            <option value="">All Accounts</option>
                        </select>
                    </div>
                    <button onclick="CRMApp.clearContactsFilters()" class="btn btn-clear-filters" style="
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #666 0%, #555 100%);
                        color: #fff;
                        border: 1px solid #777;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                        transition: all 0.2s ease;
                        font-size: 14px;
                    ">Clear Filters</button>
                </div>
                <!-- Contacts Table Section -->
                <div class="contacts-table-section" style="
                    flex: 1;
                    min-width: 0;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 20px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                ">
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 15px;
                        flex-shrink: 0;
                    ">
                        <button id="show-filters-btn" onclick="toggleFilters()" style="
                            display: none;
                            background: #444;
                            border: 1px solid #666;
                            color: #fff;
                            padding: 6px 8px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: all 0.2s ease;
                        " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'" title="Show Filters">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                        <div id="contacts-count-simple" class="contacts-count" style="
                            color: #ccc;
                            font-size: 14px;
                            font-weight: 500;
                        ">Loading contacts...</div>
                        <div id="pagination-controls" style="
                            display: none;
                            align-items: center;
                            gap: 8px;
                            margin-left: auto;
                        ">
                            <button id="prev-page-btn" onclick="changePage(-1)" style="
                                background: #444;
                                border: 1px solid #666;
                                color: #fff;
                                padding: 6px 8px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: all 0.2s ease;
                                display: flex;
                                align-items: center;
                            " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'" title="Previous Page">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </button>
                            <span id="page-info" style="
                                color: #999;
                                font-size: 12px;
                                min-width: 60px;
                                text-align: center;
                            ">1 / 1</span>
                            <button id="next-page-btn" onclick="changePage(1)" style="
                                background: #444;
                                border: 1px solid #666;
                                color: #fff;
                                padding: 6px 8px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: all 0.2s ease;
                                display: flex;
                                align-items: center;
                            " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'" title="Next Page">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div id="contacts-table-container" class="contacts-table-wrapper" style="
                        flex: 1; 
                        overflow-x: auto; 
                        overflow-y: auto;
                        border-radius: 12px;
                        min-height: 0;
                        scrollbar-width: thin;
                        scrollbar-color: #555 #2a2a2a;
                    ">
                        <table class="contacts-table" style="
                            min-width: 1200px;
                            width: max-content;
                            border-collapse: collapse;
                            background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
                            border-radius: 18px;
                            overflow: hidden;
                            border: 1px solid #444;
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
                            white-space: nowrap;
                            table-layout: fixed;
                        ">
                            <thead>
                                <tr class="table-header-row" style="
                                    background: linear-gradient(135deg, #444 0%, #333 100%);
                                    border-bottom: 2px solid #555;
                                ">
                                    <th class="table-header-cell" style="
                                        padding: 15px 12px;
                                        text-align: left;
                                        font-weight: 600;
                                        color: #fff;
                                        border-bottom: 1px solid #555;
                                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                        font-size: 14px;
                                        letter-spacing: 0.5px;
                                    ">Name</th>
                                    <th class="table-header-cell" style="
                                        padding: 15px 12px;
                                        text-align: left;
                                        font-weight: 600;
                                        color: #fff;
                                        border-bottom: 1px solid #555;
                                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                        font-size: 14px;
                                        letter-spacing: 0.5px;
                                        width: 120px;
                                    ">Number</th>
                                    <th class="table-header-cell" style="
                                        padding: 15px 12px;
                                        text-align: left;
                                        font-weight: 600;
                                        color: #fff;
                                        border-bottom: 1px solid #555;
                                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                        font-size: 14px;
                                        letter-spacing: 0.5px;
                                    ">Email</th>
                                    <th class="table-header-cell" style="
                                        padding: 15px 12px;
                                        text-align: left;
                                        font-weight: 600;
                                        color: #fff;
                                        border-bottom: 1px solid #555;
                                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                        font-size: 14px;
                                        letter-spacing: 0.5px;
                                    ">Company</th>
                                    <th class="table-header-cell" style="
                                        padding: 15px 12px;
                                        text-align: left;
                                        font-weight: 600;
                                        color: #fff;
                                        border-bottom: 1px solid #555;
                                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                                        font-size: 14px;
                                        letter-spacing: 0.5px;
                                    ">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="contacts-table-body-simple">
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        contactsView.innerHTML = contactsHTML;
        console.log("Contacts HTML created and injected");

        // Apply layout, spacing, and essential background styles for visibility
        contactsView.style.cssText = `
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
        
        console.log('Applied direct styles to contacts-view:', contactsView.style.cssText);
        
        // Initialize the simple contacts functionality
        this.initSimpleContactsUI();
        console.log("Simple contacts UI initialized");
        
        // Initialize button visibility after UI is ready
        setTimeout(() => {
            // Show pagination controls if we have more than 50 contacts (for testing, show always)
            const paginationControls = document.getElementById('pagination-controls');
            if (paginationControls) {
                // For now, always show pagination controls so you can see them
                paginationControls.style.display = 'flex';
                
                // Update pagination info
                const pageInfo = document.getElementById('page-info');
                if (pageInfo) {
                    pageInfo.textContent = '1 / 1';
                }
            }
            
            // Ensure filters sidebar is visible
            const filtersSidebar = document.getElementById('filters-sidebar');
            if (filtersSidebar) {
                filtersSidebar.style.display = 'flex';
            }
        }, 100);
    },

    // Render the tasks page with tabbed interface and pagination
    renderTasksPage() {
        console.log("renderTasksPage called");
        const tasksView = document.getElementById('tasks-view');
        if (!tasksView) {
            console.error('tasks-view element not found');
            return;
        }

        console.log("Creating tasks HTML with tabs and pagination");
        const tasksHTML = `
            <div class="tasks-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid #333;
            ">
                <h2 style="
                    margin: 0;
                    color: #fff;
                    font-size: 28px;
                    font-weight: 600;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                ">All Tasks</h2>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button onclick="CRMApp.openSequences()" style="
                        background: linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 100%);
                        border: 1px solid #444;
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    " onmouseover="this.style.background='linear-gradient(135deg, #4a4a4a 0%, #3a3a3a 100%)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #3a3a3a 0%, #2d2d2d 100%)'">
                        Sequences
                    </button>
                    <button onclick="CRMApp.openAddTaskModal()" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        border: 1px solid #28a745;
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    " onmouseover="this.style.background='linear-gradient(135deg, #218838 0%, #1e7e34 100%)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #28a745 0%, #20c997 100%)'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add Task
                    </button>
                </div>
            </div>

            <!-- Task Type Tabs -->
            <div class="task-tabs" style="
                display: flex;
                gap: 4px;
                margin-bottom: 20px;
                background: #2a2a2a;
                padding: 4px;
                border-radius: 12px;
                border: 1px solid #333;
            ">
                <button id="all-tasks-tab" class="task-tab active-tab" onclick="CRMApp.switchTaskTab('all')" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    text-align: center;
                ">All tasks <span id="all-tasks-count" class="task-count">0</span></button>
                <button id="call-tasks-tab" class="task-tab" onclick="CRMApp.switchTaskTab('calls')" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: transparent;
                    color: #ccc;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    text-align: center;
                ">Call tasks <span id="call-tasks-count" class="task-count">0</span></button>
                <button id="email-tasks-tab" class="task-tab" onclick="CRMApp.switchTaskTab('emails')" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: transparent;
                    color: #ccc;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    text-align: center;
                ">Email tasks <span id="email-tasks-count" class="task-count">0</span></button>
                <button id="linkedin-tasks-tab" class="task-tab" onclick="CRMApp.switchTaskTab('linkedin')" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: transparent;
                    color: #ccc;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    text-align: center;
                ">LinkedIn tasks <span id="linkedin-tasks-count" class="task-count">0</span></button>
            </div>

            <div class="tasks-content" style="display: flex; gap: 20px; flex: 1; overflow: hidden;">
                <!-- Filters Sidebar -->
                <div id="tasks-filters-sidebar" class="filters-sidebar" style="
                    min-width: 280px;
                    max-width: 320px;
                    flex-shrink: 0;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 20px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    transition: all 0.3s ease;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="filters-title" style="color: #fff; margin: 0; font-size: 18px;">Filters</h3>
                        <button id="toggle-tasks-filters-btn" onclick="toggleTasksFilters()" style="
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
                        <input type="text" id="task-search-simple" placeholder="Search tasks..." class="filter-input" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid #444;
                            border-radius: 8px;
                            background: #333;
                            color: #fff;
                            font-size: 14px;
                            transition: border-color 0.2s ease;
                        " oninput="CRMApp.renderSimpleTasksTable(this.value)">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label" style="color: #ccc; font-size: 14px; margin-bottom: 5px; display: block;">Priority</label>
                        <select id="task-priority-filter" class="filter-select" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid #444;
                            border-radius: 8px;
                            background: #333;
                            color: #fff;
                            font-size: 14px;
                            cursor: pointer;
                        " onchange="CRMApp.renderSimpleTasksTable(document.getElementById('task-search-simple').value)">
                            <option value="">All Priorities</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label" style="color: #ccc; font-size: 14px; margin-bottom: 5px; display: block;">Status</label>
                        <select id="task-status-filter" class="filter-select" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid #444;
                            border-radius: 8px;
                            background: #333;
                            color: #fff;
                            font-size: 14px;
                            cursor: pointer;
                        " onchange="CRMApp.renderSimpleTasksTable(document.getElementById('task-search-simple').value)">
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="in-progress">In Progress</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>
                    <button onclick="CRMApp.clearTasksFilters()" class="btn btn-clear-filters" style="
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #666 0%, #555 100%);
                        color: #fff;
                        border: 1px solid #777;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                        transition: all 0.2s ease;
                        font-size: 14px;
                    " onmouseover="this.style.background='linear-gradient(135deg, #777 0%, #666 100%)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #666 0%, #555 100%)'">Clear Filters</button>
                </div>

                <!-- Tasks Table Section -->
                <div class="tasks-table-section" style="
                    flex: 1;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 20px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <button id="show-tasks-filters-btn" onclick="toggleTasksFilters()" style="
                                display: none;
                                align-items: center;
                                gap: 8px;
                                background: #444;
                                border: 1px solid #666;
                                color: #fff;
                                padding: 8px 12px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                transition: all 0.2s ease;
                            " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                Show Filters
                            </button>
                            <div id="tasks-count-simple" class="tasks-count" style="color: #fff; font-size: 16px; font-weight: 500;">0 tasks</div>
                        </div>
                        <div id="tasks-pagination-controls" style="display: flex; align-items: center; gap: 12px;">
                            <button id="tasks-prev-page" title="Previous Page" style="
                                background: #444;
                                border: 1px solid #666;
                                color: #fff;
                                padding: 6px 10px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: all 0.2s ease;
                            " onclick="CRMApp.changeTasksPage(-1)" onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </button>
                            <span id="tasks-page-info" style="color: #ccc; font-size: 14px; min-width: 60px; text-align: center;">1 / 1</span>
                            <button id="tasks-next-page" title="Next Page" style="
                                background: #444;
                                border: 1px solid #666;
                                color: #fff;
                                padding: 6px 10px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: all 0.2s ease;
                            " onclick="CRMApp.changeTasksPage(1)" onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div id="tasks-table-container" class="tasks-table-wrapper" style="
                        flex: 1;
                        overflow-x: auto;
                        overflow-y: auto;
                        border-radius: 12px;
                        border: 1px solid #333;
                    ">
                        <table class="tasks-table" style="
                            width: 100%;
                            border-collapse: collapse;
                            background: #1f1f1f;
                        ">
                            <thead style="
                                background: linear-gradient(135deg, #333 0%, #2a2a2a 100%);
                                position: sticky;
                                top: 0;
                                z-index: 10;
                            ">
                                <tr>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Task</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Associated With</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Company</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Actions</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Due Date</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Priority</th>
                                </tr>
                            </thead>
                            <tbody id="tasks-table-body-simple">
                                <tr>
                                    <td colspan="6" style="padding: 40px; text-align: center; color: #888; font-style: italic;">Loading tasks...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        tasksView.innerHTML = tasksHTML;

        console.log("Tasks HTML created and injected");

        // Apply layout styles
        const layoutStyles = `
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
        tasksView.style.cssText = layoutStyles;

        console.log("Applied direct styles to tasks-view");

        // Initialize tasks UI
        setTimeout(() => {
            this.initSimpleTasksUI();
            console.log("Simple tasks UI initialized");
        }, 100);
    },

    // Render the accounts page with enhanced layout and functionality
    renderAccountsPage() {
        console.log("renderAccountsPage called");
        const accountsView = document.getElementById('accounts-view');
        if (!accountsView) {
            console.error('accounts-view element not found');
            return;
        }

        console.log("Creating accounts HTML with classes");
        const accountsHTML = `
            <div class="accounts-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid #333;
            ">
                <h2 style="
                    margin: 0;
                    color: #fff;
                    font-size: 28px;
                    font-weight: 600;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                ">All Accounts</h2>
            </div>
            <div class="accounts-content" style="display: flex; gap: 20px; flex: 1; overflow: hidden;">
                <!-- Filters Sidebar -->
                <div id="accounts-filters-sidebar" class="filters-sidebar" style="
                    min-width: 280px;
                    max-width: 320px;
                    flex-shrink: 0;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 20px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    transition: all 0.3s ease;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="filters-title" style="color: #fff; margin: 0; font-size: 18px;">Filters</h3>
                        <button id="toggle-accounts-filters-btn" onclick="toggleAccountsFilters()" style="
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
                        " oninput="crmApp.renderSimpleAccountsTable(this.value)">
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
                            cursor: pointer;
                        " onchange="crmApp.renderSimpleAccountsTable(document.getElementById('account-search-simple').value)">
                            <option value="">All Industries</option>
                        </select>
                    </div>
                    <button onclick="CRMApp.clearAccountsFilters()" class="btn btn-clear-filters" style="
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #666 0%, #555 100%);
                        color: #fff;
                        border: 1px solid #777;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                        transition: all 0.2s ease;
                        font-size: 14px;
                    " onmouseover="this.style.background='linear-gradient(135deg, #777 0%, #666 100%)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #666 0%, #555 100%)'">Clear Filters</button>
                </div>

                <!-- Accounts Table Section -->
                <div class="accounts-table-section" style="
                    flex: 1;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 24px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div id="accounts-count-simple" class="accounts-count" style="
                                color: #fff;
                                font-size: 16px;
                                font-weight: 500;
                            ">Loading accounts...</div>
                            
                            <!-- Show Filters Button (hidden by default) -->
                            <button id="show-accounts-filters-btn" onclick="toggleAccountsFilters()" style="
                                display: none;
                                background: #4a90e2;
                                border: 1px solid #5ba0f2;
                                color: #fff;
                                padding: 8px 12px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s ease;
                                align-items: center;
                                gap: 6px;
                            " onmouseover="this.style.background='#5ba0f2'" onmouseout="this.style.background='#4a90e2'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                </svg>
                                Show Filters
                            </button>
                            
                            <!-- Pagination Controls -->
                            <div id="accounts-pagination-controls" style="
                                display: none;
                                align-items: center;
                                gap: 10px;
                                margin-left: auto;
                            ">
                                <button id="accounts-prev-page" onclick="changeAccountsPage(-1)" style="
                                    background: #444;
                                    border: 1px solid #666;
                                    color: #fff;
                                    padding: 6px 10px;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    transition: all 0.2s ease;
                                " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="15 18 9 12 15 6"></polyline>
                                    </svg>
                                </button>
                                <span id="accounts-page-info" style="color: #ccc; font-size: 14px; min-width: 60px; text-align: center;">1 / 1</span>
                                <button id="accounts-next-page" onclick="changeAccountsPage(1)" style="
                                    background: #444;
                                    border: 1px solid #666;
                                    color: #fff;
                                    padding: 6px 10px;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    transition: all 0.2s ease;
                                " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="accounts-table-container" class="accounts-table-wrapper" style="
                        flex: 1;
                        overflow: auto;
                        border-radius: 12px;
                        border: 1px solid #333;
                        min-width: 0;
                    ">
                        <table class="accounts-table" style="
                            width: 100%;
                            min-width: 800px;
                            border-collapse: collapse;
                            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                            table-layout: fixed;
                        ">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #333 0%, #2a2a2a 100%); border-bottom: 2px solid #444;">
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; width: 25%; min-width: 200px; white-space: nowrap;">Company Name</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; width: 15%; min-width: 120px; white-space: nowrap;">Phone</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; width: 20%; min-width: 150px; white-space: nowrap;">Location</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; width: 15%; min-width: 120px; white-space: nowrap;">Industry</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; width: 15%; min-width: 120px; white-space: nowrap;">Contacts</th>
                                    <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; width: 10%; min-width: 100px; white-space: nowrap;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="accounts-table-body-simple">
                                <!-- Account rows will be populated here -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        console.log("Accounts HTML created and injected");
        accountsView.innerHTML = accountsHTML;

        // Apply layout styles directly to the accounts-view element for reliability
        const layoutStyles = `
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
        accountsView.style.cssText = layoutStyles;
        console.log("Applied direct styles to accounts-view:", layoutStyles);

        // Initialize the simple accounts functionality
        this.initSimpleAccountsUI();
        console.log("Simple accounts UI initialized");
        
        // Initialize button visibility after UI is ready
        setTimeout(() => {
            // Show pagination controls if we have more than 50 accounts (for testing, show always)
            const paginationControls = document.getElementById('accounts-pagination-controls');
            if (paginationControls) {
                // For now, always show pagination controls so you can see them
                paginationControls.style.display = 'flex';
                
                // Update pagination info
                const pageInfo = document.getElementById('accounts-page-info');
                if (pageInfo) {
                    pageInfo.textContent = '1 / 1';
                }
            }
            
            // Ensure filters sidebar is visible
            const filtersSidebar = document.getElementById('accounts-filters-sidebar');
            if (filtersSidebar) {
                filtersSidebar.style.display = 'flex';
            }
        }, 100);
    },

    // Initialize simple accounts UI with basic functionality
    initSimpleAccountsUI() {
        console.log("Initializing simple accounts UI");
        console.log(`Found ${this.accounts ? this.accounts.length : 0} accounts from Firebase`);
        
        // Populate industry filter
        this.populateAccountIndustryFilter();
        
        // Render the accounts table
        this.renderSimpleAccountsTable();
    },

    // Populate the industry filter dropdown for accounts
    populateAccountIndustryFilter() {
        const industryFilter = document.getElementById('account-industry-filter');
        if (!industryFilter) return;
        
        // Get unique industries from accounts
        let industries = Array.from(new Set(this.accounts.map(a => a.industry))).filter(Boolean);
        industryFilter.innerHTML = '<option value="">All Industries</option>' + 
            industries.map(i => `<option value="${i}">${i}</option>`).join('');
    },

    // Render the accounts table with search and pagination
    renderSimpleAccountsTable(searchTerm = '', accountsToRender = null) {
        console.log("Rendering simple accounts table, search:", searchTerm);
        
        let filteredAccounts = accountsToRender || this.accounts || [];
        
        // Apply search filter
        if (searchTerm) {
            filteredAccounts = filteredAccounts.filter(account => 
                account.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.state?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.industry?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // Apply industry filter
        const industryFilter = document.getElementById('account-industry-filter');
        if (industryFilter && industryFilter.value) {
            filteredAccounts = filteredAccounts.filter(account => 
                account.industry === industryFilter.value
            );
        }
        
        // Pagination logic
        const accountsPerPage = 50;
        const totalPages = Math.ceil(filteredAccounts.length / accountsPerPage);
        const currentPage = this.currentAccountsPage || 1;
        const startIndex = (currentPage - 1) * accountsPerPage;
        const endIndex = startIndex + accountsPerPage;
        const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);
        
        // Update accounts count
        const accountsCount = document.getElementById('accounts-count-simple');
        if (accountsCount) {
            accountsCount.textContent = `${filteredAccounts.length} account${filteredAccounts.length !== 1 ? 's' : ''}`;
        }
        
        // Update pagination controls
        this.updateAccountsPaginationControls(currentPage, totalPages, filteredAccounts.length);
        
        // Render table rows
        const tableBody = document.getElementById('accounts-table-body-simple');
        if (!tableBody) return;
        
        if (paginatedAccounts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 40px; text-align: center; color: #888; font-style: italic;">
                        ${searchTerm ? 'No accounts found matching your search.' : 'No accounts available.'}
                    </td>
                </tr>
            `;
            return;
        }
        
        tableBody.innerHTML = paginatedAccounts.map(account => {
            // Get contact count for this account
            const contactCount = this.contacts.filter(c => c.accountId === account.id).length;
            
            // Extract domain from account name for favicon
            const domain = this.extractDomainFromAccountName(account.name);
            const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
            
            return `
                <tr style="border-bottom: 1px solid #333; transition: background-color 0.2s ease;" 
                    onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" 
                    onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding: 16px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${faviconUrl ? `<img src="${faviconUrl}" alt="${account.name}" style="width: 24px; height: 24px; border-radius: 4px; flex-shrink: 0;" onerror="this.style.display='none'">` : ''}
                            <span style="font-weight: 500; cursor: pointer; color: #fff; text-decoration: none;" 
                                  onclick="CRMApp.showAccountDetails('${account.id}')"
                                  onmouseover="this.style.color='#ccc'"
                                  onmouseout="this.style.color='#fff'">${account.name || 'N/A'}</span>
                        </div>
                    </td>
                    <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${account.phone || 'N/A'}</td>
                    <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${account.city && account.state ? `${account.city}, ${account.state}` : 'N/A'}</td>
                    <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${account.industry || 'N/A'}</td>
                    <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${contactCount} contact${contactCount !== 1 ? 's' : ''}</td>
                    <td style="padding: 16px; white-space: nowrap;">
                        <button onclick="CRMApp.showAccountDetails('${account.id}')" style="
                            background: #4a90e2;
                            border: 1px solid #5ba0f2;
                            color: #fff;
                            padding: 6px 12px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: all 0.2s ease;
                        " onmouseover="this.style.background='#5ba0f2'" onmouseout="this.style.background='#4a90e2'">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log(`Rendered ${paginatedAccounts.length} accounts`);
    },

    // Show individual account details page
    showAccountDetails(accountId) {
        console.log(`Showing account details for ID: ${accountId}`);
        const account = this.accounts.find(a => a.id === accountId);
        if (!account) {
            console.error('Account not found:', accountId);
            return;
        }

        // Switch to a dedicated account details view
        const accountsView = document.getElementById('accounts-view');
        if (!accountsView) return;

        // Get contacts for this account
        const accountContacts = this.contacts.filter(c => c.accountId === accountId);
        
        // Get activities for this account
        const accountActivities = this.activities.filter(a => a.accountId === accountId);

        // Extract domain for favicon
        const domain = this.extractDomainFromAccountName(account.name);
        const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';

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
                    <button onclick="crmApp.renderAccountsPage()" style="
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Back to Accounts
                    </button>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        ${faviconUrl ? `<img src="${faviconUrl}" alt="${account.name}" style="width: 48px; height: 48px; border-radius: 8px;" onerror="this.style.display='none'">` : ''}
                        <h2 style="margin: 0; color: #fff; font-size: 28px; font-weight: 600;">${account.name}</h2>
                    </div>
                </div>
            </div>

            <div class="account-details-content" style="display: flex; gap: 20px; flex: 1; overflow: hidden;">
                <!-- Account Info Section -->
                <div class="account-info-section" style="
                    flex: 2;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    min-width: 0;
                ">
                    <!-- Account Information Card -->
                    <div class="account-info-card" style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 24px;
                        border-radius: 18px;
                        border: 1px solid #333;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    ">
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
                                <div style="color: #fff; font-size: 16px;">${account.city && account.state ? `${account.city}, ${account.state}` : 'N/A'}</div>
                            </div>
                            <div>
                                <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Industry</label>
                                <div style="color: #fff; font-size: 16px;">${account.industry || 'N/A'}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Account Contacts -->
                    <div class="account-contacts-card" style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 24px;
                        border-radius: 18px;
                        border: 1px solid #333;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                    ">
                        <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Contacts (${accountContacts.length})</h3>
                        <div style="flex: 1; overflow-y: auto; max-height: 300px;">
                            ${accountContacts.length > 0 ? accountContacts.map(contact => `
                                <div style="
                                    padding: 12px;
                                    border: 1px solid #333;
                                    border-radius: 8px;
                                    margin-bottom: 8px;
                                    cursor: pointer;
                                    transition: all 0.2s ease;
                                " onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" 
                                   onmouseout="this.style.backgroundColor='transparent'"
                                   onclick="crmApp.showContactDetails('${contact.id}')">
                                    <div style="color: #fff; font-weight: 500; margin-bottom: 4px;">
                                        ${contact.firstName} ${contact.lastName}
                                    </div>
                                    <div style="color: #ccc; font-size: 14px;">
                                        ${contact.title || 'No title'} • ${contact.email || 'No email'}
                                    </div>
                                </div>
                            `).join('') : '<div style="color: #888; font-style: italic; text-align: center; padding: 20px;">No contacts found for this account</div>'}
                        </div>
                    </div>
                </div>

                <!-- Widget Panel (same as other pages) -->
                <div id="account-widget-panel" style="
                    flex: 1;
                    min-width: 300px;
                    max-width: 400px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                ">
                    <!-- Recent Activities for this Account -->
                    <div class="widget-card" style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 20px;
                        border-radius: 18px;
                        border: 1px solid #333;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    ">
                        <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Recent Activities</h3>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${accountActivities.length > 0 ? accountActivities.slice(0, 10).map(activity => `
                                <div style="
                                    padding: 12px 0;
                                    border-bottom: 1px solid #333;
                                    last-child: border-bottom: none;
                                ">
                                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px;">
                                        ${activity.description}
                                    </div>
                                    <div style="color: #888; font-size: 12px;">
                                        ${new Date(activity.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            `).join('') : '<div style="color: #888; font-style: italic; text-align: center; padding: 20px;">No recent activities</div>'}
                        </div>
                    </div>

                    <!-- Quick Actions -->
                    <div class="widget-card" style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 20px;
                        border-radius: 18px;
                        border: 1px solid #333;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    ">
                        <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Quick Actions</h3>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <button style="
                                background: #4a90e2;
                                border: 1px solid #5ba0f2;
                                color: #fff;
                                padding: 12px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s ease;
                                width: 100%;
                            " onmouseover="this.style.background='#5ba0f2'" onmouseout="this.style.background='#4a90e2'"
                               onclick="crmApp.showAddContactForm('${accountId}')">
                                Add Contact
                            </button>
                            <button style="
                                background: #28a745;
                                border: 1px solid #34ce57;
                                color: #fff;
                                padding: 12px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s ease;
                                width: 100%;
                            " onmouseover="this.style.background='#34ce57'" onmouseout="this.style.background='#28a745'"
                               onclick="crmApp.addAccountNote('${accountId}')">
                                Add Note
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        accountsView.innerHTML = accountDetailsHTML;
        
        // Apply the same layout styles
        const layoutStyles = `
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
        accountsView.style.cssText = layoutStyles;
    },

    // Extract domain from account name for favicon
    extractDomainFromAccountName(accountName) {
        if (!accountName) return null;
        
        // Common patterns to extract domain
        const patterns = [
            // Direct domain patterns
            /([a-zA-Z0-9-]+\.(com|org|net|edu|gov|co\.uk|ca|au|de|fr|jp|cn|in|br|mx|it|es|ru|nl|se|no|dk|fi|pl|cz|hu|gr|pt|ie|be|ch|at|sk|si|hr|bg|ro|lt|lv|ee|lu|mt|cy))/i,
            // Company name to domain patterns
            /^([a-zA-Z0-9\s&-]+)/
        ];
        
        for (const pattern of patterns) {
            const match = accountName.match(pattern);
            if (match) {
                let domain = match[1].toLowerCase();
                // If it's not already a domain, try to convert company name to domain
                if (!domain.includes('.')) {
                    domain = domain.replace(/\s+/g, '').replace(/&/g, 'and') + '.com';
                }
                return domain;
            }
        }
        
        return null;
    },

    // Show individual contact details page
    showContactDetails(contactId) {
        console.log(`Showing contact details for ID: ${contactId}`);
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) {
            console.error('Contact not found:', contactId);
            return;
        }

        // Find the account for this contact
        const account = this.accounts.find(a => a.id === contact.accountId);
        
        // Get activities for this contact
        const contactActivities = this.activities.filter(a => a.contactId === contactId);

        // Extract domain for company favicon (if account exists)
        const domain = account ? this.extractDomainFromAccountName(account.name) : null;
        const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';

        // Switch to contacts view and show contact details
        const contactsView = document.getElementById('contacts-view');
        if (!contactsView) return;

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
                    <button onclick="CRMApp.renderContactsPage()" style="
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Back to Contacts
                    </button>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        ${faviconUrl ? `<img src="${faviconUrl}" alt="${account?.name || 'Company'}" style="width: 48px; height: 48px; border-radius: 8px;" onerror="this.style.display='none'">` : ''}
                        <h2 style="margin: 0; color: #fff; font-size: 28px; font-weight: 600;">${contact.firstName} ${contact.lastName}</h2>
                    </div>
                </div>
            </div>

            <div class="contact-details-content" style="display: flex; gap: 20px; flex: 1; overflow: hidden;">
                <!-- Contact Info Section -->
                <div class="contact-info-section" style="
                    flex: 2;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    min-width: 0;
                ">
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
                                <div style="color: #fff; font-size: 16px; font-weight: 500;">${contact.firstName} ${contact.lastName}</div>
                            </div>
                            <div>
                                <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Email</label>
                                <div style="color: #fff; font-size: 16px;">${contact.email || 'N/A'}</div>
                            </div>
                            <div>
                                <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Phone</label>
                                <div style="color: #fff; font-size: 16px;">${contact.phone || 'N/A'}</div>
                            </div>
                            <div>
                                <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Job Title</label>
                                <div style="color: #fff; font-size: 16px;">${contact.title || 'N/A'}</div>
                            </div>
                            <div>
                                <label style="color: #ccc; font-size: 14px; margin-bottom: 4px; display: block;">Company</label>
                                <div style="color: #fff; font-size: 16px;">
                                    ${account ? `<span style="cursor: pointer; text-decoration: none;" onclick="CRMApp.showAccountDetails('${account.id}')" onmouseover="this.style.color='#ccc'" onmouseout="this.style.color='#fff'">${account.name}</span>` : contact.accountName || 'N/A'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Contact Activities -->
                    <div class="contact-activities-card" style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 24px;
                        border-radius: 18px;
                        border: 1px solid #333;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                    ">
                        <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Recent Activities (${contactActivities.length})</h3>
                        <div style="flex: 1; overflow-y: auto; max-height: 300px;">
                            ${contactActivities.length > 0 ? contactActivities.slice(0, 10).map(activity => `
                                <div style="
                                    padding: 12px 0;
                                    border-bottom: 1px solid #333;
                                ">
                                    <div style="color: #fff; font-size: 14px; margin-bottom: 4px;">
                                        ${activity.description}
                                    </div>
                                    <div style="color: #888; font-size: 12px;">
                                        ${new Date(activity.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            `).join('') : '<div style="color: #888; font-style: italic; text-align: center; padding: 20px;">No recent activities</div>'}
                        </div>
                    </div>
                </div>

                <!-- Widget Panel (same as other pages) -->
                <div id="contact-widget-panel" style="
                    flex: 1;
                    min-width: 300px;
                    max-width: 400px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                ">
                    <!-- Quick Actions -->
                    <div class="widget-card" style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 20px;
                        border-radius: 18px;
                        border: 1px solid #333;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    ">
                        <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Quick Actions</h3>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <button style="
                                background: #4a90e2;
                                border: 1px solid #5ba0f2;
                                color: #fff;
                                padding: 12px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s ease;
                                width: 100%;
                            " onmouseover="this.style.background='#5ba0f2'" onmouseout="this.style.background='#4a90e2'"
                               onclick="CRMApp.addContactCall('${contactId}')">
                                Log Call
                            </button>
                            <button style="
                                background: #28a745;
                                border: 1px solid #34ce57;
                                color: #fff;
                                padding: 12px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s ease;
                                width: 100%;
                            " onmouseover="this.style.background='#34ce57'" onmouseout="this.style.background='#28a745'"
                               onclick="CRMApp.addContactNote('${contactId}')">
                                Add Note
                            </button>
                            <button style="
                                background: #dc3545;
                                border: 1px solid #e74c3c;
                                color: #fff;
                                padding: 12px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s ease;
                                width: 100%;
                            " onmouseover="this.style.background='#e74c3c'" onmouseout="this.style.background='#dc3545'"
                               onclick="CRMApp.sendContactEmail('${contactId}')">
                                Send Email
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        contactsView.innerHTML = contactDetailsHTML;
        
        // Apply the same layout styles
        const layoutStyles = `
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
        contactsView.style.cssText = layoutStyles;
    },

    // Update pagination controls for accounts
    updateAccountsPaginationControls(currentPage, totalPages, totalAccounts) {
        const paginationControls = document.getElementById('accounts-pagination-controls');
        const prevButton = document.getElementById('accounts-prev-page');
        const nextButton = document.getElementById('accounts-next-page');
        const pageInfo = document.getElementById('accounts-page-info');
        
        if (!paginationControls) return;
        
        // Show/hide pagination based on total accounts
        if (totalAccounts > 50) {
            paginationControls.style.display = 'flex';
        } else {
            paginationControls.style.display = 'none';
        }
        
        // Update page info
        if (pageInfo) {
            pageInfo.textContent = `${currentPage} / ${Math.max(1, totalPages)}`;
        }
        
        // Update button states
        if (prevButton) {
            prevButton.disabled = currentPage <= 1;
            prevButton.style.opacity = currentPage <= 1 ? '0.5' : '1';
            prevButton.style.cursor = currentPage <= 1 ? 'not-allowed' : 'pointer';
        }
        
        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
            nextButton.style.opacity = currentPage >= totalPages ? '0.5' : '1';
            nextButton.style.cursor = currentPage >= totalPages ? 'not-allowed' : 'pointer';
        }
    },

    initSimpleContactsUI() {
        console.log("Initializing simple contacts UI");
        console.log(`Found ${this.contacts ? this.contacts.length : 0} contacts from Firebase`);
        
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
    renderSimpleContactsTable(searchTerm = '', contactsToRender = null) {
        console.log("Rendering simple contacts table, search:", searchTerm);
        
        const tableBody = document.getElementById('contacts-table-body-simple');
        const contactsCount = document.getElementById('contacts-count-simple');
        const accountFilter = document.getElementById('account-filter-simple');
        
        if (!tableBody || !contactsCount) {
            console.log("Table elements not found");
            return;
        }
        
        // Use provided contacts or filter from all contacts
        let filteredContacts = contactsToRender || this.contacts || [];
        console.log("Initial contacts for rendering:", filteredContacts.length, filteredContacts);
        
        // If no specific contacts provided, apply filters
        if (!contactsToRender) {
            if (searchTerm) {
                filteredContacts = filteredContacts.filter(contact => 
                    (contact.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (contact.lastName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (contact.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (contact.accountName || '').toLowerCase().includes(searchTerm.toLowerCase())
                );
            }
            
            if (accountFilter && accountFilter.value) {
                filteredContacts = filteredContacts.filter(contact => 
                    contact.accountName === accountFilter.value
                );
            }
            
            // Pagination logic (simplified for now)
            const contactsPerPage = 50;
            if (filteredContacts.length > contactsPerPage) {
                filteredContacts = filteredContacts.slice(0, contactsPerPage);
                console.log(`Showing first ${contactsPerPage} of ${filteredContacts.length} contacts`);
            }
        }
        
        // Update count
        contactsCount.textContent = `${filteredContacts.length} contact${filteredContacts.length !== 1 ? 's' : ''}`;
        console.log("About to render table rows for", filteredContacts.length, "contacts");
        
        // Render table rows
        if (filteredContacts.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="padding: 40px; text-align: center; color: #888; font-style: italic;">No contacts found</td></tr>';
        } else {
            tableBody.innerHTML = filteredContacts.map(contact => `
                <tr style="border-bottom: 1px solid #333; transition: background-color 0.2s ease;" 
                    onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" 
                    onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding: 16px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <span onclick="CRMApp.showContactDetails('${contact.id}')" style="
                            cursor: pointer;
                            color: #fff;
                            font-weight: 500;
                            text-decoration: none;
                        " 
                        onmouseover="this.style.color='#ccc'"
                        onmouseout="this.style.color='#fff'">
                            ${(contact.firstName || '') + ' ' + (contact.lastName || '')}
                        </span>
                    </td>
                    <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${contact.phone || 'N/A'}</td>
                    <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${contact.email || 'N/A'}</td>
                    <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${contact.accountName || 'N/A'}</td>
                    <td style="padding: 16px; white-space: nowrap;">
                        <button onclick="CRMApp.showContactDetails('${contact.id}')" style="
                            background: #4a90e2;
                            border: 1px solid #5ba0f2;
                            color: #fff;
                            padding: 6px 12px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: all 0.2s ease;
                        " onmouseover="this.style.background='#5ba0f2'" onmouseout="this.style.background='#4a90e2'">
                            View
                        </button>
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
        
        const companies = [...new Set((this.contacts || []).map(c => c.accountName).filter(Boolean))];
        
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

    // Show individual contact detail view
    showContactDetail(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) {
            console.error('Contact not found:', contactId);
            return;
        }

        this.currentContact = contact;
        this.renderContactDetailView(contact);
        this.showView('contact-detail-view');
    },

    // MD5 hash function for Gravatar
    md5(string) {
        function md5cycle(x, k) {
            var a = x[0], b = x[1], c = x[2], d = x[3];
            a = ff(a, b, c, d, k[0], 7, -680876936);
            d = ff(d, a, b, c, k[1], 12, -389564586);
            c = ff(c, d, a, b, k[2], 17, 606105819);
            b = ff(b, c, d, a, k[3], 22, -1044525330);
            a = ff(a, b, c, d, k[4], 7, -176418897);
            d = ff(d, a, b, c, k[5], 12, 1200080426);
            c = ff(c, d, a, b, k[6], 17, -1473231341);
            b = ff(b, c, d, a, k[7], 22, -45705983);
            a = ff(a, b, c, d, k[8], 7, 1770035416);
            d = ff(d, a, b, c, k[9], 12, -1958414417);
            c = ff(c, d, a, b, k[10], 17, -42063);
            b = ff(b, c, d, a, k[11], 22, -1990404162);
            a = ff(a, b, c, d, k[12], 7, 1804603682);
            d = ff(d, a, b, c, k[13], 12, -40341101);
            c = ff(c, d, a, b, k[14], 17, -1502002290);
            b = ff(b, c, d, a, k[15], 22, 1236535329);
            a = gg(a, b, c, d, k[1], 5, -165796510);
            d = gg(d, a, b, c, k[6], 9, -1069501632);
            c = gg(c, d, a, b, k[11], 14, 643717713);
            b = gg(b, c, d, a, k[0], 20, -373897302);
            a = gg(a, b, c, d, k[5], 5, -701558691);
            d = gg(d, a, b, c, k[10], 9, 38016083);
            c = gg(c, d, a, b, k[15], 14, -660478335);
            b = gg(b, c, d, a, k[4], 20, -405537848);
            a = gg(a, b, c, d, k[9], 5, 568446438);
            d = gg(d, a, b, c, k[14], 9, -1019803690);
            c = gg(c, d, a, b, k[3], 14, -187363961);
            b = gg(b, c, d, a, k[8], 20, 1163531501);
            a = gg(a, b, c, d, k[13], 5, -1444681467);
            d = gg(d, a, b, c, k[2], 9, -51403784);
            c = gg(c, d, a, b, k[7], 14, 1735328473);
            b = gg(b, c, d, a, k[12], 20, -1926607734);
            a = hh(a, b, c, d, k[5], 4, -378558);
            d = hh(d, a, b, c, k[8], 11, -2022574463);
            c = hh(c, d, a, b, k[11], 16, 1839030562);
            b = hh(b, c, d, a, k[14], 23, -35309556);
            a = hh(a, b, c, d, k[1], 4, -1530992060);
            d = hh(d, a, b, c, k[4], 11, 1272893353);
            c = hh(c, d, a, b, k[7], 16, -155497632);
            b = hh(b, c, d, a, k[10], 23, -1094730640);
            a = hh(a, b, c, d, k[13], 4, 681279174);
            d = hh(d, a, b, c, k[0], 11, -358537222);
            c = hh(c, d, a, b, k[3], 16, -722521979);
            b = hh(b, c, d, a, k[6], 23, 76029189);
            a = hh(a, b, c, d, k[9], 4, -640364487);
            d = hh(d, a, b, c, k[12], 11, -421815835);
            c = hh(c, d, a, b, k[15], 16, 530742520);
            b = hh(b, c, d, a, k[2], 23, -995338651);
            a = ii(a, b, c, d, k[0], 6, -198630844);
            d = ii(d, a, b, c, k[7], 10, 1126891415);
            c = ii(c, d, a, b, k[14], 15, -1416354905);
            b = ii(b, c, d, a, k[5], 21, -57434055);
            a = ii(a, b, c, d, k[12], 6, 1700485571);
            d = ii(d, a, b, c, k[3], 10, -1894986606);
            c = ii(c, d, a, b, k[10], 15, -1051523);
            b = ii(b, c, d, a, k[1], 21, -2054922799);
            a = ii(a, b, c, d, k[8], 6, 1873313359);
            d = ii(d, a, b, c, k[15], 10, -30611744);
            c = ii(c, d, a, b, k[6], 15, -1560198380);
            b = ii(b, c, d, a, k[13], 21, 1309151649);
            a = ii(a, b, c, d, k[4], 6, -145523070);
            d = ii(d, a, b, c, k[11], 10, -1120210379);
            c = ii(c, d, a, b, k[2], 15, 718787259);
            b = ii(b, c, d, a, k[9], 21, -343485551);
            x[0] = add32(a, x[0]);
            x[1] = add32(b, x[1]);
            x[2] = add32(c, x[2]);
            x[3] = add32(d, x[3]);
        }
        function cmn(q, a, b, x, s, t) {
            a = add32(add32(a, q), add32(x, t));
            return add32((a << s) | (a >>> (32 - s)), b);
        }
        function ff(a, b, c, d, x, s, t) {
            return cmn((b & c) | ((~b) & d), a, b, x, s, t);
        }
        function gg(a, b, c, d, x, s, t) {
            return cmn((b & d) | (c & (~d)), a, b, x, s, t);
        }
        function hh(a, b, c, d, x, s, t) {
            return cmn(b ^ c ^ d, a, b, x, s, t);
        }
        function ii(a, b, c, d, x, s, t) {
            return cmn(c ^ (b | (~d)), a, b, x, s, t);
        }
        function md51(s) {
            var n = s.length,
                state = [1732584193, -271733879, -1732584194, 271733878], i;
            for (i = 64; i <= s.length; i += 64) {
                md5cycle(state, md5blk(s.substring(i - 64, i)));
            }
            s = s.substring(i - 64);
            var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (i = 0; i < s.length; i++)
                tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
            tail[i >> 2] |= 0x80 << ((i % 4) << 3);
            if (i > 55) {
                md5cycle(state, tail);
                for (i = 0; i < 16; i++) tail[i] = 0;
            }
            tail[14] = n * 8;
            md5cycle(state, tail);
            return state;
        }
        function md5blk(s) {
            var md5blks = [], i;
            for (i = 0; i < 64; i += 4) {
                md5blks[i >> 2] = s.charCodeAt(i)
                    + (s.charCodeAt(i + 1) << 8)
                    + (s.charCodeAt(i + 2) << 16)
                    + (s.charCodeAt(i + 3) << 24);
            }
            return md5blks;
        }
        var hex_chr = '0123456789abcdef'.split('');
        function rhex(n) {
            var s = '', j = 0;
            for (; j < 4; j++)
                s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
                    + hex_chr[(n >> (j * 8)) & 0x0F];
            return s;
        }
        function hex(x) {
            for (var i = 0; i < x.length; i++)
                x[i] = rhex(x[i]);
            return x.join('');
        }
        function add32(a, b) {
            return (a + b) & 0xFFFFFFFF;
        }
        return hex(md51(string));
    },

    // Render the Apollo.io-style contact detail view
    renderContactDetailView(contact) {
        const contactDetailView = document.getElementById('contact-detail-view');
        if (!contactDetailView) return;

        // Get profile picture from email (Gravatar)
        const getProfilePicture = (email) => {
            if (!email) return 'https://via.placeholder.com/80x80/333/fff?text=' + (contact.name ? contact.name.charAt(0).toUpperCase() : '?');
            const hash = this.md5(email.toLowerCase().trim());
            return `https://www.gravatar.com/avatar/${hash}?s=80&d=identicon`;
        };

        // Get company favicon
        const getCompanyFavicon = (domain) => {
            if (!domain) return 'https://via.placeholder.com/24x24/666/fff?text=C';
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=24`;
        };

        // Extract domain from email or website
        const getCompanyDomain = (contact) => {
            if (contact.website) {
                return contact.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
            }
            if (contact.email) {
                return contact.email.split('@')[1];
            }
            return null;
        };

        const companyDomain = getCompanyDomain(contact);
        const profilePic = getProfilePicture(contact.email);
        const companyFavicon = getCompanyFavicon(companyDomain);
        const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown Contact';

        contactDetailView.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                height: calc(100vh - 120px);
                background: #1a1a1a;
                color: #fff;
                margin-top: 32px;
                padding: 20px;
                border-radius: 20px;
                overflow-y: auto;
                gap: 20px;
            ">
                <!-- Back Button -->
                <div style="margin-bottom: 10px;">
                    <button onclick="CRMApp.showView('contacts-view')" style="
                        background: rgba(30, 60, 120, 0.4);
                        border: 1px solid rgba(30, 60, 120, 0.6);
                        color: #fff;
                        padding: 8px 16px;
                        border-radius: 8px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 14px;
                    ">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Back to Contacts
                    </button>
                </div>

                <!-- Contact Header with Profile -->
                <div style="
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 24px;
                    border-radius: 18px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    display: flex;
                    align-items: center;
                    gap: 20px;
                ">
                    <!-- Profile Picture -->
                    <img src="${profilePic}" alt="${contactName}" style="
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        border: 3px solid rgba(30, 60, 120, 0.6);
                        object-fit: cover;
                    ">
                    
                    <!-- Contact Info -->
                    <div style="flex: 1;">
                        <h1 style="
                            margin: 0 0 8px 0;
                            font-size: 28px;
                            font-weight: 700;
                            color: #fff;
                            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                        ">${contactName}</h1>
                        
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                            ${contact.company ? `
                                <img src="${companyFavicon}" alt="Company" style="width: 24px; height: 24px; border-radius: 4px;">
                                <span style="color: #ccc; font-size: 16px;">${contact.company}</span>
                            ` : '<span style="color: #888;">No company specified</span>'}
                        </div>
                        
                        <!-- Quick Actions -->
                        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                            ${contact.email ? `
                                <button onclick="window.open('mailto:${contact.email}', '_blank')" style="
                                    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                                    border: none;
                                    color: white;
                                    padding: 8px 16px;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    font-size: 14px;
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                ">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                                    </svg>
                                    Email
                                </button>
                            ` : ''}
                            
                            ${contact.phone ? `
                                <button onclick="window.open('tel:${contact.phone}', '_blank')" style="
                                    background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
                                    border: none;
                                    color: white;
                                    padding: 8px 16px;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    font-size: 14px;
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                ">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                                    </svg>
                                    Call
                                </button>
                            ` : ''}
                            
                            <button onclick="CRMApp.createTaskForContact('${contact.id}')" style="
                                background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
                                border: none;
                                color: white;
                                padding: 8px 16px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                                </svg>
                                Create Task
                            </button>
                            
                            <button onclick="CRMApp.addToSequence('${contact.id}')" style="
                                background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%);
                                border: none;
                                color: white;
                                padding: 8px 16px;
                                border-radius: 8px;
                                cursor: pointer;
                                font-size: 14px;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H9V15H11V17M11,13H9V7H11V13Z"/>
                                </svg>
                                Add to Sequence
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Main Content Area - All Content Flows Together -->
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <!-- Top Row: Notes (Square) + Contact Information -->
                    <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                        <!-- Notes Section (Square Widget) -->
                        <div style="
                            flex: 0 0 300px;
                            height: 300px;
                            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                            padding: 20px;
                            border-radius: 18px;
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                            display: flex;
                            flex-direction: column;
                        ">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                <h3 style="margin: 0; color: #fff; font-size: 18px;">Notes</h3>
                                <button onclick="CRMApp.addNoteToActivity('${contact.id}')" style="
                                    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                                    border: none;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-size: 12px;
                                    font-weight: 500;
                                    display: flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                                    </svg>
                                    Add Note
                                </button>
                            </div>
                            <textarea 
                                id="contact-notes-${contact.id}"
                                placeholder="Add notes about this contact..."
                                style="
                                    flex: 1;
                                    width: 100%;
                                    background: rgba(0, 0, 0, 0.3);
                                    border: 1px solid rgba(255, 255, 255, 0.1);
                                    border-radius: 8px;
                                    padding: 12px;
                                    color: #fff;
                                    font-family: inherit;
                                    font-size: 14px;
                                    resize: none;
                                "
                                onblur="CRMApp.saveContactNotes('${contact.id}', this.value)"
                            >${contact.notes || ''}</textarea>
                        </div>

                        <!-- Contact Information -->
                        <div style="
                            flex: 1;
                            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                            padding: 20px;
                            border-radius: 18px;
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        ">
                            <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Contact Information</h3>
                            <div style="display: grid; gap: 12px;">
                                ${this.renderEditableField('Email', contact.email, 'email', contact.id)}
                                ${this.renderEditableField('Phone', contact.phone, 'phone', contact.id)}
                                ${this.renderEditableField('Company', contact.company, 'company', contact.id)}
                                ${this.renderEditableField('Title', contact.title, 'title', contact.id)}
                                ${this.renderEditableField('Location', contact.location, 'location', contact.id)}
                            </div>
                        </div>
                    </div>

                    <!-- Company Information (Full Width Rectangle) -->
                    ${contact.company ? `
                        <div style="
                            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                            padding: 20px;
                            border-radius: 18px;
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                            margin-bottom: 20px;
                        ">
                            <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                                <img src="${companyFavicon}" alt="Company" style="width: 24px; height: 24px; border-radius: 4px;">
                                Company Information
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
                                <div style="color: #ccc;">Company: <strong style="color: #fff;">${contact.company}</strong></div>
                                ${companyDomain ? `<div style="color: #ccc;">Domain: <strong style="color: #fff;">${companyDomain}</strong></div>` : ''}
                                ${contact.industry ? `<div style="color: #ccc;">Industry: <strong style="color: #fff;">${contact.industry}</strong></div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Recent Activity (Full Width Rectangle) -->
                    <div style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 20px;
                        border-radius: 18px;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        margin-bottom: 20px;
                    ">
                        <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Recent Activity</h3>
                        <div class="recent-activity-content" style="color: #888; font-style: italic;">
                            ${this.renderContactActivities(contact.id)}
                        </div>
                    </div>

                    <!-- Associated Accounts (Full Width Rectangle) -->
                    <div style="
                        background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                        padding: 20px;
                        border-radius: 18px;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        margin-bottom: 20px;
                    ">
                        <h3 style="margin: 0 0 16px 0; color: #fff; font-size: 18px;">Associated Accounts</h3>
                        ${this.renderAssociatedAccounts(contact)}
                    </div>
                </div>
            </div>
        `;
    },

    // Render an editable field with hover actions
    renderEditableField(label, value, fieldType, contactId) {
        const displayValue = value || 'Not specified';
        const isEmpty = !value;
        
        return `
            <div class="editable-field" style="
                position: relative;
                padding: 12px;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                transition: all 0.3s ease;
            " 
            onmouseenter="this.style.background='rgba(0, 0, 0, 0.4)'; this.querySelector('.field-actions').style.opacity='1';"
            onmouseleave="this.style.background='rgba(0, 0, 0, 0.2)'; this.querySelector('.field-actions').style.opacity='0';">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #888; font-size: 12px; margin-bottom: 4px;">${label}</div>
                        <div style="color: ${isEmpty ? '#666' : '#fff'}; font-size: 14px;">${displayValue}</div>
                    </div>
                    <div class="field-actions" style="
                        opacity: 0;
                        transition: opacity 0.3s ease;
                        display: flex;
                        gap: 8px;
                    ">
                        ${!isEmpty ? `
                            <button onclick="CRMApp.copyToClipboard('${value}')" style="
                                background: rgba(76, 175, 80, 0.2);
                                border: 1px solid rgba(76, 175, 80, 0.4);
                                color: #4CAF50;
                                padding: 4px 8px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            " title="Copy">
                                📋
                            </button>
                        ` : ''}
                        <button onclick="CRMApp.editContactField('${contactId}', '${fieldType}', '${label}')" style="
                            background: rgba(33, 150, 243, 0.2);
                            border: 1px solid rgba(33, 150, 243, 0.4);
                            color: #2196F3;
                            padding: 4px 8px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        " title="Edit">
                            ✏️
                        </button>
                        ${!isEmpty ? `
                            <button onclick="CRMApp.deleteContactField('${contactId}', '${fieldType}')" style="
                                background: rgba(244, 67, 54, 0.2);
                                border: 1px solid rgba(244, 67, 54, 0.4);
                                color: #f44336;
                                padding: 4px 8px;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            " title="Delete">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    // Render associated accounts
    renderAssociatedAccounts(contact) {
        const associatedAccounts = this.accounts.filter(account => 
            account.company === contact.company || 
            (contact.email && account.domain === contact.email.split('@')[1])
        );

        if (associatedAccounts.length === 0) {
            return '<div style="color: #888; font-style: italic;">No associated accounts found</div>';
        }

        return associatedAccounts.map(account => `
            <div style="
                padding: 12px;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                margin-bottom: 8px;
                cursor: pointer;
            " onclick="CRMApp.showAccountDetail('${account.id}')">
                <div style="color: #fff; font-weight: 600; margin-bottom: 4px;">${account.name || account.company}</div>
                <div style="color: #ccc; font-size: 12px;">${account.industry || 'Unknown industry'}</div>
            </div>
        `).join('');
    },

    // Copy text to clipboard
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            this.showToast('Failed to copy to clipboard', 'error');
        });
    },

    // Edit contact field
    editContactField(contactId, fieldType, label) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) return;

        const currentValue = contact[fieldType] || '';
        const newValue = prompt(`Edit ${label}:`, currentValue);
        
        if (newValue !== null && newValue !== currentValue) {
            contact[fieldType] = newValue;
            this.updateContactInFirebase(contactId, { [fieldType]: newValue });
            this.renderContactDetailView(contact);
            this.showToast(`${label} updated successfully!`, 'success');
        }
    },

    // Delete contact field
    deleteContactField(contactId, fieldType) {
        if (confirm(`Are you sure you want to delete this field?`)) {
            const contact = this.contacts.find(c => c.id === contactId);
            if (!contact) return;

            contact[fieldType] = '';
            this.updateContactInFirebase(contactId, { [fieldType]: '' });
            this.renderContactDetailView(contact);
            this.showToast('Field deleted successfully!', 'success');
        }
    },

    // Save contact notes
    saveContactNotes(contactId, notes) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) return;

        contact.notes = notes;
        this.updateContactInFirebase(contactId, { notes: notes });
        this.showToast('Notes saved!', 'success');
    },

    // Update contact in Firebase
    async updateContactInFirebase(contactId, updates) {
        try {
            if (typeof db !== 'undefined') {
                await db.collection('contacts').doc(contactId).update(updates);
                console.log('Contact updated in Firebase:', contactId, updates);
            }
        } catch (error) {
            console.error('Error updating contact in Firebase:', error);
            this.showToast('Failed to save changes to database', 'error');
        }
    },

    // Create task for contact
    createTaskForContact(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) return;

        const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown Contact';
        const taskDescription = prompt(`Create a task for ${contactName}:`, `Follow up with ${contactName}`);
        
        if (taskDescription) {
            // Here you would typically save to Firebase tasks collection
            this.showToast(`Task created: ${taskDescription}`, 'success');
            console.log('Task created for contact:', contactId, taskDescription);
        }
    },

    // Add contact to sequence
    addToSequence(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) return;

        const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown Contact';
        // Here you would typically show a sequence selection dialog
        this.showToast(`${contactName} added to email sequence!`, 'success');
        console.log('Contact added to sequence:', contactId);
    },

    // Add note to contact's recent activities
    addNoteToActivity(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) return;

        const noteTextarea = document.getElementById(`contact-notes-${contactId}`);
        const noteContent = noteTextarea ? noteTextarea.value.trim() : '';
        
        if (!noteContent) {
            this.showToast('Please add some content to the note first!', 'warning');
            return;
        }

        const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown Contact';
        
        // Create activity entry
        const activity = {
            id: Date.now().toString(),
            type: 'note',
            contactId: contactId,
            contactName: contactName,
            content: noteContent,
            createdAt: new Date(),
            timestamp: new Date().toISOString()
        };

        // Add to activities array
        if (!this.activities) {
            this.activities = [];
        }
        this.activities.unshift(activity); // Add to beginning of array

        // Save to Firebase if available
        this.saveActivityToFirebase(activity);

        // Clear the note textarea
        if (noteTextarea) {
            noteTextarea.value = '';
        }

        // Update the recent activity section in the current view
        this.updateRecentActivityDisplay(contactId);

        this.showToast('Note added to recent activities!', 'success');
        console.log('Note added to activities:', activity);
    },

    // Save activity to Firebase
    async saveActivityToFirebase(activity) {
        try {
            if (typeof db !== 'undefined') {
                await db.collection('activities').add(activity);
                console.log('Activity saved to Firebase:', activity.id);
            }
        } catch (error) {
            console.error('Error saving activity to Firebase:', error);
        }
    },

    // Update recent activity display
    updateRecentActivityDisplay(contactId) {
        const contactActivities = this.activities.filter(activity => 
            activity.contactId === contactId
        ).slice(0, 5); // Show last 5 activities

        const activityContainer = document.querySelector('#contact-detail-view .recent-activity-content');
        if (activityContainer) {
            if (contactActivities.length === 0) {
                activityContainer.innerHTML = '<div style="color: #888; font-style: italic;">No recent activity</div>';
            } else {
                activityContainer.innerHTML = contactActivities.map(activity => `
                    <div style="
                        padding: 12px;
                        background: rgba(0, 0, 0, 0.2);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 8px;
                        margin-bottom: 8px;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="color: #4CAF50; font-weight: 500; font-size: 12px;">📝 Note Added</span>
                            <span style="color: #888; font-size: 11px;">${this.formatActivityDate(activity.createdAt)}</span>
                        </div>
                        <div style="color: #ccc; font-size: 13px; line-height: 1.4;">${activity.content}</div>
                    </div>
                `).join('');
            }
        }
    },

    // Format activity date for display
    formatActivityDate(date) {
        const now = new Date();
        const activityDate = new Date(date);
        const diffMs = now - activityDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return activityDate.toLocaleDateString();
    },

    // Render contact activities for initial load
    renderContactActivities(contactId) {
        if (!this.activities) {
            return 'No recent activity';
        }

        const contactActivities = this.activities.filter(activity => 
            activity.contactId === contactId
        ).slice(0, 5); // Show last 5 activities

        if (contactActivities.length === 0) {
            return 'No recent activity';
        }

        return contactActivities.map(activity => `
            <div style="
                padding: 12px;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                margin-bottom: 8px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="color: #4CAF50; font-weight: 500; font-size: 12px;">
                        ${activity.type === 'note' ? '📝 Note Added' : '📋 Activity'}
                    </span>
                    <span style="color: #888; font-size: 11px;">${this.formatActivityDate(activity.createdAt)}</span>
                </div>
                <div style="color: #ccc; font-size: 13px; line-height: 1.4;">${activity.content}</div>
            </div>
        `).join('');
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

    // Tasks page functionality
    initSimpleTasksUI() {
        console.log("Initializing simple tasks UI");
        
        // Initialize tasks data if not present
        if (!this.tasks) {
            this.tasks = this.generateSampleTasks();
        }
        
        // Initialize pagination
        this.currentTasksPage = 1;
        this.currentTaskType = 'all';
        
        // Render initial tasks table
        this.renderSimpleTasksTable();
        
        // Update task counts in tabs
        this.updateTaskCounts();
    },

    generateSampleTasks() {
        const taskTypes = ['call', 'email', 'linkedin'];
        const priorities = ['high', 'medium', 'low'];
        const statuses = ['pending', 'in-progress', 'completed'];
        const sampleTasks = [];

        // Generate sample tasks based on existing contacts and accounts
        const contacts = this.contacts || [];
        const accounts = this.accounts || [];

        for (let i = 0; i < 75; i++) {
            const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
            const priority = priorities[Math.floor(Math.random() * priorities.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            
            // Randomly assign to contact or account
            const useContact = Math.random() > 0.5;
            const contact = useContact && contacts.length > 0 ? contacts[Math.floor(Math.random() * contacts.length)] : null;
            const account = accounts.length > 0 ? accounts[Math.floor(Math.random() * accounts.length)] : null;

            const taskDescriptions = {
                call: ['Follow up call', 'Discovery call', 'Demo call', 'Check-in call'],
                email: ['Send proposal', 'Follow up email', 'Introduction email', 'Thank you email'],
                linkedin: ['Connect on LinkedIn', 'Send LinkedIn message', 'Endorse skills', 'Share content']
            };

            const descriptions = taskDescriptions[taskType];
            const description = descriptions[Math.floor(Math.random() * descriptions.length)];

            // Generate due date (some past, some future)
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 30) - 15);

            sampleTasks.push({
                id: `task-${i + 1}`,
                type: taskType,
                description: description,
                priority: priority,
                status: status,
                dueDate: dueDate,
                contactId: contact?.id || null,
                contactName: contact ? `${contact.firstName} ${contact.lastName}` : null,
                accountId: account?.id || null,
                accountName: account?.name || null,
                createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
            });
        }

        return sampleTasks;
    },

    switchTaskTab(taskType) {
        console.log(`Switching to task tab: ${taskType}`);
        this.currentTaskType = taskType;
        this.currentTasksPage = 1; // Reset to first page when switching tabs

        // Update tab styling
        document.querySelectorAll('.task-tab').forEach(tab => {
            tab.style.background = 'transparent';
            tab.style.color = '#ccc';
        });

        const activeTab = document.getElementById(`${taskType === 'all' ? 'all' : taskType === 'calls' ? 'call' : taskType === 'emails' ? 'email' : 'linkedin'}-tasks-tab`);
        if (activeTab) {
            activeTab.style.background = 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)';
            activeTab.style.color = '#fff';
        }

        // Update header title
        const header = document.querySelector('.tasks-header h2');
        if (header) {
            const titles = {
                all: 'All Tasks',
                calls: 'Call Tasks',
                emails: 'Email Tasks',
                linkedin: 'LinkedIn Tasks'
            };
            header.textContent = titles[taskType] || 'All Tasks';
        }

        // Re-render table with filtered tasks
        this.renderSimpleTasksTable();
    },

    renderSimpleTasksTable(searchTerm = '', tasksToRender = null) {
        console.log("Rendering simple tasks table, search:", searchTerm);
        
        const tableBody = document.getElementById('tasks-table-body-simple');
        const tasksCount = document.getElementById('tasks-count-simple');
        
        if (!tableBody || !tasksCount) {
            console.log("Table elements not found");
            return;
        }
        
        // Use provided tasks or filter from all tasks
        let filteredTasks = tasksToRender || this.tasks || [];
        console.log("Initial tasks for rendering:", filteredTasks.length);
        
        // If no specific tasks provided, apply filters
        if (!tasksToRender) {
            // Filter by task type (tab)
            if (this.currentTaskType !== 'all') {
                const typeMap = { calls: 'call', emails: 'email', linkedin: 'linkedin' };
                filteredTasks = filteredTasks.filter(task => task.type === typeMap[this.currentTaskType]);
            }

            // Apply search filter
            if (searchTerm) {
                filteredTasks = filteredTasks.filter(task =>
                    (task.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (task.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (task.accountName || '').toLowerCase().includes(searchTerm.toLowerCase())
                );
            }
            
            // Apply priority filter
            const priorityFilter = document.getElementById('task-priority-filter');
            if (priorityFilter && priorityFilter.value) {
                filteredTasks = filteredTasks.filter(task => task.priority === priorityFilter.value);
            }

            // Apply status filter
            const statusFilter = document.getElementById('task-status-filter');
            if (statusFilter && statusFilter.value) {
                filteredTasks = filteredTasks.filter(task => task.status === statusFilter.value);
            }
        }
        
        // Pagination logic
        const tasksPerPage = 50;
        const totalPages = Math.ceil(filteredTasks.length / tasksPerPage);
        const currentPage = this.currentTasksPage || 1;
        const startIndex = (currentPage - 1) * tasksPerPage;
        const endIndex = startIndex + tasksPerPage;
        const paginatedTasks = filteredTasks.slice(startIndex, endIndex);
        
        // Update count
        tasksCount.textContent = `${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''}`;
        
        // Update pagination controls
        this.updateTasksPaginationControls(currentPage, totalPages, filteredTasks.length);
        
        // Render table rows
        if (paginatedTasks.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="padding: 40px; text-align: center; color: #888; font-style: italic;">No tasks found</td></tr>';
        } else {
            tableBody.innerHTML = paginatedTasks.map(task => {
                const priorityColors = {
                    high: '#ff6b6b',
                    medium: '#ffa726',
                    low: '#66bb6a'
                };

                const typeIcons = {
                    call: '📞',
                    email: '✉️',
                    linkedin: '💼'
                };

                const dueDateFormatted = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date';
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';

                return `
                    <tr style="border-bottom: 1px solid #333; transition: background-color 0.2s ease;" 
                        onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" 
                        onmouseout="this.style.backgroundColor='transparent'">
                        <td style="padding: 16px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 16px;">${typeIcons[task.type] || '📋'}</span>
                                <span style="font-weight: 500;">${task.description || 'N/A'}</span>
                            </div>
                        </td>
                        <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${task.contactName ? `<span style="color: #fff; cursor: pointer;" onclick="CRMApp.showContactDetails('${task.contactId}')">${task.contactName}</span>` : 'N/A'}
                        </td>
                        <td style="padding: 16px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${task.accountName ? `<span style="color: #fff; cursor: pointer;" onclick="CRMApp.showAccountDetails('${task.accountId}')">${task.accountName}</span>` : 'N/A'}
                        </td>
                        <td style="padding: 16px; white-space: nowrap;">
                            <button onclick="CRMApp.completeTask('${task.id}')" style="
                                background: ${task.status === 'completed' ? '#66bb6a' : '#4a90e2'};
                                border: 1px solid ${task.status === 'completed' ? '#81c784' : '#5ba0f2'};
                                color: #fff;
                                padding: 6px 12px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: all 0.2s ease;
                                margin-right: 8px;
                            " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                                ${task.status === 'completed' ? '✓ Done' : 'Complete'}
                            </button>
                        </td>
                        <td style="padding: 16px; color: ${isOverdue ? '#ff6b6b' : '#ccc'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${dueDateFormatted}${isOverdue ? ' (Overdue)' : ''}
                        </td>
                        <td style="padding: 16px; white-space: nowrap;">
                            <span style="
                                background: ${priorityColors[task.priority] || '#666'};
                                color: #fff;
                                padding: 4px 8px;
                                border-radius: 4px;
                                font-size: 12px;
                                font-weight: 500;
                                text-transform: capitalize;
                            ">${task.priority}</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    },

    updateTaskCounts() {
        const allCount = this.tasks?.length || 0;
        const callCount = this.tasks?.filter(t => t.type === 'call').length || 0;
        const emailCount = this.tasks?.filter(t => t.type === 'email').length || 0;
        const linkedinCount = this.tasks?.filter(t => t.type === 'linkedin').length || 0;

        const allCountEl = document.getElementById('all-tasks-count');
        const callCountEl = document.getElementById('call-tasks-count');
        const emailCountEl = document.getElementById('email-tasks-count');
        const linkedinCountEl = document.getElementById('linkedin-tasks-count');

        if (allCountEl) allCountEl.textContent = allCount;
        if (callCountEl) callCountEl.textContent = callCount;
        if (emailCountEl) emailCountEl.textContent = emailCount;
        if (linkedinCountEl) linkedinCountEl.textContent = linkedinCount;
    },

    updateTasksPaginationControls(currentPage, totalPages, totalTasks) {
        const pageInfo = document.getElementById('tasks-page-info');
        const prevBtn = document.getElementById('tasks-prev-page');
        const nextBtn = document.getElementById('tasks-next-page');

        if (pageInfo) {
            pageInfo.textContent = `${currentPage} / ${totalPages}`;
        }

        if (prevBtn) {
            prevBtn.disabled = currentPage <= 1;
            prevBtn.style.opacity = currentPage <= 1 ? '0.5' : '1';
            prevBtn.style.cursor = currentPage <= 1 ? 'not-allowed' : 'pointer';
        }

        if (nextBtn) {
            nextBtn.disabled = currentPage >= totalPages;
            nextBtn.style.opacity = currentPage >= totalPages ? '0.5' : '1';
            nextBtn.style.cursor = currentPage >= totalPages ? 'not-allowed' : 'pointer';
        }
    },

    changeTasksPage(direction) {
        const filteredTasks = this.getFilteredTasks();
        const totalPages = Math.ceil(filteredTasks.length / 50);
        
        this.currentTasksPage = Math.max(1, Math.min(totalPages, this.currentTasksPage + direction));
        this.renderSimpleTasksTable();
    },

    getFilteredTasks() {
        let filteredTasks = this.tasks || [];
        
        // Filter by task type
        if (this.currentTaskType !== 'all') {
            const typeMap = { calls: 'call', emails: 'email', linkedin: 'linkedin' };
            filteredTasks = filteredTasks.filter(task => task.type === typeMap[this.currentTaskType]);
        }

        // Apply search filter
        const searchTerm = document.getElementById('task-search-simple')?.value || '';
        if (searchTerm) {
            filteredTasks = filteredTasks.filter(task =>
                (task.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (task.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (task.accountName || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // Apply priority filter
        const priorityFilter = document.getElementById('task-priority-filter');
        if (priorityFilter && priorityFilter.value) {
            filteredTasks = filteredTasks.filter(task => task.priority === priorityFilter.value);
        }

        // Apply status filter
        const statusFilter = document.getElementById('task-status-filter');
        if (statusFilter && statusFilter.value) {
            filteredTasks = filteredTasks.filter(task => task.status === statusFilter.value);
        }

        return filteredTasks;
    },

    clearTasksFilters() {
        // Clear all filter inputs
        const searchInput = document.getElementById('task-search-simple');
        const priorityFilter = document.getElementById('task-priority-filter');
        const statusFilter = document.getElementById('task-status-filter');

        if (searchInput) searchInput.value = '';
        if (priorityFilter) priorityFilter.value = '';
        if (statusFilter) statusFilter.value = '';

        // Re-render table
        this.renderSimpleTasksTable();
    },

    completeTask(taskId) {
        const task = this.tasks?.find(t => t.id === taskId);
        if (task) {
            task.status = task.status === 'completed' ? 'pending' : 'completed';
            this.renderSimpleTasksTable();
            this.updateTaskCounts();
            
            const action = task.status === 'completed' ? 'completed' : 'reopened';
            this.showNotification(`Task ${action} successfully`, 'success');
        }
    },

    // Open sequences functionality
    openSequences() {
        console.log('Opening sequences...');
        this.renderSequencesPage();
    },

    // Render the sequences page
    renderSequencesPage() {
        console.log("renderSequencesPage called");
        const sequencesView = document.getElementById('sequences-view') || this.createSequencesView();
        
        console.log("Creating sequences HTML");
        const sequencesHTML = `
            <div class="sequences-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid #333;
            ">
                <h2 style="
                    margin: 0;
                    color: #fff;
                    font-size: 28px;
                    font-weight: 600;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                ">Sequences</h2>
                <button onclick="CRMApp.openCreateSequenceModal()" style="
                    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                    border: 1px solid #28a745;
                    color: #fff;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                " onmouseover="this.style.background='linear-gradient(135deg, #218838 0%, #1e7e34 100%)'" 
                   onmouseout="this.style.background='linear-gradient(135deg, #28a745 0%, #20c997 100%)'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Create Sequence
                </button>
            </div>

            <div class="sequences-content" style="
                background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                padding: 20px;
                border-radius: 18px;
                border: 1px solid #333;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                overflow: visible;
                flex: 1;
                display: flex;
                flex-direction: column;
            ">
                <div id="sequences-table-container" class="sequences-table-wrapper" style="
                    overflow-x: auto;
                    overflow-y: auto;
                    border-radius: 12px;
                    border: 1px solid #333;
                    flex: 1;
                    max-height: calc(100vh - 300px);
                ">
                    <table class="sequences-table" style="
                        width: 100%;
                        border-collapse: collapse;
                        background: #1f1f1f;
                        min-width: 1200px;
                    ">
                        <thead style="
                            background: linear-gradient(135deg, #333 0%, #2a2a2a 100%);
                            position: sticky;
                            top: 0;
                            z-index: 10;
                        ">
                            <tr>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap; width: 80px;">Active</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap; min-width: 200px;">Name</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Sequence By</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Active</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Value</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Hot Sent</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Bounced</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Open Rate</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Finished</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Scheduled</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Delivered</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Replied</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Interested</th>
                                <th style="padding: 16px; text-align: left; color: #fff; font-weight: 600; border-bottom: 1px solid #444; white-space: nowrap;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="sequences-table-body">
                            <tr>
                                <td colspan="14" style="padding: 40px; text-align: center; color: #888; font-style: italic;">Loading sequences...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        sequencesView.innerHTML = sequencesHTML;

        // Apply layout styles
        const layoutStyles = `
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
        sequencesView.style.cssText = layoutStyles;

        // Initialize sequences data and render
        setTimeout(() => {
            this.initSequencesData();
            this.renderSequencesTable();
        }, 100);

        // Show the sequences view
        this.showView('sequences-view');
    },

    createSequencesView() {
        const sequencesView = document.createElement('div');
        sequencesView.id = 'sequences-view';
        sequencesView.className = 'page-view';
        sequencesView.style.display = 'none';
        
        const mainContentWrapper = document.getElementById('main-content-wrapper');
        if (mainContentWrapper) {
            mainContentWrapper.appendChild(sequencesView);
        }
        
        return sequencesView;
    },

    initSequencesData() {
        if (!this.sequences) {
            this.sequences = this.generateSampleSequences();
        }
    },

    generateSampleSequences() {
        const sequenceNames = [
            'Marketing Emails',
            'Prospecting Decision Makers', 
            'HR-new hires',
            'Prospecting Hotel Owners',
            'Interested',
            'test',
            'Welcome To Power Choosers',
            'Energy Invoice Received',
            'HR-new hires',
            'Not interested',
            'Invoice Received'
        ];

        const sequenceTypes = ['LF', 'LP'];
        
        return sequenceNames.map((name, index) => ({
            id: `seq-${index + 1}`,
            name: name,
            active: Math.random() > 0.3, // 70% chance of being active
            sequenceBy: sequenceTypes[Math.floor(Math.random() * sequenceTypes.length)],
            activeCount: Math.floor(Math.random() * 100),
            value: Math.floor(Math.random() * 50),
            hotSent: Math.floor(Math.random() * 300),
            bounced: Math.floor(Math.random() * 10),
            openRate: (Math.random() * 100).toFixed(1) + '%',
            finished: Math.floor(Math.random() * 50),
            scheduled: Math.floor(Math.random() * 100),
            delivered: Math.floor(Math.random() * 250),
            replied: Math.floor(Math.random() * 30),
            interested: Math.floor(Math.random() * 20),
            createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        }));
    },

    renderSequencesTable() {
        const tableBody = document.getElementById('sequences-table-body');
        if (!tableBody || !this.sequences) return;

        tableBody.innerHTML = this.sequences.map(sequence => `
            <tr style="border-bottom: 1px solid #333; transition: background-color 0.2s ease;" 
                onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" 
                onmouseout="this.style.backgroundColor='transparent'">
                <td style="padding: 16px; text-align: center;">
                    <label class="toggle-switch" style="position: relative; display: inline-block; width: 50px; height: 24px;">
                        <input type="checkbox" ${sequence.active ? 'checked' : ''} 
                               onchange="CRMApp.toggleSequence('${sequence.id}')"
                               style="opacity: 0; width: 0; height: 0;">
                        <span style="
                            position: absolute;
                            cursor: pointer;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background-color: ${sequence.active ? '#28a745' : '#ccc'};
                            transition: .4s;
                            border-radius: 24px;
                        ">
                            <span style="
                                position: absolute;
                                content: '';
                                height: 18px;
                                width: 18px;
                                left: ${sequence.active ? '26px' : '3px'};
                                bottom: 3px;
                                background-color: white;
                                transition: .4s;
                                border-radius: 50%;
                            "></span>
                        </span>
                    </label>
                </td>
                <td style="padding: 16px; color: #fff; font-weight: 500;">${sequence.name}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.sequenceBy}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.activeCount}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.value}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.hotSent}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.bounced}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.openRate}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.finished}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.scheduled}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.delivered}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.replied}</td>
                <td style="padding: 16px; color: #ccc; text-align: center;">${sequence.interested}</td>
                <td style="padding: 16px; text-align: center;">
                    <button onclick="CRMApp.editSequence('${sequence.id}')" style="
                        background: #4a90e2;
                        border: 1px solid #5ba0f2;
                        color: #fff;
                        padding: 6px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.2s ease;
                        margin-right: 8px;
                    " onmouseover="this.style.background='#5ba0f2'" onmouseout="this.style.background='#4a90e2'">
                        Edit
                    </button>
                </td>
            </tr>
        `).join('');
    },

    toggleSequence(sequenceId) {
        const sequence = this.sequences?.find(s => s.id === sequenceId);
        if (sequence) {
            sequence.active = !sequence.active;
            this.renderSequencesTable();
            const status = sequence.active ? 'activated' : 'deactivated';
            this.showNotification(`Sequence "${sequence.name}" ${status}`, 'success');
        }
    },

    editSequence(sequenceId) {
        const sequence = this.sequences?.find(s => s.id === sequenceId);
        if (sequence) {
            this.showNotification(`Edit sequence "${sequence.name}" - Coming soon!`, 'info');
        }
    },

    openCreateSequenceModal() {
        console.log('Opening create sequence modal...');
        this.showCreateSequenceModal();
    },

    showCreateSequenceModal() {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'create-sequence-modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
            border-radius: 16px;
            border: 1px solid #333;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            width: 400px;
            max-width: 90vw;
            padding: 0;
            overflow: hidden;
        `;

        modalContent.innerHTML = `
            <div style="
                padding: 24px;
                border-bottom: 1px solid #333;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="
                    margin: 0;
                    color: #fff;
                    font-size: 20px;
                    font-weight: 600;
                ">New Sequence</h3>
                <button onclick="CRMApp.closeCreateSequenceModal()" style="
                    background: none;
                    border: none;
                    color: #888;
                    font-size: 20px;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                " onmouseover="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.1)'" 
                   onmouseout="this.style.color='#888'; this.style.background='none'">×</button>
            </div>
            
            <div style="padding: 24px;">
                <div style="margin-bottom: 20px;">
                    <label style="
                        display: block;
                        color: #fff;
                        font-size: 14px;
                        font-weight: 600;
                        margin-bottom: 8px;
                    ">Sequence Name</label>
                    <input 
                        type="text" 
                        id="sequence-name-input"
                        placeholder="Enter sequence name..."
                        style="
                            width: 100%;
                            padding: 12px 16px;
                            background: #1a1a1a;
                            border: 1px solid #444;
                            border-radius: 8px;
                            color: #fff;
                            font-size: 14px;
                            outline: none;
                            transition: all 0.2s ease;
                            box-sizing: border-box;
                        "
                        onfocus="this.style.borderColor='#4a90e2'; this.style.boxShadow='0 0 0 3px rgba(74, 144, 226, 0.1)'"
                        onblur="this.style.borderColor='#444'; this.style.boxShadow='none'"
                    >
                </div>
                
                <div style="
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                    margin-top: 24px;
                ">
                    <button onclick="CRMApp.closeCreateSequenceModal()" style="
                        background: #333;
                        border: 1px solid #444;
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#404040'" onmouseout="this.style.background='#333'">
                        Cancel
                    </button>
                    <button onclick="CRMApp.createNewSequence()" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        border: 1px solid #28a745;
                        color: #fff;
                        padding: 10px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='linear-gradient(135deg, #218838 0%, #1e7e34 100%)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #28a745 0%, #20c997 100%)'">
                        Create
                    </button>
                </div>
            </div>
        `;

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Focus on input field
        setTimeout(() => {
            const input = document.getElementById('sequence-name-input');
            if (input) input.focus();
        }, 100);

        // Close modal when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                this.closeCreateSequenceModal();
            }
        });

        // Handle Enter key
        const input = document.getElementById('sequence-name-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createNewSequence();
                }
            });
        }
    },

    closeCreateSequenceModal() {
        const modal = document.getElementById('create-sequence-modal-overlay');
        if (modal) {
            modal.remove();
        }
    },

    createNewSequence() {
        const input = document.getElementById('sequence-name-input');
        const sequenceName = input?.value?.trim();

        if (!sequenceName) {
            this.showNotification('Please enter a sequence name', 'error');
            return;
        }

        // Create new sequence object
        const newSequence = {
            id: `seq-${Date.now()}`,
            name: sequenceName,
            active: true,
            sequenceBy: 'LF',
            activeCount: 0,
            value: 0,
            hotSent: 0,
            bounced: 0,
            openRate: '0.0%',
            finished: 0,
            scheduled: 0,
            delivered: 0,
            replied: 0,
            interested: 0,
            createdAt: new Date()
        };

        // Add to sequences array
        if (!this.sequences) {
            this.sequences = [];
        }
        this.sequences.unshift(newSequence); // Add to beginning of array

        // Re-render the table
        this.renderSequencesTable();

        // Close modal and open sequence builder
        this.closeCreateSequenceModal();
        this.showNotification(`Sequence "${sequenceName}" created successfully!`, 'success');
        
        // Open the sequence builder page
        setTimeout(() => {
            this.openSequenceBuilder(newSequence);
        }, 500);
    },

    openSequenceBuilder(sequence) {
        console.log('Opening sequence builder for:', sequence.name);
        this.currentSequence = sequence;
        this.renderSequenceBuilderPage();
    },

    renderSequenceBuilderPage() {
        console.log("renderSequenceBuilderPage called");
        const sequenceBuilderView = document.getElementById('sequence-builder-view') || this.createSequenceBuilderView();
        
        const sequenceBuilderHTML = `
            <div class="sequence-builder-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid #333;
            ">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <button onclick="CRMApp.showView('sequences-view')" style="
                        background: #333;
                        border: 1px solid #444;
                        color: #fff;
                        padding: 8px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    " onmouseover="this.style.background='#404040'" onmouseout="this.style.background='#333'">
                        ← Back to Sequences
                    </button>
                    <h2 style="
                        margin: 0;
                        color: #fff;
                        font-size: 28px;
                        font-weight: 600;
                        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                    ">${this.currentSequence?.name || 'Sequence Builder'}</h2>
                </div>
                <button onclick="CRMApp.openAddContactsModal()" style="
                    background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                    border: 1px solid #4a90e2;
                    color: #fff;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                " onmouseover="this.style.background='linear-gradient(135deg, #357abd 0%, #2968a3 100%)'" 
                   onmouseout="this.style.background='linear-gradient(135deg, #4a90e2 0%, #357abd 100%)'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <line x1="19" y1="8" x2="24" y2="13"></line>
                        <line x1="24" y1="8" x2="19" y2="13"></line>
                    </svg>
                    Add Contacts
                </button>
            </div>

            <!-- Sequence Builder Tabs -->
            <div class="sequence-builder-tabs" style="
                display: flex;
                gap: 2px;
                margin-bottom: 24px;
                background: #1a1a1a;
                border-radius: 12px;
                padding: 4px;
                border: 1px solid #333;
            ">
                <button onclick="CRMApp.switchSequenceBuilderTab('overview')" 
                        id="sequence-tab-overview"
                        class="sequence-tab active" style="
                    flex: 1;
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Overview</button>
                <button onclick="CRMApp.switchSequenceBuilderTab('contacts')" 
                        id="sequence-tab-contacts"
                        class="sequence-tab" style="
                    flex: 1;
                    padding: 12px 24px;
                    background: transparent;
                    border: none;
                    border-radius: 8px;
                    color: #888;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onmouseover="if(!this.classList.contains('active')) this.style.background='rgba(255,255,255,0.05)'" 
                   onmouseout="if(!this.classList.contains('active')) this.style.background='transparent'">Contacts</button>
            </div>

            <!-- Overview Tab Content -->
            <div id="sequence-overview-content" class="sequence-tab-content" style="display: block;">
                <div class="sequence-overview" style="
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 40px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    text-align: center;
                ">
                    <div style="
                        background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 24px auto;
                        box-shadow: 0 4px 16px rgba(74, 144, 226, 0.3);
                    ">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #fff;">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                        </svg>
                    </div>
                    
                    <h3 style="
                        color: #fff;
                        font-size: 32px;
                        font-weight: 700;
                        margin: 0 0 16px 0;
                        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                    ">Supercharge your workflow with sequences</h3>
                    
                    <p style="
                        color: #ccc;
                        font-size: 18px;
                        line-height: 1.6;
                        margin: 0 0 32px 0;
                        max-width: 600px;
                        margin-left: auto;
                        margin-right: auto;
                    ">Harness the power of Power Choosers AI to create multi-step sequences that help you scale your outreach efforts, book more meetings, and close more deals.</p>
                    
                    <button onclick="CRMApp.addSequenceStep()" style="
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        border: 1px solid #28a745;
                        color: #fff;
                        padding: 16px 32px;
                        border-radius: 12px;
                        cursor: pointer;
                        font-size: 16px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 16px rgba(40, 167, 69, 0.3);
                        display: inline-flex;
                        align-items: center;
                        gap: 12px;
                    " onmouseover="this.style.background='linear-gradient(135deg, #218838 0%, #1e7e34 100%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(40, 167, 69, 0.4)'" 
                       onmouseout="this.style.background='linear-gradient(135deg, #28a745 0%, #20c997 100%)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 16px rgba(40, 167, 69, 0.3)'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add a step
                    </button>
                </div>
            </div>

            <!-- Contacts Tab Content -->
            <div id="sequence-contacts-content" class="sequence-tab-content" style="display: none;">
                <div class="sequence-contacts" style="
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    padding: 20px;
                    border-radius: 18px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    text-align: center;
                ">
                    <div style="padding: 40px;">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1" style="margin-bottom: 20px;">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <h4 style="color: #fff; font-size: 20px; margin-bottom: 12px;">No contacts in this sequence yet</h4>
                        <p style="color: #888; margin-bottom: 24px;">Add contacts to start your sequence outreach.</p>
                        <button onclick="CRMApp.openAddContactsModal()" style="
                            background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
                            border: 1px solid #4a90e2;
                            color: #fff;
                            padding: 12px 24px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 600;
                            transition: all 0.2s ease;
                        " onmouseover="this.style.background='linear-gradient(135deg, #357abd 0%, #2968a3 100%)'" 
                           onmouseout="this.style.background='linear-gradient(135deg, #4a90e2 0%, #357abd 100%)'">
                            Add Contacts
                        </button>
                    </div>
                </div>
            </div>
        `;

        sequenceBuilderView.innerHTML = sequenceBuilderHTML;

        // Apply layout styles
        const layoutStyles = `
            display: flex !important;
            flex-direction: column !important;
            height: calc(100vh - 120px) !important;
            background: #1a1a1a !important;
            color: #fff !important;
            margin-top: 32px !important;
            padding: 20px !important;
            border-radius: 20px !important;
            overflow: auto !important;
        `;
        sequenceBuilderView.style.cssText = layoutStyles;

        // Show the sequence builder view
        this.showView('sequence-builder-view');
    },

    createSequenceBuilderView() {
        const sequenceBuilderView = document.createElement('div');
        sequenceBuilderView.id = 'sequence-builder-view';
        sequenceBuilderView.className = 'page-view';
        sequenceBuilderView.style.display = 'none';
        
        const mainContentWrapper = document.getElementById('main-content-wrapper');
        if (mainContentWrapper) {
            mainContentWrapper.appendChild(sequenceBuilderView);
        }
        
        return sequenceBuilderView;
    },

    switchSequenceBuilderTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.sequence-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tabName === 'overview' && tab.id === 'sequence-tab-overview') {
                tab.style.background = 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)';
                tab.style.color = '#fff';
                tab.classList.add('active');
            } else if (tabName === 'contacts' && tab.id === 'sequence-tab-contacts') {
                tab.style.background = 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)';
                tab.style.color = '#fff';
                tab.classList.add('active');
            } else {
                tab.style.background = 'transparent';
                tab.style.color = '#888';
            }
        });

        // Show/hide tab content
        document.querySelectorAll('.sequence-tab-content').forEach(content => {
            content.style.display = 'none';
        });

        if (tabName === 'overview') {
            document.getElementById('sequence-overview-content').style.display = 'block';
        } else if (tabName === 'contacts') {
            document.getElementById('sequence-contacts-content').style.display = 'block';
        }
    },

    addSequenceStep() {
        console.log('Adding sequence step...');
        this.showNotification('Add sequence step functionality coming soon!', 'info');
        // TODO: Implement add sequence step modal
    },

    openAddContactsModal() {
        console.log('Opening add contacts modal...');
        this.showNotification('Add contacts to sequence functionality coming soon!', 'info');
        // TODO: Implement add contacts modal
    },

    // Open add task modal
    openAddTaskModal() {
        console.log('Opening add task modal...');
        this.showNotification('Add Task modal coming soon!', 'info');
        // TODO: Implement add task modal
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
    },

    // Clear accounts filters
    clearAccountsFilters() {
        const searchInput = document.getElementById('account-search-simple');
        const industryFilter = document.getElementById('account-industry-filter');
        
        if (searchInput) searchInput.value = '';
        if (industryFilter) industryFilter.value = '';
        
        // Re-render the table with cleared filters
        this.renderSimpleAccountsTable('');
    },

    // Clear contacts filters
    clearContactsFilters() {
        const searchInput = document.getElementById('contact-search-simple');
        const accountFilter = document.getElementById('account-filter-simple');
        
        if (searchInput) searchInput.value = '';
        if (accountFilter) accountFilter.value = '';
        
        // Re-render the table with cleared filters
        this.renderSimpleContactsTable('');
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

// Toggle filters sidebar visibility
function toggleFilters() {
    const sidebar = document.getElementById('filters-sidebar');
    const toggleBtn = document.getElementById('toggle-filters-btn');
    const showFiltersBtn = document.getElementById('show-filters-btn');
    const arrow = toggleBtn ? toggleBtn.querySelector('svg polyline') : null;
    
    if (!sidebar) return;
    
    const isCollapsed = sidebar.style.marginLeft === '-300px';
    
    if (isCollapsed) {
        // Show filters
        sidebar.style.marginLeft = '0';
        sidebar.style.opacity = '1';
        if (arrow) {
            arrow.setAttribute('points', '15 18 9 12 15 6'); // Left arrow
            toggleBtn.title = 'Hide Filters';
        }
        if (showFiltersBtn) {
            showFiltersBtn.style.display = 'none'; // Hide the show filters button
        }
    } else {
        // Hide filters
        sidebar.style.marginLeft = '-300px';
        sidebar.style.opacity = '0';
        if (arrow) {
            arrow.setAttribute('points', '9 18 15 12 9 6'); // Right arrow
            toggleBtn.title = 'Show Filters';
        }
        if (showFiltersBtn) {
            showFiltersBtn.style.display = 'flex'; // Show the show filters button
        }
    }
}

// Pagination variables

function changeAccountsPage(direction) {
    const currentPage = crmApp.currentAccountsPage || 1;
    const newPage = Math.max(1, currentPage + direction);
    crmApp.currentAccountsPage = newPage;
    
    const searchTerm = document.getElementById('account-search-simple')?.value || '';
    crmApp.renderSimpleAccountsTable(searchTerm);
}

function toggleContactsFilters() {
    const sidebar = document.getElementById('contacts-filters-sidebar');
    const btn = document.getElementById('toggle-contacts-filters-btn');
    
    if (sidebar && btn) {
        const isCollapsed = sidebar.style.minWidth === '60px';
        
        if (isCollapsed) {
            // Expand
            sidebar.style.minWidth = '280px';
            sidebar.style.maxWidth = '320px';
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        } else {
            // Collapse
            sidebar.style.minWidth = '60px';
            sidebar.style.maxWidth = '60px';
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        }
    }
}

function toggleAccountsFilters() {
    const sidebar = document.getElementById('accounts-filters-sidebar');
    const btn = document.getElementById('toggle-accounts-filters-btn');
    
    if (sidebar && btn) {
        const isCollapsed = sidebar.style.minWidth === '60px';
        
        if (isCollapsed) {
            // Expand
            sidebar.style.minWidth = '280px';
            sidebar.style.maxWidth = '320px';
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        } else {
            // Collapse
            sidebar.style.minWidth = '60px';
            sidebar.style.maxWidth = '60px';
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        }
    }
}

function toggleTasksFilters() {
    const sidebar = document.getElementById('tasks-filters-sidebar');
    const showButton = document.getElementById('show-tasks-filters-btn');
    const toggleButton = document.getElementById('toggle-tasks-filters-btn');
    
    if (!sidebar) return;
    
    const isCollapsed = sidebar.style.marginLeft === '-320px';
    
    if (isCollapsed) {
        // Show filters
        sidebar.style.marginLeft = '0';
        sidebar.style.opacity = '1';
        if (showButton) showButton.style.display = 'none';
        if (toggleButton) {
            toggleButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
        }
    } else {
        // Hide filters
        sidebar.style.marginLeft = '-320px';
        sidebar.style.opacity = '0';
        if (showButton) showButton.style.display = 'flex';
        if (toggleButton) {
            toggleButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        }
    }
}

function changePage(direction) {
    const totalPages = Math.ceil(totalContacts / contactsPerPage);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        updateContactsDisplay();
        updatePaginationControls();
    }
}

// Update pagination controls visibility and state
function updatePaginationControls() {
    const paginationControls = document.getElementById('pagination-controls');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');
    
    if (!paginationControls || !prevBtn || !nextBtn || !pageInfo) return;
    
    const totalPages = Math.ceil(totalContacts / contactsPerPage);
    
    // Show/hide pagination controls based on total contacts
    if (totalContacts > contactsPerPage) {
        paginationControls.style.display = 'flex';
        
        // Update page info
        pageInfo.textContent = `${currentPage} / ${totalPages}`;
        
        // Enable/disable buttons based on current page
        prevBtn.style.opacity = currentPage === 1 ? '0.5' : '1';
        prevBtn.style.cursor = currentPage === 1 ? 'not-allowed' : 'pointer';
        
        nextBtn.style.opacity = currentPage === totalPages ? '0.5' : '1';
        nextBtn.style.cursor = currentPage === totalPages ? 'not-allowed' : 'pointer';
    } else {
        paginationControls.style.display = 'none';
    }
}

// Update contacts display with pagination
function updateContactsDisplay() {
    const startIndex = (currentPage - 1) * contactsPerPage;
    const endIndex = startIndex + contactsPerPage;
    const contactsToShow = allContacts.slice(startIndex, endIndex);
    
    // Update the contacts table with paginated data
    CRMApp.renderSimpleContactsTable('', contactsToShow);
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
