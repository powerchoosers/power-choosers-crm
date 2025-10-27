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

    let newItem = { name, kind, recordCount: 0, createdAt: new Date(), updatedAt: new Date() };
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
        if (!newView || newView === state.kind) return;
        
        // Update active styles
        viewToggle.querySelectorAll('.toggle-btn').forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        
        // Update state and reload
        state.kind = newView;
        try { localStorage.setItem(STORAGE_KEY, state.kind); } catch {}
        ensureLoadedThenRender();
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
    if (state.kind === 'people' && !state.loadedPeople) {
      await loadLists('people');
    } else if (state.kind === 'accounts' && !state.loadedAccounts) {
      await loadLists('accounts');
    }
    applyFilters();
    updateToggleState();
  }

  async function loadLists(kind) {
    // Try to load from BackgroundListsLoader first, then Firestore fallback
    try {
      if (console.time) console.time(`[ListsOverview] loadLists ${kind}`);
      
      // Use BackgroundListsLoader (cache-first)
      if (window.BackgroundListsLoader) {
        const listsData = window.BackgroundListsLoader.getListsData() || [];
        // Filter by kind client-side
        const filteredLists = listsData.filter(list => {
          const listKind = (list.kind || list.type || list.listType || '').toLowerCase();
          if (kind === 'people') {
            return listKind === 'people' || listKind === 'person' || listKind === 'contacts' || listKind === 'contact';
          } else {
            return listKind === 'accounts' || listKind === 'account' || listKind === 'companies' || listKind === 'company';
          }
        });
        
        console.log('[ListsOverview] Loaded', filteredLists.length, 'lists from BackgroundListsLoader for kind:', kind);
        
        // Ensure global cache exists
        try { window.listMembersCache = window.listMembersCache || {}; } catch (_) {}

        // Preload members for all lists in this kind and compute counts
        if (typeof window.__preloadListMembers === 'function') {
          await window.__preloadListMembers(filteredLists);
        } else {
          // Fallback: load members individually
          for (const list of filteredLists) {
            await loadListMembers(list.id);
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
        render();
        return;
      }
      
      // Fallback to direct Firestore query
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Primary query: filter by kind on server if available
        let query = window.firebaseDB.collection('lists');
        if (query.where) query = query.where('kind', '==', kind);
        let snap = await (query.limit ? query.limit(200).get() : query.get());
        let items = (snap && snap.docs) ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

        // Fallback: if nothing returned, fetch recent docs without server-side kind filter
        // and filter client-side using flexible field names: kind | type | listType.
        if (!items.length) {
          try {
            const email = getUserEmail();
            let altSnap;
            if (!isAdmin() && email) {
              // Non-admin: use scoped query
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('lists').where('ownerId','==',email).limit(200).get(),
                window.firebaseDB.collection('lists').where('assignedTo','==',email).limit(200).get()
              ]);
              const map = new Map();
              ownedSnap.forEach(d=>map.set(d.id, d));
              assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, d); });
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
            item.count = k === 'accounts' ? (cache.accounts?.size || 0) : (cache.people?.size || 0);
          } else {
            item.count = typeof item.count === 'number' ? item.count : 0;
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
      console.warn('Failed to load lists for kind', kind, err);
      if (kind === 'people') state.loadedPeople = true; else state.loadedAccounts = true;
    }
  }

  // Live updates for lists collection so cards refresh immediately
  let _unsubListsPeople = null;
  let _unsubListsAccounts = null;
  function startLiveListsListeners() {
    try {
      if (!window.firebaseDB || !window.firebaseDB.collection) return;
      const col = window.firebaseDB.collection('lists');
      // People lists
      if (_unsubListsPeople) { try { _unsubListsPeople(); } catch(_) {} _unsubListsPeople = null; }
      _unsubListsPeople = col.where ? col.where('kind', '==', 'people').onSnapshot((snap) => {
        try {
          const items = [];
          snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
          state.peopleLists = items;
          state.loadedPeople = true;
          if (state.kind === 'people') render();
        } catch (_) { /* noop */ }
      }) : null;
      // Account lists
      if (_unsubListsAccounts) { try { _unsubListsAccounts(); } catch(_) {} _unsubListsAccounts = null; }
      _unsubListsAccounts = col.where ? col.where('kind', '==', 'accounts').onSnapshot((snap) => {
        try {
          const items = [];
          snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
          state.accountLists = items;
          state.loadedAccounts = true;
          if (state.kind === 'accounts') render();
        } catch (_) { /* noop */ }
      }) : null;
    } catch (e) {
      console.warn('[ListsOverview] Failed to start live listeners', e);
    }
  }

  function applyFilters() {
    const nameFilter = qs('lists-filter-name')?.value?.toLowerCase() || '';
    const typeFilter = qs('lists-filter-type')?.value || '';
    const ownerFilter = qs('lists-filter-owner')?.value?.toLowerCase() || '';
    
    let items = state.kind === 'people' ? state.peopleLists : state.accountLists;
    
    // Apply filters
    items = items.filter(item => {
      const name = (item.name || '').toLowerCase();
      const kind = item.kind || item.type || '';
      const owner = (item.createdBy || item.owner || '').toLowerCase();
      
      return (!nameFilter || name.includes(nameFilter)) &&
             (!typeFilter || kind === typeFilter) &&
             (!ownerFilter || owner.includes(ownerFilter));
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
    
    renderFilteredItems(items);
  }

  function renderFilteredItems(items) {
    const hasAny = Array.isArray(items) && items.length > 0;
    const isLoading = state.kind === 'people' ? !state.loadedPeople : !state.loadedAccounts;

    if (!els.listContainer || !els.emptyState) return;

    // Instant paint: if we already have cached lists from a prior view, render them even while reloading
    if (isLoading) {
      const cached = state.kind === 'people' ? state.peopleLists : state.accountLists;
      if (Array.isArray(cached) && cached.length) {
        // Fall through to normal render using cached items
      } else {
        els.emptyState.hidden = true;
        // Keep previous UI; avoid heavy loading card that causes flash
        els.listContainer.innerHTML = els.listContainer.innerHTML || '';
        return;
      }
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
    
    // Remove cards that no longer exist with fade-out animation
    existingCards.forEach(card => {
      const id = card.getAttribute('data-id');
      if (!newIds.includes(id)) {
        card.classList.add('card-fade-out');
        card.addEventListener('animationend', () => {
          card.remove();
        }, { once: true });
      }
    });
    
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
    const count = typeof item.count === 'number' ? item.count : (item.recordCount || 0);
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

  async function handleOpenList(id, kind) {
    const listArr = kind === 'people' ? state.peopleLists : state.accountLists;
    const item = (listArr || []).find(x => x.id === id);
    const name = item?.name || 'List';
    
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

    // Remove from local state
    if (kind === 'people') {
      state.peopleLists = state.peopleLists.filter(item => item.id !== id);
    } else {
      state.accountLists = state.accountLists.filter(item => item.id !== id);
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
      } catch (e) { 
        console.error('[ListsOverview] Error restoring state:', e);
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
      
      /* Smooth card fade-out animation */
      @keyframes cardFadeOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-10px) scale(0.95);
        }
      }
      
      .list-card.card-fade-in {
        animation: cardFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        opacity: 0;
      }
      
      .list-card.card-fade-out {
        animation: cardFadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      
      /* Hover effects for cards */
      .list-card {
        transition: transform 0.2s ease, box-shadow 0.2s ease;
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
    `;
    document.head.appendChild(style);
  }

  // Expose API for other modules
  window.ListsOverview = {
    refreshCounts: refreshCounts,
    getCurrentState: getCurrentState
  };

  // Listen for background lists loader events
  document.addEventListener('pc:lists-loaded', async () => {
    console.log('[ListsOverview] Background lists loaded, refreshing data...');
    // Reload both kinds
    state.loadedPeople = false;
    state.loadedAccounts = false;
    await ensureLoadedThenRender();
  });

  // Initialize
  if (!initDom()) return;
  injectCardAnimations();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'people' || saved === 'accounts') state.kind = saved; // persist selection
  } catch {}
  attachEvents();
  updateToggleState();
  applyFilters(); // Show loading state immediately
  ensureLoadedThenRender();
  startLiveListsListeners();
})();

// ===== Preloader: cache members for instant detail opening =====
(function () {
  function toSafeLower(s) { return (s || '').toString().trim().toLowerCase(); }

  async function fetchMembersForList(listId) {
    const out = { people: new Set(), accounts: new Set(), loaded: false };
    if (console.time) console.time(`[ListsOverview] preload fetch ${listId}`);
    if (!listId || !window.firebaseDB || typeof window.firebaseDB.collection !== 'function') return out;
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
          else if (t === 'accounts' || t === 'account') out.accounts.add(id);
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
          else if (t === 'accounts' || t === 'account') out.accounts.add(id);
        });
        console.debug('[ListsOverview] preload top-level', { listId, docs: lmSnap?.docs?.length || 0, people: out.people.size, accounts: out.accounts.size });
      } catch (_) {}
    }
    out.loaded = true;
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
