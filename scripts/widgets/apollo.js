(function () {
  'use strict';

  // Lusha API Widget for Contact Detail and Account Detail
  // Exposes: window.Widgets.openLusha(contactId), window.Widgets.openLushaForAccount(accountId)
  if (!window.Widgets) window.Widgets = {};

  const WIDGET_ID = 'lusha-widget';
  let currentContactId = null;
  let currentAccountId = null;
  let currentEntityType = 'contact'; // 'contact' or 'account'
  let currentAccountName = null;
  let lastCompanyResult = null;
  
  // Pagination state
  let allContacts = []; // Store all contacts for pagination
  let currentPage = 1;
  const contactsPerPage = 5;

  function getPanelContentEl() {
    const panel = document.getElementById('widget-panel');
    if (!panel) return null;
    const content = panel.querySelector('.widget-content');
    return content || panel;
  }

  function removeExistingWidget() {
    const existing = document.getElementById(WIDGET_ID);
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
  }

  function closeLushaWidget() {
    const card = document.getElementById(WIDGET_ID);
    if (!card) return;
    
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduce) {
      if (card.parentElement) card.parentElement.removeChild(card);
      return;
    }
    
    // Prepare collapse animation from current height and paddings
    const cs = window.getComputedStyle(card);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const start = card.scrollHeight; // includes padding
    card.style.overflow = 'hidden';
    card.style.height = start + 'px';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    
    // Force reflow
    void card.offsetHeight;
    card.style.transition = 'height 360ms ease-out, opacity 360ms ease-out, transform 360ms ease-out, padding-top 360ms ease-out, padding-bottom 360ms ease-out';
    card.style.height = '0px';
    card.style.paddingTop = '0px';
    card.style.paddingBottom = '0px';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-6px)';
    
    const pending = new Set(['height', 'padding-top', 'padding-bottom']);
    const onEnd = (e) => {
      if (!e) return;
      if (pending.has(e.propertyName)) pending.delete(e.propertyName);
      if (pending.size > 0) return;
      card.removeEventListener('transitionend', onEnd);
      if (card.parentElement) card.parentElement.removeChild(card);
    };
    card.addEventListener('transitionend', onEnd);
  }

  function makeCard(entityId, entityType = 'contact') {
    const card = document.createElement('div');
    card.id = WIDGET_ID;
    card.className = 'widget-card lusha-card';
    
    // Store current entity info for later use
    currentEntityType = entityType;
    currentContactId = entityId;
    if (entityType === 'account') {
      currentAccountId = entityId;
    }
    // CRITICAL: Clear lastCompanyResult when opening for a new company to prevent stale data
    // Only preserve if we're reopening the same company (check by entityId)
    const previousEntityId = window.__lushaLastEntityId;
    const previousEntityType = window.__lushaLastEntityType;
    if (previousEntityId !== entityId || previousEntityType !== entityType) {
      lastCompanyResult = null;
      window.__lushaLastRequestId = null;
      window.__lushaOpenedFromCache = false;
      // Clear the company panel to force fresh render
      const companyPanel = document.getElementById('lusha-panel-company');
      if (companyPanel) {
        companyPanel.innerHTML = '';
        companyPanel.removeAttribute('data-content-hash');
      }
      lushaLog('Cleared lastCompanyResult for new entity:', { entityId, entityType, previousEntityId, previousEntityType });
    }
    window.__lushaLastEntityId = entityId;
    window.__lushaLastEntityType = entityType;
    
    // Get account name for search
    let accountName = '';
    if (entityType === 'contact') {
      // Try to get account name from contact data
      try {
        if (window.ContactDetail && window.ContactDetail.state && window.ContactDetail.state.currentContact) {
          const contact = window.ContactDetail.state.currentContact;
          accountName = contact.companyName || contact.company || contact.account || '';
        }
        // Fallback: try to get from DOM
        if (!accountName) {
          const companyLink = document.querySelector('#contact-company-link');
          if (companyLink) {
            accountName = companyLink.textContent?.trim() || '';
          }
        }
      } catch (_) {}
    } else {
      // Try to get account name from account data
      try {
        if (window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
          const account = window.AccountDetail.state.currentAccount;
          accountName = account.name || account.accountName || '';
        }
        // Fallback: try to get from DOM (use page title, not contact name)
        if (!accountName) {
          const accountTitle = document.querySelector('#account-detail-header .page-title') ||
                               document.querySelector('.contact-page-title') ||
                               document.querySelector('#account-details-page .page-title');
          if (accountTitle) {
            accountName = accountTitle.textContent?.trim() || '';
          }
        }
      } catch (_) {}
    }
    
    currentAccountName = accountName;

    card.innerHTML = `
      <div class="widget-card-header">
        <h3 class="widget-title">Apollo</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="lusha-close" type="button" title="Close Apollo Search" aria-label="Close">×</button>
        </div>
      </div>
      
      <div class="lusha-body">
        <!-- Company Summary -->
        <div id="lusha-panel-company"></div>
        
        <!-- Loading indicator -->
        <div id="lusha-loading" style="display:none;">
        </div>

        <!-- Results Section -->
        <div class="lusha-results is-hidden" id="lusha-results" style="display: block;">
          <div class="lusha-results-header" style="opacity:0;transform:translateY(8px);">
            <h4>Search Results</h4>
            <div class="lusha-results-count" id="lusha-results-count">0 contacts found</div>
            <div class="lusha-pagination" id="lusha-pagination" style="display:flex; visibility: hidden;">
              <button class="lusha-pagination-arrow" id="lusha-prev-btn" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15,18 9,12 15,6"/>
                </svg>
              </button>
              <div class="lusha-pagination-current-container">
                <div class="lusha-pagination-current" id="lusha-pagination-current">1</div>
              </div>
              <button class="lusha-pagination-arrow" id="lusha-next-btn" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9,18 15,12 9,6"/>
                </svg>
              </button>
            </div>
          </div>
          
      <div class="lusha-contacts-list" id="lusha-contacts-list">
        <!-- Results will be populated here -->
      </div>
      <!-- Persistent footer so pagination re-renders don't remove the usage bar -->
      <div class="lusha-usage-footer" id="lusha-usage-footer"></div>
    </div>
  </div>
    `;

    // Smooth expand-in animation - slide down from top
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('lusha-anim'); } catch (_) {}
      // Start hidden and positioned above viewport
      card.style.opacity = '0';
      card.style.transform = 'translateY(-100%)';
      card.style.willChange = 'opacity, transform';
    }

    const content = getPanelContentEl();

    // Reserve space for the widget to prevent layout jumps
    if (!prefersReduce) {
        card.style.height = '0px';
        card.style.overflow = 'hidden';
    }
    
    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    // Reserve space for company summary to avoid container jumps while it loads/animates
    try {
      const compPanel = card.querySelector('#lusha-panel-company');
      if (compPanel) compPanel.style.minHeight = '80px';
    } catch(_) {}

    if (!prefersReduce) {
      // Slide down from top animation with height expansion
        requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const targetHeight = card.scrollHeight;
          card.style.transition = 'opacity 400ms ease, transform 400ms ease, height 400ms ease';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
          card.style.height = targetHeight + 'px';
          
          const onEnd = () => {
            try { 
              card.style.willChange = ''; 
            card.style.height = 'auto';
            card.style.overflow = 'visible';
            card.removeEventListener('transitionend', onEnd);
            } catch(_){} 
          };
          card.addEventListener('transitionend', onEnd);
        });
      });
    } else {
      // For reduced motion, just show immediately
      card.style.height = 'auto';
      card.style.overflow = 'visible';
    }

    // Bring panel into view without jumping during transition
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) {
        requestAnimationFrame(() => { try { panel.scrollTop = 0; } catch(_){} });
      }
    } catch (_) { /* noop */ }

    attachEventListeners();
    try { prefillInputs(entityType); } catch(_) {}

    // Don't render company panel initially - let it animate when search completes

    // Defer search until after the open animation settles to avoid jank
    // On open: if cached, use cache; if uncached, perform a small live search (1 credit) to get requestId and summary
    const scheduleSearch = () => { try { performLushaSearch({ openLiveIfUncached: true }); } catch(_){} };
    if (!prefersReduce) {
      let started = false;
      const onOpened = () => { if (started) return; started = true; try { card.removeEventListener('transitionend', onOpened); } catch(_){} scheduleSearch(); };
      try { card.addEventListener('transitionend', onOpened, { once: true }); } catch(_) {}
      // Safety fallback if transitionend doesn't fire
      setTimeout(() => { if (!started) scheduleSearch(); }, 360);
    } else {
      scheduleSearch();
    }

    // Always attempt to render the usage bar on open (throttled internally)
    try { renderUsageBar(); } catch(_) {}

    return card;
  }

  function attachEventListeners() {
    // Close button
    const closeBtn = document.getElementById(WIDGET_ID)?.querySelector('.lusha-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeLushaWidget);
    }

    // Search button (not rendered anymore, but keep for safety)
    const searchBtn = document.getElementById('lusha-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => performLushaSearch({ forceLive: false }));
    }

    // Reset button removed (combined into reveal/enrich flow)

    // Removed refresh button; live fetch happens via Reveal/Enrich when needed

    // Enter key on inputs
    const inputs = document.querySelectorAll('#lusha-widget .lusha-form-input');
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          performLushaSearch();
        }
      });
    });
    
    // Pagination buttons
    const prevBtn = document.getElementById('lusha-prev-btn');
    const nextBtn = document.getElementById('lusha-next-btn');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          displayCurrentPage();
        }
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(allContacts.length / contactsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          displayCurrentPage();
        }
      });
    }
  }

  async function performLushaSearch(options = {}) {
    lushaLog('Starting Lusha search with options:', options);
    
    // Reset pagination state
    allContacts = [];
    currentPage = 1;
    
    const loadingEl = document.getElementById('lusha-loading');
    const resultsWrap = document.getElementById('lusha-results');
    // On refresh, keep results visible; otherwise use normal hide/show
    if (loadingEl) {
      loadingEl.style.display = 'none'; // no spinner content
      try { if (!options.forceLive) { loadingEl.classList.remove('is-hidden'); loadingEl.classList.add('is-shown'); } } catch(_) {}
    }
    if (resultsWrap) {
      try {
        resultsWrap.style.display = 'block';
        if (!options.forceLive) {
          resultsWrap.classList.remove('is-shown');
          resultsWrap.classList.add('is-hidden');
        } else {
          // Ensure no transitions are applied during refresh
          resultsWrap.style.transition = 'none';
          resultsWrap.classList.add('is-shown');
          resultsWrap.classList.remove('is-hidden');
        }
      } catch(_) {}
    }

      // derive company + domain from page context (no input fields)
    const ctx = getContextDefaults(currentEntityType);
    let companyName = ctx.companyName;
    let domain = ctx.domain;
    lushaLog('Context derived:', { companyName, domain, entityType: currentEntityType, currentAccountId, currentContactId });
    console.log('[Apollo Widget] Search context:', { companyName, domain, entityType: currentEntityType, currentAccountId, currentContactId, lastCompanyResult: lastCompanyResult?.name });

    try {
      if (!companyName && !domain) {
        if (options.cachedOnly) {
          lushaLog('No company context found in cached-only mode; showing empty state');
          // Show empty results gracefully without hitting live endpoints
          try { renderCompanyPanel({ name: '', domain: '' }, false); } catch(_) {}
          updateResults([]);
          try { crossfadeToResults(); } catch(_) {}
          try { showCreditsUsed(0, 'cached'); } catch(_) {}
          try { renderUsageBar(); } catch(_) {}
          return;
        }
        throw new Error('No company context found');
      }

    // 1) Try cache first (unless forcing live) or when cachedOnly is requested
      if (!options.forceLive || options.cachedOnly || options.openLiveIfUncached) {
        lushaLog('Checking cache for:', { domain, companyName });
        const cached = await tryLoadCache({ domain, companyName });
        if (cached && cached.contacts && cached.contacts.length) {
          lushaLog('Using cached contacts (saving credits):', cached);
          window.__lushaOpenedFromCache = true;
          
          // Use complete cached company data
          lastCompanyResult = {
            name: cached.companyName || companyName || '',
            domain: cached.domain || domain,
            website: cached.website || '',
            // Include all cached company fields
            id: cached.companyId,
            logoUrl: cached.logoUrl,
            description: cached.description,
            industry: cached.industry,
            employees: cached.employees,
            revenue: cached.revenue,
            location: cached.location,
            city: cached.city,
            state: cached.state,
            country: cached.country,
            // phone intentionally omitted (Lusha company endpoint does not provide a reliable company phone)
            email: cached.email,
            linkedin: cached.linkedin,
            twitter: cached.twitter,
            facebook: cached.facebook,
            // Include full company object if available
            ...(cached.company || {})
          };
          
          // Rebuild name map from cached contacts to ensure names persist after browser refresh
          try {
            const nameMap = new Map();
            cached.contacts.forEach(c => {
              const id = c.contactId || c.id;
              const f = c.firstName || c.name?.first || '';
              const l = c.lastName || c.name?.last || '';
              const full = (c.name && (c.name.full || c.name)) || `${f} ${l}`.trim();
              if (id) nameMap.set(id, { f, l, full });
            });
            window.__lushaNameMap = nameMap;
            lushaLog('Name map restored from cache. size=', nameMap.size);
          } catch(_) {}
          
          renderCompanyPanel(lastCompanyResult, false); // Allow animation for cached results
          updateResults(cached.contacts);
          // Crossfade from loading to results
          try { crossfadeToResults(); } catch(_) {}
          
          // Show cache indicator in results
          showCreditsUsed(0, 'cached');
          return;

        } else if (options.cachedOnly) {
          // No cache found and cachedOnly requested → run a minimal, unbilled prospecting search (try small sizes)
          try {
            let base = (window.API_BASE_URL || '').replace(/\/$/, '');
            if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-south1.run.app';

            // Try both domain and name includes to improve match rate (still unbilled)
            const includeAttempts = [];
            if (domain) includeAttempts.push({ domains: [domain] });
            if (companyName) includeAttempts.push({ names: [companyName] });
            if (includeAttempts.length === 0) includeAttempts.push({});

            let best = null;
            const sizes = [10, 40];
            outer: for (const size of sizes) {
              for (const inc of includeAttempts) {
                const requestBody = { 
                  pages: { page: 0, size },
                  filters: { companies: { include: { ...inc } } }
                };
                const r = await fetch(`${base}/api/apollo/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
                if (!r.ok) continue;
                const data = await r.json();
                const contacts = Array.isArray(data.contacts) ? data.contacts : [];
                best = { data, contacts };
                // Prefer any contacts; otherwise keep the best with requestId
                if (contacts.length > 0 || data.requestId) break outer;
              }
            }

            const data = best ? best.data : { requestId: null };
            const contacts = best ? best.contacts : [];

            // Store requestId for reveals when present
            if (data && data.requestId) {
              window.__lushaLastRequestId = data.requestId;
              lushaLog('Stored requestId from minimal search:', data.requestId);
            }

            // Minimal company context (avoid company GET)
            lastCompanyResult = { name: companyName || '', domain: domain || '' };
            renderCompanyPanel(lastCompanyResult, false);
            updateResults(contacts);
            // Persist minimal results to lusha_cache immediately so reopen shows them
            try { await saveCache({ company: lastCompanyResult, contacts }); } catch(_) {}
            try { crossfadeToResults(); } catch(_) {}
            showCreditsUsed(0, 'cached');
            try { renderUsageBar(); } catch(_) {}
            return;
          } catch (minErr) {
            lushaLog('Minimal search failed in cached-only mode', minErr);
            // Fall through to error handling below
          }
        } else if (options.openLiveIfUncached) {
          // Open-time flow: only run live search if we don't have company data in cache
          let base = (window.API_BASE_URL || '').replace(/\/$/, '');
          if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-south1.run.app';

          // Check if we have company data in cache first
          let hasCompanyData = false;
          if (cached && cached.companyName) {
            hasCompanyData = true;
            lastCompanyResult = {
              name: cached.companyName,
              domain: cached.domain || domain,
              description: cached.description || '',
              employees: cached.employees || '',
              industry: cached.industry || '',
              city: cached.city || '',
              state: cached.state || '',
              country: cached.country || '',
              linkedin: cached.linkedin || '',
              logoUrl: cached.logoUrl || ''
            };
            try { renderCompanyPanel(lastCompanyResult, false); } catch(_) {}
          }

          // Only fetch company data if we don't have it in cache
          if (!hasCompanyData) {
          const params = new URLSearchParams();
          if (domain) params.append('domain', domain);
          if (companyName) params.append('company', companyName);
          const url = `${base}/api/apollo/company?${params.toString()}`;
          lushaLog('Open-live: fetching company summary from:', url);
          const resp = await fetch(url, { method: 'GET' });
          if (resp.ok) {
            const company = await resp.json();
            lastCompanyResult = company;
            try { requestAnimationFrame(() => renderCompanyPanel(company, false)); } catch(_) { renderCompanyPanel(company, false); }
            }
          }

          // Minimal contacts page (10 contacts = 1 page = 1 credit)
          const requestBody = {
            pages: { page: 0, size: 10 },
            filters: { companies: { include: {} } }
          };
          // Use company ID if available (most accurate for account-specific searches)
          if (lastCompanyResult && lastCompanyResult.id) {
            requestBody.filters.companies.include.ids = [lastCompanyResult.id];
          } else if (domain) {
            requestBody.filters.companies.include.domains = [domain];
          } else if (companyName) {
            requestBody.filters.companies.include.names = [companyName];
          }

          const r = await fetch(`${base}/api/apollo/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          const contacts = Array.isArray(data.contacts) ? data.contacts : [];
          if (data.requestId) {
            window.__lushaLastRequestId = data.requestId;
            lushaLog('Open-live stored requestId:', data.requestId);
          }

          // SMART FALLBACK: If company search returned minimal data (not found in Apollo), 
          // extract basic company info from first contact's organization (NO extra API call - saves 1 credit!)
          if (contacts.length > 0 && lastCompanyResult && lastCompanyResult._notFoundInApollo) {
            const firstContact = contacts[0];
            console.log('[Apollo Widget] Company not found by domain, using contact data (no extra credit charge)');
            lastCompanyResult = {
              id: firstContact.companyId || null,
              name: firstContact.companyName || companyName,
              domain: firstContact.fqdn || domain,
              website: firstContact.fqdn ? `https://${firstContact.fqdn}` : (domain ? `https://${domain}` : ''),
              description: '',
              employees: '',
              industry: '',
              city: firstContact.city || '',
              state: firstContact.state || '',
              country: firstContact.country || '',
              address: '',
              companyPhone: '',
              location: firstContact.location || '',
              linkedin: '',
              logoUrl: null,
              foundedYear: '',
              revenue: '',
              companyType: '',
              _fromContact: true
            };
            try { renderCompanyPanel(lastCompanyResult, false); } catch(_) {}
          }

          // Save to cache immediately for future free opens
          try { await saveCache({ company: lastCompanyResult || { name: companyName, domain }, contacts }); } catch(_) {}

          updateResults(contacts, true);
          try { crossfadeToResults(); } catch(_) {}
          // Credit usage: Company enrichment (1) + People search (1) = 2 credits
          // If company data was cached, only 1 credit for people search
          const creditsUsed = hasCompanyData ? 1 : 2;
          showCreditsUsed(creditsUsed, 'live');
          try { renderUsageBar(); } catch(_) {}
          return;
        } else {
          lushaLog('No cache found, proceeding with live search');
        }
      }

      // If cachedOnly and minimal search failed above, we'll continue to throw below
      if (options.cachedOnly) {
        throw new Error('cache_only_no_live');
      }

      // 2) Live company + contacts search (explicit user action)
      let base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-south1.run.app';

      const params = new URLSearchParams();
      if (domain) params.append('domain', domain);
      if (companyName) params.append('company', companyName);
      const url = `${base}/api/apollo/company?${params.toString()}`;
      lushaLog('Fetching company data from:', url);
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const company = await resp.json();
      lushaLog('Company data received:', company);
      lastCompanyResult = company;
      // For uncached live results, animate summary like cached to avoid jitter
      try {
        // Allow one frame for layout to settle before animating the company panel
        requestAnimationFrame(() => renderCompanyPanel(company, false));
      } catch(_) { renderCompanyPanel(company, false); }
      window.__lushaOpenedFromCache = false;

      // Pull all pages (search only, no enrichment)
      const collected = [];
      const pageSize = Math.max(10, options.pageSize || 10); // enforce minimum page size of 10
      let page = 0;
      let total = 0;
      do {
        const requestBody = {
          pages: { page, size: pageSize },
          filters: { companies: { include: {} } }
        };
        // Prioritize company ID for account-specific searches (most accurate)
        if (company.id) {
          requestBody.filters.companies.include.ids = [company.id];
          console.log('[Apollo Widget] Using company ID for contacts search:', company.id, 'Company name:', company.name);
        } else if (company.domain) {
          requestBody.filters.companies.include.domains = [company.domain];
          console.log('[Apollo Widget] Using company domain for contacts search:', company.domain);
        } else if (company.name) {
          requestBody.filters.companies.include.names = [company.name];
          console.log('[Apollo Widget] Using company name for contacts search:', company.name);
        } else {
          console.warn('[Apollo Widget] No company identifier available for contacts search!', company);
        }

        lushaLog('Fetching contacts page:', page, 'requestBody:', requestBody);
        console.log('[Apollo Widget] Contacts search request:', JSON.stringify(requestBody, null, 2));
        const r = await fetch(`${base}/api/apollo/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        lushaLog('Contacts API response:', data);
        const contacts = Array.isArray(data.contacts) ? data.contacts : [];
        lushaLog('Parsed contacts:', contacts);
        collected.push(...contacts);
        total = data.total || contacts.length;
        
        // Store requestId for reveal functionality (only on first page)
        if (page === 0 && data.requestId) {
          window.__lushaLastRequestId = data.requestId;
          lushaLog('Stored requestId for reveals:', data.requestId);
        }
        
        page += 1;
      } while (collected.length < total && page < (options.maxPages || 1)); // minimal pages by default

      lushaLog('Final collected contacts:', collected);
      
      // If this is a forced live refresh, merge with existing cached enriched data BEFORE rendering
      let contactsForUI = collected;
      if (options.forceLive) {
        try {
          contactsForUI = await mergeContactsWithExistingCache(lastCompanyResult, collected);
          lushaLog('Merged contacts with cache for UI (refresh):', contactsForUI);
        } catch(mergeErr) { lushaLog('Merge with cache failed', mergeErr); }
      }
      
      // Build/refresh name map so Unknown Name backfills correctly after refresh
      try {
        const nameMap = new Map();
        collected.forEach(c => {
          const id = c.contactId || c.id;
          const f = c.firstName || c.name?.first || '';
          const l = c.lastName || c.name?.last || '';
          const full = (c.name && (c.name.full || c.name)) || `${f} ${l}`.trim();
          if (id) nameMap.set(id, { f, l, full });
        });
        window.__lushaNameMap = nameMap;
        lushaLog('Name map refreshed for backfill. size=', nameMap.size);
      } catch(_) {}
      
      // Save to cache to avoid future credit usage (save merged set on refresh)
      if (contactsForUI.length > 0) {
        try {
          // Overwrite cache with merged contacts if refresh, else with collected
          await saveCache({ 
            company: lastCompanyResult, 
            contacts: contactsForUI 
          });
          lushaLog('Results saved to cache for future searches (refresh overwrite)');
        } catch (e) {
          lushaLog('Failed to save cache:', e);
        }
      }
      
      updateResults(contactsForUI, true); // Skip animations on refresh
      // Skip crossfade animation on refresh to avoid opacity transitions
      try {
        if (!options.forceLive) crossfadeToResults();
        else {
          const resultsEl = document.getElementById('lusha-results');
          const loadingEl = document.getElementById('lusha-loading');
          if (resultsEl) {
            resultsEl.style.transition = 'none';
            resultsEl.style.display = 'block';
            resultsEl.classList.remove('is-hidden');
            resultsEl.classList.add('is-shown');
          }
          if (loadingEl) {
            loadingEl.style.transition = 'none';
            loadingEl.style.display = 'none';
          }
        }
      } catch(_) {}
      
      // People search costs 1 credit per page (we fetch 1 page of 10 contacts)
      showCreditsUsed(1, 'live');
      try { renderUsageBar(); } catch(_) {}
    } catch (error) {
      lushaLog('Search error:', error);
      console.error('Lusha search error:', error);
      try { window.crm?.showToast && window.crm.showToast('Search failed: ' + error.message); } catch (_) {}
    } finally {
      // Ensure loading is hidden
      const loadingElement = document.getElementById('lusha-loading');
      if (loadingElement) {
        // If crossfade already hid it, do nothing; otherwise hide now
        if (!loadingElement.classList.contains('is-hidden')) loadingElement.style.display = 'none';
        lushaLog('Loading element hidden');
      }
      
      // Also hide any standalone spinner elements
      const spinnerElements = document.querySelectorAll('.lusha-spinner, .lusha-loading-text');
      spinnerElements.forEach(el => {
        if (el.parentElement && el.parentElement.id !== 'lusha-loading') {
          el.style.display = 'none';
        }
      });
    }
  }

  function deriveDomain(raw) {
    if (!raw) return '';
    try {
      let s = String(raw).trim();
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      const u = new URL(s);
      return (u.hostname || '').replace(/^www\./i, '');
    } catch (_) {
      return String(raw).replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
    }
  }

  function prefillInputs(entityType){
    // retained for compatibility; not used to populate inputs anymore
    const companyEl = null;
    const domainEl = null;
    const contactNameEl = null;
    const contactEmailEl = null;

    let companyName = '';
    let domain = '';
    let contactName = '';
    let contactEmail = '';

    if (entityType === 'account') {
      try {
        const a = window.AccountDetail?.state?.currentAccount || {};
        console.log('[Lusha] Account state:', a);
        
        // Enhanced fallback chain for account name
        const name = a.name || a.accountName || a.companyName || 
                    document.querySelector('#account-detail-header .page-title')?.textContent?.trim() || 
                    document.querySelector('#account-details-page .page-title')?.textContent?.trim() || 
                    document.querySelector('.contact-page-title')?.textContent?.trim() || '';
        
        // Enhanced fallback chain for domain/website
        let d = a.domain || a.website || a.site || a.companyWebsite || a.websiteUrl || '';
        
        // Try to get domain from website link in the page
        if (!d) {
          const websiteLink = document.querySelector('#account-detail-header [data-field="website"] a') ||
                              document.querySelector('#account-details-page [data-field="website"] a');
          if (websiteLink && websiteLink.href) {
            d = websiteLink.href;
          }
        }
        
        console.log('[Lusha] Account data:', { name, d, hasAccountDetail: !!window.AccountDetail });
        if (!companyName && name) companyName = name;
        if (!domain && d) domain = deriveDomain(d);
      } catch(e) {
        console.log('[Lusha] Account error:', e);
      }
    } else {
      try {
        const c = window.ContactDetail?.state?.currentContact || {};
        const linkedId = window.ContactDetail?.state?._linkedAccountId;
        
        // Get contact info
        contactName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || '';
        contactEmail = c.email || '';
        
        if (!companyName) companyName = c.companyName || c.company || c.account || '';
        if (linkedId && typeof window.getAccountsData === 'function') {
          const acc = (window.getAccountsData()||[]).find(x => (x.id||x.accountId||x._id) === linkedId);
          if (acc) {
            const d = acc.domain || acc.website || acc.site || '';
            if (d) domain = deriveDomain(d);
            if (!companyName) companyName = acc.name || acc.accountName || '';
          }
        }
        if (!domain) {
          const alt = c.companyWebsite || c.website || '';
          if (alt) domain = deriveDomain(alt);
        }
      } catch(_) {}
    }

    // Fallback by name match in accounts cache
    if (!domain && companyName && typeof window.getAccountsData === 'function') {
      try {
        const key = String(companyName).trim().toLowerCase();
        const hit = (window.getAccountsData()||[]).find(a => String(a.name||a.accountName||'').trim().toLowerCase() === key);
        if (hit) {
          const d = hit.domain || hit.website || hit.site || '';
          if (d) domain = deriveDomain(d);
        }
      } catch(_) {}
    }

    // No longer populating input fields (they were removed)

    try { console.log('[Lusha] Prefilled', { page: entityType, companyName, domain, contactName, contactEmail }); } catch(_) {}
  }

  async function loadEmployees(kind, company){
    try{
      let base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base || /localhost|127\.0\.0\.1/i.test(base)) {
        base = 'https://power-choosers-crm-792458658491.us-south1.run.app';
      }
      
      // Build request body with correct Lusha API structure (10 contacts = 1 credit)
      const requestBody = { 
        pages: { page: 0, size: 10 },
        filters: {
          companies: {
            include: {}
          }
        }
      };
      
      // Add company identifier - prioritize domain, then companyId, then companyName
      if (company?.domain) {
        requestBody.filters.companies.include.domains = [company.domain];
      } else if (company?.id) {
        requestBody.filters.companies.include.ids = [company.id];
      } else if (company?.name) {
        requestBody.filters.companies.include.names = [company.name];
      } else {
        console.warn('[Lusha] No company identifier available for search');
        return;
      }
      
      console.log('[Lusha] Contacts request body:', requestBody);
      const resp = await fetch(`${base}/api/apollo/contacts`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(requestBody) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      console.log('[Lusha] Raw contacts response:', data);
      const contacts = Array.isArray(data.contacts) ? data.contacts : [];
      const contactIdsFromPayload = Array.isArray(data.contactIds) ? data.contactIds.filter(Boolean) : [];
      console.log('[Lusha] Parsed contacts array:', contacts);

      // Do NOT auto-enrich to avoid consuming credits; keep requestId for per-contact reveals
      window.__lushaLastRequestId = data.requestId || null;
      window.__lushaLastContactIdSet = contactIdsFromPayload;

      // Build a quick name map from search results for backfill later
      const nameMap = new Map();
      contacts.forEach(c => {
        const id = c.contactId || c.id;
        const f = c.firstName || c.name?.first || '';
        const l = c.lastName || c.name?.last || '';
        const full = (c.name && (c.name.full || c.name)) || `${f} ${l}`.trim();
        nameMap.set(id, { f, l, full });
      });
      window.__lushaNameMap = nameMap;

      // Update results UI (search-only; emails/phones hidden until reveal)
      updateResults(contacts);
      // Hide spinner if visible
      const loadingEl = document.getElementById('lusha-loading');
      if (loadingEl) {
        loadingEl.style.display = 'none';
        lushaLog('Loading element hidden in loadEmployees');
      }

      // If popular returned none, try the full list as a fallback
      if (kind === 'popular' && contacts.length === 0) {
        console.log('[Lusha] Popular empty, loading all employees as fallback');
        await loadEmployees('all', company);
      }
    }catch(e){ console.error('Employees load failed', e); }
  }
  function formatCompanyPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    
    // Format as +1 (XXX) XXX-XXXX for US numbers
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    
    // For international, return as-is
    return phone;
  }

  function mapProspectingContact(c){
    const isEnriched = Array.isArray(c.emails) || Array.isArray(c.phones);
    
    // Parse Lusha's single "name" field into firstName and lastName
    let firstName = '';
    let lastName = '';
    if (c.name && typeof c.name === 'string') {
      const nameParts = c.name.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    } else {
      // Fallback to existing structure if available
      firstName = c.firstName || c.name?.first || '';
      lastName = c.lastName || c.name?.last || '';
    }
    // If only fullName provided, split it
    if ((!firstName && !lastName) && typeof c.fullName === 'string' && c.fullName.trim()) {
      const parts = c.fullName.trim().split(/\s+/);
      firstName = firstName || parts.shift() || '';
      lastName = lastName || parts.join(' ');
    }
    const fullName = (typeof c.fullName === 'string' && c.fullName.trim())
      ? c.fullName.trim()
      : `${firstName} ${lastName}`.trim();
    
    // Map Lusha phone flags to CRM phone fields
    const phoneMapping = {
      mobile: c.hasMobilePhone || false,
      workDirectPhone: c.hasDirectPhone || false,
      otherPhone: c.hasPhones || false
    };
    
    const mapped = {
      firstName: firstName,
      lastName: lastName,
      fullName: fullName,
      jobTitle: c.jobTitle || '',
      company: c.companyName || '',
      email: isEnriched && c.emails && c.emails.length > 0 ? c.emails[0].address : '',
      phone: isEnriched && c.phones && c.phones.length > 0 ? c.phones[0].number : '',
      fqdn: c.fqdn || '',
      companyId: c.companyId || null,
      id: c.id || c.contactId,
      hasEmails: isEnriched ? (c.emails && c.emails.length > 0) : !!c?.hasEmails,
      hasPhones: isEnriched ? (c.phones && c.phones.length > 0) : !!c?.hasPhones,
      // Add phone field mapping for CRM
      phoneMapping: phoneMapping,
      emails: c.emails || [],
      phones: c.phones || [],
      isSuccess: c.isSuccess !== false, // Default to true for search results
      // Carry through additional helpful fields
      location: c.location || c.city || '',
      linkedin: c.linkedin || c.linkedinUrl || (c.social && c.social.linkedin) || ''
    };
    
    lushaLog('Mapping contact:', { original: c, mapped: mapped });
    return mapped;
  }

  function renderCompanyPanel(company, skipAnimation = false){
    const el = document.getElementById('lusha-panel-company');
    if (!el) return;
    
    // Check if company summary already exists and is visible
    const existingSummary = el.querySelector('.company-summary');
    
    // Create content hash to detect if content has actually changed
    const name = escapeHtml(company?.name || '');
    const domainRaw = (company?.domain || company?.fqdn || '') || '';
    const domain = String(domainRaw).replace(/^www\./i,'');
    const linkedinUrl = company?.linkedin || '';
    const fullDescription = company?.description || '';
    const contentHash = `${name}|${domain}|${linkedinUrl}|${fullDescription}`;
    
    // Check if content is the same as what's already rendered
    const existingContentHash = el.getAttribute('data-content-hash');
    const contentUnchanged = existingContentHash === contentHash;
    
    // Avoid first-open flicker: by default animate unless explicitly skipped
    let shouldAnimate = !skipAnimation;
    // Determine source of current open
    const isFromCache = !!window.__lushaOpenedFromCache;
    // For uncached live searches, always allow animation (new data from API)
    const isUncachedLiveSearch = !window.__lushaOpenedFromCache && !skipAnimation;
    // On very first render, allow animation for both uncached-live and cached opens
    try { if (!window.__lushaCompanyRenderedOnce) { shouldAnimate = (isUncachedLiveSearch || isFromCache); } } catch(_) {}
    
    // If content is unchanged and summary already exists, and it's not an uncached live search, don't re-render
    // BUT: Always re-render if lastCompanyResult was cleared (new company search)
    const isNewCompany = !lastCompanyResult || (lastCompanyResult && lastCompanyResult.name !== name);
    if (contentUnchanged && existingSummary && !isUncachedLiveSearch && !isNewCompany) {
      return;
    }
    
    // For uncached live searches, always animate even if content is similar
    if (isUncachedLiveSearch) {
      shouldAnimate = true;
    }
    
    const website = domain ? `https://${domain}` : '';
    // In-widget policy: if Lusha provides a logoUrl, show it directly (do NOT route through global helper)
    const logo = (company && company.logoUrl)
      ? `<img src="${escapeHtml(company.logoUrl)}" alt="${name} logo" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">`
      : (domain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(domain, 36) : '') : '');
    
    // Create collapsible description
    let descHtml = '';
    if (fullDescription) {
      const lines = fullDescription.split('\n');
      const hasMoreThan5Lines = lines.length > 5;
      const previewLines = hasMoreThan5Lines ? lines.slice(0, 5) : lines;
      const remainingLines = hasMoreThan5Lines ? lines.slice(5) : [];
      
      descHtml = `
        <div class="company-desc-container">
          <div class="company-desc-preview">
            ${previewLines.map(line => escapeHtml(line)).join('<br>')}
            ${hasMoreThan5Lines ? '<br><span class="desc-ellipsis">...</span>' : ''}
          </div>
          ${hasMoreThan5Lines ? `
            <div class="company-desc-more" style="display:none;">
              ${remainingLines.map(line => escapeHtml(line)).join('<br>')}
            </div>
            <button class="lusha-desc-toggle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              Show more
            </button>
          ` : ''}
        </div>
      `;
    }

    // Style overrides for link behavior
    ensureLushaStyles();

    // Company-level actions
    const accBtn = `<button class="lusha-action-btn" id="lusha-add-account">Add Account</button>`;
    const enrBtn = `<button class="lusha-action-btn" id="lusha-enrich-account" style="display:none;">Enrich Account</button>`;

    // Ensure placeholder space remains during animation; cleared on animation end
    if (!el.style.minHeight) el.style.minHeight = '80px';

    el.innerHTML = `
      <div class="company-summary fade-in-block" style="padding:8px 0 10px 0;">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:6px;">
          <div>${logo || ''}</div>
          <div style="flex:1;min-width:0;">
            <div class="lusha-company-top">
              <div class="lusha-company-name">${name}</div>
              ${linkedinUrl ? `<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener" class="lusha-linkedin-link" title="Company LinkedIn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>` : ''}
            </div>
            <div class="lusha-company-meta">
              ${website ? `<a href="${website}" target="_blank" rel="noopener" class="lusha-weblink">${website}</a>` : ''}
              ${company.companyPhone ? `<div class="lusha-company-phone" style="margin-top:4px;color:var(--text-muted);font-size:14px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px;">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                </svg>
                <span class="clickable-phone" data-phone="${escapeHtml(company.companyPhone)}" data-company-name="${escapeHtml(company.name)}" data-account-id="${company.id || ''}" style="cursor:pointer;transition:opacity 0.2s ease;">${escapeHtml(formatCompanyPhone(company.companyPhone))}</span>
              </div>` : ''}
            </div>
          </div>
        </div>
        ${descHtml}
        <div style="margin-top:8px;display:flex;gap:8px;width:100%;">${accBtn}${enrBtn}
          <button class="lusha-action-btn" id="lusha-live-search-btn" style="margin-left:auto;">
            Search
          </button>
        </div>
      </div>`;

    // Animate in the company summary smoothly using slide-down (max-height) - only if it's new
    try {
      const wrap = el.querySelector('.company-summary.fade-in-block');
      if (wrap && shouldAnimate) {
        wrap.classList.add('animated');
        wrap.style.overflow = 'hidden';
        wrap.style.maxHeight = '0px';
        wrap.style.opacity = '0';
        requestAnimationFrame(() => {
          const target = wrap.scrollHeight;
          wrap.style.transition = 'max-height 500ms ease, opacity 400ms ease';
          wrap.style.maxHeight = target + 'px';
          wrap.style.opacity = '1';
          const onEnd = () => { try { wrap.style.maxHeight = 'none'; wrap.style.overflow = 'visible'; el.style.minHeight = ''; wrap.removeEventListener('transitionend', onEnd); } catch(_){} };
          wrap.addEventListener('transitionend', onEnd);
        });
      } else if (wrap && !shouldAnimate) {
        // If not animating, ensure it's visible immediately
        wrap.style.opacity = '1';
        wrap.style.maxHeight = 'none';
        wrap.style.overflow = 'visible';
        try { el.style.minHeight = ''; } catch(_) {}
      }
    } catch(_) {}

    // Hook up description toggle
    try {
      const toggleBtn = el.querySelector('.lusha-desc-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const preview = el.querySelector('.company-desc-preview');
          const more = el.querySelector('.company-desc-more');
          const ellipsis = el.querySelector('.desc-ellipsis');
          
          if (preview && more) {
            const isExpanded = more.style.display !== 'none';
            
            if (isExpanded) {
              // Collapse with animation
              const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              if (!prefersReduce) {
                // Show ellipsis immediately so layout doesn't jump at the end
                if (ellipsis) ellipsis.style.display = 'inline';
                toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>Show more`;
                
                more.style.overflow = 'hidden';
                more.style.maxHeight = more.scrollHeight + 'px';
                requestAnimationFrame(() => {
                  more.style.transition = 'max-height 300ms ease, opacity 200ms ease';
                  more.style.maxHeight = '0px';
                  more.style.opacity = '0';
                  setTimeout(() => {
                    more.style.display = 'none';
                    more.style.maxHeight = 'none';
                    more.style.opacity = '1';
                    more.style.overflow = 'visible';
                  }, 300);
                });
              } else {
                more.style.display = 'none';
                if (ellipsis) ellipsis.style.display = 'inline';
                toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>Show more`;
              }
            } else {
              // Expand with animation
              more.style.display = 'block';
              if (ellipsis) ellipsis.style.display = 'none';
              toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform:rotate(180deg)"><polyline points="6 9 12 15 18 9"></polyline></svg>Show less`;
              
              const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              if (!prefersReduce) {
                more.style.overflow = 'hidden';
                more.style.maxHeight = '0px';
                more.style.opacity = '0';
                requestAnimationFrame(() => {
                  more.style.transition = 'max-height 300ms ease, opacity 200ms ease';
                  more.style.maxHeight = more.scrollHeight + 'px';
                  more.style.opacity = '1';
                  setTimeout(() => {
                    more.style.maxHeight = 'none';
                    more.style.overflow = 'visible';
                  }, 300);
                });
              }
            }
          }
        });
      }
    } catch(_) {}

    // Store content hash to detect changes in future renders
    try { el.setAttribute('data-content-hash', contentHash); } catch(_) {}

    // Mark that we've rendered the company summary at least once (enables smooth animation on next renders)
    try { window.__lushaCompanyRenderedOnce = true; } catch(_) {}

    // Make company phone clickable
    try {
      const companyPhoneEl = el.querySelector('.clickable-phone');
      if (companyPhoneEl && window.ClickToCall) {
        window.ClickToCall.processSpecificPhoneElements();
      }
    } catch(_) {}

    // Hook up account Add/Enrich — avoid flicker on refresh by skipping async existence check
    try {
      const addBtn = document.getElementById('lusha-add-account');
      const enrichBtn = document.getElementById('lusha-enrich-account');
      const liveBtn = document.getElementById('lusha-live-search-btn');
      if (skipAnimation) {
        // On refresh, prioritize Enrich; keep it visible and hide Add to avoid flicker
        if (enrichBtn) enrichBtn.style.display = '';
        if (addBtn) addBtn.style.display = 'none';
        if (addBtn) addBtn.onclick = () => addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain });
        if (enrichBtn) enrichBtn.onclick = async () => { try { await addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain }); } catch(_){} };
      } else {
      const db = window.firebaseDB;
      if (db) {
        const domainKey = (company && company.domain) || '';
        const nameKey = (company && company.name) || '';
        (async () => {
          let exists = false;
          try {
            if (domainKey) {
              const s1 = await db.collection('accounts').where('domain','==',domainKey).limit(1).get();
              exists = !!(s1 && s1.docs && s1.docs[0]);
            }
            if (!exists && nameKey) {
              const s2 = await db.collection('accounts').where('accountName','==',nameKey).limit(1).get();
              exists = !!(s2 && s2.docs && s2.docs[0]);
            }
          } catch(_){ }
          if (addBtn && enrichBtn) {
            // If we're on the account details page, always show "Enrich Account" since we're viewing an existing account
            const isOnAccountDetailsPage = window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount;
            
            if (isOnAccountDetailsPage) {
              addBtn.style.display = 'none';
              enrichBtn.style.display = '';
              enrichBtn.textContent = 'Enrich Account';
            } else {
            addBtn.style.display = exists ? 'none' : '';
            enrichBtn.style.display = exists ? '' : 'none';
            }
            
            addBtn.onclick = () => addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain });
              enrichBtn.onclick = async () => { try { await addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain }); } catch(_){} };
          }
          if (liveBtn) {
            // Use a minimum page size of 10 to satisfy Lusha API constraints
            liveBtn.onclick = () => performLushaSearch({ forceLive: true, pageSize: 10, maxPages: 1 });
          }
        })();
      }
      }
    } catch(_){ }
  }

  function displayLushaResults(data) {
    const resultsEl = document.getElementById('lusha-results');
    const countEl = document.getElementById('lusha-results-count');
    const listEl = document.getElementById('lusha-contacts-list');

    if (!resultsEl || !countEl || !listEl) return;

    const contacts = data.contacts || [];
    const count = contacts.length;

    // Update count
    countEl.textContent = `${count} contact${count !== 1 ? 's' : ''} found`;

    // Clear previous results
    listEl.innerHTML = '';

    if (count === 0) {
      listEl.innerHTML = `
        <div class="lusha-no-results">
          <p>No contacts found for this search.</p>
          <p>Try adjusting your search criteria.</p>
        </div>
      `;
    } else {
      // Display contacts
      contacts.forEach((contact, index) => {
        const contactEl = createContactElement(contact, index);
        listEl.appendChild(contactEl);
      });
    }

    // Show results
    resultsEl.style.display = 'block';
  }

  function createContactElement(contact, index) {
    const div = document.createElement('div');
    div.className = 'lusha-contact-item';
    div.setAttribute('data-id', contact.id || contact.contactId || '');
    
    let name = contact.firstName && contact.lastName 
      ? `${contact.firstName} ${contact.lastName}` 
      : contact.fullName || '';
    
    const title = contact.title || contact.jobTitle || 'No title';
    // Try fullName first
    if (!name || name === 'Unknown Name') {
      const fm = (contact.fullName || '').trim();
      if (fm) name = fm;
    }
    // Backfill from nameMap if still missing
    if ((!contact.firstName && !contact.lastName) && window.__lushaNameMap && (contact.id || contact.contactId) && window.__lushaNameMap.has(contact.id || contact.contactId)) {
      const nm = window.__lushaNameMap.get(contact.id || contact.contactId);
      contact.firstName = contact.firstName || nm.f || '';
      contact.lastName = contact.lastName || nm.l || '';
      if (!name) {
        const rebuilt = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
        if (rebuilt) name = rebuilt;
      }
    }
    if (!name) name = 'Unknown Name';

    const emailsArr = Array.isArray(contact.emails) ? contact.emails.map(e => e.address).filter(Boolean) : [];
    const phonesArr = Array.isArray(contact.phones) ? contact.phones.map(p => p.number).filter(Boolean) : [];
    // Format location as City, State if possible
    let location = contact.location || contact.city || '';

    const emailList = emailsArr.length ? emailsArr : (contact.email ? [contact.email] : []);
    const phoneList = phonesArr.length ? phonesArr : (contact.phone ? [contact.phone] : []);

    const renderList = (arr, attr) => {
      if (arr && arr.length > 0) {
        return arr.map(v => {
          let content;
          if (attr === 'email') {
            content = formatEmailLink(v);
          } else if (attr === 'phone number') {
            content = formatPhoneLink(v);
          } else {
            content = escapeHtml(v);
          }
          return `<div class="lusha-value-item">${content}</div>`;
        }).join('');
      } else {
        // Show placeholder for unrevealed data
        return `<div class="lusha-placeholder">—</div>`;
      }
    };

    // Get LinkedIn URL for the contact
    const linkedinUrl = contact.linkedin || contact.linkedinUrl || '';

    const hasAnyEmails = Array.isArray(contact.emails) && contact.emails.length > 0;
    const hasAnyPhones = Array.isArray(contact.phones) && contact.phones.length > 0;

    div.innerHTML = `
      <div class="lusha-contact-header">
        <div class="lusha-contact-info">
          <div class="lusha-contact-name">${escapeHtml(name)}</div>
          <div class="lusha-contact-title">${escapeHtml(title)}</div>
        </div>
        <div class="lusha-contact-actions-header">
          ${linkedinUrl ? `<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener" class="lusha-linkedin-link" title="View LinkedIn Profile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>` : ''}
        </div>
      </div>
      <div class="lusha-contact-details">
        <div class="lusha-fields">
          <div class="lusha-field">
            <div class="lusha-field-header">
              <div class="lusha-label">Email</div>
              <button class="lusha-mini-btn" data-reveal="email">${hasAnyEmails ? 'Enrich' : 'Reveal'}</button>
            </div>
            <div class="lusha-field-body" data-email-list>
              ${renderList(emailList, 'email')}
            </div>
          </div>
          <div class="lusha-field">
            <div class="lusha-field-header">
              <div class=\"lusha-label\">Phone</div>
              <button class="lusha-mini-btn" data-reveal="phones">${hasAnyPhones ? 'Enrich' : 'Reveal'}</button>
            </div>
            <div class="lusha-field-body" data-phones-list>
              ${renderList(phoneList, 'phone number')}
            </div>
          </div>
          ${location ? `<div class=\"lusha-field\"><div class=\"lusha-field-header\"><div class=\"lusha-label\">Location</div></div><div class=\"lusha-field-body\">${escapeHtml(location)}</div></div>` : ''}
        </div>
      </div>
      <div class="lusha-contact-actions">
        <button class="lusha-action-btn" data-action="add-contact" data-contact='${escapeHtml(JSON.stringify(contact))}'>
          Add Contact
        </button>
        <button class="lusha-action-btn" data-action="enrich-contact" data-contact='${escapeHtml(JSON.stringify(contact))}' style="display:none;">
          Enrich Contact
        </button>
        <button class="lusha-action-btn" data-action="copy-info" data-contact='${escapeHtml(JSON.stringify(contact))}'>
          Copy Info
        </button>
        ${contact.linkedin ? `<a href="${escapeHtml(contact.linkedin)}" target="_blank" rel="noopener" class="lusha-linkedin-link" title="View LinkedIn Profile" style="margin-left:4px;display:inline-flex;align-items:center;">
          <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\">
            <path d=\"M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z\"/>
          </svg>
        </a>` : ''}
      </div>
    `;

    // Add event listeners for action buttons
    const addContactBtn = div.querySelector('[data-action="add-contact"]');
    const enrichContactBtn = div.querySelector('[data-action="enrich-contact"]');
    const copyBtn = div.querySelector('[data-action="copy-info"]');
    const revealEmailBtn = div.querySelector('[data-reveal="email"]');
    const revealPhonesBtn = div.querySelector('[data-reveal="phones"]');

    if (addContactBtn) {
      addContactBtn.addEventListener('click', () => addContactToCRM(contact));
    }
    if (enrichContactBtn) {
      enrichContactBtn.addEventListener('click', () => enrichExistingContact(contact));
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyContactInfo(contact));
    }
    if (revealEmailBtn) {
      revealEmailBtn.addEventListener('click', () => { revealForContact(contact, 'email', div).then(() => { try { renderUsageBar(); } catch(_) {} }); });
    }
    if (revealPhonesBtn) {
      revealPhonesBtn.addEventListener('click', () => { revealForContact(contact, 'phones', div).then(() => { try { renderUsageBar(); } catch(_) {} }); });
    }

    // Update button labels and show Enrich if exists
    updateActionButtons(div, contact).catch(()=>{});

    return div;
  }

  async function addContactToCRM(contact) {
    try {
      const db = window.firebaseDB;
      if (!db) throw new Error('Firestore not initialized');
      
      // Check if contact exists (by email)
      const email = contact.email || (Array.isArray(contact.emails) && contact.emails[0] && contact.emails[0].address) || '';
      const companyName = contact.company || contact.companyName || '';
      let existingId = null;
      if (email) {
        try {
          const snap = await db.collection('contacts').where('email','==',email).limit(1).get();
          if (snap && snap.docs && snap.docs[0]) existingId = snap.docs[0].id;
        } catch(_){}
      }
      
      // Get current account information for linking
      let accountId = null;
      let accountName = '';
      
      if (currentEntityType === 'account' && currentAccountId) {
        accountId = currentAccountId;
        // Get account name from current account state
        try {
          if (window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
            accountName = window.AccountDetail.state.currentAccount.name || window.AccountDetail.state.currentAccount.accountName || '';
          }
        } catch(_) {}
      } else if (currentEntityType === 'contact') {
        // Try to get account from contact context
        try {
          if (window.ContactDetail && window.ContactDetail.state && window.ContactDetail.state._linkedAccountId) {
            accountId = window.ContactDetail.state._linkedAccountId;
            // Get account name from accounts data
            if (typeof window.getAccountsData === 'function') {
              const accounts = window.getAccountsData() || [];
              const account = accounts.find(a => (a.id || a.accountId || a._id) === accountId);
              if (account) {
                accountName = account.name || account.accountName || '';
              }
            }
          }
        } catch(_) {}
      }
      
      // Prepare payload
      const payload = {
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        name: (contact.firstName && contact.lastName) ? `${contact.firstName} ${contact.lastName}`.trim() : (contact.fullName || ''),
        email,
        phone: contact.phone || contact.phoneNumber || (Array.isArray(contact.phones) && contact.phones[0] && contact.phones[0].number) || '',
        companyName: accountName || companyName, // Use account name if available
        title: contact.title || contact.jobTitle || '',
        location: contact.location || contact.city || '',
        city: contact.city || '',
        state: contact.state || '',
        industry: contact.industry || '',
        seniority: contact.seniority || '',
        // Department/functional area (best-effort mapping)
        department: contact.department || contact.departmentName || '',
        linkedin: contact.linkedin || contact.linkedinUrl || '',
        // map phone numbers to workDirectPhone/mobile/otherPhone
        workDirectPhone: selectPhone(contact, 'direct') || selectPhone(contact, 'work') || '',
        mobile: selectPhone(contact, 'mobile') || '',
        otherPhone: selectPhone(contact, 'other') || '',
        // Link to current account
        accountId: accountId,
        accountName: accountName,
        source: 'lusha',
        updatedAt: new Date(),
        createdAt: new Date()
      };
      
      // Save to CRM contacts collection
      if (existingId) {
        await window.PCSaves.updateContact(existingId, payload);
        window.crm?.showToast && window.crm.showToast('Enriched existing contact');
      } else {
        const ref = await db.collection('contacts').add(payload);
        window.crm?.showToast && window.crm.showToast('Contact added to CRM');
        // Emit create event for People page to prepend
        try { document.dispatchEvent(new CustomEvent('pc:contact-created', { detail: { id: ref.id, doc: payload } })); } catch(_){}
      }
      
      // SIMULTANEOUSLY save to Lusha cache to reduce future API usage
      try {
        await upsertCacheContact({ company: lastCompanyResult }, contact);
        console.log('[Lusha] Contact saved to both CRM and cache');
      } catch (cacheError) {
        console.warn('[Lusha] Failed to save to cache (CRM save succeeded):', cacheError);
      }
      
    } catch (error) {
      console.error('Error adding contact:', error);
      try { window.crm?.showToast && window.crm.showToast('Failed to add/enrich contact: ' + error.message); } catch (_) {}
    }
  }

  async function addAccountToCRM(contact){
    try {
      const db = window.firebaseDB;
      if (!db) throw new Error('Firestore not initialized');
      const domain = contact.fqdn || (contact.companyDomain) || (lastCompanyResult && lastCompanyResult.domain) || '';
      const companyName = contact.company || contact.companyName || (lastCompanyResult && (lastCompanyResult.name || lastCompanyResult.companyName)) || '';
      // Use current page context instead of searching by domain/name
      let existingId = null;
      
      // Try to get current account ID from page context
      if (currentEntityType === 'account' && currentAccountId) {
        existingId = currentAccountId;
        console.log('[Lusha Account] Using current account ID from page context:', existingId);
      }
      
      // Fallback: try to get from AccountDetail state
      if (!existingId && window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
        existingId = window.AccountDetail.state.currentAccount.id || window.AccountDetail.state.currentAccount.accountId;
        console.log('[Lusha Account] Using account ID from AccountDetail state:', existingId);
      }
      
      // Final fallback: search by domain/name (for cases where we're not on a specific account page)
      if (!existingId) {
        try {
          if (domain) {
            const s1 = await db.collection('accounts').where('domain','==',domain).limit(1).get();
            if (s1 && s1.docs && s1.docs[0]) existingId = s1.docs[0].id;
          }
          if (!existingId && companyName) {
            const s2 = await db.collection('accounts').where('accountName','==',companyName).limit(1).get();
            if (s2 && s2.docs && s2.docs[0]) existingId = s2.docs[0].id;
          }
        } catch(_){}
      }
      // Build payload by including ONLY non-empty values from Apollo/Lusha to avoid overwriting
      // existing CRM fields with blanks (we only set fields when API actually provides data)
      const mainAddress = (lastCompanyResult && lastCompanyResult.address) ? String(lastCompanyResult.address) : '';
      const candidateFields = {
        accountName: companyName,
        name: companyName,
        domain: domain || (lastCompanyResult && lastCompanyResult.domain) || '',
        website: (lastCompanyResult && lastCompanyResult.website) || (domain ? `https://${domain}` : ''),
        industry: (lastCompanyResult && lastCompanyResult.industry) || '',
        employees: (lastCompanyResult && lastCompanyResult.employees) || '',
        shortDescription: (lastCompanyResult && lastCompanyResult.description) || '',
        logoUrl: (lastCompanyResult && lastCompanyResult.logoUrl) ? String(lastCompanyResult.logoUrl) : '',
        linkedin: (lastCompanyResult && lastCompanyResult.linkedin) ? String(lastCompanyResult.linkedin) : '',
        city: (lastCompanyResult && lastCompanyResult.city) ? String(lastCompanyResult.city) : '',
        state: (lastCompanyResult && lastCompanyResult.state) ? String(lastCompanyResult.state) : '',
        country: (lastCompanyResult && lastCompanyResult.country) ? String(lastCompanyResult.country) : '',
        // Store a single-line primary address and also map into serviceAddresses for account detail
        address: mainAddress,
        // Company phone from Apollo → companyPhone field in CRM (only when provided)
        companyPhone: (lastCompanyResult && lastCompanyResult.companyPhone) ? String(lastCompanyResult.companyPhone) : '',
        foundedYear: (lastCompanyResult && lastCompanyResult.foundedYear) ? String(lastCompanyResult.foundedYear) : '',
        revenue: (lastCompanyResult && lastCompanyResult.revenue) ? String(lastCompanyResult.revenue) : '',
        companyType: (lastCompanyResult && lastCompanyResult.companyType) ? String(lastCompanyResult.companyType) : ''
      };
      const payload = { source: 'lusha', updatedAt: new Date(), createdAt: new Date() };
      Object.keys(candidateFields).forEach((key) => {
        const val = candidateFields[key];
        if (typeof val === 'string') {
          if (val && val.trim()) payload[key] = val.trim();
        } else if (val !== null && val !== undefined) {
          payload[key] = val;
        }
      });
      
      // Add serviceAddresses array if we have an address (for account detail page display)
      if (mainAddress && mainAddress.trim()) {
        payload.serviceAddresses = [{ address: mainAddress.trim(), isPrimary: true }];
      }
      if (existingId) {
        console.log('[Apollo Widget] Enriching account with payload:', payload);
        // This uses PCSaves.updateAccount which already:
        // - Updates in-memory cache optimistically
        // - Dispatches a single pc:account-updated event
        // - Persists to Firestore
        await window.PCSaves.updateAccount(existingId, payload);
        window.crm?.showToast && window.crm.showToast('Enriched existing account');

        // If we're currently on this account's detail page, refresh it once
        try {
          if (window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
            const current = window.AccountDetail.state.currentAccount;
            const currentId = current.id || current.accountId || current._id;
            if (currentId && String(currentId) === String(existingId)) {
              // Merge enriched fields into current state so UI updates immediately
              window.AccountDetail.state.currentAccount = Object.assign({}, current, payload);
              if (typeof window.AccountDetail.renderAccountDetail === 'function') {
                window.AccountDetail.renderAccountDetail();
              }
            }
          }
        } catch (err) {
          console.warn('[Apollo Widget] Failed to refresh Account Detail after enrichment:', err);
        }

      } else {
        const ref = await db.collection('accounts').add(payload);
        window.crm?.showToast && window.crm.showToast('Account added to CRM');
        
        // Dispatch account-created event
        try {
          const ev = new CustomEvent('pc:account-created', { 
            detail: { 
              id: ref.id, 
              doc: payload 
            } 
          });
          document.dispatchEvent(ev);
        } catch (_) { /* noop */ }
      }
    } catch (e) {
      console.error('Add account failed', e);
      window.crm?.showToast && window.crm.showToast('Failed to add/enrich account: ' + (e && e.message ? e.message : ''));
    }
  }

  function selectPhone(contact, pref){
    try {
      const phones = Array.isArray(contact.phones) ? contact.phones : [];
      const byType = (t) => phones.find(p => (p.type||'').toLowerCase().includes(t));
      
      // Check Lusha phone mapping flags first
      if (contact.phoneMapping) {
        if (pref==='mobile' && contact.phoneMapping.mobile) {
          return (byType('mobile')?.number) || (phones[0]?.number || '');
        }
        if ((pref==='direct' || pref==='work') && contact.phoneMapping.workDirectPhone) {
          return (byType('direct')?.number) || (byType('work')?.number) || (phones[0]?.number || '');
        }
        if (pref==='other' && contact.phoneMapping.otherPhone) {
          const used = new Set([selectPhone(contact,'direct'), selectPhone(contact,'mobile')]);
          const other = phones.find(p => p.number && !used.has(p.number));
          return other ? other.number : '';
        }
      }
      
      // Fallback to original logic
      if (pref==='mobile') return (byType('mobile') && byType('mobile').number) || '';
      if (pref==='direct' || pref==='work') return (byType('direct')?.number) || (byType('work')?.number) || (phones[0]?.number || '');
      if (pref==='other') {
        const used = new Set([selectPhone(contact,'direct'), selectPhone(contact,'mobile')]);
        const other = phones.find(p => p.number && !used.has(p.number));
        return other ? other.number : '';
      }
      return phones[0]?.number || '';
    } catch(_) { return ''; }
  }

  async function enrichExistingContact(contact){
    try {
      console.log('[Lusha Enrich] Starting enrichment for contact:', contact);
      
      // Check if contact already has enriched data in cache
      const hasEmails = Array.isArray(contact.emails) && contact.emails.length > 0;
      const hasPhones = Array.isArray(contact.phones) && contact.phones.length > 0;
      
      console.log('[Lusha Enrich] Contact has cached data - Emails:', hasEmails, 'Phones:', hasPhones);
      
      let enriched = null;
      
      // If contact already has enriched data from cache, use it directly
      if (hasEmails || hasPhones) {
        console.log('[Lusha Enrich] Using cached enriched data from contact object');
        enriched = {
          id: contact.id || contact.contactId,
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          jobTitle: contact.jobTitle || contact.title || '',
          emails: contact.emails || [],
          phones: contact.phones || [],
          linkedin: contact.linkedin || '',
          location: contact.location || '',
          city: contact.city || '',
          state: contact.state || '',
          industry: contact.industry || '',
          seniority: contact.seniority || '',
          // Department/functional area if already on the contact
          department: contact.department || contact.departmentName || ''
        };
        
        // Show success toast
        window.crm?.showToast && window.crm.showToast('Using cached enrichment data...');
      } else {
        // No cached data, need to call API
        console.log('[Lusha Enrich] No cached data, calling API for fresh enrichment');
        
        let base = (window.API_BASE_URL || '').replace(/\/$/, '');
        if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-south1.run.app';
        const requestId = window.__lushaLastRequestId;
        const id = contact.id || contact.contactId;
        
        console.log('[Lusha Enrich] RequestId:', requestId, 'ContactId:', id);
        
        if (!id) {
          console.warn('[Lusha Enrich] Missing contact ID');
          window.crm?.showToast && window.crm.showToast('Cannot enrich: Missing contact ID');
          return;
        }
        
        // Show loading toast
        window.crm?.showToast && window.crm.showToast('Enriching contact...');
        
        console.log('[Lusha Enrich] Making API call to:', `${base}/api/apollo/enrich`);
        
        // Build request body - if no requestId (cached search), send company context for fresh enrich
        const requestBody = { contactIds: [id] };
        
        if (requestId) {
          requestBody.requestId = requestId;
        } else {
          // For cached searches without requestId, include company context for direct enrich
          if (lastCompanyResult) {
            requestBody.company = {
              domain: lastCompanyResult.domain,
              name: lastCompanyResult.name
            };
          }
          // Include contact name/title to help backend find the right record
          if (contact.firstName && contact.lastName) {
            requestBody.name = `${contact.firstName} ${contact.lastName}`.trim();
          }
          if (contact.jobTitle || contact.title) {
            requestBody.title = contact.jobTitle || contact.title;
          }
        }
        
        console.log('[Lusha Enrich] Request body:', requestBody);
        
        const resp = await fetch(`${base}/api/apollo/enrich`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        console.log('[Lusha Enrich] API response status:', resp.status);
        
        if (!resp.ok) {
          const errorText = await resp.text();
          console.error('[Lusha Enrich] API error:', errorText);
          throw new Error(`HTTP ${resp.status}: ${errorText}`);
        }
        
        const data = await resp.json();
        console.log('[Lusha Enrich] API response data:', data);
        
        enriched = (data.contacts && data.contacts[0]) || null;
        
        if (!enriched) {
          console.warn('[Lusha Enrich] No enriched data returned from API');
          window.crm?.showToast && window.crm.showToast('No enrichment data available from API');
          return;
        }
      }
      
      console.log('[Lusha Enrich] Enriched data to use:', enriched);
      
      // Track session credits for enrichments
      trackSessionCredits('enrichments', 1);
      
      // Find and update existing contact in CRM
      const db = window.firebaseDB;
      if (!db) {
        console.error('[Lusha Enrich] Firestore not initialized');
        window.crm?.showToast && window.crm.showToast('Database not available');
        return;
      }
      
      // Use current page context instead of searching by email/name
      let existingId = null;
      
      // Try to get current contact ID from page context
      if (currentEntityType === 'contact' && currentContactId) {
        existingId = currentContactId;
        console.log('[Lusha Enrich] Using current contact ID from page context:', existingId);
      } else if (currentEntityType === 'account' && currentAccountId) {
        // For account context, we need to find the most relevant contact
        try {
          const snap = await db.collection('contacts').where('accountId','==',currentAccountId).limit(1).get();
          if (snap && snap.docs && snap.docs[0]) {
            existingId = snap.docs[0].id;
            console.log('[Lusha Enrich] Found contact for account:', existingId);
          }
        } catch(e){
          console.error('[Lusha Enrich] Error finding contact for account:', e);
        }
      }
      
      // Fallback: try to get from ContactDetail state
      if (!existingId && window.ContactDetail && window.ContactDetail.state && window.ContactDetail.state.currentContact) {
        existingId = window.ContactDetail.state.currentContact.id || window.ContactDetail.state.currentContact.contactId;
        console.log('[Lusha Enrich] Using contact ID from ContactDetail state:', existingId);
      }
      
      if (!existingId) {
        console.warn('[Lusha Enrich] Could not find existing contact to update - no current contact context');
        window.crm?.showToast && window.crm.showToast('Could not find existing contact to enrich - please ensure you are on a contact page');
        return;
      }
      
      // Update existing contact with enriched data
      const updatePayload = {
        updatedAt: new Date()
      };
      
      // Add enriched email data
      if (enriched.emails && enriched.emails.length > 0) {
        updatePayload.email = enriched.emails[0].address || '';
      }
      
      // Add enriched phone data
      if (enriched.phones && enriched.phones.length > 0) {
        updatePayload.phone = enriched.phones[0].number || '';
        // Use the selectPhone helper to properly map phone types to CRM fields
        const mobileNum = selectPhone(enriched, 'mobile');
        const workNum = selectPhone(enriched, 'direct') || selectPhone(enriched, 'work');
        const otherNum = selectPhone(enriched, 'other');
        
        if (mobileNum) updatePayload.mobile = mobileNum;
        if (workNum) updatePayload.workDirectPhone = workNum;
        if (otherNum) updatePayload.otherPhone = otherNum;
        
        console.log('[Lusha Enrich] Mapped phones - Mobile:', mobileNum, 'Work:', workNum, 'Other:', otherNum);
      }
      
      // Add LinkedIn if available
      if (enriched.linkedin) {
        updatePayload.linkedin = enriched.linkedin;
      }
      
      // Add job title if available
      if (enriched.jobTitle) {
        updatePayload.jobTitle = enriched.jobTitle;
      }
      
      // Add location fields if available
      if (enriched.city) {
        updatePayload.city = enriched.city;
      }
      if (enriched.state) {
        updatePayload.state = enriched.state;
      }
      if (enriched.location) {
        updatePayload.location = enriched.location;
      }
      
      // Add industry, seniority, and department if available
      if (enriched.industry) {
        updatePayload.industry = enriched.industry;
      }
      if (enriched.seniority) {
        updatePayload.seniority = enriched.seniority;
      }
      if (enriched.department) {
        updatePayload.department = enriched.department;
      }
      
      console.log('[Lusha Enrich] Update payload:', updatePayload);
      
      // Update the contact
      await window.PCSaves.updateContact(existingId, updatePayload);
      console.log('[Lusha Enrich] Contact enriched successfully:', existingId);
      window.crm?.showToast && window.crm.showToast('Contact enriched successfully');
      
      // Refresh the contact details page if we're viewing that contact
      try {
        if (window.ContactDetail && window.ContactDetail.state && window.ContactDetail.state.currentContact) {
          const currentContactId = window.ContactDetail.state.currentContact.id || window.ContactDetail.state.currentContact._id;
          if (currentContactId === existingId) {
            // Update the current contact data immediately with enriched data
            window.ContactDetail.state.currentContact = {
              ...window.ContactDetail.state.currentContact,
              ...updatePayload
            };
            
            // We're viewing the contact that was just enriched, refresh the page
            console.log('[Lusha Enrich] Refreshing contact details page after enrichment');
            window.ContactDetail.renderContactDetail();
            
            // Also trigger a custom event to ensure all components refresh
            const refreshEvent = new CustomEvent('pc:contact-enriched', {
              detail: { contactId: existingId, enrichedData: enriched }
            });
            document.dispatchEvent(refreshEvent);
            console.log('[Lusha Enrich] Dispatched pc:contact-enriched event');
          }
        }
        
        // Also check if we're on account details page and refresh that too
        if (window.AccountDetail && window.AccountDetail.state && window.AccountDetail.state.currentAccount) {
          console.log('[Lusha Enrich] Refreshing account details page after contact enrichment');
          window.AccountDetail.renderAccountDetail();
          
          // Trigger account refresh event
          const accountRefreshEvent = new CustomEvent('pc:account-refresh', {
            detail: { accountId: window.AccountDetail.state.currentAccount.id }
          });
          document.dispatchEvent(accountRefreshEvent);
          console.log('[Lusha Enrich] Dispatched pc:account-refresh event');
        }
        
        // Also refresh any other pages that might be showing this contact
        try {
          // Trigger a general contact update event for other components
          const generalUpdateEvent = new CustomEvent('pc:contact-updated', {
            detail: { 
              contactId: existingId, 
              changes: updatePayload,
              source: 'lusha-enrichment'
            }
          });
          document.dispatchEvent(generalUpdateEvent);
          console.log('[Lusha Enrich] Dispatched pc:contact-updated event');
        } catch (_) { /* noop */ }
      } catch(refreshError) {
        console.warn('[Lusha Enrich] Failed to refresh pages:', refreshError);
      }
      
    } catch(e) { 
      console.error('[Lusha Enrich] Failed:', e);
      window.crm?.showToast && window.crm.showToast('Failed to enrich contact: ' + (e.message || 'Unknown error'));
    }
  }

  async function revealForContact(contact, which, container){
    try {
      lushaLog('Revealing', which, 'for contact:', contact);
      let base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-south1.run.app';
      const requestId = window.__lushaOpenedFromCache ? null : window.__lushaLastRequestId; // force live when opened from cache
      const id = contact.id || contact.contactId;
      
      let enriched = null;
      
      // Check if this is an "Enrich" action (contact already has data)
      const hasExistingData = (which === 'email' && Array.isArray(contact.emails) && contact.emails.length > 0) ||
                             (which === 'phones' && Array.isArray(contact.phones) && contact.phones.length > 0);
      
      // Check if we already have the requested data in cache to avoid unnecessary API calls
      let hasRequestedData = false;
      if (which === 'email' && contact.emails && contact.emails.length > 0) {
        hasRequestedData = true;
      } else if (which === 'phones' && contact.phones && contact.phones.length > 0) {
        hasRequestedData = true;
      }
      
      // If we have the data and it's from cache, just display it without API call
      if (hasRequestedData && window.__lushaOpenedFromCache) {
        lushaLog('Using cached data for', which, '- no API call needed');
        if (which === 'email') {
          const emails = Array.isArray(contact.emails) ? contact.emails.map(e => e.address || e).filter(Boolean) : [];
          const newContent = emails.length ? emails.map(v => `<div class="lusha-value-item">${formatEmailLink(v)}</div>`).join('') : '<div class="lusha-value-item">—</div>';
          animateRevealContent(wrap, newContent);
        } else if (which === 'phones') {
          const phones = Array.isArray(contact.phones) ? contact.phones.map(p => p.number || p).filter(Boolean) : [];
          const newContent = phones.length ? phones.map(v => `<div class="lusha-value-item">${formatPhoneLink(v)}</div>`).join('') : '<div class="lusha-value-item">—</div>';
          animateRevealContent(wrap, newContent);
        }
        
        // Update button to show "Enrich" instead of "Reveal"
        const revealBtn = container.querySelector(`[data-reveal="${which}"]`);
        if (revealBtn) {
          revealBtn.textContent = 'Enrich';
        }
        
        // Show 0 credits used (cached data)
        showCreditsUsed(0, 'cached');
        return;
      }
      
      // Always make fresh API call for "Enrich" buttons, or when no requestId available
      // When opened from cache, always make a fresh enrich call (acts like combined reset+reveal)
      if (window.__lushaOpenedFromCache || hasExistingData || !requestId) {
        lushaLog('Making fresh enrich call for', hasExistingData ? 'enrich' : 'reveal');
        try {
          const enrichResp = await fetch(`${base}/api/apollo/enrich`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              contactIds: [id],
              // Include company context for direct enrich
              company: lastCompanyResult ? {
                domain: lastCompanyResult.domain,
                name: lastCompanyResult.name
              } : null,
              // Pass name/title to help backend find the right record when searching
              name: (contact.firstName && contact.lastName) ? `${contact.firstName} ${contact.lastName}` : (contact.fullName || ''),
              title: contact.jobTitle || contact.title || '',
              // Request only the specific datapoint to minimize billing when supported
              revealEmails: which === 'email',
              revealPhones: which === 'phones'
            })
          });
          
          if (!enrichResp.ok) {
            if (enrichResp.status === 403) {
              window.crm?.showToast && window.crm.showToast('Plan restriction: Individual data reveals not available. Please refresh to get full data.');
        return;
      }
            throw new Error(`HTTP ${enrichResp.status}`);
          }
          
          const enrichData = await enrichResp.json();
          enriched = (enrichData.contacts && enrichData.contacts[0]) || null;
          
          if (!enriched) {
            window.crm?.showToast && window.crm.showToast('No data available to reveal.');
        return;
      }
      
          lushaLog('Fresh enrich successful:', enriched);
        } catch (directError) {
          lushaLog('Fresh enrich failed:', directError);
          window.crm?.showToast && window.crm.showToast('Enrich failed. Please try again.');
          return;
        }
      } else {
        // Original logic with requestId for first-time reveals
      lushaLog('Making enrich request with requestId:', requestId, 'contactId:', id);
      const resp = await fetch(`${base}/api/apollo/enrich`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, contactIds: [id] })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      lushaLog('Enrich response:', data);
        enriched = (data.contacts && data.contacts[0]) || null;
      if (!enriched) {
        lushaLog('No enriched data returned');
        window.crm?.showToast && window.crm.showToast('No data available to reveal.');
        return;
      }
      
      // Track session credits for reveals/enrichments
      trackSessionCredits('reveals', 1);
      }
      if (!id) {
        lushaLog('No contact ID available for reveal');
        window.crm?.showToast && window.crm.showToast('Contact ID missing.');
        return;
      }

      // Update UI lists and contact object
      if (which === 'email') {
        const wrap = container.querySelector('[data-email-list]');
        if (wrap) {
          const emails = Array.isArray(enriched.emails) ? enriched.emails.map(e => e.address).filter(Boolean) : [];
          const newContent = emails.length ? emails.map(v => `<div class="lusha-value-item">${formatEmailLink(v)}</div>`).join('') : '<div class="lusha-value-item">—</div>';
          animateRevealContent(wrap, newContent);
          
          // Update contact object with revealed emails
          contact.emails = enriched.emails || [];
          if (emails.length > 0) {
            contact.email = emails[0]; // Set primary email
          }
        }
      } else if (which === 'phones') {
        const wrap = container.querySelector('[data-phones-list]');
        if (wrap) {
          // First check if contact already has phones from initial search (sometimes Apollo includes them)
          const existingPhones = Array.isArray(contact.phones) ? contact.phones.map(p => p.number || p).filter(Boolean) : [];
          if (existingPhones.length > 0) {
            lushaLog('Using phones from original contact data (no reveal needed)');
            const newContent = existingPhones.map(v => `<div class="lusha-value-item">${formatPhoneLink(v)}</div>`).join('');
            animateRevealContent(wrap, newContent);
            return; // Already have phones, no need to reveal
          }
          
          // Check if enrich call returned phones immediately
          const phones = Array.isArray(enriched.phones) ? enriched.phones.map(p => p.number).filter(Boolean) : [];
          
          if (phones.length > 0) {
            const newContent = phones.map(v => `<div class="lusha-value-item">${formatPhoneLink(v)}</div>`).join('');
            animateRevealContent(wrap, newContent);
            
            // Update contact object with revealed phones
            contact.phones = enriched.phones || [];
            contact.phone = phones[0]; // Set primary phone
          } else {
            // Phone numbers are delivered asynchronously via webhook
            // Show loading indicator and poll for results
            lushaLog('Phone reveal requested - polling for async delivery');
            const loadingContent = '<div class="lusha-value-item" style="color: var(--text-muted); font-style: italic;">⏳ Revealing phone numbers...</div>';
            animateRevealContent(wrap, loadingContent);
            
            // Poll for phone numbers (Apollo sends them to webhook asynchronously)
            const personId = enriched.id || enriched.contactId || id;
            pollForPhoneNumbers(personId, contact, wrap, container);
          }
        }
      }

      // Update LinkedIn if provided by enrich response, and reflect in UI header actions
      try {
        if (enriched.linkedin && typeof enriched.linkedin === 'string' && enriched.linkedin.trim()) {
          contact.linkedin = enriched.linkedin.trim();
          const actionsHeader = container.querySelector('.lusha-contact-actions-header');
          if (actionsHeader) {
            let link = actionsHeader.querySelector('.lusha-linkedin-link');
            if (!link) {
              const a = document.createElement('a');
              a.href = contact.linkedin;
              a.target = '_blank';
              a.rel = 'noopener';
              a.className = 'lusha-linkedin-link';
              a.title = 'View LinkedIn Profile';
              a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
              actionsHeader.appendChild(a);
            } else {
              link.href = contact.linkedin;
            }
          }
        }
      } catch(_) {}

      // Persist enriched fields in session so paging keeps them
      try {
        const id = contact.id || contact.contactId;
        const idx = allContacts.findIndex(c => (c.id || c.contactId) === id);
        if (idx >= 0) {
          const merged = Object.assign({}, allContacts[idx]);
          if (which === 'email' && Array.isArray(enriched.emails)) {
            merged.emails = enriched.emails;
            merged.hasEmails = enriched.emails.length > 0;
            if (enriched.emails[0] && enriched.emails[0].address) merged.email = enriched.emails[0].address;
          }
          if (which === 'phones' && Array.isArray(enriched.phones)) {
            merged.phones = enriched.phones;
            merged.hasPhones = enriched.phones.length > 0;
            if (enriched.phones[0] && enriched.phones[0].number) merged.phone = enriched.phones[0].number;
          }
          if (enriched.firstName || enriched.lastName || (enriched.name && (enriched.name.first || enriched.name.last || enriched.name.full))) {
            merged.firstName = enriched.firstName || (enriched.name && enriched.name.first) || merged.firstName;
            merged.lastName = enriched.lastName || (enriched.name && enriched.name.last) || merged.lastName;
            const full = (enriched.name && (enriched.name.full || enriched.name)) || `${merged.firstName||''} ${merged.lastName||''}`.trim();
            if (full) merged.fullName = full;
            try {
              if (!window.__lushaNameMap) window.__lushaNameMap = new Map();
              window.__lushaNameMap.set(id, { f: merged.firstName||'', l: merged.lastName||'', full: merged.fullName||full||'' });
            } catch(_){}
          }
          allContacts[idx] = merged;
          lushaLog('Persisted enriched fields to session for', id);
        }
      } catch(persistErr) { lushaLog('Persist session merge failed', persistErr); }
      
      // Update the contact data in the Add Contact button
      const addContactBtn = container.querySelector('[data-action="add-contact"]');
      if (addContactBtn) {
        addContactBtn.setAttribute('data-contact', JSON.stringify(contact));
      }

      // Persist into cache (merge contact by id) AND update CRM if contact exists
      try { 
        const id = contact.id || contact.contactId;
        const idx = allContacts.findIndex(c => (c.id || c.contactId) === id);
        const contactToCache = idx >= 0 ? allContacts[idx] : Object.assign({}, contact, which === 'email' ? { emails: enriched.emails } : { phones: enriched.phones });
        await upsertCacheContact({ company: lastCompanyResult }, contactToCache);
        console.log('[Lusha] Revealed data saved to cache with merged contact data');
        const email = enriched.emails && enriched.emails[0] && enriched.emails[0].address;
        if (email && window.firebaseDB) {
          try {
            const snap = await window.firebaseDB.collection('contacts').where('email','==',email).limit(1).get();
            if (snap && snap.docs && snap.docs[0]) {
              const existingId = snap.docs[0].id;
              const updatePayload = {};
              if (which === 'phones' && enriched.phones && enriched.phones.length > 0) {
                updatePayload.workDirectPhone = selectPhone(enriched, 'direct') || selectPhone(enriched, 'work') || '';
                updatePayload.mobile = selectPhone(enriched, 'mobile') || '';
                updatePayload.otherPhone = selectPhone(enriched, 'other') || '';
                updatePayload.phone = enriched.phones[0].number || '';
              }
              if (which === 'email' && enriched.emails && enriched.emails.length > 0) {
                updatePayload.email = enriched.emails[0].address || '';
              }
              if (Object.keys(updatePayload).length > 0) {
                updatePayload.updatedAt = new Date();
                await window.PCSaves.updateContact(existingId, updatePayload);
                console.log('[Lusha] CRM contact updated with revealed data');
              }
            }
          } catch (crmError) {
            console.warn('[Lusha] Failed to update CRM contact (cache save succeeded):', crmError);
          }
        }
      } catch(cacheError) { 
        console.warn('[Lusha] Failed to save to cache:', cacheError);
      }
    } catch(e) { console.warn('Reveal failed', e); }
  }

  async function updateActionButtons(containerEl, contact){
    try {
      const db = window.firebaseDB;
      if (!db) return;
      
      let contactExists = false;
      
      // Check by email first
      const email = contact.email || (Array.isArray(contact.emails) && contact.emails[0] && contact.emails[0].address) || '';
      if (email) {
        try {
          const s = await db.collection('contacts').where('email','==',email).limit(1).get();
          contactExists = !!(s && s.docs && s.docs[0]);
        } catch(_){}
      }
      
      // If no email match, try name-based matching
      if (!contactExists && contact.firstName && contact.lastName) {
        try {
          const fullName = `${contact.firstName} ${contact.lastName}`.trim();
          const s = await db.collection('contacts').where('name','==',fullName).limit(1).get();
          contactExists = !!(s && s.docs && s.docs[0]);
        } catch(_){}
      }
      
      // If still no match, try phone-based matching
      if (!contactExists && contact.phone) {
        try {
          const s = await db.collection('contacts').where('phone','==',contact.phone).limit(1).get();
          contactExists = !!(s && s.docs && s.docs[0]);
        } catch(_){}
      }
      
      const addBtn = containerEl.querySelector('[data-action="add-contact"]');
      const enrichBtn = containerEl.querySelector('[data-action="enrich-contact"]');
      if (enrichBtn) enrichBtn.style.display = contactExists ? '' : 'none';
      if (addBtn) addBtn.style.display = contactExists ? 'none' : '';
    } catch(_){}
  }

  function copyContactInfo(contact) {
    const info = [
      `Name: ${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      `Title: ${contact.title || contact.jobTitle || ''}`,
      `Company: ${contact.company || contact.companyName || ''}`,
      `Email: ${contact.email || ''}`,
      `Phone: ${contact.phone || contact.phoneNumber || ''}`,
      `Location: ${contact.location || contact.city || ''}`
    ].filter(line => line.split(': ')[1]).join('\n');

    navigator.clipboard.writeText(info).then(() => {
      try { window.crm?.showToast && window.crm.showToast('Contact info copied to clipboard'); } catch (_) {}
    }).catch(() => {
      try { window.crm?.showToast && window.crm.showToast('Failed to copy to clipboard'); } catch (_) {}
    });
  }

  function getContextDefaults(entityType){
    const out = { companyName: '', domain: '' };
    try {
      lushaLog('Getting context defaults for entity type:', entityType);
      if (entityType === 'account') {
        const a = window.AccountDetail?.state?.currentAccount || {};
        lushaLog('AccountDetail state:', a);
        out.companyName = a.name || a.accountName || a.companyName || '';
        const d = a.domain || a.website || a.site || a.companyWebsite || a.websiteUrl || '';
        if (d) out.domain = deriveDomain(d);
        lushaLog('Account context derived:', { companyName: out.companyName, domain: out.domain, rawDomain: d });
      } else {
        const c = window.ContactDetail?.state?.currentContact || {};
        lushaLog('ContactDetail state:', c);
        out.companyName = c.companyName || c.company || c.account || '';
        const id = window.ContactDetail?.state?._linkedAccountId;
        lushaLog('Linked account ID:', id);
        if (id && typeof window.getAccountsData === 'function') {
          const acc = (window.getAccountsData()||[]).find(x => (x.id||x.accountId||x._id) === id);
          lushaLog('Found linked account:', acc);
          const d = acc?.domain || acc?.website || acc?.site || '';
          if (d) out.domain = deriveDomain(d);
          if (!out.companyName) out.companyName = acc?.name || acc?.accountName || '';
        }
        if (!out.domain) {
          const alt = c.companyWebsite || c.website || '';
          if (alt) out.domain = deriveDomain(alt);
        }
        lushaLog('Contact context derived:', { companyName: out.companyName, domain: out.domain });
      }
      // Fallbacks to values we captured when the widget opened
      if (!out.companyName && currentAccountName) out.companyName = currentAccountName;
      // Use lastCompanyResult domain only if it matches the same company name (avoid cross-account bleed)
      if (!out.domain && lastCompanyResult && lastCompanyResult.domain) {
        const lcName = (lastCompanyResult.name || '').toString().trim().toLowerCase();
        const ocName = (out.companyName || '').toString().trim().toLowerCase();
        if (lcName && ocName && lcName === ocName) {
          out.domain = lastCompanyResult.domain;
        }
      }

      // DOM fallbacks (page titles and website link anchors)
      if (!out.companyName) {
        const titleEl = document.querySelector('#account-detail-header .page-title') ||
                        document.querySelector('#account-details-page .page-title') ||
                        document.querySelector('.contact-page-title');
        if (titleEl && titleEl.textContent) out.companyName = titleEl.textContent.trim();
      }
      if (!out.domain) {
        const websiteLink = document.querySelector('#account-detail-header [data-field="website"] a') ||
                            document.querySelector('#account-details-page [data-field="website"] a');
        if (websiteLink && websiteLink.href) out.domain = deriveDomain(websiteLink.href);
      }

      // Lookup by name in accounts cache
      if (!out.domain && out.companyName && typeof window.getAccountsData === 'function') {
        const key = String(out.companyName).trim().toLowerCase();
        const hit = (window.getAccountsData()||[]).find(a => String(a.name||a.accountName||'').trim().toLowerCase() === key);
        if (hit) {
          const d = hit.domain || hit.website || hit.site || '';
          if (d) out.domain = deriveDomain(d);
        }
      }
    } catch(_){}
    // Persist/reuse requestId per domain to avoid repeat searches
    try {
      if (out.domain) {
        const key = `__lusha_requestId_${out.domain}`;
        if (window.__lushaLastRequestId) {
          localStorage.setItem(key, window.__lushaLastRequestId);
        } else {
          const saved = localStorage.getItem(key);
          if (saved && !window.__lushaLastRequestId) {
            window.__lushaLastRequestId = saved;
          }
        }
      }
    } catch(_) {}

    return out;
  }

  function updateResults(contacts, skipAnimations = false){
    try {
      lushaLog('Updating results with contacts:', contacts);
      
      // Store all contacts for pagination
      allContacts = contacts;
      currentPage = 1; // Reset to first page
      
      const resultsWrap = document.getElementById('lusha-results');
      const countEl = document.getElementById('lusha-results-count');
      const listEl = document.getElementById('lusha-contacts-list');
      const paginationEl = document.getElementById('lusha-pagination');
      
      if (resultsWrap) {
        // Ensure results container is shown before animating (for consistent measuring)
        resultsWrap.style.display = 'block';
        resultsWrap.classList.add('is-shown');
        resultsWrap.classList.remove('is-hidden');
      }
      if (countEl) countEl.textContent = `${contacts.length} contact${contacts.length===1?'':'s'} found`;
      
      // Show/hide pagination based on contact count
      if (paginationEl) {
        if (contacts.length > contactsPerPage) {
          paginationEl.style.display = 'flex';
          paginationEl.style.visibility = 'visible';
          updatePaginationControls();
        } else {
          paginationEl.style.visibility = 'hidden';
          paginationEl.style.display = 'flex';
        }
      }
      
      // Display current page of contacts
      displayCurrentPage(skipAnimations);
      
      // During refresh, lock header/pagination styles immediately to prevent any visual jump
      if (skipAnimations) {
        try {
          const headerEl = resultsWrap?.querySelector('.lusha-results-header');
          const pagEl = document.getElementById('lusha-pagination');
          if (headerEl) {
            headerEl.style.transition = 'none';
            headerEl.style.opacity = '1';
            headerEl.style.transform = 'none';
          }
          if (pagEl) {
            pagEl.style.transition = 'none';
            pagEl.style.opacity = '1';
            pagEl.style.transform = 'none';
          }
        } catch(_) {}
      }
      
      // Skip animations on refresh
      if (!skipAnimations) {
        // Stagger in the items for a smoother appearance
        try { animateResultItemsIn(); } catch(_) {}

        // Fade-in the results header (title, count, pagination) to avoid jump
        try {
          const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduce) {
            const headerEl = resultsWrap?.querySelector('.lusha-results-header');
            if (headerEl) {
              headerEl.style.opacity = '0';
              headerEl.style.transform = 'translateY(8px)';
              requestAnimationFrame(() => {
                headerEl.style.transition = 'opacity 400ms ease, transform 400ms ease';
                headerEl.style.opacity = '1';
                headerEl.style.transform = 'translateY(0)';
              });
            }
          }
        } catch(_) {}
      } else {
        // Skip animations - ensure everything is visible immediately
        try {
          const headerEl = resultsWrap?.querySelector('.lusha-results-header');
          if (headerEl) {
            headerEl.style.opacity = '1';
            headerEl.style.transform = 'translateY(0)';
          }
        } catch(_) {}
      }
      
    } catch (e) { 
      lushaLog('Update results failed:', e);
      console.error('Update results failed', e); 
    }
  }
  
  function displayCurrentPage(skipAnimations = false) {
    try {
      const listEl = document.getElementById('lusha-contacts-list');
      if (!listEl) return;
      
      listEl.innerHTML = '';
      
      if (allContacts.length === 0) {
        lushaLog('No contacts to display');
        const empty = document.createElement('div');
        empty.className = 'lusha-no-results';
        empty.textContent = 'No results found.';
        listEl.appendChild(empty);
        return;
      }
      
      // Calculate pagination
      const startIndex = (currentPage - 1) * contactsPerPage;
      const endIndex = startIndex + contactsPerPage;
      const pageContacts = allContacts.slice(startIndex, endIndex);
      
      lushaLog(`Displaying page ${currentPage}: contacts ${startIndex + 1}-${Math.min(endIndex, allContacts.length)} of ${allContacts.length}`);
      
      // Create contact elements for current page
      pageContacts.forEach((c, i) => {
        const mapped = mapProspectingContact(c);
        const globalIndex = startIndex + i;
        lushaLog(`Creating element ${globalIndex}:`, mapped);
        listEl.appendChild(createContactElement(mapped, globalIndex));
      });
      
      // Update pagination controls
      updatePaginationControls();
      
      // Skip animations on refresh
      if (!skipAnimations) {
        // Simple fade-in for all items at once
        try { 
          const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduce) {
            requestAnimationFrame(() => {
              const items = listEl.querySelectorAll('.lusha-contact-item');
              items.forEach((item, i) => {
                item.style.opacity = '0';
                item.style.transform = 'translateY(8px)';
                setTimeout(() => {
                  item.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                  item.style.opacity = '1';
                  item.style.transform = 'translateY(0)';
                }, i * 80);
              });
            });
          }
        } catch(_) {}
      } else {
        // Skip animations - ensure items are visible immediately and prevent reflow transitions
        try {
          const items = listEl.querySelectorAll('.lusha-contact-item');
          items.forEach((item) => {
            item.style.transition = 'none';
            item.style.opacity = '1';
            item.style.transform = 'none';
          });
        } catch(_) {}
      }
      
    } catch (e) {
      lushaLog('Display current page failed:', e);
      console.error('Display current page failed', e);
    }
  }
  
  function updatePaginationControls() {
    try {
      const paginationEl = document.getElementById('lusha-pagination');
      const prevBtn = document.getElementById('lusha-prev-btn');
      const nextBtn = document.getElementById('lusha-next-btn');
      const currentEl = document.getElementById('lusha-pagination-current');
      
      if (!paginationEl || !prevBtn || !nextBtn || !currentEl) return;
      
      const totalPages = Math.ceil(allContacts.length / contactsPerPage);
      const startContact = (currentPage - 1) * contactsPerPage + 1;
      const endContact = Math.min(currentPage * contactsPerPage, allContacts.length);
      
      // Update current page number
      currentEl.textContent = currentPage;
      
      // Update button states
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
      
      lushaLog(`Pagination: page ${currentPage}/${totalPages}, contacts ${startContact}-${endContact} of ${allContacts.length}`);
      
    } catch (e) {
      lushaLog('Update pagination controls failed:', e);
      console.error('Update pagination controls failed', e);
    }
  }

  function resetLushaForm() {
    const companyInput = document.getElementById('lusha-company-search');
    const domainInput = document.getElementById('lusha-company-domain');
    const contactNameInput = document.getElementById('lusha-contact-name');
    const contactEmailInput = document.getElementById('lusha-contact-email');
    const resultsEl = document.getElementById('lusha-results');

    // Clear all fields first
    if (companyInput) companyInput.value = '';
    if (domainInput) domainInput.value = '';
    if (contactNameInput) contactNameInput.value = '';
    if (contactEmailInput) contactEmailInput.value = '';
    if (resultsEl) resultsEl.style.display = 'none';
    
    // Then repopulate with current data
    try { prefillInputs(currentEntityType); } catch(_) {}
  }

  // Standardized cache key generation
  function generateCacheKey(domain, companyName) {
    if (domain) {
      return domain.toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
    }
    if (companyName) {
      return `name_${companyName.toLowerCase().trim()}`;
    }
    return null;
  }

  // Cache helpers (optional separate Firebase project)
  async function getLushaCacheDB(){
    try {
      if (!window.firebase) return null;
      if (window.__LUSHA_CACHE_CONFIG && typeof window.firebase.initializeApp === 'function') {
        // Use a named secondary app
        const name = '__lusha_cache__';
        let app = null;
        try { app = window.firebase.app(name); } catch(_) {}
        if (!app) {
          try { app = window.firebase.initializeApp(window.__LUSHA_CACHE_CONFIG, name); } catch(e){ console.warn('Cache app init failed', e); }
        }
        if (app && app.firestore) return app.firestore();
      }
      // Fallback to primary DB
      return window.firebaseDB || null;
    } catch (_) { return null; }
  }
  async function tryLoadCache(key){
    try {
      const db = await getLushaCacheDB();
      if (!db) {
        // LocalStorage fallback
        try {
          const domain = (key && key.domain) || '';
          const companyName = (key && key.companyName) || '';
      const cacheKey = generateCacheKey(domain, companyName);
      if (cacheKey) {
        const raw = localStorage.getItem(`lusha_cache_${cacheKey}`);
            if (raw) {
              const doc = JSON.parse(raw);
              if (doc && Array.isArray(doc.contacts) && doc.contacts.length) return doc;
            }
          }
        } catch(_) {}
        return null;
      }
      const domain = (key && key.domain) || '';
      const companyName = (key && key.companyName) || '';
      const cacheKey = generateCacheKey(domain, companyName);
      let doc = null;
      if (cacheKey) {
        const snap = await db.collection('lusha_cache').doc(cacheKey).get();
        if (snap && snap.exists) doc = { id: snap.id, ...snap.data() };
      }
      if (doc && doc.contacts && doc.contacts.length) return doc;

      // Fallback to localStorage if Firestore empty
      try {
        if (cacheKey) {
          const raw = localStorage.getItem(`lusha_cache_${cacheKey}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.contacts) && parsed.contacts.length) return parsed;
          }
        }
      } catch(_) {}
      return null;
    } catch (_) { return null; }
  }
  // Helper: write to Firestore later if DB not yet available
  function __lushaScheduleCacheWrite(docId, payload, merge){
    try {
      if (!docId || !payload) return;
      let attempts = 0;
      const tryOnce = async () => {
        attempts++;
        try {
          const db = await getLushaCacheDB();
          if (db) {
            const ref = db.collection('lusha_cache').doc(docId);
            if (merge) await ref.set(payload, { merge: true });
            else await ref.set(payload);
            return; // success
          }
        } catch(_) {}
        if (attempts < 8) setTimeout(tryOnce, Math.min(1000 * Math.pow(2, attempts-1), 8000));
      };
      setTimeout(tryOnce, 250);
    } catch(_) {}
  }

  async function saveCache({ company, contacts }){
    try {
      const db = await getLushaCacheDB();
      const domain = (company && (company.domain || company.fqdn)) || '';
      const companyName = company && (company.name || company.companyName) || '';
      const docId = generateCacheKey(domain, companyName) || 'unknown';
      let existing = {};
      let ref = null;
      if (db) {
        ref = db.collection('lusha_cache').doc(docId);
        const snap = await ref.get();
        existing = snap.exists ? (snap.data() || {}) : {};
      } else {
        try {
          const raw = localStorage.getItem(`lusha_cache_${docId}`);
          existing = raw ? (JSON.parse(raw) || {}) : {};
        } catch(_) {}
      }
      const existingContacts = Array.isArray(existing.contacts) ? existing.contacts : [];
      const existingById = new Map(existingContacts.map(c => [c.id || c.contactId, c]));

      // Map incoming contacts and merge with any existing enriched data (emails/phones)
      const mappedIncoming = (contacts || []).map(mapProspectingContact);
      const mergedMap = new Map();

      mappedIncoming.forEach(nc => {
        const key = nc.id || nc.contactId;
        const ec = key ? existingById.get(key) : null;
        let merged = Object.assign({}, ec || {}, nc);
        // ALWAYS preserve enriched email/phone arrays from existing cache on refresh
        if (ec && Array.isArray(ec.emails) && ec.emails.length > 0) {
          merged.emails = ec.emails;
          merged.hasEmails = ec.emails.length > 0;
          if (ec.emails[0] && ec.emails[0].address) merged.email = ec.emails[0].address;
        }
        if (ec && Array.isArray(ec.phones) && ec.phones.length > 0) {
          merged.phones = ec.phones;
          merged.hasPhones = ec.phones.length > 0;
          if (ec.phones[0] && ec.phones[0].number) merged.phone = ec.phones[0].number;
        }
        // Keep best name info - prioritize fresh data for names
        merged.firstName = nc.firstName || ec?.firstName || '';
        merged.lastName = nc.lastName || ec?.lastName || '';
        const full = (nc.fullName || ec?.fullName || '').trim();
        if (full) merged.fullName = full;
        mergedMap.set(key || Math.random().toString(36).slice(2), merged);
      });

      // Include any existing contacts not present in new search (to avoid losing enriched entries)
      existingContacts.forEach(ec => {
        const key = ec.id || ec.contactId;
        if (!mergedMap.has(key)) mergedMap.set(key, ec);
      });

      const mergedContacts = Array.from(mergedMap.values());

      const payload = {
        domain: domain || '',
        companyName: companyName || '',
        website: company && company.website || (domain ? ('https://' + domain) : ''),
        companyId: company && (company.id || null),
        // Cache complete company data
        company: company || {},
        // Cache all company fields from Lusha
        logoUrl: company && company.logoUrl || existing.logoUrl || '',
        description: company && (company.description || company.companyDescription) || existing.description || '',
        industry: company && company.industry || existing.industry || '',
        employees: company && company.employees || existing.employees || '',
        revenue: company && company.revenue || existing.revenue || '',
        location: company && company.location || existing.location || '',
        city: company && company.city || existing.city || '',
        state: company && company.state || existing.state || '',
        country: company && company.country || existing.country || '',
        // phone intentionally omitted from cache payload
        email: company && company.email || existing.email || '',
        linkedin: company && company.linkedin || existing.linkedin || '',
        twitter: company && company.twitter || existing.twitter || '',
        facebook: company && company.facebook || existing.facebook || '',
        // Persist merged contacts with enriched fields preserved
        contacts: mergedContacts,
        updatedAt: new Date()
      };
      if (ref) {
        await ref.set(payload); // overwrite with merged payload
      } else {
        // Schedule a Firestore write when DB becomes available
        __lushaScheduleCacheWrite(docId, payload, false);
      }
      // Always persist to localStorage as a fallback cache
      try { localStorage.setItem(`lusha_cache_${docId}`, JSON.stringify(payload)); } catch(_) {}
      console.log('[Lusha] Cache saved (merged preserve enrich)', docId, { contacts: mergedContacts.length });
    } catch (e) { console.warn('[Lusha] Cache save failed', e); }
  }

  async function upsertCacheContact({ company }, enriched){
    try {
      const db = await getLushaCacheDB();
      const domain = (company && (company.domain || company.fqdn)) || '';
      const companyName = company && (company.name || company.companyName) || '';
      const docId = generateCacheKey(domain, companyName) || 'unknown';
      let ref = null;
      let existing = {};
      if (db) {
        ref = db.collection('lusha_cache').doc(docId);
        const snap = await ref.get();
        existing = snap.exists ? (snap.data() || {}) : {};
      } else {
        try {
          const raw = localStorage.getItem(`lusha_cache_${docId}`);
          existing = raw ? (JSON.parse(raw) || {}) : {};
        } catch(_) {}
      }
      const arr = Array.isArray(existing.contacts) ? existing.contacts.slice() : [];
      const idx = arr.findIndex(x => (x.id || x.contactId) === (enriched.id || enriched.contactId));
      const mapped = mapProspectingContact(enriched);
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], mapped);
      else arr.push(mapped);
      // Preserve all existing company data when updating contacts
      const updateData = { 
        contacts: arr, 
        updatedAt: new Date(),
        // Preserve existing company data
        ...(existing.company && { company: existing.company }),
        ...(existing.logoUrl && { logoUrl: existing.logoUrl }),
        ...(existing.description && { description: existing.description }),
        ...(existing.industry && { industry: existing.industry }),
        ...(existing.employees && { employees: existing.employees }),
        ...(existing.revenue && { revenue: existing.revenue }),
        ...(existing.location && { location: existing.location }),
        ...(existing.city && { city: existing.city }),
        ...(existing.state && { state: existing.state }),
        ...(existing.country && { country: existing.country }),
        ...(existing.phone && { phone: existing.phone }),
        ...(existing.email && { email: existing.email }),
        ...(existing.linkedin && { linkedin: existing.linkedin }),
        ...(existing.twitter && { twitter: existing.twitter }),
        ...(existing.facebook && { facebook: existing.facebook })
      };
      if (ref) await ref.set(updateData, { merge: true });
      else __lushaScheduleCacheWrite(docId, updateData, true);
      try { localStorage.setItem(`lusha_cache_${docId}`, JSON.stringify(Object.assign({}, existing, updateData))); } catch(_) {}
      console.log('[Lusha] Cache upserted contact', mapped.id);
    } catch (e) { console.warn('[Lusha] Cache upsert failed', e); }
  }

  // Merge helper: preserve enriched emails/phones from existing cache, prefer fresh names
  async function mergeContactsWithExistingCache(company, freshContacts){
    try {
      const db = await getLushaCacheDB();
      if (!db) return freshContacts;
      const domain = (company && (company.domain || company.fqdn)) || '';
      const companyName = company && (company.name || company.companyName) || '';
      const docId = generateCacheKey(domain, companyName) || 'unknown';
      const snap = await db.collection('lusha_cache').doc(docId).get();
      const existing = snap.exists ? (snap.data() || {}) : {};
      const existingContacts = Array.isArray(existing.contacts) ? existing.contacts : [];
      const existingById = new Map(existingContacts.map(c => [c.id || c.contactId, c]));
      const mappedIncoming = (freshContacts || []).map(mapProspectingContact);
      const merged = mappedIncoming.map(nc => {
        const key = nc.id || nc.contactId;
        const ec = key ? existingById.get(key) : null;
        if (!ec) return nc;
        const out = Object.assign({}, ec, nc);
        if (Array.isArray(ec.emails) && ec.emails.length > 0) {
          out.emails = ec.emails;
          out.hasEmails = ec.emails.length > 0;
          if (ec.emails[0]?.address) out.email = ec.emails[0].address;
        }
        if (Array.isArray(ec.phones) && ec.phones.length > 0) {
          out.phones = ec.phones;
          out.hasPhones = ec.phones.length > 0;
          if (ec.phones[0]?.number) out.phone = ec.phones[0].number;
        }
        // prefer fresh names
        out.firstName = nc.firstName || ec.firstName || '';
        out.lastName = nc.lastName || ec.lastName || '';
        const full = (nc.fullName || ec.fullName || '').trim();
        if (full) out.fullName = full;
        return out;
      });
      // include any enriched contacts not present in fresh list
      existingContacts.forEach(ec => {
        const key = ec.id || ec.contactId;
        if (!merged.find(m => (m.id||m.contactId) === key)) merged.push(ec);
      });
      return merged;
    } catch(_) {
      return freshContacts;
    }
  }

  // Session-based credit tracking
  function initializeSessionTracking() {
    if (!window.__lushaSessionTracking) {
      window.__lushaSessionTracking = {
        sessionStart: Date.now(),
        creditsUsedThisSession: 0,
        operations: {
          searches: 0,
          enrichments: 0,
          reveals: 0
        },
        lastKnownUsage: null
      };
    }
  }

  // Track credits used in current session
  function trackSessionCredits(operation, creditsUsed) {
    initializeSessionTracking();
    window.__lushaSessionTracking.creditsUsedThisSession += creditsUsed;
    window.__lushaSessionTracking.operations[operation] = (window.__lushaSessionTracking.operations[operation] || 0) + creditsUsed;
    console.log(`[Lusha Session] ${operation}: +${creditsUsed} credits (session total: ${window.__lushaSessionTracking.creditsUsedThisSession})`);
  }

  // Get session credit summary
  function getSessionCreditSummary() {
    initializeSessionTracking();
    return {
      sessionCreditsUsed: window.__lushaSessionTracking.creditsUsedThisSession,
      operations: { ...window.__lushaSessionTracking.operations },
      sessionStart: window.__lushaSessionTracking.sessionStart
    };
  }

  // Cache usage data in Firebase
  async function cacheUsageData(usageData) {
    try {
      const db = await getLushaCacheDB();
      if (!db) {
        // Fallback to localStorage
        localStorage.setItem('lusha_usage_cache', JSON.stringify({
          ...usageData,
          cachedAt: Date.now()
        }));
        return;
      }

      const usageRef = db.collection('lusha_cache').doc('usage_data');
      await usageRef.set({
        ...usageData,
        cachedAt: Date.now(),
        lastUpdated: Date.now()
      });
      
      console.log('[Lusha Usage] Cached usage data to Firebase');
    } catch (e) {
      console.warn('[Lusha Usage] Failed to cache usage data:', e);
    }
  }

  // Load cached usage data
  async function loadCachedUsageData() {
    try {
      const db = await getLushaCacheDB();
      if (!db) {
        // Fallback to localStorage
        const cached = localStorage.getItem('lusha_usage_cache');
        if (cached) {
          const data = JSON.parse(cached);
          // Use cache if less than 5 minutes old
          if (Date.now() - data.cachedAt < 300000) {
            return data;
          }
        }
        return null;
      }

      const usageRef = db.collection('lusha_cache').doc('usage_data');
      const snap = await usageRef.get();
      
      if (snap.exists) {
        const data = snap.data();
        // Use cache if less than 5 minutes old
        if (Date.now() - data.cachedAt < 300000) {
          return data;
        }
      }
      return null;
    } catch (e) {
      console.warn('[Lusha Usage] Failed to load cached usage data:', e);
      return null;
    }
  }

  // Debug logging function
  function lushaLog(){ /* debug disabled in production */ }

  function ensureLushaStyles(){
    // Removed inline styles - using main.css styles instead for refined appearance
    // Only keep essential animation helpers that don't exist in main.css
    if (document.getElementById('lusha-styles')) return;
    const style = document.createElement('style');
    style.id = 'lusha-styles';
    style.textContent = `
       /* Simple crossfade helpers - minimal styles not in main.css */
       #lusha-widget .is-hidden { opacity: 0; pointer-events: none; }
       #lusha-widget .is-shown { opacity: 1; }
       #lusha-widget #lusha-loading, #lusha-widget #lusha-results {
         transition: opacity 500ms ease;
       }

      /* Company summary fade-in */
      #lusha-widget .fade-in-block { opacity: 0; transition: opacity 300ms ease; }
      #lusha-widget .fade-in-block.in { opacity: 1; }
      
      /* Animation helper */
      #lusha-widget.lusha-anim { will-change: opacity, transform; }
      
      /* Animation classes for reveal effects */
      #lusha-widget .lusha-reveal-in {
        animation: lushaRevealIn 0.4s ease-out forwards;
      }
      
      #lusha-widget .lusha-placeholder-out {
        animation: lushaPlaceholderOut 0.3s ease-in forwards;
      }
      
      @keyframes lushaRevealIn {
        0% {
          opacity: 0;
          transform: translateY(8px) scale(0.95);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      @keyframes lushaPlaceholderOut {
        0% {
          opacity: 0.6;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(0.95);
        }
      }

      /* Usage bar - specific to widget */
      #lusha-widget .lusha-usage-wrap {
        display: flex;
        align-items: center;
        gap: 0;
        margin: 10px 0 0 0;
        color: var(--text-muted);
        font-size: 12px;
      }
      #lusha-widget #lusha-usage-text {
        margin-left: 8px;
      }
      #lusha-widget .lusha-usage-bar {
        position: relative;
        height: 8px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        flex: 1;
        overflow: hidden;
        margin-left: 8px;
      }
      #lusha-widget .lusha-usage-fill {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 0%;
        background: var(--orange-subtle);
        transition: width .3s ease;
      }

      /* Layout to keep usage footer stuck to bottom of results */
      #lusha-widget .lusha-results { display: flex; flex-direction: column; }
      #lusha-widget #lusha-contacts-list { 
        flex: 1 1 auto; 
        perspective: 1000px;
      }
      #lusha-widget .lusha-usage-footer { margin-top: 10px; }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper function to format phone numbers as clickable links
  function formatPhoneLink(phone) {
    if (!phone) return '—';
    const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits
    const displayPhone = escapeHtml(phone);
    return `<a href="tel:${cleanPhone}" title="Click to call">${displayPhone}</a>`;
  }

  // Helper function to format emails as clickable links
  function formatEmailLink(email) {
    if (!email) return '—';
    const displayEmail = escapeHtml(email);
    return `<a href="mailto:${displayEmail}" title="Click to email">${displayEmail}</a>`;
  }

  function showCreditsUsed(credits, type) {
    try {
      const listEl = document.getElementById('lusha-contacts-list');
      if (!listEl) return;
      
      // Remove existing credits chip
      const existingChip = listEl.querySelector('.lusha-credits-chip');
      if (existingChip) existingChip.remove();
      
      // Track session credits
      if (type !== 'cached' && credits > 0) {
        trackSessionCredits('searches', credits);
      }
      
      // Get session summary for display
      const sessionSummary = getSessionCreditSummary();
      const sessionCredits = sessionSummary.sessionCreditsUsed;
      
      let text;
      if (type === 'cached') {
        text = `0 credits used (cached) • ${sessionCredits} this session`;
      } else {
        text = `${credits} credit${credits !== 1 ? 's' : ''} used • ${sessionCredits} this session`;
      }
      
      // Log credit usage for tracking
      console.log(`[Lusha Credit Usage] ${text} - Type: ${type}`);
      
      const chip = document.createElement('div');
      chip.className = 'lusha-credits-chip';
      chip.style.display = 'block';
      chip.style.textAlign = 'center';
      chip.style.marginTop = '0px';
      chip.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--orange-subtle);border:1px solid var(--orange-primary);border-radius:16px;font-size:12px;color:#ffffff;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          ${escapeHtml(text)}
        </div>
      `;
      
      listEl.appendChild(chip);

      // Also render a live usage bar beneath the chip
      try { renderUsageBar(); } catch(_) {}
      
      // Animate in the chip
      const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduce) {
        chip.style.opacity = '0';
        chip.style.transform = 'translateY(8px)';
        requestAnimationFrame(() => {
          chip.style.transition = 'opacity 300ms ease, transform 300ms ease';
          chip.style.opacity = '1';
          chip.style.transform = 'translateY(0)';
        });
      }
    } catch(_) {}
  }

  // Public API
  function openLusha(contactId) {
    currentContactId = contactId;
    currentEntityType = 'contact';
    removeExistingWidget();
    makeCard(contactId, 'contact');
    // Removed toast notification
  }

  function openLushaForAccount(accountId) {
    lushaLog('openLushaForAccount called with:', accountId);
    console.log('[Lusha] openLushaForAccount called with:', accountId);
    currentAccountId = accountId;
    currentEntityType = 'account';
    removeExistingWidget();
    makeCard(accountId, 'account');
    // Ensure prefill runs after widget is created
    setTimeout(() => {
      lushaLog('Running prefill for account...');
      console.log('[Lusha] Running prefill for account...');
      try { prefillInputs('account'); } catch(e) { 
        lushaLog('Prefill error:', e);
        console.log('[Lusha] Prefill error:', e); 
      }
    }, 100);
    // Removed toast notification
  }

  function closeLusha() {
    closeLushaWidget();
  }

  function isLushaOpen() {
    return !!document.getElementById(WIDGET_ID);
  }

  // Expose public API
  window.Widgets.openLusha = openLusha;
  window.Widgets.openLushaForAccount = openLushaForAccount;
  window.Widgets.closeLusha = closeLusha;
  window.Widgets.isLushaOpen = isLushaOpen;

})();

// Simple crossfade helper
function crossfadeToResults(){
  try {
    const loadingEl = document.getElementById('lusha-loading');
    const resultsEl = document.getElementById('lusha-results');
    if (!loadingEl || !resultsEl) return;
      
    // Ensure layout is stable before transition
    void resultsEl.offsetHeight; // force reflow

    // Loading is already hidden, just show results immediately
    resultsEl.style.display = 'block';
    resultsEl.classList.remove('is-hidden');
    resultsEl.classList.add('is-shown');
    
    // Clean up loading classes
    try { 
      loadingEl.classList.remove('is-shown', 'is-hidden');
    } catch(_){} 
  } catch(_) {}
}

// Helper function to animate placeholder out and content in
function animateRevealContent(container, newContent) {
  try {
    const placeholder = container.querySelector('.lusha-placeholder');
    const contactCard = container.closest('.lusha-contact-item');
    
    if (placeholder) {
      // Store current height for smooth transition
      const currentHeight = container.offsetHeight;
      
      // Animate placeholder out
      placeholder.classList.add('lusha-placeholder-out');
      
      // After placeholder animation, replace with new content
      setTimeout(() => {
        // Temporarily set height to prevent layout jump
        container.style.height = currentHeight + 'px';
        container.style.transition = 'height 0.3s ease';
        
        container.innerHTML = newContent;
        
        // Calculate new height after content is added
        const newHeight = container.offsetHeight;
        
        // Animate to new height
        requestAnimationFrame(() => {
          container.style.height = newHeight + 'px';
        });
        
        // Animate new content in
        const newItems = container.querySelectorAll('.lusha-value-item');
        newItems.forEach((item, index) => {
          item.style.opacity = '0';
          item.style.transform = 'translateY(8px) scale(0.95)';
          
          setTimeout(() => {
            item.classList.add('lusha-reveal-in');
          }, index * 100); // Stagger animation for multiple items
        });
        
        // Remove height constraint after animation
        setTimeout(() => {
          container.style.height = '';
          container.style.transition = '';
        }, 300);
        
        // Add subtle card animation if contact card exists
        if (contactCard) {
          contactCard.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
          contactCard.style.transform = 'scale(1.01)';
          contactCard.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.15)';
          
          setTimeout(() => {
            contactCard.style.transform = '';
            contactCard.style.boxShadow = '';
            contactCard.style.transition = '';
          }, 300);
        }
        
      }, 300); // Match placeholder-out animation duration
    } else {
      // No placeholder, just replace content with smooth height transition
      const currentHeight = container.offsetHeight;
      container.style.height = currentHeight + 'px';
      container.style.transition = 'height 0.3s ease';
      
      container.innerHTML = newContent;
      
      const newHeight = container.offsetHeight;
      requestAnimationFrame(() => {
        container.style.height = newHeight + 'px';
      });
      
      const newItems = container.querySelectorAll('.lusha-value-item');
      newItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(8px) scale(0.95)';
        
        setTimeout(() => {
          item.classList.add('lusha-reveal-in');
        }, index * 100);
      });
      
      // Remove height constraint after animation
      setTimeout(() => {
        container.style.height = '';
        container.style.transition = '';
      }, 300);
    }
  } catch(e) {
    console.warn('Animation failed, falling back to direct replacement:', e);
    container.innerHTML = newContent;
  }
}

// Helper function to poll for phone numbers delivered asynchronously via webhook
async function pollForPhoneNumbers(personId, contact, wrap, container) {
  const maxAttempts = 30; // Poll for up to 2.5 minutes (30 attempts * 5 seconds)
  const pollInterval = 5000; // 5 seconds between polls (reduced from 10s for faster response)
  let attempts = 0;
  
  let base = (window.API_BASE_URL || '').replace(/\/$/, '');
  if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-south1.run.app';
  
  const poll = async () => {
    attempts++;
    
    try {
      lushaLog(`Polling for phones (attempt ${attempts}/${maxAttempts}) for person:`, personId);
      
      const response = await fetch(`${base}/api/apollo/phone-retrieve?personId=${encodeURIComponent(personId)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.ready && data.phones && data.phones.length > 0) {
        // Phone numbers arrived!
        lushaLog('Phone numbers received:', data.phones.length);
        
        // Extract phone numbers
        const phones = data.phones.map(p => ({
          number: p.sanitized_number || p.raw_number,
          type: p.type || 'work'
        }));
        
        // Update UI
        const phoneNumbers = phones.map(p => p.number).filter(Boolean);
        const newContent = phoneNumbers.map(v => `<div class="lusha-value-item">${formatPhoneLink(v)}</div>`).join('');
        animateRevealContent(wrap, newContent);
        
        // Update contact object
        contact.phones = phones;
        if (phoneNumbers.length > 0) {
          contact.phone = phoneNumbers[0];
        }
        
        // Update in allContacts cache
        try {
          const id = contact.id || contact.contactId;
          const idx = allContacts.findIndex(c => (c.id || c.contactId) === id);
          if (idx >= 0) {
            allContacts[idx].phones = phones;
            allContacts[idx].hasPhones = phones.length > 0;
            if (phoneNumbers[0]) allContacts[idx].phone = phoneNumbers[0];
            lushaLog('Updated phone numbers in cache for:', id);
          }
        } catch(e) {
          lushaLog('Failed to update cache:', e);
        }
        
        // Show success toast
        if (window.crm?.showToast) {
          window.crm.showToast(`✅ Revealed ${phoneNumbers.length} phone number(s)`, 'success');
        }
        
        return; // Done!
      }
      
      // Not ready yet, continue polling
      if (attempts < maxAttempts) {
        lushaLog(`Phone numbers not ready yet, polling again in ${pollInterval/1000}s...`);
        setTimeout(poll, pollInterval);
      } else {
        // Timeout - show error
        lushaLog('Phone polling timeout after', attempts, 'attempts');
        const timeoutContent = '<div class="lusha-value-item" style="color: var(--text-muted);">⏱️ Phone reveal timed out. Try again later.</div>';
        animateRevealContent(wrap, timeoutContent);
        
        if (window.crm?.showToast) {
          window.crm.showToast('Phone reveal is taking longer than expected. Try again later.', 'warning');
        }
      }
      
    } catch (error) {
      lushaLog('Phone polling error:', error);
      
      // Retry on error (up to max attempts)
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval);
      } else {
        const errorContent = '<div class="lusha-value-item">—</div>';
        animateRevealContent(wrap, errorContent);
        
        if (window.crm?.showToast) {
          window.crm.showToast('Failed to reveal phone numbers', 'error');
        }
      }
    }
  };
  
  // Start polling after a short delay
  setTimeout(poll, 1000); // Initial 1-second delay before first poll (reduced for faster response)
}

// Helper function to set credit total (can be called manually if needed)
function setLushaCreditTotal(total) {
  try {
    if (typeof total === 'number' && total > 0) {
      window.LUSHA_CREDITS_TOTAL = total;
      localStorage.setItem('LUSHA_CREDITS_TOTAL', total.toString());
      console.log('[Lusha Usage] Set credit total to:', total);
      // Force refresh the usage bar
      window.__lushaUsageLastFetch = 0;
      renderUsageBar();
    }
  } catch(_) {}
}

// Expose globally for manual use
window.setLushaCreditTotal = setLushaCreditTotal;

// Helper function to force refresh usage bar (for testing)
function refreshLushaUsageBar() {
  window.__lushaUsageLastFetch = 0;
  renderUsageBar();
}
window.refreshLushaUsageBar = refreshLushaUsageBar;

// Quick fix function to immediately update the display
function fixLushaCreditDisplay() {
  try {
    const txt = document.getElementById('lusha-usage-text');
    const fill = document.getElementById('lusha-usage-fill');
    const lab = document.getElementById('lusha-usage-label');
    
    if (txt) {
      // Get current used value from the text
      const currentText = txt.textContent;
      const usedMatch = currentText.match(/(\d+)/);
      const used = usedMatch ? parseInt(usedMatch[1]) : 0;
      
      // Calculate total: if we have 323 used and 277 remaining, total = 600
      // This matches your 600-credit plan
      const total = 600; // Your plan total
      const pct = Math.round((used / total) * 100);
      
      txt.textContent = `${used}/${total}`;
      if (fill) fill.style.width = pct + '%';
      if (lab) lab.textContent = 'Credits';
      
      console.log('[Lusha Usage] Quick fix applied - used:', used, 'total:', total, 'pct:', pct + '%');
    }
  } catch(e) {
    console.error('[Lusha Usage] Quick fix failed:', e);
  }
}
window.fixLushaCreditDisplay = fixLushaCreditDisplay;

// Test function to verify hover effects are working
function testLushaHoverEffects() {
  const contactItems = document.querySelectorAll('.lusha-contact-item');
  console.log('Found', contactItems.length, 'contact items');
  
  if (contactItems.length > 0) {
    const firstItem = contactItems[0];
    console.log('Testing hover effect on first contact item...');
    
    // Manually apply the hover styles
    firstItem.style.transform = 'translateY(-20px) scale(1.05)';
    firstItem.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.4)';
    firstItem.style.zIndex = '1000';
    firstItem.style.border = '3px solid #ff6b35';
    
    console.log('Applied test styles. You should see the card lift up with an orange border.');
    
    // Remove after 3 seconds
    setTimeout(() => {
      firstItem.style.transform = '';
      firstItem.style.boxShadow = '';
      firstItem.style.zIndex = '';
      firstItem.style.border = '';
      console.log('Removed test styles.');
    }, 3000);
  } else {
    console.log('No contact items found. Make sure the Lusha widget is open and has results.');
  }
}
window.testLushaHoverEffects = testLushaHoverEffects;

// Render usage bar with cached data (immediate display)
function renderUsageBarWithData(cachedData) {
  try {
    const usage = cachedData.usage || {};
    const headers = cachedData.headers || {};
    
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Allow manual override if your plan credits are known (e.g., 600)
    const configuredTotal = (function(){
      const fromWindow = toNum(window.LUSHA_CREDITS_TOTAL);
      if (fromWindow != null) return fromWindow;
      try { const ls = toNum(localStorage.getItem('LUSHA_CREDITS_TOTAL')); if (ls != null) return ls; } catch(_) {}
      // Default to 600 credits if not configured
      return 600;
    })();

    // Deterministic pick helper (accepts 0 as valid)
    const pick = (...vals) => {
      for (const v of vals) { const n = toNum(v); if (n != null) return n; }
      return null;
    };

    // Prefer true credits if present in payload
    const creditsTotal = pick(
      configuredTotal,
      usage.total,
      usage.totalCredits,
      usage?.credits?.total,
      usage?.credits?.limit,
      usage?.plan?.totalCredits,
      usage?.plan?.limit,
      usage?.account?.credits?.total,
      usage?.account?.credits?.limit
    );
    const creditsUsed = pick(
      usage.used,
      usage.usedCredits,
      usage?.credits?.used,
      usage?.account?.credits?.used
    );

    let label = 'Credits';
    let limit;
    let used;

    // Hard code to always show Usage/600 format
    limit = 600; // Your 600-credit plan
    used = (creditsUsed != null && creditsUsed >= 0) ? creditsUsed : 0;
    label = 'Credits';

    const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round((used / limit) * 100))) : 0;

    // Anchor usage bar in persistent footer (not wiped by pagination)
    const resultsEl = document.getElementById('lusha-results');
    if (!resultsEl) return;
    let footer = document.getElementById('lusha-usage-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.id = 'lusha-usage-footer';
      footer.className = 'lusha-usage-footer';
      resultsEl.appendChild(footer);
    }

    let wrap = document.getElementById('lusha-usage-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'lusha-usage-wrap';
      wrap.className = 'lusha-usage-wrap';
      wrap.innerHTML = `
          <div id="lusha-usage-label">${label}</div>
        <div class="lusha-usage-bar"><div class="lusha-usage-fill" id="lusha-usage-fill"></div></div>
        <div id="lusha-usage-text">–</div>
      `;
      footer.appendChild(wrap);
    } else if (wrap.parentElement !== footer) {
      // If it exists somewhere else, move it to footer
      footer.appendChild(wrap);
    }

    const fill = document.getElementById('lusha-usage-fill');
    const txt = document.getElementById('lusha-usage-text');
    const lab = document.getElementById('lusha-usage-label');
    if (fill) fill.style.width = pct + '%';
    
    const displayText = limit ? `${used}/${limit}` : `${used} used`;
    console.log('[Lusha Usage] Cached display - used:', used, 'limit:', limit, 'displayText:', displayText, 'pct:', pct);
    
    if (txt) txt.textContent = displayText;
    if (lab) lab.textContent = label;
  } catch (e) {
    console.warn('[Lusha Usage] Failed to render cached usage bar:', e);
  }
}

// Fetch and render live Lusha usage bar (rate-limited server endpoint)
async function renderUsageBar(){
  try {
    // First, try to load cached usage data for immediate display
    const cachedUsage = await loadCachedUsageData();
    if (cachedUsage) {
      console.log('[Lusha Usage] Using cached usage data for immediate display');
      renderUsageBarWithData(cachedUsage);
    }

    // Throttle to avoid exceeding Lusha's ~5/minute usage endpoint limit
    const now = Date.now();
    try {
      if (!window.__lushaUsageLastFetch) window.__lushaUsageLastFetch = 0;
      // 15s min interval
      if (now - window.__lushaUsageLastFetch < 15000) return;
      window.__lushaUsageLastFetch = now;
    } catch(_) {}

    let base = (window.API_BASE_URL || '').replace(/\/$/, '');
        if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm-792458658491.us-south1.run.app';
    const resp = await fetch(`${base}/api/apollo/usage`, { method: 'GET' });
    if (!resp.ok) {
      console.log('[Lusha Usage] API request failed:', resp.status, resp.statusText);
      // Fallback: show hard-coded 600 total with 0 used if API fails
      const fallbackLimit = 600;
      const fallbackUsed = 0;
      const fallbackPct = 0;
      
      const resultsEl = document.getElementById('lusha-results');
      if (!resultsEl) return;
      
      let footer = document.getElementById('lusha-usage-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.id = 'lusha-usage-footer';
        footer.className = 'lusha-usage-footer';
        resultsEl.appendChild(footer);
      }
      
      let wrap = document.getElementById('lusha-usage-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'lusha-usage-wrap';
        wrap.className = 'lusha-usage-wrap';
        wrap.innerHTML = `
          <div id="lusha-usage-label">Credits</div>
          <div class="lusha-usage-bar"><div class="lusha-usage-fill" id="lusha-usage-fill"></div></div>
          <div id="lusha-usage-text">–</div>
        `;
        footer.appendChild(wrap);
      }
      
      const fill = document.getElementById('lusha-usage-fill');
      const txt = document.getElementById('lusha-usage-text');
      const lab = document.getElementById('lusha-usage-label');
      if (fill) fill.style.width = fallbackPct + '%';
      if (txt) txt.textContent = `${fallbackUsed}/${fallbackLimit}`;
      if (lab) lab.textContent = 'Credits';
      
      console.log('[Lusha Usage] Using fallback display - used:', fallbackUsed, 'limit:', fallbackLimit);
      return;
    }
    const data = await resp.json();
    console.log('[Lusha Usage] Raw API response:', data);
    const usage = data && data.usage ? data.usage : {};
    const headers = data && data.headers ? data.headers : {};
    console.log('[Lusha Usage] Parsed usage:', usage, 'headers:', headers);
    
    // Cache the usage data for immediate display next time
    await cacheUsageData({ usage, headers });

    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Allow manual override if your plan credits are known (e.g., 600)
    const configuredTotal = (function(){
      const fromWindow = toNum(window.LUSHA_CREDITS_TOTAL);
      if (fromWindow != null) return fromWindow;
      try { const ls = toNum(localStorage.getItem('LUSHA_CREDITS_TOTAL')); if (ls != null) return ls; } catch(_) {}
      // Default to 600 credits if not configured
      return 600;
    })();

    // Deterministic pick helper (accepts 0 as valid)
    const pick = (...vals) => {
      for (const v of vals) { const n = toNum(v); if (n != null) return n; }
      return null;
    };

    // Prefer true credits if present in payload
    const creditsTotal = pick(
      configuredTotal,
      usage.total,
      usage.totalCredits,
      usage?.credits?.total,
      usage?.credits?.limit,
      usage?.plan?.totalCredits,
      usage?.plan?.limit,
      usage?.account?.credits?.total,
      usage?.account?.credits?.limit
    );
    const creditsUsed = pick(
      usage.used,
      usage.usedCredits,
      usage?.credits?.used,
      usage?.account?.credits?.used
    );

    console.log('[Lusha Usage] Calculated creditsTotal:', creditsTotal, 'creditsUsed:', creditsUsed, 'configuredTotal:', configuredTotal);

    let label = 'Credits';
    let limit;
    let used;

    // Hard code to always show Usage/600 format
    limit = 600; // Your 600-credit plan
      used = (creditsUsed != null && creditsUsed >= 0) ? creditsUsed : 0;
      label = 'Credits';
    
    console.log('[Lusha Usage] Hard coded display - used:', used, 'total:', limit, 'format: Usage/600');

    const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round((used / limit) * 100))) : 0;

    // Use the same rendering logic as cached data
    renderUsageBarWithData({ usage, headers });
  } catch(_) {}
}
