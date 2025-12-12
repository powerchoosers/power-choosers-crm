'use strict';

// Task Detail Page - Individual task pages with widgets and navigation
(function () {
  const state = {
    currentTask: null,
    taskType: null,
    contact: null,
    account: null,
    navigating: false,
    loadingTask: false, // CRITICAL FIX: Guard against concurrent loadTaskData calls
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
    switch (p) {
      case 'low': return '#495057';
      case 'medium': return 'rgba(255, 193, 7, 0.15)';
      case 'high': return 'rgba(220, 53, 69, 0.15)';
      default: return '#495057';
    }
  }

  function getPriorityColor(priority) {
    const p = (priority || '').toLowerCase().trim();
    switch (p) {
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

  // ==== Date helpers for Energy & Contract fields ====
  function parseDateFlexible(s) {
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const parts = str.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
    if (mdy) {
      const d = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function toISODate(v) {
    const d = parseDateFlexible(v);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function toMDY(v) {
    const d = parseDateFlexible(v);
    if (!d) return v ? String(v) : '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function formatDateInputAsMDY(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '').slice(0, 8);
    let out = '';
    if (digits.length >= 1) out = digits.slice(0, 2);
    if (digits.length >= 3) out = digits.slice(0, 2) + '/' + digits.slice(2, 4);
    if (digits.length >= 5) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
    return out;
  }

  // ==== Phone normalization ====
  function normalizePhone(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return '';
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (/^\+/.test(raw)) return raw;
    return raw;
  }

  // ==== SVG icon helpers ====
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
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/>
      <path d="M14 11v6"/>
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
    </svg>`;
  }

  function saveIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>`;
  }

  // ==== Batch update system for individual field edits ====
  let updateBatch = {};
  let updateTimeout = null;

  async function processBatchUpdate() {
    if (Object.keys(updateBatch).length === 0) return;
    const accountId = state.account?.id;
    if (!accountId) return;

    try {
      const db = window.firebaseDB;
      if (db && typeof db.collection === 'function') {
        await db.collection('accounts').doc(accountId).update({
          ...updateBatch,
          updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
        });

        if (state.account) {
          Object.assign(state.account, updateBatch);
        }

        // Update caches
        if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
          await window.CacheManager.updateRecord('accounts', accountId, state.account);
        }

        // Dispatch events for other pages
        try {
          const ev = new CustomEvent('pc:account-updated', {
            detail: { id: accountId, changes: { ...updateBatch }, updatedAt: new Date() }
          });
          document.dispatchEvent(ev);
        } catch (_) { }

        // Dispatch energy update events
        Object.keys(updateBatch).forEach(field => {
          if (['electricitySupplier', 'annualUsage', 'currentRate', 'contractEndDate'].includes(field)) {
            try {
              document.dispatchEvent(new CustomEvent('pc:energy-updated', {
                detail: { entity: 'account', id: accountId, field, value: updateBatch[field] }
              }));
            } catch (_) { }
          }
        });

        updateBatch = {};
        if (window.crm?.showToast) window.crm.showToast('Saved');
      }
    } catch (error) {
      console.error('[TaskDetail] Failed to save account field:', error);
      window.crm?.showToast && window.crm.showToast('Failed to save');
    }
  }

  function getApiBaseUrl() {
    try {
      if (window.crm && typeof window.crm.getApiBaseUrl === 'function') {
        const resolved = window.crm.getApiBaseUrl();
        if (resolved) return resolved;
      }
    } catch (_) { /* noop */ }

    try {
      const fromWindow = (window.PUBLIC_BASE_URL || window.API_BASE_URL || '').toString().trim();
      if (fromWindow) return fromWindow.replace(/\/$/, '');
    } catch (_) { /* noop */ }

    try {
      if (typeof PUBLIC_BASE_URL !== 'undefined' && PUBLIC_BASE_URL) {
        return String(PUBLIC_BASE_URL).replace(/\/$/, '');
      }
    } catch (_) { /* noop */ }

    try {
      if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) {
        return String(API_BASE_URL).replace(/\/$/, '');
      }
    } catch (_) { /* noop */ }

    try {
      if (window.location && window.location.origin) {
        return window.location.origin.replace(/\/$/, '');
      }
    } catch (_) { /* noop */ }

    return '';
  }

  // Helper functions for ownership filtering and localStorage key management
  function getUserTasksKey() {
    try {
      const email = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
        ? window.DataManager.getCurrentUserEmail()
        : (window.currentUserEmail || '').toLowerCase();
      return email ? `userTasks:${email}` : 'userTasks';
    } catch (_) {
      return 'userTasks';
    }
  }

  function getUserEmail() {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
        return window.DataManager.getCurrentUserEmail();
      }
      return (window.currentUserEmail || '').toLowerCase();
    } catch (_) {
      return (window.currentUserEmail || '').toLowerCase();
    }
  }

  function isAdmin() {
    try {
      if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
        return window.DataManager.isCurrentUserAdmin();
      }
      return window.currentUserRole === 'admin';
    } catch (_) {
      return window.currentUserRole === 'admin';
    }
  }

  function filterTasksByOwnership(tasks) {
    if (!tasks || !Array.isArray(tasks)) return [];
    if (isAdmin()) return tasks;

    const email = getUserEmail();
    if (!email) return [];

    return tasks.filter(t => {
      if (!t) return false;
      const ownerId = (t.ownerId || '').toLowerCase();
      const assignedTo = (t.assignedTo || '').toLowerCase();
      const createdBy = (t.createdBy || '').toLowerCase();
      return ownerId === email || assignedTo === email || createdBy === email;
    });
  }

  // Helper function to get LinkedIn tasks from sequences (matches tasks.js and main.js logic)
  async function getLinkedInTasksFromSequences() {
    const linkedInTasks = [];
    const userEmail = getUserEmail();

    try {
      if (!window.firebaseDB) {
        return linkedInTasks;
      }

      // Query tasks collection for sequence tasks
      const tasksQuery = window.firebaseDB.collection('tasks')
        .where('sequenceId', '!=', null)
        .get();

      const tasksSnapshot = await tasksQuery;

      if (tasksSnapshot.empty) {
        return linkedInTasks;
      }

      tasksSnapshot.forEach(doc => {
        const taskData = doc.data();

        // Only include LinkedIn task types
        const taskType = String(taskData.type || '').toLowerCase();
        if (!taskType.includes('linkedin') && !taskType.includes('li-')) {
          return;
        }

        // Filter by ownership (non-admin users)
        if (!isAdmin()) {
          const ownerId = (taskData.ownerId || '').toLowerCase();
          const assignedTo = (taskData.assignedTo || '').toLowerCase();
          const createdBy = (taskData.createdBy || '').toLowerCase();
          if (ownerId !== userEmail && assignedTo !== userEmail && createdBy !== userEmail) {
            return;
          }
        }

        // Only include pending tasks
        if (taskData.status === 'completed') {
          return;
        }

        // Convert Firestore data to task format
        const task = {
          id: taskData.id || doc.id,
          title: taskData.title || '',
          contact: taskData.contact || '',
          account: taskData.account || '',
          type: taskData.type || 'linkedin',
          priority: taskData.priority || 'sequence',
          dueDate: taskData.dueDate || '',
          dueTime: taskData.dueTime || '',
          status: taskData.status || 'pending',
          sequenceId: taskData.sequenceId || '',
          contactId: taskData.contactId || '',
          accountId: taskData.accountId || '',
          stepId: taskData.stepId || '',
          stepIndex: taskData.stepIndex !== undefined ? taskData.stepIndex : -1,
          isLinkedInTask: true,
          isSequenceTask: taskData.isSequenceTask || true,
          ownerId: taskData.ownerId || '',
          assignedTo: taskData.assignedTo || '',
          createdBy: taskData.createdBy || '',
          createdAt: taskData.createdAt || (taskData.timestamp && taskData.timestamp.toDate ? taskData.timestamp.toDate().getTime() : taskData.timestamp) || Date.now(),
          timestamp: taskData.timestamp && taskData.timestamp.toDate ? taskData.timestamp.toDate().getTime() : (taskData.timestamp || Date.now())
        };

        linkedInTasks.push(task);
      });

      console.log('[TaskDetail] Loaded', linkedInTasks.length, 'LinkedIn sequence tasks for navigation');
    } catch (error) {
      console.error('[TaskDetail] Error loading LinkedIn sequence tasks:', error);
    }

    return linkedInTasks;
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
    } catch (_) { }

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
  // CRITICAL FIX: Now checks state.account first, then multiple data sources
  function findAssociatedAccount(contact) {
    try {
      if (!contact) return null;
      
      // Check state.account first (already loaded by loadContactAccountData)
      if (state.account) {
        const accountId = contact.accountId || contact.account_id || '';
        if (accountId && state.account.id === accountId) return state.account;
        
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const contactCompany = norm(contact.companyName || contact.accountName || '');
        const stateAccountName = norm(state.account.accountName || state.account.name || state.account.companyName || '');
        if (contactCompany && stateAccountName && contactCompany === stateAccountName) return state.account;
      }
      
      // Get accounts from multiple sources
      let accounts = [];
      if (typeof window.getAccountsData === 'function') {
        accounts = window.getAccountsData() || [];
      }
      if (accounts.length === 0 && window.BackgroundAccountsLoader) {
        accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
      }
      
      if (accounts.length === 0) return null;
      
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
  // CRITICAL FIX: Now checks state.account first, then multiple data sources
  function findAccountByIdOrName(accountId, accountName) {
    try {
      // Check state.account first (already loaded by loadContactAccountData)
      if (state.account) {
        if (accountId && state.account.id === accountId) return state.account;
        
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const stateAccountName = norm(state.account.accountName || state.account.name || state.account.companyName || '');
        const searchName = norm(accountName || '');
        if (searchName && stateAccountName && searchName === stateAccountName) return state.account;
      }
      
      // Get accounts from multiple sources
      let accounts = [];
      if (typeof window.getAccountsData === 'function') {
        accounts = window.getAccountsData() || [];
      }
      if (accounts.length === 0 && window.BackgroundAccountsLoader) {
        accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
      }
      
      if (accounts.length === 0) return null;

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

  function injectTaskDetailStyles() {
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
      
      /* Widget Separator */
      #task-detail-page .widgets-separator {
        width: 1px;
        height: 24px;
        background: var(--border-light);
        margin: 0 8px;
      }
      
      /* Widgets Wrap */
      #task-detail-page .widgets-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      
      /* Widget Button - Square */
      #task-detail-page #task-open-widgets {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px !important;
        height: 36px !important;
        padding: 0 !important;
        min-width: 36px;
        min-height: 36px;
      }
      
      #task-detail-page #task-open-widgets svg {
        width: 18px;
        height: 18px;
        display: block;
        pointer-events: none;
      }
      
      /* Widget Button Hover */
      #task-detail-page #task-open-widgets:hover {
        background: var(--bg-secondary);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      
      /* Widgets Drawer */
      #task-detail-page .widgets-drawer {
        position: absolute;
        top: 50%;
        right: calc(100% + 8px);
        /* appear to the left of the button */
        /* Start slightly to the right and fade in so it slides left into place */
        transform: translate(10px, -50%);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius);
        box-shadow: var(--elevation-card);
        padding: 8px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        z-index: 20;
        transition: transform 160ms ease, opacity 160ms ease, visibility 0s linear 160ms;
        /* delay visibility off so it doesn't flicker */
        --arrow-size: 8px;
        /* square size before rotation */
      }
      
      /* Pointed triangle pointing right */
      #task-detail-page .widgets-drawer::before,
      #task-detail-page .widgets-drawer::after {
        content: "";
        position: absolute;
        width: var(--arrow-size);
        height: var(--arrow-size);
        transform: rotate(45deg);
        pointer-events: none;
        right: calc(-1 * var(--arrow-size) / 2 + 1px);
        top: 50%;
        transform: translateY(-50%) rotate(45deg);
      }
      
      /* Border layer */
      #task-detail-page .widgets-drawer::before {
        background: var(--border-light);
      }
      
      /* Fill layer */
      #task-detail-page .widgets-drawer::after {
        background: var(--bg-card);
        right: calc(-1 * var(--arrow-size) / 2 + 2px);
      }
      
      /* Drawer Open State */
      #task-detail-page .widgets-wrap.open .widgets-drawer {
        transform: translate(0, -50%);
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition: transform 180ms ease, opacity 180ms ease;
      }
      
      /* Widget icon buttons inside drawer */
      #task-detail-page .widgets-drawer .widget-item {
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
      
      #task-detail-page .widgets-drawer .widget-item:hover {
        background: var(--bg-secondary);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      
      #task-detail-page .widgets-drawer .widget-item:focus-visible {
        outline: 2px solid var(--orange-muted);
        outline-offset: 2px;
      }
      
      #task-detail-page .widgets-drawer .widget-item svg {
        width: 18px;
        height: 18px;
        display: block;
        pointer-events: none;
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

      /* Reschedule button: square, same height as action button, pagination styling */
      #task-detail-page #task-reschedule-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border-radius: 8px;
        background: var(--bg-hover);
        border: 1px solid transparent;
        color: var(--text-primary);
        transition: var(--transition-fast);
      }
      #task-detail-page #task-reschedule-btn:hover {
        background: var(--bg-item);
        border-color: var(--border-light);
        color: var(--text-inverse);
      }
      #task-detail-page #task-reschedule-btn svg {
        width: 18px;
        height: 18px;
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
      enhanceRescheduleButton(els.rescheduleBtn);
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

    // Widget button hover functionality
    const widgetsBtn = document.getElementById('task-open-widgets');
    const widgetsWrap = document.querySelector('#task-detail-page .widgets-wrap');
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

    // Widget drawer item clicks
    const widgetsDrawer = document.getElementById('task-widgets-drawer') || document.querySelector('#task-detail-page .widgets-drawer');
    if (widgetsDrawer && !widgetsDrawer._bound) {
      widgetsDrawer.addEventListener('click', (e) => {
        const item = e.target.closest?.('.widget-item');
        if (!item) return;
        const which = item.getAttribute('data-widget');
        handleWidgetAction(which);
      });
      widgetsDrawer._bound = '1';
    }
  }

  function handleWidgetAction(which) {
    // Get contact and account IDs from task state
    const task = state.currentTask;
    if (!task) {
      try { window.crm?.showToast && window.crm.showToast('No task data available'); } catch (_) { }
      return;
    }

    // Get contact ID from task or state
    const contactId = task.contactId || state.contact?.id || state.contact?._id;
    
    // Get account ID - prioritize state.account, then contact's linked account
    let accountId = state.account?.id || state.account?.accountId || state.account?._id;
    if (!accountId && state.contact) {
      accountId = state.contact.accountId || state.contact.account_id;
    }
    // Fallback: try to get from ContactDetail state (like health.js does)
    if (!accountId && window.ContactDetail && window.ContactDetail.state) {
      accountId = window.ContactDetail.state._linkedAccountId;
    }

    switch (which) {
      case 'lusha': {
        // Use Lusha/Apollo widget - use account if available, otherwise contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isLushaOpen === 'function' && api.isLushaOpen()) {
              if (typeof api.closeLusha === 'function') { api.closeLusha(); return; }
            } else if (accountId && typeof api.openLushaForAccount === 'function') {
              api.openLushaForAccount(accountId); return;
            } else if (contactId && typeof api.openLusha === 'function') {
              api.openLusha(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Prospect for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Prospect'); } catch (_) { }
        break;
      }
      case 'maps': {
        // Google Maps - use account if available, otherwise contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isMapsOpen === 'function' && api.isMapsOpen()) {
              if (typeof api.closeMaps === 'function') { api.closeMaps(); return; }
            } else if (accountId && typeof api.openMapsForAccount === 'function') {
              api.openMapsForAccount(accountId); return;
            } else if (contactId && typeof api.openMaps === 'function') {
              api.openMaps(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Google Maps for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Google Maps'); } catch (_) { }
        break;
      }
      case 'health': {
        // Energy Health Check - use contact's linked account (like health.js does)
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isHealthOpen === 'function' && api.isHealthOpen()) {
              if (typeof api.closeHealth === 'function') { api.closeHealth(); return; }
            } else if (accountId && typeof api.openHealthForAccount === 'function') {
              api.openHealthForAccount(accountId); return;
            } else if (contactId && typeof api.openHealth === 'function') {
              // Health widget uses contact's linked account internally
              api.openHealth(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Energy Health Check for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Energy Health Check'); } catch (_) { }
        break;
      }
      case 'deal': {
        // Deal Calculator - saved to account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isDealOpen === 'function' && api.isDealOpen()) {
              if (typeof api.closeDeal === 'function') { api.closeDeal(); return; }
            } else if (accountId && typeof api.openDealForAccount === 'function') {
              api.openDealForAccount(accountId); return;
            } else if (contactId && typeof api.openDeal === 'function') {
              // Deal calculator should use account, but fallback to contact if no account
              api.openDeal(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Deal Calculator for', accountId ? 'account' : 'contact', accountId || contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Deal Calculator'); } catch (_) { }
        break;
      }
      case 'notes': {
        // Notes - use contact directly
        if (!contactId) {
          try { window.crm?.showToast && window.crm.showToast('No contact associated with this task'); } catch (_) { }
          return;
        }
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isNotesOpen === 'function' && api.isNotesOpen()) {
              if (typeof api.closeNotes === 'function') { api.closeNotes(); return; }
            } else if (typeof api.openNotes === 'function') {
              api.openNotes(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Notes for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Notes'); } catch (_) { }
        break;
      }
      default:
        console.log('Unknown widget action:', which);
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
          } catch (_) { }
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
          } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'accounts') {
        const restore = window._accountsReturn || window.__accountsRestoreData || (window.accountsModule && typeof window.accountsModule.getCurrentState === 'function' ? window.accountsModule.getCurrentState() : null);
        nav('accounts');
        setTimeout(() => {
          try { window.accountsModule && typeof window.accountsModule.rebindDynamic === 'function' && window.accountsModule.rebindDynamic(); } catch (_) { }
          try { document.dispatchEvent(new CustomEvent('pc:accounts-restore', { detail: restore || {} })); } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'people') {
        const restore = window.__peopleRestoreData || (window.peopleModule && typeof window.peopleModule.getCurrentState === 'function' ? window.peopleModule.getCurrentState() : null);
        nav('people');
        setTimeout(() => {
          try { window.peopleModule && typeof window.peopleModule.rebindDynamic === 'function' && window.peopleModule.rebindDynamic(); } catch (_) { }
          try { document.dispatchEvent(new CustomEvent('pc:people-restore', { detail: restore || {} })); } catch (_) { }
        }, 80);
        return;
      }
      if (src === 'tasks') {
        const restore = window.__tasksRestoreData || { scroll: window.__tasksScrollY || 0 };
        nav('tasks');
        setTimeout(() => {
          try { document.dispatchEvent(new CustomEvent('pc:tasks-restore', { detail: restore || {} })); } catch (_) { }
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
          } catch (_) { }
        }, 80);
        return;
      }
      if (src) { nav(src); return; }
      // Fallback: go to tasks
      nav('tasks');
    } catch (e) {
      try { window.crm && window.crm.navigateToPage && window.crm.navigateToPage('tasks'); } catch (_) { }
    }
  }

  async function handleTaskComplete() {
    if (!state.currentTask) return;

    // CRITICAL: Verify ownership before deletion
    if (!isAdmin()) {
      const email = getUserEmail();
      const task = state.currentTask;
      const ownerId = (task.ownerId || '').toLowerCase();
      const assignedTo = (task.assignedTo || '').toLowerCase();
      const createdBy = (task.createdBy || '').toLowerCase();

      if (ownerId !== email && assignedTo !== email && createdBy !== email) {
        console.error('[TaskDetail] User does not have permission to complete this task');
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('You do not have permission to complete this task', 'error');
        }
        return;
      }
    }

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

    // Trigger sequence next step BEFORE deleting the current task so the API can read it
    if (state.currentTask && (state.currentTask.isSequenceTask || state.currentTask.sequenceId)) {
      try {
        console.log('[TaskDetail] Completed sequence task, creating next step...', state.currentTask.id);
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/complete-sequence-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: state.currentTask.id })
        });
        const result = await response.json();

        if (result.success) {
          console.log('[TaskDetail] Next step created:', result.nextStepType, result);

          if (result.nextStepType && (result.nextStepType.includes('linkedin') || result.nextStepType.includes('phone') || result.nextStepType.includes('task'))) {
            if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
              try {
                console.log('[TaskDetail] Forcing BackgroundTasksLoader refresh to pick up new task...');
                await window.BackgroundTasksLoader.forceReload();
                console.log('[TaskDetail] BackgroundTasksLoader refreshed successfully');
              } catch (reloadError) {
                console.warn('[TaskDetail] Failed to refresh BackgroundTasksLoader:', reloadError);
              }
            }

            if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
              try {
                await window.CacheManager.invalidate('tasks');
                console.log('[TaskDetail] Invalidated tasks cache after next step creation');
              } catch (cacheError) {
                console.warn('[TaskDetail] Failed to invalidate cache:', cacheError);
              }
            }

            window.dispatchEvent(new CustomEvent('tasksUpdated', {
              detail: {
                source: 'sequenceTaskCompletion',
                taskId: state.currentTask.id,
                deleted: true,
                newTaskCreated: true,
                nextStepType: result.nextStepType
              }
            }));

            document.dispatchEvent(new CustomEvent('pc:tasks-loaded', {
              detail: { source: 'sequenceTaskCompletion', newTaskCreated: true }
            }));
          }
        } else {
          console.warn('[TaskDetail] Failed to create next step:', result.message || result.error);
        }
      } catch (error) {
        console.error('[TaskDetail] Error creating next sequence step:', error);
      }
    }

    // Remove from localStorage completely (use namespaced key)
    try {
      const key = getUserTasksKey();
      const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
      const filteredTasks = userTasks.filter(t => t && t.id !== state.currentTask.id);
      localStorage.setItem(key, JSON.stringify(filteredTasks));

      // Also clean up legacy key (for cross-browser compatibility)
      const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
      const filteredLegacy = legacyTasks.filter(t => t && t.id !== state.currentTask.id);
      localStorage.setItem('userTasks', JSON.stringify(filteredLegacy));

      // CRITICAL FIX: Also clean up from BackgroundTasksLoader cache if available
      if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.removeTask === 'function') {
        try {
          const removed = window.BackgroundTasksLoader.removeTask(state.currentTask.id);
          if (removed) {
            console.log('[TaskDetail] Removed task from BackgroundTasksLoader cache');
          }
        } catch (e) {
          console.warn('[TaskDetail] Could not remove task from BackgroundTasksLoader:', e);
        }
      }
    } catch (e) {
      console.warn('Could not remove task from localStorage:', e);
    }

    // Delete from Firebase completely (with ownership check)
    try {
      if (window.firebaseDB && state.currentTask.id) {
        // CRITICAL FIX: Try both methods - direct document ID and query by id field
        // Tasks created from bookings may not have an id field in the document data
        let taskDoc = null;
        let taskData = null;

        // Method 1: Try direct document ID (for tasks created from bookings)
        try {
          const directDoc = await window.firebaseDB.collection('tasks').doc(state.currentTask.id).get();
          if (directDoc.exists) {
            taskDoc = directDoc;
            taskData = directDoc.data();
          }
        } catch (directError) {
          console.warn('[TaskDetail] Direct document lookup failed, trying query method:', directError);
        }

        // Method 2: If direct lookup failed, try querying by id field (for tasks with id field in data)
        if (!taskDoc) {
          const snapshot = await window.firebaseDB.collection('tasks')
            .where('id', '==', state.currentTask.id)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            taskDoc = snapshot.docs[0];
            taskData = taskDoc.data();
          }
        }

        if (taskDoc && taskData) {
          // Verify ownership before deletion
          if (!isAdmin()) {
            const email = getUserEmail();
            const ownerId = (taskData.ownerId || '').toLowerCase();
            const assignedTo = (taskData.assignedTo || '').toLowerCase();
            const createdBy = (taskData.createdBy || '').toLowerCase();

            if (ownerId !== email && assignedTo !== email && createdBy !== email) {
              console.error('[TaskDetail] User does not have permission to delete this task');
              return;
            }
          }

          // Delete using the document reference
          await taskDoc.ref.delete();
          console.log('[TaskDetail] Successfully deleted task from Firestore:', state.currentTask.id);

          // CRITICAL FIX: Invalidate cache after deletion to prevent stale data
          if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
            await window.CacheManager.invalidate('tasks');
            console.log('[TaskDetail] Invalidated tasks cache after deletion');
          }
        } else {
          console.warn('[TaskDetail] Task not found in Firestore for deletion:', state.currentTask.id);
        }
      }
    } catch (e) {
      console.error('[TaskDetail] Could not delete task from Firebase:', e);
    }

    // CRITICAL FIX: Remove from BackgroundTasksLoader cache FIRST before refreshing widget
    // This prevents the widget from loading stale data from BackgroundTasksLoader
    if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.removeTask === 'function') {
      try {
        window.BackgroundTasksLoader.removeTask(state.currentTask.id);
        console.log('[TaskDetail] Removed task from BackgroundTasksLoader cache');
    } catch (e) {
        console.warn('[TaskDetail] Could not remove task from BackgroundTasksLoader:', e);
      }
    }

    // CRITICAL FIX: Invalidate cache BEFORE refreshing widget to prevent stale data
    try {
      if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        await window.CacheManager.invalidate('tasks');
        console.log('[TaskDetail] Invalidated tasks cache after completion');
      }
    } catch (cacheError) {
      console.warn('[TaskDetail] Failed to invalidate cache:', cacheError);
    }

    // CRITICAL FIX: Small delay to ensure Firebase deletion and cache invalidation complete
    // This prevents race condition where loadTodaysTasks() queries Firebase before deletion completes
    await new Promise(resolve => setTimeout(resolve, 200));

    // Show success message
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Task completed successfully');
    }

    // CRITICAL FIX: Refresh Today's Tasks widget AFTER cache is cleared and Firebase deletion completes
    try {
      if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
        // Force reload BackgroundTasksLoader to ensure fresh data
        if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
          try {
            await window.BackgroundTasksLoader.forceReload();
            console.log('[TaskDetail] Forced BackgroundTasksLoader reload before refreshing widget');
          } catch (reloadError) {
            console.warn('[TaskDetail] Failed to force reload BackgroundTasksLoader:', reloadError);
          }
        }
        window.crm.loadTodaysTasks();
      }
    } catch (e) {
      console.warn('Could not refresh Today\'s Tasks widget:', e);
    }

    // Trigger tasks updated event for other components (with taskId for cleanup)
    window.dispatchEvent(new CustomEvent('tasksUpdated', {
      detail: { source: 'taskCompletion', taskId: state.currentTask.id, deleted: true }
    }));

    // CRITICAL FIX: Also dispatch to document for cross-browser sync
    document.dispatchEvent(new CustomEvent('pc:task-deleted', {
      detail: { taskId: state.currentTask.id, source: 'task-detail' }
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
    try {
      if (!els.rescheduleBtn) return;
      injectRescheduleStyles();
      openReschedulePopover(els.rescheduleBtn);
    } catch (err) {
      console.warn('[TaskDetail] Reschedule failed to open', err);
    }
  }

  let _reschedulePopover = null;
  let _reschedulePopoverCleanup = null;

  function enhanceRescheduleButton(btn) {
    if (!btn || btn.dataset.rescheduleReady) return;
    btn.dataset.rescheduleReady = 'true';
    btn.setAttribute('aria-label', 'Reschedule task');
    btn.setAttribute('title', 'Reschedule');
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
        <line x1="9" y1="14" x2="11" y2="14"></line>
        <line x1="13" y1="18" x2="15" y2="18"></line>
      </svg>
    `;
  }

  function injectRescheduleStyles() {
    const id = 'task-detail-reschedule-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .reschedule-popover {
        position: absolute;
        z-index: 1300;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        box-shadow: var(--elevation-card);
        min-width: 320px;
        max-width: 380px;
        overflow: visible;
        opacity: 0;
        transform: translateY(-6px);
        --arrow-size: 10px;
      }
      .reschedule-popover.--show {
        animation: reschedulePopoverIn 200ms ease forwards;
      }
      .reschedule-popover.--hide {
        animation: reschedulePopoverOut 300ms ease forwards;
      }
      @keyframes reschedulePopoverIn {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes reschedulePopoverOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-6px); }
      }
      .reschedule-popover::before,
      .reschedule-popover::after {
        content: "";
        position: absolute;
        width: var(--arrow-size);
        height: var(--arrow-size);
        transform: rotate(45deg);
        pointer-events: none;
      }
      .reschedule-popover[data-placement="bottom"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        top: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      .reschedule-popover[data-placement="bottom"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2 + 1px));
        top: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
      .reschedule-popover .tp-inner { padding: 12px 12px 10px 12px; }
      .reschedule-popover .tp-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px; }
      .reschedule-popover .tp-title { font-weight: 600; color: var(--text-primary); }
      .reschedule-popover .tp-body { max-height: 480px; overflow: auto; }
      .reschedule-popover .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      .reschedule-popover label { display:flex; flex-direction:column; gap:6px; font-size:12px; color: var(--text-secondary); position: relative; }
      .reschedule-popover input.input-dark, .reschedule-popover textarea.input-dark {
        width: 100%; padding: 10px 12px; background: var(--bg-item); color: var(--text-primary);
        border: 2px solid var(--border-light); border-radius: 8px; font-size: 0.9rem;
      }
      .reschedule-popover .form-actions { display:flex; justify-content:flex-end; gap:8px; }
      .reschedule-popover .btn-primary { height:32px; padding:0 12px; border-radius: var(--border-radius-sm); background: var(--orange-primary); color: var(--text-inverse); border:1px solid var(--orange-primary); font-weight:600; }
      .reschedule-popover .btn-primary:hover { background: var(--orange-dark, #e67e00); border-color: var(--orange-dark, #e67e00); filter: brightness(0.95); }
      .reschedule-popover .btn-text { height:32px; padding:0 12px; border-radius: var(--border-radius-sm); background: transparent; color: var(--text-secondary); border:1px solid transparent; }
      .reschedule-popover .btn-text:hover { background: var(--grey-700); color: var(--text-inverse); }
      .reschedule-popover .close-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0; background: var(--bg-item); color: var(--grey-300); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); line-height: 1; font-size: 16px; font-weight: 600; cursor: pointer; transition: var(--transition-fast); box-sizing: border-box; }
      .reschedule-popover .close-btn:hover { background: var(--grey-600); color: var(--text-inverse); }
      .reschedule-popover .calendar-toolbar { display: none; margin-top: 8px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius); box-shadow: var(--elevation-card); padding: 8px; }
      .reschedule-popover .calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .reschedule-popover .calendar-month-year { font-weight: 600; }
      .reschedule-popover .calendar-nav-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; transition: var(--transition-fast); }
      .reschedule-popover .calendar-nav-btn:hover { background: var(--bg-secondary); border-color: var(--accent-color); box-shadow: 0 2px 8px rgba(0,0,0,.1); }
      .reschedule-popover .calendar-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
      .reschedule-popover .calendar-weekday { text-align: center; font-size: 11px; color: var(--text-secondary); font-weight: 600; }
      .reschedule-popover .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .reschedule-popover .calendar-grid button { padding: 6px 0; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); cursor: pointer; }
      .reschedule-popover .calendar-grid button:hover { background: var(--bg-secondary); }
      .reschedule-popover .calendar-grid > div:empty { background: transparent; border: none; }
      .reschedule-popover .calendar-grid button.today { border-color: var(--orange-primary); }
      .reschedule-popover .calendar-grid button.selected { background: var(--orange-primary); color: #fff; border-color: var(--orange-primary); }
      .reschedule-popover .calendar-slide-in { animation: rescheduleCalIn 200ms ease forwards; }
      .reschedule-popover .calendar-slide-out { animation: rescheduleCalOut 300ms ease forwards; }
      @keyframes rescheduleCalIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes rescheduleCalOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-8px); } }
    `;
    document.head.appendChild(style);
  }

  function openReschedulePopover(anchorEl) {
    closeReschedulePopover();
    const task = state.currentTask || {};

    const pop = document.createElement('div');
    pop.className = 'reschedule-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Reschedule task');

    const initialDate = parseDateStrictSafe(task.dueDate) || new Date();
    const initialTime = task.dueTime || '';

    pop.innerHTML = `
      <div class="arrow" aria-hidden="true"></div>
      <div class="tp-inner">
        <div class="tp-header">
          <div class="tp-title">Reschedule</div>
          <button type="button" class="close-btn" data-close aria-label="Close">×</button>
        </div>
        <div class="tp-body">
          <form id="reschedule-form">
            <div class="form-row">
              <label>Time
                <input type="text" name="dueTime" class="input-dark" value="${escapeHtml(initialTime)}" placeholder="10:30 AM" required />
              </label>
              <label>Due date
                <input type="text" name="dueDate" class="input-dark" value="${escapeHtml(fmtDate(initialDate))}" readonly />
                <button type="button" class="calendar-toggle-btn" aria-label="Open calendar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </button>
              </label>
            </div>
            <div class="calendar-toolbar" style="display:none;">
              <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" data-nav="-1" aria-label="Previous month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15,18 9,12 15,6"></polyline>
                  </svg>
                </button>
                <div class="calendar-month-year"></div>
                <button type="button" class="calendar-nav-btn" data-nav="1" aria-label="Next month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9,18 15,12 9,6"></polyline>
                  </svg>
                </button>
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
              <div class="calendar-grid"></div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-text" data-close>Cancel</button>
              <button type="submit" class="btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(pop);
    requestAnimationFrame(() => pop.classList.add('--show'));
    positionPopover(anchorEl, pop);

    const form = pop.querySelector('#reschedule-form');
    const dueDateInput = form.querySelector('input[name="dueDate"]');
    const dueTimeInput = form.querySelector('input[name="dueTime"]');
    const toolbar = form.querySelector('.calendar-toolbar');
    const daysEl = form.querySelector('.calendar-grid');
    const monthYearEl = form.querySelector('.calendar-month-year');

    let viewDate = new Date(initialDate);
    let selectedDate = new Date(initialDate);

    const renderCalendar = () => {
      monthYearEl.textContent = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      daysEl.innerHTML = '';
      const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const pad = first.getDay();
      for (let i = 0; i < pad; i++) daysEl.insertAdjacentHTML('beforeend', `<div></div>`);
      const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
      const today = new Date();
      for (let d = 1; d <= last; d++) {
        const dt = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
        const isSel = dt.toDateString() === selectedDate.toDateString();
        const isToday = dt.toDateString() === today.toDateString();
        const classes = [];
        if (isSel) classes.push('selected');
        if (isToday && !isSel) classes.push('today');
        const dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.textContent = d;
        dayBtn.className = classes.join(' ');
        dayBtn.addEventListener('click', () => {
          selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
          dueDateInput.value = fmtDate(selectedDate);
          renderCalendar();
          closeCalendar();
        });
        daysEl.appendChild(dayBtn);
      }
    };

    const openCalendar = () => {
      if (!toolbar) return;
      renderCalendar();
      toolbar.style.display = 'block';
      toolbar.offsetHeight; // Force reflow
      toolbar.classList.add('calendar-slide-in');
    };

    const closeCalendar = () => {
      if (!toolbar) return;
      toolbar.classList.remove('calendar-slide-in');
      toolbar.classList.add('calendar-slide-out');
      const handleEnd = (ev) => {
        if (ev.target !== toolbar) return;
        toolbar.removeEventListener('animationend', handleEnd);
        toolbar.style.display = 'none';
        toolbar.classList.remove('calendar-slide-out');
      };
      toolbar.addEventListener('animationend', handleEnd);
      setTimeout(() => {
        try { toolbar.removeEventListener('animationend', handleEnd); } catch (_) { }
        toolbar.style.display = 'none';
        toolbar.classList.remove('calendar-slide-out');
      }, 350);
    };

    const toggleCalendar = () => {
      const visible = toolbar && toolbar.style.display === 'block';
      if (visible) closeCalendar();
      else openCalendar();
    };

    const close = () => {
      // Close calendar first if open
      if (toolbar && toolbar.style.display === 'block') {
        closeCalendar();
      }
      // Animate out the popover using CSS animation
      pop.classList.remove('--show');
      pop.classList.add('--hide');
      const handlePopoverEnd = (ev) => {
        if (ev.target !== pop) return;
        pop.removeEventListener('animationend', handlePopoverEnd);
        pop.classList.remove('--hide');
        closeReschedulePopover();
      };
      pop.addEventListener('animationend', handlePopoverEnd);
      setTimeout(() => {
        try { pop.removeEventListener('animationend', handlePopoverEnd); } catch (_) { }
        pop.classList.remove('--hide');
        closeReschedulePopover();
      }, 350);
    };

    const onClick = (e) => {
      if (e.target.closest('[data-close]')) {
        e.preventDefault();
        close();
        return;
      }
      if (e.target.closest('.calendar-toggle-btn')) {
        e.preventDefault();
        toggleCalendar();
        return;
      }
      const navBtn = e.target.closest('.calendar-nav-btn');
      if (navBtn) {
        const delta = Number(navBtn.dataset.nav || 0);
        viewDate.setMonth(viewDate.getMonth() + delta);
        renderCalendar();
        return;
      }
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    const onOutsideClick = (e) => {
      if (!pop.contains(e.target) && e.target !== anchorEl) {
        close();
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dueDate = dueDateInput.value.trim();
      const dueTime = normalizeTimeInput(dueTimeInput.value.trim());
      if (!dueDate || !dueTime) return;
      dueTimeInput.value = dueTime;
      await saveReschedule({ dueDate, dueTime });
      close();
      await navigateToAdjacentTask('next');
    });

    pop.addEventListener('click', onClick);
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKey);

    _reschedulePopover = pop;
    _reschedulePopoverCleanup = () => {
      document.removeEventListener('click', onOutsideClick, true);
      document.removeEventListener('keydown', onKey);
      if (pop && pop.parentElement) pop.parentElement.removeChild(pop);
      _reschedulePopover = null;
      _reschedulePopoverCleanup = null;
    };
  }

  function closeReschedulePopover() {
    if (_reschedulePopoverCleanup) _reschedulePopoverCleanup();
  }

  function normalizeTimeInput(raw) {
    if (!raw) return '';
    let v = raw.toUpperCase().replace(/[^\dAPM:\s]/g, '').trim();
    v = v.replace(/\s+/g, ' ');
    const match = v.match(/(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)?/);
    if (!match) return raw;
    let h = parseInt(match[1], 10);
    let m = match[2] ? match[2] : '00';
    let ap = match[3] || '';
    if (m.length === 1) m = `0${m}`;
    if (h === 0) h = 12;
    if (h > 12 && !ap) { ap = 'PM'; h = h - 12; }
    if (!ap) ap = 'AM';
    return `${h}:${m} ${ap}`.replace(/\s+/g, ' ').trim();
  }

  async function saveReschedule({ dueDate, dueTime }) {
    const task = state.currentTask;
    if (!task || !task.id) return;

    const payload = {
      dueDate,
      dueTime,
      status: task.status || 'pending',
      updatedAt: Date.now(),
      timestamp: Date.now()
    };

    try {
      if (window.firebaseDB) {
        await window.firebaseDB.collection('tasks').doc(task.id).update(payload);
      }
    } catch (err) {
      console.warn('[TaskDetail] Failed to reschedule task in Firestore', err);
    }

    try { Object.assign(task, payload); } catch (_) { }

    const updateLocalCache = (key) => {
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = arr.map(t => {
          if (t && t.id === task.id) return { ...t, ...payload };
          return t;
        });
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (_) { }
    };

    // CRITICAL FIX: Remove task from BackgroundTasksLoader cache FIRST to ensure it's removed from old position
    // This prevents the task from appearing in both old and new positions
    if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.removeTask === 'function') {
      try {
        window.BackgroundTasksLoader.removeTask(task.id);
        console.log('[TaskDetail] Removed rescheduled task from BackgroundTasksLoader cache');
      } catch (e) {
        console.warn('[TaskDetail] Failed to remove task from BackgroundTasksLoader:', e);
      }
    }

    // Update localStorage with new dueDate/dueTime
    try {
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') return window.DataManager.getCurrentUserEmail();
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) { return (window.currentUserEmail || '').toLowerCase(); }
      };
      const email = getUserEmail();
      const namespacedKey = email ? `userTasks:${email}` : 'userTasks';
      updateLocalCache(namespacedKey);
      updateLocalCache('userTasks');
    } catch (_) { }

    // CRITICAL FIX: Invalidate cache BEFORE reloading to ensure fresh data
    if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
      try { 
        await window.CacheManager.invalidate('tasks');
        console.log('[TaskDetail] Invalidated tasks cache after reschedule');
      } catch (_) { }
    }

    // CRITICAL FIX: Force reload BackgroundTasksLoader to get updated task with new dueDate/dueTime
    // Small delay to ensure Firebase update completes
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
      try { 
        await window.BackgroundTasksLoader.forceReload();
        console.log('[TaskDetail] BackgroundTasksLoader reloaded after reschedule');
      } catch (e) { 
        console.warn('[TaskDetail] Failed to refresh BackgroundTasksLoader after reschedule', e); 
      }
    }

    // CRITICAL FIX: Refresh Today's Tasks widget AFTER reload completes
    if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
      try { 
        // Small delay to ensure BackgroundTasksLoader reload completes
        setTimeout(() => {
          window.crm.loadTodaysTasks();
        }, 100);
      } catch (_) { }
    }

    // Dispatch events to notify other components
    window.dispatchEvent(new CustomEvent('tasksUpdated', { detail: { taskId: task.id, rescheduled: true } }));
    document.dispatchEvent(new CustomEvent('pc:task-updated', { detail: { id: task.id, changes: { dueDate, dueTime } } }));

    if (window.crm && typeof window.crm.showToast === 'function') {
      try { window.crm.showToast('Task rescheduled'); } catch (_) { }
    }
  }

  function fmtDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function parseDateStrictSafe(dateStr) {
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
    } catch (_) { }
    return null;
  }

  function positionPopover(anchorEl, pop) {
    try {
      const rect = anchorEl.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const anchorCenter = rect.left + rect.width / 2;
      const desiredLeft = Math.round(window.scrollX + anchorCenter - popRect.width / 2);
      const clampedLeft = Math.max(8, Math.min(desiredLeft, (window.scrollX + document.documentElement.clientWidth) - popRect.width - 8));
      const top = Math.round(window.scrollY + rect.bottom + 8);
      pop.style.left = `${clampedLeft}px`;
      pop.style.top = `${top}px`;
      
      // Position arrow to point to the center of the anchor button
      const arrowLeft = Math.round(anchorCenter - clampedLeft);
      pop.style.setProperty('--arrow-left', `${arrowLeft}px`);
      pop.setAttribute('data-placement', 'bottom');
    } catch (_) { }
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
      // Get all tasks from the same source (localStorage + Firebase) with ownership filtering
      let allTasks = [];

      // Load from localStorage (with ownership filtering)
      try {
        const key = getUserTasksKey();
        const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
        allTasks = filterTasksByOwnership(userTasks);

        // Fallback to legacy key
        if (allTasks.length === 0) {
          const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
          allTasks = filterTasksByOwnership(legacyTasks);
        }
      } catch (_) { allTasks = []; }

      // Load from BackgroundTasksLoader (cache-first, cost-efficient)
      if (window.BackgroundTasksLoader) {
        try {
          const cachedTasks = window.BackgroundTasksLoader.getTasksData() || [];
          const filteredCached = filterTasksByOwnership(cachedTasks);

          // Merge with localStorage (local takes precedence for duplicates)
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          filteredCached.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          allTasks = Array.from(allTasksMap.values());
        } catch (e) {
          console.warn('Could not load tasks from BackgroundTasksLoader:', e);
        }
      }

      // CRITICAL FIX: Always add LinkedIn sequence tasks (regardless of BackgroundTasksLoader)
      try {
        const linkedInTasks = await getLinkedInTasksFromSequences();
        const allTasksMap = new Map();
        allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
        linkedInTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
        allTasks = Array.from(allTasksMap.values());
      } catch (e) {
        console.warn('Could not load LinkedIn tasks for navigation:', e);
      }

      // Only query Firebase if BackgroundTasksLoader doesn't have enough data
      if (allTasks.length < 10 && window.firebaseDB) {
        try {
          let firebaseTasks = [];

          if (!isAdmin()) {
            const email = getUserEmail();
            if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
              firebaseTasks = await window.DataManager.queryWithOwnership('tasks');
              firebaseTasks = firebaseTasks.slice(0, 200);
            } else if (email) {
              // Fallback: two separate queries
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('tasks')
                  .where('ownerId', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(100)
                  .get(),
                window.firebaseDB.collection('tasks')
                  .where('assignedTo', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(100)
                  .get()
              ]);

              const tasksMap = new Map();
              ownedSnap.docs.forEach(doc => {
                const data = doc.data();
                tasksMap.set(doc.id, {
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                  status: data.status || 'pending'
                });
              });
              assignedSnap.docs.forEach(doc => {
                if (!tasksMap.has(doc.id)) {
                  const data = doc.data();
                  tasksMap.set(doc.id, {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                    status: data.status || 'pending'
                  });
                }
              });
              firebaseTasks = Array.from(tasksMap.values());
            }
          } else {
            // Admin: unrestricted query
            const snapshot = await window.firebaseDB.collection('tasks')
              .orderBy('timestamp', 'desc')
              .limit(200)
              .get();
            firebaseTasks = snapshot.docs.map(doc => {
              const data = doc.data() || {};
              const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
              return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
            });
          }

          // Merge with existing tasks
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          firebaseTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          
          // CRITICAL FIX: Add LinkedIn sequence tasks (in case they weren't loaded earlier)
          const linkedInTasks = await getLinkedInTasksFromSequences();
          linkedInTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          
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

        // CRITICAL FIX: Add error handling for navigation
        try {
          // Load the target task data directly instead of calling TaskDetail.open
          await loadTaskData(targetTask.id);
        } catch (loadError) {
          console.error('[TaskDetail] Failed to load adjacent task:', loadError);
          // Show user-friendly error
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Failed to load next task. Please try again.', 'error');
          }
          // Don't navigate away - stay on current task
        }
      }

    } catch (error) {
      console.error('Error navigating to adjacent task:', error);
      // Show user-friendly error
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Navigation error. Please refresh the page.', 'error');
      }
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
      // Get all tasks (same logic as navigation) with ownership filtering
      let allTasks = [];

      // Load from localStorage (with ownership filtering)
      try {
        const key = getUserTasksKey();
        const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
        allTasks = filterTasksByOwnership(userTasks);

        // Fallback to legacy key
        if (allTasks.length === 0) {
          const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
          allTasks = filterTasksByOwnership(legacyTasks);
        }
      } catch (_) { allTasks = []; }

      // Load from BackgroundTasksLoader (cache-first, cost-efficient)
      if (window.BackgroundTasksLoader) {
        try {
          const cachedTasks = window.BackgroundTasksLoader.getTasksData() || [];
          const filteredCached = filterTasksByOwnership(cachedTasks);

          // Merge with localStorage (local takes precedence for duplicates)
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          filteredCached.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          allTasks = Array.from(allTasksMap.values());
        } catch (e) {
          console.warn('Could not load tasks from BackgroundTasksLoader:', e);
        }
      }

      // Only query Firebase if BackgroundTasksLoader doesn't have enough data
      if (allTasks.length < 10 && window.firebaseDB) {
        try {
          let firebaseTasks = [];

          if (!isAdmin()) {
            const email = getUserEmail();
            if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
              firebaseTasks = await window.DataManager.queryWithOwnership('tasks');
              firebaseTasks = firebaseTasks.slice(0, 200);
            } else if (email) {
              // Fallback: two separate queries
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('tasks')
                  .where('ownerId', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(100)
                  .get(),
                window.firebaseDB.collection('tasks')
                  .where('assignedTo', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(100)
                  .get()
              ]);

              const tasksMap = new Map();
              ownedSnap.docs.forEach(doc => {
                const data = doc.data();
                tasksMap.set(doc.id, {
                  id: doc.id,
                  ...data,
                  createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                  status: data.status || 'pending'
                });
              });
              assignedSnap.docs.forEach(doc => {
                if (!tasksMap.has(doc.id)) {
                  const data = doc.data();
                  tasksMap.set(doc.id, {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
                    status: data.status || 'pending'
                  });
                }
              });
              firebaseTasks = Array.from(tasksMap.values());
            }
          } else {
            // Admin: unrestricted query
            const snapshot = await window.firebaseDB.collection('tasks')
              .orderBy('timestamp', 'desc')
              .limit(200)
              .get();
            firebaseTasks = snapshot.docs.map(doc => {
              const data = doc.data() || {};
              const createdAt = data.createdAt || (data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now();
              return { ...data, id: (data.id || doc.id), createdAt, status: data.status || 'pending' };
            });
          }

          // Merge with existing tasks
          const allTasksMap = new Map();
          allTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });
          firebaseTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          
          // CRITICAL FIX: Add LinkedIn sequence tasks
          const linkedInTasks = await getLinkedInTasksFromSequences();
          linkedInTasks.forEach(t => { if (t && t.id && !allTasksMap.has(t.id)) allTasksMap.set(t.id, t); });
          
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
    // CRITICAL FIX: Prevent race conditions - if already loading, wait or skip
    if (state.loadingTask) {
      console.warn('[TaskDetail] Task load already in progress, skipping duplicate call');
      return;
    }

    if (!taskId) {
      console.error('[TaskDetail] No taskId provided to loadTaskData');
      showTaskError('No task ID provided');
      return;
    }

    state.loadingTask = true;

    try {
      // CRITICAL FIX: Show loading state immediately
      if (els.content) {
        els.content.innerHTML = '<div class="empty" style="padding: 2rem; text-align: center; color: var(--text-secondary);">Loading task...</div>';
      }
      // CRITICAL FIX: Also ensure subtitle shows loading state
      if (els.subtitle) {
        els.subtitle.textContent = 'Loading task...';
      }
      // CRITICAL: Re-initialize DOM refs to ensure els.content exists
      if (!initDomRefs()) {
        console.warn('[TaskDetail] DOM not ready, retrying...');
        // CRITICAL FIX: Reset loading flag before retry to prevent deadlock
        state.loadingTask = false;

        // Retry after a short delay (max 10 attempts with exponential backoff)
        let retryCount = 0;
        const maxRetries = 10;
        const retry = () => {
          if (retryCount >= maxRetries) {
            console.error('[TaskDetail] Failed to initialize DOM refs after', maxRetries, 'attempts');
            showTaskError('Page not ready. Please refresh.');
            state.loadingTask = false; // Ensure flag is reset
            return;
          }
          retryCount++;
          const delay = Math.min(100 * retryCount, 500); // Exponential backoff, max 500ms
          setTimeout(() => {
            if (initDomRefs()) {
              loadTaskData(taskId);
            } else {
              retry();
            }
          }, delay);
        };
        retry();
        return;
      }

      // Load task from localStorage and Firebase with ownership filtering
      let task = null;

      // Try localStorage first (with ownership filtering)
      try {
        const key = getUserTasksKey();
        const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
        const filteredTasks = filterTasksByOwnership(userTasks);
        task = filteredTasks.find(t => t.id === taskId);

        // Fallback to legacy key if not found
        if (!task) {
          const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
          const filteredLegacy = filterTasksByOwnership(legacyTasks);
          task = filteredLegacy.find(t => t.id === taskId);
        }
      } catch (e) {
        console.warn('Could not load task from localStorage:', e);
      }

      // If not found, try pre-loaded essential data (with ownership filtering)
      if (!task && window._essentialTasksData) {
        const filteredEssential = filterTasksByOwnership(window._essentialTasksData);
        task = filteredEssential.find(t => t.id === taskId);
        if (task) {
          console.log('[TaskDetail] Using pre-loaded task data');
        }
      }

      // If not found, try BackgroundTasksLoader (cache-first, cost-efficient)
      if (!task && window.BackgroundTasksLoader) {
        try {
          const allTasks = window.BackgroundTasksLoader.getTasksData() || [];
          const filteredTasks = filterTasksByOwnership(allTasks);

          // Try exact match first
          task = filteredTasks.find(t => t && (t.id === taskId || String(t.id) === String(taskId)));

          // If still not found, try document ID match (some tasks might have id field different from doc ID)
          if (!task) {
            task = filteredTasks.find(t => {
              const docId = t._docId || t._id || '';
              return docId === taskId || String(docId) === String(taskId);
            });
          }

          if (task) {
            console.log('[TaskDetail] Using BackgroundTasksLoader cached data');
          } else {
            console.log('[TaskDetail] Task not found in BackgroundTasksLoader cache, will try Firebase');
          }
        } catch (e) {
          console.warn('Could not load task from BackgroundTasksLoader:', e);
        }
      }

      // If not found, try Firebase (with ownership filtering)
      if (!task && window.firebaseDB) {
        try {
          console.log('[TaskDetail] Loading task from Firebase:', taskId);

          // CRITICAL FIX: Try multiple strategies to find the task
          // Strategy 1: Try to get document directly by ID (if taskId is a document ID)
          try {
            const directDoc = await window.firebaseDB.collection('tasks').doc(taskId).get();
            if (directDoc.exists) {
              const data = directDoc.data();
              // Verify ownership for non-admin users
              if (isAdmin() || !data.ownerId && !data.assignedTo) {
                // Admin or no ownership fields - allow
                task = { ...data, id: data.id || directDoc.id };
                console.log('[TaskDetail] Found task by document ID:', directDoc.id);
              } else {
                const email = getUserEmail();
                const ownerId = (data.ownerId || '').toLowerCase();
                const assignedTo = (data.assignedTo || '').toLowerCase();
                const createdBy = (data.createdBy || '').toLowerCase();
                if (ownerId === email || assignedTo === email || createdBy === email) {
                  task = { ...data, id: data.id || directDoc.id };
                  console.log('[TaskDetail] Found task by document ID (ownership verified):', directDoc.id);
                }
              }
            }
          } catch (directError) {
            console.log('[TaskDetail] Direct document lookup failed, trying queries:', directError);
          }

          // Strategy 2: Query by 'id' field (if taskId is stored as a field)
          if (!task) {
            // Use ownership-aware query for non-admin users
            if (!isAdmin()) {
              const email = getUserEmail();
              if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
                const allTasks = await window.DataManager.queryWithOwnership('tasks');
                task = allTasks.find(t => (t.id === taskId) || (t.id && String(t.id) === String(taskId)));
                if (task) {
                  console.log('[TaskDetail] Found task via DataManager.queryWithOwnership');
                }
              } else if (email) {
                // Fallback: try queries with 'id' field
                try {
                  const [ownedSnap, assignedSnap] = await Promise.all([
                    window.firebaseDB.collection('tasks')
                      .where('id', '==', taskId)
                      .where('ownerId', '==', email)
                      .limit(1)
                      .get(),
                    window.firebaseDB.collection('tasks')
                      .where('id', '==', taskId)
                      .where('assignedTo', '==', email)
                      .limit(1)
                      .get()
                  ]);

                  if (!ownedSnap.empty) {
                    const doc = ownedSnap.docs[0];
                    const data = doc.data();
                    task = { ...data, id: data.id || doc.id };
                    console.log('[TaskDetail] Found task via ownerId query:', doc.id);
                  } else if (!assignedSnap.empty) {
                    const doc = assignedSnap.docs[0];
                    const data = doc.data();
                    task = { ...data, id: data.id || doc.id };
                    console.log('[TaskDetail] Found task via assignedTo query:', doc.id);
                  }
                } catch (queryError) {
                  console.warn('[TaskDetail] Query by id field failed (may not be indexed):', queryError);
                }
              }
            } else {
              // Admin: unrestricted query
              try {
                const snapshot = await window.firebaseDB.collection('tasks')
                  .where('id', '==', taskId)
                  .limit(1)
                  .get();

                if (!snapshot.empty) {
                  const doc = snapshot.docs[0];
                  const data = doc.data();
                  task = { ...data, id: data.id || doc.id };
                  console.log('[TaskDetail] Found task via admin query:', doc.id);
                }
              } catch (queryError) {
                console.warn('[TaskDetail] Admin query by id field failed (may not be indexed):', queryError);
              }
            }
          }

          // Strategy 3: Load all tasks and find by ID (fallback if queries fail)
          if (!task) {
            console.log('[TaskDetail] Trying fallback: load all tasks and find by ID');
            try {
              let allTasks = [];
              if (!isAdmin()) {
                const email = getUserEmail();
                if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
                  allTasks = await window.DataManager.queryWithOwnership('tasks');
                } else if (email) {
                  const [ownedSnap, assignedSnap] = await Promise.all([
                    window.firebaseDB.collection('tasks')
                      .where('ownerId', '==', email)
                      .limit(200)
                      .get(),
                    window.firebaseDB.collection('tasks')
                      .where('assignedTo', '==', email)
                      .limit(200)
                      .get()
                  ]);
                  const tasksMap = new Map();
                  ownedSnap.docs.forEach(doc => {
                    const data = doc.data();
                    tasksMap.set(doc.id, { ...data, id: data.id || doc.id });
                  });
                  assignedSnap.docs.forEach(doc => {
                    if (!tasksMap.has(doc.id)) {
                      const data = doc.data();
                      tasksMap.set(doc.id, { ...data, id: data.id || doc.id });
                    }
                  });
                  allTasks = Array.from(tasksMap.values());
                }
              } else {
                const snapshot = await window.firebaseDB.collection('tasks')
                  .limit(200)
                  .get();
                allTasks = snapshot.docs.map(doc => {
                  const data = doc.data();
                  return { ...data, id: data.id || doc.id };
                });
              }

              // Find task by matching id field or document ID
              task = allTasks.find(t => {
                const tId = t.id || '';
                const docId = t._docId || '';
                return String(tId) === String(taskId) || String(docId) === String(taskId);
              });

              if (task) {
                console.log('[TaskDetail] Found task via fallback search through all tasks');
              }
            } catch (fallbackError) {
              console.warn('[TaskDetail] Fallback search failed:', fallbackError);
            }
          }

          if (task) {
            const createdAt = task.createdAt || (task.timestamp && typeof task.timestamp.toDate === 'function' ?
              task.timestamp.toDate().getTime() : task.timestamp) || Date.now();
            task.createdAt = createdAt;
            task.status = task.status || 'pending';
            console.log('[TaskDetail] Task loaded successfully:', { id: task.id, type: task.type, title: task.title });
          } else {
            console.warn('[TaskDetail] Task not found in Firebase after all strategies:', taskId);
          }
        } catch (error) {
          console.error('[TaskDetail] Error loading task from Firebase:', error);
        }
      }

      if (!task) {
        console.error('[TaskDetail] Task not found after all attempts:', taskId);
        console.log('[TaskDetail] Debug info:', {
          taskId,
          hasFirebase: !!window.firebaseDB,
          hasBackgroundLoader: !!window.BackgroundTasksLoader,
          backgroundLoaderCount: window.BackgroundTasksLoader ? (window.BackgroundTasksLoader.getTasksData() || []).length : 0,
          localStorageKey: getUserTasksKey(),
          localStorageCount: (JSON.parse(localStorage.getItem(getUserTasksKey()) || '[]')).length,
          legacyLocalStorageCount: (JSON.parse(localStorage.getItem('userTasks') || '[]')).length
        });

        // CRITICAL FIX: Try force reloading cache before giving up
        try {
          if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
            console.log('[TaskDetail] Task not found in cache, forcing cache reload...');
            await window.BackgroundTasksLoader.forceReload();

            // Try one more time after reload
            const reloadedTasks = window.BackgroundTasksLoader.getTasksData() || [];
            const filteredReloaded = filterTasksByOwnership(reloadedTasks);
            task = filteredReloaded.find(t => t && (t.id === taskId || String(t.id) === String(taskId)));

            if (task) {
              console.log('[TaskDetail] Found task after force reload');
            } else {
              console.warn('[TaskDetail] Task still not found after force reload');
            }
          }
        } catch (reloadError) {
          console.warn('[TaskDetail] Error during force reload:', reloadError);
        }

        if (!task) {
          // CRITICAL FIX: Treat this as a stale/ghost task and clean it up locally
          try {
            cleanupStaleTask(taskId);
          } catch (_) { }

          showTaskError('Task not found or you do not have access to this task. Please refresh the page.');
          state.loadingTask = false;
          return;
        }
      }

      // CRITICAL FIX: Validate task data before normalization
      if (typeof task !== 'object' || !task.id) {
        console.error('[TaskDetail] Invalid task data:', task);
        console.log('[TaskDetail] Task object keys:', task ? Object.keys(task) : 'null');
        showTaskError('Invalid task data. Please refresh the page.');
        state.loadingTask = false;
        return;
      }

      // CRITICAL FIX: Ensure task has all required fields with defaults
      task.title = task.title || 'Untitled Task';
      task.type = task.type || 'custom-task';
      task.status = task.status || 'pending';
      task.dueDate = task.dueDate || '';
      task.dueTime = task.dueTime || '';
      task.contact = task.contact || '';
      task.account = task.account || '';
      task.contactId = task.contactId || '';
      task.accountId = task.accountId || '';

      console.log('[TaskDetail] Task validated and normalized:', {
        id: task.id,
        type: task.type,
        title: task.title,
        hasContact: !!task.contact,
        hasAccount: !!task.account
      });

      // Normalize legacy task shapes/titles/types
      const normType = (t) => {
        const s = String(t || '').toLowerCase().trim();
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
        const looksLegacy = /^task\s+[—-]\s+/i.test(String(task.title || ''));
        if (looksLegacy && window.crm && typeof window.crm.buildTaskTitle === 'function') {
          task.title = window.crm.buildTaskTitle(task.type, task.contact || '', task.account || '');
        }
      } catch (_) { }

      state.currentTask = task;
      state.taskType = task.type;

      console.log('[TaskDetail] Task loaded, preparing to render:', {
        id: task.id,
        type: task.type,
        title: task.title,
        contact: task.contact,
        account: task.account
      });

      // Load contact/account data - AWAIT to ensure data is loaded before rendering
      await loadContactAccountData(task);
      
      console.log('[TaskDetail] Contact/account data loading complete:', {
        hasContact: !!state.contact,
        hasAccount: !!state.account,
        contactId: state.contact?.id,
        accountId: state.account?.id
      });

      // CRITICAL FIX: Ensure DOM is ready before rendering
      if (!els.content) {
        console.warn('[TaskDetail] Content element not found, retrying DOM init...');
        if (!initDomRefs()) {
          console.error('[TaskDetail] Failed to initialize DOM refs for rendering');
          showTaskError('Page not ready. Please refresh.');
          state.loadingTask = false;
          return;
        }
      }

      // Render the task page
      try {
        renderTaskPage();
        console.log('[TaskDetail] Task page rendered successfully');
      } catch (renderError) {
        console.error('[TaskDetail] Error rendering task page:', renderError);
        showTaskError('Failed to render task. Please refresh the page.');
      }
    } catch (error) {
      console.error('[TaskDetail] Error loading task data:', error);
      console.error('[TaskDetail] Error details:', {
        taskId,
        error: error.message,
        stack: error.stack,
        hasFirebase: !!window.firebaseDB,
        hasBackgroundLoader: !!window.BackgroundTasksLoader,
        backgroundLoaderCount: window.BackgroundTasksLoader ? (window.BackgroundTasksLoader.getTasksData() || []).length : 0
      });
      showTaskError('Failed to load task. Please try again or refresh the page.');
    } finally {
      // CRITICAL FIX: Always reset loading flag, even on error
      state.loadingTask = false;
    }
  }

  // CRITICAL FIX: Helper function to show errors even if DOM isn't ready
  function showTaskError(message) {
    try {
      if (els.content) {
        els.content.innerHTML = `<div class="empty" style="padding: 2rem; text-align: center; color: var(--text-secondary);">${escapeHtml(message)}</div>`;
      } else {
        // Fallback: try to find content element or create error display
        const page = document.getElementById('task-detail-page');
        if (page) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'empty';
          errorDiv.style.cssText = 'padding: 2rem; text-align: center; color: var(--text-secondary); position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); z-index: 10000;';
          errorDiv.textContent = message;
          page.appendChild(errorDiv);
        } else {
          // Last resort: alert
          alert(message);
        }
      }
    } catch (e) {
      console.error('[TaskDetail] Failed to show error message:', e);
      alert(message); // Final fallback
    }
  }

  // CRITICAL FIX: Clean up stale tasks that can no longer be loaded
  function cleanupStaleTask(taskId) {
    if (!taskId) return;

    try {
      // Remove from namespaced localStorage key
      try {
        const key = getUserTasksKey();
        const userTasks = JSON.parse(localStorage.getItem(key) || '[]');
        const filteredTasks = userTasks.filter(t => t && t.id !== taskId);
        localStorage.setItem(key, JSON.stringify(filteredTasks));
      } catch (e) {
        console.warn('[TaskDetail] Failed to remove stale task from namespaced localStorage:', e);
      }

      // Also clean up legacy key
      try {
        const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        const filteredLegacy = legacyTasks.filter(t => t && t.id !== taskId);
        localStorage.setItem('userTasks', JSON.stringify(filteredLegacy));
      } catch (e) {
        console.warn('[TaskDetail] Failed to remove stale task from legacy localStorage:', e);
      }

      // Best-effort cache cleanup so BackgroundTasksLoader won't keep returning the ghost task
      try {
        if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
          window.CacheManager.deleteRecord('tasks', taskId);
        } else if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          // Fallback: invalidate entire tasks cache
          window.CacheManager.invalidate('tasks');
        }
      } catch (e) {
        console.warn('[TaskDetail] Failed to clean up stale task from cache:', e);
      }

      // Notify other pages (Tasks page, dashboard widget) to refresh their task lists
      try {
        window.dispatchEvent(new CustomEvent('tasksUpdated', {
          detail: { source: 'staleCleanup', taskId }
        }));
      } catch (e) {
        console.warn('[TaskDetail] Failed to dispatch tasksUpdated for stale task cleanup:', e);
      }

      console.log('[TaskDetail] Cleaned up stale task locally:', taskId);
    } catch (e) {
      console.warn('[TaskDetail] Unexpected error during stale task cleanup:', e);
    }
  }

  async function loadContactAccountData(task) {
    if (!task) return;

    // CRITICAL FIX: Load data from CacheManager first (most reliable source)
    // This ensures data is available even if page modules haven't loaded yet
    let contactsData = [];
    let accountsData = [];

    // Method 1: Try CacheManager first (most reliable - always available)
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        console.log('[TaskDetail] Loading contacts/accounts from CacheManager...');
        const [cachedContacts, cachedAccounts] = await Promise.all([
          window.CacheManager.get('contacts').catch(() => []),
          window.CacheManager.get('accounts').catch(() => [])
        ]);
        contactsData = cachedContacts || [];
        accountsData = cachedAccounts || [];
        console.log('[TaskDetail] CacheManager returned', contactsData.length, 'contacts,', accountsData.length, 'accounts');
      } catch (e) {
        console.warn('[TaskDetail] CacheManager failed:', e);
      }
    }

    // Method 2: Try getPeopleData/getAccountsData (page module data)
    if (contactsData.length === 0 && typeof window.getPeopleData === 'function') {
      contactsData = window.getPeopleData() || [];
      console.log('[TaskDetail] getPeopleData returned', contactsData.length, 'contacts');
    }
    if (accountsData.length === 0 && typeof window.getAccountsData === 'function') {
      accountsData = window.getAccountsData(true) || [];
      console.log('[TaskDetail] getAccountsData returned', accountsData.length, 'accounts');
    }

    // Method 3: Try BackgroundContactsLoader/BackgroundAccountsLoader if available
    if (contactsData.length === 0 && window.BackgroundContactsLoader) {
      contactsData = window.BackgroundContactsLoader.getContactsData() || [];
      console.log('[TaskDetail] BackgroundContactsLoader returned', contactsData.length, 'contacts');
    }
    if (accountsData.length === 0 && window.BackgroundAccountsLoader) {
      accountsData = window.BackgroundAccountsLoader.getAccountsData() || [];
      console.log('[TaskDetail] BackgroundAccountsLoader returned', accountsData.length, 'accounts');
    }

    // Method 4: If still no data, wait a bit and retry with CacheManager
    if ((contactsData.length === 0 || accountsData.length === 0) && window.CacheManager) {
      console.log('[TaskDetail] Waiting for cache to populate...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        if (contactsData.length === 0) {
          contactsData = await window.CacheManager.get('contacts').catch(() => []) || [];
          console.log('[TaskDetail] Retry: CacheManager returned', contactsData.length, 'contacts');
        }
        if (accountsData.length === 0) {
          accountsData = await window.CacheManager.get('accounts').catch(() => []) || [];
          console.log('[TaskDetail] Retry: CacheManager returned', accountsData.length, 'accounts');
        }
      } catch (e) {
        console.warn('[TaskDetail] Retry CacheManager failed:', e);
      }
    }

    // Load contact data if available
    if (task.contactId || task.contact) {
      try {
        let contact = null;

        // Try to find by contactId first
        if (task.contactId && contactsData.length > 0) {
          contact = contactsData.find(p => p.id === task.contactId);
          if (contact) console.log('[TaskDetail] Found contact by ID:', task.contactId);
        }

        // Fallback: try to find by name
        if (!contact && task.contact && contactsData.length > 0) {
          contact = contactsData.find(p => {
            const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
            return fullName && fullName.toLowerCase() === String(task.contact).toLowerCase();
          });
          if (contact) console.log('[TaskDetail] Found contact by name:', task.contact);
        }

        // LAST RESORT: Direct Firebase query if cache/loaders failed
        if (!contact && window.firebaseDB) {
          console.log('[TaskDetail] Cache miss - querying Firebase directly for contact...');
          try {
            // Try by ID first (direct document lookup - most efficient)
            if (task.contactId) {
              const doc = await window.firebaseDB.collection('contacts').doc(task.contactId).get();
              if (doc.exists) {
                contact = { id: doc.id, ...doc.data() };
                console.log('[TaskDetail] ✓ Found contact via direct Firebase query by ID');
              }
            }
            
            // If not found by ID, try by name (requires query)
            if (!contact && task.contact) {
              // Query by firstName + lastName combination
              const nameParts = String(task.contact).trim().split(/\s+/);
              if (nameParts.length >= 2) {
                const firstName = nameParts[0];
                const lastName = nameParts.slice(1).join(' ');
                const snap = await window.firebaseDB.collection('contacts')
                  .where('firstName', '==', firstName)
                  .where('lastName', '==', lastName)
                  .limit(1)
                  .get();
                if (!snap.empty) {
                  const doc = snap.docs[0];
                  contact = { id: doc.id, ...doc.data() };
                  console.log('[TaskDetail] ✓ Found contact via Firebase query by name');
                }
              }
            }
          } catch (fbError) {
            console.warn('[TaskDetail] Firebase direct query failed:', fbError);
          }
        }

        if (contact) {
          state.contact = contact;
          console.log('[TaskDetail] ✓ Loaded contact data:', contact.id, contact.firstName, contact.lastName);
        } else {
          console.warn('[TaskDetail] ✗ Could not find contact:', task.contactId || task.contact, '(searched', contactsData.length, 'contacts + Firebase)');
        }
      } catch (e) {
        console.warn('[TaskDetail] Error loading contact data:', e);
      }
    }

    // Load account data if available
    if (task.accountId || task.account) {
      try {
        let account = null;

        // Try to find by accountId first
        if (task.accountId && accountsData.length > 0) {
          account = accountsData.find(a => a.id === task.accountId);
          if (account) console.log('[TaskDetail] Found account by ID:', task.accountId);
        }

        // Fallback: try to find by name
        if (!account && task.account && accountsData.length > 0) {
          account = accountsData.find(a => {
            const accountName = a.accountName || a.name || a.companyName || '';
            return accountName && accountName.toLowerCase() === String(task.account).toLowerCase();
          });
          if (account) console.log('[TaskDetail] Found account by name:', task.account);
        }

        // LAST RESORT: Direct Firebase query if cache/loaders failed
        if (!account && window.firebaseDB) {
          console.log('[TaskDetail] Cache miss - querying Firebase directly for account...');
          try {
            // Try by ID first (direct document lookup - most efficient)
            if (task.accountId) {
              const doc = await window.firebaseDB.collection('accounts').doc(task.accountId).get();
              if (doc.exists) {
                account = { id: doc.id, ...doc.data() };
                console.log('[TaskDetail] ✓ Found account via direct Firebase query by ID');
              }
            }
            
            // If not found by ID, try by name (requires query)
            if (!account && task.account) {
              // Query by accountName field
              const snap = await window.firebaseDB.collection('accounts')
                .where('accountName', '==', task.account)
                .limit(1)
                .get();
              if (!snap.empty) {
                const doc = snap.docs[0];
                account = { id: doc.id, ...doc.data() };
                console.log('[TaskDetail] ✓ Found account via Firebase query by accountName');
              }
              
              // Also try 'name' field as fallback
              if (!account) {
                const snap2 = await window.firebaseDB.collection('accounts')
                  .where('name', '==', task.account)
                  .limit(1)
                  .get();
                if (!snap2.empty) {
                  const doc = snap2.docs[0];
                  account = { id: doc.id, ...doc.data() };
                  console.log('[TaskDetail] ✓ Found account via Firebase query by name field');
                }
              }
            }
          } catch (fbError) {
            console.warn('[TaskDetail] Firebase direct query failed:', fbError);
          }
        }

        if (account) {
          state.account = account;
          console.log('[TaskDetail] ✓ Loaded account data:', account.id, account.accountName || account.name);
        } else {
          console.warn('[TaskDetail] ✗ Could not find account:', task.accountId || task.account, '(searched', accountsData.length, 'accounts + Firebase)');
        }
      } catch (e) {
        console.warn('[TaskDetail] Error loading account data:', e);
      }
    }
  }

  // Helper function to render avatar or icon with retry logic
  function renderAvatarOrIcon(elementSelector, htmlContent, isAvatar = false) {
    const maxRetries = 10;
    let retries = 0;

    const tryRender = () => {
      // CRITICAL FIX: Scope selector to task-detail-page if not already scoped
      const scopedSelector = elementSelector.includes('#task-detail-page')
        ? elementSelector
        : `#task-detail-page ${elementSelector}`;
      const titleSection = document.querySelector(scopedSelector);
      if (titleSection) {
        // Cleanup existing elements
        const existingElements = titleSection.querySelectorAll('.avatar-initials, .company-favicon-header, .avatar-absolute, [class*="avatar"], [class*="favicon"]');
        existingElements.forEach(el => {
          if (el && el.parentNode) {
            el.remove();
          }
        });

        // Also check for absolutely positioned elements
        const allChildren = titleSection.querySelectorAll('*');
        allChildren.forEach(child => {
          if (child.style && child.style.position === 'absolute' &&
            (child.classList.contains('avatar-absolute') ||
              child.querySelector('.avatar-initials') ||
              child.querySelector('.company-favicon-header'))) {
            child.remove();
          }
        });

        // Add the new element
        const wrapper = isAvatar
          ? `<span class="avatar-initials avatar-absolute" aria-hidden="true">${htmlContent}</span>`
          : `<div class="company-favicon-header avatar-absolute" aria-hidden="true">${htmlContent}</div>`;

        titleSection.insertAdjacentHTML('beforeend', wrapper);

        // Add icon-loaded class
        requestAnimationFrame(() => {
          const element = titleSection.querySelector(isAvatar ? '.avatar-initials' : '.company-favicon-header');
          if (element) {
            element.classList.add('icon-loaded');
            console.log(`[TaskDetail] Successfully rendered ${isAvatar ? 'avatar' : 'icon'}`);
          }
        });

        return true;
      } else if (retries < maxRetries) {
        retries++;
        requestAnimationFrame(tryRender);
        return false;
      } else {
        console.warn(`[TaskDetail] Failed to render ${isAvatar ? 'avatar' : 'icon'} after ${maxRetries} retries`);
        return false;
      }
    };

    // Start with a small delay, then retry
    setTimeout(() => {
      requestAnimationFrame(tryRender);
    }, 50);
  }

  // Robust cleanup function to remove all existing avatars/icons
  function cleanupExistingAvatarsAndIcons() {
    // CRITICAL FIX: Scope selector to task-detail-page
    const titleSection = document.querySelector('#task-detail-page .contact-header-text');
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
    if (!state.currentTask) {
      console.error('[TaskDetail] Cannot render: no current task in state');
      showTaskError('No task data available. Please refresh the page.');
      return;
    }

    console.log('[TaskDetail] Rendering task page for task:', {
      id: state.currentTask.id,
      type: state.currentTask.type,
      title: state.currentTask.title
    });

    // CRITICAL: Ensure DOM refs are initialized
    if (!els.content) {
      if (!initDomRefs()) {
        console.warn('[TaskDetail] DOM not ready for rendering, retrying...');
        setTimeout(() => renderTaskPage(), 100);
        return;
      }
    }

    // CRITICAL FIX: Ensure task has minimum required data
    if (!state.currentTask.id) {
      console.error('[TaskDetail] Task missing ID:', state.currentTask);
      showTaskError('Invalid task data. Please refresh the page.');
      return;
    }

    // Clean up any existing avatars/icons first
    cleanupExistingAvatarsAndIcons();

    injectTaskDetailStyles();

    // CRITICAL FIX: Always update subtitle first to clear "Loading task..." message
    if (els.subtitle) {
      const dueDate = state.currentTask.dueDate || '';
      const dueTime = state.currentTask.dueTime || '';
      if (dueDate && dueTime) {
        els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
      } else if (dueDate) {
        els.subtitle.textContent = `Due: ${dueDate}`;
      } else {
        els.subtitle.textContent = '';
      }
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
          } catch (_) { return ''; }
        };
        const domain = account?.domain ? String(account.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(account?.website || '');
        const logoUrl = account?.logoUrl || '';
        const companyIconSize = 40; // Larger icon for header
        let companyIconHTML = '';
        try {
          if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
            companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: companyIconSize });
          }
        } catch (_) { /* noop */ }

        // If no icon HTML generated, create a fallback with first letter
        if (!companyIconHTML) {
          const fallbackLetter = accountName ? accountName.charAt(0).toUpperCase() : 'C';
          companyIconHTML = `<div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--bg-item); border-radius: 6px; font-weight: 600; font-size: 18px; color: var(--text-secondary);">${fallbackLetter}</div>`;
        }

        // Update title with company name link
        if (els.title && accountName) {
          const companyLinkHTML = `<a href="#account-details" class="company-link" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(accountName)}">${escapeHtml(accountName)}</a>`;
          els.title.innerHTML = `Call ${companyLinkHTML}`;
        }

        // Add company icon/favicon to header using retry helper
        renderAvatarOrIcon('#task-detail-page .contact-header-text', companyIconHTML, false);

        // CRITICAL FIX: Subtitle is already updated above, but ensure it's set here too
        if (els.subtitle) {
          const dueDate = state.currentTask.dueDate || '';
          const dueTime = state.currentTask.dueTime || '';
          if (dueDate && dueTime) {
            els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
          } else if (dueDate) {
            els.subtitle.textContent = `Due: ${dueDate}`;
          } else {
            els.subtitle.textContent = '';
          }
        }

        // Add location info under title
        let contactInfoEl = document.getElementById('task-contact-info');
        if (!contactInfoEl) {
          contactInfoEl = document.createElement('div');
          contactInfoEl.id = 'task-contact-info';
          contactInfoEl.className = 'task-contact-info';
          contactInfoEl.style.cssText = 'margin-top: 0px; color: var(--text-secondary); font-size: 14px;';

          // CRITICAL FIX: Scope selector to task-detail-page
          const titleSection = document.querySelector('#task-detail-page .contact-header-text');
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
        const contactId = state.currentTask.contactId || '';

        // CRITICAL FIX: Try multiple sources to find contact
        let person = null;

        // Method 1: Try by contactId first (most reliable)
        if (contactId) {
          if (typeof window.getPeopleData === 'function') {
            const people = window.getPeopleData() || [];
            person = people.find(p => p.id === contactId);
          }
          if (!person && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            person = contacts.find(c => c.id === contactId);
          }
        }

        // Method 2: Try by name if not found by ID
        if (!person && contactName) {
          if (typeof window.getPeopleData === 'function') {
            const people = window.getPeopleData() || [];
            person = people.find(p => {
              const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
              return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
            });
          }
          if (!person && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            person = contacts.find(c => {
              const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
              return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
            });
          }
        }

        // Use found person or empty object
        person = person || {};
        // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData) for most reliable title
        const title = (state.contact && state.contact.title) || person.title || '';
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
          // CRITICAL FIX: Use multiple sources to resolve contactId (priority order)
          let finalContactId = '';

          // Priority 1: Use state.contact if available (most reliable)
          if (state.contact && state.contact.id) {
            finalContactId = state.contact.id;
            console.log('[TaskDetail] Using contactId from state.contact:', finalContactId);
          }
          // Priority 2: Use person.id if found from lookup
          else if (person && person.id) {
            finalContactId = person.id;
            console.log('[TaskDetail] Using contactId from person lookup:', finalContactId);
          }
          // Priority 3: Use task contactId
          else if (contactId) {
            finalContactId = contactId;
            console.log('[TaskDetail] Using contactId from task:', finalContactId);
          }
          // Priority 4: Check person._id as fallback
          else if (person && person._id) {
            finalContactId = person._id;
            console.log('[TaskDetail] Using contactId from person._id:', finalContactId);
          }
          // Priority 5: Last resort - try to find contact by name in BackgroundContactsLoader
          else if (contactName && window.BackgroundContactsLoader) {
            try {
              const contacts = window.BackgroundContactsLoader.getContactsData() || [];
              const foundContact = contacts.find(c => {
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
                return fullName && fullName.toLowerCase() === contactName.toLowerCase();
              });
              if (foundContact && foundContact.id) {
                finalContactId = foundContact.id;
                console.log('[TaskDetail] Found contactId from BackgroundContactsLoader:', finalContactId);
              }
            } catch (e) {
              console.warn('[TaskDetail] Error finding contact in BackgroundContactsLoader:', e);
            }
          }

          console.log('[TaskDetail] Rendering contact link:', {
            contactName,
            contactId: finalContactId,
            hasPerson: !!person,
            personId: person?.id,
            hasStateContact: !!state.contact,
            stateContactId: state.contact?.id
          });

          // CRITICAL FIX: Always render the link, even without ID (handler will try to resolve it)
          const contactLinkHTML = `<a href="#contact-details" class="contact-link" data-contact-id="${escapeHtml(finalContactId || '')}" data-contact-name="${escapeHtml(contactName)}" style="cursor: pointer;">${escapeHtml(contactName)}</a>`;
          els.title.innerHTML = `Call ${contactLinkHTML}`;

          // CRITICAL FIX: Test click immediately after render
          requestAnimationFrame(() => {
            const contactLink = els.title.querySelector('.contact-link');
            if (contactLink) {
              console.log('[TaskDetail] ✓ Contact link rendered successfully:', {
                contactId: contactLink.getAttribute('data-contact-id'),
                contactName: contactLink.getAttribute('data-contact-name'),
                hasHandler: !!document._taskDetailContactHandlersBound
              });

              // Verify event handler is set up
              if (!document._taskDetailContactHandlersBound) {
                console.warn('[TaskDetail] Contact handlers not bound, setting up now...');
                setupContactLinkHandlers();
              }
            } else {
              console.error('[TaskDetail] ✗ Contact link not found after rendering!');
            }
          });
        }

        // Create or update contact info element (no avatar here)
        let contactInfoEl = document.getElementById('task-contact-info');
        if (!contactInfoEl) {
          contactInfoEl = document.createElement('div');
          contactInfoEl.id = 'task-contact-info';
          contactInfoEl.className = 'task-contact-info';
          contactInfoEl.style.cssText = 'margin-top: 0px; color: var(--text-secondary); font-size: 14px;';

          // Insert between title and subtitle
          // CRITICAL FIX: Scope selector to task-detail-page
          const titleSection = document.querySelector('#task-detail-page .contact-header-text');
          const subtitle = document.getElementById('task-detail-subtitle');
          if (titleSection && subtitle) {
            // Insert the contact info element before the subtitle
            subtitle.insertAdjacentElement('beforebegin', contactInfoEl);
          }
        }

        // Create contact details content (no avatar here)
        // CRITICAL FIX: Match contact-detail.js format: "(title) at (company link)" or just "(title)" or just "(company link)"
        let contactDetailsHTML = '';
        
        // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData) for most reliable account data
        const linkedAccount = state.account || findAssociatedAccount(person);
        const accountId = linkedAccount?.id || '';
        const companyLink = company ? `<a href="#account-details" class="company-link" id="task-header-company-link" title="View account details" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(company)}">${escapeHtml(company)}</a>` : '';
        
        // Match contact-detail.js format exactly: title + " at " + company link (if both exist)
        if (title && company) {
          contactDetailsHTML = `${escapeHtml(title)} at ${companyLink}`;
        } else if (title) {
          contactDetailsHTML = escapeHtml(title);
        } else if (company) {
          contactDetailsHTML = companyLink;
        }

        // Set the contact details content
        contactInfoEl.innerHTML = `<div class="contact-details-normal">${contactDetailsHTML}</div>`;

        // Add absolutely positioned avatar to the main title container using retry helper
        // Ensure we have valid initials
        const finalInitials = initials && initials !== '?' ? initials : (contactName ? contactName.charAt(0).toUpperCase() : 'C');
        console.log('Contact task - Rendering avatar with initials:', finalInitials);

        // Render avatar with retry - ensure it's inside .contact-header-text
        // CRITICAL FIX: Use scoped selector within task-detail-page
        const titleSection = document.querySelector('#task-detail-page .contact-header-text');
        if (titleSection) {
          // Clean up any existing avatars first
          const existingAvatars = titleSection.querySelectorAll('.avatar-initials, .avatar-absolute');
          existingAvatars.forEach(el => el.remove());

          // Create avatar element
          const avatarHTML = `<span class="avatar-initials avatar-absolute" aria-hidden="true" style="position: absolute; left: -50px; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; background: var(--orange-subtle); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px; letter-spacing: 0.5px;">${escapeHtml(finalInitials)}</span>`;
          titleSection.insertAdjacentHTML('beforeend', avatarHTML);
          console.log('[TaskDetail] Avatar rendered successfully with initials:', finalInitials);
        } else {
          // Fallback to retry helper if element not found
          console.warn('[TaskDetail] .contact-header-text not found, using retry helper');
          renderAvatarOrIcon('#task-detail-page .contact-header-text', escapeHtml(finalInitials), true);
        }
      }
    } else if (state.taskType === 'li-connect' || state.taskType === 'li-message' || state.taskType === 'li-view-profile' || state.taskType === 'li-interact-post' ||
      state.taskType === 'linkedin-connect' || state.taskType === 'linkedin-message' || state.taskType === 'linkedin-view' || state.taskType === 'linkedin-interact') {
      // LinkedIn task header (same styling as call tasks)
      const contactName = state.currentTask.contact || '';
      const accountName = state.currentTask.account || '';
      const contactId = state.currentTask.contactId || '';

      // CRITICAL FIX: Try multiple sources to find contact (same as phone-call tasks)
      let person = null;

      // Method 1: Try by contactId first (most reliable)
      if (contactId) {
        if (typeof window.getPeopleData === 'function') {
          const people = window.getPeopleData() || [];
          person = people.find(p => p.id === contactId);
        }
        if (!person && window.BackgroundContactsLoader) {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => c.id === contactId);
        }
      }

      // Method 2: Try by name if not found by ID
      if (!person && contactName) {
        if (typeof window.getPeopleData === 'function') {
          const people = window.getPeopleData() || [];
          person = people.find(p => {
            const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
            return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
          });
        }
        if (!person && window.BackgroundContactsLoader) {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => {
            const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
            return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
          });
        }
      }

      // Use found person or empty object
      person = person || {};
      // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData) for most reliable title
      const title = (state.contact && state.contact.title) || person.title || '';
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

      console.log('LinkedIn task - Contact name:', contactName, 'Initials:', initials);

      // Update the main title to include clickable contact name
      if (els.title && contactName) {
        // CRITICAL FIX: Use multiple sources to resolve contactId (priority order)
        let finalContactId = '';
        const taskContactId = state.currentTask.contactId || ''; // Define taskContactId here

        // Priority 1: Use state.contact if available (most reliable)
        if (state.contact && state.contact.id) {
          finalContactId = state.contact.id;
          console.log('[TaskDetail] LinkedIn: Using contactId from state.contact:', finalContactId);
        }
        // Priority 2: Use person.id if found from lookup
        else if (person && person.id) {
          finalContactId = person.id;
          console.log('[TaskDetail] LinkedIn: Using contactId from person lookup:', finalContactId);
        }
        // Priority 3: Use task contactId
        else if (taskContactId) {
          finalContactId = taskContactId;
          console.log('[TaskDetail] LinkedIn: Using contactId from task:', finalContactId);
        }
        // Priority 4: Check person._id as fallback
        else if (person && person._id) {
          finalContactId = person._id;
          console.log('[TaskDetail] LinkedIn: Using contactId from person._id:', finalContactId);
        }
        // Priority 5: Last resort - try to find contact by name in BackgroundContactsLoader
        else if (contactName && window.BackgroundContactsLoader) {
          try {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            const foundContact = contacts.find(c => {
              const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
              return fullName && fullName.toLowerCase() === contactName.toLowerCase();
            });
            if (foundContact && foundContact.id) {
              finalContactId = foundContact.id;
              console.log('[TaskDetail] LinkedIn: Found contactId from BackgroundContactsLoader:', finalContactId);
            }
          } catch (e) {
            console.warn('[TaskDetail] LinkedIn: Error finding contact in BackgroundContactsLoader:', e);
          }
        }

        console.log('[TaskDetail] Rendering LinkedIn contact link:', {
          contactName,
          contactId: finalContactId,
          hasPerson: !!person,
          personId: person?.id,
          hasStateContact: !!state.contact,
          stateContactId: state.contact?.id
        });

        const contactLinkHTML = `<a href="#contact-details" class="contact-link" data-contact-id="${escapeHtml(finalContactId || '')}" data-contact-name="${escapeHtml(contactName)}" style="cursor: pointer;">${escapeHtml(contactName)}</a>`;
        // Determine action text based on task type (contact name goes in the middle)
        let actionPrefix = '';
        let actionSuffix = '';
        switch (state.taskType) {
          case 'li-connect':
          case 'linkedin-connect':
            actionPrefix = 'Add';
            actionSuffix = 'on LinkedIn';
            break;
          case 'li-message':
          case 'linkedin-message':
            actionPrefix = 'Send a message to';
            actionSuffix = 'on LinkedIn';
            break;
          case 'li-view-profile':
          case 'linkedin-view':
            actionPrefix = 'View';
            actionSuffix = 'on LinkedIn';
            break;
          case 'li-interact-post':
          case 'linkedin-interact':
            actionPrefix = 'Interact with';
            actionSuffix = 'on LinkedIn';
            break;
          default:
            actionPrefix = 'LinkedIn Task for';
            actionSuffix = '';
        }

        // Format: "Add [contact name] on LinkedIn"
        if (actionSuffix) {
          els.title.innerHTML = `${escapeHtml(actionPrefix)} ${contactLinkHTML} ${escapeHtml(actionSuffix)}`;
        } else {
          els.title.innerHTML = `${escapeHtml(actionPrefix)} ${contactLinkHTML}`;
        }

        // CRITICAL FIX: Ensure contact link handler is attached and verify it exists
        setTimeout(() => {
          const contactLink = els.title.querySelector('.contact-link');
          if (contactLink) {
            console.log('[TaskDetail] LinkedIn contact link rendered and ready:', contactLink.getAttribute('data-contact-id'));
            // Verify event handler is set up
            if (!document._taskDetailContactHandlersBound) {
              console.warn('[TaskDetail] Contact handlers not bound, setting up now...');
              setupContactLinkHandlers();
            }
          } else {
            console.error('[TaskDetail] Contact link not found after rendering!');
          }
        }, 100);
      }

      // Create or update contact info element
      let contactInfoEl = document.getElementById('task-contact-info');
      if (!contactInfoEl) {
        contactInfoEl = document.createElement('div');
        contactInfoEl.id = 'task-contact-info';
        contactInfoEl.className = 'task-contact-info';
        contactInfoEl.style.cssText = 'margin-top: 0px; color: var(--text-secondary); font-size: 14px;';

        // Insert between title and subtitle
        // CRITICAL FIX: Scope selector to task-detail-page
        const titleSection = document.querySelector('#task-detail-page .contact-header-text');
        const subtitle = document.getElementById('task-detail-subtitle');
        if (titleSection && subtitle) {
          subtitle.insertAdjacentElement('beforebegin', contactInfoEl);
        }
      }

      // Create contact details content
      // CRITICAL FIX: Match contact-detail.js format: "(title) at (company link)" or just "(title)" or just "(company link)"
      let contactDetailsHTML = '';
      
      // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData) for most reliable account data
      const linkedAccount = state.account || findAssociatedAccount(person) || null;
      const accountId = linkedAccount?.id || '';
      const companyLink = company ? `<a href="#account-details" class="company-link" id="task-header-company-link" title="View account details" data-account-id="${escapeHtml(accountId)}" data-account-name="${escapeHtml(company)}">${escapeHtml(company)}</a>` : '';
      
      // Match contact-detail.js format exactly: title + " at " + company link (if both exist)
      if (title && company) {
        contactDetailsHTML = `${escapeHtml(title)} at ${companyLink}`;
      } else if (title) {
        contactDetailsHTML = escapeHtml(title);
      } else if (company) {
        contactDetailsHTML = companyLink;
      }

      // Set the contact details content
      contactInfoEl.innerHTML = `<div class="contact-details-normal">${contactDetailsHTML}</div>`;

      // Add absolutely positioned avatar to the main title container
      const finalInitials = initials && initials !== '?' ? initials : (contactName ? contactName.charAt(0).toUpperCase() : 'C');
      console.log('LinkedIn task - Rendering avatar with initials:', finalInitials);

      // Render avatar with retry - ensure it's inside .contact-header-text
      // CRITICAL FIX: Use scoped selector within task-detail-page
      const titleSection = document.querySelector('#task-detail-page .contact-header-text');
      if (titleSection) {
        // Clean up any existing avatars first
        const existingAvatars = titleSection.querySelectorAll('.avatar-initials, .avatar-absolute');
        existingAvatars.forEach(el => el.remove());

        // Create avatar element
        const avatarHTML = `<span class="avatar-initials avatar-absolute" aria-hidden="true" style="position: absolute; left: -50px; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; background: var(--orange-subtle); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px; letter-spacing: 0.5px;">${escapeHtml(finalInitials)}</span>`;
        titleSection.insertAdjacentHTML('beforeend', avatarHTML);
        console.log('[TaskDetail] LinkedIn avatar rendered successfully with initials:', finalInitials);
      } else {
        // Fallback to retry helper if element not found
        console.warn('[TaskDetail] .contact-header-text not found, using retry helper');
        renderAvatarOrIcon('#task-detail-page .contact-header-text', escapeHtml(finalInitials), true);
      }
    } else {
      // For other non-phone-call tasks, set title and subtitle normally
      if (els.title) {
        els.title.textContent = state.currentTask.title;
      }

      // CRITICAL FIX: Subtitle is already updated above, but ensure it's set here too
      if (els.subtitle) {
        const dueDate = state.currentTask.dueDate || '';
        const dueTime = state.currentTask.dueTime || '';
        if (dueDate && dueTime) {
          els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
        } else if (dueDate) {
          els.subtitle.textContent = `Due: ${dueDate}`;
        } else {
          els.subtitle.textContent = '';
        }
      }
    }

    // Render task-specific content (split layout similar to Apollo screenshot)
    renderTaskContent();

    // CRITICAL FIX: Event handlers are now set up once using event delegation
    // No need to re-attach - they work automatically for dynamically added elements
    // Just ensure they're initialized if not already
    if (!document._taskDetailCompanyHandlersBound) {
      setupCompanyLinkHandlers();
    }
    if (!document._taskDetailContactHandlersBound) {
      setupContactLinkHandlers();
    }

    // CRITICAL FIX: Also ensure phone click handlers are set up
    if (!document._taskDetailPhoneHandlersBound) {
      setupPhoneClickHandlers();
    }

    // Verify links exist (for debugging)
    const companyLinks = document.querySelectorAll('#task-detail-page .company-link');
    const contactLinks = document.querySelectorAll('#task-detail-page .contact-link');
    if (companyLinks.length > 0 || contactLinks.length > 0) {
      console.log(`[TaskDetail] Found ${companyLinks.length} company links and ${contactLinks.length} contact links (handlers use event delegation)`);
    }

    // Load widgets
    loadTaskWidgets();

    // Load recent activity data for phone tasks
    if (state.taskType === 'phone-call') {
      loadRecentActivityForTask();
    }

    // If phone task, embed contact details on the right
    try {
      if ((state.taskType || '') === 'phone-call') embedContactDetails();
    } catch (_) { }

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
    // CRITICAL FIX: Use document-level guard like fix-duplicate-listeners.js pattern
    if (document._taskDetailCompanyHandlersBound) return;
    document._taskDetailCompanyHandlersBound = true;

    // Handle company link clicks using event delegation (works after re-renders)
    document.addEventListener('click', (e) => {
      const companyLink = e.target.closest('#task-detail-page .company-link');
      if (!companyLink) return;

      e.preventDefault();
      const accountId = companyLink.getAttribute('data-account-id');
      const accountName = companyLink.getAttribute('data-account-name');

      console.log('[TaskDetail] Company link clicked:', { accountId, accountName });

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
          console.error('[TaskDetail] Failed to navigate to account detail:', error);
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Failed to open account. Please try again.', 'error');
          }
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
            if (account && account.id) {
              console.log('[TaskDetail] Found account by name:', account.id);
              window.AccountDetail.show(account.id);
            } else {
              console.warn('[TaskDetail] Account not found:', accountName);
              if (window.crm && typeof window.crm.showToast === 'function') {
                window.crm.showToast('Account not found in system. Please check Accounts page.', 'error');
              }
            }
          }
        } catch (error) {
          console.error('[TaskDetail] Error finding account by name:', error);
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Error finding account. Please try again.', 'error');
          }
        }
      }
    });

    // Setup inline editing for Account Information and Energy & Contract sections
    setupInlineEditing();
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

    // Attach event handlers for task-specific buttons after rendering
    setTimeout(() => {
      attachTaskSpecificHandlers();
    }, 50);
  }

  function attachTaskSpecificHandlers() {
    // LinkedIn task handlers
    const accessLinkedInBtn = document.getElementById('access-linkedin-btn');
    const markCompleteLinkedInBtn = document.getElementById('mark-complete-linkedin-btn');

    if (accessLinkedInBtn) {
      // Remove existing listener if any
      accessLinkedInBtn.replaceWith(accessLinkedInBtn.cloneNode(true));
      const newBtn = document.getElementById('access-linkedin-btn');
      newBtn.addEventListener('click', handleAccessLinkedIn);
    }

    if (markCompleteLinkedInBtn) {
      // Remove existing listener if any
      markCompleteLinkedInBtn.replaceWith(markCompleteLinkedInBtn.cloneNode(true));
      const newBtn = document.getElementById('mark-complete-linkedin-btn');
      newBtn.addEventListener('click', async () => {
        // Get notes from textarea
        const notesEl = document.getElementById('linkedin-notes');
        const notes = notesEl ? notesEl.value.trim() : '';

        // Save notes if provided
        if (notes && state.currentTask) {
          try {
            await saveTaskNotesToRecentActivity(state.currentTask, notes);
          } catch (e) {
            console.warn('Could not save LinkedIn task notes to recent activity:', e);
          }
        }

        // Complete the task
        await handleTaskComplete();
      });
    }
  }

  function handleAccessLinkedIn() {
    if (!state.currentTask) return;

    const contactName = state.currentTask.contact || '';
    const contactId = state.currentTask.contactId || '';

    // Try to find the contact in the people data
    let person = null;
    if (typeof window.getPeopleData === 'function') {
      const people = window.getPeopleData() || [];
      if (contactId) {
        person = people.find(p => p.id === contactId);
      }
      if (!person && contactName) {
        person = people.find(p => {
          const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        });
      }
    }

    // Use the same LinkedIn logic as contact-detail.js
    if (person && person.linkedin) {
      console.log('[TaskDetail] Using contact personal LinkedIn:', person.linkedin);
      try {
        window.open(person.linkedin, '_blank', 'noopener');
      } catch (e) {
        console.error('[TaskDetail] Failed to open LinkedIn URL:', e);
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Failed to open LinkedIn. Please check the URL.', 'error');
        }
      }
    } else {
      // Fallback to search for the person
      const fullName = person ? ([person.firstName, person.lastName].filter(Boolean).join(' ') || person.name || '') : contactName;
      const query = encodeURIComponent(fullName);
      const url = `https://www.linkedin.com/search/results/people/?keywords=${query}`;
      console.log('[TaskDetail] No personal LinkedIn, searching for person:', fullName);
      console.log('[TaskDetail] LinkedIn search URL:', url);
      try {
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        console.error('[TaskDetail] Failed to open LinkedIn search:', e);
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Failed to open LinkedIn search. Please try again.', 'error');
        }
      }
    }
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
      } catch (_) { return ''; }
    };
    const domain = account.domain ? String(account.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(website);
    const logoUrl = account.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch (_) { /* noop */ }
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
              <div class="info-value-wrap" data-field="companyPhone">
                <span class="info-value-text ${!companyPhone ? 'empty' : ''}">${companyPhone ? `<span class="phone-text" data-phone="${escapeHtml(companyPhone)}" data-account-id="${escapeHtml(account.id || '')}" data-account-name="${escapeHtml(accountName || '')}" data-logo-url="${escapeHtml(logoUrl || '')}" data-is-company-phone="true" data-city="${escapeHtml(city || '')}" data-state="${escapeHtml(stateVal || '')}" data-domain="${escapeHtml(domain || '')}">${escapeHtml(companyPhone)}</span>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">INDUSTRY</div>
              <div class="info-value-wrap" data-field="industry">
                <span class="info-value-text ${!industry ? 'empty' : ''}">${escapeHtml(industry) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">EMPLOYEES</div>
              <div class="info-value-wrap" data-field="employees">
                <span class="info-value-text ${!employees ? 'empty' : ''}">${escapeHtml(employees) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">WEBSITE</div>
              <div class="info-value-wrap" data-field="website">
                <span class="info-value-text ${!website ? 'empty' : ''}">${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" class="website-link">${escapeHtml(website)}</a>` : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CITY</div>
              <div class="info-value-wrap" data-field="city">
                <span class="info-value-text ${!city ? 'empty' : ''}">${escapeHtml(city) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">STATE</div>
              <div class="info-value-wrap" data-field="state">
                <span class="info-value-text ${!stateVal ? 'empty' : ''}">${escapeHtml(stateVal) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
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
              <div class="info-value-wrap" data-field="electricitySupplier">
                <span class="info-value-text ${!electricitySupplier ? 'empty' : ''}">${escapeHtml(electricitySupplier) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">ANNUAL USAGE</div>
              <div class="info-value-wrap" data-field="annualUsage">
                <span class="info-value-text ${!annualUsage ? 'empty' : ''}">${annualUsage ? escapeHtml(String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CURRENT RATE</div>
              <div class="info-value-wrap" data-field="currentRate">
                <span class="info-value-text ${!currentRate ? 'empty' : ''}">${escapeHtml(currentRate) || '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
            </div>
            <div class="info-row">
              <div class="info-label">CONTRACT END</div>
              <div class="info-value-wrap" data-field="contractEndDate">
                <span class="info-value-text ${!contractEndDate ? 'empty' : ''}">${contractEndDate ? escapeHtml(toMDY(contractEndDate)) : '--'}</span>
                <div class="info-actions">
                  <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
                  <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
                  <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
                </div>
              </div>
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
    
    // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData)
    // Only fall back to name-based lookup if state.contact is not set
    let person = state.contact || null;
    
    if (!person && typeof window.getPeopleData === 'function') {
      const people = window.getPeopleData() || [];
      person = people.find(p => {
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
        return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
      });
    }
    
    // Also try BackgroundContactsLoader if still not found
    if (!person && window.BackgroundContactsLoader) {
      try {
        const contacts = window.BackgroundContactsLoader.getContactsData() || [];
        person = contacts.find(c => {
          const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        });
      } catch (_) { /* noop */ }
    }
    
    // Also try by contactId if name match fails
    if (!person && task.contactId) {
      if (typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        person = people.find(p => p.id === task.contactId);
      }
      if (!person && window.BackgroundContactsLoader) {
        try {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => c.id === task.contactId);
        } catch (_) { /* noop */ }
      }
    }
    
    person = person || {};

    // Get contact details for the sidebar
    const contactId = person.id || person.contactId || task.contactId || '';
    const email = person.email || '';
    const city = person.city || person.locationCity || '';
    const stateVal = person.state || person.locationState || '';
    const industry = person.industry || person.companyIndustry || '';
    const seniority = person.seniority || '';
    const department = person.department || '';
    const companyName = person.companyName || accountName;

    // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData)
    // Only fall back to findAssociatedAccount if state.account is not set
    const linkedAccount = state.account || findAssociatedAccount(person) || null;

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
      } catch (_) { return ''; }
    };
    const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(linkedAccount?.website || '');
    const logoUrl = linkedAccount?.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch (_) { /* noop */ }
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
    const phoneList = phones.map(ph => `<div class="call-row"><button class="btn-secondary" data-call="${ph}">Call</button><span class="call-number">${ph}</span></div>`).join('') || '<div class="empty">No phone numbers on file</div>';

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
    // Get contact information (same as call tasks)
    const contactName = task.contact || '';
    const accountName = task.account || '';
    
    // CRITICAL FIX: Use state.contact if available (already loaded by loadContactAccountData)
    // Only fall back to name-based lookup if state.contact is not set
    let person = state.contact || null;
    
    if (!person && typeof window.getPeopleData === 'function') {
      const people = window.getPeopleData() || [];
      person = people.find(p => {
        const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
        return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
      });
    }
    
    // Also try BackgroundContactsLoader if still not found
    if (!person && window.BackgroundContactsLoader) {
      try {
        const contacts = window.BackgroundContactsLoader.getContactsData() || [];
        person = contacts.find(c => {
          const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        });
      } catch (_) { /* noop */ }
    }
    
    // Also try by contactId if name match fails
    if (!person && task.contactId) {
      if (typeof window.getPeopleData === 'function') {
        const people = window.getPeopleData() || [];
        person = people.find(p => p.id === task.contactId);
      }
      if (!person && window.BackgroundContactsLoader) {
        try {
          const contacts = window.BackgroundContactsLoader.getContactsData() || [];
          person = contacts.find(c => c.id === task.contactId);
        } catch (_) { /* noop */ }
      }
    }
    
    person = person || {};

    // Get contact details for the sidebar
    const contactId = person.id || person.contactId || task.contactId || '';
    const email = person.email || '';
    const city = person.city || person.locationCity || '';
    const stateVal = person.state || person.locationState || '';
    const industry = person.industry || person.companyIndustry || '';
    const seniority = person.seniority || '';
    const department = person.department || '';
    const companyName = person.companyName || accountName;
    const linkedinUrl = person.linkedin || '';

    // CRITICAL FIX: Use state.account if available (already loaded by loadContactAccountData)
    // Only fall back to findAssociatedAccount if state.account is not set
    const linkedAccount = state.account || findAssociatedAccount(person) || null;

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
      } catch (_) { return ''; }
    };
    const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(linkedAccount?.website || '');
    const logoUrl = linkedAccount?.logoUrl || '';
    let companyIconHTML = '';
    try {
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        companyIconHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
      }
    } catch (_) { /* noop */ }
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

    // Determine LinkedIn task action text
    const taskType = task.type;
    let actionText = '';
    let guidanceText = '';

    switch (taskType) {
      case 'li-connect':
      case 'linkedin-connect':
        actionText = 'Add on LinkedIn';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Send them a connection request, then mark this task as complete.';
        break;
      case 'li-message':
      case 'linkedin-message':
        actionText = 'Send a message on LinkedIn';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Send them a message, then mark this task as complete.';
        break;
      case 'li-view-profile':
      case 'linkedin-view':
        actionText = 'View LinkedIn profile';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Review their profile for context, then mark this task as complete.';
        break;
      case 'li-interact-post':
      case 'linkedin-interact':
        actionText = 'Interact with LinkedIn Post';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile. Like, comment, or share one of their recent posts, then mark this task as complete.';
        break;
      default:
        actionText = 'LinkedIn Task';
        guidanceText = 'Click "Access LinkedIn" to open the contact\'s LinkedIn profile and complete the required action.';
    }

    return `
      <div class="main-content">
        <!-- LinkedIn Task Card -->
        <div class="task-card" id="linkedin-task-card">
          <h3 class="section-title">${actionText}</h3>
          <div class="linkedin-task-info">
            <div class="info-item">
              <label>Contact</label>
              <div class="info-value">${escapeHtml(contactName) || 'Not specified'}</div>
            </div>
            <div class="info-item">
              <label>Company</label>
              <div class="info-value">${escapeHtml(companyName) || 'Not specified'}</div>
            </div>
          </div>
          
          <div class="form-row">
            <label>Notes</label>
            <textarea class="input-dark" id="linkedin-notes" rows="3" placeholder="Add notes about this LinkedIn interaction...">${task.notes ? escapeHtml(task.notes) : ''}</textarea>
          </div>
          
          <div class="actions">
            <button class="btn-primary" id="access-linkedin-btn">Access LinkedIn</button>
            <button class="btn-secondary" id="mark-complete-linkedin-btn">Mark as Complete</button>
          </div>
          
          <div class="linkedin-guidance">
            <p>${guidanceText}</p>
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
        
        ${shortDescription ? `
        <!-- Company Summary -->
        <div class="company-summary-section">
          <div class="info-label">COMPANY SUMMARY</div>
          <div class="company-summary-text">${escapeHtml(shortDescription)}</div>
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
  function embedContactDetails() {
    const mount = document.getElementById('task-contact-embed');
    if (!mount) return;
    const contactName = state.currentTask?.contact || '';
    const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
    let contact = null;
    if (state.currentTask?.contactId) {
      contact = people.find(p => String(p.id || '') === String(state.currentTask.contactId));
    }
    if (!contact && contactName) {
      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      contact = people.find(p => norm([p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '') === norm(contactName));
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
              <div class="info-row"><div class="info-label">EMAIL</div><div class="info-value">${email || '--'}</div></div>
              <div class="info-row"><div class="info-label">${phoneType.toUpperCase()}</div><div class="info-value">${primaryPhone ? `<span class="phone-text" data-phone="${escapeHtml(primaryPhone)}" data-contact-name="${escapeHtml(contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' '))}" data-contact-id="${escapeHtml(contact.id || '')}" data-account-id="${escapeHtml(contact.accountId || contact.account_id || '')}" data-account-name="${escapeHtml(company)}" data-company-name="${escapeHtml(company)}" data-logo-url="${escapeHtml(contact.logoUrl || '')}" data-city="${escapeHtml(city)}" data-state="${escapeHtml(stateVal)}" data-domain="${escapeHtml(contact.domain || '')}" data-phone-type="${phoneType}">${escapeHtml(primaryPhone)}</span>` : '--'}</div></div>
              <div class="info-row"><div class="info-label">COMPANY</div><div class="info-value">${company || '--'}</div></div>
              <div class="info-row"><div class="info-label">CITY</div><div class="info-value">${city || '--'}</div></div>
              <div class="info-row"><div class="info-label">STATE</div><div class="info-value">${stateVal || '--'}</div></div>
              <div class="info-row"><div class="info-label">INDUSTRY</div><div class="info-value">${industry || '--'}</div></div>
            </div>
          </div>`;
      }
    } catch (_) { }
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
        } catch (_) { return ''; }
      };
      const domain = linkedAccount?.domain ? String(linkedAccount.domain).replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./i, '') : deriveDomain(linkedAccount?.website || '');

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
          } catch (_) { }
        }
      }

      // Mark that we've set a specific context to prevent generic click-to-call from overriding
      try {
        window._pcPhoneContextSetByPage = true;
        setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 1000);
      } catch (_) { }

    } catch (error) {
      console.error('[Task Detail] Error setting contact phone context:', error);
    }
  }

  // Handle company phone clicks with proper company context (same pattern as account-detail.js and contact-detail.js)
  function handleCompanyPhoneClick(phoneElement) {
    try {
      console.log('[Task Detail] Company phone clicked, setting company context');

      // Extract context from data attributes (first priority - most reliable for this specific phone element)
      const dataAccountId = phoneElement.getAttribute('data-account-id') || '';
      const dataAccountName = phoneElement.getAttribute('data-account-name') || phoneElement.getAttribute('data-company-name') || '';
      const dataLogoUrl = phoneElement.getAttribute('data-logo-url') || '';
      const dataCity = phoneElement.getAttribute('data-city') || '';
      const dataState = phoneElement.getAttribute('data-state') || '';
      const dataDomain = phoneElement.getAttribute('data-domain') || '';

      // CRITICAL: Also try to get account from state.account if available (most reliable source, like account-detail.js)
      let account = state.account || null;
      
      // If no state.account, try to find by accountId from data attributes
      if (!account && dataAccountId) {
        account = findAccountByIdOrName(dataAccountId, dataAccountName);
      }

      // Extract domain from account if available (same pattern as account-detail.js)
      let domain = dataDomain || '';
      if (!domain && account) {
        domain = account.domain || '';
        if (!domain && account.website) {
          try {
            const url = account.website.startsWith('http') ? account.website : `https://${account.website}`;
            const u = new URL(url);
            domain = u.hostname.replace(/^www\./i, '');
          } catch (_) {
            domain = String(account.website).replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
          }
        }
      }

      // Compute logoUrl with robust fallbacks (same pattern as account-detail.js)
      const logoUrlComputed = (function () {
        try {
          // Priority 1: From account object (most reliable)
          if (account) {
            const fromAccount = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon || account.imageUrl || account.companyImage;
            if (fromAccount) return String(fromAccount);
          }
          
          // Priority 2: From data attribute
          if (dataLogoUrl) return String(dataLogoUrl);
          
          // Priority 3: Try DOM elements (like account-detail.js does)
          const root = document.querySelector('#task-detail-page') || document;
          const imgSel = [
            '#task-detail-page .company-favicon-header img',
            '#task-detail-page .company-logo img',
            '#task-detail-page img.company-favicon',
            '.page-header img.company-favicon',
            '#task-detail-page img[alt=""]'
          ].join(',');
          const img = root.querySelector(imgSel);
          if (img && img.src) return img.src;
          
          return '';
        } catch (_) { return ''; }
      })();

      // Build company context for company phone calls (same pattern as account-detail.js)
      const contextPayload = {
        accountId: account?.id || dataAccountId || null,
        accountName: account?.accountName || account?.name || account?.companyName || dataAccountName || null,
        company: account?.accountName || account?.name || account?.companyName || dataAccountName || null,
        contactId: null, // Explicitly null for company calls
        contactName: '', // Explicitly empty for company calls
        name: account?.accountName || account?.name || account?.companyName || dataAccountName || '', // Company name as primary
        city: account?.city || account?.locationCity || dataCity || '',
        state: account?.state || account?.locationState || dataState || '',
        domain: domain || '',
        logoUrl: logoUrlComputed || '',
        isCompanyPhone: true, // CRITICAL: Mark as company phone
        suggestedContactId: null,
        suggestedContactName: ''
      };

      console.log('[Task Detail] Setting company phone context:', contextPayload);

      // Set the context in the phone widget (same pattern as account-detail.js)
      if (window.Widgets && typeof window.Widgets.setCallContext === 'function') {
        window.Widgets.setCallContext(contextPayload);

        // Also trigger contact display to show the company info
        if (window.Widgets && typeof window.Widgets.setContactDisplay === 'function') {
          try {
            window.Widgets.setContactDisplay(contextPayload, '');
          } catch (_) { }
        }
      }

      // Mark that we've set a specific context to prevent generic click-to-call from overriding
      try {
        window._pcPhoneContextSetByPage = true;
        // Clear the flag after a short delay (same as account-detail.js uses 100ms)
        setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 100);
      } catch (_) { }

    } catch (error) {
      console.error('[Task Detail] Error setting company phone context:', error);
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

  // Load recent activity for the task (account or contact)
  async function loadRecentActivityForTask() {
    const timelineEl = document.getElementById('task-activity-timeline');
    if (!timelineEl) return;

    // Check if this is an account task or contact task
    const isAcctTask = isAccountTask(state.currentTask);

    if (isAcctTask) {
      // ACCOUNT TASK - Load account activities
      const accountName = state.currentTask?.account || '';
      const accountId = state.currentTask?.accountId || '';

      if (!accountName && !accountId) {
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">No account specified for this task</div>
          </div>
        `;
        return;
      }

      try {
        if (window.ActivityManager) {
          // Find the account ID
          let finalAccountId = accountId;
          if (!finalAccountId && accountName) {
            const account = findAccountByIdOrName('', accountName);
            finalAccountId = account?.id || '';
          }

          if (finalAccountId) {
            await window.ActivityManager.renderActivities('task-activity-timeline', 'account', finalAccountId);
            // Ensure activities know they're being clicked from task-detail
            window._activityClickSource = 'task-detail';
          } else {
            // Show empty state if account not found
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
        console.error('Error loading account activity:', error);
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">Error loading activity</div>
          </div>
        `;
      }
    } else {
      // CONTACT TASK - Load contact activities
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
            // Ensure activities know they're being clicked from task-detail
            window._activityClickSource = 'task-detail';
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
        console.error('Error loading contact activity:', error);
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">Error loading activity</div>
          </div>
        `;
      }
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
    const hasMouseDownHandler = typeof document._taskDetailPhoneMouseDownHandler === 'function';
    const hasClickHandler = typeof document._taskDetailPhoneClickHandler === 'function';

    if (document._taskDetailPhoneHandlersBound && hasMouseDownHandler && hasClickHandler) {
      return;
    }

    if (document._taskDetailPhoneHandlersBound && (!hasMouseDownHandler || !hasClickHandler)) {
      console.warn('[TaskDetail] Phone handler guard set but listeners missing. Rebinding.');
    }

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

    // Target company phone elements (same pattern as contact phones)
    function findCompanyPhoneTarget(evtTarget) {
      return evtTarget.closest('#task-detail-page .phone-text[data-is-company-phone="true"]');
    }

    const mouseDownHandler = (e) => {
      // Check for company phone first (capture phase to win race)
      const companyPhoneElement = findCompanyPhoneTarget(e.target);
      if (companyPhoneElement) {
        try { window._pcPhoneContextSetByPage = true; } catch (_) { }
        handleCompanyPhoneClick(companyPhoneElement);
        return;
      }

      // Then check for contact phone
      const phoneElement = findContactPhoneTarget(e.target);
      if (!phoneElement) return;
      try { window._pcPhoneContextSetByPage = true; } catch (_) { }
      const person = resolvePerson();
      if (person && person.id) {
        // Set context early so ClickToCall sees the guard and skips its own context
        handleContactPhoneClick(phoneElement, person);
      }
    };
    // Capture-phase mousedown sets the guard before ClickToCall runs
    document.addEventListener('mousedown', mouseDownHandler, true);
    document._taskDetailPhoneMouseDownHandler = mouseDownHandler;

    const clickHandler = (e) => {
      // Check for company phone first
      const companyPhoneElement = findCompanyPhoneTarget(e.target);
      if (companyPhoneElement) {
        handleCompanyPhoneClick(companyPhoneElement);
        return;
      }

      // Then check for contact phone
      const phoneElement = findContactPhoneTarget(e.target);
      if (!phoneElement) return;
      const person = resolvePerson();
      if (person && person.id) {
        handleContactPhoneClick(phoneElement, person);
      }
    };

    // Capture-phase click as a backup to ensure context is set
    document.addEventListener('click', clickHandler, true);
    document._taskDetailPhoneClickHandler = clickHandler;

    document._taskDetailPhoneHandlersBound = true;
  }

  // Setup contact link handlers
  function setupContactLinkHandlers() {
    const haveLinkHandler = typeof document._taskDetailContactHandler === 'function';
    const haveAddBtnHandler = typeof document._taskDetailAddContactHandler === 'function';

    if (document._taskDetailContactHandlersBound && haveLinkHandler && haveAddBtnHandler) {
      console.log('[TaskDetail] Contact handlers already bound, skipping');
      return;
    }

    if (document._taskDetailContactHandlersBound && (!haveLinkHandler || !haveAddBtnHandler)) {
      console.warn('[TaskDetail] Contact handler guard was set but listeners were missing. Rebinding now.');
    }

    console.log('[TaskDetail] Setting up contact link handlers');

    const contactLinkHandler = (e) => {
      // CRITICAL FIX: Check if click is within task-detail-page first
      const taskPage = e.target.closest('#task-detail-page');
      if (!taskPage) return;

      // CRITICAL FIX: Try multiple ways to find the contact link
      let contactLink = null;

      // Method 1: Check if target itself is the link
      if (e.target.classList && e.target.classList.contains('contact-link')) {
        contactLink = e.target;
      }

      // Method 2: Check if target is inside a contact-link
      if (!contactLink) {
        contactLink = e.target.closest('.contact-link');
      }

      // Method 3: Check if we're inside the title element which contains the link
      if (!contactLink) {
        const titleEl = e.target.closest('#task-detail-title');
        if (titleEl) {
          contactLink = titleEl.querySelector('.contact-link');
        }
      }

      if (!contactLink) return;

      e.preventDefault();
      e.stopPropagation(); // Prevent any other handlers from interfering

      const contactId = contactLink.getAttribute('data-contact-id');
      const contactName = contactLink.getAttribute('data-contact-name');

      console.log('[TaskDetail] Contact link clicked:', { contactId, contactName, target: e.target, link: contactLink });

      // If no contactId, try to find the contact by name
      if (!contactId && contactName) {
        console.log('[TaskDetail] No contactId, searching by name:', contactName);
        try {
          const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
          const contact = people.find(p => {
            const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
            return fullName && contactName && fullName.toLowerCase() === contactName.toLowerCase();
          });

          if (contact && contact.id) {
            console.log('[TaskDetail] Found contact by name:', contact.id);
            // Update the link with the found ID
            contactLink.setAttribute('data-contact-id', contact.id);
            // Retry the click with the ID
            contactLink.click();
            return;
          } else {
            console.warn('[TaskDetail] Contact not found:', contactName);
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('Contact not found in system. Please check People page.', 'error');
            }
            return;
          }
        } catch (error) {
          console.error('[TaskDetail] Error finding contact:', error);
        }
      }

      // CRITICAL FIX: Handle both cases - with contactId and without
      if (!contactId && !contactName) {
        console.warn('[TaskDetail] Contact link has no ID or name');
        return;
      }

      // Final contactId to use
      let finalContactId = contactId;

      // If no contactId but we have a name, try to find it
      if (!finalContactId && contactName) {
        console.log('[TaskDetail] No contactId, searching by name:', contactName);
        try {
          // Try getPeopleData first
          if (typeof window.getPeopleData === 'function') {
            const people = window.getPeopleData() || [];
            const contact = people.find(p => {
              const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
              return fullName && contactName && fullName.toLowerCase() === contactName.toLowerCase();
            });
            if (contact && contact.id) {
              finalContactId = contact.id;
              console.log('[TaskDetail] Found contact by name via getPeopleData:', finalContactId);
            }
          }

          // Try BackgroundContactsLoader if still not found
          if (!finalContactId && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            const contact = contacts.find(c => {
              const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || '';
              return fullName && contactName && fullName.toLowerCase() === contactName.toLowerCase();
            });
            if (contact && contact.id) {
              finalContactId = contact.id;
              console.log('[TaskDetail] Found contact by name via BackgroundContactsLoader:', finalContactId);
            }
          }
        } catch (error) {
          console.error('[TaskDetail] Error finding contact by name:', error);
        }
      }

      if (!finalContactId) {
        console.warn('[TaskDetail] Could not find contact ID for:', contactName);
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Contact not found in system. Please check People page.', 'error');
        }
        return;
      }

      if (window.ContactDetail) {
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
        window._contactNavigationContactId = finalContactId;

        // Navigate to contact detail
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('people');

          // CRITICAL FIX: Use retry pattern with timeout and error handling
          requestAnimationFrame(() => {
            let attempts = 0;
            const maxAttempts = 25; // 2 seconds at 80ms intervals (increased for reliability)

            const tryShowContact = () => {
              if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                try {
                  console.log('[TaskDetail] Opening contact detail for ID:', finalContactId);
                  window.ContactDetail.show(finalContactId);
                } catch (error) {
                  console.error('[TaskDetail] Error showing contact:', error);
                  if (window.crm && typeof window.crm.showToast === 'function') {
                    window.crm.showToast('Failed to open contact. Please try again.', 'error');
                  }
                }
              } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(tryShowContact, 80);
              } else {
                console.warn('[TaskDetail] ContactDetail module not ready after 2 seconds');
                if (window.crm && typeof window.crm.showToast === 'function') {
                  window.crm.showToast('Contact page is loading. Please try again in a moment.', 'error');
                }
              }
            };

            tryShowContact();
          });
        } else {
          console.error('[TaskDetail] CRM navigateToPage function not available');
        }
      } else {
        console.error('[TaskDetail] ContactDetail module not available');
      }
    }; // Use capture phase to catch clicks early

    // Handle contact link clicks in capture phase so no other listener swallows it
    document.addEventListener('click', contactLinkHandler, true);
    document._taskDetailContactHandler = contactLinkHandler;

    const addContactHandler = (e) => {
      const addContactBtn = e.target.closest('#add-contact-btn');
      if (!addContactBtn) return;

      e.preventDefault();
      openAddContactModal();
    };

    document.addEventListener('click', addContactHandler);
    document._taskDetailAddContactHandler = addContactHandler;

    document._taskDetailContactHandlersBound = true;
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
        } catch (_) { }
      }

      // Open the modal using the proper function
      window.crm.createAddContactModal();
    } else {
      console.error('CRM createAddContactModal function not available');
    }
  }

  // Setup contact creation listener to refresh contacts list
  function setupContactCreationListener() {
    const hasCreatedHandler = typeof document._taskDetailContactCreatedHandler === 'function';
    const hasUpdatedHandler = typeof document._taskDetailContactUpdatedHandler === 'function';

    if (document._taskDetailContactCreationBound && hasCreatedHandler && hasUpdatedHandler) {
      return;
    }

    if (document._taskDetailContactCreationBound && (!hasCreatedHandler || !hasUpdatedHandler)) {
      console.warn('[TaskDetail] Contact creation guard set but listeners missing. Rebinding.');
    }

    const onContactCreated = (e) => {
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
    };
    document.addEventListener('pc:contact-created', onContactCreated);
    document._taskDetailContactCreatedHandler = onContactCreated;

    const onContactUpdated = (e) => {
      if (state.currentTask && !isAccountTask(state.currentTask)) {
        // Re-render the task page to reflect updated contact information
        console.log('[Task Detail] Contact updated, refreshing task detail page');
        renderTaskPage();

        // Re-process click-to-call to ensure context is updated
        setTimeout(() => {
          processClickToCallAndEmail();
        }, 100);
      }
    };

    // Listen for contact updates (e.g., when preferred phone field changes on contact-detail page)
    document.addEventListener('pc:contact-updated', onContactUpdated);
    document._taskDetailContactUpdatedHandler = onContactUpdated;

    document._taskDetailContactCreationBound = true;
  }

  // ==== Inline editing functions for Account Information and Energy & Contract ====
  function setupInlineEditing() {
    const infoGrids = document.querySelectorAll('#task-detail-page .info-grid');
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
            try {
              await navigator.clipboard?.writeText(txt);
              if (window.crm?.showToast) window.crm.showToast('Copied');
            } catch (_) { }
            return;
          }

          // Delete button
          const delBtn = e.target.closest('.info-delete');
          if (delBtn) {
            e.preventDefault();
            await saveField(field, '');
            updateFieldText(wrap, '');
            return;
          }
        });
        infoGrid._bound = '1';
      }
    });
  }

  function beginEditField(wrap, field) {
    const textEl = wrap.querySelector('.info-value-text');
    if (!textEl) return;

    const currentText = textEl.textContent || '';
    const isMultiline = false; // No multiline fields in task detail
    const inputControl = field === 'contractEndDate'
      ? `<input type="date" class="info-edit-input" value="${escapeHtml(toISODate(currentText))}">`
      : `<input type="text" class="info-edit-input" value="${escapeHtml(currentText === '--' ? '' : currentText)}">`;

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
    inputWrap.className = 'info-input-wrap';
    inputWrap.innerHTML = inputHtml;

    const input = inputWrap.querySelector('input');
    const saveBtn = inputWrap.querySelector('.info-save');
    const cancelBtn = inputWrap.querySelector('.info-cancel');

    if (input && saveBtn && cancelBtn) {
      wrap.appendChild(inputWrap);
      input.focus();

      // Live comma formatting for annual usage
      if (field === 'annualUsage') {
        const seed = (currentText === '--' ? '' : currentText).replace(/,/g, '');
        input.value = seed;
        input.addEventListener('input', (e) => {
          const el = e.target;
          const raw = String(el.value || '').replace(/[^0-9]/g, '');
          const beforeLen = String(el.value || '').length;
          const caret = el.selectionStart || 0;
          const formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          el.value = formatted;
          const afterLen = formatted.length;
          const delta = afterLen - beforeLen;
          const nextCaret = Math.max(0, Math.min(afterLen, caret + delta));
          try { el.setSelectionRange(nextCaret, nextCaret); } catch (_) { }
        });
      }

      // Add supplier suggestions for electricity supplier field
      if (field === 'electricitySupplier' && window.addSupplierSuggestions) {
        window.addSupplierSuggestions(input, 'task-supplier-list');
      }

      // Live MM/DD/YYYY formatting for contract end date (when using text input)
      if (field === 'contractEndDate' && input.type === 'text') {
        input.addEventListener('input', () => {
          const caret = input.selectionStart;
          const formatted = formatDateInputAsMDY(input.value);
          input.value = formatted;
          try {
            input.selectionStart = input.selectionEnd = Math.min(formatted.length, (caret || formatted.length));
          } catch (_) { }
        });
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

      // Enter/Escape key handler
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await commitEdit(wrap, field, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit(wrap, field, currentText);
        }
      });
    }
  }

  async function commitEdit(wrap, field, value) {
    let toSave = value;
    
    // Convert contractEndDate to MM/DD/YYYY for storage
    if (field === 'contractEndDate') {
      toSave = toMDY(value);
    }
    
    // Normalize phone numbers
    if (field === 'companyPhone') {
      toSave = normalizePhone(value);
    }
    
    // If website updated, also compute and persist domain
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
          await saveField('domain', nextDomain);
        }
      } catch (_) { /* noop */ }
    }

    await saveField(field, toSave);
    updateFieldText(wrap, toSave);

    // If phone field was updated, refresh click-to-call bindings
    if (field === 'companyPhone') {
      try {
        setTimeout(() => {
          if (window.ClickToCall && typeof window.ClickToCall.processSpecificPhoneElements === 'function') {
            window.ClickToCall.processSpecificPhoneElements();
          }
        }, 100);
      } catch (_) { /* noop */ }
    }

    cancelEdit(wrap, field, toSave);
  }

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
    
    // Restore default actions
    const actionsEl = wrap.querySelector('.info-actions');
    if (!actionsEl) {
      const actions = document.createElement('div');
      actions.className = 'info-actions';
      actions.innerHTML = `
        <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
        <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
        <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>
      `;
      wrap.appendChild(actions);
    }
  }

  async function saveField(field, value) {
    const accountId = state.account?.id;
    if (!accountId) return;

    // Add to batch instead of immediate write
    updateBatch[field] = value;

    // Update local state immediately for instant UI feedback
    if (state.account) {
      state.account[field] = value;
    }

    // Clear existing timeout
    if (updateTimeout) clearTimeout(updateTimeout);

    // Set new timeout for batch update (2 seconds after last edit)
    updateTimeout = setTimeout(async () => {
      await processBatchUpdate();
    }, 2000);

    // Show immediate feedback
    if (window.crm?.showToast) window.crm.showToast('Saving...');
  }

  function updateFieldText(wrap, value) {
    const textEl = wrap.querySelector('.info-value-text');
    const field = wrap.getAttribute('data-field');
    if (!textEl) return;
    
    const val = value == null ? '' : String(value);
    
    if (field === 'website' && val) {
      const url = /^https?:\/\//i.test(val) ? val : 'https://' + val;
      textEl.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="website-link">${escapeHtml(val)}</a>`;
      textEl.classList.remove('empty');
    } else if (field === 'contractEndDate') {
      const pretty = toMDY(val);
      textEl.textContent = pretty || '--';
      if (!pretty) textEl.classList.add('empty');
      else textEl.classList.remove('empty');
    } else if (field === 'annualUsage' && val) {
      const numeric = String(val).replace(/[^0-9]/g, '');
      textEl.textContent = numeric ? numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--';
      if (!numeric) textEl.classList.add('empty');
      else textEl.classList.remove('empty');
    } else if (field === 'companyPhone') {
      const display = normalizePhone(val);
      textEl.textContent = display || '--';
      if (!display) {
        textEl.classList.add('empty');
      } else {
        textEl.classList.remove('empty');
        // Re-bind click-to-call
        try {
          const phoneSpan = textEl.querySelector('.phone-text');
          if (phoneSpan && window.ClickToCall) {
            // Update phone data attributes
            phoneSpan.setAttribute('data-phone', display);
            setTimeout(() => {
              if (window.ClickToCall.processSpecificPhoneElements) {
                window.ClickToCall.processSpecificPhoneElements();
              }
            }, 50);
          }
        } catch (_) { }
      }
    } else {
      textEl.textContent = val || '--';
      if (!val) textEl.classList.add('empty');
      else textEl.classList.remove('empty');
    }
  }

  // CRITICAL FIX: Listen for account updates to refresh account data when updated on account-detail page
  if (!document._taskDetailAccountUpdateBound) {
    const onAccountUpdated = async (e) => {
      const { id, changes } = e.detail || {};
      if (!id || !state.currentTask) return;

      // Check if this account update is relevant to the current task
      // Account can be linked via: task.accountId, contact.accountId, or state.account.id
      const taskAccountId = state.currentTask?.accountId || '';
      const contactAccountId = state.contact && (state.contact.accountId || state.contact.account_id || '');
      const stateAccountId = state.account?.id || '';

      // Only refresh if the updated account matches the task's account (any source)
      if (id === taskAccountId || id === contactAccountId || id === stateAccountId) {
        console.log('[TaskDetail] Account updated, reloading account data:', id);
        
        try {
          // Reload account data from Firestore to get latest changes
          if (window.firebaseDB && id) {
            const accountDoc = await window.firebaseDB.collection('accounts').doc(id).get();
            if (accountDoc.exists) {
              const updatedAccount = { id: accountDoc.id, ...accountDoc.data() };
              state.account = updatedAccount;
              console.log('[TaskDetail] ✓ Reloaded account data:', updatedAccount.accountName || updatedAccount.name);
              
              // Re-render the task page to show updated account information
              renderTaskPage();
              
              // Update cache if available
              if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('accounts', id, updatedAccount);
              }
              
              // Update BackgroundAccountsLoader cache if available (best-effort)
              try {
                if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
                  const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
                  const accountIndex = accounts.findIndex(a => a && a.id === id);
                  if (accountIndex !== -1) {
                    accounts[accountIndex] = updatedAccount;
                    console.log('[TaskDetail] Updated account in BackgroundAccountsLoader cache');
                  }
                }
              } catch (e) {
                console.warn('[TaskDetail] Could not update BackgroundAccountsLoader cache:', e);
              }
            }
          }
        } catch (error) {
          console.warn('[TaskDetail] Failed to reload account data after update:', error);
        }
      }
    };

    document.addEventListener('pc:account-updated', onAccountUpdated);
    document._taskDetailAccountUpdateHandler = onAccountUpdated;
    document._taskDetailAccountUpdateBound = true;

    // CRITICAL FIX: Also listen for energy-specific updates (contract end date, supplier, etc.)
    const onEnergyUpdated = async (e) => {
      const { entity, id, field, value } = e.detail || {};
      if (entity !== 'account' || !id || !state.currentTask) return;

      // Check if this energy update is relevant to the current task
      // Account can be linked via: task.accountId, contact.accountId, or state.account.id
      const taskAccountId = state.currentTask?.accountId || '';
      const contactAccountId = state.contact && (state.contact.accountId || state.contact.account_id || '');
      const stateAccountId = state.account?.id || '';

      // Only refresh if the updated account matches the task's account (any source)
      if (id === taskAccountId || id === contactAccountId || id === stateAccountId) {
        console.log('[TaskDetail] Energy field updated:', field, 'for account:', id);
        
        try {
          // Reload account data from Firestore to get latest energy fields
          if (window.firebaseDB && id) {
            const accountDoc = await window.firebaseDB.collection('accounts').doc(id).get();
            if (accountDoc.exists) {
              const updatedAccount = { id: accountDoc.id, ...accountDoc.data() };
              state.account = updatedAccount;
              console.log('[TaskDetail] ✓ Reloaded account data after energy update');
              
              // Re-render the task page to show updated energy information
              renderTaskPage();
              
              // Update cache if available
              if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('accounts', id, updatedAccount);
              }
            }
          }
        } catch (error) {
          console.warn('[TaskDetail] Failed to reload account data after energy update:', error);
        }
      }
    };

    document.addEventListener('pc:energy-updated', onEnergyUpdated);
    document._taskDetailEnergyUpdateHandler = onEnergyUpdated;
  }

  // Public API
  window.TaskDetail = {
    state: state, // Expose state so widgets can access account/contact data
    open: async function (taskId, navigationSource = 'tasks') {
      try {
        // CRITICAL: Capture navigation source BEFORE calling navigateToPage
        // Standardize navigation source detection to match account detail pattern
        const crmPage = (window.crm && window.crm.currentPage) ? String(window.crm.currentPage) : '';
        const active = document.querySelector('.page.active');
        const domPage = active ? (active.getAttribute('data-page') || active.id || '').replace('-page', '') : '';
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
        if (src === 'accounts' && window.accountsModule && typeof window.accountsModule.getCurrentState === 'function') {
          // Add small delay to ensure DOM elements are ready
          setTimeout(() => {
            window.__accountsRestoreData = window.accountsModule.getCurrentState();
          }, 50);
        } else if (src === 'people' && window.peopleModule && typeof window.peopleModule.getCurrentState === 'function') {
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

    init: function () {
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
  document.addEventListener('pc:page-loaded', function (e) {
    if (e.detail && e.detail.page === 'task-detail') {
      setTimeout(() => {
        processClickToCallAndEmail();
      }, 100);
    }
  });

  // Listen for task detail restore event
  document.addEventListener('pc:task-detail-restore', async (e) => {
    console.log('[TaskDetail] Restore event received:', e.detail);
    const restoreData = e.detail || {};

    if (restoreData.taskId) {
      // Don't call TaskDetail.open() - just reload the task data directly
      // This preserves the navigation source that was already set
      await loadTaskData(restoreData.taskId);

      // Restore scroll position if available
      if (restoreData.scroll) {
        setTimeout(() => {
          window.scrollTo(0, restoreData.scroll);
        }, 50);
      }
    }
  });

  // CRITICAL FIX: Listen for navigation back from account-detail to refresh account data
  // This ensures account updates (contract end date, supplier, etc.) are visible immediately
  if (!document._taskDetailAccountDetailsRestoreBound) {
    const onAccountDetailsRestore = async (e) => {
      // Only refresh if we're currently viewing a task with an account
      if (state.currentTask && state.account?.id) {
        const accountId = state.account.id;
        console.log('[TaskDetail] Returning from account-detail, refreshing account data:', accountId);
        
        try {
          // Force reload account data from Firestore (bypass cache to get latest changes)
          if (window.firebaseDB && accountId) {
            const accountDoc = await window.firebaseDB.collection('accounts').doc(accountId).get();
            if (accountDoc.exists) {
              const updatedAccount = { id: accountDoc.id, ...accountDoc.data() };
              state.account = updatedAccount;
              console.log('[TaskDetail] ✓ Reloaded account data after returning from account-detail');
              
              // Re-render the task page to show updated account information
              renderTaskPage();
              
              // Update cache with fresh data
              if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
                await window.CacheManager.updateRecord('accounts', accountId, updatedAccount);
              }
            }
          }
        } catch (error) {
          console.warn('[TaskDetail] Failed to refresh account data after returning from account-detail:', error);
        }
      }
    };

    document.addEventListener('pc:account-details-restore', onAccountDetailsRestore);
    document._taskDetailAccountDetailsRestoreHandler = onAccountDetailsRestore;
    document._taskDetailAccountDetailsRestoreBound = true;
  }
})();

