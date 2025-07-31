// CRM Application Main JavaScript File

// Global state management
const CRMApp = {
    currentView: 'dashboard',
    currentAccount: null,
    currentContact: null,
    accounts: [],
    contacts: [],
    activities: []
};

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Main initialization function
function initializeApp() {
    setupNavigation();
    setupModals();
    setupEventListeners();
    loadInitialData();
    showView('dashboard');
}

// Navigation setup
function setupNavigation() {
    const navButtons = document.querySelectorAll('.app-button[data-view]');
    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const view = button.getAttribute('data-view');
            showView(view);
            updateActiveNavButton(button);
        });
    });
}

// Show specific view
function showView(viewName) {
    // Hide all views
    document.querySelectorAll('.view-container').forEach(view => {
        view.classList.remove('active');
    });
    
    // Show selected view
    const targetView = document.getElementById(viewName + '-view');
    if (targetView) {
        targetView.classList.add('active');
        CRMApp.currentView = viewName;
        
        // Update page title
        updatePageTitle(viewName);
        
        // Load view-specific data
        loadViewData(viewName);
    }
}

// Update active navigation button
function updateActiveNavButton(activeButton) {
    document.querySelectorAll('.app-button').forEach(btn => {
        btn.classList.remove('active');
    });
    activeButton.classList.add('active');
}

// Update page title based on current view
function updatePageTitle(viewName) {
    const titles = {
        'dashboard': 'Power Choosers CRM',
        'accounts': 'Power Choosers CRM - Accounts',
        'contacts': 'Power Choosers CRM - Contacts',
        'account-detail': 'Power Choosers CRM - Account Details'
    };
    
    document.getElementById('page-title').textContent = titles[viewName] || 'Power Choosers CRM';
}

// Setup modal functionality
function setupModals() {
    // Account modal
    const accountModal = document.getElementById('account-modal');
    const closeAccountModal = document.getElementById('close-account-modal');
    const cancelAccount = document.getElementById('cancel-account');
    
    closeAccountModal.addEventListener('click', () => hideModal('account-modal'));
    cancelAccount.addEventListener('click', () => hideModal('account-modal'));
    
    // Contact modal
    const contactModal = document.getElementById('contact-modal');
    const closeContactModal = document.getElementById('close-contact-modal');
    const cancelContact = document.getElementById('cancel-contact');
    
    closeContactModal.addEventListener('click', () => hideModal('contact-modal'));
    cancelContact.addEventListener('click', () => hideModal('contact-modal'));
    
    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('active');
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Quick action buttons
    document.getElementById('add-account-btn').addEventListener('click', () => showNewAccountModal());
    document.getElementById('add-contact-btn').addEventListener('click', () => showNewContactModal());
    document.getElementById('new-account-btn').addEventListener('click', () => showNewAccountModal());
    document.getElementById('new-contact-btn').addEventListener('click', () => showNewContactModal());
    
    // Form submissions
    document.getElementById('account-form').addEventListener('submit', handleAccountSubmit);
    document.getElementById('contact-form').addEventListener('submit', handleContactSubmit);
    
    // Back to accounts button
    document.getElementById('back-to-accounts').addEventListener('click', () => {
        showView('accounts');
        updateActiveNavButton(document.getElementById('accounts-btn'));
    });
    
    // Save account note button
    document.getElementById('save-account-note').addEventListener('click', saveAccountNote);
}

// Load initial data
async function loadInitialData() {
    showLoading(true);
    try {
        await Promise.all([
            loadAccounts(),
            loadContacts(),
            loadActivities()
        ]);
        updateDashboardStats();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showToast('Error loading data', 'error');
    } finally {
        showLoading(false);
    }
}

// Load view-specific data
function loadViewData(viewName) {
    switch(viewName) {
        case 'dashboard':
            updateDashboardStats();
            renderRecentActivities();
            break;
        case 'accounts':
            renderAccounts();
            break;
        case 'contacts':
            renderContacts();
            break;
        case 'account-detail':
            if (CRMApp.currentAccount) {
                renderAccountDetail();
            }
            break;
    }
}

// Load accounts from Firebase
async function loadAccounts() {
    try {
        const { db, collection, getDocs, orderBy, query } = window.FirebaseDB;
        const accountsQuery = query(collection(db, 'accounts'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(accountsQuery);
        
        CRMApp.accounts = [];
        snapshot.forEach(doc => {
            CRMApp.accounts.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return CRMApp.accounts;
    } catch (error) {
        console.error('Error loading accounts:', error);
        CRMApp.accounts = [];
        return [];
    }
}

// Load contacts from Firebase
async function loadContacts() {
    try {
        const { db, collection, getDocs, orderBy, query } = window.FirebaseDB;
        const contactsQuery = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(contactsQuery);
        
        CRMApp.contacts = [];
        snapshot.forEach(doc => {
            CRMApp.contacts.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return CRMApp.contacts;
    } catch (error) {
        console.error('Error loading contacts:', error);
        CRMApp.contacts = [];
        return [];
    }
}

// Load activities from Firebase
async function loadActivities() {
    try {
        const { db, collection, getDocs, orderBy, query, limit } = window.FirebaseDB;
        const activitiesQuery = query(
            collection(db, 'activities'), 
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        const snapshot = await getDocs(activitiesQuery);
        
        CRMApp.activities = [];
        snapshot.forEach(doc => {
            CRMApp.activities.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return CRMApp.activities;
    } catch (error) {
        console.error('Error loading activities:', error);
        CRMApp.activities = [];
        return [];
    }
}

// Show new account modal
function showNewAccountModal() {
    document.getElementById('account-modal-title').textContent = 'Add New Account';
    document.getElementById('account-form').reset();
    CRMApp.currentAccount = null;
    showModal('account-modal');
}

// Show new contact modal
function showNewContactModal() {
    document.getElementById('contact-modal-title').textContent = 'Add New Contact';
    document.getElementById('contact-form').reset();
    CRMApp.currentContact = null;
    populateAccountDropdown();
    showModal('contact-modal');
}

// Show modal
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

// Hide modal
function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Populate account dropdown in contact form
function populateAccountDropdown() {
    const select = document.getElementById('contact-account');
    select.innerHTML = '<option value="">Select an account...</option>';
    
    CRMApp.accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = account.name;
        select.appendChild(option);
    });
}

// Handle account form submission
async function handleAccountSubmit(e) {
    e.preventDefault();
    showLoading(true);
    
    try {
        const formData = new FormData(e.target);
        const accountData = {
            name: document.getElementById('account-name').value,
            industry: document.getElementById('account-industry').value,
            phone: document.getElementById('account-phone').value,
            website: document.getElementById('account-website').value,
            address: document.getElementById('account-address').value,
            updatedAt: window.FirebaseDB.serverTimestamp(),
            createdAt: CRMApp.currentAccount ? CRMApp.currentAccount.createdAt : window.FirebaseDB.serverTimestamp()
        };
        
        const { db, doc, setDoc } = window.FirebaseDB;
        const accountId = CRMApp.currentAccount ? CRMApp.currentAccount.id : window.generateId();
        
        await setDoc(doc(db, 'accounts', accountId), accountData);
        
        // Log activity
        await logActivity({
            type: CRMApp.currentAccount ? 'account_updated' : 'account_created',
            description: `${CRMApp.currentAccount ? 'Updated' : 'Created'} account: ${accountData.name}`,
            accountId: accountId,
            accountName: accountData.name
        });
        
        hideModal('account-modal');
        showToast(`Account ${CRMApp.currentAccount ? 'updated' : 'created'} successfully!`);
        
        await loadAccounts();
        renderAccounts();
        updateDashboardStats();
        
    } catch (error) {
        console.error('Error saving account:', error);
        showToast('Error saving account', 'error');
    } finally {
        showLoading(false);
    }
}

// Handle contact form submission
async function handleContactSubmit(e) {
    e.preventDefault();
    showLoading(true);
    
    try {
        const contactData = {
            firstName: document.getElementById('contact-first-name').value,
            lastName: document.getElementById('contact-last-name').value,
            title: document.getElementById('contact-title').value,
            accountId: document.getElementById('contact-account').value,
            email: document.getElementById('contact-email').value,
            phone: document.getElementById('contact-phone').value,
            notes: document.getElementById('contact-notes').value,
            updatedAt: window.FirebaseDB.serverTimestamp(),
            createdAt: CRMApp.currentContact ? CRMApp.currentContact.createdAt : window.FirebaseDB.serverTimestamp()
        };
        
        // Get account name for reference
        let accountName = '';
        if (contactData.accountId) {
            const account = CRMApp.accounts.find(acc => acc.id === contactData.accountId);
            accountName = account ? account.name : '';
            contactData.accountName = accountName;
        }
        
        const { db, doc, setDoc } = window.FirebaseDB;
        const contactId = CRMApp.currentContact ? CRMApp.currentContact.id : window.generateId();
        
        await setDoc(doc(db, 'contacts', contactId), contactData);
        
        // Log activity
        await logActivity({
            type: CRMApp.currentContact ? 'contact_updated' : 'contact_created',
            description: `${CRMApp.currentContact ? 'Updated' : 'Created'} contact: ${contactData.firstName} ${contactData.lastName}`,
            contactId: contactId,
            contactName: `${contactData.firstName} ${contactData.lastName}`,
            accountId: contactData.accountId,
            accountName: accountName
        });
        
        hideModal('contact-modal');
        showToast(`Contact ${CRMApp.currentContact ? 'updated' : 'created'} successfully!`);
        
        await loadContacts();
        renderContacts();
        updateDashboardStats();
        
    } catch (error) {
        console.error('Error saving contact:', error);
        showToast('Error saving contact', 'error');
    } finally {
        showLoading(false);
    }
}

// Log activity to Firebase
async function logActivity(activityData) {
    try {
        const { db, doc, setDoc, serverTimestamp } = window.FirebaseDB;
        const activityId = window.generateId();
        
        const activity = {
            ...activityData,
            createdAt: serverTimestamp(),
            id: activityId
        };
        
        await setDoc(doc(db, 'activities', activityId), activity);
        
        // Add to local activities array
        CRMApp.activities.unshift(activity);
        
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// Save account note
async function saveAccountNote() {
    if (!CRMApp.currentAccount) return;
    
    const noteContent = document.getElementById('account-note-input').value.trim();
    if (!noteContent) {
        showToast('Please enter a note', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        // Log activity
        await logActivity({
            type: 'note_added',
            description: `Added note: ${noteContent.substring(0, 50)}${noteContent.length > 50 ? '...' : ''}`,
            accountId: CRMApp.currentAccount.id,
            accountName: CRMApp.currentAccount.name,
            noteContent: noteContent
        });
        
        document.getElementById('account-note-input').value = '';
        showToast('Note saved successfully!');
        
        // Refresh activities
        await loadActivities();
        renderAccountActivities();
        
    } catch (error) {
        console.error('Error saving note:', error);
        showToast('Error saving note', 'error');
    } finally {
        showLoading(false);
    }
}

// Render accounts
function renderAccounts() {
    const container = document.getElementById('accounts-grid');
    
    if (CRMApp.accounts.length === 0) {
        container.innerHTML = '<p class="empty-state">No accounts found. Click "New Account" to get started.</p>';
        return;
    }
    
    container.innerHTML = CRMApp.accounts.map(account => `
        <div class="account-card" onclick="showAccountDetail('${account.id}')">
            <div class="card-header">
                <div>
                    <div class="card-name">${account.name || 'Unnamed Account'}</div>
                    <div class="card-subtitle">${account.industry || 'Industry not specified'}</div>
                </div>
                <div class="card-actions">
                    <button class="icon-btn" onclick="event.stopPropagation(); editAccount('${account.id}')" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="card-info">
                ${account.phone ? `
                    <div class="info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27