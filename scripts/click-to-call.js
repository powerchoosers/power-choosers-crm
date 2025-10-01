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
      
      // For Contact Detail company phone calls, prioritize company context
      let nameForTitle = '';
      if (phoneElement.closest('#contact-detail-view') && phoneElement.closest('.info-row[data-field="companyPhone"]')) {
        // This is a company phone on Contact Detail - use company name only
        nameForTitle = attrCompany || '';
      } else {
        // Regular logic for other contexts
        nameForTitle = hasContactId && attrContact ? attrContact : (hasAccountId && attrCompany ? attrCompany : contactName);
      }
      
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
        
        // For Contact Detail company phone calls, prioritize company context
        let nameForTitle = '';
        if (this.closest('#contact-detail-view') && this.closest('.info-row[data-field="companyPhone"]')) {
          // This is a company phone on Contact Detail - use company name only
          nameForTitle = attrCompany || '';
        } else {
          // Regular logic for other contexts
          nameForTitle = hasContactId && attrContact ? attrContact : (hasAccountId && attrCompany ? attrCompany : '');
        if (!nameForTitle) {
          nameForTitle = findContactName(this) || '';
          }
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
        
        // Only set context if it wasn't already set by a page-specific handler
        // (e.g., handleCompanyPhoneClick in contact-detail.js)
        if (!window._pcPhoneContextSetByPage) {
          // Set proper call context before making the call
          setCallContextFromCurrentPage(phoneElement, contactName);
        } else {
          console.debug('[ClickToCall] Skipping context setting - already set by page handler');
        }
        
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

    // REMOVED: Contact detail context lookup
    // This was causing contact company info to leak into account detail phone calls

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
    const phoneCity = phoneElement.getAttribute('data-city');
    const phoneState = phoneElement.getAttribute('data-state');
    const phoneDomain = phoneElement.getAttribute('data-domain');
    const phoneLogoUrl = phoneElement.getAttribute('data-logo-url');

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
    if (phoneCity) context.city = phoneCity;
    if (phoneState) context.state = phoneState;
    if (phoneDomain) context.domain = phoneDomain;
    if (phoneLogoUrl) context.logoUrl = phoneLogoUrl;

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

    // Handle Contact Detail page phone calls
    if (phoneElement.closest('#contact-detail-view')) {
      const isCompanyPhone = phoneElement.closest('.info-row[data-field="companyPhone"]');
      const isContactPhone = phoneElement.closest('.info-row[data-field="phone"]'); // mobile/work direct/other
      
      if (isCompanyPhone) {
        // Company phone - force company mode
        context.contactId = null;
        context.contactName = '';
        context.isCompanyPhone = true;
        
        // Use company context from data attributes
        const companyName = phoneElement.getAttribute('data-company-name') || '';
        const accountId = phoneElement.getAttribute('data-account-id') || '';
        
        if (companyName) {
          context.company = companyName;
          context.accountName = companyName;
          context.name = companyName;
        }
        
        if (accountId) {
          context.accountId = accountId;
        }
      } else if (isContactPhone) {
        // Contact phone (mobile/work direct/other) - force contact mode
        context.isCompanyPhone = false;
        
        // Use contact context from data attributes
        const contactId = phoneElement.getAttribute('data-contact-id') || '';
        const contactName = phoneElement.getAttribute('data-contact-name') || '';
        const companyName = phoneElement.getAttribute('data-company-name') || '';
        const accountId = phoneElement.getAttribute('data-account-id') || '';
        
        if (contactId) {
          context.contactId = contactId;
        }
        
        if (contactName) {
          context.contactName = contactName;
          context.name = contactName; // Show contact name as primary
        }
        
        if (companyName) {
          context.company = companyName;
          context.accountName = companyName;
        }
        
        if (accountId) {
          context.accountId = accountId;
        }
        
        console.debug('[ClickToCall] Contact phone detected:', { contactId, contactName, companyName });
      }
      
      // Try to get additional account context from Contact Detail state (only for company phones)
      if (isCompanyPhone) {
        try {
          if (window.ContactDetail && window.ContactDetail.state && window.ContactDetail.state.currentContact) {
            const contact = window.ContactDetail.state.currentContact;
            const contactAccountId = contact.accountId || contact.account_id;
            const contactCompanyName = contact.companyName || contact.company || contact.account || '';
            
            if (contactAccountId && !context.accountId) {
              context.accountId = contactAccountId;
            }
            
            if (contactCompanyName && !context.company) {
              context.company = contactCompanyName;
              context.accountName = contactCompanyName;
              context.name = contactCompanyName;
            }
            
            // Try to get account data for city/state/domain - use multiple methods
            let accountData = null;
            if (contactAccountId) {
              // Method 1: window.Accounts.getAccountById
              if (window.Accounts && window.Accounts.getAccountById) {
                try { accountData = window.Accounts.getAccountById(contactAccountId); } catch(_) {}
              }
              
              // Method 2: window.getAccountsData
              if (!accountData && typeof window.getAccountsData === 'function') {
                try {
                  const accounts = window.getAccountsData() || [];
                  accountData = accounts.find(acc => acc.id === contactAccountId || acc.accountId === contactAccountId);
                } catch(_) {}
              }
              
              // Method 3: window.Accounts.accounts cache
              if (!accountData && window.Accounts && window.Accounts.accounts) {
                try {
                  const accounts = window.Accounts.accounts || [];
                  accountData = accounts.find(acc => acc.id === contactAccountId || acc.accountId === contactAccountId);
                } catch(_) {}
              }
            }
            
            // If still no account data, try name matching
            if (!accountData && contactCompanyName && window.Accounts && window.Accounts.accounts) {
              try {
                const accounts = window.Accounts.accounts || [];
                accountData = accounts.find(acc => 
                  (acc.name && acc.name.toLowerCase() === contactCompanyName.toLowerCase()) ||
                  (acc.accountName && acc.accountName.toLowerCase() === contactCompanyName.toLowerCase())
                );
              } catch(_) {}
            }
            
            if (accountData) {
              if (!context.city) context.city = accountData.city || accountData.locationCity || '';
              if (!context.state) context.state = accountData.state || accountData.locationState || '';
              if (!context.domain) {
                let domain = accountData.domain || '';
                if (!domain && accountData.website) {
                  try {
                    const url = accountData.website.startsWith('http') ? accountData.website : `https://${accountData.website}`;
                    const u = new URL(url);
                    domain = u.hostname.replace(/^www\./i, '');
                  } catch(_) {
                    domain = String(accountData.website).replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
                  }
                }
                if (domain) context.domain = domain;
              }
              // Always use account logo when available
              if (accountData.logoUrl) {
                context.logoUrl = String(accountData.logoUrl);
              }
            }
          }
        } catch(_) {}
      }
      
      console.log('[ClickToCall] Contact Detail phone context:', context);
      window.Widgets.setCallContext(context);
      
      // Also trigger the phone widget to show the contact display immediately
      if (window.Widgets && typeof window.Widgets.setContactDisplay === 'function') {
        try {
          window.Widgets.setContactDisplay(context, '');
        } catch(_) {}
      }
      
      return;
    }

    // REMOVED: Contact detail page context lookup for individual contact phones
    // This was causing contact company info to leak into account detail phone calls

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
          try {
            if (!context.city) {
              if (account.city) context.city = account.city;
              else if (account.locationCity) context.city = account.locationCity;
            }
          } catch(_) {}
          try {
            if (!context.state) {
              if (account.state) context.state = account.state;
              else if (account.locationState) context.state = account.locationState;
            }
          } catch(_) {}
          // Prefer explicit logo for icons
          try { if (account.logoUrl) context.logoUrl = String(account.logoUrl); } catch(_) {}
          // Ensure domain is present: derive from website/site if missing
          try {
            let domain = account.domain || '';
            if (!domain) {
              const src = account.website || account.site || '';
              if (src) {
                try {
                  const u = new URL(src.startsWith('http') ? src : `https://${src}`);
                  domain = u.hostname;
                } catch(_) {
                  domain = String(src).replace(/^https?:\/\//i,'').split('/')[0];
                }
                domain = domain.replace(/^www\./i,'');
              }
            }
            if (!domain) {
              // DOM fallback: parse website from rendered Account Detail
              const wEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="website"] .info-value-text a, #account-detail-view .info-value-wrap[data-field=\"website\"] .info-value-text');
              if (wEl) {
                const raw = (wEl.getAttribute('href') || wEl.textContent || '').trim();
                if (raw) {
                  try {
                    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
                    domain = u.hostname.replace(/^www\./i,'');
                  } catch(_) {
                    domain = String(raw).replace(/^https?:\/\//i,'').split('/')[0].replace(/^www\./i,'');
                  }
                }
              }
            }
            if (domain) context.domain = domain;
          } catch(_) {}
          // As a last resort, read city/state directly from DOM if still empty
          try {
            if (!context.city) {
              const cEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="city"] .info-value-text');
              const v = (cEl && cEl.textContent || '').trim();
              if (v && v !== '--') context.city = v;
            }
          } catch(_) {}
          try {
            if (!context.state) {
              const sEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="state"] .info-value-text');
              const v = (sEl && sEl.textContent || '').trim();
              if (v && v !== '--') context.state = v;
            }
          } catch(_) {}
          // DOM fallback for logoUrl when state is missing it
          try {
            if (!context.logoUrl) {
              const img = document.querySelector('#account-detail-header img.company-favicon');
              if (img && img.src) context.logoUrl = img.src;
            }
            if (!context.logoUrl) {
              const img2 = document.querySelector('#account-detail-header img[alt=""], #account-detail-header img');
              if (img2 && img2.src) context.logoUrl = img2.src;
            }
            if (!context.logoUrl) {
              const link = document.querySelector('#account-detail-view .info-value-wrap[data-field="logoUrl"] .info-value-text a');
              if (link && link.href) context.logoUrl = link.href;
            }
            if (!context.logoUrl) {
              const txtEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="logoUrl"] .info-value-text');
              const rawText = txtEl && txtEl.textContent ? txtEl.textContent.trim() : '';
              if (/^https?:\/\//i.test(rawText)) context.logoUrl = rawText;
            }
          } catch(_) {}
        }
      }
    } catch (_) { /* noop */ }

    // Force company-mode context when clicking a company phone
    try {
      const inAccount = !!phoneElement.closest('#account-detail-view');
      const isCompanyField = phoneElement.matches('#account-detail-view .info-value-wrap[data-field="companyPhone"] .info-value-text');
      const explicitAccountNoContact = (phoneElement.getAttribute('data-account-id') && !phoneElement.getAttribute('data-contact-id'));
      const isCompanyPhoneClick = (inAccount && (isCompanyField || explicitAccountNoContact)) || explicitAccountNoContact;
      if (isCompanyPhoneClick) {
        // Clear any stale contact attribution and mark as company phone
        context.contactId = null;
        context.contactName = '';
        // Ensure name is the company/account name in this mode
        context.name = context.accountName || context.company || contactName || '';
        context.isCompanyPhone = true;
        // Ensure logoUrl/domain hints are present for company-mode icon
        try {
          const account = window.AccountDetail?.state?.currentAccount || {};
          // Always use account logoUrl if available (prioritize over any existing logoUrl)
          if (account.logoUrl) context.logoUrl = String(account.logoUrl);
          // DOM fallback for logo if state is empty
          if (!context.logoUrl) {
            const headerImg = document.querySelector('#account-detail-header img.company-favicon') || document.querySelector('#account-detail-header img');
            if (headerImg && headerImg.src) context.logoUrl = headerImg.src;
          }
          if (!context.logoUrl) {
            const link = document.querySelector('#account-detail-view .info-value-wrap[data-field="logoUrl"] .info-value-text a');
            if (link && link.href) context.logoUrl = link.href;
          }
          if (!context.logoUrl) {
            const txtEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="logoUrl"] .info-value-text');
            const rawText = txtEl && txtEl.textContent ? txtEl.textContent.trim() : '';
            if (/^https?:\/\//i.test(rawText)) context.logoUrl = rawText;
          }
          if (!context.domain) {
            let d = account.domain || '';
            if (!d) {
              const src = account.website || account.site || '';
              if (src) {
                try { const u = new URL(src.startsWith('http') ? src : `https://${src}`); d = u.hostname; } catch(_) {
                  d = String(src).replace(/^https?:\/\//i,'').split('/')[0];
                }
              }
            }
            if (!d) {
              const wEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="website"] .info-value-text a, #account-detail-view .info-value-wrap[data-field=\"website\"] .info-value-text');
              if (wEl) {
                const raw = (wEl.getAttribute('href') || wEl.textContent || '').trim();
                if (raw) {
                  try { const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); d = u.hostname; } catch(_) {
                    d = String(raw).replace(/^https?:\/\//i,'').split('/')[0];
                  }
                }
              }
            }
            if (d) context.domain = String(d).replace(/^www\./i,'');
          }
          if (!context.city) {
            if (account.city) context.city = account.city;
            else if (account.locationCity) context.city = account.locationCity;
            else {
              const cEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="city"] .info-value-text');
              const v = (cEl && cEl.textContent || '').trim();
              if (v && v !== '--') context.city = v;
            }
          }
          if (!context.state) {
            if (account.state) context.state = account.state;
            else if (account.locationState) context.state = account.locationState;
            else {
              const sEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="state"] .info-value-text');
              const v = (sEl && sEl.textContent || '').trim();
              if (v && v !== '--') context.state = v;
            }
          }
        } catch(_) {}
      }
    } catch(_) {}

    // For account detail pages, completely bypass contact lookup logic
    // This ensures we never look for contact information on account pages
    if (phoneElement.closest('#account-detail-view')) {
      // Force company mode and clear any contact fields
      context.contactId = null;
      context.contactName = '';
      context.isCompanyPhone = true;
      // Use account information only
      try {
        const account = window.AccountDetail?.state?.currentAccount || {};
        if (account.id) context.accountId = account.id;
        if (account.accountName || account.name) {
          context.accountName = account.accountName || account.name;
          context.company = context.accountName;
          context.name = context.accountName;
        }
        if (!context.city) {
          if (account.city) context.city = account.city;
          else if (account.locationCity) context.city = account.locationCity;
          else {
            const cEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="city"] .info-value-text');
            const v = (cEl && cEl.textContent || '').trim();
            if (v && v !== '--') context.city = v;
          }
        }
        if (!context.state) {
          if (account.state) context.state = account.state;
          else if (account.locationState) context.state = account.locationState;
          else {
            const sEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="state"] .info-value-text');
            const v = (sEl && sEl.textContent || '').trim();
            if (v && v !== '--') context.state = v;
          }
        }
        if (account.logoUrl) context.logoUrl = String(account.logoUrl);
        if (account.domain) {
          context.domain = account.domain;
        } else {
          const src = account.website || account.site || '';
          if (src) {
            try {
              const u = new URL(src.startsWith('http') ? src : `https://${src}`);
              context.domain = u.hostname.replace(/^www\./i, '');
            } catch(_) {
              context.domain = String(src).replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
            }
          } else {
            const wEl = document.querySelector('#account-detail-view .info-value-wrap[data-field="website"] .info-value-text a, #account-detail-view .info-value-wrap[data-field=\"website\"] .info-value-text');
            if (wEl) {
              const raw = (wEl.getAttribute('href') || wEl.textContent || '').trim();
              if (raw) {
                try { const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); context.domain = u.hostname.replace(/^www\./i,''); } catch(_) {
                  context.domain = String(raw).replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
                }
              }
            }
          }
        }
      } catch(_) {}
    }

    // For accounts page (list), treat company phones as company-mode and enrich from accounts cache
    if (phoneElement.closest('#accounts-table')) {
      // Force company mode and clear contact fields
      context.contactId = null;
      context.contactName = '';
      context.isCompanyPhone = true;
      // Ensure company/name fields are set from the row
      try {
        const row = phoneElement.closest('tr');
        if (row) {
          // Try to resolve accountId from link/button in the row
          const idFromLink = row.querySelector('.acct-link')?.getAttribute('data-id') || '';
          const idFromBtn = row.querySelector('.qa-btn[data-action="call"]')?.getAttribute('data-id') || '';
          const aid = idFromLink || idFromBtn;
          if (aid) context.accountId = aid;
          // Company name from visible cell (if not already)
          if (!context.company || !context.name || !context.accountName) {
            const nm = row.querySelector('.account-name')?.textContent?.trim();
            if (nm) {
              context.company = context.company || nm;
              context.name = context.name || nm;
              context.accountName = context.accountName || nm;
            }
          }
        }
      } catch(_) {}
      // Enrich from accounts cache if possible
      try {
        const getAccounts = (typeof window.getAccountsData === 'function') ? window.getAccountsData : null;
        const accounts = getAccounts ? (getAccounts() || []) : [];
        let acc = null;
        if (context.accountId) {
          acc = accounts.find(a => String(a.id||'') === String(context.accountId)) || null;
        }
        if (!acc && context.company) {
          const want = String(context.company||'').trim().toLowerCase();
          acc = accounts.find(a => String(a.accountName||a.name||'').trim().toLowerCase() === want) || null;
        }
        if (acc) {
          if (!context.city) context.city = acc.city || acc.locationCity || '';
          if (!context.state) context.state = acc.state || acc.locationState || '';
          if (!context.logoUrl && acc.logoUrl) context.logoUrl = String(acc.logoUrl);
          if (!context.domain) {
            let d = acc.domain || '';
            if (!d) {
              const src = acc.website || acc.site || '';
              if (src) {
                try { const u = new URL(src.startsWith('http') ? src : `https://${src}`); d = u.hostname; } catch(_) {
                  d = String(src).replace(/^https?:\/\//i,'').split('/')[0];
                }
              }
            }
            if (d) context.domain = String(d).replace(/^www\./i,'');
          }
        }
      } catch(_) {}
      // Fall through (do not return) so downstream code can continue
    }

    // For calls page, completely bypass contact lookup logic
    // This prevents contact context from leaking into calls page phone clicks
    if (phoneElement.closest('#calls-table') || document.getElementById('calls-page') || document.getElementById('calls-table')) {
      // Force company mode and clear any contact fields
      context.contactId = null;
      context.contactName = '';
      context.isCompanyPhone = true;
      
      // Try to get company info from the call record itself
      try {
        const row = phoneElement.closest('tr');
        if (row) {
          // Get company name from the call record
          const companyCell = row.querySelector('.company-link, .company-cell');
          if (companyCell) {
            const companyName = companyCell.textContent?.trim() || companyCell.getAttribute('data-company');
            if (companyName && companyName !== 'N/A') {
              context.company = companyName;
              context.name = companyName;
              context.accountName = companyName;
            }
          }
          
          // Try to get account info if available
          const accountId = row.getAttribute('data-account-id');
          if (accountId) {
            context.accountId = accountId;
          }
          
          // Try to get company logo and location info from call record
          const logoUrl = row.getAttribute('data-logo-url');
          if (logoUrl) {
            context.logoUrl = logoUrl;
          }
          
          const city = row.getAttribute('data-city');
          if (city) {
            context.city = city;
          }
          
          const state = row.getAttribute('data-state');
          if (state) {
            context.state = state;
          }
          
          const domain = row.getAttribute('data-domain');
          if (domain) {
            context.domain = domain;
          }
        }
      } catch(_) {}
      
      // Use only the phone number and any company info from the call record
      context.name = context.company || '';
      context.company = context.company || '';
    }

    // REMOVED: Contact detail page context lookup
    // This was causing contact company info to leak into account detail phone calls

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
      // Task detail page phone elements
      '#task-detail-page .phone-text[data-phone]',
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
          
          // For Contact Detail company phone calls, prioritize company context
          if (element.closest('#contact-detail-view') && element.closest('.info-row[data-field="companyPhone"]')) {
            // This is a company phone on Contact Detail - use company name only
            nameForTitle = attrCompany || '';
          } else {
            // Regular logic for other contexts
          nameForTitle = hasContactId && attrContact ? attrContact : (hasAccountId && attrCompany ? attrCompany : '');
          }
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
