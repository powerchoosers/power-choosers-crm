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

    els.switchBtn = qs('lists-switch-btn');
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

    return true;
  }

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
    render();
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
    if (els.switchBtn) {
      els.switchBtn.addEventListener('click', () => {
        state.kind = state.kind === 'people' ? 'accounts' : 'people';
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
  }

  async function ensureLoadedThenRender() {
    if (state.kind === 'people' && !state.loadedPeople) {
      await loadLists('people');
    } else if (state.kind === 'accounts' && !state.loadedAccounts) {
      await loadLists('accounts');
    }
    render();
    updateSwitchLabel();
  }

  async function loadLists(kind) {
    // Try to load from Firestore if available, otherwise keep empty
    try {
      console.time(`[ListsOverview] loadLists ${kind}`);
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
            const altSnap = await window.firebaseDB.collection('lists').limit(200).get();
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
      console.timeEnd(`[ListsOverview] loadLists ${kind}`);
    } catch (err) {
      console.warn('Failed to load lists for kind', kind, err);
      if (kind === 'people') state.loadedPeople = true; else state.loadedAccounts = true;
    }
  }

  function render() {
    const items = state.kind === 'people' ? state.peopleLists : state.accountLists;
    const hasAny = Array.isArray(items) && items.length > 0;

    if (!els.listContainer || !els.emptyState) return;

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
      return;
    }

    // Preserve empty state element
    const emptyStateEl = els.listContainer.querySelector('#lists-empty-state');
    
    // Get existing cards for comparison
    const existingCards = els.listContainer.querySelectorAll('.list-card');
    const existingIds = Array.from(existingCards).map(card => card.getAttribute('data-id'));
    const newIds = items.map(item => item.id);
    
    // Remove cards that no longer exist
    existingCards.forEach(card => {
      const id = card.getAttribute('data-id');
      if (!newIds.includes(id)) {
        card.remove();
      }
    });
    
    // Add or update cards
    items.forEach((item, index) => {
      let existingCard = els.listContainer.querySelector(`.list-card[data-id="${item.id}"]`);
      const cardHtml = listCardHtml(item);
      
      if (!existingCard) {
        // Create new card
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const newCard = tempDiv.firstElementChild;
        
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
          return;
        }
        if (action === 'Delete') {
          showDeleteConfirmation(id, kind);
          return;
        }
        // TODO: Implement Rename
        alert(`${action} list ${id} (${kind}) — coming soon`);
      });
    });
  }

  function updateSwitchLabel() {
    if (!els.switchBtn) return;
    if (state.kind === 'people') {
      els.switchBtn.textContent = 'Switch to company lists';
      els.switchBtn.setAttribute('aria-label', 'Switch to company lists');
      els.switchBtn.setAttribute('title', 'Switch to company lists');
    } else {
      els.switchBtn.textContent = 'Switch to people list';
      els.switchBtn.setAttribute('aria-label', 'Switch to people list');
      els.switchBtn.setAttribute('title', 'Switch to people list');
    }
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
    render();

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
    console.time('[ListsOverview] refreshCounts');
    state.loadedPeople = false;
    state.loadedAccounts = false;
    await ensureLoadedThenRender();
    console.timeEnd('[ListsOverview] refreshCounts');
  }

  // Expose API for other modules
  window.ListsOverview = {
    refreshCounts: refreshCounts
  };

  // Initialize
  if (!initDom()) return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'people' || saved === 'accounts') state.kind = saved; // persist selection
  } catch {}
  attachEvents();
  updateSwitchLabel();
  ensureLoadedThenRender();
})();

// ===== Preloader: cache members for instant detail opening =====
(function () {
  function toSafeLower(s) { return (s || '').toString().trim().toLowerCase(); }

  async function fetchMembersForList(listId) {
    const out = { people: new Set(), accounts: new Set(), loaded: false };
    console.time(`[ListsOverview] preload fetch ${listId}`);
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
    console.timeEnd(`[ListsOverview] preload fetch ${listId}`);
    return out;
  }

  async function preloadMembersForLists(items) {
    console.time('[ListsOverview] preloadMembersForLists');
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
    console.timeEnd('[ListsOverview] preloadMembersForLists');
  }

  // Expose for debugging/tests
  try {
    window.__preloadListMembers = preloadMembersForLists;
  } catch (_) {}
})();
