'use strict';

// Sequences page module: render list + quick search + pagination (static data for now)
(function () {
  const state = {
    data: [],
    filtered: [],
    loaded: false,
    pageSize: 10,
    currentPage: 1,
    hasMore: false
  };

  const els = {};

  function qs(id) { return document.getElementById(id); }
  function safe(v) { return (v == null ? '' : String(v)); }
  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function normalize(s) { return (s || '').toString().trim().toLowerCase(); }

  // Firestore helpers
  const db = (typeof window !== 'undefined' && window.firebaseDB) ? window.firebaseDB : null;
  const sequencesCol = db ? db.collection('sequences') : null;
  let unsubscribe = null;
  let onBackgroundLoaded = null;

  async function loadFromFirestore() {
    // Use BackgroundSequencesLoader (cache-first)
    if (window.BackgroundSequencesLoader) {
      const sequencesData = window.BackgroundSequencesLoader.getSequencesData() || [];
      state.data = sequencesData;
      state.filtered = sequencesData.slice();
      state.hasMore = window.BackgroundSequencesLoader.hasMore();
      state.loaded = true;
      console.log('[Sequences] Loaded', sequencesData.length, 'sequences from BackgroundSequencesLoader');
      return;
    }
    
    // Fallback to direct Firestore query
    if (!sequencesCol) return;
    const snap = await sequencesCol.get();
    const items = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      const id = data.id || doc.id;
      if (!id) return;
      items.push({ ...data, id });
    });
    state.data = items;
    state.filtered = items.slice();
    state.loaded = true;
  }

  // Load more sequences from background loader
  async function loadMoreSequences() {
    if (!state.hasMore || !window.BackgroundSequencesLoader) {
      return;
    }

    try {
      console.log('[Sequences] Loading more sequences...');
      const result = await window.BackgroundSequencesLoader.loadMore();
      
      if (result.loaded > 0) {
        // Reload data to get updated sequences
        await loadFromFirestore();
        render();
        console.log('[Sequences] Loaded', result.loaded, 'more sequences');
      } else {
        state.hasMore = false;
      }
    } catch (error) {
      console.error('[Sequences] Failed to load more sequences:', error);
    }
  }

  function subscribeToFirestore() {
    if (!sequencesCol || !sequencesCol.onSnapshot) return false;
    if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
    unsubscribe = sequencesCol.onSnapshot((snap) => {
      const items = [];
      snap.forEach((doc) => {
        const data = doc.data() || {};
        const id = data.id || doc.id;
        if (!id) return;
        items.push({ ...data, id });
      });
      // newest first when createdAt exists
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      state.data = items;
      state.filtered = items.slice();
      state.loaded = true;
      render();
    }, (err) => {
      console.warn('Sequences onSnapshot error:', err);
    });
    return true;
  }

  function saveToFirestore(seq) {
    if (!sequencesCol || !seq || !seq.id) return Promise.resolve();
    return sequencesCol.doc(seq.id).set(seq, { merge: true });
  }

  function updateField(id, patch) {
    if (!sequencesCol || !id || !patch) return Promise.resolve();
    // CRITICAL FIX: Add server timestamp to ensure update is persisted
    const updateData = {
      ...patch,
      updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
    };
    return sequencesCol.doc(id).set(updateData, { merge: true });
  }

  function deleteFromFirestore(id) {
    if (!sequencesCol || !id) return Promise.resolve();
    return sequencesCol.doc(id).delete();
  }

  // Function to start sequence for all active members when sequence is activated
  async function startSequenceForAllMembers(sequence) {
    if (!sequence || !sequence.id || !window.firebaseDB) {
      console.warn('[Sequences] Cannot start sequences: missing sequence or database');
      return;
    }

    try {
      console.log(`[Sequences] Starting sequence "${sequence.name}" for all active members...`);
      
      // Get all sequenceMembers for this sequence
      const membersQuery = await window.firebaseDB.collection('sequenceMembers')
        .where('sequenceId', '==', sequence.id)
        .where('targetType', '==', 'people')
        .get();

      if (membersQuery.empty) {
        console.log('[Sequences] No members found for sequence');
        if (window.crm?.showToast) {
          window.crm.showToast('No contacts in sequence to start', 'info');
        }
        return;
      }

      // Get SequenceBuilder function if available
      if (!window.SequenceBuilder || typeof window.SequenceBuilder.startSequenceForContact !== 'function') {
        console.warn('[Sequences] SequenceBuilder not available');
        return;
      }

      // Load contact data for all members
      const contactIds = [];
      membersQuery.forEach(doc => {
        const data = doc.data();
        if (data.targetId) contactIds.push(data.targetId);
      });

      if (contactIds.length === 0) {
        console.log('[Sequences] No contact IDs found');
        return;
      }

      // Load contact details
      const contacts = [];
      const db = window.firebaseDB;
      for (const contactId of contactIds) {
        try {
          const contactDoc = await db.collection('people').doc(contactId).get();
          if (contactDoc.exists) {
            const contactData = contactDoc.data();
            contacts.push({
              id: contactId,
              name: [contactData.firstName, contactData.lastName].filter(Boolean).join(' ') || contactData.name || 'Contact',
              company: contactData.companyName || contactData.company || '',
              email: contactData.email || '',
              ...contactData
            });
          }
        } catch (err) {
          console.warn(`[Sequences] Failed to load contact ${contactId}:`, err);
        }
      }

      if (contacts.length === 0) {
        console.log('[Sequences] No valid contacts found');
        return;
      }

      // Start sequence for each contact
      let startedCount = 0;
      let errorCount = 0;

      // Show progress toast
      const progressToast = window.crm?.showProgressToast ? 
        window.crm.showProgressToast(`Starting sequence for ${contacts.length} contacts...`, contacts.length, 0) : null;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        try {
          // Only start if contact has email (or skip email steps if no email)
          await window.SequenceBuilder.startSequenceForContact(sequence, {
            id: contact.id,
            name: contact.name,
            company: contact.company,
            email: contact.email,
            contact: contact.name,
            account: contact.company
          });
          startedCount++;
          
          // Update progress
          if (progressToast && typeof progressToast.update === 'function') {
            progressToast.update(i + 1, contacts.length);
          }
        } catch (err) {
          console.warn(`[Sequences] Failed to start sequence for contact ${contact.id}:`, err);
          errorCount++;
        }
      }

      // Complete progress toast
      if (progressToast && typeof progressToast.complete === 'function') {
        let message = `Started sequence for ${startedCount} contact${startedCount === 1 ? '' : 's'}`;
        if (errorCount > 0) {
          message += ` (${errorCount} failed)`;
        }
        progressToast.complete(message);
      } else if (window.crm?.showToast) {
        let message = `Started sequence for ${startedCount} contact${startedCount === 1 ? '' : 's'}`;
        if (errorCount > 0) {
          message += ` (${errorCount} failed)`;
        }
        window.crm.showToast(message, startedCount > 0 ? 'success' : 'info');
      }

      console.log(`[Sequences] Started sequence for ${startedCount}/${contacts.length} contacts`);
    } catch (err) {
      console.error('[Sequences] Failed to start sequences for all members:', err);
      if (window.crm?.showToast) {
        window.crm.showToast('Failed to start sequences. Please try again.', 'error');
      }
    }
  }

  // Function to start a sequence for a contact
  async function startSequenceForContact(sequence) {
    try {
      // Prompt for contact information
      const contactName = prompt('Enter contact name:');
      if (!contactName) return;
      
      const contactCompany = prompt('Enter company name (optional):') || '';
      const contactEmail = prompt('Enter email address:');
      if (!contactEmail) {
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Email address is required to start sequence.');
        }
        return;
      }
      
      const contactData = {
        name: contactName,
        company: contactCompany,
        email: contactEmail,
        contact: contactName,
        account: contactCompany
      };
      
      // Use SequenceBuilder to create tasks
      if (window.SequenceBuilder && typeof window.SequenceBuilder.startSequenceForContact === 'function') {
        const tasks = await window.SequenceBuilder.startSequenceForContact(sequence, contactData);
        
        if (tasks.length > 0) {
          // Navigate to tasks page to show the created tasks
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage('tasks');
          }
        }
      } else {
        console.warn('SequenceBuilder not available');
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Sequence builder not available');
        }
      }
    } catch (error) {
      console.error('Failed to start sequence:', error);
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Failed to start sequence. Please try again.');
      }
    }
  }

  function initDomRefs() {
    els.page = document.getElementById('sequences-page');
    if (!els.page) return false;

    els.table = els.page.querySelector('#sequences-table');
    els.tbody = els.page.querySelector('#sequences-table tbody');
    els.pagination = qs('sequences-pagination');
    els.paginationSummary = qs('sequences-pagination-summary');
    els.quickSearch = qs('sequences-quick-search');
    els.toggleFiltersBtn = qs('toggle-sequences-filters');
    els.filterBadge = qs('sequences-filter-count');
    els.createBtn = qs('create-sequence-btn');

    // Modal elements
    els.modal = qs('sequence-create-modal');
    els.modalClose = qs('sequence-modal-close');
    els.modalCancel = qs('sequence-modal-cancel');
    els.modalCreate = qs('sequence-modal-create');
    els.inputName = qs('sequence-name-input');
    els.chkBiz = qs('sequence-biz-hours');

    return true;
  }

  // Modal helpers
  let escHandler = null;
  function openCreateModal() {
    if (!els.modal) return;
    els.modal.hidden = false;
    if (els.inputName) {
      els.inputName.value = '';
      els.inputName.focus();
    }
    if (els.chkBiz) els.chkBiz.checked = false;
    if (els.modalCreate) els.modalCreate.disabled = true;
    escHandler = (e) => { if (e.key === 'Escape') closeCreateModal(); };
    document.addEventListener('keydown', escHandler);
  }
  function closeCreateModal() {
    if (!els.modal) return;
    els.modal.hidden = true;
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  }
  function updateCreateBtnEnabled() {
    if (!els.modalCreate) return;
    const hasName = !!(els.inputName && els.inputName.value.trim());
    els.modalCreate.disabled = !hasName;
  }

  function attachEvents() {
    if (els.quickSearch) {
      els.quickSearch.addEventListener('input', () => {
        applyFilters();
      });
    }

    if (els.toggleFiltersBtn) {
      els.toggleFiltersBtn.addEventListener('click', () => {
        const label = els.toggleFiltersBtn.querySelector('.filter-text');
        if (label) {
          const showing = label.textContent.includes('Hide');
          label.textContent = showing ? 'Show Filters' : 'Hide Filters';
        }
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Sequence filters coming soon');
        }
      });
    }

    if (els.createBtn) {
      els.createBtn.addEventListener('click', () => {
        openCreateModal();
      });
    }

    // Modal interactions
    if (els.modal) {
      els.modal.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('pc-modal__backdrop')) {
          closeCreateModal();
        }
      });
    }
    if (els.modalClose) {
      els.modalClose.addEventListener('click', closeCreateModal);
    }
    if (els.modalCancel) {
      els.modalCancel.addEventListener('click', closeCreateModal);
    }
    if (els.inputName) {
      els.inputName.addEventListener('input', updateCreateBtnEnabled);
    }
    if (els.modalCreate) {
      els.modalCreate.addEventListener('click', () => {
        const name = (els.inputName ? els.inputName.value.trim() : '') || '';
        if (!name) {
          if (els.inputName) els.inputName.focus();
          return;
        }
        const now = Date.now();
        const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
          ? window.DataManager.getCurrentUserEmail()
          : ((window.currentUserEmail || '').toLowerCase());
        const baseSeq = {
          id: 'seq-' + now,
          name,
          createdBy: userEmail || 'unknown',
          ownerId: userEmail || 'unknown',
          assignedTo: userEmail || 'unknown',
          isActive: false,
          sendDuringBusinessHours: !!(els.chkBiz && els.chkBiz.checked),
          createdAt: now,
          stats: {
            active: 0, paused: 0, notSent: 0, bounced: 0, spamBlocked: 0,
            finished: 0, scheduled: 0, delivered: 0,
            replyPct: 0, interestedPct: 0
          }
        };
        // Persisted payload with server timestamps/ownership via DataManager if available
        const toSave = (window.DataManager && typeof window.DataManager.addOwnership === 'function')
          ? window.DataManager.addOwnership({ ...baseSeq })
          : { ...baseSeq };
        // Update UI immediately with local createdAt
        state.data.unshift(baseSeq);
        state.currentPage = 1;
        applyFilters();
        closeCreateModal();
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Sequence created');
        }
        // Persist to Firestore
        saveToFirestore(toSave).catch((err) => console.warn('Failed to save sequence:', err));
        // Navigate to the new sequence in the builder
        if (window.SequenceBuilder && typeof window.SequenceBuilder.show === 'function') {
          teardownBeforeNavigate();
          try { window.SequenceBuilder.show(baseSeq); } catch (e) { /* noop */ }
        } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
          teardownBeforeNavigate();
          try { window.crm.navigateToPage('sequence-builder'); } catch (e) { /* noop */ }
        }
      });
    }

    if (els.tbody) {
      // Activate toggle + row actions
      els.tbody.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.classList.contains('seq-activate')) {
          const id = t.getAttribute('data-id');
          const on = !!t.checked;
          const it = state.data.find(s => s.id === id);
          if (it) it.isActive = on;
          
          // CRITICAL FIX: Update Firestore with proper error handling
          updateField(id, { isActive: on })
            .then(() => {
              console.log(`[Sequences] Successfully ${on ? 'activated' : 'deactivated'} sequence ${id}`);
              // If activating, start sequences for all active members
              if (on && it) {
                startSequenceForAllMembers(it).catch(err => {
                  console.warn('[Sequences] Failed to start sequences for members:', err);
                });
              }
            })
            .catch((err) => {
              console.error('[Sequences] Failed to update sequence:', err);
              // Revert UI state on error
              if (it) it.isActive = !on;
              t.checked = !on;
              if (window.crm?.showToast) {
                window.crm.showToast('Failed to update sequence. Please try again.', 'error');
              }
            });
        }
      });

      // Click on sequence name to open builder
      els.tbody.addEventListener('click', (e) => {
        const link = e.target && e.target.closest ? e.target.closest('button.seq-open') : null;
        if (!link) return;
        const id = link.getAttribute('data-id');
        const it = state.data.find(s => s.id === id);
        teardownBeforeNavigate();
        if (it && window.SequenceBuilder && typeof window.SequenceBuilder.show === 'function') {
          try { window.SequenceBuilder.show(it); } catch (err) { /* noop */ }
        } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
          try { window.crm.navigateToPage('sequence-builder'); } catch (e2) { /* noop */ }
        }
      });

      els.tbody.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('button.seq-action');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const it = state.data.find(s => s.id === id);
        if (!it) return;
        switch (action) {
          case 'edit':
            if (window.SequenceBuilder && typeof window.SequenceBuilder.show === 'function') {
              teardownBeforeNavigate();
              try { window.SequenceBuilder.show(it); } catch (e) { /* noop */ }
            } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
              teardownBeforeNavigate();
              try { window.crm.navigateToPage('sequence-builder'); } catch (e2) { /* noop */ }
            }
            break;
          case 'start':
            startSequenceForContact(it);
            break;
          case 'duplicate': {
            const now = Date.now();
            const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
              ? window.DataManager.getCurrentUserEmail()
              : ((window.currentUserEmail || '').toLowerCase());
            const copyLocal = { ...it, id: 'seq-' + Math.random().toString(36).slice(2), name: it.name + ' (Copy)', createdAt: now, ownerId: userEmail || it.ownerId, createdBy: userEmail || it.createdBy, assignedTo: userEmail || it.assignedTo };
            const copyToSave = (window.DataManager && typeof window.DataManager.addOwnership === 'function')
              ? window.DataManager.addOwnership({ ...copyLocal })
              : { ...copyLocal };
            state.data.unshift(copyLocal);
            applyFilters();
            saveToFirestore(copyToSave).catch((err) => console.warn('Failed to duplicate sequence:', err));
            break;
          }
          case 'delete': {
            const idx = state.data.findIndex(s => s.id === id);
            if (idx >= 0) state.data.splice(idx, 1);
            applyFilters();
            deleteFromFirestore(id).catch((err) => console.warn('Failed to delete sequence:', err));
            break;
          }
          default:
            break;
        }
      });
    }

    if (els.pagination) {
      els.pagination.addEventListener('click', (e) => {
        const b = e.target.closest('button.page-btn');
        if (!b || b.disabled) return;
        const rel = b.dataset.rel;
        const total = getTotalPages();
        let next = state.currentPage;
        if (rel === 'prev') next = Math.max(1, state.currentPage - 1);
        else if (rel === 'next') next = Math.min(total, state.currentPage + 1);
        else if (b.dataset.page) next = Math.max(1, Math.min(total, parseInt(b.dataset.page, 10)));
        if (next !== state.currentPage) { state.currentPage = next; render(); }
      });
    }
  }

  function applyFilters() {
    const q = normalize(els.quickSearch ? els.quickSearch.value : '');
    const qMatch = (str) => !q || normalize(str).includes(q);
    state.filtered = state.data.filter(s => qMatch(s.name) || qMatch(s.createdBy));
    state.currentPage = 1;
    render();
  }

  function getTotalPages() {
    const total = state.filtered.length;
    return Math.max(1, Math.ceil(total / state.pageSize));
  }
  function getPageItems() {
    const start = (state.currentPage - 1) * state.pageSize;
    return state.filtered.slice(start, start + state.pageSize);
  }

  function formatPct(n) { const v = Number(n) || 0; return v.toFixed(1) + '%'; }
  function fmtNum(n) { const v = Number(n); return isFinite(v) ? v.toLocaleString() : safe(n); }

  function rowHtml(s) {
    const id = escapeHtml(s.id);
    const name = escapeHtml(s.name);
    const by = escapeHtml(s.createdBy);
    const st = s.stats || {};
    // CRITICAL FIX: Use recordCount if available, otherwise fall back to stats.active
    // recordCount is the actual count of sequenceMembers, stats.active may be stale
    const activeCount = typeof s.recordCount === 'number' ? s.recordCount : (st.active || 0);
    const cells = [
      `<td class="col-select"><label class="toggle-switch"><input type="checkbox" class="seq-activate" data-id="${id}" aria-label="Activate sequence"${s.isActive ? ' checked' : ''}><span class="toggle-slider"></span></label></td>`,
      `<td><button type="button" class="btn-text seq-open" data-id="${id}" aria-label="Open sequence ${name}">${name}</button></td>`,
      `<td>${by}</td>`,
      `<td>${fmtNum(activeCount)}</td>`,
      `<td>${fmtNum(st.paused)}</td>`,
      `<td>${fmtNum(st.notSent)}</td>`,
      `<td>${fmtNum(st.bounced)}</td>`,
      `<td>${fmtNum(st.spamBlocked)}</td>`,
      `<td>${fmtNum(st.finished)}</td>`,
      `<td>${fmtNum(st.scheduled)}</td>`,
      `<td>${fmtNum(st.delivered)}</td>`,
      `<td>${formatPct(st.replyPct)}</td>`,
      `<td>${formatPct(st.interestedPct)}</td>`,
      `<td>
        <div class="qa-actions">
          <button type="button" class="seq-action btn-text" data-action="edit" data-id="${id}">Edit</button>
          <button type="button" class="seq-action btn-text" data-action="start" data-id="${id}">Start</button>
          <button type="button" class="seq-action btn-text" data-action="duplicate" data-id="${id}">Duplicate</button>
          <button type="button" class="seq-action btn-text" data-action="delete" data-id="${id}">Delete</button>
        </div>
      </td>`
    ];
    return `\n<tr>\n  ${cells.join('\n  ')}\n</tr>`;
  }

  function emptyHtml() {
    return `\n<tr>\n  <td colspan="14" style="opacity:.75">No sequences found.</td>\n</tr>`;
  }

  function render() {
    if (!els.tbody) return;
    const items = getPageItems();
    els.tbody.innerHTML = items.length ? items.map(rowHtml).join('') : emptyHtml();
    renderPagination();
    renderSummary();
  }

  function renderSummary() {
    if (!els.paginationSummary) return;
    const total = state.filtered.length;
    const start = total ? (state.currentPage - 1) * state.pageSize + 1 : 0;
    const end = Math.min(total, state.currentPage * state.pageSize);
    els.paginationSummary.textContent = `Showing ${start}–${end} of ${total} sequences`;
  }

  function renderPagination() {
    if (!els.pagination) return;
    const totalPages = getTotalPages();
    const cur = state.currentPage;

    // Use unified pagination component
    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(cur, totalPages, (page) => {
        state.currentPage = page;
        render();
      }, els.pagination.id);
    } else {
      // Fallback to simple pagination if unified component not available
      els.pagination.innerHTML = `<div class="unified-pagination">
        <button class="pagination-arrow" ${cur <= 1 ? 'disabled' : ''} onclick="if(${cur} > 1) { state.currentPage = ${cur - 1}; render(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
        </button>
        <div class="pagination-current">${cur}</div>
        <button class="pagination-arrow" ${cur >= totalPages ? 'disabled' : ''} onclick="if(${cur} < ${totalPages}) { state.currentPage = ${cur + 1}; render(); }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"></polyline></svg>
        </button>
      </div>`;
    }
  }

  function loadSampleData() {
    if (state.loaded) return;
    const owners = ['Lewis Patterson', 'Morgan Lee', 'Sam Carter', 'Jamie Nguyen'];
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const data = [];
    for (let i = 1; i <= 24; i++) {
      const delivered = rand(50, 1200);
      const reply = Math.random() * 12; // %
      const interested = Math.random() * 6; // %
      data.push({
        id: 'seq-' + i,
        name: `Warm Outreach ${i}`,
        createdBy: owners[i % owners.length],
        isActive: Math.random() < 0.35,
        stats: {
          active: rand(0, 120),
          paused: rand(0, 40),
          notSent: rand(0, 80),
          bounced: rand(0, 10),
          spamBlocked: rand(0, 8),
          finished: rand(0, 200),
          scheduled: rand(0, 90),
          delivered,
          replyPct: reply,
          interestedPct: interested
        }
      });
    }
    state.data = data;
    state.filtered = data.slice();
    state.loaded = true;
  }

  async function init() {
    if (!initDomRefs()) return;
    attachEvents();
    
    // Listen for background sequences loader events (bind once and only update if page is visible)
    if (!document._sequencesLoadedBound) {
      onBackgroundLoaded = async () => {
        try {
          const page = document.getElementById('sequences-page');
          if (!page || page.offsetParent === null) return;
          console.log('[Sequences] Background sequences loaded, refreshing data...');
          await loadFromFirestore();
          applyFilters();
        } catch (e) {
          console.warn('[Sequences] pc:sequences-loaded handler failed', e);
        }
      };
      document.addEventListener('pc:sequences-loaded', onBackgroundLoaded);
      document._sequencesLoadedBound = true;
    }
    
    try {
      // Use background loader if available, otherwise fall back to direct Firestore
      if (window.BackgroundSequencesLoader) {
        await loadFromFirestore();
      } else if (sequencesCol && sequencesCol.onSnapshot && subscribeToFirestore()) {
        // live updates enabled
      } else if (sequencesCol) {
        await loadFromFirestore();
        // Sort newest first if createdAt exists
        state.data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        state.filtered = state.data.slice();
      } else {
        loadSampleData();
      }
    } catch (err) {
      console.warn('Failed to load sequences from Firestore:', err);
    }
    applyFilters();
  }

  // Clean up listeners and hide page before navigating away to builder to avoid flicker
  function teardownBeforeNavigate() {
    try {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    } catch (_) {}
    try {
      if (onBackgroundLoaded) {
        document.removeEventListener('pc:sequences-loaded', onBackgroundLoaded);
        onBackgroundLoaded = null;
        document._sequencesLoadedBound = false;
      }
    } catch (_) {}
    // Do not force inline hiding here; some routers/show logic rely on
    // existing display styles. Forcing inline styles can keep the page
    // hidden after navigating back, resulting in a blank screen.
    // If visual suppression is needed during navigation, rely on the
    // navigation controller to handle visibility.
  }

  // Function to recalculate and sync sequence member counts
  async function recalculateSequenceCounts() {
    if (!window.firebaseDB) {
      console.warn('[Sequences] Cannot recalculate: database not available');
      return;
    }

    try {
      console.log('[Sequences] Recalculating sequence member counts...');
      const sequences = state.data || [];
      let fixedCount = 0;

      for (const seq of sequences) {
        if (!seq.id) continue;

        try {
          // Count actual sequenceMembers
          const membersQuery = await window.firebaseDB.collection('sequenceMembers')
            .where('sequenceId', '==', seq.id)
            .where('targetType', '==', 'people')
            .get();

          const actualCount = membersQuery.size;
          const currentActive = seq.stats?.active || 0;
          const currentRecordCount = seq.recordCount;

          // Update if counts don't match
          if (actualCount !== currentActive || actualCount !== currentRecordCount) {
            await updateField(seq.id, {
              'stats.active': actualCount,
              'recordCount': actualCount
            });
            
            // Update local state
            if (seq.stats) {
              seq.stats.active = actualCount;
            }
            seq.recordCount = actualCount;
            
            fixedCount++;
            console.log(`[Sequences] Fixed count for "${seq.name}": ${currentActive}/${currentRecordCount} → ${actualCount}`);
          }
        } catch (err) {
          console.warn(`[Sequences] Failed to recalculate count for sequence ${seq.id}:`, err);
        }
      }

      if (fixedCount > 0) {
        render(); // Refresh the display
        if (window.crm?.showToast) {
          window.crm.showToast(`Updated counts for ${fixedCount} sequence${fixedCount === 1 ? '' : 's'}`, 'success');
        }
        console.log(`[Sequences] Fixed ${fixedCount} sequence counts`);
      } else {
        console.log('[Sequences] All sequence counts are correct');
      }
    } catch (err) {
      console.error('[Sequences] Failed to recalculate counts:', err);
    }
  }

  // Expose public API
  try {
    window.Sequences = window.Sequences || {};
    window.Sequences.loadMoreSequences = loadMoreSequences;
    window.Sequences.loadFromFirestore = loadFromFirestore;
    window.Sequences.recalculateSequenceCounts = recalculateSequenceCounts;
  } catch(_) {}

  // Initialize immediately since this script is loaded after DOM
  init();
})();
