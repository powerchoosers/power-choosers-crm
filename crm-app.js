// Power Choosers CRM Dashboard - Main JavaScript File (UPDATED)
// This file contains the complete application logic for the redesigned Power Choosers CRM.
// Updated with Call Scripts integration and bug fixes

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
    callLogs: [],
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
            const [accountsSnapshot, contactsSnapshot, activitiesSnapshot, callLogsSnapshot] = await Promise.all([
                db.collection('accounts').get(),
                db.collection('contacts').get(),
                db.collection('activities').orderBy('createdAt', 'desc').limit(50).get(),
                db.collection('call_logs').orderBy('timestamp', 'desc').limit(50).get()
            ]);
            
            this.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.contacts = contactsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.activities = activitiesSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date() 
            }));
            this.callLogs = callLogsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : new Date()
            }));
            
            console.log('Initial data loaded:', {
                accounts: this.accounts.length,
                contacts: this.contacts.length,
                activities: this.activities.length,
                callLogs: this.callLogs.length
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
        this.callLogs = [];
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

        // Call Scripts button - FIXED
        const callScriptsBtn = document.getElementById('call-scripts-btn');
        if (callScriptsBtn) {
            callScriptsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.loadCallScriptsView();
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

        // Global functions
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
        this.currentView = viewName;
        document.querySelectorAll('.page-view').forEach(view => {
            view.style.display = 'none';
        });
        const activeView = document.getElementById(viewName);
        if (activeView) {
            activeView.style.display = 'block';
        }
        
        if (viewName === 'dashboard-view') {
            this.renderDashboard();
        } else if (viewName === 'call-scripts-view') {
            this.renderCallScriptsView();
        } else {
            console.log(`Mapped to: ${viewName}`);
        }
    },

    // Update the active state of navigation buttons
    updateActiveNavButton(activeNav) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        activeNav.classList.add('active');
    },

    // Load and render Call Scripts view - FIXED
    async loadCallScriptsView() {
        console.log('Loading Call Scripts view...');
        
        try {
            // Show the call scripts view
            this.showView('call-scripts-view');
            
            // Update nav to show Call Scripts as active (if it has a nav item)
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            
            // Load the call scripts content
            await this.renderCallScriptsView();
            
            this.showToast('Call Scripts loaded successfully!', 'success');
        } catch (error) {
            console.error('Error loading Call Scripts:', error);
            this.showToast('Failed to load Call Scripts', 'error');
        }
    },

    // Render Call Scripts view with the cold calling hub
    async renderCallScriptsView() {
        const callScriptsView = document.getElementById('call-scripts-view');
        if (!callScriptsView) {
            console.error('Call scripts view element not found');
            return;
        }

        // Insert the cold calling hub HTML content
        callScriptsView.innerHTML = `
            <div class="calls-hub-layout">
                <!-- Main Script Area -->
                <div class="calls-hub-main">
                    <h2 class="text-2xl font-bold mb-6 text-white text-center">Cold Calling Script</h2>
                    
                    <div class="calls-hub-main-inner">
                        <div class="script-display p-6" id="script-display">
                            Click 'Dial' to begin the call
                        </div>

                        <div class="response-buttons mt-6" id="responses-container">
                            <button class="dial-button" onclick="handleDialClick()">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                Dial
                            </button>
                        </div>

                        <div class="calls-hub-footer">
                            <button id="back-btn" class="action-btn" onclick="goBack()" disabled>← Back</button>
                            <button id="restart-btn" class="restart-btn-icon" onclick="restart()">
                                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path d="M21.5 13a9.5 9.5 0 1 1-9.5-9.5V3a.5.5 0 0 0-1 0v.5A9.5 9.5 0 1 1 21.5 13zM12 2v4M12 18v4M22 12h-4M6 12H2M18 18l-3-3M18 6l-3 3M6 18l3-3M6 6l3 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right Hand Side Scrolling Sidebar -->
                <div class="calls-hub-sidebar">
                    
                    <!-- Prospect Information Widget -->
                    <div class="sidebar-card">
                        <h3 class="sidebar-card-title">📋 Prospect Info</h3>
                        <div class="sidebar-input-group">
                            <label for="input-phone">Phone Number:</label>
                            <input type="text" id="input-phone" placeholder="(555) 555-5555" oninput="updateScript()">
                        </div>
                        <div class="sidebar-input-group">
                            <label for="input-company-name">Company Name:</label>
                            <input type="text" id="input-company-name" placeholder="ABC Manufacturing" oninput="updateScript()">
                        </div>
                        <div class="sidebar-input-group">
                            <label for="input-name">Contact Name:</label>
                            <input type="text" id="input-name" placeholder="John Smith" oninput="updateScript()">
                        </div>
                        <div class="sidebar-input-group">
                            <label for="input-title">Contact Title:</label>
                            <input type="text" id="input-title" placeholder="Company Leader" oninput="updateScript()">
                        </div>
                        <div class="sidebar-input-group">
                            <label for="input-company-industry">Company Industry:</label>
                            <input type="text" id="input-company-industry" placeholder="businesses" oninput="updateScript()">
                        </div>
                        <div class="sidebar-input-group">
                            <label for="input-benefit">Specific Benefit:</label>
                            <input type="text" id="input-benefit" placeholder="a strategic procurement strategy" oninput="updateScript()">
                        </div>
                        <div class="sidebar-input-group">
                            <label for="input-pain">Pain Point:</label>
                            <input type="text" id="input-pain" placeholder="you're not stuck paying more" oninput="updateScript()">
                        </div>
                    </div>

                    <!-- Energy Health Check Widget -->
                    <div class="sidebar-card !p-4" style="height: max-content;">
                        <h3 class="sidebar-card-title">📉 Energy Health Check</h3>
                        <div class="calculator-wrapper !p-6" id="calculator-wrapper">
                            <div class="form-sections">
                                <div class="form-section active" id="section1">
                                    <div class="section-header">
                                        <span class="section-header-pill">
                                            <span class="section-icon">1</span> Current Bill
                                        </span>
                                    </div>
                                    <div class="grid grid-cols-1 gap-4">
                                        <div class="input-group">
                                            <label for="currentSupplier" class="input-label text-xs">Current Supplier</label>
                                            <input type="text" class="form-input !p-2 !text-sm" id="currentSupplier" placeholder="e.g., TXU" list="supplierList" oninput="validateSection1()">
                                            <datalist id="supplierList"></datalist>
                                        </div>
                                        <div class="input-group">
                                            <label for="monthlyBill" class="input-label text-xs">Monthly Bill ($)</label>
                                            <input type="number" class="form-input !p-2 !text-sm" id="monthlyBill" placeholder="e.g., 1,450.00" step="0.01" oninput="validateSection1()">
                                        </div>
                                        <div class="input-group">
                                            <label for="currentRate" class="input-label text-xs">Current Rate (¢/kWh)</label>
                                            <input type="number" class="form-input !p-2 !text-sm" id="currentRate" placeholder="e.g., 6.2" step="0.01" oninput="validateSection1()">
                                            <div id="rateFeedback" class="input-feedback text-xs"></div>
                                        </div>
                                    </div>
                                    <div id="usageDisplay" class="usage-display !p-3 mt-3 hidden">
                                        <div class="usage-title text-sm">📊 Client's Usage Analysis</div>
                                        <div class="usage-details text-xs" id="usageDetails"></div>
                                    </div>
                                </div>
                                <div class="mt-6"></div>
                                <div class="form-section" id="section2">
                                    <div class="section-header">
                                        <span class="section-header-pill">
                                            <span class="section-icon">2</span> Contract & Sell Rate
                                        </span>
                                    </div>
                                    <div class="grid grid-cols-1 gap-4">
                                        <div class="input-group">
                                            <label for="contractEndDate" class="input-label text-xs">Contract End Date</label>
                                            <input type="text" class="form-input !p-2 !text-sm" id="contractEndDate" placeholder="YYYY-MM-DD" onfocus="openDatePicker()">
                                        </div>
                                        <div class="input-group">
                                            <label for="sellRate" class="input-label text-xs">Sell Rate (¢/kWh)</label>
                                            <input type="number" class="form-input !p-2 !text-sm" id="sellRate" placeholder="e.g., 8.8" step="0.01" oninput="validateSection2()">
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-6"></div>
                                <div class="form-section" id="section3">
                                    <div class="section-header">
                                        <span class="section-header-pill">
                                            <span class="section-icon">3</span> Get Results
                                        </span>
                                    </div>
                                    <p class="text-sm text-gray-400 text-center">Ready to see the analysis!</p>
                                </div>
                            </div>
                            <button class="calculate-button w-full !p-3 !text-sm !font-bold mt-4" id="calculateBtn" onclick="runCalculation()">
                                Complete All Sections Above
                            </button>
                            <button class="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors mt-2 text-sm" id="resetBtn" onclick="resetForm()">
                              Reset Form
                            </button>
                            <div id="loadingAnimation" class="loading-animation">
                                <div class="spinner"></div>
                                <div class="text-gray-400 mt-4 text-sm" id="loadingMessage">Running analysis...</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Call Notes Widget -->
                    <div class="sidebar-card">
                        <h3 class="sidebar-card-title">📝 Call Notes</h3>
                        <div class="sidebar-input-group">
                            <textarea id="call-notes" placeholder="Type your call notes here..."></textarea>
                        </div>
                        <div class="sidebar-actions">
                            <button class="add-notes-btn" onclick="saveProspectAndNotes()">Save Notes</button>
                            <button class="clear-btn" onclick="clearNotes()">Clear</button>
                        </div>
                    </div>

                    <!-- Call Strategy Tips Widget -->
                    <div class="sidebar-card">
                        <h3 class="sidebar-card-title">💡 Call Strategy Tips</h3>
                        <ul class="text-sm text-gray-300 space-y-3">
                            <li class="list-item">
                                <strong class="text-white">Mirror their energy:</strong> Match their speaking pace and enthusiasm.
                            </li>
                            <li class="list-item">
                                <strong class="text-white">Use their name:</strong> Say their name 2-3 times during the call to maintain a personal connection.
                            </li>
                            <li class="list-item">
                                <strong class="text-white">Pause power:</strong> Use 2-3 second pauses after questions to let them process and respond.
                            </li>
                            <li class="list-item">
                                <strong class="text-white">Assume the close:</strong> When scheduling, offer two specific times rather than an open-ended "when works?".
                            </li>
                        </ul>
                    </div>
                    
                    <!-- Objection Responses Widget -->
                    <div class="sidebar-card">
                        <h3 class="sidebar-card-title">🛡️ Quick Objection Responses</h3>
                        <div class="text-sm space-y-4">
                            <div class="p-3 bg-gray-900 rounded-lg border border-gray-700">
                                <p class="font-semibold text-white">"We're happy with our provider."</p>
                                <p class="text-gray-400 mt-1">"That's great to hear. This isn't about changing providers; it's about optimizing your position within the current market structure."</p>
                            </div>
                            <div class="p-3 bg-gray-900 rounded-lg border border-gray-700">
                                <p class="font-semibold text-white">"We just renewed our contract."</p>
                                <p class="text-gray-400 mt-1">"Perfect timing, actually. This gives us a chance to prepare strategically for your next cycle rather than scrambling later."</p>
                            </div>
                            <div class="p-3 bg-gray-900 rounded-lg border border-gray-700">
                                <p class="font-semibold text-white">"Send me some information."</p>
                                <p class="text-gray-400 mt-1">"I can definitely do that. What specific information would be most valuable to you - a rate comparison or market timing strategies?"</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal for Energy Health Check Calendar -->
            <div id="taskModal" class="modal" onclick="closeModal(event)">
              <div class="modal-content">
                <div class="modal-card-container">
                  <div class="modal-card" id="dateCard">
                    <h3 class="text-lg font-semibold text-white mb-4">Select Contract End Date</h3>
                    <div class="calendar-header">
                        <button onclick="prevMonth()" class="text-gray-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <div class="flex-grow flex justify-center items-center">
                            <div id="monthYearDisplay">
                                <span id="monthYearSpan" class="text-white font-semibold cursor-pointer" onclick="toggleMonthYearPicker()"></span>
                            </div>
                            <div id="monthYearPicker" class="flex justify-center items-center hidden">
                                <select id="monthSelector" class="form-input w-2/5 mr-2" onchange="selectMonthYear()"></select>
                                <select id="yearSelector" class="form-input w-2/5 ml-2" onchange="selectMonthYear()"></select>
                            </div>
                        </div>
                        <button onclick="nextMonth()" class="text-gray-400 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
                        </button>
                    </div>
                    <div class="calendar-grid" id="calendarGrid"></div>
                    <button onclick="closeModal(event)" class="mt-6 w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors" id="cancel-btn">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
        `;

        // Initialize the call scripts functionality
        this.initializeCallScriptsPage();
    },

    // Initialize Call Scripts functionality
    initializeCallScriptsPage() {
        // State Machine for the call script flow
        const scriptData = {
            start: {
                you: "Click 'Dial' to begin the call",
                mood: "neutral",
                responses: []
            },
            dialing: {
                you: "Dialing... Ringing...",
                mood: "neutral",
                responses: [
                    { text: "📞 Call Connected", next: "hook" },
                    { text: "📞 Transferred - Decision Maker Answers", next: "main_script_start" },
                    { text: "🚫 No Answer", next: "voicemail_or_hangup" }
                ]
            },
            voicemail_or_hangup: {
                you: "No answer. What would you like to do?",
                mood: "neutral",
                responses: [
                    { text: "Leave Voicemail", next: "voicemail", disposition: "Left Voicemail" },
                    { text: "Hang Up / Start New Call", next: "start", disposition: "No Answer / Hang Up" }
                ]
            },
            hook: {
                you: "Hi, is this <span class='emphasis'>[N]</span>?",
                mood: "neutral",
                responses: [
                    { text: "✅ Yes, this is [N]", next: "main_script_start", disposition: "Connected" },
                    { text: "🗣️ Speaking", next: "main_script_start", disposition: "Connected" },
                    { text: "❓ Who's calling?", next: "main_script_start", disposition: "Connected" },
                    { text: "👥 Gatekeeper / Not the right person", next: "gatekeeper_intro", disposition: "Gatekeeper" }
                ]
            },
            main_script_start: {
                you: "Good mornin'/afternoon, <span class='emphasis'>[N]</span>. <span class='pause'>--</span> I'm Lewis with PowerChoosers and I'm needin' to speak with someone over electricity agreements and contracts for <span class='emphasis'>[CN]</span>. <span class='highlight-yellow'>Would that be yourself?</span>",
                mood: "neutral",
                responses: [
                    { text: "✅ Yes, that's me / I handle that", next: "pathA", disposition: "Decision Maker - Engaged" },
                    { text: "👥 That would be [OP] / Not the right person", next: "gatekeeper_intro", disposition: "Gatekeeper" },
                    { text: "🤝 We both handle it / Team decision", next: "pathA", disposition: "Decision Maker - Engaged" },
                    { text: "🤔 Unsure or hesitant", next: "pathD", disposition: "Decision Maker - Hesitant" }
                ]
            },
            gatekeeper_intro: {
                you: "Good afternoon/morning. I'm needin' to speak with someone over electricity agreements and contracts for <span class='emphasis'>[CN]</span>. <span class='highlight-yellow'>Do you know who would be responsible for that?</span>",
                mood: "neutral",
                responses: [
                    { text: "❓ What's this about?", next: "gatekeeper_whats_about", disposition: "Gatekeeper - Asking" },
                    { text: "🔗 I'll connect you", next: "transfer_dialing", disposition: "Gatekeeper - Transferring" },
                    { text: "🚫 They're not available / Take a message", next: "voicemail", disposition: "Gatekeeper - Take Message" }
                ]
            },
            gatekeeper_whats_about: {
                you: "My name is Lewis with PowerChoosers.com and I'm needin' to speak with someone about the future electricity agreements for <span class='emphasis'>[CN]</span>. <span class='highlight-yellow'>Do you know who might be the best person for that?</span>",
                mood: "neutral",
                responses: [
                    { text: "🔗 I'll connect you", next: "transfer_dialing", disposition: "Gatekeeper - Transferring" },
                    { text: "🚫 They're not available / Take a message", next: "voicemail", disposition: "Gatekeeper - Take Message" },
                    { text: "✅ I can help you", next: "pathA", disposition: "Gatekeeper - Connected" }
                ]
            },
            voicemail: {
                you: "Good afternoon/morning <span class='emphasis'>[N]</span>, this is <span class='emphasis'>Lewis</span> and I was told to speak with you. You can give me a call at <span class='emphasis'>817-409-4215</span>. Also, I shot you over a short email kinda explaining why I'm reaching out to you today. The email should be coming from <span class='emphasis'>Lewis Patterson</span> that's <span class='emphasis'>(L.E.W.I.S)</span>. Thank you so much and you have a great day.",
                mood: "neutral",
                responses: [
                    { text: "🔄 End Call / Start New Call", next: "start", action: "saveProspectAndNotes" }
                ]
            },
            pathA: {
                you: "Perfect. <span class='pause'>--</span> So, <span class='emphasis'>[N]</span>, I've been working closely with <span class='emphasis'>[CI]</span> across Texas with electricity agreements, and we're about to see an <span class='emphasis'>unprecedented dip in the market in the next few months</span>. <span class='pause'>--</span> <span class='highlight-yellow'>Is getting the best price for your next renewal a priority for you and [CN]?</span> <span class='highlight-yellow'>Do you know when your contract expires?</span>",
                mood: "neutral",
                responses: [
                    { text: "😰 Struggling / It's tough", next: "discovery", disposition: "Discovery - Struggle" },
                    { text: "📅 Haven't renewed / Contract not up yet", next: "discovery", disposition: "Discovery - Not Renewed" },
                    { text: "🔒 Locked in / Just renewed", next: "discovery", disposition: "Discovery - Locked In" },
                    { text: "🛒 Shopping around / Looking at options", next: "discovery", disposition: "Discovery - Shopping" },
                    { text: "🤝 Have someone handling it / Work with broker", next: "discovery", disposition: "Discovery - Has Broker" },
                    { text: "🤷 Haven't thought about it / It is what it is", next: "discovery", disposition: "Discovery - No Plan" }
                ]
            },
            discovery: {
                you: "Gotcha! So, <span class='emphasis'>[N]</span>, just so I understand your situation a little better. <span class='pause'>--</span> <span class='highlight-yellow'>What's your current approach to renewing your electricity agreements? Do you handle it internally or work with a consultant?</span>",
                mood: "neutral",
                responses: [
                    { text: "💚 Prospect is engaged / ready for appointment", next: "closeForAppointment", disposition: "Interested - Ready for Appointment" },
                    { text: "🟡 Prospect is hesitant / needs more info", next: "handleHesitation", disposition: "Hesitant - Needs More Info" },
                    { text: "❌ Objection: Happy with current provider", next: "objHappy", disposition: "Objection - Happy with Provider" },
                    { text: "❌ Objection: No time", next: "objNoTime", disposition: "Objection - No Time" }
                ]
            },
            closeForAppointment: {
                you: "Awesome! So, <span class='emphasis'>[N]</span>. <span class='pause'>--</span> I really believe you'll be able to benefit from <span class='emphasis'>[SB]</span> that way you won't have to <span class='emphasis'>[PP]</span>. Our process is super simple! We start with an <span class='emphasis'>energy health check</span> where I look at your usage, contract terms, and then we can talk about what options might look like for <span class='emphasis'>[CN]</span> moving forward.",
                mood: "positive",
                responses: [
                    { text: "📅 Schedule Friday 11 AM", next: "callSuccess", disposition: "Appointment Set - Fri 11 AM" },
                    { text: "📅 Schedule Monday 2 PM", next: "callSuccess", disposition: "Appointment Set - Mon 2 PM" },
                    { text: "🤔 Still hesitant", next: "handleHesitation", disposition: "Hesitant - Still Unsure" }
                ]
            },
            handleHesitation: {
                you: "I get it <span class='pause'>--</span> and called you out of the blue, so now is probably not the best time. How about this <span class='pause'>--</span> let me put together a quick case study specific to <span class='emphasis'>[TIA]</span>s in your area.",
                mood: "unsure",
                responses: [
                    { text: "✅ Yes, send analysis", next: "callSuccess", disposition: "Sent Analysis" },
                    { text: "❌ No, not interested", next: "softClose", disposition: "Not Interested" }
                ]
            },
            objHappy: {
                you: "That's actually great to hear, and I'm not suggesting you should be unhappy or you need to switch your supplier today. <span class='highlight-yellow'>Is it the customer service that you're happy with or are you just getting a rate that you can't find anywhere else?</span>",
                mood: "positive",
                responses: [
                    { text: "✅ Yes, worth understanding", next: "closeForAppointment", disposition: "Open to discussion" },
                    { text: "❌ No, not interested", next: "softClose", disposition: "Not Interested" }
                ]
            },
            objNoTime: {
                you: "I completely get it <span class='pause'>--</span> that's exactly why most businesses end up overpaying. Energy is a complicated market that requires ongoing attention that most internal teams <span class='pause'>--</span> simply don't have time for.",
                mood: "challenging",
                responses: [
                    { text: "✅ Yes, schedule 10-minute assessment", next: "callSuccess", disposition: "Appointment Set - Short Call" },
                    { text: "❌ Still no time", next: "softClose", disposition: "No Time - Declined" }
                ]
            },
            softClose: {
                you: "No problem at all <span class='pause'>--</span> I know energy strategy isn't urgent until it becomes critical. Here's what I'll do: I'm going to add you to my quarterly market intelligence updates.",
                mood: "neutral",
                responses: [
                    { text: "✅ That sounds reasonable", next: "callSuccess", disposition: "Opt-in to updates" },
                    { text: "❌ No thanks", next: "callEnd", disposition: "Opt-out / Cold" }
                ]
            },
            callSuccess: {
                you: "🎉 <span class='emphasis'>Call Completed Successfully!</span><br><br>Remember to track:<br>• Decision maker level<br>• Current contract status<br>• Pain points identified<br>• Interest level<br>• Next action committed",
                mood: "positive",
                responses: [{ text: "🔄 Start New Call", next: "start", action: "saveProspectAndNotes" }]
            },
            callEnd: {
                you: "Thanks for your time. Have a great day!",
                mood: "neutral",
                responses: [{ text: "🔄 Start New Call", next: "start", action: "saveProspectAndNotes" }]
            },
            transfer_dialing: {
                you: "Connecting... Ringing...",
                mood: "neutral",
                responses: [
                    { text: "📞 Call Connected", next: "hook", disposition: "Transferred - Connected" },
                    { text: "🚫 Not Connected", next: "voicemail", disposition: "Transferred - Not Connected" }
                ]
            },
            pathD: {
                you: "I understand this might not be exactly what you handle, but since it affects your company's operating costs, I'd love to get you the right information. <span class='highlight-yellow'>Who would be the best person to speak with about your company's electricity contracts?</span>",
                mood: "neutral",
                responses: [
                    { text: "✅ I can handle it / I'll listen", next: "pathA", disposition: "Decision Maker - Engaged" },
                    { text: "👥 That would be [OP]", next: "gatekeeper_intro", disposition: "Referred to Decision Maker" },
                    { text: "❌ Not interested", next: "softClose", disposition: "Not Interested" }
                ]
            }
        };

        // Global state for the call script application
        const appState = {
            placeholders: {
                'N': '', 'YN': 'Lewis', 'CN': '', 'CI': '', 'SB': '', 'PP': '', 'CT': '', 'TIA': '',
                'TE': '', 'DT': '', 'EAC': '', 'TF': '', 'OP': 'the responsible party', 'XX': '$XX.00/40%', 'P': ''
            },
            inputMap: {
                'input-name': 'N',
                'input-title': 'CT',
                'input-company-name': 'CN',
                'input-company-industry': 'CI',
                'input-benefit': 'SB',
                'input-pain': 'PP',
                'input-phone': 'P'
            },
            currentStep: 'start',
            history: []
        };
        
        let callActive = false;
        let callTimeout;
        let currentDisposition = "";
        
        // Helper function to get an element by ID
        const getEl = id => document.getElementById(id);

        // Updates the script display with the current text, replacing placeholders
        const displayCurrentStep = () => {
            const step = scriptData[appState.currentStep];
            if (!step) return;
            
            const scriptDisplay = getEl('script-display');
            const responsesContainer = getEl('responses-container');
            const backBtn = getEl('back-btn');
            
            const processedText = applyPlaceholders(step.you);
            
            if (scriptDisplay) {
                scriptDisplay.innerHTML = processedText;
                scriptDisplay.className = `script-display mood-${step.mood}`;
                if (appState.currentStep === 'start') {
                    scriptDisplay.classList.add('start');
                } else {
                    scriptDisplay.classList.remove('start');
                }
            }
            
            if (responsesContainer) {
                responsesContainer.innerHTML = '';
                if (appState.currentStep === 'start') {
                    const dialButtonHtml = `
                        <button class="dial-button" onclick="handleDialClick()">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            Dial
                        </button>
                    `;
                    responsesContainer.innerHTML = dialButtonHtml;
                } else if (step.responses && step.responses.length > 0) {
                    step.responses.forEach(response => {
                        const button = document.createElement('button');
                        button.className = 'response-btn';
                        button.innerHTML = applyPlaceholders(response.text);
                        button.onclick = () => {
                            if (response.disposition) {
                                currentDisposition = response.disposition;
                            }
                            selectResponse(response.next, response.action);
                        };
                        responsesContainer.appendChild(button);
                    });
                    
                    if (step.responses.length === 1) {
                        responsesContainer.classList.add('full-width');
                    } else {
                        responsesContainer.classList.remove('full-width');
                    }
                }
            }
            
            if (backBtn) {
                backBtn.disabled = appState.history.length === 0;
            }
        };

        // Replaces placeholders in the script text with values from the state
        const applyPlaceholders = (text) => {
            let newText = text;
            for (const key in appState.placeholders) {
                const regex = new RegExp('\\[' + key + '\\]', 'g');
                let replacement = appState.placeholders[key];
                
                if (key === 'N' && replacement) {
                    replacement = replacement.split(' ')[0];
                }
                
                newText = newText.replace(regex, replacement);
            }
            return newText;
        };

        // Updates the global placeholders from the input fields and refreshes the script
        const updateScript = () => {
            for (const inputId in appState.inputMap) {
                const placeholderKey = appState.inputMap[inputId];
                const inputElement = getEl(inputId);
                if (inputElement) {
                    const inputValue = inputElement.value || '';
                    appState.placeholders[placeholderKey] = inputValue;
                }
            }
            appState.placeholders['TIA'] = appState.placeholders['CI'];
            displayCurrentStep();
        };

        // Handles the click event for the "Dial" button
        const handleDialClick = () => {
            const phoneNumber = getEl('input-phone').value;
            if (!phoneNumber) {
                CRMApp.showToast('Please enter a phone number to dial.', 'error');
                return;
            }

            callActive = true;
            getEl('script-display').classList.add('ringing');
            
            callTimeout = setTimeout(() => {
                callActive = false;
                getEl('script-display').classList.remove('ringing');
                selectResponse('dialing');
            }, 3000);
        };

        // Handles a user selecting a response button
        const selectResponse = (nextStep, action) => {
            if (nextStep && scriptData[nextStep]) {
                appState.history.push(appState.currentStep);
                appState.currentStep = nextStep;
                displayCurrentStep();
            }
            if (action === 'saveProspectAndNotes') {
                saveProspectAndNotes();
            }
        };

        // Navigates back to the previous step in the call history
        const goBack = () => {
            if (appState.history.length > 0) {
                appState.currentStep = appState.history.pop();
                displayCurrentStep();
            }
        };

        // Resets the entire call script and state to the initial values
        const restart = () => {
            appState.currentStep = 'start';
            appState.history = [];
            currentDisposition = "";
            
            for(const inputId in appState.inputMap) {
                const input = getEl(inputId);
                if (input) input.value = '';
            }
            getEl('call-notes').value = '';

            updateScript();
        };

        // Saves the prospect info and call notes
        const saveProspectAndNotes = () => {
            const notes = getEl('call-notes').value;
            const disposition = currentDisposition || "Call Ended - No Disposition";
            const companyName = getEl('input-company-name').value;
            const contactName = getEl('input-name').value;
            const phoneNumber = getEl('input-phone').value;
            const contactTitle = getEl('input-title').value;

            const log = {
                disposition: disposition,
                notes: notes,
                prospect: {
                    name: contactName,
                    company: companyName,
                    phone: phoneNumber,
                    title: contactTitle
                },
                timestamp: new Date().toISOString()
            };

            CRMApp.saveCallLog(log, disposition);
            restart();
        };
        
        // Clears the call notes textarea
        const clearNotes = () => {
            getEl('call-notes').value = '';
        };

        // Energy Health Check widget code
        const supplierData = {
            "NRG": { bbbRating: "A+", popularity: 4, customerService: 3 },
            "TXU": { bbbRating: "A+", popularity: 5, customerService: 4 },
            "APG & E": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
            "Reliant": { bbbRating: "A+", popularity: 5, customerService: 3 },
            "Hudson": { bbbRating: "Unaccredited", popularity: 2, customerService: 2 },
            "Green Mountain": { bbbRating: "Unaccredited", popularity: 3, customerService: 2 },
            "Constellation": { bbbRating: "A+", popularity: 4, customerService: 4 },
            "Tara Energy": { bbbRating: "Unaccredited", popularity: 2, customerService: 3 },
            "Cirro": { bbbRating: "A+", popularity: 3, customerService: 4 },
            "Engie": { bbbRating: "A+", popularity: 3, customerService: 1 },
            "Gexa": { bbbRating: "Unaccredited", popularity: 4, customerService: 2 },
            "Freepoint": { bbbRating: "A+", popularity: 1, customerService: 3 },
            "Shell Energy": { bbbRating: "Unaccredited", popularity: 3, customerService: 2 },
            "Ironhorse": { bbbRating: "4.0 stars", popularity: 1, customerService: 3 },
            "Ammper Power": { bbbRating: "Unaccredited", popularity: 1, customerService: 1 }
        };
        const supplierNames = Object.keys(supplierData);

        const ESTIMATED_DELIVERY_CHARGE_CENTS = 0.05;
        let section1Complete = false, section2Complete = false;
        let currentAnnualUsage = 0, currentMonthlyBill = 0, currentRate = 0, sellRate = 0, currentSupplier = '';
        let currentDate = new Date(), selectedDate = null;
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        
        const formatNumber = num => Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        const updateProgress = () => {
            const progress = getEl('progressFill');
            if (!progress) return;
            
            let percentage = 0;
            if (section1Complete) percentage += 50;
            if (section2Complete) percentage += 50;
            progress.style.width = percentage + '%';
        };
        
        function validateSection1() {
            const supplierInput = getEl('currentSupplier');
            const monthlyBillInput = getEl('monthlyBill');
            const currentRateInput = getEl('currentRate');
            
            const supplierValue = supplierInput.value.trim();
            currentMonthlyBill = parseFloat(monthlyBillInput.value);
            currentRate = parseFloat(currentRateInput.value) / 100; // Convert cents to dollars
            
            const rateFeedback = getEl('rateFeedback');
            const usageDisplay = getEl('usageDisplay');
            const usageDetails = getEl('usageDetails');

            rateFeedback.classList.remove('show', 'feedback-danger', 'feedback-warning', 'feedback-success', 'feedback-info');
            usageDisplay.classList.add('hidden');
            
            if (supplierValue && supplierNames.includes(supplierValue) && currentMonthlyBill > 0 && currentRate > 0) {
                currentSupplier = supplierValue;
                const effectiveCurrentRateAllIn = currentRate + ESTIMATED_DELIVERY_CHARGE_CENTS;
                rateFeedback.classList.add('show');
                if (effectiveCurrentRateAllIn <= 0.10) { 
                    rateFeedback.className = 'input-feedback show feedback-danger'; 
                    rateFeedback.textContent = '🚨 Very old rate - significant increase expected at renewal'; 
                }
                else if (effectiveCurrentRateAllIn <= 0.12) { 
                    rateFeedback.className = 'input-feedback show feedback-warning'; 
                    rateFeedback.textContent = '⚠️ Below market rate - likely increase ahead'; 
                }
                else if (effectiveCurrentRateAllIn <= 0.145) { 
                    rateFeedback.className = 'input-feedback show feedback-success'; 
                    rateFeedback.textContent = '✅ Current market range - competitive rate'; 
                }
                else { 
                    rateFeedback.className = 'input-feedback show feedback-info'; 
                    rateFeedback.textContent = '💰 Above market - savings opportunity available'; 
                }
                
                const monthlyUsage = (currentMonthlyBill / effectiveCurrentRateAllIn);
                currentAnnualUsage = monthlyUsage * 12;
                usageDisplay.classList.remove('hidden');
                let businessSize = (currentAnnualUsage < 50000) ? 'Small Business' : (currentAnnualUsage < 200000) ? 'Medium Business' : 'Large Business';
                usageDetails.innerHTML = `<strong>Monthly Usage:</strong> ${formatNumber(monthlyUsage)} kWh<br><strong>Annual Usage:</strong> ${formatNumber(currentAnnualUsage)} kWh<br><strong>Business Size:</strong> ${businessSize}`;
                
                section1Complete = true;
                getEl('section1').classList.add('completed');
                getEl('section1').querySelector('.section-header-pill').classList.add('completed');
                getEl('section1').querySelector('.section-icon').innerHTML = '✓';
                activateSection(2);
            } else {
                section1Complete = false;
                getEl('section1').classList.remove('completed');
                getEl('section1').querySelector('.section-header-pill').classList.remove('completed');
                getEl('section1').querySelector('.section-icon').innerHTML = '1';
                
                getEl('section2').classList.remove('active', 'completed');
                getEl('section2').querySelector('.section-header-pill').classList.remove('active', 'completed');
                getEl('section2').querySelector('.section-icon').innerHTML = '2';
                getEl('section3').classList.remove('active', 'completed');
                getEl('section3').querySelector('.section-header-pill').classList.remove('active', 'completed');
                getEl('section3').querySelector('.section-icon').innerHTML = '3';
                section2Complete = false;
            }
            updateProgress();
            updateButton();
        }

        function validateSection2() {
            const contractEndDateInput = getEl('contractEndDate');
            const sellRateInput = getEl('sellRate');
            const contractEndDate = contractEndDateInput.value;
            sellRate = parseFloat(sellRateInput.value) / 100; // Convert cents to dollars
            
            if (contractEndDate && sellRate > 0) {
                section2Complete = true;
                getEl('section2').classList.add('completed');
                getEl('section2').querySelector('.section-header-pill').classList.add('completed');
                getEl('section2').querySelector('.section-icon').innerHTML = '✓';
                activateSection(3);
            } else {
                section2Complete = false;
                getEl('section2').classList.remove('completed');
                getEl('section2').querySelector('.section-header-pill').classList.remove('completed');
                getEl('section2').querySelector('.section-header-pill').classList.add('active');
                getEl('section2').querySelector('.section-icon').innerHTML = '2';

                getEl('section3').classList.remove('active', 'completed');
                getEl('section3').querySelector('.section-header-pill').classList.remove('active', 'completed');
                getEl('section3').querySelector('.section-icon').innerHTML = '3';
            }
            updateProgress();
            updateButton();
        }

        function activateSection(sectionNumber) {
            for (let i = 1; i <= 3; i++) {
                const section = getEl(`section${i}`);
                const pill = section.querySelector('.section-header-pill');
                const icon = pill.querySelector('.section-icon');
                if (i < sectionNumber) {
                    section.classList.remove('active');
                    section.classList.add('completed');
                    pill.classList.remove('active');
                    pill.classList.add('completed');
                    icon.innerHTML = '✓';
                } else if (i === sectionNumber) {
                    section.classList.add('active');
                    section.classList.remove('completed');
                    pill.classList.add('active');
                    pill.classList.remove('completed');
                    icon.innerHTML = i;
                } else {
                    section.classList.remove('active', 'completed');
                    pill.classList.remove('active', 'completed');
                    icon.innerHTML = i;
                }
            }
        }

        const updateButton = () => {
            const button = getEl('calculateBtn');
            const isReady = section1Complete && section2Complete;
            button.classList.toggle('ready', isReady);
            button.textContent = isReady ? 'Calculate Savings Potential' : 'Complete All Sections Above';
        };

        const runCalculation = () => {
            if (!section1Complete || !section2Complete || !isFinite(currentMonthlyBill) || !isFinite(currentRate) || !isFinite(sellRate) || !supplierNames.includes(currentSupplier)) {
                console.warn("Attempted to calculate results before all sections were complete or with invalid data.");
                CRMApp.showToast("Please complete all sections with valid data to run the health check.", "warning");
                return;
            }
            
            getEl('calculateBtn').style.display = 'none';
            getEl('loadingAnimation').classList.add('show');
            getEl('loadingMessage').textContent = 'Running analysis...';
            getEl('calculator-wrapper').classList.add('is-calculating');
            setTimeout(calculateResults, 1500);
        };

        function calculateResults() {
            try {
                const contractEndDateStr = getEl('contractEndDate').value;
                const effectiveSellRateAllIn = sellRate + ESTIMATED_DELIVERY_CHARGE_CENTS;
                const annualCurrentCost = currentMonthlyBill * 12;
                const annualProjectedCost = (currentAnnualUsage * effectiveSellRateAllIn);
                const annualSavingsOrIncrease = annualCurrentCost - annualProjectedCost;
                const monthlySavingsOrIncrease = annualSavingsOrIncrease / 12;
                const percentageChange = ((annualSavingsOrIncrease / annualCurrentCost) * 100).toFixed(2);
                
                const currentSupplierData = supplierData[currentSupplier] || { bbbRating: 'N/A', popularity: 1, customerService: 1 };
                
                const savingsFactor = Math.min(Math.max((percentageChange + 100), 0), 200) / 2;
                const supplierFactor = ((currentSupplierData.popularity || 1) + (currentSupplierData.customerService || 1)) / 10 * 100;
                const energyHealthScore = Math.round((savingsFactor * 0.7) + (supplierFactor * 0.3));

                let actionableTips = '';
                const today = new Date();
                const contractEndDate = new Date(contractEndDateStr);
                const monthsUntilExpiration = (contractEndDate.getFullYear() - today.getFullYear()) * 12 + (contractEndDate.getMonth() - today.getMonth());
                
                const formatTips = (title, tips) => `<h4 class="text-green-500 text-sm font-bold mb-2">${title}</h4><ul class="list-disc list-inside space-y-1 text-gray-400 text-xs">${tips.map(t => `<li><strong>${t.bold}:</strong> ${t.text}</li>`).join('')}</ul>`;
                
                const isSummer = today.getMonth() >= 5 && today.getMonth() <= 7;
                const tolerancePercentage = 0.5;

                if (monthsUntilExpiration > 36) {
                    if (percentageChange > 40) {
                        actionableTips = formatTips('Consider Cancelling for Major Savings:', [{ bold: 'Significant Savings', text: 'With savings over 40%, it may be worth cancelling your current agreement. Review the terms for any penalties.' }]);
                    } else {
                        actionableTips = formatTips('No Action Needed:', [{ bold: 'Stable Contract', text: 'Your contract expires far in the future. Monitor the market, but no immediate action is necessary.' }]);
                    }
                } else if (monthsUntilExpiration >= 6 && monthsUntilExpiration <= 12) {
                    if (isSummer && percentageChange > 15) {
                        actionableTips = formatTips('Optimal Renewal Time (Summer Savings):', [{ bold: 'Summer Opportunity', text: 'This is a high-rate season, but your potential savings of over 15% make it an ideal time to renew and lock in a good rate.' }]);
                    } else if (!isSummer && annualSavingsOrIncrease > 0) {
                        actionableTips = formatTips('Optimal Renewal Time:', [{ bold: 'Proactive Renewal', text: 'Your contract is approaching its renewal window. Secure a new plan now to lock in savings and avoid market fluctuations.' }]);
                    } else {
                         actionableTips = formatTips('Monitor Market Closely:', [{ bold: 'Strategic Planning', text: 'Your contract is nearing its end. Keep an eye on market trends to find the best rate before your renewal date.' }]);
                    }
                } else {
                    let idealMonths = monthsUntilExpiration + 6;
                    let renewalYear = new Date(contractEndDateStr);
                    renewalYear.setMonth(renewalYear.getMonth() - 6);
                    
                    if (percentageChange < -30 && monthsUntilExpiration < 12) {
                         actionableTips = formatTips('High-Risk Renewal Alert:', [{ bold: 'Act Now for Best Rates', text: `You are facing a potential rate increase of over 30%. Consider reserving a new price in advance to lock in a more favorable rate before your contract ends.` }]);
                    } else if (percentageChange < -30 && monthsUntilExpiration >= 12) {
                        actionableTips = formatTips('High-Risk Renewal Alert:', [{ bold: 'Plan Ahead for Best Rates', text: `You are facing a potential rate increase of over 30%. We recommend starting the process around ${monthNames[renewalYear.getMonth()]} of ${renewalYear.getFullYear()} to reserve a price in advance.` }]);
                    }
                    else {
                        actionableTips = formatTips('General Advice:', [{ bold: 'Strategic Planning is Key', text: `Based on your contract end date, it's important to have a plan in place. Start monitoring rates to be ready when the time comes to renew.` }]);
                    }
                }

                const resultsSection = document.createElement('div');
                resultsSection.id = 'results';
                resultsSection.className = 'results-section show p-6 mt-6 rounded-xl border';

                let resultAmountClass = '', resultLabelText = '', mainResultClass = '';
                if (annualSavingsOrIncrease > (annualCurrentCost * (tolerancePercentage / 100))) {
                    resultAmountClass = 'text-green-500'; mainResultClass = 'savings'; resultLabelText = 'Potential Annual Client Savings';
                } else if (annualSavingsOrIncrease < -(annualCurrentCost * (tolerancePercentage / 100))) {
                    resultAmountClass = 'text-red-500'; mainResultClass = 'increase'; resultLabelText = 'Projected Annual Increase Risk';
                } else {
                    resultAmountClass = 'text-white'; mainResultClass = 'neutral'; resultLabelText = 'No Significant Change Projected';
                }
                
                resultsSection.innerHTML = `
                    <div class="main-result ${mainResultClass} p-4 rounded-xl border-2 mb-4">
                        <div class="text-3xl font-bold ${resultAmountClass}">${formatNumber(Math.abs(annualSavingsOrIncrease))}</div>
                        <div class="text-sm font-semibold text-white mt-1">${resultLabelText}</div>
                    </div>
                    <div class="details-grid grid grid-cols-2 gap-4 text-center text-sm mb-4">
                        <div class="detail-item p-3 rounded-lg bg-gray-700">
                            <div class="text-white font-bold">${energyHealthScore}%</div>
                            <div class="text-gray-400 text-xs">Energy Health Score</div>
                        </div>
                        <div class="detail-item p-3 rounded-lg bg-gray-700">
                            <div class="text-white font-bold">${currentSupplierData.bbbRating}</div>
                            <div class="text-gray-400 text-xs">Supplier BBB Rating</div>
                        </div>
                        <div class="detail-item p-3 rounded-lg bg-gray-700 col-span-2">
                           <div class="text-white font-bold">${formatNumber(Math.abs(monthlySavingsOrIncrease))}</div>
                           <div class="text-gray-400 text-xs">${resultLabelText.replace('Annual', 'Monthly')}</div>
                        </div>
                    </div>
                    <div class="analysis-box p-4 rounded-xl border-l-4 border-blue-500 bg-gray-700">
                        <div class="analysis-title flex items-center text-blue-500 text-sm font-semibold mb-2">
                            <span class="mr-2">💡</span> Recommended Next Steps
                        </div>
                        <div class="analysis-text text-xs text-gray-400">${actionableTips}</div>
                    </div>`;
                
                const existingResults = getEl('results');
                if (existingResults) existingResults.remove();
                getEl('calculator-wrapper').appendChild(resultsSection);
                resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

                const companyName = getEl('input-company-name').value;
                const updatedAccountData = {
                    currentSupplier: currentSupplier,
                    monthlyBill: currentMonthlyBill,
                    currentRate: currentRate,
                    contractEndDate: contractEndDateStr,
                    sellRate: sellRate,
                    annualSavingsOrIncrease: annualSavingsOrIncrease,
                    energyHealthScore: energyHealthScore
                };
                CRMApp.updateAccountDetailsFromHealthCheck(companyName, updatedAccountData);

            } catch (error) {
                console.error("An error occurred during calculation:", error);
                CRMApp.showToast("An error occurred during calculation. Please check inputs.", "error");
            } finally {
                getEl('loadingAnimation').classList.remove('show');
                getEl('calculateBtn').style.display = 'block';
                getEl('calculator-wrapper').classList.remove('is-calculating');
            }
        }

        const openDatePicker = () => {
            const modal = getEl('taskModal');
            if(modal) {
                modal.classList.add('open');
                renderCalendar();
            }
        };

        const closeModal = (event) => {
            const modal = getEl('taskModal');
            if (event.target === modal || event.target.id === 'cancel-btn') {
                modal.classList.remove('open');
            }
        };

        const resetForm = () => {
            getEl('currentSupplier').value = '';
            getEl('monthlyBill').value = '';
            getEl('currentRate').value = '';
            getEl('sellRate').value = '';
            getEl('contractEndDate').value = '';
            getEl('usageDisplay').classList.add('hidden');
            getEl('rateFeedback').classList.remove('show');
            const results = getEl('results');
            if(results) results.remove();
            
            section1Complete = false;
            section2Complete = false;

            activateSection(1);
            updateButton();
        };

        const renderCalendar = () => {
            const [monthYearSpan, calendarGrid] = [getEl('monthYearSpan'), getEl('calendarGrid')];
            const [year, month] = [currentDate.getFullYear(), currentDate.getMonth()];
            
            const monthYearPicker = getEl('monthYearPicker');
            const display = getEl('monthYearDisplay');
            
            display.classList.remove('hidden');
            monthYearPicker.classList.add('hidden');

            calendarGrid.innerHTML = '';
            monthYearSpan.textContent = `${monthNames[month]} ${year}`;
            
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            daysOfWeek.forEach(day => { const dayHeader = document.createElement('div'); dayHeader.className = 'calendar-day'; dayHeader.textContent = day; calendarGrid.appendChild(dayHeader); });
            for (let i = 0; i < firstDay; i++) calendarGrid.innerHTML += '<div></div>';
            for (let i = 1; i <= daysInMonth; i++) {
                const dateElement = document.createElement('div');
                dateElement.className = 'calendar-date';
                dateElement.textContent = i;
                const fullDate = new Date(year, month, i);
                if (fullDate.toDateString() === new Date().toDateString()) dateElement.classList.add('today');
                dateElement.onclick = () => {
                    document.querySelectorAll('.calendar-date').forEach(d => d.classList.remove('selected'));
                    dateElement.classList.add('selected');
                    selectedDate = fullDate;
                    getEl('contractEndDate').value = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                    getEl('taskModal').classList.remove('open');
                    validateSection2();
                };
                calendarGrid.appendChild(dateElement);
            }
        };

        const toggleMonthYearPicker = () => {
            const picker = getEl('monthYearPicker');
            const calendarGrid = getEl('calendarGrid');
            const monthYearSpan = getEl('monthYearSpan');

            const isPickerVisible = picker.classList.contains('hidden');

            if (isPickerVisible) {
                picker.classList.remove('hidden');
                calendarGrid.classList.add('hidden');
                monthYearSpan.classList.add('hidden');

                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const monthSelector = getEl('monthSelector');
                const yearSelector = getEl('yearSelector');
                monthSelector.innerHTML = monthNames.map((name, index) => `<option value="${index}" ${index === month ? 'selected' : ''}>${name}</option>`).join('');
                
                const currentYear = new Date().getFullYear();
                yearSelector.innerHTML = '';
                for (let y = currentYear - 5; y <= currentYear + 10; y++) {
                    yearSelector.innerHTML += `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
                }

            } else {
                picker.classList.add('hidden');
                calendarGrid.classList.remove('hidden');
                monthYearSpan.classList.remove('hidden');
            }
        };

        const selectMonthYear = () => {
            const month = getEl('monthSelector').value;
            const year = getEl('yearSelector').value;
            currentDate.setMonth(month);
            currentDate.setFullYear(year);
            renderCalendar();
            toggleMonthYearPicker();
        }

        const prevMonth = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); };
        const nextMonth = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); };

        // Expose functions to the global scope
        window.handleDialClick = handleDialClick;
        window.selectResponse = selectResponse;
        window.goBack = goBack;
        window.restart = restart;
        window.saveProspectAndNotes = saveProspectAndNotes;
        window.clearNotes = clearNotes;
        window.updateScript = updateScript;
        window.validateSection1 = validateSection1;
        window.validateSection2 = validateSection2;
        window.runCalculation = runCalculation;
        window.resetForm = resetForm;
        window.openDatePicker = openDatePicker;
        window.closeModal = closeModal;
        window.activateSection = activateSection;
        window.updateButton = updateButton;
        window.prevMonth = prevMonth;
        window.nextMonth = nextMonth;
        window.toggleMonthYearPicker = toggleMonthYearPicker;
        window.selectMonthYear = selectMonthYear;

        // Initialize everything
        activateSection(1);
        updateButton(); 
        const datalist = getEl('supplierList');
        supplierNames.forEach(supplier => {
            const option = document.createElement('option');
            option.value = supplier;
            datalist.appendChild(option);
        });

        // Display initial step
        displayCurrentStep();
        updateScript();
    },

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
        
        const sortedActivities = this.activities.sort((a, b) => b.createdAt - a.createdAt);
        const totalPages = Math.ceil(sortedActivities.length / this.activitiesPerPage);

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

    // Get activity icon based on type
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