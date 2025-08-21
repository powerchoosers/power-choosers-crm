'use strict';

// Contact Detail page module: displays individual contact information Apollo-style
(function () {
  const state = {
    currentContact: null,
    activities: [],
    loaded: false,
    // Snapshot of People page content to restore on back navigation
    prevPeopleContent: ''
  };

  const els = {};

  function initDomRefs() {
    els.page = document.getElementById('people-page');
    els.mainContent = els.page ? els.page.querySelector('.page-content') : null;
    return !!els.page && !!els.mainContent;
  }

  // ===== Edit Contact Modal =====
  function openEditContactModal() {
    const overlay = createEditContactModal();
    document.body.appendChild(overlay);
    // Focus first input
    setTimeout(() => {
      const first = overlay.querySelector('input, select, textarea, button');
      if (first && typeof first.focus === 'function') first.focus();
    }, 0);
  }

  function createEditContactModal() {
    const c = state.currentContact || {};
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.tabIndex = -1;

    const html = `
      <div class="step-type-modal edit-contact-modal" role="dialog" aria-modal="true" aria-labelledby="edit-contact-title">
        <div class="header">
          <div class="title-wrap">
            <div class="title" id="edit-contact-title">Edit Contact</div>
            <div class="subtitle">Update details for ${escapeHtml(fullName || c.name || 'this contact')}</div>
          </div>
          <button class="close-btn" aria-label="Close">×</button>
        </div>
        <div class="body">
          <form class="edit-contact-form">
            <div class="form-grid">
              <label>First name<input type="text" class="input-dark" name="firstName" value="${escapeHtml(c.firstName || '')}" /></label>
              <label>Last name<input type="text" class="input-dark" name="lastName" value="${escapeHtml(c.lastName || '')}" /></label>
              <label>Title<input type="text" class="input-dark" name="title" value="${escapeHtml(c.title || '')}" /></label>
              <label>Company<input type="text" class="input-dark" name="companyName" value="${escapeHtml(c.companyName || '')}" /></label>
              <label>Email<input type="email" class="input-dark" name="email" value="${escapeHtml(c.email || '')}" /></label>
              <label>Phone<input type="tel" class="input-dark" name="phone" value="${escapeHtml(c.phone || '')}" /></label>
              <label>Mobile<input type="tel" class="input-dark" name="mobile" value="${escapeHtml(c.mobile || '')}" /></label>
              <label>City<input type="text" class="input-dark" name="city" value="${escapeHtml(c.city || c.locationCity || '')}" /></label>
              <label>State<input type="text" class="input-dark" name="state" value="${escapeHtml(c.state || c.locationState || '')}" /></label>
              <label>Industry<input type="text" class="input-dark" name="industry" value="${escapeHtml(c.industry || c.companyIndustry || '')}" /></label>
            </div>
            <div class="form-actions" style="margin-top: var(--spacing-md); display:flex; justify-content:flex-end; gap: var(--spacing-sm);">
              <button type="button" class="btn-secondary btn-cancel">Cancel</button>
              <button type="submit" class="btn-primary btn-save">Save</button>
            </div>
          </form>
        </div>
      </div>`;

    overlay.innerHTML = html;

    const modal = overlay.querySelector('.edit-contact-modal');
    const closeBtn = overlay.querySelector('.close-btn');
    const form = overlay.querySelector('.edit-contact-form');

    const close = () => { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); };

    // Dismiss handlers
    overlay.addEventListener('click', (e) => { if (e.target === overlay || (e.target.classList && e.target.classList.contains('close-btn'))) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    overlay.querySelector('.btn-cancel')?.addEventListener('click', (e) => { e.preventDefault(); close(); });

    // Focus trap within modal
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    modal.addEventListener('keydown', trap);

    // Save handler
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const updates = {
        firstName: (fd.get('firstName') || '').toString().trim(),
        lastName: (fd.get('lastName') || '').toString().trim(),
        title: (fd.get('title') || '').toString().trim(),
        companyName: (fd.get('companyName') || '').toString().trim(),
        email: (fd.get('email') || '').toString().trim(),
        city: (fd.get('city') || '').toString().trim(),
        state: (fd.get('state') || '').toString().trim(),
        industry: (fd.get('industry') || '').toString().trim()
      };
      const phone = (fd.get('phone') || '').toString().trim();
      const mobile = (fd.get('mobile') || '').toString().trim();
      updates.phone = normalizePhone(phone);
      updates.mobile = normalizePhone(mobile);

      // Persist in one update
      const id = state.currentContact?.id;
      const db = window.firebaseDB;
      updates.updatedAt = Date.now();
      if (db && id) {
        try { await db.collection('contacts').doc(id).update(updates); } catch (err) { console.warn('Failed to save contact', err); }
      }
      // Update local state
      try { Object.assign(state.currentContact, updates); } catch (_) {}
      // Notify other pages
      try {
        const ev = new CustomEvent('pc:contact-updated', { detail: { id, changes: { ...updates } } });
        document.dispatchEvent(ev);
      } catch (_) { /* noop */ }
      // Feedback and refresh UI
      try { window.crm?.showToast && window.crm.showToast('Saved'); } catch (_) {}
      try { renderContactDetail(); } catch (_) {}
      close();
    });

    // Ensure close button restores focus to edit trigger if possible
    if (closeBtn) closeBtn.addEventListener('click', () => close());

    return overlay;
  }

  function handleWidgetAction(which) {
    const contactId = state.currentContact?.id;
    switch (which) {
      case 'notes': {
        // Toggle Notes: if open, close; else open for this contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isNotesOpen === 'function' && api.isNotesOpen()) {
              if (typeof api.closeNotes === 'function') { api.closeNotes(); return; }
            } else if (typeof api.openNotes === 'function') {
              api.openNotes(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Notes for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Notes'); } catch (_) {}
        break;
      }
      case 'health': {
        if (window.Widgets?.openHealth) {
          try { window.Widgets.openHealth(contactId); return; } catch (_) {}
        }
        console.log('Widget: Energy Health Check for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Energy Health Check'); } catch (_) {}
        break;
      }
      case 'deal': {
        if (window.Widgets?.openDealCalc) {
          try { window.Widgets.openDealCalc(contactId); return; } catch (_) {}
        }
        console.log('Widget: Deal Calculator for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Deal Calculator'); } catch (_) {}
        break;
      }
      default:
        console.log('Unknown widget action:', which, 'for contact', contactId);
    }
  }

  // Normalize phone numbers to E.164 when possible.
  // Examples:
  //  - "9728342317" => "+19728342317"
  //  - "972-834-2317" => "+19728342317"
  //  - "+1 (972) 834-2317" => "+19728342317"
  //  - "+447911123456" stays as "+447911123456"
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

  function showContactDetail(contactId) {
    if (!initDomRefs()) return;
    
    // Find contact in people data
    const contact = findContactById(contactId);
    if (!contact) {
      console.error('Contact not found:', contactId);
      return;
    }

    state.currentContact = contact;
    // Preload notes content early for smooth Notes widget open
    try { preloadNotesForContact(contact.id); } catch (_) { /* noop */ }
    // Non-destructive: hide the existing table/list instead of replacing all HTML
    const tableContainer = els.mainContent.querySelector('.table-container');
    if (tableContainer) {
      tableContainer.classList.add('hidden');
    } else {
      // Fallback: cache full content in case structure changed
      try { state.prevPeopleContent = els.mainContent ? els.mainContent.innerHTML : ''; } catch (_) { state.prevPeopleContent = ''; }
    }
    hideToolbar();
    // Enable scrollable content area while in contact detail
    if (els.page) { els.page.classList.add('contact-detail-mode'); }
    renderContactDetail();
  }

  function hideToolbar() {
    const peoplePage = document.querySelector('#people-page');
    if (peoplePage) {
      const pageHeader = peoplePage.querySelector('.page-header');
      if (pageHeader) pageHeader.classList.add('hidden');
    }
  }

  function showToolbar() {
    const peoplePage = document.querySelector('#people-page');
    if (peoplePage) {
      const pageHeader = peoplePage.querySelector('.page-header');
      if (pageHeader) pageHeader.classList.remove('hidden');
    }
  }

  function findContactById(contactId) {
    // Access people.js data if available
    if (window.getPeopleData) {
      const peopleData = window.getPeopleData();
      return peopleData.find(c => c.id === contactId);
    }
    return null;
  }

  // Preload notes for the current contact so the Notes widget has content immediately on open
  function preloadNotesForContact(contactId) {
    const db = window.firebaseDB;
    if (!db || !contactId) return;
    try { window._preloadedNotes = window._preloadedNotes || {}; } catch (_) { /* noop */ }
    const cache = window._preloadedNotes || {};
    try {
      db.collection('contacts').doc(contactId).get().then((doc) => {
        const data = doc && doc.exists ? (doc.data() || {}) : {};
        const text = (data.notes == null) ? '' : String(data.notes);
        const updatedAt = data.notesUpdatedAt || data.updatedAt || Date.now();
        try { cache[String(contactId)] = { text, updatedAt }; } catch (_) { /* noop */ }
        try {
          const ev = new CustomEvent('pc:notes-preloaded', { detail: { id: contactId, text } });
          document.dispatchEvent(ev);
        } catch (_) { /* noop */ }
      }).catch(() => { /* noop */ });
    } catch (_) { /* noop */ }
  }

  function renderContactDetail() {
    if (!state.currentContact || !els.mainContent) return;

    const contact = state.currentContact;
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
    const company = contact.companyName || '';
    const title = contact.title || '';
    const email = contact.email || '';
    const phone = contact.phone || contact.mobile || '';
    const city = contact.city || contact.locationCity || '';
    const stateVal = contact.state || contact.locationState || '';
    const industry = contact.industry || contact.companyIndustry || '';
    // Ensure header styles (divider, layout) are present
    injectContactHeaderStyles();

    // Header (styled same as page header)
    const headerHtml = `
      <div id="contact-detail-header" class="page-header">
        <div class="page-title-section">
          <div class="contact-header-info">
            <button class="back-btn back-btn--icon" id="back-to-people" aria-label="Back to People" title="Back to People">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="contact-header-profile">
              <div class="avatar-circle-small">${escapeHtml(fullName.charAt(0).toUpperCase() || 'C')}</div>
              <div class="contact-header-text">
                <div class="contact-title-row">
                  <h2 class="page-title contact-page-title" id="contact-name">${escapeHtml(fullName)}</h2>
                  <div class="title-actions" aria-hidden="true">
                    <button type="button" class="icon-btn-sm title-edit" title="Edit contact">${svgPencil()}</button>
                    <button type="button" class="icon-btn-sm title-copy" title="Copy name">${svgCopy()}</button>
                    <button type="button" class="icon-btn-sm title-clear" title="Clear name">${svgTrash()}</button>
                  </div>
                </div>
                <div class="contact-subtitle">${title ? escapeHtml(title) : ''}${title && company ? ' at ' : ''}${company ? `<a href="#account-details" class="company-link" id="contact-company-link" title="View account details">${escapeHtml(company)}</a>` : ''}</div>
              </div>
              <button class="quick-action-btn linkedin-header-btn" data-action="linkedin">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                  <rect x="2" y="9" width="4" height="12"/>
                  <circle cx="4" cy="4" r="2"/>
                </svg>
              </button>
              <span class="header-action-divider" aria-hidden="true"></span>
              <div class="list-seq-group">
                <button class="quick-action-btn list-header-btn" id="add-contact-to-list" title="Add to list" aria-label="Add to list" aria-haspopup="dialog">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="4" cy="6" r="1"></circle>
                    <circle cx="4" cy="12" r="1"></circle>
                    <circle cx="4" cy="18" r="1"></circle>
                    <line x1="8" y1="6" x2="20" y2="6"></line>
                    <line x1="8" y1="12" x2="20" y2="12"></line>
                    <line x1="8" y1="18" x2="20" y2="18"></line>
                  </svg>
                </button>
                <button class="quick-action-btn list-header-btn" id="add-contact-to-sequences" title="Add to sequence" aria-label="Add to sequence" aria-haspopup="dialog">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polygon points="7 4 20 12 7 20 7 4"></polygon>
                  </svg>
                </button>
              </div>
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
              <div id="widgets-drawer" class="widgets-drawer" role="menu" aria-label="Contact widgets">
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
      <div id="contact-detail-view" class="contact-detail">
        <div class="contact-info-section">
          <h3 class="section-title">Contact Information</h3>
          <div class="info-grid">
            ${renderInfoRow('EMAIL', 'email', email)}
            ${renderInfoRow('PHONE', 'phone', phone)}
            ${renderInfoRow('MOBILE', 'mobile', contact.mobile || '')}
            ${renderInfoRow('CITY', 'city', city)}
            ${renderInfoRow('STATE', 'state', stateVal)}
            ${renderInfoRow('INDUSTRY', 'industry', industry)}
          </div>
        </div>

        <div class="contact-activity-section">
          <div class="activity-header">
            <h3 class="section-title">Recent Activity</h3>
            <button class="btn-text" id="view-all-activity">View All</button>
          </div>
          <div class="activity-timeline" id="contact-activity-timeline">
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
        </div>
      </div>`;

    // Remove any existing detail nodes then append both header and view
    const existingHeader = document.getElementById('contact-detail-header');
    if (existingHeader) existingHeader.remove();
    const existingView = document.getElementById('contact-detail-view');
    if (existingView) existingView.remove();

    const headerWrap = document.createElement('div');
    headerWrap.innerHTML = headerHtml;
    const bodyWrap = document.createElement('div');
    bodyWrap.innerHTML = bodyHtml;

    // Insert header as sibling right after the existing People header
    const pageContainer = els.page ? els.page.querySelector('.page-container') : null;
    const peopleHeader = pageContainer ? pageContainer.querySelector('.page-header') : null;
    const headerEl = headerWrap.firstElementChild;
    if (peopleHeader && headerEl && peopleHeader.parentElement) {
      peopleHeader.insertAdjacentElement('afterend', headerEl);
    } else if (els.mainContent && headerEl) {
      // Fallback: put header at top of content if structure differs
      els.mainContent.prepend(headerEl);
    }

    // Insert body inside page-content
    const bodyEl = bodyWrap.firstElementChild;
    if (els.mainContent && bodyEl) {
      els.mainContent.prepend(bodyEl);
    }
    attachContactDetailEvents();
    try { window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); } catch (_) { /* noop */ }
  }

  function svgPencil() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  }
  function svgTrash() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>';
  }
  function svgCopy() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  }
  function svgSave() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
  }

  function renderInfoRow(label, field, value) {
    const text = value ? escapeHtml(String(value)) : '--';
    const hasValue = !!value;
    return `
      <div class="info-row" data-field="${escapeHtml(field)}">
        <div class="info-label">${escapeHtml(label)}</div>
        <div class="info-value">
          <div class="info-value-wrap" data-field="${escapeHtml(field)}" data-has-value="${hasValue ? '1' : '0'}">
            <span class="info-value-text">${text}</span>
            <div class="info-actions" aria-hidden="true">
              <button type="button" class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button>
              <button type="button" class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button>
              <button type="button" class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function attachContactDetailEvents() {
    const backBtn = document.getElementById('back-to-people');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Show the People toolbar/header again
        showToolbar();
        // Disable contact detail scroll mode
        if (els.page) { els.page.classList.remove('contact-detail-mode'); }
        // Remove contact detail header and view
        const view = document.getElementById('contact-detail-view');
        if (view && view.parentElement) view.parentElement.removeChild(view);
        const header = document.getElementById('contact-detail-header');
        if (header && header.parentElement) header.parentElement.removeChild(header);
        // Unhide the original table/list if present
        if (els.mainContent) {
          const tableContainer = els.mainContent.querySelector('.table-container');
          if (tableContainer) {
            tableContainer.classList.remove('hidden');
          } else if (typeof state.prevPeopleContent === 'string' && state.prevPeopleContent) {
            // Fallback: restore cached HTML
            els.mainContent.innerHTML = state.prevPeopleContent;
            state.prevPeopleContent = '';
          }
        }
        // Ensure dynamic handlers remain intact
        if (window.peopleModule && typeof window.peopleModule.rebindDynamic === 'function') {
          try { window.peopleModule.rebindDynamic(); } catch (e) { /* noop */ }
        } else if (window.peopleModule && typeof window.peopleModule.init === 'function') {
          try { window.peopleModule.init(); } catch (e) { /* noop */ }
        }
      });
    }

    const widgetsBtn = document.getElementById('open-widgets');
    const widgetsWrap = document.querySelector('#contact-detail-header .widgets-wrap');
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
    const widgetsDrawer = document.querySelector('#contact-detail-header .widgets-drawer');
    if (widgetsDrawer && !widgetsDrawer._bound) {
      widgetsDrawer.addEventListener('click', (e) => {
        const item = e.target.closest?.('.widget-item');
        if (!item) return;
        const which = item.getAttribute('data-widget');
        handleWidgetAction(which);
      });
      widgetsDrawer._bound = '1';
    }

    // Quick action buttons
    const quickActionBtns = document.querySelectorAll('.quick-action-btn');
    quickActionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        handleQuickAction(action, btn);
      });
    });

    // Company link -> open Account Detail
    const compLink = document.getElementById('contact-company-link');
    if (compLink && !compLink._bound) {
      compLink.addEventListener('click', (e) => { e.preventDefault(); navigateToAccountFromContact(); });
      compLink.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToAccountFromContact(); } });
      compLink._bound = '1';
    }

    // Add-to-List button
    const addToListBtn = document.getElementById('add-contact-to-list');
    if (addToListBtn && !addToListBtn._bound) {
      addToListBtn.addEventListener('click', (e) => { e.preventDefault(); openContactListsPanel(); });
      addToListBtn._bound = '1';
    }

    // Sequences button
    const addToSequencesBtn = document.getElementById('add-contact-to-sequences');
    if (addToSequencesBtn && !addToSequencesBtn._bound) {
      addToSequencesBtn.addEventListener('click', (e) => { e.preventDefault(); openContactSequencesPanel(); });
      addToSequencesBtn._bound = '1';
    }

    // Title actions: edit/copy/clear contact name
    const header = document.getElementById('contact-detail-header');
    if (header && !header._nameBound) {
      header.addEventListener('click', async (e) => {
        const row = header.querySelector('.contact-title-row');
        if (!row) return;
        const nameEl = row.querySelector('#contact-name');
        const actions = row.querySelector('.title-actions');
        if (!actions) return;

        // If editing, handle save/cancel
        const saveBtn = e.target.closest?.('.title-save');
        if (saveBtn) {
          const input = row.querySelector('input.contact-name-input');
          if (input) { await commitEditName(input.value); }
          return;
        }
        const cancelBtn = e.target.closest?.('.title-cancel');
        if (cancelBtn) { cancelEditName(); return; }

        const editBtn = e.target.closest?.('.title-edit');
        if (editBtn) { e.preventDefault(); openEditContactModal(); return; }

        const copyBtn = e.target.closest?.('.title-copy');
        if (copyBtn) {
          const txt = (nameEl?.textContent || '').trim();
          try { await navigator.clipboard?.writeText(txt); } catch (_) {}
          try { window.crm?.showToast && window.crm.showToast('Copied'); } catch (_) {}
          return;
        }

        const clearBtn = e.target.closest?.('.title-clear');
        if (clearBtn) { e.preventDefault(); await commitEditName(''); return; }
      });

      header._nameBound = '1';
    }

    // Inline edit/copy/delete for Contact Information
    const infoGrid = document.querySelector('#contact-detail-view .info-grid');
    if (infoGrid && !infoGrid._bound) {
      infoGrid.addEventListener('click', async (e) => {
        const wrap = e.target.closest?.('.info-value-wrap');
        if (!wrap) return;
        const field = wrap.getAttribute('data-field');
        if (!field) return;

        // Value text is no longer a click-to-copy target; copy is handled by the copy button only

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
          // Open confirmation popover anchored to the delete icon
          openDeleteConfirmPopover(delBtn, async () => {
            await saveField(field, '');
            updateFieldText(wrap, '');
          });
          return;
        }
      });
      infoGrid._bound = '1';
    }
  }

  function beginEditField(wrap, field) {
    if (!wrap) return;
    const current = wrap.querySelector('.info-value-text')?.textContent || '';
    wrap.classList.add('editing');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-dark info-edit-input';
    input.value = current === '--' ? '' : current;
    input.placeholder = 'Enter ' + field;
    const actions = wrap.querySelector('.info-actions');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'icon-btn-sm info-save';
    saveBtn.innerHTML = svgSave();
    saveBtn.title = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'icon-btn-sm info-cancel';
    cancelBtn.textContent = '×';
    cancelBtn.title = 'Cancel';
    // Swap text for input
    const textEl = wrap.querySelector('.info-value-text');
    if (textEl && textEl.parentElement) textEl.parentElement.replaceChild(input, textEl);
    // Replace actions with save/cancel temporarily
    if (actions) {
      actions.innerHTML = '';
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
    }
    setTimeout(() => input.focus(), 0);
    const onKey = async (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); await commitEdit(wrap, field, input.value); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancelEdit(wrap, field, current); }
    };
    input.addEventListener('keydown', onKey);
    saveBtn.addEventListener('click', async () => { await commitEdit(wrap, field, input.value); });
    cancelBtn.addEventListener('click', () => { cancelEdit(wrap, field, current); });
  }

  async function commitEdit(wrap, field, value) {
    let outVal = value;
    if (field === 'phone' || field === 'mobile') {
      outVal = normalizePhone(value);
    }
    await saveField(field, outVal);
    updateFieldText(wrap, outVal);
  }
  function cancelEdit(wrap, field, prev) {
    updateFieldText(wrap, prev);
  }

  // ===== Title (contact name) edit helpers =====
  function beginEditName() {
    const row = document.querySelector('#contact-detail-header .contact-title-row');
    if (!row) return;
    const h2 = row.querySelector('#contact-name');
    if (!h2) return;
    // Create input with current name
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-dark contact-name-input';
    input.value = (h2.textContent || '').trim();
    input.placeholder = 'Enter name';
    row.replaceChild(input, h2);
    // Swap actions to save/cancel
    const actions = row.querySelector('.title-actions');
    if (actions) {
      actions.innerHTML = '';
      const save = document.createElement('button');
      save.className = 'icon-btn-sm title-save';
      save.innerHTML = svgSave();
      save.title = 'Save name';
      const cancel = document.createElement('button');
      cancel.className = 'icon-btn-sm title-cancel';
      cancel.title = 'Cancel';
      cancel.textContent = '×';
      actions.appendChild(save);
      actions.appendChild(cancel);
    }
    setTimeout(() => input.focus(), 0);
    input.addEventListener('keydown', async (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); await commitEditName(input.value); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancelEditName(); }
    });
  }

  async function commitEditName(value) {
    const row = document.querySelector('#contact-detail-header .contact-title-row');
    if (!row) return;
    const input = row.querySelector('input.contact-name-input');
    const newName = (value == null ? '' : String(value)).trim();
    // Update state
    if (state.currentContact) {
      if (newName) {
        const parts = newName.split(' ');
        state.currentContact.firstName = parts.shift() || '';
        state.currentContact.lastName = parts.join(' ') || '';
      } else {
        state.currentContact.firstName = '';
        state.currentContact.lastName = '';
      }
    }
    // Persist
    const id = state.currentContact?.id;
    const db = window.firebaseDB;
    if (db && id) {
      const payload = {
        firstName: state.currentContact.firstName,
        lastName: state.currentContact.lastName,
        updatedAt: Date.now()
      };
      try { await db.collection('contacts').doc(id).update(payload); } catch (e) { console.warn('Failed to save name', e); }
    }
    // Restore H2
    const h2 = document.createElement('h2');
    h2.className = 'page-title contact-page-title';
    h2.id = 'contact-name';
    h2.textContent = newName || 'Unknown Contact';
    if (input && input.parentElement) input.parentElement.replaceChild(h2, input);
    // Restore actions
    const actions = row.querySelector('.title-actions');
    if (actions) {
      actions.innerHTML = `${'\n'}<button type="button" class="icon-btn-sm title-edit" title="Edit contact">${svgPencil()}</button>${'\n'}<button type="button" class="icon-btn-sm title-copy" title="Copy name">${svgCopy()}</button>${'\n'}<button type="button" class="icon-btn-sm title-clear" title="Clear name">${svgTrash()}</button>`;
    }
    // Update avatar initial
    const avatar = document.querySelector('#contact-detail-header .avatar-circle-small');
    if (avatar) { avatar.textContent = (newName.charAt(0) || 'C').toUpperCase(); }
    try { window.crm?.showToast && window.crm.showToast('Saved'); } catch (_) {}
  }

  function cancelEditName() {
    const row = document.querySelector('#contact-detail-header .contact-title-row');
    if (!row) return;
    const input = row.querySelector('input.contact-name-input');
    const prev = state.currentContact ? [state.currentContact.firstName, state.currentContact.lastName].filter(Boolean).join(' ') : '';
    const h2 = document.createElement('h2');
    h2.className = 'page-title contact-page-title';
    h2.id = 'contact-name';
    h2.textContent = prev || 'Unknown Contact';
    if (input && input.parentElement) input.parentElement.replaceChild(h2, input);
    const actions = row.querySelector('.title-actions');
    if (actions) {
      actions.innerHTML = `${'\n'}<button type="button" class="icon-btn-sm title-edit" title="Edit name">${svgPencil()}</button>${'\n'}<button type="button" class="icon-btn-sm title-copy" title="Copy name">${svgCopy()}</button>${'\n'}<button type="button" class="icon-btn-sm title-clear" title="Clear name">${svgTrash()}</button>`;
    }
  }

  async function saveField(field, value) {
    if (!state.currentContact) return;
    const id = state.currentContact.id;
    const db = window.firebaseDB;
    const payload = { [field]: value, updatedAt: Date.now() };
    // If DB not available, update local state and exit gracefully
    if (!db || !id) {
      state.currentContact[field] = value;
      try { window.crm?.showToast && window.crm.showToast('Saved'); } catch (_) {}
      return;
    }
    try {
      await db.collection('contacts').doc(id).update(payload);
      state.currentContact[field] = value;
      // Notify other pages to update their in-memory state
      try {
        const ev = new CustomEvent('pc:contact-updated', { detail: { id, changes: { [field]: value, updatedAt: payload.updatedAt } } });
        document.dispatchEvent(ev);
      } catch (_) { /* noop */ }
      try { window.crm?.showToast && window.crm.showToast('Saved'); } catch (_) {}
    } catch (e) {
      // Do not create new docs on failure; surface failure to user
      console.error('Failed to save field', field, e);
      try { window.crm?.showToast && window.crm.showToast('Save failed'); } catch (_) {}
    }
  }

  function updateFieldText(wrap, value) {
    if (!wrap) return;
    const text = (value && String(value).trim()) ? escapeHtml(String(value)) : '--';
    const span = document.createElement('span');
    span.className = 'info-value-text';
    span.innerHTML = text;
    // Replace input with text
    const oldInput = wrap.querySelector('input.info-edit-input');
    if (oldInput && oldInput.parentElement) oldInput.parentElement.replaceChild(span, oldInput);
    // Restore actions
    const actions = wrap.querySelector('.info-actions');
    if (actions) {
      actions.innerHTML = `
        <button type="button" class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button>
        <button type="button" class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button>
        <button type="button" class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button>`;
    }
    wrap.classList.remove('editing');
    wrap.setAttribute('data-has-value', (value && String(value).trim()) ? '1' : '0');
  }

  // ===== Inline delete confirmation popover =====
  let _onDeletePopoverOutside = null;
  let _onDeletePopoverKeydown = null;
  let _positionDeletePopover = null;

  function closeDeleteConfirmPopover() {
    const pop = document.getElementById('delete-confirm-popover');
    const cleanup = () => { if (pop && pop.parentElement) pop.parentElement.removeChild(pop); };
    if (pop) pop.classList.remove('--show');
    setTimeout(cleanup, 100);
    try { document.removeEventListener('mousedown', _onDeletePopoverOutside, true); } catch(_) {}
    try { document.removeEventListener('keydown', _onDeletePopoverKeydown, true); } catch(_) {}
    try { window.removeEventListener('resize', _positionDeletePopover, true); } catch(_) {}
    try { window.removeEventListener('scroll', _positionDeletePopover, true); } catch(_) {}
    _onDeletePopoverOutside = null; _onDeletePopoverKeydown = null; _positionDeletePopover = null;
  }

  function openDeleteConfirmPopover(anchorEl, onConfirm) {
    // If already open, close it first
    closeDeleteConfirmPopover();
    const pop = document.createElement('div');
    pop.className = 'delete-popover';
    pop.id = 'delete-confirm-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Confirm clear');
    pop.innerHTML = `
      <div class="delete-popover-inner">
        <div class="message">Clear this field?</div>
        <div class="btn-row">
          <button type="button" class="btn-cancel">Cancel</button>
          <button type="button" class="btn-danger">Clear</button>
        </div>
      </div>`;
    document.body.appendChild(pop);

    // Position relative to the anchor icon
    function position() {
      const rect = anchorEl?.getBoundingClientRect?.();
      const vw = window.innerWidth; const vh = window.innerHeight;
      const pad = 8; const gap = 8;
      let top = Math.max(pad, 72);
      let left = Math.max(pad, (vw - pop.offsetWidth) / 2);
      let placement = 'bottom';
      if (rect) {
        const pw = pop.offsetWidth || 260;
        const ph = pop.offsetHeight || 100;
        const fitsBottom = rect.bottom + gap + ph + pad <= vh;
        const fitsTop = rect.top - gap - ph - pad >= 0;
        placement = fitsBottom || !fitsTop ? 'bottom' : 'top';
        if (placement === 'bottom') {
          top = Math.min(vh - ph - pad, rect.bottom + gap);
        } else {
          top = Math.max(pad, rect.top - gap - ph);
        }
        left = Math.round(Math.min(Math.max(pad, rect.left + rect.width/2 - pw/2), vw - pw - pad));
        const arrowLeft = Math.round(rect.left + rect.width/2 - left);
        pop.style.setProperty('--arrow-left', `${arrowLeft}px`);
        pop.setAttribute('data-placement', placement);
      }
      pop.style.top = `${Math.round(top)}px`;
      pop.style.left = `${Math.round(left)}px`;
    }
    _positionDeletePopover = position;
    position();
    requestAnimationFrame(() => pop.classList.add('--show'));

    // Wire buttons
    const btnCancel = pop.querySelector('.btn-cancel');
    const btnDanger = pop.querySelector('.btn-danger');
    btnCancel?.addEventListener('click', () => closeDeleteConfirmPopover());
    btnDanger?.addEventListener('click', async () => {
      try { await onConfirm?.(); } finally { closeDeleteConfirmPopover(); }
    });

    // Keyboard: Escape closes, Enter on danger when focused confirms
    _onDeletePopoverKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDeleteConfirmPopover(); }
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === btnDanger) {
        e.preventDefault(); btnDanger.click();
      }
    };
    document.addEventListener('keydown', _onDeletePopoverKeydown, true);

    // Click-away
    _onDeletePopoverOutside = (e) => {
      const inside = pop.contains(e.target);
      const onAnchor = !!(e.target.closest && anchorEl && e.target.closest('.info-delete') === anchorEl.closest('.info-delete'));
      if (!inside && !onAnchor) closeDeleteConfirmPopover();
    };
    document.addEventListener('mousedown', _onDeletePopoverOutside, true);

    // Reposition on viewport changes
    try { window.addEventListener('resize', _positionDeletePopover, true); } catch(_) {}
    try { window.addEventListener('scroll', _positionDeletePopover, true); } catch(_) {}

    // Focus the Cancel button initially for safer default
    setTimeout(() => { try { btnCancel?.focus(); } catch(_) {} }, 0);
  }

  // Minimal header styles for divider and layout
  function injectContactHeaderStyles() {
    if (document.getElementById('contact-detail-header-styles')) return;
    const style = document.createElement('style');
    style.id = 'contact-detail-header-styles';
    style.textContent = `
      /* Contact Detail: header action divider and alignment */
      #contact-detail-header .contact-header-profile { display: inline-flex; align-items: center; gap: var(--spacing-sm); }
      /* Reset margin added globally so spacing is controlled here */
      #contact-detail-header .linkedin-header-btn { margin-left: 0; }
      /* Vertical divider between LinkedIn and the List/Sequence group */
      #contact-detail-header .header-action-divider {
        width: 1px;
        height: 24px;
        background: var(--border-light);
        opacity: 0.9;
        display: inline-block;
        margin: 0 var(--spacing-sm);
        border-radius: 1px;
      }
      #contact-detail-header .list-header-btn svg { display: block; }
      #contact-detail-header .list-seq-group { display: inline-flex; align-items: center; gap: var(--spacing-sm); }
    `;
    // Append to head so rules actually apply
    document.head.appendChild(style);
  }

  // ===== Sequences integration (Add to Sequence) =====
  let _onContactSequencesKeydown = null;
  let _positionContactSequencesPanel = null;
  let _onContactSequencesOutside = null;

function closeContactSequencesPanel() {
  const panel = document.getElementById('contact-sequences-panel');
  const cleanup = () => {
    if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
    try { document.removeEventListener('mousedown', _onContactSequencesOutside, true); } catch(_) {}
    // Reset trigger state and restore focus
    try {
      const trigger = document.getElementById('add-contact-to-sequences');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        // Only restore focus if closed by keyboard (Escape), not by pointer
        if (document.activeElement === trigger) {
          trigger.focus();
        }
      }
    } catch(_) {}
  };
  if (panel) panel.classList.remove('--show');
  setTimeout(cleanup, 120);

  try { document.removeEventListener('keydown', _onContactSequencesKeydown, true); } catch(_) {}
  try { window.removeEventListener('resize', _positionContactSequencesPanel, true); } catch(_) {}
  try { window.removeEventListener('scroll', _positionContactSequencesPanel, true); } catch(_) {}
  _onContactSequencesKeydown = null; _positionContactSequencesPanel = null; _onContactSequencesOutside = null;
}

function openContactSequencesPanel() {
  if (document.getElementById('contact-sequences-panel')) return;
  // Reuse styles from lists modal
  injectContactListsStyles();
  const panel = document.createElement('div');
  panel.id = 'contact-sequences-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Add to sequence');
  const c = state.currentContact || {};
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'this contact';
  panel.innerHTML = `
    <div class="list-header">Add ${escapeHtml(fullName)} to sequence</div>
    <div class="list-body" id="contact-sequences-body">
      <div class="list-item" tabindex="0" data-action="create">
        <div>
          <div class="list-name">Create new sequence…</div>
          <div class="list-meta">Create a contact sequence</div>
        </div>
      </div>
      <div class="list-item" tabindex="-1" aria-disabled="true"><div><div class="list-name">Loading sequences…</div><div class="list-meta">Please wait</div></div></div>
    </div>
    <div class="list-footer">
      <button type="button" class="btn" id="contact-sequences-cancel">Cancel</button>
    </div>`;
  document.body.appendChild(panel);

  // Cancel closes
  const cancelBtn = panel.querySelector('#contact-sequences-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeContactSequencesPanel());

  // Populate data
  const container = panel.querySelector('#contact-sequences-body');
  populateContactSequencesPanel(container);

  // Position and show
  _positionContactSequencesPanel = function position() {
    const btn = document.getElementById('add-contact-to-sequences');
    const rect = btn ? btn.getBoundingClientRect() : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;
    const gap = 8;
    let placement = 'bottom';
    let top = Math.max(pad, 72);
    let left = Math.max(pad, (vw - panel.offsetWidth) / 2);
    if (rect) {
      const panelW = panel.offsetWidth;
      const panelH = panel.offsetHeight || 320;
      const fitsBottom = rect.bottom + gap + panelH + pad <= vh;
      placement = fitsBottom ? 'bottom' : 'top';
      if (placement === 'bottom') {
        top = Math.min(vh - panelH - pad, rect.bottom + gap);
      } else {
        top = Math.max(pad, rect.top - gap - panelH);
      }
      left = Math.round(
        Math.min(
          Math.max(pad, rect.left + (rect.width / 2) - (panelW / 2)),
          vw - panelW - pad
        )
      );
      const arrowLeft = Math.round(rect.left + rect.width / 2 - left);
      panel.style.setProperty('--arrow-left', `${arrowLeft}px`);
      panel.setAttribute('data-placement', placement);
    }
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  };
  _positionContactSequencesPanel();
  setTimeout(() => panel.classList.add('--show'), 0);
  try { window.addEventListener('resize', _positionContactSequencesPanel, true); } catch (_) {}
  try { window.addEventListener('scroll', _positionContactSequencesPanel, true); } catch (_) {}

  // Interactions
  panel.addEventListener('click', (e) => {
    const item = e.target.closest?.('.list-item');
    if (!item || item.getAttribute('aria-disabled') === 'true') return;
    handleSequenceChoose(item);
  });

  // Define keyboard handler before registering
  _onContactSequencesKeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeContactSequencesPanel(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList?.contains('list-item')) {
      e.preventDefault();
      handleSequenceChoose(document.activeElement);
    }
  };
  document.addEventListener('keydown', _onContactSequencesKeydown, true);
  _onContactSequencesOutside = (e) => {
    const inside = panel.contains(e.target);
    const isTrigger = !!(e.target.closest && e.target.closest('#add-contact-to-sequences'));
    const isSearchBar = e.target.classList && e.target.classList.contains('search-input');
    if (!inside && !isTrigger) {
      closeContactSequencesPanel();
      if (isSearchBar && typeof e.target.focus === 'function') {
        setTimeout(() => e.target.focus(), 120);
      }
    }
  };
  document.addEventListener('mousedown', _onContactSequencesOutside, true);
}

// Populate sequences into the contact sequences panel
async function populateContactSequencesPanel(container) {
  if (!container) return;
  try {
    const db = window.firebaseDB;
    const contactId = state.currentContact?.id;
    let sequences = [];
    const membership = new Map(); // sequenceId -> memberDocId
    if (db && typeof db.collection === 'function') {
      // Load sequences (newest first if createdAt available)
      let q = db.collection('sequences');
      try { q = q.orderBy('createdAt', 'desc'); } catch(_) {}
      const snap = await q.get();
      sequences = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

      // Load membership for this contact
      if (contactId) {
        let mq = db.collection('sequenceMembers').where('targetId', '==', contactId);
        try { mq = mq.where('targetType', '==', 'people'); } catch(_) {}
        const msnap = await mq.get();
        msnap.docs.forEach(md => {
          const m = md.data() || {};
          if (m.sequenceId) membership.set(String(m.sequenceId), md.id);
        });
      }
    }

    // Render
    // Keep the create row and replace only the loading row
    const createRow = container.querySelector('.list-item[data-action="create"]');
    const loadingRow = container.querySelector('.list-item[aria-disabled="true"]');
  
    if (!sequences.length) {
      if (loadingRow) {
        loadingRow.innerHTML = '<div><div class="list-name">No sequences</div><div class="list-meta">Create a sequence first</div></div>';
      }
      return;
    }

    // Remove loading row if it exists
    if (loadingRow) {
      loadingRow.remove();
    }

    const frag = document.createDocumentFragment();
    sequences.forEach(seq => {
      const isMember = membership.has(String(seq.id));
      const item = document.createElement('div');
      item.className = 'list-item';
      item.tabIndex = 0;
      item.setAttribute('data-id', String(seq.id));
      item.setAttribute('data-name', String(seq.name || 'Sequence'));
      if (isMember) item.setAttribute('data-member-id', membership.get(String(seq.id)));
      // Show member count
      const memberCount = seq.stats?.active || 0;
      const metaBits = [];
      if (seq.isActive === false) metaBits.push('Inactive');
      metaBits.push(`${memberCount} member${memberCount === 1 ? '' : 's'}`);
      if (seq.stats && typeof seq.stats.delivered === 'number') metaBits.push(`${seq.stats.delivered} steps`);
      const meta = metaBits.join(' • ');
      item.innerHTML = `
        <div>
          <div class="list-name">${escapeHtml(seq.name || 'Sequence')}</div>
          <div class="list-meta">${escapeHtml(meta || '')}</div>
        </div>
        <div class="list-check" aria-hidden="true">${isMember ? '✓' : ''}</div>`;
      frag.appendChild(item);
    });
    container.appendChild(frag);
  } catch (err) {
    console.warn('Failed to load sequences', err);
  }
}

function handleSequenceChoose(el) {
  const action = el.getAttribute('data-action');
  if (action === 'create') {
    const name = window.prompt('New sequence name');
    if (!name) return;
    createContactSequenceThenAdd(name.trim());
    return;
  }
  const id = el.getAttribute('data-id');
  const name = el.getAttribute('data-name') || 'Sequence';
  const memberDocId = el.getAttribute('data-member-id');
  if (memberDocId) {
    removeCurrentContactFromSequence(memberDocId, name);
  } else {
    addCurrentContactToSequence(id, name);
  }
}

async function addCurrentContactToSequence(sequenceId, sequenceName) {
  try {
    const contactId = state.currentContact?.id;
    if (!contactId) { closeContactSequencesPanel(); return; }
    const db = window.firebaseDB;
    if (db && typeof db.collection === 'function') {
      const doc = { sequenceId, targetId: contactId, targetType: 'people' };
      if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
        doc.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        doc.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      } else {
        doc.createdAt = new Date();
        doc.updatedAt = new Date();
      }
      await db.collection('sequenceMembers').add(doc);
      
      // Increment sequence stats.active count
      if (window.firebase?.firestore?.FieldValue) {
        await db.collection('sequences').doc(sequenceId).update({
          "stats.active": window.firebase.firestore.FieldValue.increment(1)
        });
      }
    }
    window.crm?.showToast && window.crm.showToast(`Added to "${sequenceName}"`);
  } catch (err) {
    console.warn('Add to sequence failed', err);
    window.crm?.showToast && window.crm.showToast('Failed to add to sequence');
  } finally {
    closeContactSequencesPanel();
  }
}

async function removeCurrentContactFromSequence(memberDocId, sequenceName) {
  try {
    const db = window.firebaseDB;
    if (db && typeof db.collection === 'function' && memberDocId) {
      // First get the sequenceId from the member document before deleting it
      const memberDoc = await db.collection('sequenceMembers').doc(memberDocId).get();
      const memberData = memberDoc.data();
      const sequenceId = memberData?.sequenceId;
      
      await db.collection('sequenceMembers').doc(memberDocId).delete();
      
      // Decrement sequence stats.active count if we have the sequenceId
      if (sequenceId && window.firebase?.firestore?.FieldValue) {
        await db.collection('sequences').doc(sequenceId).update({
          "stats.active": window.firebase.firestore.FieldValue.increment(-1)
        });
      }
    }
    window.crm?.showToast && window.crm.showToast(`Removed from "${sequenceName}"`);
  } catch (err) {
    console.warn('Remove from sequence failed', err);
    window.crm?.showToast && window.crm.showToast('Failed to remove from sequence');
  } finally {
    closeContactSequencesPanel();
  }
}

async function createContactSequenceThenAdd(name) {
  try {
    const db = window.firebaseDB;
    let newId = null;
    if (db && typeof db.collection === 'function') {
      const payload = { name, stats: { active: 1, paused: 0, notSent: 0, bounced: 0, spamBlocked: 0, finished: 0, scheduled: 0, delivered: 0, replyPct: 0, interestedPct: 0 } };
      if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
        payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
      } else {
        payload.createdAt = new Date();
        payload.updatedAt = new Date();
      }
      const ref = await db.collection('sequences').add(payload);
      newId = ref.id;
    }
    if (newId) {
      // We've already set recordCount to 1, so we don't need to increment it in addCurrentContactToSequence
      // We'll directly add the member document
      const contactId = state.currentContact?.id;
      if (contactId) {
        const doc = { sequenceId: newId, targetId: contactId, targetType: 'people' };
        if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
          doc.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
          doc.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
          doc.createdAt = new Date();
          doc.updatedAt = new Date();
        }
        await db.collection('sequenceMembers').add(doc);
      }
      window.crm?.showToast && window.crm.showToast(`Created sequence "${name}"`);
    } else {
      window.crm?.showToast && window.crm.showToast(`Created sequence "${name}" (offline)`);
      closeContactSequencesPanel();
    }
  } catch (err) {
    console.warn('Create sequence failed', err);
    window.crm?.showToast && window.crm.showToast('Failed to create sequence');
  } finally {
    closeContactSequencesPanel();
  }
}

// ===== Lists integration (Add to List) =====
  let _onContactListsKeydown = null;
  let _positionContactListsPanel = null;
  let _onContactListsOutside = null;

  function injectContactListsStyles() {
    let style = document.getElementById('contact-detail-lists-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'contact-detail-lists-styles';
      document.head.appendChild(style);
    }
    style.textContent = `
      /* Contact Detail: Add to List/Sequence panel */
      #contact-lists-panel, #contact-sequences-panel { position: fixed; z-index: 1200; width: min(560px, 92vw);
        background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light);
        border-radius: var(--border-radius); box-shadow: var(--elevation-card-hover, 0 16px 40px rgba(0,0,0,.28), 0 6px 18px rgba(0,0,0,.22));
        transform: translateY(-8px); opacity: 0; transition: transform .16s ease, opacity .16s ease;
        /* Avoid clipping the pointer arrow */
        --arrow-size: 10px; }
      #contact-lists-panel.--show, #contact-sequences-panel.--show { transform: translateY(0); opacity: 1; }
      #contact-lists-panel .list-header, #contact-sequences-panel .list-header { padding: 14px 16px; border-bottom: 1px solid var(--border-light); font-weight: 700; background: var(--bg-card); }
      #contact-lists-panel .list-body, #contact-sequences-panel .list-body { max-height: min(70vh, 720px); overflow: auto; background: var(--bg-card); }
      #contact-lists-panel .list-body::-webkit-scrollbar, #contact-sequences-panel .list-body::-webkit-scrollbar { width: 10px; }
      #contact-lists-panel .list-body::-webkit-scrollbar-thumb, #contact-sequences-panel .list-body::-webkit-scrollbar-thumb { background: var(--grey-700); border-radius: 8px; }
      #contact-lists-panel .list-item, #contact-sequences-panel .list-item { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; cursor:pointer; background: var(--bg-card); border-top: 1px solid var(--border-light); }
      #contact-lists-panel .list-item:first-child, #contact-sequences-panel .list-item:first-child { border-top: 0; }
      #contact-lists-panel .list-item:hover, #contact-sequences-panel .list-item:hover { background: var(--bg-hover); }
      #contact-lists-panel .list-item[aria-disabled="true"], #contact-sequences-panel .list-item[aria-disabled="true"] { opacity: .6; cursor: default; }
      #contact-lists-panel .list-item:focus-visible, #contact-sequences-panel .list-item:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,139,0,.35) inset; }
      #contact-lists-panel .list-name, #contact-sequences-panel .list-name { font-weight: 600; }
      #contact-lists-panel .list-meta, #contact-sequences-panel .list-meta { color: var(--text-muted); font-size: .85rem; }
      #contact-lists-panel .list-footer, #contact-sequences-panel .list-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top: 1px solid var(--border-light); background: var(--bg-card); }
      #contact-lists-panel .btn, #contact-sequences-panel .btn { border: 1px solid var(--border-light); background: var(--bg-item); color: var(--text-primary); border-radius: var(--border-radius-sm); padding:6px 10px; }
      #contact-lists-panel .btn:focus-visible, #contact-sequences-panel .btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,139,0,.35); }
      #contact-lists-panel .btn-primary, #contact-sequences-panel .btn-primary { background: var(--orange-subtle); border-color: var(--orange-subtle); color: #fff; }

      /* Pointer arrow (reuse delete-popover pattern) */
      #contact-lists-panel::before,
      #contact-lists-panel::after,
      #contact-sequences-panel::before,
      #contact-sequences-panel::after {
        content: "";
        position: absolute;
        width: var(--arrow-size);
        height: var(--arrow-size);
        transform: rotate(45deg);
        pointer-events: none;
      }
      /* Bottom placement (arrow on top edge) */
      #contact-lists-panel[data-placement="bottom"]::before,
      #contact-sequences-panel[data-placement="bottom"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        top: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      #contact-lists-panel[data-placement="bottom"]::after,
      #contact-sequences-panel[data-placement="bottom"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        top: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
      /* Top placement (arrow on bottom edge) */
      #contact-lists-panel[data-placement="top"]::before,
      #contact-sequences-panel[data-placement="top"]::before {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        bottom: calc(-1 * var(--arrow-size) / 2 + 1px);
        background: var(--border-light);
      }
      #contact-lists-panel[data-placement="top"]::after,
      #contact-sequences-panel[data-placement="top"]::after {
        left: calc(var(--arrow-left, 20px) - (var(--arrow-size) / 2));
        bottom: calc(-1 * var(--arrow-size) / 2 + 2px);
        background: var(--bg-card);
      }
    `;
    document.head.appendChild(style);
  }

  function closeContactListsPanel() {
    const panel = document.getElementById('contact-lists-panel');
    const cleanup = () => {
      if (panel && panel.parentElement) panel.parentElement.removeChild(panel);
      try { document.removeEventListener('mousedown', _onContactListsOutside, true); } catch(_) {}
      // Reset trigger state and restore focus
      try {
        const trigger = document.getElementById('add-contact-to-list');
        if (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
          // Only restore focus if closed by keyboard (Escape), not by pointer
          if (document.activeElement === trigger) {
            trigger.focus();
          }
        }
      } catch(_) {}
    };
    if (panel) panel.classList.remove('--show');
    setTimeout(cleanup, 120);

    try { document.removeEventListener('keydown', _onContactListsKeydown, true); } catch(_) {}
    try { window.removeEventListener('resize', _positionContactListsPanel, true); } catch(_) {}
    try { window.removeEventListener('scroll', _positionContactListsPanel, true); } catch(_) {}
    _onContactListsKeydown = null; _positionContactListsPanel = null; _onContactListsOutside = null;
  }

  function openContactListsPanel() {
    if (document.getElementById('contact-lists-panel')) return;
    injectContactListsStyles();
    const panel = document.createElement('div');
    panel.id = 'contact-lists-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Add to list');
    const c = state.currentContact || {};
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'this contact';
    panel.innerHTML = `
      <div class="list-header">Add ${escapeHtml(fullName)} to list</div>
      <div class="list-body" id="contact-lists-body">
        <div class="list-item" tabindex="0" data-action="create">
          <div>
            <div class="list-name">Create new list…</div>
            <div class="list-meta">Create a people list</div>
          </div>
        </div>
      </div>
      <div class="list-footer">
        <button type="button" class="btn" id="contact-lists-cancel">Cancel</button>
      </div>`;
    document.body.appendChild(panel);

    // Position anchored to the Add-to-List icon with pointer
    _positionContactListsPanel = function position() {
      const btn = document.getElementById('add-contact-to-list');
      const rect = btn ? btn.getBoundingClientRect() : null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 8;  // viewport padding
      const gap = 8;  // space between button and panel
      let placement = 'bottom';
      let top = Math.max(pad, 72);
      let left = Math.max(pad, (vw - panel.offsetWidth) / 2);

      if (rect) {
        const panelW = panel.offsetWidth;
        const panelH = panel.offsetHeight || 320; // fallback before content paints
        const fitsBottom = rect.bottom + gap + panelH + pad <= vh;
        const fitsTop = rect.top - gap - panelH - pad >= 0;
        placement = fitsBottom || !fitsTop ? 'bottom' : 'top';

        if (placement === 'bottom') {
          top = Math.min(vh - panelH - pad, rect.bottom + gap);
        } else {
          top = Math.max(pad, rect.top - gap - panelH);
        }

        // Prefer centering under the icon while keeping within viewport
        left = Math.round(
          Math.min(
            Math.max(pad, rect.left + (rect.width / 2) - (panelW / 2)),
            vw - panelW - pad
          )
        );

        // Arrow horizontal offset relative to panel's left edge
        const arrowLeft = Math.round(rect.left + rect.width / 2 - left);
        panel.style.setProperty('--arrow-left', `${arrowLeft}px`);
        panel.setAttribute('data-placement', placement);
      }

      panel.style.top = `${Math.round(top)}px`;
      panel.style.left = `${Math.round(left)}px`;
    };
    _positionContactListsPanel();
    window.addEventListener('resize', _positionContactListsPanel, true);
    window.addEventListener('scroll', _positionContactListsPanel, true);

    // Animate in
    requestAnimationFrame(() => { panel.classList.add('--show'); });

    // Mark trigger expanded
    try { document.getElementById('add-contact-to-list')?.setAttribute('aria-expanded', 'true'); } catch(_) {}

    // Load lists and memberships
    Promise.resolve(populateContactListsPanel(panel.querySelector('#contact-lists-body')))
      .then(() => { try { _positionContactListsPanel && _positionContactListsPanel(); } catch(_) {} });

    // Footer
    panel.querySelector('#contact-lists-cancel')?.addEventListener('click', () => closeContactListsPanel());

    // Focus behavior
    setTimeout(() => { const first = panel.querySelector('.list-item, .btn'); if (first) first.focus(); }, 0);
    _onContactListsKeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeContactListsPanel(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList?.contains('list-item')) {
        e.preventDefault();
        const el = document.activeElement; handleListChoose(el);
      }
    };
    document.addEventListener('keydown', _onContactListsKeydown, true);

    // Click-away
    _onContactListsOutside = (e) => {
      const inside = panel.contains(e.target);
      const isTrigger = !!(e.target.closest && e.target.closest('#add-contact-to-list'));
      // Allow clicking on global search bar (class 'search-input') to close the modal and allow focus
      const isSearchBar = e.target.classList && e.target.classList.contains('search-input');
      if (!inside && !isTrigger) {
        closeContactListsPanel();
        // If search bar, focus it after closing modal
        if (isSearchBar && typeof e.target.focus === 'function') {
          setTimeout(() => e.target.focus(), 120);
        }
      }
    };
    document.addEventListener('mousedown', _onContactListsOutside, true);

    function handleListChoose(el) {
      const action = el.getAttribute('data-action');
      if (action === 'create') {
        const name = window.prompt('New list name');
        if (!name) return;
        createContactListThenAdd(name.trim());
        return;
      }
      const id = el.getAttribute('data-id');
      const name = el.getAttribute('data-name') || 'List';
      const memberDocId = el.getAttribute('data-member-id');
      if (memberDocId) {
        // Already a member -> remove from list
        removeCurrentContactFromList(memberDocId, name);
      } else {
        addCurrentContactToList(id, name);
      }
    }
  }

  async function populateContactListsPanel(container) {
    if (!container) return;
    // Loading row
    container.innerHTML += `<div class="list-item" tabindex="-1" aria-disabled="true"><div><div class="list-name">Loading lists…</div><div class="list-meta">Please wait</div></div></div>`;
    try {
      const db = window.firebaseDB;
      const contactId = state.currentContact?.id;
      let lists = [];
      let existing = new Set();
      const existingMap = new Map(); // listId -> listMemberDocId
      if (db && typeof db.collection === 'function') {
        // Load lists (people kind)
        let q = db.collection('lists');
        if (q.where) q = q.where('kind', '==', 'people');
        const snap = await (q.limit ? q.limit(200).get() : q.get());
        lists = (snap && snap.docs) ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

        // Load current memberships to disable duplicates
        if (contactId) {
          let mq = db.collection('listMembers');
          if (mq.where) {
            mq = mq.where('targetId', '==', contactId);
            try { mq = mq.where('targetType', '==', 'people'); } catch(_) {}
          }
          try {
            const msnap = await (mq.limit ? mq.limit(500).get() : mq.get());
            const rows = (msnap && msnap.docs) ? msnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            existing = new Set(rows.map(r => String(r.listId || '')));
            rows.forEach(r => { if (r.listId) existingMap.set(String(r.listId), r.id); });
          } catch (_) { /* noop */ }
        }
      }

      // Sort by updatedAt/createdAt desc
      lists.sort((a, b) => {
        const ad = (a.updatedAt || a.createdAt || 0);
        const bd = (b.updatedAt || b.createdAt || 0);
        const av = toMillis(ad), bv = toMillis(bd);
        return bv - av;
      });

      const listHtml = lists.slice(0, 100).map(it => {
        const count = (typeof it.count === 'number') ? it.count : (it.recordCount || 0);
        const already = existing.has(String(it.id || ''));
        const memberId = existingMap.get(String(it.id || '')) || '';
        return `<div class="list-item" tabindex="0" data-id="${escapeHtml(it.id || '')}" data-name="${escapeHtml(it.name || 'List')}" ${memberId ? `data-member-id="${escapeHtml(memberId)}"` : ''}>
          <div>
            <div class="list-name">${escapeHtml(it.name || 'Untitled')}</div>
            <div class="list-meta">${count} member${count === 1 ? '' : 's'}</div>
          </div>
          <div class="list-check" aria-hidden="true">${already ? '✓' : ''}</div>
        </div>`;
      }).join('');

      // Replace loading row but keep the create row first
      const createRow = container.querySelector('.list-item[data-action="create"]');
      container.innerHTML = '';
      if (createRow) container.appendChild(createRow);
      container.insertAdjacentHTML('beforeend', listHtml || `<div class="list-item" tabindex="-1" aria-disabled="true"><div><div class="list-name">No lists found</div><div class="list-meta">Create a new list</div></div></div>`);

      // Click handlers
      container.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', () => {
          el.focus();
          const evt = new KeyboardEvent('keydown', { key: 'Enter' });
          document.dispatchEvent(evt);
        });
      });
    } catch (err) {
      console.warn('Failed to load lists', err);
    }

    function toMillis(val) {
      try {
        if (!val) return 0;
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().getTime();
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return new Date(val).getTime();
        if (val && typeof val.seconds === 'number') return val.seconds * 1000;
      } catch {}
      return 0;
    }
  }

  async function createContactListThenAdd(name) {
    try {
      const db = window.firebaseDB;
      let newId = null;
      if (db && typeof db.collection === 'function') {
        const payload = { name, kind: 'people', recordCount: 0 };
        if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
          payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
          payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
          payload.createdAt = new Date();
          payload.updatedAt = new Date();
        }
        const ref = await db.collection('lists').add(payload);
        newId = ref.id;
      }
      if (newId) {
        await addCurrentContactToList(newId, name);
      } else {
        window.crm?.showToast && window.crm.showToast(`Created list "${name}" (offline)`);
        closeContactListsPanel();
      }
    } catch (err) {
      console.warn('Create list failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to create list');
    }
  }

  async function addCurrentContactToList(listId, listName) {
    try {
      const contactId = state.currentContact?.id;
      if (!contactId) { closeContactListsPanel(); return; }
      const db = window.firebaseDB;
      if (db && typeof db.collection === 'function') {
        const doc = { listId, targetId: contactId, targetType: 'people' };
        if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
          doc.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
          doc.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
          doc.createdAt = new Date();
          doc.updatedAt = new Date();
        }
        await db.collection('listMembers').add(doc);
      }
      window.crm?.showToast && window.crm.showToast(`Added to "${listName}"`);
    } catch (err) {
      console.warn('Add to list failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to add to list');
    } finally {
      closeContactListsPanel();
    }
  }

  async function removeCurrentContactFromList(memberDocId, listName) {
    try {
      const db = window.firebaseDB;
      if (db && typeof db.collection === 'function' && memberDocId) {
        await db.collection('listMembers').doc(memberDocId).delete();
      }
      window.crm?.showToast && window.crm.showToast(`Removed from "${listName}"`);
    } catch (err) {
      console.warn('Remove from list failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to remove from list');
    } finally {
      closeContactListsPanel();
    }
  }

  function handleQuickAction(action, btn) {
    switch (action) {
      case 'call':
        const phone = btn.getAttribute('data-phone');
        if (phone) {
          try { window.open(`tel:${encodeURIComponent(phone)}`); } catch (e) { /* noop */ }
        }
        break;
      case 'email':
        const email = btn.getAttribute('data-email');
        if (email) {
          try { window.open(`mailto:${encodeURIComponent(email)}`); } catch (e) { /* noop */ }
        }
        break;
      case 'linkedin':
        const contact = state.currentContact;
        if (contact) {
          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name;
          const company = contact.companyName || '';
          const query = encodeURIComponent([fullName, company].filter(Boolean).join(' '));
          const url = `https://www.linkedin.com/search/results/people/?keywords=${query}`;
          try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
        }
        break;
    }
  }

  // Normalize string for case-insensitive comparisons
  function normalizeStr(s) { return (s == null ? '' : String(s)).trim().toLowerCase(); }

  // Navigate from Contact Detail to linked Account Detail
  function navigateToAccountFromContact() {
    const c = state.currentContact;
    if (!c) return;
    let accountId = c.accountId || c.account_id || '';
    if (!accountId) {
      const key = normalizeStr(c.companyName || c.accountName || '');
      if (key && typeof window.getAccountsData === 'function') {
        try {
          const accounts = window.getAccountsData() || [];
          const match = accounts.find(a => normalizeStr(a.accountName || a.name || a.companyName) === key);
          if (match) accountId = match.id;
        } catch (_) { /* noop */ }
      }
    }
    if (accountId && window.AccountDetail && typeof window.AccountDetail.show === 'function') {
      try { window.AccountDetail.show(accountId); } catch (e) { /* noop */ }
    }
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
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

  // Export functions for use by people.js
  window.ContactDetail = {
    show: showContactDetail
  };

})();
