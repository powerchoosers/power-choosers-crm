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
    }
    
    if (backBtn) {
        backBtn.disabled = history.length === 0;
    }

    populateFromGlobalProspect();
}

function handleDialClick() {
    // Show a message about dialing but still proceed with the script
    if (currentProspect.phone) {
        showToast(`Dialing ${currentProspect.phone}...`, 'info');
    } else {
        showToast('Starting call script (no phone number provided)', 'info');
    }
    
    // Move to the "dialing" script step
    selectResponse('dialing'); 
}

function selectResponse(nextStep, action) {
    if (nextStep && scriptData[nextStep]) {
        history.push(currentStep);
        currentStep = nextStep;
        displayCurrentStep();
    }

    // Handle special actions
    if (action === 'saveNotes') {
        saveCallNotesToCRM();
    }
}

function goBack() {
    if (history.length > 0) {
        currentStep = history.pop();
        displayCurrentStep();
    }
}

function restart() {
    currentStep = 'start';
    history = [];
    
    const callNotesElement = gId('call-notes');
    if (callNotesElement) {
        callNotesElement.value = '';
    }

    // Don't clear currentProspect completely - allow manual editing
    if (!currentProspect.contactId && !currentProspect.accountId) {
        currentProspect = {
            name: '',
            title: '',
            company: '',
            industry: '',
            phone: '',
            email: '',
            accountId: '',
            contactId: ''
        };
    }
    
    displayCurrentStep();
}

function copyNotes() {
    const notesTextarea = gId('call-notes');
    const statusDiv = gId('copy-status');
    
    if (!notesTextarea || !statusDiv) return;
    
    notesTextarea.select();
    try {
        document.execCommand('copy');
        statusDiv.textContent = '✅ Notes copied to clipboard!';
        statusDiv.style.opacity = '1';
        setTimeout(() => statusDiv.style.opacity = '0', 3000);
    } catch (err) {
        statusDiv.textContent = '❌ Copy failed';
        statusDiv.style.color = '#ef4444';
        statusDiv.style.opacity = '1';
        setTimeout(() => {
            statusDiv.style.opacity = '0';
            statusDiv.style.color = '#22c55e';
        }, 3000);
    }
}

function clearNotes() {
    const notesTextarea = gId('call-notes');
    const statusDiv = gId('copy-status');
    
    if (!notesTextarea || !statusDiv) return;

    showCustomModal('Are you sure you want to clear all notes?', () => {
        notesTextarea.value = '';
        statusDiv.textContent = '🗑️ Notes cleared';
        statusDiv.style.opacity = '1';
        setTimeout(() => statusDiv.style.opacity = '0', 2000);
    });
}

function showCustomModal(message, onConfirm) {
    if (confirm(message)) {
        onConfirm();
    }
}

// --- Search Functions ---
function setupSearchFunctionality() {
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
            
            // Special handling for the calls hub button
            if (view === 'calls-hub') {
                showView(view);
                updateActiveNavButton(button);
            } else {
                showView(view);
                updateActiveNavButton(button);
            }
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

    // Call hub specific listeners
    const restartBtn = gId('restart-btn');
    if (restartBtn) restartBtn.addEventListener('click', restart);
    const backBtn = gId('back-btn');
    if (backBtn) backBtn.addEventListener('click', goBack);

    // Setup "Go to Calls Hub" button to work internally instead of external link
    setupGoToCallsHubButton();
}

// Setup the "Go to Calls Hub" button to work internally
function setupGoToCallsHubButton() {
    // Find all "Go to Calls Hub" buttons and update them
    const goToCallsHubButtons = document.querySelectorAll('a[href*="callinghub.html"]');
    goToCallsHubButtons.forEach(button => {
        // Remove the href to prevent navigation
        button.removeAttribute('href');
        button.removeAttribute('target');
        
        // Add click event to switch to calls hub view
        button.addEventListener('click', (e) => {
            e.preventDefault();
            showView('calls-hub');
            updateActiveNavButton(document.getElementById('calls-hub-btn'));
        });
        
        // Update styling to look like a button
        button.style.cursor = 'pointer';
        button.style.textDecoration = 'none';
    });
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
            // Initialize calls hub with current prospect data or empty data
            initializeCallsHub();
            displayCurrentStep();
            break;
    }
}

// Initialize calls hub
function initializeCallsHub() {
    // If we don't have current prospect data, allow manual entry
    if (!currentProspect.name && !currentProspect.company) {
        currentProspect = {
            name: '',
            title: '',
            company: '',
            industry: '',
            phone: '',
            email: '',
            accountId: '',
            contactId: ''
        };
    }
    
    // Populate the input fields
    populateFromGlobalProspect();
    
    // Enable all input fields for editing
    enableProspectInputs();
}

// Enable prospect input fields for editing
function enableProspectInputs() {
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
                    ${account.phone ? `
                    <button class="icon-btn" onclick="event.stopPropagation(); openCallsHubWithAccountData('${account.id}')" title="Call Account">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                    </button>
                    ` : ''}
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
                        <span onclick="event.stopPropagation(); openCallsHubWithAccountData('${account.id}')" style="cursor: pointer; color: #1A438D;" title="Click to call">${account.phone}</span>
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
                        <span onclick="event.stopPropagation(); openCallsHubWithData('${contact.id}')" style="cursor: pointer; color: #1A438D;" title="Click to call">${contact.phone}</span>
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
                <div class="info-field-value">
                    ${account.phone ? 
                        `<span onclick="openCallsHubWithAccountData('${account.id}')" style="cursor: pointer; color: #1A438D;" title="Click to call">${account.phone}</span>` 
                        : 'Not specified'
                    }
                </div>
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
                ${contact.phone ? `<div style="font-size: .8rem; color: #6b7280;"><span onclick="openCallsHubWithData('${contact.id}')" style="cursor: pointer; color: #1A438D;" title="Click to call">${contact.phone}</span></div>` : ''}
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
        accountName: account ? account.name : '',
        contactName: contact.firstName + ' ' + contact.lastName
    };
    
    // Now switch to the calls hub view on the same page
    showView('calls-hub');
    updateActiveNavButton(document.getElementById('calls-hub-btn'));

    // Manually trigger the initial display for the calls hub view
    displayCurrentStep();
}

// Function to open the Calls Hub with data from a specific account
function openCallsHubWithAccountData(accountId) {
    const account = CRMApp.accounts.find(a => a.id === accountId);
    if (!account) {
        showToast('Account not found.', 'error');
        return;
    }

    // Update the global currentProspect object with the account data
    currentProspect = {
        name: '', // No specific contact name from account
        title: '',
        company: account.name || '',
        industry: account.industry || '',
        phone: account.phone || '',
        email: '',
        accountId: account.id || '',
        contactId: '',
        accountName: account.name || '',
        contactName: ''
    };
    
    // Now switch to the calls hub view on the same page
    showView('calls-hub');
    updateActiveNavButton(document.getElementById('calls-hub-btn'));

    // Manually trigger the initial display for the calls hub view
    displayCurrentStep();
}

// Save prospect info updates from calls hub back to CRM
async function saveProspectUpdates() {
    try {
        // Get current values from input fields
        const name = gId('input-name')?.value || '';
        const title = gId('input-title')?.value || '';
        const company = gId('input-company-name')?.value || '';
        const industry = gId('input-company-industry')?.value || '';
        const benefit = gId('input-benefit')?.value || '';
        const pain = gId('input-pain')?.value || '';

        // If we have a contact ID, update the contact
        if (currentProspect.contactId && name && title) {
            const contactRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'contacts', currentProspect.contactId);
            const [firstName, ...lastNameParts] = name.split(' ');
            const lastName = lastNameParts.join(' ');
            
            await window.FirebaseDB.updateDoc(contactRef, {
                firstName: firstName,
                lastName: lastName,
                title: title,
                updatedAt: window.FirebaseDB.serverTimestamp()
            });
        }

        // If we have an account ID, update the account
        if (currentProspect.accountId && company && industry) {
            const accountRef = window.FirebaseDB.doc(window.FirebaseDB.db, 'accounts', currentProspect.accountId);
            
            await window.FirebaseDB.updateDoc(accountRef, {
                name: company,
                industry: industry,
                updatedAt: window.FirebaseDB.serverTimestamp()
            });
        }

        // Update currentProspect object
        currentProspect.name = name;
        currentProspect.title = title;
        currentProspect.company = company;
        currentProspect.industry = industry;

        showToast('Prospect information updated successfully!');
        
        // Reload data to reflect changes
        await loadAccounts();
        await loadContacts();
        
    } catch (error) {
        console.error('Error saving prospect updates:', error);
        showToast('Error saving prospect updates', 'error');
    }
}

// --- Calls Hub Logic (moved here for single page app) ---
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
    resStruggle: {
        you: "Yeah, I'm hearing that from a lot of <strong>[CT]</strong>. The thing is, most companies are approaching renewals the same way they did pre-2021, but the rules have completely changed. Do you currently have a strategy in place to help mitigate these increases?",
        mood: "challenging",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resNotRenewed: {
        you: "Actually, that timing works in your favor. Most businesses wait until 60-90 days before expiration to start looking, but with the market set to increase in 2026, people are reserving their rates in advance to avoid paying more in the future. Do you currently have a plan in place to <span class='pause'>--</span> mitigate these increases?",
        mood: "positive",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resLockedIn: {
        you: "Smart move getting locked in during this volatility. How long did you guys end up going with the term? Because here's what I'm seeing <span class='pause'>--</span> even with companies who just renewed, there are often optimization opportunities within existing contracts that most people don't know about. Plus, it gives us time to develop a strategic approach for your next cycle rather than scrambling when rates spike again.",
        mood: "neutral",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resShopping: {
        you: "Perfect timing then. Here's what I'm seeing though <span class='pause'>--</span> typically people just shop for rates but the rate is only about <span class='metric'>60%</span> of your bill if you're lucky. How are you guys evaluating the options <span class='pause'>--</span> just on rate, or are you looking at other ways to lower your final dollar amount?",
        mood: "positive",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resBroker: {
        you: "That's smart <span class='pause'>--</span> having someone who understands the Texas market is crucial right now. Have they let you know about ERCOT's supply concerns for 2026? Because there's some huge changes happening right now that could impact <strong>[CN]</strong>'s costs significantly. Would it be worth understanding what that looks like, even if you're happy with your current relationship?",
        mood: "neutral",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    resNoThought: {
        you: "I get it <span class='pause'>--</span> energy's not the first thing you think about when you wake up. How much are you typically spending on energy? And if your bills were to increase by <span class='emphasis'>[XX]</span>, would that impact your budget at all? If I could show you what other companies are doing to reduce their spending, would you be open to discussing this further?",
        mood: "challenging",
        responses: [
            { text: "🎯 Continue to Discovery", next: "discovery" }
        ]
    },
    discovery: {
        you: "Gotcha! So <strong>[N]</strong>, Just so I understand your situation a little better. <span class='pause'>--</span> What's your current approach to renewing your electricity agreements <span class='pause'>--</span> do you handle it internally or work with a consultant?<br><br><strong><span class='emphasis'>And how that been?</span></strong><br><br><strong><span class='emphasis'>What is most concerning/important to you when it comes to energy?</span></strong><br><br><strong><span class='emphasis'>And how has that impacted you and [CN]?</span></strong><br><br>I watch the markets daily and here's what I'm seeing. Rates have gone up <span class='metric'>60%</span> since 2021 <span class='pause'>--</span> Most businesses <span class='pause'>--</span> <strong>they've taken an incredible hit</strong>, but many others have been able to find <strong>other ways</strong> to pay way less than other companies in their <strong>same area</strong>. If I could show you what they're doing, would you be open to talking about this further?",
        mood: "neutral",
        responses: [
            { text: "💚 Prospect is engaged / ready for appointment", next: "closeForAppointment" },
            { text: "🟡 Prospect is hesitant / needs more info", next: "handleHesitation" },
            { text: "❌ Objection: Happy with current provider", next: "objHappy" },
            { text: "❌ Objection: No time", next: "objNoTime" }
        ]
    },
    objHappy: {
        you: "That's actually great to hear, and I'm not suggesting you should be unhappy or you need to switch your supplier today. Is it the customer service that you're happy with or are you just getting a rate that you can't find anywhere else?",
        mood: "positive",
        responses: [
            { text: "💰 It's the rate / Great pricing", next: "objHappyRate" },
            { text: "🤝 Customer service / Overall experience", next: "objHappyService" },
            { text: "🔄 Both rate and service", next: "objHappyBoth" }
        ]
    },
    objHappyRate: {
        you: "That's awesome you locked in a great price, however, the rules of Texas Energy have completely changed over the past few years. Even satisfied clients I work with are <span class='pause'>--</span>shocked to find out they that their supplier's new rate is about <span class='metric'>15-25%</span> more than what they were paying before. Would it be worth re-evaluating where you're at now, just to make sure <strong>[CN]</strong> isn't left paying more than they should?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, worth understanding", next: "closeForAppointment" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    objHappyService: {
        you: "That's great - good service is hard to find. What I'm seeing though is that satisfaction with service and getting the best price are two separate conversations. The Texas energy market rules have changed significantly over the past few years. Even satisfied clients I work with discover they can can save <span class='metric'>15-25%</span> without sacrificing great customer service. Would it be worth looking into some options just to see if there is something more affordable for <strong>[CN]</strong>?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, worth understanding", next: "closeForAppointment" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    objHappyBoth: {
        you: "Perfect - that's exactly what you want. I have exclusive partnerships with the suppliers, so I can make them work 10 times harder for your business. If i can show you how to get better pricing and support for your energy, would that be helpful for you and <strong>[CN]</strong>?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, worth understanding", next: "closeForAppointment" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    objNoTime: {
        you: "I completely get it <span class='pause'>--</span> that's exactly why most businesses end up overpaying. Energy is a complicated market that requires ongoing attention that most internal teams <span class='pause'>--</span> simply don't have time for. Here's what I'd suggest <span class='pause'>--</span> give me <span class='emphasis'>10 minutes</span> to review your current setup <span class='pause'>--</span> against where we are today. And that should be able tell you exactly where you stand and what you should be expecting for the future. Would that be helpful for you?",
        mood: "challenging",
        responses: [
            { text: "✅ Yes, schedule 10-minute assessment", next: "scheduleAppointment" },
            { text: "❌ Still no time", next: "softClose" }
        ]
    },
    handleHesitation: {
        you: "I get it <span class='pause'>--</span> And called you out the blue so now is probably not the best time. How about this <span class='pause'>--</span> let me put together a quick case study specific to <span class='emphasis'>[TIA]</span>s in your area. Takes me about 10 minutes to prepare, it'll give you a snapshot into the market and it'll show you what other companies are doing to stay afloat in today's market.<br><br><strong><span class='emphasis'>Would that be useful for your future planning?</span></strong>",
        mood: "unsure",
        responses: [
            { text: "✅ Yes, send analysis", next: "getEmail" },
            { text: "❌ No, not interested", next: "softClose" }
        ]
    },
    closeForAppointment: {
        you: "Awesome! So, <strong>[N]</strong><span class='pause'>--</span> I really believe you'll be able to benefit from <span class='emphasis'>[SB]</span> that way you won't have to <span class='emphasis'>[PP]</span>. Our process is super simple! We start with an <span class='emphasis'>energy health check</span> where I look at your usage, contract terms, and then we can talk about what options might look like for <strong>[CN]</strong> moving forward. It should take <span class='emphasis'>10-15 minutes</span> of your time. Would you prefer to connect this <span class='emphasis'>Friday morning around 11 AM</span>, or would <span class='emphasis'>Monday afternoon around 2 PM</span> work better for your schedule?",
        mood: "positive",
        responses: [
            { text: "📅 Schedule Friday 11 AM", next: "appointmentConfirmed" },
            { text: "📅 Schedule Monday 2 PM", next: "appointmentConfirmed" },
            { text: "🤔 Still hesitant", next: "getEmail" }
        ]
    },
    scheduleAppointment: {
        you: "Perfect! Let's get that <span class='emphasis'>10-minute market assessment</span> scheduled. I'll walk through your current situation, show you common supplier traps, and outline 2-3 strategic options based on your specific situation. Would <span class='emphasis'>Friday morning</span> or <span class='emphasis'>Monday afternoon</span> work better?",
        mood: "positive",
        responses: [
            { text: "📅 Friday morning works", next: "appointmentConfirmed" },
            { text: "📅 Monday afternoon works", next: "appointmentConfirmed" }
        ]
    },
    appointmentConfirmed: {
        you: "Perfect! I'll send you a calendar invite for <span class='emphasis'>[DT]</span>, and I'll put together some information specific to <span class='emphasis'>[TIA]</span> to give you better context for our meeting. Do you have a copy of your bill?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, I have a copy", next: "billYes" },
            { text: "❌ No, I don't have one readily available", next: "billNo" }
        ]
    },
    billYes: {
        you: "Perfect! I'm going to also send you a standard invoice request. Could you reply back with a recent copy?",
        mood: "positive",
        responses: [
            { text: "✅ Yes, I can send that", next: "confirmEmail" },
            { text: "❌ I'd prefer not to share that", next: "billOptional" }
        ]
    },
    billNo: {
        you: "No problem. How do you typically receive your bills <span class='pause'>--</span> physical copy or through email?",
        mood: "positive",
        responses: [
            { text: "📧 Through email", next: "billEmailAdvice" },
            { text: "📄 Physical copy", next: "billPhysicalAdvice" }
        ]
    },
    billEmailAdvice: {
        you: "Perfect! Be sure to have a copy ready for us to go over at <span class='emphasis'>[DT]</span>. You should be able to find it in your email from your provider. Looking forward to our conversation!",
        mood: "positive",
        responses: [
            { text: "✅ Sounds great - end call", next: "callSuccess" }
        ]
    },
    billPhysicalAdvice: {
        you: "Perfect! Be sure to have a copy ready for us to go over at <span class='emphasis'>[DT]</span>. If you can find your most recent physical bill, that would be ideal for our review. Looking forward to our conversation!",
        mood: "positive",
        responses: [
            { text: "✅ Sounds great - end call", next: "callSuccess" }
        ]
    },
    confirmEmail: {
        you: "Excellent! So I have your email as <span class='emphasis'>[TE]</span> <span class='pause'>--</span> is that correct? I'll send both the calendar invite and the invoice request to that address. You should receive them within the next few minutes. Looking forward to our conversation at <span class='emphasis'>[DT]</span>!",
        mood: "positive",
        responses: [
            { text: "✅ Email confirmed - end call", next: "callSuccess" },
            { text: "❌ Different email address", next: "getCorrectEmail" }
        ]
    },
    getCorrectEmail: {
        you: "No problem! What's the best email address for you?",
        mood: "positive",
        responses: [
            { text: "📧 Provide correct email", next: "emailConfirmed" }
        ]
    },
    emailConfirmed: {
        you: "Perfect! I'll send the calendar invite and invoice request to <span class='emphasis'>[EAC]</span>. You should receive them within the next few minutes. Looking forward to our conversation at <span class='emphasis'>[DT]</span>!",
        mood: "positive",
        responses: [
            { text: "✅ All set - end call", next: "callSuccess" }
        ]
    },
    billOptional: {
        you: "No worries at all! Having a bill helps with the analysis, but we can still have a productive conversation without it. I'll send you the calendar invite for <span class='emphasis'>[DT]</span> and some industry-specific information. Looking forward to our conversation!",
        mood: "positive",
        responses: [
            { text: "✅ Sounds good - end call", next: "callSuccess" }
        ]
    },
    getEmail: {
        you: "Great! I'll put together a case study specific to <span class='emphasis'>[TIA]</span>. It takes me about 10 minutes to put together, and it'll give you a baseline understanding of where your company stands competitively. I can email that over by tomorrow, and if you see value in diving deeper, we can schedule a brief follow-up. What's a good email for you?",
        mood: "unsure",
        responses: [
            { text: "📧 Provide email address", next: "emailFollowUp" },
            { text: "❌ Don't want to provide email", next: "softClose" }
        ]
    },
    emailFollowUp: {
        you: "Perfect! I've got <span class='emphasis'>[EAC]</span>. I'll get that market analysis over to you by <span class='emphasis'>[TF]</span>, and it'll give you a good baseline for understanding your competitive position. If you have any immediate questions before then, feel free to reach out. Otherwise, I'll follow up once you've had a chance to review the information. Sound good?",
        mood: "positive",
        responses: [
            { text: "✅ Sounds good - end call", next: "callSuccess" }
        ]
    },
    softClose: {
        you: "No problem at all <span class='pause'>--</span> I know energy strategy isn't urgent until it becomes critical. Here's what I'll do: I'm going to add you to my <span class='emphasis'>quarterly market intelligence updates</span>. These go out to CFOs and facilities managers across Texas and include trend analysis, regulatory updates, and strategic insights. <span class='emphasis'>No sales content, just market intelligence</span> that helps you stay informed. If market conditions create opportunities that make sense for <span class='emphasis'>[CN]</span>, I'll reach out. Sound reasonable?",
        mood: "neutral",
        responses: [
            { text: "✅ That sounds reasonable", next: "callSuccess" },
            { text: "❌ No thanks", next: "callEnd" }
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
    },
    transfer_dialing: {
        you: "Being transferred... Ringing...",
        mood: "neutral",
        responses: [
            { text: "📞 Decision Maker Answers", next: "main_script_start" },
            { text: "🚫 No Answer", next: "voicemail_or_hangup" }
        ]
    }
};

let currentStep = 'start';
let history = [];
let scriptDisplay, responsesContainer, backBtn;

function populateFromGlobalProspect() {
    // This function is now used to populate the input fields from the global currentProspect object
    const inputName = gId('input-name');
    if (inputName) {
        inputName.value = currentProspect.name || '';
        placeholders['N'] = currentProspect.name || '';
    }
    const inputTitle = gId('input-title');
    if (inputTitle) {
        inputTitle.value = currentProspect.title || '';
        placeholders['CT'] = currentProspect.title || '';
    }
    const inputCompanyName = gId('input-company-name');
    if (inputCompanyName) {
        inputCompanyName.value = currentProspect.company || '';
        placeholders['CN'] = currentProspect.company || '';
    }
    const inputCompanyIndustry = gId('input-company-industry');
    if (inputCompanyIndustry) {
        inputCompanyIndustry.value = currentProspect.industry || '';
        placeholders['CI'] = currentProspect.industry || '';
        placeholders['TIA'] = currentProspect.industry || '';
    }
}

async function saveCallNotesToCRM() {
    // This is the save notes function from script.js
    if (!currentProspect.accountId && !currentProspect.contactId) {
        console.warn("Cannot save notes: Missing accountId or contactId.");
        
        // Save prospect updates if any changes were made
        await saveProspectUpdates();
        
        // Still save the notes as a general activity
        const notesElement = gId('call-notes');
        if (notesElement && notesElement.value.trim()) {
            try {
                await logActivity({
                    type: 'call_note',
                    description: `Call note: ${notesElement.value.substring(0, 50)}${notesElement.value.length > 50 ? '...' : ''}`,
                    noteContent: notesElement.value.trim(),
                    accountName: currentProspect.company || 'Unknown Company',
                    contactName: currentProspect.name || 'Unknown Contact'
                });
                showToast('Call notes saved successfully!');
            } catch (error) {
                console.error('Error saving call notes:', error);
                showToast('Error saving notes.', 'error');
            }
        }
        return;
    }

    const notesElement = gId('call-notes');
    if (!notesElement) {
        console.warn("Call notes element not found");
        return;
    }

    const notesContent = notesElement.value.trim();
    if (notesContent.length === 0) {
        console.log("No notes to save.");
        await saveProspectUpdates(); // Still save prospect updates
        return;
    }

    try {
        const { db, collection, addDoc, serverTimestamp } = window.FirebaseDB;
        
        const activityData = {
            type: 'call_note',
            description: `Call note for ${currentProspect.contactName || currentProspect.name} at ${currentProspect.accountName || currentProspect.company}`,
            noteContent: notesContent,
            accountId: currentProspect.accountId,
            accountName: currentProspect.accountName || currentProspect.company,
            contactId: currentProspect.contactId,
            contactName: currentProspect.contactName || currentProspect.name,
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'activities'), activityData);
        console.log('Call notes saved to CRM with ID:', docRef.id);
        showToast('Call notes saved successfully!');
        
        // Save prospect updates as well
        await saveProspectUpdates();
        
        // Reload activities to show the new note
        await loadActivities();
        
    } catch (error) {
        console.error('Error saving call notes to Firebase:', error);
        showToast('Error saving notes.', 'error');
    }
}

function applyPlaceholders(text) {
    let newText = text;
    for (const key in placeholders) {
        const regex = new RegExp('\\[' + key + '\\]', 'g');
        newText = newText.replace(regex, placeholders[key]);
    }
    return newText;
}

function updateScript() {
    for (const inputId in inputMap) {
        const placeholderKey = inputMap[inputId];
        const inputElement = gId(inputId);
        if (inputElement) {
            const inputValue = inputElement.value || inputElement.placeholder;
            placeholders[placeholderKey] = inputValue;
        }
    }
    placeholders['TIA'] = placeholders['CI'];
    displayCurrentStep();
}

function displayCurrentStep() {
    const step = scriptData[currentStep];
    if (!step) return;
    
    scriptDisplay = gId('script-display');
    responsesContainer = gId('responses-container');
    backBtn = gId('back-btn');
    
    const processedText = applyPlaceholders(step.you);
    
    if (scriptDisplay) {
        scriptDisplay.innerHTML = processedText;
        scriptDisplay.className = `script-display mood-${step.mood}`;
    }
    
    if (responsesContainer) {
        responsesContainer.innerHTML = '';
        if (currentStep === 'start') {
            // Always show dial button on start, regardless of phone number
            const dialButtonHtml = `
                <button class="dial-button" onclick="handleDialClick()">
                    <svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    Dial
                </button>
            `;
            responsesContainer.innerHTML = dialButtonHtml;
        } else if (step.responses && step.responses.length > 0) {
            step.responses.forEach(response => {
                const button = document.createElement('button');
                button.className = 'response-btn';
                button.innerHTML = applyPlaceholders(response.text);
                button.onclick = () => selectResponse(response.next, response.action);
                responsesContainer.appendChild(button);
            });
        }
    }
    'accounts', accountId);
        
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

        const accountRef = window.FirebaseDB.doc(window.FirebaseDB.db,