'use strict';

// Account Detail page module
(function () {
  const state = {
    currentAccount: null,
    loaded: false
  };

  const els = {};
  
  // Track event listeners for cleanup
  const eventListeners = [];

  // Set up event delegation for account detail buttons on stable parent
  // This runs once and handles all button clicks regardless of DOM replacement
  function setupEventDelegation() {
    // Only set up once
    if (document._pcAccountDetailDelegated) return;
    
    console.log('[AccountDetail] Setting up event delegation on document');
    
    const delegatedClickHandler = (e) => {
      // Check if click is on "Add to list" button
      const addToListBtn = e.target.closest('#add-account-to-list');
      if (addToListBtn) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[AccountDetail] Add to list clicked via delegation');
        
        // Toggle behavior: close if already open
        if (document.getElementById('account-lists-panel')) {
          closeAccountListsPanel();
        } else {
          openAccountListsPanel();
        }
        return;
      }
      
      // Check if click is on website header button
      const websiteBtn = e.target.closest('.website-header-btn');
      if (websiteBtn) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[AccountDetail] Website button clicked via delegation');
        handleQuickAction('website');
        return;
      }
      
      // Check if click is on LinkedIn header button
      const linkedInBtn = e.target.closest('.linkedin-header-btn');
      if (linkedInBtn) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[AccountDetail] LinkedIn button clicked via delegation');
        handleQuickAction('linkedin');
        return;
      }
    };
    
    // Attach to document with capture phase to catch events early
    document.addEventListener('click', delegatedClickHandler, true);
    eventListeners.push({ type: 'click', handler: delegatedClickHandler, target: document });
    
    document._pcAccountDetailDelegated = true;
    console.log('[AccountDetail] Event delegation set up successfully');
  }
  
  // Initialize event delegation immediately
  setupEventDelegation();

  // ==== Date helpers for Energy & Contract fields ====
  function parseDateFlexible(s){
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      // For ISO dates, parse components to avoid timezone issues
      const parts = str.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
    if (mdy){ 
      // Parse MM/DD/YYYY format directly to avoid timezone issues
      const d = new Date(parseInt(mdy[3],10), parseInt(mdy[1],10)-1, parseInt(mdy[2],10)); 
      return isNaN(d.getTime()) ? null : d; 
    }
    // Fallback Date parse - use local timezone to avoid offset issues
    const d = new Date(str + 'T00:00:00'); return isNaN(d.getTime()) ? null : d;
  }
  function toISODate(v){ const d=parseDateFlexible(v); if(!d) return ''; const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }
  function toMDY(v){ 
    const d=parseDateFlexible(v); 
    if(!d) return v?String(v):''; 
    const mm=String(d.getMonth()+1).padStart(2,'0'); 
    const dd=String(d.getDate()).padStart(2,'0'); 
    const yyyy=d.getFullYear(); 
    const result = `${mm}/${dd}/${yyyy}`;
    return result;
  }
  function formatDateInputAsMDY(raw){
    const digits = String(raw||'').replace(/[^0-9]/g,'').slice(0,8);
    let out = '';
    if (digits.length >= 1) out = digits.slice(0,2);
    if (digits.length >= 3) out = digits.slice(0,2) + '/' + digits.slice(2,4);
    if (digits.length >= 5) out = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4,8);
    return out;
  }

  function initDomRefs() {
    els.page = document.getElementById('account-details-page');
    els.pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    els.mainContent = els.page ? els.page.querySelector('.page-content') : null;
    return !!els.page && !!els.mainContent;
  }

  function showAccountDetail(accountId) {
    // Ensure page exists and navigate to it
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      try { window.crm.navigateToPage('account-details'); } catch (e) { /* noop */ }
    }
    if (!initDomRefs()) return;

    const account = findAccountById(accountId);
    if (!account) {
      console.error('Account not found:', accountId);
      return;
    }

    state.currentAccount = account;
    renderAccountDetail();
    
    // Setup energy update listener for real-time sync with Health Widget
    try {
      if (window.AccountDetail && window.AccountDetail.setupEnergyUpdateListener) {
        window.AccountDetail.setupEnergyUpdateListener();
      }
    } catch (_) {}
  }



  function findAccountById(accountId) {
    // Use prefetched account if provided by navigation source (avoids extra hops)
    try {
      if (window._prefetchedAccountForDetail && window._prefetchedAccountForDetail.id === accountId) {
        const a = window._prefetchedAccountForDetail;
        window._prefetchedAccountForDetail = null; // consume
        return a;
      }
    } catch (_) {}

    if (window.getAccountsData) {
      const accounts = window.getAccountsData();
      return accounts.find(a => a.id === accountId);
    }
    return null;
  }

  function injectSectionHeaderStyles() {
    if (document.getElementById('account-section-header-styles')) return;
    const style = document.createElement('style');
    style.id = 'account-section-header-styles';
    style.textContent = `
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--spacing-md);
      }
      .section-header .section-title {
        margin: 0;
      }
      .add-contact-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--border-radius);
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        color: var(--text-inverse);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .add-contact-btn:hover { 
        background: var(--bg-secondary);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .add-contact-btn:focus-visible {
        outline: 2px solid var(--orange-muted);
        outline-offset: 2px;
      }
      .add-contact-btn svg {
        width: 18px;
        height: 18px;
        display: block;
        pointer-events: none;
      }
      
      /* Contact item hover styling */
      .contact-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: var(--border-radius);
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        cursor: pointer;
        transition: all 0.2s ease;
        margin-bottom: 8px;
      }
      .contact-item:last-child {
        margin-bottom: 0;
      }
      .contact-item:hover {
        background: var(--bg-hover);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .contact-item .contact-avatar {
        flex-shrink: 0;
      }
      .contact-item .contact-info {
        flex: 1;
        min-width: 0;
      }
      .contact-item .contact-name {
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 4px;
      }
      .contact-item .contact-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      
      /* Contact info container for email and phone on same line */
      .contact-item .contact-contact-info {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .contact-item .contact-title,
      .contact-item .contact-email,
      .contact-item .contact-phone {
        font-size: 12px;
        color: var(--text-secondary);
      }
      
      /* Phone number clickable area - match text width */
      .contact-item .contact-phone {
        display: inline-block;
        cursor: pointer;
        transition: color 0.2s ease;
        max-width: fit-content;
        width: auto;
      }
      .contact-item .contact-phone:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      /* Email clickable area - match text width */
      .contact-item .contact-email {
        display: inline-block;
        cursor: pointer;
        transition: color 0.2s ease;
        max-width: fit-content;
        width: auto;
      }
      .contact-item .contact-email:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      /* Contact separator styling */
      .contact-item .contact-separator {
        color: var(--text-secondary);
        font-size: 12px;
        user-select: none;
      }
      
      /* Contacts pagination styling - match accounts page unified pagination */
      .contacts-header-controls {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .contacts-pager {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .contacts-page-btn {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        color: var(--text-secondary);
      }
      .contacts-page-btn:hover:not(:disabled) {
        background: var(--bg-secondary);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        color: var(--text-primary);
      }
      .contacts-page-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .contacts-page-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
      }
      .contacts-page-info {
        width: 40px;
        height: 32px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        color: var(--text-primary);
        font-weight: 600;
        font-size: 0.9rem;
      }
      .contacts-page-info:hover {
        background: var(--bg-secondary);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
    `;
    document.head.appendChild(style);
  }

  // Parent Company Autocomplete Styles
  function injectParentCompanyAutocompleteStyles() {
    if (document.getElementById('parent-company-autocomplete-styles')) return;
    const style = document.createElement('style');
    style.id = 'parent-company-autocomplete-styles';
    style.textContent = `
      .parent-company-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 4px;
        background: var(--bg-card);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        box-shadow: var(--elevation-card);
        max-height: 300px;
        overflow-y: auto;
        z-index: 1000;
      }
      
      .parent-company-dropdown-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        cursor: pointer;
        transition: background 0.2s ease;
        border-bottom: 1px solid var(--border-light);
      }
      
      .parent-company-dropdown-item:last-child {
        border-bottom: none;
      }
      
      .parent-company-dropdown-item:hover {
        background: var(--bg-hover);
      }
      
      .parent-company-dropdown-favicon {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .parent-company-dropdown-favicon img {
        max-width: 32px;
        max-height: 32px;
        object-fit: contain;
      }
      
      .parent-company-dropdown-info {
        flex: 1;
        min-width: 0;
      }
      
      .parent-company-dropdown-name {
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 4px;
      }
      
      .parent-company-dropdown-details {
        font-size: 12px;
        color: var(--text-secondary);
      }
      
      .parent-company-dropdown-empty {
        padding: 12px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  function injectAccountTaskPopoverStyles() {
    if (document.getElementById('account-task-popover-styles')) return;
    const style = document.createElement('style');
    style.id = 'account-task-popover-styles';
    style.textContent = `
      /* Account Detail: Task popover (mirror Contact Detail) */
      .task-popover { position: fixed; z-index: 1300; width: min(520px, 92vw); background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light); border-radius: var(--border-radius); box-shadow: var(--elevation-card); opacity: 0; transform: translateY(-8px); transition: transform 180ms ease, opacity 180ms ease; --arrow-size: 10px; }
      .task-popover.--show { opacity: 1; transform: translateY(0); }

      .task-popover::before,
      .task-popover::after { content: ""; position: absolute; width: var(--arrow-size); height: var(--arrow-size); transform: rotate(45deg); pointer-events: none; }
      .task-popover[data-placement="bottom"]::before { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); top: calc(-1 * var(--arrow-size) / 2 + 1px); background: var(--border-light); }
      .task-popover[data-placement="bottom"]::after  { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); top: calc(-1 * var(--arrow-size) / 2 + 2px); background: var(--bg-card); }
      .task-popover[data-placement="top"]::before    { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); bottom: calc(-1 * var(--arrow-size) / 2 + 1px); background: var(--border-light); }
      .task-popover[data-placement="top"]::after     { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); bottom: calc(-1 * var(--arrow-size) / 2 + 2px); background: var(--bg-card); }

      .task-popover .tp-inner { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .task-popover .tp-header { display: flex; align-items: center; justify-content: space-between; font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--border-light); }
      .task-popover .tp-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; }
      .task-popover .tp-body { display: flex; flex-direction: column; gap: 12px; max-height: min(70vh, 620px); overflow: auto; padding: 8px; }
      .task-popover .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .task-popover label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary); position: relative; }
      .task-popover .input-dark, .task-popover textarea.input-dark { width: 100%; }
      .task-popover .close-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0; background: var(--bg-item); color: var(--grey-300); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); line-height: 1; font-size: 16px; font-weight: 600; cursor: pointer; transition: var(--transition-fast); box-sizing: border-box; }
      .task-popover .close-btn:hover { background: var(--grey-600); color: var(--text-inverse); }

      .dropdown-toggle-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; transition: var(--transition-fast); }
      .dropdown-toggle-btn:hover { background: var(--bg-secondary); border-color: var(--accent-color); transform: translateY(calc(-50% - 1px)); box-shadow: 0 2px 8px rgba(0,0,0,.1); }

      .dropdown-toolbar, .calendar-toolbar { display: none; margin-top: 8px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius); box-shadow: var(--elevation-card); padding: 8px; }
      .dropdown-toolbar .dropdown-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      /* Dropdown Option Styles - Using global styles from main.css */

      .calendar-toolbar header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .calendar-toolbar .month-label { font-weight: 600; }
      .calendar-toolbar .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .calendar-toolbar .calendar-grid button { padding: 6px 0; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; }
      .calendar-toolbar .calendar-grid button.today { border-color: var(--accent-color); }
      .calendar-toolbar .calendar-grid button.selected { background: var(--primary-700); color: #fff; }

      /* Slide animations for dropdowns and calendar */
      .dropdown-slide-in { animation: ddIn 160ms ease forwards; }
      .dropdown-slide-out { animation: ddOut 160ms ease forwards; }
      .calendar-slide-in { animation: calIn 200ms ease forwards; }
      .calendar-slide-out { animation: calOut 200ms ease forwards; }
      @keyframes ddIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes ddOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-6px); } }
      @keyframes calIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes calOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }

      /* Footer list of tasks */
      .tp-footer { margin-top: 4px; border-top: 1px solid var(--border-light); padding-top: 8px; }
      .tp-subtitle { color: var(--text-secondary); font-size: .9rem; margin-bottom: 6px; }
      .tp-task { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid var(--border-dark); }
      .tp-task:first-child { border-top: 0; }
      .tp-task-title { color: var(--text-primary); }
      .tp-badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; text-transform: capitalize; }
      .tp-badge.pending { background: var(--grey-700); color: var(--text-inverse); }
      .tp-badge.completed { background: var(--primary-700); color: #fff; }
      .tp-task-due { color: var(--text-secondary); font-size: 12px; margin-left: 8px; }

      /* Expanded container when calendar is open */
      .task-popover.calendar-expanded { width: min(620px, 94vw); }

      /* Support explicit arrow element (legacy) */
      .task-popover .arrow { position: absolute; width: var(--arrow-size); height: var(--arrow-size); transform: rotate(45deg); background: var(--bg-card); border-left: 1px solid var(--border-light); border-top: 1px solid var(--border-light); display: none; }
      .task-popover[data-placement="bottom"] .arrow { display: block; top: calc(-1 * var(--arrow-size) / 2 + 2px); left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); }
      .task-popover[data-placement="top"] .arrow { display: block; bottom: calc(-1 * var(--arrow-size) / 2 + 2px); left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); }
    `;
    document.head.appendChild(style);
  }

  function injectAccountHeaderStyles() {
    if (document.getElementById('account-detail-header-styles')) return;
    const style = document.createElement('style');
    style.id = 'account-detail-header-styles';
    style.textContent = `
      /* Account Detail: header action divider and alignment */
      #account-detail-header .contact-header-profile { display: inline-flex; align-items: center; gap: var(--spacing-sm); }
      /* Reset margin added globally so spacing is controlled here */
      #account-detail-header .linkedin-header-btn { margin-left: 0; }
      /* Vertical divider between LinkedIn and the List/Sequence group */
      #account-detail-header .header-action-divider {
        width: 1px;
        height: 24px;
        background: var(--border-light);
        opacity: 0.9;
        display: inline-block;
        margin: 0 var(--spacing-sm);
        border-radius: 1px;
      }
      #account-detail-header .list-header-btn svg { display: block; }
      #account-detail-header .list-seq-group { display: inline-flex; align-items: center; gap: var(--spacing-sm); }
    `;
    // Append to head so rules actually apply
    document.head.appendChild(style);
  }

  function renderAccountContacts(account, page = 1, pageSize = 4) {
    if (!account || !window.getPeopleData) {
      return '<div class="contacts-placeholder">No contacts found</div>';
    }

    try {
      const allContacts = window.getPeopleData() || [];
      const accountName = account.accountName || account.name || account.companyName;
      
      // Find contacts associated with this account
      const associatedContacts = allContacts.filter(contact => {
        // Check if contact has accountId matching this account
        if (contact.accountId === account.id) return true;
        
        // Check if contact's company name matches this account name
        const contactCompany = contact.companyName || contact.accountName || '';
        return contactCompany.toLowerCase().trim() === accountName.toLowerCase().trim();
      });

      if (associatedContacts.length === 0) {
        return '<div class="contacts-placeholder">No contacts found for this account</div>';
      }

      // Store all contacts in state for pagination
      state._allContacts = associatedContacts;
      state._contactsPage = page;
      state._contactsPageSize = pageSize;

      // Calculate pagination
      const totalPages = Math.ceil(associatedContacts.length / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pageContacts = associatedContacts.slice(startIndex, endIndex);

      // Don't update pagination here - DOM elements don't exist yet
      // Will be updated after DOM insertion

      return pageContacts.map(contact => {
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
        const title = contact.title || '';
        const email = contact.email || '';
        const phone = contact.workDirectPhone || contact.mobile || contact.otherPhone || '';
        
        return `
          <div class="contact-item" data-contact-id="${contact.id}">
            <div class="contact-avatar">
              <div class="avatar-circle-small">${getInitials(fullName)}</div>
            </div>
            <div class="contact-info">
              <div class="contact-name">${escapeHtml(fullName)}</div>
              <div class="contact-details">
                ${title ? `<div class="contact-title">${escapeHtml(title)}</div>` : ''}
                ${email && phone ? 
                  `<div class="contact-contact-info"><span class="contact-email">${escapeHtml(email)}</span><span class="contact-separator"> • </span><span class="contact-phone" 
                                 data-contact-id="${contact.id}" 
                                 data-account-id="${state.currentAccount?.id || ''}" 
                                 data-contact-name="${escapeHtml(fullName)}" 
                                 data-company-name="${escapeHtml(state.currentAccount?.name || state.currentAccount?.accountName || '')}">${escapeHtml(phone)}</span></div>` :
                  email ? `<div class="contact-contact-info"><span class="contact-email">${escapeHtml(email)}</span></div>` :
                  phone ? `<div class="contact-contact-info"><span class="contact-phone" 
                                 data-contact-id="${contact.id}" 
                                 data-account-id="${state.currentAccount?.id || ''}" 
                                 data-contact-name="${escapeHtml(fullName)}" 
                                 data-company-name="${escapeHtml(state.currentAccount?.name || state.currentAccount?.accountName || '')}">${escapeHtml(phone)}</span></div>` : ''
                }
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Error rendering account contacts:', error);
      return '<div class="contacts-placeholder">Error loading contacts</div>';
    }
  }

  function updateContactsPagination(currentPage, totalPages) {
    const pager = document.getElementById('contacts-pager');
    const prevBtn = document.getElementById('contacts-prev');
    const nextBtn = document.getElementById('contacts-next');
    const infoEl = document.getElementById('contacts-info');

    if (!pager || !prevBtn || !nextBtn || !infoEl) return;

    // Show pagination if there are more than 4 contacts
    if (totalPages > 1) {
      pager.style.display = 'flex';
    } else {
      pager.style.display = 'none';
      return;
    }

    // Update page info - show just the current page number
    infoEl.textContent = currentPage.toString();

    // Update button states
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  function bindContactsPagination() {
    const prevBtn = document.getElementById('contacts-prev');
    const nextBtn = document.getElementById('contacts-next');

    if (prevBtn && !prevBtn._bound) {
      prevBtn.addEventListener('click', () => {
        if (state._contactsPage > 1) {
          const newPage = state._contactsPage - 1;
          const contactsList = document.getElementById('account-contacts-list');
          if (contactsList && state.currentAccount) {
            contactsList.innerHTML = renderAccountContacts(state.currentAccount, newPage, state._contactsPageSize);
            bindContactItemEvents();
            // Update pagination controls after page change
            const totalPages = Math.ceil((state._allContacts || []).length / state._contactsPageSize);
            updateContactsPagination(newPage, totalPages);
          }
        }
      });
      prevBtn._bound = true;
    }

    if (nextBtn && !nextBtn._bound) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil((state._allContacts || []).length / state._contactsPageSize);
        if (state._contactsPage < totalPages) {
          const newPage = state._contactsPage + 1;
          const contactsList = document.getElementById('account-contacts-list');
          if (contactsList && state.currentAccount) {
            contactsList.innerHTML = renderAccountContacts(state.currentAccount, newPage, state._contactsPageSize);
            bindContactItemEvents();
            // Update pagination controls after page change
            updateContactsPagination(newPage, totalPages);
          }
        }
      });
      nextBtn._bound = true;
    }
  }

  function findMostRelevantContactForAccount(accountId) {
    if (!accountId || typeof window.getPeopleData !== 'function') return null;
    
    try {
      const people = window.getPeopleData() || [];
      const accountContacts = people.filter(p => 
        p.accountId === accountId || 
        p.account_id === accountId || 
        p.companyId === accountId ||
        p.company_id === accountId
      );
      
      if (accountContacts.length === 0) return null;
      
      // Sort by most recent activity (if available) or by name
      accountContacts.sort((a, b) => {
        // Prefer contacts with recent activity
        const aActivity = a.lastActivity || a.updatedAt || a.createdAt || 0;
        const bActivity = b.lastActivity || b.updatedAt || b.createdAt || 0;
        if (aActivity !== bActivity) return bActivity - aActivity;
        
        // Fallback to alphabetical by name
        const aName = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || '';
        const bName = [b.firstName, b.lastName].filter(Boolean).join(' ') || b.name || '';
        return aName.localeCompare(bName);
      });
      
      return accountContacts[0];
    } catch (error) {
      console.warn('[Account Detail] Error finding most relevant contact:', error);
      return null;
    }
  }

  function renderAccountDetail() {
    if (!state.currentAccount || !els.mainContent) return;
    
    // Inject header styles for divider and button layout
    injectAccountHeaderStyles();
    
    // Inject section header styles if not already present
    injectSectionHeaderStyles();

    const a = state.currentAccount;
    // Normalize commonly used fields on the in-memory account object so downstream handlers
    // (including click-to-call) always find what they need without relying on optional fallbacks
    try {
      if (a && !a.logoUrl && a.iconUrl) a.logoUrl = a.iconUrl;
    } catch (_) {}
    try {
      if (a && !a.domain) {
        const src = a.website || a.site || '';
        if (src) {
          try {
            const u = new URL(/^https?:\/\//i.test(src) ? src : `https://${src}`);
            a.domain = (u.hostname || '').replace(/^www\./i, '');
          } catch (_) {
            a.domain = String(src).replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
          }
        }
      }
    } catch (_) {}
    
    // Find the most relevant contact for this account (for company phone context)
    const mostRelevantContact = findMostRelevantContactForAccount(a.id || a.accountId || a._id);
    const name = a.accountName || a.name || a.companyName || 'Unknown Account';
    const industry = a.industry || '';
    const domain = a.domain || a.website || a.site || '';
    const website = a.website || a.site || (domain ? (domain.startsWith('http') ? domain : ('https://' + domain)) : '');
    const phone = a.companyPhone || a.phone || a.primaryPhone || a.mainPhone || '';
    const city = a.city || a.locationCity || '';
    const stateVal = a.state || a.locationState || '';
    const linkedin = a.linkedin || a.linkedinUrl || a.linkedin_url || '';
    const electricitySupplier = a.electricitySupplier || '';
    const annualUsage = a.annualUsage || a.annual_usage || '';
    const currentRate = a.currentRate || a.current_rate || '';
    const contractEndDate = a.contractEndDate || a.contract_end_date || '';
    const contractEndDateFormatted = contractEndDate ? toMDY(contractEndDate) : '';
    const sqft = a.squareFootage ?? a.sqft ?? a.square_feet ?? '';
    const occupancy = a.occupancyPct ?? a.occupancy ?? a.occupancy_percentage ?? '';
    const employees = a.employees ?? a.employeeCount ?? a.numEmployees ?? '';
    const shortDesc = a.shortDescription || a.short_desc || a.descriptionShort || '';

    // Derive a clean domain for favicon usage
    const favDomain = (function(d) {
      if (!d) return '';
      let s = String(d).trim();
      try {
        if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
        const u = new URL(s);
        return (u.hostname || '').replace(/^www\./i, '');
      } catch (e) {
        return s.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
      }
    })(domain);

    const headerHtml = `
      <div id="account-detail-header" class="page-header">
        <div class="page-title-section">
          <div class="contact-header-info">
            <button class="back-btn back-btn--icon" id="back-to-accounts" aria-label="Back to Accounts" title="Back to Accounts">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="contact-header-profile">
              ${(window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML==='function') ? window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: a.logoUrl, domain: favDomain, size: 64 }) : (favDomain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(favDomain, 64) : '') : '')}
              <div class="avatar-circle-small" style="${favDomain ? 'display:none;' : ''}">${escapeHtml(getInitials(name))}</div>
              <div class="contact-header-text">
                <div class="contact-title-row">
                  <h2 class="page-title contact-page-title" id="account-name">${escapeHtml(name)}</h2>
                  <div class="title-actions" aria-hidden="true">
                    <button type="button" class="icon-btn-sm title-edit" title="Edit account">${editIcon()}</button>
                    <button type="button" class="icon-btn-sm title-copy" title="Copy name">${copyIcon()}</button>
                    <button type="button" class="icon-btn-sm title-clear" title="Clear name">${trashIcon()}</button>
                  </div>
                </div>
                <div class="contact-subtitle">${industry ? escapeHtml(industry) : ''}</div>
              </div>
              <button class="quick-action-btn website-header-btn" data-action="website" title="Visit website" aria-label="Visit website">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </button>
              <button class="quick-action-btn linkedin-header-btn" data-action="linkedin">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                  <rect x="2" y="9" width="4" height="12"/>
                  <circle cx="4" cy="4" r="2"/>
                </svg>
              </button>
              <span class="header-action-divider" aria-hidden="true"></span>
              <div class="list-seq-group">
                <button class="quick-action-btn list-header-btn" id="add-account-to-list" title="Add to list" aria-label="Add to list" aria-haspopup="dialog">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="4" cy="6" r="1"></circle>
                    <circle cx="4" cy="12" r="1"></circle>
                    <circle cx="4" cy="18" r="1"></circle>
                    <line x1="8" y1="6" x2="20" y2="6"></line>
                    <line x1="8" y1="12" x2="20" y2="12"></line>
                    <line x1="8" y1="18" x2="20" y2="18"></line>
                  </svg>
                </button>
                <button class="quick-action-btn list-header-btn" id="open-account-task-popover" title="Tasks" aria-label="Tasks" aria-haspopup="dialog">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polyline points="9,11 12,14 22,4"></polyline>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
              </button>
              </div>
            </div>
          </div>
          <div class="page-actions">
            <div class="widgets-wrap">
              <button class="btn-primary" id="open-widgets" title="Widgets" aria-label="Widgets" aria-haspopup="menu" aria-expanded="false" aria-controls="widgets-drawer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="3" width="6" height="6"/>
                  <rect x="15" y="3" width="6" height="6"/>
                  <rect x="3" y="15" width="6" height="6"/>
                  <rect x="15" y="15" width="6" height="6"/>
                </svg>
              </button>
              <div id="widgets-drawer" class="widgets-drawer" role="menu" aria-label="Account widgets">
                <button type="button" class="widget-item" data-widget="lusha" title="Prospect" aria-label="Prospect">
                  <svg width="16" height="16" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
                    <path d="M46.117,23.081l-0.995-0.04H45.12C34.243,22.613,25.387,13.757,24.959,2.88l-0.04-0.996	C24.9,1.39,24.494,1,24,1s-0.9,0.39-0.919,0.883l-0.04,0.996c-0.429,10.877-9.285,19.733-20.163,20.162l-0.995,0.04	C1.39,23.1,1,23.506,1,24s0.39,0.9,0.884,0.919l0.995,0.039c10.877,0.43,19.733,9.286,20.162,20.163l0.04,0.996	C23.1,46.61,23.506,47,24,47s0.9-0.39,0.919-0.883l0.04-0.996c0.429-10.877,9.285-19.733,20.162-20.163l0.995-0.039	C46.61,24.9,47,24.494,47,24S46.61,23.1,46.117,23.081z"/>
                  </svg>
                </button>
                <button type="button" class="widget-item" data-widget="maps" title="Google Maps" aria-label="Google Maps">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </button>
                <button type="button" class="widget-item" data-widget="health" title="Energy Health Check" aria-label="Energy Health Check">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </button>
                <button type="button" class="widget-item" data-widget="deal" title="Deal Calculator" aria-label="Deal Calculator">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </button>
                <button type="button" class="widget-item" data-widget="notes" title="Notes" aria-label="Notes">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M4 4h12a2 2 0 0 1 2 2v10l-4 4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                    <path d="M14 20v-4a2 2 0 0 1 2-2h4"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const bodyHtml = `
      <div id="account-detail-view" class="contact-detail">
        <div class="contact-info-section">
          <h3 class="section-title">Account Information</h3>
          <div class="info-grid">
            <div class="info-row"><div class="info-label">WEBSITE</div><div class="info-value-wrap" data-field="website"><span class="info-value-text">${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(website)}</a>` : '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">COMPANY PHONE</div><div class="info-value-wrap" data-field="companyPhone"><span class="info-value-text" 
                                 data-account-id="${a.id || a.accountId || a._id || ''}" 
                                 data-account-name="${escapeHtml(a.name || a.accountName || a.companyName || '')}" 
                                 data-company-name="${escapeHtml(a.name || a.accountName || a.companyName || '')}"
                                 data-contact-id=""
                                 data-contact-name=""
                                 data-city="${escapeHtml(city)}"
                                 data-state="${escapeHtml(stateVal)}"
                                 data-domain="${escapeHtml(domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))}"
                                 data-logo-url="${escapeHtml(a.logoUrl || '')}">${escapeHtml(phone) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CITY</div><div class="info-value-wrap" data-field="city"><span class="info-value-text">${escapeHtml(city) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">STATE</div><div class="info-value-wrap" data-field="state"><span class="info-value-text">${escapeHtml(stateVal) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">INDUSTRY</div><div class="info-value-wrap" data-field="industry"><span class="info-value-text">${escapeHtml(industry) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">SQ FT</div><div class="info-value-wrap" data-field="squareFootage"><span class="info-value-text">${escapeHtml(String(sqft || '--'))}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">OCCUPANCY %</div><div class="info-value-wrap" data-field="occupancyPct"><span class="info-value-text">${escapeHtml(String(occupancy || '--'))}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">EMPLOYEES</div><div class="info-value-wrap" data-field="employees"><span class="info-value-text">${escapeHtml(String(employees || '--'))}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">LINKEDIN</div><div class="info-value-wrap" data-field="linkedin"><span class="info-value-text">${linkedin ? `<a href="${escapeHtml(linkedin)}" target="_blank" rel="noopener">${escapeHtml(linkedin)}</a>` : '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row info-row--full"><div class="info-label">SHORT DESCRIPTION</div><div class="info-value-wrap info-value-wrap--multiline" data-field="shortDescription"><span class="info-value-text info-value-text--multiline">${escapeHtml(shortDesc) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
          </div>
        </div>

        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid" id="account-energy-grid">
            <div class="info-row"><div class="info-label">ELECTRICITY SUPPLIER</div><div class="info-value-wrap" data-field="electricitySupplier"><span class="info-value-text">${escapeHtml(electricitySupplier) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">ANNUAL USAGE</div><div class="info-value-wrap" data-field="annualUsage"><span class="info-value-text">${annualUsage ? escapeHtml(String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CURRENT RATE ($/kWh)</div><div class="info-value-wrap" data-field="currentRate"><span class="info-value-text">${escapeHtml(currentRate) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CONTRACT END DATE</div><div class="info-value-wrap" data-field="contractEndDate"><span class="info-value-text">${escapeHtml(contractEndDateFormatted) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
          </div>
        </div>

        <div class="contact-info-section">
          <h3 class="section-title">Service Addresses</h3>
          <div class="info-grid" id="account-service-addresses-grid">
            ${(a.serviceAddresses && Array.isArray(a.serviceAddresses) && a.serviceAddresses.length > 0) ? a.serviceAddresses.map((sa, idx) => `
              <div class="info-row"><div class="info-label">${sa.isPrimary ? 'PRIMARY ADDRESS' : 'SERVICE ADDRESS'}</div><div class="info-value-wrap" data-field="serviceAddress_${idx}" data-address-index="${idx}"><span class="info-value-text">${escapeHtml(sa.address) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            `).join('') : ''}
            <div class="info-row">
              <div class="info-label"></div>
              <div class="info-value-wrap">
                <button class="btn-text" id="add-service-address" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Service Address
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="contact-info-section" id="account-recent-calls">
          <div class="rc-header">
            <h3 class="section-title">Recent Calls</h3>
            <div class="rc-pager" id="account-rc-pager" style="display:none">
              <button class="rc-page-btn" id="arc-prev" aria-label="Previous page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
              </button>
              <div class="rc-page-info" id="arc-info">1 of 1</div>
              <button class="rc-page-btn" id="arc-next" aria-label="Next page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
              </button>
            </div>
          </div>
          <div class="rc-list" id="account-recent-calls-list">
            <div class="rc-empty">Loading recent calls…</div>
          </div>
        </div>

        <div class="contact-info-section">
          <div class="section-header">
            <h3 class="section-title">Contacts</h3>
            <div class="contacts-header-controls">
              <div class="contacts-pager" id="contacts-pager" style="display:none">
                <button class="contacts-page-btn" id="contacts-prev" aria-label="Previous page">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
                </button>
                <div class="contacts-page-info" id="contacts-info">1</div>
                <button class="contacts-page-btn" id="contacts-next" aria-label="Next page">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
                </button>
              </div>
              <button class="widget-item add-contact-btn" id="add-contact-to-account" title="Add Contact" aria-label="Add Contact">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="contacts-list" id="account-contacts-list">
            ${renderAccountContacts(a)}
          </div>
        </div>

        ${(() => {
          // Check for parent company
          if (a.parentCompanyId) {
            const parentAccount = getParentCompany(a.parentCompanyId);
            if (parentAccount) {
              return renderParentCompanySection(parentAccount);
            }
          }
          
          // Check for subsidiaries
          const subsidiaries = getSubsidiaries(a.id);
          if (subsidiaries && subsidiaries.length > 0) {
            return renderSubsidiariesSection(subsidiaries);
          }
          
          // No parent or subsidiaries
          return '';
        })()}

        <div class="contact-activity-section">
          <div class="activity-header">
            <h3 class="section-title">Recent Activity</h3>
            <button class="btn-text" id="view-all-account-activity">View All</button>
          </div>
          <div class="activity-timeline" id="account-activity-timeline">
            <div class="activity-placeholder">
              <div class="placeholder-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6"/>
                </svg>
              </div>
              <div class="placeholder-text">No recent activity</div>
            </div>
          </div>
          <div class="activity-pagination" id="account-activity-pagination" style="display: none;">
            <button class="activity-pagination-btn" id="account-activity-prev" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </button>
            <div class="activity-pagination-info" id="account-activity-info">1 of 1</div>
            <button class="activity-pagination-btn" id="account-activity-next" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;

    // Clear and insert
    const existingHeader = document.getElementById('account-detail-header');
    if (existingHeader) existingHeader.remove();
    const existingView = document.getElementById('account-detail-view');
    if (existingView) existingView.remove();

    const headerWrap = document.createElement('div');
    headerWrap.innerHTML = headerHtml;
    const bodyWrap = document.createElement('div');
    bodyWrap.innerHTML = bodyHtml;

    const pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    const pageHeader = pageContainer ? pageContainer.querySelector('.page-header') : null;
    const headerEl = headerWrap.firstElementChild;
    if (pageHeader && headerEl && pageHeader.parentElement) {
      pageHeader.replaceWith(headerEl);
    } else if (pageContainer && headerEl) {
      pageContainer.prepend(headerEl);
    }

    const bodyEl = bodyWrap.firstElementChild;
    if (els.mainContent && bodyEl) {
      els.mainContent.innerHTML = '';
      els.mainContent.appendChild(bodyEl);
    }

    attachAccountDetailEvents();
    startAccountRecentCallsLiveHooks();
    
    // Update contacts pagination after DOM is inserted
    if (state._allContacts && state._allContacts.length > 4) {
      const totalPages = Math.ceil(state._allContacts.length / state._contactsPageSize);
      updateContactsPagination(state._contactsPage, totalPages);
    }
    
          // Add periodic refresh to ensure eye icons update when recordings are ready
          let refreshInterval = null;
          let lastRefreshTime = 0;
          const startPeriodicRefresh = () => {
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(() => {
              // Only refresh if we're not already refreshing, not scrolling, no insights are open, and enough time has passed
              const hasOpenInsights = state._arcOpenIds && state._arcOpenIds.size > 0;
              const now = Date.now();
              const timeSinceLastRefresh = now - lastRefreshTime;
              
              if (!state._arcReloadInFlight && !state._isScrolling && !hasOpenInsights && timeSinceLastRefresh >= 60000) {
                lastRefreshTime = now;
                loadRecentCallsForAccount();
              }
            }, 60000); // Check every 60 seconds
          };
    
    // Start periodic refresh
    startPeriodicRefresh();
    
    // Cleanup interval when page is unloaded
    window.addEventListener('beforeunload', () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    });
    
    try { window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); } catch (_) { /* noop */ }
    
    // Load activities
    loadAccountActivities();
    // Load account recent calls and styles
    try { injectRecentCallsStyles(); loadRecentCallsForAccount(); } catch (_) { /* noop */ }
    
    // DEBUG: Add test function to manually trigger Conversational Intelligence
    window.testConversationalIntelligence = async function(callSid) {
      try {
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
        const response = await fetch(base + '/api/twilio/conversational-intelligence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: callSid })
        });
        const result = await response.json();
        return result;
      } catch (error) {
        console.error('[DEBUG] Conversational Intelligence error:', error);
        return { error: error.message };
      }
    };
  }

  // ===== Recent Calls (Account) =====
  function injectRecentCallsStyles(){
    if (document.getElementById('recent-calls-styles')) return;
    const style = document.createElement('style');
    style.id = 'recent-calls-styles';
    style.textContent = `
      /* Performance: promote and isolate page-content to reduce jank during live updates */
      #account-details-page .page-content {
        will-change: transform;
        transform: translateZ(0);
        backface-visibility: hidden;
        contain: paint layout;
        overflow-anchor: none;
      }
      .rc-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: var(--spacing-md); }
      .rc-pager { display:flex; align-items:center; gap:8px; }
      .rc-page-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:var(--bg-card); color:var(--text-primary); border:1px solid var(--border-light); }
      .rc-page-btn:hover { 
        background: var(--bg-hover);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .rc-page-info { min-width: 44px; text-align:center; color: var(--text-secondary); font-size: 12px; }
      .rc-list { transition: height 220ms ease, opacity 220ms ease; position: relative; display:flex; flex-direction:column; gap:8px; }
      .rc-empty { color: var(--text-secondary); font-size: 12px; padding: 6px 0; }
      .rc-item { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border:1px solid var(--border-light); border-radius: var(--border-radius); background: var(--bg-item); }
      .rc-item.rc-new { animation: rcNewIn 220ms ease-out both; }
      @keyframes rcNewIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .rc-meta { display:flex; align-items:center; gap:10px; min-width:0; }
      .rc-title { font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .rc-sub { color:var(--text-secondary); font-size:12px; white-space:nowrap; }
      .rc-outcome { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--border-light); background:var(--bg-card); color:var(--text-secondary); }
      .rc-actions { display:flex; align-items:center; gap:8px; }
      .rc-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:var(--bg-card); color:var(--text-primary); border:1px solid var(--border-light); }
      .rc-icon-btn:hover { 
        background: var(--bg-hover);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .rc-icon-btn.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
      .rc-icon-btn.disabled:hover { background: var(--bg-card); border-color: var(--border-light); transform: none; box-shadow: none; }
      /* Live call duration indicator */
      .rc-item.live-call .rc-duration { color: var(--text-secondary); font-weight: 400; }
      /* Inline details under item */
      .rc-details { overflow:hidden; border:1px solid var(--border-light); border-radius: var(--border-radius); background: var(--bg-card); margin: 6px 2px 2px 2px; box-shadow: var(--elevation-card); }
      .rc-details-inner { padding: 12px; }
      .rc-details.expanding, .rc-details.collapsing { will-change: height, opacity; }
      .rc-details.expanding { animation: rcExpand 180ms ease-out forwards; }
      .rc-details.collapsing { animation: rcCollapse 140ms ease-in forwards; }
      @keyframes rcExpand { from { opacity: .0; } to { opacity: 1; } }
      @keyframes rcCollapse { from { opacity: 1; } to { opacity: .0; } }
      .insights-grid { display:grid; grid-template-columns: 2fr 1fr; gap:14px; }
      @media (max-width: 960px){ .insights-grid{ grid-template-columns:1fr; } }
      .ip-card { background: var(--bg-item); border:1px solid var(--border-light); border-radius: 10px; padding: 12px; }
      .ip-card h4 { margin:0 0 8px 0; font-size:13px; font-weight:600; color:var(--text-primary); display:flex; align-items:center; gap:8px; }
      .pc-chips { display:flex; flex-wrap:wrap; gap:8px; }
      .pc-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 8px; border-radius:999px; border:1px solid var(--border-light); background:var(--bg-card); font-size:12px; color:var(--text-secondary); }
      .pc-chip.ok{ background:rgba(16,185,129,.15); border-color:rgba(16,185,129,.25); color:#16c088 }
      .pc-chip.warn{ background:rgba(234,179,8,.15); border-color:rgba(234,179,8,.25); color:#eab308 }
      .pc-chip.danger{ background:rgba(239,68,68,.15); border-color:rgba(239,68,68,.25); color:#ef4444 }
      .pc-chip.info{ background:rgba(59,130,246,.13); border-color:rgba(59,130,246,.25); color:#60a5fa }
      .pc-kv{ display:grid; grid-template-columns:160px 1fr; gap:8px 12px; }
      .pc-kv .k{ color:var(--text-secondary); font-size:12px }
      .pc-kv .v{ color:var(--text-primary); font-size:12px }
      /* Modern 2025 Transcript Styling */
      .pc-transcript-container { background: var(--bg-card); border:1px solid var(--border-light); border-radius: 14px; padding:14px; max-height:320px; overflow:auto; }
      .transcript-message { display:flex; gap:10px; margin-bottom:12px; align-items:flex-start; }
      .transcript-message:last-child { margin-bottom:0; }
      .transcript-avatar { flex-shrink:0; }
      .transcript-avatar-circle { width: 32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:12px; letter-spacing:.5px; }
      .transcript-avatar-circle.agent-avatar { background: var(--orange-subtle); color:#fff; }
      .transcript-avatar-circle.contact-avatar { background: var(--orange-subtle); color:#fff; }
      .transcript-avatar-circle.company-avatar { background: transparent; padding:0; }
      .transcript-avatar-circle.company-avatar img { width:100%; height:100%; object-fit:cover; }
      .transcript-avatar-circle .company-favicon-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); background: transparent; }
      .transcript-content { flex:1; min-width:0; border:1px solid var(--border-light); border-radius:10px; padding:10px 12px; background: var(--bg-item); }
      .transcript-message.customer .transcript-content { background: var(--bg-card); }
      .transcript-header { display:flex; align-items:center; gap:8px; margin-bottom:2px; }
      .transcript-speaker { font-weight:600; font-size:12px; color:var(--text-primary); }
      .transcript-time { font-size:11px; color:var(--text-secondary); }
      .transcript-text { font-size:13px; line-height:1.5; color:var(--text-primary); word-wrap:break-word; }
      /* Activity items spacing for account detail */
      #account-detail-view .activity-item { margin-bottom: 12px; }
      #account-detail-view .activity-item:last-child { margin-bottom: 0; }
    `;
    document.head.appendChild(style);
  }

  // Live refresh: refresh Account Recent Calls on call start/end
  let _arcRetryTimer = null;
  function startAccountRecentCallsLiveHooks(){
    try {
      if (document._arcLiveHooksBound) return;
      document.addEventListener('callStarted', onAnyAccountCallActivity, false);
      document.addEventListener('callEnded', onAnyAccountCallActivity, false);
      document.addEventListener('pc:recent-calls-refresh', onAnyAccountCallActivity, false);
      document.addEventListener('pc:live-call-duration', onLiveCallDurationUpdate, false);
      
      // Listen for call updates to refresh recent calls
      document.addEventListener('pc:call-updated', (event) => {
        const callData = event.detail;
        if (callData && callData.accountId === state.currentAccount?.id) {
          // Use debounced refresh to prevent freeze
          onAnyAccountCallActivity();
        }
      });
      
      // Listen for new calls
      document.addEventListener('pc:call-created', (event) => {
        const callData = event.detail;
        if (callData && callData.accountId === state.currentAccount?.id) {
          // Use debounced refresh to prevent freeze
          onAnyAccountCallActivity();
        }
      });
      
      // Listen for completed calls to refresh recent calls
      document.addEventListener('pc:call-completed', (event) => {
        const callData = event.detail;
        if (callData && callData.accountId === state.currentAccount?.id) {
          // Use debounced refresh to prevent freeze
          onAnyAccountCallActivity();
        }
      });
      // Track scrolling state to avoid animations/jank during scroll
      try {
        if (els.mainContent && !els.mainContent._scrollBound) {
          const sc = els.mainContent;
          let scrollRafId = null;
          sc.addEventListener('scroll', () => {
            state._isScrolling = true;
            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            scrollRafId = requestAnimationFrame(() => {
              clearTimeout(state._scrollTimer);
              state._scrollTimer = setTimeout(() => {
                state._isScrolling = false;
                if (state._arcPendingRefresh) {
                  state._arcPendingRefresh = false;
                  // Run a single deferred refresh
                  try { safeReloadAccountRecentCallsWithRetries(); } catch(_) {}
                }
              }, 180);
            });
          }, { passive: true });
          els.mainContent._scrollBound = '1';
        }
      } catch(_) {}
      document._arcLiveHooksBound = true;
    } catch(_) {}
  }
  function onAnyAccountCallActivity(){
    // Optimized cleanup: only clean up if we have many entries to reduce overhead
    try {
      if (state._liveCallDurations && state._liveCallDurations.size > 10) {
        const now = Date.now();
        const toDelete = [];
        for (const [callSid, data] of state._liveCallDurations.entries()) {
          if (now - data.timestamp > 30000) {
            toDelete.push(callSid);
          }
        }
        // Batch delete to reduce Map operations
        toDelete.forEach(sid => state._liveCallDurations.delete(sid));
      }
    } catch(_) {}
    
    // [OPTIMIZATION] Debounce refresh to prevent freeze on hangup
    // Cancel any pending refresh and schedule a new one
    if (state._arcRefreshDebounceTimer) {
      clearTimeout(state._arcRefreshDebounceTimer);
    }
    
    // [OPTIMIZATION] Only refresh if this page is visible
    const accountPage = document.getElementById('account-details-page');
    const isVisible = accountPage && accountPage.style.display !== 'none' && !accountPage.hidden;
    
    if (!isVisible) {
      console.debug('[Account Detail] Page not visible, skipping refresh to prevent freeze');
      return;
    }
    
    // If user is viewing any details panels, avoid showing loading overlay; refresh silently
    try {
      const list = document.getElementById('account-recent-calls-list');
      const hasOpen = (state._arcOpenIds && state._arcOpenIds.size > 0);
      if (list && !hasOpen) arcSetLoading(list);
    } catch(_) {}
    
    // Debounce refresh by 1.5 seconds to allow:
    // 1. User to continue working without UI freeze
    // 2. Webhooks to update call data
    // 3. Multiple rapid events to be collapsed into one refresh
    state._arcRefreshDebounceTimer = setTimeout(() => {
      safeReloadAccountRecentCallsWithRetries();
      state._arcRefreshDebounceTimer = null;
    }, 1500); // 1.5 second debounce (increased from 1s to prevent freeze)
  }
  
  function onLiveCallDurationUpdate(e) {
    try {
      const { callSid, duration, durationFormatted } = e.detail || {};
      if (!callSid || !durationFormatted) return;
      
      // Store the live duration for this call to prevent overwriting
      if (!state._liveCallDurations) state._liveCallDurations = new Map();
      state._liveCallDurations.set(callSid, { duration, durationFormatted, timestamp: Date.now() });
      
      // Cache the list element to avoid repeated DOM queries
      if (!state._cachedRecentCallsList) {
        state._cachedRecentCallsList = document.getElementById('account-recent-calls-list');
      }
      const list = state._cachedRecentCallsList;
      if (!list) return;
      
      // Look for a call row that matches this call SID
      const callRows = list.querySelectorAll('.rc-item');
      for (const row of callRows) {
        const insightsBtn = row.querySelector('.rc-insights');
        if (insightsBtn) {
          const rowCallId = insightsBtn.getAttribute('data-id');
          if (rowCallId === callSid) {
            // Update the duration display in this row
            const durationSpan = row.querySelector('.rc-duration');
            if (durationSpan) {
              durationSpan.textContent = durationFormatted;
              // Add a visual indicator that this is a live call
              row.classList.add('live-call');
            }
            break;
          }
        }
      }
    } catch(_) {}
  }
  function safeReloadAccountRecentCallsWithRetries(){
    try { if (_arcRetryTimer) { clearTimeout(_arcRetryTimer); _arcRetryTimer = null; } } catch(_) {}
    if (state._arcReloadInFlight) { return; }
    state._arcReloadInFlight = true;
    let attempts = 0;
    const run = () => {
      attempts++;
      try { loadRecentCallsForAccount(); } catch(_) {}
      if (attempts < 10) { _arcRetryTimer = setTimeout(run, 900); }
      else { state._arcReloadInFlight = false; }
    };
    run();
  }

  // Avatar helpers (reuse calls page patterns)
  function ad_getAgentAvatar(){ return `<div class=\"transcript-avatar-circle agent-avatar\" aria-hidden=\"true\">Y</div>`; }
  function ad_getContactAvatar(contactName, call){
    const domain = ad_extractDomainFromAccount(call && (call.accountName || ''));
    if (domain){
      const fb = (typeof window.__pcAccountsIcon === 'function') ? window.__pcAccountsIcon() : '<span class=\"company-favicon\" aria-hidden=\"true\" style=\"display:inline-block;width:16px;height:16px;\"></span>';
      return `<div class=\"transcript-avatar-circle company-avatar\" aria-hidden=\"true\">${window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(domain, 64) : fb}</div>`;
    }
    const initial = (String(contactName||'C').charAt(0) || 'C').toUpperCase();
    return `<div class=\"transcript-avatar-circle contact-avatar\" aria-hidden=\"true\">${initial}</div>`;
  }
  function ad_extractDomainFromAccount(name){ if(!name) return ''; try{ const key=String(name).trim().toLowerCase(); if(typeof window.getAccountsData==='function'){ const accounts=window.getAccountsData()||[]; const hit=accounts.find(a=>String(a.name||a.accountName||'').trim().toLowerCase()===key); const dom=hit&&(hit.domain||hit.website||''); if(dom) return String(dom).replace(/^https?:\/\//,'').replace(/\/$/,''); } }catch(_){} return ''; }
  function ad_normalizeSupplierTokens(s){ try{ if(!s) return ''; let out=String(s); out=out.replace(/\bT\s*X\s*U\b/gi,'TXU'); out=out.replace(/\bN\s*R\s*G\b/gi,'NRG'); out=out.replace(/\breliant\b/gi,'Reliant'); return out; }catch(_){ return s||''; } }

  async function loadRecentCallsForAccount(){
    const list = document.getElementById('account-recent-calls-list');
    if (!list || !state.currentAccount) return;
    // Show spinner and animate container while loading
    try { arcSetLoading(list); } catch(_) {}
    const accountId = state.currentAccount.id;
    const accountPhone10 = String(state.currentAccount.companyPhone || state.currentAccount.phone || state.currentAccount.primaryPhone || state.currentAccount.mainPhone || '').replace(/\D/g,'').slice(-10);
    const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
    
    // Loading calls for account
    // If user is actively scrolling, defer refresh to avoid jank
    if (state._isScrolling) {
      try { state._arcPendingRefresh = true; } catch(_) {}
      return;
    }
    
    try {
      const r = await fetch(`${base}/api/calls`);
      const j = await r.json().catch(()=>({}));
      const calls = (j && j.ok && Array.isArray(j.calls)) ? j.calls : [];
      
      // Raw calls loaded from API
      
      // Build contact set and all known numbers for this account (contacts + company)
      const norm10 = (s) => String(s||'').replace(/\D/g,'').slice(-10);
      const contactIds = new Set();
      const accountNumbers = new Set();
      if (accountPhone10) accountNumbers.add(accountPhone10);
      try {
        if (typeof window.getPeopleData === 'function') {
          const all = window.getPeopleData() || [];
          const acc = state.currentAccount || {};
          const accName = String(acc.accountName || acc.name || acc.companyName || '').toLowerCase().trim();
          const normalized = (s) => String(s||'').toLowerCase().trim();
          const related = all.filter(p => (
            (p.accountId && String(p.accountId) === String(accountId)) ||
            (normalized(p.companyName || p.accountName) === accName)
          ));
          related.forEach(p => {
            if (p.id) contactIds.add(String(p.id));
            [p.mobile, p.workDirectPhone, p.otherPhone].forEach(n => { const d = norm10(n); if (d) accountNumbers.add(d); });
          });
        }
      } catch(_) {}

      // Account phone numbers and contact IDs collected for filtering

      let filtered = calls.filter(c => {
        const matchByAccountId = c.accountId && String(c.accountId) === String(accountId);
        const matchByContactId = c.contactId && contactIds.has(String(c.contactId));
        const to10 = norm10(c.to);
        const from10 = norm10(c.from);
        const matchByToPhone = to10 && accountNumbers.has(to10);
        const matchByFromPhone = from10 && accountNumbers.has(from10);
        const callAcc = String(c.accountName||'').toLowerCase().trim();
        const thisAcc = String(state.currentAccount?.accountName || state.currentAccount?.name || '').toLowerCase().trim();
        const matchByAccountName = thisAcc && callAcc && callAcc === thisAcc;
        
        // Additional matching: check if call was made to/from company phone even if not explicitly linked
        const targetPhone = norm10(c.targetPhone);
        const matchByTargetPhone = targetPhone && accountNumbers.has(targetPhone);
        
        const shouldInclude = matchByAccountId || matchByContactId || matchByToPhone || matchByFromPhone || matchByAccountName || matchByTargetPhone;
        
        
        return shouldInclude;
      });
      // Sort newest first and paginate later
      filtered.sort((a,b)=>{
        const at = new Date(a.callTime || a.timestamp || 0).getTime();
        const bt = new Date(b.callTime || b.timestamp || 0).getTime();
        return bt - at;
      });
      
      // Final filtered calls ready for display
      
      if (!filtered.length){ arcUpdateListAnimated(list, '<div class="rc-empty">No recent calls</div>'); return; }

      // Enrich for direction/number like Calls page for consistent UI
      const bizList = Array.isArray(window.CRM_BUSINESS_NUMBERS) ? window.CRM_BUSINESS_NUMBERS.map(n=>String(n||'').replace(/\D/g,'').slice(-10)).filter(Boolean) : [];
      const isBiz = (p)=> bizList.includes(p);
      const norm = (s)=> String(s||'').replace(/\D/g,'').slice(-10);
      filtered.forEach(c => {
        if (!c.id) c.id = c.twilioSid || c.callSid || c.sid || `${c.to||''}_${c.from||''}_${c.timestamp||c.callTime||''}`;
        const to10 = norm(c.to);
        const from10 = norm(c.from);
        let direction = 'unknown';
        if (String(c.from||'').startsWith('client:') || isBiz(from10)) direction = 'outbound';
        else if (String(c.to||'').startsWith('client:') || isBiz(to10)) direction = 'inbound';
        const counter10 = direction === 'outbound' ? to10 : (direction === 'inbound' ? from10 : (to10 || from10));
        const pretty = counter10 ? `+1 (${counter10.slice(0,3)}) ${counter10.slice(3,6)}-${counter10.slice(6)}` : '';
        c.direction = c.direction || direction;
        c.counterpartyPretty = c.counterpartyPretty || pretty;
        // Fill missing account name from current account only; do not guess contact
        try {
          if (!c.accountName) {
            const a = state.currentAccount || {};
            const acctName = a.accountName || a.name || a.companyName || '';
            if (acctName) c.accountName = acctName;
          }
        } catch(_) {}
      });
      // Save to state and render first page
      try { state._arcCalls = filtered; } catch(_) {}
      try { if (typeof state._arcPage !== 'number' || !state._arcPage) state._arcPage = 1; } catch(_) {}
      arcRenderPage();
      // Clear the reload flag after successful load
      try { state._arcReloadInFlight = false; } catch(_) {}
      // Delegate once for reliability across rerenders
      if (!list._delegated) {
        list.addEventListener('click', (e) => {
          const btn = e.target && e.target.closest ? e.target.closest('.rc-insights') : null;
          if (!btn) return;
          e.preventDefault(); e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const call = (state._arcCalls||[]).find(x=>String(x.id||x.twilioSid||x.callSid||'')===String(id));
          if (!call) return;
          
          // Check if this is a not-processed call that needs CI processing
          if (btn.classList.contains('not-processed')) {
            // Use the correct property names from the call object
            const callSid = call.id || call.twilioSid || call.callSid;
            const recordingSid = call.recordingSid || call.recording_id;
            console.log('[AccountDetail] Triggering CI processing for call:', callSid, 'recording:', recordingSid);
            triggerAccountCI(callSid, recordingSid, btn);
            return;
          }
          
          // Otherwise, toggle the details as usual
          toggleRcDetails(btn, call);
        });
        list._delegated = '1';
      }
      arcBindPager();
      try { window.ClickToCall?.processSpecificPhoneElements?.(); } catch(_) {}
    } catch (e) {
      console.warn('[RecentCalls][Account] load failed', e);
      arcUpdateListAnimated(list, '<div class="rc-empty">Failed to load recent calls</div>');
    }
  }

  const ARC_PAGE_SIZE = 5;
  function arcGetSlice(){ const a = Array.isArray(state._arcCalls)?state._arcCalls:[]; const p=Math.max(1, parseInt(state._arcPage||1,10)); const s=(p-1)*ARC_PAGE_SIZE; return a.slice(s, s+ARC_PAGE_SIZE); }
  function arcRenderPage(){
    const list = document.getElementById('account-recent-calls-list'); if(!list) return;
    const total = Array.isArray(state._arcCalls)?state._arcCalls.length:0; 
    if(!total){ 
      arcUpdateListAnimated(list, '<div class="rc-empty">No recent calls</div>'); 
      arcUpdatePager(0,0); 
      return; 
    }
    const slice = arcGetSlice();
    arcUpdateListAnimated(list, slice.map(call => rcItemHtml(call)).join(''));
    // delegate click to handle dynamic rerenders (prevent duplicate listeners)
    list.querySelectorAll('.rc-insights').forEach(btn => {
      if (!btn._insightsListenerBound) {
        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const call = (state._arcCalls||[]).find(x=>String(x.id||x.twilioSid||x.callSid||'')===String(id));
          if (!call) return;
          
          // Check if this is a not-processed call that needs CI processing
          if (btn.classList.contains('not-processed')) {
            // Use the correct property names from the call object
            const callSid = call.id || call.twilioSid || call.callSid;
            const recordingSid = call.recordingSid || call.recording_id;
            triggerAccountCI(callSid, recordingSid, btn);
            return;
          }
          
          // Otherwise, toggle the details as usual
          toggleRcDetails(btn, call);
        });
        btn._insightsListenerBound = true;
      }
    });
    const totalPages = Math.max(1, Math.ceil(total/ARC_PAGE_SIZE));
    arcUpdatePager(state._arcPage||1, totalPages);
  }
  function arcBindPager(){ const pager=document.getElementById('account-rc-pager'); if(!pager||pager._bound) return; const prev=document.getElementById('arc-prev'); const next=document.getElementById('arc-next'); prev?.addEventListener('click', (e)=>{ e.preventDefault(); const total=Math.ceil((state._arcCalls||[]).length/ARC_PAGE_SIZE)||1; state._arcPage=Math.max(1,(state._arcPage||1)-1); arcRenderPage(); arcUpdatePager(state._arcPage,total); }); next?.addEventListener('click', (e)=>{ e.preventDefault(); const total=Math.ceil((state._arcCalls||[]).length/ARC_PAGE_SIZE)||1; state._arcPage=Math.min(total,(state._arcPage||1)+1); arcRenderPage(); arcUpdatePager(state._arcPage,total); }); pager._bound='1'; }
  function arcUpdatePager(current, total){ const pager=document.getElementById('account-rc-pager'); const info=document.getElementById('arc-info'); const prev=document.getElementById('arc-prev'); const next=document.getElementById('arc-next'); if(!pager||!info||!prev||!next) return; const show=total>1; pager.style.display=show?'flex':'none'; info.textContent=`${Math.max(1,parseInt(current||1,10))} of ${Math.max(1,parseInt(total||1,10))}`; prev.disabled=(current<=1); next.disabled=(current>=total); }
  function arcSpinnerHtml(){ return '<div class="rc-loading"><div class="rc-spinner" aria-hidden="true"></div></div>'; }
  function arcSetLoading(list){ try { let ov=list.querySelector('.rc-loading-overlay'); if(!ov){ ov=document.createElement('div'); ov.className='rc-loading-overlay'; ov.innerHTML=arcSpinnerHtml(); ov.style.position='absolute'; ov.style.inset='0'; ov.style.display='flex'; ov.style.alignItems='center'; ov.style.justifyContent='center'; ov.style.pointerEvents='none'; list.appendChild(ov);} ov.style.display='flex'; } catch(_) {} }
  function arcUpdateListAnimated(list, html){
    try {
      const avoidAnim = !!(state._isScrolling || (state._arcOpenIds && state._arcOpenIds.size > 0));
      if (avoidAnim) { 
        list.innerHTML = html; 
        // Remove any lingering loading overlay after content update
        try { const ov = list.querySelector('.rc-loading-overlay'); if (ov) ov.remove(); } catch(_) {}
        return; 
      }
      const h0 = list.offsetHeight;
      list.style.height = h0 + 'px';
      list.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        list.innerHTML = html;
        // Remove any lingering loading overlay after content update
        try { const ov = list.querySelector('.rc-loading-overlay'); if (ov) ov.remove(); } catch(_) {}
        const h1 = list.scrollHeight;
        list.style.transition = 'height 220ms ease, opacity 220ms ease';
        list.style.opacity = '1';
        list.style.height = h1 + 'px';
        // Use requestAnimationFrame for smoother animation cleanup
        requestAnimationFrame(() => {
          setTimeout(() => { list.style.height = ''; list.style.transition = ''; list.style.overflow = ''; }, 260);
        });
      });
    } catch(_) { 
      list.innerHTML = html; 
      // Remove any lingering loading overlay after content update
      try { const ov = list.querySelector('.rc-loading-overlay'); if (ov) ov.remove(); } catch(_) {}
    }
  }

  function rcItemHtml(c){
    // Prefer contact name; if absent and this is a company call, show company instead of "Unknown"
    const hasContact = !!(c.contactId && c.contactName);
    const displayName = hasContact ? (c.contactName) : (c.accountName || c.company || 'Unknown');
    const name = escapeHtml(displayName);
    const company = escapeHtml(c.accountName || c.company || '');
    const outcome = escapeHtml(c.outcome || c.status || '');
    const ts = c.callTime || c.timestamp || new Date().toISOString();
    const when = new Date(ts).toLocaleString();
    const idAttr = escapeHtml(String(c.id||c.twilioSid||c.callSid||''));
    
    // Check for live duration first, fallback to database duration
    let durStr = '';
    if (state._liveCallDurations && state._liveCallDurations.has(idAttr)) {
      const liveData = state._liveCallDurations.get(idAttr);
      // Only use live duration if it's recent (within last 10 seconds)
      if (Date.now() - liveData.timestamp < 10000) {
        durStr = liveData.durationFormatted;
      }
    }
    
    // Fallback to database duration if no live duration
    if (!durStr) {
      const dur = Math.max(0, parseInt(c.durationSec||c.duration||0,10));
      durStr = `${Math.floor(dur/60)}m ${dur%60}s`;
    }
    
    // Use the actual phone number from the call, not the formatted counterparty
    const phone = escapeHtml(String(c.targetPhone || c.to || c.from || c.counterpartyPretty || ''));
    const direction = escapeHtml((c.direction || '').charAt(0).toUpperCase() + (c.direction || '').slice(1));
    const sig = `${idAttr}|${c.status||c.outcome||''}|${c.durationSec||c.duration||0}|${c.transcript?1:0}|${c.aiInsights?1:0}`;
    
    return `
      <div class=\"rc-item\" data-id=\"${idAttr}\" data-sig=\"${sig}\">
        <div class="rc-meta">
          <div class="rc-title">${name || company || 'Unknown'}</div>
          <div class="rc-sub">${when} • <span class="rc-duration">${durStr}</span> • <span class="phone-number" 
                                 data-contact-id="" 
                                 data-account-id="${c.accountId || state.currentAccount?.id || ''}" 
                                 data-contact-name="" 
                                 data-company-name="${escapeHtml(company)}">${phone}</span>${direction?` • ${direction}`:''}</div>
        </div>
        <div class="rc-actions">
          <span class="rc-outcome">${outcome}</span>
          <button type="button" class="rc-icon-btn rc-insights ${(!c.transcript || !c.aiInsights || Object.keys(c.aiInsights || {}).length === 0) ? 'not-processed' : ''}" data-id="${escapeHtml(String(c.id||''))}" aria-label="View insights" title="${(!c.transcript || !c.aiInsights || Object.keys(c.aiInsights || {}).length === 0) ? 'Process Call' : 'View AI insights'}">${svgEye()}</button>
        </div>
      </div>`;
  }
  // Trigger on-demand CI processing for a call
  async function triggerAccountCI(callSid, recordingSid, btn) {
    if (!callSid) {
      console.warn('[AccountDetail] Missing callSid for CI processing:', { callSid, recordingSid });
      return;
    }
    
    // Use shared CI processor for consistent functionality
    if (window.SharedCIProcessor) {
      const success = await window.SharedCIProcessor.processCall(callSid, recordingSid, btn, {
        context: 'account-detail',
        onSuccess: (call) => {
          console.log('[AccountDetail] CI processing completed:', call);
          
          // Update state cache so future renders show full insights
          try {
            if (Array.isArray(state._arcCalls)) {
              const idMatch = String(callSid);
              state._arcCalls = state._arcCalls.map(x => {
                const xid = String(x.id || x.twilioSid || x.callSid || '');
                if (xid === idMatch) {
                  return { 
                    ...x, 
                    transcript: call.transcript || x.transcript, 
                    formattedTranscript: call.formattedTranscript || x.formattedTranscript, 
                    aiInsights: call.aiInsights || x.aiInsights, 
                    conversationalIntelligence: call.conversationalIntelligence || x.conversationalIntelligence 
                  };
                }
                return x;
              });
            }
          } catch(_) {}
        },
        onError: (error) => {
          console.error('[AccountDetail] CI processing failed:', error);
        }
      });
      
      return;
    }
    
    // If no recordingSid provided, the API will look it up by callSid
    if (!recordingSid) {
      console.log('[AccountDetail] No recordingSid provided, API will look up recording for callSid:', callSid);
    }

    try {
      // Show loading spinner on the button (scoped, consistent across pages)
      btn.innerHTML = '<span class="ci-btn-spinner" aria-hidden="true"></span>';
      btn.classList.add('processing');
      btn.disabled = true;

      // Show toast notification
      if (window.ToastManager) {
        window.ToastManager.showToast({
          type: 'info',
          title: 'Processing Call',
          message: 'Starting conversational intelligence analysis...',
          sound: false
        });
      }

      // Call the CI request endpoint using resolved API base
      let base = (window.crm && typeof window.crm.getApiBaseUrl === 'function')
        ? window.crm.getApiBaseUrl()
        : (window.PUBLIC_BASE_URL || window.API_BASE_URL || 'https://power-choosers-crm.vercel.app');
      base = String(base).replace(/\/$/, '');
      const response = await fetch(`${base}/api/twilio/ci-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callSid: callSid,
          recordingSid: recordingSid
        })
      });

      if (!response.ok) {
        try {
          const err = await response.json().catch(()=>({}));
          console.error('[AccountDetail] CI request error response:', response.status, err);
          const msg = (err && (err.error || err.details)) ? String(err.error || err.details) : `CI request failed: ${response.status} ${response.statusText}`;
          if (window.ToastManager) { window.ToastManager.showToast(msg, 'error'); }
        } catch(_) {
          try { if (window.ToastManager) { window.ToastManager.showToast('Failed to start call processing', 'error'); } } catch(__) {}
        }
        try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
        return;
      }

      const result = await response.json();
      console.log('[AccountDetail] CI processing initiated:', result);

      // Update the button to show processing state (consistent with contact-detail)
      btn.innerHTML = '<span class="ci-btn-spinner" aria-hidden="true"></span>';
      btn.title = 'Processing call insights...';
      btn.classList.remove('not-processed');
      btn.classList.add('processing');

      // Store transcript SID for status checking
      try { if (result && result.transcriptSid) { btn.setAttribute('data-transcript-sid', result.transcriptSid); } } catch(_) {}

      // Poll for insights becoming available and enable the button when ready
      try { arcPollInsightsUntilReady(callSid, btn); } catch(_) {}

    } catch (error) {
      console.error('[AccountDetail] Failed to trigger CI processing:', error);
      
      // Reset button state on error
      btn.innerHTML = svgEye();
      btn.classList.remove('processing');
      btn.disabled = false;
      
      // Show error toast
      if (window.ToastManager) {
        window.ToastManager.showToast({
          type: 'error',
          title: 'Processing Failed',
          message: 'Unable to start call analysis. Please try again.'
        });
      }
    }
  }

  // Poll /api/calls for this call until transcript and aiInsights are present, then enable insights button (Account Detail)
  function arcPollInsightsUntilReady(callSid, btn){
    let attempts = 0;
    const maxAttempts = 40; // ~2 minutes at 3s
    const delayMs = 3000;
    const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm.vercel.app';
    const isReady = (call) => {
      const hasTranscript = !!(call && typeof call.transcript === 'string' && call.transcript.trim());
      const insights = call && call.aiInsights;
      const hasInsights = !!(insights && typeof insights === 'object' && Object.keys(insights).length > 0);
      const ci = call && call.conversationalIntelligence;
      const ciCompleted = !!(ci && typeof ci.status === 'string' && ci.status.toLowerCase() === 'completed');
      // Consider it ready if we have a transcript and either insights are present or CI status is completed
      return (hasTranscript && hasInsights) || (hasTranscript && ciCompleted);
    };
    const finalizeReady = (call) => {
      try {
        // Update state cache so future renders show full insights
        if (Array.isArray(state._arcCalls)) {
          const idMatch = String(callSid);
          state._arcCalls = state._arcCalls.map(x => {
            const xid = String(x.id || x.twilioSid || x.callSid || '');
            if (xid === idMatch) {
              return { ...x, transcript: call.transcript || x.transcript, formattedTranscript: call.formattedTranscript || x.formattedTranscript, aiInsights: call.aiInsights || x.aiInsights, conversationalIntelligence: call.conversationalIntelligence || x.conversationalIntelligence };
            }
            return x;
          });
        }
      } catch(_) {}
      try { btn.innerHTML = svgEye(); btn.classList.remove('processing', 'not-processed'); btn.disabled = false; btn.title = 'View AI insights'; } catch(_) {}
      try { if (window.ToastManager) { window.ToastManager.showToast({ type: 'success', title: 'Insights Ready', message: 'Click the eye icon to view call insights.' }); } } catch(_) {}
    };
    const attempt = () => {
      attempts++;
      fetch(`${base}/api/calls?callSid=${encodeURIComponent(callSid)}`)
        .then(r => r.json()).then(j => {
          const call = j && j.ok && Array.isArray(j.calls) && j.calls[0];
          if (call && isReady(call)) { finalizeReady(call); return; }
          // Kick background analyzer if we know a transcript SID but not ready yet
          try {
            const ci = call && call.conversationalIntelligence; const tsid = ci && (ci.transcriptSid || ci.transcriptSID);
            if (tsid) {
              fetch(`${base}/api/twilio/poll-ci-analysis`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ transcriptSid: tsid, callSid }) })
                .then(()=>{})
                .catch(()=>{});
            }
          } catch(_) {}
          if (attempts < maxAttempts) { setTimeout(attempt, delayMs); }
          else {
            try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
          }
        }).catch(()=>{
          if (attempts < maxAttempts) { setTimeout(attempt, delayMs); }
          else {
            try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
          }
        });
    };
    attempt();
  }

  // Inline expanding details
  function toggleRcDetails(btn, call){
    const item = btn.closest('.rc-item');
    if (!item) return;
    const existing = item.nextElementSibling && item.nextElementSibling.classList && item.nextElementSibling.classList.contains('rc-details') ? item.nextElementSibling : null;
    const idStr = String(call.id || call.twilioSid || call.callSid || '');
    if (existing) {
      // User explicitly closed - remove from open tracker
      try { if (state._arcOpenIds && state._arcOpenIds instanceof Set) state._arcOpenIds.delete(idStr); } catch(_) {}
      animateCollapse(existing, () => existing.remove());
      return;
    }
    // Ensure open tracker exists and add current id
    try { if (!state._arcOpenIds || !(state._arcOpenIds instanceof Set)) state._arcOpenIds = new Set(); state._arcOpenIds.add(idStr); } catch(_) {}
    const panel = document.createElement('div');
    panel.className = 'rc-details';
    panel.innerHTML = `<div class="rc-details-inner">${insightsInlineHtml(call)}</div>`;
    item.insertAdjacentElement('afterend', panel);
    animateExpand(panel);

    // Background transcript fetch if missing
    try {
      if ((!call.transcript || String(call.transcript).trim()==='') && call.twilioSid) {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        const url = base ? `${base}/api/twilio/ai-insights` : '/api/twilio/ai-insights';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: call.twilioSid })
        }).then(res=>res.json()).then(data=>{
          if (data && data.transcript) {
            call.transcript = data.transcript;
            const tEl = panel.querySelector('.pc-transcript');
            if (tEl) tEl.textContent = data.transcript;
          }
        }).catch(()=>{});
      }
    } catch(_) {}
  }
  function animateExpand(el){ 
    el.style.height='0px'; 
    el.style.opacity='0'; 
    const h=el.scrollHeight; 
    requestAnimationFrame(()=>{ 
      el.classList.add('expanding'); 
      el.style.transition='height 180ms ease, opacity 180ms ease'; 
      el.style.height=h+'px'; 
      el.style.opacity='1'; 
      // Use requestAnimationFrame for smoother cleanup
      requestAnimationFrame(() => {
        setTimeout(()=>{ el.style.height=''; el.style.transition=''; el.classList.remove('expanding'); },200); 
      });
    }); 
  }
  function animateCollapse(el, done){ 
    const h=el.scrollHeight; 
    el.style.height=h+'px'; 
    el.style.opacity='1'; 
    requestAnimationFrame(()=>{ 
      el.classList.add('collapsing'); 
      el.style.transition='height 140ms ease, opacity 140ms ease'; 
      el.style.height='0px'; 
      el.style.opacity='0'; 
      // Use requestAnimationFrame for smoother cleanup
      requestAnimationFrame(() => {
        setTimeout(()=>{ el.classList.remove('collapsing'); done&&done(); },160); 
      });
    }); 
  }
  function insightsInlineHtml(r){
    const AI = r.aiInsights || {};
    // Build summary: prefer Twilio Operator summary, then fallback to constructed paragraph
    let paragraph = '';
    let bulletItems = [];
    const rawTwilioSummary = (AI && typeof AI.summary === 'string') ? AI.summary.trim() : '';
    if (rawTwilioSummary) {
      // Twilio format: "Paragraph. • Bullet 1 • Bullet 2 ..."
      const parts = rawTwilioSummary.split(' • ').map(s=>s.trim()).filter(Boolean);
      paragraph = parts.shift() || '';
      bulletItems = parts;
    } else if (r.aiSummary && String(r.aiSummary).trim()) {
      paragraph = String(r.aiSummary).trim();
    } else if (AI && Object.keys(AI).length) {
      const sentiment = AI.sentiment || 'Unknown';
      const disposition = AI.disposition || '';
      const topics = Array.isArray(AI.keyTopics) ? AI.keyTopics.slice(0,3).join(', ') : '';
      const who = r.contactName ? `Call with ${r.contactName}` : 'Call';
      let p = `${who}`;
      if (disposition) p += ` — ${disposition.toLowerCase()} disposition`;
      if (topics) p += `. Topics: ${topics}`;
      if (sentiment) p += `. ${sentiment} sentiment.`;
      paragraph = p;
    } else {
      paragraph = 'No summary available';
    }
    // Filter bullets to avoid redundancy with right-hand sections (energy, topics, steps, pain, entities, budget, timeline)
    const redundant = /(current rate|rate type|supplier|utility|contract|usage|term|budget|timeline|topic|next step|pain point|entities?)/i;
    const filteredBullets = (bulletItems||[]).filter(b => b && !redundant.test(b)).slice(0,6);
    const sentiment = AI.sentiment || 'Unknown';
    const disposition = AI.disposition || '';
    const keyTopics = Array.isArray(AI.keyTopics) ? AI.keyTopics : [];
    const nextSteps = Array.isArray(AI.nextSteps) ? AI.nextSteps : [];
    const pain = Array.isArray(AI.painPoints) ? AI.painPoints : [];
    const flags = AI.flags || {};
    const chips = [
      `<span class=\"pc-chip ${sentiment==='Positive'?'ok':sentiment==='Negative'?'danger':'info'}\">Sentiment: ${escapeHtml(sentiment)}</span>`,
      disposition ? `<span class=\"pc-chip info\">Disposition: ${escapeHtml(disposition)}</span>` : '',
      flags.nonEnglish ? '<span class="pc-chip warn">Non‑English</span>' : '',
      flags.voicemailDetected ? '<span class="pc-chip warn">Voicemail</span>' : '',
      flags.callTransfer ? '<span class="pc-chip info">Transferred</span>' : '',
      flags.doNotContact ? '<span class="pc-chip danger">Do Not Contact</span>' : '',
      flags.recordingDisclosure ? '<span class="pc-chip ok">Recording Disclosure</span>' : ''
    ].filter(Boolean).join('');
    const topicsHtml = keyTopics.length ? keyTopics.map(t=>`<span class=\"pc-chip\">${escapeHtml(t)}</span>`).join('') : '<span class="pc-chip">None</span>';
    const nextHtml = nextSteps.length ? nextSteps.map(t=>`<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None</div>';
    const painHtml = pain.length ? pain.map(t=>`<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None mentioned</div>';
    function toMMSS(s){ const m=Math.floor((s||0)/60), ss=(s||0)%60; return `${String(m)}:${String(ss).padStart(2,'0')}`; }
  // Expose CI trigger for the eye button (Account Details)
  if (!window.__triggerAccountCI){
    window.__triggerAccountCI = async function(callSid, recordingSid){
      try{
        const btn = document.querySelector('button.rc-icon-btn[data-ci-btn="1"]');
        if (btn){ btn.classList.add('is-loading'); btn.disabled = true; }
        // Show spinner by swapping inner SVG to a small loader
        if (btn){ btn.innerHTML = '<span class="ci-btn-spinner" aria-hidden="true"></span>'; }
        const base = (window.crm && typeof window.crm.getApiBaseUrl === 'function')
          ? window.crm.getApiBaseUrl()
          : (window.PUBLIC_BASE_URL || window.API_BASE_URL || window.location.origin || '').replace(/\/$/,'');
        const url = `${base}/api/twilio/ci-request`;
        const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ callSid, recordingSid }) });
        const data = await resp.json().catch(()=>({}));
        if (data && data.transcriptSid){
          if (window.ToastManager){
            window.ToastManager.showToast({ type:'save', title:'Processing started', message:`We are processing your call insights now.` });
          }
        } else {
          if (window.ToastManager){ window.ToastManager.showToast({ type:'warn', title:'Could not start', message:'Unable to queue call insights. Try again shortly.' }); }
        }
      }catch(e){
        if (window.ToastManager){ window.ToastManager.showToast({ type:'danger', title:'Error', message:e?.message||'Failed to start insights' }); }
      }
    };
    // Loader keyframes (once)
    const styleId = '__ci_loader_style__';
    if (!document.getElementById(styleId)){
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = '@keyframes spin {from{transform:rotate(0)} to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
  }
    function renderTranscriptHtml(A, raw){
      let turns = Array.isArray(A?.speakerTurns) ? A.speakerTurns : [];
      if (turns.length && !turns.some(t=>t && (t.role==='agent'||t.role==='customer'))){
        let next='customer';
        turns = turns.map(t=>({ t:Number(t.t)||0, role: next = (next==='agent'?'customer':'agent'), text: t.text||'' }));
      }
      if (turns.length){
        const contactFirst = (String(r.contactName||r.accountName||'').trim().split(/\s+/)[0]) || 'Customer';
        const groups=[]; let current=null;
        for(const t of turns){ const roleKey=t.role==='agent'?'agent':(t.role==='customer'?'customer':'other'); const text=ad_normalizeSupplierTokens(t.text||''); const ts=Number(t.t)||0; if(current && current.role===roleKey){ current.texts.push(text); current.end=ts; } else { if(current) groups.push(current); current={ role:roleKey, start:ts, texts:[text] }; } }
        if(current) groups.push(current);
        return groups.map(g=>{ const label=g.role==='agent'?'You':(g.role==='customer'?contactFirst:'Speaker'); const avatar=g.role==='agent'?ad_getAgentAvatar():ad_getContactAvatar(contactFirst, r); return `<div class=\"transcript-message ${g.role}\"><div class=\"transcript-avatar\">${avatar}</div><div class=\"transcript-content\"><div class=\"transcript-header\"><span class=\"transcript-speaker\">${label}</span><span class=\"transcript-time\">${toMMSS(g.start)}</span></div><div class=\"transcript-text\">${escapeHtml(g.texts.join(' ').trim())}</div></div></div>`; }).join('');
      }
      const rawText = String(raw||'').trim();
      if (rawText) return `<div class=\"transcript-message\"><div class=\"transcript-content\"><div class=\"transcript-text\">${escapeHtml(rawText)}</div></div></div>`;
      return 'Transcript not available';
    }

    // Prefer CI sentences + channelRoleMap for dual-channel mapping (per Twilio guidance)
    let transcriptHtml = '';
    try {
      const ci = r.conversationalIntelligence || {};
      const sentences = Array.isArray(ci.sentences) ? ci.sentences : [];
      const channelMap = ci.channelRoleMap || {};
      const normalizeChannel = (c)=>{ const s=(c==null?'':String(c)).trim(); if(s==='0') return '1'; if(/^[Aa]$/.test(s)) return '1'; if(/^[Bb]$/.test(s)) return '2'; return s; };
      const resolveRole = (ch)=>{
        const n = normalizeChannel(ch);
        const mapped = channelMap[n];
        if (mapped === 'agent' || mapped === 'customer') return mapped;
        const agentCh = String(ci.agentChannel || channelMap.agentChannel || '');
        if (agentCh && n === agentCh) return 'agent';
        if (agentCh) return 'customer';
        return '';
      };
      if (sentences.length && (Object.keys(channelMap).length || ci.agentChannel!=null || channelMap.agentChannel!=null)){
        const turns = sentences.map(s=>{
          const role = resolveRole(s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex) || 'other';
          const t = Math.max(0, Number(s.startTime||0));
          const text = (s.text || s.transcript || '').trim();
          return { t, role, text };
        });
        transcriptHtml = renderTranscriptHtml({ speakerTurns: turns }, '');
      } else {
        transcriptHtml = renderTranscriptHtml(AI, r.formattedTranscript || r.transcript);
      }
    } catch(_){
      try { transcriptHtml = renderTranscriptHtml(AI, r.formattedTranscript || r.transcript); } catch(__){ transcriptHtml = 'Transcript not available'; }
    }
    
    // DEBUG: Log transcript data for debugging
    console.log('[Account Detail] Call transcript debug:', {
      callId: r.id,
      twilioSid: r.twilioSid,
      hasTranscript: !!r.transcript,
      transcriptLength: r.transcript ? r.transcript.length : 0,
      transcriptPreview: r.transcript ? r.transcript.substring(0, 100) : 'N/A',
      hasAI: !!AI,
      aiKeys: AI ? Object.keys(AI) : [],
      finalTranscriptRenderedPreview: (function(){ try{ return (transcriptHtml || '').slice(0, 100); }catch(_){ return 'N/A'; } })()
    });
    const rec = r.audioUrl || r.recordingUrl || '';
    let proxied = '';
    if (rec) {
      if (String(rec).includes('/api/recording?url=')) proxied = rec;
      else {
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
        const playbackBase = /localhost|127\.0\.0\.1/.test(base) ? 'https://power-choosers-crm.vercel.app' : base;
        proxied = `${playbackBase}/api/recording?url=${encodeURIComponent(rec)}`;
      }
    }
    const audio = proxied ? `<audio controls style=\"width:100%; margin-top:8px;\"><source src=\"${proxied}\" type=\"audio/mpeg\">Your browser does not support audio playback.</audio>` : '<div style=\"color:var(--text-muted); font-size:12px;\">No recording available</div>';
    const hasAI = AI && Object.keys(AI).length > 0;

    // Energy & Contract + Entities to mirror Calls modal
    const contract = AI.contract || {};
    const rate = contract.currentRate || contract.rate || 'Unknown';
    const supplier = contract.supplier || contract.utility || 'Unknown';
    const contractEnd = contract.contractEnd || contract.endDate || 'Not discussed';
    const usage = (contract.usageKWh || contract.usage || 'Not provided')+'';
    const rateType = contract.rateType || 'Unknown';
    const contractLength = (contract.contractLength || 'Unknown')+'';
    const budget = AI.budget || 'Unclear';
    const timeline = AI.timeline || 'Not specified';
    const entities = Array.isArray(AI.entities) ? AI.entities : [];
    const entitiesHtml = entities.length ? entities.slice(0,20).map(e=>`<span class=\"pc-chip\">${escapeHtml(e.type||'Entity')}: ${escapeHtml(e.text||'')}</span>`).join('') : '<span class=\"pc-chip\">None</span>';
    return `
      <div class=\"insights-grid\"> 
        <div>
          <div class=\"ip-card\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path><polyline points=\"14,2 14,8 20,8\"></polyline></svg>
              AI Call Summary
            </h4>
            <div class=\"pc-chips\" style=\"margin:6px 0 10px 0;\">${chips}</div>
            <div style=\"color:var(--text-secondary); line-height:1.5; margin-bottom:8px;\">${escapeHtml(paragraph)}</div>
            ${filteredBullets.length ? `<ul class=\"summary-bullets\" style=\"margin:0; padding-left:18px; color:var(--text-secondary);\">${filteredBullets.map(b=>`<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
          </div>
          <div class=\"ip-card\" style=\"margin-top:12px;\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"></path></svg>
              Call Transcript
            </h4>
            <div class=\"pc-transcript-container\">${transcriptHtml}</div>
          </div>
        </div>
        <div>
          <div class=\"ip-card\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"></path></svg>
              Call Recording
            </h4>
            <div style=\"color:var(--text-secondary); font-style:italic;\">${audio}</div>
            ${proxied ? '' : '<div style=\"color:var(--text-muted); font-size:12px; margin-top:4px;\">Recording may take 1-2 minutes to process after call completion</div>'}
            ${proxied && r.recordingChannels ? `<div style=\"color:var(--text-secondary); font-size:12px; margin-top:4px;\">Recording: ${r.recordingChannels === '2' ? 'Dual-Channel (2 Channels)' : 'Single Channel'} • Source: ${r.recordingSource || 'Unknown'}</div>` : ''}
            ${hasAI ? '<div style=\"color:var(--orange-subtle); font-size:12px; margin-top:4px;\">✓ AI analysis completed</div>' : '<div style=\"color:var(--text-muted); font-size:12px; margin-top:4px;\">AI analysis in progress...</div>'}
          </div>
          <div class=\"ip-card\" style=\"margin-top:12px;\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"23\"></line><path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\"></path></svg>
              Energy & Contract Details
            </h4>
            <div class=\"pc-kv\">
              <div class=\"k\">Current rate</div><div class=\"v\">${escapeHtml(rate)}</div>
              <div class=\"k\">Supplier/Utility</div><div class=\"v\">${escapeHtml(supplier)}</div>
              <div class=\"k\">Contract end</div><div class=\"v\">${escapeHtml(contractEnd)}</div>
              <div class=\"k\">Usage</div><div class=\"v\">${escapeHtml(usage)}</div>
              <div class=\"k\">Rate type</div><div class=\"v\">${escapeHtml(rateType)}</div>
              <div class=\"k\">Term</div><div class=\"v\">${escapeHtml(contractLength)}</div>
              <div class=\"k\">Budget</div><div class=\"v\">${escapeHtml(budget)}</div>
              <div class=\"k\">Timeline</div><div class=\"v\">${escapeHtml(timeline)}</div>
            </div>
          </div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path></svg> Key Topics</h4><div class=\"pc-chips\">${topicsHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polyline points=\"9 18 15 12 9 6\"></polyline></svg> Next Steps</h4><div style=\"color:var(--text-secondary); font-size:12px;\">${nextHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"></line><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line></svg> Pain Points</h4><div style=\"color:var(--text-secondary); font-size:12px;\">${painHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle></svg> Entities</h4><div class=\"pc-chips\">${entitiesHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px; text-align:right;\"><button class=\"rc-icon-btn\" data-ci-btn=\"1\" onclick=\"(function(){ try{ (window.__triggerAccountCI||function(){})('${String(r.callSid||r.id||'')}','${String(r.recordingSid||'')}'); }catch(_){}})()\" aria-label=\"Process call insights\" title=\"Process call insights\">${svgEye()}</button></div>
        </div>
      </div>`;
  }

  function arcPatchList(list, slice){
    // Build map of existing rows by id
    const rows = Array.from(list.querySelectorAll('.rc-item'));
    const byId = new Map();
    rows.forEach(r => { const id = r.getAttribute('data-id'); if (id) byId.set(id, r); });
    // Desired order
    let anchor = null;
    slice.forEach(call => {
      const id = String(call.id || call.twilioSid || call.callSid || '');
      let row = byId.get(id);
      const newSig = `${id}|${call.status||call.outcome||''}|${call.durationSec||call.duration||0}|${call.transcript?1:0}|${call.aiInsights?1:0}`;
      if (row){
        // Move row to correct order if needed (keep rc-details sibling with it)
        const needMove = !anchor ? (list.firstElementChild !== row) : (anchor.nextSibling !== row);
        if (needMove){
          const details = (row.nextElementSibling && row.nextElementSibling.classList.contains('rc-details')) ? row.nextElementSibling : null;
          if (!anchor) list.insertBefore(row, list.firstChild);
          else list.insertBefore(row, anchor.nextSibling);
          if (details) list.insertBefore(details, row.nextSibling);
        }
        // Update content only if signature changed
        const oldSig = row.getAttribute('data-sig') || '';
        if (oldSig !== newSig){
          row.setAttribute('data-sig', newSig);
          // Replace inner of row meta/actions only, keep row element and potential details sibling intact
          const html = rcItemHtml(call);
          const tmp = document.createElement('div');
          tmp.innerHTML = html.trim();
          const fresh = tmp.firstElementChild;
          if (fresh){
            // Swap inner structure of row (children) without replacing row node
            row.innerHTML = fresh.innerHTML;
          }
        }
      } else {
        // Create new row and insert
        const html = rcItemHtml(call);
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        row = tmp.firstElementChild;
        if (!anchor) list.insertBefore(row, list.firstChild);
        else list.insertBefore(row, anchor.nextSibling);
        // Auto-open if this id was previously open
        try {
          if (state._arcOpenIds && state._arcOpenIds.has(id)){
            const btn = row.querySelector('.rc-icon-btn.rc-insights');
            if (btn) toggleRcDetails(btn, call);
          }
        } catch(_) {}
      }
      anchor = row;
      byId.delete(id);
    });
    // Remove any extra rows not in slice (and their details), but keep details for open ids on other pages
    byId.forEach((row, id) => {
      const details = (row.nextElementSibling && row.nextElementSibling.classList.contains('rc-details')) ? row.nextElementSibling : null;
      if (details) details.remove();
      row.remove();
    });
  }

  function svgEye(){
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function openAddContactModal() {
    // Use the main CRM's modal opening function to ensure proper event binding
    if (window.crm && typeof window.crm.createAddContactModal === 'function') {
      // Pre-fill the company name before opening the modal
      const modal = document.getElementById('modal-add-contact');
      if (modal && state.currentAccount) {
        const companyInput = modal.querySelector('input[name="companyName"]');
        if (companyInput) {
          const accountName = state.currentAccount.accountName || state.currentAccount.name || state.currentAccount.companyName;
          if (accountName) {
            companyInput.value = accountName;
          }
        }
        // Persist the navigation context so after creating the contact we return here
        try {
          window._contactNavigationSource = 'account-details';
          window._contactNavigationAccountId = state.currentAccount?.id || null;
        } catch (_) {}
      }
      
      // Open the modal using the proper function
      window.crm.createAddContactModal();
    } else {
      console.error('CRM createAddContactModal function not available');
    }
  }

  // Parent Company Autocomplete Functions
  let autocompleteDebounceTimer = null;

  function setupParentCompanyAutocomplete(inputElement, dropdownElement, hiddenIdElement) {
    if (!inputElement || !dropdownElement || !hiddenIdElement) return;

    // Inject styles
    injectParentCompanyAutocompleteStyles();

    // Handle input with debounce
    inputElement.addEventListener('input', (e) => {
      const searchTerm = e.target.value.trim();
      
      // Clear debounce timer
      if (autocompleteDebounceTimer) {
        clearTimeout(autocompleteDebounceTimer);
      }

      // If empty, hide dropdown and clear hidden ID
      if (!searchTerm) {
        dropdownElement.style.display = 'none';
        hiddenIdElement.value = '';
        return;
      }

      // Debounce search
      autocompleteDebounceTimer = setTimeout(() => {
        performParentCompanySearch(searchTerm, inputElement, dropdownElement, hiddenIdElement);
      }, 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!inputElement.contains(e.target) && !dropdownElement.contains(e.target)) {
        dropdownElement.style.display = 'none';
      }
    });
  }

  function performParentCompanySearch(searchTerm, inputElement, dropdownElement, hiddenIdElement) {
    const accounts = window.getAccountsData ? window.getAccountsData() : [];
    const currentAccountId = state.currentAccount?.id || '';
    
    // Filter accounts (exclude current account to prevent circular relationships)
    const lowerSearch = searchTerm.toLowerCase();
    const results = accounts.filter(account => {
      if (account.id === currentAccountId) return false;
      const name = (account.accountName || account.name || account.companyName || '').toLowerCase();
      const city = (account.city || account.locationCity || '').toLowerCase();
      const stateVal = (account.state || account.locationState || '').toLowerCase();
      const industry = (account.industry || '').toLowerCase();
      
      return name.includes(lowerSearch) || 
             city.includes(lowerSearch) || 
             stateVal.includes(lowerSearch) ||
             industry.includes(lowerSearch);
    }).slice(0, 10); // Limit to 10 results

    renderParentCompanyDropdown(results, inputElement, dropdownElement, hiddenIdElement);
  }

  function renderParentCompanyDropdown(results, inputElement, dropdownElement, hiddenIdElement) {
    if (!results || results.length === 0) {
      dropdownElement.innerHTML = '<div class="parent-company-dropdown-empty">No companies found</div>';
      dropdownElement.style.display = 'block';
      return;
    }

    const html = results.map(account => {
      const accountName = account.accountName || account.name || account.companyName || '';
      const city = account.city || account.locationCity || '';
      const stateVal = account.state || account.locationState || '';
      const industry = account.industry || '';
      
      // Build location/industry string
      const locationParts = [];
      if (city && stateVal) locationParts.push(`${city}, ${stateVal}`);
      else if (city) locationParts.push(city);
      else if (stateVal) locationParts.push(stateVal);
      
      if (industry) locationParts.push(industry);
      const details = locationParts.join(' • ');

      // Get company icon/favicon
      const deriveDomain = (input) => {
        try {
          if (!input) return '';
          let s = String(input).trim();
          if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
          if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
          return '';
        } catch(_) { return ''; }
      };
      const domain = account.domain ? String(account.domain).replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/^www\./i,'') : deriveDomain(account.website || '');
      const logoUrl = account.logoUrl || '';
      
      let iconHTML = '';
      try {
        if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
          iconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
        }
      } catch(_) {}
      
      if (!iconHTML) {
        const fallbackLetter = accountName ? accountName.charAt(0).toUpperCase() : 'C';
        iconHTML = `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-item); border-radius: 6px; font-weight: 600; font-size: 14px; color: var(--text-secondary);">${fallbackLetter}</div>`;
      }

      return `
        <div class="parent-company-dropdown-item" data-account-id="${escapeHtml(account.id)}" data-account-name="${escapeHtml(accountName)}">
          <div class="parent-company-dropdown-favicon">${iconHTML}</div>
          <div class="parent-company-dropdown-info">
            <div class="parent-company-dropdown-name">${escapeHtml(accountName)}</div>
            ${details ? `<div class="parent-company-dropdown-details">${escapeHtml(details)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    dropdownElement.innerHTML = html;
    dropdownElement.style.display = 'block';

    // Add click handlers to dropdown items
    dropdownElement.querySelectorAll('.parent-company-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const accountId = item.getAttribute('data-account-id');
        const accountName = item.getAttribute('data-account-name');
        selectParentCompany(accountId, accountName, inputElement, dropdownElement, hiddenIdElement);
      });
    });
  }

  function selectParentCompany(accountId, accountName, inputElement, dropdownElement, hiddenIdElement) {
    inputElement.value = accountName;
    hiddenIdElement.value = accountId;
    dropdownElement.style.display = 'none';
  }

  // Edit Account modal (reuse Add Account modal styles)
  function openEditAccountModal() {
    const a = state.currentAccount || {};
    const overlay = document.createElement('div');
    overlay.className = 'pc-modal';
    overlay.tabIndex = -1;
    overlay.innerHTML = `
      <div class="pc-modal__backdrop" data-close="edit-account"></div>
      <div class="pc-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="edit-account-title">
        <div class="pc-modal__header">
          <h3 id="edit-account-title">Edit Account</h3>
          <button class="pc-modal__close" data-close="edit-account" aria-label="Close">×</button>
        </div>
        <form id="form-edit-account" class="pc-modal__form">
          <div class="pc-modal__body">
            <div class="form-row">
              <label>Account name<input type="text" name="accountName" class="input-dark" value="${escapeHtml(a.accountName || a.name || a.companyName || '')}" /></label>
              <label>Industry<input type="text" name="industry" class="input-dark" value="${escapeHtml(a.industry || '')}" /></label>
            </div>
            <div class="form-row">
              <label>Website<input type="text" name="website" class="input-dark" value="${escapeHtml(a.website || a.site || '')}" placeholder="https://example.com" /></label>
              <label>Phone<input type="text" name="phone" class="input-dark" value="${escapeHtml(a.phone || a.companyPhone || a.primaryPhone || a.mainPhone || '')}" /></label>
            </div>
            <div class="form-row">
              <label>City<input type="text" name="city" class="input-dark" value="${escapeHtml(a.city || a.locationCity || '')}" /></label>
              <label>State<input type="text" name="state" class="input-dark" value="${escapeHtml(a.state || a.locationState || '')}" /></label>
            </div>
            <div class="form-row" style="grid-template-columns: 1fr;">
              <label>Service Addresses
                <div id="edit-service-addresses-container" style="display: flex; flex-direction: column; gap: 8px;">
                  ${(a.serviceAddresses && Array.isArray(a.serviceAddresses) && a.serviceAddresses.length > 0) ? 
                    a.serviceAddresses.map((sa, idx) => `
                      <div class="service-address-input-row" style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" name="serviceAddress_${idx}" class="input-dark" placeholder="123 Main St, City, State" style="flex: 1;" value="${escapeHtml(sa.address || '')}" />
                        <button type="button" class="remove-service-address-btn" style="background: var(--grey-600); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Remove this service address">-</button>
                        <button type="button" class="add-service-address-btn" style="background: var(--orange-primary); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Add another service address">+</button>
                      </div>
                    `).join('') : 
                    `<div class="service-address-input-row" style="display: flex; gap: 8px; align-items: center;">
                      <input type="text" name="serviceAddress_0" class="input-dark" placeholder="123 Main St, City, State" style="flex: 1;" />
                      <button type="button" class="remove-service-address-btn" style="background: var(--grey-600); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Remove this service address">-</button>
                      <button type="button" class="add-service-address-btn" style="background: var(--orange-primary); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Add another service address">+</button>
                    </div>`
                  }
                </div>
              </label>
            </div>
            <div class="form-row">
              <label>LinkedIn URL<input type="url" name="linkedin" class="input-dark" value="${escapeHtml(a.linkedin || a.linkedinUrl || a.linkedin_url || '')}" /></label>
              <label>Square Footage<input type="number" name="squareFootage" class="input-dark" value="${escapeHtml(String(a.squareFootage ?? a.sqft ?? a.square_feet ?? ''))}" /></label>
            </div>
            <div class="form-row">
              <label>Occupancy %<input type="number" name="occupancyPct" class="input-dark" min="0" max="100" value="${escapeHtml(String(a.occupancyPct ?? a.occupancy ?? a.occupancy_percentage ?? ''))}" /></label>
              <label>Employees<input type="number" name="employees" class="input-dark" value="${escapeHtml(String(a.employees ?? a.employeeCount ?? ''))}" /></label>
            </div>
            <div class="form-row">
              <label style="position: relative;">Parent Company
                <input type="text" name="parentCompanyName" class="input-dark" id="parent-company-search-edit" placeholder="Search for parent company..." autocomplete="off" value="${escapeHtml(a.parentCompanyName || '')}" />
                <input type="hidden" name="parentCompanyId" id="parent-company-id-edit" value="${escapeHtml(a.parentCompanyId || '')}" />
                <div id="parent-company-dropdown-edit" class="parent-company-dropdown" style="display: none;"></div>
              </label>
            </div>
            <div class="form-row">
              <label>Short Description<textarea name="shortDescription" class="input-dark" rows="3">${escapeHtml(a.shortDescription || a.short_desc || a.descriptionShort || '')}</textarea></label>
            </div>
            <div class="form-row">
              <label>Electricity Supplier<input type="text" name="electricitySupplier" class="input-dark" value="${escapeHtml(a.electricitySupplier || '')}" /></label>
              <label>Annual Usage (kWh)<input type="number" name="annualUsage" class="input-dark" value="${escapeHtml(String(a.annualUsage ?? a.annual_usage ?? ''))}" /></label>
            </div>
            <div class="form-row">
              <label>Current Rate ($/kWh)<input type="number" name="currentRate" class="input-dark" step="0.001" value="${escapeHtml(String(a.currentRate ?? a.current_rate ?? ''))}" /></label>
              <label>Contract End Date<input type="date" name="contractEndDate" class="input-dark" value="${escapeHtml((a.contractEndDate || a.contract_end_date) ? toISODate(a.contractEndDate || a.contract_end_date) : '')}" /></label>
            </div>
            <div class="form-row" style="grid-template-columns: 1fr;">
              <label>Icon URL (Company logo or favicon)
                <input type="url" name="logoUrl" class="input-dark" value="${escapeHtml(a.logoUrl || '')}" placeholder="https://example.com/logo.png" />
              </label>
            </div>
          </div>
          <div class="pc-modal__footer">
            <button type="button" class="btn-text" data-close="edit-account">Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    const dialog = overlay.querySelector('.pc-modal__dialog');
    const backdrop = overlay.querySelector('.pc-modal__backdrop');
    const form = overlay.querySelector('#form-edit-account');
    const close = () => { try { overlay.remove(); } catch(_) {} };
    backdrop?.addEventListener('click', close);
    overlay.querySelectorAll('[data-close="edit-account"]').forEach(btn => btn.addEventListener('click', close));
    setTimeout(() => {
      const closeBtn = overlay.querySelector('.pc-modal__close');
      const firstInput = overlay.querySelector('input,button,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      else if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
    }, 0);
    const getFocusables = () => Array.from(dialog.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        const f = getFocusables(); if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleKeyDown);

    // Setup parent company autocomplete
    setTimeout(() => {
      const searchInput = overlay.querySelector('#parent-company-search-edit');
      const dropdown = overlay.querySelector('#parent-company-dropdown-edit');
      const hiddenId = overlay.querySelector('#parent-company-id-edit');
      if (searchInput && dropdown && hiddenId) {
        setupParentCompanyAutocomplete(searchInput, dropdown, hiddenId);
      }
    }, 0);

    // Service address plus and minus button handler (event delegation) for Edit Account modal
    const editServiceAddressesContainer = overlay.querySelector('#edit-service-addresses-container');
    if (editServiceAddressesContainer) {
      editServiceAddressesContainer.addEventListener('click', (e) => {
        const plusBtn = e.target.closest('.add-service-address-btn');
        const minusBtn = e.target.closest('.remove-service-address-btn');
        
        if (plusBtn) {
          e.preventDefault();
          const container = overlay.querySelector('#edit-service-addresses-container');
          const currentRows = container.querySelectorAll('.service-address-input-row');
          const newIndex = currentRows.length;
          const newRow = document.createElement('div');
          newRow.className = 'service-address-input-row';
          newRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
          newRow.innerHTML = `
            <input type="text" name="serviceAddress_${newIndex}" class="input-dark" placeholder="123 Main St, City, State" style="flex: 1;" />
            <button type="button" class="remove-service-address-btn" style="background: var(--grey-600); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Remove this service address">-</button>
            <button type="button" class="add-service-address-btn" style="background: var(--orange-primary); color: white; border: none; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Add another service address">+</button>
          `;
          container.appendChild(newRow);
        } else if (minusBtn) {
          e.preventDefault();
          const container = overlay.querySelector('#edit-service-addresses-container');
          const currentRows = container.querySelectorAll('.service-address-input-row');
          // Only remove if there's more than one row
          if (currentRows.length > 1) {
            const rowToRemove = minusBtn.closest('.service-address-input-row');
            if (rowToRemove) {
              rowToRemove.remove();
            }
          }
        }
      });
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      
      // Collect service addresses
      const serviceAddresses = [];
      form.querySelectorAll('[name^="serviceAddress_"]').forEach((input, idx) => {
        if (input.value.trim()) {
          serviceAddresses.push({
            address: input.value.trim(),
            isPrimary: idx === 0
          });
        }
      });
      
      const updates = {
        accountName: (fd.get('accountName') || '').toString().trim(),
        industry: (fd.get('industry') || '').toString().trim(),
        website: (fd.get('website') || '').toString().trim(),
        phone: normalizePhone((fd.get('phone') || '').toString().trim()),
        city: (fd.get('city') || '').toString().trim(),
        state: (fd.get('state') || '').toString().trim(),
        linkedin: (fd.get('linkedin') || '').toString().trim(),
        squareFootage: Number((fd.get('squareFootage') || '').toString().trim() || 0) || 0,
        occupancyPct: Number((fd.get('occupancyPct') || '').toString().trim() || 0) || 0,
        employees: Number((fd.get('employees') || '').toString().trim() || 0) || 0,
        parentCompanyId: (fd.get('parentCompanyId') || '').toString().trim(),
        parentCompanyName: (fd.get('parentCompanyName') || '').toString().trim(),
        shortDescription: (fd.get('shortDescription') || '').toString().trim(),
        electricitySupplier: (fd.get('electricitySupplier') || '').toString().trim(),
        annualUsage: Number((fd.get('annualUsage') || '').toString().trim() || 0) || 0,
        currentRate: (fd.get('currentRate') || '').toString().trim(),
        contractEndDate: (fd.get('contractEndDate') || '').toString().trim(),
        logoUrl: (fd.get('logoUrl') || '').toString().trim(),
        serviceAddresses: serviceAddresses,
      };

      const id = state.currentAccount?.id;
      const db = window.firebaseDB;
      updates.updatedAt = window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
      if (db && id) {
        try { await db.collection('accounts').doc(id).update(updates); } catch (err) { console.warn('Failed to save account', err); }
      }
      try { Object.assign(state.currentAccount, updates); } catch (_) {}
      try { window.crm?.showToast && window.crm.showToast('Saved'); } catch (_) {}
      try { renderAccountDetail(); } catch (_) {}
      close();
    });
  }

  function attachAccountDetailEvents() {
    // Listen for activity refresh events
    document.addEventListener('pc:activities-refresh', (e) => {
      const { entityType, entityId, forceRefresh } = e.detail || {};
      if (entityType === 'account' && entityId === state.currentAccount?.id) {
        // Refresh account activities
        if (window.ActivityManager) {
          const activityManager = window.ActivityManager; // use singleton
          activityManager.renderActivities('account-activity-timeline', 'account', entityId, forceRefresh);
        }
      }
    });

    // Listen for contact creation events to refresh the contacts list
    document.addEventListener('pc:contact-created', (e) => {
      if (state.currentAccount) {
        // Refresh the contacts list
        const contactsList = document.getElementById('account-contacts-list');
        if (contactsList) {
          contactsList.innerHTML = renderAccountContacts(state.currentAccount);
          // Re-bind event handlers for the new contact items
          bindContactItemEvents();
        }
      }
    });

    const backBtn = document.getElementById('back-to-accounts');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Check if we came from health widget (call scripts page)
        const healthReturnPage = sessionStorage.getItem('health-widget-return-page');
        if (healthReturnPage) {
          sessionStorage.removeItem('health-widget-return-page');
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage(healthReturnPage.replace('-page', ''));
          }
          return;
        }
        
        
        // Check if we came from dashboard activities
        if (window._dashboardNavigationSource === 'activities') {
          // Navigate back to dashboard and restore pagination state
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage('dashboard');
            
            // Restore dashboard pagination state
            setTimeout(() => {
              try {
                const restore = window._dashboardReturn || {};
                if (window.ActivityManager && restore.page !== undefined) {
                  // Restore the specific page
                  window.ActivityManager.goToPage('home-activity-timeline', 'global', restore.page);
                  
                  // Restore scroll position
                  if (restore.scroll !== undefined) {
                    window.scrollTo(0, restore.scroll);
                  }
                }
                
                // Clear navigation markers AFTER successful navigation and restore
                window._dashboardNavigationSource = null;
                window._dashboardReturn = null;
              } catch (error) {
                console.warn('Error restoring dashboard state:', error);
              }
            }, 100);
          }
          return;
        }
        
        // Check if we came from Calls page
        if (window._accountNavigationSource === 'calls') {
          try {
            const restore = window._callsReturn || {};
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('calls');
              // Restore Calls state
              setTimeout(() => {
                try {
                  const ev = new CustomEvent('pc:calls-restore', { detail: {
                    page: restore.page,
                    scroll: restore.scroll,
                    filters: restore.filters,
                    selectedItems: restore.selectedItems,
                    searchTerm: restore.searchTerm
                  }});
                  document.dispatchEvent(ev);
                } catch(_) {}
              }, 60);
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window._callsReturn = null;
          } catch (_) { /* noop */ }
          return;
        }
        
        // Special case: if we arrived here from Contact Detail's company link,
        // return back to that contact detail view.
        if (window._contactNavigationSource === 'contact-detail' && window._contactNavigationContactId) {
          const contactId = window._contactNavigationContactId;
          // Clear the navigation source first
          window._contactNavigationSource = null;
          window._contactNavigationContactId = null;
          try {
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              // Ensure contact detail renders after page switches with longer delay
              setTimeout(() => {
                if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                  window.ContactDetail.show(contactId);
                } else {
                  // Retry mechanism for account-detail navigation
                  let attempts = 0;
                  const maxAttempts = 10;
                  const retryInterval = 100;
                  const retry = () => {
                    attempts++;
                    if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                      window.ContactDetail.show(contactId);
                    } else if (attempts < maxAttempts) {
                      setTimeout(retry, retryInterval);
                    }
                  };
                  retry();
                }
              }, 200);
            }
          } catch (_) { /* noop */ }
          return;
        }

        // If we arrived here from People page (company link), go back to People and restore state
        if (window._accountNavigationSource === 'people') {
          try {
            const restore = window._peopleReturn || {};
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              // Dispatch an event for People page to restore pagination and scroll
              setTimeout(() => {
                try {
                  const ev = new CustomEvent('pc:people-restore', { detail: { page: restore.page, scroll: restore.scroll } });
                  document.dispatchEvent(ev);
                } catch(_) {}
              }, 40);
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window._peopleReturn = null;
          } catch (_) { /* noop */ }
          return;
        }

        // Check if we came from Task Detail page
        if (window._accountNavigationSource === 'task-detail') {
          try {
            const restore = window.__taskDetailRestoreData || {};
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('task-detail');
              // Restore task detail state
              setTimeout(() => {
                try {
                  if (restore.taskId && window.TaskDetail && typeof window.TaskDetail.open === 'function') {
                    window.TaskDetail.open(restore.taskId, restore.source || 'dashboard');
                  }
                } catch(_) {}
              }, 80);
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window.__taskDetailRestoreData = null;
          } catch (_) { /* noop */ }
          return;
        }

        // Check if we came from another Account Detail page (parent/subsidiary navigation)
        if (window._accountNavigationSource === 'account-details') {
          try {
            const restore = window._accountDetailsReturnData || {};
            const returnAccountId = restore.accountId;
            
            if (returnAccountId && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
              // Clear navigation markers first to prevent loops
              window._accountNavigationSource = null;
              window._accountDetailsReturnData = null;
              
              // Navigate back to the previous account detail page
              window.AccountDetail.show(returnAccountId);
              
              // Restore scroll position after the account detail renders
              setTimeout(() => {
                try {
                  const scrollY = parseInt(restore.scroll || 0, 10);
                  if (scrollY > 0) {
                    window.scrollTo(0, scrollY);
                  }
                } catch(_) {}
              }, 100);
            } else {
              // Fallback: if no valid return account ID, go to accounts list
              window._accountNavigationSource = null;
              window._accountDetailsReturnData = null;
              if (window.crm && typeof window.crm.navigateToPage === 'function') {
                window.crm.navigateToPage('accounts');
              }
            }
          } catch (_) {
            // Error fallback: go to accounts list
            window._accountNavigationSource = null;
            window._accountDetailsReturnData = null;
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('accounts');
            }
          }
          return;
        }

        // Check if we came from Accounts page
        if (window._accountNavigationSource === 'accounts') {
          try {
            const restore = window._accountsReturn || {};
            console.log('[Account Detail] Back button: Returning to accounts page with restore data:', restore);
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              // Set robust restoration flags with longer timeout
              try { 
                window.__restoringAccounts = true; 
                window.__restoringAccountsUntil = Date.now() + 10000; // Increased to 10 seconds
                // Store restore data globally for fallback
                window.__accountsRestoreData = restore;
              } catch (_) {}
              
              window.crm.navigateToPage('accounts');
              
              // Dispatch an event for Accounts page to restore UI state when ready
              const start = Date.now();
              const deadline = start + 8000; // Increased to 8 seconds
              let attempts = 0;
              (function tryRestore(){
                attempts++;
                if (Date.now() > deadline) {
                  console.warn('[Account Detail] Back button: Accounts page not ready after 8 seconds, using fallback');
                  // Fallback: try to restore anyway
                try {
                  const ev = new CustomEvent('pc:accounts-restore', { detail: {
                      page: restore.page, scroll: restore.scroll, filters: restore.filters, selectedItems: restore.selectedItems, searchTerm: restore.searchTerm,
                      sortColumn: restore.sortColumn, sortDirection: restore.sortDirection, currentPage: restore.currentPage || restore.page,
                      timestamp: Date.now(), fallback: true
                    } });
                  document.dispatchEvent(ev);
                    console.log('[Account Detail] Back button: Dispatched fallback pc:accounts-restore event');
                } catch(_) {}
                  return;
                }
                
                try {
                  const page = document.getElementById('accounts-page');
                  const accountsModule = window.accountsModule;
                  if (page && page.offsetParent !== null && accountsModule) {
                    const ev = new CustomEvent('pc:accounts-restore', { detail: {
                      page: restore.page, scroll: restore.scroll, filters: restore.filters, selectedItems: restore.selectedItems, searchTerm: restore.searchTerm,
                      sortColumn: restore.sortColumn, sortDirection: restore.sortDirection, currentPage: restore.currentPage || restore.page,
                      timestamp: Date.now()
                    } });
                    document.dispatchEvent(ev);
                    console.log('[Account Detail] Back button: Dispatched pc:accounts-restore event (ready) after', attempts, 'attempts');
                    
                    // Clear global restore data after successful dispatch
                    try { window.__accountsRestoreData = null; } catch(_) {}
                    return;
                  }
                } catch(_) {}
                
                // Use setTimeout instead of requestAnimationFrame for more reliable timing
                setTimeout(tryRestore, 100);
              })();
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window._accountsReturn = null;
          } catch (_) { /* noop */ }
          return;
        }
        
        // Check if we came from list detail page
        if (window._accountNavigationSource === 'list-detail' && window._accountNavigationListId) {
          console.log('Returning to list detail page:', window._accountNavigationListId);
          // Navigate back to list detail page
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            console.log('Navigating to list detail page for account:', window._accountNavigationListId);
            // Seed context so list detail initializes to the correct list and view
            try {
              window.listDetailContext = {
                listId: window._accountNavigationListId,
                listName: window._accountNavigationListName || 'List',
                listKind: (window._accountNavigationListView === 'people') ? 'people' : 'accounts'
              };
            } catch (_) {}
            window.crm.navigateToPage('list-detail');
          }
          // Clear the navigation source
          window._accountNavigationSource = null;
          window._accountNavigationListId = null;
          window._accountNavigationListName = null;
          window._accountNavigationListView = null;
          return;
        }
        
        // Check if we came from adding an account
        if (window._accountNavigationSource === 'add-account') {
          try {
            const restore = window._addAccountReturn || {};
            console.log('[Account Detail] Back button: Returning to page after adding account:', restore);
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              // Navigate back to the page where the user was before adding the account
              const targetPage = restore.page || 'accounts';
              window.crm.navigateToPage(targetPage);
              
              // Restore state if we're going back to accounts page
              if (targetPage === 'accounts') {
                setTimeout(() => {
                  try {
                    const ev = new CustomEvent('pc:accounts-restore', { detail: {
                      page: restore.page,
                      scroll: restore.scroll,
                      searchTerm: restore.searchTerm,
                      sortColumn: restore.sortColumn,
                      sortDirection: restore.sortDirection,
                      selectedItems: restore.selectedItems
                    }});
                    document.dispatchEvent(ev);
                    console.log('[Account Detail] Back button: Dispatched pc:accounts-restore event for add-account flow');
                  } catch(_) {}
                }, 60);
              }
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window._addAccountReturn = null;
          } catch (_) { /* noop */ }
          return;
        }
        
        // Default behavior: return to accounts page
        try { window.crm && window.crm.navigateToPage('accounts'); } catch (e) { /* noop */ }
        // Rebind accounts page dynamic handlers
        if (window.accountsModule && typeof window.accountsModule.rebindDynamic === 'function') {
          try { window.accountsModule.rebindDynamic(); } catch (e) { /* noop */ }
        }
      });
    }

    // Widgets dropdown functionality
    const widgetsBtn = document.getElementById('open-widgets');
    const widgetsWrap = document.querySelector('#account-detail-header .widgets-wrap');
    if (widgetsBtn && widgetsWrap) {
      // Click toggles open state (also support keyboard)
      widgetsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = widgetsWrap.classList.toggle('open');
        widgetsBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // Hover/focus intent: open immediately, close with slight delay
      const openNow = () => {
        clearTimeout(widgetsWrap._closeTimer);
        if (!widgetsWrap.classList.contains('open')) {
          widgetsWrap.classList.add('open');
          widgetsBtn.setAttribute('aria-expanded', 'true');
        }
      };
      const closeSoon = () => {
        clearTimeout(widgetsWrap._closeTimer);
        widgetsWrap._closeTimer = setTimeout(() => {
          widgetsWrap.classList.remove('open');
          widgetsBtn.setAttribute('aria-expanded', 'false');
        }, 320); // slightly longer grace period to move into the drawer
      };

      widgetsWrap.addEventListener('mouseenter', openNow);
      widgetsWrap.addEventListener('mouseleave', closeSoon);
      widgetsWrap.addEventListener('focusin', openNow);
      widgetsWrap.addEventListener('focusout', (e) => {
        // If focus moves outside the wrap, start close timer
        if (!widgetsWrap.contains(e.relatedTarget)) closeSoon();
      });
    }

    // Add contact button
    const addContactBtn = document.getElementById('add-contact-to-account');
    if (addContactBtn) {
      addContactBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openAddContactModal();
      });
    }

    // Widget drawer item clicks
    const widgetsDrawer = document.querySelector('#account-detail-header .widgets-drawer');
    if (widgetsDrawer && !widgetsDrawer._bound) {
      widgetsDrawer.addEventListener('click', (e) => {
        const item = e.target.closest?.('.widget-item');
        if (!item) return;
        const which = item.getAttribute('data-widget');
        handleWidgetAction(which);
      });
      widgetsDrawer._bound = '1';
    }

    // NOTE: Website and LinkedIn quick action buttons now use event delegation
    // Event listener is attached at module initialization on document level
    // This eliminates race conditions when DOM is replaced during account navigation
    // See setupEventDelegation() for implementation

    // Title actions: edit/copy/clear account name (mirror Contact Detail)
    const header = document.getElementById('account-detail-header');
    if (header && !header._nameBound) {
      header.addEventListener('click', async (e) => {
        const row = header.querySelector('.contact-title-row');
        if (!row) return;
        const nameEl = row.querySelector('#account-name');
        const actions = row.querySelector('.title-actions');
        if (!actions) return;

        const editBtn = e.target.closest?.('.title-edit');
        if (editBtn) { e.preventDefault(); openEditAccountModal(); return; }

        const copyBtn = e.target.closest?.('.title-copy');
        if (copyBtn) {
          const txt = (nameEl?.textContent || '').trim();
          try { await navigator.clipboard?.writeText(txt); } catch (_) {}
          try { window.crm?.showToast && window.crm.showToast('Copied'); } catch (_) {}
          return;
        }

        const clearBtn = e.target.closest?.('.title-clear');
        if (clearBtn) {
          e.preventDefault();
          const id = state.currentAccount?.id;
          if (!id || !window.firebaseDB) return;
          try {
            await window.firebaseDB.collection('accounts').doc(id).update({ accountName: '', updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date() });
            if (state.currentAccount) state.currentAccount.accountName = '';
            nameEl.textContent = '';
            window.crm?.showToast && window.crm.showToast('Saved');
          } catch (err) { console.warn('Clear account name failed', err); }
          return;
        }
      });
      header._nameBound = '1';
    }

    // NOTE: "Add to List" button now uses event delegation
    // Event listener is attached at module initialization on document level
    // This eliminates race conditions when DOM is replaced during account navigation
    // See setupEventDelegation() for implementation

    const taskBtn = document.getElementById('open-account-task-popover');
    if (taskBtn && !taskBtn._bound) {
      taskBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (document.querySelector('.task-popover')) {
          try { document.querySelector('.task-popover')?.remove(); } catch(_) {}
        } else {
          openAccountTaskPopover(taskBtn);
        }
      });
      taskBtn._bound = '1';
    }

    // Inline edit/copy/delete for Account Information
    const infoGrids = document.querySelectorAll('#account-detail-view .info-grid');
    infoGrids.forEach(infoGrid => {
      if (infoGrid && !infoGrid._bound) {
        infoGrid.addEventListener('click', async (e) => {
          const wrap = e.target.closest?.('.info-value-wrap');
          if (!wrap) return;
          const field = wrap.getAttribute('data-field');
          if (!field) return;

          // Edit button: switch to input
          const editBtn = e.target.closest('.info-edit');
          if (editBtn) {
            e.preventDefault();
            beginEditField(wrap, field);
            return;
          }
          
          // Copy button
          const copyBtn = e.target.closest('.info-copy');
          if (copyBtn) {
            const txt = wrap.querySelector('.info-value-text')?.textContent?.trim() || '';
            try { await navigator.clipboard?.writeText(txt); } catch (_) {}
            try { window.crm?.showToast && window.crm.showToast('Copied'); } catch (_) {}
            return;
          }
          
          // Delete button
          const delBtn = e.target.closest('.info-delete');
          if (delBtn) {
            e.preventDefault();
            // Special handling for service addresses
            if (field.startsWith('serviceAddress_')) {
              const addressIndex = parseInt(wrap.getAttribute('data-address-index'), 10);
              if (!isNaN(addressIndex)) {
                const a = state.currentAccount;
                if (a && a.serviceAddresses && Array.isArray(a.serviceAddresses)) {
                  // Remove this address from the array
                  const updatedAddresses = a.serviceAddresses.filter((_, idx) => idx !== addressIndex);
                  await saveServiceAddresses(updatedAddresses);
                  // Re-render to update the UI
                  renderAccountDetail();
                  return;
                }
              }
            }
            // Standard delete for other fields
            await saveField(field, '');
            updateFieldText(wrap, '');
            return;
          }
        });
        infoGrid._bound = '1';
      }
    });

    // Contact quick action buttons
    const contactQuickActionBtns = document.querySelectorAll('.contact-quick-action-btn');
    contactQuickActionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent triggering the contact container click
        const action = btn.getAttribute('data-action');
        const contactId = btn.getAttribute('data-contact-id');
        
        if (contactId && window.getPeopleData) {
          try {
            const contacts = window.getPeopleData() || [];
            const contact = contacts.find(c => c.id === contactId);
            if (contact) {
              handleContactQuickAction(action, contact);
            }
          } catch (error) {
            console.error('Error handling contact quick action:', error);
          }
        }
      });
    });

    // Bind contact item events
    bindContactItemEvents();
    
    // Bind contacts pagination
    bindContactsPagination();
    
    // Bind parent company / subsidiaries navigation
    bindParentSubsidiariesNavigation();
    
    // Bind subsidiaries pagination
    bindSubsidiariesPagination();

    // Add Service Address button
    const addServiceAddressBtn = document.getElementById('add-service-address');
    if (addServiceAddressBtn && !addServiceAddressBtn._bound) {
      addServiceAddressBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const a = state.currentAccount;
        if (!a) return;
        
        // Get current service addresses
        const currentAddresses = (a.serviceAddresses && Array.isArray(a.serviceAddresses)) ? a.serviceAddresses : [];
        
        // Add a new empty address
        const newAddress = { address: '', isPrimary: currentAddresses.length === 0 };
        const updatedAddresses = [...currentAddresses, newAddress];
        
        // Save to Firestore
        await saveServiceAddresses(updatedAddresses);
        
        // Re-render the page to show the new address in edit mode
        renderAccountDetail();
        
        // Find the newly added address field and start editing it
        setTimeout(() => {
          const newIndex = updatedAddresses.length - 1;
          const newWrap = document.querySelector(`[data-field="serviceAddress_${newIndex}"]`);
          if (newWrap) {
            beginEditField(newWrap, `serviceAddress_${newIndex}`);
          }
        }, 100);
      });
      addServiceAddressBtn._bound = true;
    }
  }

  function bindContactItemEvents() {
    // Make contact containers clickable to open contact details
    const contactItems = document.querySelectorAll('.contact-item');
    contactItems.forEach(item => {
      // Force font size on contact names
      const contactName = item.querySelector('.contact-name');
      if (contactName) {
        contactName.style.fontSize = '1.1rem';
        contactName.style.fontWeight = '600';
        console.log('Applied font size to contact name:', contactName.textContent);
      }
      
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on quick action buttons
        if (e.target.closest('.contact-quick-action-btn')) return;
        
        const contactId = item.getAttribute('data-contact-id');
        console.log('Contact clicked:', contactId, 'ContactDetail available:', !!window.ContactDetail);
        
        if (contactId) {
          // Store the source page for back button navigation
          window._contactNavigationSource = 'account-details';
          window._contactNavigationAccountId = state.currentAccount?.id;
          
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            // Pre-hide the people page table to prevent flicker before contact detail loads
            const peoplePage = document.getElementById('people-page');
            const tableContainer = peoplePage?.querySelector('.table-container');
            if (tableContainer) {
              tableContainer.classList.add('hidden');
            }
            
            // Navigate to people page and immediately show contact in one smooth motion
            window.crm.navigateToPage('people');
            
            // Use requestAnimationFrame for smoother transition - show contact immediately on next frame
            requestAnimationFrame(() => {
              let attempts = 0;
              const maxAttempts = 15;
              const retryInterval = 50; // Faster retry
              const retry = () => {
                attempts++;
                if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                  window.ContactDetail.show(contactId);
                } else if (attempts < maxAttempts) {
                  setTimeout(retry, retryInterval);
                }
              };
              retry();
            });
          }
        }
      });
    });
  }

  function handleContactQuickAction(action, contact) {
    switch (action) {
      case 'call': {
        // Use company phone number instead of contact's personal phone
        // This allows the contact resolution logic to work properly
        const account = state.currentAccount || {};
        const phone = account.companyPhone || account.phone || account.primaryPhone || account.mainPhone || contact.workDirectPhone || contact.mobile || contact.otherPhone;
        if (phone) {
          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
          try {
            if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
              // Provide both account and contact attribution
              if (typeof window.Widgets.setCallContext === 'function') {
                window.Widgets.setCallContext({
                  accountId: account.id || null,
                  accountName: account.accountName || account.name || account.companyName || null,
                  company: account.accountName || account.name || account.companyName || null,
                  contactId: contact.id || null,
                  contactName: fullName || null,
                  name: fullName || null,
                  city: account.city || account.locationCity || '',
                  state: account.state || account.locationState || '',
                  domain: account.domain || account.website || '',
                  isCompanyPhone: false // This is calling a contact, not company phone
                });
              }
              // Trigger call
              console.log('[Account Detail][DEBUG] Calling contact with phone:', {
                phone: phone,
                contactName: fullName,
                contactId: contact.id,
                accountId: account.id,
                accountName: account.accountName || account.name,
                companyPhone: account.companyPhone
              });
              window.Widgets.callNumber(phone, fullName, true, 'account-detail-contact');
            } else {
              // Fallback to tel: link
              window.open(`tel:${encodeURIComponent(phone)}`);
            }
          } catch (e) { /* noop */ }
        }
        break;
      }
      case 'email': {
        const email = contact.email;
        if (email) {
          try {
            const account = state.currentAccount || {};
            const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || '';
            if (window.EmailCompose && typeof window.EmailCompose.openTo === 'function') {
              window.EmailCompose.openTo(email, fullName);
            } else {
              // Fallback: click compose button and prefill the To field
              document.getElementById('compose-email-btn')?.click();
              setTimeout(()=>{ const to = document.getElementById('compose-to'); if (to) to.value = email; }, 120);
            }
          } catch (e) { /* noop */ }
        }
        break;
      }
    }
  }

  function loadAccountActivities() {
    if (!window.ActivityManager || !state.currentAccount) return;
    
    const accountId = state.currentAccount.id;
    window.ActivityManager.renderActivities('account-activity-timeline', 'account', accountId);
    
    // Setup pagination
    setupActivityPagination('account', accountId);
  }

  function setupActivityPagination(entityType, entityId) {
    const paginationEl = document.getElementById(`${entityType}-activity-pagination`);
    
    if (!paginationEl) return;
    
    // Show pagination if there are more than 4 activities
    const updatePagination = async () => {
      if (!window.ActivityManager) return;
      
      const activities = await window.ActivityManager.getActivities(entityType, entityId);
      const totalPages = Math.ceil(activities.length / window.ActivityManager.maxActivitiesPerPage);
      
      if (totalPages > 1) {
        paginationEl.style.display = 'flex';
        
        // Use unified pagination component
        if (window.crm && window.crm.createPagination) {
          window.crm.createPagination(
            window.ActivityManager.currentPage + 1, 
            totalPages, 
            (page) => {
              window.ActivityManager.goToPage(page - 1, `${entityType}-activity-timeline`, entityType, entityId);
              updatePagination();
            }, 
            paginationEl.id
          );
        }
      } else {
        paginationEl.style.display = 'none';
      }
    };
    
    updatePagination();
  }

  function handleQuickAction(action) {
    const a = state.currentAccount;
    switch (action) {
      case 'call': {
        const phone = a?.companyPhone || a?.phone || a?.primaryPhone || a?.mainPhone;
        if (phone) {
          try {
            if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
              if (typeof window.Widgets.setCallContext === 'function') {
                // Explicitly clear any previous contact context to avoid misattribution
                window.Widgets.setCallContext({
                  accountId: a?.id || null,
                  accountName: a?.accountName || a?.name || a?.companyName || null,
                  company: a?.accountName || a?.name || a?.companyName || null,
                  contactId: null,
                  contactName: null,
                  city: a?.city || a?.locationCity || '',
                  state: a?.state || a?.locationState || '',
                  domain: a?.domain || a?.website || '',
                  isCompanyPhone: true
                });
              }
              const name = a?.accountName || a?.name || a?.companyName || 'Account';
              window.Widgets.callNumber(phone, name, true, 'account-detail');
            } else {
              window.open(`tel:${encodeURIComponent(phone)}`);
            }
          } catch (e) { /* noop */ }
        }
        break;
      }
      case 'linkedin': {
        let url = a?.linkedin || a?.linkedinUrl || a?.linkedin_url || '';
        const name = a?.accountName || a?.name || a?.companyName || '';
        if (!url && name) url = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`;
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        break;
      }
      case 'website': {
        let url = a?.website || a?.site || a?.domain || '';
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        break;
      }
    }
  }

  function handleWidgetAction(which) {
    const accountId = state.currentAccount?.id;
    switch (which) {
      case 'notes': {
        // Toggle Notes: if open, close; else open for this account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isNotesOpen === 'function' && api.isNotesOpen()) {
              if (typeof api.closeNotes === 'function') { api.closeNotes(); return; }
            } else if (typeof api.openNotesForAccount === 'function') {
              api.openNotesForAccount(accountId); return;
            } else if (typeof api.openNotes === 'function') {
              // Fallback to contact version with account prefix
              api.openNotes('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Notes for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Notes'); } catch (_) {}
        break;
      }
      case 'health': {
        // Toggle Health Check: if open, close; else open for this account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isHealthOpen === 'function' && api.isHealthOpen()) {
              if (typeof api.closeHealth === 'function') { api.closeHealth(); return; }
            } else if (typeof api.openHealthForAccount === 'function') {
              api.openHealthForAccount(accountId); return;
            } else if (typeof api.openHealth === 'function') {
              // Fallback to contact version with account prefix
              api.openHealth('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Energy Health Check for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Energy Health Check'); } catch (_) {}
        break;
      }
      case 'deal': {
        // Toggle Deal Calculator: if open, close; else open for this account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isDealOpen === 'function' && api.isDealOpen()) {
              if (typeof api.closeDeal === 'function') { api.closeDeal(); return; }
            } else if (typeof api.openDealForAccount === 'function') {
              api.openDealForAccount(accountId); return;
            } else if (typeof api.openDeal === 'function') {
              // Fallback to contact version with account prefix
              api.openDeal('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Deal Calculator for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Deal Calculator'); } catch (_) {}
        break;
      }
      case 'lusha': {
        // Use Lusha Prospect widget
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isLushaOpen === 'function' && api.isLushaOpen()) {
              if (typeof api.closeLusha === 'function') { api.closeLusha(); return; }
            } else if (typeof api.openLushaForAccount === 'function') {
              api.openLushaForAccount(accountId); return;
            } else if (typeof api.openLusha === 'function') {
              api.openLusha('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Prospect for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Prospect'); } catch (_) {}
        break;
      }
      case 'maps': {
        // Toggle Google Maps: if open, close; else open for this account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isMapsOpen === 'function' && api.isMapsOpen()) {
              if (typeof api.closeMaps === 'function') { api.closeMaps(); return; }
            } else if (typeof api.openMapsForAccount === 'function') {
              api.openMapsForAccount(accountId); return;
            } else if (typeof api.openMaps === 'function') {
              // Fallback to contact version with account prefix
              api.openMaps('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Google Maps for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Google Maps'); } catch (_) {}
        break;
      }
      default:
        console.log('Unknown widget action:', which, 'for account', accountId);
    }
  }

  function getInitials(name) {
    if (!name) return '?';
    return String(name)
      .split(' ')
      .map(w => w.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // SVG icon helpers
  function editIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>`;
  }
  
  function copyIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  }
  
  function trashIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`;
  }
  
  function saveIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>`;
  }






  // ===== Account Task Popover (mirror ContactDetail) =====
  function openAccountTaskPopover(anchorEl) {
    if (!anchorEl) return;
    // Close any existing
    try { document.querySelector('.task-popover')?.remove(); } catch(_) {}
    // Ensure styles are present before first render (so it doesn't rely on Contact Detail injection)
    try { injectAccountTaskPopoverStyles(); } catch(_) {}

    const pop = document.createElement('div');
    pop.className = 'task-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Create task for account');

    const a = state.currentAccount || {};
    const company = a.accountName || a.name || a.companyName || 'this account';

    const nextBiz = (function getNextBusinessDayISO(){ const d=new Date(); let day=d.getDay(); let add=1; if(day===5) add=3; if(day===6) add=2; const nd=new Date(d.getFullYear(), d.getMonth(), d.getDate()+add); const yyyy=nd.getFullYear(); const mm=String(nd.getMonth()+1).padStart(2,'0'); const dd=String(nd.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; })();
    const nextBizDate = new Date(nextBiz + 'T00:00:00');

    pop.innerHTML = `
      <div class="arrow" aria-hidden="true"></div>
      <div class="tp-inner">
        <div class="tp-header">
          <div class="tp-title">Create Task</div>
          <button type="button" class="close-btn" id="tp-close" aria-label="Close">×</button>
        </div>
        <div class="tp-body">
          <form id="account-task-form">
            <div class="form-row">
              <label>Type
                <input type="text" name="type" class="input-dark" value="Phone Call" readonly />
                <button type="button" class="dropdown-toggle-btn" id="type-toggle" aria-label="Open type dropdown">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg>
                </button>
              </label>
              <label>Priority
                <input type="text" name="priority" class="input-dark" value="Medium" readonly />
                <button type="button" class="dropdown-toggle-btn" id="priority-toggle" aria-label="Open priority dropdown">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg>
                </button>
              </label>
            </div>
            <div class="type-toolbar" id="type-toolbar" style="display: none;">
              <div class="dropdown-grid type-grid">
                <button type="button" class="dropdown-option" data-value="phone-call">Phone Call</button>
                <button type="button" class="dropdown-option" data-value="manual-email">Manual Email</button>
                <button type="button" class="dropdown-option" data-value="auto-email">Auto Email</button>
                <button type="button" class="dropdown-option" data-value="follow-up">Follow-up</button>
                <button type="button" class="dropdown-option" data-value="demo">Demo</button>
                <button type="button" class="dropdown-option" data-value="custom-task">Custom Task</button>
              </div>
            </div>
            <div class="priority-toolbar" id="priority-toolbar" style="display: none;">
              <div class="dropdown-grid priority-grid">
                <button type="button" class="dropdown-option" data-value="low">Low</button>
                <button type="button" class="dropdown-option" data-value="medium">Medium</button>
                <button type="button" class="dropdown-option" data-value="high">High</button>
              </div>
            </div>
            <div class="form-row">
              <label>Time
                <input type="text" name="dueTime" class="input-dark" value="10:30 AM" placeholder="10:30 AM" required />
              </label>
              <label>Due date
                <input type="text" name="dueDate" class="input-dark" value="${(nextBizDate.getMonth() + 1).toString().padStart(2, '0')}/${nextBizDate.getDate().toString().padStart(2, '0')}/${nextBizDate.getFullYear()}" readonly />
                <button type="button" class="calendar-toggle-btn" id="calendar-toggle" aria-label="Open calendar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </button>
              </label>
            </div>
            <div class="calendar-toolbar" id="calendar-toolbar" style="display: none;">
              <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" id="calendar-prev" aria-label="Previous month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg></button>
                <div class="calendar-month-year" id="calendar-month-year">September 2025</div>
                <button type="button" class="calendar-nav-btn" id="calendar-next" aria-label="Next month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg></button>
              </div>
              <div class="calendar-weekdays">
                <div class="calendar-weekday">S</div>
                <div class="calendar-weekday">M</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">W</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">F</div>
                <div class="calendar-weekday">S</div>
              </div>
              <div class="calendar-days" id="calendar-days"></div>
            </div>
            <div class="form-row" style="grid-template-columns: 1fr;">
              <label>Notes
                <textarea name="notes" class="input-dark" rows="3" placeholder="Add context (optional)"></textarea>
              </label>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary" id="tp-save">Create Task</button>
            </div>
          </form>
        </div>
      </div>`;

    document.body.appendChild(pop);

    // Position under anchor
    const position = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const anchorCenter = rect.left + rect.width / 2;
      const desiredLeft = Math.round(window.scrollX + anchorCenter - popRect.width / 2);
      const clampedLeft = Math.max(8, Math.min(desiredLeft, (window.scrollX + document.documentElement.clientWidth) - popRect.width - 8));
      const top = Math.round(window.scrollY + rect.bottom + 10);
      pop.style.top = `${top}px`;
      pop.style.left = `${clampedLeft}px`;
      try { pop.style.setProperty('--arrow-left', `${Math.round(anchorCenter - clampedLeft)}px`); pop.setAttribute('data-placement','bottom'); } catch(_) {}
      const arrow = pop.querySelector('.arrow');
      if (arrow) {
        const anchorCenterRelativeToPopover = anchorCenter - clampedLeft;
        arrow.style.left = `${anchorCenterRelativeToPopover}px`;
      }
    };
    position();
    requestAnimationFrame(() => { position(); setTimeout(() => pop.classList.add('--show'), 10); });

    // Bind events similar to ContactDetail
    const form = pop.querySelector('#account-task-form');
    const closeBtn = pop.querySelector('#tp-close');
    closeBtn?.addEventListener('click', () => { try { pop.remove(); } catch(_) {} });

    // Dropdown toggles
    const typeToggle = pop.querySelector('#type-toggle');
    const priorityToggle = pop.querySelector('#priority-toggle');
    const typeToolbar = pop.querySelector('#type-toolbar');
    const priorityToolbar = pop.querySelector('#priority-toolbar');
    const calendarToggle = pop.querySelector('#calendar-toggle');
    const calendarToolbar = pop.querySelector('#calendar-toolbar');
    const dateInput = pop.querySelector('input[name="dueDate"]');
    const toggleToolbar = (el) => {
      if (!el) return;
      const isOpen = el.classList.contains('dropdown-slide-in');
      const others = [typeToolbar, priorityToolbar].filter(x => x && x !== el);
      others.forEach(x => x.classList.remove('dropdown-slide-in'));
      if (isOpen) el.classList.remove('dropdown-slide-in'); else el.classList.add('dropdown-slide-in');
    };
    typeToggle?.addEventListener('click', () => toggleToolbar(typeToolbar));
    priorityToggle?.addEventListener('click', () => toggleToolbar(priorityToolbar));

    // Calendar dropdown (mirrors Contact Detail behavior)
    let calDate = new Date();
    function toMDY(d){ const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); const yyyy=d.getFullYear(); return `${mm}/${dd}/${yyyy}`; }
    function renderCalendar(){
      if (!calendarToolbar) return;
      const y = calDate.getFullYear(); const m = calDate.getMonth();
      const first = new Date(y, m, 1); const last = new Date(y, m+1, 0);
      const start = first.getDay(); const total = last.getDate();
      const todayISO = new Date().toISOString().split('T')[0];
      const label = first.toLocaleString(undefined, { month:'long', year:'numeric' });
      const days = [];
      for (let i=0;i<start;i++) days.push('<span></span>');
      for (let d=1; d<=total; d++){
        const iso = new Date(y,m,d).toISOString().split('T')[0];
        const isToday = iso === todayISO ? 'today' : '';
        days.push(`<button type="button" data-iso="${iso}" class="${isToday}">${d}</button>`);
      }
      calendarToolbar.innerHTML = `
        <header><button type="button" id="acct-cal-prev">◀</button><div class="month-label">${label}</div><button type="button" id="acct-cal-next">▶</button></header>
        <div class="calendar-grid">${days.join('')}</div>`;
      calendarToolbar.querySelector('#acct-cal-prev')?.addEventListener('click', ()=>{ calDate = new Date(y, m-1, 1); renderCalendar(); });
      calendarToolbar.querySelector('#acct-cal-next')?.addEventListener('click', ()=>{ calDate = new Date(y, m+1, 1); renderCalendar(); });
      calendarToolbar.querySelectorAll('.calendar-grid button[data-iso]')?.forEach(btn=>{
        btn.addEventListener('click', ()=>{ try { const sel = new Date(btn.getAttribute('data-iso')); dateInput.value = toMDY(sel); closeCalendar(); } catch(_){} });
      });
    }
    function openCalendar(){ if (!calendarToolbar) return; renderCalendar(); calendarToolbar.style.display='block'; calendarToolbar.offsetHeight; calendarToolbar.classList.add('calendar-slide-in'); pop.classList.add('calendar-expanded'); }
    function closeCalendar(){ if (!calendarToolbar) return; calendarToolbar.classList.remove('calendar-slide-in'); calendarToolbar.classList.add('calendar-slide-out'); setTimeout(()=>{ calendarToolbar.style.display='none'; calendarToolbar.classList.remove('calendar-slide-out'); }, 200); pop.classList.remove('calendar-expanded'); }
    function toggleCalendar(){ const visible = calendarToolbar && calendarToolbar.style.display === 'block'; if (visible) closeCalendar(); else openCalendar(); }
    calendarToggle?.addEventListener('click', (e)=>{ e.stopPropagation(); toggleCalendar(); });
    calendarToolbar?.addEventListener('mousedown', (e)=> e.stopPropagation());
    pop.addEventListener('click', (e) => {
      const opt = e.target.closest?.('.dropdown-option');
      if (!opt) return;
      const grid = opt.parentElement;
      grid.querySelectorAll('.dropdown-option').forEach(b => b.classList.remove('selected'));
      opt.classList.add('selected');
      const value = opt.getAttribute('data-value');
      if (grid.classList.contains('type-grid')) {
        const input = pop.querySelector('input[name="type"]');
        if (input) input.value = (value === 'phone-call') ? 'Phone Call' : value.replace(/-/g,' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      } else {
        const input = pop.querySelector('input[name="priority"]');
        if (input) input.value = value.charAt(0).toUpperCase() + value.slice(1);
      }
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const type = String(fd.get('type') || '').trim();
      const priority = String(fd.get('priority') || '').trim();
      const dueDate = String(fd.get('dueDate') || '').trim();
      const dueTime = String(fd.get('dueTime') || '').trim();
      const notes = String(fd.get('notes') || '').trim();
      if (!type || !priority || !dueDate || !dueTime) return;
      // Use shared function from main CRM class if available
      let title;
      if (window.crm && typeof window.crm.buildTaskTitle === 'function') {
        title = window.crm.buildTaskTitle(type, '', company);
      } else {
        // Fallback to new format
        const typeMap = {
          'phone-call': 'Call',
          'manual-email': 'Email',
          'auto-email': 'Email',
          'li-connect': 'Add on LinkedIn',
          'li-message': 'Send a message on LinkedIn',
          'li-view-profile': 'View LinkedIn profile',
          'li-interact-post': 'Interact with LinkedIn Post',
          'custom-task': 'Custom Task for',
          'follow-up': 'Follow-up with',
          'demo': 'Demo for'
        };
        const action = typeMap[type] || 'Task for';
        title = `${action} ${company}`;
      }
      const newTask = {
        id: 'task_' + Date.now(),
        title,
        contact: '',
        contactId: '',
        account: company,
        accountId: a.id || '',
        type,
        priority,
        dueDate,
        dueTime,
        status: 'pending',
        notes,
        createdAt: Date.now()
      };
      try {
        const key = 'userTasks';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift(newTask);
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (_) { /* noop */ }
      try {
        const db = window.firebaseDB;
        if (db) {
          await db.collection('tasks').add({
            ...newTask,
            timestamp: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
          });
        }
      } catch (err) {
        console.warn('Failed to save task to Firebase:', err);
      }
      try { window.crm?.showToast && window.crm.showToast('Task created'); } catch (_) {}
      try { window.crm && typeof window.crm.loadTodaysTasks === 'function' && window.crm.loadTodaysTasks(); } catch(_) {}
      try { window.dispatchEvent(new CustomEvent('tasksUpdated', { detail: { source: 'account-detail', task: newTask } })); } catch(_) {}
      try { pop.remove(); } catch(_) {}
    });

    // Outside click and Escape close (and close toolbars)
    const onOutside = (ev) => { if (!pop.contains(ev.target) && ev.target !== anchorEl) { cleanup(); } };
    const onEsc = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); cleanup(); } };
    function cleanup(){ try { document.removeEventListener('mousedown', onOutside, true); document.removeEventListener('keydown', onEsc, true); } catch(_) {} try { pop.remove(); } catch(_) {} }
    setTimeout(()=>{ document.addEventListener('mousedown', onOutside, true); document.addEventListener('keydown', onEsc, true); }, 0);
  }
  // Begin inline editing for a field
  function beginEditField(wrap, field) {
    const textEl = wrap.querySelector('.info-value-text');
    if (!textEl) return;
    
    const currentText = textEl.textContent || '';
    
    const isMultiline = field === 'shortDescription';
    const inputControl = isMultiline
      ? `<textarea class="textarea-dark info-edit-textarea" rows="4">${escapeHtml(currentText === '--' ? '' : currentText)}</textarea>`
    : (field === 'contractEndDate' 
      ? `<input type="date" class="info-edit-input" value="${escapeHtml(toISODate(currentText))}">`
      : `<input type="text" class="info-edit-input" value="${escapeHtml(currentText === '--' ? '' : currentText)}">`);
    const inputHtml = `
      ${inputControl}
      <div class="info-actions">
        <button class="icon-btn-sm info-save" title="Save">
          ${saveIcon()}
        </button>
        <button class="icon-btn-sm info-cancel" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
    
    wrap.classList.add('editing');
    textEl.style.display = 'none';
    
    const actionsEl = wrap.querySelector('.info-actions');
    if (actionsEl) {
      actionsEl.remove();
    }
    
    const inputWrap = document.createElement('div');
    inputWrap.className = 'info-input-wrap' + (isMultiline ? ' info-input-wrap--multiline' : '');
    inputWrap.innerHTML = inputHtml;
    
    const input = inputWrap.querySelector(isMultiline ? 'textarea' : 'input');
    const saveBtn = inputWrap.querySelector('.info-save');
    const cancelBtn = inputWrap.querySelector('.info-cancel');
    
    if (input && saveBtn && cancelBtn) {
      wrap.appendChild(inputWrap);
      input.focus();
      
      // Live comma formatting for annual usage (mirror contact details UX)
      if (field === 'annualUsage') {
        // Seed input with digits only (strip commas)
        const seed = (currentText === '--' ? '' : currentText).replace(/,/g, '');
        input.value = seed;
        input.addEventListener('input', (e) => {
          const el = e.target;
          const raw = String(el.value || '').replace(/[^0-9]/g, '');
          const beforeLen = String(el.value || '').length;
          const caret = el.selectionStart || 0;
          const formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          el.value = formatted;
          // Best-effort caret restore
          const afterLen = formatted.length;
          const delta = afterLen - beforeLen;
          const nextCaret = Math.max(0, Math.min(afterLen, caret + delta));
          try { el.setSelectionRange(nextCaret, nextCaret); } catch (_) {}
        });
      }
      
      // Add supplier suggestions for electricity supplier field
      if (field === 'electricitySupplier') {
        console.log('[Account Detail] Adding supplier suggestions for field:', field);
        console.log('[Account Detail] window.addSupplierSuggestions available:', !!window.addSupplierSuggestions);
        console.log('[Account Detail] window.SupplierNames available:', !!window.SupplierNames, 'count:', window.SupplierNames?.length);
        if (window.addSupplierSuggestions) {
          window.addSupplierSuggestions(input, 'account-supplier-list');
          console.log('[Account Detail] Supplier suggestions added to input');
        } else {
          console.warn('[Account Detail] window.addSupplierSuggestions not available');
        }
      }
      
      // Save handler
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await commitEdit(wrap, field, input.value);
      });
      
      // Cancel handler
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cancelEdit(wrap, field, currentText);
      });
      
      // Enter/Escape key handler (Ctrl+Enter to save for multiline)
      input.addEventListener('keydown', async (e) => {
        if (!isMultiline && e.key === 'Enter') {
          e.preventDefault();
          await commitEdit(wrap, field, input.value);
        } else if (isMultiline && (e.key === 'Enter') && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          await commitEdit(wrap, field, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit(wrap, field, currentText);
        }
      });

      // Only apply live MM/DD/YYYY formatting when editing plain text (not the native date input)
      if (field === 'contractEndDate' && !isMultiline && input.type === 'text') {
        input.addEventListener('input', () => {
          const caret = input.selectionStart;
          const formatted = formatDateInputAsMDY(input.value);
          input.value = formatted;
          try { input.selectionStart = input.selectionEnd = Math.min(formatted.length, (caret||formatted.length)); } catch(_) {}
        });
      }
    }
  }

  // Parse phone number and extension from various formats
  function parsePhoneWithExtension(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return { number: '', extension: '' };
    
    // Common extension patterns
    const extensionPatterns = [
      /ext\.?\s*(\d+)/i,
      /extension\s*(\d+)/i,
      /x\.?\s*(\d+)/i,
      /#\s*(\d+)/i,
      /\s+(\d{3,6})\s*$/  // 3-6 digits at the end (common extension length)
    ];
    
    let number = raw;
    let extension = '';
    
    // Try to find extension using various patterns
    for (const pattern of extensionPatterns) {
      const match = number.match(pattern);
      if (match) {
        extension = match[1];
        number = number.replace(pattern, '').trim();
        break;
      }
    }
    
    return { number, extension };
  }

  // Normalize phone number to formatted display format (not E.164)
  // Returns formatted like: +1 (214) 879-1555 or +1 (214) 879-1555 ext. 123
  function normalizePhone(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return '';
    
    // Parse phone number and extension
    const parsed = parsePhoneWithExtension(raw);
    if (!parsed.number) return '';
    
    // Format the main number
    let formattedNumber = '';
    const cleaned = parsed.number.replace(/\D/g, '');
    
    // Always display US numbers with +1 prefix and formatting
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      formattedNumber = `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      formattedNumber = `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    } else if (/^\+/.test(String(parsed.number))) {
      // International number - keep as-is
      formattedNumber = parsed.number;
    } else if (cleaned.length >= 8) {
      // International without +, add it
      formattedNumber = '+' + cleaned;
    } else {
      // Fallback: return original if we can't format
      return raw;
    }
    
    // Add extension if present
    if (parsed.extension) {
      return `${formattedNumber} ext. ${parsed.extension}`;
    }
    
    return formattedNumber;
  }

  // Commit the edit to Firestore and update UI
  async function commitEdit(wrap, field, value) {
    console.log('[Account Detail] commitEdit called:', { field, value, type: typeof value });
    
    // Special handling for service addresses
    if (field.startsWith('serviceAddress_')) {
      const addressIndex = parseInt(wrap.getAttribute('data-address-index'), 10);
      if (!isNaN(addressIndex)) {
        const a = state.currentAccount;
        if (a && a.serviceAddresses && Array.isArray(a.serviceAddresses)) {
          const updatedAddresses = [...a.serviceAddresses];
          updatedAddresses[addressIndex] = {
            ...updatedAddresses[addressIndex],
            address: value.trim()
          };
          await saveServiceAddresses(updatedAddresses);
          // Update UI
          cancelEdit(wrap, field, value);
          renderAccountDetail();
          return;
        }
      }
    }
    
    // Convert contractEndDate to ISO for storage, display as MM/DD/YYYY via updateFieldText
    let toSave = value;
    if (field === 'contractEndDate') {
      console.log('[Account Detail] Processing contractEndDate:', { original: value });
      toSave = toMDY(value);
      console.log('[Account Detail] Converted to MDY:', { converted: toSave });
    }
    // Normalize phone numbers for any recognized phone key
    if (field === 'phone' || field === 'companyPhone' || field === 'primaryPhone' || field === 'mainPhone') {
      toSave = normalizePhone(value);
    }
    // If website updated, also compute and persist domain, then refresh header favicon
    if (field === 'website') {
      try {
        const src = String(value || '').trim();
        let nextDomain = '';
        if (src) {
          try {
            const u = new URL(/^https?:\/\//i.test(src) ? src : `https://${src}`);
            nextDomain = (u.hostname || '').replace(/^www\./i, '');
          } catch (_) {
            nextDomain = src.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
          }
        }
        if (nextDomain) {
          // Save both website and derived domain
          await saveField('domain', nextDomain);
          // Dispatch account-updated so tables/people can refresh favicons
          try {
            const id = state.currentAccount?.id;
            const ev = new CustomEvent('pc:account-updated', { detail: { id, changes: { domain: nextDomain, website: toSave, updatedAt: new Date() } } });
            document.dispatchEvent(ev);
          } catch (_) { /* noop */ }
          // Refresh header favicon (cache-bust)
          try {
            const header = document.getElementById('account-detail-header');
            const img = header && header.querySelector('img.avatar-favicon');
            if (img) {
              const ts = Date.now();
              // Update favicon using the new helper system
              if (window.__pcFaviconHelper) {
                const faviconHTML = window.__pcFaviconHelper.generateFaviconHTML(nextDomain, 64);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = faviconHTML;
                const newImg = tempDiv.querySelector('.company-favicon');
                if (newImg) {
                  img.src = newImg.src;
                }
              } else {
                img.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(nextDomain)}&ts=${ts}`;
              }
              img.style.display = '';
              const initials = header.querySelector('.avatar-circle-small');
              if (initials) initials.style.display = 'none';
            }
          } catch (_) { /* noop */ }
        }
      } catch (_) { /* noop */ }
    }
    console.log('[Account Detail] Saving to Firebase:', { field, toSave });
    await saveField(field, toSave);
    updateFieldText(wrap, toSave);
    
    // If phone field was updated, refresh all click-to-call bindings with the new number
    if (field === 'phone' || field === 'companyPhone' || field === 'primaryPhone' || field === 'mainPhone') {
      try {
        // Give the UI a moment to update, then reprocess all phone elements
        setTimeout(() => {
          if (window.ClickToCall && typeof window.ClickToCall.processSpecificPhoneElements === 'function') {
            console.log('[Account Detail] Refreshing click-to-call bindings after phone update');
            window.ClickToCall.processSpecificPhoneElements();
          }
        }, 100);
      } catch (_) { /* noop */ }
    }
    
    // Notify other pages (e.g., Accounts list) about immediate account changes
    try {
      const id = state.currentAccount?.id;
      const updatedAt = new Date();
      const ev = new CustomEvent('pc:account-updated', { detail: { id, changes: { [field]: toSave, updatedAt } } });
      document.dispatchEvent(ev);
    } catch (_) { /* noop */ }
    // Notify widgets/pages to refresh energy fields
    try { document.dispatchEvent(new CustomEvent('pc:energy-updated', { detail: { entity: 'account', id: state.currentAccount?.id, field, value: toSave } })); } catch(_) {}
    cancelEdit(wrap, field, toSave);
  }

  // Cancel the edit and restore original value
  function cancelEdit(wrap, field, originalValue) {
    const inputWrap = wrap.querySelector('.info-input-wrap');
    if (inputWrap) {
      inputWrap.remove();
    }
    
    const textEl = wrap.querySelector('.info-value-text');
    if (textEl) {
      textEl.style.display = '';
    }
    
    wrap.classList.remove('editing');
    ensureDefaultActions(wrap);
  }
  
  // Save field value to Firestore
  async function saveField(field, value) {
    const accountId = state.currentAccount?.id;
    if (!accountId) return;
    
    try {
      const db = window.firebaseDB;
      if (db && typeof db.collection === 'function') {
        await db.collection('accounts').doc(accountId).update({
          [field]: value,
          updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
        });
        
        // Update local state
        if (state.currentAccount) {
          state.currentAccount[field] = value;
        }
        
        // Also update the global accounts cache to ensure click-to-call uses fresh data
        try {
          if (typeof window.getAccountsData === 'function' && accountId) {
            const accounts = window.getAccountsData();
            const idx = accounts.findIndex(a => a.id === accountId);
            if (idx !== -1) {
              accounts[idx][field] = value;
              accounts[idx].updatedAt = new Date();
              console.log('[Account Detail] Updated global accounts cache:', field, '=', value);
            }
          }
        } catch (_) { /* noop */ }
        
        window.crm?.showToast && window.crm.showToast('Saved');
      }
    } catch (err) {
      console.warn('Save field failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to save');
    }
  }

  // Save service addresses array to Firestore
  async function saveServiceAddresses(addresses) {
    const accountId = state.currentAccount?.id;
    if (!accountId) return;
    
    try {
      const db = window.firebaseDB;
      if (db && typeof db.collection === 'function') {
        await db.collection('accounts').doc(accountId).update({
          serviceAddresses: addresses,
          updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
        });
        
        // Update local state
        if (state.currentAccount) {
          state.currentAccount.serviceAddresses = addresses;
        }
        
        // Also update the global accounts cache
        try {
          if (typeof window.getAccountsData === 'function' && accountId) {
            const accounts = window.getAccountsData();
            const idx = accounts.findIndex(a => a.id === accountId);
            if (idx !== -1) {
              accounts[idx].serviceAddresses = addresses;
              accounts[idx].updatedAt = new Date();
            }
          }
        } catch (_) { /* noop */ }
        
        window.crm?.showToast && window.crm.showToast('Saved');
      }
    } catch (err) {
      console.warn('Save service addresses failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to save');
    }
  }
  
  // Update field text in UI
  function updateFieldText(wrap, value) {
    const textEl = wrap.querySelector('.info-value-text');
    const field = wrap.getAttribute('data-field');
    if (!textEl) return;
    const val = value == null ? '' : String(value);
    if (field === 'website' && val) {
      const url = /^https?:\/\//i.test(val) ? val : 'https://' + val;
      textEl.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(val)}</a>`;
    } else if (field === 'shortDescription') {
      // Preserve line breaks for paragraph field
      const safe = escapeHtml(val);
      textEl.classList.add('info-value-text--multiline');
      textEl.innerHTML = safe ? safe.replace(/\n/g, '<br>') : '--';
    } else if (field === 'contractEndDate') {
      const pretty = toMDY(val);
      textEl.textContent = pretty || '--';
    } else if (field === 'annualUsage' && val) {
      const numeric = String(val).replace(/[^0-9]/g, '');
      textEl.textContent = numeric ? numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--';
    } else if (field === 'companyPhone' || field === 'phone' || field === 'primaryPhone' || field === 'mainPhone') {
      // For phone fields, display in human-friendly format and bind click-to-call immediately
      const display = formatPhoneForDisplayLocal(val);
      textEl.textContent = display || '--';
      try { bindAccountDetailPhoneClick(textEl, val); } catch(_) {}
    } else {
      textEl.textContent = val || '--';
    }
  }

  // Local helper: display phone as +1 (AAA) BBB-CCCC (similar to click-to-call)
  function formatPhoneForDisplayLocal(phone) {
    if (!phone) return '';
    const raw = String(phone);
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `+1 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    if (/^\+/.test(raw)) return raw; // already E.164 with country code
    return raw; // fallback
  }

  // After save, ensure the phone element is immediately clickable without reload
  function bindAccountDetailPhoneClick(el, originalValue) {
    if (!el) return;
    const text = (el.textContent || '').trim();
    const cleaned = String(originalValue || text || '').replace(/[^\d\+]/g, '');
    // Require at least 10 digits
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length < 10) return;
    
    // Remove ALL existing click handlers by cloning the element (most reliable way)
    const clone = el.cloneNode(true);
    if (el.parentNode) {
      el.parentNode.replaceChild(clone, el);
    }
    // Update our reference to point to the new cloned element
    el = clone;
    
    // Set pointer and tooltip
    try {
      el.style.cursor = 'pointer';
      const account = state.currentAccount || {};
      const companyName = account.accountName || account.name || account.companyName || '';
      const displayPhone = formatPhoneForDisplayLocal(cleaned);
      const tt = `Call ${displayPhone}${companyName ? ` (${companyName})` : ''}`;
      el.setAttribute('data-pc-title', tt);
      el.removeAttribute('title');
      // Ensure data attributes are present for consistent hover logic elsewhere
      if (account.id) el.setAttribute('data-account-id', account.id);
      if (companyName) el.setAttribute('data-company-name', companyName);
      // Explicitly remove contact attributes to prevent contact lookup
      el.removeAttribute('data-contact-id');
      el.removeAttribute('data-contact-name');
      
      console.log('[Account Detail] Phone click binding updated with new number:', displayPhone);
    } catch(_) {}
    
    // Create new click handler (using closure to capture current phone number)
    const callNum = digitsOnly.length === 10 ? `+1${digitsOnly}` : (cleaned.startsWith('+') ? cleaned : `+${digitsOnly}`);
    console.log('[Account Detail] Creating click handler with phone number:', callNum);
    
    el._pcClickHandler = function(e){
      try { 
        e.preventDefault(); 
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        else e.stopPropagation(); 
      } catch(_) {}
      
      console.log('[Account Detail] Phone clicked, calling:', callNum);
      // Set call context explicitly to company mode
      try {
        if (window.Widgets && typeof window.Widgets.setCallContext === 'function') {
          // Use the current account from state directly (most reliable)
          const account = state.currentAccount || {};
          
          // Extract domain from website if needed
          let domain = account.domain || '';
          if (!domain && account.website) {
            try {
              const url = account.website.startsWith('http') ? account.website : `https://${account.website}`;
              const u = new URL(url);
              domain = u.hostname.replace(/^www\./i, '');
            } catch(_) {
              domain = String(account.website).replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
            }
          }
          
          // Compute logoUrl with robust fallbacks (account fields -> DOM -> text link)
          const logoUrlComputed = (function(){
            try {
              const fromAccount = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon || account.imageUrl || account.companyImage;
              if (fromAccount) return String(fromAccount);
              const root = document.querySelector('#account-detail-view') || document;
              // Try common header/avatar locations first
              const imgSel = [
                '#account-detail-header img.company-favicon',
                '.page-header img.company-favicon',
                '.account-header img.company-favicon',
                '.company-cell__wrap img.company-favicon',
                '#account-detail-header img[alt=""]',
                '.page-header img[alt=""]',
                '.account-header img[alt=""]',
                '#account-detail-header img',
                '.page-header img',
                '.account-header img'
              ].join(',');
              const img = root.querySelector(imgSel);
              if (img && img.src) return img.src;
              // Try explicit logoUrl field in the info grid
              const link = root.querySelector('.info-value-wrap[data-field="logoUrl"] a');
              if (link && link.href) return link.href;
              const textEl = root.querySelector('.info-value-wrap[data-field="logoUrl"] .info-value-text');
              const rawText = textEl && textEl.textContent ? textEl.textContent.trim() : '';
              if (rawText && /^https?:\/\//i.test(rawText)) return rawText;
              return '';
            } catch(_) { return ''; }
          })();
          
          const callContext = {
            accountId: account.id || null,
            accountName: account.accountName || account.name || account.companyName || null,
            company: account.accountName || account.name || account.companyName || null,
            contactId: null,
            contactName: '',
            name: account.accountName || account.name || account.companyName || '',
            city: account.city || account.locationCity || '',
            state: account.state || account.locationState || '',
            domain: domain,
            logoUrl: logoUrlComputed || '',
            isCompanyPhone: true
          };
          
          console.log('[Account Detail] Setting call context with phone:', callNum);
          window.Widgets.setCallContext(callContext);
          
          // Mark that we've set a specific context to prevent generic click-to-call from overriding
          try {
            window._pcPhoneContextSetByPage = true;
            // Clear the flag after a short delay to allow the click event to use it
            setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 100);
          } catch(_) {}
        }
      } catch(_) {}
      try {
        if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
          // Mark the exact time of the user click to prove a fresh gesture
          try { window.Widgets._lastClickToCallAt = Date.now(); } catch(_) {}
          
          console.log('[Account Detail] Calling Widgets.callNumber with:', callNum);
          // Use 'click-to-call' source to ensure auto-trigger works
          window.Widgets.callNumber(callNum.replace(/\D/g,''), '', true, 'click-to-call');
        } else {
          console.log('[Account Detail] Falling back to tel: link');
          window.open(`tel:${encodeURIComponent(callNum)}`);
        }
      } catch(_) {}
    };
    
    // Bind the new click handler
    el.addEventListener('click', el._pcClickHandler);
    el._pcClickBound = true;
    el.classList.add('clickable-phone');
    console.log('[Account Detail] Click handler attached to phone element');
  }

  // Ensure default action buttons (edit/copy/delete) exist after editing lifecycle
  function ensureDefaultActions(wrap) {
    if (wrap.querySelector('.info-actions')) return;
    const actions = document.createElement('div');
    actions.className = 'info-actions';
    actions.innerHTML = `
      <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
      <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
      <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>`;
    wrap.appendChild(actions);
  }
  
  // Listen for energy updates from Health Widget to update Energy & Contract section
  function setupEnergyUpdateListener() {
    const onEnergyUpdated = (e) => {
      try {
        const d = e.detail || {};
        console.log('[Account Detail] Received energy update event:', d, 'Current account ID:', state.currentAccount?.id);
        // Only update if this is for the current account
        if (d.entity === 'account' && d.id === state.currentAccount?.id) {
          const field = d.field;
          const value = d.value;
          
          // Update the Energy & Contract section display
          const energyGrid = document.getElementById('account-energy-grid');
          if (energyGrid) {
            const fieldWrap = energyGrid.querySelector(`.info-value-wrap[data-field="${field}"]`);
            if (fieldWrap) {
              // Check if field is in editing mode
              const isEditing = fieldWrap.classList.contains('editing');
              
              if (isEditing) {
                // Update the input field value when in editing mode
                const inputEl = fieldWrap.querySelector('.info-edit-input');
                if (inputEl) {
                  let inputValue = value || '';
                  if (field === 'contractEndDate' && value) {
                    // Convert MM/DD/YYYY to YYYY-MM-DD for date input
                    const d = parseDateFlexible(value);
                    if (d) {
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      inputValue = `${yyyy}-${mm}-${dd}`;
                    }
                  }
                  inputEl.value = inputValue;
                }
              } else {
                // Update the text element when not in editing mode
                const textEl = fieldWrap.querySelector('.info-value .info-value-text') || fieldWrap.querySelector('.info-value-text');
                if (textEl) {
                  // Format the value for display
                  let displayValue = value || '--';
                  if (field === 'contractEndDate' && value) {
                    displayValue = toMDY(value);
                  }
                  textEl.textContent = displayValue;
                }
              }
            }
          }
        }
      } catch(_) {}
    };
    
    document.addEventListener('pc:energy-updated', onEnergyUpdated);
    
    // Return cleanup function
    return () => {
      document.removeEventListener('pc:energy-updated', onEnergyUpdated);
    };
  }

  // ===== Lists integration (Add to List) =====
  let _onAccountListsKeydown = null;
  let _positionAccountListsPanel = null;
  let _onAccountListsOutside = null;

  function injectAccountListsStyles() {
    let style = document.getElementById('account-detail-lists-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'account-detail-lists-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
      /* Account Detail: Add to List panel */
      #account-lists-panel { position: fixed; z-index: 1200; width: min(560px, 92vw);
        background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light);
        border-radius: var(--border-radius); box-shadow: var(--elevation-card-hover, 0 16px 40px rgba(0,0,0,.28), 0 6px 18px rgba(0,0,0,.22));
        transform: translateY(-8px); opacity: 0; transition: transform 400ms ease, opacity 400ms ease;
        /* Avoid clipping the pointer arrow */
        --arrow-size: 10px; }
      #account-lists-panel.--show { transform: translateY(0); opacity: 1; }
      #account-lists-panel .list-header { 
        display: flex; align-items: center; justify-content: space-between; 
        padding: 14px 16px; border-bottom: 1px solid var(--border-light); 
        font-weight: 700; background: var(--bg-card); 
      }
      #account-lists-panel .list-title { 
        font-weight: 700; color: var(--text-primary); font-size: 1rem; 
      }
      #account-lists-panel .close-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0;
        background: var(--bg-item) !important; color: var(--grey-300) !important;
        border: 1px solid var(--border-light); border-radius: var(--border-radius-sm);
        line-height: 1; font-size: 16px; font-weight: 600; cursor: pointer;
        transition: var(--transition-fast); box-sizing: border-box;
        -webkit-tap-highlight-color: transparent; margin-right: 0;
      }
      #account-lists-panel .close-btn:hover {
        background: var(--grey-600) !important; color: var(--text-inverse) !important;
      }
      #account-lists-panel .close-btn:focus-visible {
        outline: 2px solid var(--orange-muted); outline-offset: 2px;
      }
      #account-lists-panel .list-body { max-height: min(70vh, 720px); overflow: auto; background: var(--bg-card); }
      #account-lists-panel .list-body::-webkit-scrollbar { width: 10px; }
      #account-lists-panel .list-body::-webkit-scrollbar-thumb { background: var(--grey-700); border-radius: 8px; }
      #account-lists-panel .list-item { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; cursor:pointer; background: var(--bg-card); border-top: 1px solid var(--border-light); }
      #account-lists-panel .list-item:first-child { border-top: 0; }
      #account-lists-panel .list-item:hover { background: var(--bg-hover); }
      #account-lists-panel .list-item[aria-disabled="true"] { opacity: .6; cursor: default; }
      #account-lists-panel .list-item:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,139,0,.35) inset; }
      #account-lists-panel .list-name { font-weight: 600; }
      #account-lists-panel .list-meta { color: var(--text-muted); font-size: .85rem; }

      /* Pointer arrow (reuse delete-popover pattern) */
      #account-lists-panel::before,
      #account-lists-panel::after {
        content: "";
        position: absolute;
        width: var(--arrow-size);
        height: var(--arrow-size);
        transform: rotate(45deg);
        pointer-events: none;
      }
      /* Bottom placement (arrow on top edge) */
      #account-lists-panel[data-placement="bottom"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        top: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      #account-lists-panel[data-placement="bottom"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        top: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
      /* Top placement (arrow on bottom edge) */
      #account-lists-panel[data-placement="top"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        bottom: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      #account-lists-panel[data-placement="top"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        bottom: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
    `;
    document.head.appendChild(style);
  }

  function closeAccountListsPanel() {
    const panel = document.getElementById('account-lists-panel');
    const cleanup = () => {
      if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
      try { document.removeEventListener('mousedown', _onAccountListsOutside, true); } catch(_) {}
      // Reset trigger state and restore focus
      try {
        const trigger = document.getElementById('add-account-to-list');
        if (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
          // Only restore focus if closed by keyboard (Escape), not by pointer
          if (document.activeElement === trigger) {
            trigger.focus();
          }
        }
      } catch(_) {}
    };
    if (panel) panel.classList.remove('--show');
    setTimeout(cleanup, 120);

    try { document.removeEventListener('keydown', _onAccountListsKeydown, true); } catch(_) {}
    try { window.removeEventListener('resize', _positionAccountListsPanel, true); } catch(_) {}
    try { window.removeEventListener('scroll', _positionAccountListsPanel, true); } catch(_) {}
    _onAccountListsKeydown = null; _positionAccountListsPanel = null; _onAccountListsOutside = null;
  }

  function openAccountListsPanel() {
    if (document.getElementById('account-lists-panel')) return;
    
    // Comprehensive validation: ensure account detail page is fully ready
    const isAccountDetailReady = () => {
      // Check if critical DOM elements exist
      const header = document.getElementById('account-detail-header');
      const view = document.getElementById('account-detail-view');
      const addToListBtn = document.getElementById('add-account-to-list');
      
      if (!header || !view || !addToListBtn) return false;
      
      // Check if state has account ID
      if (!state.currentAccount?.id) return false;
      
      // All validations passed
      return true;
    };
    
    // If not ready, show loading state and retry
    if (!isAccountDetailReady()) {
      console.log('[AccountDetail] Account detail not fully ready, showing loading state');
      // Show a brief loading message to the user
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Loading account information...');
      }
      
      // Retry after a short delay
      setTimeout(() => {
        if (isAccountDetailReady()) {
          openAccountListsPanel(); // Recursive call when ready
        } else {
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Account information not ready. Please try again.');
          }
        }
      }, 200);
      return;
    }
    
    injectAccountListsStyles();
    const panel = document.createElement('div');
    panel.id = 'account-lists-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Add to list');
    const a = state.currentAccount || {};
    const companyName = a.accountName || a.name || a.companyName || 'this company';
    panel.innerHTML = `
      <div class="list-header">
        <div class="list-title">Add ${escapeHtml(companyName)} to list</div>
        <button type="button" class="close-btn" id="account-lists-close" aria-label="Close">×</button>
      </div>
      <div class="list-body" id="account-lists-body">
        <div class="list-item" tabindex="0" data-action="create">
          <div>
            <div class="list-name">Create new list…</div>
            <div class="list-meta">Create a company list</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);

    // Position anchored to the Add-to-List icon with pointer
    _positionAccountListsPanel = function position() {
      const btn = document.getElementById('add-account-to-list');
      const rect = btn ? btn.getBoundingClientRect() : null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 8;  // viewport padding
      const gap = 8;  // space between button and panel
      let placement = 'bottom';
      let top = Math.max(pad, 72);
      let left = Math.max(pad, (vw - panel.offsetWidth) / 2);

      if (rect) {
        const panelW = panel.offsetWidth;
        const panelH = panel.offsetHeight || 320; // fallback before content paints
        const fitsBottom = rect.bottom + gap + panelH + pad <= vh;
        const fitsTop = rect.top - gap - panelH - pad >= 0;
        placement = fitsBottom || !fitsTop ? 'bottom' : 'top';

        if (placement === 'bottom') {
          top = Math.min(vh - panelH - pad, rect.bottom + gap);
        } else {
          top = Math.max(pad, rect.top - gap - panelH);
        }

        // Prefer centering under the icon while keeping within viewport
        left = Math.round(
          Math.min(
            Math.max(pad, rect.left + (rect.width / 2) - (panelW / 2)),
            vw - panelW - pad
          )
        );

        // Arrow horizontal offset relative to panel's left edge
        const arrowLeft = Math.round(rect.left + rect.width / 2 - left);
        panel.style.setProperty('--arrow-left', `${arrowLeft}px`);
        panel.setAttribute('data-placement', placement);
      }

      panel.style.top = `${Math.round(top)}px`;
      panel.style.left = `${Math.round(left)}px`;
    };
    _positionAccountListsPanel();
    window.addEventListener('resize', _positionAccountListsPanel, true);
    window.addEventListener('scroll', _positionAccountListsPanel, true);

    // Animate in
    requestAnimationFrame(() => { panel.classList.add('--show'); });

    // Mark trigger expanded
    try { document.getElementById('add-account-to-list')?.setAttribute('aria-expanded', 'true'); } catch(_) {}

    // Load lists and memberships
    Promise.resolve(populateAccountListsPanel(panel.querySelector('#account-lists-body')))
      .then(() => { try { _positionAccountListsPanel && _positionAccountListsPanel(); } catch(_) {} });

    // Close button
    panel.querySelector('#account-lists-close')?.addEventListener('click', closeAccountListsPanel);

    // Keyboard handling
    _onAccountListsKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAccountListsPanel();
      }
    };
    document.addEventListener('keydown', _onAccountListsKeydown, true);

    // Click-away
    _onAccountListsOutside = (e) => {
      const inside = panel.contains(e.target);
      const onAnchor = !!(e.target.closest && e.target.closest('#add-account-to-list'));
      if (!inside && !onAnchor) closeAccountListsPanel();
    };
    document.addEventListener('mousedown', _onAccountListsOutside, true);
  }

  async function populateAccountListsPanel(body) {
    if (!body) return;
    
    try {
      const db = window.firebaseDB;
      if (!db) {
        body.innerHTML = '<div class="list-item" aria-disabled="true"><div class="list-name">Loading lists...</div><div class="list-meta">Please wait</div></div>';
        return;
      }

      // Get account lists (using the same structure as lists-overview.js)
      let listsSnapshot;
      try {
        // Primary query: filter by kind on server
        let query = db.collection('lists');
        if (query.where) query = query.where('kind', '==', 'accounts');
        listsSnapshot = await (query.limit ? query.limit(200).get() : query.get());
      } catch (e) {
        console.warn('Primary lists query failed, trying fallback:', e);
        listsSnapshot = { docs: [] };
      }

      let lists = (listsSnapshot && listsSnapshot.docs) ? listsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];

      // Fallback: if nothing returned, fetch recent docs without server-side kind filter
      if (!lists.length) {
        try {
          const altSnap = await db.collection('lists').limit(200).get();
          const all = (altSnap && altSnap.docs) ? altSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
          const want = (v) => (v || '').toString().trim().toLowerCase();
          lists = all.filter(doc => {
            const k = want(doc.kind || doc.type || doc.listType || doc.category);
            if (!k) return want(doc.accounts) === 'true';
            return k === 'accounts' || k === 'account' || k === 'companies' || k === 'company';
          });
        } catch (e) {
          console.warn('Fallback lists query failed:', e);
        }
      }

      // Get current account's list memberships
      const accountId = state.currentAccount?.id;
      const membershipsSnapshot = accountId ? await db.collection('listMembers').where('targetId', '==', accountId).where('targetType', '==', 'accounts').get() : { docs: [] };
      const memberships = new Set(membershipsSnapshot.docs.map(doc => doc.data().listId));

      // Build list items
      const items = lists.map(list => {
        const isMember = memberships.has(list.id);
        return `
          <div class="list-item" tabindex="0" data-list-id="${list.id}" data-action="${isMember ? 'remove' : 'add'}" ${isMember ? 'aria-disabled="true"' : ''}>
            <div>
              <div class="list-name">${escapeHtml(list.name || 'Unnamed List')}</div>
              <div class="list-meta">${list.count || list.memberCount || 0} accounts</div>
            </div>
            ${isMember ? '<div style="color: var(--text-muted); font-size: 0.8rem;">Added</div>' : ''}
          </div>`;
      }).join('');

      body.innerHTML = items;

      // Bind click handlers
      body.querySelectorAll('.list-item[data-action]').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          const action = item.getAttribute('data-action');
          const listId = item.getAttribute('data-list-id');
          
          if (action === 'create') {
            const name = prompt('Enter list name:');
            if (name && name.trim()) {
              await createAccountListThenAdd(name.trim());
            }
          } else if (action === 'add' && listId) {
            await addCurrentAccountToList(listId);
          } else if (action === 'remove' && listId) {
            const memberDoc = membershipsSnapshot.docs.find(doc => doc.data().listId === listId);
            if (memberDoc) {
              await removeCurrentAccountFromList(memberDoc.id, lists.find(l => l.id === listId)?.name);
            }
          }
        });
      });
    } catch (err) {
      console.warn('Failed to load lists:', err);
      body.innerHTML = '<div class="list-item" aria-disabled="true"><div class="list-name">Error loading lists</div><div class="list-meta">Please try again</div></div>';
    }
  }

  async function addCurrentAccountToList(listId) {
    try {
      const db = window.firebaseDB;
      const accountId = state.currentAccount?.id;
      if (!db || !accountId) return;

      const doc = { listId, targetId: accountId, targetType: 'accounts' };
      if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
        doc.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        doc.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      } else {
        doc.createdAt = new Date();
        doc.updatedAt = new Date();
      }
      await db.collection('listMembers').add(doc);
      
      // Increment list member count (using 'count' field like lists-overview.js)
      if (window.firebase?.firestore?.FieldValue) {
        await db.collection('lists').doc(listId).update({
          count: window.firebase.firestore.FieldValue.increment(1)
        });
      }
      
      window.crm?.showToast && window.crm.showToast('Added to list');
    } catch (err) {
      console.warn('Add to list failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to add to list');
    } finally {
      // Reload panel data to show updated state
      const body = document.getElementById('account-lists-body');
      if (body) {
        populateAccountListsPanel(body);
      }
    }
  }

  async function removeCurrentAccountFromList(memberDocId, listName) {
    try {
      const db = window.firebaseDB;
      if (db && typeof db.collection === 'function' && memberDocId) {
        // First get the listId from the member document before deleting it
        const memberDoc = await db.collection('listMembers').doc(memberDocId).get();
        const memberData = memberDoc.data();
        const listId = memberData?.listId;
        
        await db.collection('listMembers').doc(memberDocId).delete();
        
        // Decrement list member count if we have the listId (using 'count' field like lists-overview.js)
        if (listId && window.firebase?.firestore?.FieldValue) {
          await db.collection('lists').doc(listId).update({
            count: window.firebase.firestore.FieldValue.increment(-1)
          });
        }
      }
      window.crm?.showToast && window.crm.showToast(`Removed from "${listName}"`);
    } catch (err) {
      console.warn('Remove from list failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to remove from list');
    } finally {
      // Reload panel data to show updated state
      const body = document.getElementById('account-lists-body');
      if (body) {
        populateAccountListsPanel(body);
      }
    }
  }

  async function createAccountListThenAdd(name) {
    try {
      const db = window.firebaseDB;
      let newId = null;
      if (db && typeof db.collection === 'function') {
        const payload = { name, kind: 'accounts', count: 1 };
        if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
          payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
          payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
          payload.createdAt = new Date();
          payload.updatedAt = new Date();
        }
        const ref = await db.collection('lists').add(payload);
        newId = ref.id;
      }
      if (newId) {
        // Add the account to the new list
        const accountId = state.currentAccount?.id;
        if (accountId) {
          const doc = { listId: newId, targetId: accountId, targetType: 'accounts' };
          if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
            doc.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
            doc.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
          } else {
            doc.createdAt = new Date();
            doc.updatedAt = new Date();
          }
          await db.collection('listMembers').add(doc);
        }
        window.crm?.showToast && window.crm.showToast(`Created list "${name}"`);
      } else {
        window.crm?.showToast && window.crm.showToast(`Created list "${name}" (offline)`);
        closeAccountListsPanel();
      }
    } catch (err) {
      console.warn('Create list failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to create list');
    } finally {
      closeAccountListsPanel();
    }
  }

  // ===== Task Popover (mirror Contact Detail) =====
  let _onAccountTaskPopoverKeydown = null;
  let _onAccountTaskPopoverOutside = null;
  let _positionAccountTaskPopover = null;

  function injectAccountTaskPopoverStyles() {
    if (document.getElementById('account-task-popover-styles')) return;
    const style = document.createElement('style');
    style.id = 'account-task-popover-styles';
    style.textContent = `
      /* Account Detail: Task popover (mirror Contact Detail exactly) */
      .task-popover { position: fixed; z-index: 1300; width: min(520px, 92vw); background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light); border-radius: var(--border-radius); box-shadow: var(--elevation-card); opacity: 0; transform: translateY(-8px); transition: transform 180ms ease, opacity 180ms ease; --arrow-size: 10px; }
      .task-popover.--show { opacity: 1; transform: translateY(0); }

      .task-popover::before,
      .task-popover::after { content: ""; position: absolute; width: var(--arrow-size); height: var(--arrow-size); transform: rotate(45deg); pointer-events: none; }
      .task-popover[data-placement="bottom"]::before { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); top: calc(-1 * var(--arrow-size) / 2 + 1px); background: var(--border-light); }
      .task-popover[data-placement="bottom"]::after  { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); top: calc(-1 * var(--arrow-size) / 2 + 2px); background: var(--bg-card); }
      .task-popover[data-placement="top"]::before    { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); bottom: calc(-1 * var(--arrow-size) / 2 + 1px); background: var(--border-light); }
      .task-popover[data-placement="top"]::after     { left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); bottom: calc(-1 * var(--arrow-size) / 2 + 2px); background: var(--bg-card); }

      .task-popover .tp-inner { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .task-popover .tp-header { display: flex; align-items: center; justify-content: space-between; font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--border-light); }
      .task-popover .tp-title { font-weight: 700; color: var(--text-primary); font-size: 1rem; }
      .task-popover .tp-body { display: flex; flex-direction: column; gap: 12px; max-height: min(70vh, 620px); overflow: auto; padding: 8px; }
      .task-popover .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .task-popover label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary); position: relative; }
      .task-popover .input-dark, .task-popover textarea.input-dark { width: 100%; }
      .task-popover .close-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0; background: var(--bg-item); color: var(--grey-300); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); line-height: 1; font-size: 16px; font-weight: 600; cursor: pointer; transition: var(--transition-fast); box-sizing: border-box; }
      .task-popover .close-btn:hover { background: var(--grey-600); color: var(--text-inverse); }

      /* Fixed positioning for dropdown arrows - no transform on hover */
      .dropdown-toggle-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: var(--text-muted); border: none; cursor: pointer; transition: var(--transition-fast); }
      .dropdown-toggle-btn:hover { color: var(--text-primary); background: transparent; transform: translateY(-50%) !important; }

      /* Fixed positioning for calendar icon - no transform on hover */
      .calendar-toggle-btn { position: absolute; right: 8px; top: 65%; transform: translateY(-50%); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: var(--text-muted); border: none; cursor: pointer; transition: var(--transition-fast); }
      .calendar-toggle-btn:hover { color: var(--text-primary); background: transparent; transform: translateY(-50%) !important; }

      .dropdown-toolbar, .calendar-toolbar { display: none; margin-top: 8px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius); box-shadow: var(--elevation-card); padding: 8px; }
      .dropdown-toolbar .dropdown-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      /* Dropdown Option Styles - Using global styles from main.css */

      .calendar-toolbar header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .calendar-toolbar .month-label { font-weight: 600; }
      .calendar-toolbar .calendar-nav-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; transition: var(--transition-fast); }
      .calendar-toolbar .calendar-nav-btn:hover { background: var(--bg-secondary); border-color: var(--accent-color); box-shadow: 0 2px 8px rgba(0,0,0,.1); }
      .calendar-toolbar .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .calendar-toolbar .calendar-grid button { padding: 6px 0; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; }
      .calendar-toolbar .calendar-grid button.today { border-color: var(--orange-primary); }
      .calendar-toolbar .calendar-grid button.selected { background: var(--primary-700); color: #fff; }

      /* Slide animations for dropdowns and calendar */
      .dropdown-slide-in { animation: ddIn 160ms ease forwards; }
      .dropdown-slide-out { animation: ddOut 160ms ease forwards; }
      .calendar-slide-in { animation: calIn 200ms ease forwards; }
      .calendar-slide-out { animation: calOut 200ms ease forwards; }
      @keyframes ddIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes ddOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-6px); } }
      @keyframes calIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes calOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }

      /* Footer list of tasks */
      .tp-footer { margin-top: 4px; border-top: 1px solid var(--border-light); padding-top: 8px; }
      .tp-subtitle { color: var(--text-secondary); font-size: .9rem; margin-bottom: 6px; }
      .tp-task { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px solid var(--border-dark); }
      .tp-task:first-child { border-top: 0; }
      .tp-task-title { color: var(--text-primary); }
      .tp-badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; text-transform: capitalize; }
      .tp-badge.pending { background: var(--grey-700); color: var(--text-inverse); }
      .tp-badge.completed { background: var(--primary-700); color: #fff; }
      .tp-task-due { color: var(--text-secondary); font-size: 12px; margin-left: 8px; }

      /* Expanded container when calendar is open - wider for better UX */
      .task-popover.calendar-expanded { width: min(640px, 94vw); }

      /* Support explicit arrow element (legacy) */
      .task-popover .arrow { position: absolute; width: var(--arrow-size); height: var(--arrow-size); transform: rotate(45deg); background: var(--bg-card); border-left: 1px solid var(--border-light); border-top: 1px solid var(--border-light); display: none; }
      .task-popover[data-placement="bottom"] .arrow { display: block; top: calc(-1 * var(--arrow-size) / 2 + 2px); left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); }
      .task-popover[data-placement="top"] .arrow { display: block; bottom: calc(-1 * var(--arrow-size) / 2 + 2px); left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px)); }
    `;
    document.head.appendChild(style);
  }

  function openAccountTaskPopover(anchorEl) {
    if (!anchorEl) return;
    // Close any existing
    try { document.querySelector('.task-popover')?.remove(); } catch(_) {}

    // Ensure styles are injected FIRST
    injectAccountTaskPopoverStyles();

    const pop = document.createElement('div');
    pop.className = 'task-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Create task for account');

    const a = state.currentAccount || {};
    const company = a.accountName || a.name || a.companyName || 'this account';

    const getNextBusinessDayISO = () => {
      const d = new Date();
      let day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      let add = 1;
      if (day === 5) add = 3; // Friday -> Monday
      if (day === 6) add = 2; // Saturday -> Monday
      const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
      const yyyy = nd.getFullYear();
      const mm = String(nd.getMonth() + 1).padStart(2, '0');
      const dd = String(nd.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    const nextBiz = getNextBusinessDayISO();
    const nextBizDate = new Date(nextBiz + 'T00:00:00');

    pop.innerHTML = `
      <div class="arrow" aria-hidden="true"></div>
      <div class="tp-inner">
        <div class="tp-header">
          <div class="tp-title">Create Task</div>
          <button type="button" class="close-btn" id="tp-close" aria-label="Close">×</button>
        </div>
        <div class="tp-body">
          <form id="account-task-form">
            <div class="form-row">
              <label>Type
                <input type="text" name="type" class="input-dark" value="Phone Call" readonly />
                <button type="button" class="dropdown-toggle-btn" id="type-toggle" aria-label="Open type dropdown">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg>
                </button>
              </label>
              <label>Priority
                <input type="text" name="priority" class="input-dark" value="Medium" readonly />
                <button type="button" class="dropdown-toggle-btn" id="priority-toggle" aria-label="Open priority dropdown">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg>
                </button>
              </label>
            </div>
            <div class="type-toolbar" id="type-toolbar" style="display: none;">
              <div class="dropdown-grid type-grid">
                <button type="button" class="dropdown-option" data-value="phone-call">Phone Call</button>
                <button type="button" class="dropdown-option" data-value="manual-email">Manual Email</button>
                <button type="button" class="dropdown-option" data-value="auto-email">Auto Email</button>
                <button type="button" class="dropdown-option" data-value="follow-up">Follow-up</button>
                <button type="button" class="dropdown-option" data-value="demo">Demo</button>
                <button type="button" class="dropdown-option" data-value="custom-task">Custom Task</button>
              </div>
            </div>
            <div class="priority-toolbar" id="priority-toolbar" style="display: none;">
              <div class="dropdown-grid priority-grid">
                <button type="button" class="dropdown-option" data-value="low">Low</button>
                <button type="button" class="dropdown-option" data-value="medium">Medium</button>
                <button type="button" class="dropdown-option" data-value="high">High</button>
              </div>
            </div>
            <div class="form-row">
              <label>Time
                <input type="text" name="dueTime" class="input-dark" value="10:30 AM" placeholder="10:30 AM" required />
              </label>
              <label>Due date
                <input type="text" name="dueDate" class="input-dark" value="${(nextBizDate.getMonth() + 1).toString().padStart(2, '0')}/${nextBizDate.getDate().toString().padStart(2, '0')}/${nextBizDate.getFullYear()}" readonly />
                <button type="button" class="calendar-toggle-btn" id="calendar-toggle" aria-label="Open calendar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </button>
              </label>
            </div>
            <div class="calendar-toolbar" id="calendar-toolbar" style="display: none;">
              <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" id="calendar-prev" aria-label="Previous month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg></button>
                <div class="calendar-month-year" id="calendar-month-year">September 2025</div>
                <button type="button" class="calendar-nav-btn" id="calendar-next" aria-label="Next month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg></button>
              </div>
              <div class="calendar-weekdays">
                <div class="calendar-weekday">S</div>
                <div class="calendar-weekday">M</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">W</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">F</div>
                <div class="calendar-weekday">S</div>
              </div>
              <div class="calendar-days" id="calendar-days"></div>
            </div>
            <div class="form-row" style="grid-template-columns: 1fr;">
              <label>Notes
                <textarea name="notes" class="input-dark" rows="3" placeholder="Add context (optional)"></textarea>
              </label>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary" id="tp-save">Create Task</button>
            </div>
          </form>
        </div>
      </div>`;

    document.body.appendChild(pop);

    // Position under anchor
    _positionAccountTaskPopover = function position() {
      const rect = anchorEl.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 8;
      const gap = 8;
      let placement = 'bottom';
      let top = Math.max(pad, 72);
      let left = Math.max(pad, (vw - popRect.width) / 2);

      if (rect) {
        const panelW = popRect.width;
        const panelH = popRect.height || 320; // fallback before content paints
        const fitsBottom = rect.bottom + gap + panelH + pad <= vh;
        const fitsTop = rect.top - gap - panelH - pad >= 0;
        placement = fitsBottom || !fitsTop ? 'bottom' : 'top';

        if (placement === 'bottom') {
          top = Math.min(vh - panelH - pad, rect.bottom + gap);
        } else {
          top = Math.max(pad, rect.top - gap - panelH);
        }

        left = Math.round(
          Math.min(
            Math.max(pad, rect.left + (rect.width / 2) - (panelW / 2)),
            vw - panelW - pad
          )
        );

        const arrowLeft = Math.round(rect.left + rect.width / 2 - left);
        pop.style.setProperty('--arrow-left', `${arrowLeft}px`);
        pop.setAttribute('data-placement', placement);
      }

      pop.style.top = `${Math.round(top)}px`;
      pop.style.left = `${Math.round(left)}px`;
    };
    _positionAccountTaskPopover();
    window.addEventListener('resize', _positionAccountTaskPopover, true);
    window.addEventListener('scroll', _positionAccountTaskPopover, true);

    requestAnimationFrame(() => { pop.classList.add('--show'); });

    // Bind events similar to ContactDetail
    const form = pop.querySelector('#account-task-form');
    const closeBtn = pop.querySelector('#tp-close');
    const typeToggle = pop.querySelector('#type-toggle');
    const priorityToggle = pop.querySelector('#priority-toggle');
    const calendarToggle = pop.querySelector('#calendar-toggle');
    const typeToolbar = pop.querySelector('#type-toolbar');
    const priorityToolbar = pop.querySelector('#priority-toolbar');
    const calendarToolbar = pop.querySelector('#calendar-toolbar');
    const calendarMonthYear = pop.querySelector('#calendar-month-year');
    const calendarDays = pop.querySelector('#calendar-days');
    const calendarPrev = pop.querySelector('#calendar-prev');
    const calendarNext = pop.querySelector('#calendar-next');
    const dueDateInput = pop.querySelector('input[name="dueDate"]');
    const typeInput = pop.querySelector('input[name="type"]');
    const priorityInput = pop.querySelector('input[name="priority"]');

    let currentDate = new Date(nextBizDate.getFullYear(), nextBizDate.getMonth(), 1); // Start calendar at the month of the next business day

    const generateCalendar = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      calendarMonthYear.textContent = `${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`;
      calendarDays.innerHTML = '';

      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyDiv = document.createElement('div');
        calendarDays.appendChild(emptyDiv);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.textContent = day;
        dayBtn.classList.add('calendar-day');

        const currentDay = new Date(year, month, day);
        if (currentDay.toDateString() === new Date().toDateString()) {
          dayBtn.classList.add('calendar-day-today');
          dayBtn.style.borderColor = 'var(--orange-primary)';
        }
        if (currentDay.toDateString() === nextBizDate.toDateString()) {
          dayBtn.classList.add('calendar-day-selected');
        }

        dayBtn.addEventListener('click', () => {
          const selectedDate = new Date(year, month, day);
          dueDateInput.value = `${(selectedDate.getMonth() + 1).toString().padStart(2, '0')}/${selectedDate.getDate().toString().padStart(2, '0')}/${selectedDate.getFullYear()}`;
          closeCalendar();
        });
        calendarDays.appendChild(dayBtn);
      }
    };

    const openCalendar = () => {
      generateCalendar();
      calendarToolbar.style.display = 'block';
      calendarToolbar.offsetHeight; // Force reflow
      calendarToolbar.classList.add('calendar-slide-in');
      pop.classList.add('calendar-expanded');
      position(); // Reposition popover after expanding
    };

    const closeCalendar = () => {
      if (!calendarToolbar) return;
      calendarToolbar.classList.remove('calendar-slide-in');
      calendarToolbar.classList.add('calendar-slide-out');
      
      const handleEnd = (ev) => {
        if (ev.target !== calendarToolbar) return;
        calendarToolbar.removeEventListener('transitionend', handleEnd);
        calendarToolbar.style.display = 'none';
        calendarToolbar.classList.remove('calendar-slide-out');
        pop.classList.remove('calendar-expanded');
        position(); // Reposition popover after shrinking
      };
      calendarToolbar.addEventListener('transitionend', handleEnd);
      setTimeout(() => {
        try { calendarToolbar.removeEventListener('transitionend', handleEnd); } catch (_) {}
        calendarToolbar.style.display = 'none';
        calendarToolbar.classList.remove('calendar-slide-out');
        pop.classList.remove('calendar-expanded');
        position();
      }, 600);
    };

    const toggleToolbar = (el, type) => {
      if (!el) return;
      const isOpen = el.classList.contains('dropdown-slide-in') || el.classList.contains('calendar-slide-in');
      const others = [typeToolbar, priorityToolbar, calendarToolbar].filter(x => x && x !== el);
      others.forEach(x => {
        x.classList.remove('dropdown-slide-in', 'calendar-slide-in');
        x.classList.add('dropdown-slide-out'); // Ensure slide-out animation
        setTimeout(() => { x.style.display = 'none'; x.classList.remove('dropdown-slide-out'); }, 160);
      });
      
      if (isOpen) {
        el.classList.remove('dropdown-slide-in', 'calendar-slide-in');
        el.classList.add('dropdown-slide-out');
        setTimeout(() => { el.style.display = 'none'; el.classList.remove('dropdown-slide-out'); }, 160);
      } else {
        el.style.display = 'block';
        el.offsetHeight; // Force reflow
        el.classList.add(type === 'calendar' ? 'calendar-slide-in' : 'dropdown-slide-in');
        if (type === 'calendar') {
          pop.classList.add('calendar-expanded');
          generateCalendar();
        }
      }
      position(); // Reposition popover after expanding/shrinking
    };

    closeBtn?.addEventListener('click', () => {
      closeAccountTaskPopover();
      // Restore focus to the trigger button
      try { anchorEl?.focus(); } catch(_) {}
    });

    typeToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleToolbar(typeToolbar, 'dropdown'); });
    priorityToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleToolbar(priorityToolbar, 'dropdown'); });
    calendarToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleToolbar(calendarToolbar, 'calendar'); });

    calendarPrev?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); generateCalendar(); });
    calendarNext?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); generateCalendar(); });

    // Type option selection
    typeToolbar?.addEventListener('click', (e) => {
      const option = e.target.closest('.dropdown-option');
      if (option) {
        const value = option.dataset.value;
        typeInput.value = option.textContent;
        typeToolbar.querySelectorAll('.dropdown-option').forEach(btn => btn.classList.remove('selected'));
        option.classList.add('selected');
        toggleToolbar(typeToolbar, 'dropdown'); // Close dropdown after selection
      }
    });

    // Priority option selection
    priorityToolbar?.addEventListener('click', (e) => {
      const option = e.target.closest('.dropdown-option');
      if (option) {
        const value = option.dataset.value;
        priorityInput.value = option.textContent;
        priorityToolbar.querySelectorAll('.dropdown-option').forEach(btn => btn.classList.remove('selected'));
        option.classList.add('selected');
        toggleToolbar(priorityToolbar, 'dropdown'); // Close dropdown after selection
      }
    });

    // Set initial selected states
    typeToolbar?.querySelector('[data-value="phone-call"]')?.classList.add('selected');
    priorityToolbar?.querySelector('[data-value="medium"]')?.classList.add('selected');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const type = String(fd.get('type') || '').trim();
      const priority = String(fd.get('priority') || '').trim();
      const dueDate = String(fd.get('dueDate') || '').trim();
      const dueTime = String(fd.get('dueTime') || '').trim();
      const notes = String(fd.get('notes') || '').trim();
      if (!type || !priority || !dueDate || !dueTime) return;
      const title = `${type} — ${company}`;
      const accountId = a.id || '';
      const newTask = {
        id: 'task_' + Date.now(),
        title,
        account: company,
        accountId,
        type,
        priority,
        dueDate,
        dueTime,
        status: 'pending',
        notes,
        createdAt: Date.now()
      };
      try {
        const key = 'userTasks';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift(newTask);
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (_) { /* noop */ }
      try {
        const db = window.firebaseDB;
        if (db) {
          await db.collection('tasks').add({
            ...newTask,
            timestamp: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
          });
        }
      } catch (err) {
        console.warn('Failed to save task to Firebase:', err);
      }
      try { window.crm?.showToast && window.crm.showToast('Task created'); } catch (_) {}
      try { window.crm && typeof window.crm.loadTodaysTasks === 'function' && window.crm.loadTodaysTasks(); } catch(_) {}
      try { window.dispatchEvent(new CustomEvent('tasksUpdated', { detail: { source: 'account-detail', task: newTask } })); } catch(_) {}
      closeAccountTaskPopover();
    });

    _onAccountTaskPopoverOutside = (ev) => {
      const t = ev.target;
      if (!pop.contains(t) && t !== anchorEl) {
        closeAccountTaskPopover();
      }
    };
    _onAccountTaskPopoverKeydown = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeAccountTaskPopover();
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', _onAccountTaskPopoverOutside);
      document.addEventListener('keydown', _onAccountTaskPopoverKeydown);
    }, 0);
  }

  function closeAccountTaskPopover() {
    const ex = document.querySelector('.task-popover');
    if (ex) {
      ex.classList.remove('--show');
      setTimeout(() => {
        if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
        // Clean up event listeners
        document.removeEventListener('mousedown', _onAccountTaskPopoverOutside);
        document.removeEventListener('keydown', _onAccountTaskPopoverKeydown);
        window.removeEventListener('resize', _positionAccountTaskPopover);
        window.removeEventListener('scroll', _positionAccountTaskPopover);
        _onAccountTaskPopoverOutside = null;
        _onAccountTaskPopoverKeydown = null;
        _positionAccountTaskPopover = null;
      }, 400); // Match the 400ms transition duration
    }
  }

  // Parent Company / Subsidiaries Functions
  let subsidiariesPage = 1;
  const subsidiariesPageSize = 4;

  function getSubsidiaries(accountId) {
    if (!accountId) return [];
    const accounts = window.getAccountsData ? window.getAccountsData() : [];
    return accounts.filter(account => account.parentCompanyId === accountId);
  }

  function getParentCompany(parentCompanyId) {
    if (!parentCompanyId) return null;
    const accounts = window.getAccountsData ? window.getAccountsData() : [];
    return accounts.find(account => account.id === parentCompanyId) || null;
  }

  function renderParentCompanySection(parentAccount) {
    if (!parentAccount) return '';

    const accountName = parentAccount.accountName || parentAccount.name || parentAccount.companyName || '';
    const city = parentAccount.city || parentAccount.locationCity || '';
    const stateVal = parentAccount.state || parentAccount.locationState || '';
    
    const location = city && stateVal ? `${city}, ${stateVal}` : (city || stateVal || '');

    // Get company icon/favicon
    const deriveDomain = (input) => {
      try {
        if (!input) return '';
        let s = String(input).trim();
        if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
        return '';
      } catch(_) { return ''; }
    };
    const domain = parentAccount.domain ? String(parentAccount.domain).replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/^www\./i,'') : deriveDomain(parentAccount.website || '');
    const logoUrl = parentAccount.logoUrl || '';
    
    let iconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        iconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch(_) {}
    
    if (!iconHTML) {
      const fallbackLetter = accountName ? accountName.charAt(0).toUpperCase() : 'C';
      iconHTML = `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-item); border-radius: 6px; font-weight: 600; font-size: 14px; color: var(--text-secondary);">${fallbackLetter}</div>`;
    }

    return `
      <div class="contact-info-section">
        <h3 class="section-title">Parent Company</h3>
        <div class="contact-item parent-company-item" data-account-id="${escapeHtml(parentAccount.id)}" style="cursor: pointer;">
          <div class="contact-avatar">
            ${iconHTML}
          </div>
          <div class="contact-info">
            <div class="contact-name company-link" data-account-id="${escapeHtml(parentAccount.id)}">${escapeHtml(accountName)}</div>
            ${location ? `<div class="contact-details">${escapeHtml(location)}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderSubsidiariesSection(subsidiaries) {
    if (!subsidiaries || subsidiaries.length === 0) return '';

    const totalPages = Math.ceil(subsidiaries.length / subsidiariesPageSize);
    const startIdx = (subsidiariesPage - 1) * subsidiariesPageSize;
    const endIdx = startIdx + subsidiariesPageSize;
    const pageSubsidiaries = subsidiaries.slice(startIdx, endIdx);

    const subsidiariesHTML = pageSubsidiaries.map(subsidiary => {
      const accountName = subsidiary.accountName || subsidiary.name || subsidiary.companyName || '';
      const city = subsidiary.city || subsidiary.locationCity || '';
      const stateVal = subsidiary.state || subsidiary.locationState || '';
      
      const location = city && stateVal ? `${city}, ${stateVal}` : (city || stateVal || '');

      // Get company icon/favicon
      const deriveDomain = (input) => {
        try {
          if (!input) return '';
          let s = String(input).trim();
          if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
          if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
          return '';
        } catch(_) { return ''; }
      };
      const domain = subsidiary.domain ? String(subsidiary.domain).replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/^www\./i,'') : deriveDomain(subsidiary.website || '');
      const logoUrl = subsidiary.logoUrl || '';
      
      let iconHTML = '';
      try {
        if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
          iconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
        }
      } catch(_) {}
      
      if (!iconHTML) {
        const fallbackLetter = accountName ? accountName.charAt(0).toUpperCase() : 'C';
        iconHTML = `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-item); border-radius: 6px; font-weight: 600; font-size: 14px; color: var(--text-secondary);">${fallbackLetter}</div>`;
      }

      return `
        <div class="contact-item subsidiary-item" data-account-id="${escapeHtml(subsidiary.id)}" style="cursor: pointer;">
          <div class="contact-avatar">
            ${iconHTML}
          </div>
          <div class="contact-info">
            <div class="contact-name company-link" data-account-id="${escapeHtml(subsidiary.id)}">${escapeHtml(accountName)}</div>
            ${location ? `<div class="contact-details">${escapeHtml(location)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const paginationHTML = totalPages > 1 ? `
      <div class="contacts-pager" id="subsidiaries-pager">
        <button class="contacts-page-btn" id="subsidiaries-prev" ${subsidiariesPage === 1 ? 'disabled' : ''} aria-label="Previous page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
        <div class="contacts-page-info" id="subsidiaries-info">${subsidiariesPage}</div>
        <button class="contacts-page-btn" id="subsidiaries-next" ${subsidiariesPage === totalPages ? 'disabled' : ''} aria-label="Next page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
        </button>
      </div>
    ` : '';

    return `
      <div class="contact-info-section">
        <div class="section-header">
          <h3 class="section-title">Subsidiaries</h3>
          ${paginationHTML}
        </div>
        <div class="subsidiaries-list">
          ${subsidiariesHTML}
        </div>
      </div>
    `;
  }

  function updateSubsidiariesPagination(currentPage, totalPages) {
    const pager = document.getElementById('subsidiaries-pager');
    const prevBtn = document.getElementById('subsidiaries-prev');
    const nextBtn = document.getElementById('subsidiaries-next');
    const info = document.getElementById('subsidiaries-info');

    if (!pager || !prevBtn || !nextBtn || !info) return;

    info.textContent = currentPage;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    
    if (totalPages <= 1) {
      pager.style.display = 'none';
    } else {
      pager.style.display = 'flex';
    }
  }

  function bindSubsidiariesPagination() {
    const prevBtn = document.getElementById('subsidiaries-prev');
    const nextBtn = document.getElementById('subsidiaries-next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (subsidiariesPage > 1) {
          subsidiariesPage--;
          renderAccountDetail();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const subsidiaries = getSubsidiaries(state.currentAccount?.id);
        const totalPages = Math.ceil(subsidiaries.length / subsidiariesPageSize);
        if (subsidiariesPage < totalPages) {
          subsidiariesPage++;
          renderAccountDetail();
        }
      });
    }
  }

  function bindParentSubsidiariesNavigation() {
    // Handle parent company item clicks
    const parentItems = document.querySelectorAll('.parent-company-item');
    parentItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const accountId = item.getAttribute('data-account-id');
        if (accountId && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
          // Set navigation source for back button
          window._accountNavigationSource = 'account-details';
          window._accountDetailsReturnData = {
            accountId: state.currentAccount?.id,
            scroll: window.scrollY || 0
          };
          
          // Navigate to parent account
          window.AccountDetail.show(accountId);
        }
      });
    });

    // Handle subsidiary item clicks
    const subsidiaryItems = document.querySelectorAll('.subsidiary-item');
    subsidiaryItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const accountId = item.getAttribute('data-account-id');
        if (accountId && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
          // Set navigation source for back button
          window._accountNavigationSource = 'account-details';
          window._accountDetailsReturnData = {
            accountId: state.currentAccount?.id,
            scroll: window.scrollY || 0
          };
          
          // Navigate to subsidiary account
          window.AccountDetail.show(accountId);
        }
      });
    });
  }

  // Export API
  window.AccountDetail = {
    show: showAccountDetail,
    setupEnergyUpdateListener: setupEnergyUpdateListener,
    setupParentCompanyAutocomplete: setupParentCompanyAutocomplete
  };
  // Backward-compat global alias used by some modules
  try { window.showAccountDetail = showAccountDetail; } catch (_) {}
})();

