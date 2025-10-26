// Employee Welcome Screen - First-time onboarding for new employees
// Shows welcome message explaining lead assignment system

(function() {
  'use strict';

  const STORAGE_KEY = 'pc_employee_welcome_dismissed';

  // Check if welcome has been dismissed
  function isWelcomeDismissed() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
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

    console.log('[EmployeeWelcome] Welcome screen shown');
  }

  // Dismiss welcome screen
  function dismissWelcome() {
    const overlay = document.getElementById('employee-welcome-overlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }

    localStorage.setItem(STORAGE_KEY, 'true');
    console.log('[EmployeeWelcome] Welcome dismissed');
  }

  // Auto-show welcome screen on page load if needed
  function init() {
    // Wait for auth to be ready
    const checkAuth = setInterval(() => {
      if (window.currentUserEmail && window.currentUserRole) {
        clearInterval(checkAuth);
        
        // Only show for employees with no data
        if (window.currentUserRole === 'employee' && !isWelcomeDismissed()) {
          // Small delay to ensure page is loaded
          setTimeout(() => {
            showWelcomeScreen();
          }, 500);
        }
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => clearInterval(checkAuth), 5000);
  }

  // Expose API
  window.EmployeeWelcome = {
    show: showWelcomeScreen,
    dismiss: dismissWelcome,
    isDissmissed: isWelcomeDismissed
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[EmployeeWelcome] Module loaded');
})();

