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
        <button class="lusha-close" type="button" title="Close Lusha Search" aria-label="Close">×</button>
      </div>
      <div class="lusha-subtitle">Search for company and contacts using Lusha API</div>
      
      <div class="lusha-body">
        <div class="lusha-search-section">
          <div class="lusha-input-group">
            <label for="lusha-company-search" class="lusha-input-label">Company Name</label>
            <input type="text" id="lusha-company-search" class="lusha-form-input" placeholder="Enter company name" value="${escapeHtml(accountName)}">
          </div>
          <div class="lusha-input-group">
            <label for="lusha-company-domain" class="lusha-input-label">Website / Domain (preferred)</label>
            <input type="text" id="lusha-company-domain" class="lusha-form-input" placeholder="e.g., powerchoosers.com">
          </div>
          
          <div class="lusha-input-group">
            <label for="lusha-contact-name" class="lusha-input-label">Contact Name (Optional)</label>
            <input type="text" id="lusha-contact-name" class="lusha-form-input" placeholder="First Last">
          </div>
          
          <div class="lusha-input-group">
            <label for="lusha-contact-email" class="lusha-input-label">Email (Optional)</label>
            <input type="email" id="lusha-contact-email" class="lusha-form-input" placeholder="contact@company.com">
          </div>
          
          <div class="lusha-button-group">
            <button id="lusha-search-btn" class="lusha-search-btn">Search</button>
            <button id="lusha-reset-btn" class="lusha-reset-btn">Reset</button>
          </div>
        </div>
        
        <!-- Loading state -->
        <div class="lusha-loading" id="lusha-loading" style="display: none;">
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
    return card;
  }

  function attachEventListeners() {
    // Close button
    const closeBtn = document.getElementById(WIDGET_ID)?.querySelector('.lusha-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeLushaWidget);
    }

    // Search button
    const searchBtn = document.getElementById('lusha-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', performLushaSearch);
    }

    // Reset button
    const resetBtn = document.getElementById('lusha-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetLushaForm);
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

  async function performLushaSearch() {
    const companyInput = document.getElementById('lusha-company-search');
    const domainInput = document.getElementById('lusha-company-domain');
    const loadingEl = document.getElementById('lusha-loading');
    const searchBtn = document.getElementById('lusha-search-btn');

    const companyName = companyInput?.value?.trim();
    const domainRaw = domainInput?.value?.trim();
    const domain = deriveDomain(domainRaw);

    if (!companyName && !domain) {
      try { window.crm?.showToast && window.crm.showToast('Enter company or domain'); } catch(_) {}
      return;
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (searchBtn) { searchBtn.disabled = true; searchBtn.textContent = 'Searching...'; }

    try {
      // 1) Try cache first to avoid credits
      const cached = await tryLoadCache({ domain, companyName });
      if (cached && cached.contacts && cached.contacts.length) {
        console.log('[Lusha] Using cached contacts', cached);
        // Render company summary (from cache or rebuild minimal)
        lastCompanyResult = { name: cached.companyName || companyName || '', domain: cached.domain || domain, website: cached.website || '' };
        renderCompanyPanel(lastCompanyResult);
        updateResults(cached.contacts);
        return;
      }

      // 2) Fallback to live API
      let base = (window.API_BASE_URL || '').replace(/\/$/, '');
      if (!base || /localhost|127\.0\.0\.1/i.test(base)) {
        base = 'https://power-choosers-crm.vercel.app';
      }
      // Company endpoint is GET with query params
      const params = new URLSearchParams();
      if (domain) params.append('domain', domain);
      if (companyName) params.append('company', companyName);
      const url = `${base}/api/lusha/company?${params.toString()}`;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const company = await resp.json();
      lastCompanyResult = company;
      renderCompanyPanel(company);
      await loadEmployees('popular', company);
    } catch (error) {
      console.error('Lusha search error:', error);
      try { window.crm?.showToast && window.crm.showToast('Search failed: ' + error.message); } catch (_) {}
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      if (searchBtn) { searchBtn.disabled = false; searchBtn.textContent = 'Search'; }
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
    const companyEl = document.getElementById('lusha-company-search');
    const domainEl = document.getElementById('lusha-company-domain');
    const contactNameEl = document.getElementById('lusha-contact-name');
    const contactEmailEl = document.getElementById('lusha-contact-email');

    let companyName = companyEl?.value || '';
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

    // Set all values
    // Always set fields when we have values; avoid overwriting non-empty existing
    if (companyEl && companyName && (!companyEl.value || currentEntityType === 'account')) companyEl.value = companyName;
    if (domainEl && domain && (!domainEl.value || currentEntityType === 'account')) domainEl.value = domain;
    if (contactNameEl && contactName) contactNameEl.value = contactName;
    if (contactEmailEl && contactEmail) contactEmailEl.value = contactEmail;

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

      // If we have a requestId and either contacts or explicit contactIds, enrich them
      const shouldEnrich = !!data.requestId && (contacts.length > 0 || contactIdsFromPayload.length > 0);
      if (shouldEnrich) {
        console.log('[Lusha] Proceeding to enrich contacts for full details...');
        const mergedIds = [...new Set([
          ...contacts.map(c => c.contactId).filter(Boolean),
          ...contactIdsFromPayload
        ])].slice(0, 40);
        if (mergedIds.length > 0) {
          try {
            const enrichResp = await fetch(`${base}/api/lusha/enrich`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestId: data.requestId,
                contactIds: mergedIds
              })
            });

            if (enrichResp.ok) {
              const enrichData = await enrichResp.json();
              console.log('[Lusha] Enriched contacts:', enrichData);
              // Use enriched contacts (replace current list)
              contacts.splice(0, contacts.length, ...(enrichData.contacts || []));
              // Save cache to Firestore (optional)
              try { await saveCache({ company, contacts }); } catch(_){}
            } else {
              console.warn('[Lusha] Enrich failed:', await enrichResp.text());
            }
          } catch (enrichError) {
            console.error('[Lusha] Enrich error:', enrichError);
          }
        } else {
          console.warn('[Lusha] No contact IDs available to enrich');
        }
      }

      // Update results UI
      updateResults(contacts);

      // If popular returned none, try the full list as a fallback
      if (kind === 'popular' && contacts.length === 0) {
        console.log('[Lusha] Popular empty, loading all employees as fallback');
        await loadEmployees('all', company);
      }
    }catch(e){ console.error('Employees load failed', e); }
  }
    const isEnriched = Array.isArray(c.emails) || Array.isArray(c.phones);
    
    return {
      firstName: c.firstName || c.name?.first || '',
      lastName: c.lastName || c.name?.last || '',
      jobTitle: c.jobTitle || '',
      company: c.companyName || '',
      email: isEnriched && c.emails && c.emails.length > 0 ? c.emails[0].address : '',
      phone: isEnriched && c.phones && c.phones.length > 0 ? c.phones[0].number : '',
      fqdn: c.fqdn || '',
      companyId: c.companyId || null,
      id: c.id || c.contactId,
      hasEmails: isEnriched ? (c.emails && c.emails.length > 0) : !!c?.hasEmails,
      hasPhones: isEnriched ? (c.phones && c.phones.length > 0) : !!c?.hasPhones,
      emails: c.emails || [],
      phones: c.phones || [],
      isSuccess: c.isSuccess !== false // Default to true for search results
    };
  }

  function renderCompanyPanel(company){
    const el = document.getElementById('lusha-panel-company');
    if (!el) return;
    const name = escapeHtml(company?.name || '');
    const domainRaw = (company?.domain || company?.fqdn || '') || '';
    const domain = escapeHtml(String(domainRaw).replace(/^www\./i,''));
    const website = domain ? `https://${domain}` : '';
    el.innerHTML = `
      <div class="company-summary">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          ${domain ? (window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(domain, 64) : '') : ''}
          <div>
            <div style=\"font-weight:600;color:var(--text-primary)\">${name}</div>
            ${website ? `<a href="${website}" target="_blank" rel="noopener" class="interactive-text">${website}</a>` : ''}
          </div>
        </div>
      </div>`;
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
    
    const name = contact.firstName && contact.lastName 
      ? `${contact.firstName} ${contact.lastName}` 
      : contact.fullName || 'Unknown Name';
    
    const title = contact.title || contact.jobTitle || 'No title';
    const email = contact.email || '—';
    const phone = contact.phone || contact.phoneNumber || '—';
    const company = contact.company || contact.companyName || 'No company';
    const location = contact.location || contact.city || 'No location';

    div.innerHTML = `
      <div class="lusha-contact-header">
        <div class="lusha-contact-name">${escapeHtml(name)}</div>
        <div class="lusha-contact-title">${escapeHtml(title)}</div>
      </div>
      <div class="lusha-contact-details">
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Company:</span>
          <span class="lusha-detail-value">${escapeHtml(company)}</span>
        </div>
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Email:</span>
          <span class="lusha-detail-value">${escapeHtml(email)}</span>
        </div>
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Phone:</span>
          <span class="lusha-detail-value">${escapeHtml(phone)}</span>
        </div>
        <div class="lusha-contact-detail">
          <span class="lusha-detail-label">Location:</span>
          <span class="lusha-detail-value">${escapeHtml(location)}</span>
        </div>
      </div>
      <div class="lusha-contact-actions">
        <button class="lusha-action-btn" data-action="add-account" data-contact='${escapeHtml(JSON.stringify(contact))}'>
          Add Account
        </button>
        <button class="lusha-action-btn" data-action="add-contact" data-contact='${escapeHtml(JSON.stringify(contact))}'>
          Add Contact
        </button>
        <button class="lusha-action-btn" data-action="copy-info" data-contact='${escapeHtml(JSON.stringify(contact))}'>
          Copy Info
        </button>
      </div>
    `;

    // Add event listeners for action buttons
    const addContactBtn = div.querySelector('[data-action="add-contact"]');
    const addAccountBtn = div.querySelector('[data-action="add-account"]');
    const copyBtn = div.querySelector('[data-action="copy-info"]');

    if (addContactBtn) {
      addContactBtn.addEventListener('click', () => addContactToCRM(contact));
    }
    if (addAccountBtn) {
      addAccountBtn.addEventListener('click', () => addAccountToCRM(contact));
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyContactInfo(contact));
    }

    // Update button labels depending on existence
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
        source: 'lusha',
        updatedAt: new Date(),
        createdAt: new Date()
      };
      if (existingId) {
        await window.PCSaves.updateContact(existingId, payload);
        window.crm?.showToast && window.crm.showToast('Enriched existing contact');
      } else {
        const ref = await db.collection('contacts').add(payload);
        window.crm?.showToast && window.crm.showToast('Contact added to CRM');
        // Emit create event for People page to prepend
        try { document.dispatchEvent(new CustomEvent('pc:contact-created', { detail: { id: ref.id, doc: payload } })); } catch(_){}
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

  async function updateActionButtons(containerEl, contact){
    try {
      const db = window.firebaseDB;
      if (!db) return;
      const email = contact.email || (Array.isArray(contact.emails) && contact.emails[0] && contact.emails[0].address) || '';
      const companyName = contact.company || contact.companyName || '';
      const domain = contact.fqdn || '';
      let contactExists = false;
      let accountExists = false;
      try {
        if (email) {
          const s = await db.collection('contacts').where('email','==',email).limit(1).get();
          contactExists = !!(s && s.docs && s.docs[0]);
        }
        if (domain) {
          const s1 = await db.collection('accounts').where('domain','==',domain).limit(1).get();
          accountExists = !!(s1 && s1.docs && s1.docs[0]);
        }
        if (!accountExists && companyName) {
          const s2 = await db.collection('accounts').where('accountName','==',companyName).limit(1).get();
          accountExists = !!(s2 && s2.docs && s2.docs[0]);
        }
      } catch(_){}
      const contactBtn = containerEl.querySelector('[data-action="add-contact"]');
      const accountBtn = containerEl.querySelector('[data-action="add-account"]');
      if (contactBtn) contactBtn.textContent = contactExists ? 'Enrich Contact' : 'Add Contact';
      if (accountBtn) accountBtn.textContent = accountExists ? 'Enrich Account' : 'Add Account';
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

  function updateResults(contacts){
    try {
      const resultsWrap = document.getElementById('lusha-results');
      const countEl = document.getElementById('lusha-results-count');
      const listEl = document.getElementById('lusha-contacts-list');
      if (resultsWrap) resultsWrap.style.display = 'block';
      if (countEl) countEl.textContent = `${contacts.length} contact${contacts.length===1?'':'s'} found`;
      if (listEl) {
        listEl.innerHTML = '';
        if (contacts.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'lusha-no-results';
          empty.textContent = 'No results found.';
          listEl.appendChild(empty);
        } else {
          contacts.forEach((c,i) => listEl.appendChild(createContactElement(mapProspectingContact(c), i)));
        }
      }
    } catch (e) { console.error('Update results failed', e); }
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
    console.log('[Lusha] openLushaForAccount called with:', accountId);
    currentAccountId = accountId;
    currentEntityType = 'account';
    removeExistingWidget();
    makeCard(accountId, 'account');
    // Ensure prefill runs after widget is created
    setTimeout(() => {
      console.log('[Lusha] Running prefill for account...');
      try { prefillInputs('account'); } catch(e) { console.log('[Lusha] Prefill error:', e); }
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
