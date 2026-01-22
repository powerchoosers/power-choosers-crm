'use strict';
(function () {
  const state = {
    data: [],
    filtered: [],
    selected: new Set(),
    currentPage: 1,
    pageSize: 25,
    currentFolder: 'inbox',
    hasMore: false, // Track if more emails are available
    totalCount: 0,  // Overall total emails (reference only)
    folderCount: 0,  // Total emails for current folder (for footer/pagination)
    folderCountsByFolder: {}, // Cached counts per folder (inbox/sent/scheduled/starred/trash)
    isLoading: false,    // Prevent multiple simultaneous loads
    isLoadingMore: false, // Prevent multiple loadMore calls
    scheduledNeedsSort: false // Flag to trigger lazy sort for scheduled tab
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
        
        // applyFilters calls render() internally, so no need for double call
        applyFilters().catch(err => console.error('[Emails] applyFilters failed:', err));

        if (typeof d.scroll === 'number') {
          setTimeout(() => {
            try { window.scrollTo(0, d.scroll); } catch (_) { }
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
      let updateTimeout = null;
      const debouncedLoadData = () => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          try {
            // Only reload if we're on the emails page
            if (els.page && els.page.style.display !== 'none') {
              loadData(true);
            }
          } catch (_) { }
        }, 500); // Reduced to 500ms for faster updates when emails are sent
      };

      document.addEventListener('pc:emails-loaded', () => {
        try {
          // Only do a full load on first event to avoid double-renders/flicker
          if (!state.data || state.data.length === 0) {
            loadData(true);
          }
        } catch (_) { }
      });
      document.addEventListener('pc:emails-updated', debouncedLoadData);
      document._emailsRealtimeBound = true;
    } catch (_) { }
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
          els.filterTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.currentFolder = tab.dataset.folder;
          state.currentPage = 1;

          // Show/hide Generate Now button
          updateGenerateButtonVisibility();

          applyFilters().catch(err => console.error('[Emails] applyFilters failed:', err));
        });
        tab._emailTabBound = true;
      }
    });

    // Search
    if (els.searchInput) {
      els.searchInput.addEventListener('input', debounce(() => {
        state.currentPage = 1;
        applyFilters().catch(err => console.error('[Emails] applyFilters failed:', err));
      }, 300));
    }

    // Clear search
    if (els.clearBtn) {
      els.clearBtn.addEventListener('click', () => {
        if (els.searchInput) els.searchInput.value = '';
        state.currentPage = 1;
        applyFilters().catch(err => console.error('[Emails] applyFilters failed:', err));
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
  async function loadData(showImmediately = false) {
    if (state.isLoading) {
      return;
    }

    try {
      state.isLoading = true;

      let emailsData = [];

      // Priority 1: Get data from background loader (already loaded on app init)
      if (window.BackgroundEmailsLoader) {
        emailsData = window.BackgroundEmailsLoader.getEmailsData() || [];
        state.hasMore = window.BackgroundEmailsLoader.hasMore ? window.BackgroundEmailsLoader.hasMore() : false;

        if (emailsData.length > 0) {
          processAndSetData(emailsData);
        }

        // Get total count (non-blocking)
        if (typeof window.BackgroundEmailsLoader.getTotalCount === 'function') {
          window.BackgroundEmailsLoader.getTotalCount().then((cnt) => {
            state.totalCount = cnt;
          }).catch(() => {});
        }
      }

      // Priority 2: Fallback to CacheManager
      if (emailsData.length === 0 && window.CacheManager?.get) {
        const cached = await window.CacheManager.get('emails').catch(() => []);
        if (cached?.length > 0 && state.data.length === 0) {
          processAndSetData(cached);
        }
      }

      // Priority 3: Firebase fallback
      if (state.data.length === 0) {
        let baseQuery = firebase.firestore().collection('emails');
        const userEmail = (window.currentUserEmail || '').toLowerCase();
        const isAdmin = window.currentUserRole === 'admin';

        if (!isAdmin && userEmail) {
          // Non-admin: query by ownerId OR assignedTo (requires two queries or index)
          // For simplicity in fallback, we'll just query by ownerId
          baseQuery = baseQuery.where('ownerId', '==', userEmail);
        }

        const firestoreData = await baseQuery
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get()
          .then(snap => snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().sentAt || doc.data().receivedAt || doc.data().createdAt,
            emailType: doc.data().type || (doc.data().provider === 'sendgrid_inbound' || doc.data().provider === 'gmail_api' ? 'received' : 'sent')
          })))
          .catch(err => {
            console.warn('[EmailsPage] Fallback query failed:', err.message);
            return [];
          });

        if (firestoreData.length > 0) {
          processAndSetData(firestoreData);
          if (window.CacheManager?.set) {
            window.CacheManager.set('emails', firestoreData).catch(() => {});
          }
        }
      }

      // Single point of update for the UI
      await applyFilters();
    } catch (error) {
      console.error('[EmailsPage] Failed to load emails:', error);
      state.data = [];
      await applyFilters();
    } finally {
      state.isLoading = false;
    }
  }

  // Helper function to process and set email data (extracted for reuse)
  function processAndSetData(emailsData) {
    // Ensure all emails have required fields and preserve content fields
    // Deduplicate by email ID
    const emailMap = new Map();
    emailsData.forEach(email => {
      if (!emailMap.has(email.id)) {
        // Normalize 'to' field - handle both string and array formats
        let normalizedTo = '';
        if (Array.isArray(email.to)) {
          normalizedTo = email.to.length > 0 ? email.to[0] : '';
        } else {
          normalizedTo = email.to || '';
        }

        emailMap.set(email.id, {
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
        });
      }
    });

    state.data = Array.from(emailMap.values());

    // OPTIMIZATION: Lazy sort - only sort when needed (not on every data load)
    // Sorting will happen in getPageItems() or applyFilters() when actually displaying
    // This saves ~10-20ms on cold start
  }

  // Apply filters based on current folder and search
  async function applyFilters(skipRender = false) {
    try {
      // OPTIMIZATION: Sort data once if not already sorted (lazy sort for scheduled tab)
      // Only sort if we have data and it's not the scheduled tab (scheduled tab sorts in getPageItems)
      if (state.data.length > 0 && state.currentFolder !== 'scheduled') {
        // Check if data needs sorting (simple heuristic: if first email is newer than last, assume sorted)
        const first = state.data[0];
        const last = state.data[state.data.length - 1];
        if (first && last && new Date(first.date) < new Date(last.date)) {
          // Data is not sorted, sort it now
          state.data.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
      }

      let filtered = [...state.data];

      // ... existing filter logic ...
      // Filter by folder
      if (state.currentFolder === 'inbox') {
        filtered = filtered.filter(email => {
          // Multiple ways to identify received emails (catch everything)
          return (email.type === 'received' ||
            email.emailType === 'received' ||
            email.provider === 'sendgrid_inbound' ||
            email.provider === 'gmail_api' ||
            // If no type field, assume it's received (old emails)
            (!email.type && !email.emailType && !email.isSentEmail)) &&
            !email.deleted;
        });
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
      } else if (state.currentFolder === 'scheduled') {
        // OPTIMIZATION: Pre-compute Date.now() once instead of calling it for each email
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // OPTIMIZATION: Simplified filter logic - fewer variable assignments
        filtered = filtered.filter(email => {
          // CRITICAL: Exclude sent emails immediately (multiple checks for robustness)
          // Check type first (most reliable indicator)
          if (email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail === true) {
            return false;
          }

          // Exclude deleted emails
          if (email.deleted) return false;

          // Only show emails that are actually scheduled
          if (email.type !== 'scheduled') return false;

          const status = email.status || '';

          // Fast path: exclude already sent, rejected, or errored emails (multiple status indicators)
          // CRITICAL: Check status to catch emails that were sent/rejected but type wasn't updated
          if (status === 'sent' || status === 'delivered' || status === 'error' || status === 'rejected') return false;

          // Exclude emails stuck in 'sending' state if send time has passed (likely already sent)
          if (status === 'sending') {
            const sendTime = email.scheduledSendTime;
            // If send time was more than 5 minutes ago, assume it was sent
            if (sendTime && typeof sendTime === 'number' && sendTime < (now - 5 * 60 * 1000)) {
              return false;
            }
          }

          // Show if pending, generating, or error (to allow troubleshooting/retry)
          if (status === 'not_generated' || status === 'pending_approval' || status === 'generating' || status === 'error') {
            return true;
          }

          // Show ALL approved emails (regardless of send time)
          // This ensures users can see the Send Now button for approved emails
          // that haven't been sent yet (e.g., outside business hours)
          if (status === 'approved') {
            return true;
          }

          // Show newly created emails (no status yet) if they have scheduledSendTime
          // This ensures emails created by sequences are visible immediately
          if (!status && email.scheduledSendTime) {
            const sendTime = email.scheduledSendTime;
            // Show if send time is in the future or very recent (within last 5 minutes)
            // This catches emails that were just created and are being processed
            return sendTime && typeof sendTime === 'number' && sendTime >= (now - 5 * 60 * 1000);
          }

          // Exclude emails with missing/null status and no scheduledSendTime (orphaned records)
          if (!status && !email.scheduledSendTime) return false;

          // Exclude emails with past send times and no valid status (likely already sent)
          const sendTime = email.scheduledSendTime;
          if (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo && !status) {
            return false;
          }

          return false;
        });

        // OPTIMIZATION: Lazy sort - only sort when rendering (moved to getPageItems)
        // Don't sort here on every filter - saves ~10-20ms for large datasets
        state.scheduledNeedsSort = true;
      } else if (state.currentFolder === 'starred') {
        filtered = filtered.filter(email => email.starred && !email.deleted);
      } else if (state.currentFolder === 'trash') {
        filtered = filtered.filter(email => email.deleted);
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
      
      // PRE-FETCH LOGOS: Scans the first page of emails to trigger lookups
      // This is non-blocking to ensure the UI feels fast.
      const start = (state.currentPage - 1) * state.pageSize;
      const initialEmails = state.filtered.slice(start, start + state.pageSize);
      if (initialEmails.length > 0) {
        initialEmails.forEach(email => {
          const isSent = email.isSentEmail || email.type === 'sent' || email.type === 'scheduled';
          const emailAddr = isSent ? (Array.isArray(email.to) ? email.to[0] : email.to) : email.from;
          // This synchronously checks in-memory caches and triggers Firestore if needed (non-blockingly)
          getRecipientAccountInfo(emailAddr || '');
        });
      }

      // Check if we need to load more data to fill the current page
      const neededForPage = state.currentPage * state.pageSize;
      const searchTermNow = els.searchInput?.value?.trim() || '';

      // Update folder total count asynchronously (do not block UI)
      updateFolderCount().catch(() => { });

      // OPTIMIZATION: Skip loading more for the scheduled tab
      // All scheduled emails (up to ~200) are ensured to be in memory by BackgroundEmailsLoader,
      // so we never need to paginate for this folder.
      const shouldLoadMore = (
        state.currentFolder !== 'scheduled' &&
        (state.currentPage > 1 || (searchTermNow && state.filtered.length < state.pageSize)) &&
        state.filtered.length < neededForPage &&
        state.hasMore &&
        window.BackgroundEmailsLoader &&
        typeof window.BackgroundEmailsLoader.loadMore === 'function'
      );

      if (shouldLoadMore) {
        // Load more data until we have enough filtered results
        loadMoreUntilEnough();
      } else if (!skipRender) {
        render();
      }
    } catch (err) {
      console.error('[Emails] applyFilters CRASHED:', err);
      // Fallback: render empty state so UI isn't stuck
      state.filtered = [];
      render();
    }
  }

  function getPaginationTotalRecords() {
    const base = state.filtered.length;
    if (!state.hasMore) return base;
    const min = state.currentPage * state.pageSize + 1;
    return Math.max(base, min);
  }

  // Update total count for the current folder without loading all records
  async function updateFolderCount() {
    try {
      const currentFolder = state.currentFolder || 'inbox';
      const searchTerm = els.searchInput?.value?.trim() || '';

      // OPTIMIZATION: Always use the already-filtered count (no double filtering!)
      // state.filtered is already accurate after applyFilters() runs
      state.folderCount = state.filtered.length;

      // Cache this count for instant display on next tab switch
      if (!searchTerm) {
        state.folderCountsByFolder[currentFolder] = state.filtered.length;
      }

      renderPagination();

      // No need to call getTotalCountByFolder() - it would just re-filter the same data
      // The in-memory count from applyFilters() is already accurate and fast
    } catch (e) {
      console.warn('[EmailsPage] Failed to update folder count:', e);
      state.folderCount = state.filtered.length;
      renderPagination();
    }
  }

  // Load more emails until we have enough filtered results for the current page
  async function loadMoreUntilEnough() {
    if (state.isLoadingMore) {
      return;
    }

    state.isLoadingMore = true;
    try {
      const neededForPage = state.currentPage * state.pageSize;
      // OPTIMIZATION: Only load what we need for the current page, no aggressive preloading
      const targetCount = neededForPage;
      const searchTermNow = els.searchInput?.value?.trim() || '';
      let attempts = 0;
      const maxAttempts = searchTermNow ? 25 : 10;

      while (state.filtered.length < targetCount && state.hasMore && attempts < maxAttempts) {
        attempts++;
        const result = await window.BackgroundEmailsLoader.loadMore();
        if (!result || result.loaded === 0) {
          break;
        }

        // Reload data from background loader with deduplication
        const updatedData = window.BackgroundEmailsLoader.getEmailsData() || [];
        processAndSetData(updatedData);
        state.hasMore = result.hasMore || false;

        // Re-apply filters to update filtered array (this is now async and handles pre-fetch)
        await applyFilters(true);

        // If we have enough now, break
        if (state.filtered.length >= targetCount || !state.hasMore) {
          break;
        }
      }
      // Update folder count after loading more (especially important for scheduled)
      updateFolderCount().catch(() => { });
    } finally {
      state.isLoadingMore = false;
    }
  }

  // Get paginated items for current page
  function getPageItems() {
    // OPTIMIZATION: Lazy sort for scheduled tab (only sort when actually displaying)
    if (state.currentFolder === 'scheduled' && state.scheduledNeedsSort) {
      state.filtered.sort((a, b) => {
        const aTime = a.scheduledSendTime || Number.MAX_SAFE_INTEGER;
        const bTime = b.scheduledSendTime || Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
      state.scheduledNeedsSort = false;
    }

    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;

    // Check if we need to load more data for this page
    const neededForPage = state.currentPage * state.pageSize;

    // Only trigger loading if:
    // 1. We don't have enough filtered results
    // 2. More data is available (hasMore)
    // 3. We're not already loading
    // 4. BackgroundEmailsLoader is available
    // 5. We're not on the first page (avoid extra cold-start flicker)
    // 5. Folder is NOT 'scheduled' (scheduled already fully loaded)
    if (state.currentFolder !== 'scheduled' &&
      state.currentPage > 1 &&
      state.filtered.length < neededForPage &&
      state.hasMore &&
      !state.isLoadingMore &&
      window.BackgroundEmailsLoader &&
      typeof window.BackgroundEmailsLoader.loadMore === 'function') {
      // Trigger async loading (non-blocking)
      loadMoreUntilEnough().catch(error => {
        console.error('[EmailsPage] Failed to load more in getPageItems:', error);
      });
    }

    return state.filtered.slice(start, end);
  }

  // Render email table
  let renderTimeout = null;
  let logoRenderTimeout = null;
  let lastRenderedDataHash = '';
  
  function render() {
    if (!els.tbody) return;

    // Debounce render to prevent flickering/multiple rapid calls
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = setTimeout(() => {
      actuallyRender();
    }, 300); // Increased back to 300ms to better batch Firestore logo discoveries
  }

  // Specialized render for when logos are discovered to minimize flickering
  function renderLogos() {
    if (!els.tbody) return;
    if (logoRenderTimeout) clearTimeout(logoRenderTimeout);
    logoRenderTimeout = setTimeout(() => {
      actuallyRender();
    }, 300); // Reduced to 300ms to match regular render and reduce flicker
  }

  // Rename original render to actuallyRender
  function actuallyRender() {
    if (!els.tbody) return;

    const rows = getPageItems();
    
    // Simple hash to see if we actually need to update the DOM
    // Include logoUrl from the discovered cache so we re-render when a logo is found
    // Also include failure cache state to prevent flicker
    const currentDataHash = rows.map(r => {
      const recipientEmail = Array.isArray(r.to) ? r.to[0] : (r.to || r.from || '');
      const domain = extractDomain(recipientEmail);
      const normalizedDomain = normalizeDomainString(domain);
      const discoveredInfo = domainAccountInfoCache.get(normalizedDomain);
      const logoPart = discoveredInfo ? (discoveredInfo.logoUrl || 'no-logo') : 'pending';
      
      const isFailed = window.__pcFaviconHelper && (
        (domain && window.__pcFaviconHelper.failedDomains.has(domain)) ||
        (discoveredInfo?.logoUrl && window.__pcFaviconHelper.failedLogos.has(discoveredInfo.logoUrl))
      );
      
      // Include displayName in the hash so we re-render when a name lookup completes
      const displayName = extractName(recipientEmail);
      
      return `${r.id}-${r.updatedAt || r.timestamp}-${r.status}-${r.unread}-${r.starred}-${logoPart}-${displayName}-${isFailed ? 'failed' : 'ok'}`;
    }).join('|');
    const isSearchActive = !!(els.searchInput?.value?.trim());
    
    // Only skip if data is identical AND we aren't in a state that requires fresh render (like search)
    // and if we already have content in the tbody
    if (currentDataHash === lastRenderedDataHash && els.tbody.children.length > 0) {
      return;
    }
    lastRenderedDataHash = currentDataHash;

    // Update table header to show "To" for sent emails, "From" for others
    const table = document.getElementById('emails-table');
    if (table) {
      const headerCell = table.querySelector('thead th:nth-child(2)'); // Second column (after checkbox)
      if (headerCell) {
        headerCell.textContent = state.currentFolder === 'sent' ? 'To' : 'From';
      }
    }

    els.tbody.innerHTML = rows.map(email => rowHtml(email)).join('');

    // Update summary and count
    // Use folder total count (queried from Firestore), fallback to filtered length in search mode
    const searchTermNow = els.searchInput?.value?.trim() || '';
    const loadedTotal = state.filtered.length;
    const totalLabel = `${loadedTotal}${state.hasMore ? '+' : ''}`;
    if (els.summary) {
      const start = rows.length === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
      const end = rows.length === 0 ? 0 : (start + rows.length - 1);
      els.summary.textContent = `${start}-${end} of ${totalLabel} emails`;
    }

    if (els.count) {
      els.count.textContent = `${totalLabel} emails`;
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

  // Favicon cache to prevent regeneration on each render
  const faviconCache = window.__pcFaviconHelper?.faviconMetadata || new Map();
  // Using shared cache from main.js if available
  const domainAccountInfoCache = window.__pcFaviconHelper?.discoveredAccounts || new Map();
  const accountLookupPromises = new Map();
  const accountLookupFailures = new Set();

  function normalizeDomainString(value) {
    if (!value) return '';
    try {
      let candidate = String(value || '').trim().toLowerCase();
      if (/^https?:\/\//.test(candidate)) {
        candidate = new URL(candidate).hostname;
      }
      candidate = candidate.replace(/^www\./, '').split('/')[0];
      return candidate.replace(/:\d+$/, '');
    } catch (_) {
      return String(value || '').trim().toLowerCase().replace(/^www\./, '').split('/')[0];
    }
  }

  function buildAccountInfo(account, normalizedDomain, fallbackDomain, source) {
    const logoUrl = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon || null;
    const domain = account.domain || account.website || fallbackDomain || normalizedDomain;
    const accountId = account.id || account.accountId || account._id || null;
    return {
      logoUrl,
      domain,
      normalizedDomain,
      matchedSource: source || 'domain',
      accountId
    };
  }

  async function scheduleAccountLookup(normalizedDomain, fallbackDomain) {
    if (!normalizedDomain) return;
    if (accountLookupPromises.has(normalizedDomain) || accountLookupFailures.has(normalizedDomain)) {
      return accountLookupPromises.get(normalizedDomain);
    }
    
    const dbAvailable = !!window.firebaseDB && typeof window.firebaseDB.collection === 'function';

    const promise = (async () => {
      try {
        if (!dbAvailable) {
          accountLookupFailures.add(normalizedDomain);
          return;
        }

        const searchValues = [
          normalizedDomain,
          `www.${normalizedDomain}`,
          `https://${normalizedDomain}`,
          `http://${normalizedDomain}`,
          normalizedDomain.replace(/^www\./, ''),
          normalizedDomain.split('.')[0] // e.g. "ttiinc" from "ttiinc.com"
        ];
        const nameSlug = normalizedDomain.split('.')[0];
        const fields = ['domain', 'website'];

        // Step 1: Search by domain/website in parallel
        const queryPromises = [];
        for (const field of fields) {
          for (const value of searchValues) {
            queryPromises.push(
              window.firebaseDB
                .collection('accounts')
                .where(field, '==', value)
                .limit(1)
                .get()
                .then(snapshot => {
                  if (snapshot && !snapshot.empty) {
                    return { snapshot, field, value };
                  }
                  return null;
                })
            );
          }
        }

        const results = await Promise.all(queryPromises);
        const hit = results.find(r => r !== null);

        if (hit) {
          const doc = hit.snapshot.docs[0];
          const account = doc.data();
          const info = buildAccountInfo(account, normalizedDomain, fallbackDomain, 'firestore-domain');
          domainAccountInfoCache.set(normalizedDomain, info);

          if (els.page && els.page.style.display !== 'none') {
            requestAnimationFrame(() => renderLogos());
          }
          return;
        }

        // Step 2: Fallback search by name if domain fails
        if (nameSlug && nameSlug.length > 2) {
          try {
            const searchNames = [nameSlug];
            
            // Special cases for known companies
            if (nameSlug === 'ttiinc') searchNames.push('TTI');
            if (nameSlug === 'google') searchNames.push('Google');
            
            for (const baseName of searchNames) {
              const slugUpper = baseName.toUpperCase();
              const slugTitle = baseName.charAt(0).toUpperCase() + baseName.slice(1);
              
              for (const namePrefix of [baseName, slugUpper, slugTitle]) {
                const snapshot = await window.firebaseDB
                  .collection('accounts')
                  .where('name', '>=', namePrefix)
                  .where('name', '<=', namePrefix + '\uf8ff')
                  .limit(5)
                  .get();

                if (snapshot && !snapshot.empty) {
                  // Find the best match
                  const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                  const bestMatch = docs.find(d => d.logoUrl || d.logo || d.companyLogo) || docs[0];
                  
                  const info = buildAccountInfo(bestMatch, normalizedDomain, fallbackDomain, 'firestore-name');
                  domainAccountInfoCache.set(normalizedDomain, info);

                  if (els.page && els.page.style.display !== 'none') {
                    requestAnimationFrame(() => renderLogos());
                  }
                  return;
                }
              }
            }
          } catch (error) {
            console.warn('[EmailsPage] Firestore name-based lookup failed for', nameSlug, error);
          }
        }

        accountLookupFailures.add(normalizedDomain);
      } finally {
        accountLookupPromises.delete(normalizedDomain);
      }
    })();

    accountLookupPromises.set(normalizedDomain, promise);
    return promise;
  }
  function findAccountAndSource(normalizedDomain, backgroundAccounts, essentialAccounts) {
    if (!normalizedDomain) return { account: null, source: 'none' };

    const matchesDomain = (account) => {
      if (!account) return false;
      const accountDomain = normalizeDomainString(account.domain);
      const accountWebsite = normalizeDomainString(account.website);
      return accountDomain === normalizedDomain || accountWebsite === normalizedDomain;
    };

    const backgroundMatch = backgroundAccounts.find(matchesDomain);
    if (backgroundMatch) return { account: backgroundMatch, source: 'background' };

    const essentialMatch = essentialAccounts.find(matchesDomain);
    if (essentialMatch) return { account: essentialMatch, source: 'essential' };

    return { account: null, source: 'none' };
  }

  function getRecipientAccountInfo(recipientEmail) {
    if (!recipientEmail) return { logoUrl: null, domain: null, matchedSource: 'none' };

    try {
      const recipientDomain = extractDomain(recipientEmail);
      if (!recipientDomain) return { logoUrl: null, domain: null, matchedSource: 'none' };

      const normalizedRecipientDomain = normalizeDomainString(recipientDomain);
      
      const backgroundAccounts = (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function')
        ? window.BackgroundAccountsLoader.getAccountsData() || []
        : [];
      const essentialAccounts = window.getAccountsData ? window.getAccountsData() : [];

      const cachedInfo = domainAccountInfoCache.get(normalizedRecipientDomain);
      if (cachedInfo) {
        return cachedInfo;
      }

      const { account, source } = findAccountAndSource(normalizedRecipientDomain, backgroundAccounts, essentialAccounts);
      let accountInfo;
      if (account) {
        accountInfo = buildAccountInfo(account, normalizedRecipientDomain, recipientDomain, source);
        domainAccountInfoCache.set(normalizedRecipientDomain, accountInfo);
      } else {
        scheduleAccountLookup(normalizedRecipientDomain, recipientDomain);
        accountInfo = {
          logoUrl: null,
          domain: recipientDomain,
          normalizedDomain: normalizedRecipientDomain,
          matchedSource: 'none'
        };
      }

      return accountInfo;
    } catch (_) {
      return { logoUrl: null, domain: extractDomain(recipientEmail), matchedSource: 'none' };
    }
  }

  // Generate email row HTML with favicon integration and snippet
  function rowHtml(email) {
    const isSentEmail = email.isSentEmail || email.type === 'sent' || email.type === 'scheduled';

    // For sent/scheduled emails, show recipient info with logo; otherwise show sender info
    let avatarHtml = '';
    let displayName = '';

    if (isSentEmail) {
      // For sent/scheduled emails, show recipient with account logo
      // Handle both string and array formats for email.to
      let recipientEmail = '';
      if (Array.isArray(email.to)) {
        recipientEmail = email.to[0] || '';
      } else {
        recipientEmail = email.to || '';
      }

      const recipientName = extractName(recipientEmail);
      displayName = recipientName || 'Unknown Recipient';

      // Get account info for recipient
      const accountInfo = getRecipientAccountInfo(recipientEmail);
      
      const cacheKey = `favicon-${recipientEmail.toLowerCase()}-28`;
      const cachedEntry = faviconCache.get(cacheKey);

      // SMART CACHE CHECK: If we have a cached entry, but it lacks a logo and we just found one, 
      // we MUST regenerate to show the new logo.
      const shouldForceRegenerate = cachedEntry && !cachedEntry.logoUrl && accountInfo.logoUrl;
      
      if (cachedEntry && !shouldForceRegenerate) {
        avatarHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
          logoUrl: cachedEntry.logoUrl,
          domain: cachedEntry.domain,
          size: 28,
          idSuffix: email.id
        });
      } else {
        avatarHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
          logoUrl: accountInfo.logoUrl,
          domain: accountInfo.domain,
          size: 28,
          idSuffix: email.id
        });
        faviconCache.set(cacheKey, {
          logoUrl: accountInfo.logoUrl || null,
          domain: accountInfo.domain || null
        });
      }
    } else {
      // For received emails, show sender with domain favicon
      const senderEmail = email.from;
      const senderDomain = extractDomain(senderEmail);
      displayName = extractName(senderEmail) || 'Unknown';

      // Get account info for sender (to get logoUrl if available)
      const accountInfo = getRecipientAccountInfo(senderEmail);
      
      // STABLE CACHE KEY for received emails
      const cacheKey = `favicon-${(senderEmail || senderDomain || 'unknown').toLowerCase()}-28`;

      const cachedEntry = faviconCache.get(cacheKey);
      
      // SMART CACHE CHECK: If we have a cached entry, but it lacks a logo and we just found one, 
      // we MUST regenerate to show the new logo.
      const shouldForceRegenerate = cachedEntry && !cachedEntry.logoUrl && accountInfo.logoUrl;

      if (cachedEntry && !shouldForceRegenerate) {
        avatarHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
          logoUrl: cachedEntry.logoUrl,
          domain: cachedEntry.domain,
          size: 28,
          idSuffix: email.id
        });
      } else {
        avatarHtml = window.__pcFaviconHelper.generateCompanyIconHTML({
          logoUrl: accountInfo.logoUrl,
          domain: accountInfo.domain || senderDomain,
          size: 28,
          idSuffix: email.id
        });
        faviconCache.set(cacheKey, {
          logoUrl: accountInfo.logoUrl || null,
          domain: accountInfo.domain || senderDomain || null
        });
      }
    }

    const isSelected = state.selected.has(email.id);
    const emailPreview = getEmailPreview(email);

    // Get tracking counts for sent emails
    // CRITICAL FIX: Include 'scheduled' type because sequence emails might still be 
    // classified as scheduled in the UI state but have tracking data
    const openCount = (isSentEmail) ? (email.openCount || 0) : 0;
    const clickCount = (isSentEmail) ? (email.clickCount || 0) : 0;
    const hasOpens = openCount > 0;
    const hasClicks = clickCount > 0;
    const trackingBadgeStyle = 'position: absolute; top: -6px; right: -6px; background-color: var(--orange-primary, var(--orange-subtle, #f18335)); color: #fff; font-size: 10px; font-weight: 600; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; border: 2px solid var(--bg-card, var(--bg-primary, #1f1f1f));';
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
            <span class="email-subject ${email.unread ? 'unread' : ''}">${escapeHtml(email.subject || (email.status === 'not_generated' ? '(Pending generation)' : email.status === 'generating' ? '(Generating...)' : email.type === 'sent' && !email.subject ? '(Sent - No Subject)' : '(No Subject)'))}</span>
            <div class="email-snippet">${escapeHtml(emailPreview)}</div>
          </div>
        </td>
        <td class="email-date-cell">
          <span class="email-date">${formatDate(email.date || email.scheduledSendTime || email.createdAt || email.sentAt || email.receivedAt)}</span>
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
            ` : email.type === 'scheduled' && email.status === 'approved' ? `
              <button class="qa-btn qa-btn-send-now" data-action="send-now" data-email-id="${email.id}" title="Send Now" style="background: linear-gradient(135deg, var(--orange-subtle), #e67e22); border: none; color: #ffffff;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                </svg>
              </button>
            ` : isSentEmail ? `
              <button class="qa-btn ${hasOpens ? 'opened' : ''}" data-action="view" data-email-id="${email.id}" title="${hasOpens ? `Opened ${openCount} time${openCount !== 1 ? 's' : ''}` : 'Not opened'}" style="position: relative;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                ${hasOpens ? `<span class="tracking-badge" style="${trackingBadgeStyle}">${openCount}</span>` : ''}
              </button>
              <button class="qa-btn ${hasClicks ? 'opened' : ''}" data-action="clicks" data-email-id="${email.id}" title="${hasClicks ? `Clicked ${clickCount} time${clickCount !== 1 ? 's' : ''}` : 'Not clicked'}" style="position: relative;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3.5"/>
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
                </svg>
                ${hasClicks ? `<span class="tracking-badge" style="${trackingBadgeStyle}">${clickCount}</span>` : ''}
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
        } else         if (action === 'approve') {
          approveScheduledEmail(emailId);
        } else if (action === 'reject') {
          rejectScheduledEmail(emailId);
        } else if (action === 'send-now') {
          sendNowScheduledEmail(emailId);
        }
      });
    });
  }

  // View email in detail page
  function viewEmail(emailId) {
    // OPTIMIZATION: Prime the cache with the data we already have!
    // This avoids the 2-5s Firestore fetch on the detail page.
    const email = state.data.find(e => e.id === emailId);
    if (email) {
       window.emailCache = window.emailCache || new Map();
       // Clone it to be safe, though not strictly necessary
       window.emailCache.set(emailId, { ...email });
    }

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

  // Delete scheduled email without advancing to next step
  async function deleteScheduledEmailOnly(emailId) {
    try {
      const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
      if (!db) {
        throw new Error('Firebase not available');
      }

      // Just delete the email document - don't create next step
      await db.collection('emails').doc(emailId).delete();
      
      // Remove from background loader's in-memory data for instant UI feedback
      if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.removeEmailById === 'function') {
        window.BackgroundEmailsLoader.removeEmailById(emailId);
      }
    } catch (error) {
      console.error('[EmailsPage] Failed to delete scheduled email:', error);
      throw error;
    }
  }

  // Reject scheduled email and advance contact to next stage
  async function rejectAndAdvanceScheduledEmail(emailId) {
    try {
      const db = window.firebaseDB || (window.firebase && window.firebase.firestore());
      if (!db) {
        throw new Error('Firebase not available');
      }

      // Get email data
      const emailDoc = await db.collection('emails').doc(emailId).get();
      if (!emailDoc.exists) {
        throw new Error('Email not found');
      }

      const emailData = emailDoc.data();
      const sequenceId = emailData.sequenceId;
      const contactId = emailData.contactId;
      const stepIndex = emailData.stepIndex || 0;

      // Mark email as rejected
      await db.collection('emails').doc(emailId).update({
        status: 'rejected',
        rejectedAt: Date.now(),
        updatedAt: new Date().toISOString()
      });
      
      // Immediately update background loader's in-memory data for instant UI feedback
      if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.updateEmailStatus === 'function') {
        window.BackgroundEmailsLoader.updateEmailStatus(emailId, 'rejected');
      }

      // Get sequence to find next step
      if (sequenceId && contactId) {
        const sequenceDoc = await db.collection('sequences').doc(sequenceId).get();
        if (sequenceDoc.exists) {
          const sequence = sequenceDoc.data();
          const steps = sequence.steps || [];

          // Find next auto-email step
          let nextAutoEmailStep = null;
          let nextStepIndex = null;

          for (let i = stepIndex + 1; i < steps.length; i++) {
            const step = steps[i];
            if (step.type === 'auto-email' || step.type === 'email') {
              nextAutoEmailStep = step;
              nextStepIndex = i;
              break;
            }
          }

          // If there's a next step, create the email for it
          if (nextAutoEmailStep) {
            const delayMs = (nextAutoEmailStep.delayMinutes || 0) * 60 * 1000;
            const nextScheduledSendTime = Date.now() + delayMs;

            const nextEmailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Get contact data for next email
            let contactName = emailData.contactName || '';
            let contactCompany = emailData.contactCompany || '';
            let toEmail = emailData.to || '';

            try {
              const contactDoc = await db.collection('people').doc(contactId).get();
              if (contactDoc.exists) {
                const contact = contactDoc.data();
                contactName = contact.name || contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contactName;
                contactCompany = contact.company || contactCompany;
                toEmail = contact.email || toEmail;
              }
            } catch (error) {
              console.warn('[EmailsPage] Failed to load contact data for next step:', error);
            }

            await db.collection('emails').doc(nextEmailId).set({
              type: 'scheduled',
              status: 'not_generated',
              scheduledSendTime: nextScheduledSendTime,
              contactId: contactId,
              contactName: contactName,
              contactCompany: contactCompany,
              to: toEmail,
              sequenceId: sequenceId,
              sequenceName: emailData.sequenceName || sequence.name || '',
              stepIndex: nextStepIndex,
              totalSteps: steps.length,
              activationId: emailData.activationId,
              aiPrompt: nextAutoEmailStep.emailSettings?.aiPrompt || nextAutoEmailStep.data?.aiPrompt || nextAutoEmailStep.aiPrompt || nextAutoEmailStep.content || 'Write a professional email',
              ownerId: emailData.ownerId,
              assignedTo: emailData.assignedTo,
              createdBy: emailData.createdBy,
              createdAt: firebase.firestore.FieldValue.serverTimestamp ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
            });
          }
        }
      }
    } catch (error) {
      console.error('[EmailsPage] Failed to reject and advance email:', error);
      throw error;
    }
  }

  // Reject scheduled email (legacy function - now uses rejectAndAdvanceScheduledEmail)
  async function rejectScheduledEmail(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (!email || email.type !== 'scheduled') return;

    if (!confirm('Are you sure you want to reject this scheduled email? The contact will be moved to the next stage in the sequence.')) {
      return;
    }

    try {
      await rejectAndAdvanceScheduledEmail(emailId);

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email rejected. Contact moved to next stage.');
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

  // Send scheduled email now (immediately)
  async function sendNowScheduledEmail(emailId) {
    const email = state.data.find(e => e.id === emailId);
    if (!email || email.type !== 'scheduled' || email.status !== 'approved') return;

    if (!confirm('Are you sure you want to send this email now instead of waiting for the scheduled time?')) {
      return;
    }

    try {
      const baseUrl = window.API_BASE_URL || window.location.origin || '';
      const response = await fetch(`${baseUrl}/api/send-scheduled-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          immediate: true,
          emailId: emailId  // Send this specific email immediately
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Show success message
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Email sent successfully!');
      }

      // Reload emails to update status
      await loadData(true);
    } catch (error) {
      console.error('[EmailsPage] Failed to send email:', error);
      if (window.crm && window.crm.showToast) {
        window.crm.showToast('Failed to send email: ' + error.message);
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

    const totalRecords = getPaginationTotalRecords();
    const totalPages = Math.max(1, Math.ceil(totalRecords / state.pageSize));
    const currentPage = Math.min(state.currentPage, totalPages);

    if (window.crm && window.crm.createPagination) {
      window.crm.createPagination(currentPage, totalPages, async (page) => {
        state.currentPage = page;

        // Check if we need to load more data for this page
        const neededIndex = (page - 1) * state.pageSize + state.pageSize - 1;
        if (neededIndex >= state.data.length && state.hasMore && window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.loadMore === 'function') {
          // Show loading indicator
          if (els.tbody) {
            els.tbody.innerHTML = '<tr><td colspan="20" style="text-align: center; padding: 40px; color: var(--grey-400);">Loading more emails...</td></tr>';
          }

          // Load more data
          const result = await window.BackgroundEmailsLoader.loadMore();
          if (result && result.loaded > 0) {
            // Reload data from background loader
            const updatedData = window.BackgroundEmailsLoader.getEmailsData() || [];
            state.data = updatedData.map(email => {
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
                html: email.html || '',
                text: email.text || '',
                content: email.content || '',
                originalContent: email.originalContent || '',
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
            state.data.sort((a, b) => new Date(b.date) - new Date(a.date));
            state.hasMore = result.hasMore || false;
            await applyFilters(); // Re-apply filters with new data (handles pre-fetch)
          }
        } else {
          render();
        }
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
    if (!date) return 'No date';
    try {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) {
        return 'Invalid date';
      }
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
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

  // SVG icon helper
  function svgIcon(name) {
    switch (name) {
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
              <input type="number" id="bulk-custom-count" min="1" max="${total}" value="${Math.min(50, total)}" style="width: 120px; height: 40px; padding: 0 14px; background: var(--bg-item); color: var(--text-primary); border: 2px solid var(--border-light); border-radius: 8px; transition: all 0.3s ease;">
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
      let selectedIds = [];
      if (mode === 'custom') {
        const n = Math.max(1, parseInt(modal.querySelector('#bulk-custom-count').value || '0', 10));
        selectedIds = state.filtered.slice(0, Math.min(n, total)).map(e => e.id);
      } else if (mode === 'page') {
        selectedIds = getPageItems().map(e => e.id);
      } else {
        selectedIds = state.filtered.map(e => e.id);
      }
      // Add all selected IDs to the set
      selectedIds.forEach(id => state.selected.add(id));
      close();
      render();
      updateBulkBar();
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

  async function deleteSelectedEmails() {
    const ids = Array.from(state.selected || []);
    if (!ids.length) return;

    // Simple confirmation for all emails (scheduled or not)
    if (!confirm(`Are you sure you want to delete ${ids.length} email(s)?`)) return;

    // Store current page before deletion to preserve pagination
    const currentPageBeforeDeletion = state.currentPage;

    // Show progress toast
    const progressToast = window.crm?.showProgressToast ?
      window.crm.showProgressToast(`Deleting ${ids.length} ${ids.length === 1 ? 'email' : 'emails'}...`, ids.length, 0) : null;

    let failed = 0;
    let completed = 0;

    try {
      if (window.firebaseDB && typeof window.firebaseDB.collection === 'function') {
        // Process deletions sequentially to show progress
        for (const id of ids) {
          try {
            const email = state.data.find(e => e.id === id);

            // Delete the email from Firestore
              await window.firebaseDB.collection('emails').doc(id).delete();
            
            // Remove from background loader's in-memory data for instant UI feedback
            if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.removeEmailById === 'function') {
              window.BackgroundEmailsLoader.removeEmailById(id);
            }
            
            // Remove from local state
            const emailIndex = state.data.findIndex(e => e.id === id);
            if (emailIndex !== -1) {
              state.data.splice(emailIndex, 1);
            }

            completed++;
            if (progressToast && typeof progressToast.update === 'function') {
              progressToast.update(completed, ids.length);
            }
          } catch (e) {
            failed++;
            completed++;
            console.warn('Delete failed for email id', id, e);
            if (progressToast && typeof progressToast.update === 'function') {
              progressToast.update(completed, ids.length);
            }
          }

          // Small delay to prevent UI blocking
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } else {
        // If no database, just remove from local state
        const idSet = new Set(ids);
        state.data = Array.isArray(state.data) ? state.data.filter(e => !idSet.has(e.id)) : [];
        
        // Also remove from background loader
        if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.removeEmailById === 'function') {
          ids.forEach(id => window.BackgroundEmailsLoader.removeEmailById(id));
        }
        completed = ids.length;
        if (progressToast && typeof progressToast.update === 'function') {
          progressToast.update(completed, ids.length);
        }
      }
    } catch (err) {
      console.warn('Bulk delete error', err);
      if (progressToast && typeof progressToast.error === 'function') {
        progressToast.error('Delete operation failed');
      }
    } finally {
      // Update filtered data
      const idSet = new Set(ids);
      state.filtered = Array.isArray(state.filtered) ? state.filtered.filter(e => !idSet.has(e.id)) : [];

      // Calculate new total pages after deletion
      const newTotalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));

      // Only adjust page if current page is beyond the new total
      if (currentPageBeforeDeletion > newTotalPages) {
        state.currentPage = newTotalPages;
      }

      // Invalidate folder count cache to ensure accurate counts
      if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.invalidateFolderCountCache === 'function') {
        window.BackgroundEmailsLoader.invalidateFolderCountCache();
      }
      
      // Also invalidate the IndexedDB cache for emails
      if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        window.CacheManager.invalidate('emails').catch(() => {});
      }

      state.selected.clear();
      applyFilters().catch(err => console.error('[Emails] applyFilters failed:', err));
      hideBulkBar();
      if (els.selectAll) {
        els.selectAll.checked = false;
        els.selectAll.indeterminate = false;
      }

      const successCount = Math.max(0, ids.length - failed);

      if (progressToast) {
        if (failed === 0) {
          progressToast.complete(`Successfully deleted ${successCount} ${successCount === 1 ? 'email' : 'emails'}`);
        } else if (successCount > 0) {
          progressToast.complete(`Deleted ${successCount} of ${ids.length} ${ids.length === 1 ? 'email' : 'emails'}`);
        } else {
          progressToast.error(`Failed to delete all ${ids.length} ${ids.length === 1 ? 'email' : 'emails'}`);
        }
      } else {
        // Fallback to regular toasts if progress toast not available
        if (successCount > 0) {
          window.crm?.showToast && window.crm.showToast(`Deleted ${successCount} ${successCount === 1 ? 'email' : 'emails'}`);
        }
        if (failed > 0) {
          window.crm?.showToast && window.crm.showToast(`Failed to delete ${failed} ${failed === 1 ? 'email' : 'emails'}`, 'error');
        }
      }
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
      await applyFilters();
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
      await applyFilters();
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
      await deleteSelectedEmails();
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

  // Strip HTML tags to get plain text (improved to remove style/script tags and preserve line breaks)
  function stripHtml(html) {
    if (!html) return '';

    // First, remove style and script tags completely (they contain CSS/JS, not email content)
    let cleaned = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments

    // Remove tracking pixels BEFORE setting innerHTML to prevent network requests
    // This prevents false "opened" notifications when generating previews
    cleaned = cleaned
      .replace(/<img[^>]*src=["'][^"']*\/api\/email\/track\/[^"']*["'][^>]*>/gi, '')
      .replace(/<img[^>]*src=["'][^"']*vercel\.app\/api\/email\/track\/[^"']*["'][^>]*>/gi, '');

    // Replace block tags and breaks with newlines
    cleaned = cleaned
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n');

    // Then extract text content from remaining HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = cleaned;
    let text = tmp.textContent || tmp.innerText || '';

    // Clean up the extracted text
    // Collapse multiple newlines to max 2
    text = text
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    return text;
  }

  // Get email preview/snippet (from old emails.js)
  function getEmailPreview(email) {
    // Try to get preview from various content fields
    let preview = '';
    let source = 'none';

    // Priority order: snippet, text, html (stripped), content
    if (email.snippet && email.snippet.trim()) {
      preview = email.snippet;
      source = 'snippet';
    } else if (email.text && email.text.trim()) {
      preview = email.text;
      source = 'text';
    } else if (email.html && email.html.trim()) {
      preview = stripHtml(email.html);
      source = 'html';
    } else if (email.content && email.content.trim()) {
      preview = stripHtml(email.content);
      source = 'content';
    } else if (email.originalContent && email.originalContent.trim()) {
      preview = stripHtml(email.originalContent);
      source = 'originalContent';
    }

    // Clean up the preview
    if (preview) {
      // Remove legacy tracking pixels to avoid 404s and errors (like email-detail.js does)
      preview = preview
        .replace(/<img[^>]*src=["'][^"']*\/api\/email\/track\/[^"']+["'][^>]*>/gi, '')
        .replace(/<img[^>]*src=["'][^"']*vercel\.app\/api\/email\/track\/[^"']+["'][^>]*>/gi, '');

      const hadNewlines = /\r|\n/.test(preview);

      if (email.type === 'scheduled') {
        const normalized = String(preview).replace(/\r\n/g, '\n');
        const signoffMatch = normalized.match(/(^|\n)\s*(Best regards|Regards|Thanks|Thank you|Cheers),[ \t\u00A0]*(?:\n|$)/i);
        if (signoffMatch && typeof signoffMatch.index === 'number' && signoffMatch.index >= 0) {
          preview = normalized.slice(0, signoffMatch.index).trim();
        } else {
          preview = normalized;
        }
      }

      // Keep list previews compact: collapse newlines/tabs to single spaces
      preview = preview.replace(/\s+/g, ' ').trim();
      
      // Limit length to reasonable preview size
      if (preview.length > 300) {
        preview = preview.substring(0, 300) + '...';
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

      // Show email generation notification
      if (window.ToastManager && result.success && result.count > 0) {
        window.ToastManager.showEmailGeneratedNotification({
          count: result.count,
          message: result.count === 1 ? 'Email ready for review' : `${result.count} emails ready for review`
        });
      } else if (window.crm && window.crm.showToast) {
        // Fallback to simple toast if ToastManager not available
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
    if (!initDomRefs()) {
      console.error('[EmailsPage] Failed to initialize DOM references');
      return;
    }
    attachEvents();

    // If BackgroundEmailsLoader already has data (from cache), use it immediately
    if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.getEmailsData === 'function') {
      const preload = window.BackgroundEmailsLoader.getEmailsData() || [];
      if (preload.length > 0) {
        processAndSetData(preload);
      }
    }
    if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.activate === 'function') {
      window.BackgroundEmailsLoader.activate();
    }
    if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.ensureScheduledLoaded === 'function') {
      window.BackgroundEmailsLoader.ensureScheduledLoaded();
    }

    // Render whatever we have (may be empty on very first cold start)
    applyFilters().catch(err => console.error('[Emails] Initial applyFilters failed:', err));
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
