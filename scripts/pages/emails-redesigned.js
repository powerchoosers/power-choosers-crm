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

    // Select all checkbox
    if (els.selectAll) {
      els.selectAll.addEventListener('change', () => {
        if (els.selectAll.checked) {
          const pageItems = getPageItems();
          pageItems.forEach(email => state.selected.add(email.id));
        } else {
          state.selected.clear();
        }
        render();
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
      state.data = emailsData.map(email => ({
        ...email,
        type: email.type || 'received',
        from: email.from || 'Unknown',
        to: email.to || '',
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
      }));
      
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
        return email.type === 'scheduled' && 
               email.scheduledSendTime && 
               email.scheduledSendTime > Date.now() &&
               !email.deleted;
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
    
    // Bind row events
    bindRowEvents();
  }

  // Generate email row HTML with favicon integration and snippet
  function rowHtml(email) {
    const senderDomain = extractDomain(email.from);
    const faviconHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
      domain: senderDomain,
      size: 28
    });

    const senderName = extractName(email.from);
    const isSelected = state.selected.has(email.id);
    const emailPreview = getEmailPreview(email);

    return `
      <tr class="email-row ${isSelected ? 'row-selected' : ''}" data-email-id="${email.id}">
        <td class="col-select">
          <input type="checkbox" class="row-select" data-email-id="${email.id}" ${isSelected ? 'checked' : ''}>
        </td>
        <td class="email-sender-cell">
          <div class="sender-cell__wrap">
            ${faviconHtml}
            <span class="sender-name">${escapeHtml(senderName)}</span>
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
            <button class="qa-btn" data-action="view" data-email-id="${email.id}" title="View">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            ${email.isSentEmail ? `
              <button class="qa-btn" data-action="clicks" data-email-id="${email.id}" title="View clicks">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3.5"/>
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
                </svg>
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
        render();
      });
    });

    // Action buttons
    document.querySelectorAll('.qa-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const emailId = btn.dataset.emailId;
        
        if (action === 'view') {
          viewEmail(emailId);
        } else if (action === 'clicks') {
          showClickDetails(emailId);
        } else if (action === 'reply') {
          replyToEmail(emailId);
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

  // Reply to email
  function replyToEmail(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (email) {
      // Open compose modal with reply data
      openComposeModal(email);
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

  function extractName(email) {
    if (!email || typeof email !== 'string') return 'Unknown';
    
    // Handle format: "Name" <email@domain.com>
    const quotedMatch = email.match(/^"([^"]+)"\s*<(.+)>$/);
    if (quotedMatch) {
      return quotedMatch[1]; // Return the quoted name
    }
    
    // Handle format: Name <email@domain.com>
    const angleMatch = email.match(/^([^<]+)\s*<(.+)>$/);
    if (angleMatch) {
      return angleMatch[1].trim(); // Return name before <
    }
    
    // Handle format: email@domain.com
    const emailMatch = email.match(/^(.+)@/);
    if (emailMatch) {
      return emailMatch[1];
    }
    
    return email; // Fallback to full string
  }

  function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now - d);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'Today';
    } else if (diffDays === 2) {
      return 'Yesterday';
    } else if (diffDays <= 7) {
      return d.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
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

  // Strip HTML tags to get plain text (from old emails.js)
  function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
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
      const response = await fetch('/api/generate-scheduled-emails', {
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

  // Export for global access
  window.EmailsPage = { init, reload: reloadEmails };

  // Create emailManager alias for backward compatibility with click-to-email
  if (!window.emailManager) {
    window.emailManager = {
      openComposeWindow: openComposeModal
    };
  }

  // All AI functions moved to email-compose-global.js
})();