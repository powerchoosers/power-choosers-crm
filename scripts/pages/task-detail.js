'use strict';

// Task Detail Page - Individual task pages with widgets and navigation
(function() {
  const state = {
    currentTask: null,
    taskType: null,
    contact: null,
    account: null,
    widgets: {
      maps: null,
      energy: null,
      notes: null
    }
  };

  const els = {};

  // Helper functions
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  function injectTaskDetailStyles(){
    const id = 'task-detail-inline-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = `
      /* Task Detail Page Layout */
      #task-detail-page .page-content { 
        display: grid; 
        grid-template-columns: 450px 1fr; /* Left column narrow, right column flexible */
        grid-template-rows: 1fr; /* Make the row fill the available height */
        column-gap: 25px; /* Explicit 25px gap between columns only */
        row-gap: 25px;
        padding: 0 25px; /* Remove top/bottom padding so columns scroll under header/footer */
        height: calc(100vh - 140px); /* Account for header height */
        overflow: hidden; /* Columns will scroll independently */
        justify-items: stretch; /* ensure items fill their grid tracks */
        align-items: start;     /* align items to the top */
      }
      /* Override any global styles that might affect grid gap */
      #task-detail-page .page-content > * {
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
        /* Allow the left column to fully occupy its grid track (no artificial max width) */
        max-width: none;
        width: 100%;
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
        margin-top: 0; /* Remove any extra top margin */
        align-items: stretch; /* Align to top */
      }
      /* Ensure first child in sidebar has no extra top margin */
      #task-detail-page .sidebar-content > *:first-child {
        margin-top: 0 !important;
      }
      
      /* Task Action Cards */
      #task-detail-page .task-card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; }
      #task-detail-page .task-card .section-title { font-weight: 600; font-size: 1rem; color: var(--text-primary); margin: 0 0 var(--spacing-md) 0; }
      #task-detail-page .task-card .form-row { margin: var(--spacing-md) 0; display: block; }
      #task-detail-page .task-card .actions { display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-base); }
      
      /* Company Summary Card */
      #task-detail-page .company-summary-card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; }
      #task-detail-page .company-summary-header { display: flex; align-items: center; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      #task-detail-page .company-logo { width: 32px; height: 32px; border-radius: var(--border-radius-sm); background: var(--bg-item); display: flex; align-items: center; justify-content: center; }
      #task-detail-page .company-logo img { width: 100%; height: 100%; object-fit: contain; border-radius: var(--border-radius-sm); }
      #task-detail-page .company-logo-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; color: var(--text-secondary); }
      #task-detail-page .company-name { font-weight: 600; color: var(--text-primary); }
      #task-detail-page .company-description { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4; }
      
      /* Contact Information Grid */
      #task-detail-page .contact-info-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; }
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
      
      /* Activity Timeline */
      #task-detail-page .activity-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: var(--spacing-base); margin: 0; }
      #task-detail-page .activity-timeline { display: flex; flex-direction: column; gap: var(--spacing-sm); }
      #task-detail-page .activity-item { display: flex; align-items: start; gap: var(--spacing-sm); padding: var(--spacing-sm); border: 1px solid var(--border-light); border-radius: var(--border-radius); background: var(--bg-item); }
      #task-detail-page .activity-icon { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      #task-detail-page .activity-content { flex: 1; }
      #task-detail-page .activity-title { font-weight: 600; color: var(--text-primary); font-size: 0.9rem; }
      #task-detail-page .activity-time { color: var(--text-secondary); font-size: 0.8rem; }
      #task-detail-page .activity-placeholder { text-align: center; padding: var(--spacing-lg) 0; color: var(--text-secondary); }
      
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
  }

  function handleBackNavigation() {
    try {
      const src = window._taskNavigationSource || (window._taskNavigation && window._taskNavigation.source) || '';
      // Default action helper
      const nav = (page) => { if (window.crm && typeof window.crm.navigateToPage === 'function') { window.crm.navigateToPage(page); } };

      if (src === 'account-details') {
        nav('account-details');
        return;
      }
      if (src === 'accounts') {
        const restore = window.__accountsRestoreData || (window.accountsModule && typeof window.accountsModule.getCurrentState==='function' ? window.accountsModule.getCurrentState() : null);
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
      if (src === 'dashboard') { nav('dashboard'); return; }
      if (src) { nav(src); return; }
      // Fallback: go to tasks
      nav('tasks');
    } catch (e) {
      try { window.crm && window.crm.navigateToPage && window.crm.navigateToPage('tasks'); } catch(_) {}
    }
  }

  async function handleTaskComplete() {
    if (!state.currentTask) return;
    
    // Mark task as completed
    state.currentTask.status = 'completed';
    
    // Update in localStorage
    try {
      const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
      const taskIndex = userTasks.findIndex(t => t.id === state.currentTask.id);
      if (taskIndex !== -1) {
        userTasks[taskIndex].status = 'completed';
        localStorage.setItem('userTasks', JSON.stringify(userTasks));
      }
    } catch (e) {
      console.warn('Could not update task status in localStorage:', e);
    }
    
    // Update in Firebase
    try {
      if (window.firebaseDB) {
        const snapshot = await window.firebaseDB.collection('tasks')
          .where('id', '==', state.currentTask.id)
          .limit(1)
          .get();
        
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          await doc.ref.update({
            status: 'completed',
            completedAt: new Date()
          });
        }
      }
    } catch (e) {
      console.warn('Could not update task status in Firebase:', e);
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
    
    // Navigate back
    handleBackNavigation();
  }

  function handleTaskReschedule() {
    // TODO: Implement reschedule functionality
    console.log('Reschedule task:', state.currentTask);
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

  function renderTaskPage() {
    if (!state.currentTask) return;
    injectTaskDetailStyles();
    
    // Update page title and subtitle - keep original task title and due date/time
    if (els.title) {
      els.title.textContent = state.currentTask.title;
    }
    
    if (els.subtitle) {
      const dueDate = state.currentTask.dueDate;
      const dueTime = state.currentTask.dueTime;
      
      // For phone tasks, add contact title and company info after due date
      if (state.taskType === 'phone-call') {
        const contactName = state.currentTask.contact || '';
        const accountName = state.currentTask.account || '';
        const person = (typeof window.getPeopleData === 'function' ? (window.getPeopleData() || []).find(p => {
          const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
          return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
        }) : null) || {};
        const title = person.title || '';
        const company = person.companyName || accountName;
        
        let subtitle = `Due: ${dueDate} at ${dueTime}`;
        if (title && company) {
          subtitle += ` • ${title} at ${company}`;
        } else if (title) {
          subtitle += ` • ${title}`;
        } else if (company) {
          subtitle += ` • ${company}`;
        }
        
        els.subtitle.textContent = subtitle;
      } else {
        els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
      }
    }
    
    // Render task-specific content (split layout similar to Apollo screenshot)
    renderTaskContent();
    
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
  }

  function renderTaskContent() {
    if (!els.content) return;
    
    const task = state.currentTask;
    const taskType = task.type;
    
    let contentHtml = '';
    
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
    
    els.content.innerHTML = contentHtml;
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
    const email = person.email || '';
    const city = person.city || person.locationCity || '';
    const stateVal = person.state || person.locationState || '';
    const industry = person.industry || person.companyIndustry || '';
    const seniority = person.seniority || '';
    const department = person.department || '';
    const companyName = person.companyName || accountName;
    
  // Get account information if available
    const linkedAccount = findAssociatedAccount(person) || null;
    const electricitySupplier = linkedAccount?.electricitySupplier || '';
    const annualUsage = linkedAccount?.annualUsage || '';
    const currentRate = linkedAccount?.currentRate || '';
    const contractEndDate = linkedAccount?.contractEndDate || '';
    const shortDescription = linkedAccount?.shortDescription || '';

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
            <textarea class="input-dark" id="call-notes" rows="3" placeholder="Add call notes..."></textarea>
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
            <div class="company-name">${escapeHtml(companyName || 'Unknown Company')}</div>
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
              <div class="info-value ${!email ? 'empty' : ''}">${escapeHtml(email) || '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">PHONE</div>
              <div class="info-value ${!phones.length ? 'empty' : ''}">${phones.length ? escapeHtml(phones[0]) : '--'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">COMPANY</div>
              <div class="info-value ${!companyName ? 'empty' : ''}">${escapeHtml(companyName) || '--'}</div>
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
              <div class="info-value priority-badge ${task.priority}">${task.priority}</div>
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
        const primaryPhone = contact.workDirectPhone || contact.mobile || contact.otherPhone || '';
        const city = contact.city || contact.locationCity || '';
        const stateVal = contact.state || contact.locationState || '';
        const industry = contact.industry || contact.companyIndustry || '';
        const company = contact.companyName || '';
        mount.innerHTML = `
          <div class="contact-inline">
            <h3 class="section-title">Contact information</h3>
            <div class="info-grid">
              <div class="info-row"><div class="info-label">EMAIL</div><div class="info-value">${email||'--'}</div></div>
              <div class="info-row"><div class="info-label">PHONE</div><div class="info-value">${primaryPhone||'--'}</div></div>
              <div class="info-row"><div class="info-label">COMPANY</div><div class="info-value">${company||'--'}</div></div>
              <div class="info-row"><div class="info-label">CITY</div><div class="info-value">${city||'--'}</div></div>
              <div class="info-row"><div class="info-label">STATE</div><div class="info-value">${stateVal||'--'}</div></div>
              <div class="info-row"><div class="info-label">INDUSTRY</div><div class="info-value">${industry||'--'}</div></div>
            </div>
          </div>`;
      }
    } catch(_) {}
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
      // For now, show a placeholder. In a real implementation, you would fetch activity data
      // from various sources (calls, emails, tasks, etc.)
      const activities = [
        {
          type: 'call',
          title: 'Phone call completed',
          time: '2 hours ago',
          icon: 'phone'
        },
        {
          type: 'task',
          title: 'Follow-up task created',
          time: '1 day ago',
          icon: 'task'
        },
        {
          type: 'email',
          title: 'Email sent',
          time: '3 days ago',
          icon: 'email'
        }
      ];
      
      if (!activities.length) {
        timelineEl.innerHTML = `
          <div class="activity-placeholder">
            <div class="placeholder-text">No recent activity</div>
          </div>
        `;
        return;
      }
      
      // Render activities
      const activitiesHtml = activities.map(activity => {
        const iconSvg = getActivityIcon(activity.icon);
        
        return `
          <div class="activity-item">
            <div class="activity-icon">${iconSvg}</div>
            <div class="activity-content">
              <div class="activity-title">${escapeHtml(activity.title)}</div>
              <div class="activity-time">${escapeHtml(activity.time)}</div>
            </div>
          </div>
        `;
      }).join('');
      
      timelineEl.innerHTML = activitiesHtml;
    } catch (error) {
      console.error('Error loading recent activity:', error);
      timelineEl.innerHTML = `
        <div class="activity-placeholder">
          <div class="placeholder-text">Error loading activity</div>
        </div>
      `;
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

  // Public API
  window.TaskDetail = {
    open: async function(taskId, navigationSource = 'tasks') {
      try {
        // Determine and store navigation source and return state (prefer CRM route state)
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
        window._taskNavigationSource = src;
        window._taskNavigation = { source: src, time: Date.now() };

        // Capture per-page restore data
        if (src === 'accounts' && window.accountsModule && typeof window.accountsModule.getCurrentState==='function') {
          window.__accountsRestoreData = window.accountsModule.getCurrentState();
        } else if (src === 'people' && window.peopleModule && typeof window.peopleModule.getCurrentState==='function') {
          window.__peopleRestoreData = window.peopleModule.getCurrentState();
        } else if (src === 'tasks') {
          // Basic scroll-only restore for Tasks page
          window.__tasksRestoreData = { scroll: window.scrollY || 0 };
          window.__tasksScrollY = window.scrollY || 0;
        }
      } catch (_) { /* noop */ }
      
      // Navigate to task detail page first
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('task-detail');
      }
      
      // Load task data
      await loadTaskData(taskId);
    },
    
    init: function() {
      if (!initDomRefs()) return;
      attachEvents();
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.TaskDetail.init);
  } else {
    window.TaskDetail.init();
  }
})();
