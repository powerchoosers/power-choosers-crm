'use strict';
(function(){
  const state = {
    data: [],
    filtered: [],
    selected: new Set(),
    currentPage: 1,
    pageSize: 25,
    filterMode: 'all',
    hasMore: false
  };
  const els = {};

  // Priority color helper functions
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

  // Restore handler for back navigation from Task Detail
  if (!document._tasksRestoreBound) {
    document.addEventListener('pc:tasks-restore', (ev) => {
      try {
        const d = (ev && ev.detail) || {};
        if (d.filterMode) state.filterMode = d.filterMode;
        if (d.currentPage) {
          const n = parseInt(d.currentPage, 10); if (!isNaN(n) && n > 0) state.currentPage = n;
        }
        if (Array.isArray(d.selectedItems)) state.selected = new Set(d.selectedItems);
        render();
        if (typeof d.scroll === 'number') {
          setTimeout(() => { try { window.scrollTo(0, d.scroll); } catch(_) {} }, 80);
        }
      } catch (e) { console.warn('[Tasks] Restore failed', e); }
    });
    document._tasksRestoreBound = true;
  }

  // Minimal inline icons
  function svgIcon(name){
    switch(name){
      case 'clear': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
      case 'complete': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z"/></svg>';
      case 'assign': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>';
      case 'edit': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      case 'export': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      case 'delete': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      default: return '';
    }
  }

  function injectTasksBulkStyles(){
    const id='tasks-bulk-styles'; if(document.getElementById(id)) return;
    const style=document.createElement('style'); style.id=id; style.type='text/css';
    style.textContent = `
      /* Ensure positioning context */
      #tasks-page .table-container { position: relative; overflow: visible; }

      /* Bulk selection backdrop (shared class name) */
      .bulk-select-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 800; }

      /* Popover */
      .bulk-select-popover { position: absolute; z-index: 900; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light); border-radius: var(--border-radius); box-shadow: var(--elevation-card); padding: var(--spacing-md); min-width: 320px; max-width: 480px; }
      .bulk-select-popover .option { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      .bulk-select-popover .option:last-of-type { margin-bottom: 0; }
      .bulk-select-popover label { font-weight: 600; color: var(--text-primary); }
      .bulk-select-popover .hint { color: var(--text-secondary); font-size: 12px; }
      .bulk-select-popover input[type="number"] { width: 120px; height: 40px; padding: 0 14px; background: var(--bg-item); color: var(--text-primary); border: 2px solid var(--border-light); border-radius: 8px; transition: all 0.3s ease; }
      .bulk-select-popover input[type="number"]:hover { border-color: var(--grey-500); background: var(--bg-widget); }
      .bulk-select-popover input[type="number"]:focus { outline: none; border-color: var(--orange-subtle); background: var(--bg-widget); box-shadow: 0 0 0 3px rgba(255,145,0,0.1); transform: translateY(-1px); }
      .bulk-select-popover .actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); margin-top: var(--spacing-md); }
      .bulk-select-popover .btn-text { height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm); background: transparent; color: var(--text-secondary); border: 1px solid transparent; }
      .bulk-select-popover .btn-text:hover { background: var(--grey-700); border-color: var(--border-light); color: var(--text-inverse); }
      .bulk-select-popover .btn-primary { height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm); background: var(--grey-700); color: var(--text-inverse); border: 1px solid var(--grey-600); font-weight: 600; }
      .bulk-select-popover .btn-primary:hover { background: var(--grey-600); border-color: var(--grey-500); }

      /* Bulk actions bar */
      #tasks-bulk-actions.bulk-actions-modal { position: absolute; left: 50%; transform: translateX(-50%); top: 8px; width: max-content; max-width: none; padding: 8px 12px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); box-shadow: var(--elevation-card); z-index: 850; }
      #tasks-bulk-actions .bar { display: flex; align-items: center; gap: var(--spacing-sm); flex-wrap: nowrap; white-space: nowrap; width: auto; overflow: visible; }
      #tasks-bulk-actions .spacer { display: none; }
      #tasks-bulk-actions .action-btn-sm { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); font-size: 0.85rem; flex: 0 0 auto; }
      #tasks-bulk-actions .action-btn-sm:hover { background: var(--grey-700); }
      #tasks-bulk-actions .action-btn-sm.danger { background: var(--red-muted); border-color: var(--red-subtle); color: var(--text-inverse); }
      #tasks-bulk-actions .action-btn-sm svg { display: block; }
      #tasks-bulk-actions .action-btn-sm span { display: inline-block; white-space: nowrap; }

      /* Create Task Modal */
      .create-task-modal { background: var(--bg-card); border-radius: var(--border-radius-lg); box-shadow: var(--elevation-modal); max-width: 600px; width: 90vw; max-height: 90vh; overflow: hidden; }
      .create-task-modal .header { display: flex; align-items: center; justify-content: space-between; padding: var(--spacing-lg); border-bottom: 1px solid var(--border-light); }
      .create-task-modal .title { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin: 0; }
      .create-task-modal .subtitle { font-size: 0.875rem; color: var(--text-secondary); margin: 4px 0 0 0; }
      .create-task-modal .close-btn { background: none; border: none; font-size: 1.5rem; color: var(--text-secondary); cursor: pointer; padding: 4px; line-height: 1; }
      .create-task-modal .close-btn:hover { color: var(--text-primary); }
      .create-task-modal .body { padding: var(--spacing-lg); max-height: 60vh; overflow-y: auto; }
      .create-task-modal .form-group { margin-bottom: var(--spacing-md); }
      .create-task-modal .form-group:last-child { margin-bottom: 0; }
      .create-task-modal label { display: block; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; font-size: 0.875rem; }
      .create-task-modal input, .create-task-modal select, .create-task-modal textarea { width: 100%; padding: 10px 14px; background: var(--bg-item); color: var(--text-primary); border: 2px solid var(--border-light); border-radius: 8px; font-size: 0.9rem; height: 40px; transition: all 0.3s ease; }
      .create-task-modal input:hover, .create-task-modal select:hover, .create-task-modal textarea:hover { border-color: var(--grey-500); background: var(--bg-widget); }
      .create-task-modal input:focus, .create-task-modal select:focus, .create-task-modal textarea:focus { outline: none; border-color: var(--orange-subtle); background: var(--bg-widget); box-shadow: 0 0 0 3px rgba(255,145,0,0.1); transform: translateY(-1px); }
      .create-task-modal textarea { resize: vertical; min-height: 80px; height: auto; line-height: 1.4; }
      .create-task-modal .footer { display: flex; justify-content: flex-end; gap: var(--spacing-sm); padding: var(--spacing-lg); border-top: 1px solid var(--border-light); background: var(--bg-subtle); }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

  // Parse a date string in MM/DD/YYYY or YYYY-MM-DD into a Date at local midnight
  function parseDateStrict(dateStr){
    if(!dateStr) return null;
    try{
      if(dateStr.includes('/')){
        const parts = dateStr.split('/').map(n=>parseInt(n,10));
        if(parts.length===3 && !parts.some(isNaN)) return new Date(parts[2], parts[0]-1, parts[1]);
      } else if(dateStr.includes('-')){
        const parts = dateStr.split('-').map(n=>parseInt(n,10));
        if(parts.length===3 && !parts.some(isNaN)) return new Date(parts[0], parts[1]-1, parts[2]);
      }
      const d = new Date(dateStr);
      if(!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }catch(_){ /* noop */ }
    return null;
  }

  // Parse a time like "10:30 AM" into minutes since midnight; NaN if invalid/missing
  function parseTimeToMinutes(timeStr){
    if(!timeStr || typeof timeStr!=='string') return NaN;
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if(!m) return NaN;
    let hour = parseInt(m[1],10);
    const min = parseInt(m[2],10);
    const ap = m[3].toUpperCase();
    if(hour===12) hour = 0; // 12AM -> 0, 12PM handled below
    if(ap==='PM') hour += 12;
    return hour*60 + min;
  }

  // Sort tasks chronologically by due date then due time
  function sortTasksChronologically(arr){
    return arr.slice().sort((a,b)=>{
      const da = parseDateStrict(a.dueDate);
      const db = parseDateStrict(b.dueDate);
      if(da && db){
        const dd = da - db;
        if(dd!==0) return dd;
      } else if(da && !db){
        return -1;
      } else if(!da && db){
        return 1;
      }
      const ta = parseTimeToMinutes(a.dueTime);
      const tb = parseTimeToMinutes(b.dueTime);
      const taValid = !isNaN(ta), tbValid = !isNaN(tb);
      if(taValid && tbValid){
        const td = ta - tb; if(td!==0) return td;
      } else if(taValid && !tbValid){
        return -1;
      } else if(!taValid && tbValid){
        return 1;
      }
      return (a.createdAt||0) - (b.createdAt||0);
    });
  }

  function initDomRefs(){
    els.page = document.getElementById('tasks-page'); if(!els.page) return false;
    els.table = document.getElementById('tasks-table');
    els.tbody = els.table ? els.table.querySelector('tbody') : null;
    els.container = els.page.querySelector('.table-container');
    els.pag = document.getElementById('tasks-pagination');
    els.summary = document.getElementById('tasks-pagination-summary');
    els.selectAll = document.getElementById('select-all-tasks');
    els.filterTabs = Array.from(els.page.querySelectorAll('.filter-tab'));
    els.createTaskBtn = els.page.querySelector('.create-task-btn');
    return true;
  }

  function attachEvents(){
    if(els.selectAll){
      els.selectAll.addEventListener('change',()=>{
        if(els.selectAll.checked) openBulkPopover(); else { state.selected.clear(); render(); closeBulkPopover(); hideBulkBar(); }
      });
    }
    // Handle Tasks filter tabs locally and silence global handler in main.js
    els.filterTabs.forEach(tab=>{
      tab.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        els.filterTabs.forEach(t=>t.classList.remove('active'));
        tab.classList.add('active');
        const label = (tab.textContent||'').trim().toLowerCase();
        // New filter sections: All your tasks, Phone Tasks, Email Tasks, LinkedIn Tasks, Overdue Tasks
        if(label.includes('phone')) state.filterMode='phone';
        else if(label.includes('email')) state.filterMode='email';
        else if(label.includes('linkedin')) state.filterMode='linkedin';
        else if(label.includes('overdue')) state.filterMode='overdue';
        else state.filterMode='all';
        applyFilters();
      });
    });
    // Create task button
    if(els.createTaskBtn){
      els.createTaskBtn.addEventListener('click', openCreateTaskModal);
    }
  }

  function getUserTasksKey(){
    try {
      const email = (window.DataManager && typeof window.DataManager.getCurrentUserEmail==='function') ? window.DataManager.getCurrentUserEmail() : (window.currentUserEmail||'').toLowerCase();
      return email ? `userTasks:${email}` : 'userTasks';
    } catch(_) { return 'userTasks'; }
  }

  async function loadData(){
    // Build from real sources: BackgroundTasksLoader + localStorage tasks + LinkedIn sequence tasks
    const linkedInTasks = getLinkedInTasksFromSequences();
    let userTasks = [];
    let firebaseTasks = [];
    
    // Helper to get user email and role
    const getUserEmail = () => {
      try {
        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
          return window.DataManager.getCurrentUserEmail();
        }
        return (window.currentUserEmail || '').toLowerCase();
      } catch(_) {
        return (window.currentUserEmail || '').toLowerCase();
      }
    };
    const isAdmin = () => {
      try {
        if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
          return window.DataManager.isCurrentUserAdmin();
        }
        return window.currentUserRole === 'admin';
      } catch(_) {
        return window.currentUserRole === 'admin';
      }
    };
    
    // Load from localStorage (namespaced by user email; fallback to legacy key)
    try {
      const key = getUserTasksKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        userTasks = JSON.parse(raw);
      } else {
        // Fallback migration from legacy key
        const legacy = localStorage.getItem('userTasks');
        userTasks = legacy ? JSON.parse(legacy) : [];
      }
      
      // CRITICAL: Filter by ownership for non-admin users (localStorage bypasses Firestore rules)
      if (!isAdmin() && userTasks.length > 0) {
        const email = getUserEmail();
        userTasks = userTasks.filter(t => {
          if (!t) return false;
          const ownerId = (t.ownerId || '').toLowerCase();
          const assignedTo = (t.assignedTo || '').toLowerCase();
          const createdBy = (t.createdBy || '').toLowerCase();
          return ownerId === email || assignedTo === email || createdBy === email;
        });
      }
    } catch(_) { userTasks = []; }
    
    // Load from BackgroundTasksLoader (cache-first)
    try {
      if (window.BackgroundTasksLoader) {
        firebaseTasks = window.BackgroundTasksLoader.getTasksData() || [];
        state.hasMore = window.BackgroundTasksLoader.hasMore();
        console.log('[Tasks] Loaded', firebaseTasks.length, 'tasks from BackgroundTasksLoader');
      } else {
        // Fallback to direct Firestore query if background loader not available
        if (window.firebaseDB) {
          const snapshot = await window.firebaseDB.collection('tasks')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();
          firebaseTasks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id, 
              ...data,
              // Ensure we have the required fields with proper fallbacks
              createdAt: data.createdAt || (data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) || Date.now(),
              // Ensure status is set
            status: data.status || 'pending'
          };
        });
        }
      }
    } catch (error) {
      console.warn('Could not load tasks from BackgroundTasksLoader:', error);
    }
    
    // Debug logging
    console.log(`[Tasks] Loaded ${userTasks.length} tasks from localStorage, ${firebaseTasks.length} tasks from Firebase`);
    
    // Merge all tasks, prioritizing localStorage over Firebase for duplicates
    const allTasks = [...userTasks];
    
    // Add Firebase tasks that aren't already in localStorage
    firebaseTasks.forEach(fbTask => {
      if (!userTasks.some(ut => ut.id === fbTask.id)) {
        allTasks.push(fbTask);
      }
    });
    
    // Add LinkedIn tasks that aren't duplicates
    const nonDupLinkedIn = linkedInTasks.filter(li => !allTasks.some(t => t.id === li.id));
    const rows = [...allTasks, ...nonDupLinkedIn];
    
    state.data = rows;
    state.filtered = sortTasksChronologically(rows);
    console.log(`[Tasks] Total tasks loaded: ${rows.length}`);
    render();
  }

  // Load more tasks from background loader
  async function loadMoreTasks() {
    if (!state.hasMore || !window.BackgroundTasksLoader) {
      return;
    }

    try {
      console.log('[Tasks] Loading more tasks...');
      const result = await window.BackgroundTasksLoader.loadMore();
      
      if (result.loaded > 0) {
        // Reload data to get updated tasks
        await loadData();
        console.log('[Tasks] Loaded', result.loaded, 'more tasks');
      } else {
        state.hasMore = false;
      }
    } catch (error) {
      console.error('[Tasks] Failed to load more tasks:', error);
    }
  }

  function getLinkedInTasksFromSequences() {
    const linkedInTasks = [];
    
    // Get sequences from global state or localStorage
    let sequences = [];
    try {
      if (window.firebaseDB) {
        // In a real app, this would be an async call to Firestore
        // For now, we'll check localStorage or global state
        const storedSequences = localStorage.getItem('sequences');
        if (storedSequences) {
          sequences = JSON.parse(storedSequences);
        }
      }
    } catch (e) {
      console.warn('Could not load sequences for task generation:', e);
    }
    
    sequences.forEach(sequence => {
      if (!sequence.steps || !Array.isArray(sequence.steps)) return;
      
      sequence.steps.forEach(step => {
        // Only process LinkedIn steps that are active (not paused)
        if (!step.paused && (step.type === 'li-connect' || step.type === 'li-message' || step.type === 'li-view-profile' || step.type === 'li-interact-post')) {
          const typeLabels = {
            'li-connect': 'linkedin-connect',
            'li-message': 'linkedin-message', 
            'li-view-profile': 'linkedin-view',
            'li-interact-post': 'linkedin-interact'
          };
          
          const taskTitles = {
            'li-connect': 'Add on LinkedIn',
            'li-message': 'Send a message on LinkedIn',
            'li-view-profile': 'View LinkedIn profile', 
            'li-interact-post': 'Interact with LinkedIn Post'
          };
          
          // Calculate due date based on step delay
          const delayMinutes = step.delayMinutes || 0;
          const dueDate = new Date(Date.now() + delayMinutes * 60 * 1000);
          
          linkedInTasks.push({
            id: `linkedin_${step.id}`,
            title: step.data?.note || taskTitles[step.type] || 'LinkedIn task',
            contact: `Contact from ${sequence.name}`,
            account: `Account from ${sequence.name}`,
            type: typeLabels[step.type] || 'linkedin',
            priority: step.data?.priority || 'medium',
            dueDate: dueDate.toLocaleDateString(),
            status: 'pending',
            sequenceId: sequence.id,
            stepId: step.id,
            isLinkedInTask: true
          });
        }
      });
    });
    
    return linkedInTasks;
  }

  function applyFilters(){
    let arr = state.data.slice();
    const today = new Date();
    const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if(state.filterMode==='phone') {
      arr = arr.filter(r => /phone|call/i.test(String(r.type||'')));
    } else if(state.filterMode==='email') {
      arr = arr.filter(r => /email/i.test(String(r.type||'')));
    } else if(state.filterMode==='linkedin') {
      arr = arr.filter(r => /linkedin|li-/i.test(String(r.type||'')));
    } else if(state.filterMode==='overdue') {
      arr = arr.filter(r => {
        if((r.status||'pending') === 'completed') return false;
        const d = parseDateStrict(r.dueDate);
        if(!d) return false;
        return d.getTime() < localMidnight.getTime();
      });
    }
    state.filtered = sortTasksChronologically(arr);
    state.currentPage=1; state.selected.clear();
    render();
  }

  function getPageItems(){ const s=(state.currentPage-1)*state.pageSize; return state.filtered.slice(s,s+state.pageSize); }

  function paginate(){ if(!els.pag) return; const total=state.filtered.length; const pages=Math.max(1,Math.ceil(total/state.pageSize)); state.currentPage=Math.min(state.currentPage,pages); if(els.summary){ const st=total===0?0:(state.currentPage-1)*state.pageSize+1; const en=Math.min(state.currentPage*state.pageSize,total); els.summary.textContent=`${st}-${en} of ${total}`; } let html=''; const btn=(l,d,p)=>`<button class="page-btn" ${d?'disabled':''} data-page="${p}">${l}</button>`; html+=btn('Prev',state.currentPage===1,state.currentPage-1); for(let p=1;p<=pages;p++){ html+=`<button class="page-btn ${p===state.currentPage?'active':''}" data-page="${p}">${p}</button>`;} html+=btn('Next',state.currentPage===pages,state.currentPage+1); els.pag.innerHTML=html; els.pag.querySelectorAll('.page-btn').forEach(b=>b.addEventListener('click',()=>{ const n=parseInt(b.getAttribute('data-page')||'1',10); if(!isNaN(n)&&n>=1&&n<=pages){ state.currentPage=n; render(); }})); }

  function render(){ if(!els.tbody) return; state.filtered = sortTasksChronologically(state.filtered); const rows=getPageItems(); els.tbody.innerHTML = rows.map(r=>rowHtml(r)).join('');
    // Row events
    els.tbody.querySelectorAll('input.row-select').forEach(cb=>cb.addEventListener('change',()=>{ const id=cb.getAttribute('data-id'); if(cb.checked) state.selected.add(id); else state.selected.delete(id); updateBulkBar(); }));
    
    // Task link events - open individual task detail pages
    els.tbody.querySelectorAll('.task-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const taskId = link.getAttribute('data-task-id');
        if (taskId && window.TaskDetail && typeof window.TaskDetail.open === 'function') {
          // Capture rich restore state for Tasks page
          try {
            window.__tasksRestoreData = {
              currentPage: state.currentPage,
              filterMode: state.filterMode,
              selectedItems: Array.from(state.selected || []),
              scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0
            };
          } catch(_) {}
          window.TaskDetail.open(taskId, 'tasks');
        }
      });
    });
    
    els.tbody.querySelectorAll('button.btn-success').forEach(btn=>btn.addEventListener('click',async ()=>{ const id = btn.getAttribute('data-id'); const recIdx = state.data.findIndex(x=>x.id===id); if(recIdx!==-1){
      // Remove from state immediately
      const [removed] = state.data.splice(recIdx,1);
      state.filtered = state.data.slice();
      // Remove from localStorage immediately (namespaced)
      try {
        const key = getUserTasksKey();
        const current = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = current.filter(t => t.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
      } catch (e) { console.warn('Could not remove task from localStorage:', e); }
      // Remove from Firebase (best-effort)
      try {
        const db = window.firebaseDB;
        if (db) {
          // Many tasks store their own id inside the doc; delete by where('id','==',id)
          const snap = await db.collection('tasks').where('id','==',id).limit(5).get();
          const batch = db.batch();
          snap.forEach(doc => batch.delete(doc.ref));
          if (!snap.empty) await batch.commit();
        }
      } catch (e) { console.warn('Could not remove task from Firebase:', e); }
      // Update Today's Tasks widget and table
      updateTodaysTasksWidget();
    }
    btn.textContent='Completed'; btn.disabled=true; btn.style.opacity='0.6'; render(); }));
    // Header select state
    if(els.selectAll){ const pageIds=new Set(rows.map(r=>r.id)); const allSelected=[...pageIds].every(id=>state.selected.has(id)); els.selectAll.checked = allSelected && rows.length>0; }
    paginate(); updateBulkBar(); }

  // Update task titles to descriptive format
  function updateTaskTitle(task) {
    // Normalize task type first
    const normalizedType = normalizeTaskType(task.type);
    
    // Always update titles to use proper action-oriented format based on task type
    if (normalizedType && (task.contact || task.account)) {
      // Use the shared buildTaskTitle function if available
      if (window.crm && typeof window.crm.buildTaskTitle === 'function') {
        return window.crm.buildTaskTitle(normalizedType, task.contact || '', task.account || '');
      } else {
        // Fallback to manual mapping
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
        const action = typeMap[normalizedType] || 'Task for';
        const name = task.contact || task.account || 'contact';
        return `${action} ${name}`;
      }
    }
    return task.title;
  }

  // Normalize task type to standard format
  function normalizeTaskType(type) {
    const s = String(type || '').toLowerCase().trim();
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
    return type || 'custom-task';
  }

  function rowHtml(r){
    const id = escapeHtml(r.id);
    const title = escapeHtml(updateTaskTitle(r));
    const name = escapeHtml(r.contact || '');
    const account = escapeHtml(r.account || '');
    const type = escapeHtml(r.type || '');
    const pr = escapeHtml(r.priority || '');
    const due = escapeHtml(r.dueDate || '');
    const time = escapeHtml(r.dueTime || '');
    const status = escapeHtml(r.status || '');
    return `
      <tr>
        <td class="col-select"><input type="checkbox" class="row-select" data-id="${id}" ${state.selected.has(r.id)?'checked':''}></td>
        <td>
          <div class="task-info">
            <div class="task-title">
              <a href="#" class="task-link" data-task-id="${id}" style="color: var(--grey-400); text-decoration: none; font-weight: 400; transition: var(--transition-fast);" onmouseover="this.style.color='var(--text-inverse)'" onmouseout="this.style.color='var(--grey-400)'">${title}</a>
            </div>
            <div class="task-subtitle">${name} • ${account}</div>
          </div>
        </td>
        <td><span class="type-badge ${type}">${type}</span></td>
        <td><span class="priority-badge ${pr}" style="background: ${getPriorityBackground(pr)}; color: ${getPriorityColor(pr)};">${pr}</span></td>
        <td>${due}</td>
        <td>${time}</td>
        <td><span class="status-badge ${status}">${status}</span></td>
        <td><div class="action-buttons"><button class="btn-success" data-id="${id}">${status==='completed'?'Completed':'Complete'}</button><button class="btn-text">Edit</button></div></td>
      </tr>`;
  }

  // Bulk selection popover
  function openBulkPopover(){ if(!els.container) return; closeBulkPopover();
    const backdrop=document.createElement('div'); backdrop.className='bulk-select-backdrop'; backdrop.addEventListener('click',()=>{ if(els.selectAll) els.selectAll.checked = state.selected.size>0; closeBulkPopover(); }); document.body.appendChild(backdrop);
    const total=state.filtered.length; const page=getPageItems().length;
    const pop=document.createElement('div'); pop.id='tasks-bulk-popover'; pop.className='bulk-select-popover'; pop.setAttribute('role','dialog'); pop.setAttribute('aria-label','Bulk selection');
    pop.innerHTML = `
      <div class="option"><label><input type="radio" name="bulk-mode" value="custom" checked/> Select</label>
      <input type="number" id="bulk-custom-count" min="1" max="${total}" value="${Math.min(50,total)}"/>
      <span class="hint">items from current filters</span></div>
      <div class="option"><label><input type="radio" name="bulk-mode" value="page"/> Select current page</label><span class="hint">${page} visible</span></div>
      <div class="option"><label><input type="radio" name="bulk-mode" value="all"/> Select all</label><span class="hint">${total} items</span></div>
      <div class="actions"><button class="btn-text" id="bulk-cancel">Cancel</button><button class="btn-primary" id="bulk-apply">Apply</button></div>`;
    els.container.appendChild(pop);

    function positionPopover(){ if(!els.selectAll) return; const cb=els.selectAll.getBoundingClientRect(); const ct=els.container.getBoundingClientRect(); pop.style.left=(cb.left-ct.left)+'px'; pop.style.top=(cb.bottom-ct.top+8)+'px'; }
    positionPopover();
    const reposition=()=>positionPopover();
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    if(els.page){ if(els.page._bulkPopoverCleanup) els.page._bulkPopoverCleanup(); els.page._bulkPopoverCleanup=()=>{ window.removeEventListener('resize',reposition); window.removeEventListener('scroll',reposition,true); }; }

    const firstInput = pop.querySelector('#bulk-custom-count') || pop.querySelector('input,button'); if(firstInput && typeof firstInput.focus==='function') firstInput.focus();
    pop.querySelector('#bulk-cancel').addEventListener('click',()=>{ if(els.selectAll) els.selectAll.checked=false; closeBulkPopover(); });
    pop.querySelector('#bulk-apply').addEventListener('click',()=>{
      const m=(pop.querySelector('input[name="bulk-mode"]:checked')||{}).value;
      if(m==='custom'){
        const n=Math.max(1,parseInt(pop.querySelector('#bulk-custom-count').value||'0',10));
        selectIds(state.filtered.slice(0,Math.min(n,total)).map(r=>r.id));
      } else if(m==='page'){
        selectIds(getPageItems().map(r=>r.id));
      } else {
        selectIds(state.filtered.map(r=>r.id));
      }
      closeBulkPopover(); render(); showBulkBar();
    });

    setTimeout(()=>{ function outside(e){ if(!pop.contains(e.target) && e.target!==els.selectAll){ document.removeEventListener('mousedown',outside); if(els.selectAll) els.selectAll.checked = state.selected.size>0; closeBulkPopover(); } } document.addEventListener('mousedown',outside); },0);
  }

  function closeBulkPopover(){ const ex = els.page ? els.page.querySelector('#tasks-bulk-popover') : null; if(ex&&ex.parentNode) ex.parentNode.removeChild(ex); if(els.page && typeof els.page._bulkPopoverCleanup==='function'){ els.page._bulkPopoverCleanup(); delete els.page._bulkPopoverCleanup; } const bd=document.querySelector('.bulk-select-backdrop'); if(bd&&bd.parentNode) bd.parentNode.removeChild(bd); }
  function selectIds(ids){ state.selected = new Set(ids); }

  // Bulk actions bar
  function showBulkBar(){ updateBulkBar(true); }
  function hideBulkBar(){ const bar = els.page ? els.page.querySelector('#tasks-bulk-actions') : document.getElementById('tasks-bulk-actions'); if(bar&&bar.parentNode) bar.parentNode.removeChild(bar); }
  function updateBulkBar(force=false){ if(!els.container) return; const count=state.selected.size; const shouldShow=force || count>0; let container = els.page ? els.page.querySelector('#tasks-bulk-actions') : null; if(!shouldShow){ if(container) container.remove(); return; }
    const html = `
      <div class="bar">
        <button class="action-btn-sm" id="bulk-clear">${svgIcon('clear')}<span>Clear ${count} selected</span></button>
        <span class="spacer"></span>
        <button class="action-btn-sm" id="bulk-complete">${svgIcon('complete')}<span>Complete</span></button>
        <button class="action-btn-sm" id="bulk-assign">${svgIcon('assign')}<span>Assign</span></button>
        <button class="action-btn-sm" id="bulk-edit">${svgIcon('edit')}<span>Edit</span></button>
        <button class="action-btn-sm" id="bulk-export">${svgIcon('export')}<span>Export</span></button>
        <button class="action-btn-sm danger" id="bulk-delete">${svgIcon('delete')}<span>Delete</span></button>
      </div>`;
    if(!container){ container=document.createElement('div'); container.id='tasks-bulk-actions'; container.className='bulk-actions-modal'; els.container.appendChild(container); }
    container.innerHTML = html;
    container.querySelector('#bulk-clear').addEventListener('click',()=>{ state.selected.clear(); render(); hideBulkBar(); if(els.selectAll){ els.selectAll.checked=false; els.selectAll.indeterminate=false; } });
    container.querySelector('#bulk-complete').addEventListener('click',()=>{ state.data.forEach(r=>{ if(state.selected.has(r.id)) r.status='completed'; }); applyFilters(); });
    container.querySelector('#bulk-assign').addEventListener('click',()=>console.log('Bulk assign', Array.from(state.selected)));
    container.querySelector('#bulk-edit').addEventListener('click',()=>console.log('Bulk edit', Array.from(state.selected)));
    container.querySelector('#bulk-export').addEventListener('click',()=>console.log('Bulk export', Array.from(state.selected)));
    container.querySelector('#bulk-delete').addEventListener('click',()=>console.log('Bulk delete', Array.from(state.selected)));
  }

  // Task creation modal
  function openCreateTaskModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.tabIndex = -1;
    overlay.innerHTML = `
      <div class="create-task-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title">
        <div class="header">
          <div class="title-wrap">
            <div class="title" id="create-task-title">Create New Task</div>
            <div class="subtitle">Add a new task to your schedule</div>
          </div>
          <button class="close-btn" aria-label="Close">×</button>
        </div>
        <div class="body">
          <form id="create-task-form">
            <div class="form-group">
              <label for="task-title">Task Title *</label>
              <input type="text" id="task-title" name="title" required placeholder="Enter task title">
            </div>
            
            <div class="form-group">
              <label for="task-type">Task Type *</label>
              <select id="task-type" name="type" required>
                <option value="">Select task type</option>
                <option value="phone-call">Phone Call</option>
                <option value="auto-email">Automatic Email</option>
                <option value="manual-email">Manual Email</option>
                <option value="li-connect">LinkedIn - Send Connection Request</option>
                <option value="li-message">LinkedIn - Send Message</option>
                <option value="li-view-profile">LinkedIn - View Profile</option>
                <option value="li-interact-post">LinkedIn - Interact with Post</option>
                <option value="custom-task">Custom Task</option>
                <option value="follow-up">Follow-up</option>
                <option value="demo">Demo</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="task-priority">Priority *</label>
              <select id="task-priority" name="priority" required>
                <option value="">Select priority</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="task-contact">Contact/Person</label>
              <input type="text" id="task-contact" name="contact" placeholder="Contact name (optional)">
            </div>
            
            <div class="form-group">
              <label for="task-account">Account/Company</label>
              <input type="text" id="task-account" name="account" placeholder="Company name (optional)">
            </div>
            
            <div class="form-group">
              <label for="task-due-time">Time *</label>
              <input type="text" id="task-due-time" name="dueTime" value="10:30 AM" placeholder="10:30 AM" required>
            </div>
            
            <div class="form-group">
              <label for="task-due-date">Due Date *</label>
              <input type="date" id="task-due-date" name="dueDate" required>
            </div>
            
            <div class="form-group">
              <label for="task-notes">Notes</label>
              <textarea id="task-notes" name="notes" rows="3" placeholder="Additional notes (optional)"></textarea>
            </div>
          </form>
        </div>
        <div class="footer">
          <button type="button" class="btn-text" id="cancel-create-task">Cancel</button>
          <button type="button" class="btn-primary" id="save-create-task">Create Task</button>
        </div>
      </div>`;

    const close = () => { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); };
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || (e.target.classList && e.target.classList.contains('close-btn'))) close();
    });
    
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    
    // Set default due date to today
    const dueDateInput = overlay.querySelector('#task-due-date');
    if (dueDateInput) {
      const today = new Date().toISOString().split('T')[0];
      dueDateInput.value = today;
    }
    
    // Add auto-formatting to time input
    const timeInput = overlay.querySelector('#task-due-time');
    if (timeInput) {
      // Clear placeholder on focus
      timeInput.addEventListener('focus', (e) => {
        if (e.target.value === '10:30 AM') {
          e.target.value = '';
        }
      });
      
      timeInput.addEventListener('input', (e) => {
        let value = e.target.value;
        let cursorPos = e.target.selectionStart;
        const originalLength = value.length;
        
        // Only allow digits, colon, A, P, M, and spaces
        value = value.replace(/[^\d:APMapm\s]/g, '');
        
        // Don't auto-format if user is backspacing or deleting
        if (value.length < originalLength) {
          e.target.value = value;
          return;
        }
        
        // Auto-insert colon after 2 digits if no colon exists
        if (/^\d{2}$/.test(value) && !value.includes(':')) {
          value = value + ':';
          cursorPos = 3; // Position cursor after the colon
        }
        
        // Auto-insert colon after 1 digit if user types 3rd digit and no colon
        if (/^\d{3}$/.test(value) && !value.includes(':')) {
          value = value.slice(0, 1) + ':' + value.slice(1);
          cursorPos = 4; // Position cursor after the colon
        }
        
        // Handle 4 digits without colon (e.g., "1030")
        if (/^\d{4}$/.test(value)) {
          value = value.slice(0, 2) + ':' + value.slice(2);
          cursorPos = 5; // Position cursor after the colon
        }
        
        // Clean up AM/PM formatting
        value = value.replace(/\s+/g, ' ').trim();
        
        // If user types AM or PM, ensure proper spacing
        if (/AM|PM/i.test(value)) {
          value = value.replace(/(\d{1,2}:\d{0,2})\s*(AM|PM)/i, '$1 $2');
          value = value.replace(/(\d{1,2}:\d{2})\s*(AM|PM)/i, '$1 $2');
        }
        
        e.target.value = value;
        
        // Restore cursor position
        if (cursorPos !== undefined) {
          setTimeout(() => {
            e.target.setSelectionRange(cursorPos, cursorPos);
          }, 0);
        }
      });
      
      // Handle paste events
      timeInput.addEventListener('paste', (e) => {
        setTimeout(() => {
          timeInput.dispatchEvent(new Event('input'));
        }, 0);
      });
    }
    
    // Event listeners
    overlay.querySelector('#cancel-create-task').addEventListener('click', close);
    overlay.querySelector('#save-create-task').addEventListener('click', async () => {
      const form = overlay.querySelector('#create-task-form');
      const formData = new FormData(form);
      const taskData = Object.fromEntries(formData.entries());
      
      // Validate required fields
      if (!taskData.title || !taskData.type || !taskData.priority || !taskData.dueDate || !taskData.dueTime) {
        alert('Please fill in all required fields');
        return;
      }
      
      await createTask(taskData);
      close();
    });
    
    document.body.appendChild(overlay);
    
    // Focus first input
    setTimeout(() => {
      const firstInput = overlay.querySelector('#task-title');
      if (firstInput) firstInput.focus();
    }, 0);
  }

  async function createTask(taskData) {
    // Generate title using new format if not provided
    let title = taskData.title;
    if (!title && taskData.type && (taskData.contact || taskData.account)) {
      if (window.crm && typeof window.crm.buildTaskTitle === 'function') {
        title = window.crm.buildTaskTitle(taskData.type, taskData.contact || '', taskData.account || '');
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
        const action = typeMap[taskData.type] || 'Task for';
        const name = taskData.contact || taskData.account || 'contact';
        title = `${action} ${name}`;
      }
    }
    
    const newTask = {
      id: 'task_' + Date.now(),
      title: title || 'Task',
      contact: taskData.contact || '',
      account: taskData.account || '',
      type: taskData.type,
      priority: taskData.priority,
      dueDate: taskData.dueDate,
      dueTime: taskData.dueTime,
      status: 'pending',
      notes: taskData.notes || '',
      createdAt: Date.now()
    };
    
    // Add to state
    state.data.unshift(newTask);
    state.filtered = state.data.slice();
    
    // Save to localStorage for persistence
    try {
      const existingTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
      existingTasks.unshift(newTask);
      localStorage.setItem('userTasks', JSON.stringify(existingTasks));
    } catch (e) {
      console.warn('Could not save task to localStorage:', e);
    }
    
    // Save to Firebase
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
    
    // Refresh display
    applyFilters();
    
    // Show success message
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Task created successfully');
    }
    
    // Update Today's Tasks widget
    updateTodaysTasksWidget();
  }

  function updateTodaysTasksWidget() {
    // Update the Today's Tasks widget
    if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
      window.crm.loadTodaysTasks();
    }
    
    // Also trigger a custom event for other components that might need to know about task updates
    window.dispatchEvent(new CustomEvent('tasksUpdated', { 
      detail: { source: 'taskCreation' } 
    }));
  }

  async function init(){ if(!initDomRefs()) return; attachEvents(); injectTasksBulkStyles(); await loadData(); bindUpdates(); }

  // Listen for cross-page task updates and refresh immediately
  function bindUpdates(){
    window.addEventListener('tasksUpdated', async () => {
      // Rebuild from localStorage + Firebase + LinkedIn tasks
      await loadData();
    });
    
    // Listen for background tasks loader events
    document.addEventListener('pc:tasks-loaded', async () => {
      console.log('[Tasks] Background tasks loaded, refreshing data...');
      await loadData();
    });
    
    // Listen for auto-task events from other pages
    window.addEventListener('pc:auto-task', async (event) => {
      const { title, type, contact, account, dueDate, dueTime, notes } = event.detail;
      await createTask({ title, type, priority: 'medium', contact, account, dueDate, dueTime, notes });
    });
  }

  // Expose minimal API for cross-page creation and auto-task events
  try {
    window.Tasks = window.Tasks || {};
    window.Tasks.createTask = createTask;
    window.Tasks.loadMoreTasks = loadMoreTasks;
    window.createTask = window.createTask || createTask;
    window.addEventListener('pc:auto-task', async (e) => {
      try {
        const payload = (e && e.detail) || {};
        await createTask(payload);
      } catch(_) {}
    });
  } catch(_) {}

  // Initialize immediately if DOM already loaded, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
