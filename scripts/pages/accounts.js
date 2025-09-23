'use strict';

// Accounts page module: filtering + table render, Firestore-backed (client-side filtering initially)
(function () {
  const state = {
    data: [], // raw accounts
    filtered: [],
    loaded: false,
    selected: new Set(), // ids of selected accounts
    pageSize: 50,
    currentPage: 1,
    errorMsg: ''
  };

  // Listen for restore event from back button navigation
  if (!document._accountsRestoreBound) {
    document.addEventListener('pc:accounts-restore', (ev) => {
      try {
        const detail = ev && ev.detail ? ev.detail : {};
        console.log('[Accounts] Restoring state from back button:', detail);
        
        // Restore pagination
        const targetPage = Math.max(1, parseInt(detail.currentPage || detail.page || state.currentPage || 1, 10));
        if (targetPage !== state.currentPage) {
          state.currentPage = targetPage;
        }
        
        // Restore search term
        if (detail.searchTerm && els.quickSearch) {
          els.quickSearch.value = detail.searchTerm;
        }
        
        // Restore sorting
        if (detail.sortColumn) state.sortColumn = detail.sortColumn;
        if (detail.sortDirection) state.sortDirection = detail.sortDirection;
        
        // Re-render with restored state
        render();
        
        // Restore scroll position
        const y = parseInt(detail.scroll || 0, 10);
        setTimeout(() => {
          try { window.scrollTo(0, y); } catch (_) {}
        }, 100);

        // Clear restoring hint flag shortly after to avoid onSnapshot flicker resetting page to 1
        try {
          setTimeout(() => { try { if (window.__restoringAccounts) window.__restoringAccounts = false; } catch(_){} }, 800);
        } catch (_) {}
        
        // Restore selected items
        if (detail.selectedItems && Array.isArray(detail.selectedItems)) {
          setTimeout(() => {
            try {
              detail.selectedItems.forEach(id => {
                const checkbox = document.querySelector(`input.row-select[data-id="${id}"]`);
                if (checkbox && !checkbox.checked) {
                  checkbox.checked = true;
                  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
            } catch (_) {}
          }, 150);
        }
        
        console.log('[Accounts] State restored successfully');
      } catch (e) { 
        console.error('[Accounts] Error restoring state:', e);
      }
    });
    document._accountsRestoreBound = true;
  }

  // Column order for Accounts table headers (draggable)
  // Must match the headers in crm-dashboard.html (#accounts-table thead)
  const DEFAULT_ACCOUNTS_COL_ORDER = [
    'select',
    'name',
    'industry',
    'domain',
    'companyPhone',
    'contractEnd',
    'sqft',
    'occupancy',
    'employees',
    'location',
    'actions',
    'updated'
  ];
  // Bump storage key to reset any previously saved order that included non-existent columns
  const ACCOUNTS_COL_STORAGE_KEY = 'accounts_column_order_v3';
  let accountsColumnOrder = DEFAULT_ACCOUNTS_COL_ORDER.slice();
  function loadAccountsColumnOrder() {
    try {
      const raw = localStorage.getItem(ACCOUNTS_COL_STORAGE_KEY);
      if (!raw) return DEFAULT_ACCOUNTS_COL_ORDER.slice();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return DEFAULT_ACCOUNTS_COL_ORDER.slice();
      const seen = new Set();
      const ordered = [];
      for (const k of arr) if (DEFAULT_ACCOUNTS_COL_ORDER.includes(k) && !seen.has(k)) { seen.add(k); ordered.push(k); }
      for (const k of DEFAULT_ACCOUNTS_COL_ORDER) if (!seen.has(k)) ordered.push(k);
      return ordered;
    } catch (e) {
      return DEFAULT_ACCOUNTS_COL_ORDER.slice();
    }
  }
  function persistAccountsColumnOrder(order) { try { localStorage.setItem(ACCOUNTS_COL_STORAGE_KEY, JSON.stringify(order)); } catch (e) { /* noop */ } }

  const els = {};

  // Ensure selection set exists to avoid runtime errors if it was clobbered
  function ensureSelected() {
    if (!state || !(state.selected instanceof Set)) {
      state.selected = new Set();
    }
  }

  function qs(id) { return document.getElementById(id); }

  function initDomRefs() {
    els.page = document.getElementById('accounts-page');
    if (!els.page) return false;

    els.table = els.page.querySelector('#accounts-table');
    els.thead = els.page.querySelector('#accounts-table thead');
    els.headerRow = els.thead ? els.thead.querySelector('tr') : null;
    els.tbody = els.page.querySelector('#accounts-table tbody');
    els.tableContainer = els.page.querySelector('.table-container');
    els.selectAll = qs('select-all-accounts');
    els.pagination = qs('accounts-pagination');
    els.paginationSummary = qs('accounts-pagination-summary');
    els.toggleBtn = qs('toggle-accounts-filters');
    els.filterPanel = qs('accounts-filters');
    els.filterText = els.toggleBtn ? els.toggleBtn.querySelector('.filter-text') : null;
    els.filterBadge = qs('accounts-filter-count');
    els.quickSearch = qs('accounts-quick-search');

    // fields
    els.fName = qs('filter-acct-name');
    els.fIndustry = qs('filter-industry');
    els.fDomain = qs('filter-domain');
    els.fHasPhone = qs('filter-acct-has-phone');

    els.applyBtn = qs('apply-accounts-filters');
    els.clearBtn = qs('clear-accounts-filters');

    // Add Account button (creates a minimal doc with new fields)
    const addBtn = document.getElementById('add-account-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        try {
          // Capture current page state before opening modal for back button navigation
          window._addAccountReturn = {
            page: state.currentPage,
            scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
            searchTerm: els.quickSearch ? els.quickSearch.value : '',
            sortColumn: state.sortColumn,
            sortDirection: state.sortDirection,
            selectedItems: Array.from(state.selected || [])
          };
          
          if (window.crm && typeof window.crm.showModal === 'function') {
            window.crm.showModal('add-account');
          } else {
            console.warn('CRM modal not available');
          }
        } catch (e) {
          console.error('Open Add Account modal failed', e);
        }
      });
    }

    // Listen for account creation events from Add Account modal
    if (els.page && !els.page._accountCreatedHandler) {
      els.page._accountCreatedHandler = function (ev) {
        try {
          const detail = ev && ev.detail ? ev.detail : {};
          const id = detail.id;
          const doc = detail.doc || {};
          if (!id) return;
          // Deduplicate, prepend, and refresh filters/render
          state.data = (Array.isArray(state.data) ? state.data : []).filter((a) => a && a.id !== id);
          state.data.unshift({ id, ...doc });
          applyFilters();
        } catch (_) { /* noop */ }
      };
      document.addEventListener('pc:account-created', els.page._accountCreatedHandler);
    }

    return true;
  }

  // Ensure header <th> elements are annotated with data-col keys and draggable
  function ensureAccountsHeaderColMeta() {
    if (!els.headerRow) return;
    const ths = Array.from(els.headerRow.querySelectorAll('th'));
    if (ths.length === 0) return;
    for (let i = 0; i < ths.length && i < DEFAULT_ACCOUNTS_COL_ORDER.length; i++) {
      const th = ths[i];
      const key = th.getAttribute('data-col') || DEFAULT_ACCOUNTS_COL_ORDER[i];
      th.setAttribute('data-col', key);
      th.setAttribute('draggable', 'true');
    }
  }

  // Reorder header DOM to match accountsColumnOrder
  function refreshAccountsHeaderOrder() {
    if (!els.headerRow) return;
    const current = Array.from(els.headerRow.querySelectorAll('th'));
    if (current.length === 0) return;
    const byKey = new Map();
    for (const th of current) byKey.set(th.getAttribute('data-col'), th);
    const frag = document.createDocumentFragment();
    for (const k of accountsColumnOrder) {
      const th = byKey.get(k);
      if (th) frag.appendChild(th);
    }
    for (const th of current) if (!frag.contains(th)) frag.appendChild(th);
    els.headerRow.appendChild(frag);
  }

  function getAccountsHeaderOrderFromDom() {
    if (!els.headerRow) return DEFAULT_ACCOUNTS_COL_ORDER.slice();
    return Array.from(els.headerRow.querySelectorAll('th')).map((th) => th.getAttribute('data-col')).filter(Boolean);
  }

  function attachAccountsHeaderDnDHooks() {
    if (!els.thead) return;
    const handler = () => {
      setTimeout(() => {
        const ord = getAccountsHeaderOrderFromDom();
        if (ord.length) {
          const a = ord.join(',');
          const b = accountsColumnOrder.join(',');
          if (a !== b) {
            accountsColumnOrder = ord;
            persistAccountsColumnOrder(ord);
            render();
          }
        }
      }, 0);
    };
    els.thead.addEventListener('drop', handler, true);
    els.thead.addEventListener('dragend', handler, true);
  }

  // Enhanced DnD for headers with better visual feedback
  function initAccountsHeaderDnD() {
    if (!els.headerRow) return;
    let dragSrcTh = null;
    let dragOverTh = null;
    let isDragging = false;
    const ths = Array.from(els.headerRow.querySelectorAll('th'));
    
    // Helper to commit a move given a source and highlighted target
    function commitHeaderMove(sourceTh, targetTh) {
      if (!sourceTh || !targetTh) return false;
      if (sourceTh === targetTh) return false;
      // Always populate the highlighted position: insert BEFORE target.
      // This shifts the target (and everything to the right) one position to the right.
      els.headerRow.insertBefore(sourceTh, targetTh);
      return true;
    }

    // Global drop handler for the entire header row
    els.headerRow.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (!isDragging || !dragSrcTh) return;
      
      // Get all available columns (excluding the one being dragged)
      const allThs = Array.from(els.headerRow.querySelectorAll('th')).filter(th => th !== dragSrcTh);
      if (allThs.length === 0) return;
      
      let targetTh = null;
      
      // Method 1: Direct element detection using elementsFromPoint
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      targetTh = elements.find(el => el.tagName === 'TH' && el !== dragSrcTh);
      
      // Method 2: If no direct hit, find by mouse position within column bounds
      if (!targetTh) {
        for (const th of allThs) {
          const rect = th.getBoundingClientRect();
          // More generous hit area for easier targeting
          const isOverColumn = e.clientX >= rect.left - 15 && e.clientX <= rect.right + 15;
          
          if (isOverColumn) {
            targetTh = th;
            break;
          }
        }
      }
      
      // Method 3: Find closest column by distance to center
      if (!targetTh) {
        let closestTh = null;
        let closestDistance = Infinity;
        
        for (const th of allThs) {
          const rect = th.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const distance = Math.abs(e.clientX - centerX);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestTh = th;
          }
        }
        
        // Use closest column if within reasonable distance (reduced threshold for better precision)
        if (closestDistance < 100) {
          targetTh = closestTh;
        }
      }
      
      // Method 4: Edge case handling for adjacent columns
      if (!targetTh) {
        // Check if mouse is in the gap between columns
        const draggedIndex = Array.from(els.headerRow.children).indexOf(dragSrcTh);
        const nextSibling = dragSrcTh.nextElementSibling;
        const prevSibling = dragSrcTh.previousElementSibling;
        
        if (nextSibling && nextSibling.tagName === 'TH') {
          const nextRect = nextSibling.getBoundingClientRect();
          if (e.clientX >= nextRect.left - 30 && e.clientX <= nextRect.right + 30) {
            targetTh = nextSibling;
          }
        } else if (prevSibling && prevSibling.tagName === 'TH') {
          const prevRect = prevSibling.getBoundingClientRect();
          if (e.clientX >= prevRect.left - 30 && e.clientX <= prevRect.right + 30) {
            targetTh = prevSibling;
          }
        }
      }
      
      // Update highlight if we found a new target
      if (targetTh && targetTh !== dragOverTh) {
        // Remove previous highlight
        if (dragOverTh) {
          dragOverTh.classList.remove('drag-over');
        }
        
        // Add new highlight
        dragOverTh = targetTh;
        targetTh.classList.add('drag-over');
      }
    });
    
    // Global drop handler - drop into the currently highlighted (dragOverTh) column
    els.headerRow.addEventListener('drop', (e) => {
      e.preventDefault();
      
      if (!dragSrcTh || !dragOverTh) return;
      
      // Remove highlight
      dragOverTh.classList.remove('drag-over');
      
      // Commit the move - this will insert the dragged column before the highlighted target
      commitHeaderMove(dragSrcTh, dragOverTh);
      
      // Update the column order and persist
      const newOrder = getHeaderOrderFromDom();
      if (newOrder.length > 0) {
        accountsColumnOrder = newOrder;
        persistAccountsColumnOrder(newOrder);
        // Re-render to reflect new column order
        render();
      }
      
      dragOverTh = null;
    });
    
    ths.forEach((th) => {
      th.setAttribute('draggable', 'true');
      
      th.addEventListener('dragstart', (e) => {
        isDragging = true;
        dragSrcTh = th;
        const key = th.getAttribute('data-col') || '';
        try { 
          e.dataTransfer?.setData('text/plain', key);
          e.dataTransfer.effectAllowed = 'move';
        } catch (_) { /* noop */ }
        th.classList.add('dragging');
        
        // Add visual feedback to all other headers
        ths.forEach(otherTh => {
          if (otherTh !== th) {
            otherTh.classList.add('drag-target');
          }
        });
      });
      
      th.addEventListener('dragend', () => {
        // Clean up all visual states
        isDragging = false;
        th.classList.remove('dragging');
        ths.forEach(otherTh => {
          otherTh.classList.remove('drag-over', 'drag-target');
        });
        dragSrcTh = null;
        dragOverTh = null;
      });
    });
  }

  function attachEvents() {
    if (els.toggleBtn && els.filterPanel) {
      els.toggleBtn.addEventListener('click', () => {
        const isHidden = els.filterPanel.hasAttribute('hidden');
        if (isHidden) {
          els.filterPanel.removeAttribute('hidden');
          if (els.filterText) els.filterText.textContent = 'Hide Filters';
        } else {
          els.filterPanel.setAttribute('hidden', '');
          if (els.filterText) els.filterText.textContent = 'Show Filters';
        }
      });
    }

    const reFilter = debounce(applyFilters, 200);

    [els.fName, els.fIndustry, els.fDomain].forEach((inp) => {
      if (inp) inp.addEventListener('input', reFilter);
    });
    [els.fHasPhone].forEach((chk) => {
      if (chk) chk.addEventListener('change', reFilter);
    });

    if (els.applyBtn) els.applyBtn.addEventListener('click', () => { state.currentPage = 1; applyFilters(); });
    if (els.clearBtn) els.clearBtn.addEventListener('click', () => { clearFilters(); state.currentPage = 1; });
    if (els.quickSearch) els.quickSearch.addEventListener('input', reFilter);

    // Select-all
    if (els.selectAll) {
      // Only handle UNCHECK in change; opening popover is handled by click to avoid re-entrancy
      els.selectAll.addEventListener('change', () => {
        if (!els.selectAll.checked) {
          // Clear any selection and close UIs
          state.selected.clear();
          render();
          closeBulkSelectPopover();
          hideBulkActionsBar();
        }
      });
      // Click opens the popover when becoming checked
      els.selectAll.addEventListener('click', () => {
        // Defer to ensure the checked state has settled
        setTimeout(() => {
          if (els.selectAll.checked) {
            openBulkSelectPopover();
          }
        }, 0);
      });
    } else {
      
    }

    // Row selection via event delegation
    if (els.tbody) {
      els.tbody.addEventListener('change', (e) => {
        const cb = e.target;
        if (cb && cb.classList.contains('row-select')) {
          const id = cb.getAttribute('data-id');
          if (!id) return;
          if (cb.checked) state.selected.add(id); else state.selected.delete(id);
          const tr = cb.closest('tr');
          if (tr) tr.classList.toggle('row-selected', cb.checked);
          updateSelectAllState();
          updateBulkActionsBar();
        }
      });
      // Quick actions delegation
      els.tbody.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('.qa-btn');
        if (!btn) return;
        e.preventDefault();
        handleQuickAction(btn);
      });
      // Account name click -> open Account Detail
      els.tbody.addEventListener('click', (e) => {
        const link = e.target.closest && e.target.closest('.acct-link');
        if (!link) return;
        e.preventDefault();
        const id = link.getAttribute('data-id');
        if (id && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
          // Capture return state so Account Detail can restore Accounts on back
          try {
            window._accountNavigationSource = 'accounts';
            // Prefer module API to capture a consistent snapshot
            if (window.accountsModule && typeof window.accountsModule.getCurrentState === 'function') {
              window._accountsReturn = window.accountsModule.getCurrentState();
            } else {
              window._accountsReturn = {
                page: state.currentPage,
                scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
                searchTerm: els.quickSearch ? els.quickSearch.value : '',
                sortColumn: state.sortColumn,
                sortDirection: state.sortDirection,
                selectedItems: Array.from(state.selected || [])
              };
            }
          } catch (_) { /* noop */ }
          window.AccountDetail.show(id);
        }
      });
    }

    // Pagination click handling
    if (els.pagination) {
      els.pagination.addEventListener('click', (e) => {
        const btn = e.target.closest('button.page-btn');
        if (!btn || btn.disabled) return;
        const rel = btn.dataset.rel;
        const total = getTotalPages();
        let next = state.currentPage;
        if (rel === 'prev') next = Math.max(1, state.currentPage - 1);
        else if (rel === 'next') next = Math.min(total, state.currentPage + 1);
        else if (btn.dataset.page) next = Math.min(total, Math.max(1, parseInt(btn.dataset.page, 10)));
        if (next !== state.currentPage) {
          state.currentPage = next;
          render();
          // After page change, scroll to the top of the list
          try {
            const scroller = (els.page && els.page.querySelector) ? els.page.querySelector('.table-scroll') : null;
            if (scroller && typeof scroller.scrollTo === 'function') {
              scroller.scrollTo({ top: 0, behavior: 'auto' });
            } else if (scroller) {
              scroller.scrollTop = 0;
            }
            // Also ensure window is at top
            window.scrollTo(0, 0);
          } catch (_) { /* noop */ }
        }
      });
    }

    // Listen for account updates from Account Detail and Energy updates
    if (els.page && !els.page._accountUpdatedHandler) {
      els.page._accountUpdatedHandler = function (e) {
        try {
          const d = e && e.detail ? e.detail : {};
          const id = d.id;
          const changes = d.changes || {};
          if (!id) return;
          // Update in-memory rows
          const apply = (arr) => {
            if (!Array.isArray(arr)) return;
            for (let i = 0; i < arr.length; i++) {
              const a = arr[i];
              if (a && a.id === id) {
                arr[i] = Object.assign({}, a, changes);
              }
            }
          };
          apply(state.data);
          apply(state.filtered);
          render();
        } catch (_) { /* noop */ }
      };
      document.addEventListener('pc:account-updated', els.page._accountUpdatedHandler);
    }

    if (els.page && !els.page._energyUpdatedHandler) {
      els.page._energyUpdatedHandler = function (e) {
        try {
          const d = e && e.detail ? e.detail : {};
          if (d.entity !== 'account') return;
          const id = d.id;
          const field = d.field;
          const value = d.value;
          if (!id || !field) return;
          const apply = (arr) => {
            if (!Array.isArray(arr)) return;
            for (let i = 0; i < arr.length; i++) {
              const a = arr[i];
              if (a && a.id === id) {
                const cloned = Object.assign({}, a);
                cloned[field] = value;
                cloned.updatedAt = new Date();
                arr[i] = cloned;
              }
            }
          };
          apply(state.data);
          apply(state.filtered);
          render();
        } catch (_) { /* noop */ }
      };
      document.addEventListener('pc:energy-updated', els.page._energyUpdatedHandler);
    }
  }

  function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); }; }

  async function loadDataOnce() {
    if (state.loaded) return;
    try {
      if (!window.firebaseDB) {
        state.data = [];
        state.filtered = [];
        state.loaded = true;
        render();
        return;
      }
      const snap = await window.firebaseDB.collection('accounts').get();
      state.data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.filtered = state.data.slice();
      state.loaded = true;
      state.errorMsg = '';
      // While restoring from back-nav, do not reset to page 1
      if (!window.__restoringAccounts) {
        state.currentPage = 1;
      }
      // Extra guard: if restoring hint is set but stale, clear it
      if (window.__restoringAccountsUntil && Date.now() > window.__restoringAccountsUntil) {
        try { window.__restoringAccounts = false; window.__restoringAccountsUntil = 0; } catch(_) {}
      }
      render();
    } catch (e) {
      state.data = [];
      state.filtered = [];
      state.loaded = true;
      state.errorMsg = (e && (e.message || e.code)) ? String(e.message || e.code) : 'Unknown error';
      if (!window.__restoringAccounts) {
        state.currentPage = 1;
      }
      if (window.__restoringAccountsUntil && Date.now() > window.__restoringAccountsUntil) {
        try { window.__restoringAccounts = false; window.__restoringAccountsUntil = 0; } catch(_) {}
      }
      render();
    }
  }

  // Live reconcile via onSnapshot (keeps table in sync without navigation)
  let _unsubscribeAccounts = null;
  async function startLiveAccountsListener() {
    try {
      if (!window.firebaseDB || !window.firebaseDB.collection) return;
      if (_unsubscribeAccounts) { try { _unsubscribeAccounts(); } catch(_) {} _unsubscribeAccounts = null; }
      const col = window.firebaseDB.collection('accounts');
      _unsubscribeAccounts = col.onSnapshot((snap) => {
        try {
          const fresh = [];
          snap.forEach((doc) => { fresh.push({ id: doc.id, ...doc.data() }); });
          state.data = fresh;
          applyFilters();
        } catch (_) { /* noop */ }
      }, (err) => {
        console.warn('[Accounts] onSnapshot error', err);
      });
    } catch (e) {
      console.warn('[Accounts] Failed to start live listener', e);
    }
  }

  function normalize(s) { return (s || '').toString().trim().toLowerCase(); }

  function applyFilters() {
    const q = normalize(els.quickSearch ? els.quickSearch.value : '');

    const nameQ = normalize(els.fName ? els.fName.value : '');
    const industryQ = normalize(els.fIndustry ? els.fIndustry.value : '');
    const domainQ = normalize(els.fDomain ? els.fDomain.value : '');
    const mustPhone = !!(els.fHasPhone && els.fHasPhone.checked);

    let count = 0;
    const hasFieldFilters = [nameQ, industryQ, domainQ].some((v) => v) || mustPhone;
    if (els.filterBadge) {
      count = [nameQ, industryQ, domainQ].filter(Boolean).length + (mustPhone ? 1 : 0);
      if (count > 0) { els.filterBadge.textContent = String(count); els.filterBadge.removeAttribute('hidden'); }
      else { els.filterBadge.setAttribute('hidden', ''); }
    }

    const qMatch = (str) => !q || normalize(str).includes(q);
    const contains = (needle) => (str) => !needle || normalize(str).includes(needle);

    const nameMatch = contains(nameQ);
    const industryMatch = contains(industryQ);
    const domainMatch = contains(domainQ);
    

    state.filtered = state.data.filter((a) => {
      const acctName = a.accountName || a.name || a.companyName || '';
      const hasPhone = !!(a.companyPhone || a.phone || a.primaryPhone || a.mainPhone);
      const domain = a.domain || a.website || a.site || '';

      return (
        qMatch(acctName) || qMatch(a.industry) || qMatch(domain) || qMatch(a.companyPhone) || qMatch(a.phone) || qMatch(a.electricitySupplier) || qMatch(a.benefits) || qMatch(a.painPoints)
      ) && nameMatch(acctName) && industryMatch(a.industry) && domainMatch(domain) && (!mustPhone || hasPhone);
    });

    if (!window.__restoringAccounts) {
      state.currentPage = 1;
    }
    if (window.__restoringAccountsUntil && Date.now() > window.__restoringAccountsUntil) {
      try { window.__restoringAccounts = false; window.__restoringAccountsUntil = 0; } catch(_) {}
    }
    render();
  }

  function clearFilters() {
    if (els.fName) els.fName.value = '';
    if (els.fIndustry) els.fIndustry.value = '';
    if (els.fDomain) els.fDomain.value = '';
    
    if (els.fHasPhone) els.fHasPhone.checked = false;
    if (els.quickSearch) els.quickSearch.value = '';
    applyFilters();
  }

  function render() {
    if (!els.tbody) return;
    ensureSelected();
    const pageItems = getPageItems();
    const rows = pageItems.map((a) => rowHtml(a)).join('');
    els.tbody.innerHTML = rows || emptyHtml();
    updateRowsCheckedState();
    updateSelectAllState();
    renderPagination();
    updateBulkActionsBar();
  }

  function safe(val) { return (val == null ? '' : String(val)); }

  function coerceDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'object' && typeof val.toDate === 'function') { const d = val.toDate(); return isNaN(d.getTime()) ? null : d; }
    if (val && typeof val.seconds === 'number') { const ms = val.seconds * 1000 + (typeof val.nanoseconds === 'number' ? Math.floor(val.nanoseconds / 1e6) : 0); const d = new Date(ms); return isNaN(d.getTime()) ? null : d; }
    if (typeof val === 'number') { const d = new Date(val > 1e12 ? val : val * 1000); return isNaN(d.getTime()) ? null : d; }
    if (typeof val === 'string') { const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
    return null;
  }

  function formatDateOrNA() {
    for (let i = 0; i < arguments.length; i++) { const d = coerceDate(arguments[i]); if (d) return d.toLocaleDateString(); }
    return 'N/A';
  }

  function svgIcon(name) {
    switch (name) {
      case 'clear':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
      case 'email':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none"></path><polyline points="22,6 12,13 2,6" fill="none"></polyline></svg>';
      case 'sequence':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      case 'call':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.5v2a3 3 0 0 1-3.3 3 a19 19 0 0 1-8.3-3.2 19 19 0 0 1-6-6A19 19 0 0 1 1.5 4.3 3 3 0 0 1 4.5 1h2a2 2 0 0 1 2 1.7l.4 2.3a2 2 0 0 1-.5 1.8L7 8a16 16 0 0 0 9 9l1.2-1.3a2 2 0 0 1 1.8-.5l2.3.4A2 2 0 0 1 22 16.5z"/></svg>';
      case 'addlist':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>';
      case 'export':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      case 'ai':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:block"><text x="12" y="12" dy="-0.12em" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="18" font-weight="800" letter-spacing="0.05" font-family="Inter, system-ui, -apple-system, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif">AI</text></svg>';
      case 'delete':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      case 'linkedin':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5z" transform="translate(4 4)"/><path d="M2 8h4v10H2z" transform="translate(4 4)"/><path d="M9 8h3v1.7c.6-1 1.6-1.7 3.2-1.7 3 0 4.8 2 4.8 5.6V18h-4v-3.7c0-1.4-.5-2.4-1.7-2.4-1 0-1.5.7-1.8 1.4-.1.2-.1.6-.1.9V18H9z" transform="translate(4 4)"/></svg>';
      case 'link':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/></svg>';
      default:
        return '';
    }
  }

  // Additional icons
  (function extendIcons() {
    const _orig = svgIcon;
    svgIcon = function(name){
      switch(name){
        case 'linkedin':
          return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5z" transform="translate(4 4)"/><path d="M2 8h4v10H2z" transform="translate(4 4)"/><path d="M9 8h3v1.7c.6-1 1.6-1.7 3.2-1.7 3 0 4.8 2 4.8 5.6V18h-4v-3.7c0-1.4-.5-2.4-1.7-2.4-1 0-1.5.7-1.8 1.4-.1.2-.1.6-.1.9V18H9z" transform="translate(4 4)"/></svg>';
        case 'link':
          return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/></svg>';
        default:
          return _orig(name);
      }
    }
  })();

  // Inject CRM-themed styles for bulk popover and actions bar (Accounts)
  function injectAccountsBulkStyles() {
    const id = 'accounts-bulk-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = `
      /* Bulk selection backdrop */
      .bulk-select-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.35);
        z-index: 800;
      }

      /* Bulk selection popover - match app greys */
      .bulk-select-popover {
        position: absolute;
        z-index: 900;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius);
        box-shadow: var(--elevation-card);
        padding: var(--spacing-md);
        min-width: 320px;
        max-width: 480px;
      }
      .bulk-select-popover .option { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); }
      .bulk-select-popover .option:last-of-type { margin-bottom: 0; }
      .bulk-select-popover label { font-weight: 600; color: var(--text-primary); }
      .bulk-select-popover .hint { color: var(--text-secondary); font-size: 12px; }
      .bulk-select-popover input[type="number"] {
        width: 120px;
        height: 32px;
        padding: 0 10px;
        background: var(--grey-700);
        color: var(--text-inverse);
        border: 1px solid var(--grey-600);
        border-radius: var(--border-radius-sm);
      }
      .bulk-select-popover .actions { display: flex; justify-content: flex-end; gap: var(--spacing-sm); margin-top: var(--spacing-md); }
      .bulk-select-popover .btn-text {
        height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm);
        background: transparent; color: var(--text-secondary);
        border: 1px solid transparent;
      }
      .bulk-select-popover .btn-text:hover { background: var(--grey-700); border-color: var(--border-light); color: var(--text-inverse); }
      .bulk-select-popover .btn-primary {
        height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm);
        background: var(--grey-700);
        color: var(--text-inverse);
        border: 1px solid var(--grey-600);
        font-weight: 600;
      }
      .bulk-select-popover .btn-primary:hover { background: var(--grey-600); border-color: var(--grey-500); }

      /* Ensure container is a positioning context and not clipping */
#accounts-page .table-container { position: relative; overflow: visible; }

/* Scroll smoothness improvements */
#accounts-page .table-scroll {
  scrollbar-gutter: stable both-edges;
  overscroll-behavior: contain;
  overflow-anchor: none;
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  contain: paint layout;
}

      /* Bulk actions bar inside table container, centered above header */
      #accounts-bulk-actions.bulk-actions-modal {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        top: 8px;
        width: max-content;
        max-width: none; /* allow full content width so end buttons aren't clipped */
        padding: 8px 12px; /* skinnier bar */
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        box-shadow: var(--elevation-card);
        z-index: 850;
      }
      #accounts-bulk-actions .bar { display: flex; align-items: center; gap: var(--spacing-sm); flex-wrap: nowrap; white-space: nowrap; width: auto; overflow: visible; }
      #accounts-bulk-actions .spacer { display:none; }
      #accounts-bulk-actions .action-btn-sm {
        display: inline-flex; align-items: center; gap: 6px;
        height: 30px; padding: 0 10px;
        background: var(--bg-item);
        color: var(--text-inverse);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-sm);
        font-size: 0.85rem;
        flex: 0 0 auto; /* prevent shrinking to keep labels on one line */
      }
      #accounts-bulk-actions .action-btn-sm:hover { background: var(--grey-700); }
      #accounts-bulk-actions .action-btn-sm.danger { background: var(--red-muted); border-color: var(--red-subtle); color: var(--text-inverse); }
      #accounts-bulk-actions .action-btn-sm svg { display: block; }
      #accounts-bulk-actions .action-btn-sm span { display: inline-block; white-space: nowrap; }
      /* Slight vertical nudge for AI icon to center with label */
      #accounts-bulk-actions #bulk-ai svg { transform: translateY(2px); }

      /* Bulk delete confirmation popover, centered with pointer */
      .bulk-delete-popover {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 960;
        min-width: 320px;
        max-width: 520px;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius);
        box-shadow: var(--elevation-card);
        padding: var(--spacing-md);
      }
      .bulk-delete-popover .bulk-delete-message { font-weight: 600; margin-bottom: 8px; }
      .bulk-delete-popover .bulk-delete-note { font-size: 12px; opacity: .85; margin-bottom: 12px; }
      .bulk-delete-popover .bulk-delete-actions { display: flex; gap: var(--spacing-sm); justify-content: flex-end; }
      .bulk-delete-popover .btn-text {
        height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm);
        background: transparent; color: var(--text-secondary);
        border: 1px solid transparent;
      }
      .bulk-delete-popover .btn-text:hover { background: var(--grey-700); border-color: var(--border-light); color: var(--text-inverse); }
      .bulk-delete-popover .btn-danger {
        height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm);
        background: var(--red-muted);
        color: var(--text-inverse);
        border: 1px solid var(--red-subtle);
        font-weight: 600;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .bulk-delete-popover .btn-danger:hover { filter: brightness(1.05); }
      /* Pointer arrow: position controlled by --arrow-left in px, relative to popover's left */
      .bulk-delete-popover::before {
        content: '';
        position: absolute;
        top: -8px;
        left: var(--arrow-left, 50%);
        transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 8px solid var(--bg-card);
        z-index: -1;
      }
      .bulk-delete-popover::after {
        content: '';
        position: absolute;
        top: -9px;
        left: var(--arrow-left, 50%);
        transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 9px solid transparent;
        border-right: 9px solid transparent;
        border-bottom: 9px solid var(--border-light);
        z-index: -2;
      }
    `;
    document.head.appendChild(style);
  }

  function rowHtml(a) {
    if (!a) return '';
    const name = safe(a.accountName || a.name || a.companyName);
    const industry = safe(a.industry);
    const domain = safe(a.domain || a.website || a.site);
    const phone = safe(a.companyPhone || a.phone || a.primaryPhone || a.mainPhone);
    // Normalize to E.164 for data attributes and actions
    const phoneE164 = (() => {
      try {
        let v = String(phone || '').trim();
        if (!v) return '';
        if (/^\+/.test(v)) return '+' + v.replace(/[^\d]/g, '');
        const digits = v.replace(/[^\d]/g, '');
        if (!digits) return '';
        if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
        if (digits.length === 10) return '+1' + digits;
        return '+' + digits;
      } catch (_) { return phone; }
    })();
    const contractEnd = formatDateOrNA(a.contractEndDate, a.contractEnd, a.contract_end_date);
    const sqftNum = a.squareFootage ?? a.sqft ?? a.square_feet;
    const sqft = (typeof sqftNum === 'number' && isFinite(sqftNum)) ? sqftNum.toLocaleString() : safe(sqftNum);
    const occVal = a.occupancyPct ?? a.occupancy ?? a.occupancy_percentage;
    const occupancy = (typeof occVal === 'number' && isFinite(occVal)) ? (Math.round(occVal * (occVal > 1 ? 1 : 100)) + '%') : safe(occVal);
    const employeesNum = a.employees ?? a.employeeCount ?? a.numEmployees;
    const employees = (typeof employeesNum === 'number' && isFinite(employeesNum)) ? employeesNum.toLocaleString() : safe(employeesNum);
    const city = safe(a.city || a.locationCity || a.town || '');
    const stateVal = safe(a.state || a.locationState || a.region || '');
    const location = (city || stateVal) ? `${escapeHtml(city)}${city && stateVal ? ', ' : ''}${escapeHtml(stateVal)}` : '';
    const linkedin = safe(a.linkedin || a.linkedinUrl || a.linkedin_url || '');
    const website = safe(a.website || a.site || (domain ? (domain.startsWith('http') ? domain : ('https://' + domain)) : ''));
    // Compute favicon domain (mirror People page logic)
    const favDomain = (() => {
      let d = String(domain || '').trim();
      // If domain includes protocol, parse hostname
      if (/^https?:\/\//i.test(d)) {
        try { d = new URL(d).hostname; } catch(_) { d = d.replace(/^https?:\/\//i, '').split('/')[0]; }
      }
      if (!d && website) {
        try { d = new URL(website).hostname; } catch (_) { d = String(website).replace(/^https?:\/\//i, '').split('/')[0]; }
      }
      return d ? d.replace(/^www\./i, '') : '';
    })();
    const updatedStr = formatDateOrNA(a.updatedAt, a.createdAt);

    const isSelected = !!(state && state.selected && typeof state.selected.has === 'function' && state.selected.has(a.id));
    const checked = isSelected ? ' checked' : '';
    const rowClass = isSelected ? ' class="row-selected"' : '';
    const aid = escapeHtml(a.id);

    const electricitySupplier = safe(a.electricitySupplier || '');
    const benefits = safe(a.benefits || '');
    const painPoints = safe(a.painPoints || '');

    const cells = {
      select: `<td class="col-select"><input type="checkbox" class="row-select" data-id="${aid}" aria-label="Select account"${checked}></td>`,
      name: `<td class="name-cell"><a href="#account-details" class="acct-link" data-id="${aid}" title="View account details"><span class="company-cell__wrap">${favDomain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(favDomain, 32) : '') : ''}<span class="name-text account-name">${escapeHtml(name || 'Unknown Account')}</span></span></a></td>`,
      industry: `<td>${escapeHtml(industry)}</td>`,
      domain: `<td>${escapeHtml(domain)}</td>`,
      companyPhone: `<td data-field="companyPhone" class="phone-cell click-to-call" data-phone="${escapeHtml(phoneE164)}" data-name="${escapeHtml(name)}">${escapeHtml(phone)}</td>`,
      contractEnd: `<td>${escapeHtml(contractEnd)}</td>`,
      electricitySupplier: `<td>${escapeHtml(electricitySupplier)}</td>`,
      benefits: `<td>${escapeHtml(benefits)}</td>`,
      painPoints: `<td>${escapeHtml(painPoints)}</td>`,
      sqft: `<td>${escapeHtml(sqft)}</td>`,
      occupancy: `<td>${escapeHtml(occupancy)}</td>`,
      employees: `<td>${escapeHtml(employees)}</td>`,
      location: `<td>${location}</td>`,
      actions: `<td class="qa-cell"><div class="qa-actions">
        <button type="button" class="qa-btn" data-action="call" data-id="${aid}" data-phone="${escapeHtml(phoneE164)}" aria-label="Call" title="Call">${svgIcon('call')}</button>
        <button type="button" class="qa-btn" data-action="addlist" data-id="${aid}" aria-label="Add to list" title="Add to list">${svgIcon('addlist')}</button>
        <button type="button" class="qa-btn" data-action="ai" data-id="${aid}" aria-label="Research with AI" title="Research with AI">${svgIcon('ai')}</button>
        <button type="button" class="qa-btn" data-action="linkedin" data-id="${aid}" data-linkedin="${escapeHtml(linkedin)}" data-name="${escapeHtml(name)}" aria-label="LinkedIn page" title="LinkedIn page">${svgIcon('linkedin')}</button>
        <button type="button" class="qa-btn" data-action="website" data-id="${aid}" data-website="${escapeHtml(website)}" aria-label="Company website" title="Company website">${svgIcon('link')}</button>
      </div></td>`,
      updated: `<td>${escapeHtml(updatedStr)}</td>`,
    };

    const tds = [];
    const order = (accountsColumnOrder && accountsColumnOrder.length) ? accountsColumnOrder : DEFAULT_ACCOUNTS_COL_ORDER;
    for (const key of order) if (cells[key]) tds.push(cells[key]);
    return `\n<tr${rowClass}>\n  ${tds.join('\n  ')}\n</tr>`;
  }

  function emptyHtml() {
    const msg = state && state.errorMsg ? `Error loading accounts: ${escapeHtml(state.errorMsg)}` : 'No accounts found.';
    const colCount = (accountsColumnOrder && accountsColumnOrder.length) ? accountsColumnOrder.length : DEFAULT_ACCOUNTS_COL_ORDER.length;
    return `\n<tr>\n  <td colspan="${colCount}" style="opacity:.75">${msg}</td>\n</tr>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function init() {
    if (!initDomRefs()) return;
    // Load saved order and prep header
    accountsColumnOrder = loadAccountsColumnOrder();
    ensureAccountsHeaderColMeta();
    refreshAccountsHeaderOrder();
    initAccountsHeaderDnD();
    attachAccountsHeaderDnDHooks();
    // Now wire events and load data
    attachEvents();
    // Ensure styles for bulk popover and actions bar match CRM theme
    injectAccountsBulkStyles();
    loadDataOnce();
    startLiveAccountsListener();
  }

  // Helper function to calculate contact activity score (same logic as calls page)
  function getContactActivityScore(contact) {
    if (!contact) return 0;
    try {
      const scoreTime = (p) => {
        const cand = [p.lastActivityAt, p.lastContactedAt, p.notesUpdatedAt, p.updatedAt, p.createdAt].map(v => {
          try {
            if (!v) return 0;
            if (typeof v.toDate === 'function') return v.toDate().getTime();
            const d = new Date(v);
            const t = d.getTime();
            return isNaN(t) ? 0 : t;
          } catch (_) {
            return 0;
          }
        });
        return Math.max(0, ...cand);
      };
      return scoreTime(contact);
    } catch (_) {
      return 0;
    }
  }

  function handleQuickAction(btn) {
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    switch (action) {
      case 'call': {
        const phone = btn.getAttribute('data-phone') || '';
        const name = btn.closest('tr').querySelector('.account-name')?.textContent || 'Unknown Account';
        const aid = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id') || '';
        if (phone) {
          // Use phone widget instead of tel: link
          if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
            // Provide context so backend and Calls page can attribute correctly
            try {
              if (typeof window.Widgets.setCallContext === 'function') {
                // Find the most active contact for this account to provide proper context
                let contactId = null;
                let contactName = null;
                if (aid && typeof window.getPeopleData === 'function') {
                  const people = window.getPeopleData() || [];
                  const accountContacts = people.filter(p => p.accountId === aid || p.accountID === aid);
                  if (accountContacts.length > 0) {
                    // Find the most active contact (same logic as calls page)
                    const mostActive = accountContacts.reduce((best, current) => {
                      const currentScore = getContactActivityScore(current);
                      const bestScore = getContactActivityScore(best);
                      return currentScore > bestScore ? current : best;
                    });
                    if (mostActive) {
                      contactId = mostActive.id;
                      contactName = [mostActive.firstName, mostActive.lastName].filter(Boolean).join(' ') || mostActive.name;
                    }
                  }
                }
                
                console.log('[Accounts][DEBUG] Setting call context:', {
                  accountId: aid,
                  accountName: name,
                  contactId: contactId,
                  contactName: contactName,
                  phone: phone
                });
                
                // If no specific contact selected, clear previous contact context to avoid misattribution
                window.Widgets.setCallContext({ 
                  accountId: aid || null, 
                  accountName: name || null, 
                  company: name || null,
                  contactId: contactId || null,
                  contactName: contactName || null,
                  name: (contactName || name) || null
                });
              }
            } catch (_) {}
            window.Widgets.callNumber(phone, name, false);
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast(`Calling ${name}`);
            }
          } else {
            // Fallback to tel: link if widget not available
            try { window.open(`tel:${encodeURIComponent(phone)}`); } catch (e) { /* noop */ }
          }
        }
        console.log('Call account', { id, phone, name });
        break;
      }
      case 'addlist': {
        console.log('Add to list', { id });
        break;
      }
      case 'ai': {
        console.log('Research with AI', { id });
        break;
      }
      case 'linkedin': {
        let url = btn.getAttribute('data-linkedin') || '';
        const name = btn.getAttribute('data-name') || '';
        if (!url && name) url = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`;
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        console.log('Open LinkedIn', { id, url });
        break;
      }
      case 'website': {
        let url = btn.getAttribute('data-website') || '';
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        console.log('Open website', { id, url });
        break;
      }
      default:
        break;
    }
  }

  function updateRowsCheckedState() {
    if (!els.tbody) return;
    els.tbody.querySelectorAll('input.row-select').forEach((cb) => {
      const id = cb.getAttribute('data-id');
      const isSel = id && state.selected.has(id);
      cb.checked = !!isSel;
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('row-selected', !!isSel);
    });
  }

  function updateSelectAllState() {
    if (!els.selectAll) return;
    const total = getPageItems().length;
    if (total === 0) { els.selectAll.checked = false; els.selectAll.indeterminate = false; return; }
    let selectedVisible = 0;
    for (const a of getPageItems()) if (state.selected.has(a.id)) selectedVisible++;
    if (selectedVisible === 0) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
    else if (selectedVisible === total) { els.selectAll.checked = true; els.selectAll.indeterminate = false; }
    else { els.selectAll.checked = false; els.selectAll.indeterminate = true; }
  }

  // ===== Bulk selection popover (Step 1) =====
  function openBulkSelectPopover() {
    if (!els.tableContainer) { return; }
    closeBulkSelectPopover();
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'bulk-select-backdrop';
    backdrop.addEventListener('click', () => {
      if (els.selectAll) els.selectAll.checked = state.selected.size > 0;
      closeBulkSelectPopover();
    });
    document.body.appendChild(backdrop);
    const totalFiltered = state.filtered.length;
    const pageCount = getPageItems().length;
    const pop = document.createElement('div');
    pop.id = 'accounts-bulk-popover';
    pop.className = 'bulk-select-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Bulk selection');
    pop.innerHTML = `
      <div class="option">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="radio" name="bulk-mode" value="custom" checked>
          <span>Select number of accounts</span>
        </label>
        <input type="number" min="1" step="1" value="${Math.max(1, pageCount)}" id="bulk-custom-count">
      </div>
      <div class="option">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="radio" name="bulk-mode" value="page">
          <span>Select this page</span>
        </label>
        <span class="hint">${pageCount}</span>
      </div>
      <div class="option">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="radio" name="bulk-mode" value="all">
          <span>Select all</span>
        </label>
        <span class="hint">${totalFiltered}</span>
      </div>
      <div class="actions">
        <button class="btn-text" id="bulk-cancel">Cancel</button>
        <button class="btn-primary" id="bulk-apply">Apply</button>
      </div>
    `;

    els.tableContainer.appendChild(pop);

    // Prevent outside mousedown handler from closing while interacting inside
    pop.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    function positionPopover() {
      if (!els.selectAll) return;
      const cbRect = els.selectAll.getBoundingClientRect();
      const contRect = els.tableContainer.getBoundingClientRect();
      let left = cbRect.left - contRect.left;
      let top = cbRect.bottom - contRect.top + 6;
      const maxLeft = contRect.width - pop.offsetWidth - 8;
      left = Math.max(8, Math.min(left, Math.max(8, maxLeft)));
      top = Math.max(8, top);
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }

    positionPopover();
    const reposition = () => positionPopover();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    if (els.page) {
      if (els.page._bulkPopoverCleanup) els.page._bulkPopoverCleanup();
      els.page._bulkPopoverCleanup = () => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
      };
    }

    const firstInput = pop.querySelector('#bulk-custom-count') || pop.querySelector('input,button');
    if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();

    // Wire events
    const cancelBtn = pop.querySelector('#bulk-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        els.selectAll.checked = false;
        closeBulkSelectPopover();
      });
    }
    const applyBtn = pop.querySelector('#bulk-apply');
    let appliedOnce = false;
    const runApply = () => {
      if (appliedOnce) { return; }
      appliedOnce = true;
      try {
        const mode = pop.querySelector('input[name="bulk-mode"]:checked')?.value;
        if (mode === 'custom') {
          const n = Math.max(1, parseInt(pop.querySelector('#bulk-custom-count').value || '0', 10));
          selectFirstNFiltered(n);
        } else if (mode === 'page') {
          const pageIds = getPageItems().map((a) => a.id).filter(Boolean);
          selectIds(pageIds);
        } else if (mode === 'all') {
          const allIds = state.filtered.map((a) => a.id).filter(Boolean);
          selectIds(allIds);
        } else {
          const pageIds = getPageItems().map((a) => a.id).filter(Boolean);
          selectIds(pageIds);
        }
        closeBulkSelectPopover();
        // Single render is sufficient; render() already calls updateBulkActionsBar()
        render();
      } catch (err) {
        console.error('[accounts][bulk] Apply handler error:', err);
      }
    };
    if (applyBtn) {
      // Use pointerdown so it happens before any outside-close mousedown
      applyBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); runApply(); });
      applyBtn.addEventListener('click', (e) => { e.preventDefault(); runApply(); });
    }
    // Delegated safety net: capture clicks anywhere inside popover
    pop.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      if (target.closest && target.closest('#bulk-apply')) {
        e.preventDefault();
        runApply();
      } else if (target.closest && target.closest('#bulk-cancel')) {
        e.preventDefault();
        if (els.selectAll) els.selectAll.checked = false;
        closeBulkSelectPopover();
      }
    });

    // Also wire cancel on pointerdown to preempt outside-close
    const cancelBtn2 = pop.querySelector('#bulk-cancel');
    if (cancelBtn2) {
      cancelBtn2.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (els.selectAll) els.selectAll.checked = false; closeBulkSelectPopover(); });
    }

    // Close on outside click
    setTimeout(() => {
      function outside(e) {
        if (!pop.contains(e.target) && e.target !== els.selectAll) {
          document.removeEventListener('mousedown', outside);
          els.selectAll.checked = state.selected.size > 0;
          closeBulkSelectPopover();
        }
      }
      document.addEventListener('mousedown', outside);
    }, 0);
  }

  function closeBulkSelectPopover() {
    const existing = document.querySelector('#accounts-bulk-popover');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    if (els.page && typeof els.page._bulkPopoverCleanup === 'function') {
      els.page._bulkPopoverCleanup();
      delete els.page._bulkPopoverCleanup;
    }
    // Remove backdrop if present
    const backdrop = document.querySelector('.bulk-select-backdrop');
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  }

  function selectIds(ids) {
    state.selected.clear();
    for (const id of ids) if (id) state.selected.add(id);
  }
  function selectFirstNFiltered(n) {
    const ids = state.filtered.slice(0, n).map((a) => a.id).filter(Boolean);
    selectIds(ids);
  }

  // ===== Bulk actions bar (Step 2) =====
  function showBulkActionsBar() { updateBulkActionsBar(true); }
  function hideBulkActionsBar() { const bar = els.page.querySelector('#accounts-bulk-actions'); if (bar && bar.parentNode) bar.parentNode.removeChild(bar); }

  function updateBulkActionsBar(forceShow = false) {
    if (!els.tableContainer) { return; }
    const count = state.selected.size;
    const shouldShow = forceShow || count > 0;
    const existing = els.page ? els.page.querySelector('#accounts-bulk-actions') : null;
    if (!shouldShow) {
      if (existing) { existing.remove(); }
      return;
    }
    const html = `
      <div class="bar">
        <button class="action-btn-sm" id="bulk-clear">${svgIcon('clear')}<span>Clear ${count} selected</span></button>
        <span class="spacer"></span>
        <button class="action-btn-sm" id="bulk-email">${svgIcon('email')}<span>Email</span></button>
        <button class="action-btn-sm" id="bulk-sequence">${svgIcon('sequence')}<span>Sequence ▾</span></button>
        <button class="action-btn-sm" id="bulk-call">${svgIcon('call')}<span>Call</span></button>
        <button class="action-btn-sm" id="bulk-addlist">${svgIcon('addlist')}<span>Add to list</span></button>
        <button class="action-btn-sm" id="bulk-export">${svgIcon('export')}<span>Export</span></button>
        <button class="action-btn-sm" id="bulk-ai">${svgIcon('ai')}<span>Research with AI</span></button>
        <button class="action-btn-sm danger" id="bulk-delete">${svgIcon('delete')}<span>Delete</span></button>
      </div>
    `;
    let container = existing;
    if (!container) {
      container = document.createElement('div');
      container.id = 'accounts-bulk-actions';
      container.className = 'bulk-actions-modal';
      els.tableContainer.appendChild(container);
    }
    container.innerHTML = html;

    const clearBtn = container.querySelector('#bulk-clear');
    clearBtn.addEventListener('click', () => {
      state.selected.clear();
      render();
      hideBulkActionsBar();
      if (els.selectAll) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
    });
    container.querySelector('#bulk-email').addEventListener('click', () => console.log('Bulk email', Array.from(state.selected)));
    container.querySelector('#bulk-sequence').addEventListener('click', () => console.log('Bulk add to sequence', Array.from(state.selected)));
    container.querySelector('#bulk-call').addEventListener('click', () => console.log('Bulk call', Array.from(state.selected)));
    container.querySelector('#bulk-addlist').addEventListener('click', () => console.log('Bulk add to list', Array.from(state.selected)));
    container.querySelector('#bulk-export').addEventListener('click', () => console.log('Bulk export', Array.from(state.selected)));
    container.querySelector('#bulk-ai').addEventListener('click', () => console.log('Bulk research with AI', Array.from(state.selected)));
    const delBtn = container.querySelector('#bulk-delete');
    if (delBtn) delBtn.addEventListener('click', () => openBulkDeleteConfirm());
  }

  // ===== Bulk delete confirm popover and deletion =====
  let _onAcctDelKeydown = null;
  let _onAcctDelOutside = null;

  function closeBulkDeleteConfirm() {
    const pop = document.getElementById('accounts-delete-popover');
    const backdrop = document.getElementById('accounts-delete-backdrop');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (_onAcctDelKeydown) { document.removeEventListener('keydown', _onAcctDelKeydown); _onAcctDelKeydown = null; }
    if (_onAcctDelOutside) { document.removeEventListener('mousedown', _onAcctDelOutside, true); _onAcctDelOutside = null; }
  }

  function openBulkDeleteConfirm() {
    if (document.getElementById('accounts-delete-popover')) return;
    const bar = els.page && els.page.querySelector('#accounts-bulk-actions');
    if (!bar) return;
    const delBtn = bar.querySelector('#bulk-delete');

    // Backdrop for click-away
    const backdrop = document.createElement('div');
    backdrop.id = 'accounts-delete-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.background = 'transparent';
    backdrop.style.zIndex = '955';
    document.body.appendChild(backdrop);

    // Popover content (centered)
    const pop = document.createElement('div');
    pop.id = 'accounts-delete-popover';
    pop.className = 'bulk-delete-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Confirm delete accounts');
    pop.innerHTML = `
      <div class="bulk-delete-message">Delete ${state.selected.size} ${state.selected.size === 1 ? 'account' : 'accounts'}?</div>
      <div class="bulk-delete-note">This action cannot be undone.</div>
      <div class="bulk-delete-actions">
        <button class="btn-text" id="acct-del-cancel">Cancel</button>
        <button class="btn-danger" id="acct-del-confirm">${svgIcon('delete')}<span>Delete</span></button>
      </div>`;

    // Add to body to allow centered fixed positioning
    document.body.appendChild(pop);

    // Compute pointer position to point towards the Delete button
    try {
      const btnRect = delBtn ? delBtn.getBoundingClientRect() : null;
      const popRect = pop.getBoundingClientRect();
      if (btnRect && popRect && popRect.width > 0) {
        const btnCenterX = btnRect.left + btnRect.width / 2;
        const leftWithinPop = Math.max(12, Math.min(popRect.width - 12, btnCenterX - popRect.left));
        pop.style.setProperty('--arrow-left', leftWithinPop + 'px');
      }
    } catch (_) { /* noop */ }

    const cancel = pop.querySelector('#acct-del-cancel');
    const confirm = pop.querySelector('#acct-del-confirm');
    if (cancel) cancel.addEventListener('click', () => closeBulkDeleteConfirm());
    if (confirm) confirm.addEventListener('click', async () => {
      closeBulkDeleteConfirm();
      await deleteSelectedAccounts();
    });

    const f = confirm || cancel;
    f && f.focus && f.focus();
    _onAcctDelKeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeBulkDeleteConfirm(); } };
    document.addEventListener('keydown', _onAcctDelKeydown);
    _onAcctDelOutside = (e) => { const t = e.target; if (!pop.contains(t)) closeBulkDeleteConfirm(); };
    document.addEventListener('mousedown', _onAcctDelOutside, true);
  }

  // Delete selected accounts from Firestore and local state
  async function deleteSelectedAccounts() {
    const ids = Array.from(state.selected || []);
    if (!ids.length) return;
    
    // Show progress toast
    const progressToast = window.crm?.showProgressToast ? 
      window.crm.showProgressToast(`Deleting ${ids.length} ${ids.length === 1 ? 'account' : 'accounts'}...`, ids.length, 0) : null;
    
    let failed = 0;
    let completed = 0;
    
    try {
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Process deletions sequentially to show progress
        for (const id of ids) {
          try {
            await window.firebaseDB.collection('accounts').doc(id).delete();
            completed++;
            if (progressToast) {
              progressToast.update(completed, ids.length);
            }
          } catch (e) {
            failed++;
            completed++;
            console.warn('Account delete failed for id', id, e);
            if (progressToast) {
              progressToast.update(completed, ids.length);
            }
          }
        }
      } else {
        // If no database, just mark all as completed
        completed = ids.length;
        if (progressToast) {
          progressToast.update(completed, ids.length);
        }
      }
    } catch (err) {
      console.warn('Bulk account delete error', err);
      if (progressToast) {
        progressToast.error('Delete operation failed');
      }
    } finally {
      // Update local state
      if (Array.isArray(state.data) && state.data.length) {
        const idSet = new Set(ids);
        state.data = state.data.filter((a) => a && !idSet.has(a.id));
      }
      if (Array.isArray(state.filtered) && state.filtered.length) {
        const idSet = new Set(ids);
        state.filtered = state.filtered.filter((a) => a && !idSet.has(a.id));
      }
      state.selected.clear();
      render();
      hideBulkActionsBar();
      if (els.selectAll) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
      
      const successCount = Math.max(0, ids.length - failed);
      
      if (progressToast) {
        if (failed === 0) {
          progressToast.complete(`Successfully deleted ${successCount} ${successCount === 1 ? 'account' : 'accounts'}`);
        } else if (successCount > 0) {
          progressToast.complete(`Deleted ${successCount} of ${ids.length} ${ids.length === 1 ? 'account' : 'accounts'}`);
        } else {
          progressToast.error(`Failed to delete all ${ids.length} ${ids.length === 1 ? 'account' : 'accounts'}`);
        }
      } else {
        // Fallback to regular toasts if progress toast not available
        if (successCount > 0) {
          try { window.crm?.showToast && window.crm.showToast(`Deleted ${successCount} ${successCount === 1 ? 'account' : 'accounts'}`); } catch (_) {}
        }
        if (failed > 0) {
          try { window.crm?.showToast && window.crm.showToast(`Failed to delete ${failed} ${failed === 1 ? 'account' : 'accounts'}`); } catch (_) {}
        }
      }
    }
  }

  function toggleSelectAll(checked) {
    const pageItems = getPageItems();
    if (checked) pageItems.forEach((a) => state.selected.add(a.id));
    else pageItems.forEach((a) => state.selected.delete(a.id));
    updateRowsCheckedState();
    updateSelectAllState();
  }

  function getTotalPages() { return Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); }

  function getPageItems() {
    const total = state.filtered.length;
    const totalPages = getTotalPages();
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    const start = (state.currentPage - 1) * state.pageSize;
    const end = Math.min(total, start + state.pageSize);
    return state.filtered.slice(start, end);
  }

  function renderPagination() {
    if (!els.pagination) return;
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
      }, els.pagination.id);
    } else {
      // Fallback to simple pagination if unified component not available
      els.pagination.innerHTML = `<div class="unified-pagination">
        <button class="pagination-arrow" ${current <= 1 ? 'disabled' : ''} onclick="if(${current} > 1) { state.currentPage = ${current - 1}; render(); (function(){ var s=document.querySelector('#accounts-page .table-scroll'); if(s){ s.scrollTop=0; } window.scrollTo(0,0); })(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
        </button>
        <div class="pagination-current">${current}</div>
        <button class="pagination-arrow" ${current >= totalPages ? 'disabled' : ''} onclick="if(${current} < ${totalPages}) { state.currentPage = ${current + 1}; render(); (function(){ var s=document.querySelector('#accounts-page .table-scroll'); if(s){ s.scrollTop=0; } window.scrollTo(0,0); })(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>
        </button>
      </div>`;
    }

    if (els.paginationSummary) {
      const label = total === 1 ? 'account' : 'accounts';
      els.paginationSummary.textContent = `Showing ${start}\u2013${end} of ${total} ${label}`;
    }
  }

  // Expose minimal global API for other modules (e.g., AccountDetail)
  window.getAccountsData = function () {
    try { return Array.isArray(state.data) ? state.data : []; } catch (_) { return []; }
  };
  function getCurrentState(){
    return {
      page: 'accounts',
      scroll: window.scrollY || 0,
      currentPage: state.currentPage || 1,
      filters: {
        // Add any account-specific filters here
      },
      searchTerm: els.quickSearch?.value || '',
      selectedItems: getSelectedAccounts().map(a => a.id || a.accountId || a._id),
      sortColumn: state.sortColumn || '',
      sortDirection: state.sortDirection || 'asc',
      timestamp: Date.now()
    };
  }

  window.accountsModule = {
    rebindDynamic: function () {
      try {
        if (!els.page) initDomRefs();
        // Reattach dynamic handlers that might be removed during detail view
        attachEvents();
      } catch (e) { /* noop */ }
    },
    init,
    getCurrentState
  };

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
