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
    
    // Try emails-redesigned.js first, but fallback to direct DOM manipulation
    if (window.emailManager && typeof window.emailManager.openComposeWindow === 'function') {
      console.log('[EmailCompose] Using emails-redesigned.js compose function...');
      openComposeWithManager(toEmail, name);
    } else {
      console.log('[EmailCompose] emailManager not available, using direct DOM approach...');
      openComposeDirectly(toEmail, name);
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
  
  function openComposeDirectly(toEmail, name) {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) {
      console.warn('[EmailCompose] Compose window not found');
      return;
    }
    
    // Reset compose window fields
    const toInput = document.getElementById('compose-to');
    const subjectInput = document.getElementById('compose-subject');
    const ccInput = document.getElementById('compose-cc');
    const bccInput = document.getElementById('compose-bcc');
    const bodyInput = document.querySelector('.body-input');
    
    // Clear all fields
    if (toInput) toInput.value = '';
    if (subjectInput) subjectInput.value = '';
    if (ccInput) ccInput.value = '';
    if (bccInput) bccInput.value = '';
    if (bodyInput) bodyInput.innerHTML = '';
    
    // Show compose window
    composeWindow.style.display = 'flex';
    setTimeout(() => {
      composeWindow.classList.add('open');
    }, 10);
    
    // Prefill the To field
    setTimeout(() => {
      if (toInput) {
        toInput.value = toEmail;
        toInput.focus();
      }
    }, 100);
    
    // Setup close button functionality if not already set up
    setupComposeCloseButton();
    
    console.log('[EmailCompose] Opened compose window directly for:', toEmail);
  }
  
  function setupComposeCloseButton() {
    const closeBtn = document.getElementById('compose-close');
    const composeWindow = document.getElementById('compose-window');
    
    if (closeBtn && !closeBtn.dataset.listenerAdded) {
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Close compose window
        if (composeWindow) {
          composeWindow.classList.remove('open');
          setTimeout(() => {
            composeWindow.style.display = 'none';
          }, 300);
        }
        
        console.log('[EmailCompose] Compose window closed');
      });
      
      closeBtn.dataset.listenerAdded = 'true';
    }
  }
  
  console.log('[EmailCompose] Global module initialized');
})();
