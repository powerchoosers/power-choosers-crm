// Power Choosers CRM Dashboard - Main JavaScript File (UPDATED)
// This file contains the complete application logic for the redesigned Power Choosers CRM.
// Updated with white SVG activity icons for better theme consistency
// Added Call Scripts button functionality
// Integrated Cold Calling Hub with auto-population and Firebase updates

// --- 1. Firebase Configuration & Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE",
    authDomain: "power-choosers-crm.firebaseapp.com",
    projectId: "power-choosers-crm",
    storageBucket: "power-choosers-crm.firebasestorage.app",
    messagingSenderId: "792458658491",
    appId: "1:792458658491:web:a197a4a8ce7a860cfa1f9e",
    measurementId: "G-XEC3BFHJHW"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const fieldValue = firebase.firestore.FieldValue;

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
                e.preventDefault();
                const viewName = e.currentTarget.getAttribute('data-view');
                this.showView(viewName);
                this.updateActiveNavButton(e.currentTarget);
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
    
    // Get references to main containers
    const mainContent = document.querySelector('.main-content');
    const widgetPanel = document.querySelector('.widget-panel');
    const callScriptsView = document.getElementById('call-scripts-view');
    
    // Hide all main containers
    mainContent.style.display = 'none';
    widgetPanel.style.display = 'none';
    callScriptsView.style.display = 'none';
    
    // Hide all individual page views
    document.querySelectorAll('.main-content .page-view').forEach(view => {
        view.style.display = 'none';
    });

    // Show the appropriate container based on the view
    if (viewName === 'call-scripts-view') {
        callScriptsView.style.display = 'flex';
    } else {
        mainContent.style.display = 'flex';
        widgetPanel.style.display = 'flex';
        const activeView = document.getElementById(viewName);
        if (activeView) {
            activeView.style.display = 'flex';
        }
        
        // Re-render dashboard content if returning to it
        if (viewName === 'dashboard-view') {
            this.renderDashboard();
        }
    }

    // Update active navigation button state
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (activeNav) {
        activeNav.classList.add('active');
    } else if (viewName === 'call-scripts-view') {
        const dashboardNav = document.querySelector('.nav-item[data-view="dashboard-view"]');
        if (dashboardNav) dashboardNav.classList.add('active');
    }
},

// Function to load and display the Call Scripts view
async showCallScriptsView() {
    const callScriptsView = document.getElementById('call-scripts-view');
    if (!callScriptsView) {
        console.error('Call scripts view element not found.');
        this.showToast('Call scripts view not available.', 'error');
        return;
    }

    try {
        // Show loading state
        callScriptsView.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Loading Cold Calling Hub...</p>
            </div>
        `;
        
        // Show the view immediately to prevent layout shifts
        this.showView('call-scripts-view');
        
        // Load the HTML content
        const response = await fetch('call-scripts-content.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const htmlContent = await response.text();
        callScriptsView.innerHTML = htmlContent;

        // Initialize the call scripts functionality
        if (typeof window.initializeCallScriptsPage === 'function') {
            try {
                window.initializeCallScriptsPage();
                this.autoPopulateCallScripts();
                console.log('Call scripts content loaded and initialized.');
                this.showToast('Cold Calling Hub loaded successfully!', 'success');
            } catch (initError) {
                console.error('Error initializing call scripts:', initError);
                throw new Error(`Initialization failed: ${initError.message}`);
            }
        } else {
            throw new Error('Initialization function not found');
        }
    } catch (error) {
        console.error('Error in showCallScriptsView:', error);
        callScriptsView.innerHTML = `
            <div class="error-state">
                <h3>Failed to load call scripts</h3>
                <p>${error.message}</p>
                <button class="retry-button" onclick="window.crmApp.showCallScriptsView()">Retry</button>
            </div>
        `;
        this.showToast('Failed to load call scripts. Please try again.', 'error');
    }
},
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
