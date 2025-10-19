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
    
    // Use the new emails-redesigned.js approach
    if (window.emailManager && typeof window.emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Using emails-redesigned.js compose function...');
      openComposeWithManager(toEmail, name);
    } else {
      console.warn('[EmailCompose] emailManager not available - emails-redesigned.js may not have loaded');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
    }
  }
  
  function openComposeWithManager(toEmail, name) {
    const emailManager = window.emailManager;
    
    if (emailManager && typeof emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Opening compose with emails-redesigned.js...');
      // Call openComposeWindow with null to ensure it's treated as a new email
      emailManager.openComposeWindow(null);
      
      // Wait for compose window to be ready, then prefill
      setTimeout(() => {
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        
        console.log('[EmailCompose] Subject field value after opening:', subjectInput?.value);
        
        if (toInput) {
          toInput.value = toEmail;
        }
        
        // Ensure subject is empty for new emails
        if (subjectInput && subjectInput.value.includes('Re:')) {
          console.log('[EmailCompose] Clearing Re: prefix from subject');
          subjectInput.value = '';
        }
        
        // Focus the To input
        setTimeout(() => toInput.focus(), 100);
      }, 200);
    } else {
      console.warn('[EmailCompose] emailManager.openComposeWindow not available');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
    }
  }
  
  console.log('[EmailCompose] Global module initialized');
})();
