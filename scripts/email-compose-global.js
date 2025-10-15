/**
 * Global Email Compose Module
 * 
 * Provides email compose functionality globally, allowing any page
 * to open the email composer without requiring the emails page to be loaded.
 * 
 * Usage: window.EmailCompose.openTo('email@example.com', 'Contact Name')
 */

(function() {
  if (!window.EmailCompose) window.EmailCompose = {};
  
  window.EmailCompose.openTo = function(toEmail, name = '') {
    try {
      toEmail = String(toEmail || '').trim();
    } catch(_) {
      toEmail = '';
    }
    
    if (!toEmail || !/@/.test(toEmail)) {
      window.crm?.showToast && window.crm.showToast('No valid email found');
      return;
    }
    
    console.log('[EmailCompose] Opening compose for:', toEmail, name || '');
    
    // Always try to open compose window directly on current page
    // No navigation - stay on whatever page user is currently on
    openComposeWindowDirect(toEmail, name);
  };
  
  function openComposeWindowDirect(toEmail, name) {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) {
      console.warn('[EmailCompose] Compose window not found in DOM');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
      return;
    }
    
    // Initialize email manager if not already available
    if (!window.emailManager && window.EmailManager) {
      console.log('[EmailCompose] Initializing EmailManager...');
      window.emailManager = new window.EmailManager();
      
      // Wait for EmailManager to be fully initialized
      setTimeout(() => {
        openComposeWithManager(toEmail, name);
      }, 300);
    } else if (window.emailManager) {
      // EmailManager already exists, use it directly
      openComposeWithManager(toEmail, name);
    } else {
      // This should rarely happen now since emails.js loads early
      console.warn('[EmailCompose] EmailManager not available - emails.js may not have loaded');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
    }
  }
  
  function openComposeWithManager(toEmail, name) {
    const emailManager = window.emailManager;
    
    if (emailManager && typeof emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Opening compose with EmailManager...');
      emailManager.openComposeWindow();
      
      // Wait for compose window to be ready, then prefill
      setTimeout(() => {
        const toInput = document.getElementById('compose-to');
        if (toInput) {
          toInput.value = toEmail;
          
          // Set selected recipient if emailManager is available
          if (emailManager && name) {
            emailManager._selectedRecipient = {
              email: toEmail,
              name: name,
              fullName: name,
              full_name: name
            };
          }
          
          // Focus the To input
          setTimeout(() => toInput.focus(), 100);
        }
      }, 200);
    } else {
      console.warn('[EmailCompose] EmailManager.openComposeWindow not available');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
    }
  }
  
  console.log('[EmailCompose] Global module initialized');
})();
