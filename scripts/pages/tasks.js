'use strict';
(function () {
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
    switch (p) {
      case 'low': return '#495057';
      case 'medium': return 'rgba(255, 193, 7, 0.15)';
      case 'high': return 'rgba(220, 53, 69, 0.15)';
      case 'sequence': return 'rgba(111, 66, 193, 0.18)';
      default: return '#495057';
    }
  }

  function getPriorityColor(priority) {
    const p = (priority || '').toLowerCase().trim();
    switch (p) {
      case 'low': return '#e9ecef';
      case 'medium': return '#ffc107';
      case 'high': return '#dc3545';
      case 'sequence': return '#ffffff';
      default: return '#e9ecef';
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
        
        // Only re-render if we actually have data to show
        if (state.data && state.data.length > 0) {
          render();
        }
        
        if (typeof d.scroll === 'number') {
          setTimeout(() => { try { window.scrollTo(0, d.scroll); } catch (_) { } }, 80);
        }
      } catch (e) { console.warn('[Tasks] Restore failed', e); }
    });
    document._tasksRestoreBound = true;
  }

  // Minimal inline icons
  function svgIcon(name) {
    switch (name) {
      case 'clear': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
      case 'complete': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z"/></svg>';
      case 'assign': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>';
      case 'edit': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      case 'export': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      case 'delete': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      default: return '';
    }
  }

  function injectTasksBulkStyles() {
    const id = 'tasks-bulk-styles'; if (document.getElementById(id)) return;
    const style = document.createElement('style'); style.id = id; style.type = 'text/css';
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
      
      /* Status badge styles */
      .status-badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: 500; }
      .status-badge.pending { background: var(--grey-600); color: var(--text-primary); }
      .status-badge.completed { background: var(--grey-700); color: var(--text-inverse); }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

  // Parse a date string in MM/DD/YYYY or YYYY-MM-DD into a Date at local midnight
  function parseDateStrict(dateStr) {
    if (!dateStr) return null;
    try {
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/').map(n => parseInt(n, 10));
        if (parts.length === 3 && !parts.some(isNaN)) return new Date(parts[2], parts[0] - 1, parts[1]);
      } else if (dateStr.includes('-')) {
        const parts = dateStr.split('-').map(n => parseInt(n, 10));
        if (parts.length === 3 && !parts.some(isNaN)) return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      const d = new Date(dateStr);
      if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch (_) { /* noop */ }
    return null;
  }

  // Parse a time like "10:30 AM" into minutes since midnight; NaN if invalid/missing
  function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return NaN;
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return NaN;
    let hour = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (hour === 12) hour = 0; // 12AM -> 0, 12PM handled below
    if (ap === 'PM') hour += 12;
    return hour * 60 + min;
  }

  // Sort tasks chronologically by due date then due time
  function sortTasksChronologically(arr) {
    return arr.slice().sort((a, b) => {
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
  }

  function initDomRefs() {
    els.page = document.getElementById('tasks-page'); if (!els.page) return false;
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

  function attachEvents() {
    if (els.selectAll) {
      els.selectAll.addEventListener('change', () => {
        if (els.selectAll.checked) openBulkSelectModal(); else { state.selected.clear(); render(); closeBulkSelectModal(); hideBulkBar(); }
      });
    }
    // Handle Tasks filter tabs locally and silence global handler in main.js
    els.filterTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        els.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const label = (tab.textContent || '').trim().toLowerCase();
        // New filter sections: All your tasks, Phone Tasks, Email Tasks, LinkedIn Tasks, Overdue Tasks
        if (label.includes('phone')) state.filterMode = 'phone';
        else if (label.includes('email')) state.filterMode = 'email';
        else if (label.includes('linkedin')) state.filterMode = 'linkedin';
        else if (label.includes('overdue')) state.filterMode = 'overdue';
        else state.filterMode = 'all';
        applyFilters();
      });
    });
    // Create task button
    if (els.createTaskBtn) {
      els.createTaskBtn.addEventListener('click', openCreateTaskModal);
    }
  }

  function getUserTasksKey() {
    try {
      const email = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') ? window.DataManager.getCurrentUserEmail() : (window.currentUserEmail || '').toLowerCase();
      return email ? `userTasks:${email}` : 'userTasks';
    } catch (_) { return 'userTasks'; }
  }

  async function loadData() {

    // Build from real sources: BackgroundTasksLoader + localStorage tasks + LinkedIn sequence tasks
    const linkedInTasks = await getLinkedInTasksFromSequences();


    let userTasks = [];
    let firebaseTasks = [];

    // Helper to get user email and role
    const getUserEmail = () => {
      try {
        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
          return window.DataManager.getCurrentUserEmail();
        }
        return (window.currentUserEmail || '').toLowerCase();
      } catch (_) {
        return (window.currentUserEmail || '').toLowerCase();
      }
    };
    const isAdmin = () => {
      try {
        if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
          return window.DataManager.isCurrentUserAdmin();
        }
        return window.currentUserRole === 'admin';
      } catch (_) {
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
        const beforeCount = userTasks.length;
        userTasks = userTasks.filter(t => {
          if (!t) return false;
          const ownerId = (t.ownerId || '').toLowerCase();
          const assignedTo = (t.assignedTo || '').toLowerCase();
          const createdBy = (t.createdBy || '').toLowerCase();
          return ownerId === email || assignedTo === email || createdBy === email;
        });
      }
    } catch (_) { userTasks = []; }

    // Load from BackgroundTasksLoader (cache-first)
    try {
      if (window.BackgroundTasksLoader) {
        // CRITICAL FIX: Force reload BackgroundTasksLoader to ensure we have latest data
        // This matches what Today's Tasks widget does to get all 236 tasks
        // console.log('[Tasks] Force reloading BackgroundTasksLoader to get complete task list...');
        await window.BackgroundTasksLoader.forceReload();
        firebaseTasks = window.BackgroundTasksLoader.getTasksData() || [];
        state.hasMore = window.BackgroundTasksLoader.hasMore();


        // console.log('[Tasks] Loaded', firebaseTasks.length, 'tasks from BackgroundTasksLoader after force reload');
      } else {
        // Fallback to direct Firestore query if background loader not available (with ownership filters)
        if (window.firebaseDB) {
          if (!isAdmin()) {
            // Non-admin: use ownership-aware query
            const email = getUserEmail();
            if (email && window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
              firebaseTasks = await window.DataManager.queryWithOwnership('tasks');
              firebaseTasks = firebaseTasks.slice(0, 100); // Limit for fallback
            } else if (email) {
              // Fallback: two separate queries
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('tasks').where('ownerId', '==', email).orderBy('timestamp', 'desc').limit(100).get(),
                window.firebaseDB.collection('tasks').where('assignedTo', '==', email).orderBy('timestamp', 'desc').limit(100).get()
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
      }
    } catch (error) {
      console.warn('Could not load tasks from BackgroundTasksLoader:', error);
    }

    // // console.log(`[Tasks] Loaded ${userTasks.length} tasks from localStorage, ${firebaseTasks.length} tasks from Firebase`);

    // Merge all tasks - CRITICAL FIX: Always prefer Firebase as the source of truth
    // Firebase tasks override any stale local copies with the same ID
    const allTasksMap = new Map();
    firebaseTasks.forEach(t => { if (t && t.id) allTasksMap.set(t.id, t); });


    // CRITICAL FIX: For admins, include all localStorage tasks since they should see everything
    // For non-admins, only include recent tasks (< 1 hour) to avoid resurrecting deleted tasks
    const nowMs = Date.now();
    const cutoffMs = isAdmin() ? 0 : 3600000; // 0ms for admins (no cutoff), 1 hour for non-admins
    let localTasksAdded = 0;
    let localTasksSkipped = 0;
    userTasks.forEach(t => {
      if (t && t.id && !allTasksMap.has(t.id)) {
        const created = t.createdAt || (t.timestamp && typeof t.timestamp.toMillis === 'function' ? t.timestamp.toMillis() : t.timestamp) || 0;
        if (cutoffMs === 0 || nowMs - created < cutoffMs) {
          allTasksMap.set(t.id, t);
          localTasksAdded++;
        } else {
          localTasksSkipped++;
        }
      }
    });

    const allTasks = Array.from(allTasksMap.values());

    // Add LinkedIn tasks that aren't duplicates
    const nonDupLinkedIn = linkedInTasks.filter(li => !allTasks.some(t => t.id === li.id));

    const rows = [...allTasks, ...nonDupLinkedIn];

    state.data = rows;
    state.filtered = sortTasksChronologically(rows);
    // console.log(`[Tasks] Total tasks loaded: ${rows.length}`);
    render();

    // CRITICAL FIX: Notify Today's Tasks widget and other components that tasks have been updated
    try {
      window.dispatchEvent(new CustomEvent('tasksUpdated', {
        detail: {
          source: 'tasksPageLoad',
          taskCount: rows.length,
          filteredCount: state.filtered.length
        }
      }));
    } catch (e) {
      console.warn('[Tasks] Failed to dispatch tasksUpdated event:', e);
    }
  }

  // Load more tasks from background loader
  async function loadMoreTasks() {
    if (!state.hasMore || !window.BackgroundTasksLoader) {
      return;
    }

    try {
      // console.log('[Tasks] Loading more tasks...');
      const result = await window.BackgroundTasksLoader.loadMore();

      if (result.loaded > 0) {
        // Reload data to get updated tasks
        await loadData();
        // console.log('[Tasks] Loaded', result.loaded, 'more tasks');
      } else {
        state.hasMore = false;
      }
    } catch (error) {
      console.error('[Tasks] Failed to load more tasks:', error);
    }
  }

  async function getLinkedInTasksFromSequences() {
    // FIX: Instead of querying Firebase again (causing duplication), filter the existing firebaseTasks
    // This eliminates the duplicate loading issue where LinkedIn tasks were loaded twice
    const linkedInTasks = [];

    // Get current user email for ownership
    const getUserEmail = () => {
      try {
        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
          return window.DataManager.getCurrentUserEmail().toLowerCase();
        }
        return (window.currentUserEmail || '').toLowerCase();
      } catch (_) {
        return (window.currentUserEmail || '').toLowerCase();
      }
    };
    const userEmail = getUserEmail();

    try {
      // CRITICAL FIX: Filter existing Firebase tasks for LinkedIn sequence tasks instead of querying again
      // This prevents duplication since firebaseTasks already contains all sequence tasks from BackgroundTasksLoader
      // Filter from BackgroundTasksLoader's in-memory tasks (no extra Firestore query).
      const allFirebaseTasks = window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.getTasksData === 'function'
        ? (window.BackgroundTasksLoader.getTasksData() || [])
        : [];
      if (!Array.isArray(allFirebaseTasks) || allFirebaseTasks.length === 0) {
        console.warn('[Tasks] BackgroundTasksLoader not ready, skipping LinkedIn sequence filtering');
        return linkedInTasks;
      }


      // Filter by ownership and task type
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch (_) {
          return window.currentUserRole === 'admin';
        }
      };

      // Log all sequence task types found in the database
      const allTaskTypes = [];
      allFirebaseTasks.forEach(task => {
        if (task && task.sequenceId) {
          const taskType = String(task.type || '').toLowerCase();
          if (!allTaskTypes.includes(taskType)) {
            allTaskTypes.push(taskType);
          }
        }
      });


      allFirebaseTasks.forEach(task => {
        if (!task || !task.sequenceId) return; // Skip non-sequence tasks

        // Only include LinkedIn task types
        const taskType = String(task.type || '').toLowerCase();
        if (!taskType.includes('linkedin') && !taskType.includes('li-')) {
          return; // Skip non-LinkedIn tasks
        }

        // Filter by ownership (non-admin users)
        if (!isAdmin()) {
          const ownerId = (task.ownerId || '').toLowerCase();
          const assignedTo = (task.assignedTo || '').toLowerCase();
          const createdBy = (task.createdBy || '').toLowerCase();
          if (ownerId !== userEmail && assignedTo !== userEmail && createdBy !== userEmail) {
            return; // Skip if user doesn't own this task
          }
        }

        // Only include pending tasks (completed tasks shouldn't show)
        if (task.status === 'completed') {
          return;
        }

        // Task is already in the correct format from Firebase
        linkedInTasks.push(task);
      });


      // console.log('[Tasks] Filtered', linkedInTasks.length, 'LinkedIn sequence tasks from existing Firebase tasks');
    } catch (error) {
      console.error('[Tasks] Error filtering LinkedIn sequence tasks:', error);
    }

    return linkedInTasks;
  }

  function applyFilters() {
    let arr = state.data.slice();
    const today = new Date();
    const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (state.filterMode === 'phone') {
      arr = arr.filter(r => /phone|call/i.test(String(r.type || '')));
    } else if (state.filterMode === 'email') {
      arr = arr.filter(r => /email/i.test(String(r.type || '')));
    } else if (state.filterMode === 'linkedin') {
      arr = arr.filter(r => /linkedin|li-/i.test(String(r.type || '')));
    } else if (state.filterMode === 'overdue') {
      arr = arr.filter(r => {
        if ((r.status || 'pending') === 'completed') return false;
        const d = parseDateStrict(r.dueDate);
        if (!d) return false;
        return d.getTime() < localMidnight.getTime();
      });
    }
    state.filtered = sortTasksChronologically(arr);
    state.currentPage = 1; state.selected.clear();
    render();
  }

  function getPageItems() { const s = (state.currentPage - 1) * state.pageSize; return state.filtered.slice(s, s + state.pageSize); }

  function getTotalPages() { return Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); }

  function renderPagination() {
    if (!els.pag) return;
    const totalPages = getTotalPages();
    const current = Math.min(state.currentPage, totalPages);
    state.currentPage = current;
    const total = state.filtered.length;
    const start = total === 0 ? 0 : (current - 1) * state.pageSize + 1;
    const end = total === 0 ? 0 : Math.min(total, current * state.pageSize);

    // Use unified pagination component
    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(current, totalPages, (page) => {
        state.currentPage = page;
        render();
        // Scroll to top after page change via unified paginator
        try {
          requestAnimationFrame(() => {
            const scroller = (els.page && els.page.querySelector) ? els.page.querySelector('.table-scroll') : null;
            if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0, behavior: 'auto' });
            else if (scroller) scroller.scrollTop = 0;
            const main = document.getElementById('main-content');
            if (main && typeof main.scrollTo === 'function') main.scrollTo({ top: 0, behavior: 'auto' });
            const contentArea = document.querySelector('.content-area');
            if (contentArea && typeof contentArea.scrollTo === 'function') contentArea.scrollTo({ top: 0, behavior: 'auto' });
            window.scrollTo(0, 0);
          });
        } catch (_) { /* noop */ }
      }, els.pag.id);
    } else {
      // Fallback to simple pagination if unified component not available
      let html = '';
      const btn = (l, d, p) => `<button class="pagination-arrow" ${d ? 'disabled' : ''} data-page="${p}">${l}</button>`;
      html += btn('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>', current <= 1, current - 1);
      html += `<div class="pagination-current">${current}</div>`;
      html += btn('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>', current >= totalPages, current + 1);
      
      els.pag.innerHTML = `<div class="unified-pagination">${html}</div>`;
      els.pag.querySelectorAll('button[data-page]').forEach(b => b.addEventListener('click', () => {
        const n = parseInt(b.getAttribute('data-page') || '1', 10);
        if (!isNaN(n) && n >= 1 && n <= totalPages) {
          state.currentPage = n;
          render();
        }
      }));
    }

    if (els.summary) {
      els.summary.textContent = `Showing ${start}\u2013${end} of ${total} tasks`;
    }
  }

  function render() {
    if (!els.tbody) return; state.filtered = sortTasksChronologically(state.filtered); const rows = getPageItems(); els.tbody.innerHTML = rows.map(r => rowHtml(r)).join('');
    // Row events
    els.tbody.querySelectorAll('input.row-select').forEach(cb => cb.addEventListener('change', () => { const id = cb.getAttribute('data-id'); if (cb.checked) state.selected.add(id); else state.selected.delete(id); updateBulkBar(); }));

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
          } catch (_) { }
          window.TaskDetail.open(taskId, 'tasks');
        }
      });
    });

    els.tbody.querySelectorAll('button.btn-success').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id'); 
      const recIdx = state.data.findIndex(x => x.id === id);

      // CRITICAL FIX: Handle ghost tasks (visible in UI but not in state)
      if (recIdx === -1) {
        console.warn('[Tasks] Ghost task detected, syncing UI...', id);
        applyFilters();
        return;
      }

      if (recIdx !== -1) {
        // Get the task before removing it (for sequence processing)
        const task = state.data[recIdx];

        // Remove from state immediately
        const [removed] = state.data.splice(recIdx, 1);
        
        // CRITICAL FIX: Use applyFilters to respect current filter mode and update UI
        applyFilters();
        // Remove from localStorage immediately (namespaced)
        try {
          const key = getUserTasksKey();
          const current = JSON.parse(localStorage.getItem(key) || '[]');
          const filtered = current.filter(t => t.id !== id);
          localStorage.setItem(key, JSON.stringify(filtered));
        } catch (e) { console.warn('Could not remove task from localStorage:', e); }
        // If this is a sequence task, trigger next step creation
        if (task && task.isSequenceTask) {
          try {
            // console.log('[Tasks] Completed sequence task, creating next step...', task.id);
            const baseUrl = getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/complete-sequence-task`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: task.id })
            });
            const result = await response.json();

            if (result.success) {
              // console.log('[Tasks] Next step created:', result.nextStepType);
              if (result.nextStepType === 'task') {
                // Force refresh BackgroundTasksLoader so the new task is available immediately
                if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
                  try {
                    // console.log('[Tasks] Forcing BackgroundTasksLoader refresh for new sequence task...');
                    await window.BackgroundTasksLoader.forceReload();
                  } catch (reloadError) {
                    console.warn('[Tasks] Failed to force reload BackgroundTasksLoader:', reloadError);
                  }
                }
                await loadData(); // Reload to show new task
              }
              // If next step is an email, user can see it in Emails page
            } else {
              console.warn('[Tasks] Failed to create next step:', result.message || result.error);
            }
          } catch (error) {
            console.error('[Tasks] Error creating next sequence step:', error);
            // Don't block - task was already completed
          }
        }

        // Remove from Firebase (best-effort)
        try {
          const db = window.firebaseDB;
          if (db) {
            // CRITICAL FIX: Try both methods - direct document ID and query by id field
            // Tasks created from bookings may not have an id field in the document data
            let taskDocs = [];
            
            // Method 1: Try direct document ID (for tasks without id field)
            try {
              const directDoc = await db.collection('tasks').doc(id).get();
              if (directDoc.exists) {
                taskDocs.push(directDoc);
              }
            } catch (directError) {
              console.warn('[Tasks] Direct document lookup failed, trying query method:', directError);
            }

            // Method 2: If direct lookup found nothing, try querying by id field (for tasks with id field in data)
            if (taskDocs.length === 0) {
              const snap = await db.collection('tasks').where('id', '==', id).limit(5).get();
              snap.forEach(doc => taskDocs.push(doc));
            }

            // Delete all found documents
            if (taskDocs.length > 0) {
              const batch = db.batch();
              taskDocs.forEach(doc => batch.delete(doc.ref));
              await batch.commit();
              // console.log(`[Tasks] Successfully deleted ${taskDocs.length} task document(s) from Firestore:`, id);
            } else {
              console.warn('[Tasks] Task not found in Firestore for deletion:', id);
            }
          }
        } catch (e) { 
          console.error('[Tasks] Could not remove task from Firebase:', e); 
        }

        // CRITICAL FIX: Notify global loader and cache about deletion
        try {
          document.dispatchEvent(new CustomEvent('pc:task-deleted', {
            detail: { taskId: id }
          }));
        } catch (_) { }

        // Update Today's Tasks widget and table
        updateTodaysTasksWidget();
      }
      btn.textContent = 'Completed'; btn.disabled = true; btn.style.opacity = '0.6'; render();
    }));
    // Header select state
    if (els.selectAll) { const pageIds = new Set(rows.map(r => r.id)); const allSelected = [...pageIds].every(id => state.selected.has(id)); els.selectAll.checked = allSelected && rows.length > 0; }
    renderPagination(); updateBulkBar();
  }

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

  function rowHtml(r) {
    const id = escapeHtml(r.id);
    const title = escapeHtml(updateTaskTitle(r));
    const name = escapeHtml(r.contact || '');
    const account = escapeHtml(r.account || '');
    const type = escapeHtml(r.type || '');
    const isSequenceTask = !!r.isSequenceTask || !!r.isLinkedInTask;
    const priorityValue = isSequenceTask ? 'sequence' : (r.priority || '');
    const pr = escapeHtml(priorityValue);
    const due = escapeHtml(r.dueDate || '');
    const time = escapeHtml(r.dueTime || '');
    const status = escapeHtml(r.status || '');
    return `
      <tr>
        <td class="col-select"><input type="checkbox" class="row-select" data-id="${id}" ${state.selected.has(r.id) ? 'checked' : ''}></td>
        <td>
          <div class="task-info">
            <div class="task-title">
              <a href="#" class="task-link" data-task-id="${id}" style="color: var(--grey-400); text-decoration: none; font-weight: 400; transition: var(--transition-fast);" onmouseover="this.style.color='var(--text-inverse)'" onmouseout="this.style.color='var(--grey-400)'">${title}</a>
            </div>
            <div class="task-subtitle">${name} • ${account}</div>
          </div>
        </td>
        <td style="text-align: center;"><span class="type-badge ${type}">${type}</span></td>
        <td style="text-align: center;"><span class="priority-badge ${pr}" style="background: ${getPriorityBackground(pr)}; color: ${getPriorityColor(pr)};">${pr}</span></td>
        <td>${due}</td>
        <td>${time}</td>
        <td style="text-align: center;">${status}</td>
        <td><div class="action-buttons"><button class="btn-success" data-id="${id}">${status === 'completed' ? 'Completed' : 'Complete'}</button><button class="btn-text">Edit</button></div></td>
      </tr>`;
  }

  // Bulk selection modal (using pc-modal style)
  function openBulkSelectModal() {
    if (!els.container) return;
    closeBulkSelectModal();

    const total = state.filtered.length;
    const page = getPageItems().length;

    const modal = document.createElement('div');
    modal.id = 'tasks-bulk-select-modal';
    modal.className = 'pc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tasks-bulk-modal-title');

    modal.innerHTML = `
      <div class="pc-modal__backdrop"></div>
      <div class="pc-modal__dialog">
        <div class="pc-modal__form">
          <div class="pc-modal__header">
            <h3 class="card-title" id="tasks-bulk-modal-title">Select Tasks</h3>
            <button class="pc-modal__close" aria-label="Close" type="button">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="pc-modal__body">
            <div class="option" style="display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary);">
                <input type="radio" name="bulk-mode" value="custom" checked style="accent-color: var(--orange-subtle);">
                <span>Select</span>
              </label>
              <input type="number" id="bulk-custom-count" min="1" max="${total}" value="${Math.min(50, total)}" style="width: 120px; height: 40px; padding: 0 14px; background: var(--bg-item); color: var(--text-primary); border: 2px solid var(--border-light); border-radius: 8px; transition: all 0.3s ease;">
              <span class="hint" style="color: var(--text-secondary); font-size: 0.85rem;">items from current filters</span>
            </div>
            <div class="option" style="display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary);">
                <input type="radio" name="bulk-mode" value="page" style="accent-color: var(--orange-subtle);">
                <span>Select current page</span>
              </label>
              <span class="hint" style="color: var(--text-secondary); font-size: 0.85rem;">${page} visible</span>
            </div>
            <div class="option" style="display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: 0;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary);">
                <input type="radio" name="bulk-mode" value="all" style="accent-color: var(--orange-subtle);">
                <span>Select all</span>
              </label>
              <span class="hint" style="color: var(--text-secondary); font-size: 0.85rem;">${total} items</span>
            </div>
          </div>
          <div class="pc-modal__footer">
            <button type="button" class="btn-text" id="bulk-cancel">Cancel</button>
            <button type="button" class="btn-primary" id="bulk-apply">Apply</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Show modal with animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // Enable/disable custom count input
    const customInput = modal.querySelector('#bulk-custom-count');
    const radios = Array.from(modal.querySelectorAll('input[name="bulk-mode"]'));
    function updateCustomEnabled() {
      const isCustom = !!modal.querySelector('input[name="bulk-mode"][value="custom"]:checked');
      if (customInput) {
        customInput.disabled = !isCustom;
        if (isCustom) customInput.removeAttribute('aria-disabled');
        else customInput.setAttribute('aria-disabled', 'true');
      }
    }
    radios.forEach((r) => r.addEventListener('change', () => {
      updateCustomEnabled();
      if (r.value === 'custom' && customInput && !customInput.disabled) customInput.focus();
    }));
    updateCustomEnabled();

    // Event handlers
    const close = () => {
      modal.classList.remove('show');
      setTimeout(() => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }, 300);
      if (els.selectAll) els.selectAll.checked = state.selected.size > 0;
    };

    modal.querySelector('.pc-modal__backdrop').addEventListener('click', close);
    modal.querySelector('.pc-modal__close').addEventListener('click', close);
    modal.querySelector('#bulk-cancel').addEventListener('click', () => {
      if (els.selectAll) els.selectAll.checked = false;
      close();
    });

    modal.querySelector('#bulk-apply').addEventListener('click', () => {
      const mode = (modal.querySelector('input[name="bulk-mode"]:checked') || {}).value;
      let selectedIds = [];
      if (mode === 'custom') {
        const n = Math.max(1, parseInt(modal.querySelector('#bulk-custom-count').value || '0', 10));
        selectedIds = state.filtered.slice(0, Math.min(n, total)).map(r => r.id);
      } else if (mode === 'page') {
        selectedIds = getPageItems().map(r => r.id);
      } else {
        selectedIds = state.filtered.map(r => r.id);
      }
      selectIds(selectedIds);
      close();
      render();
      updateBulkBar();
      showBulkBar();
    });

    // Keyboard support
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    modal._keydownHandler = handleKeyDown;

    // Focus first input
    setTimeout(() => {
      const firstInput = customInput || modal.querySelector('input, button');
      if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
    }, 100);
  }

  function closeBulkSelectModal() {
    const modal = document.getElementById('tasks-bulk-select-modal');
    if (modal) {
      if (modal._keydownHandler) {
        document.removeEventListener('keydown', modal._keydownHandler);
        delete modal._keydownHandler;
      }
      modal.classList.remove('show');
      setTimeout(() => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }, 300);
    }
  }
  function selectIds(ids) { state.selected = new Set(ids); }

  // Check if user is admin
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

  // Bulk actions bar
  function showBulkBar() {
    updateBulkBar(true);
  }

  function hideBulkBar() {
    const bar = els.page ? els.page.querySelector('#tasks-bulk-actions') : document.getElementById('tasks-bulk-actions');
    if (bar && bar.parentNode) {
      bar.classList.remove('--show');
      setTimeout(() => {
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      }, 200);
    }
  }

  async function deleteSelectedTasks() {
    const ids = Array.from(state.selected || []);
    if (!ids.length) return;

    if (!confirm(`Are you sure you want to delete ${ids.length} task(s)?`)) return;

    // Store current page before deletion to preserve pagination
    const currentPageBeforeDeletion = state.currentPage;

    // Show progress toast
    const progressToast = window.crm?.showProgressToast ?
      window.crm.showProgressToast(`Deleting ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}...`, ids.length, 0) : null;

    let failed = 0;
    let completed = 0;

    try {
      // Process deletions sequentially to show progress
      for (const id of ids) {
        try {
          // Remove from localStorage
          try {
            const key = getUserTasksKey();
            const current = JSON.parse(localStorage.getItem(key) || '[]');
            const filtered = current.filter(t => t.id !== id);
            localStorage.setItem(key, JSON.stringify(filtered));
          } catch (e) {
            console.warn('Could not remove task from localStorage:', e);
          }

          // Remove from Firebase
          if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
            const db = window.firebaseDB;
            const snap = await db.collection('tasks').where('id', '==', id).limit(5).get();
            if (!snap.empty) {
              const batch = db.batch();
              snap.forEach(doc => batch.delete(doc.ref));
              await batch.commit();
            }
          }

          // CRITICAL FIX: Notify global loader and cache about deletion
          try {
            document.dispatchEvent(new CustomEvent('pc:task-deleted', {
              detail: { taskId: id }
            }));
          } catch (_) { }

          // Remove from local state
          const recIdx = state.data.findIndex(x => x.id === id);
          if (recIdx !== -1) {
            state.data.splice(recIdx, 1);
          }

          completed++;
          if (progressToast && typeof progressToast.update === 'function') {
            progressToast.update(completed, ids.length);
          }
        } catch (e) {
          failed++;
          completed++;
          console.warn('Delete failed for task id', id, e);
          if (progressToast && typeof progressToast.update === 'function') {
            progressToast.update(completed, ids.length);
          }
        }

        // Small delay to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (err) {
      console.warn('Bulk delete error', err);
      if (progressToast && typeof progressToast.error === 'function') {
        progressToast.error('Delete operation failed');
      }
    } finally {
      // Update filtered data
      const idSet = new Set(ids);
      state.filtered = Array.isArray(state.filtered) ? state.filtered.filter(t => !idSet.has(t.id)) : [];

      // Calculate new total pages after deletion
      const newTotalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));

      // Only adjust page if current page is beyond the new total
      if (currentPageBeforeDeletion > newTotalPages) {
        state.currentPage = newTotalPages;
      }

      state.selected.clear();
      applyFilters();
      updateTodaysTasksWidget();
      hideBulkBar();
      if (els.selectAll) {
        els.selectAll.checked = false;
        els.selectAll.indeterminate = false;
      }

      const successCount = Math.max(0, ids.length - failed);

      if (progressToast) {
        if (failed === 0) {
          progressToast.complete(`Successfully deleted ${successCount} ${successCount === 1 ? 'task' : 'tasks'}`);
        } else if (successCount > 0) {
          progressToast.complete(`Deleted ${successCount} of ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}`);
        } else {
          progressToast.error(`Failed to delete all ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}`);
        }
      } else {
        // Fallback to regular toasts if progress toast not available
        if (successCount > 0) {
          window.crm?.showToast && window.crm.showToast(`Deleted ${successCount} ${successCount === 1 ? 'task' : 'tasks'}`);
        }
        if (failed > 0) {
          window.crm?.showToast && window.crm.showToast(`Failed to delete ${failed} ${failed === 1 ? 'task' : 'tasks'}`, 'error');
        }
      }
    }
  }

  function updateBulkBar(force = false) {
    if (!els.container) return;
    const count = state.selected.size;
    const shouldShow = force || count > 0;
    let container = els.page ? els.page.querySelector('#tasks-bulk-actions') : null;
    if (!shouldShow) {
      if (container) {
        container.classList.remove('--show');
        setTimeout(() => {
          if (container.parentNode) container.parentNode.removeChild(container);
        }, 200);
      }
      return;
    }

    const adminOnly = isAdmin();
    const html = `
      <div class="bar">
        <button class="action-btn-sm" id="bulk-clear">${svgIcon('clear')}<span>Clear ${count} selected</span></button>
        <span class="spacer"></span>
        <button class="action-btn-sm" id="bulk-complete">${svgIcon('complete')}<span>Complete Task</span></button>
        ${adminOnly ? `<button class="action-btn-sm" id="bulk-assign">${svgIcon('assign')}<span>Assign</span></button>` : ''}
        <button class="action-btn-sm" id="bulk-export">${svgIcon('export')}<span>Export</span></button>
        <button class="action-btn-sm danger" id="bulk-delete">${svgIcon('delete')}<span>Delete</span></button>
      </div>`;

    if (!container) {
      container = document.createElement('div');
      container.id = 'tasks-bulk-actions';
      container.className = 'bulk-actions-modal';
      els.container.appendChild(container);
    }
    container.innerHTML = html;

    // Show with animation
    requestAnimationFrame(() => {
      container.classList.add('--show');
    });

    // Event handlers
    container.querySelector('#bulk-clear').addEventListener('click', () => {
      state.selected.clear();
      render();
      hideBulkBar();
      if (els.selectAll) {
        els.selectAll.checked = false;
        els.selectAll.indeterminate = false;
      }
    });

    container.querySelector('#bulk-complete').addEventListener('click', async () => {
      const selectedIds = Array.from(state.selected);
      let needsReloadAfterSequence = false;

      for (const id of selectedIds) {
        const task = state.data.find(r => r.id === id);
        if (task) {
          if (task.isSequenceTask) {
            try {
              console.log('[Tasks] (Bulk) Completed sequence task, creating next step...', task.id);
              const baseUrl = getApiBaseUrl();
              const response = await fetch(`${baseUrl}/api/complete-sequence-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id })
              });
              const result = await response.json();

              if (result.success) {
                if (result.nextStepType === 'task') {
                  if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
                    try {
                      await window.BackgroundTasksLoader.forceReload();
                    } catch (reloadError) {
                      console.warn('[Tasks] Failed to force reload BackgroundTasksLoader (bulk):', reloadError);
                    }
                  }
                  needsReloadAfterSequence = true;
                }
              } else {
                console.warn('[Tasks] (Bulk) Failed to create next step:', result.message || result.error);
              }
            } catch (error) {
              console.error('[Tasks] (Bulk) Error creating next sequence step:', error);
            }
          }

          task.status = 'completed';
          // Save to localStorage
          try {
            const key = getUserTasksKey();
            const current = JSON.parse(localStorage.getItem(key) || '[]');
            const taskIndex = current.findIndex(t => t.id === id);
            if (taskIndex !== -1) {
              current[taskIndex].status = 'completed';
              localStorage.setItem(key, JSON.stringify(current));
            }
          } catch (e) { console.warn('Could not update task in localStorage:', e); }
          // Save to Firebase
          try {
            const db = window.firebaseDB;
            if (db) {
              const snap = await db.collection('tasks').where('id', '==', id).limit(5).get();
              const batch = db.batch();
              snap.forEach(doc => batch.update(doc.ref, { status: 'completed' }));
              if (!snap.empty) await batch.commit();
            }
          } catch (e) { console.warn('Could not update task in Firebase:', e); }
        }
      }

      if (needsReloadAfterSequence) {
        await loadData();
      }

      state.selected.clear();
      applyFilters();
      updateTodaysTasksWidget();
    });

    if (adminOnly) {
      container.querySelector('#bulk-assign').addEventListener('click', () => {
        // console.log('Bulk assign', Array.from(state.selected));
        // TODO: Implement bulk assign functionality
      });
    }

    container.querySelector('#bulk-export').addEventListener('click', () => {
      const selectedIds = Array.from(state.selected);
      const selectedTasks = state.data.filter(r => selectedIds.includes(r.id));

      // Convert to CSV
      const headers = ['Title', 'Contact', 'Account', 'Type', 'Priority', 'Due Date', 'Due Time', 'Status'];
      const rows = selectedTasks.map(t => [
        escapeHtml(t.title || ''),
        escapeHtml(t.contact || ''),
        escapeHtml(t.account || ''),
        escapeHtml(t.type || ''),
        escapeHtml(t.priority || ''),
        escapeHtml(t.dueDate || ''),
        escapeHtml(t.dueTime || ''),
        escapeHtml(t.status || '')
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    container.querySelector('#bulk-delete').addEventListener('click', async () => {
      await deleteSelectedTasks();
    });
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

    // Get user email for ownership (required for Firestore rules compliance)
    const getUserEmail = () => {
      try {
        if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
          const email = window.DataManager.getCurrentUserEmail();
          if (email && typeof email === 'string' && email.trim()) {
            return email.toLowerCase().trim();
          }
        }
        const email = window.currentUserEmail || '';
        if (email && typeof email === 'string' && email.trim()) {
          return email.toLowerCase().trim();
        }
      } catch (_) {
        const email = window.currentUserEmail || '';
        if (email && typeof email === 'string' && email.trim()) {
          return email.toLowerCase().trim();
        }
      }
      // Fallback to current user if possible, then admin
      return window.currentUserEmail || firebase.auth().currentUser?.email || 'l.patterson@powerchoosers.com';
    };
    const userEmail = getUserEmail();

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
      // CRITICAL: Set ownership fields for Firestore rules compliance
      ownerId: userEmail,
      assignedTo: userEmail,
      createdBy: userEmail,
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

        // CRITICAL FIX: Invalidate cache after task creation to prevent stale data
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          await window.CacheManager.invalidate('tasks');
          // console.log('[Tasks] Invalidated tasks cache after creation');
        }
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
    updateTodaysTasksWidget(newTask);

    // Dispatch activity refresh for immediate UI update
    try {
      const entityType = newTask.accountId ? 'account' : (newTask.contactId ? 'contact' : 'global');
      const entityId = newTask.accountId || newTask.contactId;
      document.dispatchEvent(new CustomEvent('pc:activities-refresh', {
        detail: { entityType, entityId, forceRefresh: true }
      }));
    } catch (_) { }
  }

  function updateTodaysTasksWidget(newTask) {
    // Also trigger a custom event for other components that might need to know about task updates
    // CRITICAL FIX: Include task data so BackgroundTasksLoader can update cache in place
    // Must dispatch BEFORE calling loadTodaysTasks so BackgroundLoader has time to update
    if (newTask) {
      window.dispatchEvent(new CustomEvent('tasksUpdated', {
        detail: { source: 'taskCreation', taskData: newTask, newTaskCreated: true }
      }));
    }

    // Update the Today's Tasks widget
    // We defer this slightly to allow BackgroundTasksLoader to process the event
    if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
      setTimeout(() => {
        window.crm.loadTodaysTasks();
      }, 50);
    }
  }

  async function init() { if (!initDomRefs()) return; attachEvents(); injectTasksBulkStyles(); await loadData(); bindUpdates(); }

  // Listen for cross-page task updates and refresh immediately
  function bindUpdates() {
    window.addEventListener('tasksUpdated', async (event) => {
      const detail = (event && event.detail) || {};
      const { taskId, deleted, newTaskCreated, nextStepType, rescheduled, source } = detail;

      // CRITICAL FIX: Avoid infinite refresh loops on the Tasks page.
      // The Tasks page dispatches `tasksUpdated` (e.g. source: 'tasksPageLoad' / 'taskCreation'),
      // and without this guard we end up calling loadData() repeatedly, causing 123 -> 245 flicker
      // and multiple Today's Tasks widget refreshes.
      const isMeaningfulUpdate = !!(deleted && taskId) || !!(rescheduled && taskId) || !!newTaskCreated;
      if (!isMeaningfulUpdate) {
        return;
      }

      // CRITICAL FIX: If a task was deleted, clean it up from localStorage immediately
      if (deleted && taskId) {
        try {
          const getUserEmail = () => {
            try {
              if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                return window.DataManager.getCurrentUserEmail();
              }
              return (window.currentUserEmail || '').toLowerCase();
            } catch (_) {
              return (window.currentUserEmail || '').toLowerCase();
            }
          };
          const email = getUserEmail();
          const namespacedKey = email ? `userTasks:${email}` : 'userTasks';

          // Remove from namespaced key
          const namespacedTasks = JSON.parse(localStorage.getItem(namespacedKey) || '[]');
          const filteredNamespaced = namespacedTasks.filter(t => t && t.id !== taskId);
          localStorage.setItem(namespacedKey, JSON.stringify(filteredNamespaced));

          // Also remove from legacy key
          const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
          const filteredLegacy = legacyTasks.filter(t => t && t.id !== taskId);
          localStorage.setItem('userTasks', JSON.stringify(filteredLegacy));

          // console.log('[Tasks] Cleaned up deleted task from localStorage:', taskId);
        } catch (e) {
          console.warn('[Tasks] Could not clean up deleted task from localStorage:', e);
        }
      }

      // CRITICAL FIX: If a task was rescheduled, force refresh all caches to get updated dueDate/dueTime
      // This ensures the task appears in its new position and is removed from its old position
      if (rescheduled && taskId) {
        // console.log('[Tasks] Task rescheduled, forcing refresh of all caches...', taskId);
        
        // Remove from BackgroundTasksLoader cache immediately (will be reloaded with fresh data)
        if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.removeTask === 'function') {
          try {
            window.BackgroundTasksLoader.removeTask(taskId);
            // console.log('[Tasks] Removed rescheduled task from BackgroundTasksLoader cache');
          } catch (e) {
            console.warn('[Tasks] Failed to remove task from BackgroundTasksLoader:', e);
          }
        }
        
        // Force reload BackgroundTasksLoader to get fresh data with updated dueDate/dueTime
        if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
          try {
            await window.BackgroundTasksLoader.forceReload();
            // console.log('[Tasks] BackgroundTasksLoader refreshed after reschedule');
          } catch (e) {
            console.warn('[Tasks] Failed to refresh BackgroundTasksLoader after reschedule:', e);
          }
        }
        
        // Invalidate cache to ensure fresh data
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          try {
            await window.CacheManager.invalidate('tasks');
            // console.log('[Tasks] Invalidated tasks cache after reschedule');
          } catch (e) {
            console.warn('[Tasks] Failed to invalidate cache after reschedule:', e);
          }
        }
        
        // Small delay to ensure Firebase update and cache invalidation complete
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // CRITICAL FIX: If a new task was created (e.g., next step in sequence), refresh BackgroundTasksLoader
      if (newTaskCreated) {
        // console.log('[Tasks] New task created from sequence, refreshing BackgroundTasksLoader...', { nextStepType });
        if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
          try {
            await window.BackgroundTasksLoader.forceReload();
            // console.log('[Tasks] BackgroundTasksLoader refreshed after new task creation');
          } catch (e) {
            console.warn('[Tasks] Failed to refresh BackgroundTasksLoader:', e);
          }
        }
        
        // Invalidate cache to ensure fresh data
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          try {
            await window.CacheManager.invalidate('tasks');
            // console.log('[Tasks] Invalidated tasks cache after new task creation');
          } catch (e) {
            console.warn('[Tasks] Failed to invalidate cache:', e);
          }
        }
      }

      // Rebuild from localStorage + Firebase + LinkedIn tasks
      // CRITICAL: This will properly sort tasks by new dueDate/dueTime after reschedule
      await loadData();
    });

    // Listen for background tasks loader events
    document.addEventListener('pc:tasks-loaded', async (event) => {
      const { newTaskCreated, count, cached, fromFirestore } = (event && event.detail) || {};
      // // console.log('[Tasks] Background tasks loaded, checking for updates...', { newTaskCreated });
      
      // If the Tasks page rendered from localStorage (123) before the loader was ready (245),
      // re-run loadData once to hydrate the table with the full loader set.
      try {
        const currentCount = Array.isArray(state.data) ? state.data.length : 0;
        if (!newTaskCreated && typeof count === 'number' && count > currentCount) {
          await loadData();
          return;
        }
      } catch (_) { }

      // If a new task was created, force reload BackgroundTasksLoader first
      if (newTaskCreated && window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
        try {
          // console.log('[Tasks] New task created, forcing BackgroundTasksLoader refresh...');
          await window.BackgroundTasksLoader.forceReload();
          // Only reload if we're on the tasks page and a new task was actually created
          await loadData();
        } catch (e) {
          console.warn('[Tasks] Failed to force reload BackgroundTasksLoader:', e);
        }
      }
      // NOTE: Removed automatic loadData() call to prevent loops with tasksUpdated events
    });

    // CRITICAL FIX: Listen for task deletion events for cross-browser sync
    document.addEventListener('pc:task-deleted', async (event) => {
      const { taskId } = event.detail || {};
      if (taskId) {
        try {
          const getUserEmail = () => {
            try {
              if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
                return window.DataManager.getCurrentUserEmail();
              }
              return (window.currentUserEmail || '').toLowerCase();
            } catch (_) {
              return (window.currentUserEmail || '').toLowerCase();
            }
          };
          const email = getUserEmail();
          const namespacedKey = email ? `userTasks:${email}` : 'userTasks';

          // Remove from namespaced key
          const namespacedTasks = JSON.parse(localStorage.getItem(namespacedKey) || '[]');
          const filteredNamespaced = namespacedTasks.filter(t => t && t.id !== taskId);
          localStorage.setItem(namespacedKey, JSON.stringify(filteredNamespaced));

          // Also remove from legacy key
          const legacyTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
          const filteredLegacy = legacyTasks.filter(t => t && t.id !== taskId);
          localStorage.setItem('userTasks', JSON.stringify(filteredLegacy));

          // console.log('[Tasks] Cleaned up deleted task from localStorage (cross-browser sync):', taskId);

          // Refresh the page if we're on the tasks page
          await loadData();
        } catch (e) {
          console.warn('[Tasks] Could not clean up deleted task from localStorage:', e);
        }
      }
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
      } catch (_) { }
    });
  } catch (_) { }

  // Initialize immediately if DOM already loaded, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
