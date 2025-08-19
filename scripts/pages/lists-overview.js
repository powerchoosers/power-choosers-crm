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
    els.listContainer = els.page.querySelector('.page-content');
    els.emptyState = qs('lists-empty-state');
    els.headerCreateBtn = qs('add-list-btn');
    els.createFirstBtn = qs('create-first-list-btn');
    els.tableContainer = els.page.querySelector('.page-content');

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
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Use a single 'lists' collection with a 'kind' field if present
        let query = window.firebaseDB.collection('lists');
        if (query.where) query = query.where('kind', '==', kind);
        const snap = await (query.limit ? query.limit(200).get() : query.get());
        const items = (snap && snap.docs) ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        if (kind === 'people') { state.peopleLists = items; state.loadedPeople = true; }
        else { state.accountLists = items; state.loadedAccounts = true; }
      } else {
        // No Firestore: remain empty but mark as loaded
        if (kind === 'people') state.loadedPeople = true; else state.loadedAccounts = true;
      }
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

    // Render grid of list cards
    const emptyStateEl = els.listContainer.querySelector('#lists-empty-state');
    els.listContainer.innerHTML = items.map(listCardHtml).join('');
    // Re-append empty state element so it's available for next render
    if (emptyStateEl) {
      els.listContainer.appendChild(emptyStateEl);
    }

    // Attach per-card actions
    els.listContainer.querySelectorAll('[data-action]')?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const kind = btn.getAttribute('data-kind');
        console.log('[Lists] action', action, { id, kind });
        if (action === 'Open') {
          const listArr = kind === 'people' ? state.peopleLists : state.accountLists;
          const item = (listArr || []).find(x => x.id === id);
          const name = item?.name || 'List';
          if (window.ListsView && typeof window.ListsView.open === 'function') {
            window.ListsView.open({ id, kind: kind === 'people' ? 'people' : 'accounts', name });
          } else {
            alert('List detail module not loaded yet.');
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
