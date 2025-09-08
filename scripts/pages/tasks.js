'use strict';
(function(){
  const state = {
    data: [],
    filtered: [],
    selected: new Set(),
    currentPage: 1,
    pageSize: 25,
    filterMode: 'all'
  };
  const els = {};

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
      .bulk-select-popover input[type="number"] { width: 120px; height: 32px; padding: 0 10px; background: var(--grey-700); color: var(--text-inverse); border: 1px solid var(--grey-600); border-radius: var(--border-radius-sm); }
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
      .create-task-modal input, .create-task-modal select, .create-task-modal textarea { width: 100%; padding: 10px 12px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-light); border-radius: var(--border-radius-sm); font-size: 0.875rem; }
      .create-task-modal input:focus, .create-task-modal select:focus, .create-task-modal textarea:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.1); }
      .create-task-modal textarea { resize: vertical; min-height: 80px; }
      .create-task-modal .footer { display: flex; justify-content: flex-end; gap: var(--spacing-sm); padding: var(--spacing-lg); border-top: 1px solid var(--border-light); background: var(--bg-subtle); }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

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
        if(label.startsWith('pending')) state.filterMode='pending';
        else if(label.startsWith('completed')) state.filterMode='completed';
        else state.filterMode='all';
        applyFilters();
      });
    });
    // Create task button
    if(els.createTaskBtn){
      els.createTaskBtn.addEventListener('click', openCreateTaskModal);
    }
  }

  function loadData(){
    const types=['call','email','follow-up','demo'];
    const prios=['low','medium','high'];
    const statuses=['pending','completed'];
    const rows=[];
    
    // Add LinkedIn tasks from sequences
    const linkedInTasks = getLinkedInTasksFromSequences();
    rows.push(...linkedInTasks);
    
    // Add mock tasks for demo
    for(let i=1;i<=80;i++){
      const t = types[i%types.length];
      const p = prios[i%prios.length];
      const s = statuses[i%2];
      const due = new Date(Date.now()+ (i%15-7)*86400000).toLocaleDateString();
      rows.push({ id:'task_'+i, title:`Task ${i} for Account ${((i%5)+1)}`, contact:`Contact ${((i%20)+1)}`, account:`Account ${((i%10)+1)}`, type:t, priority:p, dueDate:due, status:s });
    }
    state.data = rows; state.filtered = rows.slice(); render();
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
            'li-connect': 'Send LinkedIn connection request',
            'li-message': 'Send LinkedIn message',
            'li-view-profile': 'View LinkedIn profile', 
            'li-interact-post': 'Interact with LinkedIn post'
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
    if(state.filterMode==='pending') arr = arr.filter(r=>r.status==='pending');
    else if(state.filterMode==='completed') arr = arr.filter(r=>r.status==='completed');
    state.filtered = arr; state.currentPage=1; state.selected.clear();
    render();
  }

  function getPageItems(){ const s=(state.currentPage-1)*state.pageSize; return state.filtered.slice(s,s+state.pageSize); }

  function paginate(){ if(!els.pag) return; const total=state.filtered.length; const pages=Math.max(1,Math.ceil(total/state.pageSize)); state.currentPage=Math.min(state.currentPage,pages); if(els.summary){ const st=total===0?0:(state.currentPage-1)*state.pageSize+1; const en=Math.min(state.currentPage*state.pageSize,total); els.summary.textContent=`${st}-${en} of ${total}`; } let html=''; const btn=(l,d,p)=>`<button class="page-btn" ${d?'disabled':''} data-page="${p}">${l}</button>`; html+=btn('Prev',state.currentPage===1,state.currentPage-1); for(let p=1;p<=pages;p++){ html+=`<button class="page-btn ${p===state.currentPage?'active':''}" data-page="${p}">${p}</button>`;} html+=btn('Next',state.currentPage===pages,state.currentPage+1); els.pag.innerHTML=html; els.pag.querySelectorAll('.page-btn').forEach(b=>b.addEventListener('click',()=>{ const n=parseInt(b.getAttribute('data-page')||'1',10); if(!isNaN(n)&&n>=1&&n<=pages){ state.currentPage=n; render(); }})); }

  function render(){ if(!els.tbody) return; const rows=getPageItems(); els.tbody.innerHTML = rows.map(r=>rowHtml(r)).join('');
    // Row events
    els.tbody.querySelectorAll('input.row-select').forEach(cb=>cb.addEventListener('change',()=>{ const id=cb.getAttribute('data-id'); if(cb.checked) state.selected.add(id); else state.selected.delete(id); updateBulkBar(); }));
    els.tbody.querySelectorAll('button.btn-success').forEach(btn=>btn.addEventListener('click',()=>{ const id = btn.getAttribute('data-id'); const rec = state.data.find(x=>x.id===id); if(rec){ rec.status='completed'; 
      // Update localStorage for user tasks
      try {
        const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        const userTaskIndex = userTasks.findIndex(task => task.id === id);
        if (userTaskIndex !== -1) {
          userTasks[userTaskIndex].status = 'completed';
          localStorage.setItem('userTasks', JSON.stringify(userTasks));
        }
      } catch (e) {
        console.warn('Could not update task status in localStorage:', e);
      }
      // Update Today's Tasks widget
      updateTodaysTasksWidget();
    } btn.textContent='Completed'; btn.disabled=true; btn.style.opacity='0.6'; render(); }));
    // Header select state
    if(els.selectAll){ const pageIds=new Set(rows.map(r=>r.id)); const allSelected=[...pageIds].every(id=>state.selected.has(id)); els.selectAll.checked = allSelected && rows.length>0; }
    paginate(); updateBulkBar(); }

  function rowHtml(r){
    const id = escapeHtml(r.id);
    const title = escapeHtml(r.title);
    const name = escapeHtml(r.contact || '');
    const account = escapeHtml(r.account || '');
    const type = escapeHtml(r.type || '');
    const pr = escapeHtml(r.priority || '');
    const due = escapeHtml(r.dueDate || '');
    const status = escapeHtml(r.status || '');
    return `
      <tr>
        <td class="col-select"><input type="checkbox" class="row-select" data-id="${id}" ${state.selected.has(r.id)?'checked':''}></td>
        <td>
          <div class="task-info"><div class="task-title">${title}</div><div class="task-subtitle">${name} • ${account}</div></div>
        </td>
        <td><span class="type-badge ${type}">${type}</span></td>
        <td><span class="priority-badge ${pr}">${pr}</span></td>
        <td>${due}</td>
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
    
    // Event listeners
    overlay.querySelector('#cancel-create-task').addEventListener('click', close);
    overlay.querySelector('#save-create-task').addEventListener('click', () => {
      const form = overlay.querySelector('#create-task-form');
      const formData = new FormData(form);
      const taskData = Object.fromEntries(formData.entries());
      
      // Validate required fields
      if (!taskData.title || !taskData.type || !taskData.priority || !taskData.dueDate) {
        alert('Please fill in all required fields');
        return;
      }
      
      createTask(taskData);
      close();
    });
    
    document.body.appendChild(overlay);
    
    // Focus first input
    setTimeout(() => {
      const firstInput = overlay.querySelector('#task-title');
      if (firstInput) firstInput.focus();
    }, 0);
  }

  function createTask(taskData) {
    const newTask = {
      id: 'task_' + Date.now(),
      title: taskData.title,
      contact: taskData.contact || '',
      account: taskData.account || '',
      type: taskData.type,
      priority: taskData.priority,
      dueDate: taskData.dueDate,
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

  function init(){ if(!initDomRefs()) return; attachEvents(); injectTasksBulkStyles(); loadData(); loadUserTasks(); }
  
  function loadUserTasks() {
    try {
      const userTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
      if (userTasks.length > 0) {
        // Add user tasks to the beginning of the data array
        state.data = [...userTasks, ...state.data];
        state.filtered = state.data.slice();
        render();
      }
    } catch (e) {
      console.warn('Could not load user tasks:', e);
    }
  }
  
  document.addEventListener('DOMContentLoaded', init);
})();
