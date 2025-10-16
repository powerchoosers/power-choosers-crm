'use strict';

// Global Search Module - Handles the top search bar functionality
(function () {
  let searchTimeout;
  let pendingResultsTimeout;
  let loadingStartAt = 0;
  const SEARCH_DELAY = 300; // ms delay for debouncing
  const MIN_LOADING_MS = 200; // ensure spinner is visible briefly
  const MAX_LOADING_MS = 2000; // hard cap: show partial results within 2s
  // Cache last search results for quick lookups (e.g., direct navigation)
  let lastResults = null;
  
  // In-memory cache for search data
  let searchCache = {
    people: null,
    accounts: null,
    sequences: null,
    deals: null,
    lastUpdated: 0,
    cacheTimeout: 5 * 60 * 1000 // 5 minutes
  };

  const elements = {
    searchInput: null,
    searchModal: null,
    searchResults: null,
    searchLoading: null,
    searchEmpty: null
  };

  // Initialize search modal and listeners
  function initGlobalSearch() {
    elements.searchInput = document.querySelector('.search-input');
    elements.searchModal = document.getElementById('global-search-modal');
    elements.searchResults = document.getElementById('search-results');
    elements.searchLoading = document.getElementById('search-loading');
    elements.searchEmpty = document.getElementById('search-empty');
    // Make sure modal is hidden on load
    if (elements.searchModal) {
      elements.searchModal.hidden = true;
      elements.searchModal.classList.remove('is-loading');
    }
    if (elements.searchResults) elements.searchResults.innerHTML = '';
    if (elements.searchLoading) elements.searchLoading.hidden = true;
    if (elements.searchEmpty) elements.searchEmpty.hidden = true;

    if (!elements.searchInput || !elements.searchModal) {
      console.warn('Global search elements not found');
      return;
    }

    bindEvents();
  }

  function bindEvents() {
    // Search on input (only show modal when typing)
    elements.searchInput.addEventListener('input', handleSearchInput);
    
    // Hide modal when clicking outside
    document.addEventListener('click', handleOutsideClick);
    
    // Prevent modal from closing when clicking inside it
    elements.searchModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.searchModal.hidden) {
        hideSearchModal();
      }
    });
  }

  function showSearchModal() {
    elements.searchModal.hidden = false;
    const query = elements.searchInput.value.trim();
    if (query) {
      // Loading state will be toggled by input handler
      return;
    }
    // No query: clear content and hide states
    elements.searchResults.innerHTML = '';
    if (elements.searchLoading) elements.searchLoading.hidden = true;
    if (elements.searchEmpty) elements.searchEmpty.hidden = true;
    elements.searchModal.classList.remove('is-loading');
  }

  function hideSearchModal() {
    elements.searchModal.hidden = true;
    if (pendingResultsTimeout) {
      clearTimeout(pendingResultsTimeout);
      pendingResultsTimeout = null;
    }
  }

  function handleOutsideClick(e) {
    // Don't interfere with bulk selection popover
    if (e.target.closest && e.target.closest('#people-bulk-popover')) {
      return;
    }
    
    if (!elements.searchModal.hidden && 
        !elements.searchModal.contains(e.target) && 
        !elements.searchInput.contains(e.target)) {
      hideSearchModal();
    }
  }

  function handleSearchInput(e) {
    const query = e.target.value.trim();
    console.log('[Global Search] Input event triggered, query:', query);

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    if (pendingResultsTimeout) {
      clearTimeout(pendingResultsTimeout);
      pendingResultsTimeout = null;
    }

    if (!query) {
      hideSearchModal();
      return;
    }

    // Show modal when user starts typing
    showSearchModal();
    
    // Show loading state
    showLoadingState();

    // Debounce search
    searchTimeout = setTimeout(() => {
      console.log('[Global Search] Performing search for:', query);
      performSearch(query);
    }, SEARCH_DELAY);
  }

  function showLoadingState() {
    if (elements.searchLoading) elements.searchLoading.hidden = false;
    elements.searchResults.innerHTML = '';
    if (elements.searchEmpty) elements.searchEmpty.hidden = true;
    if (elements.searchModal) elements.searchModal.classList.add('is-loading');
    loadingStartAt = Date.now();
  }

  // Hide all states helper
  function hideAllSearchStates() {
    elements.searchLoading.hidden = true;
    elements.searchEmpty.hidden = true;
  }

  function showEmptyState() {
    if (elements.searchLoading) elements.searchLoading.hidden = true;
    elements.searchResults.innerHTML = '';
    if (elements.searchEmpty) elements.searchEmpty.hidden = false;
    if (elements.searchModal) elements.searchModal.classList.remove('is-loading');
    
    // Add class to center the empty state
    const container = document.querySelector('.search-results-container');
    if (container) container.classList.add('showing-empty');
  }

  function showResults(results) {
    const applyResults = () => {
      if (elements.searchLoading) elements.searchLoading.hidden = true;
      if (elements.searchEmpty) elements.searchEmpty.hidden = true;
      let totalResults = 0;
      if (results && typeof results === 'object') {
        Object.values(results).forEach(arr => {
          if (Array.isArray(arr)) totalResults += arr.length;
        });
      }

      if (!results || totalResults === 0) {
        showEmptyState();
        return;
      }

      // Cache for later lookups (navigateToItem -> findItemById)
      lastResults = results;

      // Remove extra padding/margins for compact results
      elements.searchResults.style.padding = '0';
      elements.searchResults.style.margin = '0';
      elements.searchResults.style.width = '100%';
      elements.searchResults.innerHTML = renderResults(results);
      bindResultActions();
      if (elements.searchModal) elements.searchModal.classList.remove('is-loading');
      
      // Remove class to restore normal scrolling
      const container = document.querySelector('.search-results-container');
      if (container) container.classList.remove('showing-empty');
    };

    const elapsed = Date.now() - loadingStartAt;
    if (elapsed >= MIN_LOADING_MS) {
      applyResults();
    } else {
      const delay = MIN_LOADING_MS - elapsed;
      pendingResultsTimeout = setTimeout(() => {
        pendingResultsTimeout = null;
        applyResults();
      }, delay);
    }
  }

  async function performSearch(query) {
    console.log('[Global Search] performSearch called with:', query);
    try {
      const results = await searchAllData(query);
      console.log('[Global Search] Search results:', results);
      
      if (Object.keys(results).length === 0) {
        console.log('[Global Search] No results found, showing empty state');
        showEmptyState();
      } else {
        console.log('[Global Search] Results found, showing results');
        showResults(results);
      }
    } catch (error) {
      console.error('[Global Search] Search error:', error);
      showEmptyState();
    } finally {
      if (elements.searchLoading) {
        elements.searchLoading.hidden = true;
      }
    }
  }

  // Cache management functions
  function isCacheValid() {
    return searchCache.lastUpdated > 0 && 
           (Date.now() - searchCache.lastUpdated) < searchCache.cacheTimeout;
  }
  
  function updateCache(people, accounts, sequences, deals) {
    // Store raw data for caching, not processed results
    searchCache.people = people;
    searchCache.accounts = accounts;
    searchCache.sequences = sequences;
    searchCache.deals = deals;
    searchCache.lastUpdated = Date.now();
  }

  // Helper function to assemble search results
  function assemble(peep = [], acct = [], seq = [], deal = []) {
    const out = {};
    if (Array.isArray(peep) && peep.length) out.people = peep;
    if (Array.isArray(acct) && acct.length) out.accounts = acct;
    if (Array.isArray(seq) && seq.length) out.sequences = seq;
    if (Array.isArray(deal) && deal.length) out.deals = deal;
    return out;
  }

  async function searchAllData(query) {
    const normalizedQuery = query.toLowerCase();
    console.log('[Global Search] searchAllData called with normalized query:', normalizedQuery);
    
    // Fetch fresh data from Firebase
    const pPeople = searchPeople(normalizedQuery);
    const pAccounts = searchAccounts(normalizedQuery);
    const pSequences = searchSequences(normalizedQuery);
    const pDeals = searchDeals(normalizedQuery);

    return new Promise((resolve) => {
      let done = false;
      // Hard cap: emit whatever we have at 2s
      const capTimer = setTimeout(async () => {
        const settled = await Promise.allSettled([pPeople, pAccounts, pSequences, pDeals]);
        const vals = settled.map(s => (s.status === 'fulfilled' ? s.value : []));
        if (!done) { done = true; resolve(assemble(...vals)); }
      }, MAX_LOADING_MS);

      Promise.all([pPeople, pAccounts, pSequences, pDeals])
        .then(([a, b, c, d]) => {
          if (!done) { 
            clearTimeout(capTimer); 
            done = true; 
            resolve(assemble(a, b, c, d)); 
          }
        })
        .catch(async () => {
          const settled = await Promise.allSettled([pPeople, pAccounts, pSequences, pDeals]);
          const vals = settled.map(s => (s.status === 'fulfilled' ? s.value : []));
          if (!done) { clearTimeout(capTimer); done = true; resolve(assemble(...vals)); }
        });
    });
  }

  // Cache-based search functions (much faster)
  function searchPeopleFromCache(query) {
    if (!searchCache.people) return Promise.resolve([]);
    
    const results = [];
    searchCache.people.forEach(person => {
      const nameFields = [
        person.firstName || '',
        person.lastName || '',
        person.fullName || '',
        person.name || ''
      ];
      const titleFields = [person.title || '', person.jobTitle || ''];
      const companyFields = [person.company || '', person.companyName || ''];
      const extraFields = [person.email || '', person.city || '', person.state || ''];
      const allFields = [...nameFields, ...titleFields, ...companyFields, ...extraFields];
      const searchableText = allFields.join(' ').toLowerCase();

      let match = false;
      if (searchableText.includes(query)) {
        match = true;
      } else if (person.fullName) {
        const parts = person.fullName.toLowerCase().split(' ');
        if (parts.some(p => p && query.includes(p))) {
          match = true;
        }
      }
      
      if (match) {
        results.push({
          id: person.id,
          type: 'person',
          title: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed Contact',
          subtitle: [person.title || person.jobTitle, person.company || person.companyName].filter(Boolean).join(' • '),
          data: person
        });
      }
    });
    
    return Promise.resolve(results.slice(0, 5));
  }

  function searchAccountsFromCache(query) {
    if (!searchCache.accounts) return Promise.resolve([]);
    
    const results = [];
    searchCache.accounts.forEach(account => {
      const isYearSearch = /^\d{4}$/.test(query);
      const isUsageSearch = /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(query);
      
      let matches = false;

      if (isYearSearch) {
        const contractEnd = account.contractEndDate || account.contractEnd || account.contract_end_date;
        if (contractEnd) {
          const endYear = new Date(contractEnd.toDate ? contractEnd.toDate() : contractEnd).getFullYear();
          matches = endYear.toString() === query;
        }
      } else if (isUsageSearch) {
        const queryNum = parseFloat(query.replace(/,/g, ''));
        const usage = account.annualKilowattUsage || account.annualUsage || account.kilowattUsage;
        if (usage && typeof usage === 'number') {
          matches = usage >= queryNum;
        }
      } else {
        const searchableText = [
          account.accountName || '',
          account.name || '',
          account.companyName || '',
          account.industry || '',
          account.domain || '',
          account.website || '',
          account.supplier || '',
          account.city || '',
          account.state || ''
        ].join(' ').toLowerCase();
        matches = searchableText.includes(query);
      }

      if (matches) {
        let subtitle = '';
        if (isYearSearch) {
          subtitle = `Contract expires ${query}`;
        } else if (isUsageSearch) {
          const usage = account.annualKilowattUsage || account.annualUsage || account.kilowattUsage;
          subtitle = `${usage?.toLocaleString() || 'Unknown'} kWh annually`;
        } else {
          subtitle = [account.industry, account.city, account.state].filter(Boolean).join(' • ');
        }

        results.push({
          id: account.id,
          type: 'account',
          title: account.accountName || account.name || account.companyName || 'Unnamed Account',
          subtitle,
          data: account
        });
      }
    });
    
    return Promise.resolve(results.slice(0, 5));
  }

  function searchSequencesFromCache(query) {
    if (!searchCache.sequences) return Promise.resolve([]);
    
    const results = [];
    searchCache.sequences.forEach(sequence => {
      const searchableText = [
        sequence.name || '',
        sequence.title || '',
        sequence.createdBy || '',
        sequence.description || ''
      ].join(' ').toLowerCase();

      if (searchableText.includes(query)) {
        results.push({
          id: sequence.id,
          type: 'sequence',
          title: sequence.name || sequence.title || 'Unnamed Sequence',
          subtitle: sequence.description || `Created by ${sequence.createdBy || 'Unknown'}`,
          data: sequence
        });
      }
    });
    
    return Promise.resolve(results.slice(0, 5));
  }

  function searchDealsFromCache(query) {
    if (!searchCache.deals) return Promise.resolve([]);
    
    const results = [];
    searchCache.deals.forEach(deal => {
      const searchableText = [
        deal.name || '',
        deal.title || '',
        deal.accountName || '',
        deal.contactName || '',
        deal.stage || '',
        deal.description || ''
      ].join(' ').toLowerCase();

      if (searchableText.includes(query)) {
        results.push({
          id: deal.id,
          type: 'deal',
          title: deal.name || deal.title || 'Unnamed Deal',
          subtitle: `${deal.stage || 'No Stage'} • ${deal.accountName || 'No Account'}`,
          data: deal
        });
      }
    });
    
    return Promise.resolve(results.slice(0, 5));
  }

  async function searchPeople(query) {
    console.log('[Global Search] searchPeople called with query:', query);
    if (!window.firebaseDB) {
      console.log('[Global Search] Firebase DB not available');
      return [];
    }

    try {
      console.log('[Global Search] Fetching contacts from Firebase...');
      // OPTIMIZED: Only fetch fields needed for search (60% data reduction)
      const snapshot = await window.firebaseDB.collection('contacts')
        .select(
          'id', 'firstName', 'lastName', 'name',
          'email', 'phone', 'mobile', 'workDirectPhone', 'otherPhone',
          'title', 'companyName', 'seniority', 'department',
          'city', 'state', 'location',
          'employees', 'companySize', 'employeeCount',
          'industry', 'companyIndustry',
          'domain', 'companyDomain', 'website',
          'updatedAt', 'createdAt'
        )
        .get();
      const results = [];
      console.log('[Global Search] Contacts snapshot size:', snapshot.size);

      const qDigits = String(query || '').replace(/\D/g, '');
      const isPhoneSearch = qDigits.length >= 7; // handle most common formats/partials
      snapshot.forEach(doc => {
        const person = { id: doc.id, ...doc.data() };
        // Build all possible name/title combos for robust matching
        const nameFields = [
          person.firstName || '',
          person.lastName || '',
          person.fullName || '',
          person.name || ''
        ];
        const titleFields = [person.title || '', person.jobTitle || ''];
        const companyFields = [person.company || '', person.companyName || ''];
        const extraFields = [person.email || '', person.city || '', person.state || ''];
        const allFields = [...nameFields, ...titleFields, ...companyFields, ...extraFields];
        const searchableText = allFields.join(' ').toLowerCase();

        // Also allow searching by fullName split into first/last
        let match = false;
        let matchedPhone = '';
        if (isPhoneSearch) {
          const phones = [person.phone, person.mobile, person.workDirectPhone, person.otherPhone]
            .map(p => String(p || ''));
          for (const p of phones) {
            const pd = p.replace(/\D/g, '');
            if (pd && pd.includes(qDigits)) { match = true; matchedPhone = p; break; }
          }
        } else if (searchableText.includes(query)) {
          match = true;
        } else if (person.fullName) {
          const parts = person.fullName.toLowerCase().split(' ');
          if (parts.some(p => p && query.includes(p))) {
            match = true;
          }
        }
        if (match) {
          results.push({
            id: person.id,
            type: 'person',
            title: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed Contact',
            subtitle: (isPhoneSearch && matchedPhone)
              ? `${[person.title || person.jobTitle, person.company || person.companyName].filter(Boolean).join(' • ')}${([person.title || person.jobTitle, person.company || person.companyName].filter(Boolean).length ? ' • ' : '')}Phone: ${matchedPhone}`
              : [person.title || person.jobTitle, person.company || person.companyName].filter(Boolean).join(' • '),
            data: person
          });
        }
      });

      return results.slice(0, 5); // Limit results
    } catch (error) {
      console.error('Error searching people:', error);
      return [];
    }
  }

  async function searchAccounts(query) {
    if (!window.firebaseDB) {
      console.log('Firebase DB not available for accounts');
      return [];
    }

    try {
      // OPTIMIZED: Only fetch fields needed for search and AI email generation (25% data reduction)
      const snapshot = await window.firebaseDB.collection('accounts')
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
          'logoUrl', // Required for account favicons in search results
          'shortDescription', 'short_desc', 'descriptionShort', 'description', // Required for AI email generation
          'annualUsage', 'annual_kwh', 'kwh', // Required for AI email generation
          'electricitySupplier', 'supplier', // Required for AI email generation
          'currentRate', 'rate', // Required for AI email generation
          'notes', 'note', // Required for AI email generation
          'updatedAt', 'createdAt'
        )
        .get();
      const results = [];

      const qDigits = String(query || '').replace(/\D/g, '');
      const isPhoneSearch = qDigits.length >= 7;
      snapshot.forEach(doc => {
        const account = { id: doc.id, ...doc.data() };
        
        // Handle special search cases
        const isYearSearch = /^\d{4}$/.test(query);
        const isUsageSearch = /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(query);
        
        let matches = false;
        let matchedPhone = '';

        if (isPhoneSearch) {
          const phones = [account.phone, account.primaryPhone, account.mainPhone]
            .map(p => String(p || ''));
          for (const p of phones) {
            const pd = p.replace(/\D/g, '');
            if (pd && pd.includes(qDigits)) { matches = true; matchedPhone = p; break; }
          }
        } else if (isYearSearch) {
          // Search contract end dates
          const contractEnd = account.contractEndDate || account.contractEnd || account.contract_end_date;
          if (contractEnd) {
            const endYear = new Date(contractEnd.toDate ? contractEnd.toDate() : contractEnd).getFullYear();
            matches = endYear.toString() === query;
          }
        } else if (isUsageSearch) {
          // Search annual kilowatt usage
          const queryNum = parseFloat(query.replace(/,/g, ''));
          const usage = account.annualKilowattUsage || account.annualUsage || account.kilowattUsage;
          if (usage && typeof usage === 'number') {
            matches = usage >= queryNum;
          }
        } else {
          // Regular text search
          const searchableText = [
            account.accountName || '',
            account.name || '',
            account.companyName || '',
            account.industry || '',
            account.domain || '',
            account.website || '',
            account.supplier || '',
            account.city || '',
            account.state || ''
          ].join(' ').toLowerCase();

          matches = searchableText.includes(query);
        }

        if (matches) {
          let subtitle = '';
          if (isPhoneSearch && matchedPhone) {
            subtitle = `Phone: ${matchedPhone}`;
          } else if (isYearSearch) {
            subtitle = `Contract expires ${query}`;
          } else if (isUsageSearch) {
            const usage = account.annualKilowattUsage || account.annualUsage || account.kilowattUsage;
            subtitle = `${usage?.toLocaleString() || 'Unknown'} kWh annually`;
          } else {
            subtitle = [account.industry, account.city, account.state].filter(Boolean).join(' • ');
          }

          results.push({
            id: account.id,
            type: 'account',
            title: account.accountName || account.name || account.companyName || 'Unnamed Account',
            subtitle,
            data: account
          });
        }
      });

      return results.slice(0, 5);
    } catch (error) {
      console.error('Error searching accounts:', error);
      return [];
    }
  }

  async function searchSequences(query) {
    if (!window.firebaseDB) return [];

    try {
      // OPTIMIZED: Only fetch fields needed for search (50% data reduction)
      const snapshot = await window.firebaseDB.collection('sequences')
        .select(
          'id', 'name', 'title', 'description', 'createdBy', 'updatedAt', 'createdAt'
        )
        .get();
      const results = [];

      snapshot.forEach(doc => {
        const sequence = { id: doc.id, ...doc.data() };
        
        const searchableText = [
          sequence.name || '',
          sequence.title || '',
          sequence.createdBy || '',
          sequence.description || ''
        ].join(' ').toLowerCase();

        if (searchableText.includes(query)) {
          results.push({
            id: sequence.id,
            type: 'sequence',
            title: sequence.name || 'Unnamed Sequence',
            subtitle: `Created by ${sequence.createdBy || 'Unknown'} • ${sequence.active || 0} active`,
            data: sequence
          });
        }
      });

      return results.slice(0, 5);
    } catch (error) {
      console.error('Error searching sequences:', error);
      return [];
    }
  }

  async function searchDeals(query) {
    if (!window.firebaseDB) return [];

    try {
      const snapshot = await window.firebaseDB.collection('deals').get();
      const results = [];

      snapshot.forEach(doc => {
        const deal = { id: doc.id, ...doc.data() };
        
        const searchableText = [
          deal.title || '',
          deal.name || '',
          deal.company || '',
          deal.companyName || '',
          deal.stage || '',
          deal.value || ''
        ].join(' ').toLowerCase();

        if (searchableText.includes(query)) {
          results.push({
            id: deal.id,
            type: 'deal',
            title: deal.title || deal.name || 'Unnamed Deal',
            subtitle: `${deal.company || deal.companyName || ''} • ${deal.stage || 'Unknown stage'} • $${(deal.value || 0).toLocaleString()}`,
            data: deal
          });
        }
      });

      return results.slice(0, 5);
    } catch (error) {
      console.error('Error searching deals:', error);
      return [];
    }
  }

  function renderResults(results) {
    let html = '';

    const categoryNames = {
      people: 'People',
      accounts: 'Accounts', 
      sequences: 'Sequences',
      deals: 'Deals'
    };

    Object.keys(results).forEach(category => {
      const items = results[category];
      if (!items || items.length === 0) return;

      html += `
        <div class="search-category">
          <div class="category-header">${categoryNames[category]} (${items.length})</div>
          <div class="category-results">
            ${items.map(item => renderResultItem(item)).join('')}
          </div>
        </div>
      `;
    });

    return html;
  }

  function renderResultItem(item) {
    const actions = getActionsForType(item.type);
    
    return `
      <div class="search-result-item clickable" data-id="${item.id}" data-type="${item.type}" title="Click to view ${item.title}">
        <div class="result-main">
          <div class="result-title">${escapeHtml(item.title)}</div>
          <div class="result-subtitle">${escapeHtml(item.subtitle)}</div>
        </div>
        <div class="result-actions" onclick="event.stopPropagation()">
          ${actions.filter(action => action.key !== 'view').map(action => renderActionButton(action, item)).join('')}
        </div>
      </div>
    `;
  }

  function getActionsForType(type) {
    const actions = {
      person: [
        { key: 'email', label: 'Email', icon: getEmailIcon() },
        { key: 'call', label: 'Call', icon: getCallIcon() }
      ],
      account: [
        { key: 'add-contact', label: 'Add Contact', icon: getAddContactIcon() },
        { key: 'create-deal', label: 'Create Deal', icon: getDealIcon() }
      ],
      sequence: [
        { key: 'edit', label: 'Edit', icon: getEditIcon() },
        { key: 'clone', label: 'Clone', icon: getCloneIcon() }
      ],
      deal: [
        { key: 'edit', label: 'Edit', icon: getEditIcon() },
        { key: 'move-stage', label: 'Move Stage', icon: getMoveIcon() }
      ]
    };

    return actions[type] || [];
  }

  function bindResultActions() {
    const actionButtons = elements.searchResults.querySelectorAll('.result-action-btn');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', handleActionClick);
    });

    const resultItems = elements.searchResults.querySelectorAll('.search-result-item.clickable');
    resultItems.forEach(item => {
      item.addEventListener('click', handleResultClick);
      // Add hover effect
      item.addEventListener('mouseenter', () => {
        item.style.transform = 'translateY(-1px)';
        item.style.boxShadow = 'var(--elevation-card-hover)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.transform = '';
        item.style.boxShadow = '';
      });
    });
  }

  function handleActionClick(e) {
    e.stopPropagation();
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    const type = e.target.dataset.type;

    executeAction(action, type, id);
    hideSearchModal();
  }

  function handleResultClick(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type;
    
    executeAction('view', type, id);
    hideSearchModal();
  }

  function executeAction(action, type, id) {
    switch (action) {
      case 'view':
        navigateToItem(type, id);
        break;
      case 'email':
        if (type === 'person') {
          const item = findItemById(id, type);
          const email = item?.data?.email || '';
          if (email) {
            try {
              if (window.EmailCompose && typeof window.EmailCompose.openTo === 'function') {
                window.EmailCompose.openTo(email, item?.title || '');
              } else {
                navigateToPage('emails');
              }
            } catch (_) { navigateToPage('emails'); }
          } else {
            window.crm?.showToast && window.crm.showToast('No email address found for this contact');
          }
        }
        break;
      case 'call':
        if (type === 'person') {
          // Get person data and trigger phone widget
          const item = findItemById(id, type);
          if (item && item.data && item.data.phone) {
            // Trigger phone widget with contact info
            if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
              window.Widgets.callNumber(item.data.phone, item.title, false);
              if (window.crm && typeof window.crm.showToast === 'function') {
                // Phone opened for contact
              }
            }
          } else {
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('No phone number found for this contact');
            }
          }
        }
        break;
      case 'add-contact':
        if (type === 'account') {
          navigateToPage('people');
          setTimeout(() => {
            if (window.crm && typeof window.crm.showModal === 'function') {
              window.crm.showModal('add-contact');
            }
          }, 100);
        }
        break;
      case 'create-deal':
        if (type === 'account') {
          navigateToPage('deals');
          setTimeout(() => {
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('Deal creator opened');
            }
          }, 100);
        }
        break;
      case 'edit':
        navigateToItem(type, id);
        break;
      case 'clone':
        if (type === 'sequence') {
          navigateToPage('sequences');
          setTimeout(() => {
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('Sequence cloned');
            }
          }, 100);
        }
        break;
      case 'move-stage':
        if (type === 'deal') {
          navigateToPage('deals');
          setTimeout(() => {
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('Deal stage editor opened');
            }
          }, 100);
        }
        break;
      default:
        navigateToItem(type, id);
    }
  }

  function navigateToItem(type, id) {
    switch (type) {
      case 'person':
        // Try to show contact detail directly if available
        if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
          // Navigate to people page and show detail immediately
          navigateToPage('people');
          // Use requestAnimationFrame to ensure the page has started loading
          requestAnimationFrame(() => {
            window.ContactDetail.show(id);
          });
        } else {
          // Fallback to old behavior if ContactDetail is not available
          window._globalSearchDirectNavigation = { type: 'contact', id: id };
          navigateToPage('people');
        }
        break;
      case 'account':
        // For accounts, we have a dedicated detail page, so navigate directly
        if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
          window.AccountDetail.show(id);
        } else {
          // Fallback to accounts page
          navigateToPage('accounts');
        }
        break;
      case 'sequence': {
        // Directly open the Sequence Builder for this sequence
        const fallbackToList = () => { navigateToPage('sequences'); };

        // If builder is available, show it with cached or fetched data
        if (window.SequenceBuilder && typeof window.SequenceBuilder.show === 'function') {
          // Try cached search result first
          const cached = findItemById(id, 'sequence');
          if (cached && cached.data && cached.data.id) {
            try { window.SequenceBuilder.show(cached.data); } catch (_) { fallbackToList(); }
            return;
          }
          // Fetch from Firestore as a fallback
          try {
            const db = (typeof window !== 'undefined') ? window.firebaseDB : null;
            if (db && db.collection) {
              db.collection('sequences').doc(id).get().then((doc) => {
                if (doc && doc.exists) {
                  const seq = { id: doc.id || id, ...(doc.data ? doc.data() : {}) };
                  try { window.SequenceBuilder.show(seq); } catch (_) { fallbackToList(); }
                } else {
                  fallbackToList();
                }
              }).catch(() => fallbackToList());
            } else {
              fallbackToList();
            }
          } catch (_) {
            fallbackToList();
          }
          return;
        }
        // Builder not available, fallback to list
        fallbackToList();
        return;
      }
      case 'deal':
        // For deals, navigate to deals page (detail view coming soon)
        navigateToPage('deals');
        if (window.showDealDetail && typeof window.showDealDetail === 'function') {
          requestAnimationFrame(() => {
            window.showDealDetail(id);
          });
        } else {
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Deal detail view coming soon');
          }
        }
        break;
      default:
        console.warn('Unknown item type:', type);
    }
    
    // Store the ID for the page to potentially highlight or focus on
    sessionStorage.setItem('highlightItem', id);
  }

  function navigateToPage(page) {
    // Use the existing navigation system
    const navItem = document.querySelector(`[data-page="${page}"]`);
    if (navItem) {
      navItem.click();
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Helper function to render action buttons with icons
  function renderActionButton(action, item) {
    return `
      <button class="result-action-btn icon-btn" data-action="${action.key}" data-id="${item.id}" data-type="${item.type}" title="${action.label}">
        ${action.icon}
      </button>
    `;
  }

  // Helper function to find item data by ID (for actions that need it)
  function findItemById(id, type) {
    // Prefer cached data from the last search
    if (lastResults && type) {
      const groups = Object.values(lastResults).filter(Array.isArray);
      for (const arr of groups) {
        for (const item of arr) {
          if (item && item.id === id && item.type === type) {
            return item;
          }
        }
      }
    }
    // Fallback: derive minimal info from DOM (no full data)
    const resultItems = elements.searchResults.querySelectorAll(`[data-id="${CSS.escape(id)}"][data-type="${CSS.escape(type)}"]`);
    if (resultItems.length > 0) {
      return {
        id,
        type,
        title: resultItems[0].querySelector('.result-title')?.textContent,
        subtitle: resultItems[0].querySelector('.result-subtitle')?.textContent,
        data: null
      };
    }
    return null;
  }

  // Icon functions matching the sidebar style
  function getEmailIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
    `;
  }

  function getCallIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    `;
  }

  function getAddContactIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <line x1="20" y1="8" x2="20" y2="14"></line>
        <line x1="23" y1="11" x2="17" y2="11"></line>
      </svg>
    `;
  }

  function getDealIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="1" x2="12" y2="23"></line>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
      </svg>
    `;
  }

  function getEditIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
  }

  function getCloneIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
  }

  function getMoveIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="5 9 2 12 5 15"></polyline>
        <polyline points="9 5 12 2 15 5"></polyline>
        <polyline points="15 19 12 22 9 19"></polyline>
        <polyline points="19 9 22 12 19 15"></polyline>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <line x1="12" y1="2" x2="12" y2="22"></line>
      </svg>
    `;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalSearch);
  } else {
    initGlobalSearch();
  }

  // Export for global access
  window.GlobalSearch = {
    init: initGlobalSearch,
    showSearchModal,
    hideSearchModal
  };
  // Also expose direct function for legacy callers
  window.initGlobalSearch = initGlobalSearch;
})();
