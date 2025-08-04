// Quick action functions
addAccount() {
    this.openModal('add-account-modal');
},

addContact() {
    // Populate account dropdown
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
    const modal = document.getElementById(modalI// Power Choosers CRM Dashboard - Main JavaScript File
// This file contains the complete application logic for the redesigned Power Choosers CRM.

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

// Application initialization
async init() {
    try {
        await this.loadInitialData();
        this.setupEventListeners();
        this.renderDashboard();
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
        { id: 'acc1', name: 'ABC Manufacturing', phone: '(214) 555-0123', city: 'Dallas', state: 'TX', industry: 'Manufacturing' },
        { id: 'acc2', name: 'XYZ Energy Solutions', phone: '(972) 555-0456', city: 'Plano', state: 'TX', industry: 'Energy' }
    ];
    this.contacts = [
        { id: 'con1', firstName: 'John', lastName: 'Smith', title: 'CEO', accountId: 'acc1', accountName: 'ABC Manufacturing', email: 'john@abcmfg.com', phone: '(214) 555-0123' },
        { id: 'con2', firstName: 'Sarah', lastName: 'Johnson', title: 'CFO', accountId: 'acc1', accountName: 'ABC Manufacturing', email: 'sarah@abcmfg.com', phone: '(214) 555-0124' },
        { id: 'con3', firstName: 'Mike', lastName: 'Davis', title: 'Operations Manager', accountId: 'acc2', accountName: 'XYZ Energy Solutions', email: 'mike@xyzenergy.com', phone: '(972) 555-0456' }
    ];
    this.activities = [
        { id: 'act1', type: 'call_note', description: 'Call with John Smith - Q1 Energy Contract', noteContent: 'Discussed renewal options', contactId: 'con1', contactName: 'John Smith', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date() },
        { id: 'act2', type: 'email', description: 'Sent energy analysis to Sarah Johnson', contactId: 'con2', contactName: 'Sarah Johnson', accountId: 'acc1', accountName: 'ABC Manufacturing', createdAt: new Date() },
        { id: 'act3', type: 'call_note', description: 'Follow-up with Mike Davis - Multi-site proposal', noteContent: 'Reviewing proposal details', contactId: 'con3', contactName: 'Mike Davis', accountId: 'acc2', accountName: 'XYZ Energy Solutions', createdAt: new Date() }
    ];
    this.tasks = [
        { id: 't1', title: 'Follow up with John Smith - Q1 Energy Contract', time: '3:00 PM', contactId: 'con1' },
        { id: 't2', title: 'Prepare energy analysis for Sarah Johnson', time: '3:30 PM', contactId: 'con2' },
        { id: 't3', title: 'Review Mike Davis multi-site proposal', time: '9:00 AM', contactId: 'con3' }
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
        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });
    }

    // Notification button
    const notificationBtn = document.getElementById('notification-btn');
    const notificationDropdown = document.getElementById('notification-dropdown');
    if (notificationBtn && notificationDropdown) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationDropdown.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!notificationDropdown.contains(e.target)) {
                notificationDropdown.classList.remove('active');
            }
        });
    }

    // Modal form submissions
    this.setupModalHandlers();

    // Quick action buttons
    window.addAccount = () => this.addAccount();
    window.addContact = () => this.addContact();
    window.bulkImport = () => this.bulkImport();
    window.closeModal = (modalId) => this.closeModal(modalId);
},

// Setup modal event handlers
setupModalHandlers() {
    // Add Account Form
    const addAccountForm = document.getElementById('add-account-form');
    if (addAccountForm) {
        addAccountForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAddAccount(e);
        });
    }

    // Add Contact Form
    const addContactForm = document.getElementById('add-contact-form');
    if (addContactForm) {
        addContactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAddContact(e);
        });
    }

    // Bulk Import Form
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
        view.classList.remove('active');
    });
    const activeView = document.getElementById(viewName);
    if (activeView) {
        activeView.classList.add('active');
    }
    
    // Render content for the active view
    if (viewName === 'dashboard-view') {
        this.renderDashboard();
    }
},

// Update the active state of navigation buttons
updateActiveNavButton(activeNav) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    activeNav.classList.add('active');
},

// Main dashboard rendering function
renderDashboard() {
    this.renderDashboardStats();
    this.renderTodayTasks();
    this.renderRecentActivities();
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
    
    if (this.tasks.length > 0) {
        this.tasks.forEach(task => {
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

// Render recent activities list
renderRecentActivities() {
    const activityList = document.getElementById('activity-list');
    if (!activityList) return;
    
    activityList.innerHTML = '';
    
    // Sort activities by date (most recent first)
    const recentActivities = this.activities
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8); // Show last 8 activities
    
    if (recentActivities.length > 0) {
        recentActivities.forEach(activity => {
            const li = document.createElement('li');
            li.className = 'activity-item';
            li.innerHTML = `
                <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
                <div class="activity-content">
                    <p class="activity-text">${activity.description}</p>
                    <span class="activity-timestamp">${this.formatDate(activity.createdAt)}</span>
                </div>
            `;
            activityList.appendChild(li);
        });
    } else {
        activityList.innerHTML = '<li class="no-items">No recent activity.</li>';
    }
},

// Get activity icon based on type
getActivityIcon(type) {
    const icons = {
        'call_note': '📞',
        'email': '📧',
        'meeting': '🤝',
        'task_completed': '✅',
        'contact_added': '👤',
        'account_added': '🏢',
        'note': '📝'
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
    
    const results = [];
    
    // Search accounts
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
    
    // Search contacts
    this.contacts.forEach(contact => {
        const fullName = `${contact.firstName} ${contact.lastName}`;
        if (fullName.toLowerCase().includes(query.toLowerCase()) || 
            contact.email.toLowerCase().includes(query.toLowerCase())) {
            results.push({
                type: 'contact',
                id: contact.id,
                name: fullName,
                subtitle: contact.accountName || 'Contact'
            });
        }
    });
    
    console.log('Search results:', results);
    // Here you could show search results in a dropdown
},

// Quick action functions
addAccount() {
    this.openModal('add-account-modal');
},

addContact() {
    // Populate account dropdown
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
        // Reset form
        const form = modal.querySelector('form');
        if (form) form.reset();
    }
},

// Handle Add Account Form
async handleAddAccount(e) {
    const formData = new FormData(e.target);
    const accountData = {
        name: document.getElementById('account-name').value,
        industry: document.getElementById('account-industry').value,
        phone: document.getElementById('account-phone').value,
        website: document.getElementById('account-website').value,
        address: document.getElementById('account-address').value,
        createdAt: new Date()
    };
    
    try {
        await this.saveAccount(accountData);
        this.closeModal('add-account-modal');
    } catch (error) {
        console.error('Error adding account:', error);
    }
},

// Handle Add Contact Form
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
        await this.saveContact(contactData);
        this.closeModal('add-contact-modal');
    } catch (error) {
        console.error('Error adding contact:', error);
    }
},

// Handle Bulk Import
async handleBulkImport(e) {
    const importType = document.getElementById('import-type').value;
    const fileInput = document.getElementById('csv-file');
    const file = fileInput.files[0];
    
    if (!file) {
        this.showToast('Please select a CSV file', 'error');
        return;
    }
    
    try {
        const text = await file.text();
        const rows = text.split('\n').map(row => row.split(','));
        const headers = rows[0].map(h => h.trim().toLowerCase());
        const data = rows.slice(1).filter(row => row.length > 1);
        
        let imported = 0;
        
        for (const row of data) {
            if (importType === 'contacts') {
                const contactData = {
                    firstName: this.getColumnValue(row, headers, ['first name', 'firstname']),
                    lastName: this.getColumnValue(row, headers, ['last name', 'lastname']),
                    email: this.getColumnValue(row, headers, ['email']),
                    phone: this.getColumnValue(row, headers, ['phone']),
                    title: this.getColumnValue(row, headers, ['title', 'job title']),
                    accountName: this.getColumnValue(row, headers, ['company', 'account']),
                    createdAt: new Date()
                };
                
                if (contactData.firstName && contactData.lastName && contactData.email) {
                    await this.saveContact(contactData);
                    imported++;
                }
            } else if (importType === 'accounts') {
                const accountData = {
                    name: this.getColumnValue(row, headers, ['company', 'name']),
                    industry: this.getColumnValue(row, headers, ['industry']),
                    phone: this.getColumnValue(row, headers, ['phone']),
                    website: this.getColumnValue(row, headers, ['website']),
                    address: this.getColumnValue(row, headers, ['address']),
                    createdAt: new Date()
                };
                
                if (accountData.name) {
                    await this.saveAccount(accountData);
                    imported++;
                }
            }
        }
        
        this.showToast(`Successfully imported ${imported} ${importType}`, 'success');
        this.closeModal('bulk-import-modal');
        
    } catch (error) {
        console.error('Error importing CSV:', error);
        this.showToast('Error importing CSV file', 'error');
    }
},

// Utility function to get column value from CSV
getColumnValue(row, headers, columnNames) {
    for (const name of columnNames) {
        const index = headers.indexOf(name);
        if (index !== -1 && row[index]) {
            return row[index].trim();
        }
    }
    return '';
},

// Update notifications system
updateNotifications() {
    this.notifications = [];
    
    // Check for new contacts (created in last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newContacts = this.contacts.filter(c => new Date(c.createdAt) > yesterday);
    
    // Check for new accounts
    const newAccounts = this.accounts.filter(a => new Date(a.createdAt) > yesterday);
    
    // Check for pending tasks
    const today = new Date();
    const pendingTasks = this.tasks.filter(t => !t.completed && new Date(t.dueDate) <= today);
    
    // Add notifications
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
    
    // Update notification UI
    this.renderNotifications();
    this.updateNavigationBadges();
},

// Render notifications dropdown
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
                    <div class="notification-content">
                        <div class="notification-icon ${notification.type}">
                            ${this.getNotificationIcon(notification.type)}
                        </div>
                        <div class="notification-text">
                            <div class="notification-message">${notification.message}</div>
                            <div class="notification-time">${notification.time}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }
},

// Update navigation badges
updateNavigationBadges() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Contacts badge
    const newContacts = this.contacts.filter(c => new Date(c.createdAt) > yesterday).length;
    this.updateBadge('contacts-badge', newContacts);
    
    // Accounts badge
    const newAccounts = this.accounts.filter(a => new Date(a.createdAt) > yesterday).length;
    this.updateBadge('accounts-badge', newAccounts);
    
    // Tasks badge
    const today = new Date();
    const pendingTasks = this.tasks.filter(t => !t.completed && new Date(t.dueDate) <= today).length;
    this.updateBadge('tasks-badge', pendingTasks);
    
    // Emails badge (placeholder - would connect to actual email system)
    this.updateBadge('emails-badge', 0);
},

// Update individual badge
updateBadge(badgeId, count) {
    const badge = document.getElementById(badgeId);
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
},

// Get notification icon
getNotificationIcon(type) {
    const icons = {
        contact: '👤',
        account: '🏢',
        email: '📧',
        task: '✅'
    };
    return icons[type] || '📋';
},

// Utility functions
updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
},

formatDate(date) {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleString();
},

// Toast notification system
showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toast-container');
    if (container) {
        container.appendChild(toast);
    } else {
        document.body.appendChild(toast);
    }
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
},

// Save data to Firestore
async saveActivity(activityData) {
    try {
        await db.collection('activities').add({
            ...activityData,
            createdAt: serverTimestamp()
        });
        console.log('Activity saved successfully');
        this.showToast('Activity saved successfully!', 'success');
        // Reload activities
        await this.loadInitialData();
        this.renderRecentActivities();
    } catch (error) {
        console.error('Error saving activity:', error);
        this.showToast('Failed to save activity', 'error');
    }
},

async saveAccount(accountData) {
    try {
        await db.collection('accounts').add({
            ...accountData,
            createdAt: serverTimestamp()
        });
        console.log('Account saved successfully');
        this.showToast('Account saved successfully!', 'success');
        // Reload data
        await this.loadInitialData();
        this.renderDashboardStats();
    } catch (error) {
        console.error('Error saving account:', error);
        this.showToast('Failed to save account', 'error');
    }
},

async saveContact(contactData) {
    try {
        await db.collection('contacts').add({
            ...contactData,
            createdAt: serverTimestamp()
        });
        console.log('Contact saved successfully');
        this.showToast('Contact saved successfully!', 'success');
        // Reload data
        await this.loadInitialData();
        this.renderDashboardStats();
    } catch (error) {
        console.error('Error saving contact:', error);
        this.showToast('Failed to save contact', 'error');
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

// --- 6. Export functions for global use ---
window.formatCurrency = formatCurrency;
window.formatNumber = formatNumber;
window.debounce = debounce;