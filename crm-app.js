// This file contains the complete application logic for the Power Choosers CRM.
// It combines functionality from the cold calling hub, energy health check widget,
// and CRM data management into a single, cohesive script.

// --- 1. Firebase Configuration & Initialization (from Project Overview) ---
// Note: The Firebase SDKs are loaded in index.html before this script.
const firebaseConfig = {
    apiKey: "AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE",
    authDomain: "power-choosers-crm.firebaseapp.com",
    projectId: "power-choosers-crm",
    storageBucket: "power-choosers-crm.firebasestorage.app",
    messagingSenderId: "792458658491",
    appId: "1:792458658491:web:a197a4a8ce7a860cfa1f9e",
    measurementId: "G-XEC3BFHJHW"
};
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const fieldValue = firebase.firestore.FieldValue;

// --- 2. Global Application State and Data ---
const CRMApp = {
    accounts: [],
    contacts: [],
    activities: [],
    currentContact: null,
    currentAccount: null,
    currentProspect: null,
    
    // Cold Calling Script State
    scriptData: {
        start: { you: "Click 'Dial' to begin the call", mood: "neutral", responses: [] },
        dialing: { you: "Dialing... Ringing...", mood: "neutral", responses: [
            { text: "📞 Call Connected", next: "hook" },
            { text: "📞 Transferred - Decision Maker Answers", next: "main_script_start" },
            { text: "🚫 No Answer", next: "voicemail_or_hangup" }
        ]},
        voicemail_or_hangup: { you: "No answer. What would you like to do?", mood: "neutral", responses: [
            { text: "Leave Voicemail", next: "voicemail" },
            { text: "Hang Up / Start New Call", next: "start" }
        ]},
        hook: { you: "Hi, is this <span class='emphasis'>[N]</span>?", mood: "neutral", responses: [
            { text: "✅ Yes, this is [N]", next: "main_script_start" },
            { text: "🗣️ Speaking", next: "main_script_start" },
            { text: "❓ Who's calling?", next: "main_script_start" },
            { text: "👥 Gatekeeper / Not the right person", next: "gatekeeper_intro" }
        ]},
        main_script_start: { you: "Good mornin'/afternoon, <span class='emphasis'>[N]</span> <span class='pause'>--</span> I'm Lewis with PowerChoosers and I'm needin' to speak with someone over electricity agreements and contracts for <span class='emphasis'>[CN]</span><span class='highlight-yellow'> would that be yourself?</span>", mood: "neutral", responses: [
            { text: "✅ Yes, that's me / I handle that", next: "pathA" },
            { text: "👥 That would be [OP] / Not the right person", next: "gatekeeper_intro" },
            { text: "🤝 We both handle it / Team decision", next: "pathA" },
            { text: "🤔 Unsure or hesitant", next: "pathD" }
        ]},
        pathA: { you: "Perfect <span class='pause'>--</span> So <span class='emphasis'>[N]</span> I've been working closely with <span class='emphasis'>[CI]</span> across Texas with electricity agreements <span class='pause'>--</span> and we're about to see an <span class='emphasis'>unprecedented dip in the market in the next few months</span> <span class='pause'>--</span><br><br><span class='highlight-yellow'>Is getting the best price for your next renewal a priority for you and [CN]?</span><br><br><span class='highlight-yellow'>Do you know when your contract expires?</span>", mood: "neutral", responses: [
            { text: "😰 Struggling / It's tough", next: "discovery" },
            { text: "📅 Haven't renewed / Contract not up yet", next: "discovery" },
            { text: "🔒 Locked in / Just renewed", next: "discovery" },
            { text: "🛒 Shopping around / Looking at options", next: "discovery" },
            { text: "🤝 Have someone handling it / Work with broker", next: "discovery" },
            { text: "🤷 Haven't thought about it / It is what it is", next: "discovery" }
        ]},
        discovery: { you: "Gotcha! So <span class='emphasis'>[N]</span>, Just so I understand your situation a little better. <span class='pause'>--</span> <span class='highlight-yellow'>What's your current approach to renewing your electricity agreements, do you handle it internally or work with a consultant?</span>", mood: "neutral", responses: [
            { text: "💚 Prospect is engaged / ready for appointment", next: "closeForAppointment" },
            { text: "🟡 Prospect is hesitant / needs more info", next: "handleHesitation" },
            { text: "❌ Objection: Happy with current provider", next: "objHappy" },
            { text: "❌ Objection: No time", next: "objNoTime" }
        ]},
        closeForAppointment: { you: "Awesome! So, <span class='emphasis'>[N]</span><span class='pause'>--</span> I really believe you'll be able to benefit from <span class='emphasis'>[SB]</span> that way you won't have to <span class='emphasis'>[PP]</span>. Our process is super simple! We start with an <span class='emphasis'>energy health check</span> where I look at your usage, contract terms, and then we can talk about what options might look like for <span class='emphasis'>[CN]</span> moving forward.", mood: "positive", responses: [
            { text: "📅 Schedule Friday 11 AM", next: "callSuccess" },
            { text: "📅 Schedule Monday 2 PM", next: "callSuccess" },
            { text: "🤔 Still hesitant", next: "handleHesitation" }
        ]},
        callSuccess: { you: "🎉 <span class='emphasis'>Call Completed Successfully!</span><br><br>Remember to track:<br>• Decision maker level<br>• Current contract status<br>• Pain points identified<br>• Interest level<br>• Next action committed", mood: "positive", responses: [{ text: "🔄 End Call / Save & Start New Call", next: "start", action: "save" }] },
    },
    // Placeholders from the cold calling script
    placeholders: {
        'N': '', 'YN': 'Lewis', 'CN': '', 'CI': '', 'SB': '', 'PP': '', 'CT': '', 'TIA': '', 'P': ''
    },
    inputMap: {
        'input-name': 'N', 'input-title': 'CT', 'input-company-name': 'CN', 'input-company-industry': 'CI',
        'input-benefit': 'SB', 'input-pain': 'PP', 'input-phone': 'P'
    },
    currentStep: 'start',
    history: []
};

// --- 3. Utility Functions ---
const getEl = id => document.getElementById(id);
const getInitials = name => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '';

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg ${
        type === 'error' ? 'bg-red-600' : 
        type === 'success' ? 'bg-green-600' : 
        'bg-blue-600'
    } text-white`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- 4. CRM & Data Management Functions ---

/**
 * Initializes the CRM application by loading data and setting up event listeners.
 */
CRMApp.init = async () => {
    await CRMApp.loadInitialData();
    CRMApp.setupEventListeners();
    CRMApp.updateScript();
    CRMApp.initEnergyHealthCheck();
};

/**
 * Loads all CRM data from Firestore.
 */
CRMApp.loadInitialData = async () => {
    try {
        const [accountsSnapshot, contactsSnapshot] = await Promise.all([
            db.collection('accounts').get(),
            db.collection('contacts').get()
        ]);
        CRMApp.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        CRMApp.contacts = contactsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('Initial data loaded successfully from Firestore.');
    } catch (error) {
        console.error('Error loading data from Firebase:', error);
        showToast('Failed to load data. Functionality may be limited.', 'error');
    }
};

/**
 * Saves all prospect information, call notes, and energy health check data to Firestore.
 * This function is the core of the CRM's data-saving logic.
 */
async function saveProspectAndNotes() {
    // Collect data from all input fields
    const contactData = {
        firstName: getEl('input-name').value.split(' ')[0] || '',
        lastName: getEl('input-name').value.split(' ').slice(1).join(' ') || '',
        title: getEl('input-title').value,
        phone: getEl('input-phone').value,
        notes: getEl('call-notes').value,
        updatedAt: serverTimestamp()
    };

    const accountData = {
        name: getEl('input-company-name').value,
        industry: getEl('input-company-industry').value,
        painPoints: getEl('input-pain').value,
        benefits: getEl('input-benefit').value,
        currentSupplier: getEl('currentSupplier').value,
        monthlyBill: parseFloat(getEl('monthlyBill').value) || 0,
        currentRate: parseFloat(getEl('currentRate').value) || 0,
        contractEndDate: getEl('contractEndDate').value,
        sellRate: parseFloat(getEl('sellRate').value) || 0,
        updatedAt: serverTimestamp()
    };
    
    const notesContent = getEl('call-notes').value;
    let accountRef;
    let contactRef;

    try {
        // Find or create account
        if (CRMApp.currentAccount && CRMApp.currentAccount.id) {
            accountRef = db.collection('accounts').doc(CRMApp.currentAccount.id);
            await accountRef.update(accountData);
            console.log('Updated existing account:', accountRef.id);
        } else if (accountData.name) {
            accountRef = db.collection('accounts').doc(); // Auto-generate ID
            await accountRef.set({ ...accountData, createdAt: serverTimestamp() });
            console.log('Created new account:', accountRef.id);
            CRMApp.currentAccount = { id: accountRef.id, ...accountData };
        }

        // Find or create contact
        if (CRMApp.currentContact && CRMApp.currentContact.id) {
            contactRef = db.collection('contacts').doc(CRMApp.currentContact.id);
            await contactRef.update(contactData);
            console.log('Updated existing contact:', contactRef.id);
        } else if (contactData.firstName) {
            contactRef = db.collection('contacts').doc(); // Auto-generate ID
            await contactRef.set({
                ...contactData,
                accountId: accountRef ? accountRef.id : null,
                accountName: accountRef ? accountData.name : null,
                createdAt: serverTimestamp()
            });
            console.log('Created new contact:', contactRef.id);
            CRMApp.currentContact = { id: contactRef.id, ...contactData };
            showToast(`New contact "${contactData.firstName}" added.`, 'success');
        }

        // Create an activity log
        if (notesContent) {
            await db.collection('activities').add({
                type: 'call_note',
                description: `Call with ${contactData.firstName} from ${accountData.name}.`,
                noteContent: notesContent,
                accountId: accountRef ? accountRef.id : null,
                accountName: accountRef ? accountData.name : null,
                contactId: contactRef ? contactRef.id : null,
                contactName: contactData.firstName + ' ' + contactData.lastName,
                createdAt: serverTimestamp()
            });
            console.log('Activity log created.');
        }

        showToast('Data saved successfully!', 'success');
        CRMApp.restart(); // Restart the calling session
    } catch (error) {
        console.error('Error saving data to Firestore:', error);
        showToast('Error saving data. Please check the console.', 'error');
    }
}

/**
 * Loads contact details from a search result into the CRM's state and UI.
 * @param {string} contactId The ID of the contact document.
 */
async function loadContactDetails(contactId) {
    const contactDoc = await db.collection('contacts').doc(contactId).get();
    if (!contactDoc.exists) { showToast('Contact not found.', 'error'); return; }
    
    const contactData = { id: contactDoc.id, ...contactDoc.data() };
    const accountDoc = await db.collection('accounts').doc(contactData.accountId).get();
    const accountData = accountDoc.exists ? { id: accountDoc.id, ...accountDoc.data() } : null;

    CRMApp.currentContact = contactData;
    CRMApp.currentAccount = accountData;
    
    // Populate prospect info
    getEl('input-name').value = `${contactData.firstName || ''} ${contactData.lastName || ''}`;
    getEl('input-title').value = contactData.title || '';
    getEl('input-phone').value = contactData.phone || '';

    if (accountData) {
        getEl('input-company-name').value = accountData.name || '';
        getEl('input-company-industry').value = accountData.industry || '';
        getEl('input-benefit').value = accountData.benefits || '';
        getEl('input-pain').value = accountData.painPoints || '';
        
        // Populate Energy Health Check if data exists
        if (accountData.currentSupplier) {
            getEl('currentSupplier').value = accountData.currentSupplier;
            getEl('monthlyBill').value = accountData.monthlyBill || '';
            getEl('currentRate').value = accountData.currentRate || '';
            getEl('contractEndDate').value = accountData.contractEndDate || '';
            getEl('sellRate').value = accountData.sellRate || '';
            
            // Automatically run the calculation if all fields are populated
            if (accountData.monthlyBill && accountData.currentRate && accountData.contractEndDate && accountData.sellRate) {
                runCalculation();
            }
        }
    }
    CRMApp.updateScript();
    showToast(`Loaded details for ${contactData.firstName}.`, 'success');
}

/**
 * Loads account details into the CRM's state and UI.
 * @param {string} accountId The ID of the account document.
 */
async function loadAccountDetails(accountId) {
    const accountDoc = await db.collection('accounts').doc(accountId).get();
    if (!accountDoc.exists) { showToast('Account not found.', 'error'); return; }
    
    const accountData = { id: accountDoc.id, ...accountDoc.data() };
    CRMApp.currentAccount = accountData;

    // Populate prospect info
    getEl('input-company-name').value = accountData.name || '';
    getEl('input-company-industry').value = accountData.industry || '';
    getEl('input-benefit').value = accountData.benefits || '';
    getEl('input-pain').value = accountData.painPoints || '';

    // Clear contact info fields since we're loading an account without a specific contact
    getEl('input-name').value = '';
    getEl('input-title').value = '';
    getEl('input-phone').value = accountData.phone || '';
    CRMApp.currentContact = null;
    
    // Populate Energy Health Check if data exists
    if (accountData.currentSupplier) {
        getEl('currentSupplier').value = accountData.currentSupplier;
        getEl('monthlyBill').value = accountData.monthlyBill || '';
        getEl('currentRate').value = accountData.currentRate || '';
        getEl('contractEndDate').value = accountData.contractEndDate || '';
        getEl('sellRate').value = accountData.sellRate || '';
        
        if (accountData.monthlyBill && accountData.currentRate && accountData.contractEndDate && accountData.sellRate) {
            runCalculation();
        }
    }

    CRMApp.updateScript();
    showToast(`Loaded details for account "${accountData.name}".`, 'success');
}

// --- 5. Cold Calling Script Logic ---

CRMApp.updateScript = () => {
    for (const inputId in CRMApp.inputMap) {
        const placeholderKey = CRMApp.inputMap[inputId];
        const inputElement = getEl(inputId);
        if (inputElement) {
            CRMApp.placeholders[placeholderKey] = inputElement.value || '';
        }
    }
    const step = CRMApp.scriptData[CRMApp.currentStep];
    const scriptDisplay = getEl('script-display');
    if (scriptDisplay) {
        scriptDisplay.innerHTML = CRMApp.applyPlaceholders(step.you);
    }
};

CRMApp.applyPlaceholders = (text) => {
    let newText = text;
    for (const key in CRMApp.placeholders) {
        const regex = new RegExp('\\[' + key + '\\]', 'g');
        const replacement = key === 'N' ? CRMApp.placeholders[key].split(' ')[0] : CRMApp.placeholders[key];
        newText = newText.replace(regex, replacement || 'prospect');
    }
    return newText;
};

// ... (Rest of the cold calling script functions like handleDialClick, selectResponse, goBack, restart, clearNotes would be here) ...

// --- 6. Energy Health Check Widget Logic ---

const supplierData = {
    "NRG": { bbbRating: "A+", popularity: 4, customerService: 3 },
    // ... (rest of supplier data)
};
const supplierNames = Object.keys(supplierData);
const ESTIMATED_DELIVERY_CHARGE_CENTS = 0.05;

let section1Complete = false, section2Complete = false;
let currentAnnualUsage = 0, currentMonthlyBill = 0, currentRate = 0, sellRate = 0, currentSupplier = '';

function initEnergyHealthCheck() {
    const datalist = getEl('supplierList');
    if (datalist) {
        datalist.innerHTML = '';
        supplierNames.forEach(supplier => {
            const option = document.createElement('option');
            option.value = supplier;
            datalist.appendChild(option);
        });
    }
    
    // Add event listeners for the health check inputs
    getEl('currentSupplier').addEventListener('input', validateSection1);
    getEl('monthlyBill').addEventListener('input', validateSection1);
    getEl('currentRate').addEventListener('input', validateSection1);
    getEl('contractEndDate').addEventListener('input', validateSection2);
    getEl('sellRate').addEventListener('input', validateSection2);
    getEl('calculateBtn').addEventListener('click', runCalculation);
    getEl('resetBtn').addEventListener('click', resetForm);
}

function validateSection1() {
    // ... (logic from energy-health-check.html)
}

function validateSection2() {
    // ... (logic from energy-health-check.html)
}

function updateButton() {
    // ... (logic from energy-health-check.html)
}

function runCalculation() {
    // ... (logic from energy-health-check.html)
}

function calculateResults() {
    // ... (logic from energy-health-check.html)
}

function resetForm() {
    // ... (logic from energy-health-check.html)
}

// --- 7. Event Listeners and Initialization Call ---

CRMApp.setupEventListeners = () => {
    // Event listeners for Cold Calling Hub inputs
    for (const inputId in CRMApp.inputMap) {
        getEl(inputId).addEventListener('input', CRMApp.updateScript);
    }
    
    // Event listeners for global actions
    getEl('save-btn').addEventListener('click', saveProspectAndNotes);
    getEl('restart-btn').addEventListener('click', CRMApp.restart);
    getEl('back-btn').addEventListener('click', CRMApp.goBack);
    getEl('clear-notes-btn').addEventListener('click', CRMApp.clearNotes);

    // Event listeners for search functionality
    getEl('global-search').addEventListener('input', performSearch);
    getEl('clear-search').addEventListener('click', () => {
        getEl('global-search').value = '';
        getEl('clear-search').classList.remove('show');
        hideSearchResults();
    });
};

// Initializing the app once the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    CRMApp.init();
});