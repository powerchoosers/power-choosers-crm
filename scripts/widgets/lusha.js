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
    // Reset last company context to avoid leaking across pages
    lastCompanyResult = null;
    
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
          <button class="lusha-refresh-top" id="lusha-refresh-btn" type="button" title="Refresh">⟳</button>
          <button class="lusha-close" type="button" title="Close Lusha Search" aria-label="Close">×</button>
        </div>
      </div>
      
      <div class="lusha-body">
        <!-- Company Summary -->
        <div id="lusha-panel-company"></div>
          <div class="lusha-spinner"></div>
          <div class="lusha-loading-text">Searching Lusha database...</div>
        </div>

        <!-- Company Summary -->
        <div id="lusha-panel-company"></div>

        <!-- Results Section -->
        <div class="lusha-results" id="lusha-results" style="display: none;">
          <div class="lusha-results-header">
            <h4>Search Results</h4>
            <div class="lusha-results-count" id="lusha-results-count">0 contacts found</div>
          </div>
          
          <div class="lusha-contacts-list" id="lusha-contacts-list">
            <!-- Results will be populated here -->
          </div>
        </div>
      </div>
    `;

    // Smooth expand-in animation
    const prefersReduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReduce) {
      try { card.classList.add('lusha-anim'); } catch (_) {}
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
    }

    const content = getPanelContentEl();
    if (content.firstChild) content.insertBefore(card, content.firstChild);
    else content.appendChild(card);

    if (!prefersReduce) {
      // Measure natural height and animate to it
      requestAnimationFrame(() => {
        const targetHeight = card.scrollHeight;
        card.style.height = '0px';
        card.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
          card.style.transition = 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease, transform 0.35s ease';
          card.style.height = targetHeight + 'px';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
          
          const onEnd = () => {
            card.style.height = 'auto';
            card.style.overflow = 'visible';
            card.removeEventListener('transitionend', onEnd);
          };
          card.addEventListener('transitionend', onEnd);
        });
      });
    }

    // Bring panel into view
    try {
      const panel = document.getElementById('widget-panel');
      if (panel) panel.scrollTop = 0;
    } catch (_) { /* noop */ }

    attachEventListeners();
    try { prefillInputs(entityType); } catch(_) {}

    // Auto-run search after prefill to skip the input step
    setTimeout(() => { try { performLushaSearch({ forceLive: false }); } catch(_){} }, 120);
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

    // Reset button
    const resetBtn = document.getElementById('lusha-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetLushaForm);
    }

    // Refresh button (force live fetch + enrich and update cache)
    const refreshBtn = document.getElementById('lusha-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        try { await performLushaSearch({ forceLive: true }); } catch(e){ console.warn('Refresh failed', e); }
      });
    }

    // Enter key on inputs
    const inputs = document.querySelectorAll('#lusha-widget .lusha-form-input');
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          performLushaSearch();
        }
      });
    });
  }

  async function performLushaSearch(options = {}) {
    lushaLog('Starting Lusha search with options:', options);
    const loadingEl = document.getElementById('lusha-loading');
    if (loadingEl) loadingEl.style.display = 'block';

    // derive company + domain from page context (no input fields)
    const ctx = getContextDefaults(currentEntityType);
    let companyName = ctx.companyName;
    let domain = ctx.domain;
    lushaLog('Context derived:', { companyName, domain, entityType: currentEntityType });

    try {
      if (!companyName && !domain) {
        throw new Error('No company context found');
      }

      // 1) Try cache first (unless forcing live)
      if (!options.forceLive) {
        lushaLog('Checking cache for:', { domain, companyName });
        const cached = await tryLoadCache({ domain, companyName });
        if (cached && cached.contacts && cached.contacts.length) {
          lushaLog('Using cached contacts:', cached);
          lastCompanyResult = { name: cached.companyName || companyName || '', domain: cached.domain || domain, website: cached.website || '' };
          renderCompanyPanel(lastCompanyResult);
          updateResults(cached.contacts);
          return;
        } else {
          lushaLog('No cache found, proceeding with live search');
        }
      }

      // 2) Live company + contacts search
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
      renderCompanyPanel(company);

      // Pull all pages (search only, no enrichment)
      const collected = [];
      const pageSize = 40;
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
        page += 1;
      } while (collected.length < total && page < 5); // safety max pages

      lushaLog('Final collected contacts:', collected);
      updateResults(collected);
    } catch (error) {
      lushaLog('Search error:', error);
      console.error('Lusha search error:', error);
      try { window.crm?.showToast && window.crm.showToast('Search failed: ' + error.message); } catch (_) {}
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
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
      try { const loadingEl = document.getElementById('lusha-loading'); if (loadingEl) loadingEl.style.display = 'none'; } catch(_){}

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
    
    // Map Lusha phone flags to CRM phone fields
    const phoneMapping = {
      mobile: c.hasMobilePhone || false,
      workDirectPhone: c.hasDirectPhone || false,
      otherPhone: c.hasPhones || false
    };
    
    const mapped = {
      firstName: firstName,
      lastName: lastName,
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
      isSuccess: c.isSuccess !== false // Default to true for search results
    };
    
    lushaLog('Mapping contact:', { original: c, mapped: mapped });
    return mapped;
  }

  function renderCompanyPanel(company){
    const el = document.getElementById('lusha-panel-company');
    if (!el) return;
    const name = escapeHtml(company?.name || '');
    const domainRaw = (company?.domain || company?.fqdn || '') || '';
    const domain = String(domainRaw).replace(/^www\./i,'');
    const website = domain ? `https://${domain}` : '';
    const logo = company?.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="${name} logo" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">` : (domain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(domain, 36) : '') : '');
    const desc = company?.description ? `<div class="company-desc" style="color:var(--text-muted);max-width:640px;line-height:1.35;margin-top:6px;">${escapeHtml(company.description)}</div>` : '';

    // Style overrides for link behavior
    ensureLushaStyles();

    // Company-level actions
    const accBtn = `<button class="lusha-action-btn" id="lusha-add-account">Add Account</button>`;
    const enrBtn = `<button class="lusha-action-btn" id="lusha-enrich-account" style="display:none;">Enrich Account</button>`;

    el.innerHTML = `
      <div class="company-summary" style="padding:8px 0 10px 0;">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:6px;">
          <div>${logo || ''}</div>
          <div>
            <div style="font-weight:600;color:var(--text-primary)">${name}</div>
            ${website ? `<a href="${website}" target="_blank" rel="noopener" class="lusha-weblink">${website}</a>` : ''}
            ${desc}
            <div style="margin-top:8px;display:flex;gap:8px;">${accBtn}${enrBtn}</div>
          </div>
        </div>
      </div>`;

    // Hook up account Add/Enrich
    try {
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
          const addBtn = document.getElementById('lusha-add-account');
          const enrichBtn = document.getElementById('lusha-enrich-account');
          if (addBtn && enrichBtn) {
            addBtn.style.display = exists ? 'none' : '';
            enrichBtn.style.display = exists ? '' : 'none';
            addBtn.onclick = () => addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain });
            enrichBtn.onclick = async () => {
              // Enrich account profile fields
              try { await addAccountToCRM({ company: company.name, companyName: company.name, fqdn: company.domain }); } catch(_){}
            };
          }
        })();
      }
    } catch(_){}
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
    const location = contact.location || contact.city || '';

    const emailList = emailsArr.length ? emailsArr : (contact.email ? [contact.email] : []);
    const phoneList = phonesArr.length ? phonesArr : (contact.phone ? [contact.phone] : []);

    const renderList = (arr, attr) => arr.map(v => `<div class="lusha-value-item">${escapeHtml(v)}</div>`).join('') || `<div class="lusha-value-item">—</div>`;

    div.innerHTML = `
      <div class="lusha-contact-header">
        <div class="lusha-contact-name">${escapeHtml(name)}</div>
        <div class="lusha-contact-title">${escapeHtml(title)}</div>
      </div>
      <div class="lusha-contact-details">
        <div class="lusha-fields">
          <div class="lusha-field">
            <div class="lusha-field-header">
              <div class="lusha-label">Email</div>
              <button class="lusha-mini-btn" data-reveal="email">Reveal</button>
            </div>
            <div class="lusha-field-body" data-email-list>
              ${renderList(emailList)}
            </div>
          </div>
          <div class="lusha-field">
            <div class="lusha-field-header">
              <div class="lusha-label">Phone Numbers</div>
              <button class="lusha-mini-btn" data-reveal="phones">Reveal</button>
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
      revealEmailBtn.addEventListener('click', () => revealForContact(contact, 'email', div));
    }
    if (revealPhonesBtn) {
      revealPhonesBtn.addEventListener('click', () => revealForContact(contact, 'phones', div));
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
      
      // Prepare payload
      const payload = {
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        name: (contact.firstName && contact.lastName) ? `${contact.firstName} ${contact.lastName}`.trim() : (contact.fullName || ''),
        email,
        phone: contact.phone || contact.phoneNumber || (Array.isArray(contact.phones) && contact.phones[0] && contact.phones[0].number) || '',
        companyName,
        title: contact.title || contact.jobTitle || '',
        location: contact.location || contact.city || '',
        // map phone numbers to workDirectPhone/mobile/otherPhone
        workDirectPhone: selectPhone(contact, 'direct') || selectPhone(contact, 'work') || '',
        mobile: selectPhone(contact, 'mobile') || '',
        otherPhone: selectPhone(contact, 'other') || '',
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
      if (!enriched) return;

      // Update UI lists
      if (which === 'email') {
        const wrap = container.querySelector('[data-email-list]');
        if (wrap) {
          const emails = Array.isArray(enriched.emails) ? enriched.emails.map(e => e.address).filter(Boolean) : [];
          wrap.innerHTML = emails.length ? emails.map(v => `<div class="lusha-value-item">${escapeHtml(v)}</div>`).join('') : '<div class="lusha-value-item">—</div>';
        }
      } else if (which === 'phones') {
        const wrap = container.querySelector('[data-phones-list]');
        if (wrap) {
          const phones = Array.isArray(enriched.phones) ? enriched.phones.map(p => p.number).filter(Boolean) : [];
          wrap.innerHTML = phones.length ? phones.map(v => `<div class="lusha-value-item">${escapeHtml(v)}</div>`).join('') : '<div class="lusha-value-item">—</div>';
        }
      }

      // Persist into cache (merge contact by id) AND update CRM if contact exists
      try { 
        await upsertCacheContact({ company: lastCompanyResult }, enriched);
        console.log('[Lusha] Revealed data saved to cache');
        
        // Also update CRM contact if it exists (by email match)
        const email = enriched.emails && enriched.emails[0] && enriched.emails[0].address;
        if (email && window.firebaseDB) {
          try {
            const snap = await window.firebaseDB.collection('contacts').where('email','==',email).limit(1).get();
            if (snap && snap.docs && snap.docs[0]) {
              const existingId = snap.docs[0].id;
              const updatePayload = {};
              
              // Update phone fields if phones were revealed
              if (which === 'phones' && enriched.phones && enriched.phones.length > 0) {
                updatePayload.workDirectPhone = selectPhone(enriched, 'direct') || selectPhone(enriched, 'work') || '';
                updatePayload.mobile = selectPhone(enriched, 'mobile') || '';
                updatePayload.otherPhone = selectPhone(enriched, 'other') || '';
                updatePayload.phone = enriched.phones[0].number || '';
              }
              
              // Update email if emails were revealed
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
    return out;
  }

  function updateResults(contacts){
    try {
      lushaLog('Updating results with contacts:', contacts);
      const resultsWrap = document.getElementById('lusha-results');
      const countEl = document.getElementById('lusha-results-count');
      const listEl = document.getElementById('lusha-contacts-list');
      if (resultsWrap) resultsWrap.style.display = 'block';
      if (countEl) countEl.textContent = `${contacts.length} contact${contacts.length===1?'':'s'} found`;
      if (listEl) {
        listEl.innerHTML = '';
        if (contacts.length === 0) {
          lushaLog('No contacts to display');
          const empty = document.createElement('div');
          empty.className = 'lusha-no-results';
          empty.textContent = 'No results found.';
          listEl.appendChild(empty);
        } else {
          lushaLog('Creating contact elements for', contacts.length, 'contacts');
          contacts.forEach((c,i) => {
            const mapped = mapProspectingContact(c);
            lushaLog(`Creating element ${i}:`, mapped);
            listEl.appendChild(createContactElement(mapped, i));
          });
        }
      }
    } catch (e) { 
      lushaLog('Update results failed:', e);
      console.error('Update results failed', e); 
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
      if (!db) return null;
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
      return null;
    } catch (_) { return null; }
  }
  async function saveCache({ company, contacts }){
    try {
      const db = await getLushaCacheDB();
      if (!db) return;
      const domain = (company && (company.domain || company.fqdn)) || '';
      const companyName = company && (company.name || company.companyName) || '';
      const docId = (domain ? domain.toLowerCase() : ('name_' + (companyName || 'unknown').toLowerCase()));
      const payload = {
        domain: domain || '',
        companyName: companyName || '',
        website: company && company.website || (domain ? ('https://' + domain) : ''),
        companyId: company && (company.id || null),
        contacts: (contacts || []).map(mapProspectingContact),
        updatedAt: new Date()
      };
      await db.collection('lusha_cache').doc(docId).set(payload, { merge: true });
      console.log('[Lusha] Cache saved', docId, payload);
    } catch (e) { console.warn('[Lusha] Cache save failed', e); }
  }

  async function upsertCacheContact({ company }, enriched){
    try {
      const db = await getLushaCacheDB();
      if (!db) return;
      const domain = (company && (company.domain || company.fqdn)) || '';
      const companyName = company && (company.name || company.companyName) || '';
      const docId = (domain ? domain.toLowerCase() : ('name_' + (companyName || 'unknown').toLowerCase()));
      const ref = db.collection('lusha_cache').doc(docId);
      const snap = await ref.get();
      const existing = snap.exists ? (snap.data() || {}) : {};
      const arr = Array.isArray(existing.contacts) ? existing.contacts.slice() : [];
      const idx = arr.findIndex(x => (x.id || x.contactId) === (enriched.id || enriched.contactId));
      const mapped = mapProspectingContact(enriched);
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], mapped);
      else arr.push(mapped);
      await ref.set({ contacts: arr, updatedAt: new Date() }, { merge: true });
      console.log('[Lusha] Cache upserted contact', mapped.id);
    } catch (e) { console.warn('[Lusha] Cache upsert failed', e); }
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
      /* Lusha Widget Layout - Left-to-Right with Proper Field Alignment */
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

  // Public API
  function openLusha(contactId) {
    currentContactId = contactId;
    currentEntityType = 'contact';
    removeExistingWidget();
    makeCard(contactId, 'contact');
    try { window.crm?.showToast && window.crm.showToast('Lusha Contact Search opened'); } catch (_) {}
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
    try { window.crm?.showToast && window.crm.showToast('Lusha Contact Search opened'); } catch (_) {}
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
