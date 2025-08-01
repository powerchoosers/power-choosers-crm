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
let currentSearchType = '';
let activeButton = null;
let currentProspect = {}; // This needs to be a global variable to be used by both CRM and Calls Hub logic

// Helper to get element by ID (saves characters and improves readability)
const gId = id => document.getElementById(id);

// Placeholder map for dynamic text in the call script.
const placeholders = {
    'N': '', // Contact Name
    'YN': 'Lewis', // Your Name (static)
    'CN': '', // Company Name
    'CI': '', // Company Industry
    'SB': '', // Specific Benefit
    'PP': '', // Pain Point
    'CT': '', // Contact Title
    'TIA': '', // Their Industry/Area (alias for CI)
    'TE': '', // Their Email (not directly from input)
    'DT': '', // Day/Time (not directly from input)
    'EAC': '', // Email Address Confirmed (not directly from input)
    'TF': '', // Timeframe (not directly from input)
    'OP': 'the responsible party', // Other Person (default)
    'XX': '$XX.00/40%' // Placeholder for dynamic % or amount
};

// Map input field IDs to the placeholder keys for automatic updates.
const inputMap = {
    'input-name': 'N',
    'input-title': 'CT',
    'input-company-name': 'CN',
    'input-company-industry': 'CI',
    'input-benefit': 'SB',
    'input-pain': 'PP'
};

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
    setupSearchFunctionality();
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
        'account-detail': 'Power Choosers CRM Account Details',
        'calls-hub': 'Power Choosers Cold Calling Hub'
    };
    
    const titleElement = document.getElementById('page-title');
    if (titleElement) {
        titleElement.textContent = titles[viewName] || 'Power Choosers CRM';
    }
}

// Setup modal functionality
function setupModals() {
    // Account modal
    const closeAccountModal = document.getElementById('close-account-modal');
    const cancelAccount = document.getElementById('cancel-account');
    
    if (closeAccountModal) closeAccountModal.addEventListener('click', () => hideModal('account-modal'));
    if (cancelAccount) cancelAccount.addEventListener('click', () => hideModal('account-modal'));
    
    // Contact modal
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

    // Call hub specific listeners
    const restartBtn = gId('restart-btn');
    if (restartBtn) restartBtn.addEventListener('click', restart);
    const backBtn = gId('back-btn');
    if (backBtn) backBtn.addEventListener('click', goBack);
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
        case 'calls-hub':
            initializeCallsHub();
            displayCurrentStep();
            break;
    }
}

// Initialize calls hub
function initializeCallsHub() {
    // If we don't have current prospect data, allow manual entry (clean slate)
    if (!currentProspect.name && !currentProspect.company) {
        currentProspect = {
            name: '',
            title: '',
            company: '',
            industry: '',
            phone: '',
            email: '',
            accountId: '',
            contactId: '',
            painPoints: '',
            benefits: ''
        };
        // Enable all fields for clean slate access
        enableAllProspectInputs();
    } else {
        // If we have data from a contact/account, enable only certain fields
        enableSelectiveProspectInputs();
    }
    
    // Populate the input fields
    populateFromGlobalProspect();
}

// Enable all prospect input fields for editing (clean slate)
function enableAllProspectInputs() {
    const inputs = ['input-name', 'input-title', 'input-company-name', 'input-company-industry', 'input-benefit', 'input-pain'];
    inputs.forEach(inputId => {
        const input = gId(inputId);
        if (input) {
            input.disabled = false;
            input.style.backgroundColor = 'white';
            input.style.color = '#1e293b';
        }
    });
}

// Enable selective prospect input fields (when coming from contact/account)
function enableSelectiveProspectInputs() {
    const allInputs = ['input-name', 'input-title', 'input-company-name', 'input-company-industry', 'input-benefit', 'input-pain'];
    const alwaysEditableInputs = ['input-benefit', 'input-pain']; // Pain points and benefits always editable
    
    allInputs.forEach(inputId => {
        const input = gId(inputId);
        if (input) {
            if (alwaysEditableInputs.includes(inputId)) {
                // Always allow editing of pain points and benefits
                input.disabled = false;
                input.style.backgroundColor = 'white';
                input.style.color = '#1e293b';
            } else {
                // Disable known fields when coming from contact/account
                input.disabled = true;
                input.style.backgroundColor = '#f1f5f9';
                input.style.color = '#6b7280';
            }
        }
    });
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
            painPoints: document.getElementById('account-pain-points')?.value || '',
            benefits: document.getElementById('account-benefits')?.value || '',
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

// Create new account from calls hub data
async function createAccountFromCallsHub() {
    try {
        if (!window.FirebaseDB) {
            throw new Error('Firebase not available');
        }

        const accountData = {
            name: currentProspect.company || 'Unknown Company',
            industry: currentProspect.industry || '',
            phone: currentProspect.phone || '',
            website: '',
            address: '',
            painPoints: currentProspect.painPoints || '',
            benefits: currentProspect.benefits || '',
            createdAt: window.FirebaseDB.serverTimestamp(),
            updatedAt: window.FirebaseDB.serverTimestamp()
        };
        
        const accountId = window.generateId();
        const accountRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'accounts', accountId);
        
        await window.FirebaseDB.setDoc(accountRef, accountData);
        
        // Log activity
        await logActivity({
            type: 'account_created',
            description: `Created account from calls hub: ${accountData.name}`,
            accountId: accountId,
            accountName: accountData.name
        });
        
        // Update current prospect with the new account ID
        currentProspect.accountId = accountId;
        
        return accountId;
        
    } catch (error) {
        console.error('Error creating account from calls hub:', error);
        throw error;
    }
}

// Create new contact from calls hub data
async function createContactFromCallsHub(accountId) {
    try {
        if (!window.FirebaseDB) {
            throw new Error('Firebase not available');
        }

        const nameParts = (currentProspect.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const contactData = {
            firstName: firstName,
            lastName: lastName,
            title: currentProspect.title || '',
            accountId: accountId,
            accountName: currentProspect.company || '',
            email: currentProspect.email || '',
            phone: currentProspect.phone || '',
            notes: '',
            createdAt: window.FirebaseDB.serverTimestamp(),
            updatedAt: window.FirebaseDB.serverTimestamp()
        };
        
        const contactId = window.generateId();
        const contactRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'contacts', contactId);
        
        await window.FirebaseDB.setDoc(contactRef, contactData);
        
        // Log activity
        await logActivity({
            type: 'contact_created',
            description: `Created contact from calls hub: ${firstName} ${lastName}`,
            contactId: contactId,
            contactName: `${firstName} ${lastName}`,
            accountId: accountId,
            accountName: currentProspect.company || ''
        });
        
        // Update current prospect with the new contact ID
        currentProspect.contactId = contactId;
        
        return contactId;
        
    } catch (error) {
        console.error('Error creating contact from calls hub:', error);
        throw error;
    }
}

// Save prospect and notes - combined function
async function saveProspectAndNotes() {
    showLoading(true);
    
    try {
        // Get notes content
        const notesElement = gId('call-notes');
        const notesContent = notesElement ? notesElement.value.trim() : '';
        
        // Update current prospect with form data
        const nameInput = gId('input-name');
        const titleInput = gId('input-title');
        const companyInput = gId('input-company-name');
        const industryInput = gId('input-company-industry');
        const benefitInput = gId('input-benefit');
        const painInput = gId('input-pain');
        
        if (nameInput) currentProspect.name = nameInput.value.trim();
        if (titleInput) currentProspect.title = titleInput.value.trim();
        if (companyInput) currentProspect.company = companyInput.value.trim();
        if (industryInput) currentProspect.industry = industryInput.value.trim();
        if (benefitInput) currentProspect.benefits = benefitInput.value.trim();
        if (painInput) currentProspect.painPoints = painInput.value.trim();
        
        let accountId = currentProspect.accountId;
        let contactId = currentProspect.contactId;
        
        // If we have new data and no existing account/contact, create them
        if (currentProspect.company && !accountId) {
            accountId = await createAccountFromCallsHub();
        }
        
        if (currentProspect.name && !contactId && accountId) {
            contactId = await createContactFromCallsHub(accountId);
        }
        
        // Update existing account with pain points and benefits if we have them
        if (accountId && (currentProspect.painPoints || currentProspect.benefits)) {
            const accountRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'accounts', accountId);
            const updateData = {
                updatedAt: window.FirebaseDB.serverTimestamp()
            };
            
            if (currentProspect.painPoints) updateData.painPoints = currentProspect.painPoints;
            if (currentProspect.benefits) updateData.benefits = currentProspect.benefits;
            
            await window.FirebaseDB.updateDoc(accountRef, updateData);
        }
        
        // Save notes as activity if we have notes
        if (notesContent) {
            await logActivity({
                type: 'call_note',
                description: `Call note: ${notesContent.substring(0, 50)}${notesContent.length > 50 ? '...' : ''}`,
                noteContent: notesContent,
                accountId: accountId,
                accountName: currentProspect.company || 'Unknown Company',
                contactId: contactId,
                contactName: currentProspect.name || 'Unknown Contact'
            });
        }
        
        // Reload data
        await Promise.all([
            loadAccounts(),
            loadContacts(),
            loadActivities()
        ]);
        
        showToast('Prospect info and notes saved successfully!');
        
        // Clear notes after saving
        if (notesElement) notesElement.value = '';
        
    } catch (error) {
        console.error('Error saving prospect and notes:', error);
        showToast('Error saving data', 'error');
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
                        <span onclick="event.stopPropagation(); openCallsHubWithPhone('${account.phone}', '${account.name}', '${account.industry || ''}')">${account.phone}</span>
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
                    ${contact.phone ? `
                    <button class="icon-btn" onclick="event.stopPropagation(); openCallsHubWithData('${contact.id}')" title="Call Prospect">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                    </button>
                    ` : ''}
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
                        <span onclick="event.stopPropagation(); openCallsHubWithData('${contact.id}')">${contact.phone}</span>
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
                <div class="info-field-value">${account.phone ? `<span onclick="openCallsHubWithPhone('${account.phone}', '${account.name}', '${account.industry || ''}')" style="cursor: pointer; color: #1A438D;">${account.phone}</span>` : 'Not specified'}</div>
            </div>
            <div class="info-field">
                <div class="info-field-label">Website</div>
                <div class="info-field-value">${account.website ? `<a href="${account.website}" target="_blank" style="color: #1A438D;">${account.website}</a>` : 'Not specified'}</div>
            </div>
            <div class="info-field" style="grid-column: 1 / -1;">
                <div class="info-field-label">Address</div>
                <div class="info-field-value">${account.address || 'Not specified'}</div>
            </div>
            <div class="info-field">
                <div class="info-field-label">Pain Points</div>
                <div class="info-field-value">${account.painPoints || 'Not specified'}</div>
            </div>
            <div class="info-field">
                <div class="info-field-label">Benefits</div>
                <div class="info-field-value">${account.benefits || 'Not specified'}</div>
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
                ${contact.phone ? `<div style="font-size: .8rem; color: #6b7280; cursor: pointer;" onclick="openCallsHubWithData('${contact.id}')">${contact.phone}</div>` : ''}
            </div>
            <div class="contact-actions">
                ${contact.phone ? `
                <button class="icon-btn" onclick="event.stopPropagation(); openCallsHubWithData('${contact.id}')" title="Call Prospect">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                </button>
                ` : ''}
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

// Render activities for current account
function renderAccountActivities() {
    const container = document.getElementById('account-activities-list');
    if (!container || !CRMApp.currentAccount) return;
    
    const accountActivities = CRMApp.activities.filter(activity => 
        activity.accountId === CRMApp.currentAccount.id
    );
    
    if (accountActivities.length === 0) {
        container.innerHTML = '<p class="empty-state">No recent activities</p>';
        return;
    }
    
    container.innerHTML = accountActivities.slice(0, 20).map(activity => `
        <div class="activity-item">
            <div class="activity-title">${activity.description}</div>
            ${activity.contactName ? `<div class="activity-content">Contact: ${activity.contactName}</div>` : ''}
            ${activity.noteContent ? `<div class="activity-content">Note: ${activity.noteContent}</div>` : ''}
            <div class="activity-date">${window.formatDate(activity.createdAt)}</div>
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
    
    // Populate new fields
    const painPointsField = document.getElementById('account-pain-points');
    const benefitsField = document.getElementById('account-benefits');
    if (painPointsField) painPointsField.value = account.painPoints || '';
    if (benefitsField) benefitsField.value = account.benefits || '';
    
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
    
    // Update the global currentProspect object with the contact data
    currentProspect = {
        name: contact.firstName + ' ' + contact.lastName,
        title: contact.title || '',
        company: account ? account.name : '',
        industry: account ? account.industry : '',
        phone: contact.phone || '',
        email: contact.email || '',
        accountId: contact.accountId || '',
        contactId: contact.id || '',
        painPoints: account ? account.painPoints || '' : '',
        benefits: account ? account.benefits || '' : ''
    };
    
    // Now switch to the calls hub view on the same page
    showView('calls-hub');
    updateActiveNavButton(document.getElementById('calls-hub-btn'));

    // Manually trigger the initial display for the calls hub view
    displayCurrentStep();
}

// Function to open calls hub with just phone number
function openCallsHubWithPhone(phone, companyName = '', industry = '') {
    currentProspect = {
        name: '',
        title: '',
        company: companyName,
        industry: industry,
        phone: phone,
        email: '',
        accountId: '',
        contactId: '',
        painPoints: '',
        benefits: ''
    };
    
    showView('calls-hub');
    updateActiveNavButton(document.getElementById('calls-hub-btn'));
    displayCurrentStep();
}

// --- Calls Hub Logic ---
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
            { text: "Leave Voicemail", next: "voicemail" },
            { text: "Hang Up / Start New Call", next: "start" }
        ]
    },
    hook: {
        you: "Hi, is this <strong>[N]</strong>?",
        mood: "neutral",
        responses: [
            { text: "✅ Yes, this is [N]", next: "main_script_start" },
            { text: "🗣️ Speaking", next: "main_script_start" },
            { text: "❓ Who's calling?", next: "main_script_start" },
            { text: "👥 Gatekeeper / Not the right person", next: "gatekeeper_intro" }
        ]
    },
    main_script_start: {
        you: "Good mornin'/afternoon, <strong>[N]</strong>! This is <strong>[YN]</strong> <span class='pause'>--</span> and I'm needin' to speak with someone over electricity agreements and contracts for <strong>[CN]</strong> would that be yourself?",
        mood: "neutral",
        responses: [
            { text: "✅ Yes, that's me / I handle that", next: "pathA" },
            { text: "👥 That would be [OP] / Not the right person", next: "gatekeeper_intro" },
            { text: "🤝 We both handle it / Team decision", next: "pathA" },
            { text: "🤔 Unsure or hesitant", next: "pathD" }
        ]
    },
    gatekeeper_intro: {
        you: "Good afternoon/morning. I'm needin' to speak with someone over electricity agreements and contracts for <strong>[CN]</strong> do you know who would be responsible for that?",
        mood: "neutral",
        responses: [
            { text: "❓ What's this about?", next: "gatekeeper_whats_about" },
            { text: "🔗 I'll connect you", next: "transfer_dialing" },
            { text: "🚫 They're not available / Take a message", next: "voicemail" }
        ]
    },
    gatekeeper_whats_about: {
        you: "My name is Lewis with PowerChoosers.com and I'm needin' to speak with someone about the future electricity agreements for <strong>[CN]</strong>. Do you know who might be the best person for that?",
        mood: "neutral",
        responses: [
            { text: "🔗 I'll connect you", next: "transfer_dialing" },
            { text: "🚫 They're not available / Take a message", next: "voicemail" },
            { text: "✅ I can help you", next: "pathA" }
        ]
    },
    voicemail: {
        you: "Good afternoon/morning <strong>[N]</strong>, this is Lewis and I was told to speak with you. You can give me a call at 817-409-4215. Also, I shot you over a short email kinda explaining why I'm reaching out to you today. The email should be coming from Lewis Patterson that's (L.E.W.I.S) Thank you so much and you have a great day.",
        mood: "neutral",
        responses: [
            { text: "🔄 End Call / Start New Call", next: "start" }
        ]
    },
    pathA: {
        you: "Perfect <span class='pause'>--</span> So <strong>[N]</strong> I've been working closely with <strong>[CI]</strong> across Texas with electricity agreements <span class='pause'>--</span> and we're about to see an unprecedented dip in the market in the next few months <span class='pause'>--</span><br><br><strong><span class='emphasis'>Is getting the best price for your next renewal a priority for you and [CN]?</span></strong><br><br><strong><span class='emphasis'>Do you know when your contract expires?</span></strong><br><br><strong><span class='emphasis'>So since rates have gone up tremendously over the past 5 years, how are you guys handling such a sharp increase on your future renewals?</span></strong>",
        mood: "neutral",
        responses: [
            { text: "😰 Struggling / It's tough", next: "resStruggle" },
            { text: "📅 Haven't renewed / Contract not up yet", next: "resNotRenewed" },
            { text: "🔒 Locked in / Just renewed", next: "resLockedIn" },
            { text: "🛒 Shopping around / Looking at options", next: "resShopping" },
            { text: "🤝 Have someone handling it / Work with broker", next: "resBroker" },
            { text: "🤷 Haven't thought about it / It is what it is", next: "resNoThought" }
        ]
    },
    pathD: {
        you: "No worries if you're not sure. I work with Texas businesses on energy contract optimization <span class='pause'>--</span> basically helping companies navigate rate volatility and strategic positioning in our deregulated market. Does energy procurement fall under your area of responsibility, or would someone else be better positioned for this conversation?",
        mood: "unsure",
        responses: [
            { text: "✅ Yes, that's my responsibility", next: "pathA" },
            { text: "👥 Someone else handles it", next: "gatekeeper_intro" }
        ]
    },
    callSuccess: {
        you: "🎉 <strong>Call Completed Successfully!</strong><br><br>Remember to track:<br>• Decision maker level<br>• Current contract status and timeline<br>• Pain points identified<br>• Interest level (Hot/Warm/Cold/Future)<br>• Next action committed<br>• Best callback timing<br><br><span class='emphasis'>Great job keeping the energy high and positioning as a strategic advisor!</span>",
        mood: "positive",
        responses: [
            { text: "🔄 Start New Call", next: "start", action: "saveNotes" }
        ]
    },
    callEnd: {
        you: "Thanks for your time. Have a great day!",
        mood: "neutral",
        responses: [
            { text: "🔄 Start New Call", next: "start" }
        ]