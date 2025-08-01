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

// Global state for search functionality
// This declaration is now in a single place to avoid conflicts.
let currentSearchType = '';
let activeButton = null;

// Helper to get element by ID (saves characters and improves readability)
const gId = id => document.getElementById(id);

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit for Firebase to load
    setTimeout(() => {
        initializeApp();
    }, 500);
});

// Main initialization function
function initializeApp() {
    setupNavigation();
    setupModals();
    setupEventListeners();
    loadInitialData();
    showView('dashboard');
    setupSearchFunctionality(); // Call search setup here
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
        'dashboard': 'Power Choosers CRM Dashboard',
        'accounts': 'Power Choosers CRM Accounts',
        'contacts': 'Power Choosers CRM Contacts', 
        'account-detail': 'Power Choosers CRM Account Details'
    };
    
    const titleElement = document.getElementById('page-title');
    if (titleElement) {
        titleElement.textContent = titles[viewName] || 'Power Choosers CRM';
    }
}

// Setup modal functionality
function setupModals() {
    // Account modal
    const accountModal = document.getElementById('account-modal');
    const closeAccountModal = document.getElementById('close-account-modal');
    const cancelAccount = document.getElementById('cancel-account');
    
    if (closeAccountModal) closeAccountModal.addEventListener('click', () => hideModal('account-modal'));
    if (cancelAccount) cancelAccount.addEventListener('click', () => hideModal('account-modal'));
    
    // Contact modal
    const contactModal = document.getElementById('contact-modal');
    const closeContactModal = document.getElementById('close-contact-modal');
    const cancelContact = document.getElementById('cancel-contact');
    
    if (closeContactModal) closeContactModal.addEventListener('click', () => hideModal('contact-modal'));
    if (cancelContact) cancelContact.addEventListener('click', () => hideModal('contact-modal'));
    
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
    const addAccountBtn = document.getElementById('add-account-btn');
    const addContactBtn = document.getElementById('add-contact-btn');
    const newAccountBtn = document.getElementById('new-account-btn');
    const newContactBtn = document.getElementById('new-contact-btn');
    
    if (addAccountBtn) addAccountBtn.addEventListener('click', () => showNewAccountModal());
    if (addContactBtn) addContactBtn.addEventListener('click', () => showNewContactModal());
    if (newAccountBtn) newAccountBtn.addEventListener('click', () => showNewAccountModal());
    if (newContactBtn) newContactBtn.addEventListener('click', () => showNewContactModal());
    
    // Form submissions
    const accountForm = document.getElementById('account-form');
    const contactForm = document.getElementById('contact-form');
    const energyContractForm = document.getElementById('energy-contract-form');

    if (accountForm) accountForm.addEventListener('submit', handleAccountSubmit);
    if (contactForm) contactForm.addEventListener('submit', handleContactSubmit);
    if (energyContractForm) energyContractForm.addEventListener('submit', handleEnergyContractSubmit);
    
    // Back to accounts button
    const backToAccountsBtn = document.getElementById('back-to-accounts');
    if (backToAccountsBtn) {
        backToAccountsBtn.addEventListener('click', () => {
            showView('accounts');
            updateActiveNavButton(document.getElementById('accounts-btn'));
        });
    }
    
    // Save account note button
    const saveAccountNoteBtn = document.getElementById('save-account-note');
    if (saveAccountNoteBtn) saveAccountNoteBtn.addEventListener('click', saveAccountNote);

    // Edit account button
    const editAccountBtn = document.getElementById('edit-account-btn');
    if (editAccountBtn) {
        editAccountBtn.addEventListener('click', () => {
            if (CRMApp.currentAccount) {
                editAccount(CRMApp.currentAccount.id);
            }
        });
    }
}

// Load initial data
async function loadInitialData() {
    showLoading(true);
    try {
        // Check if Firebase is available
        if (!window.FirebaseDB) {
            console.warn('Firebase not available yet, retrying...');
            setTimeout(loadInitialData, 1000);
            return;
        }
        
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
        if (!window.FirebaseDB) {
            console.warn('Firebase not available');
            return [];
        }

        const accountsCollection = window.FirebaseDB.collection(window.FirebaseDB.db, 'accounts');
        const snapshot = await window.FirebaseDB.getDocs(accountsCollection);
        
        CRMApp.accounts = [];
        snapshot.forEach(doc => {
            CRMApp.accounts.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Sort by createdAt desc
        CRMApp.accounts.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
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
        if (!window.FirebaseDB) {
            console.warn('Firebase not available');
            return [];
        }

        const contactsCollection = window.FirebaseDB.collection(window.FirebaseDB.db, 'contacts');
        const snapshot = await window.FirebaseDB.getDocs(contactsCollection);
        
        CRMApp.contacts = [];
        snapshot.forEach(doc => {
            CRMApp.contacts.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Sort by createdAt desc
        CRMApp.contacts.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
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
        if (!window.FirebaseDB) {
            console.warn('Firebase not available');
            return [];
        }

        const activitiesCollection = window.FirebaseDB.collection(window.FirebaseDB.db, 'activities');
        const snapshot = await window.FirebaseDB.getDocs(activitiesCollection);
        
        CRMApp.activities = [];
        snapshot.forEach(doc => {
            CRMApp.activities.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Sort by createdAt desc and limit to 50
        CRMApp.activities.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
        });
        CRMApp.activities = CRMApp.activities.slice(0, 50);
        
        return CRMApp.activities;
    } catch (error) {
        console.error('Error loading activities:', error);
        CRMApp.activities = [];
        return [];
    }
}

// Show new account modal
function showNewAccountModal() {
    const modalTitle = document.getElementById('account-modal-title');
    const accountForm = document.getElementById('account-form');
    
    if (modalTitle) modalTitle.textContent = 'Add New Account';
    if (accountForm) accountForm.reset();
    CRMApp.currentAccount = null;
    showModal('account-modal');
}

// Show new contact modal
function showNewContactModal() {
    const modalTitle = document.getElementById('contact-modal-title');
    const contactForm = document.getElementById('contact-form');
    
    if (modalTitle) modalTitle.textContent = 'Add New Contact';
    if (contactForm) contactForm.reset();
    CRMApp.currentContact = null;
    populateAccountDropdown();
    showModal('contact-modal');
}

// Show modal
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

// Hide modal
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Populate account dropdown in contact form
function populateAccountDropdown() {
    const select = document.getElementById('contact-account');
    if (!select) return;
    
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
        if (!window.FirebaseDB) {
            throw new Error('Firebase not available');
        }

        const accountData = {
            name: document.getElementById('account-name').value,
            industry: document.getElementById('account-industry').value,
            phone: document.getElementById('account-phone').value,
            website: document.getElementById('account-website').value,
            address: document.getElementById('account-address').value,
            updatedAt: window.FirebaseDB.serverTimestamp(),
            createdAt: CRMApp.currentAccount ? CRMApp.currentAccount.createdAt : window.FirebaseDB.serverTimestamp()
        };
        
        const accountId = CRMApp.currentAccount ? CRMApp.currentAccount.id : window.generateId();
        const accountRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'accounts', accountId);
        
        await window.FirebaseDB.setDoc(accountRef, accountData);
        
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
        if (!window.FirebaseDB) {
            throw new Error('Firebase not available');
        }

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
        
        const contactId = CRMApp.currentContact ? CRMApp.currentContact.id : window.generateId();
        const contactRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'contacts', contactId);
        
        await window.FirebaseDB.setDoc(contactRef, contactData);
        
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

// Handle energy contract submission
async function handleEnergyContractSubmit(e) {
    e.preventDefault();
    if (!CRMApp.currentAccount) {
        showToast('Please select an account first.', 'warning');
        return;
    }
    showLoading(true);

    try {
        if (!window.FirebaseDB) {
            throw new Error('Firebase not available');
        }

        const contractData = {
            provider: document.getElementById('contract-provider').value,
            rate: document.getElementById('contract-rate').value,
            expiration: document.getElementById('contract-expiration').value,
            type: document.getElementById('contract-type').value
        };

        const accountRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'accounts', CRMApp.currentAccount.id);

        await window.FirebaseDB.updateDoc(accountRef, {
            energyContract: contractData,
            updatedAt: window.FirebaseDB.serverTimestamp()
        });

        // Log activity
        await logActivity({
            type: 'contract_updated',
            description: `Updated energy contract details for ${CRMApp.currentAccount.name}`,
            accountId: CRMApp.currentAccount.id,
            accountName: CRMApp.currentAccount.name
        });

        // Update the local account data
        CRMApp.currentAccount.energyContract = contractData;

        showToast('Energy contract saved successfully!');
        renderAccountDetail();

    } catch (error) {
        console.error('Error saving energy contract:', error);
        showToast('Error saving energy contract', 'error');
    } finally {
        showLoading(false);
    }
}

// Log activity to Firebase
async function logActivity(activityData) {
    try {
        if (!window.FirebaseDB) {
            console.warn('Firebase not available for logging activity');
            return;
        }

        // Use addDoc for logging activities to get an auto-generated ID
        const activityCollection = window.FirebaseDB.collection(window.FirebaseDB.db, 'activities');
        await window.FirebaseDB.addDoc(activityCollection, {
            ...activityData,
            createdAt: window.FirebaseDB.serverTimestamp()
        });
        
        // Add to local activities array for immediate display
        await loadActivities();
        
    } catch (error) {
        console.error('Error logging activity:', error);
    }
}

// Save account note
async function saveAccountNote() {
    if (!CRMApp.currentAccount) return;
    
    const noteInput = document.getElementById('account-note-input');
    if (!noteInput) return;
    
    const noteContent = noteInput.value.trim();
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
        
        noteInput.value = '';
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
    if (!container) return;
    
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
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        <span>${account.phone}</span>
                    </div>
                ` : ''}
                ${account.website ? `
                    <div class="info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="2" y1="12" x2="22" y2="12"/>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                        <span>${account.website}</span>
                    </div>
                ` : ''}
                ${account.address ? `
                    <div class="info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span>${account.address}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Render contacts
function renderContacts() {
    const container = document.getElementById('contacts-grid');
    if (!container) return;
    
    if (CRMApp.contacts.length === 0) {
        container.innerHTML = '<p class="empty-state">No contacts found. Click "New Contact" to get started.</p>';
        return;
    }
    
    container.innerHTML = CRMApp.contacts.map(contact => `
        <div class="contact-card">
            <div class="card-header">
                <div>
                    <div class="card-name">${contact.firstName || ''} ${contact.lastName || ''}</div>
                    <div class="card-subtitle">${contact.title || 'Title not specified'}</div>
                    ${contact.accountName ? `<div class="card-subtitle" style="color: #1A438D;">${contact.accountName}</div>` : ''}
                </div>
                <div class="card-actions">
                    <button class="icon-btn" onclick="event.stopPropagation(); openCallsHubWithData('${contact.id}')" title="Call Prospect">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                    </button>
                    <button class="icon-btn" onclick="event.stopPropagation(); editContact('${contact.id}')" title="Edit Contact">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="card-info" onclick="showContactDetail('${contact.id}')">
                ${contact.email ? `
                    <div class="info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                            <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <span>${contact.email}</span>
                    </div>
                ` : ''}
                ${contact.phone ? `
                    <div class="info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        <span>${contact.phone}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Show account detail
function showAccountDetail(accountId) {
    const account = CRMApp.accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    CRMApp.currentAccount = account;
    showView('account-detail');
    renderAccountDetail();
}

// Render account detail
function renderAccountDetail() {
    if (!CRMApp.currentAccount) return;
    
    const account = CRMApp.currentAccount;
    
    // Update title
    const titleElement = document.getElementById('account-detail-title');
    if (titleElement) {
        titleElement.textContent = account.name || 'Account Details';
    }
    
    // Render account info
    const accountInfoContainer = document.getElementById('account-info-display');
    if (accountInfoContainer) {
        accountInfoContainer.innerHTML = `
            <div class="info-field">
                <div class="info-field-label">Company Name</div>
                <div class="info-field-value">${account.name || 'Not specified'}</div>
            </div>
            <div class="info-field">
                <div class="info-field-label">Industry</div>
                <div class="info-field-value">${account.industry || 'Not specified'}</div>
            </div>
            <div class="info-field">
                <div class="info-field-label">Phone</div>
                <div class="info-field-value">${account.phone || 'Not specified'}</div>
            </div>
            <div class="info-field">
                <div class="info-field-label">Website</div>
                <div class="info-field-value">${account.website ? `<a href="${account.website}" target="_blank" style="color: #1A438D;">${account.website}</a>` : 'Not specified'}</div>
            </div>
            <div class="info-field" style="grid-column: 1 / -1;">
                <div class="info-field-label">Address</div>
                <div class="info-field-value">${account.address || 'Not specified'}</div>
            </div>
        `;
    }
    
    // Render contacts for this account
    renderAccountContacts();
    
    // Render activities for this account
    renderAccountActivities();
    
    // Render energy contract info
    const energyContainer = document.getElementById('energy-contract-display');
    if (energyContainer && account.energyContract) {
        document.getElementById('contract-provider').value = account.energyContract.provider || '';
        document.getElementById('contract-rate').value = account.energyContract.rate || '';
        document.getElementById('contract-expiration').value = account.energyContract.expiration || '';
        document.getElementById('contract-type').value = account.energyContract.type || '';
    }
}

// Render contacts for current account
function renderAccountContacts() {
    const container = document.getElementById('account-contacts-list');
    if (!container || !CRMApp.currentAccount) return;
    
    const accountContacts = CRMApp.contacts.filter(contact => contact.accountId === CRMApp.currentAccount.id);
    
    if (accountContacts.length === 0) {
        container.innerHTML = '<p class="empty-state">No contacts for this account</p>';
        return;
    }
    
    container.innerHTML = accountContacts.map(contact => `
        <div class="contact-list-item">
            <div class="contact-info">
                <div class="contact-name">${contact.firstName} ${contact.lastName}</div>
                <div class="contact-title">${contact.title || 'Title not specified'}</div>
                ${contact.email ? `<div style="font-size: .8rem; color: #6b7280; margin-top: 4px;">${contact.email}</div>` : ''}
                ${contact.phone ? `<div style="font-size: .8rem; color: #6b7280;">${contact.phone}</div>` : ''}
            </div>
            <div class="contact-actions">
                <button class="icon-btn" onclick="event.stopPropagation(); openCallsHubWithData('${contact.id}')" title="Call Prospect">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                </button>
                <button class="icon-btn" onclick="event.stopPropagation(); editContact('${contact.id}')" title="Edit Contact">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

// Edit account
function editAccount(accountId) {
    const account = CRMApp.accounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    CRMApp.currentAccount = account;
    
    // Populate form
    document.getElementById('account-name').value = account.name || '';
    document.getElementById('account-industry').value = account.industry || '';
    document.getElementById('account-phone').value = account.phone || '';
    document.getElementById('account-website').value = account.website || '';
    document.getElementById('account-address').value = account.address || '';
    
    document.getElementById('account-modal-title').textContent = 'Edit Account';
    showModal('account-modal');
}

// Edit contact
function editContact(contactId) {
    const contact = CRMApp.contacts.find(c => c.id === contactId);
    if (!contact) return;
    
    CRMApp.currentContact = contact;
    
    // Populate form
    document.getElementById('contact-first-name').value = contact.firstName || '';
    document.getElementById('contact-last-name').value = contact.lastName || '';
    document.getElementById('contact-title').value = contact.title || '';
    document.getElementById('contact-email').value = contact.email || '';
    document.getElementById('contact-phone').value = contact.phone || '';
    document.getElementById('contact-notes').value = contact.notes || '';
    
    populateAccountDropdown();
    document.getElementById('contact-account').value = contact.accountId || '';
    
    document.getElementById('contact-modal-title').textContent = 'Edit Contact';
    showModal('contact-modal');
}

// Update dashboard stats
function updateDashboardStats() {
    const totalAccountsEl = document.getElementById('total-accounts');
    const totalContactsEl = document.getElementById('total-contacts');
    const recentActivitiesEl = document.getElementById('recent-activities');
    const hotLeadsEl = document.getElementById('hot-leads');
    
    if (totalAccountsEl) totalAccountsEl.textContent = CRMApp.accounts.length;
    if (totalContactsEl) totalContactsEl.textContent = CRMApp.contacts.length;
    if (recentActivitiesEl) recentActivitiesEl.textContent = CRMApp.activities.length;
    
    // Calculate hot leads (contacts created in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const hotLeads = CRMApp.contacts.filter(contact => {
        if (!contact.createdAt) return false;
        const createdDate = contact.createdAt.toDate ? contact.createdAt.toDate() : new Date(contact.createdAt);
        return createdDate > sevenDaysAgo;
    }).length;
    
    if (hotLeadsEl) hotLeadsEl.textContent = hotLeads;
}

// Render recent activities on dashboard
function renderRecentActivities() {
    const container = document.getElementById('recent-activities-list');
    if (!container) return;
    
    if (CRMApp.activities.length === 0) {
        container.innerHTML = '<p class="empty-state">No recent activities</p>';
        return;
    }
    
    container.innerHTML = CRMApp.activities.slice(0, 10).map(activity => `
        <div class="activity-item">
            <div class="activity-title">${activity.description}</div>
            ${activity.accountName ? `<div class="activity-content">Account: ${activity.accountName}</div>` : ''}
            ${activity.contactName ? `<div class="activity-content">Contact: ${activity.contactName}</div>` : ''}
            <div class="activity-date">${window.formatDate(activity.createdAt)}</div>
        </div>
    `).join('');
}

// Show loading overlay
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    toast.innerHTML = `
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // Hide and remove toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Show contact detail (placeholder function)
function showContactDetail(contactId) {
    // For now, just edit the contact
    editContact(contactId);
}

// Function to open the Calls Hub with data from a specific contact
function openCallsHubWithData(contactId) {
    const contact = CRMApp.contacts.find(c => c.id === contactId);
    if (!contact) {
        showToast('Contact not found.', 'error');
        return;
    }

    const account = CRMApp.accounts.find(a => a.id === contact.accountId);
    
    let url = `callinghub.html`;
    url += `?name=${encodeURIComponent(contact.firstName + ' ' + contact.lastName)}`;
    url += `&title=${encodeURIComponent(contact.title || '')}`;
    url += `&company=${encodeURIComponent(account ? account.name : '')}`;
    url += `&industry=${encodeURIComponent(account ? account.industry : '')}`;
    url += `&phone=${encodeURIComponent(contact.phone || '')}`;
    url += `&email=${encodeURIComponent(contact.email || '')}`;
    url += `&accountId=${encodeURIComponent(contact.accountId || '')}`;
    url += `&contactId=${encodeURIComponent(contact.id || '')}`;
    
    window.open(url, '_blank');
}

// --- Search Functions ---
function setupSearchFunctionality() {
    // Add event listeners to search app buttons dynamically
    const googleBtn = gId('google-button');
    if (googleBtn) {
        googleBtn.addEventListener('click', (e) => openSearch('google', e));
    }
    const mapsBtn = gId('maps-button');
    if (mapsBtn) {
        mapsBtn.addEventListener('click', (e) => openSearch('maps', e));
    }
    const apolloBtn = gId('apollo-button');
    if (apolloBtn) {
        apolloBtn.addEventListener('click', (e) => openSearch('apollo', e));
    }
    const beenverifiedBtn = gId('beenverified-button');
    if (beenverifiedBtn) {
        beenverifiedBtn.addEventListener('click', (e) => openSearch('beenverified', e));
    }

    // Add event listeners for Enter key on search inputs
    ['search-input', 'search-city', 'search-state', 'search-location'].forEach(id => {
        const input = gId(id);
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') performSearch();
            });
        }
    });
}

function openSearch(type, event) {
    const button = event.target.closest('.app-button');
    const searchBar = gId('search-bar');
    const mainContainer = gId('main-container');

    if (currentSearchType === type && activeButton === button) {
        closeSearch();
        return;
    }
    
    if (activeButton) activeButton.classList.remove('active');
    currentSearchType = type;
    activeButton = button;
    button.classList.add('active');
    
    const label = gId('search-label');
    const input = gId('search-input');
    const cityInput = gId('search-city');
    const stateInput = gId('search-state');
    const locationInput = gId('search-location');
    
    if (!label || !input) return;
    
    if (cityInput) cityInput.style.display = 'none';
    if (stateInput) stateInput.style.display = 'none';
    if (locationInput) locationInput.style.display = 'none';
    
    if (type === 'google') {
        label.textContent = 'Search Google:';
        input.placeholder = 'Type your search query...';
    } else if (type === 'maps') {
        label.textContent = 'Search Maps:';
        input.placeholder = 'Search places, addresses, businesses...';
    } else if (type === 'beenverified') {
        label.textContent = 'Search BeenVerified:';
        input.placeholder = 'Enter full name (e.g. John Smith)...';
        if (cityInput) cityInput.style.display = 'block';
        if (stateInput) stateInput.style.display = 'block';
    } else if (type === 'apollo') {
        label.textContent = 'Search Apollo:';
        input.placeholder = 'Enter name (e.g. Lewis Patterson)...';
        if (locationInput) locationInput.style.display = 'block';
    }
    
    if (searchBar) searchBar.classList.add('active');
    if (mainContainer) {
        mainContainer.classList.add('search-active');
    }
    setTimeout(() => input.focus(), 300);
    input.value = '';
    if (cityInput) cityInput.value = '';
    if (stateInput) stateInput.value = '';
    if (locationInput) locationInput.value = '';
}

function closeSearch() {
    const searchBar = gId('search-bar');
    const mainContainer = gId('main-container');
    if (searchBar) {
        searchBar.classList.remove('active');
    }
    if (mainContainer) {
        mainContainer.classList.remove('search-active');
    }
    if (activeButton) {
        activeButton.classList.remove('active');
        activeButton = null;
    }
    currentSearchType = '';
}

function performSearch() {
    const query = gId('search-input').value.trim();
    if (!query) return;
    
    let searchUrl = '';
    
    if (currentSearchType === 'google') {
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    } else if (currentSearchType === 'maps') {
        searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    } else if (currentSearchType === 'beenverified') {
        const city = gId('search-city').value.trim();
        const state = gId('search-state').value.trim().toUpperCase();
        const nameParts = query.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        searchUrl = `https://www.beenverified.com/rf/search/v2?age=0&city=${encodeURIComponent(city)}&fullname=${encodeURIComponent(query)}&fname=${encodeURIComponent(firstName)}&ln=${encodeURIComponent(lastName)}&mn=&state=${encodeURIComponent(state)}&title=&company=&industry=&level=&companySizeMin=1&companySizeMax=9&birthMonth=&birthYear=&deathMonth=&deathYear=&address=&isDeceased=false&location=&country=&advancedSearch=true&eventType=none&eventMonth=&eventYear=&source=personSearch,familySearch,obituarySearch,deathIndexSearch,contactSearch`;
    } else if (currentSearchType === 'apollo') {
        const location = gId('search-location').value.trim();
        let apolloUrl = `https://app.apollo.io/#/people?page=1&qKeywords=${encodeURIComponent(query + ' ')}`;
        if (location) apolloUrl += `&personLocations[]=${encodeURIComponent(location)}`;
        searchUrl = apolloUrl;
    }
    
    if (searchUrl) {
        window.open(searchUrl, '_blank');
        closeSearch();
    }
}
