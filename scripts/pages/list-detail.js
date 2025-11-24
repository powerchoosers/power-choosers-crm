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
    hasAnimated: false, // Prevent re-animation on restore
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
  const DEFAULT_ACCOUNTS_COL_ORDER = [
    'select',
    'name',
    'industry',
    'domain',
    'companyPhone',
    'contractEnd',
    'sqft',
    'occupancy',
    'employees',
    'location',
    'actions',
    'updated'
  ];

  const PEOPLE_COL_STORAGE_KEY = 'list_detail_people_column_order';
  const ACCOUNTS_COL_STORAGE_KEY = 'list_detail_accounts_column_order';

  let peopleColumnOrder = DEFAULT_PEOPLE_COL_ORDER.slice();
  let accountsColumnOrder = DEFAULT_ACCOUNTS_COL_ORDER.slice();

  // Helper function to get normalized user email (cost-effective - no Firestore reads)
  function getUserEmail() {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
        return window.DataManager.getCurrentUserEmail();
      }
      return (window.currentUserEmail || '').toLowerCase();
    } catch (_) {
      return (window.currentUserEmail || '').toLowerCase();
    }
  }

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

  // Phone formatting helpers (mirror people.js)
  function parsePhoneWithExtension(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return { number: '', extension: '' };

    const extensionPatterns = [
      /ext\.?\s*(\d+)/i,
      /extension\s*(\d+)/i,
      /x\.?\s*(\d+)/i,
      /#\s*(\d+)/i,
      /\s+(\d{3,6})\s*$/
    ];

    let number = raw;
    let extension = '';

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

  function formatPhoneForDisplay(phone) {
    if (!phone) return '';

    const parsed = parsePhoneWithExtension(phone);
    if (!parsed.number) return phone;

    let formattedNumber = '';
    const cleaned = parsed.number.replace(/\D/g, '');

    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      formattedNumber = `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      formattedNumber = `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (/^\+/.test(String(parsed.number))) {
      formattedNumber = parsed.number;
    } else {
      formattedNumber = parsed.number;
    }

    if (parsed.extension) {
      return `${formattedNumber} ext. ${parsed.extension}`;
    }

    return formattedNumber;
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

    // View toggle removed - list detail shows only one type

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
        // Check if we came from lists page
        if (window._listDetailNavigationSource === 'lists') {
          try {
            const restore = window._listDetailReturn || {};
            console.log('[ListDetail] Back button: Returning to lists page with restore data:', restore);
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('lists');

              // Dispatch event to restore lists page state
              setTimeout(() => {
                try {
                  const ev = new CustomEvent('pc:lists-restore', {
                    detail: {
                      page: restore.page,
                      scroll: restore.scroll,
                      filters: restore.filters,
                      searchTerm: restore.searchTerm,
                      selectedItems: restore.selectedItems,
                      timestamp: Date.now()
                    }
                  });
                  document.dispatchEvent(ev);
                  console.log('[ListDetail] Back button: Dispatched pc:lists-restore event');
                } catch (_) { }
              }, 60);
            }
            // Clear navigation markers after successful navigation
            window._listDetailNavigationSource = null;
            window._listDetailReturn = null;
          } catch (_) { /* noop */ }
          return;
        }

        // Default: just navigate to lists
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
      const debounce = (fn, delay = 120) => {
        let t; return function () { clearTimeout(t); const args = arguments; t = setTimeout(() => fn.apply(this, args), delay); };
      };
      const debouncedFilter = debounce(() => applyFilters(), 120);
      els.quickSearch.addEventListener('input', debouncedFilter);
    }

    // View toggle removed - list detail now shows only the list's designated type (people or accounts)
    // The list kind is determined when opening the list from the overview page

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
        const anchor = e.target.closest('a, .name-cell, .company-link, .acct-link');
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

            // Capture state for restoration
            try {
              window._listDetailReturn = {
                page: state.currentPage,
                scroll: window.scrollY || 0,
                filters: {
                  quickSearch: els.quickSearch ? els.quickSearch.value : '',
                  chips: { ...state.chips },
                  flags: { ...state.flags }
                },
                listId: state.listId,
                listName: state.listName,
                view: state.view
              };
              console.log('[ListDetail] Captured state for back navigation (contact):', window._listDetailReturn);
            } catch (_) { /* noop */ }

            // Navigate via existing people route to ensure modules are bound, then open detail with retry mechanism
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');

              // Use requestAnimationFrame with additional delay to ensure the page is fully loaded
              requestAnimationFrame(() => {
                setTimeout(() => {
                  if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                    console.log('[List Detail] Showing contact detail:', contactId);
                    try {
                      window.ContactDetail.show(contactId);
                    } catch (error) {
                      console.error('[List Detail] Error showing contact detail:', error);
                    }
                  } else {
                    console.log('[List Detail] ContactDetail not available, using retry mechanism');
                    // Retry mechanism to ensure ContactDetail module is ready
                    let attempts = 0;
                    const maxAttempts = 15;
                    const retryInterval = 150;
                    const retry = () => {
                      attempts++;
                      if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                        console.log('[List Detail] ContactDetail ready after', attempts, 'attempts');
                        window.ContactDetail.show(contactId);
                      } else if (attempts < maxAttempts) {
                        setTimeout(retry, retryInterval);
                      } else {
                        console.error('[List Detail] ContactDetail not available after', maxAttempts, 'attempts');
                      }
                    };
                    retry();
                  }
                }, 200);
              });
            }
          }
        }

        // Handle company name clicks (for contacts)
        // COST-EFFECTIVE: Use findAccountByName() which checks cache first, then BackgroundAccountsLoader (zero Firestore reads)
        if (anchor.matches('.company-link[data-company-name]')) {
          e.preventDefault();
          const accountId = anchor.getAttribute('data-account-id');
          // Note: getAttribute returns the decoded value, no need to decode HTML entities here
          const companyName = anchor.getAttribute('data-company-name');

          let account = null;

          // If data-account-id exists, use it directly (fastest path)
          if (accountId) {
            // Try to find account in local state first
            account = state.dataAccounts.find(acc => acc.id === accountId);

            // Fallback to BackgroundAccountsLoader (cost-effective: zero Firestore reads)
            if (!account && window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
              try {
                const allAccounts = window.BackgroundAccountsLoader.getAccountsData() || [];
                account = allAccounts.find(acc => acc.id === accountId);
              } catch (_) { /* noop */ }
            }

            // Final fallback to global getAccountsData (cost-effective: uses cache)
            if (!account && typeof window.getAccountsData === 'function') {
              try {
                const allAccounts = window.getAccountsData() || [];
                account = allAccounts.find(acc => acc.id === accountId);
              } catch (_) { /* noop */ }
            }
          } else if (companyName) {
            // No account ID - find by name (case-insensitive, with fallback to global accounts data)
            account = findAccountByName(companyName);
          }

          if (account && account.id) {
            console.log('[ListDetail] Navigating to account:', account.id, account.accountName || account.name);
            // Store navigation context for back button
            window._accountNavigationSource = 'list-detail';
            window._accountNavigationListId = state.listId;
            window._accountNavigationListName = state.listName;
            window._accountNavigationListView = 'people';

            // Capture state for restoration
            try {
              window._listDetailReturn = {
                page: state.currentPage,
                scroll: window.scrollY || 0,
                filters: {
                  quickSearch: els.quickSearch ? els.quickSearch.value : '',
                  chips: { ...state.chips },
                  flags: { ...state.flags }
                },
                listId: state.listId,
                listName: state.listName,
                view: state.view
              };
              console.log('[ListDetail] Captured state for back navigation:', window._listDetailReturn);
            } catch (_) { /* noop */ }

            // Prefetch account object and open detail immediately
            try { window._prefetchedAccountForDetail = account; } catch (_) { }
            if (window.showAccountDetail && typeof window.showAccountDetail === 'function') {
              window.showAccountDetail(account.id);
            } else if (window.crm && typeof window.crm.navigateToPage === 'function') {
              // Fallback: go to accounts page
              window.crm.navigateToPage('accounts');
            }
          } else {
            console.warn('[ListDetail] ⚠ Cannot navigate: account not found for company:', companyName);
          }
        }

        // Handle account name clicks (for accounts view)
        if (anchor.matches('.company-link[data-account-id]') || anchor.matches('.acct-link[data-account-id]')) {
          e.preventDefault();
          const accountId = anchor.getAttribute('data-account-id');
          const accountName = anchor.getAttribute('data-account-name');
          if (accountId) {
            // Store navigation context for back button
            window._accountNavigationSource = 'list-detail';
            window._accountNavigationListId = state.listId;
            window._accountNavigationListName = state.listName;
            window._accountNavigationListView = 'accounts';

            // Capture state for restoration
            try {
              window._listDetailReturn = {
                page: state.currentPage,
                scroll: window.scrollY || 0,
                filters: {
                  quickSearch: els.quickSearch ? els.quickSearch.value : '',
                  chips: { ...state.chips },
                  flags: { ...state.flags }
                },
                listId: state.listId,
                listName: state.listName,
                view: state.view
              };
              console.log('[ListDetail] Captured state for back navigation:', window._listDetailReturn);
            } catch (_) { /* noop */ }

            // Prefetch account object if available and open detail immediately
            try {
              const acct = (state.dataAccounts || []).find(a => a.id === accountId);
              if (acct) window._prefetchedAccountForDetail = acct;
            } catch (_) { }
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
            .map(ch => ch.textContent.replace('×', '').trim()).filter(Boolean);
          const c = Array.from(document.querySelectorAll('#list-detail-filter-company-chips .chip'))
            .map(ch => ch.textContent.replace('×', '').trim()).filter(Boolean);
          state.chips.title = t;
          state.chips.company = c;
          const city = Array.from(document.querySelectorAll('#list-detail-filter-city-chips .chip'))
            .map(ch => ch.textContent.replace('×', '').trim()).filter(Boolean);
          const st = Array.from(document.querySelectorAll('#list-detail-filter-state-chips .chip'))
            .map(ch => ch.textContent.replace('×', '').trim()).filter(Boolean);
          const emp = Array.from(document.querySelectorAll('#list-detail-filter-employees-chips .chip'))
            .map(ch => ch.textContent.replace('×', '').trim()).filter(Boolean);
          const ind = Array.from(document.querySelectorAll('#list-detail-filter-industry-chips .chip'))
            .map(ch => ch.textContent.replace('×', '').trim()).filter(Boolean);
          const dom = Array.from(document.querySelectorAll('#list-detail-filter-visitor-domain-chips .chip'))
            .map(ch => ch.textContent.replace('×', '').trim()).filter(Boolean);
          state.chips.city = city; state.chips.state = st; state.chips.employees = emp; state.chips.industry = ind; state.chips.visitorDomain = dom;
          state.flags.hasEmail = !!(els.pHasEmail && els.pHasEmail.checked);
          state.flags.hasPhone = !!(els.pHasPhone && els.pHasPhone.checked);
        } catch (_) { }
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
        } catch (_) { }
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

  // updateViewToggle function removed - no longer needed since list detail shows only one type

  async function loadDataOnce() {
    // COST OPTIMIZATION: Only load the data type needed for this list (people OR accounts, not both)
    const needsPeople = state.view === 'people' && !state.loadedPeople;
    const needsAccounts = state.view === 'accounts' && !state.loadedAccounts;

    // If both already loaded or nothing needed, return early
    if (!needsPeople && !needsAccounts) return;

    try {
      if (console.time) console.time('[ListDetail] loadDataOnce');

      // PRIORITY 1: Use BackgroundContactsLoader and BackgroundAccountsLoader for instant data access
      // COST OPTIMIZATION: Only load what's needed for the current list view
      if (needsPeople) {
        if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
          state.dataPeople = window.BackgroundContactsLoader.getContactsData() || [];
          state.loadedPeople = true;
          console.debug('[ListDetail] loadDataOnce: people loaded from BackgroundContactsLoader', { count: state.dataPeople.length });
        } else if (typeof window.getPeopleData === 'function') {
          state.dataPeople = window.getPeopleData() || [];
          state.loadedPeople = true;
          console.debug('[ListDetail] loadDataOnce: people loaded from getPeopleData', { count: state.dataPeople.length });
        }
      }

      if (needsAccounts) {
        if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
          state.dataAccounts = window.BackgroundAccountsLoader.getAccountsData() || [];
          state.loadedAccounts = true;
          console.debug('[ListDetail] loadDataOnce: accounts loaded from BackgroundAccountsLoader', { count: state.dataAccounts.length });
        } else if (typeof window.getAccountsData === 'function') {
          state.dataAccounts = window.getAccountsData() || [];
          state.loadedAccounts = true;
          console.debug('[ListDetail] loadDataOnce: accounts loaded from getAccountsData', { count: state.dataAccounts.length });
        }
      }

      // FALLBACK: If background loaders not ready yet, wait for them
      // COST OPTIMIZATION: Only wait for the loader we actually need
      if ((needsPeople && !state.loadedPeople && window.BackgroundContactsLoader) ||
        (needsAccounts && !state.loadedAccounts && window.BackgroundAccountsLoader)) {
        console.log('[ListDetail] Background loaders not ready yet, waiting...');

        // Wait up to 3 seconds (30 attempts x 100ms)
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));

          if (needsPeople && !state.loadedPeople && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            if (contacts.length > 0) {
              state.dataPeople = contacts;
              state.loadedPeople = true;
              console.log('[ListDetail] ✓ BackgroundContactsLoader ready after', (attempt + 1) * 100, 'ms with', contacts.length, 'contacts');
            }
          }

          if (needsAccounts && !state.loadedAccounts && window.BackgroundAccountsLoader) {
            const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
            if (accounts.length > 0) {
              state.dataAccounts = accounts;
              state.loadedAccounts = true;
              console.log('[ListDetail] ✓ BackgroundAccountsLoader ready after', (attempt + 1) * 100, 'ms with', accounts.length, 'accounts');
            }
          }

          // Break if what we need is loaded
          if ((needsPeople && state.loadedPeople) || (needsAccounts && state.loadedAccounts)) {
            break;
          }
        }

        if ((needsPeople && !state.loadedPeople) || (needsAccounts && !state.loadedAccounts)) {
          console.warn('[ListDetail] ⚠ Timeout waiting for background loaders after 3 seconds', {
            peopleLoaded: state.loadedPeople,
            accountsLoaded: state.loadedAccounts,
            needsPeople,
            needsAccounts
          });
        }
      }

      // FINAL FALLBACK: Use CacheManager or Firestore
      // COST OPTIMIZATION: Only load what's needed
      if ((needsPeople && !state.loadedPeople) || (needsAccounts && !state.loadedAccounts)) {
        if (window.CacheManager && typeof window.CacheManager.get === 'function') {
          if (needsPeople && !state.loadedPeople) {
            state.dataPeople = await window.CacheManager.get('contacts') || [];
            state.loadedPeople = true;
            console.debug('[ListDetail] loadDataOnce: people loaded from CacheManager', { count: state.dataPeople.length });
          }

          if (needsAccounts && !state.loadedAccounts) {
            state.dataAccounts = await window.CacheManager.get('accounts') || [];
            state.loadedAccounts = true;
            console.debug('[ListDetail] loadDataOnce: accounts loaded from CacheManager', { count: state.dataAccounts.length });
          }
        } else if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
          // Firestore fallback - SCOPED queries for security compliance
          const email = getUserEmail();

          if (needsPeople && !state.loadedPeople) {
            let peopleSnap;
            if (window.currentUserRole !== 'admin' && email) {
              // Non-admin: use scoped queries
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('contacts').where('ownerId', '==', email).limit(1000).get(),
                window.firebaseDB.collection('contacts').where('assignedTo', '==', email).limit(1000).get()
              ]);
              const map = new Map();
              ownedSnap.forEach(d => map.set(d.id, d));
              assignedSnap.forEach(d => { if (!map.has(d.id)) map.set(d.id, d); });
              peopleSnap = { docs: Array.from(map.values()) };
            } else {
              // Admin: use unfiltered query
              peopleSnap = await window.firebaseDB.collection('contacts').limit(1000).get();
            }
            state.dataPeople = peopleSnap ? peopleSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            state.loadedPeople = true;
            console.debug('[ListDetail] loadDataOnce: people loaded from Firestore (scoped)', { count: state.dataPeople.length });
          }

          if (needsAccounts && !state.loadedAccounts) {
            let accountsSnap;
            if (window.currentUserRole !== 'admin' && email) {
              // Non-admin: use scoped queries
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('accounts').where('ownerId', '==', email).limit(1000).get(),
                window.firebaseDB.collection('accounts').where('assignedTo', '==', email).limit(1000).get()
              ]);
              const map = new Map();
              ownedSnap.forEach(d => map.set(d.id, d));
              assignedSnap.forEach(d => { if (!map.has(d.id)) map.set(d.id, d); });
              accountsSnap = { docs: Array.from(map.values()) };
            } else {
              // Admin: use unfiltered query
              accountsSnap = await window.firebaseDB.collection('accounts').limit(1000).get();
            }
            state.dataAccounts = accountsSnap ? accountsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            state.loadedAccounts = true;
            console.debug('[ListDetail] loadDataOnce: accounts loaded from Firestore (scoped)', { count: state.dataAccounts.length });
          }
        }
      }

      // Ensure defaults (only for what we actually loaded)
      if (needsPeople) {
        state.dataPeople = state.dataPeople || [];
        state.loadedPeople = true;
      }
      if (needsAccounts) {
        state.dataAccounts = state.dataAccounts || [];
        state.loadedAccounts = true;
      }

    } catch (e) {
      console.error('[ListDetail] Failed loading data (preserving cache):', e);

      // COST-EFFECTIVE: Preserve cache on error (don't clear existing data)
      // Try to use BackgroundLoaders as fallback (only for what we need)
      if (needsPeople && !state.loadedPeople && window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
        try {
          const cached = window.BackgroundContactsLoader.getContactsData() || [];
          if (cached.length > 0) {
            state.dataPeople = cached;
            state.loadedPeople = true;
            console.log('[ListDetail] ✓ Preserved contacts cache on error (zero cost)');
          }
        } catch (cacheErr) {
          console.warn('[ListDetail] Contacts cache fallback failed:', cacheErr);
        }
      }

      if (needsAccounts && !state.loadedAccounts && window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
        try {
          const cached = window.BackgroundAccountsLoader.getAccountsData() || [];
          if (cached.length > 0) {
            state.dataAccounts = cached;
            state.loadedAccounts = true;
            console.log('[ListDetail] ✓ Preserved accounts cache on error (zero cost)');
          }
        } catch (cacheErr) {
          console.warn('[ListDetail] Accounts cache fallback failed:', cacheErr);
        }
      }

      // Ensure defaults (only for what we actually needed)
      if (needsPeople) {
        state.dataPeople = state.dataPeople || [];
        state.loadedPeople = true;
      }
      if (needsAccounts) {
        state.dataAccounts = state.dataAccounts || [];
        state.loadedAccounts = true;
      }
    }

    if (console.timeEnd) console.timeEnd('[ListDetail] loadDataOnce');
    buildSuggestionPools();
    // Don't render here during initial load - let init() handle the final render after all data is ready
    // This prevents duplicate renders that cause flicker
  }

  async function fetchMembers(listId) {
    // COST-EFFECTIVE: Always initialize Sets (preserves cache on errors)
    state.membersPeople = new Set();
    state.membersAccounts = new Set();

    if (!listId) {
      console.log('[ListDetail] No listId provided, skipping member fetch');
      return;
    }

    if (console.time) console.time(`[ListDetail] fetchMembers ${listId}`);

    // 1) Check IndexedDB cache first (10-minute expiry) - COST-EFFECTIVE: zero Firestore reads
    try {
      const cached = await window.CacheManager.getCachedListMembers(listId);
      if (cached && (cached.people instanceof Set || Array.isArray(cached.people))) {
        state.membersPeople = cached.people instanceof Set ? cached.people : new Set(cached.people || []);
        state.membersAccounts = cached.accounts instanceof Set ? cached.accounts : new Set(cached.accounts || []);
        console.log(`[ListDetail] ✓ Loaded ${state.membersPeople.size} people, ${state.membersAccounts.size} accounts from cache (zero cost)`);

        // Update legacy in-memory cache for backward compatibility
        window.listMembersCache = window.listMembersCache || {};
        window.listMembersCache[listId] = {
          people: new Set(state.membersPeople),
          accounts: new Set(state.membersAccounts),
          loaded: true
        };

        if (console.timeEnd) console.timeEnd(`[ListDetail] fetchMembers ${listId}`);
        return;
      }
    } catch (e) {
      console.warn('[ListDetail] Cache read failed (preserving empty Sets):', e);
      // COST-EFFECTIVE: Preserve empty Sets instead of clearing - allows filtering to work
    }

    // 2) Cache miss - fetch from Firebase (only if cache empty/expired)
    console.log('[ListDetail] Cache miss, fetching from Firebase...');
    try {
      if (!window.firebaseDB || typeof window.firebaseDB.collection !== 'function') {
        console.warn('[ListDetail] Firestore not available, preserving empty Sets');
        if (console.timeEnd) console.timeEnd(`[ListDetail] fetchMembers ${listId}`);
        return;
      }

      // CRITICAL FIX: Check BOTH collections and merge results
      // All new additions go to top-level 'listMembers', but legacy data might be in subcollection
      // We need to check both to ensure we get ALL members

      // Priority 1: Top-level listMembers collection (where all new additions go)
      try {
        const lmSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).limit(5000).get();
        if (lmSnap && lmSnap.docs && lmSnap.docs.length > 0) {
          lmSnap.docs.forEach(d => {
            const m = d.data() || {};
            const t = (m.targetType || m.type || '').toLowerCase();
            const id = m.targetId || m.id || d.id;
            if (t === 'people' || t === 'contact' || t === 'contacts') state.membersPeople.add(id);
            else if (t === 'accounts' || t === 'account') state.membersAccounts.add(id);
          });
          console.log(`[ListDetail] ✓ Loaded ${state.membersPeople.size} people, ${state.membersAccounts.size} accounts from top-level collection`);
        }
      } catch (lmErr) {
        console.warn('[ListDetail] Top-level query failed:', lmErr);
      }

      // Priority 2: Also check subcollection for any legacy data (merge with top-level results)
      try {
        const subSnap = await window.firebaseDB.collection('lists').doc(listId).collection('members').get();
        if (subSnap && subSnap.docs && subSnap.docs.length > 0) {
          const beforePeople = state.membersPeople.size;
          const beforeAccounts = state.membersAccounts.size;
          subSnap.docs.forEach(d => {
            const m = d.data() || {};
            const t = (m.targetType || m.type || '').toLowerCase();
            const id = m.targetId || m.id || d.id;
            if (t === 'people' || t === 'contact' || t === 'contacts') state.membersPeople.add(id);
            else if (t === 'accounts' || t === 'account') state.membersAccounts.add(id);
          });
          const addedPeople = state.membersPeople.size - beforePeople;
          const addedAccounts = state.membersAccounts.size - beforeAccounts;
          if (addedPeople > 0 || addedAccounts > 0) {
            console.log(`[ListDetail] ✓ Merged ${addedPeople} people, ${addedAccounts} accounts from subcollection (legacy data)`);
          }
        }
      } catch (subErr) {
        console.warn('[ListDetail] Subcollection query failed (non-critical):', subErr);
      }

      // 3) Cache the results for next time (COST-EFFECTIVE: IndexedDB write only)
      if (state.membersPeople.size > 0 || state.membersAccounts.size > 0) {
        try {
          await window.CacheManager.cacheListMembers(listId, state.membersPeople, state.membersAccounts);
          console.log(`[ListDetail] ✓ Cached members for future use (zero cost on next load)`);
        } catch (cacheErr) {
          console.warn('[ListDetail] Cache write failed (non-critical):', cacheErr);
        }
      }

      console.log(`[ListDetail] ✓ Fetched from Firebase: ${state.membersPeople.size} people, ${state.membersAccounts.size} accounts`);

      // 4) Update legacy in-memory cache for backward compatibility
      window.listMembersCache = window.listMembersCache || {};
      window.listMembersCache[listId] = {
        people: new Set(state.membersPeople),
        accounts: new Set(state.membersAccounts),
        loaded: true
      };

    } catch (err) {
      console.error('[ListDetail] Failed to fetch list members (preserving empty Sets):', err);
      // COST-EFFECTIVE: Preserve empty Sets on error - allows filtering to work without crashing
    }

    if (console.timeEnd) console.timeEnd(`[ListDetail] fetchMembers ${listId}`);
  }

  function applyFilters() {
    const q = normalize(els.quickSearch ? els.quickSearch.value : '');
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    // Define qMatch outside so it's available for both people and accounts views
    const qMatch = (str) => !q || normalize(str).includes(q);

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

    // Only reset to first page when not restoring/preserving pagination
    if (!state.suppressPageReset) {
      state.currentPage = 1;
    }
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

  // Helper to decode HTML entities (for company name matching)
  function decodeHtmlEntities(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  // Helper to find account by name (case-insensitive, with fallback to global accounts data)
  function findAccountByName(companyName) {
    if (!companyName) return null;
    // Decode HTML entities first (e.g., &#039; → ', &amp; → &)
    const decodedName = decodeHtmlEntities(companyName);
    const normalizedName = normalize(decodedName);

    // First try state.dataAccounts (local cache)
    let account = state.dataAccounts.find(acc => {
      const accName = normalize(acc.accountName || acc.name || acc.companyName || '');
      return accName === normalizedName;
    });

    if (account) {
      console.debug('[ListDetail] Found account in state.dataAccounts:', decodedName, '→', account.id);
      return account;
    }

    // Fallback to BackgroundAccountsLoader (cost-effective: zero Firestore reads)
    if (!account && window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
      try {
        const allAccounts = window.BackgroundAccountsLoader.getAccountsData() || [];
        account = allAccounts.find(acc => {
          const accName = normalize(acc.accountName || acc.name || acc.companyName || '');
          return accName === normalizedName;
        });
        if (account) {
          console.debug('[ListDetail] Found account in BackgroundAccountsLoader:', decodedName, '→', account.id);
        }
      } catch (_) { /* noop */ }
    }

    // Final fallback to global getAccountsData (cost-effective: uses cache)
    if (!account && typeof window.getAccountsData === 'function') {
      try {
        const allAccounts = window.getAccountsData() || [];
        account = allAccounts.find(acc => {
          const accName = normalize(acc.accountName || acc.name || acc.companyName || '');
          return accName === normalizedName;
        });
        if (account) {
          console.debug('[ListDetail] Found account in getAccountsData:', decodedName, '→', account.id);
        }
      } catch (_) { /* noop */ }
    }

    if (!account) {
      console.warn('[ListDetail] ⚠ Account not found for company:', decodedName, '(original:', companyName + ')');
    }

    return account || null;
  }

  function getPageItems() {
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    return state.filtered.slice(start, end);
  }

  function render() {
    if (!els.tbody) return;
    const pageItems = getPageItems();
    let rows = pageItems.map((item) => state.view === 'people' ? rowHtmlPeople(item) : rowHtmlAccount(item)).join('');

    // If this isn't the first render, pre-mark icons as loaded to prevent animation flicker
    if (state.hasAnimated && rows) {
      rows = rows.replace(/class="company-favicon"/g, 'class="company-favicon icon-loaded"');
      rows = rows.replace(/class="avatar-initials"/g, 'class="avatar-initials icon-loaded"');
    }

    els.tbody.innerHTML = rows || emptyHtml();

    // Mark as animated after first render to prevent future animations
    if (!state.hasAnimated) {
      state.hasAnimated = true;
    }

    renderPagination();

    // Initialize click-to-call and click-to-email after table is rendered
    setTimeout(() => {
      if (window.ClickToCall && typeof window.ClickToCall.init === 'function') {
        window.ClickToCall.init();
      }
      if (window.ClickToEmail && typeof window.ClickToEmail.init === 'function') {
        window.ClickToEmail.init();
      }
    }, 50);

    // Bind row selection events (delegate)
    if (!els._tbodyBound) {
      els.tbody.addEventListener('change', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('row-select')) {
          const id = e.target.getAttribute('data-id');
          const checked = !!e.target.checked;
          console.log('[ListDetail] Checkbox changed:', { id, checked, view: state.view });
          if (state.view === 'people') {
            if (checked) state.selectedPeople.add(id); else state.selectedPeople.delete(id);
            console.log('[ListDetail] Selected people count:', state.selectedPeople.size);
          } else {
            if (checked) state.selectedAccounts.add(id); else state.selectedAccounts.delete(id);
            console.log('[ListDetail] Selected accounts count:', state.selectedAccounts.size);
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
        if (els.selectAll.checked) {
          // Open bulk select popover instead of directly selecting
          openBulkSelectPopover();
        } else {
          // Uncheck all
          const set = (state.view === 'people') ? state.selectedPeople : state.selectedAccounts;
          set.clear();
          els.tbody.querySelectorAll('.row-select').forEach(cb => { cb.checked = false; });
          updateHeaderSelectAll();
          renderRowSelectionHighlights();
          showBulkActionsBar();
        }
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
    const company = c.companyName || ''; // Don't escape here - will escape when inserting into HTML
    const email = escapeHtml(c.email || '');

    // Phone: prefer user-selected default, then fallback to priority order
    const preferredKey = String(c.preferredPhoneField || '').trim();
    let phoneRaw = '';
    if (preferredKey && (preferredKey === 'workDirectPhone' || preferredKey === 'mobile' || preferredKey === 'otherPhone')) {
      phoneRaw = c[preferredKey] || '';
    }
    if (!phoneRaw) phoneRaw = c.workDirectPhone || c.mobile || c.otherPhone || c.phone || '';
    const phone = phoneRaw;
    const phoneFormatted = phone ? formatPhoneForDisplay(phone) : '';

    const locCity = c.city || (c.location && c.location.city) || '';
    const locState = c.state || (c.location && (c.location.state || c.location.region)) || '';
    const location = escapeHtml([locCity, locState].filter(Boolean).join(', '));
    const updatedStr = escapeHtml(formatDateOrNA(c.updatedAt, c.createdAt));
    const checked = state.selectedPeople.has(id) ? ' checked' : '';
    const rowClass = state.selectedPeople.has(id) ? ' class="row-selected"' : '';

    // Compute initials for avatar (first letter of first and last word)
    const initials = (() => {
      const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
      const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : (parts[0] ? [parts[0][0]] : []);
      const str = chars.join('').toUpperCase();
      if (str) return str;
      const e = String(c.email || '').trim();
      return e ? e[0].toUpperCase() : '?';
    })();

    let html = `<tr${rowClass}>`;

    peopleColumnOrder.forEach(col => {
      switch (col) {
        case 'select':
          html += `<td class="col-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(id)}" aria-label="Select"${checked}></td>`;
          break;
        case 'name':
          html += `<td class="name-cell" data-contact-id="${escapeHtml(id)}"><div class="name-cell__wrap"><span class="avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(fullName)}</span></div></td>`;
          break;
        case 'title':
          html += `<td>${title}</td>`;
          break;
        case 'company':
          // Build favicon/logo HTML with logoUrl priority and safe click behavior
          // COST-EFFECTIVE: Use findAccountByName() which checks cache first, then BackgroundAccountsLoader (zero Firestore reads)
          const acct = findAccountByName(company);
          const faviconHTML = (() => {
            let domain = '';
            let logoUrl = '';

            if (acct) {
              domain = String(acct.domain || acct.website || '').trim();
              logoUrl = acct.logoUrl || acct.logoURL || '';
            }

            // If no domain from account, try to derive from company name (fallback for logo rendering)
            if (!domain && company) {
              // Try to extract domain from company name if it looks like a domain
              const nameStr = String(company).trim();
              if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(nameStr) && !/\s/.test(nameStr)) {
                domain = nameStr.replace(/^www\./i, '');
              }
            }

            if (/^https?:\/\//i.test(domain)) {
              try { domain = new URL(domain).hostname; } catch (_) { domain = domain.replace(/^https?:\/\//i, '').split('/')[0]; }
            }
            domain = domain ? domain.replace(/^www\./i, '') : '';

            if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
              const html = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 32 });
              return html && String(html).trim() ? html : '<span class="company-favicon placeholder" aria-hidden="true"></span>';
            }
            if (domain) {
              return `<img class="company-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=${escapeHtml(domain)}" alt="" aria-hidden="true" referrerpolicy="no-referrer" loading="lazy" style="pointer-events:none" onerror="this.style.display='none'" />`;
            }
            return '<span class="company-favicon placeholder" aria-hidden="true"></span>';
          })();

          // Add data-account-id if account found (enables proper navigation)
          const accountIdAttr = acct && acct.id ? ` data-account-id="${escapeHtml(acct.id)}"` : '';
          html += `<td><a href="#" class="company-link" data-company-name="${escapeHtml(company)}"${accountIdAttr}><span class="company-cell__wrap">${faviconHTML}<span class="company-name">${escapeHtml(company)}</span></span></a></td>`;
          break;
        case 'email':
          html += `<td class="email-link" data-email="${escapeHtml(email)}" data-name="${escapeHtml(fullName)}">${email}</td>`;
          break;
        case 'phone':
          html += `<td class="phone-cell" data-phone="${escapeHtml(phone)}" data-contact-id="${escapeHtml(id)}" data-contact-name="${escapeHtml(fullName)}" data-company-name="${escapeHtml(company)}">${phone ? `<span class="phone-link">${escapeHtml(phoneFormatted)}</span>` : ''}</td>`;
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
    if (!a) return '';
    const name = escapeHtml(a.accountName || a.name || a.companyName || 'Unknown Account');
    const industry = escapeHtml(a.industry || '');
    const domain = escapeHtml(a.domain || a.website || a.site || '');
    const phone = a.companyPhone || a.phone || a.primaryPhone || a.mainPhone || '';
    const phoneFormatted = phone ? formatPhoneForDisplay(phone) : '';
    const contractEnd = formatDateOrNA(a.contractEndDate, a.contractEnd, a.contract_end_date);
    const sqftNum = a.squareFootage ?? a.sqft ?? a.square_feet;
    const sqft = (typeof sqftNum === 'number' && isFinite(sqftNum)) ? sqftNum.toLocaleString() : escapeHtml(sqftNum || '');
    const occVal = a.occupancyPct ?? a.occupancy ?? a.occupancy_percentage;
    const occupancy = (typeof occVal === 'number' && isFinite(occVal)) ? (Math.round(occVal * (occVal > 1 ? 1 : 100)) + '%') : escapeHtml(occVal || '');
    const employeesNum = a.employees ?? a.employeeCount ?? a.numEmployees;
    const employees = (typeof employeesNum === 'number' && isFinite(employeesNum)) ? employeesNum.toLocaleString() : escapeHtml(employeesNum || '');
    const city = escapeHtml(a.city || a.locationCity || a.town || '');
    const stateVal = escapeHtml(a.state || a.locationState || a.region || '');
    const location = (city || stateVal) ? `${city}${city && stateVal ? ', ' : ''}${stateVal}` : '';
    const updatedStr = escapeHtml(formatDateOrNA(a.updatedAt, a.createdAt));
    const checked = state.selectedAccounts.has(a.id) ? ' checked' : '';
    const rowClass = state.selectedAccounts.has(a.id) ? ' class="row-selected"' : '';
    const aid = escapeHtml(a.id);

    // Compute favicon domain (mirror accounts page logic)
    const favDomain = (() => {
      let d = String(domain || '').trim();
      if (/^https?:\/\//i.test(d)) {
        try { d = new URL(d).hostname; } catch (_) { d = d.replace(/^https?:\/\//i, '').split('/')[0]; }
      }
      if (!d && (a.website || a.site)) {
        try { d = new URL(a.website || a.site).hostname; } catch (_) { d = String(a.website || a.site).replace(/^https?:\/\//i, '').split('/')[0]; }
      }
      return d ? d.replace(/^www\./i, '') : '';
    })();

    let html = `<tr${rowClass} data-account-id="${aid}">`;

    accountsColumnOrder.forEach(col => {
      switch (col) {
        case 'select':
          html += `<td class="col-select"><input type="checkbox" class="row-select" data-id="${aid}" aria-label="Select account"${checked}></td>`;
          break;
        case 'name':
          html += `<td class="name-cell"><a href="#" class="acct-link" data-account-id="${aid}" data-account-name="${escapeHtml(name)}" title="View account details"><span class="company-cell__wrap">${(window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') ? window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: a.logoUrl, domain: favDomain, size: 32 }) : (favDomain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(favDomain, 32) : '') : '')}<span class="name-text account-name">${name}</span></span></a></td>`;
          break;
        case 'industry':
          html += `<td>${industry}</td>`;
          break;
        case 'domain':
          html += `<td>${domain}</td>`;
          break;
        case 'companyPhone':
          html += `<td data-field="companyPhone" class="phone-cell click-to-call" data-phone="${escapeHtml(phone)}" data-account-id="${aid}" data-account-name="${escapeHtml(name)}">${phoneFormatted}</td>`;
          break;
        case 'contractEnd':
          html += `<td>${escapeHtml(contractEnd)}</td>`;
          break;
        case 'sqft':
          html += `<td>${sqft}</td>`;
          break;
        case 'occupancy':
          html += `<td>${occupancy}</td>`;
          break;
        case 'employees':
          html += `<td>${employees}</td>`;
          break;
        case 'location':
          html += `<td>${location}</td>`;
          break;
        case 'actions':
          html += `<td class="qa-cell"><div class="qa-actions">
            <button type="button" class="qa-btn" data-action="call" data-id="${aid}" data-phone="${escapeHtml(phone)}" aria-label="Call" title="Call"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></button>
            <button type="button" class="qa-btn" data-action="addlist" data-id="${aid}" aria-label="Add to list" title="Add to list"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M3 12h18"></path><path d="M3 18h18"></path></svg></button>
            <button type="button" class="qa-btn" data-action="ai" data-id="${aid}" aria-label="Research with AI" title="Research with AI"><span style="font-weight:700">AI</span></button>
            <button type="button" class="qa-btn" data-action="linkedin" data-id="${aid}" data-linkedin="${escapeHtml(a.linkedin || a.linkedinUrl || a.linkedin_url || '')}" data-name="${escapeHtml(name)}" aria-label="LinkedIn page" title="LinkedIn page"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor" stroke="none"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 8h5v16H0V8zm7.5 0h4.8v2.2h.1c.7-1.2 2.4-2.5 4.9-2.5 5.2 0 6.2 3.4 6.2 7.9V24h-5v-7.2c0-1.7 0-3.9-2.4-3.9-2.4 0-2.8 1.9-2.8 3.8V24h-5V8z"></path></svg></button>
            <button type="button" class="qa-btn" data-action="website" data-id="${aid}" data-website="${escapeHtml(a.website || a.site || '')}" aria-label="Company website" title="Company website"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 1 1 7 7l-1 1"></path><path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 1 1-7-7l1-1"></path></svg></button>
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

  function emptyHtml() {
    const cols = state.view === 'people' ? peopleColumnOrder.length : accountsColumnOrder.length;
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
        case 'companyPhone':
          html += `<th data-col="companyPhone" draggable="true">Phone</th>`;
          break;
        case 'contractEnd':
          html += `<th data-col="contractEnd" draggable="true">Contract End</th>`;
          break;
        case 'sqft':
          html += `<th data-col="sqft" draggable="true">Sq Ft</th>`;
          break;
        case 'occupancy':
          html += `<th data-col="occupancy" draggable="true">Occupancy</th>`;
          break;
        case 'employees':
          html += `<th data-col="employees" draggable="true">Employees</th>`;
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

          // Scroll to top after page change (same as people/accounts pages)
          try {
            requestAnimationFrame(() => {
              const scroller = els.tableContainer?.querySelector('.table-scroll');
              if (scroller && typeof scroller.scrollTo === 'function') {
                scroller.scrollTo({ top: 0, behavior: 'auto' });
              } else if (scroller) {
                scroller.scrollTop = 0;
              }
              const main = document.getElementById('main-content');
              if (main && typeof main.scrollTo === 'function') {
                main.scrollTo({ top: 0, behavior: 'auto' });
              }
              const contentArea = document.querySelector('.content-area');
              if (contentArea && typeof contentArea.scrollTo === 'function') {
                contentArea.scrollTo({ top: 0, behavior: 'auto' });
              }
              window.scrollTo(0, 0);
            });
          } catch (_) { /* noop */ }
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

            // Scroll to top after page change
            try {
              requestAnimationFrame(() => {
                const scroller = els.tableContainer?.querySelector('.table-scroll');
                if (scroller && typeof scroller.scrollTo === 'function') {
                  scroller.scrollTo({ top: 0, behavior: 'auto' });
                } else if (scroller) {
                  scroller.scrollTop = 0;
                }
                window.scrollTo(0, 0);
              });
            } catch (_) { /* noop */ }
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
    } catch { }
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

  // Helper to fetch missing contacts/accounts that are in the list but not in local data
  async function fetchMissingContacts(ids) {
    if (!ids || ids.length === 0) return;
    if (!window.firebaseDB) return;

    // Chunk IDs into batches of 10 (Firestore limit for 'in' queries)
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }

    try {
      const promises = chunks.map(chunk =>
        window.firebaseDB.collection('contacts')
          .where(window.firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get()
      );

      const snapshots = await Promise.all(promises);
      let fetchedCount = 0;

      snapshots.forEach(snap => {
        snap.docs.forEach(doc => {
          const data = { id: doc.id, ...doc.data() };
          // Avoid duplicates
          if (!state.dataPeople.find(c => c.id === data.id)) {
            state.dataPeople.push(data);
            fetchedCount++;
          }
        });
      });

      console.log(`[ListDetail] ✓ Fetched ${fetchedCount} missing contacts`);

    } catch (e) {
      console.warn('[ListDetail] Error fetching missing contacts:', e);
    }
  }

  async function fetchMissingAccounts(ids) {
    if (!ids || ids.length === 0) return;
    if (!window.firebaseDB) return;

    // Chunk IDs into batches of 10 (Firestore limit for 'in' queries)
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }

    try {
      const promises = chunks.map(chunk =>
        window.firebaseDB.collection('accounts')
          .where(window.firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get()
      );

      const snapshots = await Promise.all(promises);
      let fetchedCount = 0;

      snapshots.forEach(snap => {
        snap.docs.forEach(doc => {
          const data = { id: doc.id, ...doc.data() };
          // Avoid duplicates
          if (!state.dataAccounts.find(a => a.id === data.id)) {
            state.dataAccounts.push(data);
            fetchedCount++;
          }
        });
      });

      console.log(`[ListDetail] ✓ Fetched ${fetchedCount} missing accounts`);

    } catch (e) {
      console.warn('[ListDetail] Error fetching missing accounts:', e);
    }
  }

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
      // Avoid clearing tbody immediately to prevent flicker; it will be replaced on first render
    }

    // Check if we're restoring from back navigation
    if (window.__restoringListDetail && window._listDetailReturn) {
      const restore = window._listDetailReturn;
      const targetPage = Math.max(1, parseInt(restore.page || 1, 10));
      state.currentPage = targetPage;
      state.hasAnimated = true; // Prevent animations on restore
      console.log('[ListDetail] Pre-setting page for restoration:', targetPage);
    }

    // Update title
    if (els.detailTitle) {
      els.detailTitle.textContent = state.listName || 'List Details';
    }

    // View toggle removed - list detail shows only one type

    attachEvents();
    injectListDetailBulkStyles();

    // Only hide table body if this is a fresh load (not a restore)
    // If restoring, data should already be visible, so skip the opacity hide
    const isRestoring = window.__restoringListDetail && window._listDetailReturn;

    // Check for cached data from BackgroundLoaders (faster check)
    const hasPeopleData = (state.dataPeople && state.dataPeople.length > 0) ||
      (window.BackgroundContactsLoader && window.BackgroundContactsLoader.getContactsData &&
        window.BackgroundContactsLoader.getContactsData().length > 0);
    const hasAccountsData = (state.dataAccounts && state.dataAccounts.length > 0) ||
      (window.BackgroundAccountsLoader && window.BackgroundAccountsLoader.getAccountsData &&
        window.BackgroundAccountsLoader.getAccountsData().length > 0);
    const hasCachedData = state.listId &&
      ((state.view === 'people' && hasPeopleData) ||
        (state.view === 'accounts' && hasAccountsData));

    if (!isRestoring && !hasCachedData && els.tbody) {
      // Only hide for fresh loads without cached data
      els.tbody.style.opacity = '0';
      els.tbody.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    } else if (els.tbody && (isRestoring || hasCachedData)) {
      // If restoring or have cached data, ensure it's visible and transition is set
      els.tbody.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      els.tbody.style.opacity = '1'; // Keep visible if we have data
    }

    // CRITICAL FIX: Listen for bulk import completion to invalidate stale caches
    if (!window._listDetailBulkImportListenerBound) {
      document.addEventListener('pc:bulk-import-complete', async (event) => {
        try {
          const { listId, type } = event.detail || {};
          console.log('[ListDetail] Bulk import complete, refreshing data for:', { listId, type });

          // If we're viewing the affected list, clear cache and reload
          if (listId && state.listId === listId) {
            // Clear in-memory cache for this list
            if (window.listMembersCache) {
              delete window.listMembersCache[listId];
              console.log('[ListDetail] ✓ Cleared in-memory cache for current list');
            }

            // CRITICAL FIX: Also invalidate IndexedDB cache
            if (window.CacheManager && typeof window.CacheManager.invalidateListCache === 'function') {
              try {
                await window.CacheManager.invalidateListCache(listId);
                console.log('[ListDetail] ✓ Invalidated IndexedDB cache for current list');
              } catch (cacheError) {
                console.warn('[ListDetail] Cache invalidation failed:', cacheError);
              }
            }

            // Force reload of list members (will fetch fresh from Firestore)
            await refreshListMembership();

            console.log('[ListDetail] ✓ Reloaded list after bulk import:', {
              people: state.membersPeople.size,
              accounts: state.membersAccounts.size
            });
          }
        } catch (e) {
          console.error('[ListDetail] Error handling bulk import complete:', e);
        }
      });
      window._listDetailBulkImportListenerBound = true;
    }

    // Listen for restoration event from back navigation (with guard to prevent duplicates)
    if (!window._listDetailRestoreListenerBound) {
      document.addEventListener('pc:list-detail-restore', (e) => {
        if (!e.detail) return;
        const { page, scroll, filters, view, listId, listName } = e.detail;

        console.log('[ListDetail] Restore event received:', e.detail);

        // Mark as animated to prevent row animations
        state.hasAnimated = true;

        // Restore list context (view, listId, listName)
        if (view) {
          state.view = view;
          console.log('[ListDetail] Restored view:', view);
        }
        if (listId) {
          state.listId = listId;
        }
        if (listName) {
          state.listName = listName;
          // Update page title
          if (els.detailTitle) {
            els.detailTitle.textContent = listName;
          }
        }

        // Restore page (accept 1 as valid; only skip if undefined/null)
        if (page !== undefined && page !== null) {
          state.currentPage = Math.max(1, parseInt(page, 10));
        }

        // Restore filters
        if (filters) {
          if (filters.quickSearch && els.quickSearch) {
            els.quickSearch.value = filters.quickSearch;
          }
          if (filters.chips) {
            state.chips = { ...state.chips, ...filters.chips };
          }
          if (filters.flags) {
            state.flags = { ...state.flags, ...filters.flags };
          }
        }

        // Re-render table header for correct columns (people vs accounts)
        renderTableHead();

        // Re-render with restored state without resetting pagination
        state.suppressPageReset = true;
        applyFilters();
        // Release suppression next tick
        setTimeout(() => { try { state.suppressPageReset = false; } catch (_) { } }, 0);

        // Ensure table is visible after restore with smooth transition
        if (els.tbody) {
          // Set transition for smooth appearance
          els.tbody.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
          // Ensure it's visible immediately (should already be if cached data was used)
          requestAnimationFrame(() => {
            void els.tbody.offsetHeight;
            if (parseFloat(els.tbody.style.opacity) < 1) {
              els.tbody.style.opacity = '1';
            }
          });
        }

        // Re-initialize drag and drop after restoration
        setTimeout(() => {
          try {
            console.log('[ListDetail] Re-initializing drag and drop after restore');
            initHeaderDragAndDrop();
            attachListDetailHeaderDnDHooks();
          } catch (e) {
            console.warn('[ListDetail] Failed to re-initialize drag and drop:', e);
          }
        }, 100);

        // Restore scroll position - use requestAnimationFrame for better timing
        if (scroll !== undefined) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try {
                window.scrollTo(0, scroll);
                console.log('[ListDetail] ✓ Restored scroll position:', scroll);

                // Clear restoration flag after successful restore
                try {
                  window.__restoringListDetail = false;
                  window.__restoringListDetailUntil = 0;
                  console.log('[ListDetail] ✓ Cleared restoration flag');
                } catch (_) { }
              } catch (_) { }
            });
          });
        } else {
          // Clear flag even if no scroll to restore
          try {
            setTimeout(() => {
              window.__restoringListDetail = false;
              window.__restoringListDetailUntil = 0;
            }, 100);
          } catch (_) { }
        }
      });
      window._listDetailRestoreListenerBound = true;
    }

    // Instant paint: draw header (but don't render table body until data is ready)
    renderTableHead();

    // Skip cached render during initial load to prevent flicker; wait for full data load instead
    // This prevents showing empty state or incomplete data that causes flicker

    // Extra guard: if restoring hint is set but stale, clear it
    if (window.__restoringListDetailUntil && Date.now() > window.__restoringListDetailUntil) {
      try {
        window.__restoringListDetail = false;
        window.__restoringListDetailUntil = 0;
        console.log('[ListDetail] Cleared stale restoration flag');
      } catch (_) { }
    }

    // Load data in parallel for faster loading
    if (!window.__restoringListDetail) {
      state.currentPage = 1;
    }

    // COST-EFFECTIVE: Load data and members in parallel (cache-first, zero cost if cached)
    const [dataLoaded, membersLoaded] = await Promise.all([
      loadDataOnce(),
      fetchMembers(state.listId)
    ]);

    // CRITICAL FIX: If list recordCount doesn't match fetched members, invalidate cache and re-fetch
    // This handles cases where cache is stale or incomplete (e.g., only showing 12 out of 174 contacts)
    if (state.listId) {
      try {
        const listData = window.BackgroundListsLoader?.getListsData?.() || [];
        const list = listData.find(l => l.id === state.listId);
        const expectedCount = list?.recordCount || list?.count || 0;
        const actualPeopleCount = state.membersPeople?.size || 0;
        const actualAccountsCount = state.membersAccounts?.size || 0;
        const actualTotal = actualPeopleCount + actualAccountsCount;

        // If there's a significant mismatch (more than 10% difference or more than 10 items), invalidate cache and re-fetch
        if (expectedCount > 0 && actualTotal > 0 && Math.abs(expectedCount - actualTotal) > Math.max(10, expectedCount * 0.1)) {
          console.warn(`[ListDetail] Count mismatch detected: expected ${expectedCount}, got ${actualTotal}. Invalidating cache and re-fetching...`);

          // Invalidate cache
          if (window.CacheManager && typeof window.CacheManager.invalidateListCache === 'function') {
            await window.CacheManager.invalidateListCache(state.listId);
          }

          // Clear in-memory cache
          if (window.listMembersCache && window.listMembersCache[state.listId]) {
            delete window.listMembersCache[state.listId];
          }

          // Re-fetch members
          await fetchMembers(state.listId);

          console.log(`[ListDetail] ✓ Re-fetched after cache invalidation: ${state.membersPeople.size} people, ${state.membersAccounts.size} accounts`);
        }
      } catch (countCheckErr) {
        console.warn('[ListDetail] Error checking count mismatch:', countCheckErr);
      }
    }

    // NEW LOGIC: Fetch missing members that weren't in the initial data load
    // This ensures we show all list members even if they weren't loaded by the initial scoped query
    if (state.view === 'people' && state.membersPeople.size > 0) {
      const loadedIds = new Set(state.dataPeople.map(c => c.id));
      const missingIds = Array.from(state.membersPeople).filter(id => !loadedIds.has(id));

      if (missingIds.length > 0) {
        console.log(`[ListDetail] Found ${missingIds.length} members missing from local data, fetching...`);
        await fetchMissingContacts(missingIds);
      }
    } else if (state.view === 'accounts' && state.membersAccounts.size > 0) {
      const loadedIds = new Set(state.dataAccounts.map(a => a.id));
      const missingIds = Array.from(state.membersAccounts).filter(id => !loadedIds.has(id));

      if (missingIds.length > 0) {
        console.log(`[ListDetail] Found ${missingIds.length} accounts missing from local data, fetching...`);
        await fetchMissingAccounts(missingIds);
      }
    }

    // CRITICAL: Ensure members are loaded before filtering (fixes race condition)
    // Verify members Sets are initialized (even if empty)
    if (!state.membersPeople || !(state.membersPeople instanceof Set)) {
      state.membersPeople = new Set();
      console.warn('[ListDetail] Members Set not initialized, creating empty Set');
    }
    if (!state.membersAccounts || !(state.membersAccounts instanceof Set)) {
      state.membersAccounts = new Set();
      console.warn('[ListDetail] Accounts Set not initialized, creating empty Set');
    }

    console.log('[ListDetail] ✓ Data and members loaded, ready to filter:', {
      people: state.dataPeople.length,
      accounts: state.dataAccounts.length,
      membersPeople: state.membersPeople.size,
      membersAccounts: state.membersAccounts.size
    });

    // Re-render with loaded data - batch all DOM updates in a single frame
    renderTableHead();

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
    } catch (_) { }

    // Apply filters and render table body, then fade it in smoothly
    // CRITICAL: Members are now guaranteed to be loaded before filtering
    applyFilters();

    // Only fade in if table was hidden (fresh load)
    // If restoring or data was cached, it should already be visible
    const shouldFadeIn = !isRestoring && !hasCachedData && els.tbody && parseFloat(els.tbody.style.opacity) === 0;

    if (shouldFadeIn && els.tbody) {
      // Use requestAnimationFrame to ensure DOM is ready before showing
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Force layout calculation to ensure rows are painted
          void els.tbody.offsetHeight;
          // Fade in smoothly with the transition we set earlier
          els.tbody.style.opacity = '1';
        });
      });
    } else if (els.tbody && (isRestoring || hasCachedData)) {
      // If restoring or cached, just ensure it's visible immediately
      els.tbody.style.opacity = '1';
    }

    // Initialize drag and drop after everything is rendered
    setTimeout(() => {
      console.log('[ListDetail] Initializing drag and drop after data load');
      initHeaderDragAndDrop();
      attachListDetailHeaderDnDHooks();
    }, 100);

    // Initialize click-to-call and click-to-email after table is rendered
    setTimeout(() => {
      console.log('[ListDetail] Initializing click-to-call and click-to-email');
      if (window.ClickToCall && typeof window.ClickToCall.init === 'function') {
        window.ClickToCall.init();
      }
      if (window.ClickToEmail && typeof window.ClickToEmail.init === 'function') {
        window.ClickToEmail.init();
      }
    }, 150);

    if (console.timeEnd) console.timeEnd('[ListDetail] init');
  }

  // Expose API
  // Function to refresh list membership
  async function refreshListMembership() {
    if (state.listId) {
      console.log('[ListDetail] Refreshing list membership for:', state.listId);
      // Clear the in-memory cache for this list
      if (window.listMembersCache && window.listMembersCache[state.listId]) {
        delete window.listMembersCache[state.listId];
        console.log('[ListDetail] ✓ Cleared in-memory cache');
      }

      // CRITICAL FIX: Also invalidate IndexedDB cache to ensure fresh data
      if (window.CacheManager && typeof window.CacheManager.invalidateListCache === 'function') {
        try {
          await window.CacheManager.invalidateListCache(state.listId);
          console.log('[ListDetail] ✓ Invalidated IndexedDB cache');
        } catch (cacheError) {
          console.warn('[ListDetail] Cache invalidation failed:', cacheError);
        }
      }

      // Re-fetch members (will query Firestore since cache is invalidated)
      await fetchMembers(state.listId);

      // Re-apply filters to show all members
      applyFilters();

      console.log('[ListDetail] ✓ Refreshed list membership:', {
        people: state.membersPeople.size,
        accounts: state.membersAccounts.size
      });
    }
  }

  // Drag and Drop functionality for table headers
  let dragSrcTh = null;
  let dragOverTh = null;

  // Helper functions for drag and drop (mirror accounts page)
  function getListDetailHeaderOrderFromDom() {
    if (!els.theadRow) return (state.view === 'people' ? DEFAULT_PEOPLE_COL_ORDER : DEFAULT_ACCOUNTS_COL_ORDER).slice();
    return Array.from(els.theadRow.querySelectorAll('th')).map((th) => th.getAttribute('data-col')).filter(Boolean);
  }

  function attachListDetailHeaderDnDHooks() {
    if (!els.table || !els.table.querySelector('thead')) return;
    const thead = els.table.querySelector('thead');
    const handler = () => {
      setTimeout(() => {
        const ord = getListDetailHeaderOrderFromDom();
        if (ord.length) {
          const a = ord.join(',');
          const b = (state.view === 'people' ? peopleColumnOrder : accountsColumnOrder).join(',');
          if (a !== b) {
            if (state.view === 'people') {
              peopleColumnOrder = ord;
            } else {
              accountsColumnOrder = ord;
            }
            persistColumnOrder();
            render();
          }
        }
      }, 0);
    };
    thead.addEventListener('drop', handler, true);
    thead.addEventListener('dragend', handler, true);
  }

  function initHeaderDragAndDrop() {
    // Re-resolve header row each time to avoid stale references
    const page = document.getElementById('list-detail-page');
    els.theadRow = page ? page.querySelector('#list-detail-table thead tr') : els.theadRow;
    if (!els || !els.theadRow) {
      console.warn('[ListDetail] No theadRow found for drag and drop');
      return;
    }

    let dragSrcTh = null;
    let dragOverTh = null;
    let isDragging = false;
    const ths = Array.from(els.theadRow.querySelectorAll('th'));

    console.log('[ListDetail] Found', ths.length, 'draggable headers');
    console.log('[ListDetail] Headers found:', ths.map(th => th.textContent.trim()));

    // Helper to commit a move given a source and highlighted target
    function commitHeaderMove(sourceTh, targetTh) {
      if (!sourceTh || !targetTh) return false;
      if (sourceTh === targetTh) return false;
      // Always populate the highlighted position: insert BEFORE target.
      // This shifts the target (and everything to the right) one position to the right.
      els.theadRow.insertBefore(sourceTh, targetTh);
      return true;
    }

    // Global drop handler for the entire header row
    els.theadRow.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const th = e.target.closest('th');
      if (!th || !th.hasAttribute('draggable')) return;

      // Remove previous highlight
      if (dragOverTh && dragOverTh !== th) {
        dragOverTh.classList.remove('drag-over');
      }

      // Add highlight to current target
      if (th !== dragSrcTh) {
        th.classList.add('drag-over');
        dragOverTh = th;
      }
    });

    els.theadRow.addEventListener('dragleave', (e) => {
      // Only remove highlight if we're leaving the header row entirely
      if (!els.theadRow.contains(e.relatedTarget)) {
        if (dragOverTh) {
          dragOverTh.classList.remove('drag-over');
          dragOverTh = null;
        }
      }
    });

    els.theadRow.addEventListener('drop', (e) => {
      e.preventDefault();

      // Remove highlight
      if (dragOverTh) {
        dragOverTh.classList.remove('drag-over');
      }

      // Commit the move - this will insert the dragged column before the highlighted target
      if (commitHeaderMove(dragSrcTh, dragOverTh)) {
        // Update the column order and persist
        const newOrder = getListDetailHeaderOrderFromDom();
        if (newOrder.length > 0) {
          if (state.view === 'people') {
            peopleColumnOrder = newOrder;
          } else {
            accountsColumnOrder = newOrder;
          }
          persistColumnOrder();
          // Re-render to reflect new column order
          render();
        }
      }

      dragOverTh = null;
    });

    // Attach drag start/end to individual headers
    ths.forEach((th) => {
      th.setAttribute('draggable', 'true');

      th.addEventListener('dragstart', (e) => {
        console.log('[ListDetail] Drag start triggered on:', th.textContent.trim());
        dragSrcTh = th;
        th.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', th.outerHTML);
        isDragging = true;
      });

      th.addEventListener('dragend', (e) => {
        th.classList.remove('dragging');
        dragSrcTh = null;
        dragOverTh = null;
        isDragging = false;
      });
    });

    console.log('[ListDetail] Drag and drop initialized for', ths.length, 'headers');
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
    _getTableContainer: () => {
      try { return els.tableContainer || null; } catch (_) { return null; }
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
      } catch (_) { }
    },
    _clearChips: (kind) => {
      try { state.chips[kind] = []; } catch (_) { }
    },
    _getState: () => {
      try { return state; } catch (_) { return {}; }
    },
    _render: () => {
      try { if (typeof render === 'function') render(); } catch (_) { }
    },
    _getPageItems: () => {
      try {
        const state = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
        if (!state) return [];
        const pageSize = state.pageSize || 50;
        const currentPage = state.currentPage || 1;
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return (state.filtered || []).slice(start, end);
      } catch (_) { return []; }
    },
    _testBulkBar: () => {
      // Test function to diagnose bulk actions bar
      const page = document.getElementById('list-detail-page');
      const container = page?.querySelector('.table-container');
      const checkboxes = document.querySelectorAll('#list-detail-table .row-select');
      const checkedCount = document.querySelectorAll('#list-detail-table .row-select:checked').length;
      const bar = page?.querySelector('#list-detail-bulk-actions');

      const report = {
        pageFound: !!page,
        containerFound: !!container,
        totalCheckboxes: checkboxes.length,
        checkedCheckboxes: checkedCount,
        barExists: !!bar,
        barVisible: bar ? (bar.offsetParent !== null) : false,
        selectedPeopleCount: state.selectedPeople.size,
        selectedAccountsCount: state.selectedAccounts.size,
        currentView: state.view,
        tbodyBound: !!els._tbodyBound
      };

      alert(JSON.stringify(report, null, 2));

      // Force show bar for testing
      if (checkedCount > 0) {
        showBulkActionsBar(true);
        setTimeout(() => {
          const barAfter = page?.querySelector('#list-detail-bulk-actions');
          alert('After forcing show: Bar exists = ' + !!barAfter);
        }, 100);
      }

      return report;
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
  } catch (_) { }
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
  } catch (_) { }
}

function addTitleToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('title', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch (_) { }
  const arr = (window.__listDetailState.titleChips = window.__listDetailState.titleChips || []);
  if (!arr.includes(s)) arr.push(s);
  if (typeof renderTitleChips === 'function') renderTitleChips();
}

function addCompanyToken(label) {
  const s = (label || '').trim(); if (!s) return;
  if (window.ListDetail && ListDetail._addChip) ListDetail._addChip('company', s);
  try { window.__listDetailState = window.__listDetailState || {}; } catch (_) { }
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
  } catch (_) { }
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
  } catch (_) { }
}

function hideTitleSuggestions() { const el = document.getElementById('list-detail-filter-title-suggest'); if (el) el.hidden = true; }
function hideCompanySuggestions() { const el = document.getElementById('list-detail-filter-company-suggest'); if (el) el.hidden = true; }
function updateTitleSuggestions() {
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

function updateCompanySuggestions() {
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
  try { window.__listDetailState = window.__listDetailState || {}; } catch (_) { }
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
  } catch (_) { }
}

function hideCitySuggestions() { const el = document.getElementById('list-detail-filter-city-suggest'); if (el) el.hidden = true; }
function updateCitySuggestions() {
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
  try { window.__listDetailState = window.__listDetailState || {}; } catch (_) { }
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
  } catch (_) { }
}

function hideStateSuggestions() { const el = document.getElementById('list-detail-filter-state-suggest'); if (el) el.hidden = true; }
function updateStateSuggestions() {
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
  try { window.__listDetailState = window.__listDetailState || {}; } catch (_) { }
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
  } catch (_) { }
}

function hideEmployeesSuggestions() { const el = document.getElementById('list-detail-filter-employees-suggest'); if (el) el.hidden = true; }
function updateEmployeesSuggestions() {
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
  try { window.__listDetailState = window.__listDetailState || {}; } catch (_) { }
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
  } catch (_) { }
}

function hideIndustrySuggestions() { const el = document.getElementById('list-detail-filter-industry-suggest'); if (el) el.hidden = true; }
function updateIndustrySuggestions() {
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
  try { window.__listDetailState = window.__listDetailState || {}; } catch (_) { }
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
  } catch (_) { }
}

function hideVisitorDomainSuggestions() { const el = document.getElementById('list-detail-filter-visitor-domain-suggest'); if (el) el.hidden = true; }
function updateVisitorDomainSuggestions() {
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
    
    /* Scroll smoothness improvements - SAME AS PEOPLE PAGE */
    #list-detail-page .table-scroll {
      scrollbar-gutter: stable both-edges;
      overscroll-behavior: contain;
      overflow-anchor: none;
      will-change: transform;
      transform: translateZ(0);
      backface-visibility: hidden;
      contain: paint layout;
    }
    
    /* Fix checkbox size - select all should match row checkboxes */
    #select-all-list-detail {
      width: 16px;
      height: 16px;
      accent-color: var(--orange-subtle);
    }
    
    /* Bulk select popover styling */
    #list-detail-bulk-popover.bulk-select-popover {
      position: fixed; z-index: 900;
      width: min(320px, 90vw);
      background: var(--bg-modal, #262a30); color: var(--text-inverse);
      border: 1px solid var(--grey-700); border-radius: var(--border-radius);
      box-shadow: var(--shadow-xl); padding: 16px;
    }
    #list-detail-bulk-popover .option { 
      display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); 
      margin-bottom: var(--spacing-sm); 
    }
    #list-detail-bulk-popover .option:last-of-type { margin-bottom: 0; }
    #list-detail-bulk-popover label { font-weight: 600; color: var(--text-primary); }
    #list-detail-bulk-popover .hint { color: var(--text-secondary); font-size: 12px; }
    #list-detail-bulk-popover input[type="number"] {
      width: 60px; padding: 4px 8px; background: var(--bg-item); 
      color: var(--text-inverse); border: 1px solid var(--grey-700); 
      border-radius: var(--border-radius-sm);
    }
    #list-detail-bulk-popover .actions { 
      display: flex; justify-content: flex-end; gap: var(--spacing-sm); 
      margin-top: var(--spacing-md); 
    }
    #list-detail-bulk-popover .btn-text {
      padding: 6px 12px; background: transparent; color: var(--text-inverse);
      border: 1px solid var(--grey-700); border-radius: var(--border-radius-sm);
      cursor: pointer;
    }
    #list-detail-bulk-popover .btn-text:hover { background: var(--grey-700); border-color: var(--border-light); color: var(--text-inverse); }
    #list-detail-bulk-popover .btn-primary {
      padding: 6px 12px; background: var(--orange-primary); color: #fff;
      border: 1px solid var(--orange-primary); border-radius: var(--border-radius-sm);
      cursor: pointer; font-weight: 600;
    }
    #list-detail-bulk-popover .btn-primary:hover { background: var(--orange-muted); border-color: var(--orange-muted); }
    .bulk-select-backdrop {
      position: fixed; inset: 0; background: transparent; z-index: 899;
    }
    
    #list-detail-bulk-actions.bulk-actions-modal {
      position: absolute; left: 50%; transform: translateX(-50%) translateY(-10px); top: 8px;
      width: max-content; max-width: none; background: var(--bg-card); color: var(--text-primary);
      border: 1px solid var(--border-light); border-radius: var(--border-radius-lg);
      box-shadow: var(--elevation-card); padding: 8px 12px; z-index: 850;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }
    #list-detail-bulk-actions.bulk-actions-modal.--show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
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
    
    /* Smooth fade-in transition for table body */
    #list-detail-page tbody {
      transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
  `;
  document.head.appendChild(style);
}

// ===== Bulk selection popover (Step 1) =====
function openBulkSelectPopover() {
  const page = document.getElementById('list-detail-page');
  if (!page) return;

  // Get state and els via API
  const state = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
  if (!state) return;

  // Get els via closure or query
  const tableContainer = page.querySelector('.table-container') ||
    page.querySelector('#list-detail-table')?.closest('.table-container');
  if (!tableContainer) return;

  // Check if popover already exists
  const existingPopover = document.getElementById('list-detail-bulk-popover');
  if (existingPopover) return;

  closeBulkSelectPopover();
  const view = state.view || 'people';
  const totalFiltered = (state.filtered || []).length;

  // Get page items via API
  const pageItems = window.ListDetail && window.ListDetail._getPageItems ? window.ListDetail._getPageItems() : [];
  const pageCount = pageItems.length;

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'bulk-select-backdrop';
  backdrop.addEventListener('click', () => {
    const selectAll = document.getElementById('select-all-list-detail');
    if (selectAll) {
      const set = view === 'people' ? state.selectedPeople : state.selectedAccounts;
      selectAll.checked = set.size > 0;
    }
    closeBulkSelectPopover();
  });
  document.body.appendChild(backdrop);

  const pop = document.createElement('div');
  pop.id = 'list-detail-bulk-popover';
  pop.className = 'bulk-select-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Bulk selection');
  pop.setAttribute('aria-modal', 'true');

  const itemType = view === 'people' ? 'people' : 'accounts';
  pop.innerHTML = `
    <div class="option">
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="radio" name="bulk-mode" value="custom" checked>
        <span>Select number of ${itemType}</span>
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

  document.body.appendChild(pop);

  function positionPopover() {
    const selectAll = document.getElementById('select-all-list-detail');
    if (!selectAll) return;
    const cbRect = selectAll.getBoundingClientRect();
    let left = cbRect.left;
    let top = cbRect.bottom + 6;
    const maxLeft = window.innerWidth - pop.offsetWidth - 8;
    left = Math.max(8, Math.min(left, Math.max(8, maxLeft)));
    const maxTop = window.innerHeight - pop.offsetHeight - 8;
    top = Math.max(8, Math.min(top, maxTop));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  positionPopover();
  const reposition = () => positionPopover();
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);

  // Enable/disable custom count input
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

  // Focus trap and Escape
  const focusables = Array.from(pop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
  const firstFocusable = focusables[0];
  const lastFocusable = focusables[focusables.length - 1];
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      const selectAll = document.getElementById('select-all-list-detail');
      if (selectAll) {
        const set = view === 'people' ? state.selectedPeople : state.selectedAccounts;
        selectAll.checked = set.size > 0;
      }
      closeBulkSelectPopover();
      return;
    }
    if (e.key === 'Tab' && focusables.length > 0) {
      if (e.shiftKey && document.activeElement === firstFocusable) { e.preventDefault(); lastFocusable && lastFocusable.focus(); }
      else if (!e.shiftKey && document.activeElement === lastFocusable) { e.preventDefault(); firstFocusable && firstFocusable.focus(); }
    }
  };
  document.addEventListener('keydown', onKeyDown);
  if (page) page._bulkKeydownHandler = onKeyDown;

  // Store cleanup handler
  if (page) {
    if (page._bulkPopoverCleanup) page._bulkPopoverCleanup();
    page._bulkPopoverCleanup = () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      try {
        const bd = document.querySelector('.bulk-select-backdrop');
        if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
      } catch (e) { /* noop */ }
    };
  }

  // Focus first control
  const firstInput = pop.querySelector('#bulk-custom-count') || pop.querySelector('input,button');
  if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();

  // Wire events
  const cancelBtn = pop.querySelector('#bulk-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      const selectAll = document.getElementById('select-all-list-detail');
      if (selectAll) selectAll.checked = false;
      closeBulkSelectPopover();
    });
  }

  // Use event delegation for Apply button
  pop.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'bulk-apply') {
      const checkedRadio = pop.querySelector('input[name="bulk-mode"]:checked');
      const mode = checkedRadio ? checkedRadio.value : 'custom';
      closeBulkSelectPopover();

      // Get fresh state to ensure we have the latest filtered data
      const freshState = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : state;
      const freshFiltered = freshState.filtered || [];
      const freshPageItems = window.ListDetail && window.ListDetail._getPageItems ? window.ListDetail._getPageItems() : pageItems;

      // Apply selection based on mode
      if (mode === 'custom') {
        const raw = parseInt(pop.querySelector('#bulk-custom-count').value || '0', 10);
        const n = Math.min(freshFiltered.length, Math.max(1, isNaN(raw) ? 0 : raw));
        selectFirstNFiltered(n);
      } else if (mode === 'page') {
        const pageIds = freshPageItems.map((it) => it.id).filter(Boolean);
        selectIds(pageIds);
      } else if (mode === 'all') {
        // CRITICAL FIX: Use fresh filtered state to ensure we get ALL items, not just current page
        const allIds = freshFiltered.map((it) => it.id).filter(Boolean);
        console.log('[ListDetail] Selecting all filtered items:', { totalFiltered: freshFiltered.length, allIds: allIds.length });
        selectIds(allIds);
      }

      // Note: selectIds() already calls _render() and showBulkActionsBar(), so no need to call again
    }
  });

  // Close on outside click
  let outside;
  setTimeout(() => {
    outside = function (e) {
      const selectAll = document.getElementById('select-all-list-detail');
      if (!pop.contains(e.target) && e.target !== selectAll) {
        document.removeEventListener('mousedown', outside);
        if (selectAll) {
          const set = view === 'people' ? state.selectedPeople : state.selectedAccounts;
          selectAll.checked = set.size > 0;
        }
        closeBulkSelectPopover();
      }
    };
    document.addEventListener('mousedown', outside);
    if (page) page._bulkOutsideHandler = outside;
  }, 0);
}

function closeBulkSelectPopover() {
  const page = document.getElementById('list-detail-page');
  const existing = document.getElementById('list-detail-bulk-popover');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  if (page && typeof page._bulkPopoverCleanup === 'function') {
    page._bulkPopoverCleanup();
    delete page._bulkPopoverCleanup;
  }
  // Remove stored handlers
  if (page && page._bulkKeydownHandler) {
    try { document.removeEventListener('keydown', page._bulkKeydownHandler); } catch (e) { /* noop */ }
    delete page._bulkKeydownHandler;
  }
  if (page && page._bulkOutsideHandler) {
    try { document.removeEventListener('mousedown', page._bulkOutsideHandler); } catch (e) { /* noop */ }
    delete page._bulkOutsideHandler;
  }
  // Remove backdrop
  const bd = document.querySelector('.bulk-select-backdrop');
  if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
}

function selectIds(ids) {
  const state = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
  if (!state) return;
  const view = state.view || 'people';
  const set = view === 'people' ? state.selectedPeople : state.selectedAccounts;
  set.clear();
  for (const id of ids) if (id) set.add(id);
  // Trigger render via ListDetail API or direct call
  if (window.ListDetail && typeof window.ListDetail._render === 'function') {
    window.ListDetail._render();
  } else {
    // Fallback: try to find and call render function
    const page = document.getElementById('list-detail-page');
    if (page && page._render) page._render();
  }
  // Show bulk actions bar after selection
  setTimeout(() => {
    showBulkActionsBar();
    updateHeaderSelectAll();
    renderRowSelectionHighlights();
  }, 50);
}

function selectFirstNFiltered(n) {
  const state = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
  if (!state || !state.filtered) return;
  const ids = state.filtered.slice(0, n).map((it) => it.id).filter(Boolean);
  selectIds(ids);
}

function showBulkActionsBar(forceShow) {
  const page = document.getElementById('list-detail-page');
  if (!page) return;

  // Try to get container from els if available, otherwise query for it
  let container = null;
  if (window.ListDetail && window.ListDetail._getTableContainer) {
    container = window.ListDetail._getTableContainer();
  }
  if (!container) {
    container = page.querySelector('.table-container') ||
      page.querySelector('#list-detail-table')?.closest('.table-container');
  }
  if (!container) {
    console.warn('[Bulk Actions] Container not found');
    return;
  }

  // Use state.view instead of removed toggle button
  const view = (window.ListDetail && window.ListDetail._getState && window.ListDetail._getState().view) || 'people';
  const count = view === 'people'
    ? (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('people') : document.querySelectorAll('#list-detail-table .row-select:checked').length)
    : (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('accounts') : document.querySelectorAll('#list-detail-table .row-select:checked').length);

  const shouldShow = !!forceShow || count > 0;
  let bar = page.querySelector('#list-detail-bulk-actions');

  if (!shouldShow) {
    if (bar && bar.parentNode) {
      bar.classList.remove('--show');
      setTimeout(() => {
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      }, 200);
    }
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'list-detail-bulk-actions';
    bar.className = 'bulk-actions-modal';
    bar.innerHTML = `<div class="bar">
      <strong><span id="ld-selected-count">${count}</span> selected</strong>
      <div class="spacer"></div>
      <button type="button" class="action-btn-sm" id="ld-bulk-sequence">Add to sequence</button>
      <button type="button" class="action-btn-sm" id="ld-bulk-export">Export CSV</button>
      <button type="button" class="action-btn-sm" id="ld-bulk-remove">Remove from List</button>
      <button type="button" class="action-btn-sm danger" id="ld-bulk-delete">Delete</button>
    </div>`;
    container.appendChild(bar);
    // Add animation class after a brief delay
    setTimeout(() => {
      bar.classList.add('--show');
    }, 10);

    // Bind actions
    bar.querySelector('#ld-bulk-sequence')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.getElementById('list-detail-sequence-panel')) {
        closeListDetailSequencePanel();
      } else {
        openListDetailSequencePanel(bar.querySelector('#ld-bulk-sequence'));
      }
    });
    bar.querySelector('#ld-bulk-export')?.addEventListener('click', () => exportSelectedToCsv());
    bar.querySelector('#ld-bulk-remove')?.addEventListener('click', () => removeSelectedFromList());
    bar.querySelector('#ld-bulk-delete')?.addEventListener('click', () => showDeleteConfirmation());
  } else {
    // Update existing bar count
    const span = bar.querySelector('#ld-selected-count');
    if (span) span.textContent = String(count);
  }
}

function hideBulkActionsBar() {
  try {
    const el = document.getElementById('list-detail-bulk-actions');
    if (el) {
      el.classList.remove('--show');
      setTimeout(() => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, 200);
    }
  } catch (_) { }
}

// ===== Sequence dropdown panel =====
let _onListDetailSequenceKeydown = null;
let _positionListDetailSequencePanel = null;
let _onListDetailSequenceOutside = null;

function escapeHtmlForSequence(text) {
  if (text == null) return '';
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function closeListDetailSequencePanel() {
  const panel = document.getElementById('list-detail-sequence-panel');
  if (panel && panel.parentNode) {
    panel.classList.remove('--show');
    setTimeout(() => {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    }, 200);
  }
  try {
    if (_onListDetailSequenceKeydown) {
      document.removeEventListener('keydown', _onListDetailSequenceKeydown, true);
      _onListDetailSequenceKeydown = null;
    }
    if (_onListDetailSequenceOutside) {
      document.removeEventListener('mousedown', _onListDetailSequenceOutside, true);
      _onListDetailSequenceOutside = null;
    }
    if (_positionListDetailSequencePanel) {
      window.removeEventListener('resize', _positionListDetailSequencePanel, true);
      window.removeEventListener('scroll', _positionListDetailSequencePanel, true);
      _positionListDetailSequencePanel = null;
    }
  } catch (_) { }
}

function openListDetailSequencePanel(triggerBtn) {
  if (document.getElementById('list-detail-sequence-panel')) {
    closeListDetailSequencePanel();
    return;
  }

  const page = document.getElementById('list-detail-page');
  if (!page) return;

  const view = (window.ListDetail && window.ListDetail._getState && window.ListDetail._getState().view) || 'people';
  const selectedCount = view === 'people'
    ? (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('people') : document.querySelectorAll('#list-detail-table .row-select:checked').length)
    : (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('accounts') : document.querySelectorAll('#list-detail-table .row-select:checked').length);

  if (selectedCount === 0) {
    if (window.crm?.showToast) window.crm.showToast('Please select contacts first');
    return;
  }

  // Inject styles if needed
  injectListDetailSequenceStyles();

  const panel = document.createElement('div');
  panel.id = 'list-detail-sequence-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Add to sequence');
  panel.innerHTML = `
    <div class="list-header">
      <div class="list-title">Add ${selectedCount} ${selectedCount === 1 ? (view === 'people' ? 'contact' : 'account') : (view === 'people' ? 'contacts' : 'accounts')} to sequence</div>
      <button type="button" class="close-btn" aria-label="Close">×</button>
    </div>
    <div class="list-body" id="list-detail-sequence-body">
      <div class="list-item" aria-disabled="true" tabindex="0">
        <div><div class="list-name">Loading sequences…</div><div class="list-meta">Please wait</div></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // Position panel
  _positionListDetailSequencePanel = function position() {
    if (!panel || !triggerBtn) return;
    const triggerRect = triggerBtn.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Try bottom placement first
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const useTop = spaceBelow < panelRect.height && spaceAbove > spaceBelow;

    let top, left, placement;
    if (useTop) {
      placement = 'top';
      top = triggerRect.top - panelRect.height - 8;
    } else {
      placement = 'bottom';
      top = triggerRect.bottom + 8;
    }

    // Center horizontally relative to trigger button
    left = triggerRect.left + (triggerRect.width / 2) - (panelRect.width / 2);

    // Keep within viewport
    left = Math.max(8, Math.min(left, viewportWidth - panelRect.width - 8));
    top = Math.max(8, Math.min(top, viewportHeight - panelRect.height - 8));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.setAttribute('data-placement', placement);
    panel.style.setProperty('--arrow-left', `${triggerRect.left + (triggerRect.width / 2) - left}px`);
  };

  _positionListDetailSequencePanel();
  window.addEventListener('resize', _positionListDetailSequencePanel, true);
  window.addEventListener('scroll', _positionListDetailSequencePanel, true);

  // Show with animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('--show');
    });
  });

  // Load sequences
  populateListDetailSequences(panel.querySelector('#list-detail-sequence-body'), view);

  // Close button
  panel.querySelector('.close-btn')?.addEventListener('click', () => closeListDetailSequencePanel());

  // Keyboard handling
  _onListDetailSequenceKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeListDetailSequencePanel();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList?.contains('list-item') && !document.activeElement.hasAttribute('aria-disabled')) {
      e.preventDefault();
      handleListDetailSequenceChoose(document.activeElement, view);
    }
  };
  document.addEventListener('keydown', _onListDetailSequenceKeydown, true);

  // Click outside to close
  _onListDetailSequenceOutside = (e) => {
    const inside = panel.contains(e.target);
    const isTrigger = triggerBtn && (triggerBtn.contains(e.target) || triggerBtn === e.target);
    if (!inside && !isTrigger) {
      closeListDetailSequencePanel();
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', _onListDetailSequenceOutside, true);
  }, 0);

  // Focus management
  setTimeout(() => {
    const first = panel.querySelector('.list-item:not([aria-disabled="true"]), .close-btn');
    if (first) first.focus();
  }, 100);
}

async function populateListDetailSequences(container, view) {
  if (!container) return;

  try {
    let sequences = [];

    // Cache-first loading using BackgroundSequencesLoader
    if (window.BackgroundSequencesLoader && typeof window.BackgroundSequencesLoader.getSequencesData === 'function') {
      sequences = window.BackgroundSequencesLoader.getSequencesData() || [];
      console.log('[ListDetail] Loaded', sequences.length, 'sequences from BackgroundSequencesLoader');
    }

    // Fallback to CacheManager
    if (sequences.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('sequences');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          sequences = cached;
          console.log('[ListDetail] Loaded', sequences.length, 'sequences from CacheManager');
        }
      } catch (e) {
        console.warn('[ListDetail] CacheManager get failed:', e);
      }
    }

    // Fallback to Firestore
    if (sequences.length === 0 && window.firebaseDB) {
      try {
        const isAdmin = window.currentUserRole === 'admin';
        const email = getUserEmail();
        let q = window.firebaseDB.collection('sequences');

        if (!isAdmin && email) {
          // Non-admin: filter by ownerId, assignedTo, or createdBy
          q = q.where('ownerId', '==', email);
        }

        const snap = await q.get();
        sequences = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('[ListDetail] Loaded', sequences.length, 'sequences from Firestore');
      } catch (e) {
        console.warn('[ListDetail] Firestore query failed:', e);
      }
    }

    // Filter sequences for non-admin users (in case cache had all sequences)
    const isAdmin = window.currentUserRole === 'admin';
    if (!isAdmin && sequences.length > 0) {
      const email = getUserEmail();
      sequences = sequences.filter(s => {
        if (!s) return false;
        const owner = (s.ownerId || '').toLowerCase();
        const assigned = (s.assignedTo || '').toLowerCase();
        const created = (s.createdBy || '').toLowerCase();
        return owner === email || assigned === email || created === email;
      });
    }

    // Remove loading row
    const loadingRow = container.querySelector('.list-item[aria-disabled="true"]');
    if (loadingRow) loadingRow.remove();

    if (sequences.length === 0) {
      container.innerHTML = '<div class="list-item" aria-disabled="true"><div><div class="list-name">No sequences</div><div class="list-meta">Create a sequence first</div></div></div>';
      return;
    }

    // Sort by name
    sequences.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Render sequences
    const frag = document.createDocumentFragment();
    sequences.forEach(seq => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.tabIndex = 0;
      item.setAttribute('data-id', String(seq.id));
      item.setAttribute('data-name', String(seq.name || 'Sequence'));

      const memberCount = seq.stats?.active || 0;
      const stepCount = Array.isArray(seq.steps) ? seq.steps.length : 0;
      const metaBits = [];
      if (seq.isActive === false) metaBits.push('Inactive');
      metaBits.push(`${memberCount} member${memberCount === 1 ? '' : 's'}`);
      if (stepCount > 0) metaBits.push(`${stepCount} step${stepCount === 1 ? '' : 's'}`);
      const meta = metaBits.join(' • ');

      item.innerHTML = `
        <div>
          <div class="list-name">${escapeHtmlForSequence(seq.name || 'Sequence')}</div>
          <div class="list-meta">${escapeHtmlForSequence(meta || '')}</div>
        </div>
      `;

      item.addEventListener('click', () => handleListDetailSequenceChoose(item, view));
      frag.appendChild(item);
    });

    container.appendChild(frag);
  } catch (err) {
    console.warn('[ListDetail] Failed to load sequences:', err);
    const loadingRow = container.querySelector('.list-item[aria-disabled="true"]');
    if (loadingRow) {
      loadingRow.innerHTML = '<div><div class="list-name">Error loading sequences</div><div class="list-meta">Please try again</div></div>';
    }
  }
}

async function handleListDetailSequenceChoose(el, view) {
  const sequenceId = el.getAttribute('data-id');
  const sequenceName = el.getAttribute('data-name') || 'Sequence';

  if (!sequenceId) return;

  let progressToast = null;

  try {
    // Get selected IDs
    const selectedIds = Array.from(document.querySelectorAll('#list-detail-table .row-select:checked'))
      .map(cb => cb.getAttribute('data-id'))
      .filter(Boolean);

    if (selectedIds.length === 0) {
      closeListDetailSequencePanel();
      return;
    }

    const db = window.firebaseDB;
    if (!db) {
      if (window.crm?.showToast) window.crm.showToast('Database not available');
      closeListDetailSequencePanel();
      return;
    }

    // Close panel early to show progress toast
    closeListDetailSequencePanel();

    const email = getUserEmail();
    const targetType = view === 'people' ? 'people' : 'accounts';
    const itemLabel = view === 'people' ? 'contact' : 'account';
    const itemLabelPlural = view === 'people' ? 'contacts' : 'accounts';

    // Show initial progress toast - Step 1: Loading data
    progressToast = window.crm?.showProgressToast ?
      window.crm.showProgressToast(`Adding ${selectedIds.length} ${selectedIds.length === 1 ? itemLabel : itemLabelPlural} to "${sequenceName}"...`, 3, 0) : null;

    // ✅ NEW: Load full contact data and validate emails
    const contactsData = [];
    const collectionName = targetType === 'people' ? 'people' : 'accounts';

    for (const id of selectedIds) {
      try {
        const docRef = await db.collection(collectionName).doc(id).get();
        if (docRef.exists) {
          contactsData.push({ id: docRef.id, ...docRef.data() });
        }
      } catch (err) {
        console.warn(`Failed to load ${targetType} ${id}:`, err);
      }
    }

    // Update progress - Step 1 complete
    if (progressToast && typeof progressToast.update === 'function') {
      progressToast.update(1, 3);
    }

    // Validate emails
    const contactsWithoutEmail = contactsData.filter(c => !c.email || c.email.trim() === '');
    let idsToAdd = selectedIds;

    if (contactsWithoutEmail.length > 0) {
      const result = await showListDetailEmailValidationModal(contactsWithoutEmail, contactsData.length);
      if (!result.proceed) {
        // User cancelled
        if (progressToast && typeof progressToast.error === 'function') {
          progressToast.error('Cancelled');
        }
        return;
      }
      if (result.validOnly) {
        // Filter to only add contacts with emails
        idsToAdd = contactsData.filter(c => c.email && c.email.trim() !== '').map(c => c.id);
        if (idsToAdd.length === 0) {
          if (progressToast && typeof progressToast.error === 'function') {
            progressToast.error('No valid email addresses found');
          } else {
            if (window.crm?.showToast) window.crm.showToast('No valid email addresses found');
          }
          return;
        }
      }
    }

    // Check for existing memberships to avoid duplicates
    const existingQuery = await db.collection('sequenceMembers')
      .where('sequenceId', '==', sequenceId)
      .where('targetType', '==', targetType)
      .get();

    const existingIds = new Set();
    existingQuery.forEach(doc => {
      const data = doc.data();
      if (data.targetId) existingIds.add(String(data.targetId));
    });

    // Update progress - Step 2 complete
    if (progressToast && typeof progressToast.update === 'function') {
      progressToast.update(2, 3);
    }

    // Add new members
    const batch = db.batch();
    const newIds = idsToAdd.filter(id => !existingIds.has(id));
    let addedCount = 0;

    for (const targetId of newIds) {
      const contact = contactsData.find(c => c.id === targetId);
      // CRITICAL FIX: Ensure hasEmail is always boolean, never undefined
      const hasEmail = !!(contact && contact.email && contact.email.trim() !== '');

      const memberRef = db.collection('sequenceMembers').doc();
      const memberData = {
        sequenceId,
        targetId,
        targetType,
        hasEmail: hasEmail, // Track whether contact has email (always boolean)
        skipEmailSteps: !hasEmail, // Flag to skip email steps (always boolean)
        ownerId: email,
        userId: window.firebase?.auth()?.currentUser?.uid || null,
        createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date(),
        updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
      };
      batch.set(memberRef, memberData);
      addedCount++;
    }

    if (addedCount > 0) {
      await batch.commit();

      // Update sequence stats - increment stats.active and recalculate recordCount
      if (window.firebase?.firestore?.FieldValue) {
        // First, get current count to calculate new recordCount
        const membersQuery = await db.collection('sequenceMembers')
          .where('sequenceId', '==', sequenceId)
          .where('targetType', '==', targetType)
          .get();

        const actualCount = membersQuery.size;

        await db.collection('sequences').doc(sequenceId).update({
          'stats.active': window.firebase.firestore.FieldValue.increment(addedCount),
          'recordCount': actualCount  // CRITICAL: Set recordCount to actual count from sequenceMembers
        });
      }

      // ✅ AUTO-START: If sequence is active, automatically create sequenceActivations for new contacts
      try {
        const sequenceDoc = await db.collection('sequences').doc(sequenceId).get();
        const sequenceData = sequenceDoc.data();
        const hasActiveMembers = (sequenceData?.stats?.active || 0) > 0;

        // Also check if there are any existing sequenceActivations for this sequence
        let hasExistingActivations = false;
        try {
          const existingActivationsQuery = await db.collection('sequenceActivations')
            .where('sequenceId', '==', sequenceId)
            .where('status', 'in', ['pending', 'processing'])
            .limit(1)
            .get();
          hasExistingActivations = !existingActivationsQuery.empty;
        } catch (_) {
          // Query might fail if index missing, but that's okay
        }

        // If sequence is active, automatically create sequenceActivations for new contacts with emails
        if (hasActiveMembers || hasExistingActivations) {
          const contactsWithEmail = newIds.filter(id => {
            const contact = contactsData.find(c => c.id === id);
            return contact && contact.email && contact.email.trim() !== '';
          });

          if (contactsWithEmail.length > 0) {
            console.log('[ListDetail] Sequence is active, auto-starting for ' + contactsWithEmail.length + ' new contacts');

            // Create sequenceActivations in batches (process-sequence-activations handles up to 25 contacts per activation)
            const BATCH_SIZE = 25;
            for (let i = 0; i < contactsWithEmail.length; i += BATCH_SIZE) {
              const batchContacts = contactsWithEmail.slice(i, i + BATCH_SIZE);

              const activationRef = db.collection('sequenceActivations').doc();
              const activationId = activationRef.id;

              const sequenceActivationData = {
                sequenceId: sequenceId,
                contactIds: batchContacts,
                status: 'pending',
                processedContacts: 0,
                totalContacts: batchContacts.length,
                ownerId: email,
                assignedTo: email,
                createdBy: email,
                createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || Date.now()
              };

              await activationRef.set(sequenceActivationData);
              console.log('[ListDetail] Created auto-sequenceActivation:', activationId, 'for', batchContacts.length, 'contacts');

              // Trigger immediate processing
              try {
                const baseUrl = window.API_BASE_URL || window.location.origin || '';
                const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    immediate: true,
                    activationId: activationId
                  })
                });

                if (response.ok) {
                  const result = await response.json();
                  console.log('[ListDetail] Auto-started sequence for batch:', result);
                } else {
                  console.warn('[ListDetail] Auto-start failed for batch, will be picked up by next cron run.');
                }
              } catch (autoStartError) {
                console.warn('[ListDetail] Auto-start failed (non-fatal):', autoStartError);
                // Contacts are still added, cron will pick them up
              }
            }
          }
        }
      } catch (autoStartError) {
        console.warn('[ListDetail] Failed to check/auto-start sequence (non-fatal):', autoStartError);
        // Non-fatal - contacts are still added
      }
    }

    // Update progress - Step 3 complete
    if (progressToast && typeof progressToast.update === 'function') {
      progressToast.update(3, 3);
    }

    const skippedCount = selectedIds.length - addedCount;
    const withoutEmailCount = contactsWithoutEmail.length;

    // Show completion message
    let message = `Added ${addedCount} ${addedCount === 1 ? itemLabel : itemLabelPlural} to "${sequenceName}"`;
    if (withoutEmailCount > 0) {
      message += ` (${withoutEmailCount} without email - email steps will be skipped)`;
    }
    if (skippedCount > withoutEmailCount) {
      message += ` (${skippedCount - withoutEmailCount} already in sequence)`;
    }

    if (progressToast && typeof progressToast.complete === 'function') {
      progressToast.complete(message);
    } else {
      if (window.crm?.showToast) window.crm.showToast(message, 'success');
    }

    // Refresh sequence panel to show updated member count
    const sequencePanel = document.getElementById('list-detail-sequence-panel');
    if (sequencePanel && sequencePanel.classList.contains('--show')) {
      const sequenceBody = sequencePanel.querySelector('#list-detail-sequence-body');
      if (sequenceBody) {
        // Reload sequences to get updated member counts
        await populateListDetailSequences(sequenceBody, view);
      }
    }

    // Clear selection
    document.querySelectorAll('#list-detail-table .row-select:checked').forEach(cb => cb.checked = false);
    const selectAll = document.getElementById('select-all-list-detail');
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }

    // Update state
    if (window.ListDetail && window.ListDetail._getState) {
      const state = window.ListDetail._getState();
      if (view === 'people') {
        state.selectedPeople.clear();
      } else {
        state.selectedAccounts.clear();
      }
    }

    showBulkActionsBar();

  } catch (err) {
    console.error('[ListDetail] Failed to add to sequence:', err);
    if (progressToast && typeof progressToast.error === 'function') {
      progressToast.error('Failed to add to sequence');
    } else {
      if (window.crm?.showToast) window.crm.showToast('Failed to add to sequence', 'error');
    }
  }
}

function injectListDetailSequenceStyles() {
  let style = document.getElementById('list-detail-sequence-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'list-detail-sequence-styles';
    document.head.appendChild(style);
  }
  style.textContent = `
    /* List Detail: Add to Sequence panel */
    #list-detail-sequence-panel { 
      position: fixed; z-index: 1200; width: min(560px, 92vw);
      background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light);
      border-radius: var(--border-radius); box-shadow: var(--elevation-card-hover, 0 16px 40px rgba(0,0,0,.28), 0 6px 18px rgba(0,0,0,.22));
      transform: translateY(-8px); opacity: 0; transition: transform 400ms ease, opacity 400ms ease;
      --arrow-size: 10px;
    }
    #list-detail-sequence-panel.--show { transform: translateY(0); opacity: 1; }
    #list-detail-sequence-panel .list-header { 
      display: flex; align-items: center; justify-content: space-between; 
      padding: 14px 16px; border-bottom: 1px solid var(--border-light); 
      font-weight: 700; background: var(--bg-card);
      border-radius: var(--border-radius) var(--border-radius) 0 0;
    }
    #list-detail-sequence-panel .list-title { 
      font-weight: 700; color: var(--text-primary); font-size: 1rem; 
    }
    #list-detail-sequence-panel .close-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0;
      background: var(--bg-item) !important; color: var(--grey-300) !important;
      border: 1px solid var(--border-light); border-radius: var(--border-radius-sm);
      line-height: 1; font-size: 16px; font-weight: 600; cursor: pointer;
      transition: var(--transition-fast); box-sizing: border-box;
      -webkit-tap-highlight-color: transparent; margin-right: 0;
    }
    #list-detail-sequence-panel .close-btn:hover {
      background: var(--grey-600) !important; color: var(--text-inverse) !important;
    }
    #list-detail-sequence-panel .close-btn:focus-visible {
      outline: 2px solid var(--orange-muted); outline-offset: 2px;
    }
    #list-detail-sequence-panel .list-body { 
      max-height: min(70vh, 720px); overflow: auto; background: var(--bg-card); 
    }
    #list-detail-sequence-panel .list-body::-webkit-scrollbar { width: 10px; }
    #list-detail-sequence-panel .list-body::-webkit-scrollbar-thumb { 
      background: var(--grey-700); border-radius: 8px; 
    }
    #list-detail-sequence-panel .list-item { 
      display: flex; align-items: center; justify-content: space-between; gap: 12px; 
      padding: 12px 16px; cursor: pointer; background: var(--bg-card); 
      border-top: 1px solid var(--border-light); 
    }
    #list-detail-sequence-panel .list-item:first-child { border-top: 0; }
    #list-detail-sequence-panel .list-item:last-child {
      border-radius: 0 0 var(--border-radius) var(--border-radius);
    }
    #list-detail-sequence-panel .list-item:hover { background: var(--bg-hover); }
    #list-detail-sequence-panel .list-item[aria-disabled="true"] { 
      opacity: .6; cursor: default; 
    }
    #list-detail-sequence-panel .list-item:focus-visible { 
      outline: none; box-shadow: 0 0 0 3px rgba(255,139,0,.35) inset; 
    }
    #list-detail-sequence-panel .list-name { font-weight: 600; }
    #list-detail-sequence-panel .list-meta { color: var(--text-muted); font-size: .85rem; }
    
    /* Pointer arrow */
    #list-detail-sequence-panel::before,
    #list-detail-sequence-panel::after {
      content: "";
      position: absolute;
      width: var(--arrow-size);
      height: var(--arrow-size);
      transform: rotate(45deg);
      pointer-events: none;
    }
    /* Bottom placement (arrow on top edge) */
    #list-detail-sequence-panel[data-placement="bottom"]::before {
      left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
      top: calc(-1 * var(--arrow-size) / 2 + 1px);
      background: var(--border-light);
    }
    #list-detail-sequence-panel[data-placement="bottom"]::after {
      left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
      top: calc(-1 * var(--arrow-size) / 2 + 2px);
      background: var(--bg-card);
    }
    /* Top placement (arrow on bottom edge) */
    #list-detail-sequence-panel[data-placement="top"]::before {
      left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
      bottom: calc(-1 * var(--arrow-size) / 2 + 1px);
      background: var(--border-light);
    }
    #list-detail-sequence-panel[data-placement="top"]::after {
      left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
      bottom: calc(-1 * var(--arrow-size) / 2 + 2px);
      background: var(--bg-card);
    }
  `;
}

function exportSelectedToCsv() {
  try {
    // Use state.view instead of removed toggle button
    const view = (window.ListDetail && window.ListDetail._getState && window.ListDetail._getState().view) || 'people';
    const rows = Array.from(document.querySelectorAll('#list-detail-table .row-select:checked')).map(cb => cb.getAttribute('data-id'));
    if (!rows.length) { window.crm?.showToast && window.crm.showToast('No rows selected'); return; }
    // Build CSV from state.filtered subset
    const data = window.ListDetail && ListDetail._getFiltered ? ListDetail._getFiltered(view) : [];
    const map = new Map(data.map(d => [d.id, d]));
    const chosen = rows.map(id => map.get(id)).filter(Boolean);
    const headers = view === 'people' ? ['id', 'firstName', 'lastName', 'title', 'companyName', 'email', 'phone'] : ['id', 'accountName', 'industry', 'domain', 'phone'];
    const csv = [headers.join(',')].concat(chosen.map(r => headers.map(h => JSON.stringify((r[h] ?? '')).replace(/^"|"$/g, '')).join(','))).join('\n');
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
    // Use state.view instead of removed toggle button
    const view = (window.ListDetail && window.ListDetail._getState && window.ListDetail._getState().view) || 'people';
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

// Helper function for SVG icons (needed outside closure)
function svgIcon(name) {
  switch (name) {
    case 'delete':
      return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    default:
      return '';
  }
}

function showDeleteConfirmation() {
  const page = document.getElementById('list-detail-page');
  // Use state.view instead of removed toggle button
  const state = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
  const view = (state && state.view) || 'people';
  const ids = Array.from(document.querySelectorAll('#list-detail-table .row-select:checked')).map(cb => cb.getAttribute('data-id'));

  if (!ids.length) {
    window.crm?.showToast && window.crm.showToast('No items selected');
    return;
  }

  // Find the delete button to anchor the popover
  const bar = page.querySelector('#list-detail-bulk-actions');
  const delBtn = bar?.querySelector('#ld-bulk-delete');

  // Backdrop for click-away
  const backdrop = document.createElement('div');
  backdrop.id = 'list-detail-delete-backdrop';
  backdrop.style.position = 'fixed';
  backdrop.style.inset = '0';
  backdrop.style.background = 'transparent';
  backdrop.style.zIndex = '955';
  document.body.appendChild(backdrop);

  const pop = document.createElement('div');
  pop.id = 'list-detail-delete-popover';
  pop.className = 'delete-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Confirm delete');
  pop.dataset.placement = 'bottom';
  const deleteIcon = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  pop.innerHTML = `
    <div class="delete-popover-inner">
      <div class="delete-title">Delete ${ids.length} ${view === 'people' ? 'contact' : 'account'}${ids.length === 1 ? '' : 's'}?</div>
       <div class="btn-row">
         <button type="button" id="ld-del-cancel" class="btn-text">Cancel</button>
         <button type="button" id="ld-del-confirm" class="btn-danger">${deleteIcon}<span>Delete</span></button>
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

  const cancel = pop.querySelector('#ld-del-cancel');
  const confirm = pop.querySelector('#ld-del-confirm');
  if (cancel) cancel.addEventListener('click', () => closeBulkDeleteConfirm());
  if (confirm) confirm.addEventListener('click', () => handleDeleteConfirm(ids, view));

  // Focus mgmt and esc
  const f = confirm || cancel;
  f && f.focus && f.focus();
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeBulkDeleteConfirm(); } };
  document.addEventListener('keydown', onKey);
  const onOutside = (e) => {
    const t = e.target;
    if (!pop.contains(t)) closeBulkDeleteConfirm();
  };
  document.addEventListener('mousedown', onOutside, true);

  function closeBulkDeleteConfirm() {
    const pop = document.getElementById('list-detail-delete-popover');
    const backdrop = document.getElementById('list-detail-delete-backdrop');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onOutside, true);
  }
}

async function handleDeleteConfirm(ids, view) {
  // Close popover first - do this synchronously to prevent UI issues
  const pop = document.getElementById('list-detail-delete-popover');
  const backdrop = document.getElementById('list-detail-delete-backdrop');
  if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
  if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);

  // Show progress toast before setTimeout so it's accessible in catch
  let progressToast = null;
  try {
    progressToast = window.crm?.showProgressToast ?
      window.crm.showProgressToast(`Deleting ${ids.length} ${view === 'people' ? 'contact' : 'account'}${ids.length === 1 ? '' : 's'}...`, ids.length, 0) : null;
  } catch (e) {
    console.error('Error creating progress toast:', e);
  }

  // Use setTimeout to ensure UI updates happen before starting delete operations
  setTimeout(async () => {
    try {
      let failed = 0;
      let completed = 0;

      // Use Firebase directly like people.js and accounts.js do
      const collectionName = view === 'people' ? 'contacts' : 'accounts';

      console.log(`[Bulk Delete] Deleting ${ids.length} ${view} items from list-detail page`);

      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Process deletions sequentially to show progress
        for (const id of ids) {
          try {
            console.log(`[Bulk Delete] Deleting ${view}: ${id}`);
            await window.firebaseDB.collection(collectionName).doc(id).delete();
            completed++;
            console.log(`[Bulk Delete] Successfully deleted ${view} ${id}`);
            // Update progress toast after each successful delete
            if (progressToast && typeof progressToast.update === 'function') {
              progressToast.update(completed, ids.length);
            }
          } catch (error) {
            failed++;
            console.error(`[Bulk Delete] Error deleting ${view} ${id}:`, error);
            // Update progress toast on error
            if (progressToast && typeof progressToast.update === 'function') {
              progressToast.update(completed, ids.length);
            }
          }

          // Small delay to prevent UI blocking
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } else {
        // If no database, just mark all as completed
        completed = ids.length;
        if (progressToast && typeof progressToast.update === 'function') {
          progressToast.update(completed, ids.length);
        }
      }

      // CRITICAL FIX: Calculate ACTUAL count from listMembers collection after deletion
      // This ensures accuracy instead of relying on decrement
      const listId = window.listDetailContext?.listId || (window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState().listId : null);
      if (listId && completed > 0 && window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        try {
          // Get the list to determine its kind
          const listDoc = await window.firebaseDB.collection('lists').doc(listId).get();
          if (listDoc.exists) {
            const listData = listDoc.data();
            const listKind = listData.kind || listData.targetType || view || 'people';
            const targetType = listKind === 'accounts' ? 'accounts' : 'people';

            // Calculate ACTUAL count from listMembers collection
            const actualCountQuery = await window.firebaseDB.collection('listMembers')
              .where('listId', '==', listId)
              .where('targetType', '==', targetType)
              .get();

            const actualCount = actualCountQuery.size;

            // Update Firestore with actual count
            await window.firebaseDB.collection('lists').doc(listId).update({
              recordCount: actualCount,
              count: actualCount,
              updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
            });

            console.log(`[Bulk Delete] Updated list ${listId} with actual count: ${actualCount} ${targetType}`);

            // Update BackgroundListsLoader cache (cost-effective: no Firestore read)
            if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
              window.BackgroundListsLoader.updateListCountLocally(listId, actualCount);
            }

            // Update CacheManager cache (cost-effective: IndexedDB write only)
            if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
              window.CacheManager.updateRecord('lists', listId, {
                recordCount: actualCount,
                count: actualCount,
                updatedAt: new Date()
              }).catch(err => console.warn('[Bulk Delete] CacheManager update failed:', err));
            }

            // Dispatch event with actual count for lists-overview
            try {
              const listState = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
              const listName = listState?.listName || window.listDetailContext?.listName || 'List';
              document.dispatchEvent(new CustomEvent('pc:list-count-updated', {
                detail: {
                  listId,
                  listName,
                  kind: targetType,
                  deletedCount: completed,
                  newCount: actualCount
                }
              }));
              console.log(`[Bulk Delete] ✓ Dispatched count update event: ${actualCount}`);
            } catch (e) {
              console.warn('[Bulk Delete] Failed to dispatch count update event:', e);
            }
          }

          // Update listMembersCache to reflect deleted items
          if (window.listMembersCache && window.listMembersCache[listId]) {
            const cache = window.listMembersCache[listId];
            const idSet = new Set(ids);
            if (view === 'people' && cache.people) {
              ids.forEach(id => cache.people.delete(id));
            } else if (view === 'accounts' && cache.accounts) {
              ids.forEach(id => cache.accounts.delete(id));
            }
            // Update the count in cache
            if (view === 'people') {
              cache.count = cache.people?.size || 0;
            } else {
              cache.count = cache.accounts?.size || 0;
            }
          }

          // Update BackgroundListsLoader cache locally (cost-effective: avoids Firestore read)
          if (window.BackgroundListsLoader && typeof window.BackgroundListsLoader.updateListCountLocally === 'function') {
            window.BackgroundListsLoader.updateListCountLocally(listId, newRecordCount);
          }

          // Dispatch event to notify lists-overview of count change
          try {
            const listState = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
            const listName = listState?.listName || window.listDetailContext?.listName || 'List';
            document.dispatchEvent(new CustomEvent('pc:list-count-updated', {
              detail: {
                listId,
                listName,
                kind: view,
                deletedCount: completed,
                newCount: newRecordCount
              }
            }));
          } catch (e) {
            console.warn('[Bulk Delete] Failed to dispatch count update event:', e);
          }
        } catch (countError) {
          console.warn('[Bulk Delete] Failed to update list recordCount:', countError);
        }
      }

      // Clear selection state
      const state = window.ListDetail && window.ListDetail._getState ? window.ListDetail._getState() : null;
      if (state) {
        if (view === 'people') {
          state.selectedPeople.clear();
          // Remove deleted items from state
          const idSet = new Set(ids);
          if (Array.isArray(state.dataPeople)) {
            state.dataPeople = state.dataPeople.filter(c => !idSet.has(c.id));
          }
          if (Array.isArray(state.filtered)) {
            state.filtered = state.filtered.filter(c => !idSet.has(c.id));
          }
        } else {
          state.selectedAccounts.clear();
          // Remove deleted items from state
          const idSet = new Set(ids);
          if (Array.isArray(state.dataAccounts)) {
            state.dataAccounts = state.dataAccounts.filter(a => !idSet.has(a.id));
          }
          if (Array.isArray(state.filtered)) {
            state.filtered = state.filtered.filter(a => !idSet.has(a.id));
          }
        }
      }

      // Clear DOM checkboxes
      document.querySelectorAll('#list-detail-table .row-select:checked').forEach(cb => cb.checked = false);
      const selectAll = document.getElementById('select-all-list-detail');
      if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      }

      hideBulkActionsBar();

      // Refresh the list data
      if (window.ListDetail && typeof window.ListDetail._render === 'function') {
        window.ListDetail._render();
      } else if (window.ListDetail && typeof window.ListDetail.init === 'function') {
        const ctx = window.listDetailContext || {};
        window.ListDetail.init(ctx);
      }

      // Trigger lists-overview refresh via event (more reliable than direct call)
      try {
        document.dispatchEvent(new CustomEvent('pc:lists-count-updated', {
          detail: { listId, deletedCount: completed }
        }));
      } catch (e) {
        console.warn('[Bulk Delete] Failed to dispatch lists update event:', e);
      }

      // Also try direct call if available (fallback)
      if (window.ListsOverview && typeof window.ListsOverview.refreshCounts === 'function') {
        setTimeout(() => {
          window.ListsOverview.refreshCounts();
        }, 500);
      }

      // Show completion toast with proper handling
      const successCount = completed;
      if (progressToast && typeof progressToast.complete === 'function') {
        if (failed === 0 && successCount === ids.length) {
          progressToast.complete(`Successfully deleted ${successCount} ${view === 'people' ? 'contact' : 'account'}${successCount === 1 ? '' : 's'}`);
        } else if (successCount > 0) {
          progressToast.complete(`Deleted ${successCount} of ${ids.length} ${view === 'people' ? 'contact' : 'account'}${ids.length === 1 ? '' : 's'}`);
        } else {
          progressToast.error(`Failed to delete all ${ids.length} ${view === 'people' ? 'contact' : 'account'}${ids.length === 1 ? '' : 's'}`);
        }
      } else {
        // Fallback if progress toast not available
        if (failed > 0) {
          window.crm?.showToast ? window.crm.showToast(`Deleted ${completed} ${view === 'people' ? 'contact' : 'account'}${completed === 1 ? '' : 's'}, ${failed} failed`, 'warning') :
            console.warn(`Deleted ${completed} ${view}, ${failed} failed`);
        } else {
          window.crm?.showToast ? window.crm.showToast(`Successfully deleted ${completed} ${view === 'people' ? 'contact' : 'account'}${completed === 1 ? '' : 's'}`, 'success') :
            console.log(`Successfully deleted ${completed} ${view}`);
        }
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      if (progressToast && typeof progressToast.error === 'function') {
        progressToast.error();
      } else {
        window.crm?.showToast ? window.crm.showToast('Failed to delete items', 'error') :
          console.error('Failed to delete items');
      }
    }
  }, 50); // Small delay to ensure UI updates
}

// ===== Email Validation Modal for List Detail =====
async function showListDetailEmailValidationModal(contactsWithoutEmail, totalContacts) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'pc-modal__backdrop';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const validCount = totalContacts - contactsWithoutEmail.length;
    const invalidCount = contactsWithoutEmail.length;

    const contactsList = contactsWithoutEmail.slice(0, 5).map(c =>
      `<li style="margin-bottom: 8px;">• ${escapeHtmlForSequence(c.name || (c.firstName + ' ' + (c.lastName || '')).trim() || 'Unknown')} ${c.company || c.companyName ? `(${escapeHtmlForSequence(c.company || c.companyName)})` : ''}</li>`
    ).join('');
    const moreCount = invalidCount > 5 ? ` + ${invalidCount - 5} more` : '';

    overlay.innerHTML = `
      <div class="pc-modal__dialog" style="max-width: 500px;">
        <div class="pc-modal__header">
          <h2 style="display: flex; align-items: center; gap: 12px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Email Validation Warning</span>
          </h2>
          <button type="button" class="pc-modal__close" id="email-validation-close" aria-label="Close">×</button>
        </div>
        <div class="pc-modal__body">
          <p style="margin-bottom: 16px; font-size: 15px;">
            <strong>${totalContacts} contacts selected</strong><br>
            ${validCount} ${validCount === 1 ? 'contact has' : 'contacts have'} valid email${validCount === 1 ? '' : 's'}<br>
            <span style="color: #ffc107;">${invalidCount} ${invalidCount === 1 ? 'contact is' : 'contacts are'} missing email addresses</span>
          </p>
          
          <p style="margin-bottom: 8px; font-weight: 600;">Contacts without emails:</p>
          <ul style="margin-left: 20px; margin-bottom: 16px; color: var(--text-muted);">
            ${contactsList}
            ${moreCount ? `<li style="margin-top: 8px; font-style: italic;">${moreCount}</li>` : ''}
          </ul>
          
          <p style="margin-bottom: 0; font-size: 14px; color: var(--text-muted); background: var(--bg-item); padding: 12px; border-radius: var(--border-radius-sm); border-left: 3px solid #ffc107;">
            <strong>Note:</strong> Contacts without emails will be added to the sequence, but <strong>email steps will be automatically skipped</strong>. They will only receive phone calls, LinkedIn messages, or other non-email touchpoints.
          </p>
        </div>
        <div class="pc-modal__footer">
          <button type="button" class="btn btn-text" id="email-validation-cancel">Cancel</button>
          ${validCount > 0 ? `
            <button type="button" class="btn btn-secondary" id="email-validation-valid-only">Add ${validCount} with Emails Only</button>
          ` : ''}
          <button type="button" class="btn btn-primary" id="email-validation-proceed">Add All ${totalContacts}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('show');
      });
    });

    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => {
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      }, 200);
      resolve(result);
    };

    overlay.querySelector('#email-validation-close')?.addEventListener('click', () => close({ proceed: false }));
    overlay.querySelector('#email-validation-cancel')?.addEventListener('click', () => close({ proceed: false }));
    overlay.querySelector('#email-validation-proceed')?.addEventListener('click', () => close({ proceed: true, validOnly: false }));
    overlay.querySelector('#email-validation-valid-only')?.addEventListener('click', () => close({ proceed: true, validOnly: true }));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close({ proceed: false });
      }
    });

    const onEscape = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEscape);
        close({ proceed: false });
      }
    };
    document.addEventListener('keydown', onEscape);
  });
}
