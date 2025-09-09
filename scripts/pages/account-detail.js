'use strict';

// Account Detail page module
(function () {
  const state = {
    currentAccount: null,
    loaded: false
  };

  const els = {};

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
                ${phone ? `<span class="contact-phone">${escapeHtml(phone)}</span>` : ''}
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

  function renderAccountDetail() {
    if (!state.currentAccount || !els.mainContent) return;

    const a = state.currentAccount;
    const name = a.accountName || a.name || a.companyName || 'Unknown Account';
    const industry = a.industry || '';
    const domain = a.domain || a.website || a.site || '';
    const website = a.website || a.site || (domain ? (domain.startsWith('http') ? domain : ('https://' + domain)) : '');
    const phone = a.phone || a.primaryPhone || a.mainPhone || '';
    const city = a.city || a.locationCity || '';
    const stateVal = a.state || a.locationState || '';
    const linkedin = a.linkedin || a.linkedinUrl || a.linkedin_url || '';
    const electricitySupplier = a.electricitySupplier || '';
    const annualUsage = a.annualUsage || a.annual_usage || '';
    const currentRate = a.currentRate || a.current_rate || '';
    const contractEndDate = a.contractEndDate || a.contract_end_date || '';
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
              ${favDomain ? `<img class=\"avatar-favicon\" src=\"https://www.google.com/s2/favicons?sz=64&domain=${escapeHtml(favDomain)}\" alt=\"\" referrerpolicy=\"no-referrer\" loading=\"lazy\" onerror=\"this.style.display='none'; const sib=this.nextElementSibling; if(sib) sib.style.display='flex';\" />` : ''}
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
            <div class="info-row"><div class="info-label">COMPANY PHONE</div><div class="info-value-wrap" data-field="phone"><span class="info-value-text">${escapeHtml(phone) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
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
          <div class="info-grid">
            <div class="info-row"><div class="info-label">ELECTRICITY SUPPLIER</div><div class="info-value-wrap" data-field="electricitySupplier"><span class="info-value-text">${escapeHtml(electricitySupplier) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">ANNUAL USAGE</div><div class="info-value-wrap" data-field="annualUsage"><span class="info-value-text">${escapeHtml(annualUsage) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CURRENT RATE ($/kWh)</div><div class="info-value-wrap" data-field="currentRate"><span class="info-value-text">${escapeHtml(currentRate) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">CONTRACT END DATE</div><div class="info-value-wrap" data-field="contractEndDate"><span class="info-value-text">${escapeHtml(contractEndDate) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
          </div>
        </div>

        <div class="contact-info-section">
          <h3 class="section-title">Contacts</h3>
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
    try { window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); } catch (_) { /* noop */ }
    
    // Load activities
    loadAccountActivities();
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

    const backBtn = document.getElementById('back-to-accounts');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
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
        const phone = contact.workDirectPhone || contact.mobile || contact.otherPhone;
        if (phone) {
          const account = state.currentAccount || {};
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
        const phone = a?.phone || a?.primaryPhone || a?.mainPhone;
        if (phone) {
          try {
            if (window.Widgets && typeof window.Widgets.callNumber === 'function') {
              if (typeof window.Widgets.setCallContext === 'function') {
                window.Widgets.setCallContext({
                  accountId: a?.id || null,
                  accountName: a?.accountName || a?.name || a?.companyName || null,
                  company: a?.accountName || a?.name || a?.companyName || null
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
      : `<input type="text" class="info-edit-input" value="${escapeHtml(currentText)}">`;
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
    
    const input = inputWrap.querySelector(isMultiline ? '.info-edit-textarea' : '.info-edit-input');
    const saveBtn = inputWrap.querySelector('.info-save');
    const cancelBtn = inputWrap.querySelector('.info-cancel');
    
    if (input && saveBtn && cancelBtn) {
      wrap.appendChild(inputWrap);
      input.focus();
      
      // Save handler
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await commitEdit(wrap, field, input.value);
      });
      
      // Cancel handler
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
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
    }
  }
  
  // Commit the edit to Firestore and update UI
  async function commitEdit(wrap, field, value) {
    await saveField(field, value);
    updateFieldText(wrap, value);
    cancelEdit(wrap, field, value);
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
  
  // Export API
  window.AccountDetail = {
    show: showAccountDetail
  };
  // Backward-compat global alias used by some modules
  try { window.showAccountDetail = showAccountDetail; } catch (_) {}
})();
