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
    if (window.getAccountsData) {
      const accounts = window.getAccountsData();
      return accounts.find(a => a.id === accountId);
    }
    return null;
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
    const benefits = a.benefits || '';
    const painPoints = a.painPoints || '';
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
            <button class="btn-secondary" id="edit-account">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            <button class="btn-primary" id="add-account-to-sequence">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="7 4 20 12 7 20 7 4"/>
              </svg>
              Add to Sequence
            </button>
          </div>
        </div>
      </div>`;

    const bodyHtml = `
      <div id="account-detail-view" class="contact-detail">
        <div class="contact-info-section">
          <h3 class="section-title">Account Information</h3>
          <div class="info-grid">
            <div class="info-row"><div class="info-label">WEBSITE</div><div class="info-value-wrap" data-field="website"><span class="info-value-text">${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(website)}</a>` : '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">PHONE</div><div class="info-value-wrap" data-field="phone"><span class="info-value-text">${escapeHtml(phone) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
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
            <div class="info-row"><div class="info-label">BENEFITS</div><div class="info-value-wrap" data-field="benefits"><span class="info-value-text">${escapeHtml(benefits) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
            <div class="info-row"><div class="info-label">PAIN POINTS</div><div class="info-value-wrap" data-field="painPoints"><span class="info-value-text">${escapeHtml(painPoints) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${editIcon()}</button><button class="icon-btn-sm info-copy" title="Copy">${copyIcon()}</button><button class="icon-btn-sm info-delete" title="Delete">${trashIcon()}</button></div></div></div>
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
  }

  function attachAccountDetailEvents() {
    const backBtn = document.getElementById('back-to-accounts');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        try { window.crm && window.crm.navigateToPage('accounts'); } catch (e) { /* noop */ }
        // Rebind accounts page dynamic handlers
        if (window.accountsModule && typeof window.accountsModule.rebindDynamic === 'function') {
          try { window.accountsModule.rebindDynamic(); } catch (e) { /* noop */ }
        }
      });
    }

    const editBtn = document.getElementById('edit-account');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        console.log('Edit account:', state.currentAccount?.id);
      });
    }

    const addToSequenceBtn = document.getElementById('add-account-to-sequence');
    if (addToSequenceBtn) {
      addToSequenceBtn.addEventListener('click', () => {
        console.log('Add account to sequence:', state.currentAccount?.id);
      });
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
  }

  function handleQuickAction(action) {
    const a = state.currentAccount;
    switch (action) {
      case 'call': {
        const phone = a?.phone || a?.primaryPhone || a?.mainPhone;
        if (phone) {
          try { window.open(`tel:${encodeURIComponent(phone)}`); } catch (e) { /* noop */ }
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
})();
