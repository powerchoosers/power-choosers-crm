'use strict';

// Sequences page module: render list + quick search + pagination (static data for now)
(function () {
  const state = {
    data: [],
    filtered: [],
    loaded: false,
    pageSize: 10,
    currentPage: 1
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

  async function loadFromFirestore() {
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
    return sequencesCol.doc(id).set(patch, { merge: true });
  }

  function deleteFromFirestore(id) {
    if (!sequencesCol || !id) return Promise.resolve();
    return sequencesCol.doc(id).delete();
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
        const seq = {
          id: 'seq-' + now,
          name,
          createdBy: 'You',
          isActive: false,
          sendDuringBusinessHours: !!(els.chkBiz && els.chkBiz.checked),
          createdAt: now,
          stats: {
            active: 0, paused: 0, notSent: 0, bounced: 0, spamBlocked: 0,
            finished: 0, scheduled: 0, delivered: 0,
            replyPct: 0, interestedPct: 0
          }
        };
        state.data.unshift(seq);
        state.currentPage = 1;
        applyFilters();
        closeCreateModal();
        if (window.crm && typeof window.crm.showToast === 'function') {
          window.crm.showToast('Sequence created');
        }
        // Persist to Firestore
        saveToFirestore(seq).catch((err) => console.warn('Failed to save sequence:', err));
        // Navigate to the new sequence in the builder
        if (window.SequenceBuilder && typeof window.SequenceBuilder.show === 'function') {
          try { window.SequenceBuilder.show(seq); } catch (e) { /* noop */ }
        } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
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
          updateField(id, { isActive: on }).catch((err) => console.warn('Failed to update sequence:', err));
        }
      });

      // Click on sequence name to open builder
      els.tbody.addEventListener('click', (e) => {
        const link = e.target && e.target.closest ? e.target.closest('button.seq-open') : null;
        if (!link) return;
        const id = link.getAttribute('data-id');
        const it = state.data.find(s => s.id === id);
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
              try { window.SequenceBuilder.show(it); } catch (e) { /* noop */ }
            } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
              try { window.crm.navigateToPage('sequence-builder'); } catch (e2) { /* noop */ }
            }
            break;
          case 'start':
            startSequenceForContact(it);
            break;
          case 'duplicate': {
            const now = Date.now();
            const copy = { ...it, id: 'seq-' + Math.random().toString(36).slice(2), name: it.name + ' (Copy)', createdAt: now };
            state.data.unshift(copy);
            applyFilters();
            saveToFirestore(copy).catch((err) => console.warn('Failed to duplicate sequence:', err));
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
    const cells = [
      `<td class="col-select"><label class="toggle-switch"><input type="checkbox" class="seq-activate" data-id="${id}" aria-label="Activate sequence"${s.isActive ? ' checked' : ''}><span class="toggle-slider"></span></label></td>`,
      `<td><button type="button" class="btn-text seq-open" data-id="${id}" aria-label="Open sequence ${name}">${name}</button></td>`,
      `<td>${by}</td>`,
      `<td>${fmtNum(st.active)}</td>`,
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
    try {
      if (sequencesCol && sequencesCol.onSnapshot && subscribeToFirestore()) {
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

  // Initialize immediately since this script is loaded after DOM
  init();
})();
