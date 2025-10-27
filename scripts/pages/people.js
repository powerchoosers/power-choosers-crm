'use strict';

// People page module: filtering + table render, Firestore-backed (client-side filtering initially)
(function () {
  const state = {
    data: [], // raw contacts
    filtered: [],
    loaded: false,
    selected: new Set(), // ids of selected contacts
    pageSize: 50,
    currentPage: 1,
    searchMode: false, // NEW - Algolia search active
    searchQuery: '',   // NEW - Current search query
    hasMore: false,    // NEW - More records available for pagination
    lastDoc: null,     // NEW - Last Firestore document for pagination
    allContactsCache: null, // NEW - Full cache for load more
    totalCount: 0,     // NEW - Total contacts in database (for footer display)
    hasAnimated: false, // NEW - Track if initial animation has played
    // Tokenized filters
    titleTokens: [],
    companyTokens: [],
    cityTokens: [],
    stateTokens: [],
    statusTokens: [],
    employeesTokens: [],
    industryTokens: [],
    visitorDomainTokens: [],
    seniorityTokens: [],
    departmentTokens: [],
    // Suggestion pools (built after load)
    titlePool: [],
    companyPool: [],
    cityPool: [],
    statePool: [],
    employeesPool: [],
    industryPool: [],
    visitorDomainPool: [],
    seniorityPool: [],
    departmentPool: [],
  };

  // Column order for People table headers (draggable)
  const DEFAULT_CONTACTS_COL_ORDER = ['select','name','title','company','email','phone','location','actions','updated'];
  const CONTACTS_COL_STORAGE_KEY = 'contacts_column_order_v2';
  let contactsColumnOrder = DEFAULT_CONTACTS_COL_ORDER.slice();
  function loadPeopleColumnOrder() {
    try {
      const raw = localStorage.getItem(CONTACTS_COL_STORAGE_KEY);
      if (!raw) return DEFAULT_CONTACTS_COL_ORDER.slice();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return DEFAULT_CONTACTS_COL_ORDER.slice();
      // Validate and ensure every default key exists exactly once
      const seen = new Set();
      const ordered = [];
      for (const k of arr) {
        if (DEFAULT_CONTACTS_COL_ORDER.includes(k) && !seen.has(k)) { seen.add(k); ordered.push(k); }
      }
      for (const k of DEFAULT_CONTACTS_COL_ORDER) if (!seen.has(k)) ordered.push(k);
      return ordered;
    } catch (e) {
      return DEFAULT_CONTACTS_COL_ORDER.slice();
    }
  }

  // Listen for restore event from back button navigation
  if (!document._peopleRestoreBound) {
    document.addEventListener('pc:people-restore', (ev) => {
      try {
        const detail = ev && ev.detail ? ev.detail : {};
        // console.log('[People] RESTORE EVENT RECEIVED from back button:', detail);
        // console.log('[People] Current state before restore:', {
        //   currentPage: state.currentPage,
        //   searchTerm: els.quickSearch?.value || '',
        //   sortColumn: state.sortColumn,
        //   sortDirection: state.sortDirection
        // });
        
        // Restore pagination
        const targetPage = Math.max(1, parseInt(detail.currentPage || detail.page || state.currentPage || 1, 10));
        if (targetPage !== state.currentPage) {
          state.currentPage = targetPage;
        }
        
        // Restore filters
        if (detail.filters) {
          const filters = detail.filters;
          if (filters.titleTokens) state.titleTokens = [...filters.titleTokens];
          if (filters.companyTokens) state.companyTokens = [...filters.companyTokens];
          if (filters.cityTokens) state.cityTokens = [...filters.cityTokens];
          if (filters.stateTokens) state.stateTokens = [...filters.stateTokens];
          if (filters.statusTokens) state.statusTokens = [...filters.statusTokens];
          if (filters.employeesTokens) state.employeesTokens = [...filters.employeesTokens];
          if (filters.industryTokens) state.industryTokens = [...filters.industryTokens];
          if (filters.visitorDomainTokens) state.visitorDomainTokens = [...filters.visitorDomainTokens];
          if (filters.seniorityTokens) state.seniorityTokens = [...filters.seniorityTokens];
          if (filters.departmentTokens) state.departmentTokens = [...filters.departmentTokens];
          if (filters.hasEmail !== undefined) state.hasEmail = filters.hasEmail;
          if (filters.hasPhone !== undefined) state.hasPhone = filters.hasPhone;
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
        
        // Re-initialize drag and drop after restoration
        setTimeout(() => {
          try {
            // console.log('[People] Re-initializing drag and drop after restore');
            if (typeof window !== 'undefined' && typeof window.initContactsColumnDnD === 'function') {
              try { window.initContactsColumnDnD(); } catch (e) { /* noop */ }
            } else {
              initPeopleHeaderDnD();
            }
            attachHeaderDnDHooks();
          } catch (e) {
            // console.warn('[People] Failed to re-initialize drag and drop:', e);
          }
        }, 100);
        
        // Restore scroll position
        const y = parseInt(detail.scroll || 0, 10);
        setTimeout(() => {
          try { window.scrollTo(0, y); } catch (_) {}
        }, 100);
        
        // Restore selected items
        if (detail.selectedItems && Array.isArray(detail.selectedItems)) {
          setTimeout(() => {
            try {
              detail.selectedItems.forEach(id => {
                const checkbox = document.querySelector(`input[data-contact-id="${id}"]`);
                if (checkbox && !checkbox.checked) {
                  checkbox.checked = true;
                  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
            } catch (_) {}
          }, 150);
        }
        
        // Clear restoring hint flag with longer delay to ensure stability
        try {
          setTimeout(() => { 
            try { 
              if (window.__restoringPeople) {
                window.__restoringPeople = false; 
                // console.log('[People] ✓ Cleared restoration flag - navigation complete');
              }
            } catch(_){} 
          }, 2000); // 2 seconds delay
        } catch (_) {}
        
        // console.log('[People] State restored successfully');
      } catch (e) { 
        console.error('[People] Error restoring state:', e);
      }
    });
    document._peopleRestoreBound = true;
  }

  // ===== Bulk Add-to-List popover =====
  function closeBulkListsPanel() {
    const panel = document.getElementById('people-lists-panel');
    const cleanup = () => {
      if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
      try { document.removeEventListener('mousedown', _onListsOutside, true); } catch(_) {}
    };
    if (panel) panel.classList.remove('--show');
    setTimeout(cleanup, 120);

    try { document.removeEventListener('keydown', _onListsKeydown, true); } catch(_) {}
    try { window.removeEventListener('resize', _positionListsPanel, true); } catch(_) {}
    try { window.removeEventListener('scroll', _positionListsPanel, true); } catch(_) {}
    _onListsKeydown = null; _positionListsPanel = null; _onListsOutside = null;
  }

  let _onListsKeydown = null;
  let _positionListsPanel = null;
  let _onListsOutside = null;

  function openBulkListsPanel() {
    if (document.getElementById('people-lists-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'people-lists-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Add to list');
    panel.innerHTML = `
      <div class="list-header">Add ${state.selected.size} ${state.selected.size === 1 ? 'person' : 'people'} to list</div>
      <div class="list-body" id="people-lists-body">
        <div class="list-item" tabindex="0" data-action="create">
          <div>
            <div class="list-name">Create new list…</div>
            <div class="list-meta">Create a people list</div>
          </div>
        </div>
      </div>
      <div class="list-footer">
        <button type="button" class="btn" id="lists-cancel">Cancel</button>
      </div>`;
    document.body.appendChild(panel);

    // Position under the bulk bar, centered over the table container
    _positionListsPanel = function position() {
      const container = els.page ? els.page.querySelector('.table-container') : null;
      const bar = els.page ? els.page.querySelector('#people-bulk-actions .bar') : null;
      const cr = container ? container.getBoundingClientRect() : { left: 8, width: window.innerWidth - 16 };
      const br = bar ? bar.getBoundingClientRect() : { bottom: 72 };
      const top = Math.max(8, br.bottom + 8);
      const left = Math.max(8, cr.left + (cr.width - panel.offsetWidth) / 2);
      const maxLeft = window.innerWidth - panel.offsetWidth - 8;
      panel.style.top = `${top}px`;
      panel.style.left = `${Math.min(left, maxLeft)}px`;
    };
    _positionListsPanel();
    if (!document._peopleListsResizeBound) {
    window.addEventListener('resize', _positionListsPanel, true);
      document._peopleListsResizeBound = true;
    }
    if (!document._peopleListsScrollBound) {
    window.addEventListener('scroll', _positionListsPanel, true);
      document._peopleListsScrollBound = true;
    }

    // Animate in
    requestAnimationFrame(() => { panel.classList.add('--show'); });

    // Load lists
    populateListsPanel(panel.querySelector('#people-lists-body'));

    // Footer
    panel.querySelector('#lists-cancel')?.addEventListener('click', () => closeBulkListsPanel());

    // Focus behavior
    setTimeout(() => { const first = panel.querySelector('.list-item, .btn'); if (first) first.focus(); }, 0);
    _onListsKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeBulkListsPanel(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList?.contains('list-item')) {
        e.preventDefault();
        const el = document.activeElement; handleListChoose(el);
      }
    };
    if (!document._peopleListsKeydownBound) {
    document.addEventListener('keydown', _onListsKeydown, true);
      document._peopleListsKeydownBound = true;
    }

    // Click-away
    _onListsOutside = (e) => {
      const inside = panel.contains(e.target);
      const isTrigger = !!(e.target.closest && e.target.closest('#people-bulk-actions'));
      if (!inside && !isTrigger) closeBulkListsPanel();
    };
    if (!document._peopleListsMousedownBound) {
    document.addEventListener('mousedown', _onListsOutside, true);
      document._peopleListsMousedownBound = true;
    }

    function handleListChoose(el) {
      const action = el.getAttribute('data-action');
      if (action === 'create') {
        const name = window.prompt('New list name');
        if (!name) return;
        createListThenAdd(name.trim());
        return;
      }
      const id = el.getAttribute('data-id');
      const name = el.getAttribute('data-name') || 'List';
      addSelectedPeopleToList(id, name);
    }

    async function createListThenAdd(name) {
      try {
        let newId = null;
        if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
          const payload = { name, kind: 'people', recordCount: 0 };
          if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
            payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
            payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
          } else {
            payload.createdAt = new Date();
            payload.updatedAt = new Date();
          }
          const ref = await window.firebaseDB.collection('lists').add(payload);
          newId = ref.id;
        }
        if (newId) {
          await addSelectedPeopleToList(newId, name);
        } else {
          // Offline fallback: just toast and close
          window.crm?.showToast && window.crm.showToast(`Created list "${name}" (offline)`);
          closeBulkListsPanel();
        }
      } catch (err) {
        console.warn('Create list failed', err);
        window.crm?.showToast && window.crm.showToast('Failed to create list');
      }
    }

    async function addSelectedPeopleToList(listId, listName) {
      try {
        const ids = Array.from(state.selected || []);
        if (!ids.length) { closeBulkListsPanel(); return; }
        if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
          // Use top-level listMembers for compatibility with lists.js
          const ops = ids.map(id => {
            const doc = { listId, targetId: id, targetType: 'people' };
            if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
              doc.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
              doc.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
            } else {
              doc.createdAt = new Date();
              doc.updatedAt = new Date();
            }
            return window.firebaseDB.collection('listMembers').add(doc);
          });
          await Promise.all(ops);
          
          // Refresh list membership if we're on a list detail page
          if (window.ListDetail && window.ListDetail.refreshListMembership) {
            window.ListDetail.refreshListMembership();
          }
          
          // Refresh list counts on the lists overview page
          if (window.ListsOverview && window.ListsOverview.refreshCounts) {
            window.ListsOverview.refreshCounts();
          }
        }
        window.crm?.showToast && window.crm.showToast(`Added ${ids.length} to "${listName}"`);
      } catch (err) {
        console.warn('Add to list failed', err);
        window.crm?.showToast && window.crm.showToast('Failed to add to list');
      } finally {
        closeBulkListsPanel();
      }
    }
  }

  async function populateListsPanel(container) {
    if (!container) return;
    // Loading state
    container.innerHTML += `<div class="list-item" tabindex="-1" aria-disabled="true"><div><div class="list-name">Loading lists…</div><div class="list-meta">Please wait</div></div></div>`;
    try {
      let items = [];
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        let q = window.firebaseDB.collection('lists');
        if (q.where) q = q.where('kind', '==', 'people');
        const snap = await (q.limit ? q.limit(200).get() : q.get());
        items = (snap && snap.docs) ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      }
      // Sort by updatedAt/createdAt desc
      items.sort((a, b) => {
        const ad = (a.updatedAt || a.createdAt || 0);
        const bd = (b.updatedAt || b.createdAt || 0);
        const av = toMillis(ad), bv = toMillis(bd);
        return bv - av;
      });
      const listHtml = items.slice(0, 50).map(it => {
        const count = (typeof it.count === 'number') ? it.count : (it.recordCount || 0);
        return `<div class="list-item" tabindex="0" data-id="${escapeHtml(it.id || '')}" data-name="${escapeHtml(it.name || 'List')}">
          <div>
            <div class="list-name">${escapeHtml(it.name || 'Untitled')}</div>
            <div class="list-meta">${count} member${count === 1 ? '' : 's'}</div>
          </div>
        </div>`;
      }).join('');
      // Replace loading row
      const createRow = container.querySelector('.list-item[data-action="create"]');
      container.innerHTML = '';
      if (createRow) container.appendChild(createRow);
      container.insertAdjacentHTML('beforeend', listHtml || `<div class="list-item" tabindex="-1" aria-disabled="true"><div><div class="list-name">No lists found</div><div class="list-meta">Create a new list</div></div></div>`);
      // Rebind click handlers
      container.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', () => {
          if (el.getAttribute('aria-disabled') === 'true') return;
          if (el.getAttribute('data-action') === 'create') {
            const active = document.activeElement;
            if (active && active.blur) active.blur();
            const evt = new KeyboardEvent('keydown', { key: 'Enter' });
            document.dispatchEvent(evt);
          } else {
            // Simulate Enter on focused element
            el.focus();
            const evt = new KeyboardEvent('keydown', { key: 'Enter' });
            document.dispatchEvent(evt);
          }
        });
      });
    } catch (err) {
      console.warn('Failed to load lists', err);
    }

    function toMillis(val) {
      try {
        if (!val) return 0;
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().getTime();
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return new Date(val).getTime();
        if (val && typeof val.seconds === 'number') return val.seconds * 1000;
      } catch {}
      return 0;
    }
  }

  // Helper: find account by domain (preferred) or exact normalized name
  function findAccountByDomainOrName(domain, name, accountsData = null) {
    const list = accountsData || ((typeof window !== 'undefined' && typeof window.getAccountsData === 'function') ? window.getAccountsData() : []);
    const normDomain = normalizeDomain(domain);
    if (normDomain) {
      const byDom = list.find((a) => normalizeDomain(a && (a.domain || a.website || a.site)) === normDomain);
      if (byDom) return byDom;
    }
    const normName = String(name || '').trim().toLowerCase();
    if (normName) {
      const byName = list.find((a) => String((a && (a.accountName || a.name || a.companyName)) || '').trim().toLowerCase() === normName);
      if (byName) return byName;
    }
    return null;
  }

  function normalizeDomain(d) {
    const s = String(d || '').trim();
    if (!s) return '';
    return s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
  function persistPeopleColumnOrder(order) {
    try { localStorage.setItem(CONTACTS_COL_STORAGE_KEY, JSON.stringify(order)); } catch (e) { /* noop */ }
  }

  const els = {};

  function qs(id) {
    // Prefer querying within the People page container to avoid duplicate-ID collisions
    if (els.page) return els.page.querySelector('#' + id);
    return document.getElementById(id);
  }

  // ===== DEBUG HELPERS (temporary) =====
  function _debugCheckChip(where, containerOrChip) {
    try {
      const chip = containerOrChip && containerOrChip.classList && containerOrChip.classList.contains('chip')
        ? containerOrChip
        : (containerOrChip ? containerOrChip.querySelector('.chip') : null);
      if (!chip) {
        return;
      }
      const cs = window.getComputedStyle(chip);
    } catch (e) {
    }
  }

  function _debugSetupInputs(scopeEl) {
    try {
      const root = scopeEl || document.getElementById('people-filters') || document;
      const inputs = root.querySelectorAll('.chip-input-field');
      inputs.forEach((inp) => {
        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('autocapitalize', 'off');
        inp.setAttribute('autocorrect', 'off');
        inp.setAttribute('spellcheck', 'false');
        inp.setAttribute('aria-autocomplete', 'list');
      });
    } catch (e) {
    }
  }

  function _debugObserveChips() {
    try {
      const root = document.getElementById('people-filters');
      if (!root) return;
      const obs = new MutationObserver((muts) => {
        muts.forEach((m) => {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 && n.classList && n.classList.contains('chip')) {
              _debugCheckChip('mutation', n);
            }
          });
        });
      });
      obs.observe(root, { childList: true, subtree: true });
    } catch (e) {
    }
  }

  // Activate debug once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _debugSetupInputs(); _debugObserveChips(); _debugFlexLayout(); });
  } else {
    _debugSetupInputs();
    _debugObserveChips();
    _debugFlexLayout();
  }

  // Debug function to track flex layout changes
  function _debugFlexLayout() {
    try {
      const cityContainer = document.querySelector('#people-filters .chip-input');
      if (cityContainer) {
        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            // console.log('[Flex Debug] Container resized:', {
            //   width: entry.contentRect.width,
            //   height: entry.contentRect.height,
            //   target: entry.target.className
            // });
          }
        });
        resizeObserver.observe(cityContainer);
        
        // Also observe the input field
        const inputField = cityContainer.querySelector('.chip-input-field');
        if (inputField) {
          resizeObserver.observe(inputField);
        }
      }
    } catch (e) {
      console.warn('[Flex Debug] Error setting up flex layout observer:', e);
    }
  }

  // Helper function to add removal animation to chip remove buttons
  function addChipRemoveAnimation(container, tokens, renderFunction) {
    if (!container) return;
    const fieldId = (container && container.id) ? container.id : '(unknown-field)';
    container.querySelectorAll('.chip-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const i = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (!isNaN(i) && !btn.disabled) {
          // Disable button to prevent double-clicks
          btn.disabled = true;
          
          // Add removal animation
          const chip = btn.closest('.chip');
          if (chip && !chip.classList.contains('chip-removing')) {
            // If another chip is already removing, ignore to avoid layout churn
            const existing = container.querySelector('.chip-removing');
            if (existing && existing !== chip) {
              try { console.warn('[Chips][skip-second-remove]', fieldId, { index: i }); } catch(_) {}
              return;
            }
            // If this chip is already removing, ignore
            if (chip.classList.contains('chip-removing')) {
              try { console.warn('[Chips][already-removing]', fieldId, { index: i }); } catch(_) {}
              return;
            }
            // try { console.log('[Chips][remove-click]', fieldId, { index: i, tokensBefore: (tokens||[]).slice() }); } catch(_) {}
            // Log pre-layout chip rects
            try {
              const rects = Array.from(container.querySelectorAll('.chip')).map((c, idx) => ({ idx, left: c.getBoundingClientRect().left, width: c.offsetWidth, removing: c.classList.contains('chip-removing') }));
              // console.log('[Chips][pre-layout]', fieldId, rects);
            } catch(_) {}
            // Set explicit starting width so width -> 0 is smooth
            try { chip.style.width = chip.offsetWidth + 'px'; /* force reflow */ void chip.offsetWidth; } catch(_) {}
            requestAnimationFrame(() => {
              chip.classList.add('chip-removing');
            });
            // After transition, remove chip from tokens and re-render
            let handled = false;
            const onTransitionEnd = (ev) => {
              // Only handle once, and only for the width transition of this chip
              if (handled) return;
              if (ev && ev.target !== chip) return;
              if (ev && ev.propertyName && ev.propertyName !== 'width') return;
              handled = true;
              chip.removeEventListener('transitionend', onTransitionEnd);
              try { tokens.splice(i, 1); } catch (_) {}
               // try { console.log('[Chips][removed]', fieldId, { index: i, tokensAfter: (tokens||[]).slice() }); } catch(_) {}
               // Log post-layout intention (new tokens)
               // try { console.log('[Chips][re-render]', fieldId, { remaining: tokens.slice() }); } catch(_) {}
               // console.log('[Chips][calling-renderFunction]', fieldId, 'about to call renderFunction');
               renderFunction();
               // console.log('[Chips][calling-applyFilters]', fieldId, 'about to call applyFilters');
               applyFilters();
            };
            chip.addEventListener('transitionend', onTransitionEnd);
            // Fallback in case transitionend doesn't fire
            setTimeout(() => { onTransitionEnd(); }, 300);
          }
        }
      });
    });
  }

  // Helper function to add a single new chip with animation
  function addNewChipWithAnimation(container, token, tokens, renderFunction) {
    if (!container) return;
    
    // Debug: Log container state before adding chip
    const containerRect = container.getBoundingClientRect();
    const containerStyle = window.getComputedStyle(container);
    const inputField = container.querySelector('.chip-input-field');
    const inputRect = inputField ? inputField.getBoundingClientRect() : null;
    const inputStyle = inputField ? window.getComputedStyle(inputField) : null;
    
    // console.log('[Flex Debug] Before adding chip:', {
    //   containerWidth: containerRect.width,
    //   containerHeight: containerRect.height,
    //   containerFlexWrap: containerStyle.flexWrap,
    //   containerAlignItems: containerStyle.alignItems,
    //   containerAlignContent: containerStyle.alignContent,
    //   inputWidth: inputRect ? inputRect.width : 'N/A',
    //   inputFlex: inputStyle ? inputStyle.flex : 'N/A',
    //   inputFlexShrink: inputStyle ? inputStyle.flexShrink : 'N/A',
    //   inputMaxWidth: inputStyle ? inputStyle.maxWidth : 'N/A',
    //   existingChips: container.querySelectorAll('.chip').length,
    //   token: token
    // });
    
    const chipHTML = `
      <span class="chip chip-new" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${tokens.length}">
        <span class="chip-label">${escapeHtml(token)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(token)}" data-idx="${tokens.length}">&#215;</button>
      </span>
    `;
    container.insertAdjacentHTML('beforeend', chipHTML);
    
    // Debug: Log container state after adding chip
    setTimeout(() => {
      const newContainerRect = container.getBoundingClientRect();
      const newInputRect = inputField ? inputField.getBoundingClientRect() : null;
      const newChip = container.lastElementChild;
      const chipRect = newChip ? newChip.getBoundingClientRect() : null;
      
      // Debug: Check if input field is still in DOM
      const inputStillExists = container.contains(inputField);
      const inputDisplay = inputField ? window.getComputedStyle(inputField).display : 'N/A';
      const inputVisibility = inputField ? window.getComputedStyle(inputField).visibility : 'N/A';
      
      // console.log('[Flex Debug] After adding chip:', {
      //   containerWidth: newContainerRect.width,
      //   containerHeight: newContainerRect.height,
      //   inputWidth: newInputRect ? newInputRect.width : 'N/A',
      //   inputTop: newInputRect ? newInputRect.top : 'N/A',
      //   chipWidth: chipRect ? chipRect.width : 'N/A',
      //   chipTop: chipRect ? chipRect.top : 'N/A',
      //   inputBelowChip: newInputRect && chipRect ? newInputRect.top > chipRect.top : 'N/A',
      //   totalChips: container.querySelectorAll('.chip').length,
      //   inputStillInDOM: inputStillExists,
      //   inputDisplay: inputDisplay,
      //   inputVisibility: inputVisibility
      // });
    }, 10);
    
    // Add event listener to the new chip
    const newChip = container.lastElementChild;
    const removeBtn = newChip.querySelector('.chip-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const i = parseInt(removeBtn.getAttribute('data-idx') || '-1', 10);
        if (!isNaN(i) && !removeBtn.disabled) {
          // Disable button to prevent double-clicks
          removeBtn.disabled = true;
          
          const chip = removeBtn.closest('.chip');
          if (chip && !chip.classList.contains('chip-removing')) {
            // try { console.log('[Chips][remove-click]', (container && container.id) || '(unknown-field)', { index: i, tokensBefore: (tokens||[]).slice() }); } catch(_) {}
            try { chip.style.width = chip.offsetWidth + 'px'; void chip.offsetWidth; } catch(_) {}
            requestAnimationFrame(() => { chip.classList.add('chip-removing'); });
            let handled = false;
            const onTransitionEnd = (ev) => {
              if (handled) return;
              if (ev && ev.target !== chip) return;
              if (ev && ev.propertyName && ev.propertyName !== 'width') return;
              handled = true;
              chip.removeEventListener('transitionend', onTransitionEnd);
              try { tokens.splice(i, 1); } catch (_) {}
              // try { console.log('[Chips][removed]', (container && container.id) || '(unknown-field)', { index: i, tokensAfter: (tokens||[]).slice() }); } catch(_) {}
              renderFunction();
              applyFilters();
            };
            chip.addEventListener('transitionend', onTransitionEnd);
            setTimeout(() => { onTransitionEnd(); }, 300);
          }
        }
      });
    }
    
    // Remove the animation class after animation completes
    setTimeout(() => {
      newChip.classList.remove('chip-new');
      newChip.classList.add('chip-existing');
    }, 300);
  }

  // Inject CRM-themed styles for People bulk popover and actions bar
  function injectPeopleBulkStyles() {
    if (document.getElementById('people-bulk-styles')) return; // prevent duplicate injection
    const style = document.createElement('style');
    style.id = 'people-bulk-styles';
    style.textContent = `
      /* Ensure absolute children anchor to the table container */
#people-page .table-container { position: relative; overflow: visible; }

/* Scroll smoothness improvements */
#people-page .table-scroll {
  scrollbar-gutter: stable both-edges;
  overscroll-behavior: contain;
  overflow-anchor: none;
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  contain: paint layout;
}

      /* Backdrop used by the bulk select popover */
      .bulk-select-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 800; }

      /* Bulk selection popover */
      #people-bulk-popover.bulk-select-popover {
        position: absolute; z-index: 900;
        background: var(--bg-card); color: var(--text-primary);
        border: 1px solid var(--border-light); border-radius: var(--border-radius-md);
        box-shadow: var(--elevation-popover);
        padding: 10px; min-width: 260px; max-width: 360px;
      }

      /* Bulk actions modal styled like Calls page */
      #people-bulk-actions.bulk-actions-modal {
        position: absolute;
        left: 50%; transform: translateX(-50%);
        top: 8px;
        width: max-content; max-width: none;
        background: var(--bg-card); color: var(--text-primary);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-lg);
        box-shadow: var(--elevation-card);
        padding: 8px 12px; z-index: 850;
      }

      #people-bulk-actions .bar { display: flex; align-items: center; gap: 8px; }
      #people-bulk-actions .spacer { flex: 1 1 auto; }
      #people-bulk-actions .action-btn-sm {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 10px; line-height: 1; cursor: pointer;
        background: var(--bg-item); color: var(--text-inverse);
        border: 1px solid var(--border-light);
        border-radius: var(--border-radius-sm);
        font-size: 0.85rem; flex: 0 0 auto;
      }
      #people-bulk-actions .action-btn-sm:hover { background: var(--grey-700); }
      #people-bulk-actions .action-btn-sm.danger { background: var(--red-muted); border-color: var(--red-subtle); color: var(--text-inverse); }
      #people-bulk-actions .action-btn-sm svg { display: block; }
      #people-bulk-actions .action-btn-sm span { display: inline-block; white-space: nowrap; }
      #people-bulk-actions #bulk-ai svg { transform: translateY(2px); }

      /* Sequence/List panels (People page) — subtle popover centered over table container */
      #people-sequence-panel, #people-lists-panel { position: fixed; z-index: 901; width: min(560px, 92vw);
        background: var(--bg-modal, #262a30) !important; color: var(--text-inverse); border: 1px solid var(--grey-700);
        border-radius: var(--border-radius); box-shadow: var(--shadow-xl);
        transform: translateY(-8px); opacity: 0; transition: transform 400ms ease, opacity 400ms ease; overflow: hidden;
        background-clip: padding-box; clip-path: inset(0 round var(--border-radius)); isolation: isolate; }
      #people-sequence-panel.--show, #people-lists-panel.--show { transform: translateY(0); opacity: 1; }
      #people-sequence-panel .seq-header, #people-lists-panel .list-header { padding: 14px 16px; border-bottom: 1px solid var(--grey-700); font-weight: 700; background: var(--bg-modal, #262a30) !important; }
      #people-sequence-panel .seq-body, #people-lists-panel .list-body { max-height: min(70vh, 720px); overflow: auto; background: var(--bg-modal, #262a30) !important; }
    #people-sequence-panel .seq-body::-webkit-scrollbar, #people-lists-panel .list-body::-webkit-scrollbar { width: 10px; }
    #people-sequence-panel .seq-body::-webkit-scrollbar-thumb, #people-lists-panel .list-body::-webkit-scrollbar-thumb { background: var(--grey-700); border-radius: 8px; }
      #people-sequence-panel .seq-item, #people-lists-panel .list-item { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; cursor:pointer; background: var(--bg-modal, #262a30) !important; border-top: 1px solid rgba(255,255,255,0.04); }
    #people-sequence-panel .seq-item:first-child, #people-lists-panel .list-item:first-child { border-top: 0; }
    #people-sequence-panel .seq-item:hover, #people-lists-panel .list-item:hover { background: var(--grey-800) !important; }
      #people-sequence-panel .seq-item:focus, #people-lists-panel .list-item:focus { outline: none; box-shadow: 0 0 0 3px rgba(255,139,0,.35) inset; }
      #people-sequence-panel .seq-name, #people-lists-panel .list-name { font-weight: 600; }
      #people-sequence-panel .seq-meta, #people-lists-panel .list-meta { color: var(--text-muted); font-size: .85rem; }
      #people-sequence-panel .seq-footer, #people-lists-panel .list-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top: 1px solid var(--grey-700); background: var(--bg-modal, #262a30) !important; }
      #people-sequence-panel .btn, #people-lists-panel .btn { border: 1px solid var(--grey-700); background: var(--grey-850); color: var(--text-inverse); border-radius: var(--border-radius-sm); padding:6px 10px; }
      #people-sequence-panel .btn:focus, #people-lists-panel .btn:focus { outline: none; box-shadow: 0 0 0 3px rgba(255,139,0,.35); }
      #people-sequence-panel .btn-primary, #people-lists-panel .btn-primary { background: var(--primary-700); border-color: var(--primary-600); color: #fff; }
      
      /* Status badges */
      .status-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        margin-left: 8px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-radius: 3px;
        white-space: nowrap;
      }
      
      .status-badge-new {
        background: #10b981;
        color: #fff;
      }
      
      .status-badge-no-calls {
        background: rgba(156, 163, 175, 0.15);
        color: rgba(156, 163, 175, 0.85);
        border: 1px solid rgba(156, 163, 175, 0.25);
      }
    `;
    document.head.appendChild(style);
  }

  function initDomRefs() {
    els.page = document.getElementById('people-page');
    if (!els.page) return false;

    els.table = els.page.querySelector('#people-table');
    els.thead = els.page.querySelector('#people-table thead');
    els.headerRow = els.thead ? els.thead.querySelector('tr') : null;
    els.tbody = els.page.querySelector('#people-table tbody');
    els.tableContainer = els.page.querySelector('.table-container');
    els.selectAll = qs('select-all-contacts');
    els.pagination = qs('people-pagination');
    els.paginationSummary = qs('people-pagination-summary');
    els.toggleBtn = qs('toggle-people-filters');
    els.filterPanel = qs('people-filters');
    els.filterText = els.toggleBtn ? els.toggleBtn.querySelector('.filter-text') : null;
    els.filterBadge = qs('people-filter-count');
    els.quickSearch = qs('people-quick-search');

    // fields
    els.fTitle = qs('filter-title');
    els.titleChipWrap = qs('filter-title-chip');
    els.titleChips = qs('filter-title-chips');
    els.titleClear = qs('filter-title-clear');
    els.titleSuggest = qs('filter-title-suggest');
    els.fCompany = qs('filter-company');
    els.companyChipWrap = qs('filter-company-chip');
    els.companyChips = qs('filter-company-chips');
    els.companyClear = qs('filter-company-clear');
    els.companySuggest = qs('filter-company-suggest');
    // New fields
    els.fCity = qs('filter-city');
    els.cityChipWrap = qs('filter-city-chip');
    els.cityChips = qs('filter-city-chips');
    els.cityClear = qs('filter-city-clear');
    els.citySuggest = qs('filter-city-suggest');
    els.fState = qs('filter-state');
    els.stateChipWrap = qs('filter-state-chip');
    els.stateChips = qs('filter-state-chips');
    els.stateClear = qs('filter-state-clear');
    els.stateSuggest = qs('filter-state-suggest');
    els.fEmployees = qs('filter-employees');
    els.employeesChipWrap = qs('filter-employees-chip');
    els.employeesChips = qs('filter-employees-chips');
    els.employeesClear = qs('filter-employees-clear');
    els.employeesSuggest = qs('filter-employees-suggest');
    els.fIndustry = qs('filter-industry');
    els.industryChipWrap = qs('filter-industry-chip');
    els.industryChips = qs('filter-industry-chips');
    els.industryClear = qs('filter-industry-clear');
    els.industrySuggest = qs('filter-industry-suggest');
    els.fVisitorDomain = qs('filter-visitor-domain');
    els.visitorDomainChipWrap = qs('filter-visitor-domain-chip');
    els.visitorDomainChips = qs('filter-visitor-domain-chips');
    els.visitorDomainClear = qs('filter-visitor-domain-clear');
    els.visitorDomainSuggest = qs('filter-visitor-domain-suggest');
    els.fSeniority = qs('filter-seniority');
    els.seniorityChipWrap = qs('filter-seniority-chip');
    els.seniorityChips = qs('filter-seniority-chips');
    els.seniorityClear = qs('filter-seniority-clear');
    els.senioritySuggest = qs('filter-seniority-suggest');
    els.fDepartment = qs('filter-department');
    els.departmentChipWrap = qs('filter-department-chip');
    els.departmentChips = qs('filter-department-chips');
    els.departmentClear = qs('filter-department-clear');
    els.departmentSuggest = qs('filter-department-suggest');
    els.fHasEmail = qs('filter-has-email');
    els.fHasPhone = qs('filter-has-phone');

    els.applyBtn = qs('apply-people-filters');
    els.clearBtn = qs('clear-people-filters');

    // Add Contact button (opens modal)
    const addBtn = els.page.querySelector('#add-contact-btn');
    if (addBtn && !addBtn._bound) {
      addBtn.addEventListener('click', async () => {
        try {
          if (window.crm && typeof window.crm.showModal === 'function') {
            window.crm.showModal('add-contact');
          } else {
            console.warn('CRM modal not available');
          }
        } catch (e) {
          console.error('Open Add Contact modal failed', e);
        }
      });
      addBtn._bound = '1';
    }

    // Listen for contact creation events from Add Contact modal
    if (els.page && !els.page._contactCreatedHandler) {
      els.page._contactCreatedHandler = function (ev) {
        try {
          const detail = ev && ev.detail ? ev.detail : {};
          const id = detail.id;
          const doc = detail.doc || {};
          if (!id) return;
          // Deduplicate, prepend, and refresh filters/render
          state.data = (Array.isArray(state.data) ? state.data : []).filter((c) => c && c.id !== id);
          state.data.unshift({ id, ...doc });
          // Rebuild suggestion pools to include new values
          if (typeof buildTitleSuggestionPool === 'function') buildTitleSuggestionPool();
          if (typeof buildCompanySuggestionPool === 'function') buildCompanySuggestionPool();
          if (typeof buildCitySuggestionPool === 'function') buildCitySuggestionPool();
          if (typeof buildStateSuggestionPool === 'function') buildStateSuggestionPool();
          if (typeof buildEmployeesSuggestionPool === 'function') buildEmployeesSuggestionPool();
          if (typeof buildIndustrySuggestionPool === 'function') buildIndustrySuggestionPool();
          if (typeof buildVisitorDomainSuggestionPool === 'function') buildVisitorDomainSuggestionPool();
          applyFilters();
        } catch (_) { /* noop */ }
      };
      document.addEventListener('pc:contact-created', els.page._contactCreatedHandler);
    }

    // Merge updates from contact-detail saves
    if (!els.page._contactUpdatedHandler) {
      els.page._contactUpdatedHandler = function (ev) {
        try {
          const detail = ev && ev.detail ? ev.detail : {};
          const id = detail.id;
          const changes = detail.changes || {};
          if (!id) return;
          let changed = false;
          // Update in state.data
          for (let i = 0; i < state.data.length; i++) {
            const c = state.data[i];
            if (c && c.id === id) {
              Object.assign(c, changes);
              changed = true;
              break;
            }
          }
          // Update in filtered slice as well (shallow merge by id)
          for (let i = 0; i < state.filtered.length; i++) {
            const c = state.filtered[i];
            if (c && c.id === id) {
              Object.assign(c, changes);
              break;
            }
          }
          if (changed) {
            // Rebuild suggestion pools as values may have changed
            if (typeof buildTitleSuggestionPool === 'function') buildTitleSuggestionPool();
            if (typeof buildCompanySuggestionPool === 'function') buildCompanySuggestionPool();
            if (typeof buildCitySuggestionPool === 'function') buildCitySuggestionPool();
            if (typeof buildStateSuggestionPool === 'function') buildStateSuggestionPool();
            if (typeof buildEmployeesSuggestionPool === 'function') buildEmployeesSuggestionPool();
            if (typeof buildIndustrySuggestionPool === 'function') buildIndustrySuggestionPool();
            if (typeof buildVisitorDomainSuggestionPool === 'function') buildVisitorDomainSuggestionPool();
            applyFilters();
          }
        } catch (_) { /* noop */ }
      };
      document.addEventListener('pc:contact-updated', els.page._contactUpdatedHandler);
    }

    return true;
  }

  // Ensure header <th> elements are annotated with data-col keys and draggable
  function ensurePeopleHeaderColMeta() {
    if (!els.headerRow) return;
    const ths = Array.from(els.headerRow.querySelectorAll('th'));
    if (ths.length === 0) return;
    for (let i = 0; i < ths.length && i < DEFAULT_CONTACTS_COL_ORDER.length; i++) {
      const th = ths[i];
      const key = th.getAttribute('data-col') || DEFAULT_CONTACTS_COL_ORDER[i];
      th.setAttribute('data-col', key);
      th.setAttribute('draggable', 'true');
    }
  }

  // Reorder header DOM to match contactsColumnOrder
  function refreshPeopleHeaderOrder() {
    if (!els.headerRow) return;
    const current = Array.from(els.headerRow.querySelectorAll('th'));
    if (current.length === 0) return;
    const byKey = new Map();
    for (const th of current) byKey.set(th.getAttribute('data-col'), th);
    const frag = document.createDocumentFragment();
    for (const k of contactsColumnOrder) {
      const th = byKey.get(k);
      if (th) frag.appendChild(th);
    }
    // Append any remaining headers not in order (safety)
    for (const th of current) if (!frag.contains(th)) frag.appendChild(th);
    els.headerRow.appendChild(frag);
  }

  function getHeaderOrderFromDom() {
    if (!els.headerRow) return DEFAULT_CONTACTS_COL_ORDER.slice();
    return Array.from(els.headerRow.querySelectorAll('th')).map((th) => th.getAttribute('data-col'))
      .filter((k) => !!k);
  }

  function attachHeaderDnDHooks() {
    if (!els.thead) return;
    const handler = () => {
      // Wait a tick for DOM to settle
      setTimeout(() => {
        const ord = getHeaderOrderFromDom();
        if (ord.length) {
          const joinedA = ord.join(',');
          const joinedB = contactsColumnOrder.join(',');
          if (joinedA !== joinedB) {
            contactsColumnOrder = ord;
            persistPeopleColumnOrder(ord);
            // Re-render rows to reflect new order
            render();
          }
        }
      }, 0);
    };
    els.thead.addEventListener('drop', handler, true);
    els.thead.addEventListener('dragend', handler, true);
  }

  // Enhanced DnD for headers with better visual feedback
  function initPeopleHeaderDnD() {
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
        contactsColumnOrder = newOrder;
        persistPeopleColumnOrder(newOrder);
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
          // Add show class after a small delay to ensure the element is visible
          setTimeout(() => {
            els.filterPanel.classList.add('show');
          }, 10);
          if (els.filterText) els.filterText.textContent = 'Hide Filters';
        } else {
          // Remove show class first, then hide after animation
          els.filterPanel.classList.remove('show');
          setTimeout(() => {
            els.filterPanel.setAttribute('hidden', '');
          }, 300); // Match the CSS transition duration
          if (els.filterText) els.filterText.textContent = 'Show Filters';
        }
      });
    }

    // Algolia instant search
    async function performAlgoliaSearch(query) {
      if (!window.AlgoliaSearch || !window.AlgoliaSearch.isAvailable()) {
        console.warn('[People] Algolia not available, falling back to local search');
        applyFilters();
        return;
      }

      try {
        // Show loading state
        if (els.tableBody) {
          els.tableBody.innerHTML = '<tr><td colspan="20" style="text-align: center; padding: 40px; color: var(--grey-400);">Searching...</td></tr>';
        }

        // Search with Algolia
        const results = await window.AlgoliaSearch.searchContacts(query, {
          limit: 100,
          page: 0
        });

        console.log('[People] Algolia search results:', results.nbHits, 'contacts found');

        // Map Algolia hits to our data format
        state.filtered = results.hits.map(hit => ({
          id: hit.objectID,
          ...hit
        }));
        
        state.currentPage = 1;
        
        // Update search UI
        if (els.quickSearch) {
          els.quickSearch.style.borderColor = 'var(--orange-primary)';
          els.quickSearch.placeholder = `Found ${results.nbHits} contacts...`;
        }
        
        render();

      } catch (error) {
        console.error('[People] Algolia search failed:', error);
        // Fallback to local search
        applyFilters();
      }
    }

    const reFilter = debounce(applyFilters, 200);

  // Select-all checkbox behavior
  if (els.selectAll) {
    els.selectAll.addEventListener('change', () => {
      // console.log('Select-all checkbox changed, checked:', els.selectAll.checked);
      if (els.selectAll.checked) {
        openBulkSelectPopover();
      } else {
        state.selected.clear();
        render();
        closeBulkSelectPopover();
        hideBulkActionsBar();
      }
    });
  }

  // Title chip behaviors
    if (els.fTitle) {
      // Reduce browser autofill by briefly toggling readonly
      els.fTitle.addEventListener('focus', () => { try { els.fTitle.setAttribute('readonly',''); setTimeout(()=>{ els.fTitle.removeAttribute('readonly'); }, 40); } catch(_){} });
      els.fTitle.setAttribute('name', 'no-autofill-filter-title');
      els.fTitle.addEventListener('input', () => updateTitleSuggestions());
      els.fTitle.addEventListener('keydown', (e) => {
        const val = (els.fTitle.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) {
            e.preventDefault();
            addTitleToken(val);
            els.fTitle.value = '';
            hideTitleSuggestions();
            applyFilters();
            try {
              const el = els.fTitle;
              if (el) {
                el.focus();
                requestAnimationFrame(() => {
                  if (document.activeElement !== el) {
                    el.focus();
                  }
                });
              }
            } catch (_) {}
          }
        } else if (e.key === 'Backspace') {
          if (!val && state.titleTokens.length > 0) {
            e.preventDefault();
            removeLastTitleToken();
            applyFilters();
          }
        }
      });
      if (els.titleChipWrap) {
        els.titleChipWrap.addEventListener('click', (ev) => {
          if (ev.target === els.titleChipWrap) els.fTitle.focus();
        });
      }
    }
    // Helper: collapse chip input when not focused and empty
    function _attachChipCollapse(wrapEl, inputEl, keyName) {
      try {
        if (!wrapEl || !inputEl) return;
        const setCollapsed = (on) => {
          if (on) wrapEl.classList.add('collapsed'); else wrapEl.classList.remove('collapsed');
        };
        const update = () => {
          const focused = document.activeElement === inputEl;
          const empty = !(inputEl.value || '').trim();
          // Only collapse when there are chips present; keep input visible
          // when there are no chips so placeholder remains visible.
          const hasChips = !!wrapEl.querySelector('.chip');
          setCollapsed(!focused && empty && hasChips);
        };
        inputEl.addEventListener('focus', () => { setCollapsed(false); });
        inputEl.addEventListener('blur', () => { setTimeout(update, 0); });
        wrapEl.addEventListener('click', (ev) => {
          if (ev.target === wrapEl) {
            setCollapsed(false);
            inputEl.focus();
          }
        });
        // Initial state
        update();
      } catch (_) {}
    }
    if (els.titleClear) {
      els.titleClear.addEventListener('click', () => {
        clearTitleTokens();
        if (els.fTitle) els.fTitle.value = '';
        hideTitleSuggestions();
        applyFilters();
        els.fTitle?.focus();
      });
    }
    if (els.titleSuggest) {
      els.titleSuggest.addEventListener('mousedown', (e) => {
        const item = e.target.closest('[data-sugg]');
        if (!item) return;
        const label = item.getAttribute('data-sugg') || '';
        addTitleToken(label);
        if (els.fTitle) els.fTitle.value = '';
        hideTitleSuggestions();
        applyFilters();
        try {
          const el = els.fTitle;
          if (el) {
            el.focus();
            requestAnimationFrame(() => {
              if (document.activeElement !== el) {
                el.focus();
              }
            });
          }
        } catch (_) {}
      });
    }
    // City chip behaviors – strengthen autofill suppression on the input itself
    if (els.fCity) {
      // Extra autofill suppression
      try {
        els.fCity.setAttribute('name', 'no-autofill-filter-city');
        els.fCity.setAttribute('autocomplete', 'new-password');
        els.fCity.setAttribute('autocapitalize', 'off');
        els.fCity.setAttribute('autocorrect', 'off');
        els.fCity.setAttribute('spellcheck', 'false');
      } catch (_) {}
      // Brief readonly on focus to block Chrome address overlay
      els.fCity.addEventListener('focus', () => {
        try { els.fCity.setAttribute('readonly', ''); setTimeout(() => { els.fCity.removeAttribute('readonly'); }, 40); } catch (_) {}
      });
      
      // Debug: Track input field size changes
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // console.log('[Flex Debug] City input resized:', {
          //   width: entry.contentRect.width,
          //   height: entry.contentRect.height,
          //   target: entry.target.className
          // });
        }
      });
      resizeObserver.observe(els.fCity);
    }
    // Company chip behaviors
    if (els.fCompany) {
      els.fCompany.addEventListener('input', () => updateCompanySuggestions());
      els.fCompany.addEventListener('keydown', (e) => {
        const val = (els.fCompany.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) {
            e.preventDefault();
            addCompanyToken(val);
            els.fCompany.value = '';
            hideCompanySuggestions();
            applyFilters();
            try {
              const el = els.fCompany;
              if (el) {
                el.focus();
                requestAnimationFrame(() => {
                  if (document.activeElement !== el) {
                    el.focus();
                  }
                });
              }
            } catch (_) {}
          }
        } else if (e.key === 'Backspace') {
          if (!val && state.companyTokens.length > 0) {
            e.preventDefault();
            removeLastCompanyToken();
            applyFilters();
          }
        }
      });
      if (els.companyChipWrap) {
        els.companyChipWrap.addEventListener('click', (ev) => {
          if (ev.target === els.companyChipWrap) els.fCompany.focus();
        });
      }
    }
    if (els.companyClear) {
      els.companyClear.addEventListener('click', () => {
        clearCompanyTokens();
        if (els.fCompany) els.fCompany.value = '';
        hideCompanySuggestions();
        applyFilters();
        els.fCompany?.focus();
      });
    }
    if (els.companySuggest) {
      els.companySuggest.addEventListener('mousedown', (e) => {
        const item = e.target.closest('[data-sugg]');
        if (!item) return;
        const label = item.getAttribute('data-sugg') || '';
        addCompanyToken(label);
        if (els.fCompany) els.fCompany.value = '';
        hideCompanySuggestions();
        applyFilters();
        try {
          const el = els.fCompany;
          if (el) {
            el.focus();
            requestAnimationFrame(() => {
              if (document.activeElement !== el) {
                el.focus();
              }
            });
          }
        } catch (_) {}
      });
    }
    // City chip behaviors
    if (els.fCity) {
      els.fCity.addEventListener('input', () => updateCitySuggestions());
      els.fCity.addEventListener('keydown', (e) => {
        const val = (els.fCity.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) {
            // console.log('[Flex Debug] Enter/Comma pressed, adding city token:', val);
            e.preventDefault();
            addCityToken(val);
            els.fCity.value = '';
            hideCitySuggestions();
            applyFilters();
            try {
              const el = els.fCity;
              if (el) {
                el.focus();
                requestAnimationFrame(() => {
                  if (document.activeElement !== el) {
                    el.focus();
                  }
                });
              }
            } catch (_) {}
          }
        } else if (e.key === 'Backspace') {
          if (!val && state.cityTokens.length > 0) { e.preventDefault(); removeLastCityToken(); applyFilters(); }
        }
      });
      if (els.cityChipWrap) {
        els.cityChipWrap.addEventListener('click', (ev) => { if (ev.target === els.cityChipWrap) els.fCity.focus(); });
      }
    }
    if (els.cityClear) {
      els.cityClear.addEventListener('click', () => { clearCityTokens(); if (els.fCity) els.fCity.value = ''; hideCitySuggestions(); applyFilters(); els.fCity?.focus(); });
    }
    if (els.citySuggest) {
      els.citySuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg') || ''; addCityToken(label); if (els.fCity) els.fCity.value = ''; hideCitySuggestions(); applyFilters(); try { const el = els.fCity; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} });
    }
    // Attach collapse/expand behavior for all chip inputs
    _attachChipCollapse(els.titleChipWrap, els.fTitle, 'title');
    _attachChipCollapse(els.companyChipWrap, els.fCompany, 'company');
    _attachChipCollapse(els.cityChipWrap, els.fCity, 'city');
    _attachChipCollapse(els.stateChipWrap, els.fState, 'state');
    _attachChipCollapse(els.employeesChipWrap, els.fEmployees, 'employees');
    _attachChipCollapse(els.industryChipWrap, els.fIndustry, 'industry');
    _attachChipCollapse(els.visitorDomainChipWrap, els.fVisitorDomain, 'visitorDomain');
    _attachChipCollapse(els.seniorityChipWrap, els.fSeniority, 'seniority');
    _attachChipCollapse(els.departmentChipWrap, els.fDepartment, 'department');
    // State chip behaviors
    if (els.fState) {
      els.fState.addEventListener('input', () => updateStateSuggestions());
      els.fState.addEventListener('keydown', (e) => {
        const val = (els.fState.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addStateToken(val); els.fState.value = ''; hideStateSuggestions(); applyFilters(); try { const el = els.fState; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }
        } else if (e.key === 'Backspace') {
          if (!val && state.stateTokens.length > 0) { e.preventDefault(); removeLastStateToken(); applyFilters(); }
        }
      });
      if (els.stateChipWrap) { els.stateChipWrap.addEventListener('click', (ev) => { if (ev.target === els.stateChipWrap) els.fState.focus(); }); }
    }
    if (els.stateClear) { els.stateClear.addEventListener('click', () => { clearStateTokens(); if (els.fState) els.fState.value=''; hideStateSuggestions(); applyFilters(); els.fState?.focus(); }); }
    if (els.stateSuggest) { els.stateSuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addStateToken(label); if (els.fState) els.fState.value=''; hideStateSuggestions(); applyFilters(); try { const el = els.fState; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }); }
    // Employees chip behaviors
    if (els.fEmployees) {
      els.fEmployees.addEventListener('input', () => updateEmployeesSuggestions());
      els.fEmployees.addEventListener('keydown', (e) => {
        const val = (els.fEmployees.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addEmployeesToken(val); els.fEmployees.value=''; hideEmployeesSuggestions(); applyFilters(); try { const el = els.fEmployees; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }
        } else if (e.key === 'Backspace') {
          if (!val && state.employeesTokens.length > 0) { e.preventDefault(); removeLastEmployeesToken(); applyFilters(); }
        }
      });
      if (els.employeesChipWrap) { els.employeesChipWrap.addEventListener('click', (ev) => { if (ev.target === els.employeesChipWrap) els.fEmployees.focus(); }); }
    }
    if (els.employeesClear) { els.employeesClear.addEventListener('click', () => { clearEmployeesTokens(); if (els.fEmployees) els.fEmployees.value=''; hideEmployeesSuggestions(); applyFilters(); els.fEmployees?.focus(); }); }
    if (els.employeesSuggest) { els.employeesSuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addEmployeesToken(label); if (els.fEmployees) els.fEmployees.value=''; hideEmployeesSuggestions(); applyFilters(); try { const el = els.fEmployees; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }); }
    // Industry chip behaviors
    if (els.fIndustry) {
      els.fIndustry.addEventListener('input', () => updateIndustrySuggestions());
      els.fIndustry.addEventListener('keydown', (e) => {
        const val = (els.fIndustry.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addIndustryToken(val); els.fIndustry.value=''; hideIndustrySuggestions(); applyFilters(); try { const el = els.fIndustry; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }
        } else if (e.key === 'Backspace') {
          if (!val && state.industryTokens.length > 0) { e.preventDefault(); removeLastIndustryToken(); applyFilters(); }
        }
      });
      if (els.industryChipWrap) { els.industryChipWrap.addEventListener('click', (ev) => { if (ev.target === els.industryChipWrap) els.fIndustry.focus(); }); }
    }
    if (els.industryClear) { els.industryClear.addEventListener('click', () => { clearIndustryTokens(); if (els.fIndustry) els.fIndustry.value=''; hideIndustrySuggestions(); applyFilters(); els.fIndustry?.focus(); }); }
    if (els.industrySuggest) { els.industrySuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addIndustryToken(label); if (els.fIndustry) els.fIndustry.value=''; hideIndustrySuggestions(); applyFilters(); try { const el = els.fIndustry; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }); }
    // Visitor domain chip behaviors
    if (els.fVisitorDomain) {
      els.fVisitorDomain.addEventListener('input', () => updateVisitorDomainSuggestions());
      els.fVisitorDomain.addEventListener('keydown', (e) => {
        const val = (els.fVisitorDomain.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addVisitorDomainToken(val); els.fVisitorDomain.value=''; hideVisitorDomainSuggestions(); applyFilters(); try { const el = els.fVisitorDomain; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }
        } else if (e.key === 'Backspace') {
          if (!val && state.visitorDomainTokens.length > 0) { e.preventDefault(); removeLastVisitorDomainToken(); applyFilters(); }
        }
      });
      if (els.visitorDomainChipWrap) { els.visitorDomainChipWrap.addEventListener('click', (ev) => { if (ev.target === els.visitorDomainChipWrap) els.fVisitorDomain.focus(); }); }
    }
    if (els.visitorDomainClear) { els.visitorDomainClear.addEventListener('click', () => { clearVisitorDomainTokens(); if (els.fVisitorDomain) els.fVisitorDomain.value=''; hideVisitorDomainSuggestions(); applyFilters(); els.fVisitorDomain?.focus(); }); }
    if (els.visitorDomainSuggest) { els.visitorDomainSuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addVisitorDomainToken(label); if (els.fVisitorDomain) els.fVisitorDomain.value=''; hideVisitorDomainSuggestions(); applyFilters(); try { const el = els.fVisitorDomain; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }); }
    // Seniority chip behaviors
    if (els.fSeniority) {
      els.fSeniority.addEventListener('input', () => updateSenioritySuggestions());
      els.fSeniority.addEventListener('keydown', (e) => {
        const val = (els.fSeniority.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addSeniorityToken(val); els.fSeniority.value=''; hideSenioritySuggestions(); applyFilters(); try { const el = els.fSeniority; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }
        } else if (e.key === 'Backspace') {
          if (!val && state.seniorityTokens.length > 0) { e.preventDefault(); removeLastSeniorityToken(); applyFilters(); }
        }
      });
    }
    if (els.seniorityClear) { els.seniorityClear.addEventListener('click', () => { clearSeniorityTokens(); if (els.fSeniority) els.fSeniority.value=''; hideSenioritySuggestions(); applyFilters(); els.fSeniority?.focus(); }); }
    if (els.senioritySuggest) { els.senioritySuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addSeniorityToken(label); if (els.fSeniority) els.fSeniority.value=''; hideSenioritySuggestions(); applyFilters(); try { const el = els.fSeniority; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }); }
    // Department chip behaviors
    if (els.fDepartment) {
      els.fDepartment.addEventListener('input', () => updateDepartmentSuggestions());
      els.fDepartment.addEventListener('keydown', (e) => {
        const val = (els.fDepartment.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addDepartmentToken(val); els.fDepartment.value=''; hideDepartmentSuggestions(); applyFilters(); try { const el = els.fDepartment; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }
        } else if (e.key === 'Backspace') {
          if (!val && state.departmentTokens.length > 0) { e.preventDefault(); removeLastDepartmentToken(); applyFilters(); }
        }
      });
    }
    if (els.departmentClear) { els.departmentClear.addEventListener('click', () => { clearDepartmentTokens(); if (els.fDepartment) els.fDepartment.value=''; hideDepartmentSuggestions(); applyFilters(); els.fDepartment?.focus(); }); }
    if (els.departmentSuggest) { els.departmentSuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addDepartmentToken(label); if (els.fDepartment) els.fDepartment.value=''; hideDepartmentSuggestions(); applyFilters(); try { const el = els.fDepartment; if (el) { el.focus(); requestAnimationFrame(() => { if (document.activeElement !== el) { el.focus(); } }); } } catch (_) {} }); }
    [els.fHasEmail, els.fHasPhone].forEach((chk) => {
      if (chk) chk.addEventListener('change', reFilter);
    });

    if (els.applyBtn) els.applyBtn.addEventListener('click', () => { state.currentPage = 1; applyFilters(); });
    if (els.clearBtn) els.clearBtn.addEventListener('click', () => { clearFilters(); state.currentPage = 1; });
    if (els.quickSearch) {
      els.quickSearch.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        
        if (query.length >= 2) {
          // SEARCH MODE: Use Algolia instant search
          state.searchMode = true;
          state.searchQuery = query;
          await performAlgoliaSearch(query);
        } else if (query.length === 0) {
          // BROWSE MODE: Back to local filtering
          state.searchMode = false;
          state.searchQuery = '';
          reFilter();
        }
      });
    }

    // Select-all
    if (els.selectAll) {
      els.selectAll.addEventListener('change', () => {
        if (els.selectAll.checked) {
          openBulkSelectPopover();
        } else {
          // Clear any selection and close UIs
          state.selected.clear();
          render();
          closeBulkSelectPopover();
          hideBulkActionsBar();
        }
      });
    }

    // Row selection via event delegation
    if (els.tbody) {
      els.tbody.addEventListener('change', (e) => {
        const cb = e.target;
        if (cb && cb.classList.contains('row-select')) {
          const id = cb.getAttribute('data-id');
          if (!id) return;
          if (cb.checked) state.selected.add(id); else state.selected.delete(id);
          // Row highlight
          const tr = cb.closest('tr');
          if (tr) tr.classList.toggle('row-selected', cb.checked);
          updateSelectAllState();
          updateBulkActionsBar();
        }
      });
      // Contact name and phone click delegation
      els.tbody.addEventListener('click', (e) => {
        const nameCell = e.target.closest('.name-cell');
        if (nameCell) {
          const contactId = nameCell.getAttribute('data-contact-id');
          if (contactId && window.ContactDetail) {
            // Store navigation source for back button
            window._contactNavigationSource = 'people';
            window._peopleReturn = {
              page: state.currentPage,
              scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
              searchTerm: els.quickSearch?.value || '',
              sortColumn: state.sortColumn || '',
              sortDirection: state.sortDirection || 'asc',
              filters: {
                titleTokens: [...state.titleTokens],
                companyTokens: [...state.companyTokens],
                statusTokens: [...state.statusTokens]
              }
            };
            // Prefetch contact data from cache (FREE)
            if (window.getPeopleData) {
              const peopleData = window.getPeopleData();
              const contact = peopleData.find(c => c.id === contactId);
              if (contact) {
                window._prefetchedContactForDetail = contact;
              }
            }
            window.ContactDetail.show(contactId);
          }
          return;
        }
        
        const phoneCell = e.target.closest('.phone-cell');
        if (phoneCell) {
          const phone = phoneCell.getAttribute('data-phone');
          if (phone && window.Widgets && window.Widgets.openPhone) {
            // Normalize phone number for dialing
            const normalizedPhone = phone.replace(/\D/g, '');
            if (normalizedPhone.length >= 10) {
              window.Widgets.openPhone(normalizedPhone);
            }
          }
          return;
        }
        
        const btn = e.target.closest && e.target.closest('.qa-btn');
        if (!btn) return;
        e.preventDefault();
        handleQuickAction(btn);
      });
    }

    // Pagination click handling
    if (els.pagination) {
      els.pagination.addEventListener('click', async (e) => {
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
          
          // SEAMLESS AUTO-LOAD: Check if we need data for this page
          const neededIndex = (next - 1) * state.pageSize + state.pageSize - 1;
          if (neededIndex >= state.data.length && state.hasMore && !state.searchMode) {
            // console.log('[People] Loading more contacts for page', next, '...');
            
            // Show brief loading indicator
            if (els.tbody) {
              els.tbody.innerHTML = '<tr><td colspan="20" style="text-align: center; padding: 40px; color: var(--grey-400);">Loading more contacts...</td></tr>';
            }
            
            await loadMoreContacts(); // Wait for data before rendering
          }
          
          render();
          // After page change, scroll the actual scrollable container to top
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
        }
      });
    }
  }

  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
  }

  async function loadDataOnce() {
    // RESTORE: If state is empty but allContactsCache exists, restore it
    if ((!state.data || state.data.length === 0) && state.allContactsCache && state.allContactsCache.length > 0) {
      // console.log('[People] Restoring from allContactsCache:', state.allContactsCache.length, 'contacts');
      state.data = state.allContactsCache.slice();
      state.filtered = state.data.slice();
        state.loaded = true;
        render();
      return; // Don't reload from Firebase/cache again
    }
    
    // Allow reload if data is actually empty (failed or cleared)
    if (state.loaded && state.data && state.data.length > 0) {
      // console.log('[People] Data already loaded:', state.data.length, 'contacts');
        return;
      }
      
    // If loaded flag is set but data is empty, reset and reload
    if (state.loaded && (!state.data || state.data.length === 0)) {
      // console.log('[People] Loaded flag set but data empty, resetting...');
      state.loaded = false;
    }
    
    try {
      // NEW: Use Background Loader for instant data access
      let contactsData = [];
      let accountsData = [];
      
      // Get data from background loaders (already loaded on app init)
      if (window.BackgroundContactsLoader) {
        contactsData = window.BackgroundContactsLoader.getContactsData() || [];
        // console.log('[People] Got', contactsData.length, 'contacts from BackgroundContactsLoader');
      }
      
      if (window.BackgroundAccountsLoader) {
        accountsData = window.BackgroundAccountsLoader.getAccountsData() || [];
        // console.log('[People] Got', accountsData.length, 'accounts from BackgroundAccountsLoader');
      }
      
      // If no background loaders, try legacy method
      if (contactsData.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        // console.log('[People] Background loader empty, falling back to CacheManager...');
        contactsData = await window.CacheManager.get('contacts') || [];
      }
      
      if (accountsData.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        accountsData = await window.CacheManager.get('accounts') || [];
      }
      
      // Store full dataset for pagination
      state.allContactsCache = contactsData;
      
      // Get total count (non-blocking). Use loaded count for immediate UI.
      state.totalCount = contactsData.length;
      if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getTotalCount === 'function') {
        window.BackgroundContactsLoader.getTotalCount()
          .then((cnt) => { state.totalCount = cnt; })
          .catch((error) => { console.warn('[People] Failed to get total count, keeping loaded count:', error); });
      }
      
      // SMART LAZY LOADING: 
      // - If from cache (no cost): Load ALL contacts immediately
      // - If from Firestore (costs money): Only load first 100 to reduce reads
      const isFromCache = window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.isFromCache === 'function' 
        ? window.BackgroundContactsLoader.isFromCache() 
        : false;
      
      // Build quick lookups for accounts → employees (reuse across batches)
      const accountById = new Map();
      const accountByName = new Map();
      const getEmployeesFromAccount = (acc) => {
        if (!acc || typeof acc !== 'object') return null;
        const candidates = [acc.employees, acc.employeeCount, acc.numEmployees];
        for (const v of candidates) {
          if (typeof v === 'number' && isFinite(v)) return v;
          const n = Number(v);
          if (!isNaN(n) && isFinite(n)) return n;
        }
        return null;
      };
      
      // Process accounts data (works with both arrays and Firestore snapshots)
      const accountsArray = Array.isArray(accountsData) ? accountsData : (accountsData && accountsData.docs ? accountsData.docs.map(d => ({ id: d.id, ...d.data() })) : []);
      for (const acc of accountsArray) {
        if (acc && acc.id) {
          accountById.set(acc.id, acc);
          const name = (acc.accountName || acc.name || acc.companyName || '').toString().trim();
          if (name) accountByName.set(normalize(name), acc);
        }
      }

      // Persist maps for reuse during loadMore from cache
      state._accountById = accountById;
      state._accountByName = accountByName;

      // Prepare contacts array in normalized form
      const contactsArray = Array.isArray(contactsData) ? contactsData : (contactsData && contactsData.docs ? contactsData.docs.map(d => ({ id: d.id, ...d.data() })) : []);

      // Helper to enrich a batch of contacts
      const enrichBatch = (arr) => arr.map((c) => {
        let acc = null;
        if (c.accountId && accountById.has(c.accountId)) {
          acc = accountById.get(c.accountId);
        } else {
          const key = (c.accountName || '').toString().trim();
          if (key) acc = accountByName.get(normalize(key)) || null;
        }
        let employeesVal = acc ? getEmployeesFromAccount(acc) : null;
        if (employeesVal == null) {
          const fromContact = [c.accountEmployees, c.employees].find((v) => typeof v === 'number' && isFinite(v));
          if (typeof fromContact === 'number') employeesVal = fromContact;
        }
        if (employeesVal != null) c.accountEmployees = employeesVal;
        if (!c.companyName) {
          if (acc) c.companyName = acc.accountName || acc.name || acc.companyName || c.accountName || '';
          else if (c.accountName) c.companyName = c.accountName;
        }
        if (acc) {
          if (!c.companyWebsite && (acc.website || acc.site)) c.companyWebsite = acc.website || acc.site;
          if (!c.companyDomain && acc.domain) c.companyDomain = acc.domain;
          if (!c.linkedin && !c.linkedinUrl && (acc.linkedin || acc.linkedinUrl || acc.linkedin_url)) {
            c.linkedinUrl = acc.linkedin || acc.linkedinUrl || acc.linkedin_url;
          }
        }
        return c;
      });

      // Determine initial batch and render immediately
      const initialBatchSize = 100;
      const initialBatch = contactsArray.slice(0, initialBatchSize);
      const enrichedInitial = enrichBatch(initialBatch);
      state.data = enrichedInitial;
      state.filtered = enrichedInitial.slice();
      state.hasMore = contactsArray.length > initialBatchSize;
      state.loaded = true;
      console.log('[People] Initial render with', state.data.length, 'contacts from', contactsArray.length);
      
      // Check if we're restoring from back navigation
      if (window.__restoringPeople && window._peopleReturn) {
        const targetPage = Math.max(1, parseInt(window._peopleReturn.currentPage || window._peopleReturn.page || 1, 10));
        state.currentPage = targetPage;
        // console.log('[People] Restoring to page:', targetPage, 'from back navigation');
      } else {
      state.currentPage = 1;
      }
      
      // Ensure cache is saved immediately for subsequent visits
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        // Cache the FULL dataset, not just the sliced/paginated data
        const fullData = state.allContactsCache || state.data;
        window.CacheManager.set('contacts', fullData).then(() => {
          // console.log('[People] Saved', fullData.length, 'contacts to cache (full dataset)');
        }).catch((err) => {
          console.error('[People] Failed to cache:', err);
        });
      }
      
      // Dispatch event so other pages know contacts are available
      try {
        const event = new CustomEvent('pc:contacts-loaded', { 
          detail: { count: state.data.length } 
        });
        document.dispatchEvent(event);
        // console.log('[People] Dispatched contacts-loaded event:', state.data.length);
      } catch (_) {}
      
      if (typeof buildTitleSuggestionPool === 'function') buildTitleSuggestionPool();
      if (typeof buildCompanySuggestionPool === 'function') buildCompanySuggestionPool();
      if (typeof buildCitySuggestionPool === 'function') buildCitySuggestionPool();
      if (typeof buildStateSuggestionPool === 'function') buildStateSuggestionPool();
      if (typeof buildEmployeesSuggestionPool === 'function') buildEmployeesSuggestionPool();
      if (typeof buildIndustrySuggestionPool === 'function') buildIndustrySuggestionPool();
      if (typeof buildVisitorDomainSuggestionPool === 'function') buildVisitorDomainSuggestionPool();
      if (typeof buildSenioritySuggestionPool === 'function') buildSenioritySuggestionPool();
      if (typeof buildDepartmentSuggestionPool === 'function') buildDepartmentSuggestionPool();
      
      // Extra guard: if restoring hint is set but stale, clear it
      if (window.__restoringPeopleUntil && Date.now() > window.__restoringPeopleUntil) {
        try { window.__restoringPeople = false; window.__restoringPeopleUntil = 0; } catch(_) {}
      }
      
      render();
      
      // Update call status for badges (async, non-blocking)
      updatePeopleCallStatus().then(() => {
        // Re-render to show updated badges
        render();
      });
      
      // Defer enrichment/loading of remaining cache records via existing pagination path
      // If using cache, the remaining data will be appended by loadMoreContacts() when needed
    } catch (e) {
      console.error('Failed loading contacts:', e);
      state.data = [];
      state.filtered = [];
      state.loaded = true;
      state.currentPage = 1;
      if (typeof buildTitleSuggestionPool === 'function') buildTitleSuggestionPool();
      if (typeof buildCompanySuggestionPool === 'function') buildCompanySuggestionPool();
      if (typeof buildCitySuggestionPool === 'function') buildCitySuggestionPool();
      if (typeof buildStateSuggestionPool === 'function') buildStateSuggestionPool();
      if (typeof buildEmployeesSuggestionPool === 'function') buildEmployeesSuggestionPool();
      if (typeof buildIndustrySuggestionPool === 'function') buildIndustrySuggestionPool();
      if (typeof buildVisitorDomainSuggestionPool === 'function') buildVisitorDomainSuggestionPool();
      if (typeof buildSenioritySuggestionPool === 'function') buildSenioritySuggestionPool();
      if (typeof buildDepartmentSuggestionPool === 'function') buildDepartmentSuggestionPool();
      render();
    }
  }

  // Load more contacts (pagination)
  async function loadMoreContacts() {
    if (!state.hasMore || state.searchMode) return;

    try {
      let moreContacts = [];

      // Check if we have cached data first
      if (state.allContactsCache && state.allContactsCache.length > state.data.length) {
        const nextBatch = state.allContactsCache.slice(
          state.data.length,
          state.data.length + 100 // Load next 100 records from cache
        );
        // Enrich using stored maps
        const accountById = state._accountById instanceof Map ? state._accountById : new Map();
        const accountByName = state._accountByName instanceof Map ? state._accountByName : new Map();
        const getEmployeesFromAccount = (acc) => {
          if (!acc || typeof acc !== 'object') return null;
          const candidates = [acc.employees, acc.employeeCount, acc.numEmployees];
          for (const v of candidates) {
            if (typeof v === 'number' && isFinite(v)) return v;
            const n = Number(v);
            if (!isNaN(n) && isFinite(n)) return n;
          }
          return null;
        };
        moreContacts = nextBatch.map((c) => {
          let acc = null;
          if (c.accountId && accountById.has(c.accountId)) {
            acc = accountById.get(c.accountId);
          } else {
            const key = (c.accountName || '').toString().trim().toLowerCase();
            if (key) acc = accountByName.get(key) || null;
          }
          let employeesVal = acc ? getEmployeesFromAccount(acc) : null;
          if (employeesVal == null) {
            const fromContact = [c.accountEmployees, c.employees].find((v) => typeof v === 'number' && isFinite(v));
            if (typeof fromContact === 'number') employeesVal = fromContact;
          }
          if (employeesVal != null) c.accountEmployees = employeesVal;
          if (!c.companyName) {
            if (acc) c.companyName = acc.accountName || acc.name || acc.companyName || c.accountName || '';
            else if (c.accountName) c.companyName = c.accountName;
          }
          if (acc) {
            if (!c.companyWebsite && (acc.website || acc.site)) c.companyWebsite = acc.website || acc.site;
            if (!c.companyDomain && acc.domain) c.companyDomain = acc.domain;
            if (!c.linkedin && !c.linkedinUrl && (acc.linkedin || acc.linkedinUrl || acc.linkedin_url)) {
              c.linkedinUrl = acc.linkedin || acc.linkedinUrl || acc.linkedin_url;
            }
          }
          return c;
        });
        state.hasMore = state.data.length + nextBatch.length < state.allContactsCache.length;
        console.log(`[People] Loaded ${nextBatch.length} more contacts from cache (enriched)`);
      } else if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.loadMore === 'function') {
        // Use BackgroundContactsLoader for seamless pagination
        const result = await window.BackgroundContactsLoader.loadMore();
        
        if (result.loaded > 0) {
          // Get updated data from loader
          const allContacts = window.BackgroundContactsLoader.getContactsData();
          state.data = allContacts;
          state.hasMore = result.hasMore;
          
          // Update accounts data for enrichment
          if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
            const accountsData = window.BackgroundAccountsLoader.getAccountsData();
            const accountById = new Map();
            const accountByName = new Map();
            
            for (const acc of accountsData) {
              if (acc && acc.id) {
                accountById.set(acc.id, acc);
                const name = (acc.accountName || acc.name || acc.companyName || '').toString().trim();
                if (name) accountByName.set(normalize(name), acc);
              }
            }
            
            // Enrich new contacts with account data
            state.data = state.data.map((c) => {
              let acc = null;
              if (c.accountId && accountById.has(c.accountId)) {
                acc = accountById.get(c.accountId);
              } else {
                const key = (c.accountName || '').toString().trim();
                if (key) acc = accountByName.get(normalize(key)) || null;
              }
              
              if (acc) {
                const employeesVal = acc.employees || acc.employeeCount || acc.numEmployees;
                if (employeesVal != null) c.accountEmployees = employeesVal;
                if (!c.companyName) c.companyName = acc.accountName || acc.name || acc.companyName || c.accountName || '';
              }
              return c;
            });
          }
          
          applyFilters(); // Re-apply filters with new data
          console.log('[People] Loaded', result.loaded, 'more contacts. Total:', state.data.length);
        } else {
          state.hasMore = false;
        }
      }

      if (moreContacts.length > 0) {
        state.data = [...state.data, ...moreContacts];
        applyFilters(); // Re-apply filters with new data
        
        // Clear full cache to save memory if we have 500+ records loaded
        if (state.data.length > 500 && state.allContactsCache) {
          state.allContactsCache = null;
          console.log('[People] Cleared full cache to save memory (keeping', state.data.length, 'loaded records)');
        }
      }
    } catch (error) {
      console.error('[People] Failed loading more contacts:', error);
    }
  }

  function normalize(s) {
    return (s || '').toString().trim().toLowerCase();
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

  // Format phone numbers for display (prevents flickering by formatting on initial render)
  function formatPhoneForDisplay(phone) {
    if (!phone) return '';
    
    // Parse phone number and extension
    const parsed = parsePhoneWithExtension(phone);
    if (!parsed.number) return phone;
    
    // Format the main number
    let formattedNumber = '';
    const cleaned = parsed.number.replace(/\D/g, '');
    
    // Always display US numbers with +1 prefix
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      formattedNumber = `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      formattedNumber = `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    } else if (/^\+/.test(String(parsed.number))) {
      // International number - keep as-is
      formattedNumber = parsed.number;
    } else {
      // Fallback: return original if we can't format
      formattedNumber = parsed.number;
    }
    
    // Add extension if present
    if (parsed.extension) {
      return `${formattedNumber} ext. ${parsed.extension}`;
    }
    
    return formattedNumber;
  }

  function applyFilters() {
    const q = normalize(els.quickSearch ? els.quickSearch.value : '');

    const titleTokens = (state.titleTokens || []).map(normalize).filter(Boolean);
    const companyTokens = (state.companyTokens || []).map(normalize).filter(Boolean);
    const cityTokens = (state.cityTokens || []).map(normalize).filter(Boolean);
    const stateTokens = (state.stateTokens || []).map(normalize).filter(Boolean);
    const employeesTokens = (state.employeesTokens || []).map(normalize).filter(Boolean);
    const industryTokens = (state.industryTokens || []).map(normalize).filter(Boolean);
    const visitorDomainTokens = (state.visitorDomainTokens || []).map(normalize).filter(Boolean);
    const seniorityTokens = (state.seniorityTokens || []).map(normalize).filter(Boolean);
    const departmentTokens = (state.departmentTokens || []).map(normalize).filter(Boolean);
    const mustEmail = !!(els.fHasEmail && els.fHasEmail.checked);
    const mustPhone = !!(els.fHasPhone && els.fHasPhone.checked);

    let count = 0;
    const hasFieldFilters = [
      (titleTokens.length > 0 ? 'x' : ''),
      (cityTokens.length > 0 ? 'x' : ''),
      (stateTokens.length > 0 ? 'x' : ''),
      (companyTokens.length > 0 ? 'x' : ''),
      (employeesTokens.length > 0 ? 'x' : ''),
      (industryTokens.length > 0 ? 'x' : ''),
      (visitorDomainTokens.length > 0 ? 'x' : ''),
      (seniorityTokens.length > 0 ? 'x' : ''),
      (departmentTokens.length > 0 ? 'x' : ''),
    ].some((v) => v) || mustEmail || mustPhone;
    if (els.filterBadge) {
      count = [
        (titleTokens.length > 0 ? 'x' : ''),
        (cityTokens.length > 0 ? 'x' : ''),
        (stateTokens.length > 0 ? 'x' : ''),
        (companyTokens.length > 0 ? 'x' : ''),
        (employeesTokens.length > 0 ? 'x' : ''),
        (industryTokens.length > 0 ? 'x' : ''),
        (visitorDomainTokens.length > 0 ? 'x' : ''),
        (seniorityTokens.length > 0 ? 'x' : ''),
        (departmentTokens.length > 0 ? 'x' : ''),
      ].filter(Boolean).length + (mustEmail ? 1 : 0) + (mustPhone ? 1 : 0);
      if (count > 0) {
        els.filterBadge.textContent = String(count);
        els.filterBadge.removeAttribute('hidden');
      } else {
        els.filterBadge.setAttribute('hidden', '');
      }
    }

    const qMatch = (str) => !q || normalize(str).includes(q);
    const tokenMatch = (tokens) => (str) => {
      if (!tokens || tokens.length === 0) return true;
      const n = normalize(str);
      return tokens.some((tok) => n.includes(tok)); // OR semantics
    };
    const titleMatch = tokenMatch(titleTokens);
    const companyMatch = tokenMatch(companyTokens);
    const cityMatch = tokenMatch(cityTokens);
    const stateMatch = tokenMatch(stateTokens);
    const employeesMatch = tokenMatch(employeesTokens);
    const industryMatch = tokenMatch(industryTokens);
    const seniorityMatch = tokenMatch(seniorityTokens);
    const departmentMatch = tokenMatch(departmentTokens);

    // If visitor-domain is set, return no people for now (not wired yet)
    if (visitorDomainTokens.length > 0) {
      state.filtered = [];
      state.currentPage = 1;
      render();
      return;
    }

    state.filtered = state.data.filter((c) => {
      const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
      const hasEmail = !!c.email;
      const hasPhone = !!(c.workDirectPhone || c.mobile || c.otherPhone);
      const city = c.city || c.locationCity || '';
      const stateVal = c.state || c.locationState || '';
      const employeesVal = (c.accountEmployees != null ? c.accountEmployees : c.employees);
      const employeesStr = (employeesVal == null ? '' : String(employeesVal));
      const industryVal = c.industry || c.companyIndustry || '';
      const seniorityVal = c.seniority || '';
      const departmentVal = c.department || '';

      return (
        qMatch(fullName) || qMatch(c.title) || qMatch(c.companyName) || qMatch(c.email) || qMatch(c.workDirectPhone) || qMatch(c.mobile) || qMatch(c.otherPhone)
      ) && titleMatch(c.title) && companyMatch(c.companyName) && cityMatch(city) && stateMatch(stateVal) && employeesMatch(employeesStr) && industryMatch(industryVal) && seniorityMatch(seniorityVal) && departmentMatch(departmentVal) && (!mustEmail || hasEmail) && (!mustPhone || hasPhone);
    });
    // Reset to first page after filtering
    state.currentPage = 1;
    render();
  }

  function clearFilters() {
    if (els.fTitle) els.fTitle.value = '';
    clearTitleTokens();
    if (els.fCompany) els.fCompany.value = '';
    clearCompanyTokens();
    if (els.fCity) els.fCity.value = '';
    clearCityTokens();
    if (els.fState) els.fState.value = '';
    clearStateTokens();
    if (els.fEmployees) els.fEmployees.value = '';
    clearEmployeesTokens();
    if (els.fIndustry) els.fIndustry.value = '';
    clearIndustryTokens();
    if (els.fVisitorDomain) els.fVisitorDomain.value = '';
    clearVisitorDomainTokens();
    if (els.fSeniority) els.fSeniority.value = '';
    clearSeniorityTokens();
    if (els.fDepartment) els.fDepartment.value = '';
    clearDepartmentTokens();
    if (els.fHasEmail) els.fHasEmail.checked = false;
    if (els.fHasPhone) els.fHasPhone.checked = false;
    if (els.quickSearch) els.quickSearch.value = '';
    applyFilters();
  }

  // ===== City chip-input helpers =====
  function buildCitySuggestionPool() {
    const set = new Set();
    const pool = [];
    for (const c of state.data) {
      const v = (c.city || c.locationCity || '').toString().trim();
      if (!v) continue;
      const key = normalize(v);
      if (!set.has(key)) { set.add(key); pool.push(v); }
      if (pool.length > 2000) break;
    }
    state.cityPool = pool;
  }
  function renderCityChips() {
    if (!els.cityChips) return;
    // console.log('[Chips][renderCityChips] called with tokens:', state.cityTokens.slice());
    const chipHTML = state.cityTokens.map((t, idx) => `
      <span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    // console.log('[Filters][DEBUG] renderCityChips HTML:', chipHTML);
    els.cityChips.innerHTML = chipHTML;
    // Use the shared transition-based removal to avoid last-chip flicker
    addChipRemoveAnimation(els.cityChips, state.cityTokens, renderCityChips);
    if (els.cityClear) { if (state.cityTokens.length>0) els.cityClear.removeAttribute('hidden'); else els.cityClear.setAttribute('hidden',''); }
    // Hide placeholder when chips exist (works even if :has() is unsupported)
    if (els.fCity) {
      if (state.cityTokens.length > 0) {
        if (els.fCity.getAttribute('data-ph') == null) {
          els.fCity.setAttribute('data-ph', els.fCity.getAttribute('placeholder') || '');
        }
        els.fCity.setAttribute('placeholder', '');
      } else {
        const prev = els.fCity.getAttribute('data-ph') || 'e.g., Austin, Dallas';
        els.fCity.setAttribute('placeholder', prev);
      }
      try { console.log('[Filters][DEBUG] city placeholder', els.fCity.getAttribute('placeholder')); } catch(_) {}
    }
  }
  function addCityToken(label){ 
    const t=label.trim(); 
    if(!t) return; 
    const exists=state.cityTokens.some((x)=>normalize(x)===normalize(t)); 
    if(!exists){ 
      // console.log('[Flex Debug] Adding city token:', {
      //   token: t,
      //   currentTokens: state.cityTokens.length,
      //   willBeTokens: state.cityTokens.length + 1
      // });
      
      state.cityTokens.push(t); 
      addNewChipWithAnimation(els.cityChips, t, state.cityTokens, renderCityChips);
      
      // Update clear button visibility
      if (els.cityClear) {
        if (state.cityTokens.length > 0) els.cityClear.removeAttribute('hidden');
        else els.cityClear.setAttribute('hidden', '');
      }
      // Hide placeholder when chips exist
      if (els.fCity) {
        if (state.cityTokens.length > 0) {
          if (els.fCity.getAttribute('data-ph') == null) {
            els.fCity.setAttribute('data-ph', els.fCity.getAttribute('placeholder') || '');
          }
          els.fCity.setAttribute('placeholder', '');
        } else {
          const prev = els.fCity.getAttribute('data-ph') || 'e.g., Austin, Dallas';
          els.fCity.setAttribute('placeholder', prev);
        }
      }
    } else {
      // console.log('[Flex Debug] City token already exists:', t);
    }
  }
  function removeLastCityToken(){ if(state.cityTokens.length===0) return; state.cityTokens.pop(); renderCityChips(); }
  function clearCityTokens(){ if(state.cityTokens.length===0) return; state.cityTokens=[]; renderCityChips(); }
  function updateCitySuggestions(){ if(!els.citySuggest) return; const q=normalize(els.fCity?els.fCity.value:''); if(!q){ hideCitySuggestions(); return; } const items=[]; for(let i=0;i<state.cityPool.length && items.length<8;i++){ const s=state.cityPool[i]; if(normalize(s).includes(q) && !state.cityTokens.some((x)=>normalize(x)===normalize(s))) items.push(s); } if(items.length===0){ hideCitySuggestions(); return; } els.citySuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.citySuggest.removeAttribute('hidden'); }
  function hideCitySuggestions(){ if(els.citySuggest){ els.citySuggest.setAttribute('hidden',''); els.citySuggest.innerHTML=''; } }

  // ===== State chip-input helpers =====
  function buildStateSuggestionPool(){ const set=new Set(); const pool=[]; for(const c of state.data){ const v=(c.state || c.locationState || '').toString().trim(); if(!v) continue; const key=normalize(v); if(!set.has(key)){ set.add(key); pool.push(v);} if(pool.length>2000) break; } state.statePool=pool; }
  function renderStateChips(){ 
    if(!els.stateChips) return; 
    els.stateChips.innerHTML = state.stateTokens.map((t,idx)=>`<span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); 
    addChipRemoveAnimation(els.stateChips, state.stateTokens, renderStateChips);
    if(els.stateClear){ if(state.stateTokens.length>0) els.stateClear.removeAttribute('hidden'); else els.stateClear.setAttribute('hidden',''); } 
  }
  function addStateToken(label){ const t=label.trim(); if(!t) return; const exists=state.stateTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.stateTokens.push(t); renderStateChips(); } }
  function removeLastStateToken(){ if(state.stateTokens.length===0) return; state.stateTokens.pop(); renderStateChips(); }
  function clearStateTokens(){ if(state.stateTokens.length===0) return; state.stateTokens=[]; renderStateChips(); }
  function updateStateSuggestions(){ if(!els.stateSuggest) return; const q=normalize(els.fState?els.fState.value:''); if(!q){ hideStateSuggestions(); return;} const items=[]; for(let i=0;i<state.statePool.length && items.length<8;i++){ const s=state.statePool[i]; if(normalize(s).includes(q) && !state.stateTokens.some((x)=>normalize(x)===normalize(s))) items.push(s);} if(items.length===0){ hideStateSuggestions(); return; } els.stateSuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.stateSuggest.removeAttribute('hidden'); }
  function hideStateSuggestions(){ if(els.stateSuggest){ els.stateSuggest.setAttribute('hidden',''); els.stateSuggest.innerHTML=''; } }

  // ===== Employees chip-input helpers =====
  function buildEmployeesSuggestionPool(){ const set=new Set(); const pool=[]; for(const c of state.data){ const v=(c.accountEmployees != null ? c.accountEmployees : c.employees); const s=(v==null?'':String(v)).trim(); if(!s) continue; const key=normalize(s); if(!set.has(key)){ set.add(key); pool.push(s);} if(pool.length>2000) break; } state.employeesPool=pool; }
  function renderEmployeesChips(){
    if(!els.employeesChips) return;
    els.employeesChips.innerHTML = state.employeesTokens.map((t,idx)=>`
      <span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    addChipRemoveAnimation(els.employeesChips, state.employeesTokens, renderEmployeesChips);
    if(els.employeesClear){
      if(state.employeesTokens.length>0) els.employeesClear.removeAttribute('hidden');
      else els.employeesClear.setAttribute('hidden','');
    }
  }
  function addEmployeesToken(label){ const t=label.trim(); if(!t) return; const exists=state.employeesTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.employeesTokens.push(t); renderEmployeesChips(); } }
  function removeLastEmployeesToken(){ if(state.employeesTokens.length===0) return; state.employeesTokens.pop(); renderEmployeesChips(); }
  function clearEmployeesTokens(){ if(state.employeesTokens.length===0) return; state.employeesTokens=[]; renderEmployeesChips(); }
  function updateEmployeesSuggestions(){ if(!els.employeesSuggest) return; const q=normalize(els.fEmployees?els.fEmployees.value:''); if(!q){ hideEmployeesSuggestions(); return;} const items=[]; for(let i=0;i<state.employeesPool.length && items.length<8;i++){ const s=state.employeesPool[i]; if(normalize(s).includes(q) && !state.employeesTokens.some((x)=>normalize(x)===normalize(s))) items.push(s);} if(items.length===0){ hideEmployeesSuggestions(); return;} els.employeesSuggest.innerHTML = items.map((s)=>`<div class=\"item\" data-sugg=\"${escapeHtml(s)}\">${escapeHtml(s)}</div>`).replaceAll('\\',''); els.employeesSuggest.removeAttribute('hidden'); }
  function hideEmployeesSuggestions(){ if(els.employeesSuggest){ els.employeesSuggest.setAttribute('hidden',''); els.employeesSuggest.innerHTML=''; } }

  // ===== Industry chip-input helpers =====
  function buildIndustrySuggestionPool(){ const set=new Set(); const pool=[]; for(const c of state.data){ const v=(c.industry || c.companyIndustry || '').toString().trim(); if(!v) continue; const key=normalize(v); if(!set.has(key)){ set.add(key); pool.push(v);} if(pool.length>2000) break; } state.industryPool=pool; }
  function renderIndustryChips(){ 
    if(!els.industryChips) return; 
    els.industryChips.innerHTML = state.industryTokens.map((t,idx)=>`<span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); 
    addChipRemoveAnimation(els.industryChips, state.industryTokens, renderIndustryChips);
    if(els.industryClear){ if(state.industryTokens.length>0) els.industryClear.removeAttribute('hidden'); else els.industryClear.setAttribute('hidden',''); } 
  }
  function addIndustryToken(label){ const t=label.trim(); if(!t) return; const exists=state.industryTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.industryTokens.push(t); renderIndustryChips(); } }
  function removeLastIndustryToken(){ if(state.industryTokens.length===0) return; state.industryTokens.pop(); renderIndustryChips(); }
  function clearIndustryTokens(){ if(state.industryTokens.length===0) return; state.industryTokens=[]; renderIndustryChips(); }
  function updateIndustrySuggestions(){ if(!els.industrySuggest) return; const q=normalize(els.fIndustry?els.fIndustry.value:''); if(!q){ hideIndustrySuggestions(); return;} const items=[]; for(let i=0;i<state.industryPool.length && items.length<8;i++){ const s=state.industryPool[i]; if(normalize(s).includes(q) && !state.industryTokens.some((x)=>normalize(x)===normalize(s))) items.push(s);} if(items.length===0){ hideIndustrySuggestions(); return;} els.industrySuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.industrySuggest.removeAttribute('hidden'); }
  function hideIndustrySuggestions(){ if(els.industrySuggest){ els.industrySuggest.setAttribute('hidden',''); els.industrySuggest.innerHTML=''; } }

  // ===== Visitor domain chip-input helpers =====
  function buildVisitorDomainSuggestionPool(){ const set=new Set(); const pool=[]; // Seed with our known domain per spec
    const seed=['powerchoosers.com'];
    for(const d of seed){ const key=normalize(d); if(!set.has(key)){ set.add(key); pool.push(d);} }
    for(const c of state.data){
      const arr = Array.isArray(c.visitorDomains) ? c.visitorDomains : [];
      for(const d of arr){ const s=(d||'').toString().trim(); if(!s) continue; const key=normalize(s); if(!set.has(key)){ set.add(key); pool.push(s); } if(pool.length>2000) break; }
      if(pool.length>2000) break;
    }
    state.visitorDomainPool = pool;
  }
  function buildSenioritySuggestionPool(){ const set=new Set(); const pool=[]; for(const c of state.data){ const v=(c.seniority || '').toString().trim(); if(!v) continue; const key=normalize(v); if(!set.has(key)){ set.add(key); pool.push(v);} if(pool.length>2000) break; } state.seniorityPool=pool; }
  function buildDepartmentSuggestionPool(){ const set=new Set(); const pool=[]; for(const c of state.data){ const v=(c.department || '').toString().trim(); if(!v) continue; const key=normalize(v); if(!set.has(key)){ set.add(key); pool.push(v);} if(pool.length>2000) break; } state.departmentPool=pool; }
  function renderVisitorDomainChips(){ 
    if(!els.visitorDomainChips) return; 
    els.visitorDomainChips.innerHTML = state.visitorDomainTokens.map((t,idx)=>`<span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); 
    addChipRemoveAnimation(els.visitorDomainChips, state.visitorDomainTokens, renderVisitorDomainChips);
    if(els.visitorDomainClear){ if(state.visitorDomainTokens.length>0) els.visitorDomainClear.removeAttribute('hidden'); else els.visitorDomainClear.setAttribute('hidden',''); } 
  }
  function renderSeniorityChips(){ 
    if(!els.seniorityChips) return; 
    els.seniorityChips.innerHTML = state.seniorityTokens.map((t,idx)=>`<span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); 
    addChipRemoveAnimation(els.seniorityChips, state.seniorityTokens, renderSeniorityChips);
    if(els.seniorityClear){ if(state.seniorityTokens.length>0) els.seniorityClear.removeAttribute('hidden'); else els.seniorityClear.setAttribute('hidden',''); } 
  }
  function renderDepartmentChips(){ 
    if(!els.departmentChips) return; 
    els.departmentChips.innerHTML = state.departmentTokens.map((t,idx)=>`<span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); 
    addChipRemoveAnimation(els.departmentChips, state.departmentTokens, renderDepartmentChips);
    if(els.departmentClear){ if(state.departmentTokens.length>0) els.departmentClear.removeAttribute('hidden'); else els.departmentClear.setAttribute('hidden',''); } 
  }
  function addVisitorDomainToken(label){ const t=label.trim(); if(!t) return; const exists=state.visitorDomainTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.visitorDomainTokens.push(t); renderVisitorDomainChips(); } }
  function removeLastVisitorDomainToken(){ if(state.visitorDomainTokens.length===0) return; state.visitorDomainTokens.pop(); renderVisitorDomainChips(); }
  function clearVisitorDomainTokens(){ if(state.visitorDomainTokens.length===0) return; state.visitorDomainTokens=[]; renderVisitorDomainChips(); }
  function updateVisitorDomainSuggestions(){ if(!els.visitorDomainSuggest) return; const q=normalize(els.fVisitorDomain?els.fVisitorDomain.value:''); if(!q){ hideVisitorDomainSuggestions(); return;} const items=[]; for(let i=0;i<state.visitorDomainPool.length && items.length<8;i++){ const s=state.visitorDomainPool[i]; if(normalize(s).includes(q) && !state.visitorDomainTokens.some((x)=>normalize(x)===normalize(s))) items.push(s);} if(items.length===0){ hideVisitorDomainSuggestions(); return;} els.visitorDomainSuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.visitorDomainSuggest.removeAttribute('hidden'); }
  function hideVisitorDomainSuggestions(){ if(els.visitorDomainSuggest){ els.visitorDomainSuggest.setAttribute('hidden',''); els.visitorDomainSuggest.innerHTML=''; } }
  function addSeniorityToken(label){ const t=label.trim(); if(!t) return; const exists=state.seniorityTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.seniorityTokens.push(t); renderSeniorityChips(); } }
  function removeLastSeniorityToken(){ if(state.seniorityTokens.length===0) return; state.seniorityTokens.pop(); renderSeniorityChips(); }
  function clearSeniorityTokens(){ if(state.seniorityTokens.length===0) return; state.seniorityTokens=[]; renderSeniorityChips(); }
  function updateSenioritySuggestions(){ if(!els.senioritySuggest) return; const q=normalize(els.fSeniority?els.fSeniority.value:''); if(!q){ hideSenioritySuggestions(); return;} const items=[]; for(let i=0;i<state.seniorityPool.length && items.length<8;i++){ const s=state.seniorityPool[i]; if(normalize(s).includes(q) && !state.seniorityTokens.some((x)=>normalize(x)===normalize(s))) items.push(s);} if(items.length===0){ hideSenioritySuggestions(); return;} els.senioritySuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.senioritySuggest.removeAttribute('hidden'); }
  function hideSenioritySuggestions(){ if(els.senioritySuggest){ els.senioritySuggest.setAttribute('hidden',''); els.senioritySuggest.innerHTML=''; } }
  function addDepartmentToken(label){ const t=label.trim(); if(!t) return; const exists=state.departmentTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.departmentTokens.push(t); renderDepartmentChips(); } }
  function removeLastDepartmentToken(){ if(state.departmentTokens.length===0) return; state.departmentTokens.pop(); renderDepartmentChips(); }
  function clearDepartmentTokens(){ if(state.departmentTokens.length===0) return; state.departmentTokens=[]; renderDepartmentChips(); }
  function updateDepartmentSuggestions(){ if(!els.departmentSuggest) return; const q=normalize(els.fDepartment?els.fDepartment.value:''); if(!q){ hideDepartmentSuggestions(); return;} const items=[]; for(let i=0;i<state.departmentPool.length && items.length<8;i++){ const s=state.departmentPool[i]; if(normalize(s).includes(q) && !state.departmentTokens.some((x)=>normalize(x)===normalize(s))) items.push(s);} if(items.length===0){ hideDepartmentSuggestions(); return;} els.departmentSuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.departmentSuggest.removeAttribute('hidden'); }
  function hideDepartmentSuggestions(){ if(els.departmentSuggest){ els.departmentSuggest.setAttribute('hidden',''); els.departmentSuggest.innerHTML=''; } }

  // ===== Title chip-input helpers =====
  function buildTitleSuggestionPool() {
    const set = new Set();
    const pool = [];
    for (const c of state.data) {
      const t = (c.title || '').toString().trim();
      if (!t) continue;
      const key = normalize(t);
      if (!set.has(key)) { set.add(key); pool.push(t); }
      if (pool.length > 2000) break;
    }
    state.titlePool = pool;
  }
  function renderTitleChips() {
    if (!els.titleChips) return;
    els.titleChips.innerHTML = state.titleTokens.map((t, idx) => `
      <span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    addChipRemoveAnimation(els.titleChips, state.titleTokens, renderTitleChips);
    if (els.titleClear) {
      if (state.titleTokens.length > 0) els.titleClear.removeAttribute('hidden');
      else els.titleClear.setAttribute('hidden', '');
    }
  }
  function addTitleToken(label) {
    const t = label.trim(); if (!t) return;
    const exists = state.titleTokens.some((x) => normalize(x) === normalize(t));
    if (!exists) { state.titleTokens.push(t); renderTitleChips(); }
  }
  function removeLastTitleToken() { if (state.titleTokens.length === 0) return; state.titleTokens.pop(); renderTitleChips(); }
  function clearTitleTokens() { if (state.titleTokens.length === 0) return; state.titleTokens = []; renderTitleChips(); }
  function updateTitleSuggestions() {
    if (!els.titleSuggest) return;
    const q = normalize(els.fTitle ? els.fTitle.value : '');
    if (!q) { hideTitleSuggestions(); return; }
    const items = [];
    for (let i = 0; i < state.titlePool.length && items.length < 8; i++) {
      const s = state.titlePool[i];
      if (normalize(s).includes(q) && !state.titleTokens.some((x) => normalize(x) === normalize(s))) items.push(s);
    }
    if (items.length === 0) { hideTitleSuggestions(); return; }
    els.titleSuggest.innerHTML = items.map((s) => `<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
    els.titleSuggest.removeAttribute('hidden');
  }
  function hideTitleSuggestions() { if (els.titleSuggest) { els.titleSuggest.setAttribute('hidden', ''); els.titleSuggest.innerHTML = ''; } }

  // ===== Company chip-input helpers =====
  function buildCompanySuggestionPool() {
    const set = new Set();
    const pool = [];
    for (const c of state.data) {
      const v = (c.companyName || '').toString().trim();
      if (!v) continue;
      const key = normalize(v);
      if (!set.has(key)) { set.add(key); pool.push(v); }
      if (pool.length > 2000) break;
    }
    state.companyPool = pool;
  }
  function renderCompanyChips() {
    if (!els.companyChips) return;
    els.companyChips.innerHTML = state.companyTokens.map((t, idx) => `
      <span class="chip chip-existing" style="background: var(--orange-primary); border:1px solid var(--orange-primary); color: var(--text-inverse);" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    addChipRemoveAnimation(els.companyChips, state.companyTokens, renderCompanyChips);
    if (els.companyClear) {
      if (state.companyTokens.length > 0) els.companyClear.removeAttribute('hidden');
      else els.companyClear.setAttribute('hidden', '');
    }
  }
  function addCompanyToken(label) { const t = label.trim(); if (!t) return; const exists = state.companyTokens.some((x) => normalize(x) === normalize(t)); if (!exists) { state.companyTokens.push(t); renderCompanyChips(); } }
  function removeLastCompanyToken() { if (state.companyTokens.length === 0) return; state.companyTokens.pop(); renderCompanyChips(); }
  function clearCompanyTokens() { if (state.companyTokens.length === 0) return; state.companyTokens = []; renderCompanyChips(); }
  function updateCompanySuggestions() {
    if (!els.companySuggest) return;
    const q = normalize(els.fCompany ? els.fCompany.value : '');
    if (!q) { hideCompanySuggestions(); return; }
    const items = [];
    for (let i = 0; i < state.companyPool.length && items.length < 8; i++) {
      const s = state.companyPool[i];
      if (normalize(s).includes(q) && !state.companyTokens.some((x) => normalize(x) === normalize(s))) items.push(s);
    }
    if (items.length === 0) { hideCompanySuggestions(); return; }
    els.companySuggest.innerHTML = items.map((s) => `<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
    els.companySuggest.removeAttribute('hidden');
  }
  function hideCompanySuggestions() { if (els.companySuggest) { els.companySuggest.setAttribute('hidden', ''); els.companySuggest.innerHTML = ''; } }

  

  async function render() {
    if (!els.tbody) return;
    
    const pageItems = getPageItems();
    let rows = pageItems.map((c) => rowHtml(c)).join('');
    
    // If this isn't the first render, pre-mark icons as loaded to prevent animation flicker
    if (state.hasAnimated && rows) {
      rows = rows.replace(/class="company-favicon"/g, 'class="company-favicon icon-loaded"');
      rows = rows.replace(/class="avatar-initials"/g, 'class="avatar-initials icon-loaded"');
    }
    
    els.tbody.innerHTML = rows || emptyHtml();
    
    // Trigger fade-zoom animation ONLY on first render
    if (!state.hasAnimated && rows) {
      els.tbody.classList.remove('animating');
      void els.tbody.offsetHeight; // Force reflow
      els.tbody.classList.add('animating');
      
      // Mark as animated
      state.hasAnimated = true;
      
      // Remove animation class after animation completes
      setTimeout(() => {
        if (els.tbody) els.tbody.classList.remove('animating');
      }, 400);
    }
    
    // After render, sync select-all and row selections
    updateRowsCheckedState();
    updateSelectAllState();
    renderPagination();
    updateBulkActionsBar();
  }

  function safe(val) {
    return (val == null ? '' : String(val));
  }

  // Attempt to coerce various timestamp shapes to a valid Date
  function coerceDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    // Firestore Timestamp with toDate()
    if (typeof val === 'object' && typeof val.toDate === 'function') {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    // Firestore Timestamp-like { seconds, nanoseconds }
    if (val && typeof val.seconds === 'number') {
      const ms = val.seconds * 1000 + (typeof val.nanoseconds === 'number' ? Math.floor(val.nanoseconds / 1e6) : 0);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    // Numeric epoch (ms or seconds)
    if (typeof val === 'number') {
      const d = new Date(val > 1e12 ? val : val * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    // Parseable string
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function formatDateOrNA() {
    for (let i = 0; i < arguments.length; i++) {
      const d = coerceDate(arguments[i]);
      if (d) return d.toLocaleDateString();
    }
    // As a last resort, if no timestamps exist, show 'Just now' for newly created items in-session
    try {
      if (arguments.length === 0 || arguments.every(v => !v)) return 'Just now';
    } catch(_) {}
    return 'N/A';
  }

  // Small inline SVG icons (inherit currentColor -> white on dark)
  function svgIcon(name) {
    switch (name) {
      case 'clear':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
      case 'email':
        /* Match left sidebar Emails icon exactly */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none"></path><polyline points="22,6 12,13 2,6" fill="none"></polyline></svg>';
      case 'sequence':
        /* Match left sidebar Sequences icon exactly (right-facing triangle) */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>';
      case 'call':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.5v2a3 3 0 0 1-3.3 3 a19 19 0 0 1-8.3-3.2 19 19 0 0 1-6-6A19 19 0 0 1 1.5 4.3 3 3 0 0 1 4.5 1h2a2 2 0 0 1 2 1.7l.4 2.3a2 2 0 0 1-.5 1.8L7 8a16 16 0 0 0 9 9l1.2-1.3a2 2 0 0 1 1.8-.5l2.3.4A2 2 0 0 1 22 16.5z"/></svg>';
      case 'addlist':
        /* Bullet point lists icon from left sidebar with proper spacing and centering */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="1"></circle><line x1="12" y1="6" x2="20" y2="6"></line><circle cx="6" cy="12" r="1"></circle><line x1="12" y1="12" x2="20" y2="12"></line><circle cx="6" cy="18" r="1"></circle><line x1="12" y1="18" x2="20" y2="18"></line></svg>';
      case 'export':
        /* Download into tray icon (arrow down + base) to match reference */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      case 'ai':
        /* Slightly larger and better-centered AI letters */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:block"><text x="12" y="12" dy="-0.12em" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="18" font-weight="800" letter-spacing="0.05" font-family="Inter, system-ui, -apple-system, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif">AI</text></svg>';
      case 'linkedin':
        /* LinkedIn icon - just the "in" letters without border */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>';
      case 'link':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/></svg>';
      case 'task':
        /* Tasks icon from left sidebar */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,11 12,14 22,4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>';
      case 'delete':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      case 'assign':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      default:
        return '';
      }
  }
  if (els.titleClear) {
    if (state.titleTokens.length > 0) els.titleClear.removeAttribute('hidden');
    else els.titleClear.setAttribute('hidden', '');
  }

  // Helper function to normalize phone numbers (last 10 digits)
  function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '').slice(-10);
  }

  // Call status cache for people
  let peopleCallStatusCache = new Map();
  
  // Generate status badges for a contact (async version)
  async function generateStatusBadges(contact) {
    const badges = [];
    
    // Check if contact is new (created within 24 hours)
    const isNew = (() => {
      try {
        const created = coerceDate(contact.createdAt);
        if (!created) return false;
        const now = new Date();
        const hoursDiff = (now - created) / (1000 * 60 * 60);
        return hoursDiff < 24;
      } catch (e) {
        return false;
      }
    })();
    
    // Check if contact has any calls logged (async)
    const hasNoCalls = await (async () => {
      try {
        // Collect all phone numbers for this contact
        const phoneNumbers = new Set();
        
        // Add contact's direct phone numbers
        if (contact.workDirectPhone) phoneNumbers.add(normalizePhone(contact.workDirectPhone));
        if (contact.mobile) phoneNumbers.add(normalizePhone(contact.mobile));
        if (contact.otherPhone) phoneNumbers.add(normalizePhone(contact.otherPhone));
        
        // Also add company phone from linked account
        try {
          const accounts = (typeof window.getAccountsData === 'function') ? window.getAccountsData() : [];
          let linkedAccount = null;
          
          // Try to find by accountId first
          if (contact.accountId) {
            linkedAccount = accounts.find(a => a.id === contact.accountId);
          }
          
          // Fallback to company name match
          if (!linkedAccount && contact.companyName) {
            const normName = String(contact.companyName).toLowerCase().trim();
            linkedAccount = accounts.find(a => {
              const accName = String(a.accountName || a.name || '').toLowerCase().trim();
              return accName === normName;
            });
          }
          
          // Add company phone if found
          if (linkedAccount) {
            const companyPhone = linkedAccount.companyPhone || linkedAccount.phone;
            if (companyPhone) {
              phoneNumbers.add(normalizePhone(companyPhone));
            }
          }
        } catch (e) {
          // Silently continue if account lookup fails
        }
        
        // Convert to array and filter out empty strings
        const phones = Array.from(phoneNumbers).filter(p => p.length === 10);
        
        if (phones.length === 0) {
          return false; // No phone numbers, don't show badge
        }
        
        // Check cache first
        const hasCachedCall = phones.some(phone => peopleCallStatusCache.has(phone));
        if (hasCachedCall) {
          return !phones.some(phone => peopleCallStatusCache.get(phone));
        }
        if (peopleCallStatusCache.has(contact.id)) {
          return !peopleCallStatusCache.get(contact.id);
        }
        
        // Get call status from API (lightweight)
        if (window.BackgroundCallsLoader && typeof window.BackgroundCallsLoader.getCallStatus === 'function') {
          const callStatus = await window.BackgroundCallsLoader.getCallStatus(phones, [], [contact.id]);
          return !phones.some(phone => callStatus[phone]) && !callStatus[contact.id];
        }
        
        return false;
      } catch (e) {
        return false;
      }
    })();
    
    // Add "New" badge (green)
    if (isNew) {
      badges.push('<span class="status-badge status-badge-new">New</span>');
    }
    
    // Add "No Calls" badge (grey) - only if not new (to avoid clutter)
    if (!isNew && hasNoCalls) {
      badges.push('<span class="status-badge status-badge-no-calls">No Calls</span>');
    }
    
    return badges.join('');
  }
  
  // Synchronous version for rendering (uses cache)
  function generateStatusBadgesSync(contact) {
    const badges = [];
    
    // Check if contact is new (created within 24 hours)
    const isNew = (() => {
      try {
        const created = coerceDate(contact.createdAt);
        if (!created) return false;
        const now = new Date();
        const hoursDiff = (now - created) / (1000 * 60 * 60);
        return hoursDiff < 24;
      } catch (e) {
        return false;
      }
    })();
    
    // Check if contact has any calls logged (using cache)
    const hasNoCalls = (() => {
      try {
        // Collect all phone numbers for this contact
        const phoneNumbers = new Set();
        
        // Add contact's direct phone numbers
        if (contact.workDirectPhone) phoneNumbers.add(normalizePhone(contact.workDirectPhone));
        if (contact.mobile) phoneNumbers.add(normalizePhone(contact.mobile));
        if (contact.otherPhone) phoneNumbers.add(normalizePhone(contact.otherPhone));
        
        // Also add company phone from linked account
        try {
          const accounts = (typeof window.getAccountsData === 'function') ? window.getAccountsData() : [];
          let linkedAccount = null;
          
          // Try to find by accountId first
          if (contact.accountId) {
            linkedAccount = accounts.find(a => a.id === contact.accountId);
          }
          
          // Fallback to company name match
          if (!linkedAccount && contact.companyName) {
            const normName = String(contact.companyName).toLowerCase().trim();
            linkedAccount = accounts.find(a => {
              const accName = String(a.accountName || a.name || '').toLowerCase().trim();
              return accName === normName;
            });
          }
          
          // Add company phone if found
          if (linkedAccount) {
            const companyPhone = linkedAccount.companyPhone || linkedAccount.phone;
            if (companyPhone) {
              phoneNumbers.add(normalizePhone(companyPhone));
            }
          }
        } catch (e) {
          // Silently continue if account lookup fails
        }
        
        // Convert to array and filter out empty strings
        const phones = Array.from(phoneNumbers).filter(p => p.length === 10);
        
        if (phones.length === 0) {
          return false; // No phone numbers, don't show badge
        }
        
        // Check cache first
        const hasCachedCall = phones.some(phone => peopleCallStatusCache.has(phone));
        if (hasCachedCall) {
          return !phones.some(phone => peopleCallStatusCache.get(phone));
        }
        if (peopleCallStatusCache.has(contact.id)) {
          return !peopleCallStatusCache.get(contact.id);
        }
        
        // If not in cache, don't show badge (will be updated when cache is populated)
        return false;
      } catch (e) {
        return false;
      }
    })();
    
    // Add "New" badge (green)
    if (isNew) {
      badges.push('<span class="status-badge status-badge-new">New</span>');
    }
    
    // Add "No Calls" badge (grey) - only if not new (to avoid clutter)
    if (!isNew && hasNoCalls) {
      badges.push('<span class="status-badge status-badge-no-calls">No Calls</span>');
    }
    
    return badges.join('');
  }
  
  // Batch update call status for all visible contacts
  async function updatePeopleCallStatus() {
    if (!window.BackgroundCallsLoader || typeof window.BackgroundCallsLoader.getCallStatus !== 'function') {
      return;
    }
    
    try {
      const phones = [];
      const contactIds = [];
      
      // Collect all phone numbers and contact IDs from current page
      state.data.forEach(contact => {
        // Add contact's direct phone numbers
        if (contact.workDirectPhone) {
          const phone = normalizePhone(contact.workDirectPhone);
          if (phone.length === 10) phones.push(phone);
        }
        if (contact.mobile) {
          const phone = normalizePhone(contact.mobile);
          if (phone.length === 10) phones.push(phone);
        }
        if (contact.otherPhone) {
          const phone = normalizePhone(contact.otherPhone);
          if (phone.length === 10) phones.push(phone);
        }
        
        // Add company phone from linked account
        try {
          const accounts = (typeof window.getAccountsData === 'function') ? window.getAccountsData() : [];
          let linkedAccount = null;
          
          if (contact.accountId) {
            linkedAccount = accounts.find(a => a.id === contact.accountId);
          }
          
          if (!linkedAccount && contact.companyName) {
            const normName = String(contact.companyName).toLowerCase().trim();
            linkedAccount = accounts.find(a => {
              const accName = String(a.accountName || a.name || '').toLowerCase().trim();
              return accName === normName;
            });
          }
          
          if (linkedAccount) {
            const companyPhone = linkedAccount.companyPhone || linkedAccount.phone;
            if (companyPhone) {
              const phone = normalizePhone(companyPhone);
              if (phone.length === 10) phones.push(phone);
            }
          }
        } catch (e) {
          // Silently continue if account lookup fails
        }
        
        if (contact.id) {
          contactIds.push(contact.id);
        }
      });
      
      if (phones.length === 0 && contactIds.length === 0) return;
      
      // Single API call for all badges
      const callStatus = await window.BackgroundCallsLoader.getCallStatus(phones, [], contactIds);
      
      // Update cache
      Object.entries(callStatus).forEach(([key, value]) => {
        peopleCallStatusCache.set(key, value);
      });
      
      console.log('[People] Updated call status for', Object.keys(callStatus).length, 'items');
    } catch (error) {
      console.error('[People] Failed to update call status:', error);
    }
  }

  function rowHtml(c) {
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || safe(c.name);
    const title = safe(c.title);
    const company = safe(c.companyName);
    const email = safe(c.email);
    // Prefer user-selected default phone if provided
    const preferredKey = String(c.preferredPhoneField || '').trim();
    let phoneRaw = '';
    if (preferredKey && (preferredKey === 'workDirectPhone' || preferredKey === 'mobile' || preferredKey === 'otherPhone')) {
      phoneRaw = c[preferredKey] || '';
    }
    if (!phoneRaw) phoneRaw = c.workDirectPhone || c.mobile || c.otherPhone || '';
    const phone = safe(phoneRaw);
    const updatedStr = formatDateOrNA(c.updatedAt, c.createdAt);
    const city = safe(c.city || c.locationCity || '');
    const stateVal = safe(c.state || c.locationState || '');
    const location = (city || stateVal) ? `${escapeHtml(city)}${city && stateVal ? ', ' : ''}${escapeHtml(stateVal)}` : '';

    const linkedin = safe(c.linkedin || c.linkedinUrl || c.linkedin_url || '');
    const domain = safe(c.companyDomain || c.domain || '');
    const websiteRaw = safe(c.companyWebsite || c.website || (domain ? (domain.startsWith('http') ? domain : ('https://' + domain)) : ''));
    const website = websiteRaw;

    const checked = state.selected.has(c.id) ? ' checked' : '';
    const rowClass = state.selected.has(c.id) ? ' class="row-selected"' : '';

    // Compute initials for avatar (first letter of first and last word)
    const initials = (() => {
      const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
      const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : (parts[0] ? [parts[0][0]] : []);
      const str = chars.join('').toUpperCase();
      if (str) return str;
      const e = String(c.email || '').trim();
      return e ? e[0].toUpperCase() : '?';
    })();

    // Compute favicon domain
    const favDomain = (() => {
      let d = String(domain || '').trim();
      if (!d && website) {
        try { d = new URL(website).hostname; } catch (_) { d = String(website).replace(/^https?:\/\//i, '').split('/')[0]; }
      }
      return d ? d.replace(/^www\./i, '') : '';
    })();

    // Generate status badges (synchronous version using cache)
    const badges = generateStatusBadgesSync(c);

    const cells = {
      select: `<td class="col-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(c.id)}" aria-label="Select contact"${checked}></td>`,
      name: `<td class="name-cell" data-contact-id="${escapeHtml(c.id)}"><div class="name-cell__wrap"><span class="avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(fullName)}</span>${badges}</div></td>`,
      title: `<td>${escapeHtml(title)}</td>`,
      company: `<td><a href="#account-details" class="company-link" data-company="${escapeHtml(company)}" data-domain="${escapeHtml(favDomain)}"><span class="company-cell__wrap">${favDomain && window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(favDomain, 32) : ''}<span class="company-name">${escapeHtml(company)}</span></span></a></td>`,
      email: `<td>${escapeHtml(email)}</td>`,
      phone: `<td class="phone-cell" data-phone="${escapeHtml(phone)}">${phone ? `<span class="phone-link">${escapeHtml(formatPhoneForDisplay(phone))}</span>` : ''}</td>`,
      location: `<td>${location}</td>`,
      actions: `<td class="qa-cell"><div class="qa-actions">
        <button type="button" class="qa-btn" data-action="task" data-id="${escapeHtml(c.id)}" aria-label="Create task" title="Create task">${svgIcon('task')}</button>
        <button type="button" class="qa-btn" data-action="linkedin" data-id="${escapeHtml(c.id)}" data-linkedin="${escapeHtml(linkedin)}" data-name="${escapeHtml(fullName)}" data-company="${escapeHtml(company)}" aria-label="LinkedIn" title="LinkedIn">${svgIcon('linkedin')}</button>
        <button type="button" class="qa-btn" data-action="website" data-id="${escapeHtml(c.id)}" data-website="${escapeHtml(website)}" data-company="${escapeHtml(company)}" aria-label="Company website" title="Company website">${svgIcon('link')}</button>
      </div></td>`,
      updated: `<td>${escapeHtml(updatedStr)}</td>`,
    };

    const tds = [];
    const order = (contactsColumnOrder && contactsColumnOrder.length) ? contactsColumnOrder : DEFAULT_CONTACTS_COL_ORDER;
    for (const key of order) {
      if (cells[key]) tds.push(cells[key]);
    }
    return `\n<tr${rowClass} data-contact-id="${escapeHtml(c.id)}">\n  ${tds.join('\n  ')}\n</tr>`;
  }

  function emptyHtml() {
    const colCount = (contactsColumnOrder && contactsColumnOrder.length) ? contactsColumnOrder.length : DEFAULT_CONTACTS_COL_ORDER.length;
    return `\n<tr>\n  <td colspan="${colCount}" style="opacity:.75">No contacts found.</td>\n</tr>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getCurrentState(){
    return {
      page: 'people',
      scroll: window.scrollY || 0,
      currentPage: state.currentPage || 1,
      filters: {
        titleTokens: [...state.titleTokens],
        companyTokens: [...state.companyTokens],
        cityTokens: [...state.cityTokens],
        stateTokens: [...state.stateTokens],
        employeesTokens: [...state.employeesTokens],
        industryTokens: [...state.industryTokens],
        visitorDomainTokens: [...state.visitorDomainTokens],
        seniorityTokens: [...state.seniorityTokens],
        departmentTokens: [...state.departmentTokens],
        hasEmail: state.hasEmail,
        hasPhone: state.hasPhone
      },
      searchTerm: els.quickSearch?.value || '',
      selectedItems: getSelectedContacts().map(c => c.id || c.contactId || c._id),
      sortColumn: state.sortColumn || '',
      sortDirection: state.sortDirection || 'asc',
      timestamp: Date.now()
    };
  }

  function init() {
    if (!initDomRefs()) return; // Not on this page
    
    // FORCE REFRESH BADGES: Check calls data availability from background loader or callsModule
    // This ensures badges update when navigating back to the page after placing a call
    let callsData = [];
    if (window.BackgroundCallsLoader && typeof window.BackgroundCallsLoader.getCallsData === 'function') {
      callsData = window.BackgroundCallsLoader.getCallsData() || [];
    } else if (window.callsModule && typeof window.callsModule.getCallsData === 'function') {
      callsData = window.callsModule.getCallsData() || [];
    }
    // console.log('[People] Page init - calls data available:', callsData?.length || 0, 'calls');
    
    attachEvents();
    // Ensure styles for bulk popover and actions bar match CRM theme
    injectPeopleBulkStyles();
    // Load, prepare, and render header order
    contactsColumnOrder = loadPeopleColumnOrder();
    ensurePeopleHeaderColMeta();
    refreshPeopleHeaderOrder();
    // Export for other modules if needed
    if (typeof window !== 'undefined') {
      window.peopleModule = { 
        init, 
        loadDataOnce, 
        applyFilters, 
        render: applyFilters,  // Alias for clarity
        state, 
        rebindDynamic, 
        getCurrentState, 
        getState: function() { return state; } 
      };
      // Export contacts data for contact-detail module
      // Return the FULL dataset (allContactsCache), not just the paginated view (state.data)
      window.getPeopleData = () => {
        try {
          // Priority 1: Background loader (always available, loads on app init)
          if (window.BackgroundContactsLoader) {
            const data = window.BackgroundContactsLoader.getContactsData();
            if (data && data.length > 0) return data;
          }
          // Priority 2: Page state cache
          const fullData = state.allContactsCache || state.data;
          return Array.isArray(fullData) ? fullData : [];
        } catch (_) {
          return [];
        }
      };
    }
    // Initialize global DnD if available (from contacts module)
    if (typeof window !== 'undefined' && typeof window.initContactsColumnDnD === 'function') {
      try { window.initContactsColumnDnD(); } catch (e) { /* noop */ }
    } else {
      // Fallback to local DnD if global initializer not available
      initPeopleHeaderDnD();
    }
    attachHeaderDnDHooks();
    // Initialize chip UI states (hide clear buttons when empty, etc.)
    renderTitleChips();
    renderCompanyChips();
    renderCityChips();
    renderStateChips();
    renderEmployeesChips();
    renderIndustryChips();
    renderVisitorDomainChips();
    renderSeniorityChips();
    renderDepartmentChips();
    loadDataOnce();
    startLivePeopleListener();
    
    // Initialize BulkAssignment for admin users
    try {
      if (window.BulkAssignment && window.DataManager && 
          typeof window.DataManager.isCurrentUserAdmin === 'function' && 
          window.DataManager.isCurrentUserAdmin()) {
        window.BulkAssignment.init('contacts').catch(err => {
          console.error('[People] Failed to initialize bulk assignment:', err);
        });
      }
    } catch (error) {
      console.error('[People] Error initializing bulk assignment:', error);
    }
  }
  
  // Listen for bulk assignment completion
  try {
    document.addEventListener('bulk-assignment-complete', (event) => {
      if (event.detail && event.detail.collectionType === 'contacts') {
        console.log('[People] Bulk assignment complete, refreshing...');
        state.loaded = false;
        loadDataOnce();
      }
    });
  } catch (error) {
    console.error('[People] Error setting up bulk assignment listener:', error);
  }

  // Listen for call completion to remove "No Calls" badges in real-time
  if (!document._peopleCallLoggedBound) {
    document._peopleCallLoggedBound = true;
    document.addEventListener('pc:call-logged', (event) => {
      const { call, targetPhone, accountId, contactId } = event.detail || {};
      console.log('[People] Call logged event received:', { targetPhone, accountId, contactId });
      
      // 0. Invalidate call status cache for affected items
      const keysToInvalidate = [];
      if (targetPhone) {
        const normalizedPhone = String(targetPhone).replace(/\D/g, '').slice(-10);
        if (normalizedPhone.length === 10) {
          keysToInvalidate.push(normalizedPhone);
        }
      }
      if (contactId) keysToInvalidate.push(contactId);
      
      keysToInvalidate.forEach(key => {
        peopleCallStatusCache.delete(key);
      });
      
      if (keysToInvalidate.length > 0) {
        console.log('[People] Invalidated call status cache for:', keysToInvalidate);
      }
      
      // 1. Add call to in-memory cache if available
      if (call && window.callsModule && window.callsModule.state && Array.isArray(window.callsModule.state.data)) {
        window.callsModule.state.data.push(call);
        console.log('[People] Added call to cache, total calls now:', window.callsModule.state.data.length);
      }
      
      // 2. Normalize the target phone for matching
      const normalizePhone = (phone) => {
        if (!phone) return '';
        const digits = String(phone).replace(/\D/g, '');
        return digits.slice(-10);
      };
      const targetPhone10 = normalizePhone(targetPhone);
      
      // 3. Find and remove badges from matching contacts
      if (!els.tbody) return;
      
      const allRows = els.tbody.querySelectorAll('tr[data-contact-id]');
      let badgesRemoved = 0;
      
      allRows.forEach(row => {
        const rowContactId = row.getAttribute('data-contact-id');
        let shouldRemoveBadge = false;
        
        // Match by contactId
        if (contactId && rowContactId === contactId) {
          shouldRemoveBadge = true;
        }
        
        // Match by phone number - check contact's phones
        if (!shouldRemoveBadge && targetPhone10) {
          // Get the contact data from state
          const contact = state.data.find(c => c.id === rowContactId);
          if (contact) {
            const contactPhones = [
              contact.workDirectPhone,
              contact.mobile,
              contact.otherPhone,
              contact.phone
            ].map(normalizePhone).filter(Boolean);
            
            if (contactPhones.includes(targetPhone10)) {
              shouldRemoveBadge = true;
            }
            
            // If this is an account-level call, also check if contact is at this company
            if (accountId && (contact.accountId === accountId || contact.account_id === accountId)) {
              shouldRemoveBadge = true;
            }
          }
        }
        
        // Remove the badge directly from DOM
        if (shouldRemoveBadge) {
          const badge = row.querySelector('.status-badge-no-calls');
          if (badge) {
            badge.remove();
            badgesRemoved++;
            console.log('[People] Removed "No Calls" badge from contact:', rowContactId);
          }
        }
      });
      
      console.log('[People] Total badges removed:', badgesRemoved);
    });
  }

  // Live listener to keep People table in sync without navigation
  let _unsubscribePeople = null;
  let _snapshotFirstFire = true;
  async function startLivePeopleListener() {
    try {
      if (!window.firebaseDB || !window.firebaseDB.collection) return;
      if (_unsubscribePeople) { try { _unsubscribePeople(); } catch(_) {} _unsubscribePeople = null; }
      _snapshotFirstFire = true; // Reset flag when setting up new listener
      const col = window.firebaseDB.collection('contacts');
      
      // Set up listener based on user role
      if (window.currentUserRole === 'admin') {
        // Admin: unfiltered listener
        _unsubscribePeople = col.orderBy('updatedAt', 'desc').limit(100).onSnapshot((snap) => {
        try {
          // Skip first fire to prevent double-render on page load
          // (loadDataOnce already populated the data)
          if (_snapshotFirstFire) {
            _snapshotFirstFire = false;
            // console.log('[People] onSnapshot first fire - skipping render to prevent flicker');
            return;
          }
          
          const fresh = [];
          snap.forEach((doc) => { fresh.push({ id: doc.id, ...doc.data() }); });
          state.data = fresh;
          
          // Update cache with real-time changes
          if (window.CacheManager && typeof window.CacheManager.set === 'function') {
            window.CacheManager.set('contacts', fresh).catch(() => {});
          }
          
          // Only render if not currently restoring from navigation
          if (!window.__restoringPeople) {
          applyFilters();
          } else {
            // console.log('[People] Skipping render due to active restoration - contact update will be applied when restoration completes');
          }
        } catch (_) { /* noop */ }
      }, (err) => {
        console.warn('[People] onSnapshot error', err);
      });
      } else {
        // Non-admin: scoped listener
        const email = window.currentUserEmail || '';
        if (email) {
          const [ownedQuery, assignedQuery] = [
            col.where('ownerId', '==', email).orderBy('updatedAt', 'desc').limit(100),
            col.where('assignedTo', '==', email).orderBy('updatedAt', 'desc').limit(100)
          ];
          
          // Set up listeners for both owned and assigned contacts
          const ownedUnsub = ownedQuery.onSnapshot((snap) => {
            try {
              if (_snapshotFirstFire) {
                _snapshotFirstFire = false;
                return;
              }
              
              const fresh = [];
              snap.forEach((doc) => { fresh.push({ id: doc.id, ...doc.data() }); });
              state.data = fresh;
              
              if (window.CacheManager && typeof window.CacheManager.set === 'function') {
                window.CacheManager.set('contacts', fresh);
              }
              
              if (!window.__restoringPeople) {
                applyFilters();
              }
            } catch (_) { /* noop */ }
          }, (err) => {
            console.warn('[People] owned contacts onSnapshot error', err);
          });
          
          const assignedUnsub = assignedQuery.onSnapshot((snap) => {
            try {
              if (_snapshotFirstFire) {
                _snapshotFirstFire = false;
                return;
              }
              
              const fresh = [];
              snap.forEach((doc) => { fresh.push({ id: doc.id, ...doc.data() }); });
              state.data = fresh;
              
              if (window.CacheManager && typeof window.CacheManager.set === 'function') {
                window.CacheManager.set('contacts', fresh);
              }
              
              if (!window.__restoringPeople) {
                applyFilters();
              }
            } catch (_) { /* noop */ }
          }, (err) => {
            console.warn('[People] assigned contacts onSnapshot error', err);
          });
          
          // Store both unsubscribers
          _unsubscribePeople = () => {
            try { ownedUnsub(); } catch(_) {}
            try { assignedUnsub(); } catch(_) {}
          };
        }
      }
    } catch (e) {
      console.warn('[People] Failed to start live listener', e);
    }
  }

  // Rebind dynamic listeners after the People page table DOM is restored
  function rebindDynamic() {
    if (!initDomRefs()) return; // Not on this page
    // Ensure header metadata and DnD are restored for a freshly restored <thead>
    contactsColumnOrder = loadPeopleColumnOrder();
    ensurePeopleHeaderColMeta();
    refreshPeopleHeaderOrder();
    if (typeof window !== 'undefined' && typeof window.initContactsColumnDnD === 'function') {
      try { window.initContactsColumnDnD(); } catch (e) { /* noop */ }
    } else {
      initPeopleHeaderDnD();
    }
    attachHeaderDnDHooks();

    // Attach select-all listener once
    if (els.selectAll && !els.selectAll.dataset.bound) {
      els.selectAll.addEventListener('change', () => {
        if (els.selectAll.checked) {
          openBulkSelectPopover();
        } else {
          state.selected.clear();
          render();
          closeBulkSelectPopover();
          hideBulkActionsBar();
        }
      });
      els.selectAll.dataset.bound = '1';
    }

    // Attach tbody delegation listeners once
    if (els.tbody && !els.tbody.dataset.bound) {
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
      els.tbody.addEventListener('click', async (e) => {
        // Company name click -> open Account Detail by matching domain or name
        const companyLink = e.target.closest && e.target.closest('.company-link');
        if (companyLink) {
          e.preventDefault();
          // Capture return state so Account Detail can send us back here
          try {
            window._accountNavigationSource = 'people';
            window._peopleReturn = {
              page: state.currentPage,
              scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0
            };
          } catch (_) {}
          const dom = (companyLink.getAttribute('data-domain') || '').trim();
          const comp = (companyLink.getAttribute('data-company') || companyLink.textContent || '').trim();
          
          // RETRY MECHANISM: Wait for BackgroundAccountsLoader if needed
          let accountsData = window.BackgroundAccountsLoader ? window.BackgroundAccountsLoader.getAccountsData() : [];
          if (accountsData.length === 0) {
            accountsData = window.getAccountsData ? window.getAccountsData() : [];
          }
          if (accountsData.length === 0 && window.BackgroundAccountsLoader) {
            // console.log('[People] No accounts yet, waiting for BackgroundAccountsLoader...');
            
            // Wait up to 3 seconds (30 attempts x 100ms)
            for (let attempt = 0; attempt < 30; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 100));
              accountsData = window.BackgroundAccountsLoader.getAccountsData() || [];
              
              if (accountsData.length > 0) {
                // console.log('[People] ✓ BackgroundAccountsLoader ready after', (attempt + 1) * 100, 'ms with', accountsData.length, 'accounts');
                break;
              }
            }
            
            if (accountsData.length === 0) {
              console.warn('[People] ⚠ Timeout waiting for accounts after 3 seconds');
            }
          }
          
          const acct = findAccountByDomainOrName(dom, comp, accountsData);
          if (acct && acct.id && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
            try { window.AccountDetail.show(acct.id); } catch (_) { /* noop */ }
          } else {
            if (window.crm && typeof window.crm.showToast === 'function') {
              try { window.crm.showToast(`No matching account found for ${comp}`); } catch (_) { /* noop */ }
            } else {
              console.warn('No matching account found for', comp);
            }
          }
          return;
        }
        const nameCell = e.target.closest('.name-cell');
        if (nameCell) {
          const contactId = nameCell.getAttribute('data-contact-id');
          if (contactId && window.ContactDetail) {
            // Store navigation source for back button
            window._contactNavigationSource = 'people';
            window._peopleReturn = {
              page: state.currentPage,
              scroll: window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0,
              searchTerm: els.quickSearch?.value || '',
              sortColumn: state.sortColumn || '',
              sortDirection: state.sortDirection || 'asc',
              filters: {
                titleTokens: [...state.titleTokens],
                companyTokens: [...state.companyTokens],
                statusTokens: [...state.statusTokens]
              }
            };
            // Prefetch contact data from cache (FREE)
            if (window.getPeopleData) {
              const peopleData = window.getPeopleData();
              const contact = peopleData.find(c => c.id === contactId);
              if (contact) {
                window._prefetchedContactForDetail = contact;
              }
            }
            window.ContactDetail.show(contactId);
          }
          return;
        }
        const btn = e.target.closest && e.target.closest('.qa-btn');
        if (!btn) return;
        e.preventDefault();
        handleQuickAction(btn);
      });
      els.tbody.dataset.bound = '1';
    }

    // Attach pagination click handling once
    if (els.pagination && !els.pagination.dataset.bound) {
      els.pagination.addEventListener('click', async (e) => {
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
          
          // SEAMLESS AUTO-LOAD: Check if we need data for this page
          const neededIndex = (next - 1) * state.pageSize + state.pageSize - 1;
          if (neededIndex >= state.data.length && state.hasMore && !state.searchMode) {
            // console.log('[People] Loading more contacts for page', next, '...');
            
            // Show brief loading indicator
            if (els.tbody) {
              els.tbody.innerHTML = '<tr><td colspan="20" style="text-align: center; padding: 40px; color: var(--grey-400);">Loading more contacts...</td></tr>';
            }
            
            await loadMoreContacts(); // Wait for data before rendering
          }
          
          render();
          // After page change, scroll the actual scrollable container to top
          try {
            requestAnimationFrame(() => {
              const scroller = (els.page && els.page.querySelector) ? els.page.querySelector('.table-scroll') : null;
              if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0, behavior: 'auto' });
              else if (scroller) scroller.scrollTop = 0;
              window.scrollTo(0, 0);
            });
          } catch (_) { /* noop */ }
        }
      });
      els.pagination.dataset.bound = '1';
    }
  }

  function handleQuickAction(btn) {
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    switch (action) {
      case 'task': {
        console.log('People: Create task', { id });
        break;
      }
      case 'linkedin': {
        let url = btn.getAttribute('data-linkedin') || '';
        const name = btn.getAttribute('data-name') || '';
        const company = btn.getAttribute('data-company') || '';
        
        if (url) {
          // Direct LinkedIn URL available
          try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
        } else if (name || company) {
          // Search LinkedIn with name/company
          const q = encodeURIComponent([name, company].filter(Boolean).join(' '));
          url = `https://www.linkedin.com/search/results/people/?keywords=${q}`;
          try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
        } else {
          // No LinkedIn info available
          try { window.crm?.showToast && window.crm.showToast('No LinkedIn profile available'); } catch (_) { /* noop */ }
        }
        console.log('People: Open LinkedIn', { id, url });
        break;
      }
      case 'website': {
        let url = btn.getAttribute('data-website') || '';
        const company = btn.getAttribute('data-company') || '';
        
        // console.log('Debug: Website button clicked');
        // console.log('Debug: Contact website URL:', url);
        // console.log('Debug: Company name:', company);
        // console.log('Debug: getAccountsData function available:', typeof window.getAccountsData === 'function');
        
        // If no website from contact data, try to get it from account data
        if (!url && company && typeof window.getAccountsData === 'function') {
          try {
            const accounts = window.getAccountsData() || [];
            // console.log('Debug: Looking for company:', company);
            // console.log('Debug: Available accounts:', accounts.map(acc => acc.accountName));
            
            // Let's see some sample account names to debug the matching
            const first10Names = accounts.slice(0, 10).map(acc => acc.accountName);
            // console.log('Debug: First 10 account names:', JSON.stringify(first10Names, null, 2));
            
            // Let's see the actual structure of the first few account objects
            const first3Accounts = accounts.slice(0, 3);
            // console.log('Debug: First 3 account objects:', JSON.stringify(first3Accounts, null, 2));
            
            // Check what properties are available on account objects
            if (accounts.length > 0) {
              const firstAccount = accounts[0];
              // console.log('Debug: First account keys:', Object.keys(firstAccount || {}));
              // console.log('Debug: First account values:', firstAccount);
            }
            
            // Check for partial matches using the correct property name
            const partialMatches = accounts.filter(acc => 
              acc.accountName && acc.accountName.toLowerCase().includes(company.toLowerCase())
            );
            const partialMatchNames = partialMatches.map(acc => acc.accountName);
            // console.log('Debug: Partial matches found:', JSON.stringify(partialMatchNames, null, 2));
            
            // Also check for "Integrated Circuit" specifically
            const integratedMatches = accounts.filter(acc => 
              acc.accountName && acc.accountName.toLowerCase().includes('integrated circuit')
            );
            const integratedMatchNames = integratedMatches.map(acc => acc.accountName);
            // console.log('Debug: Integrated Circuit matches:', JSON.stringify(integratedMatchNames, null, 2));
            
            // Try multiple matching strategies using the correct property name
            const account = accounts.find(acc => {
              if (!acc.accountName || !company) return false;
              
              const accName = acc.accountName.toLowerCase().trim();
              const compName = company.toLowerCase().trim();
              
              // Exact match
              if (accName === compName) return true;
              
              // Partial match (account name contains company name or vice versa)
              if (accName.includes(compName) || compName.includes(accName)) return true;
              
              // Remove common suffixes and try again
              const cleanAccName = accName.replace(/\s+(inc|llc|ltd|corp|corporation|company|co)\.?$/i, '');
              const cleanCompName = compName.replace(/\s+(inc|llc|ltd|corp|corporation|company|co)\.?$/i, '');
              
              if (cleanAccName === cleanCompName) return true;
              if (cleanAccName.includes(cleanCompName) || cleanCompName.includes(cleanAccName)) return true;
              
              return false;
            });
            
            if (account) {
              // console.log('Debug: Found matching account:', account.name);
              // console.log('Debug: Account website fields:', {
              //   website: account.website,
              //   site: account.site,
              //   domain: account.domain
              // });
              url = account.website || account.site || account.domain || '';
              if (url && !/^https?:\/\//i.test(url)) {
                url = 'https://' + url;
              }
            } else {
              // console.log('Debug: No matching account found for company:', company);
            }
          } catch (e) {
            console.warn('Error fetching account data:', e);
          }
        }
        
        if (url) {
          // Website URL available
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
        } else {
          // No website available
          try { window.crm?.showToast && window.crm.showToast('No website available'); } catch (_) { /* noop */ }
        }
        // console.log('People: Open website', { id, url, company });
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
    if (total === 0) {
      els.selectAll.checked = false;
      els.selectAll.indeterminate = false;
      return;
    }
    let selectedVisible = 0;
    for (const c of getPageItems()) if (state.selected.has(c.id)) selectedVisible++;
    if (selectedVisible === 0) {
      els.selectAll.checked = false;
      els.selectAll.indeterminate = false;
    } else if (selectedVisible === total) {
      els.selectAll.checked = true;
      els.selectAll.indeterminate = false;
    } else {
      els.selectAll.checked = false;
      els.selectAll.indeterminate = true;
    }
  }

  // ===== Bulk selection popover (Step 1) =====
  function openBulkSelectPopover() {
    // console.log('openBulkSelectPopover called');
    if (!els.tableContainer) return;
    
    // Check if popover already exists
    const existingPopover = document.getElementById('people-bulk-popover');
    if (existingPopover) {
      // console.log('Popover already exists, not creating new one');
      return;
    }
    
    closeBulkSelectPopover();
    const totalFiltered = state.filtered.length;
    const pageCount = getPageItems().length;
    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'bulk-select-backdrop';
    backdrop.addEventListener('click', () => {
      if (els.selectAll) els.selectAll.checked = state.selected.size > 0;
      closeBulkSelectPopover();
    });
    document.body.appendChild(backdrop);
    const pop = document.createElement('div');
    pop.id = 'people-bulk-popover';
    pop.className = 'bulk-select-popover';
    // Accessibility
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Bulk selection');
    pop.setAttribute('aria-modal', 'true');
    pop.innerHTML = `
      <div class="option">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="radio" name="bulk-mode" value="custom" checked>
          <span>Select number of people</span>
        </label>
        <input type="number" min="1" max="${totalFiltered}" step="1" value="${Math.max(1, pageCount)}" id="bulk-custom-count" aria-label="Custom count">
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

    // Append to body so fixed positioning isn't affected by container overflow
    document.body.appendChild(pop);

    function positionPopover() {
      if (!els.selectAll) return;
      const cbRect = els.selectAll.getBoundingClientRect();
      // Position relative to viewport because .bulk-select-popover is position: fixed
      let left = cbRect.left;
      let top = cbRect.bottom + 6; // 6px offset below the checkbox
      // Clamp within viewport with 8px gutters
      const maxLeft = window.innerWidth - pop.offsetWidth - 8;
      left = Math.max(8, Math.min(left, Math.max(8, maxLeft)));
      const maxTop = window.innerHeight - pop.offsetHeight - 8;
      top = Math.max(8, Math.min(top, maxTop));
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }

    positionPopover();

    // Reposition on resize/scroll until closed
    const reposition = () => positionPopover();
    window.addEventListener('resize', reposition);
    // Use capture to catch scrolls on ancestors inside the app layout
    window.addEventListener('scroll', reposition, true);
    
    // Enable/disable custom count input depending on selected radio
    const applyBtnRef = pop.querySelector('#bulk-apply');
    const customInput = pop.querySelector('#bulk-custom-count');
    const radios = Array.from(pop.querySelectorAll('input[name="bulk-mode"]'));
    function updateCustomEnabled() {
      const isCustom = !!pop.querySelector('input[name="bulk-mode"][value="custom"]:checked');
      if (customInput) {
        customInput.disabled = !isCustom;
        if (isCustom) customInput.removeAttribute('aria-disabled');
        else customInput.setAttribute('aria-disabled', 'true');
      }
    }
    radios.forEach((r) => r.addEventListener('change', () => { updateCustomEnabled(); if (r.value === 'custom' && customInput && !customInput.disabled) customInput.focus(); }));
    updateCustomEnabled();

    // Pressing Enter in the number field applies selection
    if (customInput) {
      customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyBtnRef && applyBtnRef.click(); } });
    }

    // Focus trap within the popover and Escape to cancel
    const focusables = Array.from(pop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const firstFocusable = focusables[0];
    const lastFocusable = focusables[focusables.length - 1];
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (els.selectAll) els.selectAll.checked = state.selected.size > 0;
        closeBulkSelectPopover();
        return;
      }
      if (e.key === 'Tab' && focusables.length > 0) {
        if (e.shiftKey && document.activeElement === firstFocusable) { e.preventDefault(); lastFocusable && lastFocusable.focus(); }
        else if (!e.shiftKey && document.activeElement === lastFocusable) { e.preventDefault(); firstFocusable && firstFocusable.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    if (els.page) els.page._bulkKeydownHandler = onKeyDown;
    // Store cleanup handler so closeBulkSelectPopover can remove listeners
    if (els.page) {
      if (els.page._bulkPopoverCleanup) els.page._bulkPopoverCleanup();
      els.page._bulkPopoverCleanup = () => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
        // Remove backdrop
        try {
          const bd = document.querySelector('.bulk-select-backdrop');
          if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
        } catch (e) { /* noop */ }
      };
    }

    // Focus first control for quick entry
    const firstInput = pop.querySelector('#bulk-custom-count') || pop.querySelector('input,button');
    if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();

    // Wire events
    const cancelBtn = pop.querySelector('#bulk-cancel');
    const applyBtnElement = pop.querySelector('#bulk-apply');
    // console.log('Cancel button found:', cancelBtn);
    // console.log('Apply button found:', applyBtnElement);
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // console.log('Cancel button clicked');
        els.selectAll.checked = false;
        closeBulkSelectPopover();
      });
    }
    
    // Use event delegation for the Apply button
    pop.addEventListener('click', (e) => {
      // console.log('Pop click detected, target:', e.target, 'target id:', e.target.id);
      if (e.target && e.target.id === 'bulk-apply') {
        // console.log('Apply button clicked via delegation!', e);
        const checkedRadio = pop.querySelector('input[name="bulk-mode"]:checked');
        // console.log('Checked radio:', checkedRadio);
        const mode = checkedRadio ? checkedRadio.value : 'custom';
        // console.log('Apply clicked, mode:', mode);
        if (mode === 'custom') {
          const raw = parseInt(pop.querySelector('#bulk-custom-count').value || '0', 10);
          const n = Math.min(totalFiltered, Math.max(1, isNaN(raw) ? 0 : raw));
          // console.log('Selecting first N:', n);
          selectFirstNFiltered(n);
        } else if (mode === 'page') {
          // console.log('Selecting page items');
          const pageItems = getPageItems();
          // console.log('Page items:', pageItems);
          const pageIds = pageItems.map((c) => c.id);
          // console.log('Page IDs:', pageIds);
          selectIds(pageIds);
        } else if (mode === 'all') {
          // console.log('Selecting all filtered');
          // console.log('All filtered items:', state.filtered);
          const allIds = state.filtered.map((c) => c.id);
          // console.log('All IDs:', allIds);
          selectIds(allIds);
        }
        // console.log('Selected count:', state.selected.size);
        closeBulkSelectPopover();
        // Single render is sufficient; render() already calls updateBulkActionsBar()
        render();
      }
    });

    // Close on outside click (store handler so we can clean it up on close)
    let outside;
    setTimeout(() => {
      outside = function (e) {
        if (!pop.contains(e.target) && e.target !== els.selectAll) {
          document.removeEventListener('mousedown', outside);
          if (els.selectAll) els.selectAll.checked = state.selected.size > 0;
          closeBulkSelectPopover();
        }
      };
      document.addEventListener('mousedown', outside);
      if (els.page) els.page._bulkOutsideHandler = outside;
    }, 0);
  }

  function closeBulkSelectPopover() {
    const existing = document.getElementById('people-bulk-popover');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    if (els.page && typeof els.page._bulkPopoverCleanup === 'function') {
      els.page._bulkPopoverCleanup();
      delete els.page._bulkPopoverCleanup;
    }
    // Remove stored keydown/outside handlers
    if (els.page && els.page._bulkKeydownHandler) {
      try { document.removeEventListener('keydown', els.page._bulkKeydownHandler); } catch (e) { /* noop */ }
      delete els.page._bulkKeydownHandler;
    }
    if (els.page && els.page._bulkOutsideHandler) {
      try { document.removeEventListener('mousedown', els.page._bulkOutsideHandler); } catch (e) { /* noop */ }
      delete els.page._bulkOutsideHandler;
    }
    // Safety: remove any stray backdrop
    const bd = document.querySelector('.bulk-select-backdrop');
    if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
  }

  // ===== Bulk Sequence slide-in panel =====
  function closeBulkSequencePanel() {
    const panel = document.getElementById('people-sequence-panel');
    const cleanup = () => {
      if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
      try { document.removeEventListener('mousedown', _onSeqOutside, true); } catch(_) {}
    };
    if (panel) panel.classList.remove('--show');
    // small delay so transition can play
    setTimeout(cleanup, 120);

    // remove listeners
    try { document.removeEventListener('keydown', _onSeqKeydown, true); } catch(_) {}
    try { window.removeEventListener('resize', _positionSeqPanel, true); } catch(_) {}
    try { window.removeEventListener('scroll', _positionSeqPanel, true); } catch(_) {}
    _onSeqKeydown = null; _positionSeqPanel = null; _onSeqOutside = null;
  }

  let _onSeqKeydown = null;
  let _positionSeqPanel = null;
  let _onSeqOutside = null;

  function openBulkSequencePanel() {
    if (document.getElementById('people-sequence-panel')) return; // already open
    // Panel container
    const panel = document.createElement('div');
    panel.id = 'people-sequence-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Add to sequence');
    panel.innerHTML = `
      <div class="seq-header">Add ${state.selected.size} ${state.selected.size === 1 ? 'person' : 'people'} to sequence</div>
      <div class="seq-body" id="people-seq-body">
        <div class="seq-item" tabindex="0" data-action="create">
          <div>
            <div class="seq-name">Create new sequence…</div>
            <div class="seq-meta">Open builder to start a new sequence</div>
          </div>
        </div>
      </div>
      <div class="seq-footer">
        <button type="button" class="btn" id="seq-cancel">Cancel</button>
      </div>`;
    document.body.appendChild(panel);

    // Position under the bulk bar, centered over the table container
    _positionSeqPanel = function position() {
      const container = els.page ? els.page.querySelector('.table-container') : null;
      const bar = els.page ? els.page.querySelector('#people-bulk-actions .bar') : null;
      const cr = container ? container.getBoundingClientRect() : { left: 8, width: window.innerWidth - 16 };
      const br = bar ? bar.getBoundingClientRect() : { bottom: 72 };
      const top = Math.max(8, br.bottom + 8);
      const left = Math.max(8, cr.left + (cr.width - panel.offsetWidth) / 2);
      const maxLeft = window.innerWidth - panel.offsetWidth - 8;
      panel.style.top = `${top}px`;
      panel.style.left = `${Math.min(left, maxLeft)}px`;
    };
    _positionSeqPanel();
    window.addEventListener('resize', _positionSeqPanel, true);
    window.addEventListener('scroll', _positionSeqPanel, true);

    // Show with animation
    requestAnimationFrame(() => { panel.classList.add('--show'); });

    // Load sequences list (async) and populate
    populateSequencesList(panel.querySelector('#people-seq-body'));

    // Footer button
    panel.querySelector('#seq-cancel')?.addEventListener('click', () => closeBulkSequencePanel());

    // Focus mgmt (no strict trap for subtle popover)
    setTimeout(() => { const first = panel.querySelector('.seq-item, .btn'); if (first) first.focus(); }, 0);

    _onSeqKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeBulkSequencePanel(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList?.contains('seq-item')) {
        e.preventDefault();
        const el = document.activeElement; handleSequenceChoose(el);
      }
    };
    document.addEventListener('keydown', _onSeqKeydown, true);

    // Click-away without backdrop
    _onSeqOutside = (e) => {
      const inside = panel.contains(e.target);
      const isTrigger = !!(e.target.closest && e.target.closest('#people-bulk-actions'));
      if (!inside && !isTrigger) closeBulkSequencePanel();
    };
    document.addEventListener('mousedown', _onSeqOutside, true);

    function handleSequenceChoose(el) {
      const action = el.getAttribute('data-action');
      if (action === 'create') {
        try { window.crm?.navigateToPage && window.crm.navigateToPage('sequence-builder'); } catch(_) {}
        closeBulkSequencePanel();
        return;
      }
      const id = el.getAttribute('data-id');
      const name = el.getAttribute('data-name') || 'Sequence';
      // console.log('Add selected people to sequence:', { id, name, selected: Array.from(state.selected) });
      // TODO: integrate backend action to add people to sequence
      if (window.crm?.showToast) try { window.crm.showToast(`Added to ${name}`, 'success'); } catch(_) {}
      closeBulkSequencePanel();
    }

    function populateSequencesList(container) {
      if (!container) return;
      // Loading row
      const loading = document.createElement('div');
      loading.className = 'seq-item';
      loading.setAttribute('aria-busy', 'true');
      loading.innerHTML = `<div><div class="seq-name">Loading sequences…</div><div class="seq-meta">Please wait</div></div>`;
      container.appendChild(loading);

      // Try to get from localStorage to keep UI responsive
      let local = [];
      try { const raw = localStorage.getItem('sequences'); if (raw) local = JSON.parse(raw) || []; } catch(_) {}
      if (local && local.length) {
        renderList(local);
      }

      // Async fetch via Firestore if available
      (async () => {
        let items = local;
        try {
          if (window.firebaseDB) {
            const email = window.currentUserEmail || '';
            let snap;
            if (window.currentUserRole !== 'admin' && email) {
              // Non-admin: use scoped query
              snap = await window.firebaseDB.collection('sequences').where('ownerId','==',email).get();
            } else {
              // Admin: use unfiltered query
              snap = await window.firebaseDB.collection('sequences').get();
            }
            items = [];
            snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
          }
        } catch (e) { console.warn('Load sequences failed:', e); }
        renderList(items);
      })();

      function renderList(items) {
        container.innerHTML = container.innerHTML.replace(loading.outerHTML, '');
        // Clear and re-add create row at top
        container.innerHTML = '';
        const createRow = document.createElement('div');
        createRow.className = 'seq-item';
        createRow.setAttribute('tabindex', '0');
        createRow.setAttribute('data-action', 'create');
        createRow.innerHTML = `<div><div class="seq-name">Create new sequence…</div><div class="seq-meta">Open builder</div></div>`;
        container.appendChild(createRow);
        createRow.addEventListener('click', () => handleSequenceChoose(createRow));

        if (!Array.isArray(items) || items.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'seq-item';
          empty.innerHTML = `<div><div class="seq-name">No sequences</div><div class="seq-meta">Create your first sequence</div></div>`;
          empty.setAttribute('tabindex', '0');
          container.appendChild(empty);
          return;
        }
        // Sort by updatedAt desc if present
        items.sort((a,b) => (b.updatedAt||b.createdAt||0) - (a.updatedAt||a.createdAt||0));
        items.slice(0, 25).forEach(seq => {
          const row = document.createElement('div');
          row.className = 'seq-item';
          row.setAttribute('tabindex', '0');
          row.setAttribute('data-id', seq.id || '');
          row.setAttribute('data-name', seq.name || 'Sequence');
          const active = (seq.stats && (seq.stats.active||0)) || seq.active || 0;
          row.innerHTML = `<div><div class="seq-name">${escapeHtml(seq.name || 'Untitled')}</div><div class="seq-meta">${active} active</div></div>`;
          row.addEventListener('click', () => handleSequenceChoose(row));
          container.appendChild(row);
        });
      }
    }
  }

  function selectIds(ids) {
    // console.log('selectIds called with:', ids);
    state.selected.clear();
    for (const id of ids) if (id) state.selected.add(id);
    // console.log('After selection, state.selected.size:', state.selected.size);
  }

  function selectFirstNFiltered(n) {
    // console.log('selectFirstNFiltered called with n:', n);
    // console.log('state.filtered length:', state.filtered.length);
    const ids = state.filtered.slice(0, n).map((c) => c.id).filter(Boolean);
    // console.log('Generated ids:', ids);
    selectIds(ids);
  }

  // ===== Bulk actions bar (Step 2) =====
  function showBulkActionsBar() {
    updateBulkActionsBar(true);
  }

  function hideBulkActionsBar() {
    // Cleanup positioning listeners if set
    if (els.positionBulkBarHandler) {
      window.removeEventListener('resize', els.positionBulkBarHandler);
      window.removeEventListener('scroll', els.positionBulkBarHandler, true);
      els.positionBulkBarHandler = null;
    }
    const bar = els.page.querySelector('#people-bulk-actions');
    if (bar) {
      // Add exit animation
      bar.classList.remove('--show');
      // Remove from DOM after animation completes
      setTimeout(() => {
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      }, 200);
    }
  }

  // Build a list of selected contact objects by id
  function getSelectedContacts() {
    if (!state || !Array.isArray(state.data)) return [];
    const byId = new Map();
    for (const c of state.data) if (c && c.id) byId.set(c.id, c);
    const out = [];
    for (const id of state.selected) {
      const c = byId.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  // Escape a value for RFC 4180 CSV (double quotes doubled, wrap when needed)
  function csvEscape(val) {
    if (val == null) return '';
    const s = String(val);
    const needsWrap = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsWrap ? `"${escaped}"` : escaped;
  }

  function pickValueForColumn(key, c) {
    switch (key) {
      case 'name': {
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || (c.name || '');
        return fullName;
      }
      case 'title':
        return c.title || '';
      case 'company':
        return c.companyName || '';
      case 'email':
        return c.email || '';
      case 'phone':
        return (c.workDirectPhone || c.mobile || c.otherPhone || '');
      case 'location': {
        const city = c.city || c.locationCity || '';
        const stateVal = c.state || c.locationState || '';
        return (city || stateVal) ? `${city}${city && stateVal ? ', ' : ''}${stateVal}` : '';
      }
      case 'updated':
        return formatDateOrNA(c.updatedAt, c.createdAt) || '';
      default:
        return '';
    }
  }

  function exportSelectedToCSV() {
    const selected = getSelectedContacts();
    if (!selected.length) {
      if (window.crm && window.crm.showToast) window.crm.showToast('Select contacts to export');
      return;
    }
    const order = (contactsColumnOrder && contactsColumnOrder.length) ? contactsColumnOrder : DEFAULT_CONTACTS_COL_ORDER;
    const cols = order.filter((k) => k !== 'select' && k !== 'actions');
    const headers = cols.map((k) => {
      switch (k) {
        case 'name': return 'Name';
        case 'title': return 'Job Title';
        case 'company': return 'Company';
        case 'email': return 'Email';
        case 'phone': return 'Phone';
        case 'location': return 'Location';
        case 'updated': return 'Last Updated';
        default: return k;
      }
    });

    const lines = [];
    lines.push(headers.map(csvEscape).join(','));
    for (const c of selected) {
      const row = cols.map((k) => csvEscape(pickValueForColumn(k, c)));
      lines.push(row.join(','));
    }
    const csv = lines.join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    a.href = url;
    a.download = `people-export-${yyyy}-${mm}-${dd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // Small confirmation popover for delete
  let _onDelKeydown = null;
  let _onDelOutside = null;
  function closeBulkDeleteConfirm() {
    const pop = document.getElementById('people-delete-popover');
    const backdrop = document.getElementById('people-delete-backdrop');
    if (pop) {
      // Add exit animation
      pop.classList.add('--hide');
      // Remove from DOM after animation completes
      setTimeout(() => {
        if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
      }, 150);
    }
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (_onDelKeydown) { document.removeEventListener('keydown', _onDelKeydown); _onDelKeydown = null; }
    if (_onDelOutside) { document.removeEventListener('mousedown', _onDelOutside, true); _onDelOutside = null; }
  }

  function openBulkDeleteConfirm() {
    if (document.getElementById('people-delete-popover')) return;
    const bar = els.page && els.page.querySelector('#people-bulk-actions');
    if (!bar) return;
    const delBtn = bar.querySelector('#bulk-delete');
    // Backdrop for click-away
    const backdrop = document.createElement('div');
    backdrop.id = 'people-delete-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.background = 'transparent';
    backdrop.style.zIndex = '955';
    document.body.appendChild(backdrop);

    const pop = document.createElement('div');
    pop.id = 'people-delete-popover';
    pop.className = 'delete-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Confirm delete');
    pop.dataset.placement = 'bottom';
    pop.innerHTML = `
      <div class="delete-popover-inner">
        <div class="delete-title">Delete ${state.selected.size} ${state.selected.size===1?'contact':'contacts'}?</div>
        <div class="btn-row">
          <button type="button" id="del-cancel" class="btn-text">Cancel</button>
          <button type="button" id="del-confirm" class="btn-danger">${svgIcon('delete')}<span>Delete</span></button>
        </div>
      </div>
    `;
    document.body.appendChild(pop);

    // Position under the delete button and center horizontally to its center
    const anchorRect = (delBtn || bar).getBoundingClientRect();
    const preferredLeft = anchorRect.left + (anchorRect.width / 2) - (pop.offsetWidth / 2);
    const clampedLeft = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, preferredLeft));
    const top = anchorRect.bottom + 8; // fixed, viewport coords
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(clampedLeft)}px`;
    // Arrow: center to the button's center within the popover, clamped to popover width
    const rawArrowLeft = (anchorRect.left + (anchorRect.width / 2)) - clampedLeft;
    const maxArrow = Math.max(0, pop.offsetWidth - 12);
    const clampedArrow = Math.max(12, Math.min(maxArrow, rawArrowLeft));
    pop.style.setProperty('--arrow-left', `${Math.round(clampedArrow)}px`);

    const cancel = pop.querySelector('#del-cancel');
    const confirm = pop.querySelector('#del-confirm');
    if (cancel) cancel.addEventListener('click', () => closeBulkDeleteConfirm());
    if (confirm) confirm.addEventListener('click', async () => {
      closeBulkDeleteConfirm();
      await deleteSelectedContacts();
    });

    // Focus mgmt and esc
    const f = confirm || cancel;
    f && f.focus && f.focus();
    _onDelKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeBulkDeleteConfirm(); }
    };
    document.addEventListener('keydown', _onDelKeydown);
    _onDelOutside = (e) => {
      const t = e.target;
      if (!pop.contains(t)) closeBulkDeleteConfirm();
    };
    document.addEventListener('mousedown', _onDelOutside, true);
  }

  // Delete selected contacts from Firestore and local state
  async function deleteSelectedContacts() {
    const ids = Array.from(state.selected || []);
    if (!ids.length) return;
    
    // Store current page before deletion to preserve pagination
    const currentPageBeforeDeletion = state.currentPage;
    
    // Show progress toast
    const progressToast = window.crm?.showProgressToast ? 
      window.crm.showProgressToast(`Deleting ${ids.length} ${ids.length === 1 ? 'contact' : 'contacts'}...`, ids.length, 0) : null;
    
    let failed = 0;
    let completed = 0;
    
    try {
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Process deletions sequentially to show progress
        for (const id of ids) {
          try {
            await window.firebaseDB.collection('contacts').doc(id).delete();
            completed++;
            if (progressToast) {
              progressToast.update(completed, ids.length);
            }
          } catch (e) {
            failed++;
            completed++;
            console.warn('Delete failed for id', id, e);
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
      console.warn('Bulk delete error', err);
      if (progressToast) {
        progressToast.error('Delete operation failed');
      }
    } finally {
      // Remove locally either way (offline mode supported)
      const idSet = new Set(ids);
      state.data = Array.isArray(state.data) ? state.data.filter(c => !idSet.has(c.id)) : [];
      state.filtered = Array.isArray(state.filtered) ? state.filtered.filter(c => !idSet.has(c.id)) : [];
      
      // Calculate new total pages after deletion
      const newTotalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      
      // Only adjust page if current page is beyond the new total
      if (currentPageBeforeDeletion > newTotalPages) {
        state.currentPage = newTotalPages;
      }
      // Otherwise, keep the current page
      
      state.selected.clear();
      render();
      hideBulkActionsBar();
      if (els.selectAll) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
      
      const successCount = Math.max(0, ids.length - failed);
      
      if (progressToast) {
        if (failed === 0) {
          progressToast.complete(`Successfully deleted ${successCount} ${successCount === 1 ? 'contact' : 'contacts'}`);
        } else if (successCount > 0) {
          progressToast.complete(`Deleted ${successCount} of ${ids.length} ${ids.length === 1 ? 'contact' : 'contacts'}`);
        } else {
          progressToast.error(`Failed to delete all ${ids.length} ${ids.length === 1 ? 'contact' : 'contacts'}`);
        }
      } else {
        // Fallback to regular toasts if progress toast not available
        if (successCount > 0) {
          window.crm?.showToast && window.crm.showToast(`Deleted ${successCount} ${successCount === 1 ? 'contact' : 'contacts'}`);
        }
        if (failed > 0) {
          window.crm?.showToast && window.crm.showToast(`Failed to delete ${failed} ${failed === 1 ? 'contact' : 'contacts'}`);
        }
      }
    }
  }

  function updateBulkActionsBar(forceShow = false) {
    console.log('updateBulkActionsBar called, forceShow:', forceShow, 'selected count:', state.selected.size);
    if (!els.tableContainer) {
      console.log('No table container found');
      return;
    }
    const count = state.selected.size;
    const shouldShow = forceShow || count > 0;
    console.log('shouldShow:', shouldShow);
    const existing = els.page.querySelector('#people-bulk-actions');
    console.log('existing bar:', existing);
    if (!shouldShow) {
      console.log('Not showing bar, removing if exists');
      if (existing) existing.remove();
      return;
    }
    const isAdmin = window.DataManager && window.DataManager.isCurrentUserAdmin && window.DataManager.isCurrentUserAdmin();
    const html = `
      <div class="bar">
        <button class="action-btn-sm" id="bulk-clear">${svgIcon('clear')}<span>Clear ${count} selected</span></button>
        <span class="spacer"></span>
        <button class="action-btn-sm" id="bulk-email">${svgIcon('email')}<span>Email</span></button>
        <button class="action-btn-sm" id="bulk-sequence">${svgIcon('sequence')}<span>Sequence ▾</span></button>
        <button class="action-btn-sm" id="bulk-call">${svgIcon('call')}<span>Call</span></button>
        <button class="action-btn-sm" id="bulk-addlist">${svgIcon('addlist')}<span>Add to list</span></button>
        ${isAdmin ? `<button class="action-btn-sm" id="bulk-assign">${svgIcon('assign')}<span>Assign to ▾</span></button>` : ''}
        <button class="action-btn-sm" id="bulk-export">${svgIcon('export')}<span>Export</span></button>
        <button class="action-btn-sm" id="bulk-ai">${svgIcon('ai')}<span>Research with AI</span></button>
        <button class="action-btn-sm danger" id="bulk-delete">${svgIcon('delete')}<span>Delete</span></button>
      </div>
    `;
    let container = existing;
    if (!container) {
      container = document.createElement('div');
      container.id = 'people-bulk-actions';
      container.className = 'bulk-actions-modal';
      els.tableContainer.appendChild(container);
      // Add animation class after a brief delay to trigger the animation
      setTimeout(() => {
        container.classList.add('--show');
      }, 10);
    }
    container.innerHTML = html;

    // Remove prior listeners to avoid duplicates during re-renders
    if (els.positionBulkBarHandler) {
      window.removeEventListener('resize', els.positionBulkBarHandler);
      window.removeEventListener('scroll', els.positionBulkBarHandler, true);
      els.positionBulkBarHandler = null;
    }

    // Position the bar vertically centered with the table header
    const positionBulkBar = () => {
      try {
        const contRect = els.tableContainer ? els.tableContainer.getBoundingClientRect() : null;
        if (!contRect) return;
        const headerEl = els.headerRow || els.thead;
        const hdrRect = headerEl ? headerEl.getBoundingClientRect() : contRect;
        const midY = hdrRect.top + (hdrRect.height / 2);
        const h = container.offsetHeight || 0;
        const adjust = -6; // nudge upwards a bit for visual alignment with header
        const topPx = Math.max(4, Math.round(midY - contRect.top - (h / 2) + adjust));
        container.style.top = `${topPx}px`;
      } catch (e) { /* noop */ }
    };
    // Defer to next frame so sizes are measured correctly
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(positionBulkBar);
    } else {
      setTimeout(positionBulkBar, 0);
    }

    // Keep position in sync on viewport changes and scrolls
    els.positionBulkBarHandler = positionBulkBar;
    window.addEventListener('resize', positionBulkBar);
    window.addEventListener('scroll', positionBulkBar, true);

    // Wire actions
    const clearBtn = container.querySelector('#bulk-clear');
    clearBtn.addEventListener('click', () => {
      state.selected.clear();
      render();
      hideBulkActionsBar();
      if (els.selectAll) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
    });
    const addListBtn = container.querySelector('#bulk-addlist');
    if (addListBtn) addListBtn.addEventListener('click', () => {
      // Toggle behavior: close if already open
      if (document.getElementById('people-lists-panel')) {
        closeBulkListsPanel();
      } else {
        openBulkListsPanel();
      }
    });
    const assignBtn = container.querySelector('#bulk-assign');
    if (assignBtn) {
      assignBtn.addEventListener('click', () => {
        if (window.BulkAssignment) {
          window.BulkAssignment.renderAssignMenu(assignBtn);
        }
      });
    }
    const seqBtn = container.querySelector('#bulk-sequence');
    if (seqBtn) seqBtn.addEventListener('click', () => {
      // Toggle behavior: close if already open
      if (document.getElementById('people-sequence-panel')) {
        closeBulkSequencePanel();
      } else {
        openBulkSequencePanel();
      }
    });
    
    const exportBtn = container.querySelector('#bulk-export');
    if (exportBtn) exportBtn.addEventListener('click', () => exportSelectedToCSV());
    const deleteBtn = container.querySelector('#bulk-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => openBulkDeleteConfirm());
  }

  function getTotalPages() {
    // In browse mode with more data available, calculate pages based on total count
    // In search mode, use filtered results
    const totalRecords = state.searchMode ? state.filtered.length : (state.totalCount || state.filtered.length);
    return Math.max(1, Math.ceil(totalRecords / state.pageSize));
  }

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
    // Show total count from database, not just loaded contacts
    const total = state.searchMode ? state.filtered.length : (state.totalCount || state.filtered.length);
    const start = total === 0 ? 0 : (current - 1) * state.pageSize + 1;
    const end = total === 0 ? 0 : Math.min(total, current * state.pageSize);

    // Use unified pagination component when available
    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(current, totalPages, (page) => {
        state.currentPage = page;
        render();
        // After page change, scroll to the top of the actual scroll container
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
      // Fallback simple pagination
      els.pagination.innerHTML = `
        <div class="unified-pagination">
          <button class="pagination-arrow" ${current <= 1 ? 'disabled' : ''}
            onclick="if(${current} > 1) { state.currentPage = ${current - 1}; render(); (function(){ var s=document.querySelector('#people-page .table-scroll'); if(s){ s.scrollTop=0; } window.scrollTo(0,0); })(); }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
          </button>
          <div class="pagination-current">${current} / ${totalPages}</div>
          <button class="pagination-arrow" ${current >= totalPages ? 'disabled' : ''}
            onclick="if(${current} < ${totalPages}) { state.currentPage = ${current + 1}; render(); (function(){ var s=document.querySelector('#people-page .table-scroll'); if(s){ s.scrollTop=0; } window.scrollTo(0,0); })(); }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>
          </button>
        </div>`;
    }

    // Update summary text
    if (els.paginationSummary) {
      const label = total === 1 ? 'contact' : 'contacts';
      els.paginationSummary.textContent = `Showing ${start}\u2013${end} of ${total} ${label}`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Export cleanup function for memory management
  window.peopleModule = window.peopleModule || {};
  window.peopleModule.cleanup = function() {
    console.log('[People] Cleaning up UI state...');
    // Don't clear data caches - preserve for instant back navigation
    // state.allContactsCache = null;
    // state.data = [];      // Keep paginated view for restoration
    // state.filtered = [];  // Keep filtered view for restoration
    // Keep hasAnimated = true to prevent icon animations on subsequent visits
    console.log('[People] UI state cleaned (preserving data for back navigation)');
  };
})();
