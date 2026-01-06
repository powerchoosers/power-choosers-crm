'use strict';

// Lists Overview page: shows existing People/Company lists with a toggle.
// Fresh start: no table/filters/pagination here. Empty state if no lists.
(function () {
  const els = {};
  const state = {
    kind: 'people', // 'people' | 'accounts'
    loadedPeople: false,
    loadedAccounts: false,
    peopleLists: [],
    accountLists: []
  };
  const STORAGE_KEY = 'pc_lists_kind';

  // Helper function to get normalized user email (cost-effective - no Firestore reads)
  function getUserEmail() {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
        return window.DataManager.getCurrentUserEmail();
      }
      return (window.currentUserEmail || '').toLowerCase();
    } catch(_) {
      return (window.currentUserEmail || '').toLowerCase();
    }
  }

  function qs(id) { return document.getElementById(id); }

  function initDom() {
    els.page = document.getElementById('lists-page');
    if (!els.page) return false;

    // els.switchBtn removed - now using toggle button
    els.pageContent = els.page.querySelector('.page-content');
    els.emptyState = qs('lists-empty-state');

    // Ensure a dedicated grid container exists and contains the empty state
    let grid = els.page.querySelector('#lists-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'lists-grid';
      // Insert the grid as the last child of page content
      els.pageContent?.appendChild(grid);
    }
    // Move empty state into the grid so layout applies consistently
    if (els.emptyState && els.emptyState.parentElement !== grid) {
      grid.appendChild(els.emptyState);
    }
    // Render into the grid container
    els.listContainer = grid;
    els.headerCreateBtn = qs('add-list-btn');
    els.createFirstBtn = qs('create-first-list-btn');
    els.tableContainer = els.pageContent;
    // Scrollbar compensation removed; fixed 25px margins are used

    return true;
  }

  // Scrollbar compensation helpers removed

  function openCreatePopover(origin = 'header') {
    closeCreatePopover();
    if (!els.headerCreateBtn) return;

    // Build popover
    popoverEl = document.createElement('div');
    popoverEl.className = 'create-list-popover';
    popoverEl.setAttribute('role', 'dialog');
    popoverEl.setAttribute('aria-label', 'Create list');
    popoverEl.innerHTML = `
      <div class="popover-content">
        <div class="form-row">
          <label for="cl-name">List name</label>
          <input id="cl-name" class="input-dark" type="text" placeholder="e.g., Target Prospects" />
        </div>
        <div class="form-row">
          <label for="cl-kind">List type</label>
          <select id="cl-kind" class="input-dark">
            <option value="people">People</option>
            <option value="accounts">Accounts</option>
          </select>
        </div>
        <div class="actions">
          <button type="button" class="btn-text" data-act="cancel">Cancel</button>
          <button type="button" class="btn-primary" data-act="create">Create</button>
        </div>
      </div>`;

    document.body.appendChild(popoverEl);
    // Default values
    const nameInput = popoverEl.querySelector('#cl-name');
    const kindSelect = popoverEl.querySelector('#cl-kind');
    if (kindSelect) kindSelect.value = state.kind;

    // Position: header -> below header button; empty -> center within empty-state container
    if (origin === 'empty' && els.emptyState) {
      // width before measuring for accurate centering
      const maxWidth = Math.min(420, window.innerWidth - 24);
      popoverEl.style.width = `${maxWidth}px`;
      positionPopoverCenteredInContainer(popoverEl, els.emptyState);
    } else {
      positionPopoverBelowButton(popoverEl, els.headerCreateBtn);
    }

    // Focus
    nameInput?.focus();

    // Wire actions
    popoverEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'cancel') {
        closeCreatePopover();
      } else if (act === 'create') {
        handleCreateSubmit(nameInput?.value || '', kindSelect?.value || state.kind);
      }
    });

    // Submit on Enter in name field
    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateSubmit(nameInput.value || '', kindSelect?.value || state.kind);
      }
    });

    // Outside click / escape
    const onDocClick = (e) => {
      if (!popoverEl) return;
      if (popoverEl.contains(e.target) || e.target === els.headerCreateBtn || e.target === els.createFirstBtn) return;
      closeCreatePopover();
    };
    const onKey = (e) => { if (e.key === 'Escape') closeCreatePopover(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    removeOutsideHandler = () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }

  function positionPopoverCenteredInContainer(pop, container) {
    const crect = container.getBoundingClientRect();
    // Ensure width is set before measuring height for accurate centering
    const pWidth = pop.offsetWidth;
    const pHeight = pop.offsetHeight;
    let left = crect.left + (crect.width - pWidth) / 2;
    let top = crect.top + (crect.height - pHeight) / 2;
    // Clamp to viewport with small margins
    left = Math.max(12, Math.min(left, window.innerWidth - pWidth - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - pHeight - 12));
    pop.style.position = 'fixed';
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.zIndex = '1100';
  }

  function positionPopoverBelowButton(pop, btn) {
    const rect = btn.getBoundingClientRect();
    const top = rect.bottom + 8 + window.scrollY;
    // Prefer right-align under the button
    const maxWidth = Math.min(420, window.innerWidth - 24);
    pop.style.position = 'fixed';
    pop.style.top = `${rect.bottom + 8}px`;
    const left = Math.max(12, Math.min(rect.right - maxWidth, window.innerWidth - maxWidth - 12));
    pop.style.left = `${left}px`;
    pop.style.width = `${maxWidth}px`;
    pop.style.zIndex = '1100';
  }

  async function handleCreateSubmit(rawName, kind) {
    const name = (rawName || '').trim();
    if (!name) {
      alert('Please enter a list name.');
      return;
    }

    // optimistic UI: disable buttons
    const createBtn = popoverEl?.querySelector('[data-act="create"]');
    if (createBtn) createBtn.disabled = true;

    const email = getUserEmail();
    let newItem = { 
      name, 
      kind, 
      recordCount: 0, 
      createdAt: new Date(), 
      updatedAt: new Date(),
      ownerId: email,
      createdBy: email,
      assignedTo: email
    };
    try {
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        const payload = { ...newItem };
        if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
          payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
          payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        }
        const ref = await window.firebaseDB.collection('lists').add(payload);
        newItem.id = ref.id;
      }
    } catch (err) {
      console.warn('Create list failed:', err);
      // keep local item without id if offline
    }

    // COST-EFFECTIVE: Update BackgroundListsLoader cache locally (zero Firestore reads)
    if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.addListLocally === 'function') {
      window.BackgroundListsLoader.addListLocally(newItem);
      console.log('[ListsOverview] ✓ Updated BackgroundListsLoader cache locally');
    }

    // COST-EFFECTIVE: Update CacheManager locally (IndexedDB write only, no Firestore read)
    if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function' && newItem.id) {
      window.CacheManager.updateRecord('lists', newItem.id, newItem).catch(err => 
        console.warn('[ListsOverview] Cache update failed:', err)
      );
      console.log('[ListsOverview] ✓ Updated CacheManager cache locally');
    }

    // COST-EFFECTIVE: Dispatch event for cross-component sync (free, no cost)
    try {
      document.dispatchEvent(new CustomEvent('pc:list-created', {
        detail: { id: newItem.id, list: newItem, kind }
      }));
      console.log('[ListsOverview] ✓ Dispatched pc:list-created event');
    } catch (e) {
      console.warn('[ListsOverview] Failed to dispatch event:', e);
    }

    // Update local state and render
    if (kind === 'people') {
      state.peopleLists = [newItem, ...state.peopleLists];
      state.loadedPeople = true;
    } else {
      state.accountLists = [newItem, ...state.accountLists];
      state.loadedAccounts = true;
    }

    closeCreatePopover();
    applyFilters();
  }

  function closeCreatePopover() {
    if (removeOutsideHandler) { removeOutsideHandler(); removeOutsideHandler = null; }
    if (popoverEl && popoverEl.parentNode) popoverEl.parentNode.removeChild(popoverEl);
    popoverEl = null;
  }
  let popoverEl = null;
  let removeOutsideHandler = null;
  let deleteModalEl = null;
  let removeDeleteHandler = null;

  function attachEvents() {
    // View toggle (replaces switch button)
    const viewToggle = qs('lists-view-toggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('button.toggle-btn');
        if (!btn) return;
        const newView = btn.getAttribute('data-view');
        if (!newView || newView === state.kind) {
          console.log('[ListsOverview] Toggle clicked but view unchanged:', { current: state.kind, newView });
          return;
        }
        
        console.log('[ListsOverview] Toggle clicked:', { from: state.kind, to: newView });
        
        // Update active styles
        viewToggle.querySelectorAll('.toggle-btn').forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        
        // Update state
        state.kind = newView;
        try { localStorage.setItem(STORAGE_KEY, state.kind); } catch {}
        
        // COST-EFFECTIVE: If both kinds are already loaded, just re-render (zero cost)
        // Otherwise, ensure data is loaded
        if (state.loadedPeople && state.loadedAccounts) {
          console.log('[ListsOverview] Both kinds loaded, applying filters for:', state.kind);
          applyFilters();
          updateToggleState();
        } else {
          console.log('[ListsOverview] Not all kinds loaded, calling ensureLoadedThenRender');
          ensureLoadedThenRender();
        }
      });
    }

    if (els.headerCreateBtn) {
      els.headerCreateBtn.addEventListener('click', () => openCreatePopover('header'));
    }
    if (els.createFirstBtn) {
      els.createFirstBtn.addEventListener('click', () => openCreatePopover('empty'));
    }

    // Filter toggle button (like people page)
    const toggleBtn = qs('toggle-lists-filters');
    const filterPanel = qs('lists-filters');
    if (toggleBtn && filterPanel) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = filterPanel.hasAttribute('hidden');
        if (isHidden) {
          filterPanel.removeAttribute('hidden');
          // Add show class after a small delay to ensure the element is visible
          setTimeout(() => {
            filterPanel.classList.add('show');
          }, 10);
          if (toggleBtn.querySelector('.filter-text')) {
            toggleBtn.querySelector('.filter-text').textContent = 'Hide Filters';
          }
        } else {
          // Remove show class first, then hide after animation
          filterPanel.classList.remove('show');
          setTimeout(() => {
            filterPanel.setAttribute('hidden', '');
          }, 300); // Match the CSS transition duration
          if (toggleBtn.querySelector('.filter-text')) {
            toggleBtn.querySelector('.filter-text').textContent = 'Show Filters';
          }
        }
      });
    }

    // Filter inputs
    const nameFilter = qs('lists-filter-name');
    const typeFilter = qs('lists-filter-type');
    const ownerFilter = qs('lists-filter-owner');
    const applyBtn = qs('lists-apply-filters');
    const clearBtn = qs('lists-clear-filters');

    if (nameFilter) nameFilter.addEventListener('input', applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (ownerFilter) ownerFilter.addEventListener('input', applyFilters);
    if (applyBtn) applyBtn.addEventListener('click', applyFilters);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (nameFilter) nameFilter.value = '';
        if (typeFilter) typeFilter.value = '';
        if (ownerFilter) ownerFilter.value = '';
        applyFilters();
      });
    }
  }

  function updateToggleState() {
    const viewToggle = qs('lists-view-toggle');
    if (!viewToggle) return;
    
    viewToggle.querySelectorAll('.toggle-btn').forEach(b => {
      const view = b.getAttribute('data-view');
      const active = view === state.kind;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  async function ensureLoadedThenRender() {
    // Force an initial render to hide the empty state and potentially show skeletons
    applyFilters();

    // COST-EFFECTIVE: Use BackgroundListsLoader cache first (zero Firestore reads)
    if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.getListsData === 'function') {
      const allLists = window.BackgroundListsLoader.getListsData() || [];
      
      if (allLists.length > 0) {
        // CRITICAL FIX: Load BOTH people and accounts lists from cache on initial load
        // This ensures both are ready when user toggles, and initial render is correct
        
        // Helper: merge new lists into existing ones without losing previously seen items
        const mergeListsById = (existing, incoming) => {
          const map = new Map();
          (existing || []).forEach(list => {
            if (list && list.id) map.set(list.id, list);
          });
          (incoming || []).forEach(list => {
            if (list && list.id) map.set(list.id, list);
          });
          // Keep most recently updated lists first
          return Array.from(map.values()).sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          });
        };
        
        // Filter people lists
        const peopleLists = allLists.filter(list => {
          const listKind = (list.kind || list.type || list.listType || '').toLowerCase();
          return listKind === 'people' || listKind === 'person' || listKind === 'contacts' || listKind === 'contact';
        });
        
        // Filter account lists
        const accountLists = allLists.filter(list => {
          const listKind = (list.kind || list.type || list.listType || '').toLowerCase();
          return listKind === 'accounts' || listKind === 'account' || listKind === 'companies' || listKind === 'company';
        });
        
        // Update state with both filtered lists, MERGING with any existing lists
        // This prevents newly created lists from "disappearing" if a later cache reload is incomplete
        state.peopleLists = mergeListsById(state.peopleLists, peopleLists);
        state.loadedPeople = true;
        state.accountLists = mergeListsById(state.accountLists, accountLists);
        state.loadedAccounts = true;
        
        console.log('[ListsOverview] ✓ Loaded', peopleLists.length, 'people lists and', accountLists.length, 'account lists from BackgroundListsLoader cache (zero cost)');
        
        // Preload members for both kinds if needed (uses cache if available)
        if (typeof window.__preloadListMembers === 'function') {
          await window.__preloadListMembers([...peopleLists, ...accountLists]);
        }
        
        // CRITICAL: Render with the correct kind filter based on current state.kind
        // This ensures only the correct type is shown on initial load
        applyFilters();
        updateToggleState();
        return; // Skip Firestore query - cache has data
      }
    }
    
    // Fallback: Only query Firestore if BackgroundListsLoader has no data
    // COST OPTIMIZATION: Load current kind first for immediate display, lazy-load other kind in background
    if (state.kind === 'people' && !state.loadedPeople) {
      await loadLists('people');
      applyFilters();
      updateToggleState();
      // Lazy-load accounts in background (non-blocking)
      if (!state.loadedAccounts) {
        loadLists('accounts').catch(err => console.warn('[ListsOverview] Background load of accounts failed:', err));
      }
    } else if (state.kind === 'accounts' && !state.loadedAccounts) {
      await loadLists('accounts');
      applyFilters();
      updateToggleState();
      // Lazy-load people in background (non-blocking)
      if (!state.loadedPeople) {
        loadLists('people').catch(err => console.warn('[ListsOverview] Background load of people failed:', err));
      }
    } else {
      // Both already loaded or current kind already loaded
      applyFilters();
      updateToggleState();
    }
  }

  async function loadLists(kind) {
    // COST-EFFECTIVE: Always try BackgroundListsLoader first (zero Firestore reads if cache available)
    try {
      if (console.time) console.time(`[ListsOverview] loadLists ${kind}`);
      
      // Use BackgroundListsLoader (cache-first)
      if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.getListsData === 'function') {
        let listsData = window.BackgroundListsLoader.getListsData() || [];
        
        // If background loader hasn't loaded data yet, wait for it (cost-effective: avoids Firestore query)
        if (listsData.length === 0) {
          console.log('[ListsOverview] BackgroundListsLoader not ready yet, waiting...');
          // Wait up to 3 seconds for background loader
          for (let attempt = 0; attempt < 30; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            listsData = window.BackgroundListsLoader.getListsData() || [];
            if (listsData.length > 0) {
              console.log('[ListsOverview] ✓ BackgroundListsLoader ready after', (attempt + 1) * 100, 'ms with', listsData.length, 'lists (zero cost)');
              break;
            }
          }
        }
        
        // COST-EFFECTIVE: Filter by kind client-side (no Firestore query needed)
        if (listsData.length > 0) {
          const filteredLists = listsData.filter(list => {
            const listKind = (list.kind || list.type || list.listType || '').toLowerCase();
            if (kind === 'people') {
              return listKind === 'people' || listKind === 'person' || listKind === 'contacts' || listKind === 'contact';
            } else {
              return listKind === 'accounts' || listKind === 'account' || listKind === 'companies' || listKind === 'company';
            }
          });
          
          console.log('[ListsOverview] ✓ Loaded', filteredLists.length, 'lists from BackgroundListsLoader for kind:', kind, '(zero cost)');
          
          // Ensure global cache exists
          try { window.listMembersCache = window.listMembersCache || {}; } catch (_) {}

          // COST OPTIMIZATION: Preload members for lists in this kind (uses cache if available)
          // The preloader checks cache first, so this is cost-effective
          if (typeof window.__preloadListMembers === 'function') {
            await window.__preloadListMembers(filteredLists);
          } else {
            // Fallback: set default counts
            console.log('[ListsOverview] Preloader not available, setting default counts');
            for (const list of filteredLists) {
              list.count = 0;
            }
          }

          if (kind === 'people') {
            state.peopleLists = filteredLists;
            state.loadedPeople = true;
          } else {
            state.accountLists = filteredLists;
            state.loadedAccounts = true;
          }
          
          if (console.timeEnd) console.timeEnd(`[ListsOverview] loadLists ${kind}`);
          renderFilteredItems(kind === 'people' ? state.peopleLists : state.accountLists);
          return; // Skip Firestore query - cache has data
        }
      }
      
      // Fallback to direct Firestore query
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Primary query: filter by kind on server if available
        let query = window.firebaseDB.collection('lists');
        
        // CRITICAL: Add ownership filter FIRST for non-admin users (required by Firestore rules)
        const email = getUserEmail();
        if (window.currentUserRole !== 'admin' && email) {
          query = query.where('ownerId', '==', email);
        }
        
        // Then add kind filter
        if (query.where) query = query.where('kind', '==', kind);
        let snap = await (query.limit ? query.limit(200).get() : query.get());
        let items = (snap && snap.docs) ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

        // Fallback: if nothing returned, fetch recent docs without server-side kind filter
        // and filter client-side using flexible field names: kind | type | listType.
        if (!items.length) {
          try {
            const email = getUserEmail();
            let altSnap;
            if (window.currentUserRole !== 'admin' && email) {
              // Non-admin: use scoped query - check multiple ownership fields
              const [ownedSnap, assignedSnap, createdSnap] = await Promise.all([
                window.firebaseDB.collection('lists').where('ownerId','==',email).limit(200).get(),
                window.firebaseDB.collection('lists').where('assignedTo','==',email).limit(200).get(),
                window.firebaseDB.collection('lists').where('createdBy','==',email).limit(200).get()
              ]);
              const map = new Map();
              ownedSnap.forEach(d=>map.set(d.id, d));
              assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
              createdSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
              altSnap = { docs: Array.from(map.values()) };
            } else {
              // Admin: use unfiltered query
              altSnap = await window.firebaseDB.collection('lists').limit(200).get();
            }
            const all = (altSnap && altSnap.docs) ? altSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            const want = (v) => (v || '').toString().trim().toLowerCase();
            items = all.filter(doc => {
              const k = want(doc.kind || doc.type || doc.listType || doc.category);
              if (!k) return kind === 'people' ? (want(doc.people) === 'true') : (want(doc.accounts) === 'true');
              return (kind === 'people') ? (k === 'people' || k === 'person' || k === 'contacts' || k === 'contact')
                                         : (k === 'accounts' || k === 'account' || k === 'companies' || k === 'company');
            });
            console.debug('[ListsOverview] fallback fetched without where', { total: all.length, matched: items.length, forKind: kind });
          } catch (e) {
            console.debug('[ListsOverview] fallback fetch failed', e);
          }
        }

        // Ensure global cache exists
        try { window.listMembersCache = window.listMembersCache || {}; } catch (_) {}

        // Preload members for all lists in this kind and compute counts
        if (typeof window.__preloadListMembers === 'function') {
          await window.__preloadListMembers(items);
        } else {
          console.warn('[ListsOverview] Preloader not available, skipping member count loading');
        }
        console.debug('[ListsOverview] lists loaded', { kind, count: items.length });

        // After preloading, set count per item based on its declared kind
        for (const item of items) {
          const cache = window.listMembersCache?.[item.id];
          const k = (item.kind || kind || 'people').toLowerCase();
          if (cache) {
            // Use cache count as the source of truth
            const cacheCount = k === 'accounts' ? (cache.accounts?.size || 0) : (cache.people?.size || 0);
            item.count = cacheCount;
            item.recordCount = cacheCount; // Keep both in sync
          } else {
            // Fallback to recordCount (preferred) or count field
            item.count = typeof item.recordCount === 'number' ? item.recordCount : (typeof item.count === 'number' ? item.count : 0);
          }
        }

        if (kind === 'people') { state.peopleLists = items; state.loadedPeople = true; }
        else { state.accountLists = items; state.loadedAccounts = true; }
      } else {
        // No Firestore: remain empty but mark as loaded
        if (kind === 'people') state.loadedPeople = true; else state.loadedAccounts = true;
      }
      if (console.timeEnd) console.timeEnd(`[ListsOverview] loadLists ${kind}`);
    } catch (err) {
      console.error('[ListsOverview] Failed to load lists for kind', kind, err);
      
      // COST-EFFECTIVE: Preserve cache on error (don't clear existing data)
      // Try to use BackgroundListsLoader cache as fallback
      if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.getListsData === 'function') {
        try {
          const cachedLists = window.BackgroundListsLoader.getListsData() || [];
          if (cachedLists.length > 0) {
            const filteredLists = cachedLists.filter(list => {
              const listKind = (list.kind || list.type || list.listType || '').toLowerCase();
              if (kind === 'people') {
                return listKind === 'people' || listKind === 'person' || listKind === 'contacts' || listKind === 'contact';
              } else {
                return listKind === 'accounts' || listKind === 'account' || listKind === 'companies' || listKind === 'company';
              }
            });
            
            if (kind === 'people') {
              if (state.peopleLists.length === 0) {
                state.peopleLists = filteredLists; // Only use cache if state is empty
              }
              state.loadedPeople = true;
            } else {
              if (state.accountLists.length === 0) {
                state.accountLists = filteredLists; // Only use cache if state is empty
              }
              state.loadedAccounts = true;
            }
            console.log('[ListsOverview] ✓ Preserved cache data on error (zero cost)');
          }
        } catch (cacheErr) {
          console.warn('[ListsOverview] Cache fallback failed:', cacheErr);
        }
      }
      
      // Mark as loaded to prevent infinite retry loops
      if (kind === 'people') state.loadedPeople = true; else state.loadedAccounts = true;
    }
  }

  // Live updates for lists collection so cards refresh immediately
  let _unsubListsPeople = null;
  let _unsubListsAccounts = null;
  let _peopleListenerRetries = 0;
  let _accountsListenerRetries = 0;
  
  // COST-EFFECTIVE: Debounce function to prevent rapid updates (reduces re-renders)
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  function startLiveListsListeners() {
    try {
      if (!window.firebaseDB || !window.firebaseDB.collection) return;
      
      // COST-EFFECTIVE: Only use live listeners as backup for multi-user scenarios
      // Primary updates come from events (pc:list-count-updated) which are free
      // Live listeners trigger Firestore reads on every change, so use sparingly
      
      const col = window.firebaseDB.collection('lists');
      
      // People lists - try filtered query first, fallback to unfiltered if it fails
      if (_unsubListsPeople) { try { _unsubListsPeople(); } catch(_) {} _unsubListsPeople = null; }
      
      // COST-EFFECTIVE: Debounced update handler (500ms) to prevent flickering
      const debouncedPeopleUpdate = debounce((items) => {
        try {
          // CRITICAL FIX: Skip live listener updates during restore operation
          if (window._listsOverviewRestoring) {
            console.log('[ListsOverview] ⏭️ Skipping live listener update during restore');
            return;
          }
          
          // CRITICAL FIX: Protect against incomplete listener data
          const existingCount = state.peopleLists.length;
          
          console.log(`[ListsOverview] Live listener update - people lists:`, {
            existingCount,
            newCount: items.length,
            currentView: state.kind,
            itemIds: items.map(i => i.id).slice(0, 5), // Show first 5 IDs
            existingIds: state.peopleLists.map(i => i.id).slice(0, 5)
          });
          
          // CRITICAL: Only protect against complete data loss or massive drops
          // Don't protect against normal updates (user deleted lists, etc.)
          // If listener returns 50% or less of existing items, it's likely incomplete
          if (existingCount > 5 && items.length > 0 && items.length < existingCount * 0.5) {
            console.warn(`[ListsOverview] ⚠️ Live listener returned ${items.length} items but we have ${existingCount} (${Math.round(items.length/existingCount*100)}%) - likely incomplete data, preserving existing`);
            return;
          }
          
          // If listener returns empty and we have existing data, preserve existing
          if (items.length === 0 && existingCount > 0) {
            console.warn('[ListsOverview] ⚠️ Live listener returned empty, preserving existing lists');
            return;
          }
          
          // Update with listener data
          const previousCount = state.peopleLists.length;
          state.peopleLists = items;
          state.loadedPeople = true;
          
          console.log(`[ListsOverview] ✓ Updated people lists from listener: ${previousCount} → ${items.length}`);
          
          // Re-render if we're viewing people lists
          if (state.kind === 'people') {
            applyFilters();
          }
          
          _peopleListenerRetries = 0; // Reset retry counter on success
        } catch (e) {
          console.error('[ListsOverview] People lists debounced update error:', e);
        }
      }, 500); // 500ms debounce
      
      const setupPeopleListener = (useFilter = true) => {
        try {
          let query = col;
          if (useFilter && col.where) {
            query = col.where('kind', '==', 'people');
          }
          
          _unsubListsPeople = query.onSnapshot(
            (snap) => {
              // Success handler - use debounced update
              try {
                let items = [];
                snap.forEach((d) => {
                  const data = d.data();
                  // Filter client-side if using unfiltered query
                  if (!useFilter) {
                    const kind = (data.kind || '').toLowerCase();
                    if (kind !== 'people' && kind !== 'person' && kind !== 'contacts' && kind !== 'contact') {
                      return; // Skip this item
                    }
                  }
                  items.push({ id: d.id, ...data });
                });
                
                // Use debounced update to prevent flickering
                debouncedPeopleUpdate(items);
              } catch (e) {
                console.error('[ListsOverview] People lists snapshot error:', e);
              }
            },
            (error) => {
              // Error handler - try fallback instead of unsubscribing
              console.error('[ListsOverview] People lists live listener error:', error);
              
              // If filtered query failed and we haven't tried fallback yet, retry with unfiltered
              if (useFilter && _peopleListenerRetries < 2) {
                _peopleListenerRetries++;
                console.log('[ListsOverview] Retrying people lists listener with fallback query...');
                setTimeout(() => {
                  if (_unsubListsPeople) {
                    try { _unsubListsPeople(); } catch(_) {}
                    _unsubListsPeople = null;
                  }
                  setupPeopleListener(false); // Try without filter
                }, 1000);
              } else {
                // After retries, don't unsubscribe - keep existing data visible
                console.warn('[ListsOverview] People lists listener failed, keeping existing data');
                // Don't clear state or unsubscribe - preserve what we have
              }
            }
          );
        } catch (e) {
          console.error('[ListsOverview] Failed to setup people listener:', e);
        }
      };
      
      setupPeopleListener(true); // Start with filtered query
      
      // Account lists - same fallback pattern
      if (_unsubListsAccounts) { try { _unsubListsAccounts(); } catch(_) {} _unsubListsAccounts = null; }
      
      // COST-EFFECTIVE: Debounced update handler (500ms) to prevent flickering
      const debouncedAccountsUpdate = debounce((items) => {
        try {
          // CRITICAL FIX: Skip live listener updates during restore operation
          if (window._listsOverviewRestoring) {
            console.log('[ListsOverview] ⏭️ Skipping live listener update during restore');
            return;
          }
          
          // CRITICAL FIX: Protect against incomplete listener data
          const existingCount = state.accountLists.length;
          
          console.log(`[ListsOverview] Live listener update - account lists:`, {
            existingCount,
            newCount: items.length,
            currentView: state.kind,
            itemIds: items.map(i => i.id).slice(0, 5),
            existingIds: state.accountLists.map(i => i.id).slice(0, 5)
          });
          
          // CRITICAL: Only protect against complete data loss or massive drops
          // If listener returns 50% or less of existing items, it's likely incomplete
          if (existingCount > 5 && items.length > 0 && items.length < existingCount * 0.5) {
            console.warn(`[ListsOverview] ⚠️ Live listener returned ${items.length} items but we have ${existingCount} (${Math.round(items.length/existingCount*100)}%) - likely incomplete data, preserving existing`);
            return;
          }
          
          // If listener returns empty and we have existing data, preserve existing
          if (items.length === 0 && existingCount > 0) {
            console.warn('[ListsOverview] ⚠️ Live listener returned empty, preserving existing lists');
            return;
          }
          
          // Update with listener data
          const previousCount = state.accountLists.length;
          state.accountLists = items;
          state.loadedAccounts = true;
          
          console.log(`[ListsOverview] ✓ Updated account lists from listener: ${previousCount} → ${items.length}`);
          
          // Re-render if we're viewing account lists
          if (state.kind === 'accounts') {
            applyFilters();
          }
          
          _accountsListenerRetries = 0; // Reset retry counter on success
        } catch (e) {
          console.error('[ListsOverview] Account lists debounced update error:', e);
        }
      }, 500); // 500ms debounce
      
      const setupAccountsListener = (useFilter = true) => {
        try {
          let query = col;
          if (useFilter && col.where) {
            query = col.where('kind', '==', 'accounts');
          }
          
          _unsubListsAccounts = query.onSnapshot(
            (snap) => {
              // Success handler - use debounced update
              try {
                let items = [];
                snap.forEach((d) => {
                  const data = d.data();
                  // Filter client-side if using unfiltered query
                  if (!useFilter) {
                    const kind = (data.kind || '').toLowerCase();
                    if (kind !== 'accounts' && kind !== 'account' && kind !== 'companies' && kind !== 'company') {
                      return; // Skip this item
                    }
                  }
                  items.push({ id: d.id, ...data });
                });
                
                // Use debounced update to prevent flickering
                debouncedAccountsUpdate(items);
              } catch (e) {
                console.error('[ListsOverview] Account lists snapshot error:', e);
              }
            },
            (error) => {
              // Error handler - try fallback instead of unsubscribing
              console.error('[ListsOverview] Account lists live listener error:', error);
              
              // If filtered query failed and we haven't tried fallback yet, retry with unfiltered
              if (useFilter && _accountsListenerRetries < 2) {
                _accountsListenerRetries++;
                console.log('[ListsOverview] Retrying account lists listener with fallback query...');
                setTimeout(() => {
                  if (_unsubListsAccounts) {
                    try { _unsubListsAccounts(); } catch(_) {}
                    _unsubListsAccounts = null;
                  }
                  setupAccountsListener(false); // Try without filter
                }, 1000);
              } else {
                // After retries, don't unsubscribe - keep existing data visible
                console.warn('[ListsOverview] Account lists listener failed, keeping existing data');
                // Don't clear state or unsubscribe - preserve what we have
              }
            }
          );
        } catch (e) {
          console.error('[ListsOverview] Failed to setup account listener:', e);
        }
      };
      
      setupAccountsListener(true); // Start with filtered query
      
    } catch (e) {
      console.warn('[ListsOverview] Failed to start live listeners', e);
    }
  }

  function applyFilters() {
    const nameFilter = qs('lists-filter-name')?.value?.toLowerCase() || '';
    const typeFilter = qs('lists-filter-type')?.value || '';
    const ownerFilter = qs('lists-filter-owner')?.value?.toLowerCase() || '';
    
    // CRITICAL FIX: Always filter by state.kind first to ensure correct type is shown
    let items = state.kind === 'people' ? state.peopleLists : state.accountLists;
    
    // Additional safety: double-check that items match the current kind
    // This prevents mixed types from showing
    items = items.filter(item => {
      const itemKind = (item.kind || item.type || item.listType || '').toLowerCase();
      const expectedKind = state.kind === 'people' ? 'people' : 'accounts';
      
      // Normalize item kind to match expected
      const isPeople = itemKind === 'people' || itemKind === 'person' || itemKind === 'contacts' || itemKind === 'contact';
      const isAccounts = itemKind === 'accounts' || itemKind === 'account' || itemKind === 'companies' || itemKind === 'company';
      
      // Only include items that match the current kind
      if (state.kind === 'people' && !isPeople) return false;
      if (state.kind === 'accounts' && !isAccounts) return false;
      
      return true;
    });
    
    // Apply additional filters (name, type, owner)
    items = items.filter(item => {
      const name = (item.name || '').toLowerCase();
      const kind = item.kind || item.type || '';
      // FIX: Check ownerId field (primary) and fallback to createdBy/owner, normalize properly
      const ownerId = (item.ownerId || '').toLowerCase();
      const createdBy = (item.createdBy || '').toLowerCase();
      const owner = (item.owner || '').toLowerCase();
      const ownerMatch = ownerId || createdBy || owner;
      
      return (!nameFilter || name.includes(nameFilter)) &&
             (!typeFilter || kind === typeFilter) &&
             (!ownerFilter || ownerMatch.includes(ownerFilter));
    });
    
    // Update filter badge
    const filterBadge = qs('lists-filter-count');
    if (filterBadge) {
      const activeFilters = [nameFilter, typeFilter, ownerFilter].filter(f => f).length;
      if (activeFilters > 0) {
        filterBadge.textContent = activeFilters;
        filterBadge.hidden = false;
      } else {
        filterBadge.hidden = true;
      }
    }
    
    console.log('[ListsOverview] applyFilters:', { kind: state.kind, itemsCount: items.length, peopleListsCount: state.peopleLists.length, accountListsCount: state.accountLists.length });
    renderFilteredItems(items);
  }

  function renderFilteredItems(items) {
    const isPeopleView = state.kind === 'people';
    const isLoading = isPeopleView ? !state.loadedPeople : !state.loadedAccounts;
    const hasAny = Array.isArray(items) && items.length > 0;

    if (!els.listContainer || !els.emptyState) return;

    // Show skeletons while loading if no data yet
    if (isLoading) {
      const cached = isPeopleView ? state.peopleLists : state.accountLists;
      if (Array.isArray(cached) && cached.length) {
        // We have cached data, fall through to render it (no flicker)
      } else {
        // No data yet, show skeletons
        els.emptyState.hidden = true;
        els.listContainer.classList.add('--loading');
        
        let skeletons = '';
        for (let i = 0; i < 6; i++) {
          skeletons += listSkeletonHtml();
        }
        els.listContainer.innerHTML = skeletons;
        return;
      }
    } else {
      els.listContainer.classList.remove('--loading');
    }

    // Show/hide empty state
    els.emptyState.hidden = hasAny;
    
    // Toggle empty class on container
    if (els.listContainer) {
      els.listContainer.classList.toggle('--empty', !hasAny);
    }

    if (!hasAny) {
      // Clear any existing list cards when showing empty state
      const existingCards = els.listContainer.querySelectorAll('.list-card');
      existingCards.forEach(card => card.remove());
      // No scrollbar compensation needed
      return;
    }

    // Preserve empty state element
    const emptyStateEl = els.listContainer.querySelector('#lists-empty-state');
    
    // Get existing cards for comparison
    const existingCards = els.listContainer.querySelectorAll('.list-card');
    const existingIds = Array.from(existingCards).map(card => card.getAttribute('data-id'));
    const newIds = items.map(item => item.id);
    
    // Remove cards that no longer exist with fade-out and slide animation
    const cardsToRemove = [];
    existingCards.forEach(card => {
      const id = card.getAttribute('data-id');
      if (!newIds.includes(id)) {
        cardsToRemove.push(card);
      }
    });
    
    // Add fade-out animation to cards being removed
    if (cardsToRemove.length > 0) {
      // Add a class to the grid container to enable smooth transitions for remaining cards
      els.listContainer.classList.add('card-removing');
      
      cardsToRemove.forEach(card => {
        card.classList.add('card-fade-out');
        card.addEventListener('animationend', () => {
          card.remove();
          // Remove the class after all animations complete
          if (els.listContainer.querySelectorAll('.card-fade-out').length === 0) {
            setTimeout(() => {
              els.listContainer.classList.remove('card-removing');
            }, 50);
          }
        }, { once: true });
      });
    }
    
    // Add or update cards with staggered animations
    items.forEach((item, index) => {
      let existingCard = els.listContainer.querySelector(`.list-card[data-id="${item.id}"]`);
      const cardHtml = listCardHtml(item);
      
      if (!existingCard) {
        // Create new card
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const newCard = tempDiv.firstElementChild;
        
        // Add animation class with staggered delay
        newCard.classList.add('card-fade-in');
        newCard.style.animationDelay = `${index * 50}ms`;
        
        // Insert at correct position
        const nextCard = els.listContainer.children[index];
        if (nextCard && nextCard.classList.contains('list-card')) {
          els.listContainer.insertBefore(newCard, nextCard);
        } else {
          // Insert before empty state if it exists
          if (emptyStateEl) {
            els.listContainer.insertBefore(newCard, emptyStateEl);
          } else {
            els.listContainer.appendChild(newCard);
          }
        }
        
        // Remove animation class after animation completes to prevent re-animation
        newCard.addEventListener('animationend', () => {
          newCard.classList.remove('card-fade-in');
          newCard.style.animationDelay = '';
        }, { once: true });
        
        // Attach event listeners for new card
        attachCardListeners(newCard);
      } else {
        // Update existing card content only if needed
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const newCardContent = tempDiv.firstElementChild;
        
        // Compare and update only if content changed
        if (existingCard.innerHTML !== newCardContent.innerHTML) {
          existingCard.innerHTML = newCardContent.innerHTML;
          // Re-attach event listeners after content update
          attachCardListeners(existingCard);
        }
      }
    });
    
    // Ensure empty state is at the end
    if (emptyStateEl && emptyStateEl.parentElement === els.listContainer) {
      els.listContainer.appendChild(emptyStateEl);
    }

    // No scrollbar compensation needed
  }
  
  // Helper function to attach event listeners to a card
  function attachCardListeners(card) {
    card.querySelectorAll('[data-action]')?.forEach(btn => {
      // Remove existing listeners by cloning
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        const action = newBtn.getAttribute('data-action');
        const id = newBtn.getAttribute('data-id');
        const kind = newBtn.getAttribute('data-kind');
        console.log('[Lists] action', action, { id, kind });
        if (action === 'Open') {
          handleOpenList(id, kind);
          return;
        }
        if (action === 'Delete') {
          showDeleteConfirmation(id, kind);
          return;
        }
        if (action === 'Rename') {
          showRenameDialog(id, kind);
          return;
        }
      });
    });
  }

  function updateToggleState() {
    const viewToggle = qs('lists-view-toggle');
    if (!viewToggle) return;
    
    // Update active state based on current kind
    viewToggle.querySelectorAll('.toggle-btn').forEach(btn => {
      const view = btn.getAttribute('data-view');
      const active = view === state.kind;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDateOrNA(val) {
    try {
      if (!val) return 'N/A';
      if (val instanceof Date) return isNaN(val.getTime()) ? 'N/A' : val.toLocaleDateString();
      if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().toLocaleDateString();
      if (typeof val === 'number') return new Date(val).toLocaleDateString();
      if (typeof val === 'string') return new Date(val).toLocaleDateString();
      return 'N/A';
    } catch { return 'N/A'; }
  }

  function listCardHtml(item) {
    const id = escapeHtml(item.id || '');
    const name = escapeHtml(item.name || 'Untitled list');
    // CRITICAL FIX: Prioritize recordCount (from Firestore) over count (may be stale)
    const count = typeof item.recordCount === 'number' ? item.recordCount : (typeof item.count === 'number' ? item.count : 0);
    const type = escapeHtml(item.kind || item.type || (state.kind === 'people' ? 'people' : 'accounts'));
    const owner = escapeHtml(item.createdBy || 'You');
    const updated = escapeHtml(formatDateOrNA(item.updatedAt || item.createdAt));

    return `
      <div class="list-card" data-id="${id}">
        <div class="list-card-header">
          <div class="list-card-title">${name}</div>
          <div class="list-card-count">${count.toLocaleString()} ${type === 'people' ? 'people' : 'companies'}</div>
        </div>
        <div class="list-card-meta">
          <span class="meta">Type: ${type === 'people' ? 'People' : 'Companies'}</span>
          <span class="meta">Owner: ${owner}</span>
          <span class="meta">Updated: ${updated}</span>
        </div>
        <div class="list-card-actions">
          <button class="btn-secondary" data-action="Open" data-id="${id}" data-kind="${type}">Open</button>
          <button class="btn-text" data-action="Rename" data-id="${id}" data-kind="${type}">Rename</button>
          <button class="btn-text" data-action="Delete" data-id="${id}" data-kind="${type}">Delete</button>
        </div>
      </div>`;
  }

  function listSkeletonHtml() {
    return `
      <div class="list-card skeleton-card">
        <div class="list-card-header">
          <div class="skeleton-text skeleton-title"></div>
          <div class="skeleton-text skeleton-count"></div>
        </div>
        <div class="list-card-meta">
          <div class="skeleton-text skeleton-meta-item"></div>
          <div class="skeleton-text skeleton-meta-item"></div>
          <div class="skeleton-text skeleton-meta-item"></div>
        </div>
        <div class="list-card-actions">
          <div class="skeleton-btn"></div>
          <div class="skeleton-btn"></div>
          <div class="skeleton-btn"></div>
        </div>
      </div>`;
  }

  async function handleOpenList(id, kind) {
    const listArr = kind === 'people' ? state.peopleLists : state.accountLists;
    const item = (listArr || []).find(x => x.id === id);
    
    // CRITICAL FIX: If no list found, try to load from Firestore directly
    let name = item?.name;
    if (!name && window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
      try {
        const listDoc = await window.firebaseDB.collection('lists').doc(id).get();
        if (listDoc.exists) {
          name = listDoc.data().name || 'List';
          console.log('[ListsOverview] Loaded list name from Firestore:', name);
        } else {
          name = 'List';
        }
      } catch (e) {
        console.warn('[ListsOverview] Failed to load list name:', e);
        name = 'List';
      }
    } else if (!name) {
      name = 'List';
    }
    
    try {
      const cache = window.listMembersCache?.[id];
      console.debug('[ListsOverview] Open clicked cache status', {
        id,
        loaded: !!cache?.loaded,
        people: cache?.people instanceof Set ? cache.people.size : (Array.isArray(cache?.people) ? cache.people.length : 0),
        accounts: cache?.accounts instanceof Set ? cache.accounts.size : (Array.isArray(cache?.accounts) ? cache.accounts.length : 0)
      });
    } catch (_) {}
    
    // RETRY MECHANISM: Ensure both contacts and accounts are loaded
    let contactsData = [];
    let accountsData = [];
    
    // Check contacts
    if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
      contactsData = window.BackgroundContactsLoader.getContactsData() || [];
    } else if (typeof window.getPeopleData === 'function') {
      contactsData = window.getPeopleData() || [];
    }
    
    // Check accounts
    if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
      accountsData = window.BackgroundAccountsLoader.getAccountsData() || [];
    } else if (typeof window.getAccountsData === 'function') {
      accountsData = window.getAccountsData() || [];
    }
    
    // If either is empty, wait for background loaders
    if ((contactsData.length === 0 || accountsData.length === 0) && 
        (window.BackgroundContactsLoader || window.BackgroundAccountsLoader)) {
      console.log('[ListsOverview] Waiting for background loaders...', {
        contacts: contactsData.length,
        accounts: accountsData.length
      });
      
      // Wait up to 3 seconds (30 attempts x 100ms)
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (contactsData.length === 0 && window.BackgroundContactsLoader) {
          contactsData = window.BackgroundContactsLoader.getContactsData() || [];
        }
        
        if (accountsData.length === 0 && window.BackgroundAccountsLoader) {
          accountsData = window.BackgroundAccountsLoader.getAccountsData() || [];
        }
        
        // Break if both are loaded
        if (contactsData.length > 0 && accountsData.length > 0) {
          console.log('[ListsOverview] ✓ Background loaders ready after', (attempt + 1) * 100, 'ms', {
            contacts: contactsData.length,
            accounts: accountsData.length
          });
          break;
        }
      }
      
      if (contactsData.length === 0 || accountsData.length === 0) {
        console.warn('[ListsOverview] ⚠ Timeout waiting for data after 3 seconds', {
          contacts: contactsData.length,
          accounts: accountsData.length
        });
      }
    }
    
    // Store navigation state for back button functionality
    try {
      window._listDetailNavigationSource = 'lists';
      window._listDetailReturn = getCurrentState();
      console.log('[ListsOverview] Stored navigation state for back button:', window._listDetailReturn);
    } catch (_) {}
    
    // Store context for the list detail page
    window.listDetailContext = {
      listId: id,
      listName: name,
      listKind: kind === 'people' ? 'people' : 'accounts'
    };
    
    // Navigate to the list detail page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('list-detail');
    } else {
      console.warn('Navigation not available');
    }
  }

  function showRenameDialog(id, kind) {
    const listArr = kind === 'people' ? state.peopleLists : state.accountLists;
    const item = (listArr || []).find(x => x.id === id);
    const currentName = item?.name || 'Untitled list';
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Rename List</h3>
        </div>
        <div class="modal-body">
          <p>Enter a new name for "${currentName}":</p>
          <input type="text" class="input-dark" id="rename-input" value="${currentName}" placeholder="List name">
        </div>
        <div class="modal-actions">
          <button class="btn-text" id="rename-cancel">Cancel</button>
          <button class="btn-secondary" id="rename-save">Save</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const input = overlay.querySelector('#rename-input');
    const cancelBtn = overlay.querySelector('#rename-cancel');
    const saveBtn = overlay.querySelector('#rename-save');
    
    // Focus and select text
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
    
    // Event handlers
    const closeModal = () => {
      document.body.removeChild(overlay);
    };
    
    const saveRename = async () => {
      const newName = input.value.trim();
      if (!newName || newName === currentName) {
        closeModal();
        return;
      }
      
      try {
        // Update in Firebase
        const db = window.firebaseDB;
        if (db) {
          await db.collection('lists').doc(id).update({
            name: newName,
            updatedAt: new Date()
          });
        }
        
        // Update local state
        if (item) {
          item.name = newName;
          item.updatedAt = new Date();
        }
        
        // Re-render the page
        applyFilters();
        
        // Show success message
        if (window.crm && window.crm.showToast) {
          window.crm.showToast(`List renamed to "${newName}"`);
        }
        
        closeModal();
      } catch (error) {
        console.error('Failed to rename list:', error);
        if (window.crm && window.crm.showToast) {
          window.crm.showToast('Failed to rename list', 'error');
        }
      }
    };
    
    cancelBtn.addEventListener('click', closeModal);
    saveBtn.addEventListener('click', saveRename);
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });
  }

  function showDeleteConfirmation(id, kind) {
    closeDeleteModal();
    const listArr = kind === 'people' ? state.peopleLists : state.accountLists;
    const item = (listArr || []).find(x => x.id === id);
    const name = item?.name || 'this list';

    // Build modal
    deleteModalEl = document.createElement('div');
    deleteModalEl.className = 'modal-overlay';
    deleteModalEl.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Delete List</h3>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete "<strong>${escapeHtml(name)}</strong>"?</p>
          <p>This action cannot be undone.</p>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-text" data-act="cancel">Cancel</button>
          <button type="button" class="btn-danger" data-act="delete">Delete</button>
        </div>
      </div>`;

    document.body.appendChild(deleteModalEl);

    // Wire actions
    deleteModalEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'cancel') {
        closeDeleteModal();
      } else if (act === 'delete') {
        handleDeleteConfirm(id, kind);
      }
    });

    // Close on overlay click
    deleteModalEl.addEventListener('click', (e) => {
      if (e.target === deleteModalEl) closeDeleteModal();
    });

    // Close on escape
    const onKey = (e) => { if (e.key === 'Escape') closeDeleteModal(); };
    document.addEventListener('keydown', onKey);
    removeDeleteHandler = () => {
      document.removeEventListener('keydown', onKey);
    };
  }

  async function handleDeleteConfirm(id, kind) {
    // Disable delete button during operation
    const deleteBtn = deleteModalEl?.querySelector('[data-act="delete"]');
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
    }

    try {
      // Delete from Firestore if available
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function' && id) {
        await window.firebaseDB.collection('lists').doc(id).delete();
      }
    } catch (err) {
      console.warn('Delete from Firestore failed:', err);
      // Continue with local deletion even if remote fails
    }

    // COST-EFFECTIVE: Remove from BackgroundListsLoader cache (prevents reappearing on navigation)
    if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.removeListLocally === 'function') {
      window.BackgroundListsLoader.removeListLocally(id);
    }

    // Remove from CacheManager cache
    if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
      window.CacheManager.deleteRecord('lists', id).catch(err => 
        console.warn('[ListsOverview] Failed to delete from cache:', err)
      );
    }

    // Remove from local state
    if (kind === 'people') {
      state.peopleLists = state.peopleLists.filter(item => item.id !== id);
    } else {
      state.accountLists = state.accountLists.filter(item => item.id !== id);
    }

    // Also invalidate list members cache if it exists
    if (window.CacheManager && typeof window.CacheManager.invalidateListCache === 'function') {
      window.CacheManager.invalidateListCache(id).catch(err => 
        console.warn('[ListsOverview] Failed to invalidate list members cache:', err)
      );
    }

    closeDeleteModal();
    applyFilters();

    // Show success toast if available
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('List deleted successfully');
    }
  }

  function closeDeleteModal() {
    if (removeDeleteHandler) { removeDeleteHandler(); removeDeleteHandler = null; }
    if (deleteModalEl && deleteModalEl.parentNode) deleteModalEl.parentNode.removeChild(deleteModalEl);
    deleteModalEl = null;
  }

  async function refreshCounts() {
    // Reload list data and refresh counts
    if (console.time) console.time('[ListsOverview] refreshCounts');
    state.loadedPeople = false;
    state.loadedAccounts = false;
    await ensureLoadedThenRender();
    if (console.timeEnd) console.timeEnd('[ListsOverview] refreshCounts');
  }

  // Navigation state tracking for back button functionality
  function getCurrentState() {
    return {
      page: 'lists',
      scroll: window.scrollY || 0,
      currentPage: 1, // Lists don't have pagination, but keeping for consistency
      filters: {
        name: qs('lists-filter-name')?.value || '',
        type: qs('lists-filter-type')?.value || '',
        owner: qs('lists-filter-owner')?.value || ''
      },
      searchTerm: qs('lists-quick-search')?.value || '',
      selectedItems: [], // Lists don't have selection, but keeping for consistency
      sortColumn: '',
      sortDirection: 'asc',
      timestamp: Date.now()
    };
  }

  // Listen for restore event from back button navigation
  if (!document._listsRestoreBound) {
    document.addEventListener('pc:lists-restore', (ev) => {
      try {
        const detail = ev && ev.detail ? ev.detail : {};
        console.log('[ListsOverview] Restoring state from back button:', detail);
        
        // CRITICAL FIX: Set flag to prevent live listener from overwriting during restore
        window._listsOverviewRestoring = true;
        
        // Restore search term
        if (detail.searchTerm && qs('lists-quick-search')) {
          qs('lists-quick-search').value = detail.searchTerm;
        }
        
        // Restore filters
        if (detail.filters) {
          if (detail.filters.name && qs('lists-filter-name')) {
            qs('lists-filter-name').value = detail.filters.name;
          }
          if (detail.filters.type && qs('lists-filter-type')) {
            qs('lists-filter-type').value = detail.filters.type;
          }
          if (detail.filters.owner && qs('lists-filter-owner')) {
            qs('lists-filter-owner').value = detail.filters.owner;
          }
        }
        
        // Re-apply filters with restored state
        applyFilters();
        
        // Restore scroll position
        const y = parseInt(detail.scroll || 0, 10);
        setTimeout(() => {
          try { window.scrollTo(0, y); } catch (_) {}
        }, 100);
        
        console.log('[ListsOverview] State restored successfully');
        
        // Clear restore flag after a delay to allow live listener to settle
        setTimeout(() => {
          window._listsOverviewRestoring = false;
          console.log('[ListsOverview] Restore flag cleared');
        }, 1500); // 1.5 seconds should be enough for debounced listener
      } catch (e) { 
        console.error('[ListsOverview] Error restoring state:', e);
        window._listsOverviewRestoring = false;
      }
    });
    document._listsRestoreBound = true;
  }

  // Inject CSS animations for list cards
  function injectCardAnimations() {
    if (document.getElementById('lists-card-animations')) return;
    const style = document.createElement('style');
    style.id = 'lists-card-animations';
    style.textContent = `
      /* Smooth card fade-in animation */
      @keyframes cardFadeIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      /* Smooth card fade-out animation with slide and collapse */
      @keyframes cardFadeOut {
        0% {
          opacity: 1;
          transform: translateX(0) translateY(0) scale(1);
          margin-bottom: var(--spacing-base, 16px);
          max-height: 500px;
          padding: var(--spacing-base, 16px);
        }
        50% {
          opacity: 0.3;
          transform: translateX(-30px) translateY(-5px) scale(0.98);
        }
        100% {
          opacity: 0;
          transform: translateX(-50px) translateY(-10px) scale(0.9);
          margin-bottom: 0;
          max-height: 0;
          padding-top: 0;
          padding-bottom: 0;
          overflow: hidden;
        }
      }
      
      /* Animation for remaining cards sliding over */
      @keyframes cardSlideOver {
        from {
          transform: translateX(0) translateY(0);
        }
        to {
          transform: translateX(0) translateY(0);
        }
      }
      
      .list-card.card-fade-in {
        animation: cardFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        opacity: 0;
      }
      
      .list-card.card-fade-out {
        animation: cardFadeOut 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        overflow: hidden;
        pointer-events: none;
        z-index: 1;
      }
      
      /* Ensure remaining cards smoothly move as deleted card collapses */
      #lists-grid.card-removing {
        /* Use subgrid or ensure smooth grid reflow */
        contain-layout: none;
      }
      
      /* Smooth transition for grid gap when cards collapse */
      #lists-grid.card-removing {
        transition: gap 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      /* Smooth transitions for remaining cards to slide over */
      #lists-grid {
        transition: grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      /* When cards are being removed, enable smooth transitions for remaining cards */
      #lists-grid.card-removing {
        /* Force a reflow to trigger smooth transitions */
        transform: translateZ(0);
      }
      
      /* Smooth repositioning for remaining cards during deletion */
      #lists-grid.card-removing .list-card:not(.card-fade-out) {
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), 
                    margin 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.2s ease,
                    box-shadow 0.2s ease;
      }
      
      /* Hover effects for cards */
      .list-card {
        transition: transform 0.2s ease, box-shadow 0.2s ease, margin 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      /* During deletion, maintain hover but with adjusted transition */
      #lists-grid.card-removing .list-card:not(.card-fade-out):hover {
        transform: translateY(-2px);
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), 
                    margin 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.2s ease,
                    box-shadow 0.2s ease;
      }
      
      .list-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
      }
      
      /* Smooth transitions for card content updates */
      .list-card-title,
      .list-card-count,
      .list-card-meta {
        transition: opacity 0.2s ease;
      }

      /* Toggle (People/Accounts) pill styling parity with Sequence Builder */
      #lists-view-toggle {
        display: inline-flex;
        background: var(--grey-700);
        border-radius: 999px;
        padding: 2px;
        gap: 8px;
      }
      #lists-view-toggle .toggle-btn {
        background: transparent;
        color: var(--text-primary);
        border: none;
        padding: 8px 14px;
        border-radius: 999px;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
      }
      #lists-view-toggle .toggle-btn.active {
        background: var(--orange-primary);
        color: #fff;
        border: 1px solid transparent;
      }
      #lists-view-toggle .toggle-btn.active:hover {
        background: var(--orange-primary);
        color: #fff;
        border-color: #ffffff; /* white outline on hover */
      }
      #lists-view-toggle .toggle-btn:hover:not(.active) {
        background: transparent;
        color: var(--text-primary);
      }

      /* Skeleton styles */
      .skeleton-card {
        pointer-events: none;
        position: relative;
        overflow: hidden;
      }
      .skeleton-text {
        background: var(--grey-600);
        border-radius: 4px;
        position: relative;
        overflow: hidden;
      }
      .skeleton-text::after {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        transform: translateX(-100%);
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0,
          rgba(255, 255, 255, 0.05) 20%,
          rgba(255, 255, 255, 0.1) 60%,
          rgba(255, 255, 255, 0)
        );
        animation: shimmer 2s infinite;
      }
      @keyframes shimmer {
        100% {
          transform: translateX(100%);
        }
      }
      .skeleton-title {
        height: 20px;
        width: 60%;
        margin-bottom: 8px;
      }
      .skeleton-count {
        height: 16px;
        width: 30%;
      }
      .skeleton-meta-item {
        height: 14px;
        width: 80%;
        margin-bottom: 6px;
      }
      .skeleton-btn {
        height: 32px;
        width: 60px;
        background: var(--grey-600);
        border-radius: 4px;
        display: inline-block;
        margin-right: 8px;
        position: relative;
        overflow: hidden;
      }
      .skeleton-btn::after {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        transform: translateX(-100%);
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0,
          rgba(255, 255, 255, 0.05) 20%,
          rgba(255, 255, 255, 0.1) 60%,
          rgba(255, 255, 255, 0)
        );
        animation: shimmer 2s infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // Global preloader function for list members
  async function preloadListMembersGlobal(lists) {
    if (!lists || !Array.isArray(lists) || lists.length === 0) return;
    
    console.log('[ListsOverview] Preloading members for', lists.length, 'lists...');
    try { window.listMembersCache = window.listMembersCache || {}; } catch (_) {}
    
    const tasks = [];
    for (const list of lists) {
      if (!list?.id) continue;
      
      // Skip if already cached
      if (window.listMembersCache && window.listMembersCache[list.id] && window.listMembersCache[list.id].loaded) continue;
      
      tasks.push(
        fetchListMembersSimple(list.id).then((members) => {
          try { 
            window.listMembersCache[list.id] = members;
            // Update count on the list object
            const kind = (list.kind || 'people').toLowerCase();
            if (kind === 'accounts') {
              list.count = members.accounts?.size || 0;
            } else {
              list.count = members.people?.size || 0;
            }
          } catch (_) {}
        })
      );
    }
    
    if (tasks.length) {
      try { await Promise.all(tasks); } catch (_) {}
      console.log('[ListsOverview] ✓ Preloaded members for', tasks.length, 'lists');
    }
  }
  
  // Simple function to fetch list members
  async function fetchListMembersSimple(listId) {
    const out = { people: new Set(), accounts: new Set(), loaded: false };
    if (!listId) return out;
    
    // CRITICAL FIX: Check in-memory cache ONLY (skip IndexedDB - it can be stale)
    // In-memory cache is updated in real-time, IndexedDB can lag behind
    if (window.listMembersCache && window.listMembersCache[listId] && window.listMembersCache[listId].loaded) {
      const cached = window.listMembersCache[listId];
      // Verify cache has actual data (not empty stale cache)
      if (cached.people instanceof Set || Array.isArray(cached.people)) {
        out.people = cached.people instanceof Set ? cached.people : new Set(cached.people || []);
        out.accounts = cached.accounts instanceof Set ? cached.accounts : new Set(cached.accounts || []);
        out.loaded = true;
        console.log(`[ListsOverview] ✓ Loaded members for ${listId} from in-memory cache`, { people: out.people.size, accounts: out.accounts.size });
        return out;
      }
    }
    
    // Always fetch from Firestore for accurate data (reasonable cost for correctness)
    if (!window.firebaseDB || typeof window.firebaseDB.collection !== 'function') return out;
    
    try {
      // Try subcollection first
      const subSnap = await window.firebaseDB.collection('lists').doc(listId).collection('members').get();
      if (subSnap && subSnap.docs && subSnap.docs.length) {
        subSnap.docs.forEach(d => {
          const m = d.data() || {};
          const t = (m.targetType || m.type || '').toLowerCase();
          const id = m.targetId || m.id || d.id;
          if (t === 'people' || t === 'contact' || t === 'contacts') out.people.add(id);
          else if (t === 'accounts' || t === 'account' || t === 'companies' || t === 'company') out.accounts.add(id);
        });
      } else {
        // Fallback to top-level listMembers
        const lmSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).limit(5000).get();
        lmSnap?.docs?.forEach(d => {
          const m = d.data() || {};
          const t = (m.targetType || m.type || '').toLowerCase();
          const id = m.targetId || m.id || d.id;
          if (t === 'people' || t === 'contact' || t === 'contacts') out.people.add(id);
          else if (t === 'accounts' || t === 'account' || t === 'companies' || t === 'company') out.accounts.add(id);
        });
      }
      out.loaded = true;
      
      // Update in-memory cache for fast subsequent access
      try {
        window.listMembersCache = window.listMembersCache || {};
        window.listMembersCache[listId] = out;
        console.log(`[ListsOverview] ✓ Updated in-memory cache for ${listId}`, { people: out.people.size, accounts: out.accounts.size });
      } catch (cacheErr) {
        console.warn('[ListsOverview] In-memory cache update failed:', cacheErr);
      }
    } catch (error) {
      console.warn('[ListsOverview] Failed to fetch members for list', listId, error);
    }
    
    return out;
  }

  // Expose globally for debugging
  window.__preloadListMembers = preloadListMembersGlobal;
  
  // Debug helper to check list ownership fields
  window.debugListOwnership = async () => {
    if (!window.firebaseDB) return console.log('Firebase not available');
    
    const email = getUserEmail();
    console.log('Debugging list ownership for email:', email);
    
    try {
      const [ownedSnap, assignedSnap, createdSnap, allSnap] = await Promise.all([
        window.firebaseDB.collection('lists').where('ownerId','==',email).get(),
        window.firebaseDB.collection('lists').where('assignedTo','==',email).get(),
        window.firebaseDB.collection('lists').where('createdBy','==',email).get(),
        window.firebaseDB.collection('lists').limit(10).get()
      ]);
      
      console.log('Ownership Debug Results:');
      console.log('- ownerId matches:', ownedSnap.docs.length);
      console.log('- assignedTo matches:', assignedSnap.docs.length);
      console.log('- createdBy matches:', createdSnap.docs.length);
      console.log('- total lists (sample):', allSnap.docs.length);
      
      if (allSnap.docs.length > 0) {
        console.log('Sample list fields:', allSnap.docs[0].data());
      }
    } catch (error) {
      console.error('Debug failed:', error);
    }
  };
  
  // Debug helper to check a specific list's member count
  window.debugListMembers = async (listId) => {
    if (!window.firebaseDB) return console.log('Firebase not available');
    if (!listId) return console.log('Please provide a listId');
    
    console.log(`🔍 Debugging members for list: ${listId}`);
    
    try {
      // Check subcollection
      let subCount = 0;
      try {
        const subSnap = await window.firebaseDB.collection('lists').doc(listId).collection('members').get();
        subCount = subSnap.docs.length;
        console.log(`📁 Subcollection (lists/${listId}/members):`, subCount, 'documents');
        if (subCount > 0) {
          console.log('   Sample member:', subSnap.docs[0].data());
        }
      } catch (e) {
        console.log('   Subcollection error:', e.message);
      }
      
      // Check top-level listMembers
      let topCount = 0;
      try {
        const topSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).get();
        topCount = topSnap.docs.length;
        console.log(`📋 Top-level (listMembers where listId==${listId}):`, topCount, 'documents');
        if (topCount > 0) {
          const sample = topSnap.docs[0].data();
          console.log('   Sample member:', sample);
          console.log('   Has ownerId?', !!sample.ownerId);
          console.log('   Has userId?', !!sample.userId);
        }
      } catch (e) {
        console.log('   Top-level query error:', e.message);
        console.log('   This is expected for non-admins if listMembers lack ownership fields');
      }
      
      // Check cache
      const cached = window.listMembersCache?.[listId];
      console.log(`💾 In-memory cache:`, cached ? {
        loaded: cached.loaded,
        people: cached.people?.size || 0,
        accounts: cached.accounts?.size || 0
      } : 'not cached');
      
      console.log('\n📊 Summary:');
      console.log(`   Subcollection: ${subCount} members`);
      console.log(`   Top-level: ${topCount} members`);
      console.log(`   Cache: ${cached ? (cached.people?.size || 0) + (cached.accounts?.size || 0) : 0} members`);
      console.log('\n💡 Recommendation:', subCount > 0 ? 'Using subcollections ✅' : 'Should migrate to subcollections');
      
    } catch (error) {
      console.error('Debug failed:', error);
    }
  };
  
  // ONE-TIME FIX: Add missing ownership fields to all lists
  window.fixListOwnership = async () => {
    if (!window.firebaseDB) return console.log('Firebase not available');
    
    const email = getUserEmail();
    console.log('🔧 Fixing list ownership fields for:', email);
    console.log('This will add ownerId, assignedTo, and createdBy to all your lists');
    
    if (!confirm('This will update all lists that are missing ownership fields. Continue?')) {
      return console.log('Cancelled by user');
    }
    
    try {
      // Get all lists that you have access to (via any ownership field)
      const [ownedSnap, assignedSnap, createdSnap] = await Promise.all([
        window.firebaseDB.collection('lists').where('ownerId','==',email).get(),
        window.firebaseDB.collection('lists').where('assignedTo','==',email).get(),
        window.firebaseDB.collection('lists').where('createdBy','==',email).get()
      ]);
      
      // Merge all lists using a Map to deduplicate
      const listsMap = new Map();
      ownedSnap.docs.forEach(doc => listsMap.set(doc.id, doc));
      assignedSnap.docs.forEach(doc => { if (!listsMap.has(doc.id)) listsMap.set(doc.id, doc); });
      createdSnap.docs.forEach(doc => { if (!listsMap.has(doc.id)) listsMap.set(doc.id, doc); });
      
      const allLists = Array.from(listsMap.values());
      console.log(`📋 Found ${allLists.length} total lists accessible to you`);
      
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      
      for (const listDoc of allLists) {
        const listData = listDoc.data();
        const updates = {};
        let needsUpdate = false;
        
        // Add ownerId if missing
        if (!listData.ownerId) {
          updates.ownerId = email;
          needsUpdate = true;
        }
        
        // Add assignedTo if missing
        if (!listData.assignedTo) {
          updates.assignedTo = email;
          needsUpdate = true;
        }
        
        // Add createdBy if missing
        if (!listData.createdBy) {
          updates.createdBy = email;
          needsUpdate = true;
        }
        
        // Add updatedAt
        if (needsUpdate) {
          updates.updatedAt = window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date();
        }
        
        if (needsUpdate) {
          try {
            await listDoc.ref.update(updates);
            console.log(`✅ Updated "${listData.name}" with fields:`, Object.keys(updates));
            updated++;
          } catch (error) {
            console.error(`❌ Failed to update "${listData.name}":`, error);
            errors++;
          }
        } else {
          console.log(`⏭️ Skipped "${listData.name}" (already has all ownership fields)`);
          skipped++;
        }
      }
      
      console.log(`\n🎉 Migration complete!`);
      console.log(`  ✅ Updated: ${updated}`);
      console.log(`  ⏭️ Skipped: ${skipped} (already correct)`);
      console.log(`  ❌ Errors: ${errors}`);
      
      if (updated > 0) {
        console.log('\n🔄 Refreshing lists page...');
        // Force reload
        state.loadedPeople = false;
        state.loadedAccounts = false;
        await ensureLoadedThenRender();
        console.log('✅ Lists page refreshed');
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
    }
  };
  
  // CRITICAL FIX: Sync count field with recordCount (one-time fix for data inconsistency)
  window.syncCountFields = async () => {
    if (!window.firebaseDB) return console.log('Firebase not available');
    
    console.log('🔄 Syncing count and recordCount fields...');
    
    try {
      const email = getUserEmail();
      const [ownedSnap, assignedSnap, createdSnap] = await Promise.all([
        window.firebaseDB.collection('lists').where('ownerId','==',email).get(),
        window.firebaseDB.collection('lists').where('assignedTo','==',email).get(),
        window.firebaseDB.collection('lists').where('createdBy','==',email).get()
      ]);
      
      const map = new Map();
      ownedSnap.docs.forEach(d=>map.set(d.id, d));
      assignedSnap.docs.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
      createdSnap.docs.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
      
      const allLists = Array.from(map.values());
      console.log(`📋 Found ${allLists.length} lists to sync`);
      
      let updated = 0;
      let skipped = 0;
      
      for (const listDoc of allLists) {
        const listData = listDoc.data();
        const recordCount = listData.recordCount || 0;
        const count = listData.count || 0;
        
        if (count !== recordCount) {
          try {
            await listDoc.ref.update({
              count: recordCount,
              updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
            });
            console.log(`✅ "${listData.name}": count ${count} → ${recordCount}`);
            updated++;
          } catch (error) {
            console.error(`❌ Failed to update "${listData.name}":`, error);
          }
        } else {
          console.log(`⏭️ "${listData.name}": already in sync (${count})`);
          skipped++;
        }
      }
      
      console.log(`\n🎉 Sync complete!`);
      console.log(`  ✅ Updated: ${updated}`);
      console.log(`  ⏭️ Skipped: ${skipped}`);
      
      if (updated > 0) {
        state.loadedPeople = false;
        state.loadedAccounts = false;
        await ensureLoadedThenRender();
        console.log('✅ Lists page refreshed');
      }
    } catch (error) {
      console.error('❌ Sync failed:', error);
    }
  };
  
  // ONE-TIME FIX: Sync recordCount with actual member counts
  window.syncListCounts = async () => {
    if (!window.firebaseDB) return console.log('Firebase not available');
    
    console.log('🔄 Starting list count sync...');
    
    try {
      // Get all lists for current user
      const email = getUserEmail();
      let listsSnap;
      
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: get scoped lists
        const [ownedSnap, assignedSnap, createdSnap] = await Promise.all([
          window.firebaseDB.collection('lists').where('ownerId','==',email).get(),
          window.firebaseDB.collection('lists').where('assignedTo','==',email).get(),
          window.firebaseDB.collection('lists').where('createdBy','==',email).get()
        ]);
        
        const map = new Map();
        ownedSnap.forEach(d=>map.set(d.id, d));
        assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
        createdSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
        listsSnap = { docs: Array.from(map.values()) };
      } else {
        // Admin: get all lists
        listsSnap = await window.firebaseDB.collection('lists').get();
      }
      
      console.log(`📋 Found ${listsSnap.docs.length} lists to sync`);
      
      let updated = 0;
      let errors = 0;
      
      for (const listDoc of listsSnap.docs) {
        const listId = listDoc.id;
        const listData = listDoc.data();
        
        try {
          // Count actual members
          let peopleCount = 0;
          let accountsCount = 0;
          
          // Try subcollection first
          try {
            const subSnap = await window.firebaseDB.collection('lists').doc(listId).collection('members').get();
            if (subSnap && subSnap.docs && subSnap.docs.length) {
              subSnap.docs.forEach(d => {
                const m = d.data() || {};
                const t = (m.targetType || m.type || '').toLowerCase();
                if (t === 'people' || t === 'contact' || t === 'contacts') peopleCount++;
                else if (t === 'accounts' || t === 'account') accountsCount++;
              });
            }
          } catch (_) {}
          
          // Fallback to top-level listMembers
          if (peopleCount === 0 && accountsCount === 0) {
            try {
              const lmSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).get();
              lmSnap?.docs?.forEach(d => {
                const m = d.data() || {};
                const t = (m.targetType || m.type || '').toLowerCase();
                if (t === 'people' || t === 'contact' || t === 'contacts') peopleCount++;
                else if (t === 'accounts' || t === 'account') accountsCount++;
              });
            } catch (_) {}
          }
          
          const totalCount = peopleCount + accountsCount;
          const currentRecordCount = listData.recordCount || 0;
          
          if (totalCount !== currentRecordCount) {
            console.log(`📊 ${listData.name}: ${currentRecordCount} → ${totalCount} (${peopleCount} people, ${accountsCount} accounts)`);
            
            await window.firebaseDB.collection('lists').doc(listId).update({
              recordCount: totalCount,
              updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp || new Date()
            });
            
            updated++;
          } else {
            console.log(`✅ ${listData.name}: ${totalCount} (already correct)`);
          }
          
        } catch (error) {
          console.error(`❌ Failed to sync ${listData.name}:`, error);
          errors++;
        }
      }
      
      console.log(`🎉 Sync complete! Updated: ${updated}, Errors: ${errors}`);
      
      // Refresh the lists overview
      if (window.ListsOverview && window.ListsOverview.refreshCounts) {
        window.ListsOverview.refreshCounts();
      }
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
    }
  };

  // Listen for background lists loader events
  document.addEventListener('pc:lists-loaded', async () => {
    console.log('[ListsOverview] Background lists loaded, refreshing data...');
    // Reload both kinds
    state.loadedPeople = false;
    state.loadedAccounts = false;
    await ensureLoadedThenRender();
  });
  
  // Invalidate caches on account create/update events (handles newly added accounts to lists)
  document.addEventListener('pc:account-created', async (event) => {
    try {
      const detail = event?.detail || {};
      const listId = detail.listId || detail.targetListId || null;
      if (listId && window.listMembersCache) {
        delete window.listMembersCache[listId];
        console.log('[ListsOverview] ✓ Cleared in-memory cache for list (account-created):', listId);
      }
      // Force a lightweight reload of lists
      state.loadedAccounts = false;
      await ensureLoadedThenRender();
    } catch (e) {
      console.warn('[ListsOverview] account-created handler failed:', e);
    }
  });
  
  document.addEventListener('pc:account-updated', async (event) => {
    try {
      const detail = event?.detail || {};
      const listId = detail.listId || detail.targetListId || null;
      if (listId && window.listMembersCache) {
        delete window.listMembersCache[listId];
        console.log('[ListsOverview] ✓ Cleared in-memory cache for list (account-updated):', listId);
      }
      // Refresh account lists view if currently showing accounts
      if (state.kind === 'accounts') {
        state.loadedAccounts = false;
        await ensureLoadedThenRender();
      }
    } catch (e) {
      console.warn('[ListsOverview] account-updated handler failed:', e);
    }
  });
  
  // Helper to clear caches manually from console if needed
  window.clearListCaches = async function(listId) {
    try {
      if (listId && window.listMembersCache) {
        delete window.listMembersCache[listId];
        console.log('[ListsOverview] Cleared in-memory members cache for list:', listId);
      } else {
        window.listMembersCache = {};
        console.log('[ListsOverview] Cleared all in-memory members cache');
      }
      if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        await window.CacheManager.invalidate('lists');
        console.log('[ListsOverview] Invalidated IndexedDB lists cache');
      }
      state.loadedPeople = false;
      state.loadedAccounts = false;
      await ensureLoadedThenRender();
      console.log('[ListsOverview] Reload complete after cache clear');
    } catch (e) {
      console.error('[ListsOverview] Failed to clear caches:', e);
    }
  };
  
  // CRITICAL FIX: Listen for bulk import completion to invalidate stale caches
  document.addEventListener('pc:bulk-import-complete', async (event) => {
    try {
      const { listId, type } = event.detail || {};
      console.log('[ListsOverview] Bulk import complete, invalidating caches for:', { listId, type });
      
      // Clear in-memory cache for this list
      if (listId && window.listMembersCache) {
        delete window.listMembersCache[listId];
        console.log('[ListsOverview] ✓ Cleared in-memory cache for', listId);
      }
      
      // Force reload of list data
      state.loadedPeople = false;
      state.loadedAccounts = false;
      await ensureLoadedThenRender();
      
      console.log('[ListsOverview] ✓ Reloaded lists after bulk import');
    } catch (e) {
      console.error('[ListsOverview] Error handling bulk import complete:', e);
    }
  });

  // Listen for new list creation events
  document.addEventListener('pc:list-created', (event) => {
    try {
      const { id, list, kind } = event.detail || {};
      if (!id || !list || !kind) return;
      
      console.log('[ListsOverview] New list created:', { id, name: list.name, kind });
      
      // Add to appropriate state array
      if (kind === 'people') {
        state.peopleLists = [list, ...state.peopleLists];
        state.loadedPeople = true;
      } else if (kind === 'accounts') {
        state.accountLists = [list, ...state.accountLists];
        state.loadedAccounts = true;
      }
      
      // Re-render if we're viewing the correct kind
      if (state.kind === kind) {
        applyFilters();
      }
      
      console.log('[ListsOverview] List added to UI immediately');
    } catch (error) {
      console.error('[ListsOverview] Error handling new list creation:', error);
    }
  });
  
  // Listen for list count update events (from list-detail page deletions)
  document.addEventListener('pc:lists-count-updated', (event) => {
    try {
      const { listId, deletedCount } = event.detail || {};
      if (!listId) return;
      
      console.log('[ListsOverview] List count updated:', { listId, deletedCount });
      
      // COST-EFFECTIVE: Update local state and BackgroundListsLoader cache (no Firestore reads)
      const updateListCount = (list) => {
        if (list.id === listId) {
          const calculatedCount = Math.max(0, (list.count || list.recordCount || 0) - (deletedCount || 0));
          list.count = calculatedCount;
          list.recordCount = calculatedCount;
          
          // Update BackgroundListsLoader cache locally (cost-effective)
          if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
            window.BackgroundListsLoader.updateListCountLocally(listId, calculatedCount);
          }
          
          return true;
        }
        return false;
      };
      
      let updated = false;
      for (const list of state.peopleLists) {
        if (updateListCount(list)) {
          updated = true;
          break;
        }
      }
      if (!updated) {
        for (const list of state.accountLists) {
          if (updateListCount(list)) {
            updated = true;
            break;
          }
        }
      }
      
      if (updated) {
        // Re-render to show updated count
        applyFilters();
        console.log('[ListsOverview] Updated list count immediately (no Firestore reads)');
      }
    } catch (error) {
      console.error('[ListsOverview] Error handling list count update:', error);
    }
  });
  
  // Listen for list count update events (alternative event name)
  document.addEventListener('pc:list-count-updated', (event) => {
    try {
      const { listId, deletedCount, newCount, kind } = event.detail || {};
      if (!listId) return;
      
      console.log('[ListsOverview] List count updated (alt):', { listId, deletedCount, newCount, kind });
      
      // Calculate final count first (before updating lists)
      let finalCount = null;
      const allLists = [...state.peopleLists, ...state.accountLists];
      const foundList = allLists.find(l => l.id === listId);
      if (foundList) {
        finalCount = typeof newCount === 'number' ? newCount : 
          (deletedCount ? Math.max(0, (foundList.count || foundList.recordCount || 0) - deletedCount) : 
          (foundList.count || foundList.recordCount || 0));
      } else if (typeof newCount === 'number') {
        finalCount = newCount;
      }
      
      // COST-EFFECTIVE: Update local state and BackgroundListsLoader cache (no Firestore reads)
      const updateListCount = (list) => {
        if (list.id === listId) {
          // CRITICAL FIX: Use newCount if provided (actual count from Firestore), otherwise calculate
          const count = typeof newCount === 'number' ? newCount : 
            (deletedCount ? Math.max(0, (list.count || list.recordCount || 0) - deletedCount) : 
            (list.count || list.recordCount || 0));
          
          list.count = count;
          list.recordCount = count;
          
          // Update BackgroundListsLoader cache locally (cost-effective)
          if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
            window.BackgroundListsLoader.updateListCountLocally(listId, count);
          }
          
          // Update CacheManager cache (cost-effective: IndexedDB write only)
          if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
            window.CacheManager.updateRecord('lists', listId, {
              recordCount: count,
              count: count,
              updatedAt: new Date()
            }).catch(err => console.warn('[ListsOverview] CacheManager update failed:', err));
          }
          
          return true;
        }
        return false;
      };
      
      let updated = false;
      // Check the appropriate list array based on kind
      const targetLists = (kind === 'accounts') ? state.accountLists : state.peopleLists;
      for (const list of targetLists) {
        if (updateListCount(list)) {
          updated = true;
          break;
        }
      }
      
      // If not found in target lists, check the other array (in case kind is wrong)
      if (!updated) {
        const otherLists = (kind === 'accounts') ? state.peopleLists : state.accountLists;
        for (const list of otherLists) {
          if (updateListCount(list)) {
            updated = true;
            break;
          }
        }
      }
      
      if (updated) {
        // Re-render to show updated count
        applyFilters();
        console.log('[ListsOverview] ✓ Updated list count immediately from event (no Firestore reads):', finalCount || newCount || 'unknown');
      } else {
        console.warn('[ListsOverview] List not found in current state:', listId);
        // List not in current view - refresh from BackgroundListsLoader
        if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.getListsData === 'function') {
          const listsData = window.BackgroundListsLoader.getListsData() || [];
          const updatedList = listsData.find(l => l.id === listId);
          if (updatedList) {
            // Update BackgroundListsLoader cache
            if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
              const finalCount = typeof newCount === 'number' ? newCount : (updatedList.count || updatedList.recordCount || 0);
              window.BackgroundListsLoader.updateListCountLocally(listId, finalCount);
            }
            // Reload lists for current kind
            loadLists(state.kind).catch(err => console.warn('[ListsOverview] Failed to reload lists:', err));
          }
        }
      }
    } catch (error) {
      console.error('[ListsOverview] Error handling list count update (alt):', error);
    }
  });

  // Expose ListsOverview API for other pages
  window.ListsOverview = {
    refreshCounts: refreshCounts,
    getState: () => state
  };

  // Initialize
  if (!initDom()) return;
  injectCardAnimations();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'people' || saved === 'accounts') state.kind = saved; // persist selection
  } catch {}
  attachEvents();
  updateToggleState();
  // CRITICAL FIX: Don't call applyFilters() before data is loaded - it will render empty
  // Instead, let ensureLoadedThenRender() call applyFilters() after data is ready
  ensureLoadedThenRender();
  startLiveListsListeners();
  
  // Listen for list count updates from bulk import
  if (!document._listsUpdateListenerBound) {
    document.addEventListener('pc:list-updated', (e) => {
      try {
        const { id, recordCount, targetType, isActualCount } = e.detail || {};
        if (!id || recordCount === undefined || recordCount === null) return;
        
        console.log('[ListsOverview] Received pc:list-updated event:', { id, recordCount, targetType, isActualCount });
        
        // Find the list in current state
        const allLists = [...state.peopleLists, ...state.accountLists];
        const list = allLists.find(l => l.id === id);
        
        if (list) {
          // CRITICAL FIX: If isActualCount flag is set, use recordCount as actual count
          // Otherwise, treat as increment for backward compatibility
          const currentCount = list.recordCount || list.count || 0;
          const newCount = isActualCount ? recordCount : (currentCount + recordCount);
          
          list.recordCount = newCount;
          list.count = newCount;
          list.updatedAt = new Date();
          
          // Update BackgroundListsLoader cache (cost-effective)
          if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
            window.BackgroundListsLoader.updateListCountLocally(id, newCount);
          }
          
          // Update CacheManager cache (cost-effective: IndexedDB write only)
          if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
            window.CacheManager.updateRecord('lists', id, {
              recordCount: newCount,
              count: newCount,
              updatedAt: new Date()
            }).catch(err => console.warn('[ListsOverview] CacheManager update failed:', err));
          }
          
          console.log('[ListsOverview] ✓ Updated list count locally:', { id, oldCount: currentCount, newCount, isActualCount });
          
          // Re-render the affected list card
          renderFilteredItems(state.kind === 'people' ? state.peopleLists : state.accountLists);
        } else {
          // List not in current view - reload from BackgroundListsLoader
          console.log('[ListsOverview] List not in current view, refreshing from BackgroundListsLoader...');
          const listsData = window.BackgroundListsLoader?.getListsData() || [];
          const updatedList = listsData.find(l => l.id === id);
          
          if (updatedList) {
            // Update BackgroundListsLoader cache if needed
            if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
              const currentCount = updatedList.recordCount || updatedList.count || 0;
              const newCount = isActualCount ? recordCount : (currentCount + recordCount);
              window.BackgroundListsLoader.updateListCountLocally(id, newCount);
            }
            
            // Reload lists for current kind to pick up the update
            loadLists(state.kind).catch(err => console.warn('[ListsOverview] Failed to reload lists:', err));
          }
        }
      } catch (err) {
        console.warn('[ListsOverview] Error handling pc:list-updated:', err);
      }
    });
    document._listsUpdateListenerBound = true;
    console.log('[ListsOverview] ✓ Bound pc:list-updated event listener');
  }
})();

// ===== Preloader: cache members for instant detail opening =====
(function () {
  function toSafeLower(s) { return (s || '').toString().trim().toLowerCase(); }

  async function fetchMembersForList(listId) {
    const out = { people: new Set(), accounts: new Set(), loaded: false };
    if (console.time) console.time(`[ListsOverview] preload fetch ${listId}`);
    if (!listId) return out;
    
    // CRITICAL FIX: Check in-memory cache ONLY (skip IndexedDB - it can be stale)
    if (window.listMembersCache && window.listMembersCache[listId] && window.listMembersCache[listId].loaded) {
      const cached = window.listMembersCache[listId];
      // Verify cache has actual data (not empty stale cache)
      if (cached.people instanceof Set || Array.isArray(cached.people)) {
        out.people = cached.people instanceof Set ? cached.people : new Set(cached.people || []);
        out.accounts = cached.accounts instanceof Set ? cached.accounts : new Set(cached.accounts || []);
        out.loaded = true;
        if (console.timeEnd) console.timeEnd(`[ListsOverview] preload fetch ${listId}`);
        console.log(`[ListsOverview] ✓ Loaded members for ${listId} from in-memory cache`, { people: out.people.size, accounts: out.accounts.size });
        return out;
      }
    }
    
    // Always fetch from Firestore for accurate data
    if (!window.firebaseDB || typeof window.firebaseDB.collection !== 'function') {
      if (console.timeEnd) console.timeEnd(`[ListsOverview] preload fetch ${listId}`);
      return out;
    }
    
    let gotAny = false;
    // Prefer subcollection lists/{id}/members
    try {
      const subSnap = await window.firebaseDB.collection('lists').doc(listId).collection('members').get();
      if (subSnap && subSnap.docs && subSnap.docs.length) {
        gotAny = true;
        subSnap.docs.forEach(d => {
          const m = d.data() || {};
          const t = toSafeLower(m.targetType || m.type);
          const id = m.targetId || m.id || d.id;
          if (t === 'people' || t === 'contact' || t === 'contacts') out.people.add(id);
          else if (t === 'accounts' || t === 'account' || t === 'companies' || t === 'company') out.accounts.add(id);
        });
        console.debug('[ListsOverview] preload subcollection', { listId, docs: subSnap.docs.length, people: out.people.size, accounts: out.accounts.size });
      }
    } catch (_) {}
    // Fallback top-level listMembers
    if (!gotAny) {
      try {
        const lmSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).limit(5000).get();
        lmSnap?.docs?.forEach(d => {
          const m = d.data() || {};
          const t = toSafeLower(m.targetType || m.type);
          const id = m.targetId || m.id || d.id;
          if (t === 'people' || t === 'contact' || t === 'contacts') out.people.add(id);
          else if (t === 'accounts' || t === 'account' || t === 'companies' || t === 'company') out.accounts.add(id);
        });
        console.debug('[ListsOverview] preload top-level', { listId, docs: lmSnap?.docs?.length || 0, people: out.people.size, accounts: out.accounts.size });
      } catch (_) {}
    }
    out.loaded = true;
    
    // Update in-memory cache for fast subsequent access
    try {
      window.listMembersCache = window.listMembersCache || {};
      window.listMembersCache[listId] = out;
      console.log(`[ListsOverview] ✓ Updated in-memory cache for ${listId}`, { people: out.people.size, accounts: out.accounts.size });
    } catch (cacheErr) {
      console.warn('[ListsOverview] In-memory cache update failed:', cacheErr);
    }
    
    if (console.timeEnd) console.timeEnd(`[ListsOverview] preload fetch ${listId}`);
    return out;
  }

  async function preloadMembersForLists(items) {
    if (console.time) console.time('[ListsOverview] preloadMembersForLists');
    try { window.listMembersCache = window.listMembersCache || {}; } catch (_) {}
    const tasks = [];
    for (const it of (items || [])) {
      if (!it?.id) continue;
      // Skip if already cached
      if (window.listMembersCache && window.listMembersCache[it.id] && window.listMembersCache[it.id].loaded) continue;
      tasks.push(
        fetchMembersForList(it.id).then((res) => {
          try { window.listMembersCache[it.id] = res; } catch (_) {}
        })
      );
    }
    if (tasks.length) {
      console.debug('[ListsOverview] preload starting', { lists: tasks.length });
      try { await Promise.all(tasks); } catch (_) {}
      console.debug('[ListsOverview] preload done', { cached: Object.keys(window.listMembersCache || {}).length });
    }
    if (console.timeEnd) console.timeEnd('[ListsOverview] preloadMembersForLists');
  }

  // Expose for debugging/tests
  try {
    window.__preloadListMembers = preloadMembersForLists;
  } catch (_) {}
})();
