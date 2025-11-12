'use strict';
(function(){
  const state = {
    data: [],
    filtered: [],
    selected: new Set(),
    currentPage: 1,
    pageSize: 25,
    currentFolder: 'inbox'
  };
  const els = {};

  // Restore handler for back navigation from Email Detail
  if (!document._emailsRestoreBound) {
    document.addEventListener('pc:emails-restore', (ev) => {
      try {
        const d = (ev && ev.detail) || {};
        if (d.currentFolder) state.currentFolder = d.currentFolder;
        if (d.currentPage) {
          const n = parseInt(d.currentPage, 10); 
          if (!isNaN(n) && n > 0) state.currentPage = n;
        }
        if (d.searchTerm) {
          if (els.searchInput) els.searchInput.value = d.searchTerm;
        }
        if (Array.isArray(d.selectedItems)) state.selected = new Set(d.selectedItems);
        
        // Update active tab
        els.filterTabs.forEach(tab => {
          tab.classList.toggle('active', tab.dataset.folder === state.currentFolder);
        });
        
        // Show/hide Generate Now button
        updateGenerateButtonVisibility();
        
        applyFilters();
        render();
        
        if (typeof d.scroll === 'number') {
          setTimeout(() => { 
            try { window.scrollTo(0, d.scroll); } catch(_) {} 
          }, 80);
        }
      } catch (e) { 
        console.warn('[Emails] Restore failed', e); 
      }
    });
    document._emailsRestoreBound = true;
  }

  // Subscribe to background email update events once
  if (!document._emailsRealtimeBound) {
    try {
      document.addEventListener('pc:emails-loaded', () => {
        try { loadData(); } catch(_) {}
      });
      document.addEventListener('pc:emails-updated', () => {
        try { loadData(); } catch(_) {}
      });
      document._emailsRealtimeBound = true;
    } catch(_) {}
  }

  // Initialize DOM references
  function initDomRefs() {
    els.page = document.getElementById('emails-page');
    els.tbody = document.getElementById('emails-tbody');
    els.selectAll = document.getElementById('select-all-emails');
    els.filterTabs = document.querySelectorAll('.filter-tab');
    els.searchInput = document.getElementById('emails-search');
    els.clearBtn = document.getElementById('clear-search-btn');
    els.composeBtn = document.getElementById('compose-email-btn');
    els.generateBtn = document.getElementById('generate-scheduled-btn');
    els.summary = document.getElementById('emails-summary');
    els.count = document.getElementById('emails-count');
    els.pagination = document.getElementById('emails-pagination');
    els.container = els.page ? els.page.querySelector('.table-container') : null;
    
    return els.page && els.tbody;
  }

  // Attach event listeners
  function attachEvents() {
    // Filter tabs - prevent duplicate listeners
    els.filterTabs.forEach(tab => {
      // Remove any existing listener first
      if (!tab._emailTabBound) {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          console.log('[EmailsPage] Tab clicked:', tab.dataset.folder);
          els.filterTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.currentFolder = tab.dataset.folder;
          state.currentPage = 1;
          console.log('[EmailsPage] Current folder set to:', state.currentFolder);
          
          // Show/hide Generate Now button
          updateGenerateButtonVisibility();
          
          applyFilters();
        });
        tab._emailTabBound = true;
      }
    });

    // Search
    if (els.searchInput) {
      els.searchInput.addEventListener('input', debounce(() => {
        state.currentPage = 1;
        applyFilters();
      }, 300));
    }

    // Clear search
    if (els.clearBtn) {
      els.clearBtn.addEventListener('click', () => {
        if (els.searchInput) els.searchInput.value = '';
        state.currentPage = 1;
        applyFilters();
      });
    }

    // Compose button
    if (els.composeBtn) {
      els.composeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openComposeModal(); // Call with no parameters for new email
      });
    }

    // Generate scheduled emails button
    if (els.generateBtn) {
      els.generateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        generateScheduledEmails();
      });
    }

    // Compose window close button
    const composeCloseBtn = document.getElementById('compose-close');
    if (composeCloseBtn && !composeCloseBtn._emailsBound) {
      composeCloseBtn.addEventListener('click', closeComposeModal);
      composeCloseBtn._emailsBound = true;
    }

    // AI functionality is now handled by email-compose-global.js

    // Select all checkbox - opens bulk selection modal
    if (els.selectAll) {
      els.selectAll.addEventListener('change', () => {
        if (els.selectAll.checked) {
          openBulkSelectModal();
        } else {
          state.selected.clear();
          render();
          closeBulkSelectModal();
          hideBulkBar();
        }
      });
    }
  }

  // Load email data from BackgroundEmailsLoader (cache-first)
  async function loadData() {
    try {
      console.log('[EmailsPage] Loading emails from BackgroundEmailsLoader...');
      
      let emailsData = [];
      
      // Priority 1: Get data from background loader (already loaded on app init)
      if (window.BackgroundEmailsLoader) {
        emailsData = window.BackgroundEmailsLoader.getEmailsData() || [];
        console.log('[EmailsPage] Got', emailsData.length, 'emails from BackgroundEmailsLoader');
      }
      
      // Priority 2: Fallback to CacheManager if background loader empty
      if (emailsData.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        console.log('[EmailsPage] Background loader empty, falling back to CacheManager...');
        emailsData = await window.CacheManager.get('emails') || [];
      }
      
      // Priority 3: Load from Firebase if cache is empty
      if (emailsData.length === 0) {
        console.log('[EmailsPage] Cache empty, loading from Firebase...');
        const emailsSnapshot = await firebase.firestore().collection('emails')
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get();
        
        emailsData = emailsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            timestamp: data.sentAt || data.receivedAt || data.createdAt,
            emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
          };
        });
        
        // Cache for future visits
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('emails', emailsData);
        }
      }
      
      // Ensure all emails have required fields and preserve content fields
      state.data = emailsData.map(email => {
        // Normalize 'to' field - handle both string and array formats
        let normalizedTo = '';
        if (Array.isArray(email.to)) {
          normalizedTo = email.to.length > 0 ? email.to[0] : '';
        } else {
          normalizedTo = email.to || '';
        }
        
        return {
        ...email,
        type: email.type || 'received',
        from: email.from || 'Unknown',
        to: normalizedTo,
        subject: email.subject || '(No Subject)',
        date: email.date || email.timestamp || email.createdAt || new Date(),
        // Preserve all content fields like old system
        html: email.html || '',
        text: email.text || '',
        content: email.content || '',
        originalContent: email.originalContent || '',
        // Add tracking data
        openCount: email.openCount || 0,
        clickCount: email.clickCount || 0,
        lastOpened: email.lastOpened,
        lastClicked: email.lastClicked,
        isSentEmail: email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail,
        starred: email.starred || false,
        deleted: email.deleted || false,
        unread: email.unread !== false
        };
      });
      
      // Sort by date (newest first)
      state.data.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      console.log('[EmailsPage] Processed', state.data.length, 'emails');
      
      // Log sample types for debugging
      if (state.data.length > 0) {
        const typeCounts = {};
        state.data.forEach(email => {
          const key = email.type || email.emailType || 'unknown';
          typeCounts[key] = (typeCounts[key] || 0) + 1;
        });
        console.log('[EmailsPage] Email types breakdown:', typeCounts);
      }
      
      applyFilters();
    } catch (error) {
      console.error('[EmailsPage] Failed to load emails:', error);
      state.data = [];
      applyFilters();
    }
  }

  // Apply filters based on current folder and search
  function applyFilters() {
    let filtered = [...state.data];
    
    console.log('[EmailsPage] Filtering emails. Total:', state.data.length, 'Current folder:', state.currentFolder);
    
    // Log sample email types for debugging
    if (state.data.length > 0) {
      const typeCounts = {};
      state.data.forEach(email => {
        typeCounts[email.type] = (typeCounts[email.type] || 0) + 1;
      });
      console.log('[EmailsPage] Email types:', typeCounts);
    }
    
    // Filter by folder
    if (state.currentFolder === 'inbox') {
      filtered = filtered.filter(email => {
        // Multiple ways to identify received emails (catch everything)
        return (email.type === 'received' || 
                email.emailType === 'received' || 
                email.provider === 'sendgrid_inbound' ||
                // If no type field, assume it's received (old emails)
                (!email.type && !email.emailType && !email.isSentEmail)) && 
               !email.deleted;
      });
      console.log('[EmailsPage] Inbox filter applied. Filtered count:', filtered.length);
    } else if (state.currentFolder === 'sent') {
      filtered = filtered.filter(email => {
        // Accept multiple indicators for sent emails to support legacy and new records
        const isSent = (
          email.type === 'sent' ||
          email.emailType === 'sent' ||
          email.isSentEmail === true ||
          email.status === 'sent' ||
          email.provider === 'sendgrid'
        );
        return isSent && !email.deleted;
      });
      console.log('[EmailsPage] Sent filter applied. Filtered count:', filtered.length);
    } else if (state.currentFolder === 'scheduled') {
      // Scheduled emails are already filtered by ownership in BackgroundEmailsLoader
      // Only shows scheduled emails owned by or assigned to current user
      filtered = filtered.filter(email => {
        // CRITICAL FIX: Show emails that are scheduled for now or future (not just future)
        // Also include emails with status 'not_generated' or 'pending_approval' that haven't been sent yet
        const isScheduled = email.type === 'scheduled';
        const hasSendTime = email.scheduledSendTime && typeof email.scheduledSendTime === 'number';
        const isFutureOrNow = hasSendTime && email.scheduledSendTime >= (Date.now() - 60000); // Allow 1 minute buffer for "due now" emails
        const isPending = email.status === 'not_generated' || email.status === 'pending_approval' || !email.status;
        const notDeleted = !email.deleted;
        const notSent = email.status !== 'sent' && email.status !== 'delivered';
        
        return isScheduled && hasSendTime && (isFutureOrNow || isPending) && notDeleted && notSent;
      });
      // Sort by scheduled send time (earliest first)
      filtered.sort((a, b) => a.scheduledSendTime - b.scheduledSendTime);
      console.log('[EmailsPage] Scheduled filter applied. Filtered count:', filtered.length);
    } else if (state.currentFolder === 'starred') {
      filtered = filtered.filter(email => email.starred && !email.deleted);
      console.log('[EmailsPage] Starred filter applied. Filtered count:', filtered.length);
    } else if (state.currentFolder === 'trash') {
      filtered = filtered.filter(email => email.deleted);
      console.log('[EmailsPage] Trash filter applied. Filtered count:', filtered.length);
    }

    // Filter by search
    const searchTerm = els.searchInput?.value?.toLowerCase() || '';
    if (searchTerm) {
      filtered = filtered.filter(email => 
        email.subject?.toLowerCase().includes(searchTerm) ||
        email.from?.toLowerCase().includes(searchTerm) ||
        email.to?.toLowerCase().includes(searchTerm)
      );
    }

    state.filtered = filtered;
    render();
  }

  // Get paginated items for current page
  function getPageItems() {
    const start = (state.currentPage - 1) * state.pageSize;
    return state.filtered.slice(start, start + state.pageSize);
  }

  // Render email table
  function render() {
    if (!els.tbody) return;
    
    // Update table header to show "To" for sent emails, "From" for others
    const table = document.getElementById('emails-table');
    if (table) {
      const headerCell = table.querySelector('thead th:nth-child(2)'); // Second column (after checkbox)
      if (headerCell) {
        headerCell.textContent = state.currentFolder === 'sent' ? 'To' : 'From';
      }
    }
    
    const rows = getPageItems();
    els.tbody.innerHTML = rows.map(email => rowHtml(email)).join('');
    
    // Update summary and count
    if (els.summary) {
      const start = (state.currentPage - 1) * state.pageSize + 1;
      const end = Math.min(state.currentPage * state.pageSize, state.filtered.length);
      els.summary.textContent = `${start}-${end} of ${state.filtered.length} emails`;
    }
    
    if (els.count) {
      els.count.textContent = `${state.filtered.length} emails`;
    }
    
    // Update select all checkbox
    if (els.selectAll) {
      const pageItems = getPageItems();
      const allSelected = pageItems.length > 0 && pageItems.every(email => state.selected.has(email.id));
      els.selectAll.checked = allSelected;
      els.selectAll.indeterminate = !allSelected && pageItems.some(email => state.selected.has(email.id));
    }
    
    // Update pagination
    renderPagination();
    
    // Update bulk actions bar
    updateBulkBar();
    
    // Bind row events
    bindRowEvents();
  }

  // Helper function to get account logoUrl from recipient email
  function getRecipientAccountInfo(recipientEmail) {
    if (!recipientEmail) return { logoUrl: null, domain: null };
    
    try {
      const recipientDomain = extractDomain(recipientEmail);
      if (!recipientDomain) return { logoUrl: null, domain: null };
      
      // Try to find account by domain
      const accounts = window.getAccountsData ? window.getAccountsData() : [];
      const account = accounts.find(a => {
        const accountDomain = (a.domain || '').toLowerCase().replace(/^www\./, '');
        const accountWebsite = (a.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        const domainLower = recipientDomain.toLowerCase();
        return accountDomain === domainLower || accountWebsite === domainLower;
      });
      
      if (account) {
        const logoUrl = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon;
        return { logoUrl: logoUrl || null, domain: account.domain || account.website || recipientDomain };
      }
      
      return { logoUrl: null, domain: recipientDomain };
    } catch (_) {
      return { logoUrl: null, domain: extractDomain(recipientEmail) };
    }
  }

  // Generate email row HTML with favicon integration and snippet
  function rowHtml(email) {
    const isSentEmail = email.isSentEmail || email.type === 'sent';
    
    // For sent emails, show recipient info with logo; otherwise show sender info
    let avatarHtml = '';
    let displayName = '';
    
    if (isSentEmail) {
      // For sent emails, show recipient with account logo
      // Handle both string and array formats for email.to
      let recipientEmail = '';
      if (Array.isArray(email.to)) {
        recipientEmail = email.to[0] || '';
      } else {
        recipientEmail = email.to || '';
      }
      
      const recipientName = extractName(recipientEmail);
      displayName = recipientName;
      
      // Get account info for recipient
      const accountInfo = getRecipientAccountInfo(recipientEmail);
      avatarHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
        logoUrl: accountInfo.logoUrl,
        domain: accountInfo.domain,
        size: 28
      });
    } else {
      // For received emails, show sender with domain favicon
      const senderDomain = extractDomain(email.from);
      displayName = extractName(email.from);
      avatarHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
        domain: senderDomain,
        size: 28
      });
    }

    const isSelected = state.selected.has(email.id);
    const emailPreview = getEmailPreview(email);

    // Get tracking counts for sent emails
    const openCount = (email.isSentEmail || email.type === 'sent') ? (email.openCount || 0) : 0;
    const clickCount = (email.isSentEmail || email.type === 'sent') ? (email.clickCount || 0) : 0;
    const hasOpens = openCount > 0;
    const hasClicks = clickCount > 0;
    const isStarred = email.starred || false;

    return `
      <tr class="email-row ${isSelected ? 'row-selected' : ''}" data-email-id="${email.id}">
        <td class="col-select">
          <input type="checkbox" class="row-select" data-email-id="${email.id}" ${isSelected ? 'checked' : ''}>
        </td>
        <td class="email-sender-cell">
          <div class="sender-cell__wrap">
            ${avatarHtml}
            <span class="sender-name">${escapeHtml(displayName)}</span>
          </div>
        </td>
        <td class="email-subject-cell">
          <div class="email-subject-content">
            <span class="email-subject ${email.unread ? 'unread' : ''}">${escapeHtml(email.subject)}</span>
            <div class="email-snippet">${escapeHtml(emailPreview)}</div>
          </div>
        </td>
        <td class="email-date-cell">
          <span class="email-date">${formatDate(email.date)}</span>
        </td>
        <td class="qa-cell">
          <div class="qa-actions">
            ${!isSentEmail ? `
              <button class="qa-btn ${isStarred ? 'starred' : ''}" data-action="star" data-email-id="${email.id}" title="${isStarred ? 'Unstar' : 'Star'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
            ` : ''}
            ${email.type === 'scheduled' && email.status === 'pending_approval' ? `
              <button class="qa-btn" data-action="approve" data-email-id="${email.id}" title="Approve" style="color: #28a745;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </button>
              <button class="qa-btn" data-action="reject" data-email-id="${email.id}" title="Reject" style="color: #dc3545;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            ` : isSentEmail ? `
              <button class="qa-btn ${hasOpens ? 'opened' : ''}" data-action="view" data-email-id="${email.id}" title="${hasOpens ? `Opened ${openCount} time${openCount !== 1 ? 's' : ''}` : 'Not opened'}" style="position: relative;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                ${hasOpens ? `<span class="tracking-badge">${openCount}</span>` : ''}
              </button>
              <button class="qa-btn" data-action="clicks" data-email-id="${email.id}" title="${hasClicks ? `Clicked ${clickCount} time${clickCount !== 1 ? 's' : ''}` : 'Not clicked'}" style="position: relative;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3.5"/>
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
                </svg>
                ${hasClicks ? `<span class="tracking-badge">${clickCount}</span>` : ''}
              </button>
            ` : `
              <button class="qa-btn" data-action="reply" data-email-id="${email.id}" title="Reply">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9,10 4,15 9,20"/>
                  <path d="M20,4v7a4,4,0,0,1-4,4H4"/>
                </svg>
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }

  // Bind events to email rows
  function bindRowEvents() {
    // Row clicks (view email)
    document.querySelectorAll('.email-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox' || e.target.closest('.qa-btn')) return;
        const emailId = row.dataset.emailId;
        viewEmail(emailId);
      });
    });

    // Checkbox changes
    document.querySelectorAll('.email-row .row-select').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const emailId = e.target.dataset.emailId;
        if (e.target.checked) {
          state.selected.add(emailId);
        } else {
          state.selected.delete(emailId);
        }
        updateBulkBar();
        render();
      });
    });

    // Action buttons
    document.querySelectorAll('.qa-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const emailId = btn.dataset.emailId;
        
        if (action === 'star') {
          toggleStar(emailId);
        } else if (action === 'clicks') {
          showClickDetails(emailId);
        } else if (action === 'reply') {
          replyToEmail(emailId);
        } else if (action === 'approve') {
          approveScheduledEmail(emailId);
        } else if (action === 'reject') {
          rejectScheduledEmail(emailId);
        }
      });
    });
  }

  // View email in detail page
  function viewEmail(emailId) {
    // Store current state for back navigation
    window._emailsNavigationState = {
      currentFolder: state.currentFolder,
      currentPage: state.currentPage,
      searchTerm: els.searchInput?.value || '',
      selectedItems: Array.from(state.selected),
      scroll: window.scrollY
    };

    // Navigate to email detail page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('email-detail', { emailId });
    }
  }

  // Toggle star status
  async function toggleStar(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (!email) return;

    try {
      const newStarred = !email.starred;
      
      // Update in Firebase
      await firebase.firestore().collection('emails').doc(emailId).update({
        starred: newStarred
      });

      // Update local state
      email.starred = newStarred;
      
      // Update the email in state.data
      const emailIndex = state.data.findIndex(e => e.id === emailId);
      if (emailIndex !== -1) {
        state.data[emailIndex].starred = newStarred;
      }

      // Re-render to update the star button
      render();

    } catch (error) {
      console.error('[EmailsPage] Failed to toggle star:', error);
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to update star status');
      }
    }
  }

  // Reply to email
  function replyToEmail(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (email) {
      // Open compose modal with reply data
      openComposeModal(email);
    }
  }

  // Approve scheduled email
  async function approveScheduledEmail(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (!email || email.type !== 'scheduled') return;

    try {
      // Update via FreeSequenceAutomation if available
      if (window.freeSequenceAutomation && typeof window.freeSequenceAutomation.approveEmail === 'function') {
        await window.freeSequenceAutomation.approveEmail(emailId);
      } else {
        // Fallback: update Firebase directly
        const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
        if (db) {
          await db.collection('emails').doc(emailId).update({
            status: 'approved',
            approvedAt: Date.now(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email approved and will be sent at scheduled time');
      }

      // Reload emails
      await loadData();
    } catch (error) {
      console.error('[EmailsPage] Failed to approve email:', error);
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to approve email');
      }
    }
  }

  // Reject scheduled email
  async function rejectScheduledEmail(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (!email || email.type !== 'scheduled') return;

    if (!confirm('Are you sure you want to reject this scheduled email?')) {
      return;
    }

    try {
      // Update via FreeSequenceAutomation if available
      if (window.freeSequenceAutomation && typeof window.freeSequenceAutomation.rejectEmail === 'function') {
        await window.freeSequenceAutomation.rejectEmail(emailId);
      } else {
        // Fallback: update Firebase directly
        const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
        if (db) {
          await db.collection('emails').doc(emailId).update({
            status: 'rejected',
            rejectedAt: Date.now(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email rejected');
      }

      // Reload emails
      await loadData();
    } catch (error) {
      console.error('[EmailsPage] Failed to reject email:', error);
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to reject email');
      }
    }
  }

  // Show click details for sent emails
  function showClickDetails(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (!email) {
      console.warn('[EmailsPage] Email not found for click details:', emailId);
      return;
    }
    
    const clicks = Array.isArray(email.clicks) ? email.clicks : [];
    if (clicks.length === 0) {
      window.crm?.showToast && window.crm.showToast('No clicks recorded for this email yet.');
      return;
    }
    
    // Create modal content
    const clickItems = clicks.map(click => {
      const timestamp = click.timestamp ? new Date(click.timestamp).toLocaleString() : 'Unknown time';
      const url = click.url || 'Unknown URL';
      const userAgent = click.user_agent || 'Unknown browser';
      
      return `
        <div class="click-item" style="padding: 12px; border-bottom: 1px solid var(--border-color);">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
            ${escapeHtml(url)}
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 2px;">
            ${timestamp}
          </div>
          <div style="font-size: 11px; color: var(--text-tertiary);">
            ${escapeHtml(userAgent)}
          </div>
        </div>
      `;
    }).join('');
    
    const modalContent = `
      <div class="modal-header" style="padding: 20px 20px 0 20px; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0; color: var(--text-primary);">Email Click Activity</h3>
        <p style="margin: 8px 0 0 0; color: var(--text-secondary); font-size: 14px;">
          ${clicks.length} click${clicks.length !== 1 ? 's' : ''} recorded
        </p>
      </div>
      <div class="modal-body" style="padding: 0; max-height: 400px; overflow-y: auto;">
        ${clickItems}
      </div>
    `;
    
    // Show modal using CRM's modal system
    if (window.crm && typeof window.crm.showModal === 'function') {
      window.crm.showModal('Email Clicks', modalContent, {
        width: '600px',
        height: '500px'
      });
    } else {
      // Fallback: create simple modal
      const modal = document.createElement('div');
      modal.className = 'email-clicks-modal';
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
      `;
      
      const modalBox = document.createElement('div');
      modalBox.style.cssText = `
        background: var(--bg-primary); border-radius: 8px;
        width: 600px; max-height: 500px; overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      `;
      modalBox.innerHTML = modalContent;
      
      modal.appendChild(modalBox);
      document.body.appendChild(modal);
      
      // Close on click outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
      
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.style.cssText = `
        position: absolute; top: 15px; right: 20px;
        background: none; border: none; font-size: 24px;
        color: var(--text-secondary); cursor: pointer;
      `;
      closeBtn.onclick = () => document.body.removeChild(modal);
      modalBox.style.position = 'relative';
      modalBox.appendChild(closeBtn);
    }
  }

  // Open compose modal
  function openComposeModal(replyEmail = null) {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) {
      console.warn('[EmailsPage] Compose window not found in DOM');
      window.crm?.showToast && window.crm.showToast('Email compose not available');
      return;
    }
    
    // Reset compose window first
    resetComposeWindow();
    
    // Show the window and add open class for CSS animation
    composeWindow.style.display = 'flex';
    setTimeout(() => {
      composeWindow.classList.add('open');
    }, 10);
    
    // If replying to an email, prefill the fields
    if (replyEmail) {
      setTimeout(() => {
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        
        if (toInput) {
          toInput.value = replyEmail.from || '';
        }
        
        if (subjectInput) {
          const originalSubject = replyEmail.subject || '';
          const replyPrefix = originalSubject.startsWith('Re: ') ? '' : 'Re: ';
          subjectInput.value = `${replyPrefix}${originalSubject}`;
        }
        
        // Focus the To input
        if (toInput) {
          toInput.focus();
        }
      }, 100);
    } else {
      // For new email, focus the To input
      setTimeout(() => {
        const toInput = document.getElementById('compose-to');
        if (toInput) {
          toInput.focus();
        }
      }, 300);
    }
  }

  // Reset compose window to clear all fields
  function resetComposeWindow() {
    const composeWindow = document.getElementById('compose-window');
    if (!composeWindow) return;
    
    // Clear all inputs
    const toInput = document.getElementById('compose-to');
    const subjectInput = document.getElementById('compose-subject');
    const ccInput = document.getElementById('compose-cc');
    const bccInput = document.getElementById('compose-bcc');
    const bodyInput = document.querySelector('.body-input');
    
    if (toInput) toInput.value = '';
    if (subjectInput) subjectInput.value = '';
    if (ccInput) ccInput.value = '';
    if (bccInput) bccInput.value = '';
    if (bodyInput) bodyInput.innerHTML = '';
  }

  // Close compose modal
  function closeComposeModal() {
    const composeWindow = document.getElementById('compose-window');
    
    if (!composeWindow) return;
    
    // Remove open class to trigger slide-down animation
    composeWindow.classList.remove('open');
    
    // Hide after animation completes
    setTimeout(() => {
      composeWindow.style.display = 'none';
    }, 300);
  }

  // Render pagination
  function renderPagination() {
    if (!els.pagination) return;
    
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    const currentPage = Math.min(state.currentPage, totalPages);
    
    // Use unified pagination component
    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(currentPage, totalPages, (page) => {
        state.currentPage = page;
        render();
      }, els.pagination.id);
    }
  }

  // Utility functions
  function extractDomain(email) {
    if (!email || typeof email !== 'string') return '';
    
    // Handle format: "Name" <email@domain.com> or Name <email@domain.com>
    const angleMatch = email.match(/<(.+)>/);
    if (angleMatch) {
      const emailPart = angleMatch[1];
      const domainMatch = emailPart.match(/@(.+)$/);
      return domainMatch ? domainMatch[1] : '';
    }
    
    // Handle format: email@domain.com
    const match = email.match(/@(.+)$/);
    return match ? match[1] : '';
  }

  // Cache for contact names looked up from Firebase (populated asynchronously)
  const contactNameCache = new Map();
  const pendingLookups = new Set(); // Track lookups in progress to avoid duplicates

  // Async helper to lookup contact name from Firebase and cache it
  async function lookupContactNameFromFirebase(emailAddress) {
    if (!emailAddress || !emailAddress.includes('@') || !window.firebaseDB) {
      return null;
    }

    const normalizedEmail = emailAddress.toLowerCase().trim();

    // Avoid duplicate lookups
    if (pendingLookups.has(normalizedEmail)) {
      return null;
    }

    pendingLookups.add(normalizedEmail);

    try {
      // Try contacts collection first
      let snap = await window.firebaseDB.collection('contacts')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      // Fallback to people collection
      if (!snap || snap.empty) {
        snap = await window.firebaseDB.collection('people')
          .where('email', '==', normalizedEmail)
          .limit(1)
          .get();
      }

      if (snap && !snap.empty) {
        const doc = snap.docs[0];
        const contact = doc.data();
        
        // Build full name from contact
        const firstName = contact.firstName || '';
        const lastName = contact.lastName || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        
        if (fullName) {
          contactNameCache.set(normalizedEmail, fullName);
          // Trigger a re-render if we're on the emails page
          if (state.currentFolder) {
            setTimeout(() => render(), 100);
          }
          return fullName;
        }
        
        // Fallback to contact name field
        if (contact.name) {
          contactNameCache.set(normalizedEmail, contact.name);
          setTimeout(() => render(), 100);
          return contact.name;
        }
      }
    } catch (error) {
      console.warn('[EmailsPage] Error looking up contact name from Firebase:', error);
    } finally {
      pendingLookups.delete(normalizedEmail);
    }

    return null;
  }

  // Helper function to format email username as "First Last"
  function formatEmailAsName(emailUsername) {
    if (!emailUsername || typeof emailUsername !== 'string') return emailUsername;
    
    // Remove common prefixes/suffixes
    let cleaned = emailUsername.toLowerCase().trim();
    
    // Handle common separators: aaron.rodriguez, aaron_rodriguez, aaron-rodriguez
    let parts = [];
    if (cleaned.includes('.')) {
      parts = cleaned.split('.');
    } else if (cleaned.includes('_')) {
      parts = cleaned.split('_');
    } else if (cleaned.includes('-')) {
      parts = cleaned.split('-');
    } else {
      // Try to split camelCase or detect word boundaries
      // For now, just return capitalized single word
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    
    // Capitalize each part and join
    parts = parts
      .filter(p => p.length > 0) // Remove empty parts
      .map(p => p.charAt(0).toUpperCase() + p.slice(1)); // Capitalize first letter
    
    if (parts.length >= 2) {
      return parts.join(' ');
    } else if (parts.length === 1) {
      return parts[0];
    }
    
    return emailUsername; // Fallback
  }

  function extractName(email) {
    // Handle null, undefined, or empty values
    if (!email) return 'Unknown';
    
    // Convert to string if it's not already
    if (typeof email !== 'string') {
      email = String(email);
    }
    
    // If it's still empty after conversion, return Unknown
    if (!email.trim()) return 'Unknown';
    
    // Extract email address from various formats
    let emailAddress = '';
    let extractedName = '';
    
    // Handle format: "Name" <email@domain.com>
    const quotedMatch = email.match(/^"([^"]+)"\s*<(.+)>$/);
    if (quotedMatch) {
      extractedName = quotedMatch[1];
      emailAddress = quotedMatch[2].toLowerCase().trim();
    } else {
      // Handle format: Name <email@domain.com>
      const angleMatch = email.match(/^([^<]+)\s*<(.+)>$/);
      if (angleMatch) {
        extractedName = angleMatch[1].trim();
        emailAddress = angleMatch[2].toLowerCase().trim();
      } else {
        // Handle format: email@domain.com
        emailAddress = email.toLowerCase().trim();
      }
    }
    
    // If we already have a name from the email string, use it
    if (extractedName && extractedName.length > 0) {
      return extractedName;
    }
    
    // Otherwise, try to look up contact by email address
    if (emailAddress && emailAddress.includes('@')) {
      const normalizedEmail = emailAddress.toLowerCase().trim();
      
      // Priority 1: Check cache (populated by Firebase lookups)
      if (contactNameCache.has(normalizedEmail)) {
        return contactNameCache.get(normalizedEmail);
      }
      
      // Priority 2: Use cached people data - no API calls needed
      try {
        const people = window.getPeopleData ? window.getPeopleData() : [];
        const contact = people.find(p => {
          const contactEmail = (p.email || '').toLowerCase().trim();
          return contactEmail === normalizedEmail;
        });
        
        if (contact) {
          // Build full name from contact
          const firstName = contact.firstName || '';
          const lastName = contact.lastName || '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
          if (fullName) {
            // Cache it for future use
            contactNameCache.set(normalizedEmail, fullName);
            return fullName;
          }
          // Fallback to contact name field
          if (contact.name) {
            contactNameCache.set(normalizedEmail, contact.name);
            return contact.name;
          }
        }
      } catch (_) {
        // Silently fail and continue to fallback
      }
      
      // Priority 3: If cache is empty, trigger async Firebase lookup (non-blocking)
      // This will update the cache and trigger a re-render when complete
      if (window.firebaseDB && !pendingLookups.has(normalizedEmail)) {
        lookupContactNameFromFirebase(normalizedEmail).catch(() => {
          // Silently fail
        });
      }
    }
    
    // If no contact found, format email username as "First Last"
    if (emailAddress && emailAddress.includes('@')) {
      const emailMatch = emailAddress.match(/^(.+)@/);
      if (emailMatch) {
        const emailUsername = emailMatch[1];
        const formattedName = formatEmailAsName(emailUsername);
        return formattedName;
      }
    }
    
    return email; // Final fallback to full string
  }

  function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // SVG icon helper
  function svgIcon(name) {
    switch(name) {
      case 'clear': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
      case 'delete': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      case 'read': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      case 'unread': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      case 'star': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      case 'export': return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      default: return '';
    }
  }

  // Bulk selection modal (using pc-modal style)
  function openBulkSelectModal() {
    if (!els.page) return;
    closeBulkSelectModal();
    
    const total = state.filtered.length;
    const page = getPageItems().length;
    
    const modal = document.createElement('div');
    modal.id = 'emails-bulk-select-modal';
    modal.className = 'pc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'emails-bulk-modal-title');
    
    modal.innerHTML = `
      <div class="pc-modal__backdrop"></div>
      <div class="pc-modal__dialog">
        <div class="pc-modal__form">
          <div class="pc-modal__header">
            <h3 class="card-title" id="emails-bulk-modal-title">Select Emails</h3>
            <button class="pc-modal__close" aria-label="Close" type="button">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="pc-modal__body">
            <div class="option" style="display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary);">
                <input type="radio" name="bulk-mode" value="custom" checked style="accent-color: var(--orange-subtle);">
                <span>Select</span>
              </label>
              <input type="number" id="bulk-custom-count" min="1" max="${total}" value="${Math.min(50,total)}" style="width: 120px; height: 40px; padding: 0 14px; background: var(--bg-item); color: var(--text-primary); border: 2px solid var(--border-light); border-radius: 8px; transition: all 0.3s ease;">
              <span class="hint" style="color: var(--text-secondary); font-size: 0.85rem;">emails from current filters</span>
            </div>
            <div class="option" style="display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary);">
                <input type="radio" name="bulk-mode" value="page" style="accent-color: var(--orange-subtle);">
                <span>Select current page</span>
              </label>
              <span class="hint" style="color: var(--text-secondary); font-size: 0.85rem;">${page} visible</span>
            </div>
            <div class="option" style="display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); margin-bottom: 0;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary);">
                <input type="radio" name="bulk-mode" value="all" style="accent-color: var(--orange-subtle);">
                <span>Select all</span>
              </label>
              <span class="hint" style="color: var(--text-secondary); font-size: 0.85rem;">${total} emails</span>
            </div>
          </div>
          <div class="pc-modal__footer">
            <button type="button" class="btn-text" id="bulk-cancel">Cancel</button>
            <button type="button" class="btn-primary" id="bulk-apply">Apply</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal with animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
    
    // Enable/disable custom count input
    const customInput = modal.querySelector('#bulk-custom-count');
    const radios = Array.from(modal.querySelectorAll('input[name="bulk-mode"]'));
    function updateCustomEnabled() {
      const isCustom = !!modal.querySelector('input[name="bulk-mode"][value="custom"]:checked');
      if (customInput) {
        customInput.disabled = !isCustom;
        if (isCustom) customInput.removeAttribute('aria-disabled');
        else customInput.setAttribute('aria-disabled', 'true');
      }
    }
    radios.forEach((r) => r.addEventListener('change', () => {
      updateCustomEnabled();
      if (r.value === 'custom' && customInput && !customInput.disabled) customInput.focus();
    }));
    updateCustomEnabled();
    
    // Event handlers
    const close = () => {
      modal.classList.remove('show');
      setTimeout(() => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }, 300);
      if (els.selectAll) els.selectAll.checked = state.selected.size > 0;
    };
    
    modal.querySelector('.pc-modal__backdrop').addEventListener('click', close);
    modal.querySelector('.pc-modal__close').addEventListener('click', close);
    modal.querySelector('#bulk-cancel').addEventListener('click', () => {
      if (els.selectAll) els.selectAll.checked = false;
      close();
    });
    
    modal.querySelector('#bulk-apply').addEventListener('click', () => {
      const mode = (modal.querySelector('input[name="bulk-mode"]:checked') || {}).value;
      if (mode === 'custom') {
        const n = Math.max(1, parseInt(modal.querySelector('#bulk-custom-count').value || '0', 10));
        const selectedIds = state.filtered.slice(0, Math.min(n, total)).map(e => e.id);
        selectedIds.forEach(id => state.selected.add(id));
      } else if (mode === 'page') {
        const pageItems = getPageItems();
        pageItems.forEach(email => state.selected.add(email.id));
      } else {
        state.filtered.forEach(email => state.selected.add(email.id));
      }
      close();
      render();
      showBulkBar();
    });
    
    // Keyboard support
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    modal._keydownHandler = handleKeyDown;
    
    // Focus first input
    setTimeout(() => {
      const firstInput = customInput || modal.querySelector('input, button');
      if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
    }, 100);
  }

  function closeBulkSelectModal() {
    const modal = document.getElementById('emails-bulk-select-modal');
    if (modal) {
      if (modal._keydownHandler) {
        document.removeEventListener('keydown', modal._keydownHandler);
        delete modal._keydownHandler;
      }
      modal.classList.remove('show');
      setTimeout(() => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }, 300);
    }
  }

  // Bulk actions bar
  function showBulkBar() {
    updateBulkBar(true);
  }

  function hideBulkBar() {
    const bar = els.page ? els.page.querySelector('#emails-bulk-actions') : document.getElementById('emails-bulk-actions');
    if (bar && bar.parentNode) {
      bar.classList.remove('--show');
      setTimeout(() => {
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      }, 200);
    }
  }

  function updateBulkBar(force = false) {
    if (!els.page) return;
    const count = state.selected.size;
    const shouldShow = force || count > 0;
    const container = els.page.querySelector('#emails-bulk-actions');
    
    if (!shouldShow) {
      if (container) {
        container.classList.remove('--show');
        setTimeout(() => {
          if (container.parentNode) container.parentNode.removeChild(container);
        }, 200);
      }
      return;
    }
    
    // Get selected emails to check their states
    const selectedEmails = state.data.filter(e => state.selected.has(e.id));
    const allRead = selectedEmails.length > 0 && selectedEmails.every(e => !e.unread);
    const allStarred = selectedEmails.length > 0 && selectedEmails.every(e => e.starred);
    
    const html = `
      <div class="bar">
        <button class="action-btn-sm" id="bulk-clear">${svgIcon('clear')}<span>Clear ${count} selected</span></button>
        <span class="spacer"></span>
        <button class="action-btn-sm" id="bulk-mark-read">${svgIcon(allRead ? 'unread' : 'read')}<span>Mark as ${allRead ? 'Unread' : 'Read'}</span></button>
        <button class="action-btn-sm" id="bulk-star">${svgIcon('star')}<span>${allStarred ? 'Unstar' : 'Star'}</span></button>
        <button class="action-btn-sm" id="bulk-export">${svgIcon('export')}<span>Export</span></button>
        <button class="action-btn-sm danger" id="bulk-delete">${svgIcon('delete')}<span>Delete</span></button>
      </div>`;
    
    let barContainer = container;
    if (!barContainer) {
      barContainer = document.createElement('div');
      barContainer.id = 'emails-bulk-actions';
      barContainer.className = 'bulk-actions-modal';
      const tableContainer = els.page.querySelector('.table-container');
      if (tableContainer) {
        tableContainer.appendChild(barContainer);
      } else {
        els.page.appendChild(barContainer);
      }
    }
    barContainer.innerHTML = html;
    
    // Show with animation
    requestAnimationFrame(() => {
      barContainer.classList.add('--show');
    });
    
    // Event handlers
    barContainer.querySelector('#bulk-clear').addEventListener('click', () => {
      state.selected.clear();
      render();
      hideBulkBar();
      if (els.selectAll) {
        els.selectAll.checked = false;
        els.selectAll.indeterminate = false;
      }
    });
    
    barContainer.querySelector('#bulk-mark-read').addEventListener('click', async () => {
      const selectedIds = Array.from(state.selected);
      const newUnreadState = !allRead;
      
      for (const id of selectedIds) {
        const email = state.data.find(e => e.id === id);
        if (email) {
          email.unread = newUnreadState;
          // Update in Firebase if needed
          try {
            const db = window.firebaseDB;
            if (db) {
              await db.collection('emails').doc(id).update({ unread: newUnreadState });
            }
          } catch (e) {
            console.warn('Could not update email in Firebase:', e);
          }
        }
      }
      state.selected.clear();
      applyFilters();
    });
    
    barContainer.querySelector('#bulk-star').addEventListener('click', async () => {
      const selectedIds = Array.from(state.selected);
      const newStarredState = !allStarred;
      
      for (const id of selectedIds) {
        const email = state.data.find(e => e.id === id);
        if (email) {
          email.starred = newStarredState;
          // Update in Firebase if needed
          try {
            const db = window.firebaseDB;
            if (db) {
              await db.collection('emails').doc(id).update({ starred: newStarredState });
            }
          } catch (e) {
            console.warn('Could not update email in Firebase:', e);
          }
        }
      }
      state.selected.clear();
      applyFilters();
    });
    
    barContainer.querySelector('#bulk-export').addEventListener('click', () => {
      const selectedIds = Array.from(state.selected);
      const selectedEmails = state.data.filter(e => selectedIds.includes(e.id));
      
      // Convert to CSV
      const headers = ['From', 'To', 'Subject', 'Date', 'Unread', 'Starred'];
      const rows = selectedEmails.map(e => [
        escapeHtml(e.from || ''),
        escapeHtml(Array.isArray(e.to) ? e.to.join('; ') : (e.to || '')),
        escapeHtml(e.subject || ''),
        escapeHtml(formatDate(e.date) || ''),
        e.unread ? 'Yes' : 'No',
        e.starred ? 'Yes' : 'No'
      ]);
      
      const csv = [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emails-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    
    barContainer.querySelector('#bulk-delete').addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to delete ${count} email(s)?`)) return;
      
      const selectedIds = Array.from(state.selected);
      for (const id of selectedIds) {
        const emailIndex = state.data.findIndex(e => e.id === id);
        if (emailIndex !== -1) {
          state.data.splice(emailIndex, 1);
          // Delete from Firebase
          try {
            const db = window.firebaseDB;
            if (db) {
              await db.collection('emails').doc(id).delete();
            }
          } catch (e) {
            console.warn('Could not delete email from Firebase:', e);
          }
        }
      }
      state.selected.clear();
      applyFilters();
    });
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Strip HTML tags to get plain text (improved to remove style/script tags)
  function stripHtml(html) {
    if (!html) return '';
    
    // First, remove style and script tags completely (they contain CSS/JS, not email content)
    let cleaned = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments
    
    // Then extract text content from remaining HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = cleaned;
    let text = tmp.textContent || tmp.innerText || '';
    
    // Clean up the extracted text
    text = text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return text;
  }

  // Get email preview/snippet (from old emails.js)
  function getEmailPreview(email) {
    // Try to get preview from various content fields
    let preview = '';
    
    // Priority order: snippet, text, html (stripped), content
    if (email.snippet && email.snippet.trim()) {
      preview = email.snippet;
    } else if (email.text && email.text.trim()) {
      preview = email.text;
    } else if (email.html && email.html.trim()) {
      preview = stripHtml(email.html);
    } else if (email.content && email.content.trim()) {
      preview = stripHtml(email.content);
    } else if (email.originalContent && email.originalContent.trim()) {
      preview = stripHtml(email.originalContent);
    }
    
    // Clean up the preview
    if (preview) {
      // Remove legacy tracking pixels to avoid 404s and errors (like email-detail.js does)
      preview = preview
        .replace(/<img[^>]*src=["'][^"']*\/api\/email\/track\/[^"']+["'][^>]*>/gi, '')
        .replace(/<img[^>]*src=["'][^"']*vercel\.app\/api\/email\/track\/[^"']+["'][^>]*>/gi, '');
      
      // Remove extra whitespace and newlines
      preview = preview.replace(/\s+/g, ' ').trim();
      // Limit length to reasonable preview size
      if (preview.length > 100) {
        preview = preview.substring(0, 100) + '...';
      }
    }
    
    return preview || 'No preview available';
  }


  // Update Generate Now button visibility
  function updateGenerateButtonVisibility() {
    if (els.generateBtn) {
      els.generateBtn.style.display = state.currentFolder === 'scheduled' ? 'inline-block' : 'none';
    }
  }

  // Generate scheduled emails manually
  async function generateScheduledEmails() {
    if (!els.generateBtn) return;
    
    // Disable button and show loading state
    els.generateBtn.disabled = true;
    els.generateBtn.textContent = 'Generating...';
    
    try {
      const baseUrl = window.API_BASE_URL || window.location.origin || '';
      const response = await fetch(`${baseUrl}/api/generate-scheduled-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ immediate: true })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('[EmailsPage] Generated scheduled emails:', result);
      
      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast(`Generated ${result.count || 0} scheduled emails`);
      }
      
      // Reload data to show new emails
      await loadData();
      
    } catch (error) {
      console.error('[EmailsPage] Failed to generate scheduled emails:', error);
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to generate scheduled emails');
      }
    } finally {
      // Re-enable button
      els.generateBtn.disabled = false;
      els.generateBtn.textContent = 'Generate Now';
    }
  }

  // Initialize
  async function init() {
    console.log('[EmailsPage] Initializing...');
    if (!initDomRefs()) {
      console.error('[EmailsPage] Failed to initialize DOM references');
      return;
    }
    console.log('[EmailsPage] DOM references initialized');
    attachEvents();
    console.log('[EmailsPage] Events attached');
    await loadData();
    console.log('[EmailsPage] Initialization complete');
  }

  // Reload emails from background loader
  function reloadEmails() {
    if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.reload === 'function') {
      window.BackgroundEmailsLoader.reload().then(() => {
        loadData();
      });
    } else {
      loadData();
    }
  }

  // Get AI templates from settings (integrates with Phase 1)
  function getAITemplatesFromSettings() {
    // Try SettingsPage instance first
    if (window.SettingsPage && window.SettingsPage.instance) {
      const settings = window.SettingsPage.instance.getSettings();
      return settings.aiTemplates || {};
    }
    
    // Fallback to localStorage
    try {
      const savedSettings = localStorage.getItem('crm-settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        return settings.aiTemplates || {};
      }
    } catch (error) {
      console.warn('[AI] Failed to load settings:', error);
    }
    
    // Return empty object with fallback prompts
    return {
      warm_intro: 'Write a warm introduction email after speaking with the prospect on the phone',
      follow_up: 'Write a follow-up email with tailored value propositions',
      energy_health: 'Write an email inviting them to schedule an Energy Health Check',
      proposal: 'Write a proposal delivery email with clear next steps',
      cold_email: 'Write a cold outreach email to a lead I could not reach by phone',
      invoice: 'Write a professional invoice request email'
    };
  }

  // AI functionality moved to email-compose-global.js

  // AI animation functions moved to email-compose-global.js

  // AI generation function moved to email-compose-global.js

  // AI helper functions moved to email-compose-global.js

  // Remaining AI functions moved to email-compose-global.js
  
  // Debug helper function to check scheduled emails in Firebase
  async function debugScheduledEmails() {
    if (!window.firebaseDB) {
      console.error('[EmailsDebug] Firebase not available');
      return;
    }
    
    try {
      const db = window.firebaseDB;
      const now = Date.now();
      
      // Query all scheduled emails
      const allScheduledQuery = await db.collection('emails')
        .where('type', '==', 'scheduled')
        .get();
      
      console.log('=== SCHEDULED EMAILS DEBUG ===');
      console.log(`Total scheduled emails in Firebase: ${allScheduledQuery.size}`);
      
      if (allScheduledQuery.size > 0) {
        const byStatus = {};
        const details = [];
        
        let missingOwnership = 0;
        
        allScheduledQuery.forEach(doc => {
          const data = doc.data();
          const status = data.status || 'unknown';
          byStatus[status] = (byStatus[status] || 0) + 1;
          
          const scheduledTime = data.scheduledSendTime || 0;
          const timeUntilSend = scheduledTime - now;
          const minutesUntilSend = Math.round(timeUntilSend / (60 * 1000));
          
          const hasOwnership = !!(data.ownerId && data.assignedTo && data.createdBy);
          if (!hasOwnership) missingOwnership++;
          
          details.push({
            id: doc.id,
            status: status,
            to: data.to,
            contactName: data.contactName,
            scheduledTime: new Date(scheduledTime).toLocaleString(),
            minutesUntilSend: minutesUntilSend,
            sequenceName: data.sequenceName || 'N/A',
            subject: data.subject || '(not generated)',
            hasOwnership: hasOwnership ? '✅' : '❌ MISSING',
            ownerId: data.ownerId || 'MISSING',
            createdAt: data.createdAt
          });
        });
        
        console.log('Breakdown by status:', byStatus);
        console.table(details);
        console.log(`\n⚠️ CRITICAL: ${missingOwnership} emails are missing ownership fields!`);
        console.log(`✅ ${allScheduledQuery.size - missingOwnership} emails have proper ownership`);
        
        // Show user-friendly summary
        const summary = Object.entries(byStatus)
          .map(([status, count]) => `${count} ${status}`)
          .join(', ');
        
        if (window.crm && window.crm.showToast) {
          if (missingOwnership > 0) {
            window.crm.showToast(`⚠️ Found ${allScheduledQuery.size} scheduled emails but ${missingOwnership} are MISSING ownership fields! See MIGRATION_FIX_EMAILS.md`, 'warning');
          } else {
            window.crm.showToast(`📊 Found ${allScheduledQuery.size} scheduled emails: ${summary}`, 'info');
          }
        }
      } else {
        console.log('No scheduled emails found in Firebase.');
        if (window.crm && window.crm.showToast) {
          window.crm.showToast('⚠️ No scheduled emails found in Firebase. Sequence may not have created emails.', 'warning');
        }
      }
      
      console.log('==============================');
    } catch (error) {
      console.error('[EmailsDebug] Error checking scheduled emails:', error);
    }
  }

  // Export for global access
  window.EmailsPage = { init, reload: reloadEmails, debugScheduledEmails };

  // Create emailManager alias for backward compatibility with click-to-email
  if (!window.emailManager) {
    window.emailManager = {
      openComposeWindow: openComposeModal
    };
  }

  // All AI functions moved to email-compose-global.js
})();