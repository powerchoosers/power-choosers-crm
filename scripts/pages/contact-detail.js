'use strict';

// Contact Detail page module: displays individual contact information Apollo-style
(function () {
  // Clean up previous module instance if it exists (for hot reload support)
  if (window.ContactDetail && window.ContactDetail._cleanup) {
    try {
      window.ContactDetail._cleanup();
    } catch(e) {
      console.warn('[ContactDetail] Cleanup error:', e);
    }
  }

  const state = {
    currentContact: null,
    activities: [],
    loaded: false,
    // Snapshot of People page content to restore on back navigation
    prevPeopleContent: '',
    // When user explicitly chooses a phone type, prefer rendering that type as primary
    preferredPhoneField: ''
  };

  const els = {};
  
  // Track event listeners for cleanup
  const eventListeners = [];

  function initDomRefs() {
    els.page = document.getElementById('people-page');
    els.mainContent = els.page ? els.page.querySelector('.page-content') : null;
    return !!els.page && !!els.mainContent;
  }

  // Set up event delegation for contact detail buttons on stable parent
  // This runs once and handles all button clicks regardless of DOM replacement
  function setupEventDelegation() {
    // Only set up once
    if (document._pcContactDetailDelegated) return;
    
    console.log('[ContactDetail] Setting up event delegation on document');
    
    const delegatedClickHandler = (e) => {
      // Check if click is on "Add to list" button
      const addToListBtn = e.target.closest('#add-contact-to-list');
      if (addToListBtn) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[ContactDetail] Add to list clicked via delegation');
        
        // Toggle behavior: close if already open
        if (document.getElementById('contact-lists-panel')) {
          closeContactListsPanel();
        } else {
          openContactListsPanel();
        }
        return;
      }
      
      // Check if click is on "Add to sequences" button
      const addToSequencesBtn = e.target.closest('#add-contact-to-sequences');
      if (addToSequencesBtn) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[ContactDetail] Add to sequences clicked via delegation');
        
        // Toggle behavior: close if already open
        if (document.getElementById('contact-sequences-panel')) {
          closeContactSequencesPanel();
        } else {
          openContactSequencesPanel();
        }
        return;
      }
      
      // Company link click delegation (fix inconsistent behavior)
      if (e.target.closest('#contact-company-link')) {
        e.preventDefault();
        e.stopPropagation();
        if (state.currentContact && state.currentContact.id) {
          window._contactNavigationSource = 'contact-detail';
          window._contactNavigationContactId = state.currentContact.id;
          navigateToAccountFromContact();
        }
        return;
      }
      
      // Website button click delegation (contact detail specific)
      const websiteBtn = e.target.closest('.website-header-btn');
      if (websiteBtn && document.getElementById('contact-detail-page')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[ContactDetail] Website button clicked via delegation');
        handleQuickAction('website');
        return;
      }
      
      // LinkedIn button click delegation (contact detail specific)
      const linkedInBtn = e.target.closest('.linkedin-header-btn');
      if (linkedInBtn && document.getElementById('contact-detail-page')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[ContactDetail] LinkedIn button clicked via delegation');
        handleQuickAction('linkedin');
        return;
      }
    };
    
    // Attach to document with capture phase to catch events early
    document.addEventListener('click', delegatedClickHandler, true);
    eventListeners.push({ type: 'click', handler: delegatedClickHandler, target: document });
    
    document._pcContactDetailDelegated = true;
    console.log('[ContactDetail] Event delegation set up successfully');
  }
  
  // Initialize event delegation immediately
  setupEventDelegation();

  // Listen for accounts data becoming available (ONCE)
  if (!document._contactDetailAccountsListenerBound) {
    document.addEventListener('pc:accounts-loaded', async (e) => {
      console.log('[ContactDetail] Accounts loaded event received, count:', e.detail?.count);
      
      // Only re-render if we're showing a contact and don't have account data yet
      if (state.currentContact && !state._linkedAccountId) {
        console.log('[ContactDetail] Re-rendering contact detail with newly loaded account data');
        try {
          await renderContactDetail();
        } catch (error) {
          console.error('[ContactDetail] Error re-rendering after accounts loaded:', error);
        }
      }
    });
    document._contactDetailAccountsListenerBound = true;
    console.log('[ContactDetail] Registered accounts-loaded listener');
  }

  // Save a Contact field from the contact detail page
  async function saveField(field, value) {
    const db = window.firebaseDB;
    const contactId = state.currentContact?.id;
    console.log('[Contact Detail] saveField called with:', { field, value, contactId, db: !!db });
    
    if (!contactId || !db) {
      console.warn('[Contact Detail] Missing contactId or db:', { contactId, db: !!db });
      return;
    }
    
    try {
      const payload = {
        [field]: value,
        updatedAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
      };
      console.log('[Contact Detail] Saving to Firebase with payload:', payload);
      
      await db.collection('contacts').doc(contactId).update(payload);
      console.log('[Contact Detail] Firebase save successful');
      
      // Update local state
      try { if (state.currentContact) state.currentContact[field] = value; } catch(_) {}
      try { window.crm?.showToast && window.crm.showToast('Saved'); } catch(_) {}
    } catch (e) {
      console.error('[Contact Detail] Failed to save contact field', field, e);
      try { window.crm?.showToast && window.crm.showToast('Save failed'); } catch(_) {}
    }
  }

  // Save an Account field from the contact detail energy section
  async function saveAccountField(field, value) {
    console.log('[Contact Detail] saveAccountField called:', { field, value });
    const db = window.firebaseDB;
    const accountId = state._linkedAccountId;
    console.log('[Contact Detail] Linked account ID:', accountId);
    
    if (!accountId) {
      console.log('[Contact Detail] No linked account ID found');
      return;
    }
    
    const payload = { [field]: value, updatedAt: Date.now() };
    console.log('[Contact Detail] Payload to save:', payload);
    
    // Update local cache if we have it
    try {
      if (typeof window.getAccountsData === 'function') {
        const accounts = window.getAccountsData() || [];
        const idx = accounts.findIndex(a => a.id === accountId);
        if (idx !== -1) {
          try { accounts[idx][field] = value; } catch(_) {}
          console.log('[Contact Detail] Updated local cache for account:', accountId);
        }
      }
    } catch(_) {}
    
    if (!db) { 
      console.log('[Contact Detail] No database, dispatching energy-updated event');
      try { document.dispatchEvent(new CustomEvent('pc:energy-updated', { detail: { entity: 'account', id: accountId, field, value } })); } catch(_) {} 
      return; 
    }
    
    try { 
      console.log('[Contact Detail] Saving to Firestore:', { accountId, payload });
      await db.collection('accounts').doc(accountId).update(payload); 
      console.log('[Contact Detail] Firestore save successful');
      window.crm?.showToast && window.crm.showToast('Saved');
      // Opportunistically update Health widget inputs immediately for better UX
      try {
        if (field === 'electricitySupplier') {
          const supplierEl = document.querySelector('#health-supplier');
          if (supplierEl) supplierEl.value = String(value || '').trim();
        }
        if (field === 'annualUsage') {
          const usageEl = document.querySelector('#health-annual-usage');
          if (usageEl) usageEl.value = String(value || '').trim();
        }
        if (field === 'currentRate') {
          const rateEl = document.querySelector('#health-current-rate');
          if (rateEl) rateEl.value = String(value || '').trim();
        }
        if (field === 'contractEndDate') {
          const endEl = document.querySelector('#health-contract-end');
          if (endEl) endEl.value = String(value || '').trim();
        }
      } catch (_) {}
      console.log('[Contact Detail] Dispatching energy-updated event:', { entity: 'account', id: accountId, field, value });
      try { 
        const event = new CustomEvent('pc:energy-updated', { detail: { entity: 'account', id: accountId, field, value } });
        console.log('[Contact Detail] Event created, dispatching...');
        document.dispatchEvent(event);
        console.log('[Contact Detail] Event dispatched successfully');
      } catch(e) { 
        console.log('[Contact Detail] Error dispatching event:', e);
      }
    } catch (e) { 
      console.warn('[Contact Detail] Failed to save account field', field, e); 
      window.crm?.showToast && window.crm.showToast('Save failed'); 
    }
  }

  // Save service addresses array to linked account from contact detail
  async function saveAccountServiceAddresses(addresses) {
    console.log('[Contact Detail] saveAccountServiceAddresses called:', { addresses });
    const db = window.firebaseDB;
    const accountId = state._linkedAccountId;
    console.log('[Contact Detail] Linked account ID:', accountId);
    
    if (!accountId) {
      console.log('[Contact Detail] No linked account ID found');
      return;
    }
    
    const payload = { serviceAddresses: addresses, updatedAt: Date.now() };
    console.log('[Contact Detail] Payload to save:', payload);
    
    // Update local cache if we have it
    try {
      if (typeof window.getAccountsData === 'function') {
        const accounts = window.getAccountsData() || [];
        const idx = accounts.findIndex(a => a.id === accountId);
        if (idx !== -1) {
          try { 
            accounts[idx].serviceAddresses = addresses;
            accounts[idx].updatedAt = new Date();
          } catch(_) {}
          console.log('[Contact Detail] Updated local cache for account service addresses:', accountId);
        }
      }
    } catch(_) {}
    
    if (!db) { 
      console.log('[Contact Detail] No database, dispatching service-addresses-updated event');
      try { document.dispatchEvent(new CustomEvent('pc:service-addresses-updated', { detail: { entity: 'account', id: accountId, addresses } })); } catch(_) {} 
      return; 
    }
    
    try { 
      console.log('[Contact Detail] Saving to Firestore:', { accountId, payload });
      await db.collection('accounts').doc(accountId).update(payload); 
      console.log('[Contact Detail] Firestore save successful');
      window.crm?.showToast && window.crm.showToast('Saved');
      console.log('[Contact Detail] Dispatching service-addresses-updated event:', { entity: 'account', id: accountId, addresses });
      try { 
        const event = new CustomEvent('pc:service-addresses-updated', { detail: { entity: 'account', id: accountId, addresses } });
        console.log('[Contact Detail] Event created, dispatching...');
        document.dispatchEvent(event);
        console.log('[Contact Detail] Event dispatched successfully');
      } catch(e) { 
        console.log('[Contact Detail] Error dispatching event:', e);
      }
    } catch (e) { 
      console.warn('[Contact Detail] Failed to save service addresses', e); 
      window.crm?.showToast && window.crm.showToast('Save failed'); 
    }
  }

  // Recent Calls (Contact) keyed patching & styles
  function injectRecentCallsStyles(){
    if (document.getElementById('contact-recent-calls-styles')) return;
    const style=document.createElement('style');
    style.id='contact-recent-calls-styles';
    style.textContent=`
      /* Base list + rows */
      #contact-recent-calls .rc-list { 
        position: relative; 
        display:flex; 
        flex-direction:column; 
        gap:8px; 
        transition: opacity 220ms ease; /* Remove height transition to prevent layout shifts */
        contain: layout; /* Prevent layout shifts during updates */
        min-height: 0; /* Prevent height jumping */
      }
      #contact-recent-calls .rc-item { 
        display:flex; 
        align-items:center; 
        justify-content:space-between; 
        gap:12px; 
        padding:10px 12px; 
        border:1px solid var(--border-light); 
        border-radius: var(--border-radius); 
        background: var(--bg-item); 
        contain: layout; /* Prevent layout shifts during duration updates */
        min-height: 48px; /* Fixed height to prevent jumping */
      }
      #contact-recent-calls .rc-item.rc-new { animation: rcNewIn 220ms ease-out both; }
      @keyframes rcNewIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      #contact-recent-calls .rc-meta { display:flex; align-items:center; gap:10px; min-width:0; }
      #contact-recent-calls .rc-title { font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #contact-recent-calls .rc-sub { color:var(--text-secondary); font-size:12px; white-space:nowrap; }
      #contact-recent-calls .rc-empty { color: var(--text-secondary); font-size: 12px; padding: 6px 0; }
      /* Pager (shared with Account) */
      .rc-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom: var(--spacing-md); }
      .rc-pager { display:flex; align-items:center; gap:8px; }
      .rc-page-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:var(--bg-card); color:var(--text-primary); border:1px solid var(--border-light); }
      .rc-page-btn:hover { background: var(--bg-hover); border-color: var(--accent-color); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .rc-page-info { min-width: 44px; text-align:center; color: var(--text-secondary); font-size: 12px; }
      /* Actions */
      #contact-recent-calls .rc-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:var(--bg-card); color:var(--text-primary); border:1px solid var(--border-light); }
      #contact-recent-calls .rc-icon-btn:hover { background: var(--bg-hover); border-color: var(--accent-color); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      #contact-recent-calls .rc-icon-btn.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
      #contact-recent-calls .rc-icon-btn.disabled:hover { background: var(--bg-card); border-color: var(--border-light); transform: none; box-shadow: none; }
      #contact-recent-calls .rc-actions { display:flex; align-items:center; gap:8px; }
      #contact-recent-calls .rc-outcome { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--border-light); background:var(--bg-card); color:var(--text-secondary); }
      /* Inline details under item */
      #contact-recent-calls .rc-details { overflow:hidden; border:1px solid var(--border-light); border-radius: var(--border-radius); background: var(--bg-card); margin: 6px 2px 2px 2px; box-shadow: var(--elevation-card); }
      #contact-recent-calls .rc-details-inner { padding: 12px; }
      /* Live call duration indicator */
      #contact-recent-calls .rc-item.live-call .rc-duration { color: var(--text-secondary); font-weight: 400; }
      /* Shared insights styles (mirrors account/calls page so it always looks correct) */
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
      /* Modern transcript styling */
      .pc-transcript-container { background: var(--bg-card); border:1px solid var(--border-light); border-radius: 14px; padding:14px; max-height:320px; overflow:auto; }
      .transcript-message { display:flex; gap:10px; margin-bottom:12px; align-items:flex-start; }
      .transcript-message:last-child { margin-bottom:0; }
      .transcript-avatar { flex-shrink:0; }
      .transcript-avatar-circle { width: 32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:12px; letter-spacing:.5px; }
      .transcript-avatar-circle.agent-avatar { background: var(--orange-subtle); color:#fff; }
      .transcript-avatar-circle.contact-avatar { background: var(--orange-subtle); color:#fff; }
      .transcript-avatar-circle.company-avatar { background: transparent; padding:0; }
      .transcript-avatar-circle.company-avatar img { width:100%; height:100%; object-fit:cover; }
      .transcript-avatar-circle .company-favicon-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); background: transparent; }
      .transcript-content { flex:1; min-width:0; border:1px solid var(--border-light); border-radius:10px; padding:10px 12px; background: var(--bg-item); }
      .transcript-message.customer .transcript-content { background: var(--bg-card); }
      .transcript-header { display:flex; align-items:center; gap:8px; margin-bottom:2px; }
      .transcript-speaker { font-weight:600; font-size:12px; color:var(--text-primary); }
      .transcript-time { font-size:11px; color:var(--text-secondary); }
      .transcript-text { font-size:13px; line-height:1.5; color:var(--text-primary); word-wrap:break-word; }
      /* Activity items spacing for contact detail */
      #contact-detail-view .activity-item { margin-bottom: 12px; }
      #contact-detail-view .activity-item:last-child { margin-bottom: 0; }
    `;
    document.head.appendChild(style);
  }

  function injectTaskPopoverStyles(){
    const id = 'contact-task-popover-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = `
      .task-popover { position: absolute; z-index: 1100; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-light); border-radius: var(--border-radius-lg); box-shadow: var(--elevation-card); min-width: 360px; max-width: 420px; }
      .task-popover .tp-inner { padding: 12px 12px 8px 12px; }
      .task-popover .tp-header { font-weight: 600; margin: 4px 4px 10px 4px; color: var(--text-primary); }
      .task-popover .tp-body { margin-bottom: 8px; }
      .task-popover .tp-header { display:flex; align-items:center; justify-content:space-between; }
      .task-popover .close-btn { appearance:none; background:transparent; border:0; color: var(--text-secondary); font-size: 18px; line-height:1; padding: 2px 6px; border-radius: 6px; }
      .task-popover .close-btn:hover { background: var(--grey-700); color: var(--text-inverse); }
      .task-popover .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .task-popover label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary); position: relative; }
      .task-popover label:has(.dropdown-toggle-btn) { z-index: 10; }
      .task-popover input.input-dark, .task-popover select.input-dark, .task-popover textarea.input-dark { width: 100%; padding: 10px 14px; background: var(--bg-item); color: var(--text-primary); border: 2px solid var(--border-light); border-radius: 8px; font-size: 0.9rem; font-family: inherit; height: 40px; transition: all 0.3s ease; }
      .task-popover label:has(.dropdown-toggle-btn) input.input-dark { padding-right: 48px; }
      .task-popover input.input-dark::placeholder, .task-popover textarea.input-dark::placeholder { color: var(--text-muted); font-family: inherit; font-size: 0.85rem; }
      .task-popover input.input-dark:hover, .task-popover select.input-dark:hover, .task-popover textarea.input-dark:hover { border-color: var(--grey-500); background: var(--bg-widget); }
      .task-popover input.input-dark:focus, .task-popover select.input-dark:focus, .task-popover textarea.input-dark:focus { outline: none; border-color: var(--orange-subtle); background: var(--bg-widget); box-shadow: 0 0 0 3px rgba(255,145,0,0.1); transform: translateY(-1px); }
      /* Themed selects and options */
      .task-popover select.input-dark { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%), linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%); background-position: calc(100% - 18px) 50%, calc(100% - 12px) 50%; background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; }
      .task-popover select.input-dark option, .task-popover select.input-dark optgroup { background-color: var(--bg-card); color: var(--text-primary); }
      /* Themed date picker icon (WebKit) */
      .task-popover input[type="date"].input-dark::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.85; cursor: pointer; }
      .task-popover input[type="date"].input-dark { color-scheme: dark; }
      .task-popover textarea.input-dark { min-height: 80px; height: auto; resize: vertical; line-height: 1.4; }
      .task-popover .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
      .task-popover .btn-primary { height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm); background: var(--grey-700); color: var(--text-inverse); border: 1px solid var(--grey-600); font-weight: 600; }
      .task-popover .btn-text { height: 32px; padding: 0 12px; border-radius: var(--border-radius-sm); background: transparent; color: var(--text-secondary); border: 1px solid transparent; }
      .task-popover .btn-text:hover { background: var(--grey-700); border-color: var(--border-light); color: var(--text-inverse); }
      .task-popover .arrow { position: absolute; top: -8px; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 8px solid var(--bg-card); filter: drop-shadow(0 -1px 0 var(--border-light)); }
      .task-popover .tp-footer { border-top: 1px solid var(--border-light); margin-top: 0; padding-top: 8px; }
      .task-popover .tp-empty { color: var(--text-secondary); font-size: 12px; }
      .task-popover .tp-subtitle { font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0; }
      .task-popover .tp-task { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; }
      .task-popover .tp-task-title { font-size: 13px; color: var(--text-primary); }
      .task-popover .tp-badge { font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; padding: 2px 6px; border-radius: 10px; border: 1px solid var(--border-light); }
      .task-popover .tp-badge.pending { background: var(--bg-subtle); color: var(--text-secondary); }
      .task-popover .tp-badge.completed { background: var(--green-muted); color: var(--text-inverse); border-color: var(--green-subtle); }
      .task-popover .tp-task-due { font-size: 11px; color: var(--text-secondary); margin-left: 6px; }
      
      /* Dropdown Toggle Button Styles */
      .task-popover .dropdown-toggle-btn {
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-15%);
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 8px;
        border-radius: 4px;
        transition: var(--transition-fast);
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
      }
      .task-popover .dropdown-toggle-btn:hover {
        color: var(--text-primary);
        background: transparent;
        transform: translateY(-15%) !important;
      }
      .task-popover .dropdown-toggle-btn svg {
        display: block;
        width: 20px;
        height: 20px;
      }
      
      /* Calendar Toggle Button Styles */
      .task-popover .calendar-toggle-btn {
        position: absolute;
        right: 4px;
        top: 65%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 8px;
        border-radius: 4px;
        transition: var(--transition-fast);
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
      }
      .task-popover .calendar-toggle-btn:hover {
        color: var(--text-primary);
        background: transparent;
        transform: translateY(-50%) !important;
      }
      .task-popover .calendar-toggle-btn svg {
        display: block;
        width: 20px;
        height: 20px;
      }
      
      /* Dropdown Toolbar Styles */
      .task-popover .type-toolbar,
      .task-popover .priority-toolbar {
        position: relative;
        background: var(--bg-card);
        border: 1px solid var(--border-light);
        border-radius: 8px;
        z-index: 1000;
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: all 0.3s ease;
        margin-top: 0;
        padding: 0;
        width: 100%;
      }
      .task-popover .type-toolbar.dropdown-slide-in,
      .task-popover .priority-toolbar.dropdown-slide-in {
        max-height: 200px;
        opacity: 1;
        margin-top: 8px;
        padding: 12px;
      }
      .task-popover .type-toolbar.dropdown-slide-out,
      .task-popover .priority-toolbar.dropdown-slide-out {
        max-height: 0;
        opacity: 0;
        margin-top: 0;
        padding: 0;
      }
      
      /* Dropdown Grid Styles */
      .task-popover .dropdown-grid {
        display: grid;
        gap: 6px;
      }
      .task-popover .type-grid {
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(2, 1fr);
      }
      .task-popover .priority-grid {
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: 1fr;
      }
      
      /* Dropdown Option Styles - Using global styles from main.css */
    `;
    document.head.appendChild(style);
  }

  // ===== Edit Contact Modal =====
  function openEditContactModal() {
    const overlay = createEditContactModal();
    document.body.appendChild(overlay);
    
    // Open modal with animation (same as add modals)
    overlay.removeAttribute('hidden');
    
    // Trigger animation after a brief delay to ensure DOM is ready
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
    
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
    overlay.className = 'pc-modal';
    overlay.tabIndex = -1;

    const html = `
      <div class="pc-modal__backdrop" data-close="edit-contact"></div>
      <div class="pc-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="edit-contact-title">
        <div class="pc-modal__header">
          <h3 id="edit-contact-title">Edit Contact</h3>
          <button class="pc-modal__close" data-close="edit-contact" aria-label="Close">×</button>
          </div>
        <form id="form-edit-contact" class="pc-modal__form">
          <div class="pc-modal__body">
            <div class="form-row">
              <label>First name<input type="text" class="input-dark" name="firstName" value="${escapeHtml(c.firstName || '')}" /></label>
              <label>Last name<input type="text" class="input-dark" name="lastName" value="${escapeHtml(c.lastName || '')}" /></label>
            </div>
            <div class="form-row">
              <label>Title<input type="text" class="input-dark" name="title" value="${escapeHtml(c.title || '')}" /></label>
              <label>Company<input type="text" class="input-dark" name="companyName" value="${escapeHtml(c.companyName || '')}" /></label>
            </div>
            <div class="form-row">
              <label>Email<input type="email" class="input-dark" name="email" value="${escapeHtml(c.email || '')}" /></label>
              <label>Email Status<select class="input-dark" name="emailStatus"><option value="">Not Verified</option><option value="verified" ${c.emailStatus === 'verified' ? 'selected' : ''}>Verified</option></select></label>
            </div>
            <div class="form-row">
              <label>Mobile Phone<input type="tel" class="input-dark" name="mobile" value="${escapeHtml(c.mobile || '')}" /></label>
              <label>Work Direct Phone<input type="tel" class="input-dark" name="workDirectPhone" value="${escapeHtml(c.workDirectPhone || '')}" /></label>
            </div>
            <div class="form-row">
              <label>Other Phone<input type="tel" class="input-dark" name="otherPhone" value="${escapeHtml(c.otherPhone || '')}" /></label>
              <label>City<input type="text" class="input-dark" name="city" value="${escapeHtml(c.city || c.locationCity || '')}" /></label>
            </div>
            <div class="form-row">
              <label>State<input type="text" class="input-dark" name="state" value="${escapeHtml(c.state || c.locationState || '')}" /></label>
              <label>Industry<input type="text" class="input-dark" name="industry" value="${escapeHtml(c.industry || c.companyIndustry || '')}" /></label>
            </div>
            <div class="form-row">
              <label>Seniority<input type="text" class="input-dark" name="seniority" value="${escapeHtml(c.seniority || '')}" /></label>
              <label>Department<input type="text" class="input-dark" name="department" value="${escapeHtml(c.department || '')}" /></label>
            </div>
            <div class="form-row">
              <label>LinkedIn URL<input type="url" class="input-dark" name="linkedin" value="${escapeHtml(c.linkedin || '')}" /></label>
            </div>
            <div class="form-row" style="justify-content:flex-end; gap: var(--spacing-sm);">
              <button type="button" class="btn-text" data-close="edit-contact">Cancel</button>
              <button type="submit" class="btn-primary">Save</button>
            </div>
        </div>
        </form>
      </div>`;

    overlay.innerHTML = html;

    const dialog = overlay.querySelector('.pc-modal__dialog');
    const backdrop = overlay.querySelector('.pc-modal__backdrop');
    const form = overlay.querySelector('#form-edit-contact');

    const close = () => { 
      // Close with animation
      overlay.classList.remove('show');
      setTimeout(() => {
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      }, 200); // Match animation duration
    };

    // Open (append to DOM)
    document.body.appendChild(overlay);

    // Focus management
    setTimeout(() => {
      const closeBtn = overlay.querySelector('.pc-modal__close');
      const firstInput = overlay.querySelector('input,button,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      else if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
    }, 0);

    // Click-away and close buttons
    if (backdrop) backdrop.addEventListener('click', close);
    overlay.querySelectorAll('[data-close="edit-contact"]').forEach(btn => btn.addEventListener('click', close));

    // Focus trap within dialog
    const getFocusables = () => Array.from(dialog.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        const f = getFocusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleKeyDown);

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
        emailStatus: (fd.get('emailStatus') || '').toString().trim(),
        city: (fd.get('city') || '').toString().trim(),
        state: (fd.get('state') || '').toString().trim(),
        industry: (fd.get('industry') || '').toString().trim(),
        seniority: (fd.get('seniority') || '').toString().trim(),
        department: (fd.get('department') || '').toString().trim(),
        linkedin: (fd.get('linkedin') || '').toString().trim()
      };
      const mobile = (fd.get('mobile') || '').toString().trim();
      const workDirectPhone = (fd.get('workDirectPhone') || '').toString().trim();
      const otherPhone = (fd.get('otherPhone') || '').toString().trim();
      updates.mobile = normalizePhone(mobile);
      updates.workDirectPhone = normalizePhone(workDirectPhone);
      updates.otherPhone = normalizePhone(otherPhone);

      // Persist in one update
      const id = state.currentContact?.id;
      const db = window.firebaseDB;
      updates.updatedAt = Date.now();
      if (db && id) {
        try { await db.collection('contacts').doc(id).update(updates); } catch (err) { console.warn('Failed to save contact', err); }
      }
      // Update local state
      try { Object.assign(state.currentContact, updates); } catch (_) {}
      
      // IMMEDIATELY update essential data
      if (window._essentialContactsData) {
        const idx = window._essentialContactsData.findIndex(c => c.id === id);
        if (idx >= 0) {
          window._essentialContactsData[idx] = {
            ...window._essentialContactsData[idx],
            ...updates
          };
          console.log('[ContactDetail] Updated essential data');
        }
      }
      
      // IMMEDIATELY update cache
      if (window.CacheManager && typeof window.CacheManager.get === 'function') {
        window.CacheManager.get('contacts').then(contacts => {
          if (contacts && Array.isArray(contacts)) {
            const idx = contacts.findIndex(c => c.id === id);
            if (idx >= 0) {
              contacts[idx] = { ...contacts[idx], ...updates };
              window.CacheManager.set('contacts', contacts);
              console.log('[ContactDetail] Updated cache');
            }
          }
        }).catch(() => {});
      }
      
      // Notify other pages
      try {
        const ev = new CustomEvent('pc:contact-updated', { 
          detail: { 
            id, 
            changes: { ...updates },
            contact: state.currentContact  // Full updated contact
          } 
        });
        document.dispatchEvent(ev);
      } catch (_) { /* noop */ }
      // Feedback and refresh UI
      try { window.crm?.showToast && window.crm.showToast('Saved'); } catch (_) {}
      try { await renderContactDetail(); } catch (_) {}
      close();
    });

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
        // Toggle Health Check: if open, close; else open for this contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isHealthOpen === 'function' && api.isHealthOpen()) {
              if (typeof api.closeHealth === 'function') { api.closeHealth(); return; }
            } else if (typeof api.openHealth === 'function') {
              api.openHealth(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Energy Health Check for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Energy Health Check'); } catch (_) {}
        break;
      }
      case 'deal': {
        // Toggle Deal Calculator: if open, close; else open for this contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isDealOpen === 'function' && api.isDealOpen()) {
              if (typeof api.closeDeal === 'function') { api.closeDeal(); return; }
            } else if (typeof api.openDeal === 'function') {
              api.openDeal(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Deal Calculator for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Deal Calculator'); } catch (_) {}
        break;
      }
      case 'lusha': {
        // Use Lusha Prospect widget
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isLushaOpen === 'function' && api.isLushaOpen()) {
              if (typeof api.closeLusha === 'function') { api.closeLusha(); return; }
            } else if (typeof api.openLusha === 'function') {
              api.openLusha(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Prospect for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Prospect'); } catch (_) {}
        break;
      }
      case 'maps': {
        // Toggle Google Maps: if open, close; else open for this contact
        if (window.Widgets) {
          try {
            const api = window.Widgets;
            if (typeof api.isMapsOpen === 'function' && api.isMapsOpen()) {
              if (typeof api.closeMaps === 'function') { api.closeMaps(); return; }
            } else if (typeof api.openMaps === 'function') {
              api.openMaps(contactId); return;
            }
          } catch (_) { /* noop */ }
        }
        console.log('Widget: Google Maps for contact', contactId);
        try { window.crm?.showToast && window.crm.showToast('Open Google Maps'); } catch (_) {}
        break;
      }
      default:
        console.log('Unknown widget action:', which, 'for contact', contactId);
    }
  }

  function openContactTaskPopover(anchorEl) {
    closeContactTaskPopover();
    if (!anchorEl) return;

    // Build popover
    const pop = document.createElement('div');
    pop.className = 'task-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Create task for contact');

    const c = state.currentContact || {};
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || 'this contact';
    const company = c.companyName || '';

    const nextBiz = getNextBusinessDayISO();
    console.log('nextBiz ISO string:', nextBiz);
    const nextBizDate = new Date(nextBiz + 'T00:00:00'); // Add time to avoid timezone issues
    console.log('nextBiz formatted for input:', `${(nextBizDate.getMonth() + 1).toString().padStart(2, '0')}/${nextBizDate.getDate().toString().padStart(2, '0')}/${nextBizDate.getFullYear()}`);

    const currentTasksHtml = renderExistingTasksForContact(c.id, fullName);

    pop.innerHTML = `
      <div class="arrow" aria-hidden="true"></div>
      <div class="tp-inner">
        <div class="tp-header">
          <div class="tp-title">Create Task</div>
          <button type="button" class="close-btn" id="tp-close" aria-label="Close">×</button>
        </div>
        <div class="tp-body">
          <form id="contact-task-form">
            <div class="form-row">
              <label>Type
                <input type="text" name="type" class="input-dark" value="Phone Call" readonly />
                <button type="button" class="dropdown-toggle-btn" id="type-toggle" aria-label="Open type dropdown">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6,9 12,15 18,9"></polyline>
                  </svg>
                </button>
              </label>
              <label>Priority
                <input type="text" name="priority" class="input-dark" value="Medium" readonly />
                <button type="button" class="dropdown-toggle-btn" id="priority-toggle" aria-label="Open priority dropdown">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6,9 12,15 18,9"></polyline>
                  </svg>
                </button>
              </label>
            </div>
            <div class="type-toolbar" id="type-toolbar" style="display: none;">
              <div class="dropdown-grid type-grid">
                <button type="button" class="dropdown-option" data-value="phone-call">Phone Call</button>
                <button type="button" class="dropdown-option" data-value="manual-email">Manual Email</button>
                <button type="button" class="dropdown-option" data-value="auto-email">Auto Email</button>
                <button type="button" class="dropdown-option" data-value="follow-up">Follow-up</button>
                <button type="button" class="dropdown-option" data-value="demo">Demo</button>
                <button type="button" class="dropdown-option" data-value="custom-task">Custom Task</button>
              </div>
            </div>
            <div class="priority-toolbar" id="priority-toolbar" style="display: none;">
              <div class="dropdown-grid priority-grid">
                <button type="button" class="dropdown-option" data-value="low">Low</button>
                <button type="button" class="dropdown-option" data-value="medium">Medium</button>
                <button type="button" class="dropdown-option" data-value="high">High</button>
              </div>
            </div>
            <div class="form-row">
              <label>Time
                <input type="text" name="dueTime" class="input-dark" value="10:30 AM" placeholder="10:30 AM" required />
              </label>
              <label>Due date
                <input type="text" name="dueDate" class="input-dark" value="${(nextBizDate.getMonth() + 1).toString().padStart(2, '0')}/${nextBizDate.getDate().toString().padStart(2, '0')}/${nextBizDate.getFullYear()}" readonly />
                <button type="button" class="calendar-toggle-btn" id="calendar-toggle" aria-label="Open calendar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </button>
              </label>
            </div>
            <div class="calendar-toolbar" id="calendar-toolbar" style="display: none;">
              <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" id="calendar-prev" aria-label="Previous month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15,18 9,12 15,6"></polyline>
                  </svg>
                </button>
                <div class="calendar-month-year" id="calendar-month-year">September 2025</div>
                <button type="button" class="calendar-nav-btn" id="calendar-next" aria-label="Next month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9,18 15,12 9,6"></polyline>
                  </svg>
                </button>
              </div>
              <div class="calendar-weekdays">
                <div class="calendar-weekday">S</div>
                <div class="calendar-weekday">M</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">W</div>
                <div class="calendar-weekday">T</div>
                <div class="calendar-weekday">F</div>
                <div class="calendar-weekday">S</div>
              </div>
              <div class="calendar-days" id="calendar-days">
                <!-- Calendar days will be populated by JavaScript -->
              </div>
            </div>
            <div class="form-row" style="grid-template-columns: 1fr;">
              <label>Notes
                <textarea name="notes" class="input-dark" rows="3" placeholder="Add context (optional)"></textarea>
              </label>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-primary" id="tp-save">Create Task</button>
            </div>
          </form>
        </div>
        ${currentTasksHtml}
      </div>
    `;

    document.body.appendChild(pop);

    // Position popover under the anchor, centered horizontally (recompute after paint)
    const position = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const anchorCenter = rect.left + rect.width / 2;
      const desiredLeft = Math.round(window.scrollX + anchorCenter - popRect.width / 2);
      const clampedLeft = Math.max(8, Math.min(desiredLeft, (window.scrollX + document.documentElement.clientWidth) - popRect.width - 8));
      const top = Math.round(window.scrollY + rect.bottom + 10);
      pop.style.top = `${top}px`;
      pop.style.left = `${clampedLeft}px`;
      const arrow = pop.querySelector('.arrow');
      if (arrow) {
        // Position arrow to point to the center of the anchor button
        // Calculate where the anchor center is relative to the popover's left edge
        const anchorCenterRelativeToPopover = anchorCenter - clampedLeft;
        arrow.style.left = `${anchorCenterRelativeToPopover}px`;
      }
    };
    position();
    requestAnimationFrame(() => {
      position();
      // Show with dropdown animation after a small delay to ensure DOM is ready
      setTimeout(() => {
        pop.classList.add('--show');
      }, 10);
    });

    // Event handling
    const form = pop.querySelector('#contact-task-form');
    const closeBtn = pop.querySelector('#tp-close');
    const timeInput = pop.querySelector('input[name="dueTime"]');
    
    // Auto-format time input
    if (timeInput) {
      // Clear placeholder on focus
      timeInput.addEventListener('focus', (e) => {
        if (e.target.value === '10:30 AM') {
          e.target.value = '';
        }
      });
      
      // Track last pressed key to refine formatting behavior (e.g., don't auto-expand on delete)
      let _timeLastKey = null;
      
      timeInput.addEventListener('input', (e) => {
        const rawBefore = e.target.value;
        let value = rawBefore;
        let cursorPos = e.target.selectionStart;
        
        // Only allow digits, colon, A, P, M, and spaces
        let sanitized = value.replace(/[^\d:APMapm\s]/g, '');
        
        // Handle common time formats more intelligently
        let formattedValue = formatTimeInput(sanitized, _timeLastKey);
        
        // If the formatted value ended up with extra characters after AM/PM, strip them
        formattedValue = formattedValue.replace(/^(\d{1,2}:\d{2}\s+(?:AM|PM)).*$/i, '$1');
        
        // Calculate cursor position adjustment
        let cursorAdjustment = formattedValue.length - sanitized.length;
        let newCursorPos = Math.max(0, (cursorPos ?? formattedValue.length) + cursorAdjustment);
        
        // Debugging
        try { console.log('[TimeInput] input', { raw: rawBefore, sanitized, formatted: formattedValue, lastKey: _timeLastKey, cursorBefore: cursorPos, cursorAfter: newCursorPos }); } catch (_) {}
        
        // Set the formatted value
        e.target.value = formattedValue;
        
        // Set cursor position properly
        setTimeout(() => {
          if (e.target === document.activeElement) {
            e.target.setSelectionRange(newCursorPos, newCursorPos);
          }
          // Reset last key after applying formatting
          _timeLastKey = null;
        }, 0);
      });
      
      // Check if user is typing beyond a complete time format
      timeInput.addEventListener('keydown', (e) => {
        _timeLastKey = e.key;
        // Always allow backspace, delete, navigation keys, and space
        const alwaysAllowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape', ' ', 'Space', 'Spacebar'];
        if (alwaysAllowed.includes(e.key) || e.ctrlKey || e.metaKey) {
          try { console.log('[TimeInput] keydown allow', { key: e.key, reason: 'alwaysAllowed' }); } catch (_) {}
          return; // Allow the event to proceed
        }
        
        const value = e.target.value;
        const cursorPos = e.target.selectionStart ?? value.length;
        const complete = isCompleteTimeFormat(value);
        
        // If the current value is a complete time format and user is trying to add characters at the end
        if (complete && cursorPos >= value.length) {
          try { console.log('[TimeInput] keydown block', { key: e.key, value, cursorPos, complete }); } catch (_) {}
          e.preventDefault();
          return false;
        }
        try { console.log('[TimeInput] keydown pass', { key: e.key, value, cursorPos, complete }); } catch (_) {}
      });
      
      // Helper function to check if time format is complete
      function isCompleteTimeFormat(value) {
        // Check if it matches "H:MM AM" or "HH:MM AM" or "H:MM PM" or "HH:MM PM"
        return /^\d{1,2}:\d{2}\s+(AM|PM)$/.test(value);
      }
      
      // Helper function to format time input
      function formatTimeInput(input, lastKey) {
        if (input == null) return '';
        
        // Detect if user intentionally typed a trailing space and no AM/PM yet
        const hadTrailingSpace = /\s$/.test(input);
        
        // Normalize spaces (but do not trim end yet)
        let value = String(input).replace(/\s+/g, ' ');
        // Trim leading spaces only
        value = value.replace(/^\s+/, '');
        
        // Extract digits and letters
        const digits = (value.match(/\d+/g) || []).join('');
        const colonExplicit = /:\s*$/.test(value) || /:\s*[ap]?m?$/i.test(value); // user typed colon at end
        let ampmRaw = (value.match(/([ap]m?)$/i) || [null, ''])[1] || '';
        
        // Build time from digits
        let hours = '';
        let minutes = '';
        if (digits.length >= 4) {
          hours = digits.slice(0, 2);
          minutes = digits.slice(2, 4);
        } else if (digits.length === 3) {
          hours = digits.slice(0, 1);
          minutes = digits.slice(1);
        } else if (digits.length === 2) {
          hours = digits;
        } else if (digits.length === 1) {
          hours = digits;
        }
        
        // Clamp minutes to two digits; ignore extras
        if (minutes.length > 2) minutes = minutes.slice(0, 2);
        
        // Compose base time string
        let out = '';
        if (hours) {
          if (minutes) out = `${hours}:${minutes}`;
          else if (colonExplicit) out = `${hours}:`;
          else out = hours;
        }
        
        // Handle various input patterns
        
        // Apply AM/PM logic
        if (ampmRaw) {
          // If deleting, don't auto-expand 'A' -> 'AM'
          if (lastKey === 'Backspace' || lastKey === 'Delete') {
            ampmRaw = ampmRaw.toUpperCase();
          } else {
            // Expand single-letter to full AM/PM
            if (/^a$/i.test(ampmRaw)) ampmRaw = 'AM';
            else if (/^p$/i.test(ampmRaw)) ampmRaw = 'PM';
            else ampmRaw = ampmRaw.toUpperCase();
          }
          out = out ? `${out} ${ampmRaw}` : ampmRaw;
        }
        
        // Auto-add space before AM/PM if missing (e.g., 10:30p -> 10:30 p)
        out = out.replace(/(\d)([AP]M?)$/g, '$1 $2');
        
        // Capitalize AM/PM
        value = value.replace(/\b(am|pm|a|p)\b/gi, (match) => {
          if (match.toLowerCase() === 'a') return 'AM';
          if (match.toLowerCase() === 'p') return 'PM';
          return match.toUpperCase();
        });
        
        // Preserve a single trailing space if user typed it and AM/PM not present
        if (hadTrailingSpace && !/(AM|PM)/i.test(out)) {
          out = out.replace(/\s+$/,'') + ' ';
          return out;
        }
        
        // Clean up spaces (trim both ends when no trailing space preservation)
        out = out.replace(/\s+/g, ' ').trim();
        
        return out;
      }
      
      // Handle paste events
      timeInput.addEventListener('paste', (e) => {
        setTimeout(() => {
          timeInput.dispatchEvent(new Event('input'));
        }, 0);
      });
    }
    
    closeBtn?.addEventListener('click', closeContactTaskPopover);
    
    // Calendar functionality
    const calendarToggle = pop.querySelector('#calendar-toggle');
    const calendarToolbar = pop.querySelector('#calendar-toolbar');
    const calendarDays = pop.querySelector('#calendar-days');
    const calendarMonthYear = pop.querySelector('#calendar-month-year');
    const calendarPrev = pop.querySelector('#calendar-prev');
    const calendarNext = pop.querySelector('#calendar-next');
    const dueDateInput = pop.querySelector('input[name="dueDate"]');
    
    // Dropdown functionality
    const typeToggle = pop.querySelector('#type-toggle');
    const typeToolbar = pop.querySelector('#type-toolbar');
    const typeInput = pop.querySelector('input[name="type"]');
    const priorityToggle = pop.querySelector('#priority-toggle');
    const priorityToolbar = pop.querySelector('#priority-toolbar');
    const priorityInput = pop.querySelector('input[name="priority"]');
    
    // Parse the ISO date string and create local date objects to avoid timezone issues
    const [year, month, day] = nextBiz.split('-').map(Number);
    let currentDate = new Date(year, month - 1, day);
    let selectedDate = new Date(year, month - 1, day);
    
    // Format date for display
    function formatDateForDisplay(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    }
    
    // Generate calendar days
    function generateCalendar() {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      // Update month/year display
      calendarMonthYear.textContent = currentDate.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });
      
      // Clear existing days
      calendarDays.innerHTML = '';
      
      // Get first day of month and number of days
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();
      
      // Add empty cells for days before the first day of the month
      for (let i = 0; i < startingDayOfWeek; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day calendar-day-empty';
        calendarDays.appendChild(emptyDay);
      }
      
      // Add days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('button');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        dayElement.type = 'button';
        
        const dayDate = new Date(year, month, day);
        const isSelected = dayDate.toDateString() === selectedDate.toDateString();
        const isToday = dayDate.toDateString() === new Date().toDateString();
        
        if (isSelected) {
          dayElement.classList.add('calendar-day-selected');
        }
        if (isToday) {
          dayElement.classList.add('calendar-day-today');
          dayElement.style.borderColor = 'var(--orange-primary)';
        }
        
        dayElement.addEventListener('click', () => {
          selectedDate = dayDate;
          dueDateInput.value = `${(dayDate.getMonth() + 1).toString().padStart(2, '0')}/${dayDate.getDate().toString().padStart(2, '0')}/${dayDate.getFullYear()}`;
          generateCalendar();
          closeCalendar();
        });
        
        calendarDays.appendChild(dayElement);
      }
    }
    
    // Ensure the time/due date row is at the top of the scroll container
    function scrollTimeDueRowIntoView() {
      try {
        const body = pop.querySelector('.tp-body');
        if (!body) return;
        const row = calendarToggle?.closest('.form-row');
        if (!row) return;
        const bodyRect = body.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const targetTop = body.scrollTop + (rowRect.top - bodyRect.top);
        body.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      } catch (_) { /* noop */ }
    }

    // Toggle calendar
    function toggleCalendar() {
      if (calendarToolbar.style.display === 'none') {
        openCalendar();
      } else {
        closeCalendar();
      }
    }
    
    function openCalendar() {
      generateCalendar();
      calendarToolbar.style.display = 'block';
      // Force a reflow to ensure the element is rendered before adding animation class
      calendarToolbar.offsetHeight;
      calendarToolbar.classList.add('calendar-slide-in');
      // Add animation class to task popover to make it flexible
      pop.classList.add('calendar-expanded');
      
      // Scroll to the time/date form row when calendar opens
      setTimeout(() => {
        console.log('Attempting to scroll to form row...');
        const tpBody = pop.querySelector('.tp-body');
        
        // Find the Time/Due date form row by looking for the Time label
        const timeLabel = pop.querySelector('label:has(input[name="dueTime"])');
        const formRow = timeLabel ? timeLabel.closest('.form-row') : null;
        
        console.log('tpBody found:', !!tpBody);
        console.log('timeLabel found:', !!timeLabel);
        console.log('formRow found:', !!formRow);
        
        if (tpBody && formRow) {
          console.log('Both elements found, attempting scroll...');
          console.log('tpBody scrollTop before:', tpBody.scrollTop);
          console.log('formRow offsetTop:', formRow.offsetTop);
          
          // Scroll to align the actual Time label top with the container top
          const anchorEl = timeLabel || formRow; // prefer the Time label; fallback to row
          
          if (anchorEl) {
            const containerRect = tpBody.getBoundingClientRect();
            const anchorRect = anchorEl.getBoundingClientRect();
            const deltaTop = anchorRect.top - containerRect.top; // pixels from visible top
            const targetScrollTop = Math.max(0, tpBody.scrollTop + deltaTop - 0); // no padding
            
            console.log('containerRect.top:', containerRect.top);
            console.log('anchorRect.top:', anchorRect.top);
            console.log('deltaTop:', deltaTop);
            console.log('targetScrollTop:', targetScrollTop);
            
            tpBody.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
          } else {
            console.log('Anchor label not found, scrolling to top');
            tpBody.scrollTo({ top: 0, behavior: 'smooth' });
          }
          
          console.log('tpBody.scrollTo called');
        } else {
          console.log('Missing elements - tpBody:', !!tpBody, 'formRow:', !!formRow);
        }
      }, 300); // Increased delay to ensure calendar is fully rendered
    }
    
    function closeCalendar() {
      if (!calendarToolbar) return;
      
      // Start smooth scroll back to top when closing
      const tpBody = pop.querySelector('.tp-body');
      if (tpBody) {
        tpBody.scrollTo({ top: 0, behavior: 'smooth' });
      }
      
      // Start toolbar collapse animation
      calendarToolbar.classList.remove('calendar-slide-in');
      calendarToolbar.classList.add('calendar-slide-out');
      calendarToolbar.style.display = 'block'; // keep visible during transition

      // Trigger container shrink (popover) animation
      // rAF ensures the browser registers the class change for smooth transition
      requestAnimationFrame(() => {
        pop.classList.remove('calendar-expanded');
      });

      // When the toolbar transition ends, hide it and clean up classes
      const handleEnd = (ev) => {
        if (ev.target !== calendarToolbar) return;
        calendarToolbar.removeEventListener('transitionend', handleEnd);
        calendarToolbar.style.display = 'none';
        calendarToolbar.classList.remove('calendar-slide-out');
      };
      calendarToolbar.addEventListener('transitionend', handleEnd);

      // Fallback cleanup in case transitionend doesn't fire
      setTimeout(() => {
        try { calendarToolbar.removeEventListener('transitionend', handleEnd); } catch (_) {}
        calendarToolbar.style.display = 'none';
        calendarToolbar.classList.remove('calendar-slide-out');
      }, 600);
    }
    
    // Dropdown toggle functions
    function toggleTypeDropdown() {
      if (typeToolbar.style.display === 'none') {
        openTypeDropdown();
      } else {
        closeTypeDropdown();
      }
    }
    
    function openTypeDropdown() {
      typeToolbar.style.display = 'block';
      typeToolbar.offsetHeight; // Force reflow
      typeToolbar.classList.add('dropdown-slide-in');
    }
    
    function closeTypeDropdown() {
      if (!typeToolbar) return;
      typeToolbar.classList.remove('dropdown-slide-in');
      typeToolbar.classList.add('dropdown-slide-out');
      typeToolbar.style.display = 'block';
      
      const handleEnd = (ev) => {
        if (ev.target !== typeToolbar) return;
        typeToolbar.removeEventListener('transitionend', handleEnd);
        typeToolbar.style.display = 'none';
        typeToolbar.classList.remove('dropdown-slide-out');
      };
      typeToolbar.addEventListener('transitionend', handleEnd);
      
      setTimeout(() => {
        try { typeToolbar.removeEventListener('transitionend', handleEnd); } catch (_) {}
        typeToolbar.style.display = 'none';
        typeToolbar.classList.remove('dropdown-slide-out');
      }, 600);
    }
    
    function togglePriorityDropdown() {
      if (priorityToolbar.style.display === 'none') {
        openPriorityDropdown();
      } else {
        closePriorityDropdown();
      }
    }
    
    function openPriorityDropdown() {
      priorityToolbar.style.display = 'block';
      priorityToolbar.offsetHeight; // Force reflow
      priorityToolbar.classList.add('dropdown-slide-in');
    }
    
    function closePriorityDropdown() {
      if (!priorityToolbar) return;
      priorityToolbar.classList.remove('dropdown-slide-in');
      priorityToolbar.classList.add('dropdown-slide-out');
      priorityToolbar.style.display = 'block';
      
      const handleEnd = (ev) => {
        if (ev.target !== priorityToolbar) return;
        priorityToolbar.removeEventListener('transitionend', handleEnd);
        priorityToolbar.style.display = 'none';
        priorityToolbar.classList.remove('dropdown-slide-out');
      };
      priorityToolbar.addEventListener('transitionend', handleEnd);
      
      setTimeout(() => {
        try { priorityToolbar.removeEventListener('transitionend', handleEnd); } catch (_) {}
        priorityToolbar.style.display = 'none';
        priorityToolbar.classList.remove('dropdown-slide-out');
      }, 600);
    }
    
    // Event listeners
    // Prevent outside-click from firing when interacting with calendar UI
    calendarToolbar?.addEventListener('mousedown', (e) => e.stopPropagation());
    calendarToolbar?.addEventListener('click', (e) => e.stopPropagation());
    calendarToggle?.addEventListener('mousedown', (e) => e.stopPropagation());
    calendarToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleCalendar(); });
    calendarPrev?.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      generateCalendar();
    });
    calendarNext?.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      generateCalendar();
    });
    
    // Dropdown event listeners
    typeToggle?.addEventListener('mousedown', (e) => e.stopPropagation());
    typeToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleTypeDropdown(); });
    priorityToggle?.addEventListener('mousedown', (e) => e.stopPropagation());
    priorityToggle?.addEventListener('click', (e) => { e.stopPropagation(); togglePriorityDropdown(); });
    
    // Prevent outside-click from firing when interacting with dropdown UI
    typeToolbar?.addEventListener('mousedown', (e) => e.stopPropagation());
    typeToolbar?.addEventListener('click', (e) => e.stopPropagation());
    priorityToolbar?.addEventListener('mousedown', (e) => e.stopPropagation());
    priorityToolbar?.addEventListener('click', (e) => e.stopPropagation());
    
    // Type option selection
    typeToolbar?.addEventListener('click', (e) => {
      const option = e.target.closest('.dropdown-option');
      if (option) {
        const value = option.dataset.value;
        const text = option.textContent;
        typeInput.value = text;
        
        // Update selected state
        typeToolbar.querySelectorAll('.dropdown-option').forEach(btn => btn.classList.remove('selected'));
        option.classList.add('selected');
        
        closeTypeDropdown();
      }
    });
    
    // Priority option selection
    priorityToolbar?.addEventListener('click', (e) => {
      const option = e.target.closest('.dropdown-option');
      if (option) {
        const value = option.dataset.value;
        const text = option.textContent;
        priorityInput.value = text;
        
        // Update selected state
        priorityToolbar.querySelectorAll('.dropdown-option').forEach(btn => btn.classList.remove('selected'));
        option.classList.add('selected');
        
        closePriorityDropdown();
      }
    });
    
    // Set initial selected states
    const phoneCallOption = typeToolbar?.querySelector('[data-value="phone-call"]');
    const mediumOption = priorityToolbar?.querySelector('[data-value="medium"]');
    if (phoneCallOption) phoneCallOption.classList.add('selected');
    if (mediumOption) mediumOption.classList.add('selected');
    
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const type = String(fd.get('type') || '').trim();
      const priority = String(fd.get('priority') || '').trim();
      const dueDate = String(fd.get('dueDate') || '').trim();
      const dueTime = String(fd.get('dueTime') || '').trim();
      const notes = String(fd.get('notes') || '').trim();
      if (!type || !priority || !dueDate || !dueTime) return;
      const title = buildTaskTitle(type, fullName);
      const newTask = {
        id: 'task_' + Date.now(),
        title,
        contact: fullName,
        contactId: c.id || '',
        account: company,
        type,
        priority,
        dueDate,
        dueTime,
        status: 'pending',
        notes,
        createdAt: Date.now()
      };
      try {
        const key = 'userTasks';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift(newTask);
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (_) { /* noop */ }

      // Save to Firebase
      try {
        const db = window.firebaseDB;
        if (db) {
          await db.collection('tasks').add({
            ...newTask,
            timestamp: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || Date.now()
          });
        }
      } catch (err) {
        console.warn('Failed to save task to Firebase:', err);
      }

      try { window.crm?.showToast && window.crm.showToast('Task created'); } catch (_) {}
      // Notify other components
      try {
        // Update Today's Tasks widget immediately
        if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
          window.crm.loadTodaysTasks();
        }
        // Notify Tasks page (and any listeners) to refresh its list from localStorage
        window.dispatchEvent(new CustomEvent('tasksUpdated', { detail: { source: 'contact-detail', task: newTask } }));
      } catch (_) {}
      closeContactTaskPopover();
    });

    // Close on outside click / escape
    // Close on outside click / escape (ignore calendar toolbar/toggle)
    const outside = (ev) => {
      const t = ev.target;
      if (calendarToolbar && (calendarToolbar.contains(t) || t === calendarToolbar)) return;
      if (calendarToggle && (t === calendarToggle || calendarToggle.contains(t))) return;
      if (!pop.contains(t) && t !== anchorEl) { cleanup(); }
    };
    const onEsc = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); cleanup(); } };
    setTimeout(() => {
      document.addEventListener('mousedown', outside);
      document.addEventListener('keydown', onEsc);
    }, 0);
    function cleanup(){
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', onEsc);
      closeContactTaskPopover();
    }
  }

  function closeContactTaskPopover(){
    const ex = document.querySelector('.task-popover');
    if (ex) {
      // Remove show class for dropdown animation
      ex.classList.remove('--show');
      setTimeout(() => {
        if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
      }, 400); // Match the 400ms transition duration
    }
  }

  function buildTaskTitle(type, name){
    const map = {
      'phone-call': 'Call',
      'manual-email': 'Email',
      'auto-email': 'Auto Email',
      'follow-up': 'Follow-up',
      'demo': 'Demo',
      'custom-task': 'Task'
    };
    const label = map[type] || 'Task';
    return `${label} — ${name}`;
  }

  function getNextBusinessDayISO(){
    const d = new Date();
    const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    console.log('Current date:', d.toDateString(), 'Day of week:', dayOfWeek);
    
    // If today is Friday (5), next business day is Monday (+3 days)
    if (dayOfWeek === 5) {
      d.setDate(d.getDate() + 3);
    }
    // If today is Saturday (6), next business day is Monday (+2 days)
    else if (dayOfWeek === 6) {
      d.setDate(d.getDate() + 2);
    }
    // If today is Sunday (0), next business day is Monday (+1 day)
    else if (dayOfWeek === 0) {
      d.setDate(d.getDate() + 1);
    }
    // If today is Monday-Thursday (1-4), next business day is tomorrow (+1 day)
    else {
      d.setDate(d.getDate() + 1);
    }
    
    console.log('Next business day:', d.toDateString());
    return d.toISOString().split('T')[0];
  }

  function renderExistingTasksForContact(contactId, fullName){
    let tasks = [];
    try {
      const all = JSON.parse(localStorage.getItem('userTasks') || '[]');
      tasks = all.filter(t => (t.contactId && contactId && t.contactId === contactId) || (t.contact && fullName && String(t.contact).trim() === fullName));
    } catch (_) { tasks = []; }
    if (!tasks.length) return '<div class="tp-footer tp-empty">No existing tasks for this contact.</div>';
    const items = tasks.slice(0, 5).map(t => {
      const status = (t.status || 'pending').toLowerCase();
      const badge = status === 'completed' ? 'completed' : 'pending';
      const due = t.dueDate ? `<span class="tp-task-due">Due ${escapeHtml(t.dueDate)}</span>` : '';
      return `<div class="tp-task"><span class="tp-task-title">${escapeHtml(t.title || 'Task')}</span><span class="tp-badge ${badge}">${badge}</span>${due}</div>`;
    }).join('');
    return `<div class="tp-footer"><div class="tp-subtitle">Current tasks for ${escapeHtml(fullName)}</div>${items}</div>`;
  }

  // Normalize phone numbers to formatted display format (not E.164)
  // Enhanced phone number parsing with extension support
  // Examples:
  //  - "9728342317" => "+1 (972) 834-2317"
  //  - "972-834-2317" => "+1 (972) 834-2317"
  //  - "+1 (972) 834-2317" => "+1 (972) 834-2317"
  //  - "+1 337-233-0464 ext 10117" => "+1 (337) 233-0464 ext. 10117"
  //  - "+447911123456" stays as "+447911123456"
  function normalizePhone(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return '';
    
    // Parse phone number and extension
    const parsed = parsePhoneWithExtension(raw);
    if (!parsed.number) return '';
    
    // Format the number part
    let formattedNumber = '';
    const cleaned = parsed.number.replace(/[^\d]/g, '');
    
    // Always display US numbers with +1 prefix and formatting
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      formattedNumber = `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      formattedNumber = `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    } else if (/^\+/.test(String(parsed.number))) {
      // International number - keep as-is
      formattedNumber = parsed.number;
    } else if (cleaned.length >= 8) {
      // International without +, add it
      formattedNumber = '+' + cleaned;
    } else {
      // Fallback: return original if we can't format
      return raw;
    }
    
    // Add extension if present (use consistent format with period)
    if (parsed.extension) {
      return `${formattedNumber} ext. ${parsed.extension}`;
    }
    
    return formattedNumber;
  }

  // Parse phone number and extension from various formats
  function parsePhoneWithExtension(input) {
    const raw = (input || '').toString().trim();
    if (!raw) return { number: '', extension: '' };
    
    // Common extension patterns
    const extensionPatterns = [
      /ext\.?\s*(\d+)/i,
      /extension\s*(\d+)/i,
      /x\.?\s*(\d+)/i,
      /#\s*(\d+)/i,
      /\s+(\d{3,6})\s*$/  // 3-6 digits at the end (common extension length)
    ];
    
    let number = raw;
    let extension = '';
    
    // Try to find extension using various patterns
    for (const pattern of extensionPatterns) {
      const match = number.match(pattern);
      if (match) {
        extension = match[1];
        number = number.replace(pattern, '').trim();
        break;
      }
    }
    
    return { number, extension };
  }

  // Check if user is currently typing an extension
  function isTypingExtension(value, cursorPos) {
    const text = (value || '').toLowerCase();
    const cursor = cursorPos || 0;
    
    // Check if cursor is after common extension keywords
    const extensionKeywords = ['ext', 'extension', 'x', '#'];
    for (const keyword of extensionKeywords) {
      const keywordPos = text.lastIndexOf(keyword, cursor - 1);
      if (keywordPos !== -1 && keywordPos + keyword.length <= cursor) {
        return true;
      }
    }
    
    // Check if we're at the end and typing digits after a space (common extension pattern)
    const trimmed = value.trim();
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace !== -1 && cursor > lastSpace) {
      const afterSpace = trimmed.substring(lastSpace + 1);
      // If we have 3+ digits after the last space, likely an extension
      if (/^\d{3,}$/.test(afterSpace)) {
        return true;
      }
    }
    
    // Check if we have a complete phone number and user is adding more digits
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 10) {
      // If we have 10+ digits and user is still typing, might be extension
      const phonePart = value.substring(0, value.lastIndexOf(digits[digits.length - 1]) + 1);
      const remaining = value.substring(phonePart.length).trim();
      
      // If there's remaining text that looks like an extension
      if (remaining && /^[\s]*[\d]+$/.test(remaining)) {
        return true;
      }
    }
    
    return false;
  }

  // Format phone number for input (less aggressive than display formatting)
  function formatPhoneNumberForInput(value) {
    if (!value) return '';
    
    // Parse to separate number and extension
    const parsed = parsePhoneWithExtension(value);
    if (!parsed.number) return value;
    
    // Format only the main number part
    const cleaned = parsed.number.replace(/\D/g, '');
    let formattedNumber = '';
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      formattedNumber = `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      formattedNumber = `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length >= 8) {
      // For international numbers, just clean up formatting
      formattedNumber = parsed.number;
    } else {
      // Too short, return as-is
      return value;
    }
    
    // Add extension back if present
    if (parsed.extension) {
      return `${formattedNumber} ext. ${parsed.extension}`;
    }
    
    return formattedNumber;
  }

  // Format phone numbers for display with extension support
  function formatPhoneForDisplay(phone) {
    if (!phone) return '';
    
    // Parse phone number and extension
    const parsed = parsePhoneWithExtension(phone);
    if (!parsed.number) return phone;
    
    // Format the main number
    let formattedNumber = '';
    const cleaned = parsed.number.replace(/\D/g, '');
    
    // Always display US numbers with +1 prefix
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      formattedNumber = `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      formattedNumber = `+1 (${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    } else if (/^\+/.test(String(parsed.number))) {
      // International number - keep as-is but clean up formatting
      const digits = parsed.number.replace(/\D/g, '');
      if (digits.length >= 8) {
        formattedNumber = parsed.number;
      } else {
        formattedNumber = parsed.number;
      }
    } else {
      // Fallback: return original if we can't format
      formattedNumber = parsed.number;
    }
    
    // Add extension if present
    if (parsed.extension) {
      return `${formattedNumber} ext. ${parsed.extension}`;
    }
    
    return formattedNumber;
  }

  async function showContactDetail(contactId, tempContact) {
    if (!initDomRefs()) return;
    
    // Clear previous contact's linked account state to prevent data leakage
    state._linkedAccountId = null;
    
    // Find contact in people data, or use provided temporary contact
    let contact = null;
    if (tempContact && typeof tempContact === 'object') {
      contact = tempContact;
      console.log('[ContactDetail] Using provided temporary contact:', contact);
      console.log('[ContactDetail] Contact fields:', {
        email: contact.email,
        phone: contact.workDirectPhone || contact.mobile || contact.otherPhone || contact.phone,
        mobile: contact.mobile,
        companyName: contact.companyName,
        title: contact.title,
        city: contact.city,
        state: contact.state,
        industry: contact.industry
      });
      console.log('[ContactDetail] Full contact object:', JSON.stringify(contact, null, 2));
    } else {
      contact = findContactById(contactId);
      if (!contact) {
        console.log('[ContactDetail] Contact not found in cache, trying calls data for:', contactId);
        // Try to get contact from calls data as fallback
        if (window.callsModule && window.callsModule.getCallContactById) {
          contact = window.callsModule.getCallContactById(contactId);
          if (contact) {
            console.log('[ContactDetail] Found contact in calls data:', contact);
          }
        }
      }
    }
    
    // Ensure contact has an ID
    if (contact && !contact.id && contactId) {
      contact.id = contactId;
    }
    
    if (!contact) {
      console.log('[ContactDetail] Contact not found in cache, trying Firestore for:', contactId);
      // Try to load from Firestore as final fallback
      if (window.firebaseDB && contactId && !contactId.startsWith('call_contact_')) {
        try {
          window.firebaseDB.collection('contacts').doc(contactId).get().then((doc) => {
            if (doc.exists) {
              const data = doc.data();
              const firestoreContact = {
                id: contactId,
                ...data
              };
              console.log('[ContactDetail] Loaded contact from Firestore:', firestoreContact);
              // Show the contact detail with the Firestore data
              showContactDetail(contactId, firestoreContact);
            } else {
              console.error('[ContactDetail] Contact not found in Firestore:', contactId);
            }
          }).catch((error) => {
            console.error('[ContactDetail] Error loading from Firestore:', error);
          });
          return; // Exit early, will be handled by the async callback
        } catch (error) {
          console.error('[ContactDetail] Error accessing Firestore:', error);
        }
      }
      console.error('Contact not found:', contactId);
      return;
    }

    // Ensure the new contact has a stable id immediately for downstream actions (lists, notes)
    if (!contact.id && contactId) contact.id = contactId;
    state.currentContact = contact;
    
    // Debug logging for contact ID availability
    console.log('[Contact Detail] Contact loaded:', {
      contactId: contact.id,
      contactName: contact.firstName + ' ' + contact.lastName,
      hasId: !!contact.id,
      stateContactId: state.currentContact?.id
    });
    // Broadcast that contact detail is loaded so dependent widgets can rebind
    try { document.dispatchEvent(new CustomEvent('pc:contact-loaded', { detail: { id: contact.id } })); } catch(_) {}
    
    // Enable the "Add to list" button now that contact is fully loaded
    // Using requestAnimationFrame for smoother UI update (runs on next paint)
    requestAnimationFrame(() => {
      const addToListBtn = document.getElementById('add-contact-to-list');
      if (addToListBtn) {
        addToListBtn.removeAttribute('disabled');
        addToListBtn.style.opacity = '1';
        addToListBtn.title = 'Add to list';
        console.log('[ContactDetail] Add to list button enabled');
      }
    });
    
    // Clear phone widget context completely when opening contact detail page
    // This prevents any previous contact/company info from leaking into future calls
    clearPhoneWidgetContext();
    
    // Add event listener for company phone clicks with strict company-mode flow
    // This implements the AI-suggested approach for Contact Detail company phone calls
    try {
      const contactDetailView = document.getElementById('contact-detail-view');
      if (contactDetailView) {
        // Reset flag to allow reattachment after module reload
        contactDetailView._companyPhoneHandlerAdded = false;
        contactDetailView._contactPhoneHandlerAdded = false;
        
        if (!contactDetailView._companyPhoneHandlerAdded) {
          contactDetailView._companyPhoneHandlerAdded = true;
          const companyPhoneHandler = (e) => {
            // Check if clicking on a company phone number using the exact AI-suggested selector
            const phoneElement = e.target.closest('#contact-detail-view .info-row[data-field="companyPhone"] .info-value-text');
            if (phoneElement && window.Widgets && typeof window.Widgets.setCallContext === 'function') {
              handleCompanyPhoneClick(phoneElement, contact);
            }
          };
          contactDetailView.addEventListener('click', companyPhoneHandler);
          eventListeners.push({ type: 'click', handler: companyPhoneHandler, target: contactDetailView });
        }
        
        if (!contactDetailView._contactPhoneHandlerAdded) {
          contactDetailView._contactPhoneHandlerAdded = true;
          const contactPhoneHandler = (e) => {
            // Check if clicking on a contact phone number
            const phoneElement = e.target.closest('#contact-detail-view .info-row[data-field="phone"] .info-value-text');
            if (phoneElement && window.Widgets && typeof window.Widgets.setCallContext === 'function') {
              handleContactPhoneClick(phoneElement, contact);
            }
          };
          contactDetailView.addEventListener('click', contactPhoneHandler);
          eventListeners.push({ type: 'click', handler: contactPhoneHandler, target: contactDetailView });
        }
      }
    } catch(_) {}
    
    // Ensure per-contact event handlers are rebound on each view
    // This avoids stale guards after navigating to other pages (e.g., account details)
    state._contactDetailEventsAttached = false;
    
    // Attach contact detail events after DOM is ready
    // Using requestAnimationFrame ensures DOM is painted before attaching events
    requestAnimationFrame(() => {
      if (!state._contactDetailEventsAttached && state.currentContact?.id) {
        attachContactDetailEvents();
      }
    });
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
    // Seed preferred phone selection from persisted value so the primary phone row reflects it immediately
    try { state.preferredPhoneField = String(contact.preferredPhoneField || '').trim(); } catch(_) { state.preferredPhoneField = ''; }
    await renderContactDetail();
    
    // Setup energy update listener for real-time sync with Health Widget
    try {
      if (window.ContactDetail && window.ContactDetail.setupEnergyUpdateListener) {
        window.ContactDetail.setupEnergyUpdateListener();
      }
    } catch (_) {}
    
    // Setup contact created listener for cases where new contacts are created from Account Details
    try {
      setupContactCreatedListener();
    } catch (_) {}
    
    // Setup contact updated listener to re-attach event handlers after editing
    if (!document._contactDetailUpdatedBound) {
      document._contactDetailUpdatedBound = true;
      try {
        document.addEventListener('pc:contact-updated', (e) => {
          // Re-attach event handlers after contact is updated
          setTimeout(() => {
            if (!state._contactDetailEventsAttached) {
              attachContactDetailEvents();
            }
          }, 100);
        });
      } catch (_) {}
    }
    
    // Listen for new calls to this contact
    if (!document._contactDetailCallLoggedBound) {
      document._contactDetailCallLoggedBound = true;
      try {
        document.addEventListener('pc:call-logged', (event) => {
          const callData = event.detail;
          const currentContactId = state.currentContact?.id;
          
          if (currentContactId && (callData.contactId === currentContactId || 
                                   callData.call?.contactId === currentContactId)) {
            console.log('[ContactDetail] Call logged for this contact, refreshing activities');
            
            // Immediately refresh recent calls section
            if (window.ActivityManager && typeof window.ActivityManager.renderActivities === 'function') {
              window.ActivityManager.renderActivities(
                'contact-activity-timeline', 
                'contact', 
                currentContactId,
                true // force refresh
              );
            }
          }
        });
      } catch (_) { /* noop */ }
    }
    
    // Setup contact loaded listener to ensure event handlers are attached
    if (!document._contactDetailLoadedBound) {
      document._contactDetailLoadedBound = true;
      try {
        document.addEventListener('pc:contact-loaded', (e) => {
          // Re-attach event handlers when contact is loaded
          setTimeout(() => {
            if (!state._contactDetailEventsAttached) {
              attachContactDetailEvents();
            }
          }, 100);
        });
      } catch (_) {}
    }
    
    // Add click handler to persist default phone when star button is clicked
    const starButton = document.querySelector('.star-button');
    if (starButton) {
      starButton.addEventListener('click', () => {
        const preferredPhoneField = state.preferredPhoneField;
        if (preferredPhoneField) {
          try {
            localStorage.setItem('preferredPhoneField', preferredPhoneField);
          } catch (_) { /* noop */ }
        }
      });
    }
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
    console.log('[ContactDetail] findContactById called with:', contactId);
    console.log('[ContactDetail] Prefetched contact available:', !!window._prefetchedContactForDetail);
    
    // Use prefetched contact if provided by navigation source (avoids extra hops)
    try {
      if (window._prefetchedContactForDetail && window._prefetchedContactForDetail.id === contactId) {
        const c = window._prefetchedContactForDetail;
        window._prefetchedContactForDetail = null; // consume
        console.log('[ContactDetail] Using prefetched contact data:', c);
        return c;
      } else if (window._prefetchedContactForDetail) {
        console.log('[ContactDetail] Prefetched contact ID mismatch. Prefetched:', window._prefetchedContactForDetail.id, 'Looking for:', contactId);
      }
    } catch (error) {
      console.error('[ContactDetail] Error with prefetched contact:', error);
    }
    
    // Access people.js data if available
    if (window.getPeopleData) {
      const peopleData = window.getPeopleData();
      const found = peopleData.find(c => c.id === contactId);
      if (found) {
        return found;
      }
    }
    
    // If not found in people data cache, try to find in calls data
    // This handles cases where contacts are accessed from calls page
    if (window.callsModule && window.callsModule.getCallContactById) {
      const callContact = window.callsModule.getCallContactById(contactId);
      if (callContact) {
        return callContact;
      }
    }
    
    // Fallback: try to find by name in people data (for generated contact IDs)
    if (contactId && contactId.startsWith('call_contact_') && window.getPeopleData) {
      const peopleData = window.getPeopleData();
      // Extract contact name from the call data if possible
      // This is a best-effort fallback for generated contact IDs
      console.log('[ContactDetail] Generated contact ID detected, trying fallback lookup');
    }
    
    // Final fallback: try to load from Firestore if available
    if (window.firebaseDB && contactId && !contactId.startsWith('call_contact_')) {
      console.log('[ContactDetail] Trying to load contact from Firestore:', contactId);
      // This is async, so we'll handle it in the calling function
      // For now, return null and let the calling function handle the async load
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

  function getCompanyPhone(contact) {
    if (!contact) return '';
    
    // First try to get from contact's account data if available
    if (contact.account && (contact.account.companyPhone || contact.account.phone)) {
      return contact.account.companyPhone || contact.account.phone;
    }
    
    // If no direct account data, try to look up the account by company name
    if (contact.companyName && typeof window.getAccountsData === 'function') {
      try {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(acc => {
          if (!acc.accountName || !contact.companyName) return false;
          const accName = acc.accountName.toLowerCase().trim();
          const compName = contact.companyName.toLowerCase().trim();
          return accName === compName || accName.includes(compName) || compName.includes(accName);
        });
        return account ? (account.companyPhone || account.phone || '') : '';
      } catch (e) {
        console.warn('Failed to lookup company phone:', e);
        return '';
      }
    }
    
    return '';
  }

  // Helper to safely get accounts data even if accounts.js hasn't loaded yet
  // Helper to safely get accounts data - now simplified with background loader
  async function getAccountsDataSafe() {
    const log = window.console.log.bind(window.console); // Bypass log silencing
    
    // Priority 1: Background loader (most reliable data)
    if (window.BackgroundAccountsLoader) {
      const data = window.BackgroundAccountsLoader.getAccountsData();
      if (data && data.length > 0) {
        log('[ContactDetail] Got', data.length, 'accounts from BackgroundAccountsLoader');
        return data;
      }
    }
    
    // Priority 2: window.getAccountsData (fallback)
    if (typeof window.getAccountsData === 'function') {
      const data = window.getAccountsData() || [];
      if (data.length > 0) {
        log('[ContactDetail] Got', data.length, 'accounts from window.getAccountsData');
        return data;
      }
    }
    
    // Priority 3: Fallback to CacheManager (shouldn't happen with background loader)
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('accounts');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          log('[ContactDetail] Got', cached.length, 'accounts from CacheManager');
          return cached;
        }
      } catch (err) {
        window.console.warn('[ContactDetail] Cache read failed:', err);
      }
    }
    
    window.console.warn('[ContactDetail] No accounts data available');
    return [];
  }

  // Find the associated account for this contact (by id or normalized company name)
  async function findAssociatedAccount(contact, maxRetries = 10) {
    try {
      console.log('[ContactDetail] findAssociatedAccount called for contact:', contact.name || contact.firstName + ' ' + contact.lastName);
      console.log('[ContactDetail] Contact company:', contact.companyName || contact.accountName);
      console.log('[ContactDetail] Contact accountId:', contact.accountId || contact.account_id);
      
      let accounts = [];
      
      // Try getting accounts with retry logic
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        accounts = await getAccountsDataSafe();
        
        if (accounts.length > 0) {
          console.log('[ContactDetail] Got', accounts.length, 'accounts on attempt', attempt + 1);
          break;
        }
        
        // Wait before retrying (100ms, 200ms, 400ms, 800ms, 1600ms... exponential backoff)
        if (attempt < maxRetries - 1) {
          const delay = 100 * Math.pow(2, attempt);
          console.log('[ContactDetail] No accounts yet, retrying in', delay, 'ms...');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      if (!contact || accounts.length === 0) {
        console.warn('[ContactDetail] No accounts available after', maxRetries, 'retries, waiting for accounts-loaded event...');
        
        // Last resort: wait for accounts-loaded event
        await new Promise(resolve => {
          const handler = (e) => {
            document.removeEventListener('pc:accounts-loaded', handler);
            resolve();
          };
          document.addEventListener('pc:accounts-loaded', handler);
          
          // Timeout after 5 seconds
          setTimeout(() => {
            document.removeEventListener('pc:accounts-loaded', handler);
            resolve();
          }, 5000);
        });
        
        // Try one more time after the event
        accounts = await getAccountsDataSafe();
        
        if (accounts.length === 0) {
          console.warn('[ContactDetail] Still no accounts available after waiting for event');
          return null;
        }
      }
      
      // Prefer explicit accountId
      const accountId = contact.accountId || contact.account_id || '';
      if (accountId) {
        console.log('[ContactDetail] Looking for account by ID:', accountId);
        const m = accounts.find(a => a.id === accountId);
        if (m) {
          console.log('[ContactDetail] Found account by ID:', m.accountName || m.name);
          console.log('[ContactDetail] Account website:', m.website || m.domain);
          return m;
        } else {
          console.log('[ContactDetail] No account found with ID:', accountId);
        }
      }
      
      // Fallback to company name with safer fuzzy matching (token/Jaccard)
      const STOP = new Set([
        'inc','llc','ltd','corp','corporation','company','co','incorporated',
        'group','international','services','solutions','systems','industries',
        'manufacturing','electric','electrical','the','and','of','usa','us'
      ]);
      const norm = (s) => String(s || '').toLowerCase()
        .replace(/\(usa\)|\(u\.s\.a\.\)|\(us\)/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const toTokens = (s) => Array.from(new Set(
        norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w))
      ));
      
      const contactName = contact.companyName || contact.accountName || '';
      const key = norm(contactName);
      
      if (!key) {
        console.log('[ContactDetail] No company name to match');
        return null;
      }
      
      console.log('[ContactDetail] Searching for account matching:', contactName, '(normalized:', key + ')');
      console.log('[ContactDetail] Available accounts sample:', accounts.slice(0, 3).map(a => ({
        id: a.id,
        name: a.accountName || a.name,
        website: a.website || a.domain
      })));
      
      // Try exact match first
      let match = accounts.find(a => {
        const accountName = norm(a.accountName || a.name || a.companyName || '');
        return accountName === key;
      });
      
      // If no exact match, try token/Jaccard fallback
      if (!match) {
        const cTok = toTokens(contactName);
        match = accounts.find(a => {
          const aTok = toTokens(a.accountName || a.name || a.companyName || '');
          if (!cTok.length || !aTok.length) return false;
          const inter = aTok.filter(t => cTok.includes(t));
          const jaccard = inter.length / (new Set([...aTok, ...cTok]).size);
          return inter.length >= 2 || jaccard >= 0.5;
        });
        if (match) {
          console.log('[ContactDetail] Found account by token/Jaccard match:', match.accountName || match.name);
          console.log('[ContactDetail] Matched account website:', match.website || match.domain);
        }
      } else {
        console.log('[ContactDetail] Found account by exact match:', match.accountName || match.name);
        console.log('[ContactDetail] Matched account website:', match.website || match.domain);
      }
      
      if (!match) {
        console.warn('[ContactDetail] No account match for company:', contactName);
        console.log('[ContactDetail] Searched through', accounts.length, 'accounts');
        // Try one more fuzzy search - look for ANY words in common
        const contactWords = key.split(' ').filter(w => w.length >= 3);
        if (contactWords.length > 0) {
          match = accounts.find(a => {
            const accountName = norm(a.accountName || a.name || a.companyName || '');
            const accountWords = accountName.split(' ').filter(w => w.length >= 3);
            // Match if ANY word appears in both
            return contactWords.some(cw => accountWords.some(aw => aw.includes(cw) || cw.includes(aw)));
          });
          if (match) {
            window.console.log('[ContactDetail] Found account by word matching:', match.accountName || match.name);
          }
        }
        
        if (!match) {
          // Log first 10 account names for debugging
          const sampleNames = accounts.slice(0, 10).map(a => a.accountName || a.name).join(', ');
          window.console.log('[ContactDetail] Sample account names:', sampleNames, '...');
          window.console.log('[ContactDetail] Total accounts available:', accounts.length);
        }
      }
      
      return match || null;
    } catch (err) {
      console.error('[ContactDetail] Error finding account:', err);
      return null;
    }
  }

  function promotePageContent(){
    // Apply performance CSS to contact page-content
    if (document.getElementById('contact-page-perf-styles')) return;
    const style=document.createElement('style');
    style.id='contact-page-perf-styles';
    style.textContent=`
      #people-page .page-content {
        will-change: transform;
        transform: translateZ(0);
        backface-visibility: hidden;
        contain: paint layout;
        overflow-anchor: none;
      }
    `;
    document.head.appendChild(style);
  }

  async function renderContactDetail() {
    if (!state.currentContact || !els.mainContent) return;

    const contact = state.currentContact;
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown Contact';
    const company = contact.companyName || '';
    const title = contact.title || '';
    const email = contact.email || '';
    const phone = (function(){ try { const d = getPrimaryPhoneData(contact); return d && d.value ? d.value : ''; } catch(_) { return contact.workDirectPhone || contact.mobile || contact.otherPhone || ''; } })();
    const city = contact.city || contact.locationCity || '';
    const stateVal = contact.state || contact.locationState || '';
    const industry = contact.industry || contact.companyIndustry || '';
    const linkedAccount = await findAssociatedAccount(contact);
    // Cache for saves
    try { state._linkedAccountId = linkedAccount?.id || null; } catch (_) {}
    const electricitySupplier = linkedAccount?.electricitySupplier || '';
    const annualUsage = linkedAccount?.annualUsage || linkedAccount?.annual_usage || '';
    const annualUsageFormatted = annualUsage ? String(annualUsage).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
    let currentRate = linkedAccount?.currentRate || linkedAccount?.current_rate || '';
    const contractEndDate = linkedAccount?.contractEndDate || linkedAccount?.contract_end_date || '';
    const contractEndDateFormatted = contractEndDate ? toMDY(contractEndDate) : '';
    // Normalize currentRate like .089 -> 0.089
    if (/^\.\d+$/.test(String(currentRate))) currentRate = '0' + currentRate;
    // Ensure header styles (divider, layout) are present
    injectContactHeaderStyles();
    injectTaskPopoverStyles();
    // Ensure recent calls styles are present
    injectRecentCallsStyles();

    // Header (styled same as page header)
    const headerHtml = `
      <div id="contact-detail-header" class="page-header" data-contact-id="${contact.id || ''}">
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
                <div class="contact-subtitle">${title ? escapeHtml(title) : ''}${title && company ? ' at ' : ''}${company ? `<a href="#account-details" class="company-link" id="contact-company-link" title="View account details" data-account-id="${escapeHtml(linkedAccount?.id || '')}" data-account-name="${escapeHtml(company)}">${escapeHtml(company)}</a>` : ''}</div>
              </div>
              <button class="quick-action-btn website-header-btn" data-action="website" title="Visit website" aria-label="Visit website">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </button>
              <button class="quick-action-btn linkedin-header-btn" data-action="linkedin">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                  <rect x="2" y="9" width="4" height="12"/>
                  <circle cx="4" cy="4" r="2"/>
                </svg>
              </button>
              <span class="header-action-divider" aria-hidden="true"></span>
              <div class="list-seq-group">
                <button class="quick-action-btn list-header-btn" id="add-contact-to-list" title="Loading contact..." aria-label="Add to list" aria-haspopup="dialog" disabled style="opacity: 0.6;">
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polygon points="7 4 20 12 7 20 7 4"></polygon>
                  </svg>
                </button>
                <button class="quick-action-btn list-header-btn" id="open-contact-task-popover" title="Tasks" aria-label="Tasks" aria-haspopup="dialog">
                  <!-- Tasks icon (same as left nav) -->
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <polyline points="9,11 12,14 22,4"></polyline>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
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
                <button type="button" class="widget-item" data-widget="lusha" title="Prospect" aria-label="Prospect">
                  <svg width="16" height="16" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
                    <path d="M46.117,23.081l-0.995-0.04H45.12C34.243,22.613,25.387,13.757,24.959,2.88l-0.04-0.996	C24.9,1.39,24.494,1,24,1s-0.9,0.39-0.919,0.883l-0.04,0.996c-0.429,10.877-9.285,19.733-20.163,20.162l-0.995,0.04	C1.39,23.1,1,23.506,1,24s0.39,0.9,0.884,0.919l0.995,0.039c10.877,0.43,19.733,9.286,20.162,20.163l0.04,0.996	C23.1,46.61,23.506,47,24,47s0.9-0.39,0.919-0.883l0.04-0.996c0.429-10.877,9.285-19.733,20.162-20.163l0.995-0.039	C46.61,24.9,47,24.494,47,24S46.61,23.1,46.117,23.081z"/>
                  </svg>
                </button>
                <button type="button" class="widget-item" data-widget="maps" title="Google Maps" aria-label="Google Maps">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </button>
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
                    <path d="M4 4h12a2 2 0 0 1 2 2v14l-4 4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
                    <path d="M14 20v-4a2 2 0 0 1 2-2h4"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const bodyHtml = `
      <div id="contact-detail-view" class="contact-detail" data-contact-id="${contact.id || ''}">
        <div class="contact-info-section">
          <h3 class="section-title">Contact Information</h3>
          <div class="info-grid">
            ${renderEmailRow('EMAIL', 'email', email, contact.emailStatus)}
            ${renderPhoneRow(contact)}
            ${renderInfoRow('COMPANY PHONE', 'companyPhone', getCompanyPhone(contact))}
            ${renderInfoRow('CITY', 'city', city)}
            ${renderInfoRow('STATE', 'state', stateVal)}
            ${renderInfoRow('INDUSTRY', 'industry', industry)}
            ${renderInfoRow('SENIORITY', 'seniority', contact.seniority || '')}
            ${renderInfoRow('DEPARTMENT', 'department', contact.department || '')}
          </div>
        </div>

        ${linkedAccount ? `
        <div class="contact-info-section">
          <h3 class="section-title">Energy & Contract</h3>
          <div class="info-grid" id="contact-energy-grid">
            <div class="info-row"><div class="info-label">ELECTRICITY SUPPLIER</div><div class="info-value"><div class="info-value-wrap" data-field="electricitySupplier"><span class="info-value-text">${escapeHtml(electricitySupplier) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button><button class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button><button class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button></div></div></div></div>
            <div class="info-row"><div class="info-label">ANNUAL USAGE</div><div class="info-value"><div class="info-value-wrap" data-field="annualUsage"><span class="info-value-text">${escapeHtml(annualUsageFormatted) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button><button class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button><button class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button></div></div></div></div>
            <div class="info-row"><div class="info-label">CURRENT RATE ($/kWh)</div><div class="info-value"><div class="info-value-wrap" data-field="currentRate"><span class="info-value-text">${escapeHtml(currentRate) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button><button class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button><button class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button></div></div></div></div>
            <div class="info-row"><div class="info-label">CONTRACT END DATE</div><div class="info-value"><div class="info-value-wrap" data-field="contractEndDate"><span class="info-value-text">${escapeHtml(contractEndDateFormatted) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button><button class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button><button class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button></div></div></div></div>
          </div>
        </div>
        
        <div class="contact-info-section">
          <h3 class="section-title">Service Addresses</h3>
          <div class="info-grid" id="contact-service-addresses-grid">
            ${(linkedAccount.serviceAddresses && Array.isArray(linkedAccount.serviceAddresses) && linkedAccount.serviceAddresses.length > 0) ? linkedAccount.serviceAddresses.map((sa, idx) => `
              <div class="info-row"><div class="info-label">${sa.isPrimary ? 'PRIMARY ADDRESS' : 'SERVICE ADDRESS'}</div><div class="info-value-wrap" data-field="serviceAddress_${idx}" data-address-index="${idx}" style="width: 350px;"><span class="info-value-text">${escapeHtml(sa.address) || '--'}</span><div class="info-actions"><button class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button><button class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button><button class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button></div></div></div>
            `).join('') : ''}
            <div class="info-row">
              <div class="info-label" style="grid-column: span 2;">
                <button class="btn-text-bordered" id="contact-add-service-address" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; margin-top: 8px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Service Address
                </button>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="contact-info-section" id="contact-recent-calls">
          <div class="rc-header">
            <h3 class="section-title">Recent Calls</h3>
            <div class="rc-pager" id="contact-rc-pager" style="display:none">
              <button class="rc-page-btn" id="rc-prev" aria-label="Previous page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>
              </button>
              <div class="rc-page-info" id="rc-info">1 of 1</div>
              <button class="rc-page-btn" id="rc-next" aria-label="Next page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
              </button>
            </div>
          </div>
          <div class="rc-list" id="contact-recent-calls-list">
            <div class="rc-empty">Loading recent calls…</div>
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
          <div class="activity-pagination" id="contact-activity-pagination" style="display: none;">
            <button class="activity-pagination-btn" id="contact-activity-prev" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </button>
            <div class="activity-pagination-info" id="contact-activity-info">1 of 1</div>
            <button class="activity-pagination-btn" id="contact-activity-next" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
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
    // Delegate insights button clicks to ensure it works across rerenders
    try {
      const rcList = document.getElementById('contact-recent-calls-list');
      if (rcList && !rcList._delegated) {
        rcList.addEventListener('click', (e) => {
          const btn = e.target && e.target.closest ? e.target.closest('.rc-insights') : null;
          if (!btn) return;
          e.preventDefault(); e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const call = (state._rcCalls || []).find(x => String(x.id||x.twilioSid||x.callSid||'') === String(id));
          if (!call) return;
          if (btn.classList.contains('not-processed')) {
            const callSid = call.id || call.twilioSid || call.callSid;
            const recordingSid = call.recordingSid || call.recording_id;
            triggerContactCI(callSid, recordingSid, btn);
            return;
          }
          toggleRcDetails(btn, call);
        });
        rcList._delegated = '1';
      }
    } catch(_) {}
    startRecentCallsLiveHooks();
    
    // Add periodic refresh to ensure eye icons update when recordings are ready
    let refreshInterval = null;
    let lastRefreshTime = 0;
    const startPeriodicRefresh = () => {
      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(() => {
        // Only refresh if we're not already refreshing, not scrolling, no insights are open, and enough time has passed
        const hasOpenInsights = state._rcOpenIds && state._rcOpenIds.size > 0;
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTime;
        
        if (!state._rcReloadInFlight && !state._rcIsScrolling && !hasOpenInsights && timeSinceLastRefresh >= 60000) {
          lastRefreshTime = now;
          loadRecentCallsForContact();
        }
      }, 60000); // Check every 60 seconds
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
    
    // Process click-to-call for phone numbers with a slight delay to ensure DOM is ready
    setTimeout(() => {
      try { 
        console.debug('[Contact Detail] Processing click-to-call for phone numbers');
        window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); 
      } catch (e) { 
        console.warn('[Contact Detail] Click-to-call processing failed:', e);
      }
    }, 100);
    
    // Load activities
    loadContactActivities();
    // Load recent calls
        try { loadRecentCallsForContact(); } catch (_) { /* noop */ }
        try { promotePageContent(); } catch(_) {}
  }

  function svgPencil() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  }

  function loadContactActivities() {
    if (!window.ActivityManager || !state.currentContact) return;
    
    const contactId = state.currentContact.id;
    window.ActivityManager.renderActivities('contact-activity-timeline', 'contact', contactId);
    
    // Setup pagination
    setupContactActivityPagination(contactId);
  }

  // ===== Recent Calls (Contact) =====
  let _rcRetryTimer = null;
  function startRecentCallsLiveHooks(){
    try{
      if (document._rcLiveHooksBound) return;
      
      // Only listen for call completion - no more frequent refreshes during live calls
      document.addEventListener('callEnded', onAnyContactCallActivity, false);
      
      // Listen for new calls (only when call is actually logged/completed)
      document.addEventListener('pc:call-logged', (event) => {
        const callData = event.detail;
        if (callData && callData.contactId === state.currentContact?.id) {
          console.log('[ContactDetail] Call logged for this contact, refreshing activities');
          
          // Immediately refresh recent calls section
          if (window.ActivityManager && typeof window.ActivityManager.renderActivities === 'function') {
            window.ActivityManager.renderActivities(
              'contact-activity-timeline', 
              'contact', 
              state.currentContact.id,
              true // force refresh
            );
          }
          
          // Also use debounced refresh as backup
          onAnyContactCallActivity();
        }
      });
      
      // Track scroll state to defer refresh
      try{
        if (els.mainContent && !els.mainContent._rcScrollBound){
          const sc = els.mainContent;
          let scrollRafId = null;
          sc.addEventListener('scroll', ()=>{
            state._rcIsScrolling = true;
            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            scrollRafId = requestAnimationFrame(() => {
              clearTimeout(state._rcScrollTimer);
              state._rcScrollTimer = setTimeout(()=>{
                state._rcIsScrolling = false;
                if (state._rcPendingRefresh){ state._rcPendingRefresh = false; safeReloadContactRecentCallsWithRetries(); }
              }, 180);
            });
          }, { passive:true });
          els.mainContent._rcScrollBound = '1';
        }
      }catch(_){ }
      document._rcLiveHooksBound = true;
    }catch(_){ }
  }
  function onAnyContactCallActivity(){
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
    
    // [OPTIMIZATION] Debounce refresh to prevent freeze on hangup
    // Cancel any pending refresh and schedule a new one
    if (state._rcRefreshDebounceTimer) {
      clearTimeout(state._rcRefreshDebounceTimer);
    }
    
    // [OPTIMIZATION] Only refresh if this page is visible
    const contactPage = document.getElementById('contact-detail-page');
    const isVisible = contactPage && contactPage.style.display !== 'none' && !contactPage.hidden;
    
    if (!isVisible) {
      console.debug('[Contact Detail] Page not visible, skipping refresh to prevent freeze');
      return;
    }
    
    try{ const list = document.getElementById('contact-recent-calls-list'); const hasOpen = (state._rcOpenIds && state._rcOpenIds.size>0); if(list && !hasOpen) { /* could show spinner */ } }catch(_){ }
    
    // Debounce refresh by 1.5 seconds to allow:
    // 1. User to continue working without UI freeze
    // 2. Webhooks to update call data
    // 3. Multiple rapid events to be collapsed into one refresh
    state._rcRefreshDebounceTimer = setTimeout(() => {
      safeReloadContactRecentCallsWithRetries();
      state._rcRefreshDebounceTimer = null;
    }, 1500); // 1.5 second debounce (increased from 1s to prevent freeze)
  }
  
  // onLiveCallDurationUpdate function removed - live duration updates no longer needed
  function safeReloadContactRecentCallsWithRetries(){
    try{ if (_rcRetryTimer){ clearTimeout(_rcRetryTimer); _rcRetryTimer=null; } }catch(_){ }
    // Skip auto-reload while insights are open to prevent UI thrash/shrink
    if (state._rcOpenIds && state._rcOpenIds.size > 0) return;
    if (state._rcReloadInFlight) return;
    state._rcReloadInFlight = true;
    let attempts=0;
    const run=()=>{
      // If user opened insights mid-sequence, stop further retries
      if (state._rcOpenIds && state._rcOpenIds.size > 0) { state._rcReloadInFlight=false; return; }
      attempts++;
      try{ loadRecentCallsForContact(); }catch(_){ }
      if (attempts<3) { _rcRetryTimer = setTimeout(run, 1500); } // Reduced from 10 to 3 attempts, increased interval
      else { state._rcReloadInFlight=false; }
    };
    run();
  }


  function setupContactActivityPagination(contactId) {
    const paginationEl = document.getElementById('contact-activity-pagination');
    
    if (!paginationEl) return;
    
    // Show pagination if there are more than 4 activities
    const updatePagination = async () => {
      if (!window.ActivityManager) return;
      
      const activities = await window.ActivityManager.getActivities('contact', contactId);
      const totalPages = Math.ceil(activities.length / window.ActivityManager.maxActivitiesPerPage);
      
      if (totalPages > 1) {
        paginationEl.style.display = 'flex';
        
        // Use unified pagination component
        if (window.crm && window.crm.createPagination) {
          window.crm.createPagination(
            window.ActivityManager.currentPage + 1, 
            totalPages, 
            (page) => {
              window.ActivityManager.goToPage(page - 1, 'contact-activity-timeline', 'contact', contactId);
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
  function svgTrash() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>';
  }
  function svgCopy() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  }
  function svgSave() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
  }
  function svgStar() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21 12 17.77 5.82 21 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  }

  function renderPhoneRow(contact) {
    // Determine the primary phone and its type based on priority
    const phoneData = getPrimaryPhoneData(contact);
    const { value, type, field } = phoneData;
    const text = value ? escapeHtml(formatPhoneForDisplay(value)) : '--';
    const hasValue = !!value;
    
    // Get contact and account IDs for context
    const contactId = contact.id || contact.contactId || contact._id;
    const accountId = contact.accountId || contact.account_id;
    const contactName = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '';
    const companyName = contact.companyName || contact.company || contact.account || '';
    
    return `
      <div class="info-row" data-field="phone" data-phone-type="${type}">
        <div class="info-label">${escapeHtml(type.toUpperCase())}</div>
        <div class="info-value">
          <div class="info-value-wrap" data-field="phone" data-has-value="${hasValue ? '1' : '0'}">
            <span class="info-value-text" 
                  data-contact-id="${contactId || ''}" 
                  data-account-id="${accountId || ''}" 
                  data-contact-name="${escapeHtml(contactName)}" 
                  data-company-name="${escapeHtml(companyName)}">${text}</span>
            <div class="info-actions" aria-hidden="true">
              <button type="button" class="icon-btn-sm phone-default-btn" title="Set default number">${svgStar()}</button>
              <button type="button" class="icon-btn-sm info-edit" title="Edit">${svgPencil()}</button>
              <button type="button" class="icon-btn-sm info-copy" title="Copy">${svgCopy()}</button>
              <button type="button" class="icon-btn-sm info-delete" title="Clear">${svgTrash()}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function getPrimaryPhoneData(contact) {
    // If a preferred field was chosen during edit, honor it for the next render
    if (state.preferredPhoneField) {
      const f = state.preferredPhoneField;
      if (f === 'mobile' && contact.mobile) return { value: contact.mobile, type: 'mobile', field: 'mobile' };
      if (f === 'workDirectPhone' && contact.workDirectPhone) return { value: contact.workDirectPhone, type: 'work direct', field: 'workDirectPhone' };
      if (f === 'otherPhone' && contact.otherPhone) return { value: contact.otherPhone, type: 'other', field: 'otherPhone' };
    }
    // Otherwise, if a persisted preference exists on the contact, honor it
    try {
      const pref = (contact && contact.preferredPhoneField) ? String(contact.preferredPhoneField).trim() : '';
      if (pref === 'mobile' && contact.mobile) return { value: contact.mobile, type: 'mobile', field: 'mobile' };
      if (pref === 'workDirectPhone' && contact.workDirectPhone) return { value: contact.workDirectPhone, type: 'work direct', field: 'workDirectPhone' };
      if (pref === 'otherPhone' && contact.otherPhone) return { value: contact.otherPhone, type: 'other', field: 'otherPhone' };
    } catch(_) {}
    // Priority: Mobile > Work Direct > Other
    if (contact.mobile) {
      return { value: contact.mobile, type: 'mobile', field: 'mobile' };
    }
    if (contact.workDirectPhone) {
      return { value: contact.workDirectPhone, type: 'work direct', field: 'workDirectPhone' };
    }
    if (contact.otherPhone) {
      return { value: contact.otherPhone, type: 'other', field: 'otherPhone' };
    }
    return { value: '', type: 'mobile', field: 'mobile' };
  }

  // Handle company phone clicks with strict company-mode flow (AI-suggested approach)
  function handleCompanyPhoneClick(phoneElement, contact) {
    try {
      console.log('[Contact Detail] Company phone clicked, setting strict company-mode context');
      
      // Build account context from contact's associated account (AI-suggested approach)
      const accountId = contact.accountId || contact.account_id;
      const accountName = contact.companyName || contact.company || contact.account || '';
      
      // Resolve account context with fallback chain (AI suggestion)
      let resolvedAccount = null;
      let resolvedDomain = '';
      
      // Primary: Contact's associated account data - try multiple methods
      if (accountId) {
        // Method 1: Try window.Accounts.getAccountById
        if (window.Accounts && window.Accounts.getAccountById) {
          try {
            resolvedAccount = window.Accounts.getAccountById(accountId);
          } catch(_) {}
        }
        
        // Method 2: Try window.getAccountsData if available
        if (!resolvedAccount && typeof window.getAccountsData === 'function') {
          try {
            const accounts = window.getAccountsData() || [];
            resolvedAccount = accounts.find(acc => acc.id === accountId || acc.accountId === accountId);
          } catch(_) {}
        }
        
        // Method 3: Try window.Accounts.accounts cache
        if (!resolvedAccount && window.Accounts && window.Accounts.accounts) {
          try {
            const accounts = window.Accounts.accounts || [];
            resolvedAccount = accounts.find(acc => acc.id === accountId || acc.accountId === accountId);
          } catch(_) {}
        }
      }
      
      // Fallback: DOM elements (header/company field)
      if (!resolvedAccount) {
        const companyFromDOM = document.querySelector('#contact-detail-view .info-row[data-field="companyName"] .info-value-text')?.textContent?.trim();
        if (companyFromDOM && companyFromDOM !== '--') {
          resolvedAccount = { name: companyFromDOM, accountName: companyFromDOM };
        }
      }
      
      // Final fallback: Accounts cache by name match
      if (!resolvedAccount && accountName && window.Accounts && window.Accounts.accounts) {
        try {
          const accounts = window.Accounts.accounts || [];
          resolvedAccount = accounts.find(acc => 
            (acc.name && acc.name.toLowerCase() === accountName.toLowerCase()) ||
            (acc.accountName && acc.accountName.toLowerCase() === accountName.toLowerCase())
          );
        } catch(_) {}
      }
      
      // Extract domain from account data
      if (resolvedAccount) {
        resolvedDomain = resolvedAccount.domain || resolvedAccount.website || '';
        if (resolvedDomain && !resolvedDomain.startsWith('http')) {
          resolvedDomain = 'https://' + resolvedDomain;
        }
        if (resolvedDomain) {
          try {
            const url = new URL(resolvedDomain);
            resolvedDomain = url.hostname.replace(/^www\./, '');
          } catch(_) {
            resolvedDomain = resolvedDomain.replace(/^https?:\/\//, '').replace(/^www\./, '');
          }
        }
      }
      
      // Set strict company-mode context (AI-suggested payload)
      const contextPayload = {
        // Account context
        accountId: accountId || (resolvedAccount && resolvedAccount.id) || null,
        accountName: (resolvedAccount && resolvedAccount.name) || (resolvedAccount && resolvedAccount.accountName) || accountName || null,
        company: (resolvedAccount && resolvedAccount.name) || (resolvedAccount && resolvedAccount.accountName) || accountName || null,
        
        // Branding/location - ensure these are properly set for phone widget
        // Priority: resolvedAccount data > contact account fields > contact location fields
        city: (resolvedAccount && (resolvedAccount.city || resolvedAccount.locationCity)) || 
              contact.accountCity || contact.accountLocationCity || 
              contact.city || contact.locationCity || '',
        state: (resolvedAccount && (resolvedAccount.state || resolvedAccount.locationState)) || 
               contact.accountState || contact.accountLocationState || 
               contact.state || contact.locationState || '',
        domain: resolvedDomain || contact.accountDomain || contact.accountWebsite || '',
        logoUrl: (resolvedAccount && resolvedAccount.logoUrl) || contact.accountLogoUrl || '',
        
        // Force company mode
        isCompanyPhone: true,
        
        // Explicitly clear contact attribution
        contactId: null,
        contactName: '',
        name: (resolvedAccount && resolvedAccount.name) || (resolvedAccount && resolvedAccount.accountName) || accountName || ''
      };
      
      // Debug logging to see what context is being set
      console.log('[Contact Detail] Resolved account data:', {
        accountId: accountId,
        accountName: accountName,
        resolvedAccount: resolvedAccount,
        resolvedDomain: resolvedDomain,
        contactData: {
          city: contact.city,
          state: contact.state,
          locationCity: contact.locationCity,
          locationState: contact.locationState
        },
        finalContext: contextPayload
      });
      
      // Additional debug: log all available account fields if we found an account
      if (resolvedAccount) {
        console.log('[Contact Detail] Account fields available:', {
          id: resolvedAccount.id,
          accountName: resolvedAccount.accountName,
          name: resolvedAccount.name,
          companyName: resolvedAccount.companyName,
          city: resolvedAccount.city,
          locationCity: resolvedAccount.locationCity,
          state: resolvedAccount.state,
          locationState: resolvedAccount.locationState,
          website: resolvedAccount.website,
          domain: resolvedAccount.domain,
          logoUrl: resolvedAccount.logoUrl,
          allFields: Object.keys(resolvedAccount)
        });
      }
      
      console.log('[Contact Detail] Setting company phone context:', contextPayload);
      window.Widgets.setCallContext(contextPayload);
      
      // Mark that we've set a specific context to prevent generic click-to-call from overriding
      try {
        window._pcPhoneContextSetByPage = true;
        // Clear the flag after a short delay to allow the click event to use it
        setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 100);
      } catch(_) {}
      
    } catch (error) {
      console.error('[Contact Detail] Error setting company phone context:', error);
    }
  }

  // Handle contact phone clicks with proper contact context
  function handleContactPhoneClick(phoneElement, contact) {
    try {
      console.log('[Contact Detail] Contact phone clicked, setting contact context');
      
      // Get the phone type from the data attribute
      const phoneType = phoneElement.closest('.info-row')?.getAttribute('data-phone-type') || 'mobile';
      
      // Build contact context for contact phone calls
      const contextPayload = {
        contactId: contact.id || contact.contactId || contact._id || '',
        contactName: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '',
        accountId: contact.accountId || contact.account_id || '',
        accountName: contact.companyName || contact.company || contact.account || '',
        company: contact.companyName || contact.company || contact.account || '',
        name: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '', // Contact name as primary
        city: contact.city || contact.locationCity || '',
        state: contact.state || contact.locationState || '',
        domain: contact.domain || '',
        logoUrl: contact.logoUrl || '',
        isCompanyPhone: false, // This is a contact phone call
        phoneType: phoneType, // Include the phone type (mobile, work direct, other)
        suggestedContactId: contact.id || contact.contactId || contact._id || '',
        suggestedContactName: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || ''
      };
      
      // Set the context in the phone widget
      if (window.Widgets && typeof window.Widgets.setCallContext === 'function') {
        window.Widgets.setCallContext(contextPayload);
        
        // Also trigger contact display to show the contact info
        if (window.Widgets && typeof window.Widgets.setContactDisplay === 'function') {
          try {
            window.Widgets.setContactDisplay(contextPayload, '');
          } catch(_) {}
        }
      }
      
      // Mark that we've set a specific context to prevent generic click-to-call from overriding
      try {
        window._pcPhoneContextSetByPage = true;
        setTimeout(() => { window._pcPhoneContextSetByPage = false; }, 1000);
      } catch(_) {}
      
    } catch (error) {
      console.error('[Contact Detail] Error setting contact phone context:', error);
    }
  }

  function renderEmailRow(label, field, value, emailStatus) {
    const text = value ? escapeHtml(String(value)) : '--';
    const hasValue = !!value;
    const isVerified = emailStatus === 'verified' || emailStatus === true;
    
    return `
      <div class="info-row" data-field="${escapeHtml(field)}">
        <div class="info-label">
          ${escapeHtml(label)}
          ${isVerified ? '<span class="email-status-indicator" title="Email Verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg></span>' : ''}
        </div>
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

  function renderInfoRow(label, field, value) {
    let text = value ? escapeHtml(String(value)) : '--';
    
    // Format phone numbers for display
    if (field === 'companyPhone' && value && String(value).trim()) {
      text = escapeHtml(formatPhoneForDisplay(value));
    }
    
    const hasValue = !!value;
    
    // Add context data attributes for company phone
    let dataAttributes = '';
    if (field === 'companyPhone' && state.currentContact) {
      const contact = state.currentContact;
      const contactId = contact.id || contact.contactId || contact._id;
      const accountId = contact.accountId || contact.account_id;
      const contactName = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '';
      
      // Get company name with fallback to DOM
      let companyName = contact.companyName || contact.company || contact.account || '';
      if (!companyName) {
        // Fallback: try to get company name from DOM
        const companyFromDOM = document.querySelector('#contact-detail-view .info-row[data-field="companyName"] .info-value-text')?.textContent?.trim();
        if (companyFromDOM && companyFromDOM !== '--') {
          companyName = companyFromDOM;
        }
      }
      
      // Resolve the associated account to get additional context
      const linkedAccount = findAssociatedAccount(contact);
      let city = '';
      let stateValue = '';
      let domain = '';
      let logoUrl = '';
      
      if (linkedAccount) {
        city = linkedAccount.city || linkedAccount.locationCity || '';
        stateValue = linkedAccount.state || linkedAccount.locationState || '';
        logoUrl = linkedAccount.logoUrl || '';
        
        // Extract domain from account
        const domainRaw = linkedAccount.domain || linkedAccount.website || linkedAccount.site || '';
        if (domainRaw) {
          try {
            domain = String(domainRaw).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
          } catch(_) {}
        }
      }
      
      // Fallback to contact's account fields if no linked account found
      if (!city) city = contact.accountCity || contact.accountLocationCity || contact.city || contact.locationCity || '';
      if (!stateValue) stateValue = contact.accountState || contact.accountLocationState || contact.state || contact.locationState || '';
      if (!logoUrl) logoUrl = contact.accountLogoUrl || '';
      if (!domain) {
        const domainRaw = contact.accountDomain || contact.accountWebsite || contact.website || '';
        if (domainRaw) {
          try {
            domain = String(domainRaw).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
          } catch(_) {}
        }
      }
      
      dataAttributes = `data-contact-id="${contactId || ''}" 
                       data-account-id="${accountId || ''}" 
                       data-contact-name="${escapeHtml(contactName)}" 
                       data-company-name="${escapeHtml(companyName)}"
                       data-city="${escapeHtml(city)}"
                       data-state="${escapeHtml(stateValue)}"
                       data-domain="${escapeHtml(domain)}"
                       data-logo-url="${escapeHtml(logoUrl)}"`;
    }
    
    return `
      <div class="info-row" data-field="${escapeHtml(field)}">
        <div class="info-label">${escapeHtml(label)}</div>
        <div class="info-value">
          <div class="info-value-wrap" data-field="${escapeHtml(field)}" data-has-value="${hasValue ? '1' : '0'}">
            <span class="info-value-text" ${dataAttributes}>${text}</span>
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
    // Reset flag to allow reattachment after module reload
    state._contactDetailEventsAttached = false;
    
    // Ensure we have a valid contact before attaching events
    if (!state.currentContact?.id) {
      console.warn('[ContactDetail] Cannot attach events: no contact ID available');
      return;
    }
    
    state._contactDetailEventsAttached = true;

    // Listen for activity refresh events
    const activityRefreshHandler = (e) => {
      const { entityType, entityId, forceRefresh } = e.detail || {};
      if (entityType === 'contact' && entityId === state.currentContact?.id) {
        // Refresh contact activities
        if (window.ActivityManager) {
          const activityManager = window.ActivityManager; // use singleton
          activityManager.renderActivities('contact-activity-timeline', 'contact', entityId, forceRefresh);
        }
      }
    };
    document.addEventListener('pc:activities-refresh', activityRefreshHandler);
    eventListeners.push({ type: 'pc:activities-refresh', handler: activityRefreshHandler, target: document });

    // Back button: use a single delegated listener so it binds once and works across rerenders
    if (!document._pcBackButtonDelegated) {
      const onBackClick = (evt) => {
        const target = evt.target && evt.target.closest ? evt.target.closest('#back-to-people') : null;
        if (!target) return;
        evt.preventDefault();

        // Check if we came from health widget (call scripts page)
        const healthReturnPage = sessionStorage.getItem('health-widget-return-page');
        if (healthReturnPage) {
          sessionStorage.removeItem('health-widget-return-page');
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage(healthReturnPage.replace('-page', ''));
          }
          return;
        }
        
        // Check if we came from account details page
        if (window._contactNavigationSource === 'account-details' && window._contactNavigationAccountId) {
          // Clear phone widget context to prevent contact company info from leaking
          clearPhoneWidgetContext();
          
          // Navigate back to account details page
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage('account-details');
            // Use retry pattern to ensure account detail module is ready and data is loaded
            requestAnimationFrame(() => {
              const accountId = window._contactNavigationAccountId;
              const accountObj = window._contactNavigationAccount;
              
              // Prefetch FIRST, before any retry attempts
              if (accountObj) {
                try { 
                  window._prefetchedAccountForDetail = accountObj;
                  console.log('[ContactDetail] Prefetched account for return navigation:', accountObj.name || accountObj.accountName);
                } catch (_) {}
              }
              
              // Now do the retry
              let attempts = 0;
              const maxAttempts = 25;
              const retryInterval = 80;
              
              const retry = () => {
                attempts++;
                if (window.showAccountDetail && typeof window.showAccountDetail === 'function') {
                  window.showAccountDetail(accountId);
                  // Clear navigation variables AFTER the call
          window._contactNavigationSource = null;
          window._contactNavigationAccountId = null;
                  window._contactNavigationAccount = null;
                } else if (attempts < maxAttempts) {
                  setTimeout(retry, retryInterval);
                }
              };
              retry();
            });
          }
          return;
        }
        
        // Check if we came from task detail page
        if (window._contactNavigationSource === 'task-detail') {
          // Clear phone widget context to prevent contact company info from leaking
          clearPhoneWidgetContext();
          
          // Navigate back to task detail page
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage('task-detail');
            
            // Dispatch restore event instead of calling TaskDetail.open()
            setTimeout(() => {
              try {
                if (window.__taskDetailRestoreData) {
                  document.dispatchEvent(new CustomEvent('pc:task-detail-restore', {
                    detail: window.__taskDetailRestoreData
                  }));
                  console.log('[ContactDetail] Dispatched task-detail restore event');
                  window.__taskDetailRestoreData = null;
                }
              } catch (_) {}
            }, 100);
          }
          // Clear the navigation source
          window._contactNavigationSource = null;
          window._contactNavigationContactId = null;
          return;
        }
        
        // Check if we came from list detail page
        if (window._contactNavigationSource === 'list-detail' && window._contactNavigationListId) {
          // Clear phone widget context to prevent contact company info from leaking
          clearPhoneWidgetContext();
          
          // Navigate back to list detail page with state restoration
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            // Provide context up-front so navigateToPage's internal init uses it immediately
            try {
              window.listDetailContext = {
                listId: window._contactNavigationListId,
                listName: window._contactNavigationListName || 'List',
                listKind: 'people'
              };
            } catch (_) {}
            
            // Set restoration flag BEFORE navigation
            try {
              window.__restoringListDetail = true;
              window.__restoringListDetailUntil = Date.now() + 10000; // 10 seconds
            } catch (_) {}
            
            window.crm.navigateToPage('list-detail');
            
            // Dispatch restore event with retry mechanism
            setTimeout(() => {
              const restore = window._listDetailReturn || {};
              const deadline = Date.now() + 8000; // 8 second timeout
              let attempts = 0;
              
              const tryRestore = () => {
                attempts++;
                if (Date.now() > deadline) {
                  console.warn('[ContactDetail] List detail page not ready after 8 seconds');
                  return;
                }
                
                try {
                  const page = document.getElementById('list-detail-page');
                  const listDetailModule = window.ListDetail;
                  if (page && page.offsetParent !== null && listDetailModule) {
                    const ev = new CustomEvent('pc:list-detail-restore', {
                      detail: {
                        page: restore.page,
                        scroll: restore.scroll,
                        filters: restore.filters,
                        listId: restore.listId,
                        listName: restore.listName,
                        view: restore.view,
                        timestamp: Date.now()
                      }
                    });
                    document.dispatchEvent(ev);
                    console.log('[ContactDetail] Dispatched pc:list-detail-restore event (ready) after', attempts, 'attempts');
                    return;
                  }
                } catch (_) {}
                
                // Retry after 80ms
                setTimeout(tryRestore, 80);
              };
              
              tryRestore();
            }, 60);
          }
          
          // Clear the navigation source
          window._contactNavigationSource = null;
          window._contactNavigationListId = null;
          window._contactNavigationListName = null;
          return;
        }
        
        // Check if we came from calls page
        if (window._contactNavigationSource === 'calls') {
          // Clear phone widget context to prevent contact company info from leaking
          clearPhoneWidgetContext();
          
          // Navigate back to calls page
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage('calls');
          }
          // Clear the navigation source after successful navigation
          window._contactNavigationSource = null;
          window._contactNavigationContactId = null;
          return;
        }
        
        // Check if we came from dashboard activities
        if (window._dashboardNavigationSource === 'activities') {
          // Clear phone widget context to prevent contact company info from leaking
          clearPhoneWidgetContext();
          
          // Navigate back to dashboard and restore pagination state
          if (window.crm && typeof window.crm.navigateToPage === 'function') {
            window.crm.navigateToPage('dashboard');
            
            // Restore dashboard pagination state
            setTimeout(() => {
              try {
                const restore = window._dashboardReturn || {};
                if (window.ActivityManager && restore.page !== undefined) {
                  // Restore the specific page
                  window.ActivityManager.goToPage('home-activity-timeline', 'global', restore.page);
                  
                  // Restore scroll position
                  if (restore.scroll !== undefined) {
                    window.scrollTo(0, restore.scroll);
                  }
                }
                
                // Clear navigation markers AFTER successful navigation and restore
                window._dashboardNavigationSource = null;
                window._dashboardReturn = null;
              } catch (error) {
                console.warn('Error restoring dashboard state:', error);
              }
            }, 100);
          }
          return;
        }
        
        // Check if we came from people page
        if (window._contactNavigationSource === 'people') {
          // Clear phone widget context to prevent contact company info from leaking
          clearPhoneWidgetContext();
          
          try {
            const restore = window._peopleReturn || {};
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
              // Set restoration flag so People page knows to restore state
              try {
                window.__restoringPeople = true;
                window.__restoringPeopleUntil = Date.now() + 15000; // 15 seconds
              } catch (_) {}
              
              window.crm.navigateToPage('people');
              // Dispatch an event for People page to restore UI state
              setTimeout(() => {
                try {
                  const ev = new CustomEvent('pc:people-restore', { detail: {
                    page: restore.page, scroll: restore.scroll, filters: restore.filters, searchTerm: restore.searchTerm, sortColumn: restore.sortColumn, sortDirection: restore.sortDirection, currentPage: restore.currentPage || restore.page } });
                  document.dispatchEvent(ev);
                  
                  // Clear navigation markers AFTER successful navigation and restore
                  window._contactNavigationSource = null;
                  window._peopleReturn = null;
                } catch(_) {}
              }, 60);
            }
            // Also cleanup the contact detail overlay and restore people view immediately (overlay mode)
            try {
              showToolbar();
              if (els.page) { els.page.classList.remove('contact-detail-mode'); }
              const view = document.getElementById('contact-detail-view');
              if (view && view.parentElement) view.parentElement.removeChild(view);
              const header = document.getElementById('contact-detail-header');
              if (header && header.parentElement) header.parentElement.removeChild(header);
              if (els.mainContent) {
                const tableContainer = els.mainContent.querySelector('.table-container');
                if (tableContainer) {
                  tableContainer.classList.remove('hidden');
                } else if (typeof state.prevPeopleContent === 'string' && state.prevPeopleContent) {
                  els.mainContent.innerHTML = state.prevPeopleContent;
                  state.prevPeopleContent = '';
                }
              }
              if (window.peopleModule) {
                // Ensure data is loaded before filtering
                const peopleState = window.peopleModule.state || {};
                console.log('[ContactDetail] People state check:', {
                  loaded: peopleState.loaded,
                  dataLength: peopleState.data?.length || 0
                });
                
                // Check if data is actually loaded (not just the flag)
                if (!peopleState.data || peopleState.data.length === 0) {
                  console.log('[ContactDetail] People data empty, forcing reload');
                  
                  // Reset loaded flag if data is empty
                  if (peopleState.loaded) {
                    console.log('[ContactDetail] Resetting loaded flag');
                    peopleState.loaded = false;
                  }
                  
                  if (typeof window.peopleModule.loadDataOnce === 'function') {
                    window.peopleModule.loadDataOnce().then(() => {
                      console.log('[ContactDetail] People data reloaded');
                      if (typeof window.peopleModule.applyFilters === 'function') {
                        window.peopleModule.applyFilters();
                      }
                      if (typeof window.peopleModule.rebindDynamic === 'function') {
                try { window.peopleModule.rebindDynamic(); } catch (e) { /* noop */ }
                      }
                    }).catch((error) => {
                      console.error('[ContactDetail] Failed to reload people data:', error);
                    });
                  }
                } else {
                  // Data exists, just filter and rebind
                  if (typeof window.peopleModule.applyFilters === 'function') {
                    try { 
                      console.log('[ContactDetail] Forcing people table re-render');
                      window.peopleModule.applyFilters(); 
                    } catch (e) { 
                      console.error('[ContactDetail] Failed to re-render people table:', e);
                    }
                  }
                  // Then rebind dynamic handlers
                  if (typeof window.peopleModule.rebindDynamic === 'function') {
                    try { window.peopleModule.rebindDynamic(); } catch (e) { /* noop */ }
                  }
                }
              }
            } catch (_) { /* noop */ }
          } catch (_) { /* noop */ }
          return;
        }
        
        // Default behavior: return to people page
        
        // Show the People toolbar/header again
        showToolbar();
        // Disable contact detail scroll mode
        if (els.page) { els.page.classList.remove('contact-detail-mode'); }
        // Remove contact detail header and view
        const view = document.getElementById('contact-detail-view');
        if (view && view.parentElement) {
          view.classList.remove('contact-detail-ready');
          view.parentElement.removeChild(view);
        }
        const header = document.getElementById('contact-detail-header');
        if (header && header.parentElement) {
          header.classList.remove('contact-detail-ready');
          header.parentElement.removeChild(header);
        }
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
        // Ensure dynamic handlers remain intact and force table re-render
        if (window.peopleModule) {
          // Ensure data is loaded before filtering
          const peopleState = window.peopleModule.state || {};
          console.log('[ContactDetail] People state check (default):', {
            loaded: peopleState.loaded,
            dataLength: peopleState.data?.length || 0
          });
          
          // Check if data is actually loaded (not just the flag)
          if (!peopleState.data || peopleState.data.length === 0) {
            console.log('[ContactDetail] People data empty, forcing reload');
            
            // Reset loaded flag if data is empty
            if (peopleState.loaded) {
              console.log('[ContactDetail] Resetting loaded flag');
              peopleState.loaded = false;
            }
            
            if (typeof window.peopleModule.loadDataOnce === 'function') {
              window.peopleModule.loadDataOnce().then(() => {
                console.log('[ContactDetail] People data reloaded');
                if (typeof window.peopleModule.applyFilters === 'function') {
                  window.peopleModule.applyFilters();
                }
                if (typeof window.peopleModule.rebindDynamic === 'function') {
          try { window.peopleModule.rebindDynamic(); } catch (e) { /* noop */ }
                }
              }).catch((error) => {
                console.error('[ContactDetail] Failed to reload people data:', error);
              });
            }
          } else {
            // Data exists, just filter and rebind
            if (typeof window.peopleModule.applyFilters === 'function') {
              try { 
                console.log('[ContactDetail] Forcing people table re-render');
                window.peopleModule.applyFilters(); 
              } catch (e) { 
                console.error('[ContactDetail] Failed to re-render people table:', e);
              }
            }
            // Then rebind dynamic handlers
            if (typeof window.peopleModule.rebindDynamic === 'function') {
              try { window.peopleModule.rebindDynamic(); } catch (e) { /* noop */ }
            }
          }
        }
      };
      document.addEventListener('click', onBackClick, true);
      document._pcBackButtonDelegated = true;
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
      btn.addEventListener('click', async (e) => {
        const action = btn.getAttribute('data-action');
        await handleQuickAction(action, btn);
      });
    });

    // NOTE: Company link now uses event delegation (see setupEventDelegation)
    // NOTE: "Add to List" and "Add to Sequences" buttons now use event delegation
    // Event listeners are attached at module initialization on document level
    // This eliminates race conditions when DOM is replaced during contact navigation
    // See setupEventDelegation() for implementation

    // Tasks button (opens inline task popover)
    const tasksBtn = document.getElementById('open-contact-task-popover');
    if (tasksBtn && !tasksBtn._bound) {
      tasksBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Toggle behavior: close if already open
        if (document.querySelector('.task-popover')) {
          closeContactTaskPopover();
        } else {
          openContactTaskPopover(tasksBtn);
        }
      });
      tasksBtn._bound = '1';
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

    // Inline edit/copy/delete for Energy & Contract fields (Account fields shown on Contact Detail)
    const energyGrid = document.querySelector('#contact-energy-grid');
    if (energyGrid && !energyGrid._bound) {
      energyGrid.addEventListener('click', async (e) => {
        const wrap = e.target.closest?.('.info-value-wrap');
        if (!wrap) return;
        const field = wrap.getAttribute('data-field');
        if (!field) return;

        // Edit button: switch to input
        const editBtn = e.target.closest('.info-edit');
        if (editBtn) {
          e.preventDefault();
          beginEditAccountField(wrap, field);
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
        const deleteBtn = e.target.closest('.info-delete');
        if (deleteBtn) {
          e.preventDefault();
          await commitEditAccountField(wrap, field, '');
          return;
        }
      });
      energyGrid._bound = '1';
    }

    // Inline edit/copy/delete for Service Addresses (Account fields shown on Contact Detail)
    const serviceAddressesGrid = document.querySelector('#contact-service-addresses-grid');
    if (serviceAddressesGrid && !serviceAddressesGrid._bound) {
      serviceAddressesGrid.addEventListener('click', async (e) => {
        const wrap = e.target.closest?.('.info-value-wrap');
        if (!wrap) return;
        const field = wrap.getAttribute('data-field');
        if (!field) return;

        // Edit button: switch to input
        const editBtn = e.target.closest('.info-edit');
        if (editBtn) {
          e.preventDefault();
          beginEditAccountServiceAddress(wrap, field);
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
        const deleteBtn = e.target.closest('.info-delete');
        if (deleteBtn) {
          e.preventDefault();
          // Special handling for service addresses
          if (field.startsWith('serviceAddress_')) {
            const addressIndex = parseInt(wrap.getAttribute('data-address-index'), 10);
            if (!isNaN(addressIndex)) {
              // Get linked account
              const linkedAccount = findAssociatedAccount(state.currentContact);
              if (linkedAccount && linkedAccount.serviceAddresses && Array.isArray(linkedAccount.serviceAddresses)) {
                // Remove this address from the array
                const updatedAddresses = linkedAccount.serviceAddresses.filter((_, idx) => idx !== addressIndex);
                await saveAccountServiceAddresses(updatedAddresses);
                // Re-render to update the UI
                await renderContactDetail();
                return;
              }
            }
          }
          return;
        }
      });
      serviceAddressesGrid._bound = '1';
    }

    // Add Service Address button (Contact Detail)
    const contactAddServiceAddressBtn = document.getElementById('contact-add-service-address');
    if (contactAddServiceAddressBtn && !contactAddServiceAddressBtn._bound) {
      contactAddServiceAddressBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Get linked account
        const linkedAccount = findAssociatedAccount(state.currentContact);
        if (!linkedAccount) {
          window.crm?.showToast && window.crm.showToast('No linked account found');
          return;
        }
        
        // Get current service addresses
        const currentAddresses = (linkedAccount.serviceAddresses && Array.isArray(linkedAccount.serviceAddresses)) ? linkedAccount.serviceAddresses : [];
        
        // Add a new empty address
        const newAddress = { address: '', isPrimary: currentAddresses.length === 0 };
        const updatedAddresses = [...currentAddresses, newAddress];
        
        // Save to Firestore
        await saveAccountServiceAddresses(updatedAddresses);
        
        // Re-render the contact detail to show the new address
        await renderContactDetail();
        
        // Find the newly added address field and start editing it
        setTimeout(() => {
          const newIndex = updatedAddresses.length - 1;
          const newWrap = document.querySelector(`#contact-service-addresses-grid [data-field="serviceAddress_${newIndex}"]`);
          if (newWrap) {
            beginEditAccountServiceAddress(newWrap, `serviceAddress_${newIndex}`);
          }
        }, 100);
      });
      contactAddServiceAddressBtn._bound = true;
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
        // Default star button: cycle default phone type (no editing)
        const defaultBtn = e.target.closest('.phone-default-btn');
        if (defaultBtn && field === 'phone') {
          e.preventDefault();
          // Throttle: prevent rapid double-clicks from cycling multiple times
          if (infoGrid._cycleLock) return;
          infoGrid._cycleLock = true;

          try {
            const contact = state.currentContact || {};
            const order = ['mobile', 'workDirectPhone', 'otherPhone'];
            // Build list of available types with values
            const available = order.filter(k => !!contact[k]);
            if (!available.length) return;
            // Current is first that matches label
            const currentField = getPrimaryPhoneData(contact).field;
            const idx = Math.max(0, available.indexOf(currentField));
            const next = available[(idx + 1) % available.length];
            try { await setPreferredPhoneType(next); } catch(_) {}
            // Update label immediately
            const labelEl = wrap.closest('.info-row')?.querySelector('.info-label');
            if (labelEl) {
              const typeLabels = { mobile: 'MOBILE', workDirectPhone: 'WORK DIRECT', otherPhone: 'OTHER PHONE' };
              labelEl.textContent = typeLabels[next] || 'PHONE';
            }
            // Re-render phone row
            const phoneRow = wrap.closest('.info-row');
            if (phoneRow) {
              const newPhoneRow = renderPhoneRow(state.currentContact);
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = newPhoneRow;
              const newRow = tempDiv.firstElementChild;
              phoneRow.parentElement.replaceChild(newRow, phoneRow);
              
              // Process click-to-call for the new phone row
              setTimeout(() => {
                try { 
                  window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); 
                } catch (_) {}
              }, 50);
            }
          } finally {
            // Release lock after a brief cooldown
            setTimeout(() => { infoGrid._cycleLock = false; }, 400);
          }
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
          // Special handling for phone: clear the underlying phone field (mobile/workDirectPhone/otherPhone)
          if (field === 'phone') {
            const infoRow = wrap.closest('.info-row');
            const phoneType = (infoRow?.getAttribute('data-phone-type') || '').toLowerCase();
            const typeToField = {
              'mobile': 'mobile',
              'work direct': 'workDirectPhone',
              'other': 'otherPhone'
            };
            const clearField = typeToField[phoneType] || 'mobile';
            openDeleteConfirmPopover(delBtn, async () => {
              await saveField(clearField, '');
              // Update local contact and re-render the phone row
              try { if (state.currentContact) state.currentContact[clearField] = ''; } catch(_) {}
              const phoneRow = infoRow;
              if (phoneRow) {
                const newPhoneRow = renderPhoneRow(state.currentContact || {});
                const temp = document.createElement('div');
                temp.innerHTML = newPhoneRow;
                const newEl = temp.firstElementChild;
                phoneRow.parentElement.replaceChild(newEl, phoneRow);
                
                // Process click-to-call for the new phone row
                setTimeout(() => {
                  try { 
                    window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); 
                  } catch (_) {}
                }, 50);
              }
            });
            return;
          }
          // Default: clear simple fields
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
    
    // Special handling for phone field
    if (field === 'phone') {
      beginEditPhoneField(wrap);
      return;
    }
    
    const current = wrap.querySelector('.info-value-text')?.textContent || '';
    wrap.classList.add('editing');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-dark info-edit-input';
    input.value = current === '--' ? '' : current;
    input.placeholder = 'Enter ' + field;
    
    // Add supplier suggestions for electricity supplier field
    if (field === 'electricitySupplier') {
      console.log('[Contact Detail] Adding supplier suggestions for field:', field);
      console.log('[Contact Detail] window.addSupplierSuggestions available:', !!window.addSupplierSuggestions);
      console.log('[Contact Detail] window.SupplierNames available:', !!window.SupplierNames, 'count:', window.SupplierNames?.length);
      if (window.addSupplierSuggestions) {
        window.addSupplierSuggestions(input, 'contact-supplier-list');
        console.log('[Contact Detail] Supplier suggestions added to input');
      } else {
        console.warn('[Contact Detail] window.addSupplierSuggestions not available');
      }
    }
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

  // Inline edit for Account fields (Energy & Contract) shown on Contact Detail
  function beginEditAccountField(wrap, field) {
    if (!wrap) return;

    const current = wrap.querySelector('.info-value-text')?.textContent || '';
    wrap.classList.add('editing');

    // Build appropriate input
    let input;
    // Local date helpers
    const parseDateFlexible = (s) => {
      if (!s) return null; const str=String(s).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { 
        // For ISO dates, parse components to avoid timezone issues
        const parts = str.split('-');
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return isNaN(d.getTime()) ? null : d;
      }
      const m = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/); 
      if (m){ 
        // Parse MM/DD/YYYY format directly to avoid timezone issues
        const d = new Date(parseInt(m[3],10), parseInt(m[1],10)-1, parseInt(m[2],10)); 
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(str); return isNaN(d.getTime()) ? null : d;
    };
    const toISODate = (v) => { const d=parseDateFlexible(v); if(!d) return ''; const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; };
    const toMDY = (v) => { const d=parseDateFlexible(v); if(!d) return v?String(v):''; const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); const yyyy=d.getFullYear(); return `${mm}/${dd}/${yyyy}`; };
    const formatDateInputAsMDY = (raw) => { const digits=String(raw||'').replace(/[^0-9]/g,'').slice(0,8); let out=''; if(digits.length>=1) out=digits.slice(0,2); if(digits.length>=3) out=digits.slice(0,2)+'/'+digits.slice(2,4); if(digits.length>=5) out=digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4,8); return out; };

    input = document.createElement('input');
    input.className = 'input-dark info-edit-input';
    if (field === 'contractEndDate') {
      input.type = 'date';
      input.value = toISODate(current);
    } else {
      input.type = 'text';
      input.value = current === '--' ? '' : current;
      input.placeholder = 'Enter ' + field;
    }
    
    // Add comma formatting for annual usage field
    if (field === 'annualUsage') {
      // Remove commas from current value for editing
      const cleanValue = (current === '--' ? '' : current).replace(/,/g, '');
      input.value = cleanValue;
      
      // Add input event listener for comma formatting
      input.addEventListener('input', (e) => {
        const cursorPos = e.target.selectionStart;
        const value = e.target.value.replace(/[^0-9]/g, ''); // Remove non-digits
        const formatted = value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        e.target.value = formatted;
        
        // Restore cursor position after formatting
        const newCursorPos = cursorPos + (formatted.length - e.target.value.length);
        e.target.setSelectionRange(newCursorPos, newCursorPos);
      });
    }
    
    // Add supplier suggestions for electricity supplier field
    if (field === 'electricitySupplier') {
      console.log('[Contact Detail] Adding supplier suggestions for account field:', field);
      console.log('[Contact Detail] window.addSupplierSuggestions available:', !!window.addSupplierSuggestions);
      console.log('[Contact Detail] window.SupplierNames available:', !!window.SupplierNames, 'count:', window.SupplierNames?.length);
      if (window.addSupplierSuggestions) {
        window.addSupplierSuggestions(input, 'contact-account-supplier-list');
        console.log('[Contact Detail] Supplier suggestions added to account field input');
      } else {
        console.warn('[Contact Detail] window.addSupplierSuggestions not available for account field');
      }
    }
    

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

    const commit = async () => {
      let val = input.value;
      if (field === 'currentRate') {
        val = String(val || '').trim();
        if (/^\.\d+$/.test(val)) val = '0' + val;
      }
      // Remove commas from annual usage before saving
      if (field === 'annualUsage') {
        val = val.replace(/,/g, '');
      }
      // Convert contractEndDate to MM/DD/YYYY format for storage consistency
      if (field === 'contractEndDate') {
        val = toMDY(val);
      }
      await saveAccountField(field, val);
      // For annual usage, show formatted value with commas
      const displayValue = field === 'annualUsage' && val ? 
        String(val).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') : 
        val || '';
      updateFieldText(wrap, displayValue);
      // Notify other components (Health widget) to sync
      try { 
        const eventDetail = { entity: 'account', id: state._linkedAccountId, field, value: val };
        console.log('[Contact Detail] Dispatching energy-updated event from commit:', eventDetail);
        console.log('[Contact Detail] Event detail for supplier field:', { field, value: val, entity: 'account', id: state._linkedAccountId });
        document.dispatchEvent(new CustomEvent('pc:energy-updated', { detail: eventDetail })); 
      } catch(e) { 
        console.error('[Contact Detail] Error dispatching energy-updated event:', e);
      }
    };

    const onKey = async (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); await commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancelEdit(wrap, field, current); }
    };
    input.addEventListener('keydown', onKey);
    saveBtn.addEventListener('click', async () => { await commit(); });
    cancelBtn.addEventListener('click', () => { cancelEdit(wrap, field, current); });
  }

  // Inline edit for Service Address fields (Account fields shown on Contact Detail)
  function beginEditAccountServiceAddress(wrap, field) {
    if (!wrap) return;

    const current = wrap.querySelector('.info-value-text')?.textContent || '';
    wrap.classList.add('editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-dark info-edit-input';
    input.value = current === '--' ? '' : current;
    input.placeholder = 'Enter address';

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

    const commit = async () => {
      const val = input.value.trim();
      
      // Get address index from field name
      const addressIndex = parseInt(wrap.getAttribute('data-address-index'), 10);
      if (isNaN(addressIndex)) {
        console.error('[Contact Detail] Invalid address index');
        return;
      }
      
      // Get linked account
      const linkedAccount = findAssociatedAccount(state.currentContact);
      if (!linkedAccount) {
        console.error('[Contact Detail] No linked account found');
        return;
      }
      
      // Update the address in the array
      const currentAddresses = (linkedAccount.serviceAddresses && Array.isArray(linkedAccount.serviceAddresses)) ? linkedAccount.serviceAddresses : [];
      const updatedAddresses = [...currentAddresses];
      
      if (addressIndex < updatedAddresses.length) {
        updatedAddresses[addressIndex] = { ...updatedAddresses[addressIndex], address: val };
      }
      
      // Save to account
      await saveAccountServiceAddresses(updatedAddresses);
      
      // Update display
      updateFieldText(wrap, val || '--');
    };

    const onKey = async (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); await commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancelEdit(wrap, field, current); }
    };
    input.addEventListener('keydown', onKey);
    saveBtn.addEventListener('click', async () => { await commit(); });
    cancelBtn.addEventListener('click', () => { cancelEdit(wrap, field, current); });
  }

  function beginEditPhoneField(wrap) {
    if (!wrap) return;
    
    const contact = state.currentContact;
    if (!contact) return;
    
    // Preserve original UI so Cancel can restore without persisting
    const originalValue = wrap.querySelector('.info-value-text')?.textContent || '';
    const labelEl = wrap.closest('.info-row')?.querySelector('.info-label');
    const originalLabel = labelEl ? labelEl.textContent : '';
    
    // Get all available phone numbers and add missing options
    const phoneOptions = [];
    
    // Add existing phone numbers
    if (contact.mobile) {
      phoneOptions.push({ type: 'mobile', value: contact.mobile, field: 'mobile' });
    }
    if (contact.workDirectPhone) {
      phoneOptions.push({ type: 'work direct', value: contact.workDirectPhone, field: 'workDirectPhone' });
    }
    if (contact.otherPhone) {
      phoneOptions.push({ type: 'other', value: contact.otherPhone, field: 'otherPhone' });
    }
    
    // Add missing phone type options
    if (!contact.mobile) {
      phoneOptions.push({ type: 'add mobile', value: '', field: 'mobile', isAdd: true });
    }
    if (!contact.workDirectPhone) {
      phoneOptions.push({ type: 'add work direct', value: '', field: 'workDirectPhone', isAdd: true });
    }
    if (!contact.otherPhone) {
      phoneOptions.push({ type: 'add other', value: '', field: 'otherPhone', isAdd: true });
    }
    
    // If no phone numbers exist at all, default to mobile
    if (phoneOptions.length === 0) {
      phoneOptions.push({ type: 'mobile', value: '', field: 'mobile' });
    }
    
    console.log('[Contact Detail] Phone options created:', phoneOptions);
    
    wrap.classList.add('editing');
    
    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'phone-dropdown';
    dropdown.style.display = 'block';
    dropdown.style.position = 'absolute';
    dropdown.style.top = '100%';
    dropdown.style.left = '50%';
    dropdown.style.transform = 'translateX(-50%)';
    dropdown.style.width = '220px';
    dropdown.style.minWidth = '200px';
    dropdown.style.zIndex = '1000';
    dropdown.style.background = 'var(--bg-card)';
    dropdown.style.border = '1px solid var(--border-light)';
    dropdown.style.borderRadius = 'var(--border-radius-sm)';
    dropdown.style.boxShadow = 'var(--elevation-card)';
    dropdown.style.marginTop = '4px';
    dropdown.style.maxHeight = '200px';
    dropdown.style.overflowY = 'auto';
    console.log('[Contact Detail] Created phone dropdown with', phoneOptions.length, 'options');
    
    phoneOptions.forEach((option, index) => {
      const item = document.createElement('div');
      item.className = 'phone-dropdown-item';
      if (index === 0) item.classList.add('selected');
      
      // Add inline styles to ensure proper styling
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.padding = '8px 12px';
      item.style.cursor = 'pointer';
      item.style.borderBottom = '1px solid var(--border-light)';
      item.style.transition = 'background-color 0.2s ease';
      item.style.color = 'var(--text-primary)';
      
      if (index === 0) {
        item.style.background = 'var(--primary-700)';
        item.style.color = 'white';
      }
      
      const displayText = option.isAdd ? 'Click to add' : (option.value ? formatPhoneForDisplay(option.value) : 'Click to add');
      const typeText = option.isAdd ? option.type.toUpperCase() : option.type.toUpperCase();
      
      item.innerHTML = `
        <span class="phone-type" style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase;">${escapeHtml(typeText)}</span>
        <span class="phone-number" style="font-size: 0.9rem; color: ${index === 0 ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-secondary)'};">${escapeHtml(displayText)}</span>
      `;
      
      console.log('[Contact Detail] Created dropdown item:', option.type, option.value);
      
      item.addEventListener('click', () => {
        console.log('[Contact Detail] Phone dropdown item clicked:', option);
        
        // Remove selected class from all items
        dropdown.querySelectorAll('.phone-dropdown-item').forEach(el => {
          el.classList.remove('selected');
          el.style.background = '';
          el.style.color = 'var(--text-primary)';
        });
        
        // Add selected class to clicked item
        item.classList.add('selected');
        item.style.background = 'var(--primary-700)';
        item.style.color = 'white';
        
        // Update the input value
        const input = wrap.querySelector('.info-edit-input');
        if (input) {
          input.value = option.value;
          input.dataset.selectedType = option.type;
          input.dataset.selectedField = option.field;
          console.log('[Contact Detail] Input updated:', {
            value: input.value,
            selectedType: input.dataset.selectedType,
            selectedField: input.dataset.selectedField
          });
        }
        
        // Update the field label to show visual confirmation
        const fieldLabel = wrap.closest('.info-row')?.querySelector('.info-label');
        if (fieldLabel) {
          const typeLabels = {
            'mobile': 'MOBILE',
            'add mobile': 'MOBILE',
            'work direct': 'WORK DIRECT',
            'add work direct': 'WORK DIRECT',
            'other': 'OTHER PHONE',
            'add other': 'OTHER PHONE'
          };
          const newLabel = typeLabels[option.type] || 'PHONE';
          fieldLabel.textContent = newLabel;
          console.log('[Contact Detail] Field label updated to:', newLabel);
        }
      });
      
      dropdown.appendChild(item);
    });
    
    // Create input
    const input = document.createElement('input');
    input.type = 'tel';
    input.className = 'input-dark info-edit-input';
    input.value = phoneOptions[0].value;
    input.dataset.selectedType = phoneOptions[0].type;
    input.dataset.selectedField = phoneOptions[0].field;
    input.placeholder = 'Enter phone number (e.g., 337-233-0464 ext 10117)';
    
    // Add smart real-time formatting that allows extension typing
    input.addEventListener('input', (e) => {
      const cursorPos = e.target.selectionStart;
      const rawValue = e.target.value;
      
      // Don't format if user is typing an extension
      if (isTypingExtension(rawValue, cursorPos)) {
        return; // Allow free typing for extensions
      }
      
      // Only format the main phone number part
      const formatted = formatPhoneNumberForInput(rawValue);
      if (formatted !== rawValue) {
        e.target.value = formatted;
        // Try to maintain cursor position after formatting
        const newPos = Math.min(cursorPos + (formatted.length - rawValue.length), formatted.length);
        setTimeout(() => { e.target.setSelectionRange(newPos, newPos); }, 0);
      }
    });
    
    // Create input wrapper
    const inputWrap = document.createElement('div');
    inputWrap.className = 'phone-input-wrap';
    inputWrap.style.position = 'relative'; // Ensure relative positioning for dropdown
    
    // Add helper text for extension input
    const helperText = document.createElement('div');
    helperText.className = 'phone-input-helper';
    helperText.style.fontSize = '0.75rem';
    helperText.style.color = 'var(--text-secondary)';
    helperText.style.marginTop = '4px';
    helperText.textContent = 'Tip: Add "ext 12345" or "x 12345" for extensions';
    inputWrap.appendChild(input);
    inputWrap.appendChild(helperText);
    inputWrap.appendChild(dropdown);
    console.log('[Contact Detail] Created input wrapper and appended dropdown');
    
    // Create actions
    const actions = wrap.querySelector('.info-actions');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'icon-btn-sm info-save';
    saveBtn.innerHTML = svgSave();
    saveBtn.title = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'icon-btn-sm info-cancel';
    cancelBtn.textContent = '×';
    cancelBtn.title = 'Cancel';
    
    // Replace content
    const textEl = wrap.querySelector('.info-value-text');
    if (textEl && textEl.parentElement) textEl.parentElement.replaceChild(inputWrap, textEl);
    
    if (actions) {
      actions.innerHTML = '';
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
    }
    
    setTimeout(() => input.focus(), 0);
    
    // Event handlers
    const onKey = async (ev) => {
      if (ev.key === 'Enter') { 
        ev.preventDefault(); 
        await commitPhoneEdit(wrap, input.value, input.dataset.selectedField, input.dataset.selectedType); 
      }
      else if (ev.key === 'Escape') { 
        ev.preventDefault(); 
        cancelEdit(wrap, 'phone', wrap.querySelector('.info-value-text')?.textContent || ''); 
      }
    };
    
    input.addEventListener('keydown', onKey);
    saveBtn.addEventListener('click', async () => { 
      console.log('[Contact Detail] Save button clicked with:', {
        value: input.value,
        selectedField: input.dataset.selectedField,
        selectedType: input.dataset.selectedType
      });
      await commitPhoneEdit(wrap, input.value, input.dataset.selectedField, input.dataset.selectedType); 
    });
    cancelBtn.addEventListener('click', () => { 
      // Restore original label and value; do not save
      if (labelEl && originalLabel) labelEl.textContent = originalLabel;
      state.preferredPhoneField = '';
      cancelEdit(wrap, 'phone', originalValue); 
    });
    
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
      if (!wrap.contains(e.target)) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeDropdown);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeDropdown);
    }, 100);
  }

  async function commitPhoneEdit(wrap, value, field, type) {
    const normalizedValue = normalizePhone(value);
    console.log('[Contact Detail] commitPhoneEdit called with:', { value, field, type, normalizedValue });
    
    console.log('[Contact Detail] Calling saveField with:', { field, normalizedValue });
    // Prevent accidental clearing when selecting an "Add <type>" option without entering a value
    if (!normalizedValue || !String(normalizedValue).trim()) {
      try { window.crm?.showToast && window.crm.showToast('Enter a phone number or press Escape to cancel'); } catch(_) {}
      // Restore previous UI without saving
      cancelEdit(wrap, 'phone', wrap.querySelector('.info-value-text')?.textContent || '');
      return;
    }
    await saveField(field, normalizedValue);
    // Remember the chosen field so the primary row reflects it on re-render
    state.preferredPhoneField = field;
    // Persist preferred type so it remains default on next load
    try { await setPreferredPhoneType(field); } catch(_) {}
    
    // Update the contact data
    if (state.currentContact) {
      state.currentContact[field] = normalizedValue;
      console.log('[Contact Detail] Updated contact data:', state.currentContact[field]);
    }
    
    // Update the field display to show the new field name and value
    const fieldLabel = wrap.closest('.info-row')?.querySelector('.info-label');
    if (fieldLabel) {
      // Update the field label to show the selected type
      const typeLabels = {
        'mobile': 'MOBILE',
        'workDirectPhone': 'WORK DIRECT',
        'otherPhone': 'OTHER PHONE'
      };
      fieldLabel.textContent = typeLabels[field] || 'PHONE';
      console.log('[Contact Detail] Updated field label to:', fieldLabel.textContent);
    }
    
    // Update the field value display with formatted version
    const formattedDisplay = formatPhoneForDisplay(normalizedValue);
    updateFieldText(wrap, formattedDisplay);
    console.log('[Contact Detail] Updated field text to:', normalizedValue);
    
    // Re-render the phone row with new primary phone
    const phoneRow = wrap.closest('.info-row');
    if (phoneRow) {
      console.log('[Contact Detail] Re-rendering phone row');
      const newPhoneRow = renderPhoneRow(state.currentContact);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newPhoneRow;
      const newRow = tempDiv.firstElementChild;
      phoneRow.parentElement.replaceChild(newRow, phoneRow);
      
      // Process click-to-call for the new phone row
      setTimeout(() => {
        try { 
          window.ClickToCall && window.ClickToCall.processSpecificPhoneElements && window.ClickToCall.processSpecificPhoneElements(); 
        } catch (_) {}
      }, 50);
    }
    // Clear preferred override after re-render so subsequent loads use normal priority
    setTimeout(() => { state.preferredPhoneField = ''; }, 0);
  }

  async function commitEdit(wrap, field, value) {
    let outVal = value;
    if (field === 'phone' || field === 'mobile' || field === 'workDirectPhone' || field === 'otherPhone' || field === 'companyPhone') {
      outVal = normalizePhone(value);
    }
    await saveField(field, outVal);
    updateFieldText(wrap, outVal);
  }

  // Commit edit for Account fields (Energy & Contract) shown on Contact Detail
  async function commitEditAccountField(wrap, field, value) {
    console.log('[Contact Detail] commitEditAccountField called:', { field, value, type: typeof value });
    let outVal = value;
    if (field === 'contractEndDate') {
      console.log('[Contact Detail] Processing contractEndDate:', { original: value });
      outVal = toMDY(value);
      console.log('[Contact Detail] Converted to MDY:', { converted: outVal });
    }
    console.log('[Contact Detail] Saving to Firebase:', { field, outVal });
    await saveAccountField(field, outVal);
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

  // ===== Recent Calls (Contact) =====

  // Avatar + helper utilities for transcript rendering
  function cd_getAgentAvatar(){ return `<div class="transcript-avatar-circle agent-avatar" aria-hidden="true">Y</div>`; }
  function cd_getContactAvatar(contactName, call){
    const c = (window.getPeopleData && call && call.contactId) ? (getContactById(call.contactId) || null) : null;
    if (c && c.firstName){
      const initials = (c.firstName.charAt(0) + (c.lastName ? c.lastName.charAt(0) : '')).toUpperCase();
      return `<div class="transcript-avatar-circle contact-avatar" aria-hidden="true">${initials}</div>`;
    }
    const domain = cd_extractDomainFromAccount(call && (call.accountName || ''));
    if (domain){
      const fb = (typeof window.__pcAccountsIcon === 'function') ? window.__pcAccountsIcon() : '<span class="company-favicon" aria-hidden="true" style="display:inline-block;width:16px;height:16px;"></span>';
      return `<div class="transcript-avatar-circle company-avatar" aria-hidden="true">${window.__pcFaviconHelper ? window.__pcFaviconHelper.generateFaviconHTML(domain, 64) : fb}</div>`;
    }
    const initial = (String(contactName||'C').charAt(0) || 'C').toUpperCase();
    return `<div class="transcript-avatar-circle contact-avatar" aria-hidden="true">${initial}</div>`;
  }
  function cd_extractDomainFromAccount(name){
    if (!name) return '';
    const key = String(name).trim().toLowerCase();
    try{
      if (typeof window.getAccountsData === 'function'){
        const accounts = window.getAccountsData() || [];
        const hit = accounts.find(a => String(a.name||a.accountName||'').trim().toLowerCase() === key);
        const dom = hit && (hit.domain || hit.website || '').toString();
        if (dom) return dom.replace(/^https?:\/\//,'').replace(/\/$/,'');
      }
    }catch(_){}
    return '';
  }
  function cd_normalizeSupplierTokens(s){ try{ if(!s) return ''; let out=String(s); out=out.replace(/\bT\s*X\s*U\b/gi,'TXU'); out=out.replace(/\bN\s*R\s*G\b/gi,'NRG'); out=out.replace(/\breliant\b/gi,'Reliant'); return out; }catch(_){ return s||''; } }

  async function loadRecentCallsForContact(){
    const list = document.getElementById('contact-recent-calls-list');
    if (!list || !state.currentContact) return;
    const contactId = state.currentContact.id;
    const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
    
    // Loading recent calls for contact
    
    try {
      const r = await fetch(`${base}/api/calls`);
      const j = await r.json().catch(()=>({}));
      const calls = (j && j.ok && Array.isArray(j.calls)) ? j.calls : [];
      
      // Raw calls loaded from API
      
      const nums = collectContactPhones(state.currentContact).map(n=>n.replace(/\D/g,'').slice(-10)).filter(Boolean);
      // De-duplicate numbers (mobile equals company, etc.)
      const uniq = Array.from(new Set(nums));
      
      // Contact phone numbers collected for filtering
      
      // Include calls that match by explicit contactId OR any of the contact/company numbers
      let filtered = calls.filter(c => {
        const matchByContactId = c.contactId && c.contactId === contactId;
        const to10 = String(c.to||'').replace(/\D/g,'').slice(-10);
        const from10 = String(c.from||'').replace(/\D/g,'').slice(-10);
        const matchByPhone = uniq.includes(to10) || uniq.includes(from10);
        
        // Additional matching: check targetPhone field
        const targetPhone = String(c.targetPhone||'').replace(/\D/g,'').slice(-10);
        const matchByTargetPhone = targetPhone && uniq.includes(targetPhone);
        
        const shouldInclude = matchByContactId || matchByPhone || matchByTargetPhone;
        
        // Debug logging for troubleshooting
        if (shouldInclude) {
          console.log('[Contact Detail] Recent call included:', {
            callSid: c.callSid || c.id,
            contactId: c.contactId,
            contactName: c.contactName,
            accountId: c.accountId,
            accountName: c.accountName,
            to: c.to,
            from: c.from,
            targetPhone: c.targetPhone,
            matches: {
              byContactId: matchByContactId,
              byPhone: matchByPhone,
              byTargetPhone: matchByTargetPhone
            }
          });
        }
        
        return shouldInclude;
      });
      // Sort newest first by available timestamp field
      filtered.sort((a,b)=>{
        const at = new Date(a.callTime || a.timestamp || 0).getTime();
        const bt = new Date(b.callTime || b.timestamp || 0).getTime();
        return bt - at;
      });
      
      // Final filtered calls ready for display
      
      // Save to state and initialize pagination
      try { state._rcCalls = filtered; } catch(_) {}
      try { if (typeof state._rcPage !== 'number' || !state._rcPage) state._rcPage = 1; } catch(_) {}
      // DEBUG: show mapping coverage
      try {
        console.log('[Contact Detail][Recent Calls] Contact:', {
          contactId,
          name: [state.currentContact?.firstName, state.currentContact?.lastName].filter(Boolean).join(' ') || state.currentContact?.name,
          phones: nums
        });
        console.log('[Contact Detail][Recent Calls] Filtered calls:', filtered.map(c=>({ id:c.id, to:c.to, from:c.from, contactName:c.contactName, accountName:c.accountName })));
      } catch(_) {}
      // Enrich each call with direction and pretty counterparty number like the Calls page
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
        c.contactPhone = c.contactPhone || pretty;
        // Fill missing names from current contact/account context
        try {
          if (!c.contactName) {
            const fullName = [state.currentContact?.firstName, state.currentContact?.lastName].filter(Boolean).join(' ') || state.currentContact?.name;
            if (fullName) c.contactName = fullName;
          }
          if (!c.accountName) {
            // Try to resolve account from contact
            const acctName = state.currentContact?.companyName || state.currentContact?.accountName || '';
            if (acctName) c.accountName = acctName;
          }
        } catch(_) {}
        try { if (window.CRM_DEBUG_CALLS) console.log('[Contact Detail][enrich]', { id:c.id, direction:c.direction, number:c.counterpartyPretty, contactName:c.contactName, accountName:c.accountName }); } catch(_) {}
      });
      renderRecentCallsPage();
      bindRecentCallsPager();
      try { window.ClickToCall?.processSpecificPhoneElements?.(); } catch(_) {}
      // Clear the reload flag after successful load
      try { state._rcReloadInFlight = false; } catch(_) {}
    } catch (e) {
      console.warn('[RecentCalls][Contact] load failed', e);
      list.innerHTML = '<div class="rc-empty">Failed to load recent calls</div>';
    }
  }

  const RC_PAGE_SIZE = 5;
  function getRecentCallsPageSlice(){
    const calls = Array.isArray(state._rcCalls) ? state._rcCalls : [];
    const page = Math.max(1, parseInt(state._rcPage||1, 10));
    const start = (page - 1) * RC_PAGE_SIZE;
    return calls.slice(start, start + RC_PAGE_SIZE);
  }

  function renderRecentCallsPage(){
    const list = document.getElementById('contact-recent-calls-list');
    if (!list) return;
    const total = Array.isArray(state._rcCalls) ? state._rcCalls.length : 0;
    if (!total) { rcUpdateListAnimated(list, '<div class="rc-empty">No recent calls</div>'); updateRecentCallsPager(0,0); return; }
    const slice = getRecentCallsPageSlice();
    rcUpdateListAnimated(list, slice.map(call => rcItemHtml(call)).join(''));
      // delegate click to handle dynamic rerenders
      list.querySelectorAll('.rc-insights').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const call = (state._rcCalls||[]).find(x=>String(x.id)===String(id));
          if (!call) return;
          if (btn.classList.contains('not-processed')) {
            const callSid = call.id || call.twilioSid || call.callSid;
            const recordingSid = call.recordingSid || call.recording_id;
            triggerContactCI(callSid, recordingSid, btn);
            return;
          }
          toggleRcDetails(btn, call);
        });
      });
    const totalPages = Math.max(1, Math.ceil(total / RC_PAGE_SIZE));
    updateRecentCallsPager(state._rcPage||1, totalPages);
  }

  function rcSpinnerHtml(){ return '<div class="rc-loading"><div class="rc-spinner" aria-hidden="true"></div></div>'; }
  function rcSetLoading(list){
    try {
      // Overlay spinner without clearing existing rows to prevent flicker
      let ov = list.querySelector('.rc-loading-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.className = 'rc-loading-overlay';
        ov.innerHTML = rcSpinnerHtml();
        ov.style.position = 'absolute';
        ov.style.inset = '0';
        ov.style.display = 'flex';
        ov.style.alignItems = 'center';
        ov.style.justifyContent = 'center';
        ov.style.pointerEvents = 'none';
        list.appendChild(ov);
      }
      ov.style.display = 'flex';
    } catch(_) {}
  }
  function rcUpdateListAnimated(list, html){
    try {
      // Preserve expanded insights dropdowns before refresh
      const expandedInsights = [];
      list.querySelectorAll('.rc-details').forEach(details => {
        const item = details.previousElementSibling;
        if (item && item.classList.contains('rc-item')) {
          const insightsBtn = item.querySelector('.rc-insights');
          if (insightsBtn) {
            const callId = insightsBtn.getAttribute('data-id');
            if (callId) {
              expandedInsights.push({
                callId: callId,
                content: details.innerHTML
              });
            }
          }
        }
      });

      const startH = list.offsetHeight;
      list.style.height = startH + 'px';
      list.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        list.innerHTML = html;
        // Remove any lingering overlay after content update
        try { const ov = list.querySelector('.rc-loading-overlay'); if (ov) ov.remove(); } catch(_) {}
        
        // Restore expanded insights dropdowns (avoid nesting rc-details-inner repeatedly)
        expandedInsights.forEach(expanded => {
          const insightsBtn = list.querySelector(`.rc-insights[data-id="${expanded.callId}"]`);
          if (insightsBtn) {
            const item = insightsBtn.closest('.rc-item');
            if (item) {
              const panel = document.createElement('div');
              panel.className = 'rc-details';
              // expanded.content already contains rc-details-inner wrapper
              panel.innerHTML = expanded.content;
              item.insertAdjacentElement('afterend', panel);
              // Don't animate the restore - just show it
              panel.style.height = 'auto';
              panel.style.opacity = '1';
            }
          }
        });
        
        const targetH = list.scrollHeight;
        list.style.transition = 'height 220ms ease, opacity 220ms ease';
        list.style.opacity = '1';
        list.style.height = targetH + 'px';
        setTimeout(() => {
          list.style.height = '';
          list.style.transition = '';
          list.style.overflow = '';
        }, 260);
      });
    } catch(_) { list.innerHTML = html; }
  }

  function bindRecentCallsPager(){
    const pager = document.getElementById('contact-rc-pager');
    const prev = document.getElementById('rc-prev');
    const next = document.getElementById('rc-next');
    if (!pager || pager._bound) return;
    prev?.addEventListener('click', (e)=>{ e.preventDefault(); const total = Math.ceil((state._rcCalls||[]).length/RC_PAGE_SIZE)||1; state._rcPage = Math.max(1, (state._rcPage||1) - 1); renderRecentCallsPage(); updateRecentCallsPager(state._rcPage, total); });
    next?.addEventListener('click', (e)=>{ e.preventDefault(); const total = Math.ceil((state._rcCalls||[]).length/RC_PAGE_SIZE)||1; state._rcPage = Math.min(total, (state._rcPage||1) + 1); renderRecentCallsPage(); updateRecentCallsPager(state._rcPage, total); });
    pager._bound = '1';
  }

  function updateRecentCallsPager(current, total){
    const pager = document.getElementById('contact-rc-pager');
    const info = document.getElementById('rc-info');
    const prev = document.getElementById('rc-prev');
    const next = document.getElementById('rc-next');
    if (!pager || !info || !prev || !next) return;
    const show = total > 1;
    pager.style.display = show ? 'flex' : 'none';
    info.textContent = `${Math.max(1, parseInt(current||1,10))} of ${Math.max(1, parseInt(total||1,10))}`;
    prev.disabled = (current <= 1);
    next.disabled = (current >= total);
  }

  function safeReloadRecentCallsWithRetries(){
    try { if (_rcRetryTimer) { clearTimeout(_rcRetryTimer); _rcRetryTimer = null; } } catch(_) {}
    let attempts = 0;
    const run = () => {
      attempts++;
      try { loadRecentCallsForContact(); } catch(_) {}
      if (attempts < 10) { // ~8–10s coverage with 900ms spacing
        _rcRetryTimer = setTimeout(run, 900);
      }
    };
    run();
  }

  function collectContactPhones(c){
    const arr = [c.mobile, c.workDirectPhone, c.otherPhone];
    try { const company = getCompanyPhone(c); if (company) arr.push(company); } catch(_){}
    return arr.filter(Boolean);
  }

  function rcItemHtml(c){
    // Prefer contact name; if absent (company call), show company once
    const hasContact = !!(c.contactId && c.contactName);
    const rawCompany = String(c.accountName || c.company || '');
    const displayName = hasContact ? String(c.contactName) : rawCompany || 'Unknown';
    const name = escapeHtml(displayName);
    const company = escapeHtml(rawCompany);
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
    
    // Prefer the real dialed/peer number: use targetPhone/to/from; fallback to counterpartyPretty
    const phone = escapeHtml(String(c.targetPhone || c.to || c.from || c.contactPhone || c.counterpartyPretty || ''));
    const direction = escapeHtml((c.direction || '').charAt(0).toUpperCase() + (c.direction || '').slice(1));
    // Only append company if we have a real contact and company differs
    const title = `${name}${(hasContact && rawCompany && rawCompany !== displayName) ? ` • ${company}` : ''}`;

    return `
      <div class="rc-item">
        <div class="rc-meta">
          <div class="rc-title">${title}</div>
          <div class="rc-sub">${when} • <span class="rc-duration">${durStr}</span> • <span class="phone-number" 
                                 data-contact-id="${c.contactId || state.currentContact?.id || ''}" 
                                 data-account-id="${c.accountId || state.currentContact?.accountId || ''}" 
                                 data-contact-name="${escapeHtml(name)}" 
                                 data-company-name="${escapeHtml(company)}">${phone}</span>${direction?` • ${direction}`:''}</div>
        </div>
        <div class="rc-actions">
          <span class="rc-outcome">${outcome}</span>
          <button type="button" class="rc-icon-btn rc-insights ${(!c.transcript || !c.aiInsights || Object.keys(c.aiInsights || {}).length === 0) ? 'not-processed' : ''}" data-id="${escapeHtml(String(c.id||''))}" aria-label="View insights" title="${(!c.transcript || !c.aiInsights || Object.keys(c.aiInsights || {}).length === 0) ? 'Process Call' : 'View AI insights'}">${svgEye()}</button>
        </div>
      </div>`;
  }

  // Trigger on-demand CI processing for a call (Contact Detail)
  async function triggerContactCI(callSid, recordingSid, btn) {
    if (!callSid) {
      console.warn('[ContactDetail] Missing callSid for CI processing:', { callSid, recordingSid });
      return;
    }
    
    // Use shared CI processor for consistent functionality
    if (window.SharedCIProcessor) {
      const success = await window.SharedCIProcessor.processCall(callSid, recordingSid, btn, {
        context: 'contact-detail',
        onSuccess: (call) => {
          console.log('[ContactDetail] CI processing completed:', call);
          
          // Update state cache so future renders show full insights
          try {
            if (Array.isArray(state._rcCalls)) {
              const idMatch = String(callSid);
              state._rcCalls = state._rcCalls.map(x => {
                const xid = String(x.id || x.twilioSid || x.callSid || '');
                if (xid === idMatch) {
                  return { 
                    ...x, 
                    transcript: call.transcript || x.transcript, 
                    formattedTranscript: call.formattedTranscript || x.formattedTranscript, 
                    aiInsights: call.aiInsights || x.aiInsights, 
                    conversationalIntelligence: call.conversationalIntelligence || x.conversationalIntelligence 
                  };
                }
                return x;
              });
            }
          } catch(_) {}
        },
        onError: (error) => {
          console.error('[ContactDetail] CI processing failed:', error);
        }
      });
      
      return;
    }
    
    // If no recordingSid provided, the API will look it up by callSid
    if (!recordingSid) {
      try { console.log('[ContactDetail] No recordingSid provided, API will look up recording for callSid:', callSid); } catch(_) {}
    }
    try {
      // Show loading spinner on the button (scoped, consistent across pages)
      try { 
        btn.innerHTML = '<span class="ci-btn-spinner" aria-hidden="true"></span>'; 
        btn.classList.add('processing'); 
        btn.disabled = true; 
      } catch(_) {}
      // Toast
      try { 
        if (window.ToastManager) { 
          window.ToastManager.showToast({
            type: 'info',
            title: 'Processing Call',
            message: 'Starting conversational intelligence analysis...',
            sound: false
          }); 
        } 
      } catch(_) {}
      let base = (window.crm && typeof window.crm.getApiBaseUrl === 'function')
        ? window.crm.getApiBaseUrl()
        : (window.PUBLIC_BASE_URL || window.API_BASE_URL || 'https://power-choosers-crm.vercel.app');
      base = String(base).replace(/\/$/, '');
      const response = await fetch(`${base}/api/twilio/ci-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid: callSid, recordingSid: recordingSid })
      });
      if (response.status === 404) {
        try { 
          if (window.ToastManager) { 
            window.ToastManager.showToast({
              type: 'warning',
              title: 'Recording Not Ready',
              message: 'Please wait 5-10 seconds for the recording to be processed, then try again.'
            }); 
          } 
        } catch(_) {}
        try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
        return;
      }
      if (!response.ok) {
        try {
          const err = await response.json().catch(()=>({}));
          console.error('[ContactDetail] CI request error response:', response.status, err);
          const msg = (err && (err.error || err.details)) ? String(err.error || err.details) : `CI request failed: ${response.status} ${response.statusText}`;
          if (window.ToastManager) { window.ToastManager.showToast(msg, 'error'); }
        } catch(_) {
          try { 
            if (window.ToastManager) { 
              window.ToastManager.showToast({
                type: 'error',
                title: 'Processing Failed',
                message: 'Unable to start call analysis. Please try again.'
              }); 
            } 
          } catch(__) {}
        }
        try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
        return;
      }
      const result = await response.json().catch(()=>({}));
      try { console.log('[ContactDetail] CI processing initiated:', result); } catch(_) {}
      
      // Keep spinner; backend/webhook will update UI when analysis completes
      try { 
        btn.title = 'Processing call insights...'; 
        btn.classList.remove('not-processed'); 
        btn.classList.add('processing'); 
        
        // Store transcript SID for status checking
        if (result.transcriptSid) {
          btn.setAttribute('data-transcript-sid', result.transcriptSid);
        }
      } catch(_) {}
      
      // Poll for insights becoming available and enable the button when ready
      try {
        pollInsightsUntilReady(callSid, btn);
      } catch(_) {}
      
      // Show success toast with transcript SID for debugging
      try { 
        if (window.ToastManager && result.transcriptSid) { 
          window.ToastManager.showToast({
            type: 'success',
            title: 'Processing Started',
            message: `Transcript ID: ${result.transcriptSid.substring(0, 8)}...`
          }); 
        } 
      } catch(_) {}
    } catch (error) {
      try { console.error('[ContactDetail] Failed to trigger CI processing:', error); } catch(_) {}
      // Reset button state on error
      try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.disabled = false; } catch(_) {}
      try { 
        if (window.ToastManager) { 
          window.ToastManager.showToast({
            type: 'error',
            title: 'Processing Failed',
            message: 'Unable to start call analysis. Please try again.'
          }); 
        } 
      } catch(_) {}
    }
  }

  // Poll /api/calls for this call until transcript and aiInsights are present, then enable insights button
  function pollInsightsUntilReady(callSid, btn){
    let attempts = 0;
    const maxAttempts = 40; // ~2 minutes at 3s
    const delayMs = 3000;
    const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm.vercel.app';
    const isReady = (call) => {
      const hasTranscript = !!(call && typeof call.transcript === 'string' && call.transcript.trim());
      const insights = call && call.aiInsights;
      const hasInsights = !!(insights && typeof insights === 'object' && Object.keys(insights).length > 0);
      const ci = call && call.conversationalIntelligence;
      const ciCompleted = !!(ci && typeof ci.status === 'string' && ci.status.toLowerCase() === 'completed');
      return (hasTranscript && hasInsights) || (hasTranscript && ciCompleted);
    };
    const finalizeReady = (call) => {
      try {
        // Update state cache so future clicks render full insights
        if (Array.isArray(state._rcCalls)) {
          const idMatch = String(callSid);
          state._rcCalls = state._rcCalls.map(x => {
            const xid = String(x.id || x.twilioSid || x.callSid || '');
            if (xid === idMatch) {
              return { ...x, transcript: call.transcript || x.transcript, formattedTranscript: call.formattedTranscript || x.formattedTranscript, aiInsights: call.aiInsights || x.aiInsights, conversationalIntelligence: call.conversationalIntelligence || x.conversationalIntelligence };
            }
            return x;
          });
        }
      } catch(_) {}
      try { btn.innerHTML = svgEye(); btn.classList.remove('processing', 'not-processed'); btn.disabled = false; btn.title = 'View AI insights'; } catch(_) {}
      try { if (window.ToastManager) { window.ToastManager.showToast({ type: 'success', title: 'Insights Ready', message: 'Click the eye icon to view call insights.' }); } } catch(_) {}
    };
    const attempt = () => {
      attempts++;
      fetch(`${base}/api/calls?callSid=${encodeURIComponent(callSid)}`)
        .then(r => r.json()).then(j => {
          const call = j && j.ok && Array.isArray(j.calls) && j.calls[0];
          if (call && isReady(call)) { finalizeReady(call); return; }
          if (attempts < maxAttempts) {
            // Kick a fallback poll to server to upsert if webhook raced or failed
            try {
              const ci = call && call.conversationalIntelligence; const tsid = ci && ci.transcriptSid;
              if (!isReady(call) && tsid) {
                fetch(`${base}/api/twilio/poll-ci-analysis`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ transcriptSid: tsid, callSid }) })
                  .then(r=>r.json()).then(()=>{})
                  .catch(()=>{});
              }
            } catch(_) {}
            setTimeout(attempt, delayMs);
          }
          else {
            try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
          }
        }).catch(()=>{
          if (attempts < maxAttempts) { setTimeout(attempt, delayMs); }
          else {
            try { btn.innerHTML = svgEye(); btn.classList.remove('processing'); btn.classList.add('not-processed'); btn.disabled = false; btn.title = 'Process Call'; } catch(_) {}
          }
        });
    };
    attempt();
  }

  // Inline expanding details under an rc-item
  function toggleRcDetails(btn, call){
    const item = btn.closest('.rc-item');
    if (!item) return;
    const existing = item.nextElementSibling && item.nextElementSibling.classList && item.nextElementSibling.classList.contains('rc-details') ? item.nextElementSibling : null;
    const idStr = String(call.id || call.twilioSid || call.callSid || '');
    if (existing) {
      // Track explicit close so periodic refresh pauses correctly
      try { if (state._rcOpenIds && state._rcOpenIds instanceof Set) state._rcOpenIds.delete(idStr); } catch(_) {}
      // collapse then remove
      animateCollapse(existing, () => existing.remove());
      return;
    }
    // Ensure open tracker exists and add current id
    try { if (!state._rcOpenIds || !(state._rcOpenIds instanceof Set)) state._rcOpenIds = new Set(); state._rcOpenIds.add(idStr); } catch(_) {}
    const panel = document.createElement('div');
    panel.className = 'rc-details';
    panel.innerHTML = `<div class="rc-details-inner">${insightsInlineHtml(call)}</div>`;
    item.insertAdjacentElement('afterend', panel);
    animateExpand(panel);

    // Background transcript fetch if missing
    try {
      const candidateSid = call.twilioSid || call.callSid || (typeof call.id==='string' && /^CA[0-9a-zA-Z]+$/.test(call.id) ? call.id : '');
      if ((!call.transcript || String(call.transcript).trim()==='') && candidateSid) {
        const base = (window.API_BASE_URL || '').replace(/\/$/, '');
        const url = base ? `${base}/api/twilio/ai-insights` : '/api/twilio/ai-insights';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: candidateSid })
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
    el.style.height = '0px'; el.style.opacity = '0';
    const h = el.scrollHeight; // measure
    requestAnimationFrame(()=>{
      el.classList.add('expanding');
      el.style.transition = 'height 180ms ease, opacity 180ms ease';
      el.style.height = h + 'px'; el.style.opacity = '1';
      setTimeout(()=>{ el.style.height = ''; el.style.transition = ''; el.classList.remove('expanding'); }, 200);
    });
  }
  function animateCollapse(el, done){
    const h = el.scrollHeight;
    el.style.height = h + 'px'; el.style.opacity = '1';
    requestAnimationFrame(()=>{
      el.classList.add('collapsing');
      el.style.transition = 'height 140ms ease, opacity 140ms ease';
      el.style.height = '0px'; el.style.opacity = '0';
      setTimeout(()=>{ el.classList.remove('collapsing'); done && done(); }, 160);
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

    // Helper to normalize values across snake_case and camelCase keys
    const get = (obj, keys, d='') => { for (const k of keys){ const v = obj && obj[k]; if (v !== undefined && v !== null && v !== '') return v; } return d; };

    // Transcript rendering with speaker/timestamp lines
    const toMMSS = (s)=>{ const m=Math.floor((s||0)/60), ss=(s||0)%60; return `${String(m)}:${String(ss).padStart(2,'0')}`; };
    function parseSpeakerTranscript(text){
      const out=[]; if(!text) return out; const lines=String(text).split(/\r?\n/);
      for(const raw of lines){
        const line = raw.trim(); if(!line) continue;
        let m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+(\d+):(\d{2}):\s*(.*)$/);
        if(!m){ m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+\d+\s+(\d+):(\d{2}):\s*(.*)$/); if(m){ m=[m[0],m[1],m[2],m[3],m[4]]; } }
        if(m){ const label=m[1].trim(); const mm=parseInt(m[2],10)||0; const ss=parseInt(m[3],10)||0; const txt=m[4]||''; out.push({label, t:mm*60+ss, text:txt}); continue; }
        out.push({label:'', t:null, text:line});
      }
      return out;
    }
    function renderTranscriptHtml(A, raw){
      let turns = Array.isArray(A?.speakerTurns) ? A.speakerTurns : [];
      // If roles missing, alternate
      if (turns.length && !turns.some(t=>t && (t.role==='agent'||t.role==='customer'))){
        let next='customer';
        turns = turns.map(t=>({ t:Number(t.t)||0, role: next = (next==='agent'?'customer':'agent'), text: t.text||'' }));
      }
      if (turns.length){
        const contactFirst = (String(r.contactName||'').trim().split(/\s+/)[0]) || 'Customer';
        const groups = [];
        let current=null;
        for(const t of turns){
          const roleKey = t.role==='agent' ? 'agent' : (t.role==='customer' ? 'customer' : 'other');
          const text = cd_normalizeSupplierTokens(t.text||'');
          const ts = Number(t.t)||0;
          if(current && current.role===roleKey){ current.texts.push(text); current.end=ts; }
          else { if(current) groups.push(current); current={ role:roleKey, start:ts, texts:[text] }; }
        }
        if(current) groups.push(current);
        return groups.map(g=>{
          const label = g.role==='agent' ? 'You' : (g.role==='customer' ? contactFirst : 'Speaker');
          const avatar = g.role==='agent' ? cd_getAgentAvatar() : cd_getContactAvatar(contactFirst, r);
          return `<div class=\"transcript-message ${g.role}\"><div class=\"transcript-avatar\">${avatar}</div><div class=\"transcript-content\"><div class=\"transcript-header\"><span class=\"transcript-speaker\">${label}</span><span class=\"transcript-time\">${toMMSS(g.start)}</span></div><div class=\"transcript-text\">${escapeHtml(g.texts.join(' ').trim())}</div></div></div>`;
        }).join('');
      }
      const parsed = parseSpeakerTranscript(raw||'');
      if(parsed.some(p=>p.label && p.t!=null)){
        const contactFirst = (String(r.contactName||'').trim().split(/\s+/)[0]) || 'Customer';
        let toggle='customer';
        return parsed.map(p=>{
          if(!p.label) return `<div class=\"transcript-message\"><div class=\"transcript-content\"><div class=\"transcript-text\">${escapeHtml(p.text||'')}</div></div></div>`;
          let roleLabel=p.label; let role='other';
          if(/^speaker\b/i.test(roleLabel)){ roleLabel = (toggle==='agent') ? 'You' : contactFirst; role=toggle; toggle=(toggle==='agent')?'customer':'agent'; }
          const avatar = role==='agent'?cd_getAgentAvatar():cd_getContactAvatar(contactFirst, r);
          return `<div class=\"transcript-message ${role}\"><div class=\"transcript-avatar\">${avatar}</div><div class=\"transcript-content\"><div class=\"transcript-header\"><span class=\"transcript-speaker\">${escapeHtml(roleLabel)}</span><span class=\"transcript-time\">${toMMSS(p.t)}</span></div><div class=\"transcript-text\">${escapeHtml(p.text||'')}</div></div></div>`;
        }).join('');
      }
      const fallback = raw || (A && Object.keys(A).length ? 'Transcript processing...' : 'Transcript not available');
      return escapeHtml(fallback);
    }

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
    // Prefer CI sentences + channelRoleMap for dual-channel mapping; fallback to formatted/plain transcript
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
        const transcriptToUse = r.formattedTranscript || r.transcript;
        transcriptHtml = renderTranscriptHtml(AI, transcriptToUse);
      }
    } catch (_){
      try { const transcriptToUse = r.formattedTranscript || r.transcript; transcriptHtml = renderTranscriptHtml(AI, transcriptToUse); } catch(__){ transcriptHtml = 'Transcript not available'; }
    }
    const rawRec = r.audioUrl || r.recordingUrl || '';
    let audioSrc = '';
    if (rawRec) {
      if (String(rawRec).includes('/api/recording?url=')) {
        audioSrc = rawRec;
      } else {
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
        const playbackBase = /localhost|127\.0\.0\.1/.test(base) ? 'https://power-choosers-crm.vercel.app' : base;
        audioSrc = `${playbackBase}/api/recording?url=${encodeURIComponent(rawRec)}`;
      }
    }
    const audio = audioSrc ? `<audio controls style="width:100%; margin-top:8px;"><source src="${audioSrc}" type="audio/mpeg">Your browser does not support audio playback.</audio>` : '<div style="color:var(--text-muted); font-size:12px;">No recording available</div>';
    const hasAI = AI && Object.keys(AI).length > 0;

    // Energy & Contract details
    // Friendly long date formatter, e.g., "April 19, 2026"
    function toLongDate(v){
      try{
        const d = parseDateFlexible(v);
        if(!d) return v || '';
        return d.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
      }catch(_){ return v || ''; }
    }

    const contract = AI.contract || {};
    const rate = get(contract, ['currentRate','current_rate','rate'], 'Unknown');
    const supplier = get(contract, ['supplier','utility'], 'Unknown');
    const contractEnd = get(contract, ['contractEnd','contract_end','endDate'], 'Not discussed');
    const contractEndDisplay = contractEnd ? toLongDate(contractEnd) : 'Not discussed';
    const usage = String(get(contract, ['usageKWh','usage_k_wh','usage'], 'Not provided'));
    const rateType = get(contract, ['rateType','rate_type'], 'Unknown');
    const contractLength = String(get(contract, ['contractLength','contract_length'], 'Unknown'));
    const budget = get(AI, ['budget'], 'Unclear');
    const timeline = get(AI, ['timeline'], 'Not specified');
    const entities = Array.isArray(AI.entities) ? AI.entities : [];
    const entitiesHtml = entities.length ? entities.slice(0,20).map(e=>`<span class="pc-chip">${escapeHtml(e.type||'Entity')}: ${escapeHtml(e.text||'')}</span>`).join('') : '<span class="pc-chip">None</span>';
    return `
      <div class="insights-grid">
        <div>
          <div class="ip-card">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline></svg>
              AI Call Summary
            </h4>
            <div class="pc-chips" style="margin:6px 0 10px 0;">${chips}</div>
            <div style="color:var(--text-secondary); line-height:1.5; margin-bottom:8px;">${escapeHtml(paragraph)}</div>
            ${filteredBullets.length ? `<ul class="summary-bullets" style="margin:0; padding-left:18px; color:var(--text-secondary);">${filteredBullets.map(b=>`<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
          </div>
          <div class="ip-card" style="margin-top:12px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Call Transcript
            </h4>
            <div class=\"pc-transcript-container\">${transcriptHtml}</div>
          </div>
        </div>
        <div>
          <div class="ip-card">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Call Recording
            </h4>
            <div style="color:var(--text-secondary); font-style:italic;">${audio}</div>
            ${audioSrc ? '' : '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">Recording may take 1-2 minutes to process after call completion</div>'}
            ${audioSrc && r.recordingChannels ? `<div style="color:var(--text-secondary); font-size:12px; margin-top:4px;">Recording: ${r.recordingChannels === '2' ? 'Dual-Channel (2 Channels)' : 'Single Channel'} • Source: ${r.recordingSource || 'Unknown'}</div>` : ''}
            ${hasAI ? '<div style="color:var(--orange-subtle); font-size:12px; margin-top:4px;">✓ AI analysis completed</div>' : '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">AI analysis in progress...</div>'}
          </div>
          <div class="ip-card" style="margin-top:12px;">
            <h4>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Energy & Contract Details
            </h4>
            <div class="pc-kv">
              <div class="k">Current rate</div><div class="v">${escapeHtml(rate)}</div>
              <div class="k">Supplier/Utility</div><div class="v">${escapeHtml(supplier)}</div>
              <div class=\"k\">Contract end</div><div class=\"v\">${escapeHtml(contractEndDisplay)}</div>
              <div class="k">Usage</div><div class="v">${escapeHtml(usage)}</div>
              <div class="k">Rate type</div><div class="v">${escapeHtml(rateType)}</div>
              <div class="k">Term</div><div class="v">${escapeHtml(contractLength)}</div>
              <div class="k">Budget</div><div class="v">${escapeHtml(budget)}</div>
              <div class="k">Timeline</div><div class="v">${escapeHtml(timeline)}</div>
            </div>
          </div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg> Key Topics</h4><div class="pc-chips">${topicsHtml}</div></div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg> Next Steps</h4><div style="color:var(--text-secondary); font-size:12px;">${nextHtml}</div></div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Pain Points</h4><div style="color:var(--text-secondary); font-size:12px;">${painHtml}</div></div>
          <div class="ip-card" style="margin-top:12px;"><h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg> Entities</h4><div class="pc-chips">${entitiesHtml}</div></div>
          <div class="ip-card" style="margin-top:12px; text-align:right;"><button class="rc-icon-btn" onclick="(function(){ try{ openInsightsModal && openInsightsModal('${String(r.id||'')}'); }catch(_){}})()" title="Open full modal" aria-label="Open full modal">${svgEye()}</button></div>
        </div>
      </div>`;
  }

  function svgEye(){
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  async function updateField(field, value, id) {
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
    let text = (value && String(value).trim()) ? escapeHtml(String(value)) : '--';
    
    // Add comma formatting for annual usage display
    const field = wrap.getAttribute('data-field');
    if (field === 'annualUsage' && value && String(value).trim()) {
      const numericValue = String(value).replace(/[^0-9]/g, '');
      if (numericValue) {
        text = escapeHtml(numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      }
    }
    
    // Format phone numbers for display
    if ((field === 'phone' || field === 'mobile' || field === 'workDirectPhone' || field === 'otherPhone' || field === 'companyPhone') && value && String(value).trim()) {
      const formattedPhone = formatPhoneForDisplay(value);
      text = escapeHtml(formattedPhone);
    }
    
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

  // Set preferred phone type and persist immediately
  async function setPreferredPhoneType(type) {
    const valid = type === 'workDirectPhone' || type === 'mobile' || type === 'otherPhone';
    const id = state.currentContact?.id;
    if (!valid || !id) return;
    try {
      // Update state and UI immediately
      state.preferredPhoneField = type;
      if (state.currentContact) state.currentContact.preferredPhoneField = type;
      // Persist and broadcast for People page to re-render primary phone
      if (window.PCSaves && typeof window.PCSaves.updateContact === 'function') {
        await window.PCSaves.updateContact(id, { preferredPhoneField: type });
      } else if (window.firebaseDB) {
        await window.firebaseDB.collection('contacts').doc(id).set({ preferredPhoneField: type, updatedAt: Date.now() }, { merge: true });
        try { document.dispatchEvent(new CustomEvent('pc:contact-updated', { detail: { id, changes: { preferredPhoneField: type, updatedAt: Date.now() } } })); } catch(_) {}
      }
      try { window.crm?.showToast && window.crm.showToast('Default phone updated'); } catch(_) {}
    } catch (e) {
      console.warn('Failed to set preferred phone type', e);
    }
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
    <div class="list-header">
      <div class="list-title">Add ${escapeHtml(fullName)} to sequence</div>
      <button type="button" class="close-btn" id="contact-sequences-close" aria-label="Close">×</button>
    </div>
    <div class="list-body" id="contact-sequences-body">
      <div class="list-item" tabindex="0" data-action="create">
        <div>
          <div class="list-name">Create new sequence…</div>
          <div class="list-meta">Create a contact sequence</div>
        </div>
      </div>
      <div class="list-item" tabindex="-1" aria-disabled="true"><div><div class="list-name">Loading sequences…</div><div class="list-meta">Please wait</div></div></div>
    </div>`;
  document.body.appendChild(panel);

  // Close button
  const closeBtn = panel.querySelector('#contact-sequences-close');
  if (closeBtn) closeBtn.addEventListener('click', () => closeContactSequencesPanel());

  // Focus behavior
  setTimeout(() => { const first = panel.querySelector('.list-item'); if (first) first.focus(); }, 0);

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
        transform: translateY(-8px); opacity: 0; transition: transform 400ms ease, opacity 400ms ease;
        /* Avoid clipping the pointer arrow */
        --arrow-size: 10px; }
      #contact-lists-panel.--show, #contact-sequences-panel.--show { transform: translateY(0); opacity: 1; }
      #contact-lists-panel .list-header, #contact-sequences-panel .list-header { 
        display: flex; align-items: center; justify-content: space-between; 
        padding: 14px 16px; border-bottom: 1px solid var(--border-light); 
        font-weight: 700; background: var(--bg-card); 
      }
      #contact-lists-panel .list-title, #contact-sequences-panel .list-title { 
        font-weight: 700; color: var(--text-primary); font-size: 1rem; 
      }
      #contact-lists-panel .close-btn, #contact-sequences-panel .close-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0;
        background: var(--bg-item) !important; color: var(--grey-300) !important;
        border: 1px solid var(--border-light); border-radius: var(--border-radius-sm);
        line-height: 1; font-size: 16px; font-weight: 600; cursor: pointer;
        transition: var(--transition-fast); box-sizing: border-box;
        -webkit-tap-highlight-color: transparent; margin-right: 0;
      }
      #contact-lists-panel .close-btn:hover, #contact-sequences-panel .close-btn:hover {
        background: var(--grey-600) !important; color: var(--text-inverse) !important;
      }
      #contact-lists-panel .close-btn:focus-visible, #contact-sequences-panel .close-btn:focus-visible {
        outline: 2px solid var(--orange-muted); outline-offset: 2px;
      }
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
    
    // Comprehensive validation: ensure contact detail page is fully ready
    const isContactDetailReady = () => {
      // Check if critical DOM elements exist
      const header = document.getElementById('contact-detail-header');
      const view = document.getElementById('contact-detail-view');
      const addToListBtn = document.getElementById('add-contact-to-list');
      
      if (!header || !view || !addToListBtn) return false;
      
      // Check if data-contact-id attributes are set
      const headerId = header.getAttribute('data-contact-id');
      const viewId = view.getAttribute('data-contact-id');
      
      if (!headerId || !viewId) return false;
      
      // Check if state has contact ID
      if (!state.currentContact?.id) return false;
      
      // All validations passed
      return true;
    };
    
    // If not ready, show loading state and retry
    if (!isContactDetailReady()) {
      console.log('[ContactDetail] Contact detail not fully ready, showing loading state');
      // Show a brief loading message to the user
      if (window.crm && typeof window.crm.showToast === 'function') {
        window.crm.showToast('Loading contact information...');
      }
      
      // Retry after a short delay
      setTimeout(() => {
        if (isContactDetailReady()) {
          openContactListsPanel(); // Recursive call when ready
        } else {
          // Still not ready, try the async resolution
          resolveCurrentContactIdWithRetry(3000).then(success => {
            if (success && isContactDetailReady()) {
              openContactListsPanel(); // Recursive call when ready
            } else {
              if (window.crm && typeof window.crm.showToast === 'function') {
                window.crm.showToast('Contact information not ready. Please try again.');
              }
            }
          });
        }
      }, 200);
      return;
    }
    
    injectContactListsStyles();
    const panel = document.createElement('div');
    panel.id = 'contact-lists-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Add to list');
    const c = state.currentContact || {};
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'this contact';
    panel.innerHTML = `
      <div class="list-header">
        <div class="list-title">Add ${escapeHtml(fullName)} to list</div>
        <button type="button" class="close-btn" id="contact-lists-close" aria-label="Close">×</button>
      </div>
      <div class="list-body" id="contact-lists-body">
        <div class="list-item" tabindex="0" data-action="create">
          <div>
            <div class="list-name">Create new list…</div>
            <div class="list-meta">Create a people list</div>
          </div>
        </div>
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

    // Load lists and memberships immediately since we've already validated everything is ready
    Promise.resolve(populateContactListsPanel(panel.querySelector('#contact-lists-body')))
      .then(() => { try { _positionContactListsPanel && _positionContactListsPanel(); } catch(_) {} });

    // Close button
    panel.querySelector('#contact-lists-close')?.addEventListener('click', () => closeContactListsPanel());

    // Focus behavior
    setTimeout(() => { const first = panel.querySelector('.list-item'); if (first) first.focus(); }, 0);
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

  }

  // Handle list selection (moved to global scope to fix reference error)
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

  // Resolve the current contact id with retries and multiple sources
  async function resolveCurrentContactIdWithRetry(timeoutMs = 4000) {
    const started = Date.now();
    const tryResolveOnce = () => {
      // 1) state
      let id = state.currentContact && state.currentContact.id;
      if (id) return id;
      // 2) DOM data attributes
      try {
        id = document.querySelector('#contact-detail-header')?.getAttribute('data-contact-id') || id;
        id = document.querySelector('#contact-detail-view')?.getAttribute('data-contact-id') || id;
      } catch(_) {}
      if (id) return id;
      // 3) module singleton
      try { id = window.ContactDetail?.state?.currentContact?.id || id; } catch(_) {}
      if (id) return id;
      // 4) people cache best-effort match (name + account)
      try {
        const c = state.currentContact || {};
        const full = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || '';
        const people = (typeof window.getPeopleData === 'function') ? (window.getPeopleData() || []) : [];
        if (full && people.length) {
          const guessed = people.find(p => {
            const pf = [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '';
            const nameMatch = pf && full && pf.toLowerCase().trim() === full.toLowerCase().trim();
            const acctMatch = (p.accountId || '') === (c.accountId || '');
            return nameMatch && acctMatch;
          });
          if (guessed && guessed.id) return guessed.id;
        }
      } catch(_) {}
      return '';
    };

    // Immediate attempt
    let resolved = tryResolveOnce();
    if (resolved) {
      try { if (!state.currentContact) state.currentContact = {}; state.currentContact.id = resolved; } catch(_) {}
      return true;
    }

    // Retry loop with longer timeout and more frequent checks
    const interval = 60; // Check every 60ms instead of 80ms
    while (Date.now() - started < timeoutMs) {
      await new Promise(r => setTimeout(r, interval));
      resolved = tryResolveOnce();
      if (resolved) {
        try { if (!state.currentContact) state.currentContact = {}; state.currentContact.id = resolved; } catch(_) {}
        return true;
      }
    }
    return false;
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

      // Fetch actual member counts for each list
      const listCounts = new Map();
      for (const list of lists.slice(0, 100)) {
        try {
          // Try to get from cache first
          const cache = window.listMembersCache?.[list.id];
          if (cache && cache.loaded) {
            listCounts.set(list.id, cache.people?.size || 0);
          } else {
            // Fetch actual count from Firebase
            let count = 0;
            try {
              const lmSnap = await db.collection('listMembers').where('listId', '==', list.id).where('targetType', '==', 'people').get();
              count = lmSnap?.docs?.length || 0;
            } catch (e) {
              // Fallback to cached count
              count = (typeof list.count === 'number') ? list.count : (list.recordCount || 0);
            }
            listCounts.set(list.id, count);
          }
        } catch (e) {
          // Fallback to cached count
          const count = (typeof list.count === 'number') ? list.count : (list.recordCount || 0);
          listCounts.set(list.id, count);
        }
      }

      const listHtml = lists.slice(0, 100).map(it => {
        const count = listCounts.get(it.id) || 0;
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

      // Event delegation - attach once to container, persists through re-renders
      if (!container._listItemHandlerAttached) {
        container.addEventListener('click', (e) => {
          const listItem = e.target.closest('.list-item');
          if (listItem && !listItem.hasAttribute('aria-disabled')) {
            handleListChoose(listItem);
          }
        });
        container._listItemHandlerAttached = true;
      }
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
      let contactId = state.currentContact?.id;
      
      // Enhanced fallback chain for contact ID resolution
      if (!contactId) {
        try {
          const fromDom = document.querySelector('[data-contact-id]')?.getAttribute('data-contact-id');
          if (fromDom) contactId = fromDom;
        } catch(_) {}
      }
      
      if (!contactId && typeof window.getPeopleData === 'function') {
        try {
          // If we have a single newly-created contact with matching name/company, attempt to resolve id
          const c = state.currentContact || {};
          const people = window.getPeopleData() || [];
          const guess = people.find(p => (p.firstName||p.name||'') === (c.firstName||c.name||'') && (p.accountId||p.companyId||'') === (c.accountId||''));
          if (guess && guess.id) contactId = guess.id;
        } catch(_) {}
      }
      
      if (!contactId) {
        // Enhanced fallback: wait longer and check multiple sources
        const start = Date.now();
        while (!contactId && Date.now() - start < 2000) {
          await new Promise(r => setTimeout(r, 100));
          contactId = state.currentContact?.id || 
                     document.querySelector('[data-contact-id]')?.getAttribute('data-contact-id') ||
                     document.querySelector('#contact-detail-header [data-contact-id]')?.getAttribute('data-contact-id');
        }
        
        if (!contactId) {
          console.warn('[ContactDetail] No contact ID available for list addition after extended wait', {
            contactId: contactId,
            stateContact: state.currentContact,
            stateContactId: state.currentContact?.id,
            domElements: document.querySelectorAll('[data-contact-id]').length
          });
          
          // Show user-friendly error message
          if (window.crm && typeof window.crm.showToast === 'function') {
            window.crm.showToast('Contact information not ready. Please try again in a moment.');
          }
          closeContactListsPanel();
          return;
        }
      }
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
        
        // Update the cache for this list
        if (window.listMembersCache && window.listMembersCache[listId]) {
          window.listMembersCache[listId].people.add(contactId);
        }
        
        // Refresh list membership if we're on a list detail page
        if (window.ListDetail && window.ListDetail.refreshListMembership) {
          window.ListDetail.refreshListMembership();
        }
        
        // Refresh list counts on the lists overview page
        if (window.ListsOverview && window.ListsOverview.refreshCounts) {
          window.ListsOverview.refreshCounts();
        }
      }
      window.crm?.showToast && window.crm.showToast(`Added to "${listName}"`);
    } catch (err) {
      console.warn('Add to list failed', err);
      window.crm?.showToast && window.crm.showToast('Failed to add to list');
    } finally {
      // Update only the specific list item to show checkmark
      const panel = document.getElementById('contact-lists-panel');
      if (panel) {
        const listItem = panel.querySelector(`[data-id="${listId}"]`);
        if (listItem) {
          listItem.setAttribute('data-member-id', 'pending');
          const checkEl = listItem.querySelector('.list-check');
          if (checkEl) checkEl.textContent = '✓';
        }
      }
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
      // Update only the specific list item to remove checkmark
      const panel = document.getElementById('contact-lists-panel');
      if (panel) {
        const listItem = panel.querySelector(`[data-member-id="${memberDocId}"]`);
        if (listItem) {
          listItem.removeAttribute('data-member-id');
          const checkEl = listItem.querySelector('.list-check');
          if (checkEl) checkEl.textContent = '';
        }
      }
    }
  }

  async function handleQuickAction(action, btn) {
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
          try {
            const c = state.currentContact || {};
            const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || '';
            if (window.EmailCompose && typeof window.EmailCompose.openTo === 'function') {
              window.EmailCompose.openTo(email, fullName);
            } else {
              // Fallback: click compose and prefill
              document.getElementById('compose-email-btn')?.click();
              setTimeout(()=>{ const to = document.getElementById('compose-to'); if (to) to.value = email; }, 120);
            }
          } catch (e) { /* noop */ }
        }
        break;
      case 'website':
        const contact = state.currentContact;
        if (contact) {
          console.log('[ContactDetail] Website button clicked for contact:', contact.name || contact.firstName + ' ' + contact.lastName);
          console.log('[ContactDetail] Contact company:', contact.companyName || contact.accountName);
          
          // Get website from contact's company or account
          let website = contact.website || contact.companyWebsite || contact.accountWebsite;
          console.log('[ContactDetail] Contact website fields:', {
            website: contact.website,
            companyWebsite: contact.companyWebsite,
            accountWebsite: contact.accountWebsite,
            found: website
          });
          
          // If no website on contact, try to get from linked account
          if (!website) {
            try {
              console.log('[ContactDetail] No website on contact, looking up linked account...');
              const linkedAccount = await findAssociatedAccount(contact);
              if (linkedAccount) {
                website = linkedAccount.website || linkedAccount.domain;
                console.log('[ContactDetail] Found linked account:', linkedAccount.accountName || linkedAccount.name);
                console.log('[ContactDetail] Account website fields:', {
                  website: linkedAccount.website,
                  domain: linkedAccount.domain,
                  found: website
                });
              } else {
                console.log('[ContactDetail] No linked account found');
              }
            } catch (e) { 
              console.warn('[ContactDetail] Failed to find linked account for website:', e);
            }
          }
          
          if (website) {
            // Ensure URL has protocol
            let url = website;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              url = 'https://' + url;
            }
            console.log('[ContactDetail] Opening website:', url);
            try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
          } else {
            console.log('[ContactDetail] No website available for contact');
            // Show message if no website available
            if (window.crm && typeof window.crm.showToast === 'function') {
              window.crm.showToast('No website available for this contact');
            }
          }
        }
        break;
      case 'linkedin':
        const contactLinkedIn = state.currentContact;
        if (contactLinkedIn) {
          console.log('[ContactDetail] LinkedIn button clicked for contact:', contactLinkedIn.name || contactLinkedIn.firstName + ' ' + contactLinkedIn.lastName);
          console.log('[ContactDetail] Contact LinkedIn field:', contactLinkedIn.linkedin);
          
          // If contact has a LinkedIn URL, use it directly (PERSONAL LinkedIn, not company)
          if (contactLinkedIn.linkedin) {
            console.log('[ContactDetail] Using contact personal LinkedIn:', contactLinkedIn.linkedin);
            try { window.open(contactLinkedIn.linkedin, '_blank', 'noopener'); } catch (e) { /* noop */ }
          } else {
            // Fallback to search for the PERSON (not company)
            const fullName = [contactLinkedIn.firstName, contactLinkedIn.lastName].filter(Boolean).join(' ') || contactLinkedIn.name;
            const query = encodeURIComponent(fullName);
            const url = `https://www.linkedin.com/search/results/people/?keywords=${query}`;
            console.log('[ContactDetail] No personal LinkedIn, searching for person:', fullName);
            console.log('[ContactDetail] LinkedIn search URL:', url);
            try { window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
          }
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

  // Listen for energy updates from Health Widget to update Energy & Contract section
  function setupEnergyUpdateListener() {
    const onEnergyUpdated = (e) => {
      try {
        const d = e.detail || {};
        // Only update if this is for the current contact's linked account
        if (d.entity === 'account' && d.id === state._linkedAccountId) {
          const field = d.field;
          const value = d.value;
          
          // Update the Energy & Contract section display
          const energyGrid = document.getElementById('contact-energy-grid');
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
                  if (field === 'annualUsage' && value != null && String(value).trim() !== '') {
                    const numeric = String(value).replace(/[^0-9]/g, '');
                    displayValue = numeric ? numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--';
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

  // Clear phone widget context completely to prevent any contact/company info leakage
  function clearPhoneWidgetContext() {
    try {
      if (window.Widgets && typeof window.Widgets.setCallContext === 'function') {
        window.Widgets.setCallContext({
          contactId: null,
          contactName: '',
          name: '',
          company: '',
          accountId: null,
          accountName: null,
          city: '',
          state: '',
          domain: '',
          logoUrl: '',
          isCompanyPhone: false
        });
        console.log('[Contact Detail] Cleared phone widget context to prevent leakage');
      }
    } catch(_) {}
  }

  // Listen for new contact creation to update state when navigating from Account Details
  function setupContactCreatedListener() {
    const onContactCreated = (e) => {
      try {
        const d = e.detail || {};
        const { id, doc } = d;
        
        // If we're currently on the Contact Detail page but don't have a contact ID yet,
        // and this newly created contact matches our current state, update it
        if (id && doc && !state.currentContact?.id) {
          // Check if this contact matches what we're currently displaying
          const currentName = state.currentContact?.firstName || state.currentContact?.name || '';
          const newName = doc.firstName || doc.name || '';
          const currentCompany = state.currentContact?.companyName || state.currentContact?.accountName || '';
          const newCompany = doc.companyName || '';
          
          // If names match and we're on the contact detail page, update the state
          if (currentName && newName && currentName.toLowerCase() === newName.toLowerCase() && 
              currentCompany && newCompany && currentCompany.toLowerCase() === newCompany.toLowerCase()) {
            console.log('[Contact Detail] Updating state with new contact ID:', id);
            state.currentContact.id = id;
            state.currentContact = { ...state.currentContact, ...doc, id };
            
            // Re-attach event handlers after contact creation
            setTimeout(() => {
              if (!state._contactDetailEventsAttached) {
                attachContactDetailEvents();
              }
            }, 100);
            
            // Update the DOM to reflect the new contact ID
            const contactIdEl = document.querySelector('[data-contact-id]');
            if (contactIdEl) {
              contactIdEl.setAttribute('data-contact-id', id);
            }
            
            // Update the page title if it exists
            const pageTitle = document.querySelector('#contact-detail-header .contact-name');
            if (pageTitle && !pageTitle.getAttribute('data-contact-id')) {
              pageTitle.setAttribute('data-contact-id', id);
            }
          }
        }
        
        // If we're on the contact detail page, always re-attach event handlers
        // This ensures add-to-list functionality works after contact creation
        const isOnContactDetailPage = document.getElementById('contact-detail-view') !== null;
        if (id && isOnContactDetailPage) {
          console.log('[Contact Detail] Re-attaching event handlers for contact creation:', id);
          // Reset event attachment flag to force re-attachment
          state._contactDetailEventsAttached = false;
          // Re-attach event handlers with proper timing
          setTimeout(() => {
            attachContactDetailEvents();
          }, 100);
        }
      } catch(_) {}
    };
    
    document.addEventListener('pc:contact-created', onContactCreated);
    
    // Return cleanup function
    return () => {
      document.removeEventListener('pc:contact-created', onContactCreated);
    };
  }

  // Add toMDY function for date formatting
  function toMDY(v) {
    console.log('[Contact Detail] toMDY called with:', v);
    const d = parseDateFlexible(v);
    if (!d) return v ? String(v) : '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const result = `${mm}/${dd}/${yyyy}`;
    console.log('[Contact Detail] toMDY result:', result);
    return result;
  }

  // Add toISODate function for date input formatting
  function toISODate(v) {
    const d = parseDateFlexible(v);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Add parseDateFlexible function for date parsing
  function parseDateFlexible(s) {
    if (!s) return null;
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      // For ISO dates, parse components to avoid timezone issues
      const parts = str.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const m = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
    if (m) {
      // Parse MM/DD/YYYY format directly to avoid timezone issues
      const d = new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    // Fallback Date parse - use local timezone to avoid offset issues
    const d = new Date(str + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  // Cleanup function to remove event listeners and reset state
  function cleanup() {
    console.log('[ContactDetail] Cleaning up module...');
    
    // Remove all tracked event listeners
    eventListeners.forEach(({ type, handler, target }) => {
      try {
        target.removeEventListener(type, handler);
      } catch(e) {
        console.warn('[ContactDetail] Error removing listener:', e);
      }
    });
    eventListeners.length = 0;
    
    // Reset global flags
    try {
      document._pcBackButtonDelegated = false;
      const contactDetailView = document.getElementById('contact-detail-view');
      if (contactDetailView) {
        contactDetailView._companyPhoneHandlerAdded = false;
      }
    } catch(e) {}
    
    // Reset state flags
    state._contactDetailEventsAttached = false;
    
    console.log('[ContactDetail] Cleanup complete');
  }

  // Export functions for use by people.js
  window.ContactDetail = {
    show: showContactDetail,
    setupEnergyUpdateListener: setupEnergyUpdateListener,
    setupContactCreatedListener: setupContactCreatedListener,
  // Expose internal state for widgets to read linked account id
  state: state,
  // Expose cleanup function for hot reload support
  _cleanup: cleanup
};

// Debug function to test phone input functionality
window.testPhoneInput = function(value, cursorPos = 0) {
  console.log('Testing phone input:', { value, cursorPos });
  console.log('isTypingExtension:', isTypingExtension(value, cursorPos));
  console.log('parsePhoneWithExtension:', parsePhoneWithExtension(value));
  console.log('formatPhoneNumberForInput:', formatPhoneNumberForInput(value));
  console.log('formatPhoneForDisplay:', formatPhoneForDisplay(value));
};

})();

