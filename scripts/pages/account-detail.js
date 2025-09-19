'use strict';

// Account Detail page module
(function () {
  const state = {
    currentAccount: null,
    loaded: false
  };

  const els = {};

  // ==== Date helpers for Energy & Contract fields ====
  function parseDateFlexible(s){
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      // For ISO dates, parse components to avoid timezone issues
      const parts = str.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const mdy = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
    if (mdy){ 
      // Parse MM/DD/YYYY format directly to avoid timezone issues
      const d = new Date(parseInt(mdy[3],10), parseInt(mdy[1],10)-1, parseInt(mdy[2],10)); 
      return isNaN(d.getTime()) ? null : d; 
    }
    // Fallback Date parse - use local timezone to avoid offset issues
    const d = new Date(str + 'T00:00:00'); return isNaN(d.getTime()) ? null : d;
  }
  function toISODate(v){ const d=parseDateFlexible(v); if(!d) return ''; const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }
  function toMDY(v){ 
    console.log('[Account Detail] toMDY called with:', v);
    const d=parseDateFlexible(v); 
    if(!d) return v?String(v):''; 
    const mm=String(d.getMonth()+1).padStart(2,'0'); 
    const dd=String(d.getDate()).padStart(2,'0'); 
    const yyyy=d.getFullYear(); 
    const result = `${mm}/${dd}/${yyyy}`;
    console.log('[Account Detail] toMDY result:', result);
    return result;
  }
  function formatDateInputAsMDY(raw){
    const digits = String(raw||'').replace(/[^0-9]/g,'').slice(0,8);
    let out = '';
    if (digits.length >= 1) out = digits.slice(0,2);
    if (digits.length >= 3) out = digits.slice(0,2) + '/' + digits.slice(2,4);
    if (digits.length >= 5) out = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4,8);
    return out;
  }

  function initDomRefs() {
    els.page = document.getElementById('account-details-page');
    els.pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    els.mainContent = els.page ? els.page.querySelector('.page-content') : null;
    return !!els.page && !!els.mainContent;
  }

  function showAccountDetail(accountId) {
    // Ensure page exists and navigate to it
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      try { window.crm.navigateToPage('account-details'); } catch (e) { /* noop */ }
    }
    if (!initDomRefs()) return;

    const account = findAccountById(accountId);
    if (!account) {
      console.error('Account not found:', accountId);
      return;
    }

    state.currentAccount = account;
    renderAccountDetail();
    
    // Setup energy update listener for real-time sync with Health Widget
    try {
      if (window.AccountDetail && window.AccountDetail.setupEnergyUpdateListener) {
        window.AccountDetail.setupEnergyUpdateListener();
      }
    } catch (_) {}
  }

  function findAccountById(accountId) {
    // Use prefetched account if provided by navigation source (avoids extra hops)
    try {
      if (window._prefetchedAccountForDetail && window._prefetchedAccountForDetail.id === accountId) {
        const a = window._prefetchedAccountForDetail;
        window._prefetchedAccountForDetail = null; // consume
        return a;
      }
    } catch (_) {}

    if (window.getAccountsData) {
      const accounts = window.getAccountsData();
      return accounts.find(a => a.id === accountId);
    }
    return null;
  }

  function injectSectionHeaderStyles() {
    if (document.getElementById('account-section-header-styles')) return;
    const style = document.createElement('style');
    style.id = 'account-section-header-styles';
    style.textContent = `
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--spacing-md);
      }
      .section-header .section-title {
        margin: 0;
      }
      .add-contact-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--border-radius);
        background: var(--bg-item);
        border: 1px solid var(--border-light);
        color: var(--text-inverse);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .add-contact-btn:hover { 
        background: var(--bg-secondary);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .add-contact-btn:focus-visible {
        outline: 2px solid var(--orange-muted);
        outline-offset: 2px;
      }
      .add-contact-btn svg {
        width: 18px;
        height: 18px;
        display: block;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function renderAccountContacts(account) {
    if (!account || !window.getPeopleData) {
      return '<div class="contacts-placeholder">No contacts found</div>';
    }

    try {
      const allContacts = window.getPeopleData() || [];
      const accountName = account.accountName || account.name || account.companyName;
      
      // Find contacts associated with this account
      const associatedContacts = allContacts.filter(contact => {
        // Check if contact has accountId matching this account
        if (contact.accountId === account.id) return true;
        
        // Check if contact's company name matches this account name
        const contactCompany = contact.companyName || contact.accountName || '';
        return contactCompany.toLowerCase().trim() === accountName.toLowerCase().trim();
      });

      if (associatedContacts.length === 0) {
        return '<div class="contacts-placeholder">No contacts found for this account</div>';
      }

      return associatedContacts.map(contact => {
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
        const title = contact.title || '';
        const email = contact.email || '';
        const phone = contact.workDirectPhone || contact.mobile || contact.otherPhone || '';
        
        return `
          <div class="contact-item" data-contact-id="${contact.id}">
            <div class="contact-avatar">
              <div class="avatar-circle-small">${getInitials(fullName)}</div>
            </div>
            <div class="contact-info">
              <div class="contact-name">${escapeHtml(fullName)}</div>
              <div class="contact-details">
                ${title ? `<span class="contact-title">${escapeHtml(title)}</span>` : ''}
                ${email ? `<span class="contact-email">${escapeHtml(email)}</span>` : ''}
                ${phone ? `<span class="contact-phone" 
                                 data-contact-id="${contact.id}" 
                                 data-account-id="${state.currentAccount?.id || ''}" 
                                 data-contact-name="${escapeHtml(fullName)}" 
                                 data-company-name="${escapeHtml(state.currentAccount?.name || state.currentAccount?.accountName || '')}">${escapeHtml(phone)}</span>` : ''}
              </div>
            </div>
            <div class="contact-actions">
              ${phone ? `<button class="contact-quick-action-btn" data-action="call" data-contact-id="${contact.id}" title="Call ${escapeHtml(fullName)}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </button>` : ''}
              ${email ? `<button class="contact-quick-action-btn" data-action="email" data-contact-id="${contact.id}" title="Email ${escapeHtml(fullName)}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Error rendering account contacts:', error);
      return '<div class="contacts-placeholder">Error loading contacts</div>';
    }
  }

  function findMostRelevantContactForAccount(accountId) {
    if (!accountId || typeof window.getPeopleData !== 'function') return null;
    
    try {
      const people = window.getPeopleData() || [];
      const accountContacts = people.filter(p => 
        p.accountId === accountId || 
        p.account_id === accountId || 
        p.companyId === accountId ||
        p.company_id === accountId
      );
      
      if (accountContacts.length === 0) return null;
      
      // Sort by most recent activity (if available) or by name
      accountContacts.sort((a, b) => {
        // Prefer contacts with recent activity
        const aActivity = a.lastActivity || a.updatedAt || a.createdAt || 0;
        const bActivity = b.lastActivity || b.updatedAt || b.createdAt || 0;
        if (aActivity !== bActivity) return bActivity - aActivity;
        
        // Fallback to alphabetical by name
        const aName = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || '';
        const bName = [b.firstName, b.lastName].filter(Boolean).join(' ') || b.name || '';
        return aName.localeCompare(bName);
      });
      
      return accountContacts[0];
    } catch (error) {
      console.warn('[Account Detail] Error finding most relevant contact:', error);
      return null;
    }
  }

  function renderAccountDetail() {
    if (!state.currentAccount || !els.mainContent) return;
    
    // Inject section header styles if not already present
    injectSectionHeaderStyles();

    const a = state.currentAccount;
    
    // Find the most relevant contact for this account (for company phone context)
    const mostRelevantContact = findMostRelevantContactForAccount(a.id || a.accountId || a._id);
    const name = a.accountName || a.name || a.companyName || 'Unknown Account';
    const industry = a.industry || '';
    const domain = a.domain || a.website || a.site || '';
    const website = a.website || a.site || (domain ? (domain.startsWith('http') ? domain : ('https://' + domain)) : '');
    const phone = a.companyPhone || a.phone || a.primaryPhone || a.mainPhone || '';
    const city = a.city || a.locationCity || '';
    const stateVal = a.state || a.locationState || '';
    const linkedin = a.linkedin || a.linkedinUrl || a.linkedin_url || '';
    const electricitySupplier = a.electricitySupplier || '';
    const annualUsage = a.annualUsage || a.annual_usage || '';
    const currentRate = a.currentRate || a.current_rate || '';
    const contractEndDate = a.contractEndDate || a.contract_end_date || '';
    const contractEndDateFormatted = contractEndDate ? toMDY(contractEndDate) : '';
    const sqft = a.squareFootage ?? a.sqft ?? a.square_feet ?? '';
    const occupancy = a.occupancyPct ?? a.occupancy ?? a.occupancy_percentage ?? '';
    const employees = a.employees ?? a.employeeCount ?? a.numEmployees ?? '';
    const shortDesc = a.shortDescription || a.short_desc || a.descriptionShort || '';

    // Derive a clean domain for favicon usage
    const favDomain = (function(d) {
      if (!d) return '';
      let s = String(d).trim();
      try {
        if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
        const u = new URL(s);
        return (u.hostname || '').replace(/^www\./i, '');
      } catch (e) {
        return s.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
      }
    })(domain);

    const headerHtml = `
      <div id="account-detail-header" class="page-header">
        <div class="page-title-section">
          <div class="contact-header-info">
            <button class="back-btn back-btn--icon" id="back-to-accounts" aria-label="Back to Accounts" title="Back to Accounts">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="contact-header-profile">
              ${favDomain ? `<img class=\"avatar-favicon\" src=\"https://www.google.com/s2/favicons?sz=64&domain=${escapeHtml(favDomain)}\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\" onload=\"const sib=this.nextElementSibling; if(sib) sib.style.display='none';\" onerror=\"this.style.display='none'; const sib=this.nextElementSibling; if(sib) sib.style.display='flex';\" />` : ''}
              <div class="avatar-circle-small" style="${favDomain ? 'display:none;' : ''}">${escapeHtml(getInitials(name))}</div>
              <div class="contact-header-text">
                <h2 class="page-title contact-page-title">${escapeHtml(name)}</h2>
                <div class="contact-subtitle">${industry ? escapeHtml(industry) : ''}</div>
              </div>
              <button class="quick-action-btn linkedin-header-btn" data-action="linkedin">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                  <rect x="2" y="9" width="4" height="12"/>
                  <circle cx="4" cy="4" r="2"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="page-actions">
            <div class="widgets-wrap">
              <button class="btn-primary" id="open-widgets" title="Widgets" aria-label="Widgets" aria-haspopup="menu" aria-expanded="false" aria-controls="widgets-drawer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <rect x="3" y="3" width="6" height="6"/>
                  <rect x="15" y="3" width="6" height="6"/>
                  <rect x="3" y="15" width="6" height="6"/>
                  <rect x="15" y="15" width="6" height="6"/>
                </svg>
              </button>
              <div id="widgets-drawer" class="widgets-drawer" role="menu" aria-label="Account widgets">
                <button type="button" class="widget-item" data-widget="health" title="Energy Health Check" aria-label="Energy Health Check">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </button>
                <button type="button" class="widget-item" data-widget="deal" title="Deal Calculator" aria-label="Deal Calculator">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </button>
                <button type="button" class="widget-item" data-widget="notes" title="Notes" aria-label="Notes">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M4 4h12a2 2 0 0 1 2 2v10l-4 4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                    <path d="M14 20v-4a2 2 0 0 1 2-2h4"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const bodyHtml = `
      <div id="account-detail-view" class="contact-detail">
        <div class="contact-info-section">
          <h3 class="section-title">Account Information</h3>
          <div class="info-grid">
            <div class="info-row"><div class="info-label">WEBSITE</div><div class="info-value-wrap" data-field="website"><span class="info-value-text">${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(website)}</a>` : '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">COMPANY PHONE</div><div class="info-value-wrap" data-field="companyPhone"><span class="info-value-text" 
                                 data-account-id="${a.id || a.accountId || a._id || ''}" 
                                 data-account-name="${escapeHtml(a.name || a.accountName || a.companyName || '')}" 
                                 data-company-name="${escapeHtml(a.name || a.accountName || a.companyName || '')}"
                                 data-contact-id=""
                                 data-contact-name="">${escapeHtml(phone) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CITY</div><div class="info-value-wrap" data-field="city"><span class="info-value-text">${escapeHtml(city) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">STATE</div><div class="info-value-wrap" data-field="state"><span class="info-value-text">${escapeHtml(stateVal) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">INDUSTRY</div><div class="info-value-wrap" data-field="industry"><span class="info-value-text">${escapeHtml(industry) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">SQ FT</div><div class="info-value-wrap" data-field="squareFootage"><span class="info-value-text">${escapeHtml(String(sqft || '--'))}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">OCCUPANCY %</div><div class="info-value-wrap" data-field="occupancyPct"><span class="info-value-text">${escapeHtml(String(occupancy || '--'))}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">EMPLOYEES</div><div class="info-value-wrap" data-field="employees"><span class="info-value-text">${escapeHtml(String(employees || '--'))}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">LINKEDIN</div><div class="info-value-wrap" data-field="linkedin"><span class="info-value-text">${linkedin ? `<a href="${escapeHtml(linkedin)}" target="_blank" rel="noopener">${escapeHtml(linkedin)}</a>` : '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row info-row--full"><div class="info-label">SHORT DESCRIPTION</div><div class="info-value-wrap info-value-wrap--multiline" data-field="shortDescription"><span class="info-value-text info-value-text--multiline">${escapeHtml(shortDesc) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
          </div>
        </div>

        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid" id="account-energy-grid">
            <div class="info-row"><div class="info-label">ELECTRICITY SUPPLIER</div><div class="info-value-wrap" data-field="electricitySupplier"><span class="info-value-text">${escapeHtml(electricitySupplier) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">ANNUAL USAGE</div><div class="info-value-wrap" data-field="annualUsage"><span class="info-value-text">${annualUsage ? escapeHtml(String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CURRENT RATE ($/kWh)</div><div class="info-value-wrap" data-field="currentRate"><span class="info-value-text">${escapeHtml(currentRate) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CONTRACT END DATE</div><div class="info-value-wrap" data-field="contractEndDate"><span class="info-value-text">${escapeHtml(contractEndDateFormatted) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
          </div>
        </div>

        <div class="contact-info-section" id="account-recent-calls">
          <div class="rc-header">
            <h3 class="section-title">Recent Calls</h3>
            <div class="rc-pager" id="account-rc-pager" style="display:none">
              <button class="rc-page-btn" id="arc-prev" aria-label="Previous page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
              </button>
              <div class="rc-page-info" id="arc-info">1 of 1</div>
              <button class="rc-page-btn" id="arc-next" aria-label="Next page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
              </button>
            </div>
          </div>
          <div class="rc-list" id="account-recent-calls-list">
            <div class="rc-empty">Loading recent calls…</div>
          </div>
        </div>

        <div class="contact-info-section">
          <div class="section-header">
            <h3 class="section-title">Contacts</h3>
            <button class="widget-item add-contact-btn" id="add-contact-to-account" title="Add Contact" aria-label="Add Contact">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
          <div class="contacts-list" id="account-contacts-list">
            ${renderAccountContacts(a)}
          </div>
        </div>

        <div class="contact-activity-section">
          <div class="activity-header">
            <h3 class="section-title">Recent Activity</h3>
            <button class="btn-text" id="view-all-account-activity">View All</button>
          </div>
          <div class="activity-timeline" id="account-activity-timeline">
            <div class="activity-placeholder">
              <div class="placeholder-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6"/>
                </svg>
              </div>
              <div class="placeholder-text">No recent activity</div>
            </div>
          </div>
          <div class="activity-pagination" id="account-activity-pagination" style="display: none;">
            <button class="activity-pagination-btn" id="account-activity-prev" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </button>
            <div class="activity-pagination-info" id="account-activity-info">1 of 1</div>
            <button class="activity-pagination-btn" id="account-activity-next" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;

    // Clear and insert
    const existingHeader = document.getElementById('account-detail-header');
    if (existingHeader) existingHeader.remove();
    const existingView = document.getElementById('account-detail-view');
    if (existingView) existingView.remove();

    const headerWrap = document.createElement('div');
    headerWrap.innerHTML = headerHtml;
    const bodyWrap = document.createElement('div');
    bodyWrap.innerHTML = bodyHtml;

    const pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    const pageHeader = pageContainer ? pageContainer.querySelector('.page-header') : null;
    const headerEl = headerWrap.firstElementChild;
    if (pageHeader && headerEl && pageHeader.parentElement) {
      pageHeader.replaceWith(headerEl);
    } else if (pageContainer && headerEl) {
      pageContainer.prepend(headerEl);
    }

    const bodyEl = bodyWrap.firstElementChild;
    if (els.mainContent && bodyEl) {
      els.mainContent.innerHTML = '';
      els.mainContent.appendChild(bodyEl);
    }

    attachAccountDetailEvents();
    startAccountRecentCallsLiveHooks();
    
          // Add periodic refresh to ensure eye icons update when recordings are ready
          let refreshInterval = null;
          let lastRefreshTime = 0;
          const startPeriodicRefresh = () => {
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(() => {
              // Only refresh if we're not already refreshing, not scrolling, no insights are open, and enough time has passed
              const hasOpenInsights = state._arcOpenIds && state._arcOpenIds.size > 0;
              const now = Date.now();
              const timeSinceLastRefresh = now - lastRefreshTime;
              
              if (!state._arcReloadInFlight && !state._isScrolling && !hasOpenInsights && timeSinceLastRefresh >= 5000) {
                lastRefreshTime = now;
                loadRecentCallsForAccount();
              }
            }, 5000); // Check every 5 seconds
          };
    
    // Start periodic refresh
    startPeriodicRefresh();
    
    // Cleanup interval when page is unloaded
    window.addEventListener('beforeunload', () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    });
    
    try { window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); } catch (_) { /* noop */ }
    
    // Load activities
    loadAccountActivities();
    // Load account recent calls and styles
    try { injectRecentCallsStyles(); loadRecentCallsForAccount(); } catch (_) { /* noop */ }
    
    // DEBUG: Add test function to manually trigger Conversational Intelligence
    window.testConversationalIntelligence = async function(callSid) {
      console.log('[DEBUG] Testing Conversational Intelligence for call:', callSid);
      try {
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
        const response = await fetch(base + '/api/twilio/conversational-intelligence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: callSid })
        });
        const result = await response.json();
        console.log('[DEBUG] Conversational Intelligence result:', result);
        return result;
      } catch (error) {
        console.error('[DEBUG] Conversational Intelligence error:', error);
        return { error: error.message };
      }
    };
  }

  // ===== Recent Calls (Account) =====
  function injectRecentCallsStyles(){
    if (document.getElementById('recent-calls-styles')) return;
    const style = document.createElement('style');
    style.id = 'recent-calls-styles';
    style.textContent = `
      /* Performance: promote and isolate page-content to reduce jank during live updates */
      #account-details-page .page-content {
        will-change: transform;
        transform: translateZ(0);
        backface-visibility: hidden;
        contain: paint layout;
        overflow-anchor: none;
      }
      .rc-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: var(--spacing-md); }
      .rc-pager { display:flex; align-items:center; gap:8px; }
      .rc-page-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:var(--bg-card); color:var(--text-primary); border:1px solid var(--border-light); }
      .rc-page-btn:hover { 
        background: var(--bg-hover);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .rc-page-info { min-width: 44px; text-align:center; color: var(--text-secondary); font-size: 12px; }
      .rc-list { transition: height 220ms ease, opacity 220ms ease; position: relative; display:flex; flex-direction:column; gap:8px; }
      .rc-empty { color: var(--text-secondary); font-size: 12px; padding: 6px 0; }
      .rc-item { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border:1px solid var(--border-light); border-radius: var(--border-radius); background: var(--bg-item); }
      .rc-item.rc-new { animation: rcNewIn 220ms ease-out both; }
      @keyframes rcNewIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .rc-meta { display:flex; align-items:center; gap:10px; min-width:0; }
      .rc-title { font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .rc-sub { color:var(--text-secondary); font-size:12px; white-space:nowrap; }
      .rc-outcome { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--border-light); background:var(--bg-card); color:var(--text-secondary); }
      .rc-actions { display:flex; align-items:center; gap:8px; }
      .rc-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:var(--bg-card); color:var(--text-primary); border:1px solid var(--border-light); }
      .rc-icon-btn:hover { 
        background: var(--bg-hover);
        border-color: var(--accent-color);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .rc-icon-btn.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
      .rc-icon-btn.disabled:hover { background: var(--bg-card); border-color: var(--border-light); transform: none; box-shadow: none; }
      /* Live call duration indicator */
      .rc-item.live-call .rc-duration { color: var(--text-secondary); font-weight: 400; }
      /* Inline details under item */
      .rc-details { overflow:hidden; border:1px solid var(--border-light); border-radius: var(--border-radius); background: var(--bg-card); margin: 6px 2px 2px 2px; box-shadow: var(--elevation-card); }
      .rc-details-inner { padding: 12px; }
      .rc-details.expanding, .rc-details.collapsing { will-change: height, opacity; }
      .rc-details.expanding { animation: rcExpand 180ms ease-out forwards; }
      .rc-details.collapsing { animation: rcCollapse 140ms ease-in forwards; }
      @keyframes rcExpand { from { opacity: .0; } to { opacity: 1; } }
      @keyframes rcCollapse { from { opacity: 1; } to { opacity: .0; } }
      .insights-grid { display:grid; grid-template-columns: 2fr 1fr; gap:14px; }
      @media (max-width: 960px){ .insights-grid{ grid-template-columns:1fr; } }
      .ip-card { background: var(--bg-item); border:1px solid var(--border-light); border-radius: 10px; padding: 12px; }
      .ip-card h4 { margin:0 0 8px 0; font-size:13px; font-weight:600; color:var(--text-primary); display:flex; align-items:center; gap:8px; }
      .pc-chips { display:flex; flex-wrap:wrap; gap:8px; }
      .pc-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 8px; border-radius:999px; border:1px solid var(--border-light); background:var(--bg-card); font-size:12px; color:var(--text-secondary); }
      .pc-chip.ok{ background:rgba(16,185,129,.15); border-color:rgba(16,185,129,.25); color:#16c088 }
      .pc-chip.warn{ background:rgba(234,179,8,.15); border-color:rgba(234,179,8,.25); color:#eab308 }
      .pc-chip.danger{ background:rgba(239,68,68,.15); border-color:rgba(239,68,68,.25); color:#ef4444 }
      .pc-chip.info{ background:rgba(59,130,246,.13); border-color:rgba(59,130,246,.25); color:#60a5fa }
      .pc-kv{ display:grid; grid-template-columns:160px 1fr; gap:8px 12px; }
      .pc-kv .k{ color:var(--text-secondary); font-size:12px }
      .pc-kv .v{ color:var(--text-primary); font-size:12px }
      /* Modern 2025 Transcript Styling */
      .pc-transcript-container { background: var(--bg-card); border:1px solid var(--border-light); border-radius: 14px; padding:14px; max-height:320px; overflow:auto; }
      .transcript-message { display:flex; gap:10px; margin-bottom:12px; align-items:flex-start; }
      .transcript-message:last-child { margin-bottom:0; }
      .transcript-avatar { flex-shrink:0; }
      .transcript-avatar-circle { width: 32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:12px; letter-spacing:.5px; }
      .transcript-avatar-circle.agent-avatar { background: var(--orange-subtle); color:#fff; }
      .transcript-avatar-circle.contact-avatar { background: var(--orange-subtle); color:#fff; }
      .transcript-avatar-circle.company-avatar { background: var(--bg-item); padding:2px; }
      .transcript-avatar-circle.company-avatar img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
      .transcript-avatar-circle .company-favicon-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); }
      .transcript-content { flex:1; min-width:0; border:1px solid var(--border-light); border-radius:10px; padding:10px 12px; background: var(--bg-item); }
      .transcript-message.customer .transcript-content { background: var(--bg-card); }
      .transcript-header { display:flex; align-items:center; gap:8px; margin-bottom:2px; }
      .transcript-speaker { font-weight:600; font-size:12px; color:var(--text-primary); }
      .transcript-time { font-size:11px; color:var(--text-secondary); }
      .transcript-text { font-size:13px; line-height:1.5; color:var(--text-primary); word-wrap:break-word; }
    `;
    document.head.appendChild(style);
  }

  // Live refresh: refresh Account Recent Calls on call start/end
  let _arcRetryTimer = null;
  function startAccountRecentCallsLiveHooks(){
    try {
      if (document._arcLiveHooksBound) return;
      document.addEventListener('callStarted', onAnyAccountCallActivity, false);
      document.addEventListener('callEnded', onAnyAccountCallActivity, false);
      document.addEventListener('pc:recent-calls-refresh', onAnyAccountCallActivity, false);
      document.addEventListener('pc:live-call-duration', onLiveCallDurationUpdate, false);
      
      // Listen for call updates to refresh recent calls
      document.addEventListener('pc:call-updated', (event) => {
        const callData = event.detail;
        if (callData && callData.accountId === state.currentAccount?.id) {
          // Refresh recent calls when a call for this account is updated
          setTimeout(() => {
            loadRecentCallsForAccount();
          }, 1000); // Small delay to ensure data is saved
        }
      });
      
      // Listen for new calls
      document.addEventListener('pc:call-created', (event) => {
        const callData = event.detail;
        if (callData && callData.accountId === state.currentAccount?.id) {
          // Refresh recent calls when a new call is created for this account
          setTimeout(() => {
            loadRecentCallsForAccount();
          }, 1000); // Small delay to ensure data is saved
        }
      });
      // Track scrolling state to avoid animations/jank during scroll
      try {
        if (els.mainContent && !els.mainContent._scrollBound) {
          const sc = els.mainContent;
          let scrollRafId = null;
          sc.addEventListener('scroll', () => {
            state._isScrolling = true;
            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            scrollRafId = requestAnimationFrame(() => {
              clearTimeout(state._scrollTimer);
              state._scrollTimer = setTimeout(() => {
                state._isScrolling = false;
                if (state._arcPendingRefresh) {
                  state._arcPendingRefresh = false;
                  // Run a single deferred refresh
                  try { safeReloadAccountRecentCallsWithRetries(); } catch(_) {}
                }
              }, 180);
            });
          }, { passive: true });
          els.mainContent._scrollBound = '1';
        }
      } catch(_) {}
      document._arcLiveHooksBound = true;
    } catch(_) {}
  }
  function onAnyAccountCallActivity(){
    // Optimized cleanup: only clean up if we have many entries to reduce overhead
    try {
      if (state._liveCallDurations && state._liveCallDurations.size > 10) {
        const now = Date.now();
        const toDelete = [];
        for (const [callSid, data] of state._liveCallDurations.entries()) {
          if (now - data.timestamp > 30000) {
            toDelete.push(callSid);
          }
        }
        // Batch delete to reduce Map operations
        toDelete.forEach(sid => state._liveCallDurations.delete(sid));
      }
    } catch(_) {}
    
    // If user is viewing any details panels, avoid showing loading overlay; refresh silently
    try {
      const list = document.getElementById('account-recent-calls-list');
      const hasOpen = (state._arcOpenIds && state._arcOpenIds.size > 0);
      if (list && !hasOpen) arcSetLoading(list);
    } catch(_) {}
    // Add a small delay to allow webhooks to update call data before first refresh
    setTimeout(() => {
      safeReloadAccountRecentCallsWithRetries();
    }, 1000); // 1 second delay to allow webhooks to process
  }
  
  function onLiveCallDurationUpdate(e) {
    try {
      const { callSid, duration, durationFormatted } = e.detail || {};
      if (!callSid || !durationFormatted) return;
      
      // Store the live duration for this call to prevent overwriting
      if (!state._liveCallDurations) state._liveCallDurations = new Map();
      state._liveCallDurations.set(callSid, { duration, durationFormatted, timestamp: Date.now() });
      
      // Cache the list element to avoid repeated DOM queries
      if (!state._cachedRecentCallsList) {
        state._cachedRecentCallsList = document.getElementById('account-recent-calls-list');
      }
      const list = state._cachedRecentCallsList;
      if (!list) return;
      
      // Look for a call row that matches this call SID
      const callRows = list.querySelectorAll('.rc-item');
      for (const row of callRows) {
        const insightsBtn = row.querySelector('.rc-insights');
        if (insightsBtn) {
          const rowCallId = insightsBtn.getAttribute('data-id');
          if (rowCallId === callSid) {
            // Update the duration display in this row
            const durationSpan = row.querySelector('.rc-duration');
            if (durationSpan) {
              durationSpan.textContent = durationFormatted;
              // Add a visual indicator that this is a live call
              row.classList.add('live-call');
            }
            break;
          }
        }
      }
    } catch(_) {}
  }
  function safeReloadAccountRecentCallsWithRetries(){
    try { if (_arcRetryTimer) { clearTimeout(_arcRetryTimer); _arcRetryTimer = null; } } catch(_) {}
    if (state._arcReloadInFlight) { return; }
    state._arcReloadInFlight = true;
    let attempts = 0;
    const run = () => {
      attempts++;
      try { loadRecentCallsForAccount(); } catch(_) {}
      if (attempts < 10) { _arcRetryTimer = setTimeout(run, 900); }
      else { state._arcReloadInFlight = false; }
    };
    run();
  }

  // Avatar helpers (reuse calls page patterns)
  function ad_getAgentAvatar(){ return `<div class=\"transcript-avatar-circle agent-avatar\" aria-hidden=\"true\">Y</div>`; }
  function ad_getContactAvatar(contactName, call){
    const domain = ad_extractDomainFromAccount(call && (call.accountName || ''));
    if (domain){
      const fb = (typeof window.__pcAccountsIcon === 'function') ? window.__pcAccountsIcon() : '<span class=\"company-favicon\" aria-hidden=\"true\" style=\"display:inline-block;width:16px;height:16px;border-radius:50%;background:var(--bg-item);\"></span>';
      return `<div class=\"transcript-avatar-circle company-avatar\" aria-hidden=\"true\"><img src=\"https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\" onload=\"this.nextElementSibling.style.display='none';\" onerror=\"this.style.display='none'; var n=this.nextElementSibling; if(n){ n.style.display='flex'; }\">${fb}</div>`;
    }
    const initial = (String(contactName||'C').charAt(0) || 'C').toUpperCase();
    return `<div class=\"transcript-avatar-circle contact-avatar\" aria-hidden=\"true\">${initial}</div>`;
  }
  function ad_extractDomainFromAccount(name){ if(!name) return ''; try{ const key=String(name).trim().toLowerCase(); if(typeof window.getAccountsData==='function'){ const accounts=window.getAccountsData()||[]; const hit=accounts.find(a=>String(a.name||a.accountName||'').trim().toLowerCase()===key); const dom=hit&&(hit.domain||hit.website||''); if(dom) return String(dom).replace(/^https?:\/\//,'').replace(/\/$/,''); } }catch(_){} return ''; }
  function ad_normalizeSupplierTokens(s){ try{ if(!s) return ''; let out=String(s); out=out.replace(/\bT\s*X\s*U\b/gi,'TXU'); out=out.replace(/\bN\s*R\s*G\b/gi,'NRG'); out=out.replace(/\breliant\b/gi,'Reliant'); return out; }catch(_){ return s||''; } }

  async function loadRecentCallsForAccount(){
    const list = document.getElementById('account-recent-calls-list');
    if (!list || !state.currentAccount) return;
    // Show spinner and animate container while loading
    try { arcSetLoading(list); } catch(_) {}
    const accountId = state.currentAccount.id;
    const accountPhone10 = String(state.currentAccount.companyPhone || state.currentAccount.phone || state.currentAccount.primaryPhone || state.currentAccount.mainPhone || '').replace(/\D/g,'').slice(-10);
    const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
    
    // Loading calls for account
    // If user is actively scrolling, defer refresh to avoid jank
    if (state._isScrolling) {
      try { state._arcPendingRefresh = true; } catch(_) {}
      return;
    }
    
    try {
      const r = await fetch(`${base}/api/calls`);
      const j = await r.json().catch(()=>({}));
      const calls = (j && j.ok && Array.isArray(j.calls)) ? j.calls : [];
      
      // Raw calls loaded from API
      
      // Build contact set and all known numbers for this account (contacts + company)
      const norm10 = (s) => String(s||'').replace(/\D/g,'').slice(-10);
      const contactIds = new Set();
      const accountNumbers = new Set();
      if (accountPhone10) accountNumbers.add(accountPhone10);
      try {
        if (typeof window.getPeopleData === 'function') {
          const all = window.getPeopleData() || [];
          const acc = state.currentAccount || {};
          const accName = String(acc.accountName || acc.name || acc.companyName || '').toLowerCase().trim();
          const normalized = (s) => String(s||'').toLowerCase().trim();
          const related = all.filter(p => (
            (p.accountId && String(p.accountId) === String(accountId)) ||
            (normalized(p.companyName || p.accountName) === accName)
          ));
          related.forEach(p => {
            if (p.id) contactIds.add(String(p.id));
            [p.mobile, p.workDirectPhone, p.otherPhone].forEach(n => { const d = norm10(n); if (d) accountNumbers.add(d); });
          });
        }
      } catch(_) {}

      // Account phone numbers and contact IDs collected for filtering

      let filtered = calls.filter(c => {
        const matchByAccountId = c.accountId && String(c.accountId) === String(accountId);
        const matchByContactId = c.contactId && contactIds.has(String(c.contactId));
        const to10 = norm10(c.to);
        const from10 = norm10(c.from);
        const matchByToPhone = to10 && accountNumbers.has(to10);
        const matchByFromPhone = from10 && accountNumbers.has(from10);
        const callAcc = String(c.accountName||'').toLowerCase().trim();
        const thisAcc = String(state.currentAccount?.accountName || state.currentAccount?.name || '').toLowerCase().trim();
        const matchByAccountName = thisAcc && callAcc && callAcc === thisAcc;
        
        const shouldInclude = matchByAccountId || matchByContactId || matchByToPhone || matchByFromPhone || matchByAccountName;
        
        // Call included in filtered results
        
        return shouldInclude;
      });
      // Sort newest first and paginate later
      filtered.sort((a,b)=>{
        const at = new Date(a.callTime || a.timestamp || 0).getTime();
        const bt = new Date(b.callTime || b.timestamp || 0).getTime();
        return bt - at;
      });
      
      // Final filtered calls ready for display
      
      if (!filtered.length){ arcUpdateListAnimated(list, '<div class="rc-empty">No recent calls</div>'); return; }

      // Enrich for direction/number like Calls page for consistent UI
      const bizList = Array.isArray(window.CRM_BUSINESS_NUMBERS) ? window.CRM_BUSINESS_NUMBERS.map(n=>String(n||'').replace(/\D/g,'').slice(-10)).filter(Boolean) : [];
      const isBiz = (p)=> bizList.includes(p);
      const norm = (s)=> String(s||'').replace(/\D/g,'').slice(-10);
      filtered.forEach(c => {
        if (!c.id) c.id = c.twilioSid || c.callSid || c.sid || `${c.to||''}_${c.from||''}_${c.timestamp||c.callTime||''}`;
        const to10 = norm(c.to);
        const from10 = norm(c.from);
        let direction = 'unknown';
        if (String(c.from||'').startsWith('client:') || isBiz(from10)) direction = 'outbound';
        else if (String(c.to||'').startsWith('client:') || isBiz(to10)) direction = 'inbound';
        const counter10 = direction === 'outbound' ? to10 : (direction === 'inbound' ? from10 : (to10 || from10));
        const pretty = counter10 ? `+1 (${counter10.slice(0,3)}) ${counter10.slice(3,6)}-${counter10.slice(6)}` : '';
        c.direction = c.direction || direction;
        c.counterpartyPretty = c.counterpartyPretty || pretty;
        // Fill missing account/contact names from current context
        try {
          if (!c.accountName) {
            const a = state.currentAccount || {};
            const acctName = a.accountName || a.name || a.companyName || '';
            if (acctName) c.accountName = acctName;
          }
          if (!c.contactName && typeof window.getPeopleData === 'function') {
            // pick a recent contact for this account
            const people = window.getPeopleData() || [];
            const list = people.filter(p=> p && (p.accountId===accountId || p.accountID===accountId));
            if (list.length) {
              const p = list[0];
              const full = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '';
              if (full) c.contactName = full;
            }
          }
        } catch(_) {}
        try { console.log('[Account Detail][enrich]', { id:c.id, direction:c.direction, number:c.counterpartyPretty, contactName:c.contactName, accountName:c.accountName }); } catch(_) {}
      });
      // Save to state and render first page
      try { state._arcCalls = filtered; } catch(_) {}
      try { if (typeof state._arcPage !== 'number' || !state._arcPage) state._arcPage = 1; } catch(_) {}
      arcRenderPage();
      // Clear the reload flag after successful load
      try { state._arcReloadInFlight = false; } catch(_) {}
      // Delegate once for reliability across rerenders
      if (!list._delegated) {
        list.addEventListener('click', (e) => {
          const btn = e.target && e.target.closest ? e.target.closest('.rc-insights') : null;
          if (!btn) return;
          e.preventDefault(); e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const call = (state._arcCalls||[]).find(x=>String(x.id||x.twilioSid||x.callSid||'')===String(id));
          if (!call) return;
          
          // Check if this is a not-processed call that needs CI processing
          if (btn.classList.contains('not-processed')) {
            // Use the correct property names from the call object
            const callSid = call.id || call.twilioSid || call.callSid;
            const recordingSid = call.recordingSid || call.recording_id;
            console.log('[AccountDetail] Triggering CI processing for call:', callSid, 'recording:', recordingSid);
            triggerAccountCI(callSid, recordingSid, btn);
            return;
          }
          
          // Otherwise, toggle the details as usual
          toggleRcDetails(btn, call);
        });
        list._delegated = '1';
      }
      arcBindPager();
      try { window.ClickToCall?.processSpecificPhoneElements?.(); } catch(_) {}
    } catch (e) {
      console.warn('[RecentCalls][Account] load failed', e);
      arcUpdateListAnimated(list, '<div class="rc-empty">Failed to load recent calls</div>');
    }
  }

  const ARC_PAGE_SIZE = 5;
  function arcGetSlice(){ const a = Array.isArray(state._arcCalls)?state._arcCalls:[]; const p=Math.max(1, parseInt(state._arcPage||1,10)); const s=(p-1)*ARC_PAGE_SIZE; return a.slice(s, s+ARC_PAGE_SIZE); }
  function arcRenderPage(){
    const list = document.getElementById('account-recent-calls-list'); if(!list) return;
    const total = Array.isArray(state._arcCalls)?state._arcCalls.length:0; 
    if(!total){ 
      arcUpdateListAnimated(list, '<div class="rc-empty">No recent calls</div>'); 
      arcUpdatePager(0,0); 
      return; 
    }
    const slice = arcGetSlice();
    arcUpdateListAnimated(list, slice.map(call => rcItemHtml(call)).join(''));
    // delegate click to handle dynamic rerenders (prevent duplicate listeners)
    list.querySelectorAll('.rc-insights').forEach(btn => {
      if (!btn._insightsListenerBound) {
        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const call = (state._arcCalls||[]).find(x=>String(x.id||x.twilioSid||x.callSid||'')===String(id));
          if (!call) return;
          
          // Check if this is a not-processed call that needs CI processing
          if (btn.classList.contains('not-processed')) {
            // Use the correct property names from the call object
            const callSid = call.id || call.twilioSid || call.callSid;
            const recordingSid = call.recordingSid || call.recording_id;
            console.log('[AccountDetail] Direct button - Triggering CI processing for call:', callSid, 'recording:', recordingSid);
            triggerAccountCI(callSid, recordingSid, btn);
            return;
          }
          
          // Otherwise, toggle the details as usual
          toggleRcDetails(btn, call);
        });
        btn._insightsListenerBound = true;
      }
    });
    const totalPages = Math.max(1, Math.ceil(total/ARC_PAGE_SIZE));
    arcUpdatePager(state._arcPage||1, totalPages);
  }
  function arcBindPager(){ const pager=document.getElementById('account-rc-pager'); if(!pager||pager._bound) return; const prev=document.getElementById('arc-prev'); const next=document.getElementById('arc-next'); prev?.addEventListener('click', (e)=>{ e.preventDefault(); const total=Math.ceil((state._arcCalls||[]).length/ARC_PAGE_SIZE)||1; state._arcPage=Math.max(1,(state._arcPage||1)-1); arcRenderPage(); arcUpdatePager(state._arcPage,total); }); next?.addEventListener('click', (e)=>{ e.preventDefault(); const total=Math.ceil((state._arcCalls||[]).length/ARC_PAGE_SIZE)||1; state._arcPage=Math.min(total,(state._arcPage||1)+1); arcRenderPage(); arcUpdatePager(state._arcPage,total); }); pager._bound='1'; }
  function arcUpdatePager(current, total){ const pager=document.getElementById('account-rc-pager'); const info=document.getElementById('arc-info'); const prev=document.getElementById('arc-prev'); const next=document.getElementById('arc-next'); if(!pager||!info||!prev||!next) return; const show=total>1; pager.style.display=show?'flex':'none'; info.textContent=`${Math.max(1,parseInt(current||1,10))} of ${Math.max(1,parseInt(total||1,10))}`; prev.disabled=(current<=1); next.disabled=(current>=total); }
  function arcSpinnerHtml(){ return '<div class="rc-loading"><div class="rc-spinner" aria-hidden="true"></div></div>'; }
  function arcSetLoading(list){ try { let ov=list.querySelector('.rc-loading-overlay'); if(!ov){ ov=document.createElement('div'); ov.className='rc-loading-overlay'; ov.innerHTML=arcSpinnerHtml(); ov.style.position='absolute'; ov.style.inset='0'; ov.style.display='flex'; ov.style.alignItems='center'; ov.style.justifyContent='center'; ov.style.pointerEvents='none'; list.appendChild(ov);} ov.style.display='flex'; } catch(_) {} }
  function arcUpdateListAnimated(list, html){
    try {
      const avoidAnim = !!(state._isScrolling || (state._arcOpenIds && state._arcOpenIds.size > 0));
      if (avoidAnim) { 
        list.innerHTML = html; 
        // Remove any lingering loading overlay after content update
        try { const ov = list.querySelector('.rc-loading-overlay'); if (ov) ov.remove(); } catch(_) {}
        return; 
      }
      const h0 = list.offsetHeight;
      list.style.height = h0 + 'px';
      list.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        list.innerHTML = html;
        // Remove any lingering loading overlay after content update
        try { const ov = list.querySelector('.rc-loading-overlay'); if (ov) ov.remove(); } catch(_) {}
        const h1 = list.scrollHeight;
        list.style.transition = 'height 220ms ease, opacity 220ms ease';
        list.style.opacity = '1';
        list.style.height = h1 + 'px';
        // Use requestAnimationFrame for smoother animation cleanup
        requestAnimationFrame(() => {
          setTimeout(() => { list.style.height = ''; list.style.transition = ''; list.style.overflow = ''; }, 260);
        });
      });
    } catch(_) { 
      list.innerHTML = html; 
      // Remove any lingering loading overlay after content update
      try { const ov = list.querySelector('.rc-loading-overlay'); if (ov) ov.remove(); } catch(_) {}
    }
  }

  function rcItemHtml(c){
    const name = escapeHtml(c.contactName || 'Unknown');
    const company = escapeHtml(c.accountName || c.company || '');
    const outcome = escapeHtml(c.outcome || c.status || '');
    const ts = c.callTime || c.timestamp || new Date().toISOString();
    const when = new Date(ts).toLocaleString();
    const idAttr = escapeHtml(String(c.id||c.twilioSid||c.callSid||''));
    
    // Check for live duration first, fallback to database duration
    let durStr = '';
    if (state._liveCallDurations && state._liveCallDurations.has(idAttr)) {
      const liveData = state._liveCallDurations.get(idAttr);
      // Only use live duration if it's recent (within last 10 seconds)
      if (Date.now() - liveData.timestamp < 10000) {
        durStr = liveData.durationFormatted;
      }
    }
    
    // Fallback to database duration if no live duration
    if (!durStr) {
      const dur = Math.max(0, parseInt(c.durationSec||c.duration||0,10));
      durStr = `${Math.floor(dur/60)}m ${dur%60}s`;
    }
    
    const phone = escapeHtml(String(c.counterpartyPretty || c.to || c.from || ''));
    const direction = escapeHtml((c.direction || '').charAt(0).toUpperCase() + (c.direction || '').slice(1));
    const sig = `${idAttr}|${c.status||c.outcome||''}|${c.durationSec||c.duration||0}|${c.transcript?1:0}|${c.aiInsights?1:0}`;
    
    return `
      <div class=\"rc-item\" data-id=\"${idAttr}\" data-sig=\"${sig}\">
        <div class="rc-meta">
          <div class="rc-title">${name}${company?` • ${company}`:''}</div>
          <div class="rc-sub">${when} • <span class="rc-duration">${durStr}</span> • <span class="phone-number" 
                                 data-contact-id="" 
                                 data-account-id="${c.accountId || state.currentAccount?.id || ''}" 
                                 data-contact-name="" 
                                 data-company-name="${escapeHtml(company)}">${phone}</span>${direction?` • ${direction}`:''}</div>
        </div>
        <div class="rc-actions">
          <span class="rc-outcome">${outcome}</span>
          <button type="button" class="rc-icon-btn rc-insights ${(!c.transcript || !c.aiInsights || Object.keys(c.aiInsights || {}).length === 0) ? 'not-processed' : ''}" data-id="${escapeHtml(String(c.id||''))}" aria-label="View insights" title="${(!c.transcript || !c.aiInsights || Object.keys(c.aiInsights || {}).length === 0) ? 'Process Call' : 'View AI insights'}">${svgEye()}</button>
        </div>
      </div>`;
  }
  // Trigger on-demand CI processing for a call
  async function triggerAccountCI(callSid, recordingSid, btn) {
    if (!callSid || !recordingSid) {
      console.warn('[AccountDetail] Missing callSid or recordingSid for CI processing:', { callSid, recordingSid });
      return;
    }

    try {
      // Show loading spinner on the button
      btn.innerHTML = '<div class="loading-spinner" aria-hidden="true"></div>';
      btn.classList.add('processing');
      btn.disabled = true;

      // Show toast notification
      if (window.ToastManager) {
        window.ToastManager.showToast('Processing call insights...', 'info');
      }

      // Call the CI request endpoint
      const response = await fetch('/api/twilio/ci-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callSid: callSid,
          recordingSid: recordingSid
        })
      });

      if (!response.ok) {
        try {
          const err = await response.json().catch(()=>({}));
          const msg = (err && (err.error || err.details)) ? String(err.error || err.details) : `CI request failed: ${response.status} ${response.statusText}`;
          if (window.ToastManager) { window.ToastManager.showToast(msg, 'error'); }
        } catch(_) {
          try { if (window.ToastManager) { window.ToastManager.showToast('Failed to start call processing', 'error'); } } catch(__) {}
        }
        try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
        return;
      }

      const result = await response.json();
      console.log('[AccountDetail] CI processing initiated:', result);

      // Update the button to show processing state
      btn.innerHTML = '<div class="loading-spinner" aria-hidden="true"></div>';
      btn.title = 'Processing call insights...';
      btn.classList.remove('not-processed');
      btn.classList.add('processing');

    } catch (error) {
      console.error('[AccountDetail] Failed to trigger CI processing:', error);
      
      // Reset button state on error
      btn.innerHTML = svgEye();
      btn.classList.remove('processing');
      btn.disabled = false;
      
      // Show error toast
      if (window.ToastManager) {
        window.ToastManager.showToast('Failed to start call processing', 'error');
      }
    }
  }

  // Inline expanding details
  function toggleRcDetails(btn, call){
    const item = btn.closest('.rc-item');
    if (!item) return;
    const existing = item.nextElementSibling && item.nextElementSibling.classList && item.nextElementSibling.classList.contains('rc-details') ? item.nextElementSibling : null;
    const idStr = String(call.id || call.twilioSid || call.callSid || '');
    if (existing) {
      // User explicitly closed - remove from open tracker
      try { if (state._arcOpenIds && state._arcOpenIds instanceof Set) state._arcOpenIds.delete(idStr); } catch(_) {}
      animateCollapse(existing, () => existing.remove());
      return;
    }
    // Ensure open tracker exists and add current id
    try { if (!state._arcOpenIds || !(state._arcOpenIds instanceof Set)) state._arcOpenIds = new Set(); state._arcOpenIds.add(idStr); } catch(_) {}
    const panel = document.createElement('div');
    panel.className = 'rc-details';
    panel.innerHTML = `<div class="rc-details-inner">${insightsInlineHtml(call)}</div>`;
    item.insertAdjacentElement('afterend', panel);
    animateExpand(panel);

    // Background transcript fetch if missing
    try {
      if ((!call.transcript || String(call.transcript).trim()==='') && call.twilioSid) {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        const url = base ? `${base}/api/twilio/ai-insights` : '/api/twilio/ai-insights';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: call.twilioSid })
        }).then(res=>res.json()).then(data=>{
          if (data && data.transcript) {
            call.transcript = data.transcript;
            const tEl = panel.querySelector('.pc-transcript');
            if (tEl) tEl.textContent = data.transcript;
          }
        }).catch(()=>{});
      }
    } catch(_) {}
  }
  function animateExpand(el){ 
    el.style.height='0px'; 
    el.style.opacity='0'; 
    const h=el.scrollHeight; 
    requestAnimationFrame(()=>{ 
      el.classList.add('expanding'); 
      el.style.transition='height 180ms ease, opacity 180ms ease'; 
      el.style.height=h+'px'; 
      el.style.opacity='1'; 
      // Use requestAnimationFrame for smoother cleanup
      requestAnimationFrame(() => {
        setTimeout(()=>{ el.style.height=''; el.style.transition=''; el.classList.remove('expanding'); },200); 
      });
    }); 
  }
  function animateCollapse(el, done){ 
    const h=el.scrollHeight; 
    el.style.height=h+'px'; 
    el.style.opacity='1'; 
    requestAnimationFrame(()=>{ 
      el.classList.add('collapsing'); 
      el.style.transition='height 140ms ease, opacity 140ms ease'; 
      el.style.height='0px'; 
      el.style.opacity='0'; 
      // Use requestAnimationFrame for smoother cleanup
      requestAnimationFrame(() => {
        setTimeout(()=>{ el.classList.remove('collapsing'); done&&done(); },160); 
      });
    }); 
  }
  function insightsInlineHtml(r){
    const AI = r.aiInsights || {};
    // Build summary: prefer Twilio Operator summary, then fallback to constructed paragraph
    let paragraph = '';
    let bulletItems = [];
    const rawTwilioSummary = (AI && typeof AI.summary === 'string') ? AI.summary.trim() : '';
    if (rawTwilioSummary) {
      // Twilio format: "Paragraph. • Bullet 1 • Bullet 2 ..."
      const parts = rawTwilioSummary.split(' • ').map(s=>s.trim()).filter(Boolean);
      paragraph = parts.shift() || '';
      bulletItems = parts;
    } else if (r.aiSummary && String(r.aiSummary).trim()) {
      paragraph = String(r.aiSummary).trim();
    } else if (AI && Object.keys(AI).length) {
      const sentiment = AI.sentiment || 'Unknown';
      const disposition = AI.disposition || '';
      const topics = Array.isArray(AI.keyTopics) ? AI.keyTopics.slice(0,3).join(', ') : '';
      const who = r.contactName ? `Call with ${r.contactName}` : 'Call';
      let p = `${who}`;
      if (disposition) p += ` — ${disposition.toLowerCase()} disposition`;
      if (topics) p += `. Topics: ${topics}`;
      if (sentiment) p += `. ${sentiment} sentiment.`;
      paragraph = p;
    } else {
      paragraph = 'No summary available';
    }
    // Filter bullets to avoid redundancy with right-hand sections (energy, topics, steps, pain, entities, budget, timeline)
    const redundant = /(current rate|rate type|supplier|utility|contract|usage|term|budget|timeline|topic|next step|pain point|entities?)/i;
    const filteredBullets = (bulletItems||[]).filter(b => b && !redundant.test(b)).slice(0,6);
    const sentiment = AI.sentiment || 'Unknown';
    const disposition = AI.disposition || '';
    const keyTopics = Array.isArray(AI.keyTopics) ? AI.keyTopics : [];
    const nextSteps = Array.isArray(AI.nextSteps) ? AI.nextSteps : [];
    const pain = Array.isArray(AI.painPoints) ? AI.painPoints : [];
    const flags = AI.flags || {};
    const chips = [
      `<span class=\"pc-chip ${sentiment==='Positive'?'ok':sentiment==='Negative'?'danger':'info'}\">Sentiment: ${escapeHtml(sentiment)}</span>`,
      disposition ? `<span class=\"pc-chip info\">Disposition: ${escapeHtml(disposition)}</span>` : '',
      flags.nonEnglish ? '<span class="pc-chip warn">Non‑English</span>' : '',
      flags.voicemailDetected ? '<span class="pc-chip warn">Voicemail</span>' : '',
      flags.callTransfer ? '<span class="pc-chip info">Transferred</span>' : '',
      flags.doNotContact ? '<span class="pc-chip danger">Do Not Contact</span>' : '',
      flags.recordingDisclosure ? '<span class="pc-chip ok">Recording Disclosure</span>' : ''
    ].filter(Boolean).join('');
    const topicsHtml = keyTopics.length ? keyTopics.map(t=>`<span class=\"pc-chip\">${escapeHtml(t)}</span>`).join('') : '<span class="pc-chip">None</span>';
    const nextHtml = nextSteps.length ? nextSteps.map(t=>`<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None</div>';
    const painHtml = pain.length ? pain.map(t=>`<div>• ${escapeHtml(t)}</div>`).join('') : '<div>None mentioned</div>';
    function toMMSS(s){ const m=Math.floor((s||0)/60), ss=(s||0)%60; return `${String(m)}:${String(ss).padStart(2,'0')}`; }
  // Expose CI trigger for the eye button (Account Details)
  if (!window.__triggerAccountCI){
    window.__triggerAccountCI = async function(callSid, recordingSid){
      try{
        const btn = document.querySelector('button.rc-icon-btn[data-ci-btn="1"]');
        if (btn){ btn.classList.add('is-loading'); btn.disabled = true; }
        // Show spinner by swapping inner SVG to a small loader
        if (btn){ btn.innerHTML = '<span class="loader" style="display:inline-block;width:16px;height:16px;border:2px solid var(--orange-subtle);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span>'; }
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/,'');
        const url = `${base}/api/twilio/ci-request`;
        const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ callSid, recordingSid }) });
        const data = await resp.json().catch(()=>({}));
        if (data && data.transcriptSid){
          if (window.ToastManager){
            window.ToastManager.showToast({ type:'save', title:'Processing started', message:`We are processing your call insights now.` });
          }
        } else {
          if (window.ToastManager){ window.ToastManager.showToast({ type:'warn', title:'Could not start', message:'Unable to queue call insights. Try again shortly.' }); }
        }
      }catch(e){
        if (window.ToastManager){ window.ToastManager.showToast({ type:'danger', title:'Error', message:e?.message||'Failed to start insights' }); }
      }
    };
    // Loader keyframes (once)
    const styleId = '__ci_loader_style__';
    if (!document.getElementById(styleId)){
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = '@keyframes spin {from{transform:rotate(0)} to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
  }
    function renderTranscriptHtml(A, raw){
      let turns = Array.isArray(A?.speakerTurns) ? A.speakerTurns : [];
      if (turns.length && !turns.some(t=>t && (t.role==='agent'||t.role==='customer'))){
        let next='customer';
        turns = turns.map(t=>({ t:Number(t.t)||0, role: next = (next==='agent'?'customer':'agent'), text: t.text||'' }));
      }
      if (turns.length){
        const contactFirst = (String(r.contactName||r.accountName||'').trim().split(/\s+/)[0]) || 'Customer';
        const groups=[]; let current=null;
        for(const t of turns){ const roleKey=t.role==='agent'?'agent':(t.role==='customer'?'customer':'other'); const text=ad_normalizeSupplierTokens(t.text||''); const ts=Number(t.t)||0; if(current && current.role===roleKey){ current.texts.push(text); current.end=ts; } else { if(current) groups.push(current); current={ role:roleKey, start:ts, texts:[text] }; } }
        if(current) groups.push(current);
        return groups.map(g=>{ const label=g.role==='agent'?'You':(g.role==='customer'?contactFirst:'Speaker'); const avatar=g.role==='agent'?ad_getAgentAvatar():ad_getContactAvatar(contactFirst, r); return `<div class=\"transcript-message ${g.role}\"><div class=\"transcript-avatar\">${avatar}</div><div class=\"transcript-content\"><div class=\"transcript-header\"><span class=\"transcript-speaker\">${label}</span><span class=\"transcript-time\">${toMMSS(g.start)}</span></div><div class=\"transcript-text\">${escapeHtml(g.texts.join(' ').trim())}</div></div></div>`; }).join('');
      }
      const rawText = String(raw||'').trim();
      if (rawText) return `<div class=\"transcript-message\"><div class=\"transcript-content\"><div class=\"transcript-text\">${escapeHtml(rawText)}</div></div></div>`;
      return 'Transcript not available';
    }

    // Prefer CI sentences + channelRoleMap for dual-channel mapping (per Twilio guidance)
    let transcriptHtml = '';
    try {
      const ci = r.conversationalIntelligence || {};
      const sentences = Array.isArray(ci.sentences) ? ci.sentences : [];
      const channelMap = ci.channelRoleMap || {};
      const normalizeChannel = (c)=>{ const s=(c==null?'':String(c)).trim(); if(s==='0') return '1'; if(/^[Aa]$/.test(s)) return '1'; if(/^[Bb]$/.test(s)) return '2'; return s; };
      const resolveRole = (ch)=>{
        const n = normalizeChannel(ch);
        const mapped = channelMap[n];
        if (mapped === 'agent' || mapped === 'customer') return mapped;
        const agentCh = String(ci.agentChannel || channelMap.agentChannel || '');
        if (agentCh && n === agentCh) return 'agent';
        if (agentCh) return 'customer';
        return '';
      };
      if (sentences.length && (Object.keys(channelMap).length || ci.agentChannel!=null || channelMap.agentChannel!=null)){
        const turns = sentences.map(s=>{
          const role = resolveRole(s.channel ?? s.channelNumber ?? s.channel_id ?? s.channelIndex) || 'other';
          const t = Math.max(0, Number(s.startTime||0));
          const text = (s.text || s.transcript || '').trim();
          return { t, role, text };
        });
        transcriptHtml = renderTranscriptHtml({ speakerTurns: turns }, '');
      } else {
        transcriptHtml = renderTranscriptHtml(AI, r.formattedTranscript || r.transcript);
      }
    } catch(_){
      try { transcriptHtml = renderTranscriptHtml(AI, r.formattedTranscript || r.transcript); } catch(__){ transcriptHtml = 'Transcript not available'; }
    }
    
    // DEBUG: Log transcript data for debugging
    console.log('[Account Detail] Call transcript debug:', {
      callId: r.id,
      twilioSid: r.twilioSid,
      hasTranscript: !!r.transcript,
      transcriptLength: r.transcript ? r.transcript.length : 0,
      transcriptPreview: r.transcript ? r.transcript.substring(0, 100) : 'N/A',
      hasAI: !!AI,
      aiKeys: AI ? Object.keys(AI) : [],
      finalTranscriptRenderedPreview: (function(){ try{ return (transcriptHtml || '').slice(0, 100); }catch(_){ return 'N/A'; } })()
    });
    const rec = r.audioUrl || r.recordingUrl || '';
    let proxied = '';
    if (rec) {
      if (String(rec).includes('/api/recording?url=')) proxied = rec;
      else {
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
        const playbackBase = /localhost|127\.0\.0\.1/.test(base) ? 'https://power-choosers-crm.vercel.app' : base;
        proxied = `${playbackBase}/api/recording?url=${encodeURIComponent(rec)}`;
      }
    }
    const audio = proxied ? `<audio controls style=\"width:100%; margin-top:8px;\"><source src=\"${proxied}\" type=\"audio/mpeg\">Your browser does not support audio playback.</audio>` : '<div style=\"color:var(--text-muted); font-size:12px;\">No recording available</div>';
    const hasAI = AI && Object.keys(AI).length > 0;

    // Energy & Contract + Entities to mirror Calls modal
    const contract = AI.contract || {};
    const rate = contract.currentRate || contract.rate || 'Unknown';
    const supplier = contract.supplier || contract.utility || 'Unknown';
    const contractEnd = contract.contractEnd || contract.endDate || 'Not discussed';
    const usage = (contract.usageKWh || contract.usage || 'Not provided')+'';
    const rateType = contract.rateType || 'Unknown';
    const contractLength = (contract.contractLength || 'Unknown')+'';
    const budget = AI.budget || 'Unclear';
    const timeline = AI.timeline || 'Not specified';
    const entities = Array.isArray(AI.entities) ? AI.entities : [];
    const entitiesHtml = entities.length ? entities.slice(0,20).map(e=>`<span class=\"pc-chip\">${escapeHtml(e.type||'Entity')}: ${escapeHtml(e.text||'')}</span>`).join('') : '<span class=\"pc-chip\">None</span>';
    return `
      <div class=\"insights-grid\"> 
        <div>
          <div class=\"ip-card\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path><polyline points=\"14,2 14,8 20,8\"></polyline></svg>
              AI Call Summary
            </h4>
            <div class=\"pc-chips\" style=\"margin:6px 0 10px 0;\">${chips}</div>
            <div style=\"color:var(--text-secondary); line-height:1.5; margin-bottom:8px;\">${escapeHtml(paragraph)}</div>
            ${filteredBullets.length ? `<ul class=\"summary-bullets\" style=\"margin:0; padding-left:18px; color:var(--text-secondary);\">${filteredBullets.map(b=>`<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
          </div>
          <div class=\"ip-card\" style=\"margin-top:12px;\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"></path></svg>
              Call Transcript
            </h4>
            <div class=\"pc-transcript-container\">${transcriptHtml}</div>
          </div>
        </div>
        <div>
          <div class=\"ip-card\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"></path></svg>
              Call Recording
            </h4>
            <div style=\"color:var(--text-secondary); font-style:italic;\">${audio}</div>
            ${proxied ? '' : '<div style=\"color:var(--text-muted); font-size:12px; margin-top:4px;\">Recording may take 1-2 minutes to process after call completion</div>'}
            ${proxied && r.recordingChannels ? `<div style=\"color:var(--text-secondary); font-size:12px; margin-top:4px;\">Recording: ${r.recordingChannels === '2' ? 'Dual-Channel (2 Channels)' : 'Single Channel'} • Source: ${r.recordingSource || 'Unknown'}</div>` : ''}
            ${hasAI ? '<div style=\"color:var(--orange-subtle); font-size:12px; margin-top:4px;\">✓ AI analysis completed</div>' : '<div style=\"color:var(--text-muted); font-size:12px; margin-top:4px;\">AI analysis in progress...</div>'}
          </div>
          <div class=\"ip-card\" style=\"margin-top:12px;\">
            <h4>
              <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"23\"></line><path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\"></path></svg>
              Energy & Contract Details
            </h4>
            <div class=\"pc-kv\">
              <div class=\"k\">Current rate</div><div class=\"v\">${escapeHtml(rate)}</div>
              <div class=\"k\">Supplier/Utility</div><div class=\"v\">${escapeHtml(supplier)}</div>
              <div class=\"k\">Contract end</div><div class=\"v\">${escapeHtml(contractEnd)}</div>
              <div class=\"k\">Usage</div><div class=\"v\">${escapeHtml(usage)}</div>
              <div class=\"k\">Rate type</div><div class=\"v\">${escapeHtml(rateType)}</div>
              <div class=\"k\">Term</div><div class=\"v\">${escapeHtml(contractLength)}</div>
              <div class=\"k\">Budget</div><div class=\"v\">${escapeHtml(budget)}</div>
              <div class=\"k\">Timeline</div><div class=\"v\">${escapeHtml(timeline)}</div>
            </div>
          </div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z\"></path></svg> Key Topics</h4><div class=\"pc-chips\">${topicsHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polyline points=\"9 18 15 12 9 6\"></polyline></svg> Next Steps</h4><div style=\"color:var(--text-secondary); font-size:12px;\">${nextHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"></line><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line></svg> Pain Points</h4><div style=\"color:var(--text-secondary); font-size:12px;\">${painHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px;\"><h4><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle></svg> Entities</h4><div class=\"pc-chips\">${entitiesHtml}</div></div>
          <div class=\"ip-card\" style=\"margin-top:12px; text-align:right;\"><button class=\"rc-icon-btn\" data-ci-btn=\"1\" onclick=\"(function(){ try{ (window.__triggerAccountCI||function(){})('${String(r.callSid||r.id||'')}','${String(r.recordingSid||'')}'); }catch(_){}})()\" aria-label=\"Process call insights\" title=\"Process call insights\">${svgEye()}</button></div>
        </div>
      </div>`;
  }

  function arcPatchList(list, slice){
    // Build map of existing rows by id
    const rows = Array.from(list.querySelectorAll('.rc-item'));
    const byId = new Map();
    rows.forEach(r => { const id = r.getAttribute('data-id'); if (id) byId.set(id, r); });
    // Desired order
    let anchor = null;
    slice.forEach(call => {
      const id = String(call.id || call.twilioSid || call.callSid || '');
      let row = byId.get(id);
      const newSig = `${id}|${call.status||call.outcome||''}|${call.durationSec||call.duration||0}|${call.transcript?1:0}|${call.aiInsights?1:0}`;
      if (row){
        // Move row to correct order if needed (keep rc-details sibling with it)
        const needMove = !anchor ? (list.firstElementChild !== row) : (anchor.nextSibling !== row);
        if (needMove){
          const details = (row.nextElementSibling && row.nextElementSibling.classList.contains('rc-details')) ? row.nextElementSibling : null;
          if (!anchor) list.insertBefore(row, list.firstChild);
          else list.insertBefore(row, anchor.nextSibling);
          if (details) list.insertBefore(details, row.nextSibling);
        }
        // Update content only if signature changed
        const oldSig = row.getAttribute('data-sig') || '';
        if (oldSig !== newSig){
          row.setAttribute('data-sig', newSig);
          // Replace inner of row meta/actions only, keep row element and potential details sibling intact
          const html = rcItemHtml(call);
          const tmp = document.createElement('div');
          tmp.innerHTML = html.trim();
          const fresh = tmp.firstElementChild;
          if (fresh){
            // Swap inner structure of row (children) without replacing row node
            row.innerHTML = fresh.innerHTML;
          }
        }
      } else {
        // Create new row and insert
        const html = rcItemHtml(call);
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        row = tmp.firstElementChild;
        if (!anchor) list.insertBefore(row, list.firstChild);
        else list.insertBefore(row, anchor.nextSibling);
        // Auto-open if this id was previously open
        try {
          if (state._arcOpenIds && state._arcOpenIds.has(id)){
            const btn = row.querySelector('.rc-icon-btn.rc-insights');
            if (btn) toggleRcDetails(btn, call);
          }
        } catch(_) {}
      }
      anchor = row;
      byId.delete(id);
    });
    // Remove any extra rows not in slice (and their details), but keep details for open ids on other pages
    byId.forEach((row, id) => {
      const details = (row.nextElementSibling && row.nextElementSibling.classList.contains('rc-details')) ? row.nextElementSibling : null;
      if (details) details.remove();
      row.remove();
    });
  }

  function svgEye(){
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function openAddContactModal() {
    // Use the main CRM's modal opening function to ensure proper event binding
    if (window.crm && typeof window.crm.createAddContactModal === 'function') {
      // Pre-fill the company name before opening the modal
      const modal = document.getElementById('modal-add-contact');
      if (modal && state.currentAccount) {
        const companyInput = modal.querySelector('input[name="companyName"]');
        if (companyInput) {
          const accountName = state.currentAccount.accountName || state.currentAccount.name || state.currentAccount.companyName;
          if (accountName) {
            companyInput.value = accountName;
          }
        }
      }
      
      // Open the modal using the proper function
      window.crm.createAddContactModal();
    } else {
      console.error('CRM createAddContactModal function not available');
    }
  }

  function attachAccountDetailEvents() {
    // Listen for activity refresh events
    document.addEventListener('pc:activities-refresh', (e) => {
      const { entityType, entityId } = e.detail || {};
      if (entityType === 'account' && entityId === state.currentAccount?.id) {
        // Refresh account activities
        if (window.ActivityManager) {
          const activityManager = new window.ActivityManager();
          activityManager.renderActivities('account-activity-timeline', 'account', entityId);
        }
      }
    });

    // Listen for contact creation events to refresh the contacts list
    document.addEventListener('pc:contact-created', (e) => {
      if (state.currentAccount) {
        // Refresh the contacts list
        const contactsList = document.getElementById('account-contacts-list');
        if (contactsList) {
          contactsList.innerHTML = renderAccountContacts(state.currentAccount);
          // Re-bind event handlers for the new contact items
          bindContactItemEvents();
        }
      }
    });

    const backBtn = document.getElementById('back-to-accounts');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Check if we came from health widget (call scripts page)
        const healthReturnPage = sessionStorage.getItem('health-widget-return-page');
        if (healthReturnPage) {
          sessionStorage.removeItem('health-widget-return-page');
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage(healthReturnPage.replace('-page', ''));
          }
          return;
        }
        
        // Check if we came from Calls page
        if (window._accountNavigationSource === 'calls') {
          try {
            const restore = window._callsReturn || {};
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('calls');
              // Restore Calls state
              setTimeout(() => {
                try {
                  const ev = new CustomEvent('pc:calls-restore', { detail: {
                    page: restore.page,
                    scroll: restore.scroll,
                    filters: restore.filters,
                    selectedItems: restore.selectedItems,
                    searchTerm: restore.searchTerm
                  }});
                  document.dispatchEvent(ev);
                } catch(_) {}
              }, 60);
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window._callsReturn = null;
          } catch (_) { /* noop */ }
          return;
        }
        
        // Special case: if we arrived here from Contact Detail's company link,
        // return back to that contact detail view.
        if (window._contactNavigationSource === 'contact-detail' && window._contactNavigationContactId) {
          const contactId = window._contactNavigationContactId;
          // Clear the navigation source first
          window._contactNavigationSource = null;
          window._contactNavigationContactId = null;
          try {
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              // Ensure contact detail renders after page switches
              setTimeout(() => {
                if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                  window.ContactDetail.show(contactId);
                }
              }, 80);
            }
          } catch (_) { /* noop */ }
          return;
        }

        // If we arrived here from People page (company link), go back to People and restore state
        if (window._accountNavigationSource === 'people') {
          try {
            const restore = window._peopleReturn || {};
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              window.crm.navigateToPage('people');
              // Dispatch an event for People page to restore pagination and scroll
              setTimeout(() => {
                try {
                  const ev = new CustomEvent('pc:people-restore', { detail: { page: restore.page, scroll: restore.scroll } });
                  document.dispatchEvent(ev);
                } catch(_) {}
              }, 40);
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window._peopleReturn = null;
          } catch (_) { /* noop */ }
          return;
        }

        // Check if we came from Accounts page
        if (window._accountNavigationSource === 'accounts') {
          try {
            const restore = window._accountsReturn || {};
            console.log('[Account Detail] Back button: Returning to accounts page with restore data:', restore);
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              // Hint Accounts page to avoid forcing page=1 during initial load
              try { window.__restoringAccounts = true; } catch (_) {}
              window.crm.navigateToPage('accounts');
              // Dispatch an event for Accounts page to restore UI state
              setTimeout(() => {
                try {
                  const ev = new CustomEvent('pc:accounts-restore', { detail: {
                    page: restore.page, scroll: restore.scroll, filters: restore.filters, selectedItems: restore.selectedItems, searchTerm: restore.searchTerm } });
                  document.dispatchEvent(ev);
                  console.log('[Account Detail] Back button: Dispatched pc:accounts-restore event');
                } catch(_) {}
              }, 60);
            }
            // Clear navigation markers after successful navigation
            window._accountNavigationSource = null;
            window._accountsReturn = null;
          } catch (_) { /* noop */ }
          return;
        }
        
        // Check if we came from list detail page
        if (window._accountNavigationSource === 'list-detail' && window._accountNavigationListId) {
          console.log('Returning to list detail page:', window._accountNavigationListId);
          // Navigate back to list detail page
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            console.log('Navigating to list detail page for account:', window._accountNavigationListId);
            // Seed context so list detail initializes to the correct list and view
            try {
              window.listDetailContext = {
                listId: window._accountNavigationListId,
                listName: window._accountNavigationListName || 'List',
                listKind: (window._accountNavigationListView === 'people') ? 'people' : 'accounts'
              };
            } catch (_) {}
            window.crm.navigateToPage('list-detail');
          }
          // Clear the navigation source
          window._accountNavigationSource = null;
          window._accountNavigationListId = null;
          window._accountNavigationListName = null;
          window._accountNavigationListView = null;
          return;
        }
        
        // Default behavior: return to accounts page
        try { window.crm && window.crm.navigateToPage('accounts'); } catch (e) { /* noop */ }
        // Rebind accounts page dynamic handlers
        if (window.accountsModule && typeof window.accountsModule.rebindDynamic === 'function') {
          try { window.accountsModule.rebindDynamic(); } catch (e) { /* noop */ }
        }
      });
    }

    // Widgets dropdown functionality
    const widgetsBtn = document.getElementById('open-widgets');
    const widgetsWrap = document.querySelector('#account-detail-header .widgets-wrap');
    if (widgetsBtn && widgetsWrap) {
      // Click toggles open state (also support keyboard)
      widgetsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = widgetsWrap.classList.toggle('open');
        widgetsBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // Hover/focus intent: open immediately, close with slight delay
      const openNow = () => {
        clearTimeout(widgetsWrap._closeTimer);
        if (!widgetsWrap.classList.contains('open')) {
          widgetsWrap.classList.add('open');
          widgetsBtn.setAttribute('aria-expanded', 'true');
        }
      };
      const closeSoon = () => {
        clearTimeout(widgetsWrap._closeTimer);
        widgetsWrap._closeTimer = setTimeout(() => {
          widgetsWrap.classList.remove('open');
          widgetsBtn.setAttribute('aria-expanded', 'false');
        }, 320); // slightly longer grace period to move into the drawer
      };

      widgetsWrap.addEventListener('mouseenter', openNow);
      widgetsWrap.addEventListener('mouseleave', closeSoon);
      widgetsWrap.addEventListener('focusin', openNow);
      widgetsWrap.addEventListener('focusout', (e) => {
        // If focus moves outside the wrap, start close timer
        if (!widgetsWrap.contains(e.relatedTarget)) closeSoon();
      });
    }

    // Add contact button
    const addContactBtn = document.getElementById('add-contact-to-account');
    if (addContactBtn) {
      addContactBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openAddContactModal();
      });
    }

    // Widget drawer item clicks
    const widgetsDrawer = document.querySelector('#account-detail-header .widgets-drawer');
    if (widgetsDrawer && !widgetsDrawer._bound) {
      widgetsDrawer.addEventListener('click', (e) => {
        const item = e.target.closest?.('.widget-item');
        if (!item) return;
        const which = item.getAttribute('data-widget');
        handleWidgetAction(which);
      });
      widgetsDrawer._bound = '1';
    }

    // Quick actions
    const headerLinkedInBtn = document.querySelector('.linkedin-header-btn');
    if (headerLinkedInBtn) {
      headerLinkedInBtn.addEventListener('click', () => handleQuickAction('linkedin'));
    }

    // Inline edit/copy/delete for Account Information
    const infoGrids = document.querySelectorAll('#account-detail-view .info-grid');
    infoGrids.forEach(infoGrid => {
      if (infoGrid && !infoGrid._bound) {
        infoGrid.addEventListener('click', async (e) => {
          const wrap = e.target.closest?.('.info-value-wrap');
          if (!wrap) return;
          const field = wrap.getAttribute('data-field');
          if (!field) return;

          // Edit button: switch to input
          const editBtn = e.target.closest('.info-edit');
          if (editBtn) {
            e.preventDefault();
            beginEditField(wrap, field);
            return;
          }
          
          // Copy button
          const copyBtn = e.target.closest('.info-copy');
          if (copyBtn) {
            const txt = wrap.querySelector('.info-value-text')?.textContent?.trim() || '';
            try { await navigator.clipboard?.writeText(txt); } catch (_) {}
            try { window.crm?.showToast && window.crm.showToast('Copied'); } catch (_) {}
            return;
          }
          
          // Delete button
          const delBtn = e.target.closest('.info-delete');
          if (delBtn) {
            e.preventDefault();
            await saveField(field, '');
            updateFieldText(wrap, '');
            return;
          }
        });
        infoGrid._bound = '1';
      }
    });

    // Contact quick action buttons
    const contactQuickActionBtns = document.querySelectorAll('.contact-quick-action-btn');
    contactQuickActionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent triggering the contact container click
        const action = btn.getAttribute('data-action');
        const contactId = btn.getAttribute('data-contact-id');
        
        if (contactId && window.getPeopleData) {
          try {
            const contacts = window.getPeopleData() || [];
            const contact = contacts.find(c => c.id === contactId);
            if (contact) {
              handleContactQuickAction(action, contact);
            }
          } catch (error) {
            console.error('Error handling contact quick action:', error);
          }
        }
      });
    });

    // Bind contact item events
    bindContactItemEvents();
  }

  function bindContactItemEvents() {
    // Make contact containers clickable to open contact details
    const contactItems = document.querySelectorAll('.contact-item');
    contactItems.forEach(item => {
      // Force font size on contact names
      const contactName = item.querySelector('.contact-name');
      if (contactName) {
        contactName.style.fontSize = '1.1rem';
        contactName.style.fontWeight = '600';
        console.log('Applied font size to contact name:', contactName.textContent);
      }
      
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on quick action buttons
        if (e.target.closest('.contact-quick-action-btn')) return;
        
        const contactId = item.getAttribute('data-contact-id');
        console.log('Contact clicked:', contactId, 'ContactDetail available:', !!window.ContactDetail);
        
        if (contactId) {
          // Store the source page for back button navigation
          window._contactNavigationSource = 'account-details';
          window._contactNavigationAccountId = state.currentAccount?.id;
          
          // Navigate to people page first, then show contact detail
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            console.log('Navigating to people page for contact:', contactId);
            window.crm.navigateToPage('people');
            
            // Use requestAnimationFrame to ensure the page has started loading
            requestAnimationFrame(() => {
              if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                console.log('Showing contact detail:', contactId);
                try {
                  window.ContactDetail.show(contactId);
                } catch (error) {
                  console.error('Error showing contact detail:', error);
                }
              } else {
                console.log('ContactDetail not available after navigation');
              }
            });
          } else {
            console.log('Navigation not available');
          }
        }
      });
    });
  }

  function handleContactQuickAction(action, contact) {
    switch (action) {
      case 'call': {
        // Use company phone number instead of contact's personal phone
        // This allows the contact resolution logic to work properly
        const account = state.currentAccount || {};
        const phone = account.companyPhone || account.phone || account.primaryPhone || account.mainPhone || contact.workDirectPhone || contact.mobile || contact.otherPhone;
        if (phone) {
          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
          try {
            if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
              // Provide both account and contact attribution
              if (typeof window.Widgets.setCallContext === 'function') {
                window.Widgets.setCallContext({
                  accountId: account.id || null,
                  accountName: account.accountName || account.name || account.companyName || null,
                  company: account.accountName || account.name || account.companyName || null,
                  contactId: contact.id || null,
                  contactName: fullName || null,
                  name: fullName || null
                });
              }
              // Trigger call
              console.log('[Account Detail][DEBUG] Calling contact with phone:', {
                phone: phone,
                contactName: fullName,
                contactId: contact.id,
                accountId: account.id,
                accountName: account.accountName || account.name,
                companyPhone: account.companyPhone
              });
              window.Widgets.callNumber(phone, fullName, true, 'account-detail-contact');
            } else {
              // Fallback to tel: link
              window.open(`tel:${encodeURIComponent(phone)}`);
            }
          } catch (e) { /* noop */ }
        }
        break;
      }
      case 'email': {
        const email = contact.email;
        if (email) {
          try {
            const account = state.currentAccount || {};
            const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || '';
            if (window.EmailCompose && typeof window.EmailCompose.openTo === 'function') {
              window.EmailCompose.openTo(email, fullName);
            } else {
              // Fallback: click compose button and prefill the To field
              document.getElementById('compose-email-btn')?.click();
              setTimeout(()=>{ const to = document.getElementById('compose-to'); if (to) to.value = email; }, 120);
            }
          } catch (e) { /* noop */ }
        }
        break;
      }
    }
  }

  function loadAccountActivities() {
    if (!window.ActivityManager || !state.currentAccount) return;
    
    const accountId = state.currentAccount.id;
    window.ActivityManager.renderActivities('account-activity-timeline', 'account', accountId);
    
    // Setup pagination
    setupActivityPagination('account', accountId);
  }

  function setupActivityPagination(entityType, entityId) {
    const paginationEl = document.getElementById(`${entityType}-activity-pagination`);
    
    if (!paginationEl) return;
    
    // Show pagination if there are more than 4 activities
    const updatePagination = async () => {
      if (!window.ActivityManager) return;
      
      const activities = await window.ActivityManager.getActivities(entityType, entityId);
      const totalPages = Math.ceil(activities.length / window.ActivityManager.maxActivitiesPerPage);
      
      if (totalPages > 1) {
        paginationEl.style.display = 'flex';
        
        // Use unified pagination component
        if (window.crm && window.crm.createPagination) {
          window.crm.createPagination(
            window.ActivityManager.currentPage + 1, 
            totalPages, 
            (page) => {
              window.ActivityManager.goToPage(page - 1, `${entityType}-activity-timeline`, entityType, entityId);
              updatePagination();
            }, 
            paginationEl.id
          );
        }
      } else {
        paginationEl.style.display = 'none';
      }
    };
    
    updatePagination();
  }

  function handleQuickAction(action) {
    const a = state.currentAccount;
    switch (action) {
      case 'call': {
        const phone = a?.companyPhone || a?.phone || a?.primaryPhone || a?.mainPhone;
        if (phone) {
          try {
            if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
              if (typeof window.Widgets.setCallContext === 'function') {
                // Explicitly clear any previous contact context to avoid misattribution
                window.Widgets.setCallContext({
                  accountId: a?.id || null,
                  accountName: a?.accountName || a?.name || a?.companyName || null,
                  company: a?.accountName || a?.name || a?.companyName || null,
                  contactId: null,
                  contactName: null
                });
              }
              const name = a?.accountName || a?.name || a?.companyName || 'Account';
              window.Widgets.callNumber(phone, name, true, 'account-detail');
            } else {
              window.open(`tel:${encodeURIComponent(phone)}`);
            }
          } catch (e) { /* noop */ }
        }
        break;
      }
      case 'linkedin': {
        let url = a?.linkedin || a?.linkedinUrl || a?.linkedin_url || '';
        const name = a?.accountName || a?.name || a?.companyName || '';
        if (!url && name) url = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`;
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        break;
      }
      case 'website': {
        let url = a?.website || a?.site || a?.domain || '';
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ } }
        break;
      }
    }
  }

  function handleWidgetAction(which) {
    const accountId = state.currentAccount?.id;
    switch (which) {
      case 'notes': {
        // Toggle Notes: if open, close; else open for this account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isNotesOpen === 'function' && api.isNotesOpen()) {
              if (typeof api.closeNotes === 'function') { api.closeNotes(); return; }
            } else if (typeof api.openNotesForAccount === 'function') {
              api.openNotesForAccount(accountId); return;
            } else if (typeof api.openNotes === 'function') {
              // Fallback to contact version with account prefix
              api.openNotes('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Notes for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Notes'); } catch (_) {}
        break;
      }
      case 'health': {
        // Toggle Health Check: if open, close; else open for this account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isHealthOpen === 'function' && api.isHealthOpen()) {
              if (typeof api.closeHealth === 'function') { api.closeHealth(); return; }
            } else if (typeof api.openHealthForAccount === 'function') {
              api.openHealthForAccount(accountId); return;
            } else if (typeof api.openHealth === 'function') {
              // Fallback to contact version with account prefix
              api.openHealth('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Energy Health Check for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Energy Health Check'); } catch (_) {}
        break;
      }
      case 'deal': {
        // Toggle Deal Calculator: if open, close; else open for this account
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isDealOpen === 'function' && api.isDealOpen()) {
              if (typeof api.closeDeal === 'function') { api.closeDeal(); return; }
            } else if (typeof api.openDealForAccount === 'function') {
              api.openDealForAccount(accountId); return;
            } else if (typeof api.openDeal === 'function') {
              // Fallback to contact version with account prefix
              api.openDeal('account-' + accountId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Deal Calculator for account', accountId);
        try { window.crm?.showToast && window.crm.showToast('Open Deal Calculator'); } catch (_) {}
        break;
      }
      default:
        console.log('Unknown widget action:', which, 'for account', accountId);
    }
  }

  function getInitials(name) {
    if (!name) return '?';
    return String(name)
      .split(' ')
      .map(w => w.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // SVG icon helpers
  function editIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>`;
  }
  
  function copyIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  }
  
  function trashIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`;
  }
  
  function saveIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>`;
  }

  // Begin inline editing for a field
  function beginEditField(wrap, field) {
    const textEl = wrap.querySelector('.info-value-text');
    if (!textEl) return;
    
    const currentText = textEl.textContent || '';
    
    const isMultiline = field === 'shortDescription';
    const inputControl = isMultiline
      ? `<textarea class="textarea-dark info-edit-textarea" rows="4">${escapeHtml(currentText === '--' ? '' : currentText)}</textarea>`
    : (field === 'contractEndDate' 
      ? `<input type="date" class="info-edit-input" value="${escapeHtml(toISODate(currentText))}">`
      : `<input type="text" class="info-edit-input" value="${escapeHtml(currentText === '--' ? '' : currentText)}">`);
    const inputHtml = `
      ${inputControl}
      <div class="info-actions">
        <button class="icon-btn-sm info-save" title="Save">
          ${saveIcon()}
        </button>
        <button class="icon-btn-sm info-cancel" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
    
    wrap.classList.add('editing');
    textEl.style.display = 'none';
    
    const actionsEl = wrap.querySelector('.info-actions');
    if (actionsEl) {
      actionsEl.remove();
    }
    
    const inputWrap = document.createElement('div');
    inputWrap.className = 'info-input-wrap' + (isMultiline ? ' info-input-wrap--multiline' : '');
    inputWrap.innerHTML = inputHtml;
    
    const input = inputWrap.querySelector(isMultiline ? 'textarea' : 'input');
    const saveBtn = inputWrap.querySelector('.info-save');
    const cancelBtn = inputWrap.querySelector('.info-cancel');
    
    if (input && saveBtn && cancelBtn) {
      wrap.appendChild(inputWrap);
      input.focus();
      
      // Live comma formatting for annual usage (mirror contact details UX)
      if (field === 'annualUsage') {
        // Seed input with digits only (strip commas)
        const seed = (currentText === '--' ? '' : currentText).replace(/,/g, '');
        input.value = seed;
        input.addEventListener('input', (e) => {
          const el = e.target;
          const raw = String(el.value || '').replace(/[^0-9]/g, '');
          const beforeLen = String(el.value || '').length;
          const caret = el.selectionStart || 0;
          const formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          el.value = formatted;
          // Best-effort caret restore
          const afterLen = formatted.length;
          const delta = afterLen - beforeLen;
          const nextCaret = Math.max(0, Math.min(afterLen, caret + delta));
          try { el.setSelectionRange(nextCaret, nextCaret); } catch (_) {}
        });
      }
      
      // Add supplier suggestions for electricity supplier field
      if (field === 'electricitySupplier') {
        console.log('[Account Detail] Adding supplier suggestions for field:', field);
        console.log('[Account Detail] window.addSupplierSuggestions available:', !!window.addSupplierSuggestions);
        console.log('[Account Detail] window.SupplierNames available:', !!window.SupplierNames, 'count:', window.SupplierNames?.length);
        if (window.addSupplierSuggestions) {
          window.addSupplierSuggestions(input, 'account-supplier-list');
          console.log('[Account Detail] Supplier suggestions added to input');
        } else {
          console.warn('[Account Detail] window.addSupplierSuggestions not available');
        }
      }
      
      // Save handler
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await commitEdit(wrap, field, input.value);
      });
      
      // Cancel handler
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cancelEdit(wrap, field, currentText);
      });
      
      // Enter/Escape key handler (Ctrl+Enter to save for multiline)
      input.addEventListener('keydown', async (e) => {
        if (!isMultiline && e.key === 'Enter') {
          e.preventDefault();
          await commitEdit(wrap, field, input.value);
        } else if (isMultiline && (e.key === 'Enter') && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          await commitEdit(wrap, field, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit(wrap, field, currentText);
        }
      });

      // Only apply live MM/DD/YYYY formatting when editing plain text (not the native date input)
      if (field === 'contractEndDate' && !isMultiline && input.type === 'text') {
        input.addEventListener('input', () => {
          const caret = input.selectionStart;
          const formatted = formatDateInputAsMDY(input.value);
          input.value = formatted;
          try { input.selectionStart = input.selectionEnd = Math.min(formatted.length, (caret||formatted.length)); } catch(_) {}
        });
      }
    }
  }

  // Normalize phone number to E.164 format
  function normalizePhone(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return '';
    // If already in +<digits> form, keep plus and digits only
    if (/^\+/.test(raw)) {
      const cleaned = '+' + raw.replace(/[^\d]/g, '');
      return cleaned;
    }
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return '';
    // US default. If 11 and starts with 1, or exactly 10, format as +1XXXXXXXXXX
    if (digits.length === 11 && digits.startsWith('1')) {
      return '+' + digits;
    }
    if (digits.length === 10) {
      return '+1' + digits;
    }
    // If looks like international without + (e.g., 4479...), we can't infer reliably; return as-is digits
    // Prepend + if at least 8 digits (heuristic) to help API; otherwise return original raw
    if (digits.length >= 8) return '+' + digits;
    return raw; // too short; leave as typed
  }

  // Commit the edit to Firestore and update UI
  async function commitEdit(wrap, field, value) {
    console.log('[Account Detail] commitEdit called:', { field, value, type: typeof value });
    // Convert contractEndDate to ISO for storage, display as MM/DD/YYYY via updateFieldText
    let toSave = value;
    if (field === 'contractEndDate') {
      console.log('[Account Detail] Processing contractEndDate:', { original: value });
      toSave = toMDY(value);
      console.log('[Account Detail] Converted to MDY:', { converted: toSave });
    }
    // Normalize phone numbers for any recognized phone key
    if (field === 'phone' || field === 'companyPhone' || field === 'primaryPhone' || field === 'mainPhone') {
      toSave = normalizePhone(value);
    }
    console.log('[Account Detail] Saving to Firebase:', { field, toSave });
    await saveField(field, toSave);
    updateFieldText(wrap, toSave);
    // Notify other pages (e.g., Accounts list) about immediate account changes
    try {
      const id = state.currentAccount?.id;
      const updatedAt = new Date();
      const ev = new CustomEvent('pc:account-updated', { detail: { id, changes: { [field]: toSave, updatedAt } } });
      document.dispatchEvent(ev);
    } catch (_) { /* noop */ }
    // Notify widgets/pages to refresh energy fields
    try { document.dispatchEvent(new CustomEvent('pc:energy-updated', { detail: { entity: 'account', id: state.currentAccount?.id, field, value: toSave } })); } catch(_) {}
    cancelEdit(wrap, field, toSave);
  }

  // Cancel the edit and restore original value
  function cancelEdit(wrap, field, originalValue) {
    const inputWrap = wrap.querySelector('.info-input-wrap');
    if (inputWrap) {
      inputWrap.remove();
    }
    
    const textEl = wrap.querySelector('.info-value-text');
    if (textEl) {
      textEl.style.display = '';
    }
    
    wrap.classList.remove('editing');
    ensureDefaultActions(wrap);
  }
  
  // Save field value to Firestore
  async function saveField(field, value) {
    const accountId = state.currentAccount?.id;
    if (!accountId) return;
    
    try {
      const db = window.firebaseDB;
      if (db && typeof db.collection === 'function') {
        await db.collection('accounts').doc(accountId).update({
          [field]: value,
          updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date()
        });
        
        // Update local state
        if (state.currentAccount) {
          state.currentAccount[field] = value;
        }
        
        window.crm?.showToast && window.crm.showToast('Saved');
      }
    } catch (err) {
      console.warn('Save field failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to save');
    }
  }
  
  // Update field text in UI
  function updateFieldText(wrap, value) {
    const textEl = wrap.querySelector('.info-value-text');
    const field = wrap.getAttribute('data-field');
    if (!textEl) return;
    const val = value == null ? '' : String(value);
    if (field === 'website' && val) {
      const url = /^https?:\/\//i.test(val) ? val : 'https://' + val;
      textEl.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(val)}</a>`;
    } else if (field === 'shortDescription') {
      // Preserve line breaks for paragraph field
      const safe = escapeHtml(val);
      textEl.classList.add('info-value-text--multiline');
      textEl.innerHTML = safe ? safe.replace(/\n/g, '<br>') : '--';
    } else if (field === 'contractEndDate') {
      const pretty = toMDY(val);
      textEl.textContent = pretty || '--';
    } else if (field === 'annualUsage' && val) {
      const numeric = String(val).replace(/[^0-9]/g, '');
      textEl.textContent = numeric ? numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--';
    } else {
      textEl.textContent = val || '--';
    }
  }

  // Ensure default action buttons (edit/copy/delete) exist after editing lifecycle
  function ensureDefaultActions(wrap) {
    if (wrap.querySelector('.info-actions')) return;
    const actions = document.createElement('div');
    actions.className = 'info-actions';
    actions.innerHTML = `
      <button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button>
      <button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button>
      <button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button>`;
    wrap.appendChild(actions);
  }
  
  // Listen for energy updates from Health Widget to update Energy & Contract section
  function setupEnergyUpdateListener() {
    const onEnergyUpdated = (e) => {
      try {
        const d = e.detail || {};
        console.log('[Account Detail] Received energy update event:', d, 'Current account ID:', state.currentAccount?.id);
        // Only update if this is for the current account
        if (d.entity === 'account' && d.id === state.currentAccount?.id) {
          const field = d.field;
          const value = d.value;
          
          // Update the Energy & Contract section display
          const energyGrid = document.getElementById('account-energy-grid');
          if (energyGrid) {
            const fieldWrap = energyGrid.querySelector(`.info-value-wrap[data-field="${field}"]`);
            if (fieldWrap) {
              // Check if field is in editing mode
              const isEditing = fieldWrap.classList.contains('editing');
              
              if (isEditing) {
                // Update the input field value when in editing mode
                const inputEl = fieldWrap.querySelector('.info-edit-input');
                if (inputEl) {
                  let inputValue = value || '';
                  if (field === 'contractEndDate' && value) {
                    // Convert MM/DD/YYYY to YYYY-MM-DD for date input
                    const d = parseDateFlexible(value);
                    if (d) {
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      inputValue = `${yyyy}-${mm}-${dd}`;
                    }
                  }
                  inputEl.value = inputValue;
                }
              } else {
                // Update the text element when not in editing mode
                const textEl = fieldWrap.querySelector('.info-value .info-value-text') || fieldWrap.querySelector('.info-value-text');
                if (textEl) {
                  // Format the value for display
                  let displayValue = value || '--';
                  if (field === 'contractEndDate' && value) {
                    displayValue = toMDY(value);
                  }
                  textEl.textContent = displayValue;
                }
              }
            }
          }
        }
      } catch(_) {}
    };
    
    document.addEventListener('pc:energy-updated', onEnergyUpdated);
    
    // Return cleanup function
    return () => {
      document.removeEventListener('pc:energy-updated', onEnergyUpdated);
    };
  }

  // Export API
  window.AccountDetail = {
    show: showAccountDetail,
    setupEnergyUpdateListener: setupEnergyUpdateListener
  };
  // Backward-compat global alias used by some modules
  try { window.showAccountDetail = showAccountDetail; } catch (_) {}
})();

