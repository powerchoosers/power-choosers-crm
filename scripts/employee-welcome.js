// Employee Welcome Screen - First-time onboarding for new employees
// Shows welcome message explaining lead assignment system

(function() {
  'use strict';

  const STORAGE_KEY_PREFIX = 'pc_employee_welcome_dismissed';

  function getStorageKey() {
    const email = (window.currentUserEmail || '').toLowerCase() || 'unknown';
    return `${STORAGE_KEY_PREFIX}:${email}`;
  }

  // Check if welcome has been dismissed
  function isWelcomeDismissed() {
    return localStorage.getItem(getStorageKey()) === 'true';
  }

  // Show welcome screen for new employees
  function showWelcomeScreen() {
    // Only show for employees, not admin
    if (!window.currentUserEmail || window.currentUserRole === 'admin') {
      return;
    }

    // Check if already dismissed
    if (isWelcomeDismissed()) {
      return;
    }

    // Create welcome overlay
    const overlay = document.createElement('div');
    overlay.id = 'employee-welcome-overlay';
    overlay.className = 'employee-welcome-overlay';
    
    const userName = window.currentUserEmail.split('@')[0];
    
    overlay.innerHTML = `
      <div class="employee-welcome-card">
        <div class="welcome-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <h2 class="welcome-title">Welcome to Power Choosers CRM!</h2>
        <p class="welcome-message">
          Hi <strong>${userName}</strong>! Your CRM is set up and ready to go.
        </p>
        <div class="welcome-content">
          <h3>How it works:</h3>
          <ul class="welcome-list">
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Your admin will assign leads (accounts & contacts) to you</span>
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>You'll only see leads that are assigned to you</span>
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Create tasks, log calls, send emails, and close deals!</span>
            </li>
            <li>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Your work is private - only you and admin can see it</span>
            </li>
          </ul>
        </div>
        <div class="welcome-tip">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>Right now your CRM is empty - leads will appear here once assigned to you.</span>
        </div>
        <button class="welcome-btn" id="employee-welcome-dismiss">
          Got it, let's start!
        </button>
      </div>
    `;
    
    document.body.appendChild(overlay);

    // Dismiss handler
    document.getElementById('employee-welcome-dismiss').addEventListener('click', () => {
      dismissWelcome();
    });
  }
  function dismissWelcome() {
    const overlay = document.getElementById('employee-welcome-overlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }

    localStorage.setItem(getStorageKey(), 'true');
  }

  // Check if the user has any accessible data
  async function userHasNoData() {
    try {
      // Prefer DataManager helper if available
      if (window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
        const [accounts, contacts, tasks] = await Promise.all([
          window.DataManager.queryWithOwnership('accounts'),
          window.DataManager.queryWithOwnership('contacts'),
          window.DataManager.queryWithOwnership('tasks')
        ]);
        return (accounts.length + contacts.length + tasks.length) === 0;
      }

      // Fallback: direct minimal queries
      const db = firebase.firestore();
      const email = (window.currentUserEmail || '').toLowerCase();
      if (!email) return false;

      const collections = ['accounts', 'contacts', 'tasks'];
      for (const col of collections) {
        const [own, assigned] = await Promise.all([
          db.collection(col).where('ownerId', '==', email).limit(1).get(),
          db.collection(col).where('assignedTo', '==', email).limit(1).get()
        ]);
        if (!own.empty || !assigned.empty) return false;
      }
      return true;
    } catch (e) {
      console.warn('[EmployeeWelcome] Data presence check failed:', e);
      return false;
    }
  }

  // Auto-show welcome screen on page load if needed
  function init() {
    // Wait for auth to be ready
    const checkAuth = setInterval(() => {
      if (window.currentUserEmail && window.currentUserRole) {
        clearInterval(checkAuth);
        
        // Only show for employees, per-user, and only when they have zero data
        (async () => {
          if (window.currentUserRole === 'employee' && !isWelcomeDismissed()) {
            const noData = await userHasNoData();
            if (noData) {
              setTimeout(() => {
                showWelcomeScreen();
              }, 400);
            }
          }
        })();
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => clearInterval(checkAuth), 5000);
  }

  // Expose API
  window.EmployeeWelcome = {
    show: showWelcomeScreen,
    dismiss: dismissWelcome,
    isDismissed: isWelcomeDismissed
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

