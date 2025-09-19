'use strict';

// List Detail page module: displays members of a specific list
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
      title: [],
      company: [],
      city: [],
      state: [],
      employees: [],
      industry: [],
      visitorDomain: [],
      seniority: [],
      department: [],
    },
    pools: {
      title: [],
      company: [],
      city: [],
      state: [],
      employees: [],
      industry: [],
      visitorDomain: [],
      seniority: [],
      department: [],
    },
    flags: { hasEmail: false, hasPhone: false },
  };

  const els = {};

  // Column order for List Detail table headers (draggable)
  const DEFAULT_PEOPLE_COL_ORDER = ['select', 'name', 'title', 'company', 'email', 'phone', 'location', 'actions', 'updated'];
  const DEFAULT_ACCOUNTS_COL_ORDER = ['select', 'name', 'industry', 'domain', 'phone', 'updated'];
  
  const PEOPLE_COL_STORAGE_KEY = 'list_detail_people_column_order';
  const ACCOUNTS_COL_STORAGE_KEY = 'list_detail_accounts_column_order';
  
  let peopleColumnOrder = DEFAULT_PEOPLE_COL_ORDER.slice();
  let accountsColumnOrder = DEFAULT_ACCOUNTS_COL_ORDER.slice();
  
  function loadColumnOrder() {
    try {
      const peopleRaw = localStorage.getItem(PEOPLE_COL_STORAGE_KEY);
      if (peopleRaw) {
        const peopleArr = JSON.parse(peopleRaw);
        if (Array.isArray(peopleArr)) {
          peopleColumnOrder = peopleArr.filter(col => DEFAULT_PEOPLE_COL_ORDER.includes(col));
          // Add any missing columns
          DEFAULT_PEOPLE_COL_ORDER.forEach(col => {
            if (!peopleColumnOrder.includes(col)) {
              peopleColumnOrder.push(col);
            }
          });
        }
      }
      
      const accountsRaw = localStorage.getItem(ACCOUNTS_COL_STORAGE_KEY);
      if (accountsRaw) {
        const accountsArr = JSON.parse(accountsRaw);
        if (Array.isArray(accountsArr)) {
          accountsColumnOrder = accountsArr.filter(col => DEFAULT_ACCOUNTS_COL_ORDER.includes(col));
          // Add any missing columns
          DEFAULT_ACCOUNTS_COL_ORDER.forEach(col => {
            if (!accountsColumnOrder.includes(col)) {
              accountsColumnOrder.push(col);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load column order:', e);
    }
  }
  
  function persistColumnOrder() {
    try {
      localStorage.setItem(PEOPLE_COL_STORAGE_KEY, JSON.stringify(peopleColumnOrder));
      localStorage.setItem(ACCOUNTS_COL_STORAGE_KEY, JSON.stringify(accountsColumnOrder));
    } catch (e) {
      console.warn('Failed to persist column order:', e);
    }
  }

  function qs(id) { return document.getElementById(id); }

  function initDomRefs() {
    // Scope to the detail page
    els.page = document.getElementById('list-detail-page');
    if (!els.page) {
      console.log('[ListDetail] #list-detail-page not found');
      return false;
    }

    els.table = qs('list-detail-table');
    els.theadRow = els.table ? els.table.querySelector('thead tr') : null;
    els.tbody = els.table ? els.table.querySelector('tbody') : null;
    els.tableContainer = qs('list-detail-table')?.closest('.table-container');

    els.selectAll = qs('select-all-list-detail');
    els.pagination = qs('list-detail-pagination');
    els.paginationSummary = qs('list-detail-pagination-summary');

    els.toggleBtn = qs('list-detail-filters-btn');
    els.filterPanel = qs('list-detail-filters');
    els.filterText = els.toggleBtn ? els.toggleBtn.querySelector('.filter-text') : null;
    els.quickSearch = qs('list-detail-quick-search');

    // Header elements
    els.detailTitle = qs('list-detail-title');
    els.backBtn = qs('list-detail-back-btn');
    els.contactSearch = qs('list-detail-contact-search');
    els.contactsBtn = qs('list-detail-contacts-btn');

    // View toggle
    els.viewToggle = qs('list-detail-view-toggle');

    // Filter fields
    els.pTitle = qs('list-detail-filter-title');
    els.pTitleWrap = qs('list-detail-filter-title-chip');
    els.pTitleChips = qs('list-detail-filter-title-chips');
    els.pTitleClear = qs('list-detail-filter-title-clear');
    els.pTitleSuggest = qs('list-detail-filter-title-suggest');

    els.pCompany = qs('list-detail-filter-company');
    els.pCompanyWrap = qs('list-detail-filter-company-chip');
    els.pCompanyChips = qs('list-detail-filter-company-chips');
    els.pCompanyClear = qs('list-detail-filter-company-clear');
    els.pCompanySuggest = qs('list-detail-filter-company-suggest');

    // Seniority
    els.pSeniority = qs('list-detail-filter-seniority');
    els.pSeniorityWrap = qs('list-detail-filter-seniority-chip');
    els.pSeniorityChips = qs('list-detail-filter-seniority-chips');
    els.pSeniorityClear = qs('list-detail-filter-seniority-clear');
    els.pSenioritySuggest = qs('list-detail-filter-seniority-suggest');

    // New fields
    els.pCity = qs('list-detail-filter-city');
    els.pCityWrap = qs('list-detail-filter-city-chip');
    els.pCityChips = qs('list-detail-filter-city-chips');
    els.pCityClear = qs('list-detail-filter-city-clear');
    els.pCitySuggest = qs('list-detail-filter-city-suggest');

    els.pState = qs('list-detail-filter-state');
    els.pStateWrap = qs('list-detail-filter-state-chip');
    els.pStateChips = qs('list-detail-filter-state-chips');
    els.pStateClear = qs('list-detail-filter-state-clear');
    els.pStateSuggest = qs('list-detail-filter-state-suggest');

    els.pEmployees = qs('list-detail-filter-employees');
    els.pEmployeesWrap = qs('list-detail-filter-employees-chip');
    els.pEmployeesChips = qs('list-detail-filter-employees-chips');
    els.pEmployeesClear = qs('list-detail-filter-employees-clear');
    els.pEmployeesSuggest = qs('list-detail-filter-employees-suggest');

    els.pIndustry = qs('list-detail-filter-industry');
    els.pIndustryWrap = qs('list-detail-filter-industry-chip');
    els.pIndustryChips = qs('list-detail-filter-industry-chips');
    els.pIndustryClear = qs('list-detail-filter-industry-clear');
    els.pIndustrySuggest = qs('list-detail-filter-industry-suggest');

    els.pVisitorDomain = qs('list-detail-filter-visitor-domain');
    els.pVisitorDomainWrap = qs('list-detail-filter-visitor-domain-chip');
    els.pVisitorDomainChips = qs('list-detail-filter-visitor-domain-chips');
    els.pVisitorDomainClear = qs('list-detail-filter-visitor-domain-clear');
    els.pVisitorDomainSuggest = qs('list-detail-filter-visitor-domain-suggest');

    // Department
    els.pDepartment = qs('list-detail-filter-department');
    els.pDepartmentWrap = qs('list-detail-filter-department-chip');
    els.pDepartmentChips = qs('list-detail-filter-department-chips');
    els.pDepartmentClear = qs('list-detail-filter-department-clear');
    els.pDepartmentSuggest = qs('list-detail-filter-department-suggest');

    els.pHasEmail = qs('list-detail-filter-has-email');
    els.pHasPhone = qs('list-detail-filter-has-phone');

    console.log('[ListDetail] DOM refs initialized:', {
      page: !!els.page,
      table: !!els.table,
      theadRow: !!els.theadRow,
      tbody: !!els.tbody
    });

    return true;
  }

  function attachEvents() {
    // Back button
    if (els.backBtn) {
      els.backBtn.addEventListener('click', () => {
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('lists');
        }
      });
    }

    // Contacts button
    if (els.contactsBtn) {
      els.contactsBtn.addEventListener('click', () => openContactsModal());
    }

    // Quick search
    if (els.quickSearch) {
      els.quickSearch.addEventListener('input', () => applyFilters());
    }

    // View toggle
    if (els.viewToggle) {
      els.viewToggle.addEventListener('click', (e) => {
        if (e.target.matches('.toggle-btn')) {
          const newView = e.target.getAttribute('data-view');
          if (newView && newView !== state.view) {
            state.view = newView;
            updateViewToggle();
            renderTableHead();
            applyFilters();
            // Reset selection across view switch
            hideBulkActionsBar();
            if (state.view === 'people') state.selectedAccounts.clear();
            else state.selectedPeople.clear();
            updateHeaderSelectAll();
          }
        }
      });
    }

    // Toggle filters panel
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

    // Clickable names and companies - use event delegation
    if (els.tbody) {
      els.tbody.addEventListener('click', (e) => {
        const anchor = e.target.closest('a, .name-cell, .company-link');
        if (!anchor) return;
        // Handle contact name clicks
        if (anchor.matches('.name-cell[data-contact-id]')) {
          e.preventDefault();
          const contactId = anchor.getAttribute('data-contact-id');
          const contactName = anchor.getAttribute('data-contact-name');
          if (contactId) {
            // Store navigation context for back button
            window._contactNavigationSource = 'list-detail';
            window._contactNavigationListId = state.listId;
            window._contactNavigationListName = state.listName;
            
            // Navigate via existing people route to ensure modules are bound, then open detail immediately
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              requestAnimationFrame(() => {
                if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                  window.ContactDetail.show(contactId);
                }
              });
            }
          }
        }
        
        // Handle company name clicks (for contacts)
        if (anchor.matches('.company-link[data-company-name]') && !anchor.hasAttribute('data-account-id')) {
          e.preventDefault();
          const companyName = anchor.getAttribute('data-company-name');
          if (companyName) {
            // Find the account by name
            const account = state.dataAccounts.find(acc => acc.accountName === companyName || acc.name === companyName);
            if (account) {
              // Store navigation context for back button
              window._accountNavigationSource = 'list-detail';
              window._accountNavigationListId = state.listId;
              window._accountNavigationListName = state.listName;
              window._accountNavigationListView = 'people';
              
              // Prefetch account object and open detail immediately
              try { window._prefetchedAccountForDetail = account; } catch (_) {}
              if (window.showAccountDetail && typeof window.showAccountDetail === 'function') {
                window.showAccountDetail(account.id);
              } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
                // Fallback: go to accounts page
                window.crm.navigateToPage('accounts');
              }
            }
          }
        }
        
        // Handle account name clicks (for accounts view)
        if (anchor.matches('.company-link[data-account-id]')) {
          e.preventDefault();
          const accountId = anchor.getAttribute('data-account-id');
          const accountName = anchor.getAttribute('data-account-name');
          if (accountId) {
            // Store navigation context for back button
            window._accountNavigationSource = 'list-detail';
            window._accountNavigationListId = state.listId;
            window._accountNavigationListName = state.listName;
            window._accountNavigationListView = 'accounts';
            
            // Prefetch account object if available and open detail immediately
            try {
              const acct = (state.dataAccounts || []).find(a => a.id === accountId);
              if (acct) window._prefetchedAccountForDetail = acct;
            } catch (_) {}
            if (window.showAccountDetail && typeof window.showAccountDetail === 'function') {
              window.showAccountDetail(accountId);
            } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('accounts');
            }
          }
        }
      });
    }

    // Apply / Clear buttons
    const applyBtn = document.getElementById('list-detail-apply-filters');
    const clearBtn = document.getElementById('list-detail-clear-filters');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        try {
          // Sync DOM chip state to internal state
          const t = Array.from(document.querySelectorAll('#list-detail-filter-title-chips .chip'))
            .map(ch => ch.textContent.replace('×','').trim()).filter(Boolean);
          const c = Array.from(document.querySelectorAll('#list-detail-filter-company-chips .chip'))
            .map(ch => ch.textContent.replace('×','').trim()).filter(Boolean);
          state.chips.title = t;
          state.chips.company = c;
          const city = Array.from(document.querySelectorAll('#list-detail-filter-city-chips .chip'))
            .map(ch => ch.textContent.replace('×','').trim()).filter(Boolean);
          const st = Array.from(document.querySelectorAll('#list-detail-filter-state-chips .chip'))
            .map(ch => ch.textContent.replace('×','').trim()).filter(Boolean);
          const emp = Array.from(document.querySelectorAll('#list-detail-filter-employees-chips .chip'))
            .map(ch => ch.textContent.replace('×','').trim()).filter(Boolean);
          const ind = Array.from(document.querySelectorAll('#list-detail-filter-industry-chips .chip'))
            .map(ch => ch.textContent.replace('×','').trim()).filter(Boolean);
          const dom = Array.from(document.querySelectorAll('#list-detail-filter-visitor-domain-chips .chip'))
            .map(ch => ch.textContent.replace('×','').trim()).filter(Boolean);
          state.chips.city = city; state.chips.state = st; state.chips.employees = emp; state.chips.industry = ind; state.chips.visitorDomain = dom;
          state.flags.hasEmail = !!(els.pHasEmail && els.pHasEmail.checked);
          state.flags.hasPhone = !!(els.pHasPhone && els.pHasPhone.checked);
        } catch(_) {}
        applyFilters();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        try {
          state.chips.title = [];
          state.chips.company = [];
          state.chips.city = [];
          state.chips.state = [];
          state.chips.employees = [];
          state.chips.industry = [];
          state.chips.visitorDomain = [];
          state.flags.hasEmail = false;
          state.flags.hasPhone = false;
          window.__listDetailState = window.__listDetailState || {};
          window.__listDetailState.titleChips = [];
          window.__listDetailState.companyChips = [];
          window.__listDetailState.cityChips = [];
          window.__listDetailState.stateChips = [];
          window.__listDetailState.employeesChips = [];
          window.__listDetailState.industryChips = [];
          window.__listDetailState.visitorDomainChips = [];
          renderTitleChips();
          renderCompanyChips();
          renderCityChips();
          renderStateChips();
          renderEmployeesChips();
          renderIndustryChips();
          renderVisitorDomainChips();
          if (els.pTitle) els.pTitle.value = '';
          if (els.pCompany) els.pCompany.value = '';
          if (els.pCity) els.pCity.value = '';
          if (els.pState) els.pState.value = '';
          if (els.pEmployees) els.pEmployees.value = '';
          if (els.pIndustry) els.pIndustry.value = '';
          if (els.pVisitorDomain) els.pVisitorDomain.value = '';
          if (els.pHasEmail) els.pHasEmail.checked = false;
          if (els.pHasPhone) els.pHasPhone.checked = false;
          hideTitleSuggestions();
          hideCompanySuggestions();
          hideCitySuggestions();
          hideStateSuggestions();
          hideEmployeesSuggestions();
          hideIndustrySuggestions();
          hideVisitorDomainSuggestions();
        } catch(_) {}
        applyFilters();
      });
    }

    // Chip inputs: Title
    if (els.pTitle) {
      els.pTitle.addEventListener('keydown', (e) => {
        const val = (els.pTitle.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault();
          addTitleToken(val);
          els.pTitle.value = '';
          hideTitleSuggestions();
          applyFilters();
        } else if (e.key === 'Backspace') {
          if (!val && state.chips.title.length > 0) {
            e.preventDefault();
            state.chips.title.pop();
            renderTitleChips();
            applyFilters();
          }
        }
      });
      els.pTitle.addEventListener('input', () => updateTitleSuggestions());
    }
    if (els.pTitleWrap) {
      els.pTitleWrap.addEventListener('click', (ev) => { if (ev.target === els.pTitleWrap) els.pTitle?.focus(); });
    }
    if (els.pTitleClear) {
      els.pTitleClear.addEventListener('click', () => { state.chips.title = []; renderTitleChips(); applyFilters(); els.pTitle?.focus(); });
    }
    if (els.pTitleSuggest) {
      els.pTitleSuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]');
        if (!it) return;
        const label = it.getAttribute('data-sugg') || '';
        addTitleToken(label);
        els.pTitle.value = '';
        hideTitleSuggestions();
        applyFilters();
      });
    }

    // Chip inputs: Company
    if (els.pCompany) {
      els.pCompany.addEventListener('keydown', (e) => {
        const val = (els.pCompany.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault();
          addCompanyToken(val);
          els.pCompany.value = '';
          hideCompanySuggestions();
          applyFilters();
        } else if (e.key === 'Backspace') {
          if (!val && state.chips.company.length > 0) {
            e.preventDefault();
            state.chips.company.pop();
            renderCompanyChips();
            applyFilters();
          }
        }
      });
      els.pCompany.addEventListener('input', () => updateCompanySuggestions());
    }
    if (els.pCompanyWrap) {
      els.pCompanyWrap.addEventListener('click', (ev) => { if (ev.target === els.pCompanyWrap) els.pCompany?.focus(); });
    }
    if (els.pCompanyClear) {
      els.pCompanyClear.addEventListener('click', () => { state.chips.company = []; renderCompanyChips(); applyFilters(); els.pCompany?.focus(); });
    }
    if (els.pCompanySuggest) {
      els.pCompanySuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]');
        if (!it) return;
        const label = it.getAttribute('data-sugg') || '';
        addCompanyToken(label);
        els.pCompany.value = '';
        hideCompanySuggestions();
        applyFilters();
      });
    }

    // Chip inputs: Seniority
    if (els.pSeniority) {
      els.pSeniority.addEventListener('keydown', (e) => {
        const val = (els.pSeniority.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault();
          addSeniorityToken(val);
          els.pSeniority.value = '';
          hideSenioritySuggestions();
          applyFilters();
        } else if (e.key === 'Backspace') {
          if (!val && state.chips.seniority.length > 0) {
            e.preventDefault();
            state.chips.seniority.pop();
            renderSeniorityChips();
            applyFilters();
          }
        }
      });
      els.pSeniority.addEventListener('input', () => updateSenioritySuggestions());
    }
    if (els.pSeniorityWrap) {
      els.pSeniorityWrap.addEventListener('click', (ev) => { if (ev.target === els.pSeniorityWrap) els.pSeniority?.focus(); });
    }
    if (els.pSeniorityClear) {
      els.pSeniorityClear.addEventListener('click', () => { state.chips.seniority = []; renderSeniorityChips(); applyFilters(); els.pSeniority?.focus(); });
    }
    if (els.pSenioritySuggest) {
      els.pSenioritySuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]');
        if (!it) return;
        const label = it.getAttribute('data-sugg') || '';
        addSeniorityToken(label);
        els.pSeniority.value = '';
        hideSenioritySuggestions();
        applyFilters();
      });
    }

    // Chip inputs: Department
    if (els.pDepartment) {
      els.pDepartment.addEventListener('keydown', (e) => {
        const val = (els.pDepartment.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault();
          addDepartmentToken(val);
          els.pDepartment.value = '';
          hideDepartmentSuggestions();
          applyFilters();
        } else if (e.key === 'Backspace') {
          if (!val && state.chips.department.length > 0) {
            e.preventDefault();
            state.chips.department.pop();
            renderDepartmentChips();
            applyFilters();
          }
        }
      });
      els.pDepartment.addEventListener('input', () => updateDepartmentSuggestions());
    }
    if (els.pDepartmentWrap) {
      els.pDepartmentWrap.addEventListener('click', (ev) => { if (ev.target === els.pDepartmentWrap) els.pDepartment?.focus(); });
    }
    if (els.pDepartmentClear) {
      els.pDepartmentClear.addEventListener('click', () => { state.chips.department = []; renderDepartmentChips(); applyFilters(); els.pDepartment?.focus(); });
    }
    if (els.pDepartmentSuggest) {
      els.pDepartmentSuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]');
        if (!it) return;
        const label = it.getAttribute('data-sugg') || '';
        addDepartmentToken(label);
        els.pDepartment.value = '';
        hideDepartmentSuggestions();
        applyFilters();
      });
    }

    // Chip inputs: City
    if (els.pCity) {
      els.pCity.addEventListener('keydown', (e) => {
        const val = (els.pCity.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault(); addCityToken(val); els.pCity.value = ''; hideCitySuggestions(); applyFilters();
        } else if (e.key === 'Backspace' && !val) {
          const arr = state.chips.city || []; if (arr.length) { arr.pop(); renderCityChips(); applyFilters(); }
        }
      });
      els.pCity.addEventListener('input', () => updateCitySuggestions());
    }
    if (els.pCityWrap) {
      els.pCityWrap.addEventListener('click', (ev) => { if (ev.target === els.pCityWrap) els.pCity?.focus(); });
    }
    if (els.pCityClear) {
      els.pCityClear.addEventListener('click', () => { state.chips.city = []; renderCityChips(); applyFilters(); els.pCity?.focus(); });
    }
    if (els.pCitySuggest) {
      els.pCitySuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]'); if (!it) return;
        const label = it.getAttribute('data-sugg') || ''; addCityToken(label); els.pCity.value = ''; hideCitySuggestions(); applyFilters();
      });
    }

    // Chip inputs: State
    if (els.pState) {
      els.pState.addEventListener('keydown', (e) => {
        const val = (els.pState.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault(); addStateToken(val); els.pState.value = ''; hideStateSuggestions(); applyFilters();
        } else if (e.key === 'Backspace' && !val) {
          const arr = state.chips.state || []; if (arr.length) { arr.pop(); renderStateChips(); applyFilters(); }
        }
      });
      els.pState.addEventListener('input', () => updateStateSuggestions());
    }
    if (els.pStateWrap) {
      els.pStateWrap.addEventListener('click', (ev) => { if (ev.target === els.pStateWrap) els.pState?.focus(); });
    }
    if (els.pStateClear) {
      els.pStateClear.addEventListener('click', () => { state.chips.state = []; renderStateChips(); applyFilters(); els.pState?.focus(); });
    }
    if (els.pStateSuggest) {
      els.pStateSuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]'); if (!it) return;
        const label = it.getAttribute('data-sugg') || ''; addStateToken(label); els.pState.value = ''; hideStateSuggestions(); applyFilters();
      });
    }

    // Chip inputs: Employees
    if (els.pEmployees) {
      els.pEmployees.addEventListener('keydown', (e) => {
        const val = (els.pEmployees.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault(); addEmployeesToken(val); els.pEmployees.value = ''; hideEmployeesSuggestions(); applyFilters();
        } else if (e.key === 'Backspace' && !val) {
          const arr = state.chips.employees || []; if (arr.length) { arr.pop(); renderEmployeesChips(); applyFilters(); }
        }
      });
      els.pEmployees.addEventListener('input', () => updateEmployeesSuggestions());
    }
    if (els.pEmployeesWrap) {
      els.pEmployeesWrap.addEventListener('click', (ev) => { if (ev.target === els.pEmployeesWrap) els.pEmployees?.focus(); });
    }
    if (els.pEmployeesClear) {
      els.pEmployeesClear.addEventListener('click', () => { state.chips.employees = []; renderEmployeesChips(); applyFilters(); els.pEmployees?.focus(); });
    }
    if (els.pEmployeesSuggest) {
      els.pEmployeesSuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]'); if (!it) return;
        const label = it.getAttribute('data-sugg') || ''; addEmployeesToken(label); els.pEmployees.value = ''; hideEmployeesSuggestions(); applyFilters();
      });
    }

    // Chip inputs: Industry
    if (els.pIndustry) {
      els.pIndustry.addEventListener('keydown', (e) => {
        const val = (els.pIndustry.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault(); addIndustryToken(val); els.pIndustry.value = ''; hideIndustrySuggestions(); applyFilters();
        } else if (e.key === 'Backspace' && !val) {
          const arr = state.chips.industry || []; if (arr.length) { arr.pop(); renderIndustryChips(); applyFilters(); }
        }
      });
      els.pIndustry.addEventListener('input', () => updateIndustrySuggestions());
    }
    if (els.pIndustryWrap) {
      els.pIndustryWrap.addEventListener('click', (ev) => { if (ev.target === els.pIndustryWrap) els.pIndustry?.focus(); });
    }
    if (els.pIndustryClear) {
      els.pIndustryClear.addEventListener('click', () => { state.chips.industry = []; renderIndustryChips(); applyFilters(); els.pIndustry?.focus(); });
    }
    if (els.pIndustrySuggest) {
      els.pIndustrySuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]'); if (!it) return;
        const label = it.getAttribute('data-sugg') || ''; addIndustryToken(label); els.pIndustry.value = ''; hideIndustrySuggestions(); applyFilters();
      });
    }

    // Chip inputs: Visitor Domain
    if (els.pVisitorDomain) {
      els.pVisitorDomain.addEventListener('keydown', (e) => {
        const val = (els.pVisitorDomain.value || '').trim();
        if ((e.key === 'Enter' || e.key === ',') && val) {
          e.preventDefault(); addVisitorDomainToken(val); els.pVisitorDomain.value = ''; hideVisitorDomainSuggestions(); applyFilters();
        } else if (e.key === 'Backspace' && !val) {
          const arr = state.chips.visitorDomain || []; if (arr.length) { arr.pop(); renderVisitorDomainChips(); applyFilters(); }
        }
      });
      els.pVisitorDomain.addEventListener('input', () => updateVisitorDomainSuggestions());
    }
    if (els.pVisitorDomainWrap) {
      els.pVisitorDomainWrap.addEventListener('click', (ev) => { if (ev.target === els.pVisitorDomainWrap) els.pVisitorDomain?.focus(); });
    }
    if (els.pVisitorDomainClear) {
      els.pVisitorDomainClear.addEventListener('click', () => { state.chips.visitorDomain = []; renderVisitorDomainChips(); applyFilters(); els.pVisitorDomain?.focus(); });
    }
    if (els.pVisitorDomainSuggest) {
      els.pVisitorDomainSuggest.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-sugg]'); if (!it) return;
        const label = it.getAttribute('data-sugg') || ''; addVisitorDomainToken(label); els.pVisitorDomain.value = ''; hideVisitorDomainSuggestions(); applyFilters();
      });
    }

    if (els.pHasEmail) els.pHasEmail.addEventListener('change', () => { state.flags.hasEmail = !!els.pHasEmail.checked; applyFilters(); });
    if (els.pHasPhone) els.pHasPhone.addEventListener('change', () => { state.flags.hasPhone = !!els.pHasPhone.checked; applyFilters(); });
  }

  function updateViewToggle() {
    if (!els.viewToggle) return;
    els.viewToggle.querySelectorAll('.toggle-btn').forEach(b => {
      const v = b.getAttribute('data-view');
      const active = v === state.view;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  async function loadDataOnce() {
    if (state.loadedPeople && state.loadedAccounts) return;
    // Preload from global caches to eliminate blank flash
    try {
      if (!state.loadedPeople && typeof window.getPeopleData === 'function') {
        const cachedPeople = window.getPeopleData() || [];
        if (Array.isArray(cachedPeople) && cachedPeople.length) {
          state.dataPeople = cachedPeople;
          state.loadedPeople = true;
        }
      }
      if (!state.loadedAccounts && typeof window.getAccountsData === 'function') {
        const cachedAccounts = window.getAccountsData() || [];
        if (Array.isArray(cachedAccounts) && cachedAccounts.length) {
          state.dataAccounts = cachedAccounts;
          state.loadedAccounts = true;
        }
      }
      if (state.loadedPeople || state.loadedAccounts) {
        renderTableHead();
        buildSuggestionPools();
        applyFilters();
      }
    } catch (_) {}
    
    try {
      if (console.time) console.time('[ListDetail] loadDataOnce');
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Load people
        if (!state.loadedPeople) {
          const peopleSnap = await window.firebaseDB.collection('contacts').limit(200).get();
          state.dataPeople = peopleSnap ? peopleSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
          state.loadedPeople = true;
          console.debug('[ListDetail] loadDataOnce: people loaded', { count: state.dataPeople.length });
        }
        
        // Load accounts
        if (!state.loadedAccounts) {
          const accountsSnap = await window.firebaseDB.collection('accounts').get();
          state.dataAccounts = accountsSnap ? accountsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
          state.loadedAccounts = true;
          console.debug('[ListDetail] loadDataOnce: accounts loaded', { count: state.dataAccounts.length });
        }
      }
    } catch (e) {
      console.error('Failed loading list detail data:', e);
      state.dataPeople = state.dataPeople || [];
      state.dataAccounts = state.dataAccounts || [];
      state.loadedPeople = true;
      state.loadedAccounts = true;
    }
    
    if (console.timeEnd) console.timeEnd('[ListDetail] loadDataOnce');
    renderTableHead();
    buildSuggestionPools();
    applyFilters();
  }

  async function fetchMembers(listId) {
    state.membersPeople = new Set();
    state.membersAccounts = new Set();
    if (!listId) return;
    
    // 1) Try preloaded cache for instant availability
    try {
      if (console.time) console.time(`[ListDetail] fetchMembers ${listId}`);
      let cacheHit = false; let cacheLoaded = false;
      const cache = (window.listMembersCache && window.listMembersCache[listId]) || null;
      if (cache && (cache.loaded || cache.people || cache.accounts)) {
        try {
          const ppl = cache.people instanceof Set ? Array.from(cache.people) : (cache.people || []);
          const accts = cache.accounts instanceof Set ? Array.from(cache.accounts) : (cache.accounts || []);
          state.membersPeople = new Set(ppl);
          state.membersAccounts = new Set(accts);
        } catch (_) {}
        cacheHit = true; cacheLoaded = !!cache.loaded;
        console.debug('[ListDetail] fetchMembers: cache', { listId, cacheLoaded, people: state.membersPeople.size, accounts: state.membersAccounts.size });
        if (cache.loaded) {
          if (console.timeEnd) console.timeEnd(`[ListDetail] fetchMembers ${listId}`);
          return; // Use cached result immediately
        }
      }
    } catch (_) {}

    // 2) Fallback: fetch from Firestore
    try {
      if (!window.firebaseDB || typeof window.firebaseDB.collection !== 'function') return;

      let gotAny = false;
      // Prefer subcollection lists/{id}/members
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
        console.debug('[ListDetail] fetchMembers: subcollection fetched', { listId, docs: subSnap.docs.length, people: state.membersPeople.size, accounts: state.membersAccounts.size });
      }

      // Fallback to top-level listMembers if subcollection empty
      if (!gotAny) {
        try {
          const lmSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).limit(5000).get();
          console.log('[ListDetail] fetchMembers: top-level query result', { 
            listId, 
            docs: lmSnap?.docs?.length || 0,
            rawDocs: lmSnap?.docs?.map(d => ({ id: d.id, data: d.data() })) || []
          });
          lmSnap?.docs?.forEach(d => {
            const m = d.data() || {};
            const t = (m.targetType || m.type || '').toLowerCase();
            const id = m.targetId || m.id || d.id;
            console.log('[ListDetail] fetchMembers: processing member', { docId: d.id, targetType: t, targetId: id });
            if (t === 'people' || t === 'contact' || t === 'contacts') state.membersPeople.add(id);
            else if (t === 'accounts' || t === 'account') state.membersAccounts.add(id);
          });
          console.debug('[ListDetail] fetchMembers: top-level fetched', { listId, docs: lmSnap?.docs?.length || 0, people: state.membersPeople.size, accounts: state.membersAccounts.size });
        } catch (e) {
          console.error('[ListDetail] fetchMembers: top-level query failed', e);
        }
      }

      // Update global cache with fetched result for reuse
      try {
        window.listMembersCache = window.listMembersCache || {};
        window.listMembersCache[listId] = {
          people: new Set(state.membersPeople),
          accounts: new Set(state.membersAccounts),
          loaded: true
        };
        console.debug('[ListDetail] fetchMembers: cache updated', { listId, people: state.membersPeople.size, accounts: state.membersAccounts.size });
      } catch (_) {}
      if (console.timeEnd) console.timeEnd(`[ListDetail] fetchMembers ${listId}`);
      
      // Debug: Log the actual member IDs
      console.log('[ListDetail] fetchMembers result:', {
        listId,
        peopleMembers: Array.from(state.membersPeople),
        accountsMembers: Array.from(state.membersAccounts)
      });
    } catch (err) {
      console.warn('Failed to load list members', err);
    }
  }

  function applyFilters() {
    const q = normalize(els.quickSearch ? els.quickSearch.value : '');
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if (state.view === 'people') {
      const titleTokens = (state.chips.title || []).map(normalize).filter(Boolean);
      const companyTokens = (state.chips.company || []).map(normalize).filter(Boolean);
      const cityTokens = (state.chips.city || []).map(normalize).filter(Boolean);
      const stateTokens = (state.chips.state || []).map(normalize).filter(Boolean);
      const employeesTokens = (state.chips.employees || []).map(normalize).filter(Boolean);
      const industryTokens = (state.chips.industry || []).map(normalize).filter(Boolean);
      const domainTokens = (state.chips.visitorDomain || []).map(normalize).filter(Boolean);
      const seniorityTokens = (state.chips.seniority || []).map(normalize).filter(Boolean);
      const departmentTokens = (state.chips.department || []).map(normalize).filter(Boolean);

      const qMatch = (str) => !q || normalize(str).includes(q);
      const tokenMatch = (tokens) => (str) => { 
        if (!tokens || tokens.length === 0) return true; 
        const n = normalize(str); 
        return tokens.some((t) => n.includes(t)); 
      };
      const titleMatch = tokenMatch(titleTokens);
      const companyMatch = tokenMatch(companyTokens);
      const cityMatch = tokenMatch(cityTokens);
      const stateMatch = tokenMatch(stateTokens);
      const employeesMatch = tokenMatch(employeesTokens);
      const industryMatch = tokenMatch(industryTokens);
      const domainMatch = tokenMatch(domainTokens);
      const seniorityMatch = tokenMatch(seniorityTokens);
      const departmentMatch = tokenMatch(departmentTokens);

      let base = state.dataPeople.filter(c => {
        const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || (c.name || '');
        const locCity = c.city || (c.location && c.location.city) || '';
        const locState = c.state || (c.location && (c.location.state || c.location.region)) || '';
        const employees = c.employees || c.companySize || c.employeeCount || '';
        const industry = c.industry || c.companyIndustry || '';
        const domain = c.domain || c.companyDomain || c.website || '';
        const hasEmailOk = !state.flags.hasEmail || !!(c.email && String(c.email).trim());
        const hasPhoneOk = !state.flags.hasPhone || !!(c.phone || c.mobile);
        return (
          (qMatch(fullName) || qMatch(c.title) || qMatch(c.companyName) || qMatch(c.email)) &&
          titleMatch(c.title) && companyMatch(c.companyName) &&
          cityMatch(locCity) && stateMatch(locState) && employeesMatch(String(employees)) &&
          industryMatch(industry) && domainMatch(domain) && hasEmailOk && hasPhoneOk &&
          seniorityMatch(c.seniority || '') && departmentMatch(c.department || '')
        );
      });
      
      // Filter by list membership
      if (state.listId) {
        console.log('[ListDetail] Filtering people by list membership:', {
          listId: state.listId,
          totalPeople: state.dataPeople.length,
          membersCount: state.membersPeople.size,
          beforeFilter: base.length
        });
        base = base.filter(c => state.membersPeople.has(c.id));
        console.log('[ListDetail] After filtering:', { afterFilter: base.length });
      }
      state.filtered = base;
    } else {
      // accounts view
      let base = state.dataAccounts.filter(a => {
        const acct = a.accountName || a.name || '';
        return qMatch(acct) || qMatch(a.industry) || qMatch(a.domain);
      });
      
      if (state.listId) {
        console.log('[ListDetail] Filtering accounts by list membership:', {
          listId: state.listId,
          totalAccounts: state.dataAccounts.length,
          membersCount: state.membersAccounts.size,
          beforeFilter: base.length
        });
        base = base.filter(a => state.membersAccounts.has(a.id));
        console.log('[ListDetail] After filtering accounts:', { afterFilter: base.length });
      }
      state.filtered = base;
    }

    state.currentPage = 1;
    render();

    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    console.debug('[ListDetail] applyFilters', {
      view: state.view,
      listId: state.listId,
      qLength: (els.quickSearch ? (els.quickSearch.value || '').length : 0),
      chips: {
        title: state.chips.title.length,
        company: state.chips.company.length,
        city: state.chips.city.length,
        state: state.chips.state.length,
        employees: state.chips.employees.length,
        industry: state.chips.industry.length,
        visitorDomain: state.chips.visitorDomain.length,
        hasEmail: !!state.flags.hasEmail,
        hasPhone: !!state.flags.hasPhone
      },
      dataSizes: { people: state.dataPeople.length, accounts: state.dataAccounts.length },
      memberSizes: { people: state.membersPeople.size, accounts: state.membersAccounts.size },
      filtered: state.filtered.length,
      tookMs: Math.round(t1 - t0)
    });
  }

  function normalize(s) { return (s || '').toString().trim().toLowerCase(); }

  function getPageItems() {
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    return state.filtered.slice(start, end);
  }

  function render() {
    if (!els.tbody) return;
    const pageItems = getPageItems();
    const rows = pageItems.map((item) => state.view === 'people' ? rowHtmlPeople(item) : rowHtmlAccount(item)).join('');
    els.tbody.innerHTML = rows || emptyHtml();
    renderPagination();

    // Bind row selection events (delegate)
    if (!els._tbodyBound) {
      els.tbody.addEventListener('change', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('row-select')) {
          const id = e.target.getAttribute('data-id');
          const checked = !!e.target.checked;
          if (state.view === 'people') {
            if (checked) state.selectedPeople.add(id); else state.selectedPeople.delete(id);
          } else {
            if (checked) state.selectedAccounts.add(id); else state.selectedAccounts.delete(id);
          }
          updateHeaderSelectAll();
          renderRowSelectionHighlights();
          showBulkActionsBar();
        }
      });
      els._tbodyBound = true;
    }

    // Select-all checkbox bind (rebind after header re-render)
    els.selectAll = qs('select-all-list-detail');
    if (els.selectAll && !els.selectAll._bound) {
      els.selectAll.addEventListener('change', () => {
        const currentIds = getPageItems().map((it) => it.id).filter(Boolean);
        const set = (state.view === 'people') ? state.selectedPeople : state.selectedAccounts;
        if (els.selectAll.checked) {
          currentIds.forEach((id) => set.add(id));
        } else {
          currentIds.forEach((id) => set.delete(id));
        }
        // Update DOM
        els.tbody.querySelectorAll('.row-select').forEach(cb => { const id = cb.getAttribute('data-id'); cb.checked = set.has(id); });
        updateHeaderSelectAll();
        renderRowSelectionHighlights();
        showBulkActionsBar();
      });
      els.selectAll._bound = '1';
    }

    updateHeaderSelectAll();
    renderRowSelectionHighlights();
    
    // Note: Drag and drop is initialized after data load in init() function
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDateOrNA() {
    for (let i = 0; i < arguments.length; i++) {
      const d = coerceDate(arguments[i]);
      if (d) return d.toLocaleDateString();
    }
    return 'N/A';
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

  function rowHtmlPeople(c) {
    const id = c.id || '';
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || escapeHtml(c.name || '');
    const title = escapeHtml(c.title || '');
    const company = escapeHtml(c.companyName || '');
    const email = escapeHtml(c.email || '');
    const phone = escapeHtml(c.phone || c.mobile || '');
    const locCity = c.city || (c.location && c.location.city) || '';
    const locState = c.state || (c.location && (c.location.state || c.location.region)) || '';
    const location = escapeHtml([locCity, locState].filter(Boolean).join(', '));
    const updatedStr = escapeHtml(formatDateOrNA(c.updatedAt, c.createdAt));
    const checked = state.selectedPeople.has(id) ? ' checked' : '';
    const rowClass = state.selectedPeople.has(id) ? ' class="row-selected"' : '';
    
    let html = `<tr${rowClass}>`;
    
    peopleColumnOrder.forEach(col => {
      switch (col) {
        case 'select':
          html += `<td class="col-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(id)}" aria-label="Select"${checked}></td>`;
          break;
        case 'name':
          html += `<td><a href="#" class="name-cell" data-contact-id="${escapeHtml(id)}" data-contact-name="${escapeHtml(fullName)}">${fullName}</a></td>`;
          break;
        case 'title':
          html += `<td>${title}</td>`;
          break;
        case 'company':
          // Get domain for favicon (similar to people page logic)
          const favDomain = (() => {
            // Try to find the account for this company to get its domain
            const account = state.dataAccounts.find(acc => acc.accountName === company || acc.name === company);
            if (account) {
              let d = String(account.domain || account.website || '').trim();
              if (/^https?:\/\//i.test(d)) {
                try { d = new URL(d).hostname; } catch(_) { d = d.replace(/^https?:\/\//i, '').split('/')[0]; }
              }
              return d ? d.replace(/^www\./i, '') : '';
            }
            return '';
          })();
          html += `<td><a href="#" class="company-link" data-company-name="${escapeHtml(company)}"><span class="company-cell__wrap">${favDomain ? (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateFaviconHTML === 'function' ? window.__pcFaviconHelper.generateFaviconHTML(favDomain, 32) : `<img class="company-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=${escapeHtml(favDomain)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'" />`) : ''}<span class="company-name">${company}</span></span></a></td>`;
          break;
        case 'email':
          html += `<td>${email}</td>`;
          break;
        case 'phone':
          html += `<td>${phone}</td>`;
          break;
        case 'location':
          html += `<td>${location}</td>`;
          break;
        case 'actions':
          html += `<td class="qa-cell"><div class="qa-actions">
            <button type="button" class="qa-btn" data-action="addlist" data-id="${escapeHtml(id)}" aria-label="Add to list" title="Add to list"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M3 12h18"></path><path d="M3 18h18"></path></svg></button>
            <button type="button" class="qa-btn" data-action="sequence" data-id="${escapeHtml(id)}" aria-label="Add to sequence" title="Add to sequence"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg></button>
            <button type="button" class="qa-btn" data-action="task" data-id="${escapeHtml(id)}" aria-label="Create task" title="Create task"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6a2 2 0 0 1 2 2v2h2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h2V4a2 2 0 0 1 2-2z"></path><path d="M9 4h6"></path><path d="M9 12l2 2 4-4"></path></svg></button>
            <button type="button" class="qa-btn" data-action="linkedin" data-id="${escapeHtml(id)}" aria-label="LinkedIn" title="LinkedIn"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor" stroke="none"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 8h5v16H0V8zm7.5 0h4.8v2.2h.1c.7-1.2 2.4-2.5 4.9-2.5 5.2 0 6.2 3.4 6.2 7.9V24h-5v-7.2c0-1.7 0-3.9-2.4-3.9-2.4 0-2.8 1.9-2.8 3.8V24h-5V8z"></path></svg></button>
            <button type="button" class="qa-btn" data-action="ai" data-id="${escapeHtml(id)}" aria-label="AI" title="AI"><span style="font-weight:700">AI</span></button>
            <button type="button" class="qa-btn" data-action="link" data-id="${escapeHtml(id)}" aria-label="Open" title="Open"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 1 1 7 7l-1 1"></path><path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 1 1-7-7l1-1"></path></svg></button>
          </div></td>`;
          break;
        case 'updated':
          html += `<td>${updatedStr}</td>`;
          break;
      }
    });
    
    html += '</tr>';
    return html;
  }

  function rowHtmlAccount(a) {
    const id = a.id || '';
    const acct = escapeHtml(a.accountName || a.name || '');
    const industry = escapeHtml(a.industry || '');
    const domain = escapeHtml(a.domain || '');
    const phone = escapeHtml(a.phone || '');
    const updatedStr = escapeHtml(formatDateOrNA(a.updatedAt, a.createdAt));
    const checked = state.selectedAccounts.has(id) ? ' checked' : '';
    const rowClass = state.selectedAccounts.has(id) ? ' class="row-selected"' : '';
    
    let html = `<tr${rowClass}>`;
    
    accountsColumnOrder.forEach(col => {
      switch (col) {
        case 'select':
          html += `<td class="col-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(id)}" aria-label="Select"${checked}></td>`;
          break;
        case 'name':
          html += `<td><a href="#" class="company-link" data-account-id="${escapeHtml(id)}" data-account-name="${escapeHtml(acct)}">${acct}</a></td>`;
          break;
        case 'industry':
          html += `<td>${industry}</td>`;
          break;
        case 'domain':
          html += `<td>${domain}</td>`;
          break;
        case 'phone':
          html += `<td>${phone}</td>`;
          break;
        case 'updated':
          html += `<td>${updatedStr}</td>`;
          break;
      }
    });
    
    html += '</tr>';
    return html;
  }

  function emptyHtml() {
    const cols = state.view === 'people' ? 9 : 6;
    return `\n<tr>\n  <td colspan="${cols}" style="opacity:.75">No records found in this list.</td>\n</tr>`;
  }

  function renderTableHead() {
    if (!els.theadRow) return;
    
    const currentOrder = state.view === 'people' ? peopleColumnOrder : accountsColumnOrder;
    let html = '';
    
    currentOrder.forEach(col => {
      switch (col) {
        case 'select':
          html += `<th class="col-select" data-col="select" draggable="true"><input type="checkbox" id="select-all-list-detail" aria-label="Select all"></th>`;
          break;
        case 'name':
          html += `<th data-col="name" draggable="true">${state.view === 'people' ? 'Name' : 'Account'}</th>`;
          break;
        case 'title':
          html += `<th data-col="title" draggable="true">Title</th>`;
          break;
        case 'company':
          html += `<th data-col="company" draggable="true">Company</th>`;
          break;
        case 'email':
          html += `<th data-col="email" draggable="true">Email</th>`;
          break;
        case 'phone':
          html += `<th data-col="phone" draggable="true">Phone</th>`;
          break;
        case 'location':
          html += `<th data-col="location" draggable="true">Location</th>`;
          break;
        case 'industry':
          html += `<th data-col="industry" draggable="true">Industry</th>`;
          break;
        case 'domain':
          html += `<th data-col="domain" draggable="true">Domain</th>`;
          break;
        case 'actions':
          html += `<th data-col="actions" draggable="true">Quick Actions</th>`;
          break;
        case 'updated':
          html += `<th data-col="updated" draggable="true">Updated</th>`;
          break;
      }
    });
    
    els.theadRow.innerHTML = html;
  }

  function renderPagination() {
    if (!els.pagination || !els.paginationSummary) return;
    
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    const start = total === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, total);

    // Summary
    const label = state.view === 'people' ? (total === 1 ? 'contact' : 'contacts') : (total === 1 ? 'account' : 'accounts');
    const listLabel = state.listName ? ` in "${state.listName}"` : '';
    els.paginationSummary.textContent = `Showing ${start}–${end} of ${total} ${label}${listLabel}`;
    
    // Always use unified pagination component (even for empty lists)
    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(
        state.currentPage,
        totalPages,
        (page) => {
          state.currentPage = page;
          render();
        },
        els.pagination.id || 'list-detail-pagination'
      );
    } else {
      // Fallback to simple pagination with arrows
      let html = '';
      const atFirst = state.currentPage <= 1;
      const atLast = state.currentPage >= totalPages;

      // Prev arrow
      html += `<button class="page-btn" data-rel="prev" ${atFirst ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15,18 9,12 15,6"></polyline>
        </svg>
      </button>`;

      // Numbered pages (at least 1)
      for (let i = 1; i <= totalPages; i++) {
        const active = i === state.currentPage ? ' active' : '';
        html += `<button class="page-btn${active}" data-page="${i}">${i}</button>`;
      }

      // Next arrow
      html += `<button class="page-btn" data-rel="next" ${atLast ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9,18 15,12 9,6"></polyline>
        </svg>
      </button>`;

      els.pagination.innerHTML = html;

      // Add click handlers once
      if (!els.pagination.dataset.bound) {
        els.pagination.addEventListener('click', (e) => {
          const btn = e.target.closest && e.target.closest('button.page-btn');
          if (!btn || btn.disabled) return;
          const rel = btn.getAttribute('data-rel');
          let next = state.currentPage;
          if (rel === 'prev') next = Math.max(1, state.currentPage - 1);
          else if (rel === 'next') next = Math.min(totalPages, state.currentPage + 1);
          else if (btn.dataset.page) next = Math.min(totalPages, Math.max(1, parseInt(btn.dataset.page, 10)));
          if (next !== state.currentPage) {
            state.currentPage = next;
            render();
          }
        });
        els.pagination.dataset.bound = '1';
      }
    }
  }

  function openContactsModal() {
    // Simple implementation for now
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Add contacts functionality coming soon');
    }
  }

  function buildSuggestionPools() {
    const dedupe = (arr, limit = 2000) => {
      const set = new Set(); 
      const out = [];
      for (const v of arr) {
        const s = (v || '').toString().trim(); 
        if (!s) continue;
        const key = normalize(s); 
        if (set.has(key)) continue; 
        set.add(key); 
        out.push(s); 
        if (out.length >= limit) break;
      }
      return out;
    };
    
    try {
      state.pools.title = dedupe(state.dataPeople.map(c => c.title || ''));
      state.pools.company = dedupe(state.dataPeople.map(c => c.companyName || ''));
      state.pools.city = dedupe(state.dataPeople.map(c => c.city || (c.location && c.location.city) || ''));
      state.pools.state = dedupe(state.dataPeople.map(c => c.state || (c.location && (c.location.state || c.location.region)) || ''));
      state.pools.employees = dedupe(state.dataPeople.map(c => c.employees || c.companySize || c.employeeCount || ''));
      state.pools.industry = dedupe(state.dataPeople.map(c => c.industry || c.companyIndustry || ''));
      state.pools.visitorDomain = dedupe(state.dataPeople.map(c => c.domain || c.companyDomain || c.website || ''));
      state.pools.seniority = dedupe(state.dataPeople.map(c => c.seniority || ''));
      state.pools.department = dedupe(state.dataPeople.map(c => c.department || ''));
    } catch {}
  }

  // ----- Chip render helpers (Seniority / Department) -----
  function renderSeniorityChips() {
    if (!els.pSeniorityChips) return;
    els.pSeniorityChips.innerHTML = (state.chips.seniority || []).map((t, idx) => `
      <span class="chip" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>
    `).join('');
    els.pSeniorityChips.querySelectorAll('.chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (!isNaN(i)) {
          state.chips.seniority.splice(i, 1);
          renderSeniorityChips();
          applyFilters();
        }
      });
    });
    if (els.pSeniorityClear) {
      if ((state.chips.seniority || []).length > 0) els.pSeniorityClear.removeAttribute('hidden');
      else els.pSeniorityClear.setAttribute('hidden', '');
    }
  }

  function renderDepartmentChips() {
    if (!els.pDepartmentChips) return;
    els.pDepartmentChips.innerHTML = (state.chips.department || []).map((t, idx) => `
      <span class="chip" data-idx="${idx}"><span class="chip-label">${escapeHtml(t)}</span><button type="button" class="chip-remove" aria-label="Remove ${escapeHtml(t)}" data-idx="${idx}">&#215;</button></span>
    `).join('');
    els.pDepartmentChips.querySelectorAll('.chip-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (!isNaN(i)) {
          state.chips.department.splice(i, 1);
          renderDepartmentChips();
          applyFilters();
        }
      });
    });
    if (els.pDepartmentClear) {
      if ((state.chips.department || []).length > 0) els.pDepartmentClear.removeAttribute('hidden');
      else els.pDepartmentClear.setAttribute('hidden', '');
    }
  }

  function addSeniorityToken(label) { const t = (label || '').trim(); if (!t) return; const exists = (state.chips.seniority || []).some((x) => normalize(x) === normalize(t)); if (!exists) { state.chips.seniority.push(t); renderSeniorityChips(); } }
  function addDepartmentToken(label) { const t = (label || '').trim(); if (!t) return; const exists = (state.chips.department || []).some((x) => normalize(x) === normalize(t)); if (!exists) { state.chips.department.push(t); renderDepartmentChips(); } }
  function hideSenioritySuggestions() { if (els.pSenioritySuggest) els.pSenioritySuggest.setAttribute('hidden', ''); }
  function hideDepartmentSuggestions() { if (els.pDepartmentSuggest) els.pDepartmentSuggest.setAttribute('hidden', ''); }
  function updateSenioritySuggestions() { if (!els.pSenioritySuggest) return; const q = normalize(els.pSeniority ? els.pSeniority.value : ''); if (!q) { hideSenioritySuggestions(); return; } const items = []; for (let i = 0; i < state.pools.seniority.length && items.length < 8; i++) { const s = state.pools.seniority[i]; if (normalize(s).includes(q) && !(state.chips.seniority || []).some((x) => normalize(x) === normalize(s))) items.push(s); } if (items.length === 0) { hideSenioritySuggestions(); return; } els.pSenioritySuggest.innerHTML = items.map((s) => `<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.pSenioritySuggest.removeAttribute('hidden'); }
  function updateDepartmentSuggestions() { if (!els.pDepartmentSuggest) return; const q = normalize(els.pDepartment ? els.pDepartment.value : ''); if (!q) { hideDepartmentSuggestions(); return; } const items = []; for (let i = 0; i < state.pools.department.length && items.length < 8; i++) { const s = state.pools.department[i]; if (normalize(s).includes(q) && !(state.chips.department || []).some((x) => normalize(x) === normalize(s))) items.push(s); } if (items.length === 0) { hideDepartmentSuggestions(); return; } els.pDepartmentSuggest.innerHTML = items.map((s) => `<div class="item" data-sugg="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join(''); els.pDepartmentSuggest.removeAttribute('hidden'); }

  async function init(context) {
    console.log('[ListDetail] Initializing with context:', context);
    if (console.time) console.time('[ListDetail] init');
    
    if (!initDomRefs()) {
      console.error('[ListDetail] Failed to initialize DOM refs');
      return;
    }

    // Load column order from localStorage
    loadColumnOrder();
    
    // Set context
    if (context) {
      state.listId = context.listId;
      state.listName = context.listName;
      state.listKind = context.listKind;
      state.view = context.listKind || 'people';
      // Prevent flicker: clear previous rows immediately when switching lists
      if (els.tbody) {
        els.tbody.innerHTML = '';
      }
    }

    // Update title
    if (els.detailTitle) {
      els.detailTitle.textContent = state.listName || 'List Details';
    }

    // Update view toggle
    updateViewToggle();

    attachEvents();
    injectListDetailBulkStyles();
    
    // Instant paint: draw header and render cached data if available
    renderTableHead();
    // Force a synchronous style/layout update to avoid flashing previous content
    if (els.tbody) { void els.tbody.offsetHeight; }
    
    // Try to render cached data immediately to avoid empty state flash
    try {
      if (state.listId && window.listMembersCache && window.listMembersCache[state.listId]?.loaded) {
        const cache = window.listMembersCache[state.listId];
        state.membersPeople = new Set(cache.people || []);
        state.membersAccounts = new Set(cache.accounts || []);
        
        // If we have cached data, try to render it immediately
        if (state.view === 'people' && state.dataPeople.length > 0) {
          const filtered = state.dataPeople.filter(c => state.membersPeople.has(c.id));
          state.filtered = filtered;
          render();
        } else if (state.view === 'accounts' && state.dataAccounts.length > 0) {
          const filtered = state.dataAccounts.filter(a => state.membersAccounts.has(a.id));
          state.filtered = filtered;
          render();
        }
      }
    } catch (_) {}
    
    // Load data in parallel for faster loading
    state.currentPage = 1;
    const [dataLoaded, membersLoaded] = await Promise.all([
      loadDataOnce(),
      fetchMembers(state.listId)
    ]);
    
    // Re-render with loaded data
    renderTableHead();
    // Avoid repaint jump by batching DOM updates after data is ready
    if (els.tbody) {
      els.tbody.style.visibility = 'hidden';
    }
    // Render chip DOM from internal state (if pre-set)
    try {
      window.__listDetailState = window.__listDetailState || {};
      window.__listDetailState.titleChips = Array.isArray(state.chips.title) ? [...state.chips.title] : [];
      window.__listDetailState.companyChips = Array.isArray(state.chips.company) ? [...state.chips.company] : [];
      window.__listDetailState.cityChips = Array.isArray(state.chips.city) ? [...state.chips.city] : [];
      window.__listDetailState.stateChips = Array.isArray(state.chips.state) ? [...state.chips.state] : [];
      window.__listDetailState.employeesChips = Array.isArray(state.chips.employees) ? [...state.chips.employees] : [];
      window.__listDetailState.industryChips = Array.isArray(state.chips.industry) ? [...state.chips.industry] : [];
      window.__listDetailState.visitorDomainChips = Array.isArray(state.chips.visitorDomain) ? [...state.chips.visitorDomain] : [];
      renderTitleChips();
      renderCompanyChips();
      renderCityChips();
      renderStateChips();
      renderEmployeesChips();
      renderIndustryChips();
      renderVisitorDomainChips();
    } catch(_) {}
    applyFilters();
    if (els.tbody) {
      // ensure the rows are present before showing
      void els.tbody.offsetHeight;
      els.tbody.style.visibility = '';
    }
    
    // Initialize drag and drop after everything is rendered
    setTimeout(() => {
      console.log('[ListDetail] Initializing drag and drop after data load');
      initHeaderDragAndDrop();
    }, 100);
    if (console.timeEnd) console.timeEnd('[ListDetail] init');
  }

  // Expose API
  // Function to refresh list membership
  async function refreshListMembership() {
    if (state.listId) {
      console.log('[ListDetail] Refreshing list membership for:', state.listId);
      // Clear the cache for this list
      if (window.listMembersCache && window.listMembersCache[state.listId]) {
        delete window.listMembersCache[state.listId];
      }
      // Re-fetch members
      await fetchMembers(state.listId);
      // Re-apply filters
      applyFilters();
    }
  }

  // Drag and Drop functionality for table headers
  let dragSrcTh = null;
  let dragOverTh = null;

  function initHeaderDragAndDrop() {
    // Re-resolve header row each time to avoid stale references
    const page = document.getElementById('list-detail-page');
    els.theadRow = page ? page.querySelector('#list-detail-table thead tr') : els.theadRow;
    if (!els || !els.theadRow) {
      console.warn('[ListDetail] No theadRow found for drag and drop');
      return;
    }
    
    // Clean up existing event listeners by cloning the row to remove all listeners
    const newTheadRow = els.theadRow.cloneNode(true);
    els.theadRow.parentNode.replaceChild(newTheadRow, els.theadRow);
    els.theadRow = newTheadRow;
    
    const ths = els.theadRow.querySelectorAll('th[draggable="true"]');
    console.log('[ListDetail] Found', ths.length, 'draggable headers');
    console.log('[ListDetail] Headers found:', Array.from(ths).map(th => th.textContent.trim()));
    
    // Define event handlers
    const handleDragStart = (e) => {
      console.log('[ListDetail] Drag start triggered on:', e.target.textContent.trim());
      dragSrcTh = e.target;
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', e.target.outerHTML);
    };

    const handleDragEnd = (e) => {
      e.target.classList.remove('dragging');
      dragSrcTh = null;
      dragOverTh = null;
    };

    const handleDragOver = (e) => {
      if (e.preventDefault) {
        e.preventDefault();
      }
      e.dataTransfer.dropEffect = 'move';
      return false;
    };

    const handleDragEnter = (e) => {
      e.target.classList.add('drag-over');
      dragOverTh = e.target;
    };

    const handleDragLeave = (e) => {
      e.target.classList.remove('drag-over');
    };

    const handleDrop = (e) => {
      if (e.stopPropagation) {
        e.stopPropagation();
      }

      if (dragSrcTh !== dragOverTh) {
        console.log('[ListDetail] Dropping', dragSrcTh.textContent.trim(), 'onto', dragOverTh.textContent.trim());
        commitHeaderMove(dragSrcTh, dragOverTh);
      }

      return false;
    };

    // Attach event listeners to each draggable header
    ths.forEach(th => {
      th.addEventListener('dragstart', handleDragStart, false);
      th.addEventListener('dragend', handleDragEnd, false);
      th.addEventListener('dragover', handleDragOver, false);
      th.addEventListener('dragenter', handleDragEnter, false);
      th.addEventListener('dragleave', handleDragLeave, false);
      th.addEventListener('drop', handleDrop, false);
    });

    console.log('[ListDetail] Drag and drop initialized for', ths.length, 'headers');
  }

  function commitHeaderMove(dragSrcTh, dragOverTh) {
    if (!dragSrcTh || !dragOverTh || dragSrcTh === dragOverTh) return;
    
    console.log('[ListDetail] Committing header move from', dragSrcTh.textContent.trim(), 'to', dragOverTh.textContent.trim());
    
    // Get the current order from DOM
    const currentOrder = getHeaderOrderFromDom();
    console.log('[ListDetail] Current order:', currentOrder);
    
    // Find the source and target column names
    const srcCol = dragSrcTh.getAttribute('data-col');
    const targetCol = dragOverTh.getAttribute('data-col');
    
    if (!srcCol || !targetCol) {
      console.warn('[ListDetail] Missing data-col attributes');
      return;
    }
    
    // Create new order array
    const newOrder = [...currentOrder];
    const srcIndex = newOrder.indexOf(srcCol);
    const targetIndex = newOrder.indexOf(targetCol);
    
    if (srcIndex === -1 || targetIndex === -1) {
      console.warn('[ListDetail] Could not find column indices');
      return;
    }
    
    // Remove source from its current position
    newOrder.splice(srcIndex, 1);
    // Insert source at target position
    newOrder.splice(targetIndex, 0, srcCol);
    
    console.log('[ListDetail] New order:', newOrder);
    
    // Save the new order
    const storageKey = state.view === 'people' ? PEOPLE_COL_STORAGE_KEY : ACCOUNTS_COL_STORAGE_KEY;
    try {
      localStorage.setItem(storageKey, JSON.stringify(newOrder));
    } catch (e) {
      console.warn('Failed to save column order:', e);
    }
    
    // Re-render the table with new column order
    renderTableHead();
    applyFilters();
    
    // Update the DOM order
    dragOverTh.parentNode.insertBefore(dragSrcTh, dragOverTh);
  }

  function getHeaderOrderFromDom() {
    if (!els.theadRow) return [];
    
    const ths = els.theadRow.querySelectorAll('th[data-col]');
    return Array.from(ths).map(th => th.getAttribute('data-col')).filter(Boolean);
  }

  window.ListDetail = {
    init: init,
    refreshListMembership: refreshListMembership,
    _getPool: (kind) => {
      try { return state.pools[kind] || []; } catch (_) { return []; }
    },
    _getFiltered: (view) => {
      try { return (view === 'accounts') ? state.dataAccounts.filter(a => state.membersAccounts.has(a.id)) : state.dataPeople.filter(c => state.membersPeople.has(c.id)); } catch (_) { return []; }
    },
    _getSelectedCount: (kind) => {
      try { return kind === 'accounts' ? state.selectedAccounts.size : state.selectedPeople.size; } catch (_) { return 0; }
    },
    _getChips: (kind) => {
      try { return state.chips[kind] || []; } catch (_) { return []; }
    },
    _addChip: (kind, value) => {
      try {
        const v = (value || '').toString().trim();
        if (!v) return;
        const arr = state.chips[kind] = state.chips[kind] || [];
        if (!arr.includes(v)) arr.push(v);
      } catch (_) {}
    },
    _clearChips: (kind) => {
      try { state.chips[kind] = []; } catch (_) {}
    }
  };

})();

// ===== Helpers: selection, chips, suggestions, bulk actions =====
function renderRowSelectionHighlights() {
  try {
    const page = document.getElementById('list-detail-page');
    const tbody = page?.querySelector('#list-detail-table tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const cb = tr.querySelector('.row-select');
      if (!cb) return;
      tr.classList.toggle('row-selected', !!cb.checked);
    });
  } catch (_) {}
}

function updateHeaderSelectAll() {
  try {
    const page = document.getElementById('list-detail-page');
    const headerCb = page?.querySelector('#select-all-list-detail');
    const tbody = page?.querySelector('#list-detail-table tbody');
    if (!headerCb || !tbody) return;
    const boxes = Array.from(tbody.querySelectorAll('.row-select'));
    const checked = boxes.filter(cb => cb.checked).length;
    headerCb.checked = checked > 0 && checked === boxes.length;
    headerCb.indeterminate = checked > 0 && checked < boxes.length;
  } catch (_) {}
}

function addTitleToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('title', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch(_) {}
  const arr = (window.__listDetailState.titleChips = window.__listDetailState.titleChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderTitleChips === 'function') renderTitleChips();
}

function addCompanyToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('company', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch(_) {}
  const arr = (window.__listDetailState.companyChips = window.__listDetailState.companyChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderCompanyChips === 'function') renderCompanyChips();
}

// Since state is inside closure, re-render chips using querySelectors and reflect into closure via custom events
function renderTitleChips() {
  try {
    const chipsWrap = document.getElementById('list-detail-filter-title-chips');
    const clearBtn = document.getElementById('list-detail-filter-title-clear');
    if (!chipsWrap) return;
    const arr = window.__listDetailState?.titleChips || [];
    chipsWrap.innerHTML = arr.map((t, idx) => `<span class="chip" data-idx="${idx}">${escapeHtml(t)}<button type="button" class="chip-x" aria-label="Remove">×</button></span>`).join('');
    clearBtn && (clearBtn.hidden = arr.length === 0);
    chipsWrap.querySelectorAll('.chip .chip-x').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.currentTarget.closest('.chip');
        const i = parseInt(chip.getAttribute('data-idx'));
        const a = window.__listDetailState.titleChips || [];
        a.splice(i, 1);
        renderTitleChips();
        document.getElementById('list-detail-apply-filters')?.click();
      });
    });
  } catch(_) {}
}

function renderCompanyChips() {
  try {
    const chipsWrap = document.getElementById('list-detail-filter-company-chips');
    const clearBtn = document.getElementById('list-detail-filter-company-clear');
    if (!chipsWrap) return;
    const arr = window.__listDetailState?.companyChips || [];
    chipsWrap.innerHTML = arr.map((t, idx) => `<span class="chip" data-idx="${idx}">${escapeHtml(t)}<button type="button" class="chip-x" aria-label="Remove">×</button></span>`).join('');
    clearBtn && (clearBtn.hidden = arr.length === 0);
    chipsWrap.querySelectorAll('.chip .chip-x').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.currentTarget.closest('.chip');
        const i = parseInt(chip.getAttribute('data-idx'));
        const a = window.__listDetailState.companyChips || [];
        a.splice(i, 1);
        renderCompanyChips();
        document.getElementById('list-detail-apply-filters')?.click();
      });
    });
  } catch(_) {}
}

function hideTitleSuggestions(){ const el = document.getElementById('list-detail-filter-title-suggest'); if (el) el.hidden = true; }
function hideCompanySuggestions(){ const el = document.getElementById('list-detail-filter-company-suggest'); if (el) el.hidden = true; }
function updateTitleSuggestions(){
  const el = document.getElementById('list-detail-filter-title-suggest');
  const input = document.getElementById('list-detail-filter-title');
  if (!el || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const pool = (window.ListDetail && ListDetail._getPool) ? ListDetail._getPool('title') : [];
  const items = (pool || []).filter(v => v && v.toLowerCase().includes(q)).slice(0, 8);
  if (!q || items.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = items.map(v => `<div class="sugg" data-sugg="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
  el.hidden = false;
}

function updateCompanySuggestions(){
  const el = document.getElementById('list-detail-filter-company-suggest');
  const input = document.getElementById('list-detail-filter-company');
  if (!el || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const pool = (window.ListDetail && ListDetail._getPool) ? ListDetail._getPool('company') : [];
  const items = (pool || []).filter(v => v && v.toLowerCase().includes(q)).slice(0, 8);
  if (!q || items.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = items.map(v => `<div class="sugg" data-sugg="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
  el.hidden = false;
}

function addCityToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('city', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch(_) {}
  const arr = (window.__listDetailState.cityChips = window.__listDetailState.cityChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderCityChips === 'function') renderCityChips();
}

function renderCityChips() {
  try {
    const chipsWrap = document.getElementById('list-detail-filter-city-chips');
    const clearBtn = document.getElementById('list-detail-filter-city-clear');
    if (!chipsWrap) return;
    const arr = window.__listDetailState?.cityChips || [];
    chipsWrap.innerHTML = arr.map((t, idx) => `<span class="chip" data-idx="${idx}">${escapeHtml(t)}<button type="button" class="chip-x" aria-label="Remove">×</button></span>`).join('');
    clearBtn && (clearBtn.hidden = arr.length === 0);
    chipsWrap.querySelectorAll('.chip .chip-x').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.currentTarget.closest('.chip');
        const i = parseInt(chip.getAttribute('data-idx'));
        const a = window.__listDetailState.cityChips || [];
        a.splice(i, 1);
        renderCityChips();
        document.getElementById('list-detail-apply-filters')?.click();
      });
    });
  } catch(_) {}
}

function hideCitySuggestions(){ const el = document.getElementById('list-detail-filter-city-suggest'); if (el) el.hidden = true; }
function updateCitySuggestions(){
  const el = document.getElementById('list-detail-filter-city-suggest');
  const input = document.getElementById('list-detail-filter-city');
  if (!el || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const pool = (window.ListDetail && ListDetail._getPool) ? ListDetail._getPool('city') : [];
  const items = (pool || []).filter(v => v && v.toLowerCase().includes(q)).slice(0, 8);
  if (!q || items.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = items.map(v => `<div class="sugg" data-sugg="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
  el.hidden = false;
}

function addStateToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('state', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch(_) {}
  const arr = (window.__listDetailState.stateChips = window.__listDetailState.stateChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderStateChips === 'function') renderStateChips();
}

function renderStateChips() {
  try {
    const chipsWrap = document.getElementById('list-detail-filter-state-chips');
    const clearBtn = document.getElementById('list-detail-filter-state-clear');
    if (!chipsWrap) return;
    const arr = window.__listDetailState?.stateChips || [];
    chipsWrap.innerHTML = arr.map((t, idx) => `<span class="chip" data-idx="${idx}">${escapeHtml(t)}<button type="button" class="chip-x" aria-label="Remove">×</button></span>`).join('');
    clearBtn && (clearBtn.hidden = arr.length === 0);
    chipsWrap.querySelectorAll('.chip .chip-x').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.currentTarget.closest('.chip');
        const i = parseInt(chip.getAttribute('data-idx'));
        const a = window.__listDetailState.stateChips || [];
        a.splice(i, 1);
        renderStateChips();
        document.getElementById('list-detail-apply-filters')?.click();
      });
    });
  } catch(_) {}
}

function hideStateSuggestions(){ const el = document.getElementById('list-detail-filter-state-suggest'); if (el) el.hidden = true; }
function updateStateSuggestions(){
  const el = document.getElementById('list-detail-filter-state-suggest');
  const input = document.getElementById('list-detail-filter-state');
  if (!el || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const pool = (window.ListDetail && ListDetail._getPool) ? ListDetail._getPool('state') : [];
  const items = (pool || []).filter(v => v && v.toLowerCase().includes(q)).slice(0, 8);
  if (!q || items.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = items.map(v => `<div class="sugg" data-sugg="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
  el.hidden = false;
}

function addEmployeesToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('employees', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch(_) {}
  const arr = (window.__listDetailState.employeesChips = window.__listDetailState.employeesChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderEmployeesChips === 'function') renderEmployeesChips();
}

function renderEmployeesChips() {
  try {
    const chipsWrap = document.getElementById('list-detail-filter-employees-chips');
    const clearBtn = document.getElementById('list-detail-filter-employees-clear');
    if (!chipsWrap) return;
    const arr = window.__listDetailState?.employeesChips || [];
    chipsWrap.innerHTML = arr.map((t, idx) => `<span class="chip" data-idx="${idx}">${escapeHtml(t)}<button type="button" class="chip-x" aria-label="Remove">×</button></span>`).join('');
    clearBtn && (clearBtn.hidden = arr.length === 0);
    chipsWrap.querySelectorAll('.chip .chip-x').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.currentTarget.closest('.chip');
        const i = parseInt(chip.getAttribute('data-idx'));
        const a = window.__listDetailState.employeesChips || [];
        a.splice(i, 1);
        renderEmployeesChips();
        document.getElementById('list-detail-apply-filters')?.click();
      });
    });
  } catch(_) {}
}

function hideEmployeesSuggestions(){ const el = document.getElementById('list-detail-filter-employees-suggest'); if (el) el.hidden = true; }
function updateEmployeesSuggestions(){
  const el = document.getElementById('list-detail-filter-employees-suggest');
  const input = document.getElementById('list-detail-filter-employees');
  if (!el || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const pool = (window.ListDetail && ListDetail._getPool) ? ListDetail._getPool('employees') : [];
  const items = (pool || []).filter(v => (v || '').toString().toLowerCase().includes(q)).slice(0, 8);
  if (!q || items.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = items.map(v => `<div class="sugg" data-sugg="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
  el.hidden = false;
}

function addIndustryToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('industry', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch(_) {}
  const arr = (window.__listDetailState.industryChips = window.__listDetailState.industryChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderIndustryChips === 'function') renderIndustryChips();
}

function renderIndustryChips() {
  try {
    const chipsWrap = document.getElementById('list-detail-filter-industry-chips');
    const clearBtn = document.getElementById('list-detail-filter-industry-clear');
    if (!chipsWrap) return;
    const arr = window.__listDetailState?.industryChips || [];
    chipsWrap.innerHTML = arr.map((t, idx) => `<span class="chip" data-idx="${idx}">${escapeHtml(t)}<button type="button" class="chip-x" aria-label="Remove">×</button></span>`).join('');
    clearBtn && (clearBtn.hidden = arr.length === 0);
    chipsWrap.querySelectorAll('.chip .chip-x').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.currentTarget.closest('.chip');
        const i = parseInt(chip.getAttribute('data-idx'));
        const a = window.__listDetailState.industryChips || [];
        a.splice(i, 1);
        renderIndustryChips();
        document.getElementById('list-detail-apply-filters')?.click();
      });
    });
  } catch(_) {}
}

function hideIndustrySuggestions(){ const el = document.getElementById('list-detail-filter-industry-suggest'); if (el) el.hidden = true; }
function updateIndustrySuggestions(){
  const el = document.getElementById('list-detail-filter-industry-suggest');
  const input = document.getElementById('list-detail-filter-industry');
  if (!el || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const pool = (window.ListDetail && ListDetail._getPool) ? ListDetail._getPool('industry') : [];
  const items = (pool || []).filter(v => v && v.toLowerCase().includes(q)).slice(0, 8);
  if (!q || items.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = items.map(v => `<div class="sugg" data-sugg="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
  el.hidden = false;
}

function addVisitorDomainToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('visitorDomain', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch(_) {}
  const arr = (window.__listDetailState.visitorDomainChips = window.__listDetailState.visitorDomainChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderVisitorDomainChips === 'function') renderVisitorDomainChips();
}

function renderVisitorDomainChips() {
  try {
    const chipsWrap = document.getElementById('list-detail-filter-visitor-domain-chips');
    const clearBtn = document.getElementById('list-detail-filter-visitor-domain-clear');
    if (!chipsWrap) return;
    const arr = window.__listDetailState?.visitorDomainChips || [];
    chipsWrap.innerHTML = arr.map((t, idx) => `<span class="chip" data-idx="${idx}">${escapeHtml(t)}<button type="button" class="chip-x" aria-label="Remove">×</button></span>`).join('');
    clearBtn && (clearBtn.hidden = arr.length === 0);
    chipsWrap.querySelectorAll('.chip .chip-x').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const chip = e.currentTarget.closest('.chip');
        const i = parseInt(chip.getAttribute('data-idx'));
        const a = window.__listDetailState.visitorDomainChips || [];
        a.splice(i, 1);
        renderVisitorDomainChips();
        document.getElementById('list-detail-apply-filters')?.click();
      });
    });
  } catch(_) {}
}

function hideVisitorDomainSuggestions(){ const el = document.getElementById('list-detail-filter-visitor-domain-suggest'); if (el) el.hidden = true; }
function updateVisitorDomainSuggestions(){
  const el = document.getElementById('list-detail-filter-visitor-domain-suggest');
  const input = document.getElementById('list-detail-filter-visitor-domain');
  if (!el || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const pool = (window.ListDetail && ListDetail._getPool) ? ListDetail._getPool('visitorDomain') : [];
  const items = (pool || []).filter(v => v && v.toLowerCase().includes(q)).slice(0, 8);
  if (!q || items.length === 0) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = items.map(v => `<div class="sugg" data-sugg="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('');
  el.hidden = false;
}

function injectListDetailBulkStyles() {
  if (document.getElementById('list-detail-bulk-styles')) return;
  const style = document.createElement('style');
  style.id = 'list-detail-bulk-styles';
  style.textContent = `
    /* Match People page bulk actions styling */
    #list-detail-page .table-container { position: relative; overflow: visible; }
    #list-detail-bulk-actions.bulk-actions-modal {
      position: absolute; left: 50%; transform: translateX(-50%); top: 8px;
      width: max-content; max-width: none; background: var(--bg-card); color: var(--text-primary);
      border: 1px solid var(--border-light); border-radius: var(--border-radius-lg);
      box-shadow: var(--elevation-card); padding: 8px 12px; z-index: 850;
    }
    #list-detail-bulk-actions .bar { display: flex; align-items: center; gap: 8px; }
    #list-detail-bulk-actions .spacer { flex: 1 1 auto; }
    #list-detail-bulk-actions .action-btn-sm {
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; line-height: 1; cursor: pointer;
      background: var(--bg-item); color: var(--text-inverse); border: 1px solid var(--border-light);
      border-radius: var(--border-radius-sm); font-size: 0.85rem; flex: 0 0 auto;
    }
    #list-detail-bulk-actions .action-btn-sm:hover { background: var(--grey-700); }
    #list-detail-bulk-actions .action-btn-sm.danger { background: var(--red-muted); border-color: var(--red-subtle); color: var(--text-inverse); }
  `;
  document.head.appendChild(style);
}

function showBulkActionsBar(forceShow) {
  const page = document.getElementById('list-detail-page');
  const container = page?.querySelector('.table-container');
  if (!container) return;
  const set = (page && page.querySelector('#list-detail-view-toggle .toggle-btn.active')?.getAttribute('data-view')) === 'accounts' ? 'accounts' : 'people';
  const count = set === 'people' ? (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('people') : document.querySelectorAll('#list-detail-table .row-select:checked').length) : (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('accounts') : document.querySelectorAll('#list-detail-table .row-select:checked').length);
  const shouldShow = !!forceShow || count > 0;
  let bar = page.querySelector('#list-detail-bulk-actions');
  if (!shouldShow) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'list-detail-bulk-actions';
    bar.className = 'bulk-actions-modal';
    bar.innerHTML = `<div class="bar">
      <strong><span id="ld-selected-count">${count}</span> selected</strong>
      <div class="spacer"></div>
      <button type="button" class="action-btn-sm" id="ld-bulk-sequence">Start Sequence</button>
      <button type="button" class="action-btn-sm" id="ld-bulk-export">Export CSV</button>
      <button type="button" class="action-btn-sm" id="ld-bulk-remove">Remove from List</button>
      <button type="button" class="action-btn-sm danger" id="ld-bulk-delete">Delete</button>
    </div>`;
    container.appendChild(bar);
    // Bind actions
    bar.querySelector('#ld-bulk-sequence')?.addEventListener('click', () => window.crm?.showToast && window.crm.showToast('Sequence action coming soon'));
    bar.querySelector('#ld-bulk-export')?.addEventListener('click', () => exportSelectedToCsv());
    bar.querySelector('#ld-bulk-remove')?.addEventListener('click', () => removeSelectedFromList());
    bar.querySelector('#ld-bulk-delete')?.addEventListener('click', () => window.crm?.showToast && window.crm.showToast('Delete action coming soon'));
    // Reposition on scroll/resize
    const pos = () => {/* anchored via absolute + centered; no-op, layout handles */};
    window.addEventListener('scroll', pos, true);
    window.addEventListener('resize', pos, true);
  } else {
    const span = bar.querySelector('#ld-selected-count'); if (span) span.textContent = String(count);
  }
}

function hideBulkActionsBar() {
  try {
    const el = document.getElementById('list-detail-bulk-actions');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch(_) {}
}

function exportSelectedToCsv() {
  try {
    const view = document.querySelector('#list-detail-view-toggle .toggle-btn.active')?.getAttribute('data-view') || 'people';
    const rows = Array.from(document.querySelectorAll('#list-detail-table .row-select:checked')).map(cb => cb.getAttribute('data-id'));
    if (!rows.length) { window.crm?.showToast && window.crm.showToast('No rows selected'); return; }
    // Build CSV from state.filtered subset
    const data = window.ListDetail && ListDetail._getFiltered ? ListDetail._getFiltered(view) : [];
    const map = new Map(data.map(d => [d.id, d]));
    const chosen = rows.map(id => map.get(id)).filter(Boolean);
    const headers = view === 'people' ? ['id','firstName','lastName','title','companyName','email','phone'] : ['id','accountName','industry','domain','phone'];
    const csv = [headers.join(',')].concat(chosen.map(r => headers.map(h => JSON.stringify((r[h] ?? '')).replace(/^"|"$/g,'')).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `list-${view}-export.csv`; a.click(); URL.revokeObjectURL(url);
  } catch (e) { console.warn('CSV export failed', e); }
}

async function removeSelectedFromList() {
  try {
    const page = document.getElementById('list-detail-page');
    const listId = window.listDetailContext?.listId;
    if (!listId || !window.firebaseDB) { window.crm?.showToast && window.crm.showToast('Cannot remove from list'); return; }
    const view = page.querySelector('#list-detail-view-toggle .toggle-btn.active')?.getAttribute('data-view') || 'people';
    const ids = Array.from(document.querySelectorAll('#list-detail-table .row-select:checked')).map(cb => cb.getAttribute('data-id'));
    if (!ids.length) return;
    const col = window.firebaseDB.collection('lists').doc(listId).collection('members');
    const snap = await col.get();
    const ops = [];
    snap.forEach(doc => {
      const m = doc.data() || {};
      const t = (m.targetType || m.type || '').toLowerCase();
      const id = m.targetId || m.id || doc.id;
      const matchesView = (view === 'people' ? (t === 'people' || t === 'contact' || t === 'contacts') : (t === 'accounts' || t === 'account'));
      if (matchesView && ids.includes(id)) ops.push(col.doc(doc.id).delete());
    });
    await Promise.all(ops);
    window.crm?.showToast && window.crm.showToast(`Removed ${ids.length} from list`);
    // Refresh members and re-apply filters
    if (window.ListDetail && typeof window.ListDetail.init === 'function') {
      // re-fetch members only
      // Fallback: trigger a soft reload sequence
      const ctx = window.listDetailContext || {};
      window.ListDetail.init(ctx);
    }
  } catch (e) {
    console.warn('Remove from list failed', e);
    window.crm?.showToast && window.crm.showToast('Failed to remove from list');
  }
}
