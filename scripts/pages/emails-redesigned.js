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

  // Initialize DOM references
  function initDomRefs() {
    els.page = document.getElementById('emails-page');
    els.tbody = document.getElementById('emails-tbody');
    els.selectAll = document.getElementById('select-all-emails');
    els.filterTabs = document.querySelectorAll('.filter-tab');
    els.searchInput = document.getElementById('emails-search');
    els.clearBtn = document.getElementById('clear-search-btn');
    els.composeBtn = document.getElementById('compose-email-btn');
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

    // Compose window close button
    const composeCloseBtn = document.getElementById('compose-close');
    if (composeCloseBtn && !composeCloseBtn._emailsBound) {
      composeCloseBtn.addEventListener('click', closeComposeModal);
      composeCloseBtn._emailsBound = true;
    }

    // AI button click handler
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="ai"]')) {
        e.preventDefault();
        e.stopPropagation();
        
        const composeWindow = document.getElementById('compose-window');
        const aiBar = composeWindow?.querySelector('.ai-bar');
        
        if (aiBar) {
          // Initialize AI bar if not already rendered
          if (!aiBar.dataset.rendered) {
            renderAIBar(aiBar);
          }
          
          // Toggle AI bar (no DOM manipulation - just toggle classes for animation)
          const isOpen = aiBar.classList.toggle('open');
          aiBar.setAttribute('aria-hidden', String(!isOpen));
          
          console.log('[AI] AI bar toggled:', isOpen ? 'open' : 'closed');
        }
      }
    });

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
        // Only use standardized field for sent emails (new emails only)
        return email.type === 'sent' && !email.deleted;
      });
      console.log('[EmailsPage] Sent filter applied. Filtered count:', filtered.length);
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
            <button class="qa-btn" data-action="reply" data-email-id="${email.id}" title="Reply">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,10 4,15 9,20"/>
                <path d="M20,4v7a4,4,0,0,1-4,4H4"/>
              </svg>
            </button>
          </div>
          ${renderTrackingIcons(email)}
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

  // Render tracking icons for sent emails (from old emails.js)
  function renderTrackingIcons(email) {
    // Only show tracking icons for sent emails
    if (!email.isSentEmail) {
      return '';
    }

    const openCount = email.openCount || 0;
    const clickCount = email.clickCount || 0;
    const hasOpened = openCount > 0;
    const hasClicked = clickCount > 0;

    const gmailBadge = email.sentVia === 'gmail_api' ? 
      '<div class="gmail-badge" title="Sent via Gmail API">Gmail</div>' : '';

    return `
      <div class="email-tracking-icons">
        <div class="tracking-icon ${hasOpened ? 'opened' : 'not-opened'}" title="${hasOpened ? `Opened ${openCount} time${openCount !== 1 ? 's' : ''}` : 'Not opened'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          ${hasOpened ? `<span class="tracking-badge">${openCount}</span>` : ''}
        </div>
        <div class="tracking-icon ${hasClicked ? 'clicked' : 'not-clicked'}" title="${hasClicked ? `Clicked ${clickCount} time${clickCount !== 1 ? 's' : ''}` : 'No clicks'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3.5"/>
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
          </svg>
          ${hasClicked ? `<span class="tracking-badge">${clickCount}</span>` : ''}
        </div>
        ${gmailBadge}
      </div>
    `;
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

  // Render AI bar with suggestions from settings
  function renderAIBar(aiBar) {
    if (!aiBar) return;
    
    if (aiBar.dataset.rendered === 'true') {
      console.log('[AI] Bar already rendered');
      return;
    }
    
    console.log('[AI] Rendering AI bar...');
    
    // Get custom prompts from settings (Phase 1 integration)
    const aiTemplates = getAITemplatesFromSettings();
    
    const suggestions = [
      { text: 'Warm intro after a call', prompt: aiTemplates.warm_intro, template: 'warm_intro' },
      { text: 'Follow-up with value props', prompt: aiTemplates.follow_up, template: 'follow_up' },
      { text: 'Energy Health Check', prompt: aiTemplates.energy_health, template: 'energy_health' },
      { text: 'Proposal delivery', prompt: aiTemplates.proposal, template: 'proposal' },
      { text: 'Cold email outreach', prompt: aiTemplates.cold_email, template: 'cold_email' },
      { text: 'Invoice request', prompt: aiTemplates.invoice, template: 'invoice' }
    ];
    
    aiBar.innerHTML = `
      <div class="ai-inner">
        <div class="ai-row">
          <textarea class="ai-prompt input-dark" rows="3" 
                    placeholder="Describe the email you want... (tone, goal, offer, CTA)"></textarea>
        </div>
        <div class="ai-row suggestions" role="list">
          ${suggestions.map(s => 
            `<button class="ai-suggestion" type="button" 
                     data-prompt="${escapeHtml(s.prompt)}" 
                     data-template="${s.template}">${s.text}</button>`
          ).join('')}
        </div>
        <div class="ai-row actions">
          <button class="fmt-btn ai-generate" data-mode="standard">Generate Standard</button>
          <button class="fmt-btn ai-generate" data-mode="html">Generate HTML</button>
          <div class="ai-status" aria-live="polite"></div>
        </div>
      </div>
    `;
    
    // Wire events
    wireAIBarEvents(aiBar);
    aiBar.dataset.rendered = 'true';
  }

  // Wire AI bar events
  function wireAIBarEvents(aiBar) {
    console.log('[AI] Wiring suggestion button events...');
    const suggestionButtons = aiBar.querySelectorAll('.ai-suggestion');
    console.log('[AI] Found suggestion buttons:', suggestionButtons.length);
    
    suggestionButtons.forEach((btn, index) => {
      console.log(`[AI] Adding click listener to suggestion ${index}:`, btn.textContent);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[AI] Suggestion clicked:', btn.textContent);
        const ta = aiBar.querySelector('.ai-prompt');
        if (ta) {
          const prompt = btn.getAttribute('data-prompt') || btn.textContent;
          ta.value = prompt;
          ta.focus();
          console.log('[AI] Updated textarea value:', ta.value);
        }
      });
    });
    
    console.log('[AI] Wiring generate button events...');
    aiBar.querySelectorAll('.ai-generate').forEach((btn, index) => {
      console.log(`[AI] Adding click listener to generate button ${index}:`, btn.textContent);
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[AI] Generate button clicked:', btn.textContent);
        const mode = btn.getAttribute('data-mode') || 'standard';
        await generateWithAI(aiBar, mode);
      });
    });
  }

  // Generate email with AI
  async function generateWithAI(aiBar, mode = 'standard') {
    const compose = document.getElementById('compose-window');
    const editor = compose?.querySelector('.body-input');
    const status = aiBar?.querySelector('.ai-status');
    const prompt = aiBar?.querySelector('.ai-prompt')?.value?.trim() || '';
    const toInput = compose?.querySelector('#compose-to');
    const subjectInput = compose?.querySelector('#compose-subject');
    
    if (!editor) return;

    // Close AI bar immediately
    if (aiBar) {
      aiBar.classList.remove('open');
      aiBar.setAttribute('aria-hidden', 'true');
    }

    // Start generating animation
    startGeneratingAnimation(compose);
    if (status) status.textContent = 'Generating...';
    
    try {
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const genUrl = `${base}/api/perplexity-email`;
      
      console.log('[AI] Calling Perplexity Sonar...');

      // Get recipient data with enrichment
      let recipient = null;
      try {
        const toVal = toInput?.value || '';
        if (toVal) {
          recipient = await lookupPersonByEmail(toVal);
          // Enrich with account data
          recipient = await enrichRecipientWithAccountData(recipient);
        }
      } catch (error) {
        console.warn('[AI] Failed to lookup recipient:', error);
      }

      // Get sender name from settings
      const settings = (window.SettingsPage?.getSettings?.()) || {};
      const g = settings?.general || {};
      const senderName = (g.firstName && g.lastName) 
        ? `${g.firstName} ${g.lastName}`.trim()
        : (g.agentName || 'Power Choosers Team');

      // Get "who we are" information from settings
      const aiTemplates = getAITemplatesFromSettings();
      const whoWeAre = aiTemplates.who_we_are || 'You are an Energy Strategist at Power Choosers, a company that helps businesses secure lower electricity and natural gas rates.';

      // Call the API
      const response = await fetch(genUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          recipient: recipient,
          mode: mode,
          senderName: senderName,
          whoWeAre: whoWeAre
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[AI] Received response:', result);

      // Handle different response formats based on mode and templateType
      const templateType = result.templateType || null;
      const output = result.output || '';

      let subject = '';
      let html = '';

      if (templateType) {
        // HTML mode with structured JSON
        const formatted = formatTemplatedEmail(output, recipient, templateType);
        subject = formatted.subject;
        html = formatted.html;
      } else {
        // Standard mode with plain text
        const formatted = formatGeneratedEmail(output, recipient, mode);
        subject = formatted.subject;
        html = formatted.html;
      }

      // Insert the formatted content
      if (subject && subjectInput) {
        // Remove "Re:" prefix if it's a new email (not a reply)
        let cleanSubject = subject;
        if (cleanSubject.startsWith('Re: ')) {
          cleanSubject = cleanSubject.substring(4);
        }
        subjectInput.value = cleanSubject;
      }

      if (html && editor) {
        editor.innerHTML = html;
      }

      // Stop generating animation
      stopGeneratingAnimation(compose);
      if (status) status.textContent = 'Generated successfully!';

    } catch (error) {
      console.error('[AI] Generation failed:', error);
      stopGeneratingAnimation(compose);
      if (status) status.textContent = 'Generation failed. Please try again.';
    }
  }

  // Lookup person by email
  async function lookupPersonByEmail(email) {
    try {
      // Try to get from people data
      let people = [];
      
      // Priority 1: BackgroundPeopleLoader
      if (window.BackgroundPeopleLoader && typeof window.BackgroundPeopleLoader.getPeopleData === 'function') {
        people = window.BackgroundPeopleLoader.getPeopleData() || [];
      }
      
      // Priority 2: CacheManager
      if (people.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        people = await window.CacheManager.get('people') || [];
      }
      
      // Find person by email
      const person = people.find(p => 
        p.email === email || 
        p.workEmail === email || 
        p.personalEmail === email
      );
      
      if (person) {
        return {
          email: email,
          name: person.firstName && person.lastName ? `${person.firstName} ${person.lastName}` : person.name || email.split('@')[0],
          company: person.company || person.accountName || '',
          title: person.title || '',
          phone: person.phone || person.workPhone || ''
        };
      }
      
      // Fallback to basic structure
      return {
        email: email,
        name: email.split('@')[0],
        company: '',
        title: '',
        phone: ''
      };
    } catch (error) {
      console.warn('[AI] Error looking up person:', error);
      return {
        email: email,
        name: email.split('@')[0],
        company: '',
        title: '',
        phone: ''
      };
    }
  }

  // Animation helpers
  function startGeneratingAnimation(compose) {
    const editor = compose?.querySelector('.body-input');
    if (editor) {
      editor.style.opacity = '0.6';
      editor.style.pointerEvents = 'none';
    }
  }

  function stopGeneratingAnimation(compose) {
    const editor = compose?.querySelector('.body-input');
    if (editor) {
      editor.style.opacity = '1';
      editor.style.pointerEvents = 'auto';
    }
  }

  // Export for global access
  window.EmailsPage = { init, reload: reloadEmails };

  // Create emailManager alias for backward compatibility with click-to-email
  if (!window.emailManager) {
    window.emailManager = {
      openComposeWindow: openComposeModal
    };
  }

  // ========== AI EMAIL FORMATTING FUNCTIONS (from emails.js) ==========

  // Enrich recipient with account data
  async function enrichRecipientWithAccountData(recipient) {
    if (!recipient || !recipient.company) return recipient;

    try {
      // Get accounts data
      let accounts = [];
      
      // Priority 1: BackgroundAccountsLoader
      if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
        accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
      }
      
      // Priority 2: CacheManager
      if (accounts.length === 0 && window.CacheManager && typeof window.CacheManager.get === 'function') {
        accounts = await window.CacheManager.get('accounts') || [];
      }

      // Find matching account
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(llc|inc|inc\.|co|co\.|corp|corp\.|ltd|ltd\.)\b/g,' ').replace(/\s+/g,' ').trim();
      const comp = norm(recipient.company || '');
      const domain = (recipient.email || '').split('@')[1]?.toLowerCase() || '';
      
      let acct = null;
      if (comp) {
        acct = accounts.find(a => {
          const accountName = a.accountName || a.name || '';
          if (!accountName) return false;
          const normalizedAccountName = norm(accountName);
          return normalizedAccountName === comp || 
                 normalizedAccountName.includes(comp) || 
                 comp.includes(normalizedAccountName);
        }) || null;
      }
      
      if (!acct && domain) {
        acct = accounts.find(a => {
          const d = String(a.domain || a.website || '').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
          return d && domain.endsWith(d);
        }) || null;
      }

      if (acct) {
        const acctEnergy = {
          supplier: acct.electricitySupplier || '',
          currentRate: acct.currentRate || '',
          usage: acct.annualUsage || '',
          contractEnd: acct.contractEndDate || ''
        };
        
        recipient.account = {
          id: acct.id,
          name: acct.accountName || acct.name || '',
          industry: acct.industry || '',
          domain: acct.domain || acct.website || '',
          city: acct.city || acct.billingCity || acct.locationCity || '',
          state: acct.state || acct.billingState || acct.region || '',
          shortDescription: acct.shortDescription || acct.short_desc || acct.descriptionShort || acct.description || '',
          logoUrl: acct.logoUrl || '',
          phone: acct.phone || acct.companyPhone || '',
          annualUsage: acct.annualUsage || '',
          electricitySupplier: acct.electricitySupplier || '',
          currentRate: acct.currentRate || '',
          contractEndDate: acct.contractEndDate || ''
        };
        
        let rate = String(acctEnergy.currentRate || '').trim();
        if (/^\.\d+$/.test(rate)) rate = '0' + rate;
        recipient.energy = { ...acctEnergy, currentRate: rate };
      }
    } catch (e) {
      console.warn('[AI] Could not enrich recipient with account data', e);
    }

    return recipient;
  }

  // Format templated email from JSON response with preset HTML template
  function formatTemplatedEmail(jsonData, recipient, templateType) {
    try {
      console.log('[AI] Formatting templated email, type:', templateType);
      
      // Extract data from JSON response
      const subject = jsonData.subject || 'Energy Solutions';
      
      // Build template HTML using the appropriate builder
      const templateHtml = buildTemplateHtml(templateType, jsonData, recipient);
      
      // Wrap with branding (header + footer)
      const fullHtml = wrapSonarHtmlWithBranding(templateHtml, recipient, subject);
      
      console.log('[AI] Template email built successfully');
      
      return {
        subject: subject,
        html: fullHtml
      };
    } catch (error) {
      console.error('[AI] Error formatting templated email:', error);
      // Fallback to basic formatting
      return {
        subject: 'Energy Solutions',
        html: '<p>Error generating email. Please try again.</p>'
      };
    }
  }

  // Convert model output into a clean subject + body with greeting, paragraphs, and closing
  function formatGeneratedEmail(output, recipient, mode = 'standard') {
    const raw = String(output || '').trim();
    let subject = '';
    let body = raw;

    // Extract explicit Subject: line if present
    const subjMatch = raw.match(/^\s*Subject\s*:\s*(.+)$/im);
    if (subjMatch) {
      subject = (subjMatch[1] || '').trim();
      body = raw.replace(subjMatch[0], '').trim();
    } else {
      // Fallback: use first non-empty line as subject (<= 120 chars) if it looks like a title
      const firstLine = (raw.split(/\r?\n/).find(l => l.trim().length) || '').trim();
      if (firstLine && firstLine.length <= 120) {
        subject = firstLine.replace(/^[ -•\s]+/, '');
        const idx = raw.indexOf(firstLine);
        body = idx >= 0 ? raw.slice(idx + firstLine.length).trim() : raw;
      }
    }

    // Prepare greeting
    const nameSource = (recipient?.fullName || recipient?.name || '').trim();
    const firstName = (nameSource.split(' ')[0] || '').trim();
    const companyName = (recipient?.company || recipient?.account?.name || '').trim();
    const greeting = firstName ? `Hi ${firstName},` : (companyName ? `Hi ${companyName} team,` : 'Hi,');

    // Clean up body content
    const lines = body.split('\n');
    const greetAnyRegex = /^\s*(hi|hello|hey)\b.*?[,!-]?\s*$/i;
    const closingTerms = [
      'best regards','regards','kind regards','warm regards','sincerely','thanks','thank you','cheers'
    ];
    const isClosingLine = (text) => {
      const t = String(text || '').toLowerCase().replace(/\s+/g,' ').trim();
      const t2 = t.replace(/[.,!;:]+$/,'');
      return closingTerms.some(term => t2.startsWith(term));
    };

    const kept = [];
    let cut = false;
    for (const ln of lines) {
      if (cut) break;
      const t = ln.trim();
      if (!t) { kept.push(''); continue; }
      if (isClosingLine(t)) { cut = true; continue; }
      if (greetAnyRegex.test(t)) { continue; }
      // Also drop a greeting directly addressing firstName
      if (firstName) {
        const nameEsc = firstName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const greetNameRegex = new RegExp(`^\\s*(hi|hello|hey)\\s+${nameEsc}\\s*[,!-]?\\s*$`, 'i');
        if (greetNameRegex.test(t)) { continue; }
      }
      kept.push(ln);
    }

    // Trim and clean up
    while (kept.length && !kept[0].trim()) kept.shift();
    while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
    
    const compact = [];
    let lastBlank = false;
    for (const ln of kept) {
      const blank = !ln.trim();
      if (blank && lastBlank) continue;
      compact.push(ln);
      lastBlank = blank;
    }

    // Rebuild body and normalize paragraphs
    body = compact.join('\n').trim();
    body = body
      .split(/\n{2,}/)
      .map(p => {
        if (/^(\s*[•\-]\s+)/m.test(p)) {
          return String(p).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
        }
        return p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean)
      .join('\n\n');

    // Build HTML paragraphs from body
    let paras = body.split(/\n\n/).map(p => p.trim()).filter(Boolean);

    // Remove duplicate name at start of first content paragraph
    if (paras.length > 0 && firstName) {
      const firstPara = paras[0];
      const namePattern = new RegExp(`^${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s+`, 'i');
      if (namePattern.test(firstPara)) {
        paras[0] = firstPara.replace(namePattern, '');
      }
    }

    // Build content HTML
    let contentHtml = `<p>${greeting}</p>`;
    
    // Add paragraphs
    paras.forEach(para => {
      if (/^(\s*[•\-]\s+)/m.test(para)) {
        // Handle bullet lists
        const lines = para.split('\n');
        const header = lines[0].replace(/^(\s*[•\-]\s+)/, '');
        const bullets = lines.slice(1).map(line => line.replace(/^(\s*[•\-]\s+)/, ''));
        
        contentHtml += `<p><strong>${header}</strong></p><ul>`;
        bullets.forEach(bullet => {
          contentHtml += `<li>${bullet}</li>`;
        });
        contentHtml += '</ul>';
      } else {
        contentHtml += `<p>${para}</p>`;
      }
    });

    // Add closing
    contentHtml += '<p>Best regards,<br>Power Choosers Team</p>';

    return { subject, html: contentHtml };
  }

  // Build template HTML for different template types
  function buildTemplateHtml(templateType, data, recipient, fromEmail) {
    console.log('[AI] Building template:', templateType);
    
    switch (templateType) {
      case 'warm_intro':
        return buildWarmIntroHtml(data, recipient, fromEmail);
      case 'follow_up':
        return buildFollowUpHtml(data, recipient, fromEmail);
      case 'energy_health':
        return buildEnergyHealthHtml(data, recipient, fromEmail);
      case 'proposal':
        return buildProposalHtml(data, recipient, fromEmail);
      case 'cold_email':
        return buildColdEmailHtml(data, recipient, fromEmail);
      case 'invoice':
        return buildInvoiceHtml(data, recipient, fromEmail);
      case 'general':
      default:
        return buildGeneralHtml(data, recipient, fromEmail);
    }
  }


  function buildFollowUpHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const valueProps = Array.isArray(data.value_props) ? data.value_props : [data.value_props || ''];
    
    return `
<div style="text-align:left; margin:0 0 20px 0;">
    <p style="color:#1f2937; font-size:15px; line-height:1.4; margin:0;">
        ${escapeHtml(data.greeting || 'Hi,')}
    </p>
</div>

<div style="background:linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); padding:20px; border-radius:8px; margin:20px 0; border:1px solid #d8b4fe;">
    <h3 style="color:#7c3aed; font-size:18px; margin:0 0 10px 0; font-weight:600;">📊 Progress Update</h3>
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${escapeHtml(data.progress_update || 'Here\'s where we are...')}
    </p>
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
        <td width="50%" style="padding-right:10px; vertical-align:top;">
            <div style="background:#ffffff; padding:20px; border-radius:8px; border:1px solid #d8b4fe; box-shadow:0 1px 3px rgba(0,0,0,0.05); height:100%;">
                <h4 style="color:#7c3aed; font-size:16px; margin:0 0 15px 0; font-weight:600;">✓ Key Benefits</h4>
                ${valueProps.slice(0, Math.ceil(valueProps.length / 2)).map(prop => 
                    `<p style="color:#1f2937; font-size:14px; line-height:1.5; margin:0 0 10px 0;">• ${escapeHtml(prop)}</p>`
                ).join('')}
            </div>
        </td>
        <td width="50%" style="padding-left:10px; vertical-align:top;">
            <div style="background:#ffffff; padding:20px; border-radius:8px; border:1px solid #d8b4fe; box-shadow:0 1px 3px rgba(0,0,0,0.05); height:100%;">
                <h4 style="color:#7c3aed; font-size:16px; margin:0 0 15px 0; font-weight:600;">✓ Why Act Now</h4>
                ${valueProps.slice(Math.ceil(valueProps.length / 2)).map(prop => 
                    `<p style="color:#1f2937; font-size:14px; line-height:1.5; margin:0 0 10px 0;">• ${escapeHtml(prop)}</p>`
                ).join('')}
            </div>
        </td>
    </tr>
</table>

<div style="background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left:4px solid #f59e0b; padding:15px; border-radius:8px; margin:20px 0;">
    <p style="color:#92400e; font-size:14px; line-height:1.5; margin:0; font-weight:600;">
        ⚠️ Market Update: ${escapeHtml(data.urgency_message || 'Time-sensitive opportunity')}
    </p>
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius:8px; padding:16px 32px; box-shadow:0 4px 12px rgba(16, 185, 129, 0.3);">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:600; font-size:16px;">
                ${escapeHtml(data.cta_text || 'Let\'s Continue the Conversation')}
            </a>
        </td>
    </tr>
</table>`;
  }

  function buildEnergyHealthHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const assessmentItems = Array.isArray(data.assessment_items) ? data.assessment_items : [data.assessment_items || ''];
    
    return `
<div style="text-align:left; margin:0 0 20px 0;">
    <p style="color:#1f2937; font-size:15px; line-height:1.4; margin:0;">
        ${escapeHtml(data.greeting || 'Hi,')}
    </p>
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); padding:25px; border-radius:8px; text-align:center; box-shadow:0 4px 12px rgba(20, 184, 166, 0.3);">
            <h2 style="color:#ffffff; font-size:24px; margin:0; font-weight:600;">⚡ Free Energy Health Check</h2>
            <p style="color:#ffffff; font-size:14px; margin:10px 0 0 0; opacity:0.95;">Comprehensive Assessment • No Obligation</p>
        </td>
    </tr>
</table>

<div style="background:linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); padding:20px; border-radius:8px; margin:20px 0; border:1px solid #99f6e4;">
    <h3 style="color:#0f766e; font-size:18px; margin:0 0 15px 0; font-weight:600;">📋 What We'll Review</h3>
    ${assessmentItems.map(item => 
        `<div style="background:#ffffff; padding:12px; margin:8px 0; border-radius:6px; border-left:3px solid #14b8a6; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
            <p style="color:#1f2937; font-size:14px; margin:0; line-height:1.5;">✓ ${escapeHtml(item)}</p>
        </div>`
    ).join('')}
</div>

<table width="100%" cellpadding="15" cellspacing="0" border="0" style="background:linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius:8px; margin:20px 0;">
    <tr>
        <td>
            <p style="color:#065f46; font-size:15px; line-height:1.5; margin:0;">
                <strong>Your Contract:</strong> ${escapeHtml(data.contract_info || 'Review current terms and expiration')}
            </p>
        </td>
    </tr>
</table>

<div style="background:#ffffff; padding:20px; border-radius:8px; margin:20px 0; border:1px solid #99f6e4; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${escapeHtml(data.benefits || 'Get insights into potential savings and optimization opportunities.')}
    </p>
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #14b8a6 0%, #0d9488 100%); border-radius:8px; padding:16px 32px; box-shadow:0 4px 12px rgba(20, 184, 166, 0.3);">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:600; font-size:16px;">
                ${escapeHtml(data.cta_text || 'Schedule Your Free Assessment')}
            </a>
        </td>
    </tr>
</table>`;
  }

  function buildProposalHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const timeline = Array.isArray(data.timeline) ? data.timeline : [
      'Contract review and approval (24 Hours)',
      'Supplier onboarding and enrollment (30-45 days from start date)',
      'Service activation (seamless transition)'
    ];
    
    return `
<div style="margin:20px 0 2px 0; font-size:14px; color:#b45309; font-weight:600; letter-spacing:0.02em; opacity:0.93; background:#fef3c7; padding:6px 13px; border-radius:6px; display:inline-block;">
    📄 Your Custom Proposal
    <span style="display:inline-block; background:#d97706; color:#fff; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; letter-spacing:0.05em; margin-left:8px; vertical-align:middle;">EXCLUSIVE</span>
</div>

<div style="margin:18px 0; padding:18px 0 2px 0;">
    <p style="margin:0 0 3px 0; font-size:16px; color:#1e3a8a;">
        ${escapeHtml(data.greeting || 'Hi,')}
    </p>
    <p style="margin:0; font-size:16px; color:#1e3a8a;">
        I'm excited to share the custom energy proposal we've prepared. Based on your facility's profile and energy needs, we've secured competitive rates from three top-tier suppliers.
    </p>
</div>

<div style="background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border:1px solid #fbbf24; padding:18px 20px; margin:18px 0; border-radius:8px; box-shadow:0 2px 8px rgba(245,158,11,0.08);">
    <h3 style="color:#b45309; font-size:16px; margin:0 0 10px 0; font-weight:600;">Proposal Summary</h3>
    <p style="color:#1f2937; font-size:15px; line-height:1.5; margin:0;">
        ${escapeHtml(data.proposal_summary || 'This proposal includes fixed-rate options that lock in significant savings before your contract expiration, protecting you from projected rate increases.')}
    </p>
</div>

<div style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding:20px; margin:18px 0; border-radius:8px; text-align:center; box-shadow:0 4px 12px rgba(245,158,11,0.3);">
    <h3 style="color:#ffffff; font-size:18px; margin:0 0 10px 0; text-shadow:0 2px 4px rgba(0,0,0,0.2);">💰 Pricing Highlight</h3>
    <p style="color:#ffffff; font-size:16px; line-height:1.5; margin:0; font-weight:600;">
        ${escapeHtml(data.pricing_highlight || 'Best rate: 15% below current rate with estimated annual savings')}
    </p>
</div>

<div style="background:#ffffff; padding:18px 20px; margin:18px 0; border-radius:8px; border:1px solid #fbbf24; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <h3 style="color:#b45309; font-size:16px; margin:0 0 15px 0; font-weight:600;">📅 Implementation Timeline</h3>
    ${timeline.map((step, idx) => 
        `<div style="padding:12px; margin:8px 0; background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius:6px; border-left:4px solid #f59e0b;">
            <p style="color:#1f2937; font-size:14px; margin:0;"><strong>Step ${idx + 1}:</strong> ${escapeHtml(step)}</p>
        </div>`
    ).join('')}
</div>

<p style="margin:18px 0; padding:18px; background:#fff; border-radius:7px; line-height:1.6; color:#1f2937; font-size:15px;">
    Our team has negotiated these rates exclusively for your facility. The pricing is competitive, the transition is seamless, and you maintain complete control throughout the process. This is a <strong>time-sensitive offer</strong> as market conditions continue to shift.
</p>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius:7px; padding:13px 36px; box-shadow:0 2px 8px rgba(245,158,11,0.13); transition:background 0.18s;">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${escapeHtml(data.cta_text || 'Let\'s Discuss Your Proposal')}
            </a>
        </td>
    </tr>
</table>

<p style="margin-top:8px; font-size:14px; color:#b45309; opacity:0.83; text-align:center;">
    Questions? I'm here to walk through every detail.
</p>`;
  }

  function buildColdEmailHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    
    return `
<div style="text-align:left; margin:0 0 20px 0;">
    <p style="color:#1f2937; font-size:15px; line-height:1.4; margin:0;">
        ${escapeHtml(data.greeting || 'Hi,')}
    </p>
</div>

<div style="background:linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); padding:20px; border-radius:8px; margin:20px 0; border:1px solid #fca5a5;">
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${escapeHtml(data.opening_hook || 'Companies are facing significant energy cost increases as contracts come up for renewal.')}
    </p>
</div>

<div style="background:linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); border:1px solid #99f6e4; padding:20px; border-radius:8px; margin:20px 0;">
    <h3 style="color:#0f766e; font-size:18px; margin:0 0 10px 0; font-weight:600;">✓ How Power Choosers Helps</h3>
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${escapeHtml(data.value_proposition || 'We help businesses reduce energy costs through competitive procurement and efficiency solutions.')}
    </p>
</div>

<div style="background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border:1px solid #fbbf24; padding:20px; border-radius:8px; margin:20px 0;">
    <h3 style="color:#b45309; font-size:18px; margin:0 0 10px 0; font-weight:600;">📊 Market Insight</h3>
    <p style="color:#1f2937; font-size:15px; line-height:1.6; margin:0;">
        ${escapeHtml(data.social_proof_optional || 'Energy rates are projected to increase 15-25% over the next 12 months. Early contract renewal can secure significant savings.')}
    </p>
</div>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border-radius:8px; padding:16px 32px; box-shadow:0 4px 12px rgba(220, 38, 38, 0.3);">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:600; font-size:16px;">
                ${escapeHtml(data.cta_text || 'Schedule a Quick Call')}
            </a>
        </td>
    </tr>
</table>`;
  }

  function buildInvoiceHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const checklist = Array.isArray(data.checklist_items) ? data.checklist_items : [data.checklist_items || ''];
    const discrepancies = Array.isArray(data.discrepancies) ? data.discrepancies : [data.discrepancies || ''];
    
    return `
<div style="margin:20px 0 2px 0; font-size:14px; color:#2563eb; font-weight:600; letter-spacing:0.02em; opacity:0.93; background:#f0f9ff; padding:6px 13px; border-radius:6px; display:inline-block;">
    📎 Invoice Request for Energy Analysis
</div>

<div style="margin:18px 0; padding:18px 0 2px 0;">
    <p style="margin:0 0 3px 0; font-size:16px; color:#1e3a8a;">
        ${escapeHtml(data.greeting || 'Hi,')}
    </p>
    <p style="margin:0 0 3px 0; font-size:16px; color:#1e3a8a;">
        ${escapeHtml(data.intro_paragraph || 'As we discussed, we\'re conducting an energy analysis for your facility to identify any discrepancies and determine how you\'re using energy.')}
    </p>
</div>

<div style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%); border:1px solid #fbbf24; padding:20px 22px; margin:18px 0; border-radius:8px; box-shadow:0 1px 3px rgba(245,158,11,0.08);">
    <h3 style="margin:0 0 12px 0; color:#d97706; font-size:16px; font-weight:600; letter-spacing:0.02em;">💡 Key Points</h3>
    <p style="margin:0; color:#1f2937; font-size:15.5px; line-height:1.6; font-weight:500;">
        With your contract ending and rates expected to rise 15-25%, it's important we review your current invoice to identify potential savings opportunities before your renewal period.
    </p>
</div>

<div style="background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding:20px; border-radius:8px; margin:20px 0; border:1px solid #bae6fd;">
    <table width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
            <td width="50%" style="vertical-align:top; padding-right:10px;">
                <h3 style="color:#0369a1; font-size:16px; margin:0 0 12px 0; font-weight:600;">✓ What We'll Review</h3>
                <div style="padding-left:0; text-align:left;">
                    ${checklist.map(item => 
                        `<div style="padding:4px 0;">
                            <p style="color:#1f2937; font-size:13px; line-height:1.5; margin:0;">• ${escapeHtml(item)}</p>
                        </div>`
                    ).join('')}
                </div>
            </td>
            <td width="50%" style="vertical-align:top; padding-left:10px;">
                <h3 style="color:#dc2626; font-size:16px; margin:0 0 12px 0; font-weight:600;">⚠️ Common Discrepancies</h3>
                <div style="padding-left:0; text-align:left;">
                    ${discrepancies.map(item => 
                        `<div style="padding:4px 0;">
                            <p style="color:#1f2937; font-size:13px; line-height:1.5; margin:0;">• ${escapeHtml(item)}</p>
                        </div>`
                    ).join('')}
                </div>
            </td>
        </tr>
    </table>
</div>

<table width="100%" cellpadding="15" cellspacing="0" border="0" style="background:linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-radius:8px; margin:20px 0; border:1px solid #fca5a5;">
    <tr>
        <td style="text-align:center;">
            <p style="color:#dc2626; font-size:16px; margin:0; font-weight:600;">
                ⏰ ${escapeHtml(data.deadline || 'Needed in 3 business days')}
            </p>
        </td>
    </tr>
</table>

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius:8px; padding:16px 32px; text-align:center; box-shadow:0 4px 12px rgba(37, 99, 235, 0.3);">
            <a href="#" style="color:#ffffff; text-decoration:none; font-weight:600; font-size:16px;">
                📅 Click to Schedule a Strategy Call
            </a>
        </td>
    </tr>
</table>`;
  }

  function buildGeneralHtml(data, recipient, fromEmail) {
    const mail = fromEmail || 'l.patterson@powerchoosers.com';
    const sections = Array.isArray(data.sections) ? data.sections : [data.sections || ''];
    
    return `
<div style="margin:20px 0 10px 0; font-size:14px; color:#234bb7; font-weight:600; letter-spacing:0.02em; opacity:0.93; background:#eff6ff; padding:8px 15px; border-radius:6px; display:inline-block;">
    Subject: ${escapeHtml(data.subject || 'Energy Solutions')}
</div>

<div style="margin:18px 0; padding:18px 0 2px 0;">
    <p style="margin:0 0 12px 0; font-size:16px; color:#1e3a8a; line-height:1.6;">
        ${escapeHtml(data.greeting || 'Hi,')}
    </p>
    ${sections.slice(0, 1).map(section => 
        `<p style="margin:0 0 12px 0; font-size:16px; color:#1e3a8a; line-height:1.6;">
            ${escapeHtml(section)}
        </p>`
    ).join('')}
</div>

${sections.length > 1 ? `
<div style="background:#f6f7fb; border-radius:8px; padding:12px 18px; margin:0 auto 18px auto; max-width:450px; box-shadow:0 2px 8px rgba(30,64,175,0.06); font-size:14px; color:#22223b;">
    <strong>${escapeHtml(data.list_header || 'How Power Choosers Can Help:')}</strong>
    <ul style="margin:0; padding:0; list-style:none;">
        ${sections.slice(1).map(item => 
            `<li style="padding:4px 0; border-bottom:1px solid #e5e8ec; line-height:1.5;">${escapeHtml(item)}</li>`
        ).join('')}
    </ul>
</div>` : ''}

<table border="0" cellspacing="0" cellpadding="0" style="margin:25px 0;">
    <tr>
        <td style="background:linear-gradient(135deg, #f97316 0%, #ea580c 100%); border-radius:7px; padding:13px 36px; box-shadow:0 2px 8px rgba(249,115,22,0.13); transition:background 0.18s;">
            <a href="mailto:${mail}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size:16px;">
                ${escapeHtml(data.cta_text || 'Schedule A Meeting')}
            </a>
        </td>
    </tr>
</table>

<p style="margin-top:8px; font-size:14px; color:#1e3a8a; opacity:0.83; text-align:center;">
    Prefer email or need more info? Just reply—happy to assist.
</p>`;
  }

  // Wrap Sonar-generated HTML with Power Choosers branding
  function wrapSonarHtmlWithBranding(sonarGeneratedHtml, recipient, subject) {
    const company = recipient?.company || recipient?.accountName || 'Your Company';
    const logoUrl = 'https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/687d6d9c6ea5d6db744563ee_clear%20logo.png';
    const safeSubject = escapeHtml(subject || 'Energy Solutions');
    
    // Get sender info from settings (with Google login auto-population)
    const settings = (window.SettingsPage?.getSettings?.()) || {};
    const g = settings?.general || {};
    
    // Build full name from Google login or fallback to agentName
    const senderFirstName = g.firstName || '';
    const senderLastName = g.lastName || '';
    const senderName = (senderFirstName && senderLastName) 
        ? `${senderFirstName} ${senderLastName}`.trim()
        : (g.agentName || 'Power Choosers Team');
    
    const senderTitle = g.jobTitle || 'Energy Strategist';
    const senderLocation = g.location || 'Fort Worth, TX';
    const senderPhone = g.phone || '';
    const senderEmail = g.email || '';
    const senderAvatar = g.hostedPhotoURL || g.photoURL || '';
    const companyName = g.companyName || 'Power Choosers';
    
    // Build signature HTML with avatar if available
    let signatureHTML = '';
    if (senderAvatar) {
        // Modern signature with avatar
        signatureHTML = `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <img src="${escapeHtml(senderAvatar)}" alt="${escapeHtml(senderName)}" 
             style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
        <div>
          <div style="font-weight: 600; font-size: 15px; color: #1e3a8a;">${escapeHtml(senderName)}</div>
          <div style="font-size: 13px; color: #1e40af; opacity: 0.9;">${escapeHtml(senderTitle)}</div>
        </div>
      </div>
      <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
        ${escapeHtml(senderLocation)}<br>
        ${senderPhone ? escapeHtml(senderPhone) + '<br>' : ''}
        ${senderEmail ? escapeHtml(senderEmail) + '<br>' : ''}
        ${escapeHtml(companyName)}
      </div>`;
    } else {
        // Classic signature without avatar
        signatureHTML = `
      ${escapeHtml(senderName)}<br>
      ${escapeHtml(senderTitle)}<br>
      ${escapeHtml(senderLocation)}<br>
      ${senderPhone ? escapeHtml(senderPhone) + '<br>' : ''}
      ${senderEmail ? escapeHtml(senderEmail) + '<br>' : ''}
      ${escapeHtml(companyName)}`;
    }
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <style>
    body { margin:0; padding:0; background:#f1f5fa; font-family:'Segoe UI',Arial,sans-serif; color:#1e3a8a;}
    .container { max-width:600px; margin:30px auto; background:#fff; border-radius:14px;
      box-shadow:0 6px 28px rgba(30,64,175,0.11),0 1.5px 4px rgba(30,64,175,0.03);
      overflow:hidden;
    }
    .signature {
      margin:15px 24px 22px 24px; font-size:15.3px; color:#1e40af;
      font-weight:500; padding:14px 0 0 0; border-top:1px solid #e9ebf3;
    }
    .footer {
      padding:22px 24px; color:#aaa; text-align:center; font-size:13px;
      background: #f1f5fa; border-bottom-left-radius:14px; border-bottom-right-radius:14px;
      letter-spacing:0.08em;
    }
    @media (max-width:650px){
      .container {margin:0 3vw;}
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- HEADER -->
    <div style="padding:32px 24px 18px 24px; background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%); color:#fff; text-align:center;">
      <img src="${logoUrl}" alt="${escapeHtml(companyName)}" style="max-width:190px; margin:0 auto 10px; display:block;">
      <div style="font-size:16px; font-weight:600; letter-spacing:0.08em; opacity:0.92;">Your Energy Partner</div>
    </div>
    
    <!-- CONTENT -->
    <div style="padding:32px 24px; color:#1f2937; font-size:15px; line-height:1.6;">
      ${sonarGeneratedHtml}
    </div>
    
    <!-- SIGNATURE BLOCK -->
    <div class="signature">
      ${signatureHTML}
    </div>
    
    <!-- FOOTER -->
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${escapeHtml(companyName)}. All rights reserved.</p>
      <p>Questions? Just reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
  }

  // Utility function to escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Improve subject line with personalization
  function improveSubject(subject, recipient) {
    try {
      const sub = String(subject || '').trim();
      const r = recipient || {};
      const name = (r.fullName || r.name || '').split(' ')[0] || '';
      const company = r.company || r.account?.name || '';
      const energy = r.energy || r.account?.energy || {};
      const supplier = energy.supplier || '';
      const rate = energy.currentRate ? String(energy.currentRate).replace(/^\./, '0.') : '';
      const end = energy.contractEnd || '';
      const toMonthYear = (val) => {
        const s = String(val || '').trim();
        if (!s) return '';
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const d = new Date(s);
        if (!isNaN(d.getTime())) return `${months[d.getMonth()]} ${d.getFullYear()}`;
        const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m1) { const m = Math.max(1, Math.min(12, parseInt(m1[1], 10))); return `${months[m - 1]} ${m1[3]}`; }
        const m2 = s.match(/^(\d{4})[\-](\d{1,2})[\-](\d{1,2})$/);
        if (m2) { const m = Math.max(1, Math.min(12, parseInt(m2[2], 10))); return `${months[m - 1]} ${m2[1]}`; }
        const m3 = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
        if (m3) { const m = Math.max(1, Math.min(12, parseInt(m3[1], 10))); return `${months[m - 1]} ${m3[2]}`; }
        const m4 = s.match(/([A-Za-z]+)\s+(\d{4})/);
        if (m4) return `${m4[1]} ${m4[2]}`;
        const y = s.match(/(19\d{2}|20\d{2})/);
        if (y) return y[1];
        return '';
      };
      const endLabel = toMonthYear(end);
      const looksGeneric = /^(subject\s*:\s*)?(re:|fwd:)?\s*(hi|hello|catching up|follow\s*up|quick note|unknown)\b/i.test(sub) || sub.length < 8;
      if (!looksGeneric) return sub;
      const variants = [];
      if (name && company && supplier && endLabel) variants.push(`${name} — ${company}: ${supplier} until ${endLabel}`);
      if (company && endLabel) variants.push(`${company} — plan before ${endLabel}`);
      if (name && rate) variants.push(`${name} — options vs ${rate} $/kWh`);
      if (company) variants.push(`${company} — energy options`);
      if (name) variants.push(`${name} — quick energy check`);
      variants.push('Energy options and next steps');
      return variants[Math.floor(Math.random() * variants.length)];
    } catch(_) { return subject; }
  }

  // Replace any {{contact./account./sender.}} tokens and .var-chip spans with real values
  function replaceVariablesInHtml(html, recipient) {
    try {
      const r = recipient || {};
      const contact = r;
      const account = r.account || {};
      const sender = (window.currentUser && window.currentUser.profile) || {};

      const get = (obj, key) => {
        const k = String(key || '').trim();
        const map = {
          first_name: (obj.firstName || (obj.name||'').split(' ')[0] || ''),
          last_name: (obj.lastName || (obj.name||'').split(' ').slice(1).join(' ') || ''),
          full_name: (obj.fullName || obj.name || [obj.firstName, obj.lastName].filter(Boolean).join(' ') || ''),
          title: (obj.title || obj.job || obj.role || obj.jobTitle || ''),
          email: (obj.email || ''),
          phone: (obj.phone || obj.mobile || ''),
          website: (obj.website || obj.domain || ''),
          name: (obj.name || obj.accountName || ''),
          industry: (obj.industry || ''),
          city: (obj.city || obj.billingCity || obj.locationCity || ''),
          state: (obj.state || obj.region || obj.billingState || ''),
          country: (obj.country || '')
        };
        return map.hasOwnProperty(k) ? (map[k] || '') : (obj[k] || '');
      };

      // Replace raw tokens first
      let out = String(html || '')
        .replace(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(contact, k)))
        .replace(/\{\{\s*account\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(account, k)))
        .replace(/\{\{\s*sender\.([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) => escapeHtml(get(sender, k)));

      // Replace .var-chip elements if present
      const tmp = document.createElement('div');
      tmp.innerHTML = out;
      tmp.querySelectorAll('.var-chip').forEach(chip => {
        const dataVar = chip.getAttribute('data-var') || '';
        const m = dataVar.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
        if (!m) { chip.replaceWith(document.createTextNode(chip.textContent||'')); return; }
        const scope = m[1];
        const key = m[2];
        let val = '';
        if (scope === 'contact') val = get(contact, key);
        else if (scope === 'account') val = get(account, key);
        else if (scope === 'sender') val = get(sender, key);
        chip.replaceWith(document.createTextNode(val || ''));
      });
      out = tmp.innerHTML;
      return out;
    } catch (e) {
      console.warn('[AI] replaceVariablesInHtml failed', e);
      return html;
    }
  }
})();
