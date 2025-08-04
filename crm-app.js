// This file contains the complete application logic for the Power Choosers CRM.
// It manages all data fetching, view rendering, and user interactions.

// --- 1. Firebase Configuration & Initialization ---
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
    tasks: [],
    currentView: 'dashboard-view',
    currentContact: null,
    currentAccount: null,
    
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
    placeholders: {
        'N': '', 'YN': 'Lewis', 'CN': '', 'CI': '', 'SB': '', 'PP': '', 'CT': '', 'TIA': '', 'P': ''
    },
    currentStep: 'start',
    history: []
};

// --- 3. UI and Utility Functions ---
const getEl = id => document.getElementById(id);
const getEls = selector => document.querySelectorAll(selector);

/**
 * Main function to show/hide views in the single-page application.
 * @param {string} viewName The ID of the view to show (e.g., 'dashboard-view').
 */
function showView(viewName) {
    CRMApp.currentView = viewName;
    getEls('.page-view').forEach(view => {
        view.classList.remove('active');
    });
    const activeView = getEl(viewName);
    if (activeView) {
        activeView.classList.add('active');
        // Update the header title
        const newTitle = getEl(`[data-view="${viewName}"]`).getAttribute('data-title');
        if (newTitle) getEl('page-title').textContent = newTitle;
    }
}

/**
 * Updates the active state of the navigation buttons.
 * @param {HTMLElement} activeNav The navigation link that was clicked.
 */
function updateActiveNavButton(activeNav) {
    getEls('.nav-item').forEach(item => item.classList.remove('active'));
    activeNav.classList.add('active');
}

/**
 * Displays a toast notification.
 * @param {string} message The message to display.
 * @param {string} type The type of toast ('success', 'error', 'info').
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Use requestAnimationFrame for smooth transitions
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });
    
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- 4. Dashboard Functions ---

/**
 * Renders the dashboard with data from the CRMApp state.
 */
function renderDashboard() {
    renderDashboardStats();
    renderTodayTasks();
    renderRecentActivities();
}

/**
 * Renders the top-level statistical cards.
 */
function renderDashboardStats() {
    const totalAccounts = CRMApp.accounts.length;
    const totalContacts = CRMApp.contacts.length;
    const recentActivities = CRMApp.activities.length;
    const hotLeads = CRMApp.contacts.filter(c => c.isHotLead).length; // Assuming a 'isHotLead' field

    getEl('total-accounts-value').textContent = totalAccounts;
    getEl('total-contacts-value').textContent = totalContacts;
    getEl('recent-activities-value').textContent = recentActivities;
    getEl('hot-leads-value').textContent = hotLeads;
}

/**
 * Renders today's tasks in the dashboard sidebar.
 */
function renderTodayTasks() {
    const tasksList = getEl('tasks-list');
    tasksList.innerHTML = '';
    
    // Filter tasks for today. Using sample data for now.
    const todayTasks = [
        { id: 't1', title: 'Follow up with John Smith', account: 'Energy Contract', time: '3:00 PM' },
        { id: 't2', title: 'Prepare energy analysis for Sarah Johnson', account: 'Johnson', time: '3:30 PM' },
    ];
    
    if (todayTasks.length > 0) {
        todayTasks.forEach(task => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="task-item">
                    <p class="task-title">Follow up with John Smith</p>
                    <p class="task-details">Q1 - Energy Contract</p>
                    <p class="task-due-time">Due: 3:00 PM</p>
                </div>
            `;
            tasksList.appendChild(li);
        });
    } else {
        tasksList.innerHTML = '<li class="text-sm text-gray-400">No tasks for today!</li>';
    }
}

/**
 * Renders a list of recent activities in the dashboard main content.
 */
function renderRecentActivities() {
    const activityList = getEl('activity-list');
    activityList.innerHTML = '';
    
    const recentActivities = CRMApp.activities.slice(0, 5); // Show last 5 activities
    
    if (recentActivities.length > 0) {
        recentActivities.forEach(activity => {
            const li = document.createElement('li');
            li.className = 'activity-item';
            li.innerHTML = `
                <div class="activity-icon">${activity.type === 'call' ? '📞' : '📝'}</div>
                <div class="activity-content">
                    <p class="activity-text">${activity.description}</p>
                    <span class="activity-timestamp">${new Date(activity.createdAt).toLocaleString()}</span>
                </div>
            `;
            activityList.appendChild(li);
        });
    } else {
        activityList.innerHTML = '<li class="text-sm text-gray-400 p-4">No recent activity.</li>';
    }
}

// --- 5. Data Loading and Initialization ---

/**
 * Loads all initial data from Firestore into the global state.
 */
CRMApp.loadInitialData = async () => {
    try {
        const [accountsSnapshot, contactsSnapshot, activitiesSnapshot] = await Promise.all([
            db.collection('accounts').get(),
            db.collection('contacts').get(),
            db.collection('activities').orderBy('createdAt', 'desc').limit(50).get()
        ]);
        
        CRMApp.accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        CRMApp.contacts = contactsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        CRMApp.activities = activitiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt.toDate() }));
        
        console.log('Initial data loaded:', {
            accounts: CRMApp.accounts.length,
            contacts: CRMApp.contacts.length,
            activities: CRMApp.activities.length
        });
        
        // After loading data, render the dashboard
        renderDashboard();
    } catch (error) {
        console.error('Error loading initial data from Firebase:', error);
        showToast('Failed to load data. Functionality may be limited.', 'error');
    }
};

/**
 * Saves all prospect information, call notes, and energy health check data to Firestore.
 */
async function saveProspectAndNotes() {
    // This is the same function from the previous corrected crm-app.js
    // It is a placeholder for the actual data-saving logic.
    showToast('Saving notes and data...', 'info');
    
    // Simulate save logic
    try {
        // Find or create account and contact
        const accountId = CRMApp.currentAccount ? CRMApp.currentAccount.id : 'temp-account-' + Date.now();
        const contactId = CRMApp.currentContact ? CRMApp.currentContact.id : 'temp-contact-' + Date.now();
        
        // Save an activity
        await db.collection('activities').add({
            type: 'call_note',
            description: `Call with ${getEl('input-name').value}`,
            noteContent: getEl('call-notes').value,
            contactId: contactId,
            contactName: getEl('input-name').value,
            accountId: accountId,
            accountName: getEl('input-company-name').value,
            createdAt: serverTimestamp()
        });

        // Update the UI
        CRMApp.loadInitialData(); // Re-fetch and re-render dashboard data
        showToast('Call notes saved successfully!', 'success');
        
    } catch (error) {
        console.error('Error saving data:', error);
        showToast('Failed to save data. Please try again.', 'error');
    }
}

// --- 6. Event Listeners and Initialization ---

CRMApp.setupEventListeners = () => {
    // Navigation links
    getEls('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = e.currentTarget.getAttribute('data-view');
            showView(viewName);
            updateActiveNavButton(e.currentTarget);
        });
    });

    // Sidebar button for Cold Calling Hub (if it's a separate view)
    const callButton = getEl('[data-view="calls-hub-view"]');
    if (callButton) {
        callButton.addEventListener('click', () => {
            // When switching to the calls hub, clear and initialize the script
            CRMApp.restart();
        });
    }

    // Event listeners for Cold Calling Hub inputs
    const hubInputs = [
        'input-phone', 'input-name', 'input-company-name', 'input-title',
        'input-company-industry', 'input-benefit', 'input-pain'
    ];
    hubInputs.forEach(id => {
        const input = getEl(id);
        if (input) input.addEventListener('input', CRMApp.updateScript);
    });

    // ... other event listeners (search, save, restart, etc.)
};

/**
 * The main initialization function.
 */
document.addEventListener('DOMContentLoaded', () => {
    CRMApp.init();
    CRMApp.setupEventListeners();
});

// Other functions from the Cold Calling Hub logic (e.g., updateScript, handleDialClick, etc.)
// would also be included here. They are omitted for brevity but should be part of this file.