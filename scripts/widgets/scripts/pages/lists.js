'use strict';

// Lists page module: unified People/Accounts list view with toggle
// - Mirrors People/Accounts pages: filters, client-side filtering, pagination, selection
// - Footer pagination is pinned via CSS (#lists-page rules in main.css)
(function () {
  const state = {
    view: 'people', // 'people' | 'accounts'
    dataPeople: [],
    dataAccounts: [],
    filtered: [],
    loadedPeople: false,
    loadedAccounts: false,
    pageSize: 50,
    currentPage: 1,
    selectedPeople: new Set(),
    selectedAccounts: new Set(),
    // List detail context
    listId: null,
    listName: '',
    listKind: null, // 'people' | 'accounts'
    membersPeople: new Set(),
    membersAccounts: new Set(),
    // Chip/token filters
    chips: {
      // People filters
      title: [],
      company: [],
      pState: [],
      pEmployees: [],
      pIndustry: [],
      pDomain: [],
      // Accounts filters
      aName: [],
      aIndustry: [],
      aDomain: [],
    },
    pools: {
      // People suggestion pools
      title: [],
      company: [],
      pState: [],
      pEmployees: [],
      pIndustry: [],
      pDomain: [],
      // Accounts suggestion pools
      aName: [],
      aIndustry: [],
      aDomain: [],
    },
  };

  const els = {};

  function qs(id) { return document.getElementById(id); }

  function initDomRefs() {
    // Scope to the detail container
    els.detail = document.getElementById('lists-detail');
    if (!els.detail) return false; // not on detail UI

    els.table = els.detail.querySelector('#lists-table');
    els.theadRow = els.detail.querySelector('#lists-table thead tr');
    els.tbody = els.detail.querySelector('#lists-table tbody');
    els.tableContainer = els.detail.querySelector('.table-container');

    els.selectAll = qs('select-all-lists');
    els.pagination = qs('lists-pagination');
    els.paginationSummary = qs('lists-pagination-summary');

    els.toggleBtn = qs('toggle-lists-filters');
    els.filterPanel = qs('lists-filters');
    els.filterText = els.toggleBtn ? els.toggleBtn.querySelector('.filter-text') : null;
    els.filterBadge = qs('lists-filter-count');
    els.quickSearch = qs('lists-quick-search');

    // Header elements (top-level page header)
    els.detailTitle = qs('lists-detail-title');
    els.backBtn = qs('lists-back-btn');
    els.addContactBtn = qs('lists-add-contact-btn');
    els.addListBtn = qs('add-list-btn');
    els.switchBtn = qs('lists-switch-btn');

    // View toggle (optional in detail, may be hidden when listKind locks it)
    els.viewToggle = qs('lists-view-toggle');

    // People-like filter fields (chip-inputs)
    els.pTitle = qs('lists-filter-title');
    els.pTitleWrap = qs('lists-filter-title-chip');
    els.pTitleChips = qs('lists-filter-title-chips');
    els.pTitleClear = qs('lists-filter-title-clear');
    els.pTitleSuggest = qs('lists-filter-title-suggest');

    els.pCompany = qs('lists-filter-company');
    els.pCompanyWrap = qs('lists-filter-company-chip');
    els.pCompanyChips = qs('lists-filter-company-chips');
    els.pCompanyClear = qs('lists-filter-company-clear');
    els.pCompanySuggest = qs('lists-filter-company-suggest');

    // New People filters
    els.pState = qs('lists-filter-p-state');
    els.pStateWrap = qs('lists-filter-p-state-chip');
    els.pStateChips = qs('lists-filter-p-state-chips');
    els.pStateClear = qs('lists-filter-p-state-clear');
    els.pStateSuggest = qs('lists-filter-p-state-suggest');

    els.pEmployees = qs('lists-filter-p-employees');
    els.pEmployeesWrap = qs('lists-filter-p-employees-chip');
    els.pEmployeesChips = qs('lists-filter-p-employees-chips');
    els.pEmployeesClear = qs('lists-filter-p-employees-clear');
    els.pEmployeesSuggest = qs('lists-filter-p-employees-suggest');

    els.pIndustry = qs('lists-filter-p-industry');
    els.pIndustryWrap = qs('lists-filter-p-industry-chip');
    els.pIndustryChips = qs('lists-filter-p-industry-chips');
    els.pIndustryClear = qs('lists-filter-p-industry-clear');
    els.pIndustrySuggest = qs('lists-filter-p-industry-suggest');

    els.pDomain = qs('lists-filter-p-domain');
    els.pDomainWrap = qs('lists-filter-p-domain-chip');
    els.pDomainChips = qs('lists-filter-p-domain-chips');
    els.pDomainClear = qs('lists-filter-p-domain-clear');
    els.pDomainSuggest = qs('lists-filter-p-domain-suggest');
    els.pHasEmail = qs('lists-filter-has-email');
    els.pHasPhone = qs('lists-filter-has-phone');

    // Accounts-like filter fields (chip-inputs)
    els.aName = qs('lists-filter-acct-name');
    els.aNameWrap = qs('lists-filter-acct-name-chip');
    els.aNameChips = qs('lists-filter-acct-name-chips');
    els.aNameClear = qs('lists-filter-acct-name-clear');
    els.aNameSuggest = qs('lists-filter-acct-name-suggest');

    els.aIndustry = qs('lists-filter-industry');
    els.aIndustryWrap = qs('lists-filter-industry-chip');
    els.aIndustryChips = qs('lists-filter-industry-chips');
    els.aIndustryClear = qs('lists-filter-industry-clear');
    els.aIndustrySuggest = qs('lists-filter-industry-suggest');

    els.aDomain = qs('lists-filter-domain');
    els.aDomainWrap = qs('lists-filter-domain-chip');
    els.aDomainChips = qs('lists-filter-domain-chips');
    els.aDomainClear = qs('lists-filter-domain-clear');
    els.aDomainSuggest = qs('lists-filter-domain-suggest');
    els.aHasPhone = qs('lists-filter-acct-has-phone');

    els.applyBtn = qs('apply-lists-filters');
    els.clearBtn = qs('clear-lists-filters');

    els.peopleFiltersGrid = qs('lists-people-filters-grid');
    els.accountsFiltersGrid = qs('lists-accounts-filters-grid');

    // Ensure both grids have a default mode
    if (els.peopleFiltersGrid && !els.peopleFiltersGrid.getAttribute('data-mode')) {
      els.peopleFiltersGrid.setAttribute('data-mode', 'simple');
    }
    if (els.accountsFiltersGrid && !els.accountsFiltersGrid.getAttribute('data-mode')) {
      els.accountsFiltersGrid.setAttribute('data-mode', 'simple');
    }

    return true;
  }

  function attachEvents() {
    // Filter panel toggle
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

    // Simple/Advanced filter tabs
    if (els.filterPanel) {
      els.filterPanel.addEventListener('click', (e) => {
        const tab = e.target.closest('.filter-tab');
        if (!tab) return;
        const mode = tab.getAttribute('data-mode') || 'simple';
        const row = tab.closest('.filter-tabs-row');
        if (row) {
          row.querySelectorAll('.filter-tab').forEach((t) => {
            const active = t === tab;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
          });
        }
        if (els.peopleFiltersGrid) els.peopleFiltersGrid.setAttribute('data-mode', mode);
        if (els.accountsFiltersGrid) els.accountsFiltersGrid.setAttribute('data-mode', mode);
        state.currentPage = 1;
        applyFilters();
      });
    }

    const reFilter = debounce(() => { state.currentPage = 1; applyFilters(); }, 200);

    // Checkbox filters
    [els.pHasEmail, els.pHasPhone].forEach(chk => { if (chk) chk.addEventListener('change', reFilter); });
    if (els.aHasPhone) els.aHasPhone.addEventListener('change', reFilter);

    if (els.applyBtn) els.applyBtn.addEventListener('click', () => { state.currentPage = 1; applyFilters(); });
    if (els.clearBtn) els.clearBtn.addEventListener('click', () => { clearFilters(); state.currentPage = 1; });
    if (els.quickSearch) els.quickSearch.addEventListener('input', reFilter);

    // Chip field factory
    const setupChipField = (key, refs, poolKey) => {
      const tokens = state.chips[key];
      const input = refs.input;
      const wrap = refs.wrap;
      const chipsEl = refs.chips;
      const clearBtn = refs.clearBtn;
      const suggestEl = refs.suggest;

      const renderChips = () => {
        if (!chipsEl) return;
        chipsEl.innerHTML = tokens.map((t, idx) => `\n      <span class="chip" data-idx="${idx}">\n        <span class="chip-label">${escapeHtml(t)}</span>\n        <button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button>\n      </span>`).join('');
        chipsEl.querySelectorAll('.chip-remove').forEach((btn) => {
          btn.addEventListener('click', () => {
            const i = parseInt(btn.getAttribute('data-idx') || '-1', 10);
            if (!isNaN(i)) { tokens.splice(i, 1); renderChips(); applyFilters(); }
          });
        });
        if (clearBtn) { if (tokens.length > 0) clearBtn.removeAttribute('hidden'); else clearBtn.setAttribute('hidden', ''); }
      };

      const addToken = (label) => {
        const t = (label || '').toString().trim();
        if (!t) return;
        const exists = tokens.some((x) => normalize(x) === normalize(t));
        if (!exists) { tokens.push(t); renderChips(); }
      };
      const removeLast = () => { if (tokens.length === 0) return; tokens.pop(); renderChips(); };
      const clearAll = () => { if (tokens.length === 0) return; tokens.length = 0; renderChips(); };

      const hideSuggest = () => { if (suggestEl) suggestEl.setAttribute('hidden', ''); };
      const updateSuggest = () => {
        if (!suggestEl || !input) return;
        const q = normalize(input.value || '');
        if (!q) { hideSuggest(); return; }
        const pool = state.pools[poolKey] || [];
        const items = [];
        for (let i = 0; i < pool.length && items.length < 8; i++) {
          const s = pool[i];
          if (normalize(s).includes(q) && !tokens.some((x) => normalize(x) === normalize(s))) items.push(s);
        }
        if (items.length === 0) { hideSuggest(); return; }
        suggestEl.innerHTML = items.map((s) => `<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('');
        suggestEl.removeAttribute('hidden');
      };

      if (input) {
        input.addEventListener('input', () => updateSuggest());
        input.addEventListener('keydown', (e) => {
          const val = (input.value || '').trim();
          if (e.key === 'Enter' || e.key === ',') {
            if (val) { e.preventDefault(); addToken(val); input.value = ''; hideSuggest(); applyFilters(); }
          } else if (e.key === 'Backspace') {
            if (!val && tokens.length > 0) { e.preventDefault(); removeLast(); applyFilters(); }
          }
        });
      }
      if (wrap) {
        wrap.addEventListener('click', (ev) => { if (ev.target === wrap) input?.focus(); });
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', () => { clearAll(); if (input) input.value = ''; hideSuggest(); applyFilters(); input?.focus(); });
      }
      if (suggestEl) {
        suggestEl.addEventListener('mousedown', (e) => {
          const item = e.target.closest('[data-sugg]');
          if (!item) return;
          const label = item.getAttribute('data-sugg') || '';
          addToken(label);
          if (input) input.value = '';
          hideSuggest();
          applyFilters();
        });
      }

      // initial render
      renderChips();

      return { renderChips, addToken, removeLast, clearAll, updateSuggest, hideSuggest };
    };

    // Setup chip fields for People view
    setupChipField('title', { input: els.pTitle, wrap: els.pTitleWrap, chips: els.pTitleChips, clearBtn: els.pTitleClear, suggest: els.pTitleSuggest }, 'title');
    setupChipField('company', { input: els.pCompany, wrap: els.pCompanyWrap, chips: els.pCompanyChips, clearBtn: els.pCompanyClear, suggest: els.pCompanySuggest }, 'company');
    setupChipField('pState', { input: els.pState, wrap: els.pStateWrap, chips: els.pStateChips, clearBtn: els.pStateClear, suggest: els.pStateSuggest }, 'pState');
    setupChipField('pEmployees', { input: els.pEmployees, wrap: els.pEmployeesWrap, chips: els.pEmployeesChips, clearBtn: els.pEmployeesClear, suggest: els.pEmployeesSuggest }, 'pEmployees');
    setupChipField('pIndustry', { input: els.pIndustry, wrap: els.pIndustryWrap, chips: els.pIndustryChips, clearBtn: els.pIndustryClear, suggest: els.pIndustrySuggest }, 'pIndustry');
    setupChipField('pDomain', { input: els.pDomain, wrap: els.pDomainWrap, chips: els.pDomainChips, clearBtn: els.pDomainClear, suggest: els.pDomainSuggest }, 'pDomain');

    // Setup chip fields for Accounts view
    setupChipField('aName', { input: els.aName, wrap: els.aNameWrap, chips: els.aNameChips, clearBtn: els.aNameClear, suggest: els.aNameSuggest }, 'aName');
    setupChipField('aIndustry', { input: els.aIndustry, wrap: els.aIndustryWrap, chips: els.aIndustryChips, clearBtn: els.aIndustryClear, suggest: els.aIndustrySuggest }, 'aIndustry');
    setupChipField('aDomain', { input: els.aDomain, wrap: els.aDomainWrap, chips: els.aDomainChips, clearBtn: els.aDomainClear, suggest: els.aDomainSuggest }, 'aDomain');

    // View toggle buttons
    if (els.viewToggle) {
      els.viewToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('button.toggle-btn');
        if (!btn) return;
        const newView = btn.getAttribute('data-view');
        if (!newView || newView === state.view) return;
        // Update active styles
        els.viewToggle.querySelectorAll('.toggle-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        state.view = newView;
        state.currentPage = 1;
        updateFiltersVisibility();
        renderTableHead();
        applyFilters();
      });
    }

    if (els.backBtn) {
      els.backBtn.addEventListener('click', () => closeDetail());
    }

    if (els.addContactBtn) {
      els.addContactBtn.addEventListener('click', onAddContactClick);
    }

    // Select-all (page scope)
    if (els.selectAll) {
      els.selectAll.addEventListener('change', () => {
        toggleSelectAll(els.selectAll.checked);
      });
    }

    // Row selection via delegation
    if (els.tbody) {
      els.tbody.addEventListener('change', (e) => {
        const cb = e.target;
        if (cb && cb.classList.contains('row-select')) {
          const id = cb.getAttribute('data-id');
          if (!id) return;
          const set = (state.view === 'people') ? state.selectedPeople : state.selectedAccounts;
          if (cb.checked) set.add(id); else set.delete(id);
          const tr = cb.closest('tr');
          if (tr) tr.classList.toggle('row-selected', cb.checked);
          updateSelectAllState();
        }
      });
    }

    // Pagination
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
        if (next !== state.currentPage) { state.currentPage = next; render(); }
      });
    }
  }

  function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); }; }

  async function loadDataOnce() {
    // Load contacts
    try {
      if (window.firebaseDB) {
        if (!state.loadedPeople) {
          const snap = await window.firebaseDB.collection('contacts').limit(200).get();
          state.dataPeople = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          state.loadedPeople = true;
        }
        if (!state.loadedAccounts) {
          const snapA = await window.firebaseDB.collection('accounts').limit(200).get();
          state.dataAccounts = snapA.docs.map(d => ({ id: d.id, ...d.data() }));
          state.loadedAccounts = true;
        }
      } else {
        console.warn('Firestore not initialized');
        state.dataPeople = [];
        state.dataAccounts = [];
        state.loadedPeople = true;
        state.loadedAccounts = true;
      }
    } catch (e) {
      console.error('Failed loading lists data:', e);
      state.dataPeople = state.dataPeople || [];
      state.dataAccounts = state.dataAccounts || [];
      state.loadedPeople = true;
      state.loadedAccounts = true;
    }
    // Initial
    renderTableHead();
    // Build suggestion pools
    buildSuggestionPools();
    applyFilters();
  }

  async function fetchMembers(listId) {
    state.membersPeople = new Set();
    state.membersAccounts = new Set();
    if (!listId) return;
    try {
      if (!window.firebaseDB || typeof window.firebaseDB.collection !== 'function') return;

      // Strategy 1: subcollection lists/{listId}/members
      let gotAny = false;
      try {
        const subSnap = await window.firebaseDB.collection('lists').doc(listId).collection('members').get();
        if (subSnap && subSnap.docs && subSnap.docs.length) {
          gotAny = true;
          subSnap.docs.forEach(d => {
            const m = d.data() || {};
            const t = (m.targetType || m.type || '').toLowerCase();
            const id = m.targetId || m.id || d.id;
            if (t === 'people' || t === 'contact' || t === 'contacts') state.membersPeople.add(id);
            else if (t === 'accounts' || t === 'account') state.membersAccounts.add(id);
          });
        }
      } catch {}

      // Strategy 2: top-level listMembers where listId == listId
      if (!gotAny) {
        try {
          const lmSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).limit(1000).get();
          if (lmSnap && lmSnap.docs) {
            lmSnap.docs.forEach(d => {
              const m = d.data() || {};
              const t = (m.targetType || m.type || '').toLowerCase();
              const id = m.targetId || m.id || d.id;
              if (t === 'people' || t === 'contact' || t === 'contacts') state.membersPeople.add(id);
              else if (t === 'accounts' || t === 'account') state.membersAccounts.add(id);
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn('Failed to load list members', err);
    }
  }

  function updateFiltersVisibility() {
    if (els.peopleFiltersGrid && els.accountsFiltersGrid) {
      const isPeople = state.view === 'people';
      els.peopleFiltersGrid.hidden = !isPeople;
      els.accountsFiltersGrid.hidden = isPeople ? true : false;
    }
  }

  function normalize(s) { return (s || '').toString().trim().toLowerCase(); }

  function applyFilters() {
    // Quick search across visible columns
    const q = normalize(els.quickSearch ? els.quickSearch.value : '');

    let count = 0;
    if (state.view === 'people') {
      const titleTokens = (state.chips.title || []).map(normalize).filter(Boolean);
      const companyTokens = (state.chips.company || []).map(normalize).filter(Boolean);
      const stateTokens = (state.chips.pState || []).map(normalize).filter(Boolean);
      const employeesTokens = (state.chips.pEmployees || []).map(normalize).filter(Boolean);
      const industryTokens = (state.chips.pIndustry || []).map(normalize).filter(Boolean);
      const domainTokens = (state.chips.pDomain || []).map(normalize).filter(Boolean);
      const mustEmail = !!(els.pHasEmail && els.pHasEmail.checked);
      const mustPhone = !!(els.pHasPhone && els.pHasPhone.checked);

      // Badge
      if (els.filterBadge) {
        count = [titleTokens.length, companyTokens.length, stateTokens.length, employeesTokens.length, industryTokens.length, domainTokens.length]
          .filter((n) => n > 0).length + (mustEmail ? 1 : 0) + (mustPhone ? 1 : 0);
        if (count > 0) { els.filterBadge.textContent = String(count); els.filterBadge.hidden = false; }
        else { els.filterBadge.hidden = true; }
      }

      const qMatch = (str) => !q || normalize(str).includes(q);
      const tokenMatch = (tokens) => (str) => { if (!tokens || tokens.length === 0) return true; const n = normalize(str); return tokens.some((t) => n.includes(t)); };
      const titleMatch = tokenMatch(titleTokens);
      const companyMatch = tokenMatch(companyTokens);
      const stateMatch = tokenMatch(stateTokens);
      const employeesMatch = tokenMatch(employeesTokens);
      const industryMatch = tokenMatch(industryTokens);
      const domainMatch = tokenMatch(domainTokens);

      let base = state.dataPeople.filter(c => {
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || (c.name || '');
        const hasEmail = !!c.email;
        const hasPhone = !!(c.phone || c.mobile);
        const st = c.state || c.addressState || c.region || c.location || '';
        const emp = c.companyEmployees || c.employees || '';
        const ind = c.industry || c.companyIndustry || '';
        const dom = c.companyDomain || (c.email ? (c.email.split('@')[1] || '') : '') || '';
        return (
          (qMatch(fullName) || qMatch(c.title) || qMatch(c.companyName) || qMatch(c.email) || qMatch(c.phone) || qMatch(c.mobile) || qMatch(ind) || qMatch(dom) || qMatch(st) || qMatch(emp)) &&
          titleMatch(c.title) && companyMatch(c.companyName) && stateMatch(st) && employeesMatch(emp) && industryMatch(ind) && domainMatch(dom) &&
          (!mustEmail || hasEmail) && (!mustPhone || hasPhone)
        );
      });
      // Filter by list membership if in detail mode
      if (state.listId) {
        base = base.filter(c => state.membersPeople.has(c.id) || (Array.isArray(c.listIds) && c.listIds.includes(state.listId)));
      }
      state.filtered = base;
    } else {
      // accounts view
      const nameTokens = (state.chips.aName || []).map(normalize).filter(Boolean);
      const industryTokens = (state.chips.aIndustry || []).map(normalize).filter(Boolean);
      const domainTokens = (state.chips.aDomain || []).map(normalize).filter(Boolean);
      const mustPhone = !!(els.aHasPhone && els.aHasPhone.checked);

      if (els.filterBadge) {
        count = [nameTokens.length, industryTokens.length, domainTokens.length].filter((n) => n > 0).length + (mustPhone ? 1 : 0);
        if (count > 0) { els.filterBadge.textContent = String(count); els.filterBadge.hidden = false; }
        else { els.filterBadge.hidden = true; }
      }

      const qMatch = (str) => !q || normalize(str).includes(q);
      const tokenMatch = (tokens) => (str) => { if (!tokens || tokens.length === 0) return true; const n = normalize(str); return tokens.some((t) => n.includes(t)); };
      const nameMatch = tokenMatch(nameTokens);
      const industryMatch = tokenMatch(industryTokens);
      const domainMatch = tokenMatch(domainTokens);

      let base = state.dataAccounts.filter(a => {
        const acct = a.accountName || a.name || '';
        const hasPhone = !!a.phone;
        return (
          (qMatch(acct) || qMatch(a.industry) || qMatch(a.domain) || qMatch(a.location)) &&
          nameMatch(acct) && industryMatch(a.industry) && domainMatch(a.domain) && (!mustPhone || hasPhone)
        );
      });
      if (state.listId) {
        base = base.filter(a => state.membersAccounts.has(a.id) || (Array.isArray(a.listIds) && a.listIds.includes(state.listId)));
      }
      state.filtered = base;
    }

    state.currentPage = 1;
    render();
  }

  function clearFilters() {
    if (state.view === 'people') {
      // Clear tokens and inputs
      state.chips.title = [];
      state.chips.company = [];
      state.chips.pState = [];
      state.chips.pEmployees = [];
      state.chips.pIndustry = [];
      state.chips.pDomain = [];
      if (els.pTitle) els.pTitle.value = '';
      if (els.pCompany) els.pCompany.value = '';
      if (els.pState) els.pState.value = '';
      if (els.pEmployees) els.pEmployees.value = '';
      if (els.pIndustry) els.pIndustry.value = '';
      if (els.pDomain) els.pDomain.value = '';
      if (els.pTitleChips) els.pTitleChips.innerHTML = '';
      if (els.pCompanyChips) els.pCompanyChips.innerHTML = '';
      if (els.pStateChips) els.pStateChips.innerHTML = '';
      if (els.pEmployeesChips) els.pEmployeesChips.innerHTML = '';
      if (els.pIndustryChips) els.pIndustryChips.innerHTML = '';
      if (els.pDomainChips) els.pDomainChips.innerHTML = '';
      if (els.pTitleClear) els.pTitleClear.setAttribute('hidden', '');
      if (els.pCompanyClear) els.pCompanyClear.setAttribute('hidden', '');
      if (els.pStateClear) els.pStateClear.setAttribute('hidden', '');
      if (els.pEmployeesClear) els.pEmployeesClear.setAttribute('hidden', '');
      if (els.pIndustryClear) els.pIndustryClear.setAttribute('hidden', '');
      if (els.pDomainClear) els.pDomainClear.setAttribute('hidden', '');
      if (els.pHasEmail) els.pHasEmail.checked = false;
      if (els.pHasPhone) els.pHasPhone.checked = false;
    } else {
      state.chips.aName = [];
      state.chips.aIndustry = [];
      state.chips.aDomain = [];
      if (els.aName) els.aName.value = '';
      if (els.aIndustry) els.aIndustry.value = '';
      if (els.aDomain) els.aDomain.value = '';
      if (els.aNameChips) els.aNameChips.innerHTML = '';
      if (els.aIndustryChips) els.aIndustryChips.innerHTML = '';
      if (els.aDomainChips) els.aDomainChips.innerHTML = '';
      if (els.aNameClear) els.aNameClear.setAttribute('hidden', '');
      if (els.aIndustryClear) els.aIndustryClear.setAttribute('hidden', '');
      if (els.aDomainClear) els.aDomainClear.setAttribute('hidden', '');
      if (els.aHasPhone) els.aHasPhone.checked = false;
    }
    if (els.quickSearch) els.quickSearch.value = '';
    applyFilters();
  }

  function render() {
    if (!els.tbody) return;
    const pageItems = getPageItems();
    const rows = pageItems.map((item) => state.view === 'people' ? rowHtmlPeople(item) : rowHtmlAccount(item)).join('');
    els.tbody.innerHTML = rows || emptyHtml();
    // After render, sync checkboxes and select-all
    updateRowsCheckedState();
    updateSelectAllState();
    renderPagination();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function coerceDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'object' && typeof val.toDate === 'function') {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (val && typeof val.seconds === 'number') {
      const ms = val.seconds * 1000 + (typeof val.nanoseconds === 'number' ? Math.floor(val.nanoseconds / 1e6) : 0);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'number') {
      const d = new Date(val > 1e12 ? val : val * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
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

  function rowHtmlPeople(c) {
    const id = c.id || '';
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || escapeHtml(c.name || '');
    const title = escapeHtml(c.title || '');
    const company = escapeHtml(c.companyName || '');
    const email = escapeHtml(c.email || '');
    const phone = escapeHtml(c.phone || c.mobile || '');
    const updatedStr = escapeHtml(formatDateOrNA(c.updatedAt, c.createdAt));
    const checked = state.selectedPeople.has(id) ? ' checked' : '';
    const rowClass = state.selectedPeople.has(id) ? ' class="row-selected"' : '';
    return `\n<tr${rowClass}>\n  <td class="col-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(id)}" aria-label="Select"${checked}></td>\n  <td>${fullName}</td>\n  <td>${title}</td>\n  <td>${company}</td>\n  <td>${email}</td>\n  <td>${phone}</td>\n  <td>${updatedStr}</td>\n</tr>`;
  }

  function rowHtmlAccount(a) {
    const id = a.id || '';
    const acct = escapeHtml(a.accountName || a.name || '');
    const industry = escapeHtml(a.industry || '');
    const domain = escapeHtml(a.domain || '');
    const phone = escapeHtml(a.phone || '');
    const ced = escapeHtml(formatDateOrNA(a.contractEndDate));
    const sqft = escapeHtml(a.squareFeet || a.sqft || '');
    const occ = escapeHtml(a.occupancyPct || a.occupancy || '');
    const employees = escapeHtml(a.employees || '');
    const location = escapeHtml(a.location || '');
    const updatedStr = escapeHtml(formatDateOrNA(a.updatedAt, a.createdAt));
    const checked = state.selectedAccounts.has(id) ? ' checked' : '';
    const rowClass = state.selectedAccounts.has(id) ? ' class="row-selected"' : '';
    // Keep Quick Actions column empty for now (future enhancement)
    return `\n<tr${rowClass}>\n  <td class="col-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(id)}" aria-label="Select"${checked}></td>\n  <td>${acct}</td>\n  <td>${industry}</td>\n  <td>${domain}</td>\n  <td>${phone}</td>\n  <td>${ced}</td>\n  <td>${sqft}</td>\n  <td>${occ}</td>\n  <td>${employees}</td>\n  <td>${location}</td>\n  <td></td>\n  <td>${updatedStr}</td>\n</tr>`;
  }

  function emptyHtml() {
    // Centered message if absolutely no data across both views; otherwise per-view message
    const noPeople = state.dataPeople.length === 0;
    const noAccounts = state.dataAccounts.length === 0;
    if (noPeople && noAccounts) {
      return `\n<tr>\n  <td colspan="12" style="opacity:.8;text-align:center;padding:16px;">No list created yet, create your first list.</td>\n</tr>`;
    }
    const cols = state.view === 'people' ? 7 : 12;
    return `\n<tr>\n  <td colspan="${cols}" style="opacity:.75">No records found.</td>\n</tr>`;
  }

  function renderTableHead() {
    if (!els.theadRow) return;
    if (state.view === 'people') {
      els.theadRow.innerHTML = `
        <th class="col-select"><input type="checkbox" id="select-all-lists" aria-label="Select all"></th>
        <th>Name</th>
        <th>Title</th>
        <th>Company</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Updated</th>`;
    } else {
      els.theadRow.innerHTML = `
        <th class="col-select"><input type="checkbox" id="select-all-lists" aria-label="Select all"></th>
        <th>Account</th>
        <th>Industry</th>
        <th>Domain</th>
        <th>Phone</th>
        <th>Contract End Date</th>
        <th>Sq Ft</th>
        <th>Occupancy %</th>
        <th>Employees</th>
        <th>Location</th>
        <th>Quick Actions</th>
        <th>Updated</th>`;
    }
    // Rebind select-all reference after head swap
    els.selectAll = qs('select-all-lists');
    if (els.selectAll) {
      els.selectAll.addEventListener('change', () => toggleSelectAll(els.selectAll.checked));
    }
  }

  function updateRowsCheckedState() {
    if (!els.tbody) return;
    const set = state.view === 'people' ? state.selectedPeople : state.selectedAccounts;
    els.tbody.querySelectorAll('input.row-select').forEach(cb => {
      const id = cb.getAttribute('data-id');
      const isSel = id && set.has(id);
      cb.checked = !!isSel;
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('row-selected', !!isSel);
    });
  }

  function updateSelectAllState() {
    if (!els.selectAll) return;
    const visible = getPageItems();
    if (visible.length === 0) {
      els.selectAll.checked = false;
      els.selectAll.indeterminate = false;
      return;
    }
    const set = state.view === 'people' ? state.selectedPeople : state.selectedAccounts;
    let selectedVisible = 0;
    for (const item of visible) if (set.has(item.id)) selectedVisible++;
    if (selectedVisible === 0) { els.selectAll.checked = false; els.selectAll.indeterminate = false; }
    else if (selectedVisible === visible.length) { els.selectAll.checked = true; els.selectAll.indeterminate = false; }
    else { els.selectAll.checked = false; els.selectAll.indeterminate = true; }
  }

  function toggleSelectAll(checked) {
    const set = state.view === 'people' ? state.selectedPeople : state.selectedAccounts;
    const items = getPageItems();
    items.forEach(it => { if (checked) set.add(it.id); else set.delete(it.id); });
    render();
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

    const parts = [];
    parts.push(`<button class="page-btn" data-rel="prev" ${current === 1 ? 'disabled' : ''} aria-label="Previous page">Prev</button>`);

    const windowSize = 1;
    const addBtn = (p) => { parts.push(`<button class=\"page-btn ${p === current ? 'active' : ''}\" data-page=\"${p}\" aria-label=\"Page ${p}\">${p}</button>`); };
    const addEllipsis = () => parts.push(`<span class="page-ellipsis">…</span>`);

    if (totalPages <= 7) { for (let p = 1; p <= totalPages; p++) addBtn(p); }
    else {
      addBtn(1);
      if (current - windowSize > 2) addEllipsis();
      const startP = Math.max(2, current - windowSize);
      const endP = Math.min(totalPages - 1, current + windowSize);
      for (let p = startP; p <= endP; p++) addBtn(p);
      if (current + windowSize < totalPages - 1) addEllipsis();
      addBtn(totalPages);
    }

    parts.push(`<button class="page-btn" data-rel="next" ${current === totalPages ? 'disabled' : ''} aria-label="Next page">Next</button>`);

    els.pagination.innerHTML = parts.join('');

    if (els.paginationSummary) {
      const label = state.view === 'people' ? (total === 1 ? 'contact' : 'contacts') : (total === 1 ? 'account' : 'accounts');
      const listLabel = state.listName ? ` in “${state.listName}”` : '';
      els.paginationSummary.textContent = `Showing ${start}\u2013${end} of ${total} ${label}${listLabel}`;
    }
  }

  function showDetailUI(show) {
    const pageContent = document.querySelector('#lists-page .page-content');
    const empty = document.getElementById('lists-empty-state');
    const detail = document.getElementById('lists-detail');
    if (detail) detail.hidden = !show;
    if (pageContent) {
      if (show) {
        pageContent.classList.remove('lists-grid');
      } else {
        pageContent.classList.add('lists-grid');
      }
    }
    if (empty) empty.hidden = true; // keep empty state hidden during transitions
  }

  function updateHeaderForMode(isDetail) {
    // Title
    if (els.detailTitle) els.detailTitle.textContent = isDetail ? (state.listName || 'List') : 'Lists';
    // Back button
    if (els.backBtn) {
      if (isDetail) els.backBtn.removeAttribute('hidden');
      else els.backBtn.setAttribute('hidden', '');
    }
    // Show/hide detail controls
    if (els.viewToggle) {
      // Hide the view toggle when viewing an individual list; show on overview
      if (isDetail) {
        els.viewToggle.setAttribute('hidden', '');
      } else {
        els.viewToggle.removeAttribute('hidden');
      }
    }
    if (els.quickSearch) {
      if (isDetail) els.quickSearch.setAttribute('hidden', '');
      else els.quickSearch.removeAttribute('hidden');
    }
    if (els.toggleBtn) {
      if (isDetail) els.toggleBtn.removeAttribute('hidden');
      else {
        els.toggleBtn.setAttribute('hidden', '');
        // Ensure filter panel is closed and text reset
        if (els.filterPanel) els.filterPanel.setAttribute('hidden', '');
        if (els.filterText) els.filterText.textContent = 'Show Filters';
        if (els.filterBadge) els.filterBadge.hidden = true;
      }
    }
    // Overview-only controls
    if (els.addListBtn) {
      if (isDetail) els.addListBtn.setAttribute('hidden', '');
      else els.addListBtn.removeAttribute('hidden');
    }
    if (els.switchBtn) {
      if (isDetail) els.switchBtn.setAttribute('hidden', '');
      else els.switchBtn.removeAttribute('hidden');
    }
    // Detail-only controls
    if (els.addContactBtn) {
      if (isDetail && state.view === 'people') {
        els.addContactBtn.removeAttribute('hidden');
      } else {
        els.addContactBtn.setAttribute('hidden', '');
      }
    }
  }

  function onAddContactClick() {
    // Ensure we're in detail mode with a list context
    if (!state.listId) {
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Open a list to add contacts to it.');
      } else {
        alert('Open a list to add contacts to it.');
      }
      return;
    }
    // Stash context for modal consumers
    try {
      if (!window.crm) window.crm = {};
      window.crm.modalContext = {
        type: 'add-contact',
        listId: state.listId,
        listName: state.listName,
        listKind: state.listKind || 'people'
      };
    } catch {}
    // Invoke modal (fallback to toast)
    if (window.crm && typeof window.crm.showModal === 'function') {
      window.crm.showModal('add-contact');
    } else if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast(`Add Contact to “${state.listName || 'List'}”`);
    } else {
      alert(`Add Contact to "${state.listName || 'List'}"`);
    }
  }

  async function openDetail(opts) {
    state.listId = opts?.id || null;
    state.listName = opts?.name || '';
    state.listKind = (opts?.kind === 'accounts' || opts?.kind === 'people') ? opts.kind : null;
    if (state.listKind) state.view = state.listKind; // lock view to list type
    updateHeaderForMode(true);
    // Update toggle appearance
    if (els.viewToggle) {
      els.viewToggle.querySelectorAll('.toggle-btn').forEach(b => {
        const v = b.getAttribute('data-view');
        const active = v === state.view;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
        // If listKind is locked, hide the other toggle
        if (state.listKind && v !== state.listKind) b.style.display = 'none';
      });
    }
    showDetailUI(true);
    if (!state.loadedPeople || !state.loadedAccounts) await loadDataOnce();
    await fetchMembers(state.listId);
    state.currentPage = 1;
    renderTableHead();
    applyFilters();
  }

  function closeDetail() {
    state.listId = null;
    state.listName = '';
    state.listKind = null;
    state.membersPeople = new Set();
    state.membersAccounts = new Set();
    // Restore toggle buttons
    if (els.viewToggle) {
      els.viewToggle.querySelectorAll('.toggle-btn').forEach(b => { b.style.display = ''; });
    }
    updateHeaderForMode(false);
    showDetailUI(false);
  }

  function init() {
    if (!initDomRefs()) return; // detail UI not present
    updateFiltersVisibility();
    attachEvents();
    loadDataOnce();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose programmatic API for Lists Overview to open/close detail view
  window.ListsView = {
    open: openDetail,
    close: closeDetail,
  };

  // ===== Suggestion pool builders =====
  function buildSuggestionPools() {
    // Build people pools
    const dedupe = (arr, limit = 2000) => {
      const set = new Set(); const out = [];
      for (const v of arr) {
        const s = (v || '').toString().trim(); if (!s) continue;
        const key = normalize(s); if (set.has(key)) continue; set.add(key); out.push(s); if (out.length >= limit) break;
      }
      return out;
    };
    try {
      state.pools.title = dedupe(state.dataPeople.map(c => c.title || ''));
      state.pools.company = dedupe(state.dataPeople.map(c => c.companyName || ''));
      state.pools.pState = dedupe(state.dataPeople.map(c => c.state || c.addressState || c.region || c.location || ''));
      state.pools.pEmployees = dedupe(state.dataPeople.map(c => c.companyEmployees || c.employees || ''));
      state.pools.pIndustry = dedupe(state.dataPeople.map(c => c.industry || c.companyIndustry || ''));
      state.pools.pDomain = dedupe(state.dataPeople.map(c => c.companyDomain || (c.email ? (c.email.split('@')[1] || '') : '') || ''));
    } catch {}
    try {
      state.pools.aName = dedupe(state.dataAccounts.map(a => a.accountName || a.name || ''));
      state.pools.aIndustry = dedupe(state.dataAccounts.map(a => a.industry || ''));
      state.pools.aDomain = dedupe(state.dataAccounts.map(a => a.domain || ''));
    } catch {}
  }
})();
