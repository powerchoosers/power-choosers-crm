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
          await saveField(field, '');
          updateFieldText(wrap, '');
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
