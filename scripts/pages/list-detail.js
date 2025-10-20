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
      formattedNumber = `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      formattedNumber = `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
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
                  const ev = new CustomEvent('pc:lists-restore', { detail: {
                    page: restore.page,
                    scroll: restore.scroll,
                    filters: restore.filters,
                    searchTerm: restore.searchTerm,
                    selectedItems: restore.selectedItems,
                    timestamp: Date.now()
                  }});
                  document.dispatchEvent(ev);
                  console.log('[ListDetail] Back button: Dispatched pc:lists-restore event');
                } catch(_) {}
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
      els.quickSearch.addEventListener('input', () => applyFilters());
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

  // updateViewToggle function removed - no longer needed since list detail shows only one type

  async function loadDataOnce() {
    if (state.loadedPeople && state.loadedAccounts) return;
    
    try {
      if (console.time) console.time('[ListDetail] loadDataOnce');
      
      // PRIORITY 1: Use BackgroundContactsLoader and BackgroundAccountsLoader for instant data access
      if (!state.loadedPeople) {
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
      
      if (!state.loadedAccounts) {
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
      if ((!state.loadedPeople || !state.loadedAccounts) && 
          (window.BackgroundContactsLoader || window.BackgroundAccountsLoader)) {
        console.log('[ListDetail] Background loaders not ready yet, waiting...');
        
        // Wait up to 3 seconds (30 attempts x 100ms)
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          
          if (!state.loadedPeople && window.BackgroundContactsLoader) {
            const contacts = window.BackgroundContactsLoader.getContactsData() || [];
            if (contacts.length > 0) {
              state.dataPeople = contacts;
              state.loadedPeople = true;
              console.log('[ListDetail] ✓ BackgroundContactsLoader ready after', (attempt + 1) * 100, 'ms with', contacts.length, 'contacts');
            }
          }
          
          if (!state.loadedAccounts && window.BackgroundAccountsLoader) {
            const accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
            if (accounts.length > 0) {
              state.dataAccounts = accounts;
              state.loadedAccounts = true;
              console.log('[ListDetail] ✓ BackgroundAccountsLoader ready after', (attempt + 1) * 100, 'ms with', accounts.length, 'accounts');
            }
          }
          
          // Break if both are loaded
          if (state.loadedPeople && state.loadedAccounts) {
            break;
          }
        }
        
        if (!state.loadedPeople || !state.loadedAccounts) {
          console.warn('[ListDetail] ⚠ Timeout waiting for background loaders after 3 seconds', {
            peopleLoaded: state.loadedPeople,
            accountsLoaded: state.loadedAccounts
          });
        }
      }
      
      // FINAL FALLBACK: Use CacheManager or Firestore
      if (!state.loadedPeople || !state.loadedAccounts) {
        if (window.CacheManager && typeof window.CacheManager.get === 'function') {
          if (!state.loadedPeople) {
            state.dataPeople = await window.CacheManager.get('contacts') || [];
            state.loadedPeople = true;
            console.debug('[ListDetail] loadDataOnce: people loaded from CacheManager', { count: state.dataPeople.length });
          }
          
          if (!state.loadedAccounts) {
            state.dataAccounts = await window.CacheManager.get('accounts') || [];
            state.loadedAccounts = true;
            console.debug('[ListDetail] loadDataOnce: accounts loaded from CacheManager', { count: state.dataAccounts.length });
          }
        } else if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
          // Firestore fallback - OPTIMIZED with field selection
          if (!state.loadedPeople) {
            // OPTIMIZED: Only fetch fields needed for list display and filtering (60% data reduction)
            const peopleSnap = await window.firebaseDB.collection('contacts')
              .select(
                'id', 'firstName', 'lastName', 'name',
                'email', 'phone', 'mobile', 'workDirectPhone', 'otherPhone', 'preferredPhoneField',
                'title', 'companyName', 'seniority', 'department',
                'city', 'state', 'location',
                'employees', 'companySize', 'employeeCount',
                'industry', 'companyIndustry',
                'domain', 'companyDomain', 'website',
                'updatedAt', 'createdAt'
              )
              .get();
            state.dataPeople = peopleSnap ? peopleSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            state.loadedPeople = true;
            console.debug('[ListDetail] loadDataOnce: people loaded from Firestore (optimized)', { count: state.dataPeople.length });
          }
          
          if (!state.loadedAccounts) {
            // OPTIMIZED: Only fetch fields needed for list display, filtering, and AI email generation (25% data reduction)
            const accountsSnap = await window.firebaseDB.collection('accounts')
              .select(
                'id', 'name', 'accountName', 'companyName',
                'companyPhone', 'phone', 'primaryPhone', 'mainPhone',
                'industry', 'domain', 'website', 'site',
                'employees', 'employeeCount', 'numEmployees',
                'city', 'locationCity', 'town', 'state', 'locationState', 'region',
                'billingCity', 'billingState', // For AI email generation
                'contractEndDate', 'contractEnd', 'contract_end_date',
                'squareFootage', 'sqft', 'square_feet',
                'occupancyPct', 'occupancy', 'occupancy_percentage',
                'logoUrl', // Required for account favicons in list view
                'shortDescription', 'short_desc', 'descriptionShort', 'description', // Required for AI email generation
                'annualUsage', 'annual_kwh', 'kwh', // Required for AI email generation
                'electricitySupplier', 'supplier', // Required for AI email generation
                'currentRate', 'rate', // Required for AI email generation
                'notes', 'note', // Required for AI email generation
                'updatedAt', 'createdAt'
              )
              .get();
            state.dataAccounts = accountsSnap ? accountsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            state.loadedAccounts = true;
            console.debug('[ListDetail] loadDataOnce: accounts loaded from Firestore (optimized)', { count: state.dataAccounts.length });
          }
        }
      }
      
      // Ensure defaults
      state.dataPeople = state.dataPeople || [];
      state.dataAccounts = state.dataAccounts || [];
      state.loadedPeople = true;
      state.loadedAccounts = true;
      
    } catch (e) {
      console.error('[ListDetail] Failed loading data:', e);
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
    
      if (console.time) console.time(`[ListDetail] fetchMembers ${listId}`);
    
    // 1) Check IndexedDB cache first (10-minute expiry)
    try {
      const cached = await window.CacheManager.getCachedListMembers(listId);
      if (cached) {
        state.membersPeople = cached.people;
        state.membersAccounts = cached.accounts;
        console.log(`[ListDetail] Loaded ${state.membersPeople.size} people, ${state.membersAccounts.size} accounts from cache`);
          if (console.timeEnd) console.timeEnd(`[ListDetail] fetchMembers ${listId}`);
        return;
        }
    } catch (e) {
      console.warn('[ListDetail] Cache read failed:', e);
      }

    // 2) Cache miss - fetch from Firebase
    console.log('[ListDetail] Cache miss, fetching from Firebase...');
    try {
      if (!window.firebaseDB || typeof window.firebaseDB.collection !== 'function') return;

      let gotAny = false;
      
      // Try subcollection first: lists/{id}/members
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

      // Fallback to top-level listMembers collection
      if (!gotAny) {
          const lmSnap = await window.firebaseDB.collection('listMembers').where('listId', '==', listId).limit(5000).get();
          lmSnap?.docs?.forEach(d => {
            const m = d.data() || {};
            const t = (m.targetType || m.type || '').toLowerCase();
            const id = m.targetId || m.id || d.id;
            if (t === 'people' || t === 'contact' || t === 'contacts') state.membersPeople.add(id);
            else if (t === 'accounts' || t === 'account') state.membersAccounts.add(id);
          });
      }
      
      // 3) Cache the results for next time
      await window.CacheManager.cacheListMembers(listId, state.membersPeople, state.membersAccounts);
      
      console.log(`[ListDetail] Fetched from Firebase: ${state.membersPeople.size} people, ${state.membersAccounts.size} accounts`);
      
      // 4) Update legacy in-memory cache for backward compatibility
        window.listMembersCache = window.listMembersCache || {};
        window.listMembersCache[listId] = {
          people: new Set(state.membersPeople),
          accounts: new Set(state.membersAccounts),
          loaded: true
        };
      
    } catch (err) {
      console.error('[ListDetail] Failed to fetch list members:', err);
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
        try { d = new URL(d).hostname; } catch(_) { d = d.replace(/^https?:\/\//i, '').split('/')[0]; }
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
          html += `<td class="name-cell"><a href="#" class="acct-link" data-account-id="${aid}" data-account-name="${escapeHtml(name)}" title="View account details"><span class="company-cell__wrap">${(window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML==='function') ? window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: a.logoUrl, domain: favDomain, size: 32 }) : (favDomain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(favDomain, 32) : '') : '')}<span class="name-text account-name">${name}</span></span></a></td>`;
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
        
        // Restore page
        if (page) {
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
        
        // Re-render with restored state
        applyFilters();
        
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
                } catch (_) {}
              } catch (_) {}
            });
          });
        } else {
          // Clear flag even if no scroll to restore
          try {
            setTimeout(() => {
              window.__restoringListDetail = false;
              window.__restoringListDetailUntil = 0;
            }, 100);
          } catch (_) {}
        }
      });
      window._listDetailRestoreListenerBound = true;
    }
    
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
    
    // Extra guard: if restoring hint is set but stale, clear it
    if (window.__restoringListDetailUntil && Date.now() > window.__restoringListDetailUntil) {
      try {
        window.__restoringListDetail = false;
        window.__restoringListDetailUntil = 0;
        console.log('[ListDetail] Cleared stale restoration flag');
      } catch (_) {}
    }
    
    // Load data in parallel for faster loading
    if (!window.__restoringListDetail) {
      state.currentPage = 1;
    }
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
    },
    _getState: () => {
      try { return state; } catch (_) { return {}; }
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
  console.log('[Bulk Actions] showBulkActionsBar called', { forceShow });
  const page = document.getElementById('list-detail-page');
  const container = page?.querySelector('.table-container');
  console.log('[Bulk Actions] Container found:', !!container);
  if (!container) return;
  // Use state.view instead of removed toggle button
  const view = (window.ListDetail && window.ListDetail._getState && window.ListDetail._getState().view) || 'people';
  const count = view === 'people' ? (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('people') : document.querySelectorAll('#list-detail-table .row-select:checked').length) : (window.ListDetail && ListDetail._getSelectedCount ? ListDetail._getSelectedCount('accounts') : document.querySelectorAll('#list-detail-table .row-select:checked').length);
  console.log('[Bulk Actions] View:', view, 'Count:', count, 'Should show:', !!forceShow || count > 0);
  const shouldShow = !!forceShow || count > 0;
  let bar = page.querySelector('#list-detail-bulk-actions');
  if (!shouldShow) { 
    console.log('[Bulk Actions] Hiding bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar); 
    return; 
  }
  if (!bar) {
    console.log('[Bulk Actions] Creating new bar');
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
    console.log('[Bulk Actions] Bar appended to container');
    // Bind actions
    bar.querySelector('#ld-bulk-sequence')?.addEventListener('click', () => window.crm?.showToast && window.crm.showToast('Sequence action coming soon'));
    bar.querySelector('#ld-bulk-export')?.addEventListener('click', () => exportSelectedToCsv());
    bar.querySelector('#ld-bulk-remove')?.addEventListener('click', () => removeSelectedFromList());
    bar.querySelector('#ld-bulk-delete')?.addEventListener('click', () => showDeleteConfirmation());
    // Reposition on scroll/resize
    const pos = () => {/* anchored via absolute + centered; no-op, layout handles */};
    window.addEventListener('scroll', pos, true);
    window.addEventListener('resize', pos, true);
  } else {
    console.log('[Bulk Actions] Updating existing bar count');
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
    // Use state.view instead of removed toggle button
    const view = (window.ListDetail && window.ListDetail._getState && window.ListDetail._getState().view) || 'people';
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

function showDeleteConfirmation() {
  const page = document.getElementById('list-detail-page');
  // Use state.view instead of removed toggle button
  const view = (window.ListDetail && window.ListDetail._getState && window.ListDetail._getState().view) || 'people';
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
  pop.innerHTML = `
    <div class="delete-popover-inner">
      <div class="delete-title">Delete ${ids.length} ${view === 'people' ? 'contact' : 'account'}${ids.length === 1 ? '' : 's'}?</div>
       <div class="btn-row">
         <button type="button" id="ld-del-cancel" class="btn-text">Cancel</button>
         <button type="button" id="ld-del-confirm" class="btn-danger">${svgIcon('delete')}<span>Delete</span></button>
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
  try {
    // Close popover first
    const pop = document.getElementById('list-detail-delete-popover');
    const backdrop = document.getElementById('list-detail-delete-backdrop');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);

    // Show progress toast
    const progressToast = window.crm?.showProgressToast ? 
      window.crm.showProgressToast(`Deleting ${ids.length} ${view === 'people' ? 'contact' : 'account'}${ids.length === 1 ? '' : 's'}...`, ids.length, 0) : null;

    let failed = 0;
    let completed = 0;

    // Use production API for delete operations
    const base = 'https://power-choosers-crm.vercel.app';
    const url = `${base}/api/${view === 'people' ? 'contacts' : 'accounts'}`;
    
    console.log(`[Bulk Delete] Deleting ${ids.length} ${view} items from list-detail page`);
    
    // Delete from backend
    for (const id of ids) {
      try {
        console.log(`[Bulk Delete] Deleting ${view}: ${id}`);
        
        const response = await fetch(url, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        
        console.log(`[Bulk Delete] Response for ${id}:`, {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });
        
        if (response.ok) {
          completed++;
          console.log(`[Bulk Delete] Successfully deleted ${view} ${id}`);
          // Update progress toast
          if (progressToast && typeof progressToast.update === 'function') {
            progressToast.update(completed, ids.length);
          }
        } else {
          failed++;
          const errorText = await response.text().catch(()=>'');
          console.error(`[Bulk Delete] Failed to delete ${view} ${id}:`, response.status, errorText);
        }
      } catch (error) {
        failed++;
        console.error(`[Bulk Delete] Error deleting ${view} ${id}:`, error);
      }
    }
    
    // Clear selection and refresh
    document.querySelectorAll('#list-detail-table .row-select:checked').forEach(cb => cb.checked = false);
    hideBulkActionsBar();
    
    // Refresh the list data
    if (window.ListDetail && typeof window.ListDetail.init === 'function') {
      const ctx = window.listDetailContext || {};
      window.ListDetail.init(ctx);
    }
    
    // Show completion toast
    if (progressToast && typeof progressToast.complete === 'function') {
      progressToast.complete();
    }
    
    if (failed > 0) {
      window.crm?.showToast ? window.crm.showToast(`Deleted ${completed} ${view === 'people' ? 'contact' : 'account'}${completed === 1 ? '' : 's'}, ${failed} failed`, 'warning') : 
        console.warn(`Deleted ${completed} ${view}, ${failed} failed`);
    } else {
      window.crm?.showToast ? window.crm.showToast(`Successfully deleted ${completed} ${view === 'people' ? 'contact' : 'account'}${completed === 1 ? '' : 's'}`, 'success') :
        console.log(`Successfully deleted ${completed} ${view}`);
    }
    
  } catch (error) {
    console.error('Bulk delete error:', error);
    if (progressToast && typeof progressToast.error === 'function') {
      progressToast.error();
    }
    window.crm?.showToast ? window.crm.showToast('Failed to delete items', 'error') :
      console.error('Failed to delete items');
  }
}
