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
    // Tokenized filters
    titleTokens: [],
    companyTokens: [],
    cityTokens: [],
    stateTokens: [],
    employeesTokens: [],
    industryTokens: [],
    visitorDomainTokens: [],
    // Suggestion pools (built after load)
    titlePool: [],
    companyPool: [],
    cityPool: [],
    statePool: [],
    employeesPool: [],
    industryPool: [],
    visitorDomainPool: [],
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
    window.addEventListener('resize', _positionListsPanel, true);
    window.addEventListener('scroll', _positionListsPanel, true);

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
    document.addEventListener('keydown', _onListsKeydown, true);

    // Click-away
    _onListsOutside = (e) => {
      const inside = panel.contains(e.target);
      const isTrigger = !!(e.target.closest && e.target.closest('#people-bulk-actions'));
      if (!inside && !isTrigger) closeBulkListsPanel();
    };
    document.addEventListener('mousedown', _onListsOutside, true);

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
  function findAccountByDomainOrName(domain, name) {
    const list = (typeof window !== 'undefined' && typeof window.getAccountsData === 'function') ? window.getAccountsData() : [];
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

  // Inject CRM-themed styles for People bulk popover and actions bar
  function injectPeopleBulkStyles() {
    if (document.getElementById('people-bulk-styles')) return; // prevent duplicate injection
    const style = document.createElement('style');
    style.id = 'people-bulk-styles';
    style.textContent = `
      /* Ensure absolute children anchor to the table container */
      #people-page .table-container { position: relative; overflow: visible; }

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
        transform: translateY(-8px); opacity: 0; transition: transform .16s ease, opacity .16s ease; overflow: hidden;
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
    if (!els.page._contactUpdatedHandler) els.page._contactUpdatedHandler = function (ev) {
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

  // Lightweight built-in DnD for headers (fallback if global contacts DnD isn't present)
  function initPeopleHeaderDnD() {
    if (!els.headerRow) return;
    let dragSrcTh = null;
    const ths = Array.from(els.headerRow.querySelectorAll('th'));
    ths.forEach((th) => {
      th.setAttribute('draggable', 'true');
      th.addEventListener('dragstart', (e) => {
        dragSrcTh = th;
        const key = th.getAttribute('data-col') || '';
        try { e.dataTransfer?.setData('text/plain', key); } catch (_) { /* noop */ }
        th.classList.add('dragging');
      });
      th.addEventListener('dragenter', () => th.classList.add('drag-over'));
      th.addEventListener('dragleave', () => th.classList.remove('drag-over'));
      th.addEventListener('dragover', (e) => { e.preventDefault(); });
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('drag-over');
        if (!dragSrcTh || dragSrcTh === th) return;
        const rect = th.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        if (before) els.headerRow.insertBefore(dragSrcTh, th);
        else els.headerRow.insertBefore(dragSrcTh, th.nextSibling);
      });
      th.addEventListener('dragend', () => {
        th.classList.remove('dragging');
        dragSrcTh = null;
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

  // Select-all checkbox behavior
  if (els.selectAll) {
    els.selectAll.addEventListener('change', () => {
      console.log('Select-all checkbox changed, checked:', els.selectAll.checked);
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
      });
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
      });
    }
    // City chip behaviors
    if (els.fCity) {
      els.fCity.addEventListener('input', () => updateCitySuggestions());
      els.fCity.addEventListener('keydown', (e) => {
        const val = (els.fCity.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) {
            e.preventDefault();
            addCityToken(val);
            els.fCity.value = '';
            hideCitySuggestions();
            applyFilters();
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
      els.citySuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg') || ''; addCityToken(label); if (els.fCity) els.fCity.value = ''; hideCitySuggestions(); applyFilters(); });
    }
    // State chip behaviors
    if (els.fState) {
      els.fState.addEventListener('input', () => updateStateSuggestions());
      els.fState.addEventListener('keydown', (e) => {
        const val = (els.fState.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addStateToken(val); els.fState.value = ''; hideStateSuggestions(); applyFilters(); }
        } else if (e.key === 'Backspace') {
          if (!val && state.stateTokens.length > 0) { e.preventDefault(); removeLastStateToken(); applyFilters(); }
        }
      });
      if (els.stateChipWrap) { els.stateChipWrap.addEventListener('click', (ev) => { if (ev.target === els.stateChipWrap) els.fState.focus(); }); }
    }
    if (els.stateClear) { els.stateClear.addEventListener('click', () => { clearStateTokens(); if (els.fState) els.fState.value=''; hideStateSuggestions(); applyFilters(); els.fState?.focus(); }); }
    if (els.stateSuggest) { els.stateSuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addStateToken(label); if (els.fState) els.fState.value=''; hideStateSuggestions(); applyFilters(); }); }
    // Employees chip behaviors
    if (els.fEmployees) {
      els.fEmployees.addEventListener('input', () => updateEmployeesSuggestions());
      els.fEmployees.addEventListener('keydown', (e) => {
        const val = (els.fEmployees.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addEmployeesToken(val); els.fEmployees.value=''; hideEmployeesSuggestions(); applyFilters(); }
        } else if (e.key === 'Backspace') {
          if (!val && state.employeesTokens.length > 0) { e.preventDefault(); removeLastEmployeesToken(); applyFilters(); }
        }
      });
      if (els.employeesChipWrap) { els.employeesChipWrap.addEventListener('click', (ev) => { if (ev.target === els.employeesChipWrap) els.fEmployees.focus(); }); }
    }
    if (els.employeesClear) { els.employeesClear.addEventListener('click', () => { clearEmployeesTokens(); if (els.fEmployees) els.fEmployees.value=''; hideEmployeesSuggestions(); applyFilters(); els.fEmployees?.focus(); }); }
    if (els.employeesSuggest) { els.employeesSuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addEmployeesToken(label); if (els.fEmployees) els.fEmployees.value=''; hideEmployeesSuggestions(); applyFilters(); }); }
    // Industry chip behaviors
    if (els.fIndustry) {
      els.fIndustry.addEventListener('input', () => updateIndustrySuggestions());
      els.fIndustry.addEventListener('keydown', (e) => {
        const val = (els.fIndustry.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addIndustryToken(val); els.fIndustry.value=''; hideIndustrySuggestions(); applyFilters(); }
        } else if (e.key === 'Backspace') {
          if (!val && state.industryTokens.length > 0) { e.preventDefault(); removeLastIndustryToken(); applyFilters(); }
        }
      });
      if (els.industryChipWrap) { els.industryChipWrap.addEventListener('click', (ev) => { if (ev.target === els.industryChipWrap) els.fIndustry.focus(); }); }
    }
    if (els.industryClear) { els.industryClear.addEventListener('click', () => { clearIndustryTokens(); if (els.fIndustry) els.fIndustry.value=''; hideIndustrySuggestions(); applyFilters(); els.fIndustry?.focus(); }); }
    if (els.industrySuggest) { els.industrySuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addIndustryToken(label); if (els.fIndustry) els.fIndustry.value=''; hideIndustrySuggestions(); applyFilters(); }); }
    // Visitor domain chip behaviors
    if (els.fVisitorDomain) {
      els.fVisitorDomain.addEventListener('input', () => updateVisitorDomainSuggestions());
      els.fVisitorDomain.addEventListener('keydown', (e) => {
        const val = (els.fVisitorDomain.value || '').trim();
        if (e.key === 'Enter' || e.key === ',') {
          if (val) { e.preventDefault(); addVisitorDomainToken(val); els.fVisitorDomain.value=''; hideVisitorDomainSuggestions(); applyFilters(); }
        } else if (e.key === 'Backspace') {
          if (!val && state.visitorDomainTokens.length > 0) { e.preventDefault(); removeLastVisitorDomainToken(); applyFilters(); }
        }
      });
      if (els.visitorDomainChipWrap) { els.visitorDomainChipWrap.addEventListener('click', (ev) => { if (ev.target === els.visitorDomainChipWrap) els.fVisitorDomain.focus(); }); }
    }
    if (els.visitorDomainClear) { els.visitorDomainClear.addEventListener('click', () => { clearVisitorDomainTokens(); if (els.fVisitorDomain) els.fVisitorDomain.value=''; hideVisitorDomainSuggestions(); applyFilters(); els.fVisitorDomain?.focus(); }); }
    if (els.visitorDomainSuggest) { els.visitorDomainSuggest.addEventListener('mousedown', (e) => { const item = e.target.closest('[data-sugg]'); if (!item) return; const label = item.getAttribute('data-sugg')||''; addVisitorDomainToken(label); if (els.fVisitorDomain) els.fVisitorDomain.value=''; hideVisitorDomainSuggestions(); applyFilters(); }); }
    [els.fHasEmail, els.fHasPhone].forEach((chk) => {
      if (chk) chk.addEventListener('change', reFilter);
    });

    if (els.applyBtn) els.applyBtn.addEventListener('click', () => { state.currentPage = 1; applyFilters(); });
    if (els.clearBtn) els.clearBtn.addEventListener('click', () => { clearFilters(); state.currentPage = 1; });
    if (els.quickSearch) els.quickSearch.addEventListener('input', reFilter);

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
      // Contact name click delegation
      els.tbody.addEventListener('click', (e) => {
        const nameCell = e.target.closest('.name-cell');
        if (nameCell) {
          const contactId = nameCell.getAttribute('data-contact-id');
          if (contactId && window.ContactDetail) {
            window.ContactDetail.show(contactId);
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
        }
      });
    }
  }

  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
  }

  async function loadDataOnce() {
    if (state.loaded) return;
    try {
      if (!window.firebaseDB) {
        console.warn('Firestore not initialized');
        state.data = [];
        state.filtered = [];
        state.loaded = true;
        render();
        return;
      }
      // Load contacts and accounts in parallel so we can derive accountEmployees from accounts
      const contactsPromise = window.firebaseDB.collection('contacts').get();
      const accountsPromise = window.firebaseDB.collection('accounts').get().catch(() => null);
      const [contactsSnap, accountsSnap] = await Promise.all([contactsPromise, accountsPromise]);

      // Build quick lookups for accounts → employees
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
      if (accountsSnap && accountsSnap.docs) {
        for (const doc of accountsSnap.docs) {
          const data = doc.data() || {};
          accountById.set(doc.id, data);
          const name = (data.accountName || data.name || data.companyName || '').toString().trim();
          if (name) accountByName.set(normalize(name), data);
        }
      }

      // Map contacts and inject derived accountEmployees from accounts by id or name
      state.data = contactsSnap.docs.map((d) => {
        const c = { id: d.id, ...d.data() };
        // Locate matching account by id or name
        let acc = null;
        if (c.accountId && accountById.has(c.accountId)) {
          acc = accountById.get(c.accountId);
        } else {
          const key = (c.accountName || '').toString().trim();
          if (key) acc = accountByName.get(normalize(key)) || null;
        }

        // Derive employees count from account
        let employeesVal = acc ? getEmployeesFromAccount(acc) : null;
        if (employeesVal == null) {
          const fromContact = [c.accountEmployees, c.employees].find((v) => typeof v === 'number' && isFinite(v));
          if (typeof fromContact === 'number') employeesVal = fromContact;
        }
        if (employeesVal != null) c.accountEmployees = employeesVal;

        // Derive company association for display if missing on contact
        if (!c.companyName) {
          if (acc) c.companyName = acc.accountName || acc.name || acc.companyName || c.accountName || '';
          else if (c.accountName) c.companyName = c.accountName;
        }

        // Optionally enrich website/domain from account for quick actions
        if (acc) {
          if (!c.companyWebsite && (acc.website || acc.site)) c.companyWebsite = acc.website || acc.site;
          if (!c.companyDomain && acc.domain) c.companyDomain = acc.domain;
          if (!c.linkedin && !c.linkedinUrl && (acc.linkedin || acc.linkedinUrl || acc.linkedin_url)) {
            c.linkedinUrl = acc.linkedin || acc.linkedinUrl || acc.linkedin_url;
          }
        }
        return c;
      });
      state.filtered = state.data.slice();
      state.loaded = true;
      state.currentPage = 1;
      if (typeof buildTitleSuggestionPool === 'function') buildTitleSuggestionPool();
      if (typeof buildCompanySuggestionPool === 'function') buildCompanySuggestionPool();
      if (typeof buildCitySuggestionPool === 'function') buildCitySuggestionPool();
      if (typeof buildStateSuggestionPool === 'function') buildStateSuggestionPool();
      if (typeof buildEmployeesSuggestionPool === 'function') buildEmployeesSuggestionPool();
      if (typeof buildIndustrySuggestionPool === 'function') buildIndustrySuggestionPool();
      if (typeof buildVisitorDomainSuggestionPool === 'function') buildVisitorDomainSuggestionPool();
      render();
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
      render();
    }
  }

  function normalize(s) {
    return (s || '').toString().trim().toLowerCase();
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
      const hasPhone = !!(c.phone || c.mobile);
      const city = c.city || c.locationCity || '';
      const stateVal = c.state || c.locationState || '';
      const employeesVal = (c.accountEmployees != null ? c.accountEmployees : c.employees);
      const employeesStr = (employeesVal == null ? '' : String(employeesVal));
      const industryVal = c.industry || c.companyIndustry || '';

      return (
        qMatch(fullName) || qMatch(c.title) || qMatch(c.companyName) || qMatch(c.email) || qMatch(c.phone) || qMatch(c.mobile)
      ) && titleMatch(c.title) && companyMatch(c.companyName) && cityMatch(city) && stateMatch(stateVal) && employeesMatch(employeesStr) && industryMatch(industryVal) && (!mustEmail || hasEmail) && (!mustPhone || hasPhone);
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
    els.cityChips.innerHTML = state.cityTokens.map((t, idx) => `
      <span class="chip" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    els.cityChips.querySelectorAll('.chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-idx')||'-1',10);
        if (!isNaN(i)) { state.cityTokens.splice(i,1); renderCityChips(); applyFilters(); }
      });
    });
    if (els.cityClear) { if (state.cityTokens.length>0) els.cityClear.removeAttribute('hidden'); else els.cityClear.setAttribute('hidden',''); }
  }
  function addCityToken(label){ const t=label.trim(); if(!t) return; const exists=state.cityTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.cityTokens.push(t); renderCityChips(); } }
  function removeLastCityToken(){ if(state.cityTokens.length===0) return; state.cityTokens.pop(); renderCityChips(); }
  function clearCityTokens(){ if(state.cityTokens.length===0) return; state.cityTokens=[]; renderCityChips(); }
  function updateCitySuggestions(){ if(!els.citySuggest) return; const q=normalize(els.fCity?els.fCity.value:''); if(!q){ hideCitySuggestions(); return; } const items=[]; for(let i=0;i<state.cityPool.length && items.length<8;i++){ const s=state.cityPool[i]; if(normalize(s).includes(q) && !state.cityTokens.some((x)=>normalize(x)===normalize(s))) items.push(s); } if(items.length===0){ hideCitySuggestions(); return; } els.citySuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.citySuggest.removeAttribute('hidden'); }
  function hideCitySuggestions(){ if(els.citySuggest){ els.citySuggest.setAttribute('hidden',''); els.citySuggest.innerHTML=''; } }

  // ===== State chip-input helpers =====
  function buildStateSuggestionPool(){ const set=new Set(); const pool=[]; for(const c of state.data){ const v=(c.state || c.locationState || '').toString().trim(); if(!v) continue; const key=normalize(v); if(!set.has(key)){ set.add(key); pool.push(v);} if(pool.length>2000) break; } state.statePool=pool; }
  function renderStateChips(){ if(!els.stateChips) return; els.stateChips.innerHTML = state.stateTokens.map((t,idx)=>`<span class="chip" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); els.stateChips.querySelectorAll('.chip-remove').forEach((btn)=>{ btn.addEventListener('click',()=>{ const i=parseInt(btn.getAttribute('data-idx')||'-1',10); if(!isNaN(i)){ state.stateTokens.splice(i,1); renderStateChips(); applyFilters(); } });}); if(els.stateClear){ if(state.stateTokens.length>0) els.stateClear.removeAttribute('hidden'); else els.stateClear.setAttribute('hidden',''); } }
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
      <span class="chip" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    els.employeesChips.querySelectorAll('.chip-remove').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const i=parseInt(btn.getAttribute('data-idx')||'-1',10);
        if(!isNaN(i)){
          state.employeesTokens.splice(i,1);
          renderEmployeesChips();
          applyFilters();
        }
      });
    });
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
  function renderIndustryChips(){ if(!els.industryChips) return; els.industryChips.innerHTML = state.industryTokens.map((t,idx)=>`<span class="chip" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); els.industryChips.querySelectorAll('.chip-remove').forEach((btn)=>{ btn.addEventListener('click',()=>{ const i=parseInt(btn.getAttribute('data-idx')||'-1',10); if(!isNaN(i)){ state.industryTokens.splice(i,1); renderIndustryChips(); applyFilters(); } });}); if(els.industryClear){ if(state.industryTokens.length>0) els.industryClear.removeAttribute('hidden'); else els.industryClear.setAttribute('hidden',''); } }
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
  function renderVisitorDomainChips(){ if(!els.visitorDomainChips) return; els.visitorDomainChips.innerHTML = state.visitorDomainTokens.map((t,idx)=>`<span class="chip" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>`).join(''); els.visitorDomainChips.querySelectorAll('.chip-remove').forEach((btn)=>{ btn.addEventListener('click',()=>{ const i=parseInt(btn.getAttribute('data-idx')||'-1',10); if(!isNaN(i)){ state.visitorDomainTokens.splice(i,1); renderVisitorDomainChips(); applyFilters(); } });}); if(els.visitorDomainClear){ if(state.visitorDomainTokens.length>0) els.visitorDomainClear.removeAttribute('hidden'); else els.visitorDomainClear.setAttribute('hidden',''); } }
  function addVisitorDomainToken(label){ const t=label.trim(); if(!t) return; const exists=state.visitorDomainTokens.some((x)=>normalize(x)===normalize(t)); if(!exists){ state.visitorDomainTokens.push(t); renderVisitorDomainChips(); } }
  function removeLastVisitorDomainToken(){ if(state.visitorDomainTokens.length===0) return; state.visitorDomainTokens.pop(); renderVisitorDomainChips(); }
  function clearVisitorDomainTokens(){ if(state.visitorDomainTokens.length===0) return; state.visitorDomainTokens=[]; renderVisitorDomainChips(); }
  function updateVisitorDomainSuggestions(){ if(!els.visitorDomainSuggest) return; const q=normalize(els.fVisitorDomain?els.fVisitorDomain.value:''); if(!q){ hideVisitorDomainSuggestions(); return;} const items=[]; for(let i=0;i<state.visitorDomainPool.length && items.length<8;i++){ const s=state.visitorDomainPool[i]; if(normalize(s).includes(q) && !state.visitorDomainTokens.some((x)=>normalize(x)===normalize(s))) items.push(s);} if(items.length===0){ hideVisitorDomainSuggestions(); return;} els.visitorDomainSuggest.innerHTML = items.map((s)=>`<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.visitorDomainSuggest.removeAttribute('hidden'); }
  function hideVisitorDomainSuggestions(){ if(els.visitorDomainSuggest){ els.visitorDomainSuggest.setAttribute('hidden',''); els.visitorDomainSuggest.innerHTML=''; } }

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
      <span class="chip" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    els.titleChips.querySelectorAll('.chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (!isNaN(i)) {
          state.titleTokens.splice(i, 1);
          renderTitleChips();
          applyFilters();
        }
      });
    });
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
      <span class="chip" data-idx="${idx}">
        <span class="chip-label">${escapeHtml(t)}</span>
        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>
      </span>
    `).join('');
    els.companyChips.querySelectorAll('.chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (!isNaN(i)) {
          state.companyTokens.splice(i, 1);
          renderCompanyChips();
          applyFilters();
        }
      });
    });
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

  

  function render() {
    if (!els.tbody) return;
    const pageItems = getPageItems();
    const rows = pageItems.map((c) => rowHtml(c)).join('');
    els.tbody.innerHTML = rows || emptyHtml();
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
        /* Larger list lines to fill container */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>';
      case 'export':
        /* Download into tray icon (arrow down + base) to match reference */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      case 'ai':
        /* Slightly larger and better-centered AI letters */
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:block"><text x="12" y="12" dy="-0.12em" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="18" font-weight="800" letter-spacing="0.05" font-family="Inter, system-ui, -apple-system, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif">AI</text></svg>';
      case 'linkedin':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5z" transform="translate(4 4)"/><path d="M2 8h4v10H2z" transform="translate(4 4)"/><path d="M9 8h3v1.7c.6-1 1.6-1.7 3.2-1.7 3 0 4.8 2 4.8 5.6V18h-4v-3.7c0-1.4-.5-2.4-1.7-2.4-1 0-1.5.7-1.8 1.4-.1.2-.1.6-.1.9V18H9z" transform="translate(4 4)"/></svg>';
      case 'link':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/></svg>';
      case 'task':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6a2 2 0 0 1 2 2v2h2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h2V4a2 2 0 0 1 2-2z"/><path d="M9 4h6"/><path d="M9 12l2 2 4-4"/></svg>';
      case 'delete':
        return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      default:
        return '';
      }
  }
  if (els.titleClear) {
    if (state.titleTokens.length > 0) els.titleClear.removeAttribute('hidden');
    else els.titleClear.setAttribute('hidden', '');
  }

  function rowHtml(c) {
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || safe(c.name);
    const title = safe(c.title);
    const company = safe(c.companyName);
    const email = safe(c.email);
    const phone = safe(c.phone || c.mobile);
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

    const cells = {
      select: `<td class="col-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(c.id)}" aria-label="Select contact"${checked}></td>`,
      name: `<td class="name-cell" data-contact-id="${escapeHtml(c.id)}"><div class="name-cell__wrap"><span class="avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(fullName)}</span></div></td>`,
      title: `<td>${escapeHtml(title)}</td>`,
      company: `<td><a href="#account-details" class="company-link" data-company="${escapeHtml(company)}" data-domain="${escapeHtml(favDomain)}"><span class="company-cell__wrap">${favDomain ? `<img class="company-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=${escapeHtml(favDomain)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ''}<span class="company-name">${escapeHtml(company)}</span></span></a></td>`,
      email: `<td>${escapeHtml(email)}</td>`,
      phone: `<td>${escapeHtml(phone)}</td>`,
      location: `<td>${location}</td>`,
      actions: `<td class="qa-cell"><div class="qa-actions">
        <button type="button" class="qa-btn" data-action="addlist" data-id="${escapeHtml(c.id)}" aria-label="Add to list" title="Add to list">${svgIcon('addlist')}</button>
        <button type="button" class="qa-btn" data-action="sequence" data-id="${escapeHtml(c.id)}" aria-label="Add to sequence" title="Add to sequence">${svgIcon('sequence')}</button>
        <button type="button" class="qa-btn" data-action="task" data-id="${escapeHtml(c.id)}" aria-label="Create task" title="Create task">${svgIcon('task')}</button>
        <button type="button" class="qa-btn" data-action="linkedin" data-id="${escapeHtml(c.id)}" data-linkedin="${escapeHtml(linkedin)}" data-name="${escapeHtml(fullName)}" data-company="${escapeHtml(company)}" aria-label="LinkedIn" title="LinkedIn">${svgIcon('linkedin')}</button>
        <button type="button" class="qa-btn" data-action="ai" data-id="${escapeHtml(c.id)}" aria-label="Research with AI" title="Research with AI">${svgIcon('ai')}</button>
        <button type="button" class="qa-btn" data-action="website" data-id="${escapeHtml(c.id)}" data-website="${escapeHtml(website)}" data-company="${escapeHtml(company)}" aria-label="Company website" title="Company website">${svgIcon('link')}</button>
      </div></td>`,
      updated: `<td>${escapeHtml(updatedStr)}</td>`,
    };

    const tds = [];
    const order = (contactsColumnOrder && contactsColumnOrder.length) ? contactsColumnOrder : DEFAULT_CONTACTS_COL_ORDER;
    for (const key of order) {
      if (cells[key]) tds.push(cells[key]);
    }
    return `\n<tr${rowClass}>\n  ${tds.join('\n  ')}\n</tr>`;
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

  function init() {
    if (!initDomRefs()) return; // Not on this page
    attachEvents();
    // Ensure styles for bulk popover and actions bar match CRM theme
    injectPeopleBulkStyles();
    // Load, prepare, and render header order
    contactsColumnOrder = loadPeopleColumnOrder();
    ensurePeopleHeaderColMeta();
    refreshPeopleHeaderOrder();
    // Export for other modules if needed
    if (typeof window !== 'undefined') {
      window.peopleModule = { init, loadDataOnce, applyFilters, state, rebindDynamic };
      // Export contacts data for contact-detail module
      window.getPeopleData = () => state.data;
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
    loadDataOnce();
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
      els.tbody.addEventListener('click', (e) => {
        // Company name click -> open Account Detail by matching domain or name
        const companyLink = e.target.closest && e.target.closest('.company-link');
        if (companyLink) {
          e.preventDefault();
          const dom = (companyLink.getAttribute('data-domain') || '').trim();
          const comp = (companyLink.getAttribute('data-company') || companyLink.textContent || '').trim();
          const acct = findAccountByDomainOrName(dom, comp);
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
        }
      });
      els.pagination.dataset.bound = '1';
    }
  }

  function handleQuickAction(btn) {
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    switch (action) {
      case 'addlist': {
        console.log('People: Add to list', { id });
        break;
      }
      case 'sequence': {
        console.log('People: Add to sequence', { id });
        break;
      }
      case 'task': {
        console.log('People: Create task', { id });
        break;
      }
      case 'ai': {
        console.log('People: Research with AI', { id });
        break;
      }
      case 'linkedin': {
        let url = btn.getAttribute('data-linkedin') || '';
        const name = btn.getAttribute('data-name') || '';
        const company = btn.getAttribute('data-company') || '';
        if (!url && (name || company)) {
          const q = encodeURIComponent([name, company].filter(Boolean).join(' '));
          url = `https://www.linkedin.com/search/results/people/?keywords=${q}`;
        }
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        console.log('People: Open LinkedIn', { id, url });
        break;
      }
      case 'website': {
        let url = btn.getAttribute('data-website') || '';
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        console.log('People: Open website', { id, url });
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
    console.log('openBulkSelectPopover called');
    if (!els.tableContainer) return;
    
    // Check if popover already exists
    const existingPopover = document.getElementById('people-bulk-popover');
    if (existingPopover) {
      console.log('Popover already exists, not creating new one');
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
    console.log('Cancel button found:', cancelBtn);
    console.log('Apply button found:', applyBtnElement);
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        console.log('Cancel button clicked');
        els.selectAll.checked = false;
        closeBulkSelectPopover();
      });
    }
    
    // Use event delegation for the Apply button
    pop.addEventListener('click', (e) => {
      console.log('Pop click detected, target:', e.target, 'target id:', e.target.id);
      if (e.target && e.target.id === 'bulk-apply') {
        console.log('Apply button clicked via delegation!', e);
        const checkedRadio = pop.querySelector('input[name="bulk-mode"]:checked');
        console.log('Checked radio:', checkedRadio);
        const mode = checkedRadio ? checkedRadio.value : 'custom';
        console.log('Apply clicked, mode:', mode);
        if (mode === 'custom') {
          const raw = parseInt(pop.querySelector('#bulk-custom-count').value || '0', 10);
          const n = Math.min(totalFiltered, Math.max(1, isNaN(raw) ? 0 : raw));
          console.log('Selecting first N:', n);
          selectFirstNFiltered(n);
        } else if (mode === 'page') {
          console.log('Selecting page items');
          const pageItems = getPageItems();
          console.log('Page items:', pageItems);
          const pageIds = pageItems.map((c) => c.id);
          console.log('Page IDs:', pageIds);
          selectIds(pageIds);
        } else if (mode === 'all') {
          console.log('Selecting all filtered');
          console.log('All filtered items:', state.filtered);
          const allIds = state.filtered.map((c) => c.id);
          console.log('All IDs:', allIds);
          selectIds(allIds);
        }
        console.log('Selected count:', state.selected.size);
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
      console.log('Add selected people to sequence:', { id, name, selected: Array.from(state.selected) });
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
            const snap = await window.firebaseDB.collection('sequences').get();
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
    console.log('selectIds called with:', ids);
    state.selected.clear();
    for (const id of ids) if (id) state.selected.add(id);
    console.log('After selection, state.selected.size:', state.selected.size);
  }

  function selectFirstNFiltered(n) {
    console.log('selectFirstNFiltered called with n:', n);
    console.log('state.filtered length:', state.filtered.length);
    const ids = state.filtered.slice(0, n).map((c) => c.id).filter(Boolean);
    console.log('Generated ids:', ids);
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
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
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
        return (c.phone || c.mobile || '');
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
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
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
          <button type="button" id="del-cancel" class="btn-cancel">Cancel</button>
          <button type="button" id="del-confirm" class="btn-danger">Delete</button>
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
    let failed = 0;
    try {
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        const ops = ids.map(async (id) => {
          try {
            await window.firebaseDB.collection('contacts').doc(id).delete();
          } catch (e) {
            failed++;
            console.warn('Delete failed for id', id, e);
          }
        });
        await Promise.all(ops);
      }
    } catch (err) {
      console.warn('Bulk delete error', err);
    } finally {
      // Remove locally either way (offline mode supported)
      const idSet = new Set(ids);
      state.data = Array.isArray(state.data) ? state.data.filter(c => !idSet.has(c.id)) : [];
      state.filtered = Array.isArray(state.filtered) ? state.filtered.filter(c => !idSet.has(c.id)) : [];
      state.selected.clear();
      render();
      hideBulkActionsBar();
      if (els.selectAll) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
      const successCount = Math.max(0, ids.length - failed);
      if (successCount > 0) {
        window.crm?.showToast && window.crm.showToast(`Deleted ${successCount} ${successCount === 1 ? 'contact' : 'contacts'}`);
      }
      if (failed > 0) {
        window.crm?.showToast && window.crm.showToast(`Failed to delete ${failed} ${failed === 1 ? 'contact' : 'contacts'}`);
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
      container.id = 'people-bulk-actions';
      container.className = 'bulk-actions-modal';
      els.tableContainer.appendChild(container);
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
    if (addListBtn) addListBtn.addEventListener('click', () => openBulkListsPanel());
    const seqBtn = container.querySelector('#bulk-sequence');
    if (seqBtn) seqBtn.addEventListener('click', () => openBulkSequencePanel());
    const exportBtn = container.querySelector('#bulk-export');
    if (exportBtn) exportBtn.addEventListener('click', () => exportSelectedToCSV());
    const deleteBtn = container.querySelector('#bulk-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => openBulkDeleteConfirm());
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
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
    // Always render pagination, even with a single page
    const current = Math.min(state.currentPage, totalPages);
    state.currentPage = current;
    const total = state.filtered.length;
    const start = total === 0 ? 0 : (current - 1) * state.pageSize + 1;
    const end = total === 0 ? 0 : Math.min(total, current * state.pageSize);

    const parts = [];
    parts.push(`<button class="page-btn" data-rel="prev" ${current === 1 ? 'disabled' : ''} aria-label="Previous page">Prev</button>`);

    // Page numbers: show window around current with first/last
    const windowSize = 1; // neighbors on each side
    const addBtn = (p) => {
      parts.push(`<button class="page-btn ${p === current ? 'active' : ''}" data-page="${p}" aria-label="Page ${p}">${p}</button>`);
    };
    const addEllipsis = () => parts.push(`<span class="page-ellipsis">…</span>`);

    if (totalPages <= 7) {
      for (let p = 1; p <= totalPages; p++) addBtn(p);
    } else {
      addBtn(1);
      if (current - windowSize > 2) addEllipsis();
      const start = Math.max(2, current - windowSize);
      const end = Math.min(totalPages - 1, current + windowSize);
      for (let p = start; p <= end; p++) addBtn(p);
      if (current + windowSize < totalPages - 1) addEllipsis();
      addBtn(totalPages);
    }

    parts.push(`<button class="page-btn" data-rel="next" ${current === totalPages ? 'disabled' : ''} aria-label="Next page">Next</button>`);

    els.pagination.innerHTML = parts.join('');

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
})();
