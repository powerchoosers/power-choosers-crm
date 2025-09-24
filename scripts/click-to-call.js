(function() {
  'use strict';

  // Click-to-call functionality for the CRM
  // Makes ONLY phone numbers clickable with subtle hover effects

  function formatPhoneForDisplay(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    // Always display US numbers with +1 prefix
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
      return `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    // If the input already starts with + and is not US length, leave as-is
    if (/^\+/.test(String(phone))) return String(phone);
    return phone; // Fallback: return as-is
  }

  function isValidPhoneNumber(text) {
    if (!text || typeof text !== 'string') return false;
    
    // Clean the text
    const cleaned = text.replace(/\D/g, '');
    
    // Must be 10 or 11 digits (US format)
    if (cleaned.length !== 10 && cleaned.length !== 11) return false;
    if (cleaned.length === 11 && !cleaned.startsWith('1')) return false;
    
    // Check if it looks like a phone number pattern
    const phonePattern = /^[\+]?[1]?[\-\.\s]?\(?([0-9]{3})\)?[\-\.\s]?([0-9]{3})[\-\.\s]?([0-9]{4})$/;
    return phonePattern.test(text.trim());
  }

  function makePhoneClickable(phoneElement, phone, contactName = '') {
    if (!phoneElement || !phone) return;
    
    // Clean phone for calling
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return; // Skip invalid numbers
    
    // Format for display
    const displayPhone = formatPhoneForDisplay(phone);
    
    // Add subtle hover styling without changing base color
    phoneElement.style.cursor = 'pointer';
    phoneElement.style.transition = 'opacity 0.2s ease';
    // Prefer explicit data attributes to decide which name to show. Use custom tooltip attr only.
    try {
      const hasContactId = !!phoneElement.getAttribute('data-contact-id');
      const hasAccountId = !!phoneElement.getAttribute('data-account-id');
      const attrContact = (phoneElement.getAttribute('data-contact-name') || '').trim();
      const attrCompany = (phoneElement.getAttribute('data-company-name') || '').trim();
      const nameForTitle = hasContactId && attrContact ? attrContact : (hasAccountId && attrCompany ? attrCompany : contactName);
      const tt = `Call ${displayPhone}${nameForTitle ? ` (${nameForTitle})` : ''}`;
      phoneElement.setAttribute('data-pc-title', tt);
      phoneElement.removeAttribute('title');
    } catch(_) {
      const tt = `Call ${displayPhone}${contactName ? ` (${contactName})` : ''}`;
      phoneElement.setAttribute('data-pc-title', tt);
      phoneElement.removeAttribute('title');
    }
    
    // Update display text if needed
    if (phoneElement.textContent.trim() !== displayPhone) {
      phoneElement.textContent = displayPhone;
    }
    
    // Add hover effects and refresh tooltip on every hover to prevent stale names
    phoneElement.addEventListener('mouseenter', function() {
      try {
        const textNow = (this.textContent || '').trim();
        const displayNow = formatPhoneForDisplay(textNow);
        const hasContactId = !!this.getAttribute('data-contact-id');
        const hasAccountId = !!this.getAttribute('data-account-id');
        const attrContact = (this.getAttribute('data-contact-name') || '').trim();
        const attrCompany = (this.getAttribute('data-company-name') || '').trim();
        // Prefer attributes; fallback to row-derived name
        let nameForTitle = hasContactId && attrContact ? attrContact : (hasAccountId && attrCompany ? attrCompany : '');
        if (!nameForTitle) {
          nameForTitle = findContactName(this) || '';
        }
        const tt = `Call ${displayNow}${nameForTitle ? ` (${nameForTitle})` : ''}`;
        this.setAttribute('data-pc-title', tt);
        this.removeAttribute('title');
      } catch(_) {}
      this.style.opacity = '0.7';
    });
    
    phoneElement.addEventListener('mouseleave', function() {
      this.style.opacity = '1';
    });
    
    // Add click handler
    phoneElement.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Use the phone widget to make the call
      if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
        // Mark the exact time of the user click to prove a fresh gesture
        try { window.Widgets._lastClickToCallAt = Date.now(); } catch(_) {}
        
        // Set proper call context before making the call
        setCallContextFromCurrentPage(phoneElement, contactName);
        
        // Always auto-trigger for click-to-call, but mark it as a user-initiated click
        console.debug('[ClickToCall] User clicked phone number - auto-triggering call');
        window.Widgets.callNumber(cleanPhone, contactName, true, 'click-to-call');
      } else {
        console.warn('Phone widget not available');
        // Fallback to tel: link
        const telLink = document.createElement('a');
        telLink.href = `tel:${cleanPhone}`;
        telLink.click();
      }
    });
    
    // Mark as processed
    phoneElement.classList.add('clickable-phone');
  }

  function findContactName(phoneElement) {
    // Direct data attribute from element takes precedence
    try {
      const direct = phoneElement.getAttribute && phoneElement.getAttribute('data-name');
      if (direct) {
        const v = String(direct).trim();
        if (v && v !== 'N/A') return v;
      }
    } catch (_) { /* noop */ }

    // Try to find the contact/account name from the table row
    const row = phoneElement.closest('tr');
    if (row) {
      // Prefer explicit account or contact name element if present
      const nameEl = row.querySelector('.account-name, .name-text');
      const nameFromEl = nameEl && nameEl.textContent ? nameEl.textContent.trim() : '';
      if (nameFromEl && nameFromEl !== 'N/A') return nameFromEl;
      const cells = row.querySelectorAll('td');
      if (cells.length > 1) {
        // Fallback: second column
        const nameCell = cells[1];
        const nameText = (nameCell && nameCell.textContent || '').trim();
        if (nameText && nameText !== '' && nameText !== 'N/A') {
          return nameText;
        }
      }
    }

    // Prefer account detail context if element lives inside account detail view
    try {
      if (phoneElement.closest && phoneElement.closest('#account-detail-view')) {
        const n = document.querySelector('#account-detail-header .page-title.contact-page-title, #account-name');
        const txt = (n && n.textContent || '').trim();
        if (txt) return txt;
      }
    } catch (_) { /* noop */ }

    // Otherwise, use contact detail context if present
    try {
      if (!phoneElement.closest || !phoneElement.closest('#account-detail-view')) {
        if (document.getElementById('contact-detail-view') && document.getElementById('contact-detail-header')) {
          const n = document.getElementById('contact-name');
          const txt = (n && n.textContent || '').trim();
          if (txt) return txt;
        }
      }
    } catch (_) { /* noop */ }

    // As a final fallback, try global account header if visible
    try {
      const n = document.querySelector('#account-detail-header .page-title.contact-page-title, #account-name');
      const txt = (n && n.textContent || '').trim();
      if (txt) return txt;
    } catch (_) { /* noop */ }

    return '';
  }

  function setCallContextFromCurrentPage(phoneElement, contactName) {
    if (!window.Widgets || typeof window.Widgets.setCallContext !== 'function') {
      console.warn('[ClickToCall] Phone widget setCallContext not available');
      return;
    }

    const context = {
      contactName: contactName || '',
      name: contactName || '',
      company: '',
      accountId: null,
      accountName: null,
      contactId: null
    };

    // First, try to extract context directly from the phone element's data attributes
    const phoneContactId = phoneElement.getAttribute('data-contact-id');
    const phoneAccountId = phoneElement.getAttribute('data-account-id');
    const phoneContactName = phoneElement.getAttribute('data-contact-name');
    const phoneCompanyName = phoneElement.getAttribute('data-company-name');

    if (phoneContactId) context.contactId = phoneContactId;
    if (phoneAccountId) context.accountId = phoneAccountId;
    if (phoneContactName) {
      context.contactName = phoneContactName;
      context.name = phoneContactName;
    }
    if (phoneCompanyName) {
      context.company = phoneCompanyName;
      context.accountName = phoneCompanyName;
    }

    // If we didn't get context from the phone element, try to extract from table row
    if (!context.contactId || !context.accountId) {
      const row = phoneElement.closest('tr');
      if (row) {
        // Get contact ID if available
        const contactId = row.getAttribute('data-contact-id') || 
                         row.querySelector('[data-contact-id]')?.getAttribute('data-contact-id');
        if (contactId && !context.contactId) context.contactId = contactId;

        // Get account ID if available
        const accountId = row.getAttribute('data-account-id') || 
                         row.querySelector('[data-account-id]')?.getAttribute('data-account-id');
        if (accountId && !context.accountId) context.accountId = accountId;

        // Get company/account name
        const companyEl = row.querySelector('.company-link, .account-name, .company-cell');
        if (companyEl && !context.company) {
          const companyName = companyEl.textContent?.trim() || companyEl.getAttribute('data-company');
          if (companyName && companyName !== 'N/A') {
            context.company = companyName;
            context.accountName = companyName;
          }
        }
      }
    }

    // Try to get context from contact detail page
    try {
      if (document.getElementById('contact-detail-view')) {
        const contactDetail = window.ContactDetail;
        if (contactDetail && contactDetail.state && contactDetail.state.currentContact) {
          const contact = contactDetail.state.currentContact;
          context.contactId = contact.id || contact.contactId || contact._id;
          context.contactName = contact.name || contact.firstName + ' ' + contact.lastName;
          context.name = context.contactName;
          context.company = contact.company || contact.companyName || contact.account;
          context.accountName = context.company;
          
          // Try to get linked account ID
          if (contactDetail.state._linkedAccountId) {
            context.accountId = contactDetail.state._linkedAccountId;
          }
        }
      }
    } catch (_) { /* noop */ }

    // Try to get context from account detail page
    try {
      if (document.getElementById('account-detail-view')) {
        const accountDetail = window.AccountDetail;
        if (accountDetail && accountDetail.state && accountDetail.state.currentAccount) {
          const account = accountDetail.state.currentAccount;
          context.accountId = account.id || account.accountId || account._id;
          context.accountName = account.name || account.accountName;
          context.company = context.accountName;
          // Include location/domain hints for the phone widget display
          try { if (account.city) context.city = account.city; } catch(_) {}
          try { if (account.state) context.state = account.state; } catch(_) {}
          // Prefer explicit logoUrl for icons
          try { if (account.logoUrl) context.logoUrl = String(account.logoUrl); } catch(_) {}
          // Ensure domain is present: derive from website if missing
          try {
            let domain = account.domain || '';
            if (!domain && account.website) {
              try { const u = new URL(account.website.startsWith('http') ? account.website : `https://${account.website}`); domain = u.hostname; } catch(_) {
                domain = String(account.website).replace(/^https?:\/\//i,'').split('/')[0];
              }
              domain = domain.replace(/^www\./i,'');
            }
            if (domain) context.domain = domain;
          } catch(_) {}
        }
      }
    } catch (_) { /* noop */ }

    // Force company-mode context when clicking the Account's company phone
    try {
      const isAccountCompanyPhone = !!phoneElement.closest('#account-detail-view') && (
        phoneElement.matches('#account-detail-view .info-value-wrap[data-field="companyPhone"] .info-value-text') ||
        (
          // Or if element explicitly has account id but no contact id
          (phoneElement.getAttribute('data-account-id') && !phoneElement.getAttribute('data-contact-id'))
        )
      );
      if (isAccountCompanyPhone) {
        // Clear any stale contact attribution and mark as company phone
        context.contactId = null;
        context.contactName = '';
        // Ensure name is the company/account name in this mode
        context.name = context.accountName || context.company || contactName || '';
        context.isCompanyPhone = true;
        // Ensure logoUrl/domain hints are present for company-mode icon
        try {
          const account = window.AccountDetail?.state?.currentAccount || {};
          if (account.logoUrl && !context.logoUrl) context.logoUrl = String(account.logoUrl);
          if (!context.domain) {
            let d = account.domain || '';
            if (!d && account.website) {
              try { const u = new URL(account.website.startsWith('http') ? account.website : `https://${account.website}`); d = u.hostname; } catch(_) {
                d = String(account.website).replace(/^https?:\/\//i,'').split('/')[0];
              }
            }
            if (d) context.domain = d.replace(/^www\./i,'');
          }
          if (!context.city && account.city) context.city = account.city;
          if (!context.state && account.state) context.state = account.state;
        } catch(_) {}
      }
    } catch(_) {}

    console.debug('[ClickToCall] Setting call context:', context);
    window.Widgets.setCallContext(context);
  }

  function processTablePhoneNumbers() {
    // Process people table specifically
    const peopleTable = document.getElementById('people-table');
    if (peopleTable) {
      const rows = peopleTable.querySelectorAll('tbody tr');
      rows.forEach(row => {
        if (row.dataset.phoneProcessed) return;
        
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
          // Phone is typically in the 6th column (index 5)
          const phoneCell = cells[5];
          const phoneText = phoneCell.textContent.trim();
          
          if (phoneText && phoneText !== '' && phoneText !== 'N/A' && isValidPhoneNumber(phoneText)) {
            const contactName = findContactName(phoneCell);
            makePhoneClickable(phoneCell, phoneText, contactName);
          }
        }
        
        row.dataset.phoneProcessed = 'true';
      });
    }
    
    // Process accounts table
    const accountsTable = document.getElementById('accounts-table');
    if (accountsTable) {
      const rows = accountsTable.querySelectorAll('tbody tr');
      rows.forEach(row => {
        if (row.dataset.phoneProcessed) return;
        // Find the phone cell reliably even if columns are reordered
        let phoneCell = row.querySelector('td[data-field="companyPhone"], td[data-field="phone"], td.phone-cell, td.click-to-call');
        if (!phoneCell) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) phoneCell = cells[4];
        }
        if (phoneCell && !phoneCell.classList.contains('clickable-phone')) {
          const dataPhone = (phoneCell.getAttribute('data-phone') || '').trim();
          const textPhone = (phoneCell.textContent || '').trim();
          const rawPhone = dataPhone || textPhone;
          if (rawPhone && rawPhone !== '' && rawPhone !== 'N/A' && isValidPhoneNumber(rawPhone)) {
            const accountName = findContactName(phoneCell);
            makePhoneClickable(phoneCell, rawPhone, accountName);
          }
        }
        row.dataset.phoneProcessed = 'true';
      });
    }
    
    // Process calls table
    const callsTable = document.getElementById('calls-table');
    if (callsTable) {
      const rows = callsTable.querySelectorAll('tbody tr');
      rows.forEach(row => {
        if (row.dataset.phoneProcessed) return;
        
        // Look for phone numbers in call records
        const phoneElements = row.querySelectorAll('td');
        phoneElements.forEach(cell => {
          const cellText = cell.textContent.trim();
          if (isValidPhoneNumber(cellText)) {
            const contactName = findContactName(cell);
            makePhoneClickable(cell, cellText, contactName);
          }
        });
        
        row.dataset.phoneProcessed = 'true';
      });
    }
  }

  function processSpecificPhoneElements() {
    // Only target very specific phone number containers
    const specificSelectors = [
      'td[data-field="companyPhone"]',
      'td[data-field="phone"]',
      'td[data-field="mobile"]',
      '.phone-cell',
      '.click-to-call',
      '.contact-phone',
      '.phone-number',
      '.phone-value',
      // Contact detail view phone fields
      '#contact-detail-view .info-row[data-field="phone"] .info-value-text',
      '#contact-detail-view .info-row[data-field="mobile"] .info-value-text',
      '#contact-detail-view .info-row[data-field="companyPhone"] .info-value-text',
      // Account detail view phone field
      '#account-detail-view .info-value-wrap[data-field="companyPhone"] .info-value-text',
      '#account-detail-view .info-value-wrap[data-field="phone"] .info-value-text',
      // Recent calls phone numbers
      '.rc-sub .phone-number'
    ];
    
    specificSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        // Skip phone widget input field to prevent interference
        if (element.closest('#phone-widget') || element.classList.contains('phone-display')) {
          return;
        }

        const text = (element.textContent || '').trim();
        if (!isValidPhoneNumber(text)) return;

        // Build tooltip text with strong preference for explicit data attributes
        const displayPhone = formatPhoneForDisplay(text);
        let nameForTitle = '';
        try {
          const hasContactId = !!element.getAttribute('data-contact-id');
          const hasAccountId = !!element.getAttribute('data-account-id');
          const attrContact = (element.getAttribute('data-contact-name') || '').trim();
          const attrCompany = (element.getAttribute('data-company-name') || '').trim();
          nameForTitle = hasContactId && attrContact ? attrContact : (hasAccountId && attrCompany ? attrCompany : '');
        } catch(_) {}
        if (!nameForTitle) nameForTitle = findContactName(element) || '';
        // Use custom tooltip attribute and remove native title to avoid stale browser tooltips
        try { element.setAttribute('data-pc-title', `Call ${displayPhone}${nameForTitle ? ` (${nameForTitle})` : ''}`); element.removeAttribute('title'); } catch(_) {}

        // Bind click handler only once
        if (!element.classList.contains('clickable-phone')) {
          const contactNameForClick = nameForTitle || '';
          makePhoneClickable(element, text, contactNameForClick);
        }
      });
    });
  }

  // Initialize click-to-call
  function initClickToCall() {
    console.debug('[ClickToCall] Initializing click-to-call functionality');
    
    // Process phone numbers in tables and specific elements only
    processTablePhoneNumbers();
    processSpecificPhoneElements();
    
    console.debug('[ClickToCall] Click-to-call initialized');
  }

  // Set up observer for dynamic content (tables being populated)
  function setupObserver() {
    if (typeof MutationObserver === 'undefined') return;
    
    const observer = new MutationObserver(function(mutations) {
      let shouldProcess = false;
      
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Only process if table rows are added
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches('tr') || node.querySelector('tr')) {
                shouldProcess = true;
              }
            }
          });
        }
      });
      
      if (shouldProcess) {
        // Debounce the processing
        clearTimeout(window.clickToCallTimeout);
        window.clickToCallTimeout = setTimeout(() => {
          processTablePhoneNumbers();
          processSpecificPhoneElements();
        }, 100);
      }
    });
    
    // Only observe table containers
    const tablesToObserve = ['people-table', 'accounts-table', 'calls-table'];
    tablesToObserve.forEach(tableId => {
      const table = document.getElementById(tableId);
      if (table) {
        observer.observe(table, {
          childList: true,
          subtree: true
        });
      }
    });
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initClickToCall();
      setupObserver();
    });
  } else {
    initClickToCall();
    setupObserver();
  }

  // Re-initialize when navigating to pages with tables
  document.addEventListener('pc:page-loaded', function(e) {
    if (e.detail && ['people', 'accounts', 'calls'].includes(e.detail.page)) {
      setTimeout(() => {
        initClickToCall();
      }, 100);
    }
  });

  // Expose for manual triggering
  window.ClickToCall = {
    init: initClickToCall,
    processTablePhoneNumbers: processTablePhoneNumbers,
    processSpecificPhoneElements: processSpecificPhoneElements
  };

})();
