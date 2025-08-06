// Power Choosers CRM Dashboard - Main JavaScript File (FIXED VERSION)
// This file contains the complete application logic for the redesigned Power Choosers CRM.

// Wait for Firebase to be available
function waitForFirebase() {
    return new Promise((resolve) => {
        if (typeof firebase !== 'undefined') {
            resolve();
        } else {
            setTimeout(() => waitForFirebase().then(resolve), 100);
        }
    });
}

// --- Global Application State and Data ---
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
            console.log('Initializing CRM App...');
            
            // Wait for Firebase to be available
            await waitForFirebase();
            
            // Load initial data (will use sample data if Firebase fails)
            await this.loadInitialData();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Show initial view
            this.showView('dashboard-view');
            
            // Update notifications
            this.updateNotifications();
            
            console.log('CRM App initialized successfully');
        } catch (error) {
            console.error('Error initializing CRM App:', error);
            this.showToast('Application loaded with sample data', 'info');
            
            // Load sample data and continue
            this.loadSampleData();
            this.setupEventListeners();
            this.showView('dashboard-view');
            this.updateNotifications();
        }
    },

    // Load initial data from Firestore or use sample data
    async loadInitialData() {
        try {
            // Check if Firebase is available
            if (typeof firebase === 'undefined' || !window.db) {
                console.log('Firebase not available, using sample data');
                return this.loadSampleData();
            }

            console.log('Loading data from Firebase...');
            
            const [accountsSnapshot, contactsSnapshot, activitiesSnapshot] = await Promise.all([
                window.db.collection('accounts').get(),
                window.db.collection('contacts').get(),
                window.db.collection('activities').orderBy('createdAt', 'desc').limit(50).get()
            ]);
            
            this.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.contacts = contactsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.activities = activitiesSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date() 
            }));
            
            console.log('Firebase data loaded:', {
                accounts: this.accounts.length,
                contacts: this.contacts.length,
                activities: this.activities.length
            });
            
            return true;
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            console.log('Falling back to sample data');
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
            { id: 'act3', type: 'call_note', description: 'Follow-up with Mike Davis - Multi-site proposal', noteContent: 'Reviewing proposal details', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
        ];
        this.tasks = [
            { id: 't1', title: 'Follow up with John Smith - Q1 Energy Contract', time: '3:00 PM', contactId: 'con1', dueDate: new Date(Date.now() - 1000), completed: false },
            { id: 't2', title: 'Prepare energy analysis for Sarah Johnson', time: '3:30 PM', contactId: 'con2', dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), completed: false }
        ];
        this.callLogs = [];
        return true;
    },

    // Setup event listeners
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
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
            searchInput.addEventListener('input', this.debounce((e) => {
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
                e.preventDefault();
                e.stopPropagation();
                console.log('Call Scripts button clicked!');
                this.loadCallScriptsView();
            });
        } else {
            console.error('Call Scripts button not found!');
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
        
        console.log('Event listeners setup complete');
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
            console.log(`Switched to: ${viewName}`);
        }
    },

    // Update the active state of navigation buttons
    updateActiveNavButton(activeNav) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        activeNav.classList.add('active');
    },

    // Load and render Call Scripts view
    async loadCallScriptsView() {
        console.log('Loading Call Scripts view...');
        
        try {
            this.showView('call-scripts-view');
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
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
                <div class="calls-hub-main">
                    <h2 class="text-2xl font-bold mb-6 text-white text-center">Cold Calling Script</h2>
                    
                    <div class="calls-hub-main-inner">
                        <div class="script-display p-6" id="script-display">
                            Click 'Dial' to begin the call
                        </div>

                        <div class="response-buttons mt-6" id="responses-container">
                            <button class="dial-button" onclick="handleDialClick()">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                                Dial
                            </button>
                        </div>

                        <div class="calls-hub-footer">
                            <button id="back-btn" class="action-btn" onclick="goBack()" disabled>← Back</button>
                            <button id="restart-btn" class="restart-btn-icon" onclick="restart()">
                                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path d="M21.5 13a9.5 9.5 0 1 1-9.5-9.5V3a.5.5 0 0 0-1 0v.5A9.5 9.5 0 1 1 21.5 13zM12 2v4M12 18v4M22 12h-4M6 12H2M18 18l-3-3M18 6l-3 3M6 18l3-3M6 6l3 3"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="calls-hub-sidebar">
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
                    </div>

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
                </div>
            </div>
        `;

        // Initialize the call scripts functionality
        this.initializeCallScriptsPage();
    },

    // Initialize Call Scripts functionality
    initializeCallScriptsPage() {
        // Simple script functionality for now
        window.handleDialClick = () => {
            const phoneNumber = document.getElementById('input-phone').value;
            if (!phoneNumber) {
                this.showToast('Please enter a phone number to dial.', 'error');
                return;
            }
            this.showToast('Call initiated!', 'success');
        };

        window.updateScript = () => {
            // Update script based on input
            console.log('Script updated');
        };

        window.saveProspectAndNotes = () => {
            const notes = document.getElementById('call-notes').value;
            const company = document.getElementById('input-company-name').value;
            const name = document.getElementById('input-name').value;
            
            if (notes || company || name) {
                this.showToast('Notes saved successfully!', 'success');
            } else {
                this.showToast('Please enter some information to save.', 'warning');
            }
        };

        window.clearNotes = () => {
            document.getElementById('call-notes').value = '';
            this.showToast('Notes cleared', 'info');
        };

        window.goBack = () => {
            this.showToast('Back functionality not implemented yet', 'info');
        };

        window.restart = () => {
            document.getElementById('input-phone').value = '';
            document.getElementById('input-company-name').value = '';
            document.getElementById('input-name').value = '';
            document.getElementById('call-notes').value = '';
            this.showToast('Form reset', 'info');
        };
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
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            return;
        } else {
            if (prevBtn) prevBtn.style.display = 'block';
            if (nextBtn) nextBtn.style.display = 'block';
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
            'call_note': '📞',
            'email': '📧',
            'note': '📝',
            'task_completed': '✅',
            'contact_added': '👤',
            'account_added': '🏢',
            'bulk_import': '📥'
        };
        return icons[type] || '📋';
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
        console.log('Searching for:', query);
        // Search implementation would go here
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
        
        this.accounts.push({ id: 'acc' + Date.now(), ...accountData });
        this.showToast('Account created successfully!', 'success');
        this.closeModal('add-account-modal');
        this.renderDashboardStats();
    },

    async handleAddContact(e) {
        const contactData = {
            firstName: document.getElementById('contact-first-name').value,
            lastName: document.getElementById('contact-last-name').value,
            email: document.getElementById('contact-email').value,
            phone: document.getElementById('contact-phone').value,
            title: document.getElementById('contact-title').value,
            accountId: document.getElementById('contact-account').value,
            createdAt: new Date()
        };
        
        this.contacts.push({ id: 'con' + Date.now(), ...contactData });
        this.showToast('Contact created successfully!', 'success');
        this.closeModal('add-contact-modal');
        this.renderDashboardStats();
    },

    async handleBulkImport(e) {
        this.showToast('Bulk import functionality will be implemented soon', 'info');
        this.closeModal('bulk-import-modal');
    },

    updateNotifications() {
        this.notifications = [];
        
        if (this.contacts.length > 0) {
            this.notifications.push({
                type: 'contact',
                message: `${this.contacts.length} contact(s) in system`,
                count: this.contacts.length,
                time: 'Active'
            });
        }
        
        if (this.accounts.length > 0) {
            this.notifications.push({
                type: 'account',
                message: `${this.accounts.length} account(s) in system`,
                count: this.accounts.length,
                time: 'Active'
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
        this.updateBadge('contacts-badge', this.contacts.length);
        this.updateBadge('accounts-badge', this.accounts.length);
        this.updateBadge('tasks-badge', this.tasks.length);
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
            task: '✅'
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

    // Utility function for debouncing
    debounce(func, wait) {
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
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing CRM App...');
    CRMApp.init();
});

// Make CRMApp globally available
window.CRMApp = CRMApp;