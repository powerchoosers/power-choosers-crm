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

  function injectTaskDetailStyles(){
    const id = 'task-detail-inline-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = `
      #task-detail-page .task-split { display: grid; grid-template-columns: 1fr 1.25fr; gap: 20px; align-items: start; }
      #task-detail-page .task-pane .card { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: 16px; }
      #task-detail-page .task-pane.left .card h3 { margin: 0 0 12px 0; }
      #task-detail-page .task-pane.left .form-row { margin: 10px 0; display: block; }
      #task-detail-page .task-pane.left .actions { display:flex; gap: 10px; margin-top: 12px; }
      #task-detail-page .contact-embed { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); padding: 16px; }
      #task-detail-page .contact-embed .section-title { font-weight: 600; margin: 0 0 8px 0; }
      #task-detail-page .contact-embed .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
      #task-detail-page .contact-embed .info-row { display:flex; align-items:center; gap: 8px; }
      #task-detail-page .contact-embed .info-label { color: var(--text-secondary); font-size: 12px; letter-spacing: .3px; }
      #task-detail-page .contact-embed .info-value { color: var(--text-primary); }
      #task-detail-page .empty { color: var(--text-secondary); }
      #task-detail-page .call-list .call-row { display:flex; align-items:center; gap: 10px; margin-bottom: 8px; }
      #task-detail-page .call-list .call-number { color: var(--text-secondary); }
    `;
    document.head.appendChild(style);
  }

  function initDomRefs() {
    els.page = document.getElementById('task-detail-page');
    els.header = document.getElementById('task-detail-header');
    els.title = document.getElementById('task-detail-title');
    els.subtitle = document.getElementById('task-detail-subtitle');
    els.content = document.getElementById('task-detail-content');
    els.backBtn = document.getElementById('task-detail-back-btn');
    els.completeBtn = document.getElementById('task-complete-btn');
    els.rescheduleBtn = document.getElementById('task-reschedule-btn');
    
    return els.page && els.header && els.title && els.content;
  }

  function attachEvents() {
    if (els.backBtn) {
      els.backBtn.addEventListener('click', handleBackNavigation);
    }
    
    if (els.completeBtn) {
      els.completeBtn.addEventListener('click', handleTaskComplete);
    }
    
    if (els.rescheduleBtn) {
      els.rescheduleBtn.addEventListener('click', handleTaskReschedule);
    }
  }

  function handleBackNavigation() {
    // Navigate back to the source page
    if (window._taskNavigationSource === 'tasks') {
      window.crm.navigateToPage('tasks');
    } else if (window._taskNavigationSource === 'dashboard') {
      window.crm.navigateToPage('dashboard');
    } else {
      // Default to tasks page
      window.crm.navigateToPage('tasks');
    }
  }

  function handleTaskComplete() {
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
        window.firebaseDB.collection('tasks').doc(state.currentTask.id).update({
          status: 'completed',
          completedAt: new Date()
        });
      }
    } catch (e) {
      console.warn('Could not update task status in Firebase:', e);
    }
    
    // Show success message
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Task completed successfully');
    }
    
    // Navigate back
    handleBackNavigation();
  }

  function handleTaskReschedule() {
    // TODO: Implement reschedule functionality
    console.log('Reschedule task:', state.currentTask);
  }

  function loadTaskData(taskId) {
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
      // TODO: Load from Firebase
      console.log('Loading task from Firebase:', taskId);
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
    
    // Update page title and subtitle
    if (els.title) {
      els.title.textContent = state.currentTask.title;
    }
    
    if (els.subtitle) {
      const dueDate = state.currentTask.dueDate;
      const dueTime = state.currentTask.dueTime;
      els.subtitle.textContent = `Due: ${dueDate} at ${dueTime}`;
    }
    
    // Render task-specific content (split layout similar to Apollo screenshot)
    renderTaskContent();
    
    // Load widgets
    loadTaskWidgets();

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
    // Two-column layout: left = call log card, right = embedded contact details
    const contactName = task.contact || '';
    const accountName = task.account || '';
    const person = (typeof window.getPeopleData==='function' ? (window.getPeopleData()||[]).find(p=>{
      const full = [p.firstName,p.lastName].filter(Boolean).join(' ').trim() || p.name || '';
      return full && contactName && full.toLowerCase() === String(contactName).toLowerCase();
    }) : null) || {};
    const phones = [person.mobile, person.workDirectPhone, person.otherPhone].filter(Boolean);
    const phoneList = phones.map(ph=>`<div class="call-row"><button class="btn-secondary" data-call="${ph}">Call</button><span class="call-number">${ph}</span></div>`).join('') || '<div class="empty">No phone numbers on file</div>';

    return `
      <div class="task-split">
        <div class="task-pane left" id="call-log-pane">
          <div class="card">
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
        </div>
        <div class="task-pane right" id="contact-embed-pane">
          <div id="task-contact-embed" class="contact-embed"></div>
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

  // Public API
  window.TaskDetail = {
    open: function(taskId, navigationSource = 'tasks') {
      // Store navigation source for back button
      window._taskNavigationSource = navigationSource;
      
      // Load task data
      loadTaskData(taskId);
      
      // Navigate to task detail page
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('task-detail');
      }
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
