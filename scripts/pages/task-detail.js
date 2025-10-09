'use strict';

// Task Detail Page - Individual task pages with widgets and navigation
(function() {
  const state = {
    currentTask: null,
    taskType: null,
    contact: null,
    account: null,
    navigating: false,
    widgets: {
      maps: null,
      energy: null,
      notes: null
    }
  };

  const els = {};

  // Helper functions
  function getPriorityBackground(priority) {
    const p = (priority || '').toLowerCase().trim();
    switch(p) {
      case 'low': return '#495057';
      case 'medium': return 'rgba(255, 193, 7, 0.15)';
      case 'high': return 'rgba(220, 53, 69, 0.15)';
      default: return '#495057';
    }
  }

  function getPriorityColor(priority) {
    const p = (priority || '').toLowerCase().trim();
    switch(p) {
      case 'low': return '#e9ecef';
      case 'medium': return '#ffc107';
      case 'high': return '#dc3545';
      default: return '#e9ecef';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Get primary phone data with type information (same logic as contact-detail.js)
  function getPrimaryPhoneData(contact) {
    if (!contact) return { value: '', type: 'mobile', field: 'mobile' };
    
    // Check if a preferred phone field is set on the contact (from contact-detail.js)
    try {
      const pref = (contact && contact.preferredPhoneField) ? String(contact.preferredPhoneField).trim() : '';
      if (pref === 'mobile' && contact.mobile) return { value: contact.mobile, type: 'mobile', field: 'mobile' };
      if (pref === 'workDirectPhone' && contact.workDirectPhone) return { value: contact.workDirectPhone, type: 'work direct', field: 'workDirectPhone' };
      if (pref === 'otherPhone' && contact.otherPhone) return { value: contact.otherPhone, type: 'other', field: 'otherPhone' };
    } catch(_) {}
    
    // Priority fallback: Mobile > Work Direct > Other
    if (contact.mobile) {
      return { value: contact.mobile, type: 'mobile', field: 'mobile' };
    }
    if (contact.workDirectPhone) {
      return { value: contact.workDirectPhone, type: 'work direct', field: 'workDirectPhone' };
    }
    if (contact.otherPhone) {
      return { value: contact.otherPhone, type: 'other', field: 'otherPhone' };
    }
    return { value: '', type: 'mobile', field: 'mobile' };
  }

  // Find the associated account for this contact (by id or normalized company name)
  function findAssociatedAccount(contact) {
    try {
      if (!contact || typeof window.getAccountsData !== 'function') return null;
      const accounts = window.getAccountsData() || [];
      // Prefer explicit accountId
      const accountId = contact.accountId || contact.account_id || '';
      if (accountId) {
        const m = accounts.find(a => a.id === accountId);
        if (m) return m;
      }
      // Fallback to company name
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const key = norm(contact.companyName || contact.accountName || '');
      if (!key) return null;
      return accounts.find(a => norm(a.accountName || a.name || a.companyName) === key) || null;
    } catch (_) { return null; }
  }

  // Find account by ID or name for account tasks
  function findAccountByIdOrName(accountId, accountName) {
    try {
      if (typeof window.getAccountsData !== 'function') return null;
      const accounts = window.getAccountsData() || [];
      
      // Try by ID first
      if (accountId) {
        const found = accounts.find(a => a.id === accountId);
        if (found) return found;
      }
      
      // Fallback to name matching
      if (accountName) {
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const key = norm(accountName);
        return accounts.find(a => norm(a.accountName || a.name || a.companyName) === key) || null;
      }
      
      return null;
    } catch (_) { return null; }
  }

  // Determine if this is an account task (vs contact task)
  function isAccountTask(task) {
    if (!task) return false;
    // Account task has account but no contact, or has explicit accountId
    return task.account && (!task.contact || task.contact.trim() === '');
  }

  function injectTaskDetailStyles(){
    const id = 'task-detail-inline-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = `
      /* Task Detail Page Layout */
      #task-detail-page .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        width: 100%;
        padding: 25px 25px 25px 25px;
        margin: 0;
        gap: 20px; /* Space between back button and title section */
      }

      #task-detail-page .page-title-section {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        flex: 0 0 auto;
        justify-content: flex-start;
        margin-left: 45px; /* Move the entire title section to the right */
        margin-top: -10px; /* Move glyph and text up 10px total */
      }
      #task-detail-page .page-content { 
        display: grid; 
        grid-template-columns: 450px 1fr; /* Left column narrow, right column flexible */
        grid-template-rows: 1fr; /* Make the row fill the available height */
        column-gap: 0px; /* Remove column gap to eliminate visual space */
        row-gap: 25px;
        padding: 0; /* No padding on parent - let children handle their own spacing */
        height: calc(100vh - 140px); /* Account for header height */
        overflow: hidden; /* Restore hidden overflow for proper scrolling */
        justify-items: stretch; /* ensure items fill their grid tracks */
        align-items: start;     /* align items to the top */
        width: 100%; /* Ensure full width */
      }
      /* Override any global styles that might affect grid gap */
      #task-detail-page .page-content > .main-content {
        margin: 0 !important;
      }
      #task-detail-page .page-content > .sidebar-content {
        margin: 0 !important;
      }
      #task-detail-page .main-content { 
        display: flex; 
        flex-direction: column; 
        gap: 25px; /* Explicit 25px spacing between cards */
        min-height: 0; /* allow child overflow */
        height: 100%; /* fill grid row height */
        overflow-y: auto; /* independent scroll */
        overscroll-behavior: contain;
        padding-top: 25px;  /* 25px distance from header at top */
        padding-bottom: 25px; /* 25px breathing room at bottom under last card */
        padding-right: 25px; /* 25px padding from cards to scrollbar */
        padding-left: 25px; /* 25px distance from left edge to cards */
        /* Allow the left column to fully occupy its grid track (no artificial max width) */
        max-width: none;
        width: 100%;
        border-right: 1px solid var(--border-light); /* Vertical divider */
        margin-right: 25px; /* Spacing from the border to right column content */
      }
      #task-detail-page .sidebar-content { 
        display: flex; 
        flex-direction: column; 
        gap: 25px; /* Explicit 25px spacing between cards */
        min-height: 0; /* allow child overflow */
        height: 100%; /* fill grid row height */
        overflow-y: auto; /* independent scroll */
        overscroll-behavior: contain;
        padding-top: 25px; /* 25px distance from header at top */
        padding-right: 25px; /* 25px padding from cards to scrollbar */
        padding-left: 25px; /* 25px distance from left edge to contact info */
        margin-top: 0; /* Remove any extra top margin */
        margin-right: 0; /* Remove any right margin */
        margin-left: 0; /* Remove any left margin */
        align-items: stretch; /* Align to top */
        width: 100%; /* Ensure full width */
      }
      /* Ensure first child in sidebar has no extra top margin */
      #task-detail-page .sidebar-content > *:first-child {
        margin-top: 0 !important;
      }
      
      /* Task Action Cards */
      #task-detail-page .task-card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; box-shadow: var(--elevation-card); }
      #task-detail-page .task-card .section-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); margin: 0 0 var(--spacing-md) 0; }
      #task-detail-page .task-card .form-row { margin: var(--spacing-md) 0; display: block; }
      #task-detail-page .task-card .actions { display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-base); }
      
      /* Company Summary Card */
      #task-detail-page .company-summary-card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; box-shadow: var(--elevation-card); }
      #task-detail-page .company-summary-header { display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      #task-detail-page .company-logo { width: 32px; height: 32px; border-radius: var(--border-radius-sm); background: var(--bg-item); display: flex; align-items: center; justify-content: center; }
      #task-detail-page .company-logo img { width: 100%; height: 100%; object-fit: contain; border-radius: var(--border-radius-sm); }
      #task-detail-page .company-logo-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; color: var(--text-secondary); }
      #task-detail-page .company-name { font-weight: 600; color: var(--text-primary); }
      #task-detail-page .company-details { margin: var(--spacing-sm) 0; display: flex; flex-direction: column; gap: 4px; }
      #task-detail-page .company-detail-item { display: flex; align-items: center; gap: var(--spacing-sm); }
      #task-detail-page .detail-label { color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; min-width: 60px; }
      #task-detail-page .detail-value { color: var(--text-primary); font-size: 0.9rem; }
      #task-detail-page .company-description { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; }
      
      /* Contact Information Grid */
      #task-detail-page .contact-info-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; width: 100%; box-shadow: var(--elevation-card); }
      #task-detail-page .contact-info-section .section-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); margin: 0 0 var(--spacing-base) 0; }
      #task-detail-page .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm) var(--spacing-md); }
      #task-detail-page .info-row { display: flex; flex-direction: column; gap: 4px; }
      #task-detail-page .info-label { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
      #task-detail-page .info-value { color: var(--text-primary); font-size: 0.9rem; }
      #task-detail-page .info-value.empty { color: var(--text-secondary); }
      
      /* Call List Styling */
      #task-detail-page .call-list { margin: var(--spacing-sm) 0; }
      #task-detail-page .call-row { display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      #task-detail-page .call-number { color: var(--text-secondary); font-family: monospace; }
      
      /* Activity Section */
      #task-detail-page .activity-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; box-shadow: var(--elevation-card); }
      #task-detail-page .activity-section .section-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); margin: 0 0 var(--spacing-base) 0; }
      
      /* Activity Timeline */
      #task-detail-page .activity-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; }
      #task-detail-page .activity-timeline { display: flex; flex-direction: column; gap: var(--spacing-sm); }
      #task-detail-page .activity-item { display: flex; align-items: start; gap: var(--spacing-sm); padding: var(--spacing-sm); border: 1px solid var(--border-light); border-radius: var(--border-radius); background: var(--bg-item); }
      #task-detail-page .activity-icon { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      #task-detail-page .activity-content { flex: 1; }
      #task-detail-page .activity-title { font-weight: 600; color: var(--text-primary); font-size: 0.9rem; }
      #task-detail-page .activity-time { color: var(--text-secondary); font-size: 0.8rem; }
      #task-detail-page .activity-placeholder { text-align: center; padding: var(--spacing-lg) 0; color: var(--text-secondary); }
      
      /* Avatar Styles - Match People Page */
      #task-detail-page .avatar-initials {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--orange-subtle, #ff6b35);
        color: #fff;
        font-weight: 600;
        letter-spacing: 0.5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
        vertical-align: middle;
      }
      
      /* Absolutely positioned avatar - positioned relative to title section */
      #task-detail-page .contact-header-text {
        position: relative;
      }
      
      #task-detail-page .avatar-absolute {
        position: absolute;
        left: -50px;
        top: 8px;
        z-index: 1;
      }
      
      /* Contact Details Container - normal flow, no flex */
      #task-detail-page .contact-details-normal {
        line-height: 1.4;
        position: relative;
        z-index: 0;
      }
      
      /* Task Contact Info - Ensure proper alignment */
      #task-detail-page .task-contact-info {
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
      
      /* Task Navigation Buttons */
      #task-detail-page .task-navigation {
        display: flex;
        gap: 8px;
        margin-left: auto;
        margin-right: 0;
      }
      
      /* Ensure page-actions uses flexbox for proper alignment */
      #task-detail-page .page-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-left: auto;
      }
      
      #task-detail-page .btn-icon {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--transition-fast);
      }
      
      #task-detail-page .btn-icon:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--grey-500);
      }
      
      #task-detail-page .btn-icon:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      
      #task-detail-page .btn-icon:disabled:hover {
        background: var(--bg-item);
        color: var(--text-secondary);
        border-color: var(--border-light);
      }
      
      /* Contact Link Styles */
      #task-detail-page .contact-link {
        color: var(--grey-400);
        text-decoration: none;
        cursor: pointer;
        transition: var(--transition-fast);
        font-weight: 400;
        vertical-align: baseline;
        display: inline;
      }
      
      #task-detail-page .contact-link:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      #task-detail-page .contact-link:focus-visible {
        outline: 2px solid var(--orange-primary);
        outline-offset: 2px;
        border-radius: 2px;
      }
      
      /* Company Link Styles - Match Contact Detail */
      #task-detail-page .company-link {
        color: var(--grey-400);
        text-decoration: none;
        cursor: pointer;
        transition: var(--transition-fast);
        font-weight: 400;
      }
      
      #task-detail-page .company-link:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      #task-detail-page .company-link:focus-visible {
        outline: 2px solid var(--orange-primary);
        outline-offset: 2px;
        border-radius: 2px;
      }
      
      /* Account Task Styles */
      #task-detail-page .contacts-list-card {
        background: var(--bg-card);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        padding: var(--spacing-base);
        margin: 0;
        box-shadow: var(--elevation-card);
      }
      
      #task-detail-page .section-header-with-action {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-md);
      }
      
      #task-detail-page .btn-icon-add {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--transition-fast);
      }
      
      #task-detail-page .btn-icon-add:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--grey-500);
      }
      
      #task-detail-page .contacts-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
      }
      
      #task-detail-page .contact-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius);
        background: var(--bg-item);
        transition: var(--transition-fast);
      }
      
      #task-detail-page .contact-item:hover {
        background: var(--bg-hover);
        border-color: var(--grey-500);
      }
      
      #task-detail-page .contact-avatar {
        flex-shrink: 0;
      }
      
      #task-detail-page .avatar-circle-small {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--orange-subtle, #ff6b35);
        color: #fff;
        font-weight: 600;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
      }
      
      #task-detail-page .contact-info {
        flex: 1;
        min-width: 0;
      }
      
      #task-detail-page .contact-name {
        font-weight: 500;
        color: var(--text-primary);
        font-size: 0.9rem;
        margin-bottom: 2px;
      }
      
      #task-detail-page .contact-details {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
      
      #task-detail-page .contact-title,
      #task-detail-page .contact-email,
      #task-detail-page .contact-phone {
        color: var(--text-secondary);
      }
      
      #task-detail-page .contacts-placeholder {
        text-align: center;
        padding: var(--spacing-lg);
        color: var(--text-secondary);
        font-size: 0.9rem;
      }
      
      #task-detail-page .company-summary-section {
        margin-top: var(--spacing-base);
        padding-top: var(--spacing-base);
        border-top: 1px solid var(--border-light);
      }
      
      #task-detail-page .company-summary-text {
        color: var(--text-primary);
        font-size: 0.9rem;
        line-height: 1.5;
        margin-top: 8px;
      }
      
      #task-detail-page .website-link {
        color: var(--grey-400);
        text-decoration: none;
        cursor: pointer;
        transition: var(--transition-fast);
        font-weight: 400;
      }
      
      #task-detail-page .website-link:hover {
        color: var(--text-inverse);
        text-decoration: none;
      }
      
      /* Company Favicon in Header */
      #task-detail-page .company-favicon-header {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      #task-detail-page .company-favicon-header img {
        max-width: 40px;
        max-height: 40px;
        object-fit: contain;
      }
      
      /* Responsive adjustments */
      @media (max-width: 1200px) {
        #task-detail-page .page-content { grid-template-columns: 400px 1fr; }
      }
      @media (max-width: 968px) {
        #task-detail-page .page-content { grid-template-columns: 1fr; }
        #task-detail-page .main-content { max-width: none; }
        #task-detail-page .info-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function initDomRefs() {
    els.page = document.getElementById('task-detail-page');
    // Header may not have a fixed id in markup; fall back to the page-local header element
    els.header = document.getElementById('task-detail-header') || (els.page && els.page.querySelector('.page-header')) || null;
    els.title = document.getElementById('task-detail-title');
    els.subtitle = document.getElementById('task-detail-subtitle');
    els.content = document.getElementById('task-detail-content');
    els.backBtn = document.getElementById('task-detail-back-btn');
    els.completeBtn = document.getElementById('task-complete-btn');
    els.rescheduleBtn = document.getElementById('task-reschedule-btn');
    
    // Only require the elements we actually need for interaction
    return !!(els.page && els.content);
  }

  function attachEvents() {
    if (els.backBtn) {
      els.backBtn.addEventListener('click', (e) => { e.preventDefault(); handleBackNavigation(); });
    }
    
    if (els.completeBtn) {
      els.completeBtn.addEventListener('click', handleTaskComplete);
    }
    
    if (els.rescheduleBtn) {
      els.rescheduleBtn.addEventListener('click', handleTaskReschedule);
    }
    
    // Task navigation buttons
    const prevBtn = document.getElementById('task-prev-btn');
    const nextBtn = document.getElementById('task-next-btn');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => { e.preventDefault(); navigateToAdjacentTask('prev'); });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => { e.preventDefault(); navigateToAdjacentTask('next'); });
    }
  }

  function handleBackNavigation() {
    try {
      // Standardize navigation source detection to match account detail pattern
      const src = window._taskNavigationSource || '';
      // Default action helper
      const nav = (page) => { if (window.crm && typeof window.crm.navigateToPage === 'function') { window.crm.navigateToPage(page); } };

      if (src === 'account-details') {
        // Handle account details navigation with proper state restoration
        const restore = window.__accountDetailsRestoreData || {};
        nav('account-details');
        setTimeout(() => {
          try { 
            // Restore account details state if available
            if (restore.accountId && window.showAccountDetail && typeof window.showAccountDetail === 'function') {
              window.showAccountDetail(restore.accountId);
            }
            // Dispatch account details restore event
            document.dispatchEvent(new CustomEvent('pc:account-details-restore', { detail: restore || {} }));
            console.log('[Task Detail] Restored account details state:', restore);
          } catch(_) {}
        }, 80);
        return;
      }
      if (src === 'task-detail') {
        // Handle task detail navigation (when coming back from account detail)
        const restore = window.__taskDetailRestoreData || {};
        nav('task-detail');
        setTimeout(() => {
          try { 
            // Restore task detail state if available
            if (restore.taskId && window.TaskDetail && typeof window.TaskDetail.open === 'function') {
              window.TaskDetail.open(restore.taskId, restore.source || 'dashboard');
            }
            console.log('[Task Detail] Restored task detail state:', restore);
          } catch(_) {}
        }, 80);
        return;
      }
      if (src === 'accounts') {
        const restore = window._accountsReturn || window.__accountsRestoreData || (window.accountsModule && typeof window.accountsModule.getCurrentState==='function' ? window.accountsModule.getCurrentState() : null);
        nav('accounts');
        setTimeout(() => {
          try { window.accountsModule && typeof window.accountsModule.rebindDynamic==='function' && window.accountsModule.rebindDynamic(); } catch(_) {}
          try { document.dispatchEvent(new CustomEvent('pc:accounts-restore', { detail: restore || {} })); } catch(_) {}
        }, 80);
        return;
      }
      if (src === 'people') {
        const restore = window.__peopleRestoreData || (window.peopleModule && typeof window.peopleModule.getCurrentState==='function' ? window.peopleModule.getCurrentState() : null);
        nav('people');
        setTimeout(() => {
          try { window.peopleModule && typeof window.peopleModule.rebindDynamic==='function' && window.peopleModule.rebindDynamic(); } catch(_) {}
          try { document.dispatchEvent(new CustomEvent('pc:people-restore', { detail: restore || {} })); } catch(_) {}
        }, 80);
        return;
      }
      if (src === 'tasks') {
        const restore = window.__tasksRestoreData || { scroll: window.__tasksScrollY || 0 };
        nav('tasks');
        setTimeout(() => {
          try { document.dispatchEvent(new CustomEvent('pc:tasks-restore', { detail: restore || {} })); } catch(_) {}
        }, 80);
        return;
      }
      if (src === 'dashboard') {
        // Handle dashboard navigation with proper state restoration
        const restore = window._dashboardReturn || { scroll: 0 };
        nav('dashboard');
        setTimeout(() => {
          try { 
            // Restore dashboard scroll position
            if (restore.scroll && restore.scroll > 0) {
              window.scrollTo(0, restore.scroll);
            }
            // Restore Today's Tasks widget state if available
            if (restore.dashboardState && window.crm && typeof window.crm.loadTodaysTasks === 'function') {
              // Restore Today's Tasks pagination
              if (restore.dashboardState.todaysTasksPage && window.crm.todaysTasksPagination) {
                window.crm.todaysTasksPagination.currentPage = restore.dashboardState.todaysTasksPage;
              }
              // Reload Today's Tasks to reflect restored state
              window.crm.loadTodaysTasks();
            }
            // Dispatch dashboard restore event
            document.dispatchEvent(new CustomEvent('pc:dashboard-restore', { detail: restore || {} }));
            console.log('[Task Detail] Restored dashboard state:', restore);
          } catch(_) {}
        }, 80);
        return;
      }
      if (src) { nav(src); return; }
      // Fallback: go to tasks
      nav('tasks');
    } catch (e) {
      try { window.crm && window.crm.navigateToPage && window.crm.navigateToPage('tasks'); } catch(_) {}
    }
  }

  async function handleTaskComplete() {
    if (!state.currentTask) return;
    
    // Get updated notes from the form
    const callNotesEl = document.getElementById('call-notes');
    const updatedNotes = callNotesEl ? callNotesEl.value.trim() : '';
    const finalNotes = updatedNotes || state.currentTask.notes || '';
    
    // Save notes to recent activities if there are any
    if (finalNotes) {
      try {
        await saveTaskNotesToRecentActivity(state.currentTask, finalNotes);
      } catch (e) {
        console.warn('Could not save notes to recent activity:', e);
      }
    }
    
    // Remove from localStorage completely
    try {
      const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
      const filteredTasks = userTasks.filter(t => t.id !== state.currentTask.id);
      localStorage.setItem('userTasks', JSON.stringify(filteredTasks));
    } catch (e) {
      console.warn('Could not remove task from localStorage:', e);
    }
    
    // Delete from Firebase completely
    try {
      if (window.firebaseDB) {
        const snapshot = await window.firebaseDB.collection('tasks')
          .where('id', '==', state.currentTask.id)
          .limit(1)
          .get();
        
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          await doc.ref.delete();
        }
      }
    } catch (e) {
      console.warn('Could not delete task from Firebase:', e);
    }
    
    // Show success message
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Task completed successfully');
    }
    
    // Refresh Today's Tasks widget
    try {
      if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
        window.crm.loadTodaysTasks();
      }
    } catch (e) {
      console.warn('Could not refresh Today\'s Tasks widget:', e);
    }
    
    // Trigger tasks updated event for other components
    window.dispatchEvent(new CustomEvent('tasksUpdated', { 
      detail: { source: 'taskCompletion' } 
    }));
    
    // Navigate to next task instead of going back
    try {
      // Clean up any existing avatars/icons before navigation
      cleanupExistingAvatarsAndIcons();
      
      // Small delay to ensure task deletion has been processed
      await new Promise(resolve => setTimeout(resolve, 100));
      await navigateToAdjacentTask('next');
    } catch (e) {
      console.warn('Could not navigate to next task, falling back to previous page:', e);
      // Fallback: navigate back if no next task available
      handleBackNavigation();
    }
  }

  function handleTaskReschedule() {
    // TODO: Implement reschedule functionality
    console.log('Reschedule task:', state.currentTask);
  }

  // Save task notes to recent activities
  async function saveTaskNotesToRecentActivity(task, notes) {
    if (!notes || !window.firebaseDB) return;
    
    try {
      const activityData = {
        type: 'task_completed',
        title: `Task completed: ${task.title}`,
        description: notes,
        entityType: isAccountTask(task) ? 'account' : 'contact',
        entityId: isAccountTask(task) ? (task.accountId || '') : (task.contactId || ''),
        entityName: isAccountTask(task) ? (task.account || '') : (task.contact || ''),
        taskType: task.type,
        taskPriority: task.priority,
        completedAt: new Date(),
        createdAt: new Date(),
        userId: window.currentUser?.uid || 'anonymous'
      };
      
      // Save to Firebase activities collection
      await window.firebaseDB.collection('activities').add({
        ...activityData,
        timestamp: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
      });
      
      console.log('Task notes saved to recent activities:', activityData);
    } catch (error) {
      console.error('Error saving task notes to recent activities:', error);
    }
  }

  async function navigateToAdjacentTask(direction) {
    if (!state.currentTask) return;
    
    // Prevent multiple rapid clicks
    if (state.navigating) {
      console.log('Navigation already in progress, ignoring click');
      return;
    }
    
    state.navigating = true;
    
    try {
      // Get all tasks from the same source (localStorage + Firebase)
      let allTasks = [];
      
      // Load from localStorage
      try {
        const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        allTasks = [...userTasks];
      } catch (_) { allTasks = []; }
      
      // Load from Firebase
      if (window.firebaseDB) {
        try {
          const snapshot = await window.firebaseDB.collection('tasks')
            .orderBy('timestamp', 'desc')
            .limit(200)
            .get();
          const firebaseTasks = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
            return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
          });
          
          // Merge with localStorage (local takes precedence for duplicates)
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          firebaseTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          allTasks = Array.from(allTasksMap.values());
        } catch (e) {
          console.warn('Could not load tasks from Firebase for navigation:', e);
        }
      }
      
      // Filter to today's and overdue pending tasks (same logic as Today's Tasks widget)
      const today = new Date();
      const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const parseDateStrict = (dateStr) => {
        if (!dateStr) return null;
        try {
          if (dateStr.includes('/')) {
            const [mm, dd, yyyy] = dateStr.split('/').map(n => parseInt(n, 10));
            if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
          } else if (dateStr.includes('-')) {
            const [yyyy, mm, dd] = dateStr.split('-').map(n => parseInt(n, 10));
            if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
          }
          const d = new Date(dateStr);
          if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        } catch (_) { /* noop */ }
        return null;
      };
      
      const todaysTasks = allTasks.filter(task => {
        if ((task.status || 'pending') !== 'pending') return false;
        const d = parseDateStrict(task.dueDate);
        if (!d) return false;
        return d.getTime() <= localMidnight.getTime();
      });
      
      // Sort by due date/time (earliest to latest)
      todaysTasks.sort((a, b) => {
        const da = parseDateStrict(a.dueDate);
        const db = parseDateStrict(b.dueDate);
        if (da && db) {
          const dd = da - db;
          if (dd !== 0) return dd;
        } else if (da && !db) {
          return -1;
        } else if (!da && db) {
          return 1;
        }
        
        const parseTimeToMinutes = (timeStr) => {
          if (!timeStr || typeof timeStr !== 'string') return NaN;
          const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (!m) return NaN;
          let h = parseInt(m[1], 10);
          const mins = parseInt(m[2], 10);
          const ap = m[3].toUpperCase();
          if (h === 12) h = 0;
          if (ap === 'PM') h += 12;
          return h * 60 + mins;
        };
        
        const ta = parseTimeToMinutes(a.dueTime);
        const tb = parseTimeToMinutes(b.dueTime);
        const taValid = !isNaN(ta), tbValid = !isNaN(tb);
        if (taValid && tbValid) {
          const td = ta - tb; if (td !== 0) return td;
        } else if (taValid && !tbValid) {
          return -1;
        } else if (!taValid && tbValid) {
          return 1;
        }
        
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      
      // Find current task index
      const currentIndex = todaysTasks.findIndex(task => task.id === state.currentTask.id);
      
      // If current task not found (e.g., just completed), find the appropriate next task
      let targetIndex;
      if (currentIndex === -1) {
        console.log('Current task not found in filtered list (likely just completed)');
        if (direction === 'next') {
          // For next navigation after completion, go to the first remaining task
          targetIndex = 0;
        } else {
          // For previous navigation after completion, go to the last remaining task
          targetIndex = todaysTasks.length - 1;
        }
      } else {
        // Calculate next/previous index normally
        if (direction === 'next') {
          targetIndex = currentIndex + 1;
        } else {
          targetIndex = currentIndex - 1;
        }
      }
      
      // Check bounds - don't navigate if at the end
      if (targetIndex < 0 || targetIndex >= todaysTasks.length) {
        console.log(`Navigation ${direction} blocked: targetIndex ${targetIndex}, total tasks ${todaysTasks.length}`);
        return;
      }
      
      // Navigate to the target task
      const targetTask = todaysTasks[targetIndex];
      if (targetTask && targetTask.id) {
        console.log(`Navigating ${direction} from task ${currentIndex} to task ${targetIndex}: ${targetTask.title}`);
        
        // Clean up any existing avatars/icons before loading new task
        cleanupExistingAvatarsAndIcons();
        
        // Load the target task data directly instead of calling TaskDetail.open
        await loadTaskData(targetTask.id);
      }
      
    } catch (error) {
      console.error('Error navigating to adjacent task:', error);
    } finally {
      // Reset navigation flag after a short delay
      setTimeout(() => {
        state.navigating = false;
      }, 500);
    }
  }

  async function updateNavigationButtons() {
    if (!state.currentTask) return;
    
    const prevBtn = document.getElementById('task-prev-btn');
    const nextBtn = document.getElementById('task-next-btn');
    
    if (!prevBtn || !nextBtn) return;
    
    try {
      // Get all tasks (same logic as navigation)
      let allTasks = [];
      
      // Load from localStorage
      try {
        const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        allTasks = [...userTasks];
      } catch (_) { allTasks = []; }
      
      // Load from Firebase
      if (window.firebaseDB) {
        try {
          const snapshot = await window.firebaseDB.collection('tasks')
            .orderBy('timestamp', 'desc')
            .limit(200)
            .get();
          const firebaseTasks = snapshot.docs.map(doc => {
            const data = doc.data() || {};
            const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
            return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
          });
          
          // Merge with localStorage
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          firebaseTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          allTasks = Array.from(allTasksMap.values());
        } catch (e) {
          console.warn('Could not load tasks from Firebase for navigation buttons:', e);
        }
      }
      
      // Filter to today's and overdue pending tasks
      const today = new Date();
      const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const parseDateStrict = (dateStr) => {
        if (!dateStr) return null;
        try {
          if (dateStr.includes('/')) {
            const [mm, dd, yyyy] = dateStr.split('/').map(n => parseInt(n, 10));
            if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
          } else if (dateStr.includes('-')) {
            const [yyyy, mm, dd] = dateStr.split('-').map(n => parseInt(n, 10));
            if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm - 1, dd);
          }
          const d = new Date(dateStr);
          if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        } catch (_) { /* noop */ }
        return null;
      };
      
      const todaysTasks = allTasks.filter(task => {
        if ((task.status || 'pending') !== 'pending') return false;
        const d = parseDateStrict(task.dueDate);
        if (!d) return false;
        return d.getTime() <= localMidnight.getTime();
      });
      
      // Sort by due date/time (same logic as navigation)
      todaysTasks.sort((a, b) => {
        const da = parseDateStrict(a.dueDate);
        const db = parseDateStrict(b.dueDate);
        if (da && db) {
          const dd = da - db;
          if (dd !== 0) return dd;
        } else if (da && !db) {
          return -1;
        } else if (!da && db) {
          return 1;
        }
        
        const parseTimeToMinutes = (timeStr) => {
          if (!timeStr || typeof timeStr !== 'string') return NaN;
          const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (!m) return NaN;
          let h = parseInt(m[1], 10);
          const mins = parseInt(m[2], 10);
          const ap = m[3].toUpperCase();
          if (h === 12) h = 0;
          if (ap === 'PM') h += 12;
          return h * 60 + mins;
        };
        
        const ta = parseTimeToMinutes(a.dueTime);
        const tb = parseTimeToMinutes(b.dueTime);
        const taValid = !isNaN(ta), tbValid = !isNaN(tb);
        if (taValid && tbValid) {
          const td = ta - tb; if (td !== 0) return td;
        } else if (taValid && !tbValid) {
          return -1;
        } else if (!taValid && tbValid) {
          return 1;
        }
        
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      
      // Find current task index
      const currentIndex = todaysTasks.findIndex(task => task.id === state.currentTask.id);
      
      // Update button states
      if (currentIndex === -1) {
        // Current task not found in filtered list
        prevBtn.disabled = true;
        nextBtn.disabled = true;
      } else {
        // Enable/disable based on position
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === todaysTasks.length - 1;
      }
      
    } catch (error) {
      console.error('Error updating navigation buttons:', error);
      // Disable both buttons on error
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    }
  }

  async function loadTaskData(taskId) {
    // Load task from localStorage and Firebase
    let task = null;
    
    // Try localStorage first
    try {
      const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
      task = userTasks.find(t => t.id === taskId);
    } catch (e) {
      console.warn('Could not load task from localStorage:', e);
    }
    
    // If not found, try Firebase
    if (!task && window.firebaseDB) {
      try {
        console.log('Loading task from Firebase:', taskId);
        const snapshot = await window.firebaseDB.collection('tasks')
          .where('id', '==', taskId)
          .limit(1)
          .get();
        
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? 
            data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
          task = { ...data, id: data.id || doc.id, createdAt, status: data.status || 'pending' };
        }
      } catch (error) {
        console.warn('Could not load task from Firebase:', error);
      }
    }
    
    if (!task) {
      console.error('Task not found:', taskId);
      return;
    }
    // Normalize legacy task shapes/titles/types
    const normType = (t)=>{
      const s = String(t||'').toLowerCase().trim();
      if (s === 'phone call' || s === 'phone' || s === 'call') return 'phone-call';
      if (s === 'manual email' || s === 'email' || s === 'manual-email') return 'manual-email';
      if (s === 'auto email' || s === 'automatic email' || s === 'auto-email') return 'auto-email';
      if (s === 'follow up' || s === 'follow-up') return 'follow-up';
      if (s === 'custom task' || s === 'custom-task' || s === 'task') return 'custom-task';
      if (s === 'demo') return 'demo';
      if (s === 'li-connect' || s === 'linkedin-connect' || s === 'linkedin - send connection request') return 'li-connect';
      if (s === 'li-message' || s === 'linkedin-message' || s === 'linkedin - send message') return 'li-message';
      if (s === 'li-view-profile' || s === 'linkedin-view' || s === 'linkedin - view profile') return 'li-view-profile';
      if (s === 'li-interact-post' || s === 'linkedin-interact' || s === 'linkedin - interact with post') return 'li-interact-post';
      return t || 'custom-task';
    };
    task.type = normType(task.type);
    // Upgrade legacy title like "Task — Name" to descriptive form
    try {
      const looksLegacy = /^task\s+[—-]\s+/i.test(String(task.title||''));
      if (looksLegacy && window.crm && typeof window.crm.buildTaskTitle==='function') {
        task.title = window.crm.buildTaskTitle(task.type, task.contact||'', task.account||'');
      }
    } catch(_) {}

    state.currentTask = task;
    state.taskType = task.type;
    
    // Load contact/account data
    loadContactAccountData(task);
    
    // Render the task page
    renderTaskPage();
  }

  function loadContactAccountData(task) {
    // Load contact data if available
    if (task.contactId) {
      // TODO: Load contact from people data
      console.log('Loading contact:', task.contactId);
    }
    
    // Load account data if available
    if (task.accountId) {
      // TODO: Load account from accounts data
      console.log('Loading account:', task.accountId);
    }
  }

  // Robust cleanup function to remove all existing avatars/icons
  function cleanupExistingAvatarsAndIcons() {
    const titleSection = document.querySelector('.contact-header-text');
    if (!titleSection) return;
    
    // Remove all possible avatar/icon elements
    const selectors = [
      '.avatar-initials',
      '.company-favicon-header', 
      '.avatar-absolute',
      '[class*="avatar"]',
      '[class*="favicon"]',
      '[class*="company-logo"]',
      '[class*="company-icon"]'
    ];
    
    selectors.forEach(selector => {
      const elements = titleSection.querySelectorAll(selector);
      elements.forEach(el => {
        if (el && el.parentNode) {
          el.remove();
        }
      });
    });
    
    // Also check for any absolutely positioned elements that might be avatars
    const allChildren = titleSection.querySelectorAll('*');
    allChildren.forEach(child => {
      if (child.style && child.style.position === 'absolute' && 
          (child.classList.contains('avatar-absolute') || 
           child.querySelector('.avatar-initials') || 
           child.querySelector('.company-favicon-header') ||
           child.querySelector('[class*="avatar"]') ||
           child.querySelector('[class*="favicon"]'))) {
        child.remove();
      }
    });
    
    // Force a reflow to ensure DOM is clean
    titleSection.offsetHeight;
  }

  function renderTaskPage() {
    if (!state.currentTask) return;
    
    // Clean up any existing avatars/icons first
    cleanupExistingAvatarsAndIcons();
    
    injectTaskDetailStyles();
    
    // Update page title and subtitle - keep original task title and due date/time
    if (els.title) {
      els.title.textContent = state.currentTask.title;
    }
    
    if (els.subtitle) {
      const dueDate = state.currentTask.dueDate;
      const dueTime = state.currentTask.dueTime;
      els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
    }
    
    // For phone tasks, add header info based on task type
    if (state.taskType === 'phone-call') {
      // Check if this is an account task or contact task
      if (isAccountTask(state.currentTask)) {
        // Account task header
        const accountName = state.currentTask.account || '';
        const accountId = state.currentTask.accountId || '';
        const account = findAccountByIdOrName(accountId, accountName);
        
        // Prepare company icon/favicon
        const deriveDomain = (input) => {
          try {
            if (!input) return '';
            let s = String(input).trim();
            if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
            if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
            return '';
          } catch(_) { return ''; }
        };
        const domain = account?.domain ? String(account.domain).replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/^www\./i,'') : deriveDomain(account?.website || '');
        const logoUrl = account?.logoUrl || '';
        const companyIconSize = 40; // Larger icon for header
        let companyIconHTML = '';
        try {
          if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
            companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: companyIconSize });
          }
        } catch(_) { /* noop */ }
        
        // Update title with company name link
        if (els.title && accountName) {
          const companyLinkHTML = `<a href="#account-details" class="company-link" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(accountName)}">${escapeHtml(accountName)}</a>`;
          els.title.innerHTML = `Call ${companyLinkHTML}`;
        }
        
        // Add company icon/favicon to header
        const titleSection = document.querySelector('.contact-header-text');
        if (titleSection) {
          // More thorough cleanup of existing avatars/icons
          const existingElements = titleSection.querySelectorAll('.avatar-initials, .company-favicon-header, .avatar-absolute, [class*="avatar"], [class*="favicon"]');
          existingElements.forEach(el => {
            if (el && el.parentNode) {
              el.remove();
            }
          });
          
          // Also check for any absolutely positioned elements that might be avatars
          const allChildren = titleSection.querySelectorAll('*');
          allChildren.forEach(child => {
            if (child.style && child.style.position === 'absolute' && 
                (child.classList.contains('avatar-absolute') || 
                 child.querySelector('.avatar-initials') || 
                 child.querySelector('.company-favicon-header'))) {
              child.remove();
            }
          });
          
          // If no icon HTML generated, create a fallback with first letter
          if (!companyIconHTML) {
            const fallbackLetter = accountName ? accountName.charAt(0).toUpperCase() : 'C';
            companyIconHTML = `<div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--bg-item); border-radius: 6px; font-weight: 600; font-size: 18px; color: var(--text-secondary);">${fallbackLetter}</div>`;
          }
          
          // Add company favicon positioned like the avatar
          const faviconWrapper = `<div class="company-favicon-header avatar-absolute" aria-hidden="true">${companyIconHTML}</div>`;
          titleSection.insertAdjacentHTML('beforeend', faviconWrapper);
        }
        
        // Add location info under title
        let contactInfoEl = document.getElementById('task-contact-info');
        if (!contactInfoEl) {
          contactInfoEl = document.createElement('div');
          contactInfoEl.id = 'task-contact-info';
          contactInfoEl.className = 'task-contact-info';
          contactInfoEl.style.cssText = 'margin-top: 0px; color: var(--text-secondary); font-size: 14px;';
          
          const titleSection = document.querySelector('.contact-header-text');
          const subtitle = document.getElementById('task-detail-subtitle');
          if (titleSection && subtitle) {
            subtitle.insertAdjacentElement('beforebegin', contactInfoEl);
          }
        }
        
        const city = account?.city || account?.locationCity || '';
        const stateVal = account?.state || account?.locationState || '';
        const locationHTML = city && stateVal ? `${escapeHtml(city)}, ${escapeHtml(stateVal)}` : (city || stateVal || '');
        contactInfoEl.innerHTML = `<div class="contact-details-normal">${locationHTML}</div>`;
        
      } else {
        // Contact task header (existing logic)
        const contactName = state.currentTask.contact || '';
        const accountName = state.currentTask.account || '';
        const person = (typeof window.getPeopleData === 'function' ? (window.getPeopleData() || []).find(p => {
          const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        }) : null) || {};
        const title = person.title || '';
        const company = person.companyName || accountName;
        
        // Compute initials for avatar (same logic as people.js)
        const initials = (() => {
          const parts = String(contactName || '').trim().split(/\s+/).filter(Boolean);
          const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : (parts[0] ? [parts[0][0]] : []);
          const str = chars.join('').toUpperCase();
          if (str) return str;
          const e = String(person.email || '').trim();
          return e ? e[0].toUpperCase() : '?';
        })();
        
        console.log('Contact task - Contact name:', contactName, 'Initials:', initials);
        
        // Update the main title to include clickable contact name
        if (els.title && contactName) {
          const contactId = person.id || '';
          const contactLinkHTML = `<a href="#contact-details" class="contact-link" data-contact-id="${escapeHtml(contactId)}" data-contact-name="${escapeHtml(contactName)}">${escapeHtml(contactName)}</a>`;
          els.title.innerHTML = `Call ${contactLinkHTML}`;
        }
        
        // Create or update contact info element (no avatar here)
        let contactInfoEl = document.getElementById('task-contact-info');
        if (!contactInfoEl) {
          contactInfoEl = document.createElement('div');
          contactInfoEl.id = 'task-contact-info';
          contactInfoEl.className = 'task-contact-info';
          contactInfoEl.style.cssText = 'margin-top: 0px; color: var(--text-secondary); font-size: 14px;';
          
          // Insert between title and subtitle
          const titleSection = document.querySelector('.contact-header-text');
          const subtitle = document.getElementById('task-detail-subtitle');
          if (titleSection && subtitle) {
            // Insert the contact info element before the subtitle
            subtitle.insertAdjacentElement('beforebegin', contactInfoEl);
          }
        }
        
        // Create contact details content (no avatar here)
        let contactDetailsHTML = '';
        
        if (title && company) {
          const linkedAccount = findAssociatedAccount(person);
          const accountId = linkedAccount?.id || '';
          const companyLink = `<a href="#account-details" class="company-link" id="task-header-company-link" title="View account details" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(company)}">${escapeHtml(company)}</a>`;
          contactDetailsHTML = `${title} at ${companyLink}`;
        } else if (title) {
          contactDetailsHTML = title;
        } else if (company) {
          const linkedAccount = findAssociatedAccount(person);
          const accountId = linkedAccount?.id || '';
          const companyLink = `<a href="#account-details" class="company-link" id="task-header-company-link" title="View account details" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(company)}">${escapeHtml(company)}</a>`;
          contactDetailsHTML = companyLink;
        }
        
        // Set the contact details content
        contactInfoEl.innerHTML = `<div class="contact-details-normal">${contactDetailsHTML}</div>`;
        
        // Add absolutely positioned avatar to the main title container
        // Use a longer delay to ensure DOM is ready and previous elements are cleaned up
        setTimeout(() => {
          const titleSection = document.querySelector('.contact-header-text');
          console.log('Contact task - Title section found:', !!titleSection, 'Initials:', initials);
          if (titleSection) {
            // More thorough cleanup of existing avatars/icons
            const existingElements = titleSection.querySelectorAll('.avatar-initials, .company-favicon-header, .avatar-absolute, [class*="avatar"], [class*="favicon"]');
            existingElements.forEach(el => {
              if (el && el.parentNode) {
                console.log('Removing existing avatar/icon element:', el.className);
                el.remove();
              }
            });
            
            // Also check for any absolutely positioned elements that might be avatars
            const allChildren = titleSection.querySelectorAll('*');
            allChildren.forEach(child => {
              if (child.style && child.style.position === 'absolute' && 
                  (child.classList.contains('avatar-absolute') || 
                   child.querySelector('.avatar-initials') || 
                   child.querySelector('.company-favicon-header'))) {
                console.log('Removing absolutely positioned avatar element:', child.className);
                child.remove();
              }
            });
            
            // Ensure we have valid initials
            const finalInitials = initials && initials !== '?' ? initials : (contactName ? contactName.charAt(0).toUpperCase() : 'C');
            
            // Add the avatar positioned relative to the title section
            const avatarHTML = `<span class="avatar-initials avatar-absolute" aria-hidden="true">${escapeHtml(finalInitials)}</span>`;
            console.log('Adding avatar HTML:', avatarHTML);
            titleSection.insertAdjacentHTML('beforeend', avatarHTML);
          } else {
            console.log('Contact task - No title section found');
          }
        }, 150); // Increased delay for better cleanup
      }
    }
    
    // Render task-specific content (split layout similar to Apollo screenshot)
    renderTaskContent();
    
    // Add company link event handlers
    setupCompanyLinkHandlers();
    
    // Add contact link event handlers
    setupContactLinkHandlers();
    
    // Load widgets
    loadTaskWidgets();
    
    // Load recent activity data for phone tasks
    if (state.taskType === 'phone-call') {
      loadRecentActivityForTask();
    }

    // If phone task, embed contact details on the right
    try {
      if ((state.taskType||'') === 'phone-call') embedContactDetails();
    } catch (_) {}
    
    // Update navigation button states
    updateNavigationButtons();
    
    // Process click-to-call and click-to-email elements
    setTimeout(() => {
      processClickToCallAndEmail();
    }, 100);
    
    // Add event listener for "Log call & complete task" button
    const logCompleteBtn = document.getElementById('log-complete-call');
    if (logCompleteBtn) {
      logCompleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Get notes from the form
        const callNotesEl = document.getElementById('call-notes');
        const callPurposeEl = document.getElementById('call-purpose');
        
        if (callNotesEl) {
          const formNotes = callNotesEl.value.trim();
          const purpose = callPurposeEl ? callPurposeEl.value : 'Prospecting Call';
          
          // Update task notes with form data
          if (formNotes) {
            state.currentTask.notes = `${purpose}: ${formNotes}`;
          } else if (purpose !== 'Prospecting Call') {
            state.currentTask.notes = `Call purpose: ${purpose}`;
          }
        }
        
        // Complete the task
        await handleTaskComplete();
      });
    }
  }

  function setupCompanyLinkHandlers() {
    // Add click handlers for company links
    const companyLinks = document.querySelectorAll('#task-detail-page .company-link');
    companyLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = link.getAttribute('data-account-id');
        const accountName = link.getAttribute('data-account-name');
        
        // Capture task detail state for back navigation
        if (state.currentTask) {
          window.__taskDetailRestoreData = {
            taskId: state.currentTask.id,
            source: window._taskNavigationSource || 'dashboard',
            timestamp: Date.now()
          };
          // Set navigation source for account details
          window._accountNavigationSource = 'task-detail';
        }
        
        if (accountId && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
          try {
            window.AccountDetail.show(accountId);
          } catch (error) {
            console.error('Failed to navigate to account detail:', error);
          }
        } else if (accountName && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
          // Fallback: try to find account by name
          try {
            if (typeof window.getAccountsData === 'function') {
              const accounts = window.getAccountsData() || [];
              const account = accounts.find(acc => {
                const accName = (acc.accountName || acc.name || acc.companyName || '').toLowerCase().trim();
                const searchName = accountName.toLowerCase().trim();
                return accName === searchName || accName.includes(searchName) || searchName.includes(accName);
              });
              if (account) {
                window.AccountDetail.show(account.id);
              }
            }
          } catch (error) {
            console.error('Failed to find account by name:', error);
          }
        }
      });
    });
  }

  function renderTaskContent() {
    if (!els.content) return;
    
    const task = state.currentTask;
    const taskType = task.type;
    
    let contentHtml = '';
    
    // Check if this is an account task
    if (isAccountTask(task)) {
      contentHtml = renderAccountTaskContent(task);
    } else {
      // Contact task - use existing logic
      switch (taskType) {
        case 'phone-call':
          contentHtml = renderCallTaskContent(task);
          break;
        case 'manual-email':
        case 'auto-email':
          contentHtml = renderEmailTaskContent(task);
          break;
        case 'li-connect':
        case 'li-message':
        case 'li-view-profile':
        case 'li-interact-post':
          contentHtml = renderLinkedInTaskContent(task);
          break;
        default:
          contentHtml = renderGenericTaskContent(task);
      }
    }
    
    els.content.innerHTML = contentHtml;
  }

  function renderAccountTaskContent(task) {
    // Get account information
    const accountName = task.account || '';
    const accountId = task.accountId || '';
    
    // Load the account data
    const account = findAccountByIdOrName(accountId, accountName);
    
    if (!account) {
      return `<div class="task-content"><div class="empty">Account not found: ${escapeHtml(accountName)}</div></div>`;
    }
    
    // Get account fields
    const companyPhone = account.companyPhone || account.phone || account.primaryPhone || account.mainPhone || '';
    const industry = account.industry || '';
    const employees = account.employees || '';
    const shortDescription = account.shortDescription || '';
    const city = account.city || account.locationCity || '';
    const stateVal = account.state || account.locationState || '';
    const website = account.website || '';
    
    // Energy & contract fields
    const electricitySupplier = account.electricitySupplier || '';
    const annualUsage = account.annualUsage || '';
    const currentRate = account.currentRate || '';
    const contractEndDate = account.contractEndDate || '';
    
    // Prepare company icon using global favicon helper
    const deriveDomain = (input) => {
      try {
        if (!input) return '';
        let s = String(input).trim();
        if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
        return '';
      } catch(_) { return ''; }
    };
    const domain = account.domain ? String(account.domain).replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/^www\./i,'') : deriveDomain(website);
    const logoUrl = account.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch(_) { /* noop */ }
    if (!companyIconHTML) {
      if (window.__pcAccountsIcon) companyIconHTML = window.__pcAccountsIcon();
      else companyIconHTML = `<div class="company-logo-fallback">${accountName ? accountName.charAt(0).toUpperCase() : 'C'}</div>`;
    }
    
    // Render contacts list
    const contactsListHTML = renderAccountContacts(account);
    
    return `
      <div class="main-content">
        <!-- Log Call Card (for phone tasks) -->
        ${task.type === 'phone-call' ? `
        <div class="task-card" id="call-log-card">
          <h3 class="section-title">Log call</h3>
          <div class="call-list">
            ${companyPhone ? `<div class="call-row"><button class="btn-secondary phone-text" data-phone="${escapeHtml(companyPhone)}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(logoUrl || '')}" data-is-company-phone="true" data-city="${escapeHtml(city || '')}" data-state="${escapeHtml(stateVal || '')}" data-domain="${escapeHtml(domain || '')}" data-call="${companyPhone}">Call</button><span class="call-number phone-text" data-phone="${escapeHtml(companyPhone)}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(logoUrl || '')}" data-is-company-phone="true" data-city="${escapeHtml(city || '')}" data-state="${escapeHtml(stateVal || '')}" data-domain="${escapeHtml(domain || '')}">${escapeHtml(companyPhone)}</span></div>` : '<div class="empty">No company phone number on file</div>'}
          </div>
          <div class="form-row">
            <label>Call purpose</label>
            <select class="input-dark" id="call-purpose">
              <option value="Prospecting Call" selected>Prospecting Call</option>
              <option value="Discovery">Discovery</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>
          <div class="form-row">
            <label>Notes</label>
            <textarea class="input-dark" id="call-notes" rows="3" placeholder="Add call notes...">${task.notes ? escapeHtml(task.notes) : ''}</textarea>
          </div>
          <div class="actions">
            <button class="btn-primary" id="log-complete-call">Log call & complete task</button>
            <button class="btn-secondary" id="schedule-meeting">Schedule a meeting</button>
          </div>
        </div>
        ` : ''}
        
        <!-- Contacts List Card -->
        <div class="task-card contacts-list-card">
          <div class="section-header-with-action">
            <h3 class="section-title">Contacts</h3>
            <button class="btn-icon-add" id="add-contact-btn" title="Add contact" aria-label="Add new contact">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
          <div class="contacts-list" id="account-contacts-list">
            ${contactsListHTML}
          </div>
        </div>
      </div>
      
      <div class="sidebar-content">
        <!-- Account Information -->
        <div class="contact-info-section">
          <h3 class="section-title">Account Information</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">COMPANY PHONE</div>
              <div class="info-value ${!companyPhone ? 'empty' : ''}">${companyPhone ? `<span class="phone-text" data-phone="${escapeHtml(companyPhone)}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(logoUrl || '')}" data-is-company-phone="true" data-city="${escapeHtml(city || '')}" data-state="${escapeHtml(stateVal || '')}" data-domain="${escapeHtml(domain || '')}">${escapeHtml(companyPhone)}</span>` : '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">INDUSTRY</div>
              <div class="info-value ${!industry ? 'empty' : ''}">${escapeHtml(industry) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">EMPLOYEES</div>
              <div class="info-value ${!employees ? 'empty' : ''}">${escapeHtml(employees) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">WEBSITE</div>
              <div class="info-value ${!website ? 'empty' : ''}">${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" class="website-link">${escapeHtml(website)}</a>` : '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">CITY</div>
              <div class="info-value ${!city ? 'empty' : ''}">${escapeHtml(city) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">STATE</div>
              <div class="info-value ${!stateVal ? 'empty' : ''}">${escapeHtml(stateVal) || '--'}</div>
            </div>
          </div>
          ${shortDescription ? `
          <div class="company-summary-section">
            <div class="info-label">COMPANY SUMMARY</div>
            <div class="company-summary-text">${escapeHtml(shortDescription)}</div>
          </div>
          ` : ''}
        </div>
        
        <!-- Energy & Contract Details -->
        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">ELECTRICITY SUPPLIER</div>
              <div class="info-value ${!electricitySupplier ? 'empty' : ''}">${escapeHtml(electricitySupplier) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">ANNUAL USAGE</div>
              <div class="info-value ${!annualUsage ? 'empty' : ''}">${escapeHtml(annualUsage) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">CURRENT RATE</div>
              <div class="info-value ${!currentRate ? 'empty' : ''}">${escapeHtml(currentRate) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">CONTRACT END</div>
              <div class="info-value ${!contractEndDate ? 'empty' : ''}">${escapeHtml(contractEndDate) || '--'}</div>
            </div>
          </div>
        </div>
        
        <!-- Recent Activity -->
        <div class="activity-section">
          <h3 class="section-title">Recent Activity</h3>
          <div class="activity-timeline" id="task-activity-timeline">
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
        </div>
      </div>
    `;
  }

  function renderCallTaskContent(task) {
    // Get contact information
    const contactName = task.contact || '';
    const accountName = task.account || '';
    const person = (typeof window.getPeopleData==='function' ? (window.getPeopleData()||[]).find(p=>{
      const full = [p.firstName,p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
      return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
    }) : null) || {};
    
    // Get contact details for the sidebar
    const contactId = person.id || person.contactId || '';
    const email = person.email || '';
    const city = person.city || person.locationCity || '';
    const stateVal = person.state || person.locationState || '';
    const industry = person.industry || person.companyIndustry || '';
    const seniority = person.seniority || '';
    const department = person.department || '';
    const companyName = person.companyName || accountName;
    
  // Get account information if available
    const linkedAccount = findAssociatedAccount(person) || null;
    
    // Get location data from both contact and account
    const finalCity = city || linkedAccount?.city || linkedAccount?.locationCity || '';
    const finalState = stateVal || linkedAccount?.state || linkedAccount?.locationState || '';
    const finalIndustry = industry || linkedAccount?.industry || '';
    
    const electricitySupplier = linkedAccount?.electricitySupplier || '';
    const annualUsage = linkedAccount?.annualUsage || '';
    const currentRate = linkedAccount?.currentRate || '';
    const contractEndDate = linkedAccount?.contractEndDate || '';
    const shortDescription = linkedAccount?.shortDescription || '';
    const companyPhone = linkedAccount?.companyPhone || linkedAccount?.phone || linkedAccount?.primaryPhone || linkedAccount?.mainPhone || '';

    // Prepare company icon using global favicon helper
    const deriveDomain = (input) => {
      try {
        if (!input) return '';
        let s = String(input).trim();
        if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
        return '';
      } catch(_) { return ''; }
    };
    const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/^www\./i,'') : deriveDomain(linkedAccount?.website || '');
    const logoUrl = linkedAccount?.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch(_) { /* noop */ }
    if (!companyIconHTML) {
      if (window.__pcAccountsIcon) companyIconHTML = window.__pcAccountsIcon();
      else companyIconHTML = `<div class="company-logo-fallback">${companyName ? companyName.charAt(0).toUpperCase() : 'C'}</div>`;
    }

    // Build company description: prefer shortDescription; fallback to previous industry/location line
    const locationPart = city && stateVal ? ` • Located in ${escapeHtml(city)}, ${escapeHtml(stateVal)}` : (city ? ` • Located in ${escapeHtml(city)}` : (stateVal ? ` • Located in ${escapeHtml(stateVal)}` : ''));
    const companyDescriptionHTML = shortDescription ? escapeHtml(shortDescription) : `${industry ? `Industry: ${escapeHtml(industry)}` : ''}${locationPart}`;

    // Get primary phone data with type information
    const phoneData = getPrimaryPhoneData(person);
    const { value: primaryPhone, type: phoneType } = phoneData;
    const phones = [person.mobile, person.workDirectPhone, person.otherPhone].filter(Boolean);
    const phoneList = phones.map(ph=>`<div class="call-row"><button class="btn-secondary" data-call="${ph}">Call</button><span class="call-number">${ph}</span></div>`).join('') || '<div class="empty">No phone numbers on file</div>';

    return `
      <div class="main-content">
        <!-- Log Call Card -->
        <div class="task-card" id="call-log-card">
          <h3 class="section-title">Log call</h3>
          <div class="call-list">${phoneList}</div>
          <div class="form-row">
            <label>Call purpose</label>
            <select class="input-dark" id="call-purpose">
              <option value="Prospecting Call" selected>Prospecting Call</option>
              <option value="Discovery">Discovery</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>
          <div class="form-row">
            <label>Notes</label>
            <textarea class="input-dark" id="call-notes" rows="3" placeholder="Add call notes...">${task.notes ? escapeHtml(task.notes) : ''}</textarea>
          </div>
          <div class="actions">
            <button class="btn-primary" id="log-complete-call">Log call & complete task</button>
            <button class="btn-secondary" id="schedule-meeting">Schedule a meeting</button>
          </div>
        </div>
        
        <!-- Company Summary Card -->
        <div class="company-summary-card">
          <div class="company-summary-header">
            <div class="company-logo">
              ${companyIconHTML}
            </div>
            <div class="company-name">${companyName ? `<a href="#account-details" class="company-link" id="task-company-link" title="View account details" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName)}">${escapeHtml(companyName)}</a>` : 'Unknown Company'}</div>
          </div>
          <div class="company-details">
            <div class="company-detail-item">
              <span class="detail-label">Location:</span>
              <span class="detail-value">${finalCity && finalState ? `${escapeHtml(finalCity)}, ${escapeHtml(finalState)}` : (finalCity ? escapeHtml(finalCity) : (finalState ? escapeHtml(finalState) : '--'))}</span>
            </div>
            <div class="company-detail-item">
              <span class="detail-label">Industry:</span>
              <span class="detail-value">${escapeHtml(finalIndustry) || '--'}</span>
            </div>
          </div>
          <div class="company-description">
            ${companyDescriptionHTML}
          </div>
        </div>
      </div>
      
      <div class="sidebar-content">
        <!-- Contact Information -->
        <div class="contact-info-section">
          <h3 class="section-title">Contact Information</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">EMAIL</div>
              <div class="info-value ${!email ? 'empty' : ''}">${email ? `<span class="email-text" data-email="${escapeHtml(email)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}">${escapeHtml(email)}</span>` : '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">${phoneType.toUpperCase()}</div>
              <div class="info-value ${!primaryPhone ? 'empty' : ''}">${primaryPhone ? `<span class="phone-text" data-phone="${escapeHtml(primaryPhone)}" data-contact-name="${escapeHtml(contactName)}" data-contact-id="${escapeHtml(contactId || '')}" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-phone-type="${phoneType}">${escapeHtml(primaryPhone)}</span>` : '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">COMPANY PHONE</div>
              <div class="info-value ${!companyPhone ? 'empty' : ''}">${companyPhone ? `<span class="phone-text" data-phone="${escapeHtml(companyPhone)}" data-contact-name="" data-contact-id="" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(companyName || '')}" data-company-name="${escapeHtml(companyName || '')}" data-logo-url="${escapeHtml(linkedAccount?.logoUrl || '')}" data-city="${escapeHtml(finalCity || '')}" data-state="${escapeHtml(finalState || '')}" data-domain="${escapeHtml(domain || '')}" data-is-company-phone="true">${escapeHtml(companyPhone)}</span>` : '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">CITY</div>
              <div class="info-value ${!city ? 'empty' : ''}">${escapeHtml(city) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">STATE</div>
              <div class="info-value ${!stateVal ? 'empty' : ''}">${escapeHtml(stateVal) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">INDUSTRY</div>
              <div class="info-value ${!industry ? 'empty' : ''}">${escapeHtml(industry) || '--'}</div>
            </div>
          </div>
        </div>
        
        ${linkedAccount ? `
        <!-- Energy & Contract Details -->
        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">ELECTRICITY SUPPLIER</div>
              <div class="info-value ${!electricitySupplier ? 'empty' : ''}">${escapeHtml(electricitySupplier) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">ANNUAL USAGE</div>
              <div class="info-value ${!annualUsage ? 'empty' : ''}">${escapeHtml(annualUsage) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">CURRENT RATE</div>
              <div class="info-value ${!currentRate ? 'empty' : ''}">${escapeHtml(currentRate) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">CONTRACT END</div>
              <div class="info-value ${!contractEndDate ? 'empty' : ''}">${escapeHtml(contractEndDate) || '--'}</div>
            </div>
          </div>
        </div>
        ` : ''}
        
        <!-- Recent Activity -->
        <div class="activity-section">
          <h3 class="section-title">Recent Activity</h3>
          <div class="activity-timeline" id="task-activity-timeline">
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
        </div>
      </div>
    `;
  }

  function renderEmailTaskContent(task) {
    return `
      <div class="task-content">
        <div class="email-composer">
          <h3>Email Composer</h3>
          <div class="compose-header">
            <div class="form-row">
              <label>To</label>
              <input type="email" class="input-dark" value="${task.contact || ''}" readonly />
            </div>
            <div class="form-row">
              <label>Subject</label>
              <input type="text" class="input-dark" placeholder="Email subject" />
            </div>
          </div>
          
          <div class="compose-body">
            <div class="email-editor" contenteditable="true" placeholder="Compose your email..."></div>
          </div>
          
          <div class="compose-actions">
            <button class="btn-secondary" id="save-draft-btn">Save Draft</button>
            <button class="btn-primary" id="send-email-btn">Send Email</button>
            <button class="btn-secondary" id="schedule-email-btn">Schedule</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLinkedInTaskContent(task) {
    const taskType = task.type;
    let actionText = '';
    
    switch (taskType) {
      case 'li-connect':
        actionText = 'Add on LinkedIn';
        break;
      case 'li-message':
        actionText = 'Send a message on LinkedIn';
        break;
      case 'li-view-profile':
        actionText = 'View LinkedIn profile';
        break;
      case 'li-interact-post':
        actionText = 'Interact with LinkedIn Post';
        break;
    }
    
    return `
      <div class="task-content">
        <div class="linkedin-task-section">
          <h3>LinkedIn Task: ${actionText}</h3>
          <div class="linkedin-info">
            <div class="info-item">
              <label>Contact</label>
              <div class="info-value">${task.contact || 'Not specified'}</div>
            </div>
            <div class="info-item">
              <label>Company</label>
              <div class="info-value">${task.account || 'Not specified'}</div>
            </div>
          </div>
          
          <div class="linkedin-actions">
            <button class="btn-primary" id="open-linkedin-btn">Open LinkedIn Profile</button>
            <button class="btn-secondary" id="mark-complete-btn">Mark as Complete</button>
          </div>
          
          <div class="linkedin-guidance">
            <h4>Guidance</h4>
            <p>Click "Open LinkedIn Profile" to view the contact's LinkedIn profile. Complete the ${actionText.toLowerCase()} action manually, then click "Mark as Complete" when finished.</p>
          </div>
        </div>
      </div>
    `;
  }

  function renderGenericTaskContent(task) {
    return `
      <div class="task-content">
        <div class="task-info-section">
          <h3>Task Information</h3>
          <div class="info-grid">
            <div class="info-item">
              <label>Type</label>
              <div class="info-value">${task.type}</div>
            </div>
            <div class="info-item">
              <label>Priority</label>
              <div class="info-value priority-badge ${task.priority}" style="background: ${getPriorityBackground(task.priority)}; color: ${getPriorityColor(task.priority)};">${task.priority}</div>
            </div>
            <div class="info-item">
              <label>Status</label>
              <div class="info-value status-badge ${task.status}">${task.status}</div>
            </div>
          </div>
        </div>
        
        <div class="task-notes-section">
          <h3>Notes</h3>
          <div class="notes-content">${task.notes || 'No notes provided'}</div>
        </div>
      </div>
    `;
  }

  function loadTaskWidgets() {
    // Load maps widget if account data is available
    if (state.account) {
      loadMapsWidget();
    }
    
    // Load energy health check if account data is available
    if (state.account) {
      loadEnergyHealthCheck();
    }
    
    // Load notes widget
    loadNotesWidget();
  }

  function loadMapsWidget() {
    // TODO: Load maps widget with account location
    console.log('Loading maps widget for account:', state.account);
  }

  function loadEnergyHealthCheck() {
    // TODO: Load energy health check widget with account data
    console.log('Loading energy health check for account:', state.account);
  }

  function loadNotesWidget() {
    // TODO: Load notes widget
    console.log('Loading notes widget');
  }

  // Embed contact detail below-header section into right pane for context
  function embedContactDetails(){
    const mount = document.getElementById('task-contact-embed');
    if (!mount) return;
    const contactName = state.currentTask?.contact || '';
    const people = (typeof window.getPeopleData==='function') ? (window.getPeopleData()||[]) : [];
    let contact = null;
    if (state.currentTask?.contactId) {
      contact = people.find(p => String(p.id||'') === String(state.currentTask.contactId));
    }
    if (!contact && contactName) {
      const norm = (s)=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
      contact = people.find(p => norm([p.firstName,p.lastName].filter(Boolean).join(' ')||p.name||'') === norm(contactName));
    }
    if (!contact) {
      mount.innerHTML = '<div class="empty">Contact not found in local data.</div>';
      return;
    }
    // Render the same contact detail body into this mount using existing renderer
    try {
      if (window.ContactDetail && typeof window.ContactDetail.renderInline === 'function') {
        window.ContactDetail.renderInline(contact, mount);
      } else {
        // Fallback: richer inline summary mirroring contact detail info grid
        const email = contact.email || '';
        const phoneData = getPrimaryPhoneData(contact);
        const { value: primaryPhone, type: phoneType } = phoneData;
        const city = contact.city || contact.locationCity || '';
        const stateVal = contact.state || contact.locationState || '';
        const industry = contact.industry || contact.companyIndustry || '';
        const company = contact.companyName || '';
        mount.innerHTML = `
          <div class="contact-inline">
            <h3 class="section-title">Contact information</h3>
            <div class="info-grid">
              <div class="info-row"><div class="info-label">EMAIL</div><div class="info-value">${email||'--'}</div></div>
              <div class="info-row"><div class="info-label">${phoneType.toUpperCase()}</div><div class="info-value">${primaryPhone ? `<span class="phone-text" data-phone="${escapeHtml(primaryPhone)}" data-contact-name="${escapeHtml(contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' '))}" data-contact-id="${escapeHtml(contact.id || '')}" data-account-id="${escapeHtml(contact.accountId || contact.account_id || '')}" data-account-name="${escapeHtml(company)}" data-company-name="${escapeHtml(company)}" data-logo-url="${escapeHtml(contact.logoUrl || '')}" data-city="${escapeHtml(city)}" data-state="${escapeHtml(stateVal)}" data-domain="${escapeHtml(contact.domain || '')}" data-phone-type="${phoneType}">${escapeHtml(primaryPhone)}</span>` : '--'}</div></div>
              <div class="info-row"><div class="info-label">COMPANY</div><div class="info-value">${company||'--'}</div></div>
              <div class="info-row"><div class="info-label">CITY</div><div class="info-value">${city||'--'}</div></div>
              <div class="info-row"><div class="info-label">STATE</div><div class="info-value">${stateVal||'--'}</div></div>
              <div class="info-row"><div class="info-label">INDUSTRY</div><div class="info-value">${industry||'--'}</div></div>
            </div>
          </div>`;
      }
    } catch(_) {}
  }

  // Handle contact phone clicks with proper contact context (same as contact-detail.js)
  function handleContactPhoneClick(phoneElement, person) {
    try {
      console.log('[Task Detail] Contact phone clicked, setting contact context');
      
      // Get the phone type from the data attribute
      const phoneType = phoneElement.getAttribute('data-phone-type') || 'mobile';
      
      // Get the associated account to include logo and domain
      const linkedAccount = findAssociatedAccount(person);
      
      // Get domain from account if available
      const deriveDomain = (input) => {
        try {
          if (!input) return '';
          let s = String(input).trim();
          if (/^https?:\/\//i.test(s)) { const u = new URL(s); return (u.hostname || '').replace(/^www\./i, ''); }
          if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) { return s.replace(/^www\./i, ''); }
          return '';
        } catch(_) { return ''; }
      };
      const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//,'').replace(/\/$/,'').replace(/^www\./i,'') : deriveDomain(linkedAccount?.website || '');
      
      // Build contact context for contact phone calls
      const contextPayload = {
        contactId: person.id || person.contactId || person._id || '',
        contactName: person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || '',
        accountId: person.accountId || person.account_id || linkedAccount?.id || '',
        accountName: person.companyName || person.company || person.account || '',
        company: person.companyName || person.company || person.account || '',
        name: person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || '', // Contact name as primary
        city: person.city || person.locationCity || '',
        state: person.state || person.locationState || '',
        domain: domain || person.domain || '',
        logoUrl: linkedAccount?.logoUrl || person.logoUrl || '',
        isCompanyPhone: false, // This is a contact phone call
        phoneType: phoneType, // Include the phone type (mobile, work direct, other)
        suggestedContactId: person.id || person.contactId || person._id || '',
        suggestedContactName: person.name || [person.firstName, person.lastName].filter(Boolean).join(' ') || ''
      };
      
      console.log('[Task Detail] Setting contact phone context:', contextPayload);
      
      // Set the context in the phone widget
      if (window.Widgets && typeof window.Widgets.setCallContext === 'function') {
        window.Widgets.setCallContext(contextPayload);
        
        // Also trigger contact display to show the contact info
        if (window.Widgets && typeof window.Widgets.setContactDisplay === 'function') {
          try {
            window.Widgets.setContactDisplay(contextPayload, '');
          } catch(_) {}
        }
      }
      
      // Mark that we've set a specific context to prevent generic click-to-call from overriding
      try {
        window._pcPhoneContextSetByPage = true;
        setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 1000);
      } catch(_) {}
      
    } catch (error) {
      console.error('[Task Detail] Error setting contact phone context:', error);
    }
  }

  // Process click-to-call and click-to-email elements
  function processClickToCallAndEmail() {
    // Process phone numbers
    if (window.ClickToCall && typeof window.ClickToCall.processSpecificPhoneElements === 'function') {
      window.ClickToCall.processSpecificPhoneElements();
    }
    
    // Process email addresses
    if (window.ClickToEmail && typeof window.ClickToEmail.processSpecificEmailElements === 'function') {
      window.ClickToEmail.processSpecificEmailElements();
    }
  }

  // Load recent activity for the task contact
  async function loadRecentActivityForTask() {
    const timelineEl = document.getElementById('task-activity-timeline');
    if (!timelineEl) return;
    
    const contactName = state.currentTask?.contact || '';
    if (!contactName) {
      timelineEl.innerHTML = `
        <div class="activity-placeholder">
          <div class="placeholder-text">No contact specified for this task</div>
        </div>
      `;
      return;
    }
    
    try {
      // Use ActivityManager to load real activities for the contact
      if (window.ActivityManager) {
        // Find the contact ID from the contact name
        const contactId = findContactIdByName(contactName);
        if (contactId) {
          await window.ActivityManager.renderActivities('task-activity-timeline', 'contact', contactId);
        } else {
          // Show empty state if contact not found
          timelineEl.innerHTML = `
            <div class="activity-placeholder">
              <div class="placeholder-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1v6m0 6v6"/>
                </svg>
              </div>
              <div class="placeholder-text">No recent activity</div>
            </div>
          `;
        }
      } else {
        // Show empty state if ActivityManager not available
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1v6m0 6v6"/>
              </svg>
            </div>
            <div class="placeholder-text">No recent activity</div>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error loading recent activity:', error);
      timelineEl.innerHTML = `
        <div class="activity-placeholder">
          <div class="placeholder-text">Error loading activity</div>
        </div>
      `;
    }
  }
  
  // Helper function to find contact ID by name
  function findContactIdByName(contactName) {
    if (!contactName || !window.getPeopleData) return null;
    
    try {
      const contacts = window.getPeopleData() || [];
      const contact = contacts.find(c => {
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
        return fullName === contactName || c.name === contactName || c.firstName === contactName;
      });
      return contact ? contact.id : null;
    } catch (error) {
      console.error('Error finding contact by name:', error);
      return null;
    }
  }
  
  // Get SVG icon for activity type
  function getActivityIcon(type) {
    switch (type) {
      case 'phone':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
      case 'email':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
      case 'task':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
      default:
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>`;
    }
  }

  // Render contacts list for account tasks
  function renderAccountContacts(account) {
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

      return associatedContacts.map(contact => {
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
        const title = contact.title || '';
        const email = contact.email || '';
        const phone = contact.workDirectPhone || contact.mobile || contact.otherPhone || '';
        
        // Compute initials for avatar
        const parts = fullName.trim().split(/\s+/);
        const initials = parts.length >= 2 
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : (parts[0] ? parts[0][0].toUpperCase() : '?');
        
        return `
          <div class="contact-item contact-link" data-contact-id="${escapeHtml(contact.id)}" data-contact-name="${escapeHtml(fullName)}" style="cursor: pointer;">
            <div class="contact-avatar">
              <div class="avatar-circle-small" aria-hidden="true">${initials}</div>
            </div>
            <div class="contact-info">
              <div class="contact-name">
                <span class="contact-name-text">${escapeHtml(fullName)}</span>
              </div>
              <div class="contact-details">
                ${title ? `<span class="contact-title">${escapeHtml(title)}</span>` : ''}
                ${email ? `<span class="email-text" data-email="${escapeHtml(email)}" data-contact-name="${escapeHtml(fullName)}" data-contact-id="${escapeHtml(contact.id || '')}">${escapeHtml(email)}</span>` : ''}
                ${phone ? `<span class="phone-text" data-phone="${escapeHtml(phone)}" data-contact-name="${escapeHtml(fullName)}" data-contact-id="${escapeHtml(contact.id || '')}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(account.logoUrl || '')}" data-city="${escapeHtml(account.city || account.locationCity || '')}" data-state="${escapeHtml(account.state || account.locationState || '')}" data-domain="${escapeHtml(account.domain || '')}">${escapeHtml(phone)}</span>` : ''}
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

  // Setup phone click handlers for contact phones (capture-phase to win race vs ClickToCall)
  function setupPhoneClickHandlers() {
    // Prevent duplicate event listeners
    if (state._phoneHandlersSetup) return;
    state._phoneHandlersSetup = true;

    // Helper: resolve person from current task contact name
    function resolvePerson() {
      const contactName = state.currentTask?.contact || '';
      const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
      return people.find(p => {
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
        return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
      }) || null;
    }

    // Target any contact phone span within task detail that declares a phone type
    function findContactPhoneTarget(evtTarget) {
      return evtTarget.closest('#task-detail-page .phone-text[data-phone-type]');
    }

    // Capture-phase mousedown sets the guard before ClickToCall runs
    document.addEventListener('mousedown', (e) => {
      const phoneElement = findContactPhoneTarget(e.target);
      if (!phoneElement) return;
      try { window._pcPhoneContextSetByPage = true; } catch(_) {}
      const person = resolvePerson();
      if (person && person.id) {
        // Set context early so ClickToCall sees the guard and skips its own context
        handleContactPhoneClick(phoneElement, person);
      }
    }, true);

    // Capture-phase click as a backup to ensure context is set
    document.addEventListener('click', (e) => {
      const phoneElement = findContactPhoneTarget(e.target);
      if (!phoneElement) return;
      const person = resolvePerson();
      if (person && person.id) {
        handleContactPhoneClick(phoneElement, person);
      }
    }, true);
  }

  // Setup contact link handlers
  function setupContactLinkHandlers() {
    // Prevent duplicate event listeners
    if (state._contactHandlersSetup) return;
    state._contactHandlersSetup = true;

    // Handle contact link clicks in header
    document.addEventListener('click', (e) => {
      const contactLink = e.target.closest('.contact-link');
      if (!contactLink) return;
      
      e.preventDefault();
      
      const contactId = contactLink.getAttribute('data-contact-id');
      const contactName = contactLink.getAttribute('data-contact-name');
      
      if (contactId && window.ContactDetail) {
        // Capture task detail state for back navigation
        window.__taskDetailRestoreData = {
          taskId: state.currentTask?.id,
          taskType: state.currentTask?.type,
          contact: state.currentTask?.contact,
          account: state.currentTask?.account,
          scroll: window.scrollY || 0,
          timestamp: Date.now()
        };
        
        // Set navigation source for back button
        window._contactNavigationSource = 'task-detail';
        window._contactNavigationContactId = contactId;
        
        // Navigate to contact detail
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('people');
          
          // Use retry pattern to ensure ContactDetail module is ready
          requestAnimationFrame(() => {
            let attempts = 0;
            const maxAttempts = 15; // 1.2 seconds at 80ms intervals (faster)
            
            const tryShowContact = () => {
              if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                window.ContactDetail.show(contactId);
              } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(tryShowContact, 80);
              } else {
                console.warn('ContactDetail module not ready after 1.2 seconds');
              }
            };
            
            tryShowContact();
          });
        }
      }
    });

    // Handle add contact button clicks
    document.addEventListener('click', (e) => {
      const addContactBtn = e.target.closest('#add-contact-btn');
      if (!addContactBtn) return;
      
      e.preventDefault();
      openAddContactModal();
    });
  }

  // Open add contact modal with prefilled account information
  function openAddContactModal() {
    // Use the main CRM's modal opening function to ensure proper event binding
    if (window.crm && typeof window.crm.createAddContactModal === 'function') {
      // Pre-fill the company name and industry before opening the modal
      const modal = document.getElementById('modal-add-contact');
      if (modal && state.currentTask) {
        // Get account information from the current task
        const accountName = state.currentTask.account || '';
        const accountId = state.currentTask.accountId || '';
        
        // Find the account data to get industry
        const account = findAccountByIdOrName(accountId, accountName);
        const industry = account?.industry || '';
        
        // Pre-fill company name
        const companyInput = modal.querySelector('input[name="companyName"]');
        if (companyInput && accountName) {
          companyInput.value = accountName;
        }
        
        // Pre-fill industry
        const industryInput = modal.querySelector('input[name="industry"]');
        if (industryInput && industry) {
          industryInput.value = industry;
        }
        
        // Set navigation context so after creating the contact we return here
        try {
          window._contactNavigationSource = 'task-detail';
          window._taskNavigationSource = 'task-detail';
          window.__taskDetailRestoreData = {
            taskId: state.currentTask?.id,
            taskType: state.currentTask?.type,
            contact: state.currentTask?.contact,
            account: state.currentTask?.account,
            scroll: window.scrollY || 0,
            timestamp: Date.now()
          };
        } catch (_) {}
      }
      
      // Open the modal using the proper function
      window.crm.createAddContactModal();
    } else {
      console.error('CRM createAddContactModal function not available');
    }
  }

  // Setup contact creation listener to refresh contacts list
  function setupContactCreationListener() {
    // Prevent duplicate event listeners
    if (state._contactCreationListenerSetup) return;
    state._contactCreationListenerSetup = true;

    document.addEventListener('pc:contact-created', (e) => {
      if (state.currentTask && isAccountTask(state.currentTask)) {
        // Refresh the contacts list for account tasks
        const contactsList = document.getElementById('account-contacts-list');
        if (contactsList) {
          // Get the account data
          const accountName = state.currentTask.account || '';
          const accountId = state.currentTask.accountId || '';
          const account = findAccountByIdOrName(accountId, accountName);
          
          if (account) {
            contactsList.innerHTML = renderAccountContacts(account);
          }
        }
      }
    });

    // Listen for contact updates (e.g., when preferred phone field changes on contact-detail page)
    document.addEventListener('pc:contact-updated', (e) => {
      if (state.currentTask && !isAccountTask(state.currentTask)) {
        // Re-render the task page to reflect updated contact information
        console.log('[Task Detail] Contact updated, refreshing task detail page');
        renderTaskPage();
        
        // Re-process click-to-call to ensure context is updated
        setTimeout(() => {
          processClickToCallAndEmail();
        }, 100);
      }
    });
  }

  // Public API
  window.TaskDetail = {
    open: async function(taskId, navigationSource = 'tasks') {
      try {
        // CRITICAL: Capture navigation source BEFORE calling navigateToPage
        // Standardize navigation source detection to match account detail pattern
        const crmPage = (window.crm && window.crm.currentPage) ? String(window.crm.currentPage) : '';
        const active = document.querySelector('.page.active');
        const domPage = active ? (active.getAttribute('data-page') || active.id || '').replace('-page','') : '';
        let src = navigationSource || crmPage || domPage || 'tasks';
        
        // Normalize aliases
        const alias = {
          'account-detail': 'account-details',
          'account-details': 'account-details',
          'contact-detail': 'people',
          'contact-details': 'people'
        };
        if (alias[src]) src = alias[src];
        
        // Use single, reliable navigation source pattern like account detail
        window._taskNavigationSource = src;

        // Capture comprehensive per-page restore data
        if (src === 'accounts' && window.accountsModule && typeof window.accountsModule.getCurrentState==='function') {
          // Add small delay to ensure DOM elements are ready
          setTimeout(() => {
            window.__accountsRestoreData = window.accountsModule.getCurrentState();
          }, 50);
        } else if (src === 'people' && window.peopleModule && typeof window.peopleModule.getCurrentState==='function') {
          window.__peopleRestoreData = window.peopleModule.getCurrentState();
        } else if (src === 'tasks') {
          // Enhanced restore data for Tasks page
          window.__tasksRestoreData = { 
            scroll: window.scrollY || 0,
            timestamp: Date.now()
          };
          window.__tasksScrollY = window.scrollY || 0;
        } else if (src === 'dashboard') {
          // Dashboard state should already be captured in main.js
          // Just ensure we have a fallback
          if (!window._dashboardReturn) {
            window._dashboardReturn = {
              page: 'dashboard',
              scroll: window.scrollY || 0,
              timestamp: Date.now()
            };
          }
        }
        
      } catch (_) { /* noop */ }
      
      // Navigate to task detail page AFTER capturing navigation source
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('task-detail');
      }
      
      // Load task data
      await loadTaskData(taskId);
    },
    
    init: function() {
      if (!initDomRefs()) return;
      attachEvents();
      setupContactLinkHandlers();
      setupPhoneClickHandlers();
      setupContactCreationListener();
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.TaskDetail.init);
  } else {
    window.TaskDetail.init();
  }

  // Process click-to-call and click-to-email when task detail page loads
  document.addEventListener('pc:page-loaded', function(e) {
    if (e.detail && e.detail.page === 'task-detail') {
      setTimeout(() => {
        processClickToCallAndEmail();
      }, 100);
    }
  });
})();
