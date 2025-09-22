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
    // Preserve lastCompanyResult so we can pre-render company summary on reopen
    
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
        <h3 class="widget-title">Lusha Contact Search</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="lusha-close" type="button" title="Close Lusha Search" aria-label="Close">×</button>
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
    lushaLog('Context derived:', { companyName, domain, entityType: currentEntityType });

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
            phone: cached.phone,
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
            if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm.vercel.app';

            // Try both domain and name includes to improve match rate (still unbilled)
            const includeAttempts = [];
            if (domain) includeAttempts.push({ domains: [domain] });
            if (companyName) includeAttempts.push({ names: [companyName] });
            if (includeAttempts.length === 0) includeAttempts.push({});

            let best = null;
            const sizes = [1, 10, 40];
            outer: for (const size of sizes) {
              for (const inc of includeAttempts) {
                const requestBody = { 
                  pages: { page: 0, size },
                  filters: { companies: { include: { ...inc } } }
                };
                const r = await fetch(`${base}/api/lusha/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
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
            try { crossfadeToResults(); } catch(_) {}
            showCreditsUsed(0, 'cached');
            try { renderUsageBar(); } catch(_) {}
            return;
          } catch (minErr) {
            lushaLog('Minimal search failed in cached-only mode', minErr);
            // Fall through to error handling below
          }
        } else if (options.openLiveIfUncached) {
          // Open-time flow: run a small live company + contacts search (1 credit) for summary + requestId + 1-page contacts
          let base = (window.API_BASE_URL || '').replace(/\/$/, '');
          if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm.vercel.app';

          // Company summary first (this may bill under "API Company Enrichment" per plan)
          const params = new URLSearchParams();
          if (domain) params.append('domain', domain);
          if (companyName) params.append('company', companyName);
          const url = `${base}/api/lusha/company?${params.toString()}`;
          lushaLog('Open-live: fetching company summary from:', url);
          const resp = await fetch(url, { method: 'GET' });
          if (resp.ok) {
            const company = await resp.json();
            lastCompanyResult = company;
            try { requestAnimationFrame(() => renderCompanyPanel(company, false)); } catch(_) { renderCompanyPanel(company, false); }
          }

          // Minimal contacts page (pageSize=40 limited to maxPages=1 for rich preview)
          const requestBody = {
            pages: { page: 0, size: 40 },
            filters: { companies: { include: {} } }
          };
          if (domain) requestBody.filters.companies.include.domains = [domain];
          else if (companyName) requestBody.filters.companies.include.names = [companyName];

          const r = await fetch(`${base}/api/lusha/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          const contacts = Array.isArray(data.contacts) ? data.contacts : [];
          if (data.requestId) {
            window.__lushaLastRequestId = data.requestId;
            lushaLog('Open-live stored requestId:', data.requestId);
          }

          // Save to cache immediately for future free opens
          try { await saveCache({ company: lastCompanyResult || { name: companyName, domain }, contacts }); } catch(_) {}

          updateResults(contacts, true);
          try { crossfadeToResults(); } catch(_) {}
          showCreditsUsed(1, 'live');
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
      if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm.vercel.app';

      const params = new URLSearchParams();
      if (domain) params.append('domain', domain);
      if (companyName) params.append('company', companyName);
      const url = `${base}/api/lusha/company?${params.toString()}`;
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
      const pageSize = options.pageSize || 1; // minimal by default; can be expanded on explicit action
      let page = 0;
      let total = 0;
      do {
        const requestBody = {
          pages: { page, size: pageSize },
          filters: { companies: { include: {} } }
        };
        if (company.domain) requestBody.filters.companies.include.domains = [company.domain];
        else if (company.id) requestBody.filters.companies.include.ids = [company.id];
        else if (company.name) requestBody.filters.companies.include.names = [company.name];

        lushaLog('Fetching contacts page:', page, 'requestBody:', requestBody);
        const r = await fetch(`${base}/api/lusha/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
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
      
      // Prospecting search is unbilled; indicate live but 0 credits
      showCreditsUsed(0, 'live');
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
        base = 'https://power-choosers-crm.vercel.app';
      }
      
      // Build request body with correct Lusha API structure
      const requestBody = { 
        pages: { page: 0, size: kind==='all' ? 40 : 20 },
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
      const resp = await fetch(`${base}/api/lusha/contacts`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(requestBody) });
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
    const shouldAnimate = !skipAnimation;
    
    const name = escapeHtml(company?.name || '');
    const domainRaw = (company?.domain || company?.fqdn || '') || '';
    const domain = String(domainRaw).replace(/^www\./i,'');
    const website = domain ? `https://${domain}` : '';
    const logo = company?.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="${name} logo" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">` : (domain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(domain, 36) : '') : '');
    const linkedinUrl = company?.linkedin || '';
    const fullDescription = company?.description || '';
    
    // Create collapsible description
    let descHtml = '';
    if (fullDescription) {
      const lines = fullDescription.split('\n');
      const hasMoreThan5Lines = lines.length > 5;
      const previewLines = hasMoreThan5Lines ? lines.slice(0, 5) : lines;
      const remainingLines = hasMoreThan5Lines ? lines.slice(5) : [];
      
      descHtml = `
        <div class="company-desc-container" style="margin-top:6px;width:100%;">
          <div class="company-desc-preview" style="color:var(--text-muted);line-height:1.35;width:100%;">
            ${previewLines.map(line => escapeHtml(line)).join('<br>')}
            ${hasMoreThan5Lines ? '<br><span class="desc-ellipsis" style="color:var(--text-muted);font-style:italic;">...</span>' : ''}
          </div>
          ${hasMoreThan5Lines ? `
            <div class="company-desc-more" style="color:var(--text-muted);line-height:1.35;display:none;width:100%;overflow:hidden;">
              ${remainingLines.map(line => escapeHtml(line)).join('<br>')}
            </div>
            <button class="lusha-desc-toggle" style="background:none;border:none;color:var(--text-primary);cursor:pointer;font-size:12px;margin-top:4px;padding:0;text-decoration:underline;">
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
          <div style="flex:1;">
            <div style="font-weight:600;color:var(--text-primary)">${name}</div>
            ${website ? `<a href="${website}" target="_blank" rel="noopener" class="lusha-weblink">${website}</a>` : ''}
            ${linkedinUrl ? `<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener" class="lusha-linkedin-link" title="Company LinkedIn" style="margin-left:8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>` : ''}
          </div>
        </div>
        ${descHtml}
        <div style="margin-top:8px;display:flex;gap:8px;width:100%;">${accBtn}${enrBtn}
          <button class="lusha-action-btn" id="lusha-live-search-btn" style="margin-left:auto;">
            Search (uses credits)
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
                toggleBtn.textContent = 'Show more';
                
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
                toggleBtn.textContent = 'Show more';
              }
            } else {
              // Expand with animation
              more.style.display = 'block';
              if (ellipsis) ellipsis.style.display = 'none';
              toggleBtn.textContent = 'Show less';
              
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
            addBtn.style.display = exists ? 'none' : '';
            enrichBtn.style.display = exists ? '' : 'none';
            addBtn.onclick = () => addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain });
              enrichBtn.onclick = async () => { try { await addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain }); } catch(_){} };
          }
          if (liveBtn) {
            liveBtn.onclick = () => performLushaSearch({ forceLive: true, pageSize: 1, maxPages: 1 });
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

    const renderList = (arr, attr) => arr.map(v => `<div class="lusha-value-item">${escapeHtml(v)}</div>`).join('') || `<div class="lusha-value-item">—</div>`;

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
              ${renderList(emailList)}
            </div>
          </div>
          <div class="lusha-field">
            <div class="lusha-field-header">
              <div class="lusha-label">Phone Numbers</div>
              <button class="lusha-mini-btn" data-reveal="phones">${hasAnyPhones ? 'Enrich' : 'Reveal'}</button>
            </div>
            <div class="lusha-field-body" data-phones-list>
              ${renderList(phoneList)}
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
      // Check by domain then name
      let existingId = null;
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
      const payload = {
        accountName: companyName,
        name: companyName,
        domain: domain || (lastCompanyResult && lastCompanyResult.domain) || '',
        website: (lastCompanyResult && lastCompanyResult.website) || (domain ? `https://${domain}` : ''),
        industry: (lastCompanyResult && lastCompanyResult.industry) || '',
        employees: (lastCompanyResult && lastCompanyResult.employees) || '',
        shortDescription: (lastCompanyResult && lastCompanyResult.description) || '',
        logoUrl: (lastCompanyResult && lastCompanyResult.logoUrl) || '',
        linkedin: (lastCompanyResult && lastCompanyResult.linkedin) || '',
        source: 'lusha',
        updatedAt: new Date(),
        createdAt: new Date()
      };
      if (existingId) {
        await window.PCSaves.updateAccount(existingId, payload);
        window.crm?.showToast && window.crm.showToast('Enriched existing account');
      } else {
        await db.collection('accounts').add(payload);
        window.crm?.showToast && window.crm.showToast('Account added to CRM');
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
      let base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm.vercel.app';
      const requestId = window.__lushaLastRequestId;
      const id = contact.id || contact.contactId;
      if (!requestId || !id) return;
      const resp = await fetch(`${base}/api/lusha/enrich`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, contactIds: [id] })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const enriched = (data.contacts && data.contacts[0]) || null;
      if (enriched) {
        // Update CRM contact by email match
        await addContactToCRM(Object.assign({}, contact, enriched));
      }
    } catch(e) { console.warn('Enrich contact failed', e); }
  }

  async function revealForContact(contact, which, container){
    try {
      lushaLog('Revealing', which, 'for contact:', contact);
      let base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm.vercel.app';
      const requestId = window.__lushaOpenedFromCache ? null : window.__lushaLastRequestId; // force live when opened from cache
      const id = contact.id || contact.contactId;
      
      let enriched = null;
      
      // Check if this is an "Enrich" action (contact already has data)
      const hasExistingData = (which === 'email' && Array.isArray(contact.emails) && contact.emails.length > 0) ||
                             (which === 'phones' && Array.isArray(contact.phones) && contact.phones.length > 0);
      
      // Always make fresh API call for "Enrich" buttons, or when no requestId available
      // When opened from cache, always make a fresh enrich call (acts like combined reset+reveal)
      if (window.__lushaOpenedFromCache || hasExistingData || !requestId) {
        lushaLog('Making fresh enrich call for', hasExistingData ? 'enrich' : 'reveal');
        try {
          const enrichResp = await fetch(`${base}/api/lusha/enrich`, {
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
      const resp = await fetch(`${base}/api/lusha/enrich`, {
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
          wrap.innerHTML = emails.length ? emails.map(v => `<div class="lusha-value-item">${escapeHtml(v)}</div>`).join('') : '<div class="lusha-value-item">—</div>';
          
          // Update contact object with revealed emails
          contact.emails = enriched.emails || [];
          if (emails.length > 0) {
            contact.email = emails[0]; // Set primary email
          }
        }
      } else if (which === 'phones') {
        const wrap = container.querySelector('[data-phones-list]');
        if (wrap) {
          const phones = Array.isArray(enriched.phones) ? enriched.phones.map(p => p.number).filter(Boolean) : [];
          wrap.innerHTML = phones.length ? phones.map(v => `<div class="lusha-value-item">${escapeHtml(v)}</div>`).join('') : '<div class="lusha-value-item">—</div>';
          
          // Update contact object with revealed phones
          contact.phones = enriched.phones || [];
          if (phones.length > 0) {
            contact.phone = phones[0]; // Set primary phone
          }
        }
      }

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
      const email = contact.email || (Array.isArray(contact.emails) && contact.emails[0] && contact.emails[0].address) || '';
      let contactExists = false;
      try {
        if (email) {
          const s = await db.collection('contacts').where('email','==',email).limit(1).get();
          contactExists = !!(s && s.docs && s.docs[0]);
        }
      } catch(_){}
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
          const ids = [];
          if (domain) ids.push(`lusha_cache_${domain.toLowerCase()}`);
          if (companyName) ids.push(`lusha_cache_name_${companyName.toLowerCase()}`);
          for (const id of ids) {
            const raw = localStorage.getItem(id);
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
      let doc = null;
      if (domain) {
        const snap = await db.collection('lusha_cache').doc(domain.toLowerCase()).get();
        if (snap && snap.exists) doc = { id: snap.id, ...snap.data() };
      }
      if (!doc && companyName) {
        // simple name-keyed cache
        const id = ('name_' + companyName.toLowerCase());
        const snap = await db.collection('lusha_cache').doc(id).get();
        if (snap && snap.exists) doc = { id: snap.id, ...snap.data() };
      }
      if (doc && doc.contacts && doc.contacts.length) return doc;

      // Fallback to localStorage if Firestore empty
      try {
        const ids = [];
        if (domain) ids.push(`lusha_cache_${domain.toLowerCase()}`);
        if (companyName) ids.push(`lusha_cache_name_${companyName.toLowerCase()}`);
        for (const id of ids) {
          const raw = localStorage.getItem(id);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.contacts) && parsed.contacts.length) return parsed;
          }
        }
      } catch(_) {}
      return null;
    } catch (_) { return null; }
  }
  async function saveCache({ company, contacts }){
    try {
      const db = await getLushaCacheDB();
      const domain = (company && (company.domain || company.fqdn)) || '';
      const companyName = company && (company.name || company.companyName) || '';
      const docId = (domain ? domain.toLowerCase() : ('name_' + (companyName || 'unknown').toLowerCase()));
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
        phone: company && company.phone || existing.phone || '',
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
      const docId = (domain ? domain.toLowerCase() : ('name_' + (companyName || 'unknown').toLowerCase()));
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
      const docId = (domain ? domain.toLowerCase() : ('name_' + (companyName || 'unknown').toLowerCase()));
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

  // Debug logging function
  function lushaLog(...args) {
    if (window.CRM_DEBUG_LUSHA || localStorage.CRM_DEBUG_LUSHA === '1') {
      console.log('[Lusha]', ...args);
    }
  }

  function ensureLushaStyles(){
    if (document.getElementById('lusha-styles')) return;
    const style = document.createElement('style');
    style.id = 'lusha-styles';
    style.textContent = `
       /* Simple crossfade helpers */
       #lusha-widget .is-hidden { opacity: 0; pointer-events: none; }
       #lusha-widget .is-shown { opacity: 1; }
       #lusha-widget #lusha-loading, #lusha-widget #lusha-results {
         transition: opacity 500ms ease;
       }

      /* Company summary fade-in */
      #lusha-widget .fade-in-block { opacity: 0; transition: opacity 300ms ease; }
      #lusha-widget .fade-in-block.in { opacity: 1; }
      /* Lusha Widget Layout - Left-to-Right with Proper Field Alignment */
      #lusha-widget.lusha-anim { will-change: opacity, transform; }
      #lusha-widget .lusha-weblink { 
        color: var(--text-primary); 
        text-decoration: none; 
        transition: var(--transition-fast);
      }
      #lusha-widget .lusha-weblink:hover { 
        color: var(--text-inverse); 
        text-decoration: none; 
      }
      
      /* Contact Item Container */
      #lusha-widget .lusha-contact-item {
        border: 1px solid var(--border-light);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
        background: var(--bg-card);
        overflow: hidden;
        word-wrap: break-word;
      }
      
      /* Contact Header */
      #lusha-widget .lusha-contact-header {
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-light);
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      #lusha-widget .lusha-contact-info {
        flex: 1;
      }
      #lusha-widget .lusha-contact-actions-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 12px;
      }
      #lusha-widget .lusha-linkedin-link {
        color: var(--text-muted);
        text-decoration: none;
        transition: var(--transition-fast);
        display: inline-flex;
        align-items: center;
        padding: 2px;
        border-radius: 4px;
      }
      #lusha-widget .lusha-linkedin-link:hover {
        color: #0077b5;
        text-decoration: none;
      }
      #lusha-widget .lusha-contact-name {
        font-weight: 600;
        font-size: 16px;
        color: var(--text-primary);
        margin-bottom: 4px;
      }
      #lusha-widget .lusha-contact-title {
        font-size: 14px;
        color: var(--text-muted);
      }
      
      /* Left-to-Right Field Layout */
      #lusha-widget .lusha-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      
      /* Individual Field Styling */
      #lusha-widget .lusha-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0; /* Prevent overflow */
      }
      
      #lusha-widget .lusha-field-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      
      #lusha-widget .lusha-label {
        font-weight: 500;
        font-size: 13px;
        color: var(--text-primary);
        min-width: 80px;
      }
      
      #lusha-widget .lusha-field-body {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-height: 20px;
      }
      
      #lusha-widget .lusha-value-item {
        font-size: 14px;
        color: var(--text-primary);
        word-break: break-word;
        white-space: normal;
        line-height: 1.4;
        padding: 2px 0;
      }
      
      /* Buttons */
      #lusha-widget .lusha-mini-btn {
        padding: 4px 8px;
        font-size: 11px;
        border: 1px solid var(--border-light);
        background: var(--bg-item);
        color: var(--text-primary);
        border-radius: 4px;
        cursor: pointer;
        transition: var(--transition-fast);
        white-space: nowrap;
      }
      #lusha-widget .lusha-mini-btn:hover {
        background: var(--bg-hover);
        color: var(--text-inverse);
      }
      
      #lusha-widget .lusha-refresh-top {
        border: 1px solid var(--border-light);
        background: var(--bg-item);
        color: var(--text-primary);
        border-radius: 6px;
        padding: 6px 12px;
        cursor: pointer;
        transition: var(--transition-fast);
      }
      #lusha-widget .lusha-refresh-top:hover {
        background: var(--bg-hover);
        color: var(--text-inverse);
      }
      
      /* Action Buttons */
      #lusha-widget .lusha-contact-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border-light);
      }
      
      #lusha-widget .lusha-action-btn {
        padding: 6px 12px;
        font-size: 12px;
        border: 1px solid var(--border-light);
        background: var(--bg-item);
        color: var(--text-primary);
        border-radius: 4px;
        cursor: pointer;
        transition: var(--transition-fast);
        white-space: nowrap;
      }
      #lusha-widget .lusha-action-btn:hover {
        background: var(--bg-hover);
        color: var(--text-inverse);
      }
      
      /* Responsive Design */
      @media (max-width: 600px) {
        #lusha-widget .lusha-fields {
          grid-template-columns: 1fr;
          gap: 12px;
        }
        #lusha-widget .lusha-contact-actions {
          flex-direction: column;
        }
        #lusha-widget .lusha-action-btn {
          width: 100%;
          text-align: center;
        }
      }
      
      /* Loading States */
      #lusha-widget .lusha-loading {
        text-align: center;
        padding: 20px;
        color: var(--text-muted);
      }
      
      #lusha-widget .lusha-no-results {
        text-align: center;
        padding: 20px;
        color: var(--text-muted);
        font-style: italic;
      }
      
      /* Results Header */
      #lusha-widget .lusha-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-light);
      }
      
      #lusha-widget .lusha-results-header h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
      }
      
      #lusha-widget .lusha-results-count {
        font-size: 14px;
        color: var(--text-muted);
        margin-left: 12px;
      }
      
      /* Pagination - Match accounts page styling */
      #lusha-widget .lusha-pagination {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
      }
      
      #lusha-widget .lusha-pagination-arrow {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        color: var(--text-secondary);
      }
      
      #lusha-widget .lusha-pagination-arrow:hover:not(:disabled) {
        background: var(--grey-700);
        border-color: var(--border-medium);
        color: var(--text-primary);
      }
      
      #lusha-widget .lusha-pagination-arrow:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      #lusha-widget .lusha-pagination-arrow svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
      }
      
      #lusha-widget .lusha-pagination-current-container {
        position: relative;
      }
      
      #lusha-widget .lusha-pagination-current {
        width: 40px;
        height: 32px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        color: var(--text-primary);
        font-weight: 500;
      }

      /* Usage bar */
      #lusha-widget .lusha-usage-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 10px 0 0 0;
        color: var(--text-muted);
        font-size: 12px;
      }
      #lusha-widget .lusha-usage-bar {
        position: relative;
        height: 8px;
        border-radius: 6px;
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        flex: 1;
        overflow: hidden;
      }
      #lusha-widget .lusha-usage-fill {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 0%;
        background: var(--orange-subtle);
        transition: width .3s ease;
      }
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

  function showCreditsUsed(credits, type) {
    try {
      const listEl = document.getElementById('lusha-contacts-list');
      if (!listEl) return;
      
      // Remove existing credits chip
      const existingChip = listEl.querySelector('.lusha-credits-chip');
      if (existingChip) existingChip.remove();
      
      const text = type === 'cached' ? '0 credits used' : `${credits} credit${credits !== 1 ? 's' : ''} used`;
      
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

// Fetch and render live Lusha usage bar (rate-limited server endpoint)
async function renderUsageBar(){
  try {
    // Throttle to avoid exceeding Lusha's ~5/minute usage endpoint limit
    const now = Date.now();
    try {
      if (!window.__lushaUsageLastFetch) window.__lushaUsageLastFetch = 0;
      // 15s min interval
      if (now - window.__lushaUsageLastFetch < 15000) return;
      window.__lushaUsageLastFetch = now;
    } catch(_) {}

    let base = (window.API_BASE_URL || '').replace(/\/$/, '');
    if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://power-choosers-crm.vercel.app';
    const resp = await fetch(`${base}/api/lusha/usage`, { method: 'GET' });
    if (!resp.ok) return;
    const data = await resp.json();
    const usage = data && data.usage ? data.usage : {};
    const headers = data && data.headers ? data.headers : {};

    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // Prefer true credits if present in payload
    const totalCreditCandidates = [
      usage.totalCredits,
      usage.total,
      usage?.credits?.total,
      usage?.plan?.totalCredits,
      usage?.account?.credits?.total
    ];
    const usedCreditCandidates = [
      usage.usedCredits,
      usage.used,
      usage?.credits?.used,
      usage?.account?.credits?.used
    ];
    let creditsTotal = totalCreditCandidates.find(toNum);
    let creditsUsed = usedCreditCandidates.find(toNum);

    let label = 'Credits';
    let limit;
    let used;

    if (creditsTotal != null && creditsUsed != null && creditsTotal >= creditsUsed) {
      limit = creditsTotal;
      used = creditsUsed;
    } else {
      // Fallback: show requests today (rate-limit headers)
      const dailyLimit = toNum(usage.dailyLimit) ?? toNum(headers.dailyLimit) ?? 0;
      const dailyUsed = toNum(usage.dailyUsage) ?? toNum(headers.dailyUsage) ?? 0;
      const dailyRemaining = toNum(usage.dailyRemaining) ?? toNum(headers.dailyRemaining) ?? (dailyLimit ? (dailyLimit - dailyUsed) : 0);
      limit = dailyLimit > 0 ? dailyLimit : (dailyUsed + dailyRemaining);
      used = dailyUsed;
      label = 'Requests today';
    }

    const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round((used / limit) * 100))) : 0;

    const listEl = document.getElementById('lusha-contacts-list');
    if (!listEl) return;
    let wrap = document.getElementById('lusha-usage-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'lusha-usage-wrap';
      wrap.className = 'lusha-usage-wrap';
      wrap.innerHTML = `
        <div id="lusha-usage-label" style="min-width:120px;">${label}</div>
        <div class="lusha-usage-bar"><div class="lusha-usage-fill" id="lusha-usage-fill"></div></div>
        <div id="lusha-usage-text">–</div>
      `;
      listEl.appendChild(wrap);
    }
    const fill = document.getElementById('lusha-usage-fill');
    const txt = document.getElementById('lusha-usage-text');
    const lab = document.getElementById('lusha-usage-label');
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = limit ? `${used}/${limit} (${pct}%)` : `${used} used`;
    if (lab) lab.textContent = label;
  } catch(_) {}
}
