(function() {
  'use strict';

  // Click-to-call functionality for the CRM
  // Makes ONLY phone numbers clickable with subtle hover effects

  function formatPhoneForDisplay(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    }
    return phone; // Return as-is if doesn't match expected format
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
    phoneElement.title = `Call ${displayPhone}${contactName ? ` (${contactName})` : ''}`;
    
    // Update display text if needed
    if (phoneElement.textContent.trim() !== displayPhone) {
      phoneElement.textContent = displayPhone;
    }
    
    // Add hover effects
    phoneElement.addEventListener('mouseenter', function() {
      this.style.opacity = '0.7';
    });
    
    phoneElement.addEventListener('mouseleave', function() {
      this.style.opacity = '1';
    });
    
    // Add click handler
    phoneElement.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Use the phone widget to make the call (manual click, not auto-trigger)
      if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
        window.Widgets.callNumber(cleanPhone, contactName, false); // false = manual click, don't auto-trigger
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
    // Try to find the contact name from the table row
    const row = phoneElement.closest('tr');
    if (row) {
      const cells = row.querySelectorAll('td');
      if (cells.length > 1) {
        // Name is usually in the second column (index 1)
        const nameCell = cells[1];
        const nameText = nameCell.textContent.trim();
        if (nameText && nameText !== '' && nameText !== 'N/A') {
          return nameText;
        }
      }
    }
    
    return '';
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
        
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          // Phone column in accounts table (index 4)
          const phoneCell = cells[4];
          const phoneText = phoneCell.textContent.trim();
          
          if (phoneText && phoneText !== '' && phoneText !== 'N/A' && isValidPhoneNumber(phoneText)) {
            // Account name is usually in first column after checkbox
            const nameCell = cells[1];
            const accountName = nameCell ? nameCell.textContent.trim() : '';
            makePhoneClickable(phoneCell, phoneText, accountName);
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
      'td[data-field="phone"]',
      'td[data-field="mobile"]',
      '.phone-cell',
      '.contact-phone',
      '.phone-number',
      '.phone-value'
    ];
    
    specificSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        if (element.classList.contains('clickable-phone')) return;
        
        const text = element.textContent.trim();
        if (isValidPhoneNumber(text)) {
          const contactName = findContactName(element);
          makePhoneClickable(element, text, contactName);
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
