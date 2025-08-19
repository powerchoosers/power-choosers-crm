'use strict';

// Global Search Module - Handles the top search bar functionality
(function () {
  let searchTimeout;
  let pendingResultsTimeout;
  let loadingStartAt = 0;
  const SEARCH_DELAY = 300; // ms delay for debouncing
  const MIN_LOADING_MS = 200; // ensure spinner is visible briefly

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

      // Remove extra padding/margins for compact results
      elements.searchResults.style.padding = '0';
      elements.searchResults.style.margin = '0';
      elements.searchResults.style.width = '100%';
      elements.searchResults.innerHTML = renderResults(results);
      bindResultActions();
      if (elements.searchModal) elements.searchModal.classList.remove('is-loading');
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
    try {
      console.log('Performing search for:', query);
      const results = await searchAllData(query);
      console.log('Search results:', results);
      showResults(results);
    } catch (error) {
      console.error('Search error:', error);
      elements.searchEmpty.hidden = false;
      elements.searchLoading.hidden = true;
    }
  }

  async function searchAllData(query) {
    const results = {};
    const normalizedQuery = query.toLowerCase();

    // Search People
    const peopleResults = await searchPeople(normalizedQuery);
    if (peopleResults.length > 0) {
      results.people = peopleResults;
    }

    // Search Accounts
    const accountResults = await searchAccounts(normalizedQuery);
    if (accountResults.length > 0) {
      results.accounts = accountResults;
    }

    // Search Sequences
    const sequenceResults = await searchSequences(normalizedQuery);
    if (sequenceResults.length > 0) {
      results.sequences = sequenceResults;
    }

    // Search Deals
    const dealResults = await searchDeals(normalizedQuery);
    if (dealResults.length > 0) {
      results.deals = dealResults;
    }

    return results;
  }

  async function searchPeople(query) {
    if (!window.firebaseDB) {
      console.log('Firebase DB not available');
      return [];
    }

    try {
      console.log('Searching people with query:', query);
      const snapshot = await window.firebaseDB.collection('contacts').get();
      const results = [];
      console.log('People collection size:', snapshot.size);

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

        // Debug logging for each person
        console.log('[SEARCH DEBUG] Query:', query, '| Person:', person);
        console.log('[SEARCH DEBUG] Searchable text:', searchableText);
        if (person.fullName) {
          console.log('[SEARCH DEBUG] fullName split:', person.fullName.toLowerCase().split(' '));
        }

        // Also allow searching by fullName split into first/last
        let match = false;
        if (searchableText.includes(query)) {
          match = true;
          console.log('[SEARCH DEBUG] Direct match found.');
        } else if (person.fullName) {
          const parts = person.fullName.toLowerCase().split(' ');
          if (parts.some(p => p && query.includes(p))) {
            match = true;
            console.log('[SEARCH DEBUG] Partial name part match found.');
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

      console.log('People search results:', results);
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
      console.log('Searching accounts with query:', query);
      const snapshot = await window.firebaseDB.collection('accounts').get();
      const results = [];
      console.log('Accounts collection size:', snapshot.size);

      snapshot.forEach(doc => {
        const account = { id: doc.id, ...doc.data() };
        console.log('Account data:', account);
        
        // Handle special search cases
        const isYearSearch = /^\d{4}$/.test(query);
        const isUsageSearch = /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(query);
        
        let matches = false;

        if (isYearSearch) {
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

          console.log('Account searchable text:', searchableText);
          matches = searchableText.includes(query);
        }

        if (matches) {
          console.log('Match found for account:', account);
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

      console.log('Accounts search results:', results);
      return results.slice(0, 5);
    } catch (error) {
      console.error('Error searching accounts:', error);
      return [];
    }
  }

  async function searchSequences(query) {
    if (!window.firebaseDB) return [];

    try {
      const snapshot = await window.firebaseDB.collection('sequences').get();
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
      <div class="search-result-item" data-id="${item.id}" data-type="${item.type}">
        <div class="result-main">
          <div class="result-title">${escapeHtml(item.title)}</div>
          <div class="result-subtitle">${escapeHtml(item.subtitle)}</div>
        </div>
        <div class="result-actions">
          ${actions.map(action => `
            <button class="result-action-btn" data-action="${action.key}" data-id="${item.id}" data-type="${item.type}">
              ${action.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function getActionsForType(type) {
    const actions = {
      person: [
        { key: 'view', label: 'View' },
        { key: 'email', label: 'Email' },
        { key: 'call', label: 'Call' }
      ],
      account: [
        { key: 'view', label: 'View' },
        { key: 'add-contact', label: 'Add Contact' },
        { key: 'create-deal', label: 'Create Deal' }
      ],
      sequence: [
        { key: 'view', label: 'View' },
        { key: 'edit', label: 'Edit' },
        { key: 'clone', label: 'Clone' }
      ],
      deal: [
        { key: 'view', label: 'View' },
        { key: 'edit', label: 'Edit' },
        { key: 'move-stage', label: 'Move Stage' }
      ]
    };

    return actions[type] || [{ key: 'view', label: 'View' }];
  }

  function bindResultActions() {
    const actionButtons = elements.searchResults.querySelectorAll('.result-action-btn');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', handleActionClick);
    });

    const resultItems = elements.searchResults.querySelectorAll('.search-result-item');
    resultItems.forEach(item => {
      item.addEventListener('click', handleResultClick);
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
          // Navigate to emails page and compose to this person
          window.showToast && window.showToast('Opening email composer...', 'info');
          navigateToPage('emails');
        }
        break;
      case 'call':
        if (type === 'person') {
          // Navigate to calls page and log call for this person
          window.showToast && window.showToast('Opening call logger...', 'info');
          navigateToPage('calls');
        }
        break;
      case 'add-contact':
        if (type === 'account') {
          // Navigate to people page and add contact for this account
          window.showToast && window.showToast('Opening add contact form...', 'info');
          navigateToPage('people');
        }
        break;
      case 'create-deal':
        if (type === 'account') {
          // Navigate to deals page and create deal for this account
          window.showToast && window.showToast('Opening deal creator...', 'info');
          navigateToPage('deals');
        }
        break;
      case 'edit':
        navigateToItem(type, id);
        break;
      case 'clone':
        if (type === 'sequence') {
          window.showToast && window.showToast('Cloning sequence...', 'info');
          navigateToPage('sequences');
        }
        break;
      case 'move-stage':
        if (type === 'deal') {
          window.showToast && window.showToast('Opening deal stage editor...', 'info');
          navigateToPage('deals');
        }
        break;
      default:
        navigateToItem(type, id);
    }
  }

  function navigateToItem(type, id) {
    const pageMap = {
      person: 'people',
      account: 'accounts',
      sequence: 'sequences',
      deal: 'deals'
    };

    const page = pageMap[type];
    if (page) {
      navigateToPage(page);
      // Store the ID for the page to potentially highlight or focus on
      sessionStorage.setItem('highlightItem', id);
    }
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
