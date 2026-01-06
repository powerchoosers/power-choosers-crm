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
  let lastQuery = '';
  
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
    searchEmpty: null,
    searchSkeleton: null,
    prospectPeopleBtn: null,
    prospectAccountsBtn: null
  };
  let stylesInjected = false;

  // Initialize search modal and listeners
  function initGlobalSearch() {
    elements.searchInput = document.querySelector('.search-input');
    elements.searchModal = document.getElementById('global-search-modal');
    elements.searchResults = document.getElementById('search-results');
    elements.searchLoading = document.getElementById('search-loading');
    elements.searchEmpty = document.getElementById('search-empty');
    elements.searchSkeleton = document.getElementById('search-skeleton');
    elements.prospectPeopleBtn = document.getElementById('prospect-people-btn');
    elements.prospectAccountsBtn = document.getElementById('prospect-accounts-btn');
    
    // Make sure modal is hidden on load
    if (elements.searchModal) {
      elements.searchModal.hidden = true;
      elements.searchModal.classList.remove('is-loading');
    }
    if (elements.searchResults) elements.searchResults.innerHTML = '';
    if (elements.searchLoading) elements.searchLoading.hidden = true;
    if (elements.searchSkeleton) elements.searchSkeleton.hidden = true;
    if (elements.searchEmpty) elements.searchEmpty.hidden = true;

    if (!elements.searchInput || !elements.searchModal) {
      console.warn('Global search elements not found');
      return;
    }

    injectSearchStyles();
    bindEvents();
  }

  function injectSearchStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'global-search-enhanced-styles';
    style.textContent = `
      .search-results-container {
        padding: 12px 12px 24px 12px;
        box-sizing: border-box;
        max-height: 820px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--border-medium) transparent;
      }
      .search-results-container::-webkit-scrollbar {
        width: 6px;
      }
      .search-results-container::-webkit-scrollbar-track {
        background: transparent;
      }
      .search-results-container::-webkit-scrollbar-thumb {
        background-color: var(--border-medium);
        border-radius: 10px;
      }
      .search-results-container.showing-empty {
        padding-bottom: 4px; /* 4px + 8px from prospect-actions = 12px, matches top padding */
      }
      .search-results-container .search-category {
        background: var(--bg-card, rgba(61, 68, 78, 0.8));
        border: 1px solid var(--border-medium, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        margin-bottom: 16px;
        margin-left: 0;
        margin-right: 0;
        overflow: hidden;
        box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.3));
      }
      .search-results-container .search-category:last-child {
        margin-bottom: 0;
      }
      .search-results-container .search-category .category-header {
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.05);
        border-bottom: 1px solid var(--border-light, rgba(255, 255, 255, 0.06));
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .search-results-container .search-result-item {
        padding: 12px 14px;
        margin: 0;
        background: transparent;
        border-bottom: 1px solid var(--border-light, rgba(255, 255, 255, 0.06));
        transition: all 0.2s ease;
      }
      .search-results-container .search-result-item:last-child {
        border-bottom: none;
      }
      .search-results-container .search-result-item:hover {
        background: var(--bg-card-hover, rgba(71, 78, 88, 0.9));
      }
      .search-result-item .result-title {
        color: var(--text-main);
        font-weight: 500;
        font-size: 0.9rem;
      }
      .search-result-item .result-subtitle {
        color: var(--grey-400);
        font-size: 0.8rem;
      }
      .search-result-item .result-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .search-result-item .result-main-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .search-result-item .result-favicon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        flex-shrink: 0;
        overflow: hidden;
      }
      .search-result-item .result-favicon img {
        width: 32px;
        height: 32px;
        object-fit: cover;
        display: block;
      }
      .search-result-item .result-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .search-result-item .result-title,
      .search-result-item .result-subtitle {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .search-result-item .result-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--orange-subtle, #f08f4a);
        color: #fff;
        font-weight: 600;
        letter-spacing: .5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        text-transform: uppercase;
      }
      .search-result-item .result-actions {
        gap: 6px;
      }

      .search-results-container .search-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--bg-item, #4e5661);
        border: 1px solid var(--border-medium, rgba(255, 255, 255, 0.1));
        border-radius: 20px;
        padding: 6px 14px;
        color: var(--text-primary, #fff);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      }

      .search-results-container .search-all-btn:hover {
        background: var(--bg-hover, rgba(255, 255, 255, 0.1));
        border-color: var(--accent-orange, #f18335);
        color: #ffffff;
        transform: translateY(-1px);
      }

      .search-results-container .search-all-btn svg {
        width: 14px;
        height: 14px;
        display: block;
      }

      .search-results-container .result-action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-medium, rgba(255, 255, 255, 0.1));
        color: var(--text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .search-results-container .result-action-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.3);
        color: #ffffff;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }

      .search-results-container .result-action-btn svg {
        width: 16px;
        height: 16px;
      }
    `;
    document.head.appendChild(style);
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

    // Handle prospect button clicks
    if (elements.prospectPeopleBtn) {
      elements.prospectPeopleBtn.addEventListener('click', () => {
        const query = elements.searchInput.value.trim();
        if (!query) {
            window.location.hash = '#prospecting';
            hideSearchModal();
            return;
        }
        performProspectSearch('people', query);
      });
    }

    if (elements.prospectAccountsBtn) {
      elements.prospectAccountsBtn.addEventListener('click', () => {
        const query = elements.searchInput.value.trim();
        if (!query) {
            window.location.hash = '#prospecting';
            hideSearchModal();
            return;
        }
        performProspectSearch('accounts', query);
      });
    }
  }

  async function performProspectSearch(type, query) {
    showLoadingState();
    try {
      let results = {};
      if (type === 'people') {
        const people = await searchApolloPeople(query);
        results = { prospectPeople: people };
      } else {
        const orgs = await searchApolloOrganizations(query);
        results = { prospectAccounts: orgs };
      }
      showResults(results);
    } catch (error) {
      console.error('[Global Search] Prospect search error:', error);
      showEmptyState();
    }
  }

  async function searchApolloPeople(query) {
    try {
      const resp = await fetch('/api/apollo/search/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q_keywords: query, per_page: 5 })
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      // The backend returns a 'people' array
      return (data.people || []).map(p => {
        const subtitleParts = [];
        if (p.title) subtitleParts.push(p.title);
        if (p.company) subtitleParts.push(p.company);
        if (p.location) {
          // If location is "City, State, Country", try to just take "City, State"
          const locParts = p.location.split(', ');
          if (locParts.length >= 2) {
            subtitleParts.push(`${locParts[0]}, ${locParts[1]}`);
          } else {
            subtitleParts.push(p.location);
          }
        }
        
        return {
          id: p.id,
          type: 'prospectPeople',
          title: p.name,
          subtitle: subtitleParts.join(' • '),
          data: p
        };
      });
    } catch (error) {
      console.error('Apollo people search error:', error);
      return [];
    }
  }

  async function searchApolloOrganizations(query) {
    try {
      const resp = await fetch('/api/apollo/search/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          q_organization_name: query, // Use the correct parameter for org search
          per_page: 5 
        })
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      // The backend returns an 'organizations' array
      return (data.organizations || []).map(o => {
        const subtitleParts = [];
        if (o.industry) subtitleParts.push(o.industry);
        if (o.location) {
          // If location is "City, State, Country", try to just take "City, State"
          const locParts = o.location.split(', ');
          if (locParts.length >= 2) {
            subtitleParts.push(`${locParts[0]}, ${locParts[1]}`);
          } else {
            subtitleParts.push(o.location);
          }
        } else if (o.domain) {
          // Fallback to domain only if location is missing
          subtitleParts.push(o.domain);
        }
        
        return {
          id: o.id,
          type: 'prospectAccounts',
          title: o.name,
          subtitle: subtitleParts.join(' • '),
          data: o
        };
      });
    } catch (error) {
      console.error('Apollo org search error:', error);
      return [];
    }
  }

  function showSearchModal() {
    elements.searchModal.hidden = false;
    // Force reflow to enable transition
    elements.searchModal.offsetHeight;
    elements.searchModal.classList.add('open');
    
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
    elements.searchModal.classList.remove('open');
    
    // Wait for transition to finish before hiding
    setTimeout(() => {
      if (!elements.searchModal.classList.contains('open')) {
        elements.searchModal.hidden = true;
      }
    }, 200);

    const container = document.querySelector('.search-results-container');
    if (container) container.classList.remove('expanded');

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
      performSearch(query);
    }, SEARCH_DELAY);
  }

  function showLoadingState() {
    if (elements.searchLoading) elements.searchLoading.hidden = true;
    if (elements.searchSkeleton) elements.searchSkeleton.hidden = false;
    elements.searchResults.innerHTML = '';
    if (elements.searchEmpty) elements.searchEmpty.hidden = true;
    if (elements.searchModal) elements.searchModal.classList.add('is-loading');
    
    // Expand container
    const container = document.querySelector('.search-results-container');
    if (container) container.classList.add('expanded');

    loadingStartAt = Date.now();
  }

  // Hide all states helper
  function hideAllSearchStates() {
    if (elements.searchLoading) elements.searchLoading.hidden = true;
    if (elements.searchSkeleton) elements.searchSkeleton.hidden = true;
    elements.searchEmpty.hidden = true;
  }

  function showEmptyState() {
    if (elements.searchLoading) elements.searchLoading.hidden = true;
    if (elements.searchSkeleton) elements.searchSkeleton.hidden = true;
    elements.searchResults.innerHTML = '';
    
    // Hide empty message - the prospecting buttons are enough
    if (elements.searchEmpty) elements.searchEmpty.hidden = true;
    if (elements.searchModal) elements.searchModal.classList.remove('is-loading');
    
    const container = document.querySelector('.search-results-container');
    if (container) {
        container.classList.add('showing-empty');
        container.classList.add('expanded');
    }
  }

  function showResults(results) {
    const applyResults = () => {
      if (elements.searchLoading) elements.searchLoading.hidden = true;
      if (elements.searchSkeleton) elements.searchSkeleton.hidden = true;
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
      if (container) {
          container.classList.remove('showing-empty');
          container.classList.add('expanded');
      }
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
    lastQuery = query;
    try {
      const results = await searchAllData(query);
      
      if (Object.keys(results).length === 0) {
        showEmptyState();
      } else {
        showResults(results);
      }
    } catch (error) {
      console.error('[Global Search] Search error:', error);
      showEmptyState();
    } finally {
      if (elements.searchLoading) {
        elements.searchLoading.hidden = true;
      }
      if (elements.searchSkeleton) {
        elements.searchSkeleton.hidden = true;
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
        const subtitleParts = [person.title || person.jobTitle, person.company || person.companyName].filter(Boolean);
        const locParts = [person.city, person.state].filter(Boolean);
        if (locParts.length > 0) {
          subtitleParts.push(locParts.join(', '));
        }

        results.push({
          id: person.id,
          type: 'person',
          title: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed Contact',
          subtitle: subtitleParts.join(' • '),
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
    
    // OPTIMIZED: Use cached data from background loader instead of loading entire collection
    // This saves thousands of Firestore reads per search
    let people = [];
    if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
      people = window.BackgroundContactsLoader.getContactsData() || [];
    } else if (window.firebaseDB) {
      // Fallback to Firestore only if background loader not available
      const snapshot = await window.firebaseDB.collection('contacts').limit(500).get();
      snapshot.forEach(doc => people.push({ id: doc.id, ...doc.data() }));
    }
    
    if (people.length === 0) {
      return [];
    }

    try {
      const results = [];

      const qDigits = String(query || '').replace(/\D/g, '');
      const isPhoneSearch = qDigits.length >= 7; // handle most common formats/partials
      for (const person of people) {
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
          const subtitleParts = [person.title || person.jobTitle, person.company || person.companyName].filter(Boolean);
          
          // Add location (City, State)
          const locParts = [person.city, person.state].filter(Boolean);
          if (locParts.length > 0) {
            subtitleParts.push(locParts.join(', '));
          }

          let subtitle = subtitleParts.join(' • ');
          if (isPhoneSearch && matchedPhone) {
            subtitle += `${subtitle ? ' • ' : '' }Phone: ${matchedPhone}`;
          }

          results.push({
            id: person.id,
            type: 'person',
            title: person.fullName || person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed Contact',
            subtitle: subtitle,
            data: person
          });
          if (results.length >= 5) break; // Early exit once we have enough results
        }
      }

      return results.slice(0, 5); // Limit results
    } catch (error) {
      console.error('Error searching people:', error);
      return [];
    }
  }

  async function searchAccounts(query) {
    // OPTIMIZED: Use cached data from background loader instead of loading entire collection
    // This saves thousands of Firestore reads per search
    let accounts = [];
    if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
      accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
    } else if (window.firebaseDB) {
      // Fallback to Firestore only if background loader not available
      const snapshot = await window.firebaseDB.collection('accounts').limit(500).get();
      snapshot.forEach(doc => accounts.push({ id: doc.id, ...doc.data() }));
    }
    
    if (accounts.length === 0) {
      return [];
    }

    try {
      const results = [];

      const qDigits = String(query || '').replace(/\D/g, '');
      const isPhoneSearch = qDigits.length >= 7;
      for (const account of accounts) {
        
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
          if (results.length >= 5) break; // Early exit once we have enough results
        }
      }

      return results.slice(0, 5);
    } catch (error) {
      console.error('Error searching accounts:', error);
      return [];
    }
  }

  async function searchSequences(query) {
    // OPTIMIZED: Use cached data from background loader instead of loading entire collection
    let sequences = [];
    if (window.BackgroundSequencesLoader && typeof window.BackgroundSequencesLoader.getSequencesData === 'function') {
      sequences = window.BackgroundSequencesLoader.getSequencesData() || [];
    } else if (window.firebaseDB) {
      // Fallback to Firestore only if background loader not available
      const snapshot = await window.firebaseDB.collection('sequences').limit(200).get();
      snapshot.forEach(doc => sequences.push({ id: doc.id, ...doc.data() }));
    }
    
    if (sequences.length === 0) return [];

    try {
      const results = [];

      for (const sequence of sequences) {
        
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
          if (results.length >= 5) break; // Early exit once we have enough results
        }
      }

      return results.slice(0, 5);
    } catch (error) {
      console.error('Error searching sequences:', error);
      return [];
    }
  }

  async function searchDeals(query) {
    // OPTIMIZED: Use cached data or limited Firestore queries
    // Note: No background loader for deals yet, so we limit Firestore query
    let deals = [];
    
    if (window.firebaseDB) {
      try {
        const email = window.currentUserEmail || '';
        if (window.currentUserRole !== 'admin' && email) {
          // Non-admin: use scoped query with limit
          const [ownedSnap, assignedSnap] = await Promise.all([
            window.firebaseDB.collection('deals').where('ownerId','==',email).limit(200).get(),
            window.firebaseDB.collection('deals').where('assignedTo','==',email).limit(200).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id, { id: d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() }); });
          deals = Array.from(map.values());
        } else {
          // Admin: use limited query
          const snapshot = await window.firebaseDB.collection('deals').limit(500).get();
          snapshot.forEach(doc => deals.push({ id: doc.id, ...doc.data() }));
        }
      } catch (error) {
        console.error('Error fetching deals:', error);
        return [];
      }
    }
    
    if (deals.length === 0) return [];
    
    try {
      const results = [];

      for (const deal of deals) {
        
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
          if (results.length >= 5) break; // Early exit once we have enough results
        }
      }

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
      deals: 'Deals',
      prospectPeople: 'Prospect People',
      prospectAccounts: 'Prospect Accounts'
    };

    Object.keys(results).forEach(category => {
      const items = results[category];
      if (!items || items.length === 0) return;

      html += `
        <div class="search-category">
          <div class="category-header" style="display:flex; align-items:center; justify-content:space-between;">
            <div class="category-title">${categoryNames[category] || category} (${items.length})</div>
            <button class="search-all-btn btn-text" data-category="${category}" aria-label="Search all ${categoryNames[category] || category}">
              <span>SEARCH ALL</span>
              ${getArrowRightIcon()}
            </button>
          </div>
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
    const { iconHTML, initialsHTML } = buildVisualsForItem(item);
    const isPerson = item.type === 'person' || item.type === 'prospectPeople';
    
    return `
      <div class="search-result-item clickable" data-id="${item.id}" data-type="${item.type}" title="Click to view ${item.title}">
        <div class="result-main">
          <div class="result-main-left">
            ${
              isPerson
                ? `<div class="result-avatar" aria-hidden="true">${initialsHTML || '?'}</div>`
                : `<div class="result-favicon" aria-hidden="true">${iconHTML}</div>`
            }
            <div class="result-text">
              <div class="result-title">${escapeHtml(item.title)}</div>
              <div class="result-subtitle">${escapeHtml(item.subtitle)}</div>
            </div>
          </div>
          ${!isPerson && initialsHTML ? `<div class="result-avatar" aria-hidden="true">${initialsHTML}</div>` : ''}
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
      ],
      prospectAccounts: [
        { key: 'save-account', label: 'Save Account', icon: getSaveIcon() }
      ]
    };

    return actions[type] || [];
  }

  function bindResultActions() {
    const actionButtons = elements.searchResults.querySelectorAll('.result-action-btn');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', handleActionClick);
    });

    const searchAllButtons = elements.searchResults.querySelectorAll('.search-all-btn');
    searchAllButtons.forEach(btn => {
      btn.addEventListener('click', handleSearchAllClick);
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

  function handleSearchAllClick(e) {
    e.stopPropagation();
    const category = e.currentTarget.getAttribute('data-category');
    searchAllCategory(category);
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
      case 'save-account':
        if (type === 'prospectAccounts') {
          const item = findItemById(id, type);
          if (item && item.data) {
            if (window.Widgets && typeof window.Widgets.addAccountToCRM === 'function') {
              // Map prospect account data to what addAccountToCRM expects
              // Parse location into city/state if needed
              let city = item.data.city || '';
              let state = item.data.state || '';
              if (!city && !state && item.data.location) {
                const parts = item.data.location.split(',').map(s => s.trim());
                if (parts.length > 0) city = parts[0];
                if (parts.length > 1) state = parts[1];
              }

              const accountData = {
                companyName: item.data.name || item.title,
                companyDomain: item.data.domain || '',
                companyPhone: item.data.phone || item.data.companyPhone || '',
                city: city,
                state: state,
                ...item.data
              };
              window.Widgets.addAccountToCRM(accountData).then(newId => {
                if (newId) {
                  // Navigate to account detail
                  if (window.crm && typeof window.crm.navigateToPage === 'function') {
                    window.crm.navigateToPage('account-details');
                    // Wait for module to load then show account
                    const check = () => {
                      if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
                        window.AccountDetail.show(newId);
                      } else {
                        setTimeout(check, 50);
                      }
                    };
                    check();
                  } else {
                    window.location.hash = `#account-detail?id=${newId}`;
                  }
                }
              });
            } else {
              window.crm?.showToast && window.crm.showToast('CRM integration not available');
            }
          }
        }
        break;
      default:
        navigateToItem(type, id);
    }
  }

  function searchAllCategory(category) {
    const pageMap = { 
      people: 'people', 
      accounts: 'accounts', 
      deals: 'deals', 
      sequences: 'sequences',
      prospectPeople: 'prospecting',
      prospectAccounts: 'prospecting'
    };
    const page = pageMap[category];
    if (!page) return;
    const query = (elements.searchInput && elements.searchInput.value ? elements.searchInput.value.trim() : '') || lastQuery || '';
    
    if (page === 'prospecting') {
      if (query) setSearchPrefill('prospecting', query);
      window.location.hash = '#prospecting';
    } else {
      if (query) setSearchPrefill(page, query);
      navigateToPage(page);
    }
    hideSearchModal();
  }

  function setSearchPrefill(page, query) {
    try {
      sessionStorage.setItem('pcSearchPrefill', JSON.stringify({ page, query, ts: Date.now() }));
    } catch (_) { /* noop */ }
  }

  function buildVisualsForItem(item) {
    const type = item.type;
    const data = item.data || {};
    let iconHTML = '';
    let initialsHTML = '';

    const safe = (v) => (v == null ? '' : String(v));

    const getDomainFrom = (input) => {
      try {
        const val = safe(input).trim();
        if (!val) return '';
        if (/^https?:\/\//i.test(val)) {
          const u = new URL(val);
          return (u.hostname || '').replace(/^www\./i, '');
        }
        if (val.includes('@')) {
          return val.split('@')[1] || '';
        }
        return val.replace(/^www\./i, '');
      } catch (_) { return ''; }
    };

    const buildFavicon = (logoUrl, domain, size = 32) => {
      const cleanDomain = getDomainFrom(domain);
      if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
        const html = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain: cleanDomain, size });
        if (html && String(html).trim()) return html;
      }
      if (cleanDomain && window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateFaviconHTML === 'function') {
        const html = window.__pcFaviconHelper.generateFaviconHTML(cleanDomain, size);
        if (html && String(html).trim()) return html;
      }
      if (typeof window.__pcAccountsIcon === 'function') {
        return window.__pcAccountsIcon(size);
      }
      return `<div style="width:${size}px;height:${size}px;border-radius:6px;background:var(--bg-item,#2f343a);"></div>`;
    };

    if (type === 'person' || type === 'prospectPeople') {
      const fullName = safe(item.title);
      const initials = (() => {
        const parts = fullName.split(/\s+/).filter(Boolean);
        if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        if (parts.length === 1) return parts[0][0].toUpperCase();
        const email = safe(data.email || '').trim();
        return email ? (email[0] || '').toUpperCase() : '?';
      })();
      initialsHTML = escapeHtml(initials || '?');

      const domain =
        data.companyDomain ||
        data.domain ||
        getDomainFrom(data.companyWebsite || data.website || '') ||
        getDomainFrom(data.email || '');
      const logoUrl = data.logoUrl || data.logoURL || '';
      iconHTML = buildFavicon(logoUrl, domain, 32);
    } else if (type === 'account' || type === 'prospectAccounts') {
      const domain = data.domain || data.website || data.site || data.primary_domain || '';
      const logoUrl = data.logoUrl || data.logoURL || '';
      iconHTML = buildFavicon(logoUrl, domain, 32);
    } else if (type === 'deal') {
      const domain = data.accountDomain || data.domain || data.companyDomain || '';
      const logoUrl = data.logoUrl || data.logoURL || '';
      iconHTML = buildFavicon(logoUrl, domain, 32);
    } else if (type === 'sequence') {
      iconHTML = `<div style="width:32px;height:32px;border-radius:6px;background:var(--grey-700,#3a3f45);display:flex;align-items:center;justify-content:center;">${getCloneIcon()}</div>`;
    } else {
      iconHTML = `<div style="width:32px;height:32px;border-radius:6px;background:var(--grey-700,#3a3f45);"></div>`;
    }

    return { iconHTML, initialsHTML };
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
      case 'prospectAccounts':
        // For prospect accounts, import into CRM then navigate to detail page
        {
          const item = findItemById(id, type);
          if (item && item.data) {
            if (window.Widgets && typeof window.Widgets.addAccountToCRM === 'function') {
              // Show a specific toast for the auto-import
              window.crm?.showToast && window.crm.showToast(`Importing ${item.title} to CRM...`);
              
              // Parse location into city/state if needed
              let city = item.data.city || '';
              let state = item.data.state || '';
              if (!city && !state && item.data.location) {
                const parts = item.data.location.split(',').map(s => s.trim());
                if (parts.length > 0) city = parts[0];
                if (parts.length > 1) state = parts[1];
              }

              const accountData = {
                companyName: item.data.name || item.title,
                companyDomain: item.data.domain || '',
                companyPhone: item.data.phone || item.data.companyPhone || '',
                city: city,
                state: state,
                ...item.data
              };
              window.Widgets.addAccountToCRM(accountData).then(newId => {
                if (newId) {
                  // Navigate to account detail
                  if (window.crm && typeof window.crm.navigateToPage === 'function') {
                    window.crm.navigateToPage('account-details');
                    // Wait for module to load then show account
                    const check = () => {
                      if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
                        window.AccountDetail.show(newId);
                      } else {
                        setTimeout(check, 50);
                      }
                    };
                    check();
                  } else {
                    window.location.hash = `#account-detail?id=${newId}`;
                  }
                } else {
                  // Fallback if import failed
                  window.location.hash = '#prospecting';
                }
              });
            } else {
              // Fallback to prospecting page if widget not available
              const query = item ? item.title : '';
              if (query) setSearchPrefill('prospecting', query);
              window.location.hash = '#prospecting';
            }
          } else {
            // Fallback if no data found
            window.location.hash = '#prospecting';
          }
        }
        break;
      case 'prospectPeople':
        // For prospect people, still navigate to prospecting page
        {
          const item = findItemById(id, type);
          const query = item ? item.title : '';
          if (query) setSearchPrefill('prospecting', query);
          window.location.hash = '#prospecting';
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

  function getArrowRightIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h12"></path>
        <path d="M13 6l6 6-6 6"></path>
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

  function getSaveIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
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
