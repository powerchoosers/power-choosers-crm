/**
 * Activity Manager - Unified system for tracking and displaying recent activities
 * Handles calls, notes, sequences, emails, and other CRM activities
 */

class ActivityManager {
  constructor() {
    this.activities = [];
    this.maxActivitiesPerPage = 4;
    this.homeFetchLimitPerType = 10;
    this.homeMaxActivities = this.maxActivitiesPerPage * 5;
    this.homeSourceTimeoutMs = 3500;
    this.currentPage = 0;
    // PERSIST CACHE ACROSS PAGE LOADS using sessionStorage
    this.processedActivitiesCache = this.loadPersistedCache('activityManager_processedActivities') || new Map();
    this.processedEmailsCache = this.loadPersistedCache('activityManager_processedEmails') || new Map();
    this.prerenderedPages = new Map(); // Cache for pre-rendered pages
    this.pageCache = this.loadPersistedCache('activityManager_pageCache') || new Map();
    this.currentActivities = null; // Store current activities to avoid cache invalidation issues
    this.fetchLimitPerType = 25; // Smaller initial fetch to speed cold start
    this.maxFetchLimit = 200; // Safety cap for incremental fetches
    this.lastFetchLimitUsed = this.fetchLimitPerType;
    this.loadingPromises = new Map(); // Track in-flight requests to prevent duplicates
    this.renderPromises = new Map(); // Track in-flight renders to prevent DOM flicker
    this.getActivitiesPromises = new Map(); // Track in-flight getActivities calls to prevent duplicate processing
    this.lastRenderedSignatures = new Map(); // Track last rendered activity IDs to avoid unnecessary DOM replacement
    this.pageLoadTime = Date.now(); // Track when ActivityManager was initialized
    this.refreshCooldown = 5000; // 5 second cooldown after page load to prevent flickering

    this._globalHomeRefreshLastAt = 0;
    this._globalHomeRefreshTimer = null;
    this._globalHomeRefreshMinGapMs = 15000;

    this._persistDisabledKeys = new Set();

    // Setup cache invalidation listeners for immediate updates when new activities are created
    this.setupCacheInvalidationListeners();

    // Add method to invalidate activity cache
    this.invalidateActivityCache = (entityType = 'global', entityId = null) => {
      const cacheKey = `${entityType}-${entityId || 'global'}`;
      this.processedActivitiesCache.delete(cacheKey);

      // Also clear page caches for this entity
      const pageCacheKeys = Array.from(this.pageCache.keys()).filter(key => key.startsWith(cacheKey));
      pageCacheKeys.forEach(key => this.pageCache.delete(key));
    };

    // Setup memory monitoring
    this.setupMemoryMonitoring();

    // Save cache on page unload
    this.setupCachePersistence();
  }

  _requestGlobalHomeRefresh(forceRefresh) {
    const now = Date.now();
    const minGap = Number(this._globalHomeRefreshMinGapMs) || 0;

    if (forceRefresh) {
      try {
        if (this._globalHomeRefreshTimer) {
          clearTimeout(this._globalHomeRefreshTimer);
          this._globalHomeRefreshTimer = null;
        }
      } catch (_) { }
      this._globalHomeRefreshLastAt = now;
      return this.renderActivities('home-activity-timeline', 'global', null, true);
    }

    const lastAt = Number(this._globalHomeRefreshLastAt) || 0;
    const delta = now - lastAt;
    if (!minGap || delta >= minGap) {
      this._globalHomeRefreshLastAt = now;
      return this.renderActivities('home-activity-timeline', 'global', null, false);
    }

    if (this._globalHomeRefreshTimer) return;

    const waitMs = Math.max(0, minGap - delta);
    this._globalHomeRefreshTimer = setTimeout(() => {
      this._globalHomeRefreshTimer = null;
      this._globalHomeRefreshLastAt = Date.now();
      try {
        this.renderActivities('home-activity-timeline', 'global', null, false);
      } catch (_) { }
    }, waitMs);
  }

  /**
   * Clear activity caches
   * @param {string} entityType - Optional entity type to clear (e.g., 'global', 'contact', 'account')
   * @param {string} entityId - Optional entity ID to clear
   */
  clearCache(entityType = null, entityId = null) {
    if (entityType) {
      this.invalidateActivityCache(entityType, entityId);
    } else {
      // Clear everything
      this.processedActivitiesCache.clear();
      this.processedEmailsCache.clear();
      this.pageCache.clear();
      this.prerenderedPages.clear();
      this.currentActivities = null;

      // Also clear sessionStorage persisted caches
      sessionStorage.removeItem('activityManager_processedActivities');
      sessionStorage.removeItem('activityManager_processedEmails');
      sessionStorage.removeItem('activityManager_pageCache');
    }
  }

  /**
   * Load persisted cache from sessionStorage
   */
  loadPersistedCache(key) {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert back to Map
        return new Map(Object.entries(parsed));
      }
    } catch (e) {
      console.warn(`[ActivityManager] Failed to load persisted cache ${key}:`, e);
    }
    return null;
  }

  /**
   * Save cache to sessionStorage
   */
  savePersistedCache(key, cache) {
    if (this._persistDisabledKeys && this._persistDisabledKeys.has(key)) {
      return;
    }
    try {
      const obj = Object.fromEntries(cache);
      const serialized = JSON.stringify(obj);
      if (serialized.length > 1_000_000) {
        if (this._persistDisabledKeys) this._persistDisabledKeys.add(key);
        try { sessionStorage.removeItem(key); } catch (_) { }
        return;
      }
      sessionStorage.setItem(key, serialized);
    } catch (e) {
      try {
        const entries = Array.from(cache.entries());
        if (entries.length > 50) {
          const trimmed = new Map(entries.slice(-50));
          const obj2 = Object.fromEntries(trimmed);
          sessionStorage.setItem(key, JSON.stringify(obj2));
          cache.clear();
          for (const [k, v] of trimmed.entries()) cache.set(k, v);
          return;
        }
        sessionStorage.removeItem(key);
      } catch (_) { }
      if (e && (e.name === 'QuotaExceededError' || String(e.message || '').includes('exceeded the quota'))) {
        if (this._persistDisabledKeys) this._persistDisabledKeys.add(key);
        try { sessionStorage.removeItem(key); } catch (_) { }
        return;
      }
      console.warn(`[ActivityManager] Failed to save persisted cache ${key}:`, e);
    }
  }

  _withTimeout(promise, ms, label = '') {
    if (!ms || ms <= 0) return promise;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('timeout'));
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  /**
   * Setup cache persistence on page unload
   */
  setupCachePersistence() {
    const saveCache = () => {
      // Only save if we have meaningful cache data
      if (this.processedActivitiesCache.size > 0) {
        this.savePersistedCache('activityManager_processedActivities', this.processedActivitiesCache);
      }
      if (this.processedEmailsCache.size > 0) {
        this.savePersistedCache('activityManager_processedEmails', this.processedEmailsCache);
      }
      if (this.pageCache.size > 0) {
        this.savePersistedCache('activityManager_pageCache', this.pageCache);
      }
    };

    // Save on page unload
    window.addEventListener('beforeunload', saveCache);

    // Also save periodically every 30 seconds
    setInterval(saveCache, 30000);
  }

  /**
   * Setup memory monitoring for cache performance tracking
   */
  setupMemoryMonitoring() {
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      this.logMemoryUsage();
    }, 30000);

    // Log initial memory state
    this.logMemoryUsage();
  }

  /**
   * Log current memory usage and cache statistics
   */
  logMemoryUsage() {
    const activitiesCacheSize = this.processedActivitiesCache.size;
    const emailsCacheSize = this.processedEmailsCache.size;
    const prerenderedPagesSize = this.prerenderedPages.size;
    const pageCacheSize = this.pageCache.size;

    // Estimate memory usage (rough approximation)
    const estimatedMemoryMB = Math.round(
      (activitiesCacheSize * 2) + // ~2KB per activity
      (emailsCacheSize * 1.5) +   // ~1.5KB per email
      (prerenderedPagesSize * 5) + // ~5KB per prerendered page
      (pageCacheSize * 2)          // ~2KB per cached page
    ) / 1024;

  }

  /**
   * Setup event listeners to invalidate cache when new activities are created/updated
   * This ensures Recent Activities is immediately updated with new records
   */
  setupCacheInvalidationListeners() {
    // Invalidate relevant caches when contacts are created/updated (affects notes)
    document.addEventListener('pc:contact-created', (e) => {
      if (window.CacheManager) window.CacheManager.invalidate('contacts');
      this.invalidateActivityCache('global', null); // Invalidate global activities
      this.processedEmailsCache.clear(); // Clear processed emails cache
      this.refreshVisibleActivityContainers('global', null, { source: 'pc:contact-created' });
    });
    document.addEventListener('pc:contact-updated', (e) => {
      const { id } = e.detail || {};
      if (window.CacheManager) {
        window.CacheManager.invalidate('contacts');
        if (id) {
          // Note: individual contact invalidation would require more complex logic
          // For now, invalidate the whole contacts collection
        }
      }
      this.invalidateActivityCache('global', null); // Invalidate global activities
      if (id) {
        this.invalidateActivityCache('contact', id); // Invalidate specific contact activities
      }
      this.processedEmailsCache.clear(); // Clear processed emails cache
      if (id) {
        this.refreshVisibleActivityContainers('contact', id, { source: 'pc:contact-updated' });
      }
    });

    // Invalidate relevant caches when accounts are created/updated (affects notes)
    document.addEventListener('pc:account-created', () => {
      if (window.CacheManager) window.CacheManager.invalidate('accounts');
      this.invalidateActivityCache('global', null); // Invalidate global activities
      this.processedEmailsCache.clear(); // Clear processed emails cache
      this.refreshVisibleActivityContainers('global', null, { source: 'pc:account-created' });
    });
    document.addEventListener('pc:account-updated', (e) => {
      const { id } = e.detail || {};
      if (window.CacheManager) window.CacheManager.invalidate('accounts');
      this.invalidateActivityCache('global', null); // Invalidate global activities
      if (id) {
        this.invalidateActivityCache('account', id); // Invalidate specific account activities
      }
      this.processedEmailsCache.clear(); // Clear processed emails cache
      if (id) {
        this.refreshVisibleActivityContainers('account', id, { source: 'pc:account-updated' });
      }
    });

    // Invalidate task cache when tasks are created/updated/deleted
    document.addEventListener('tasksUpdated', (e) => {
      const source = (e && e.detail && typeof e.detail.source === 'string') ? e.detail.source : '';
      if (source === 'tasksPageLoad' || source === 'navigation') return;

      if (window.CacheManager) window.CacheManager.invalidate('tasks');
      this.invalidateActivityCache('global', null); // Invalidate global activities
      this.processedEmailsCache.clear(); // Clear processed emails cache
      this.refreshVisibleActivityContainers('global', null, { source: 'tasksUpdated' });
    });
    document.addEventListener('pc:task-deleted', (e) => {
      if (window.CacheManager) window.CacheManager.invalidate('tasks');
      this.invalidateActivityCache('global', null); // Invalidate global activities
      this.processedEmailsCache.clear(); // Clear processed emails cache
      this.refreshVisibleActivityContainers('global', null, { source: 'pc:task-deleted' });
    });

    // Invalidate email cache when emails are updated - refresh immediately for better UX
    document.addEventListener('pc:emails-updated', (e) => {
      const { contactId, accountId, source } = e.detail || {};
      const eventSource = source ? `pc:emails-updated:${String(source)}` : 'pc:emails-updated';
      // Clear email cache
      if (window.CacheManager) window.CacheManager.invalidate('emails');
      this.invalidateActivityCache('global', null); // Invalidate global activities
      this.processedEmailsCache.clear(); // Clear processed emails cache
      this.refreshVisibleActivityContainers('global', null, { source: eventSource });
      // Also refresh specific entity if provided
      if (contactId) {
        this.invalidateActivityCache('contact', contactId); // Invalidate specific contact activities
        this.refreshVisibleActivityContainers('contact', contactId, { source: eventSource });
      }
      if (accountId) {
        this.invalidateActivityCache('account', accountId); // Invalidate specific account activities
        this.refreshVisibleActivityContainers('account', accountId, { source: eventSource });
      }
    });

    // Invalidate call cache when calls are logged
    document.addEventListener('pc:call-logged', () => {
      if (window.CacheManager) window.CacheManager.invalidate('calls');
      this.invalidateActivityCache('global', null); // Only invalidate global activities for calls
      this.processedEmailsCache.clear(); // Clear processed emails cache
      this.refreshVisibleActivityContainers('global', null, { source: 'pc:call-logged' });
    });

    // Listen for explicit activity refresh requests
    document.addEventListener('pc:activities-refresh', (e) => {
      const { entityType, entityId, forceRefresh, source } = e.detail || {};
      // Invalidate relevant caches based on entity type
      if (window.CacheManager) {
        if (entityType === 'contact') {
          window.CacheManager.invalidate('contacts');
        } else if (entityType === 'account') {
          window.CacheManager.invalidate('accounts');
        } else if (entityType === 'task') {
          window.CacheManager.invalidate('tasks');
        } else {
          // For global or unknown types, invalidate all activity-related caches
          // But don't invalidate emails if this refresh was triggered by email updates (prevents cache invalidation cycle)
          window.CacheManager.invalidate('contacts');
          window.CacheManager.invalidate('accounts');
          window.CacheManager.invalidate('calls');
          window.CacheManager.invalidate('tasks');
          window.CacheManager.invalidate('sequences');
          if (!source || !source.includes('emails-updated')) {
            window.CacheManager.invalidate('emails');
          }
        }
      }

      // TARGETED CACHE CLEARING: Only clear specific entity caches instead of all
      if (entityType && entityId) {
        // Clear specific entity cache
        const entityCacheKey = `${entityType}-${entityId}`;
        this.processedActivitiesCache.delete(entityCacheKey);
        // Clear page caches for this entity
        const pageKeys = Array.from(this.pageCache.keys()).filter(key => key.startsWith(entityCacheKey));
        pageKeys.forEach(key => this.pageCache.delete(key));
      } else if (entityType === 'global') {
        // Clear only global cache
        this.processedActivitiesCache.delete('global-global');
        const globalPageKeys = Array.from(this.pageCache.keys()).filter(key => key.startsWith('global-global'));
        globalPageKeys.forEach(key => this.pageCache.delete(key));
      } else {
        // Fallback: clear all only for unknown entity types
        this.processedActivitiesCache.clear();
        this.pageCache.clear();
      }

      this.processedEmailsCache.clear(); // Clear processed emails cache
      this.currentActivities = null; // Clear stored activities on data changes
      // Auto-refresh any visible activity containers for this entity
      this.refreshVisibleActivityContainers(entityType, entityId, { source: 'pc:activities-refresh', forceRefresh: !!forceRefresh });
    });
  }

  /**
   * Automatically refresh any visible activity containers for a specific entity
   */
  refreshVisibleActivityContainers(entityType, entityId, opts = {}) {
    const source = (opts && opts.source) ? String(opts.source) : 'unknown';
    const forceRefresh = !!(opts && opts.forceRefresh);
    // Prevent refreshes immediately after page load (cooldown period to prevent flickering)
    const timeSincePageLoad = Date.now() - this.pageLoadTime;
    if (!forceRefresh && timeSincePageLoad < this.refreshCooldown) {
      return;
    }

    // Find all potential activity containers in the DOM
    const containers = [
      { id: 'home-activity-timeline', type: 'global', eid: null },
      { id: 'account-activity-timeline', type: 'account', eid: entityId },
      { id: 'contact-activity-timeline', type: 'contact', eid: entityId },
      { id: 'task-activities', type: 'task', eid: entityId },
      { id: 'task-activity-timeline', type: entityType, eid: entityId } // Task detail page uses this ID
    ];

    containers.forEach(c => {
      const el = document.getElementById(c.id);
      // Only refresh if the container exists and the entity matches
      if (el && (c.type === 'global' || c.type === entityType)) {
        // For task-activity-timeline, check current task to determine account vs contact
        if (c.id === 'task-activity-timeline') {
          // Check what type of task we're viewing by looking at the current task state
          if (window.TaskDetail && window.TaskDetail.state && window.TaskDetail.state.currentTask) {
            const task = window.TaskDetail.state.currentTask;
            // Determine entity type from task - refresh if it matches the event
            if (entityType === 'account' && task.accountId === entityId) {
              this.renderActivities(c.id, 'account', task.accountId, forceRefresh);
            } else if (entityType === 'contact' && task.contactId === entityId) {
              this.renderActivities(c.id, 'contact', task.contactId, forceRefresh);
            } else if (entityType === 'global') {
              // For global events, refresh based on what the task is showing
              if (task.accountId) {
                this.renderActivities(c.id, 'account', task.accountId, forceRefresh);
              } else if (task.contactId) {
                this.renderActivities(c.id, 'contact', task.contactId, forceRefresh);
              }
            }
          } else {
            // Fallback: use the provided entityType and entityId
            this.renderActivities(c.id, entityType, entityId, forceRefresh);
          }
        } else {
          if (c.id === 'home-activity-timeline') {
            this._requestGlobalHomeRefresh(forceRefresh);
          } else {
            this.renderActivities(c.id, c.type, c.eid, forceRefresh);
          }
        }
      }
    });
  }

  /**
   * Get all activities for a specific entity (account, contact, or global)
   */

  /**
   * Get activities with caching to prevent re-fetching underlying data
   */
  async getActivities(entityType = 'global', entityId = null, forceRefresh = false, page = null) {
    const cacheKey = `${entityType}-${entityId || 'global'}`;
    const isGlobalHome = entityType === 'global' && !entityId;
    const perTypeLimit = isGlobalHome ? this.homeFetchLimitPerType : this.fetchLimitPerType;

    // DEDUPE: Prevent multiple simultaneous getActivities() calls for the same entity/page
    const requestKey = `${cacheKey}::page:${page === null ? 'all' : page}`;
    if (!forceRefresh && this.getActivitiesPromises && this.getActivitiesPromises.has(requestKey)) {
      return this.getActivitiesPromises.get(requestKey);
    }

    const inFlightPromise = (async () => {
      // NOTE: Avoid artificial delays; rely on background loading coordination and caching instead.
      // REMOVED BLOCKING WAIT: Background loading should not block UI activity rendering.
      // Data will be fetched from cache/Firestore incrementally via getCallActivities, etc.

      // If page is specified, check page cache first
      if (page !== null) {
        const pageCacheKey = `${cacheKey}:page:${page}`;
        if (!forceRefresh && this.pageCache.has(pageCacheKey)) {
          return this._filterOutCallActivities(this.pageCache.get(pageCacheKey));
        }
      }

      // Check full activities cache first (avoids re-processing)
      if (!forceRefresh && this.processedActivitiesCache.has(cacheKey)) {
        return this._filterOutCallActivities(this.processedActivitiesCache.get(cacheKey));
      }
      const activities = [];
      const startTime = performance.now();

      try {
        // OPTIMIZATION: Fetch all activity types in parallel using CacheManager
        // This reduces total load time from sum of all fetches to max of all fetches

        const safe = (label, promise) => {
          if (!isGlobalHome) return promise;
          return this._withTimeout(promise, this.homeSourceTimeoutMs, label).catch(() => []);
        };

        const [notes, sequences, emails, tasks] = await Promise.all([
          safe('notes', this.getNoteActivities(entityType, entityId, perTypeLimit, forceRefresh)),
          safe('sequences', this.getSequenceActivities(entityType, entityId, perTypeLimit, forceRefresh)),
          safe('emails', this.getEmailActivities(entityType, entityId, perTypeLimit, forceRefresh)),
          safe('tasks', this.getTaskActivities(entityType, entityId, perTypeLimit, forceRefresh))
        ]);

        activities.push(...notes, ...sequences, ...emails, ...tasks);

        // Sort by timestamp (most recent first) using robust timestamp parsing
        activities.sort((a, b) => {
          const timeA = this.getTimestampMs(a.timestamp);
          const timeB = this.getTimestampMs(b.timestamp);
          return timeB - timeA;
        });

        this.lastFetchLimitUsed = perTypeLimit;

        // Handle page-specific processing (lazy loading optimization)
        if (page !== null) {
          // Extract only the activities for this page
          const startIndex = page * this.maxActivitiesPerPage;
          const endIndex = startIndex + this.maxActivitiesPerPage;
          const pageActivities = activities.slice(startIndex, endIndex);

          // Cache the page activities
          const pageCacheKey = `${cacheKey}:page:${page}`;
          this.pageCache.set(pageCacheKey, activities); // Cache full activities for this page request

          return activities; // Return full activities so pagination works with existing logic
        }

        const endTime = performance.now();

        // Cache the processed activities to avoid re-processing on pagination
        this.processedActivitiesCache.set(cacheKey, activities);
        return activities;
      } catch (error) {
        console.error('Error fetching activities:', error);
        return [];
      }
    })();

    try {
      if (!forceRefresh && this.getActivitiesPromises) this.getActivitiesPromises.set(requestKey, inFlightPromise);
      return await inFlightPromise;
    } finally {
      try { if (!forceRefresh && this.getActivitiesPromises) this.getActivitiesPromises.delete(requestKey); } catch (_) { /* noop */ }
    }
  }

  _filterOutCallActivities(activities) {
    try {
      return (activities || []).filter(a => a && a.type !== 'call');
    } catch (_) {
      return [];
    }
  }

  /**
   * Get call activities
   */
  async getCallActivities(entityType, entityId, limit, forceRefresh = false) {
    const startTime = performance.now();
    const activities = [];

    try {
      const calls = await (
        entityType === 'global'
          ? this.fetchCalls(limit)
          : (window.CacheManager ? window.CacheManager.get('calls', forceRefresh) : this.fetchCalls(limit))
      );

      // OPTIMIZATION: Pre-calculate contact IDs for account view to avoid O(N^2) loops
      let accountContactIds = new Set();
      if (entityType === 'account' && entityId) {
        const contacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
        contacts.forEach(c => {
          if (String(c.accountId) === String(entityId)) {
            accountContactIds.add(String(c.id));
          }
        });
      }

      for (const call of calls) {
        let shouldInclude = false;

        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          shouldInclude = String(call.contactId) === String(entityId);
        } else if (entityType === 'account' && entityId) {
          // Check if call is linked directly to account
          if (String(call.accountId) === String(entityId)) {
            shouldInclude = true;
          } else {
            // Or linked to a contact in that account (using O(1) Set lookup)
            shouldInclude = accountContactIds.has(String(call.contactId));
          }
        }

        // Skip completed calls - don't show them in recent activities
        const callStatus = (call.status || '').toLowerCase();
        const isCompleted = callStatus === 'completed' || callStatus === 'ended' || callStatus === 'finished';

        if (shouldInclude && !isCompleted) {
          activities.push({
            id: `call-${call.id}`,
            type: 'call',
            title: this.getCallTitle(call),
            description: this.getCallDescription(call),
            timestamp: call.timestamp || call.createdAt,
            icon: 'call',
            data: call
          });
        }
      }
    } catch (error) {
      console.error('Error fetching call activities:', error);
    }

    return activities;
  }

  /**
   * Get note activities
   */
  async getNoteActivities(entityType, entityId, limit, forceRefresh = false) {
    const activities = [];
    const startTime = performance.now();

    try {
      if (entityType === 'global') {
        // For global view, get notes from all contacts and accounts
        const [allContacts, allAccounts] = await Promise.all([
          this.fetchContactsWithNotes(limit),
          this.fetchAccountsWithNotes(limit)
        ]);

        // Filter contacts and accounts with notes, then sort by timestamp and limit
        const contactsWithNotes = (allContacts || []).filter(c => c && c.notes && c.notes.trim())
          .sort((a, b) => {
            const timeA = this.getTimestampMs(a.notesUpdatedAt || a.updatedAt || a.createdAt);
            const timeB = this.getTimestampMs(b.notesUpdatedAt || b.updatedAt || b.createdAt);
            return timeB - timeA;
          })
          .slice(0, limit);

        const accountsWithNotes = (allAccounts || []).filter(a => a && a.notes && a.notes.trim())
          .sort((a, b) => {
            const timeA = this.getTimestampMs(a.notesUpdatedAt || a.updatedAt || a.createdAt);
            const timeB = this.getTimestampMs(b.notesUpdatedAt || b.updatedAt || b.createdAt);
            return timeB - timeA;
          })
          .slice(0, limit);

        for (const contact of contactsWithNotes) {
          // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
          const timestamp = contact.notesUpdatedAt || contact.updatedAt || contact.createdAt;
          activities.push({
            id: `note-contact-${contact.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(contact.notes, 100),
            timestamp: timestamp,
            icon: 'note',
            data: { ...contact, entityType: 'contact' }
          });
        }

        for (const account of accountsWithNotes) {
          // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
          const timestamp = account.notesUpdatedAt || account.updatedAt || account.createdAt;
          activities.push({
            id: `note-account-${account.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(account.notes, 100),
            timestamp: timestamp,
            icon: 'note',
            data: { ...account, entityType: 'account' }
          });
        }
      } else if (entityType === 'contact' && entityId) {
        // For specific contact, find the contact and check if it has notes
        const contacts = await (window.CacheManager ? window.CacheManager.get('contacts', forceRefresh) : []);
        const contact = contacts.find(c => c && String(c.id) === String(entityId));
        if (contact && contact.notes && contact.notes.trim()) {
          // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
          const timestamp = contact.notesUpdatedAt || contact.updatedAt || contact.createdAt;
          activities.push({
            id: `note-contact-${contact.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(contact.notes, 100),
            timestamp: timestamp,
            icon: 'note',
            data: { ...contact, entityType: 'contact' }
          });
        }
      } else if (entityType === 'account' && entityId) {
        // For specific account, find the account and check if it has notes
        const [accounts, contacts] = await Promise.all([
          window.CacheManager ? window.CacheManager.get('accounts', forceRefresh) : [],
          window.CacheManager ? window.CacheManager.get('contacts', forceRefresh) : []
        ]);

        const account = accounts.find(a => a && String(a.id) === String(entityId));

        // 1. Add account's own notes
        if (account && account.notes && account.notes.trim()) {
          // Use proper timestamp priority: notesUpdatedAt > updatedAt > createdAt
          const timestamp = account.notesUpdatedAt || account.updatedAt || account.createdAt;
          activities.push({
            id: `note-account-${account.id}`,
            type: 'note',
            title: 'Note Added',
            description: this.truncateText(account.notes, 100),
            timestamp: timestamp,
            icon: 'note',
            data: { ...account, entityType: 'account' }
          });
        }

        // 2. Add notes from all contacts in this account
        const accountContacts = contacts.filter(c => c && String(c.accountId) === String(entityId));
        for (const contact of accountContacts) {
          if (contact.notes && contact.notes.trim()) {
            const timestamp = contact.notesUpdatedAt || contact.updatedAt || contact.createdAt;
            activities.push({
              id: `note-contact-${contact.id}`,
              type: 'note',
              title: `Note Added (${contact.firstName || ''} ${contact.lastName || ''})`.trim(),
              description: this.truncateText(contact.notes, 100),
              timestamp: timestamp,
              icon: 'note',
              data: { ...contact, entityType: 'contact' }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching note activities:', error);
    }

    return activities;
  }

  /**
   * Get sequence activities
   */
  async getSequenceActivities(entityType, entityId, limit, forceRefresh = false) {
    const activities = [];
    const startTime = performance.now();

    try {
      let sequences = [];
      if (!forceRefresh && window.BackgroundSequencesLoader && typeof window.BackgroundSequencesLoader.getSequencesData === 'function') {
        sequences = window.BackgroundSequencesLoader.getSequencesData() || [];
      }
      if (!Array.isArray(sequences) || sequences.length === 0) {
        if (window.CacheManager && typeof window.CacheManager.get === 'function') {
          sequences = await window.CacheManager.get('sequences');
        } else {
          sequences = await this.fetchSequences(limit);
        }
      }

      if (Array.isArray(sequences) && sequences.length > 1) {
        sequences = sequences.slice().sort((a, b) => {
          const tA = this.getTimestampMs(a?.updatedAt || a?.timestamp || a?.createdAt);
          const tB = this.getTimestampMs(b?.updatedAt || b?.timestamp || b?.createdAt);
          return tB - tA;
        });
      }

      if (entityType === 'global') {
        const maxCandidates = Math.max(50, (limit || 0) * 10);
        sequences = (sequences || []).slice(0, maxCandidates);
      }

      // OPTIMIZATION: Pre-calculate contact IDs for account view to avoid O(N^2) loops
      let accountContactIds = new Set();
      if (entityType === 'account' && entityId) {
        const contacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
        contacts.forEach(c => {
          if (String(c.accountId) === String(entityId)) {
            accountContactIds.add(String(c.id));
          }
        });
      }

      for (const sequence of sequences) {
        let shouldInclude = false;

        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          shouldInclude = String(sequence.contactId) === String(entityId);
        } else if (entityType === 'account' && entityId) {
          // Or linked to a contact in that account (using O(1) Set lookup)
          shouldInclude = accountContactIds.has(String(sequence.contactId));
        }

        if (shouldInclude) {
          activities.push({
            id: `sequence-${sequence.id}`,
            type: 'sequence',
            title: `Sequence: ${sequence.name || 'Untitled'}`,
            description: this.getSequenceDescription(sequence),
            timestamp: sequence.updatedAt || sequence.timestamp || sequence.createdAt,
            icon: 'sequence',
            data: sequence
          });
        }
      }
    } catch (error) {
      console.error('Error fetching sequence activities:', error);
    }

    return activities;
  }

  /**
   * Get email activities
   */
  async getEmailActivities(entityType, entityId, limit, forceRefresh = false) {
    const startTime = performance.now();
    const activities = [];

    try {
      // ENSURE CONTACTS ARE LOADED BEFORE EMAIL FILTERING
      let allContacts = [];
      if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
        allContacts = window.BackgroundContactsLoader.getContactsData() || [];
      } else {
        allContacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
      }

      const contactsLoaded = allContacts.length > 0;

      // OPTIMIZATION: Cache contact email sets to avoid O(N) loop on every refresh (~400ms save)
      const contactsHash = `${allContacts.length}-${allContacts[0]?.updatedAt || ''}`;
      if (!this._contactsEmailCache || this._contactsEmailCache.hash !== contactsHash) {
        const contactEmailsSet = new Set();
        const emailToContactMap = new Map();
        allContacts.forEach(c => {
          const mainEmail = (c.email || '').toLowerCase().trim();
          if (mainEmail) {
            contactEmailsSet.add(mainEmail);
            emailToContactMap.set(mainEmail, c);
          }
          if (Array.isArray(c.emails)) {
            c.emails.forEach(e => {
              const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
              if (emailAddr) {
                contactEmailsSet.add(emailAddr);
                emailToContactMap.set(emailAddr, c);
              }
            });
          }
        });
        this._contactsEmailCache = {
          hash: contactsHash,
          emailsSet: contactEmailsSet,
          contactMap: emailToContactMap,
          idsSet: new Set(allContacts.map(c => c.id).filter(Boolean))
        };

      }

      const { emailsSet: contactEmailsSet, contactMap: emailToContactMap, idsSet: contactIdsSet } = this._contactsEmailCache;


      if (!contactsLoaded && entityType !== 'global') {
        if (window.BackgroundLoaderCoordinator && typeof window.BackgroundLoaderCoordinator.loadCollection === 'function') {
          await window.BackgroundLoaderCoordinator.loadCollection('contacts');
        } else if (window.CacheManager) {
          await window.CacheManager.get('contacts');
        }

        if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
          allContacts = window.BackgroundContactsLoader.getContactsData() || [];
        } else {
          allContacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
        }
      }

      // FETCH EMAILS
      let emails = [];
      if (entityType === 'global') {
        emails = await this.fetchEmails(limit);
      } else {
        if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.getEmailsData === 'function') {
          emails = window.BackgroundEmailsLoader.getEmailsData() || [];
        }
        if (emails.length === 0) {
          emails = await (window.CacheManager ? window.CacheManager.get('emails', forceRefresh) : this.fetchEmails(limit));
        }
      }


      // Helper to extract email addresses from string or array
      const extractEmails = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) {
          return value.map(v => String(v || '').toLowerCase().trim()).filter(e => e);
        }
        const str = String(value || '');
        // Extract emails from "Name <email@domain.com>" format or plain email
        const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
        return matches.map(e => e.toLowerCase().trim());
      };

      // Helper to normalize email for comparison
      const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

      // CRITICAL: Filter emails to only include those from CRM contacts
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return activities;
      }


      // Filter emails to only include those from CRM contacts
      const allowAddressMatch = contactsLoaded && contactEmailsSet && contactEmailsSet.size > 0;

      const crmEmails = emails.filter(email => {
        // Check by contactId first (fastest)
        const matchById = email.contactId && contactIdsSet.has(email.contactId);
        if (matchById) return true;

        if (!allowAddressMatch) return false;

        // Check by email addresses using proper sent/received logic
        const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
        const emailTo = extractEmails(email.to);
        const emailFrom = extractEmails(email.from);
        const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
        const isReceived = email.type === 'received' || email.emailType === 'received' ||
          (emailFrom.length > 0 && !emailFrom.some(e => e.includes(currentUserEmail.toLowerCase())));

        // For received emails: sender (from) must be a contact
        if (isReceived && !isSent) {
          return emailFrom.some(addr => contactEmailsSet.has(addr));
        }

        // For sent emails: recipient (to) must be a contact
        if (isSent) {
          return emailTo.some(addr => contactEmailsSet.has(addr));
        }

        // Fallback: if we can't determine direction, check if sender is a contact
        return emailFrom.some(addr => contactEmailsSet.has(addr));
      });

      // Process emails - use cache for already processed emails
      const processedEmails = [];
      const emailsToProcess = [];

      // Separate cached vs uncached emails
      crmEmails.forEach(email => {
        const cached = this.processedEmailsCache.get(email.id);
        if (cached) {
          processedEmails.push(cached);
        } else {
          emailsToProcess.push(email);
        }
      });


      // Process uncached emails in batches to avoid blocking the UI thread
      const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
      const emailProcessingStartTime = performance.now();

      // Batch processing function to avoid blocking UI
      const processEmailBatch = async (emails, startIndex = 0, batchSize = 50) => {
        const endIndex = Math.min(startIndex + batchSize, emails.length);
        const batch = emails.slice(startIndex, endIndex);

        // Process this batch synchronously
        batch.forEach(email => {
          // Set contactId if not already set
          if (!email.contactId) {
            const emailTo = extractEmails(email.to);
            const emailFrom = extractEmails(email.from);

            // Find matching contact by email address
            let matchingContact = null;
            // Check all email addresses for this contact
            for (const addr of [...emailTo, ...emailFrom]) {
              matchingContact = emailToContactMap.get(addr);
              if (matchingContact) break;
            }

            if (matchingContact && matchingContact.id) {
              email.contactId = matchingContact.id;
            }
          }

          // Determine if email is sent or received
          const emailFrom = extractEmails(email.from);
          const emailTo = extractEmails(email.to);
          const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
          const isReceived = email.type === 'received' || email.emailType === 'received' ||
            (emailFrom.length > 0 && !emailFrom.some(e => e.includes(currentUserEmail.toLowerCase())));

          // Use more reliable email direction detection based on current user email
          // Prioritize the currentUserEmail check over unreliable type fields
          const isFromCurrentUser = emailFrom.some(addr => addr.includes(currentUserEmail.toLowerCase()));
          const isToCurrentUser = emailTo.some(addr => addr.includes(currentUserEmail.toLowerCase()));

          let direction = 'Sent'; // Default to sent
          if (isFromCurrentUser && !isToCurrentUser) {
            direction = 'Sent';
          } else if (!isFromCurrentUser && isToCurrentUser) {
            direction = 'Received';
          } else if (isFromCurrentUser && isToCurrentUser) {
            // Email to self or complex scenario - check original logic as fallback
            direction = isSent ? 'Sent' : (isReceived ? 'Received' : 'Sent');
          }

          const emailType = direction.toLowerCase();

          // Get preview text
          const previewText = email.text || email.snippet ||
            this.stripHtml(email.html || email.content || email.body || '') || '';

          // Get proper timestamp (handle both ISO strings and numbers)
          const emailTimestamp = email.timestamp || email.sentAt || email.receivedAt || email.date || email.createdAt;

          // Create processed email activity
          const processedEmail = {
            id: `email-${email.id}`,
            type: 'email',
            title: email.subject || `${direction} Email`,
            description: this.truncateText(previewText, 100),
            fullDescription: previewText, // Store full text for expansion
            truncatedDescription: this.truncateText(previewText, 100), // Store truncated text for collapse
            timestamp: emailTimestamp,
            icon: 'email',
            data: {
              ...email,
              // Ensure entityType is set for proper avatar rendering
              entityType: email.contactId ? 'contact' : (email.accountId ? 'account' : null),
              // Preserve contactId and accountId for navigation
              contactId: email.contactId || null,
              accountId: email.accountId || null
            },
            emailId: email.id // Store email ID for navigation
          };

          // Cache the processed email
          this.processedEmailsCache.set(email.id, processedEmail);
          processedEmails.push(processedEmail);

        });

        // If there are more emails to process, yield control and continue
        if (endIndex < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 0)); // Yield control to browser
          return processEmailBatch(emails, endIndex, batchSize);
        }
      };

      // Start batch processing
      await processEmailBatch(emailsToProcess);


      // Filter processed emails by entity type
      // OPTIMIZATION: Pre-calculate contact IDs for account view to avoid O(N^2) loops
      let accountContactIds = new Set();
      if (entityType === 'account' && entityId) {
        allContacts.forEach(c => {
          if (String(c.accountId) === String(entityId)) {
            accountContactIds.add(String(c.id));
          }
        });
      }

      processedEmails.forEach(emailActivity => {
        let shouldInclude = false;

        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          // Match by contactId if available
          if (String(emailActivity.data.contactId) === String(entityId)) {
            shouldInclude = true;
          }
        } else if (entityType === 'account' && entityId) {
          // Match by accountId if available
          if (String(emailActivity.data.accountId) === String(entityId)) {
            shouldInclude = true;
          } else {
            // Match by contactId for contacts in this account (using O(1) Set lookup)
            shouldInclude = accountContactIds.has(String(emailActivity.data.contactId));
          }
        }

        if (shouldInclude) {
          activities.push(emailActivity);
        }
      });

      if (entityType === 'global' && activities.length > limit) {
        activities.sort((a, b) => this.getTimestampMs(b.timestamp) - this.getTimestampMs(a.timestamp));
        activities.splice(limit);
      }

      return activities;
    } catch (error) {
      console.error('Error fetching email activities:', error);
      return activities;
    }
  }

  /**
   * Get task activities
   */
  async getTaskActivities(entityType, entityId, limit, forceRefresh = false) {
    const activities = [];
    const startTime = performance.now();

    try {
      const tasks = await (
        entityType === 'global'
          ? this.fetchTasks(limit)
          : (window.CacheManager ? window.CacheManager.get('tasks', forceRefresh) : this.fetchTasks(limit))
      );

      // OPTIMIZATION: Pre-calculate contact IDs for account view to avoid O(N^2) loops
      let accountContactIds = new Set();
      if (entityType === 'account' && entityId) {
        const contacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
        contacts.forEach(c => {
          if (String(c.accountId) === String(entityId)) {
            accountContactIds.add(String(c.id));
          }
        });
      }

      for (const task of tasks) {
        let shouldInclude = false;

        if (entityType === 'global') {
          shouldInclude = true;
        } else if (entityType === 'contact' && entityId) {
          shouldInclude = String(task.contactId) === String(entityId);
        } else if (entityType === 'account' && entityId) {
          // Include tasks directly for the account
          if (String(task.accountId) === String(entityId)) {
            shouldInclude = true;
          } else {
            // Or tasks for contacts in this account (using O(1) Set lookup)
            shouldInclude = accountContactIds.has(String(task.contactId));
          }
        }

        if (shouldInclude) {
          // Check if this is a guide download task
          const isGuideDownload = task.title && task.title.startsWith('Guide Download:');

          activities.push({
            id: `task-${task.id}`,
            type: isGuideDownload ? 'guide-download' : 'task',
            title: task.title || 'Task',
            description: this.truncateText(task.description, 100),
            timestamp: task.timestamp || task.createdAt,
            icon: isGuideDownload ? 'download' : 'task',
            data: task
          });
        }
      }
    } catch (error) {
      console.error('Error fetching task activities:', error);
    }

    return activities;
  }

  /**
   * Fetch calls from Firebase or local storage
   */
  async fetchCalls(limit = this.fetchLimitPerType) {

    try {
      const db = window.db || window.firebaseDB;
      const max = limit || this.fetchLimitPerType;
      if (!db) return [];

      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return (window.DataManager.getCurrentUserEmail() || '').toLowerCase();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return !!window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch (_) {
          return window.currentUserRole === 'admin';
        }
      };

      const withTimeout = (promise, ms) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
        ]);
      };

      if (!isAdmin()) {
        const email = getUserEmail();
        if (!email) return [];

        try {
          const [ownedSnap, assignedSnap] = await withTimeout(Promise.all([
            db.collection('calls').where('ownerId', '==', email).orderBy('timestamp', 'desc').limit(max).get(),
            db.collection('calls').where('assignedTo', '==', email).orderBy('timestamp', 'desc').limit(max).get()
          ]), 6000);

          const map = new Map();
          ownedSnap.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
          assignedSnap.docs.forEach(doc => {
            if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...doc.data() });
          });
          const data = Array.from(map.values());
          data.sort((a, b) => this.getTimestampMs(b.timestamp || b.createdAt || b.updatedAt) - this.getTimestampMs(a.timestamp || a.createdAt || a.updatedAt));
          return data.slice(0, max);
        } catch (error) {
          const msg = String(error?.message || '');
          const isIndexError = error?.code === 'failed-precondition' || msg.includes('index');
          const isTimeout = msg.includes('timeout');
          const isPerm = error?.code === 'permission-denied' || msg.includes('Missing or insufficient permissions');
          if (isPerm) return [];

          if (isIndexError || isTimeout) {
            const fallbackLimit = Math.max(50, max * 5);
            const [ownedSnap, assignedSnap] = await withTimeout(Promise.all([
              db.collection('calls').where('ownerId', '==', email).limit(fallbackLimit).get(),
              db.collection('calls').where('assignedTo', '==', email).limit(fallbackLimit).get()
            ]), 6000);

            const map = new Map();
            ownedSnap.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
            assignedSnap.docs.forEach(doc => {
              if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...doc.data() });
            });
            const data = Array.from(map.values());
            data.sort((a, b) => this.getTimestampMs(b.timestamp || b.createdAt || b.updatedAt) - this.getTimestampMs(a.timestamp || a.createdAt || a.updatedAt));
            return data.slice(0, max);
          }

          throw error;
        }
      }

      const snapshot = await db.collection('calls')
        .orderBy('timestamp', 'desc')
        .limit(max)
        .get();

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).slice(0, max);

      // Return empty array if no data available
      return [];
    } catch (error) {
      console.error('Error fetching calls:', error);
      return [];
    }
  }

  /**
   * Fetch notes from Firebase or local storage
   */
  async fetchNotes() {
    try {
      if (window.db) {
        const snapshot = await window.db.collection('notes')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      return [];
    } catch (error) {
      console.error('Error fetching notes:', error);
      return [];
    }
  }

  /**
   * Fetch contacts with notes from Firebase and localStorage
   */
  async fetchContactsWithNotes(limit = this.fetchLimitPerType) {

    try {
      let contacts = [];

      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch (_) {
          return window.currentUserRole === 'admin';
        }
      };

      // OPTIMIZATION: Try BackgroundContactsLoader cached data first (zero Firestore reads, instant)
      if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
        const cachedContacts = window.BackgroundContactsLoader.getContactsData() || [];
        const contactsWithNotes = cachedContacts.filter(c => c && c.notes && c.notes.trim());
        if (contactsWithNotes.length > 0) {
          // Sort by notesUpdatedAt desc and limit
          contactsWithNotes.sort((a, b) => {
            const timeA = this.getTimestampMs(a.notesUpdatedAt || a.updatedAt || a.createdAt);
            const timeB = this.getTimestampMs(b.notesUpdatedAt || b.updatedAt || b.createdAt);
            return timeB - timeA;
          });
          const result = contactsWithNotes.slice(0, limit || this.fetchLimitPerType);
          return result;
        }
      }

      // Fallback to Firestore if cache empty
      if (window.firebaseDB) {
        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email) {
            // CRITICAL FIX: Use direct Firestore queries with limit instead of DataManager.queryWithOwnership
            // DataManager.queryWithOwnership loads ALL contacts (no limit), causing 24+ second delays
            // Query both ownerId and assignedTo in parallel, then merge and sort
            try {
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('contacts')
                  .where('ownerId', '==', email)
                  .where('notes', '>', '')
                  .orderBy('notes')
                  .orderBy('notesUpdatedAt', 'desc')
                  .limit(limit || this.fetchLimitPerType)
                  .get(),
                window.firebaseDB.collection('contacts')
                  .where('assignedTo', '==', email)
                  .where('notes', '>', '')
                  .orderBy('notes')
                  .orderBy('notesUpdatedAt', 'desc')
                  .limit(limit || this.fetchLimitPerType)
                  .get()
              ]);

              // Merge results and deduplicate
              const contactsMap = new Map();
              ownedSnap.docs.forEach(doc => {
                contactsMap.set(doc.id, { id: doc.id, ...doc.data() });
              });
              assignedSnap.docs.forEach(doc => {
                if (!contactsMap.has(doc.id)) {
                  contactsMap.set(doc.id, { id: doc.id, ...doc.data() });
                }
              });

              contacts = Array.from(contactsMap.values());
              // Sort by notesUpdatedAt desc (most recent first)
              contacts.sort((a, b) => {
                const timeA = this.getTimestampMs(a.notesUpdatedAt || a.updatedAt || a.createdAt);
                const timeB = this.getTimestampMs(b.notesUpdatedAt || b.updatedAt || b.createdAt);
                return timeB - timeA;
              });
              // Apply limit after merge
              contacts = contacts.slice(0, limit || this.fetchLimitPerType);

            } catch (error) {
              // Detect missing Firestore index
              if (error.code === 'failed-precondition' || (error.message && error.message.includes('index'))) {
                console.error('[ActivityManager] Firestore index required for contacts with notes query:', error.message);
                if (error.message && error.message.includes('https://console.firebase.google.com')) {
                  console.error('[ActivityManager] Create index at:', error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0]);
                }
              }
              console.warn('Error fetching contacts with notes (non-admin query):', error);
              return [];
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          const snapshot = await window.firebaseDB.collection('contacts')
            .where('notes', '>', '')
            .orderBy('notes')
            .orderBy('notesUpdatedAt', 'desc')
            .limit(limit || this.fetchLimitPerType)
            .get();
          contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
      }

      // Also check localStorage for contacts with notes
      try {
        if (window.getPeopleData) {
          const localContacts = window.getPeopleData() || [];
          const contactsWithNotes = localContacts.filter(c => c.notes && c.notes.trim());
          // Merge local contacts that aren't already in Firebase
          const existingIds = new Set(contacts.map(c => c.id));
          const newLocalContacts = contactsWithNotes.filter(c => !existingIds.has(c.id));
          contacts = [...contacts, ...newLocalContacts];
        }
      } catch (error) {
        console.warn('Error loading contacts with notes from localStorage:', error);
      }

      const result = contacts.slice(0, limit || this.fetchLimitPerType);
      return result;
    } catch (error) {
      console.error('Error fetching contacts with notes:', error);
      return [];
    }
  }

  /**
   * Fetch accounts with notes from Firebase and localStorage
   */
  async fetchAccountsWithNotes(limit = this.fetchLimitPerType) {
    try {
      let accounts = [];

      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch (_) {
          return window.currentUserRole === 'admin';
        }
      };

      // OPTIMIZATION: Try BackgroundAccountsLoader cached data first (zero Firestore reads, instant)
      if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
        const cachedAccounts = window.BackgroundAccountsLoader.getAccountsData() || [];
        const accountsWithNotes = cachedAccounts.filter(a => a && a.notes && a.notes.trim());
        if (accountsWithNotes.length > 0) {
          // Sort by notesUpdatedAt desc and limit
          accountsWithNotes.sort((a, b) => {
            const timeA = this.getTimestampMs(a.notesUpdatedAt || a.updatedAt || a.createdAt);
            const timeB = this.getTimestampMs(b.notesUpdatedAt || b.updatedAt || b.createdAt);
            return timeB - timeA;
          });
          const result = accountsWithNotes.slice(0, limit || this.fetchLimitPerType);
          return result;
        }
      }

      // Fallback to Firestore if cache empty
      if (window.firebaseDB) {
        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email) {
            // CRITICAL FIX: Use direct Firestore queries with limit instead of DataManager.queryWithOwnership
            // DataManager.queryWithOwnership loads ALL accounts (no limit), causing slow performance
            // Query both ownerId and assignedTo in parallel, then merge and sort
            try {
              const [ownedSnap, assignedSnap] = await Promise.all([
                window.firebaseDB.collection('accounts')
                  .where('ownerId', '==', email)
                  .where('notes', '>', '')
                  .orderBy('notes')
                  .orderBy('notesUpdatedAt', 'desc')
                  .limit(limit || this.fetchLimitPerType)
                  .get(),
                window.firebaseDB.collection('accounts')
                  .where('assignedTo', '==', email)
                  .where('notes', '>', '')
                  .orderBy('notes')
                  .orderBy('notesUpdatedAt', 'desc')
                  .limit(limit || this.fetchLimitPerType)
                  .get()
              ]);

              // Merge results and deduplicate
              const accountsMap = new Map();
              ownedSnap.docs.forEach(doc => {
                accountsMap.set(doc.id, { id: doc.id, ...doc.data() });
              });
              assignedSnap.docs.forEach(doc => {
                if (!accountsMap.has(doc.id)) {
                  accountsMap.set(doc.id, { id: doc.id, ...doc.data() });
                }
              });

              accounts = Array.from(accountsMap.values());
              // Sort by notesUpdatedAt desc (most recent first)
              accounts.sort((a, b) => {
                const timeA = this.getTimestampMs(a.notesUpdatedAt || a.updatedAt || a.createdAt);
                const timeB = this.getTimestampMs(b.notesUpdatedAt || b.updatedAt || b.createdAt);
                return timeB - timeA;
              });
              // Apply limit after merge
              accounts = accounts.slice(0, limit || this.fetchLimitPerType);
            } catch (error) {
              // Detect missing Firestore index
              if (error.code === 'failed-precondition' || (error.message && error.message.includes('index'))) {
                console.error('[ActivityManager] Firestore index required for accounts with notes query:', error.message);
                if (error.message && error.message.includes('https://console.firebase.google.com')) {
                  console.error('[ActivityManager] Create index at:', error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0]);
                }
              }
              console.warn('Error fetching accounts with notes (non-admin query):', error);
              return [];
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          const snapshot = await window.firebaseDB.collection('accounts')
            .where('notes', '>', '')
            .orderBy('notes')
            .orderBy('notesUpdatedAt', 'desc')
            .limit(limit || this.fetchLimitPerType)
            .get();
          accounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
      }

      // Also check localStorage for accounts with notes
      try {
        if (window.getAccountsData) {
          const localAccounts = window.getAccountsData() || [];
          const accountsWithNotes = localAccounts.filter(a => a.notes && a.notes.trim());
          // Merge local accounts that aren't already in Firebase
          const existingIds = new Set(accounts.map(a => a.id));
          const newLocalAccounts = accountsWithNotes.filter(a => !existingIds.has(a.id));
          accounts = [...accounts, ...newLocalAccounts];
        }
      } catch (error) {
        console.warn('Error loading accounts with notes from localStorage:', error);
      }

      const result = accounts.slice(0, limit || this.fetchLimitPerType);
      return result;
    } catch (error) {
      console.error('Error fetching accounts with notes:', error);
      return [];
    }
  }

  /**
   * Fetch specific contact with notes
   */
  async fetchContactWithNotes(contactId) {
    try {
      // Try Firebase first
      if (window.firebaseDB) {
        const doc = await window.firebaseDB.collection('contacts').doc(contactId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
        }
      }

      // Fallback to localStorage
      if (window.getPeopleData) {
        const contacts = window.getPeopleData() || [];
        const contact = contacts.find(c => c.id === contactId);
        if (contact && contact.notes && contact.notes.trim()) {
          return contact;
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching contact with notes:', error);
      return null;
    }
  }

  /**
   * Fetch specific account with notes
   */
  async fetchAccountWithNotes(accountId) {
    try {
      // Try Firebase first
      if (window.firebaseDB) {
        const doc = await window.firebaseDB.collection('accounts').doc(accountId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
        }
      }

      // Fallback to localStorage
      if (window.getAccountsData) {
        const accounts = window.getAccountsData() || [];
        const account = accounts.find(a => a.id === accountId);
        if (account && account.notes && account.notes.trim()) {
          return account;
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching account with notes:', error);
      return null;
    }
  }

  /**
   * Fetch sequences from Firebase or local storage
   */
  async fetchSequences(limit = this.fetchLimitPerType) {
    try {
      const db = window.db || window.firebaseDB;
      const max = limit || this.fetchLimitPerType;
      if (!db) return [];

      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return (window.DataManager.getCurrentUserEmail() || '').toLowerCase();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return !!window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch (_) {
          return window.currentUserRole === 'admin';
        }
      };

      const withTimeout = (promise, ms) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
        ]);
      };

      if (!isAdmin()) {
        const email = getUserEmail();
        if (!email) return [];

        try {
          const [ownedSnap, assignedSnap] = await withTimeout(Promise.all([
            db.collection('sequences').where('ownerId', '==', email).orderBy('timestamp', 'desc').limit(max).get(),
            db.collection('sequences').where('assignedTo', '==', email).orderBy('timestamp', 'desc').limit(max).get()
          ]), 6000);

          const map = new Map();
          ownedSnap.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
          assignedSnap.docs.forEach(doc => {
            if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...doc.data() });
          });
          const data = Array.from(map.values());
          data.sort((a, b) => this.getTimestampMs(b.timestamp || b.createdAt || b.updatedAt) - this.getTimestampMs(a.timestamp || a.createdAt || a.updatedAt));
          return data.slice(0, max);
        } catch (error) {
          const msg = String(error?.message || '');
          const isIndexError = error?.code === 'failed-precondition' || msg.includes('index');
          const isTimeout = msg.includes('timeout');
          const isPerm = error?.code === 'permission-denied' || msg.includes('Missing or insufficient permissions');
          if (isPerm) return [];

          if (isIndexError || isTimeout) {
            const fallbackLimit = Math.max(50, max * 5);
            const [ownedSnap, assignedSnap] = await withTimeout(Promise.all([
              db.collection('sequences').where('ownerId', '==', email).limit(fallbackLimit).get(),
              db.collection('sequences').where('assignedTo', '==', email).limit(fallbackLimit).get()
            ]), 6000);

            const map = new Map();
            ownedSnap.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
            assignedSnap.docs.forEach(doc => {
              if (!map.has(doc.id)) map.set(doc.id, { id: doc.id, ...doc.data() });
            });
            const data = Array.from(map.values());
            data.sort((a, b) => this.getTimestampMs(b.timestamp || b.createdAt || b.updatedAt) - this.getTimestampMs(a.timestamp || a.createdAt || a.updatedAt));
            return data.slice(0, max);
          }

          throw error;
        }
      }

      const snapshot = await db.collection('sequences')
        .orderBy('timestamp', 'desc')
        .limit(max)
        .get();

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).slice(0, max);

      return [];
    } catch (error) {
      console.error('Error fetching sequences:', error);
      return [];
    }
  }

  /**
   * Fetch emails from Firebase or local storage
   */
  async fetchEmails(limit = this.fetchLimitPerType) {
    try {
      let emails = [];

      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch (_) {
          return window.currentUserRole === 'admin';
        }
      };

      // OPTIMIZATION: Try BackgroundEmailsLoader cached data first (zero Firestore reads, instant)
      if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.getEmailsData === 'function') {
        const cachedEmails = window.BackgroundEmailsLoader.getEmailsData() || [];
        if (cachedEmails.length > 0) {
          // Get all contacts from CRM to filter emails (only show emails from contacts in CRM)
          // OPTIMIZATION: Use BackgroundContactsLoader cached data if available (faster than getPeopleData)
          let allContacts = [];
          if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
            allContacts = window.BackgroundContactsLoader.getContactsData() || [];
          } else {
            allContacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
          }
          const contactIdsSet = new Set(allContacts.map(c => c.id).filter(Boolean));

          // PERFORMANCE OPTIMIZATION: Sort FIRST, then filter only the most recent emails
          // This avoids filtering thousands of emails - we only filter the top 200-500 most recent
          const sortStartTime = performance.now();
          const sortedEmails = [...cachedEmails].sort((a, b) => {
            const timeA = this.getTimestampMs(a.timestamp || a.sentAt || a.receivedAt || a.date || a.createdAt);
            const timeB = this.getTimestampMs(b.timestamp || b.sentAt || b.receivedAt || b.date || b.createdAt);
            return timeB - timeA; // Most recent first
          });
          // Take top 500 most recent emails to filter (much faster than filtering all emails)
          const recentEmailsToFilter = sortedEmails.slice(0, Math.max(500, limit * 20));

          // Build comprehensive set of all contact email addresses (main email + emails array)
          // Also build a map from email address to contact for quick lookup
          const contactEmailsSet = new Set();
          const emailToContactMap = new Map(); // Map email address -> contact object
          allContacts.forEach(c => {
            // Add main email field
            const mainEmail = (c.email || '').toLowerCase().trim();
            if (mainEmail) {
              contactEmailsSet.add(mainEmail);
              emailToContactMap.set(mainEmail, c);
            }

            // Add emails from emails array (if it exists)
            if (Array.isArray(c.emails)) {
              c.emails.forEach(e => {
                const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
                if (emailAddr) {
                  contactEmailsSet.add(emailAddr);
                  emailToContactMap.set(emailAddr, c);
                }
              });
            }
          });

          // Helper to extract email addresses from string or array
          const extractEmails = (value) => {
            if (!value) return [];
            if (Array.isArray(value)) {
              return value.map(v => String(v || '').toLowerCase().trim()).filter(e => e);
            }
            const str = String(value || '');
            const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
            return matches.map(e => e.toLowerCase().trim());
          };

          // Filter emails to only include those from CRM contacts
          // CRITICAL: Only show emails where sender/recipient matches an existing contact's email address

          // Helper to determine if email is from a contact
          const isEmailFromCrmContact = (email) => {
            // Check by contactId first (fastest)
            if (email.contactId && contactIdsSet.has(email.contactId)) {
              return true;
            }

            // Determine if email is sent or received
            const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
            const emailTo = extractEmails(email.to);
            const emailFrom = extractEmails(email.from);
            const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
            const isReceived = email.type === 'received' || email.emailType === 'received' ||
              (emailFrom.length > 0 && !emailFrom.some(e => e.toLowerCase().includes(currentUserEmail.toLowerCase())));

            // For received emails: sender (from) must be a contact
            if (isReceived && !isSent) {
              return emailFrom.some(addr => contactEmailsSet.has(addr));
            }

            // For sent emails: recipient (to) must be a contact
            if (isSent) {
              return emailTo.some(addr => contactEmailsSet.has(addr));
            }

            // Fallback: if we can't determine direction, check if sender is a contact
            return emailFrom.some(addr => contactEmailsSet.has(addr));
          };

          // Now filter only the recent emails (much faster than filtering all emails)
          // Also set contactId on emails that match contacts by email address
          const filteredEmails = recentEmailsToFilter.filter(email => {
            // Check by contactId first (fastest)
            if (email.contactId && contactIdsSet.has(email.contactId)) {
              return true;
            }

            // Check by email addresses using proper sent/received logic
            const matches = isEmailFromCrmContact(email);
            if (matches) {
              // Try to set contactId by finding the matching contact
              if (!email.contactId) {
                const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
                const emailTo = extractEmails(email.to);
                const emailFrom = extractEmails(email.from);
                const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
                const isReceived = email.type === 'received' || email.emailType === 'received' ||
                  (emailFrom.length > 0 && !emailFrom.some(e => e.toLowerCase().includes(currentUserEmail.toLowerCase())));

                // Find matching contact by email address
                let matchingContact = null;
                if (isReceived && !isSent) {
                  // Received: sender (from) is the contact
                  for (const addr of emailFrom) {
                    matchingContact = emailToContactMap.get(addr);
                    if (matchingContact) break;
                  }
                } else if (isSent) {
                  // Sent: recipient (to) is the contact
                  for (const addr of emailTo) {
                    matchingContact = emailToContactMap.get(addr);
                    if (matchingContact) break;
                  }
                } else {
                  // Fallback: check sender
                  for (const addr of emailFrom) {
                    matchingContact = emailToContactMap.get(addr);
                    if (matchingContact) break;
                  }
                }

                if (matchingContact && matchingContact.id) {
                  email.contactId = matchingContact.id;
                }
              }
              return true;
            }
            return false;
          });

          // Limit to final count needed (already sorted, so just slice)
          const result = filteredEmails.slice(0, limit || this.fetchLimitPerType);
          return result;
        }
      }

      // Fallback to Firestore if cache empty
      if (window.firebaseDB) {

        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email) {
            // CRITICAL FIX: Use direct Firestore queries with limit instead of DataManager.queryWithOwnership
            // DataManager.queryWithOwnership loads ALL emails (no limit), causing 7+ second delays
            // Query both ownerId and assignedTo in parallel, then merge and sort
            try {
              const max = limit || this.fetchLimitPerType;
              const withTimeout = (promise, ms) => {
                return Promise.race([
                  promise,
                  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
                ]);
              };

              const [ownedSnap, assignedSnap] = await withTimeout(Promise.all([
                window.firebaseDB.collection('emails')
                  .where('ownerId', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(max)
                  .get(),
                window.firebaseDB.collection('emails')
                  .where('assignedTo', '==', email)
                  .orderBy('timestamp', 'desc')
                  .limit(max)
                  .get()
              ]), 6000);

              // Merge results and deduplicate
              const emailsMap = new Map();
              ownedSnap.docs.forEach(doc => {
                emailsMap.set(doc.id, { id: doc.id, ...doc.data() });
              });
              assignedSnap.docs.forEach(doc => {
                if (!emailsMap.has(doc.id)) {
                  emailsMap.set(doc.id, { id: doc.id, ...doc.data() });
                }
              });

              emails = Array.from(emailsMap.values());
              // Sort by timestamp desc (most recent first)
              emails.sort((a, b) => {
                const timeA = this.getTimestampMs(a.timestamp || a.sentAt || a.receivedAt || a.date || a.createdAt);
                const timeB = this.getTimestampMs(b.timestamp || b.sentAt || b.receivedAt || b.date || b.createdAt);
                return timeB - timeA;
              });
              emails = emails.slice(0, max);
            } catch (error) {
              // If query fails (missing index), try without orderBy
              try {
                const max = limit || this.fetchLimitPerType;
                const withTimeout = (promise, ms) => {
                  return Promise.race([
                    promise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
                  ]);
                };

                const fallbackLimit = Math.max(50, max * 5);
                const [ownedSnap, assignedSnap] = await withTimeout(Promise.all([
                  window.firebaseDB.collection('emails')
                    .where('ownerId', '==', email)
                    .limit(fallbackLimit)
                    .get(),
                  window.firebaseDB.collection('emails')
                    .where('assignedTo', '==', email)
                    .limit(fallbackLimit)
                    .get()
                ]), 6000);

                // Merge results and deduplicate
                const emailsMap = new Map();
                ownedSnap.docs.forEach(doc => {
                  emailsMap.set(doc.id, { id: doc.id, ...doc.data() });
                });
                assignedSnap.docs.forEach(doc => {
                  if (!emailsMap.has(doc.id)) {
                    emailsMap.set(doc.id, { id: doc.id, ...doc.data() });
                  }
                });

                emails = Array.from(emailsMap.values());
                // Sort client-side
                emails.sort((a, b) => {
                  const timeA = this.getTimestampMs(a.timestamp || a.sentAt || a.receivedAt || a.date || a.createdAt);
                  const timeB = this.getTimestampMs(b.timestamp || b.sentAt || b.receivedAt || b.date || b.createdAt);
                  return timeB - timeA;
                });
                // Apply limit after merge
                emails = emails.slice(0, max);
              } catch (err2) {
                // Detect missing Firestore index
                if (err2.code === 'failed-precondition' || (err2.message && err2.message.includes('index'))) {
                  console.error('[ActivityManager] Firestore index required for emails query:', err2.message);
                  if (err2.message && err2.message.includes('https://console.firebase.google.com')) {
                    console.error('[ActivityManager] Create index at:', err2.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0]);
                  }
                }
                console.warn('Error fetching emails (non-admin query):', err2);
                return [];
              }
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          try {
            const snapshot = await window.firebaseDB.collection('emails')
              .orderBy('timestamp', 'desc')
              .limit(limit || this.fetchLimitPerType)
              .get();
            emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          } catch (error) {
            // If orderBy fails, try without it and sort client-side
            try {

              const snapshot = await window.firebaseDB.collection('emails')
                .limit(limit || this.fetchLimitPerType)
                .get();

              emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              // Sort client-side
              emails.sort((a, b) => {
                const timeA = this.getTimestampMs(a.timestamp || a.sentAt || a.receivedAt || a.date || a.createdAt);
                const timeB = this.getTimestampMs(b.timestamp || b.sentAt || b.receivedAt || b.date || b.createdAt);
                return timeB - timeA;
              });
            } catch (err2) {
              // Detect missing Firestore index
              if (err2.code === 'failed-precondition' || (err2.message && err2.message.includes('index'))) {
                console.error('[ActivityManager] Firestore index required for emails query (fallback):', err2.message);
                if (err2.message && err2.message.includes('https://console.firebase.google.com')) {
                  console.error('[ActivityManager] Create index at:', err2.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0]);
                }
              }
              console.warn('Error fetching emails:', err2);
              return [];
            }
          }
        }
      }

      // CRITICAL: Filter emails to only include those from CRM contacts (even when from Firestore)
      // Get all contacts from CRM to filter emails
      // OPTIMIZATION: Use BackgroundContactsLoader cached data if available (faster than getPeopleData)
      let allContacts = [];
      if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
        allContacts = window.BackgroundContactsLoader.getContactsData() || [];
      } else {
        allContacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
      }
      const contactIdsSet = new Set(allContacts.map(c => c.id).filter(Boolean));

      // Build comprehensive set of all contact email addresses (main email + emails array)
      const contactEmailsSet = new Set();
      allContacts.forEach(c => {
        // Add main email field
        const mainEmail = (c.email || '').toLowerCase().trim();
        if (mainEmail) contactEmailsSet.add(mainEmail);

        // Add emails from emails array (if it exists)
        if (Array.isArray(c.emails)) {
          c.emails.forEach(e => {
            const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
            if (emailAddr) contactEmailsSet.add(emailAddr);
          });
        }
      });

      // Helper to extract email addresses from string or array
      const extractEmails = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) {
          return value.map(v => String(v || '').toLowerCase().trim()).filter(e => e);
        }
        const str = String(value || '');
        const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
        return matches.map(e => e.toLowerCase().trim());
      };

      // Filter emails to only include those from CRM contacts
      // CRITICAL: Only show emails FROM contacts (received) or TO contacts (sent by user)
      // Helper to determine if email is from a contact
      const isEmailFromCrmContactFirestore = (email) => {
        // Check by contactId first (fastest)
        if (email.contactId && contactIdsSet.has(email.contactId)) {
          return true;
        }

        // Determine if email is sent or received
        const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
        const emailTo = extractEmails(email.to);
        const emailFrom = extractEmails(email.from);
        const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
        const isReceived = email.type === 'received' || email.emailType === 'received' ||
          (emailFrom.length > 0 && !emailFrom.some(e => e.toLowerCase().includes(currentUserEmail.toLowerCase())));

        // For received emails: sender (from) must be a contact
        if (isReceived && !isSent) {
          return emailFrom.some(addr => contactEmailsSet.has(addr));
        }

        // For sent emails: recipient (to) must be a contact
        if (isSent) {
          return emailTo.some(addr => contactEmailsSet.has(addr));
        }

        // Fallback: if we can't determine direction, check if sender is a contact
        return emailFrom.some(addr => contactEmailsSet.has(addr));
      };



      emails = emails.filter(email => {
        // Check by contactId first (fastest)
        if (email.contactId && contactIdsSet.has(email.contactId)) {

          return true;
        }

        const matches = isEmailFromCrmContactFirestore(email);
        if (matches) {

          return true;
        } else {

          return false;
        }
      });



      const result = emails.slice(0, limit || this.fetchLimitPerType);
      return result;
    } catch (error) {
      console.error('Error fetching emails:', error);
      return [];
    }
  }

  /**
   * Fetch tasks from Firebase or local storage
   */
  async fetchTasks(limit = this.fetchLimitPerType) {
    try {
      let tasks = [];
      let cachedTasks = [];

      // Helper functions
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch (_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch (_) {
          return window.currentUserRole === 'admin';
        }
      };

      // OPTIMIZATION: Try BackgroundTasksLoader cached data first (zero Firestore reads, instant)
      if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.getTasksData === 'function') {
        cachedTasks = window.BackgroundTasksLoader.getTasksData() || [];
        if (cachedTasks.length > 0) {
          // Sort by timestamp desc and limit
          cachedTasks.sort((a, b) => {
            const timeA = this.getTimestampMs(a.timestamp || a.createdAt || a.updatedAt);
            const timeB = this.getTimestampMs(b.timestamp || b.createdAt || b.updatedAt);
            return timeB - timeA;
          });
          const result = cachedTasks.slice(0, limit || this.fetchLimitPerType);
          return result;
        }
      }

      // Fallback to Firestore if cache empty
      if (window.firebaseDB) {
        if (!isAdmin()) {
          // Non-admin: filter by ownership
          const email = getUserEmail();
          if (email) {
            // CRITICAL FIX: Use direct Firestore queries with limit instead of DataManager.queryWithOwnership
            // DataManager.queryWithOwnership loads ALL tasks (no limit), causing 7+ second delays
            // Direct queries with limits are much faster and use fewer Firestore reads
            // Fallback: two separate queries and merge client-side
            try {
              // CRITICAL: Add timeout to prevent 17+ second hangs (missing index causes slow queries)
              // Use Promise.race with timeout, but catch timeout and use fallback query
              const queryTimeout = 5000; // 5 second timeout
              let queryResult;
              try {
                const queryPromise = Promise.all([
                  window.firebaseDB.collection('tasks').where('ownerId', '==', email).orderBy('timestamp', 'desc').limit(limit || this.fetchLimitPerType).get(),
                  window.firebaseDB.collection('tasks').where('assignedTo', '==', email).orderBy('timestamp', 'desc').limit(limit || this.fetchLimitPerType).get()
                ]);
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Query timeout - likely missing Firestore index')), queryTimeout)
                );
                queryResult = await Promise.race([queryPromise, timeoutPromise]);
              } catch (timeoutError) {
                // Query timed out - likely missing index, use fallback query without orderBy
                console.warn('[ActivityManager] Tasks query timed out - using fallback query without orderBy. Create Firestore index for optimal performance.');
                // Fallback: query without orderBy, sort client-side
                const [ownedSnap, assignedSnap] = await Promise.all([
                  window.firebaseDB.collection('tasks').where('ownerId', '==', email).limit(limit || this.fetchLimitPerType).get(),
                  window.firebaseDB.collection('tasks').where('assignedTo', '==', email).limit(limit || this.fetchLimitPerType).get()
                ]);
                const tasksMap = new Map();
                ownedSnap.docs.forEach(doc => tasksMap.set(doc.id, { id: doc.id, ...doc.data() }));
                assignedSnap.docs.forEach(doc => {
                  if (!tasksMap.has(doc.id)) tasksMap.set(doc.id, { id: doc.id, ...doc.data() });
                });
                tasks = Array.from(tasksMap.values());
                // Sort client-side
                tasks.sort((a, b) => {
                  const timeA = this.getTimestampMs(a.timestamp || a.createdAt || a.updatedAt);
                  const timeB = this.getTimestampMs(b.timestamp || b.createdAt || b.updatedAt);
                  return timeB - timeA;
                });
                tasks = tasks.slice(0, limit || this.fetchLimitPerType);
                // Skip to end of try block
                const result = tasks.slice(0, limit || this.fetchLimitPerType);
                return result;
              }
              const [ownedSnap, assignedSnap] = queryResult;
              const tasksMap = new Map();
              ownedSnap.docs.forEach(doc => tasksMap.set(doc.id, { id: doc.id, ...doc.data() }));
              assignedSnap.docs.forEach(doc => {
                if (!tasksMap.has(doc.id)) tasksMap.set(doc.id, { id: doc.id, ...doc.data() });
              });
              tasks = Array.from(tasksMap.values());
            } catch (error) {
              console.warn('Error fetching tasks (non-admin query):', error);
              // Detect missing Firestore index
              if (error.code === 'failed-precondition' || (error.message && error.message.includes('index'))) {
                console.error('[ActivityManager] Firestore index required for tasks query:', error.message);
                if (error.message && error.message.includes('https://console.firebase.google.com')) {
                  console.error('[ActivityManager] Create index at:', error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0]);
                }
                // Fallback: try query without orderBy (slower but works without index)
                try {
                  const [ownedSnap, assignedSnap] = await Promise.all([
                    window.firebaseDB.collection('tasks').where('ownerId', '==', email).limit(limit || this.fetchLimitPerType).get(),
                    window.firebaseDB.collection('tasks').where('assignedTo', '==', email).limit(limit || this.fetchLimitPerType).get()
                  ]);
                  const tasksMap = new Map();
                  ownedSnap.docs.forEach(doc => tasksMap.set(doc.id, { id: doc.id, ...doc.data() }));
                  assignedSnap.docs.forEach(doc => {
                    if (!tasksMap.has(doc.id)) tasksMap.set(doc.id, { id: doc.id, ...doc.data() });
                  });
                  tasks = Array.from(tasksMap.values());
                  // Sort client-side
                  tasks.sort((a, b) => {
                    const timeA = this.getTimestampMs(a.timestamp || a.createdAt || a.updatedAt);
                    const timeB = this.getTimestampMs(b.timestamp || b.createdAt || b.updatedAt);
                    return timeB - timeA;
                  });
                  tasks = tasks.slice(0, limit || this.fetchLimitPerType);
                } catch (fallbackError) {
                  console.error('[ActivityManager] Fallback query also failed:', fallbackError);
                  return [];
                }
              } else {
                return [];
              }
            }
          } else {
            return [];
          }
        } else {
          // Admin: unrestricted query
          const snapshot = await window.firebaseDB.collection('tasks')
            .orderBy('timestamp', 'desc')
            .limit(limit || this.fetchLimitPerType)
            .get();
          tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
      }

      // Also check localStorage for additional tasks (CRITICAL: filter by ownership for non-admin)
      try {
        const localTasks = JSON.parse(localStorage.getItem('userTasks') || '[]');
        let filteredLocalTasks = localTasks;
        if (!isAdmin()) {
          const email = getUserEmail();
          filteredLocalTasks = localTasks.filter(t => {
            if (!t) return false;
            const ownerId = (t.ownerId || '').toLowerCase();
            const assignedTo = (t.assignedTo || '').toLowerCase();
            const createdBy = (t.createdBy || '').toLowerCase();
            return ownerId === email || assignedTo === email || createdBy === email;
          });
        }
        // Merge local tasks that aren't already in Firebase
        const existingIds = new Set(tasks.map(t => t.id));
        const newLocalTasks = filteredLocalTasks.filter(t => !existingIds.has(t.id));
        tasks = [...tasks, ...newLocalTasks];
      } catch (error) {
        console.warn('Error loading tasks from localStorage:', error);
      }

      const result = tasks.slice(0, limit || this.fetchLimitPerType);
      return result;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  }

  /**
   * Render activities for a specific container
   */
  async renderActivities(containerId, entityType = 'global', entityId = null, forceRefresh = false, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }


    // OPTIMIZATION: Don't render if container is not visible (saves heavy processing for hidden dashboard widgets)
    const page = container.closest('.page');
    const isVisible = page && page.classList.contains('active') && !page.hidden;
    if (!isVisible && !forceRefresh) {
      return;
    }

    const renderKey = `${containerId}::${entityType}::${entityId || ''}`;
    if (!forceRefresh && this.renderPromises && this.renderPromises.has(renderKey)) {
      return this.renderPromises.get(renderKey);
    }

    const renderPromise = (async () => {
      const disableAnimations = !!(opts && opts.disableAnimations);
      // Avoid flicker: only show loading spinner when container is empty or forceRefresh
      const hasExistingContent = container && container.children && container.children.length > 0 && !container.querySelector('.loading-spinner');
      if (!forceRefresh && hasExistingContent) {
      } else {
        container.innerHTML = this.renderLoadingState();
      }

      // Add timeout fallback to prevent infinite loading
      const timeoutId = setTimeout(() => {
        container.innerHTML = this.renderEmptyState();
      }, 30000); // 30 second timeout

      try {
        let activities = await this.getActivities(entityType, entityId, forceRefresh);
        if (containerId === 'home-activity-timeline' && activities.length > this.homeMaxActivities) {
          activities = activities.slice(0, this.homeMaxActivities);
        }
        this.currentActivities = activities;
        clearTimeout(timeoutId); // Clear timeout since we got results

        const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);

        // Clamp page in case a prior page index (from dashboard) exceeds this view's page count
        if (this.currentPage < 0 || this.currentPage >= totalPages) {
          this.currentPage = 0;
        }

        if (activities.length === 0) {
          container.innerHTML = this.renderEmptyState();
          return;
        }

        // Render current page immediately
        const paginatedActivities = this.getPageActivities(activities, this.currentPage);
        const activityHtml = this.renderActivityList(paginatedActivities);
        const sigKey = `${containerId}::${entityType}::${entityId || ''}::page:${this.currentPage}`;
        const newSignature = (paginatedActivities || []).map(a => {
          const id = a && a.id ? String(a.id) : '';
          const ts = a ? this.getTimestampMs(a.timestamp) : 0;
          return `${id}@${ts}`;
        }).join('|');
        const prevSignature = this.lastRenderedSignatures ? this.lastRenderedSignatures.get(sigKey) : null;
        // Always replace the loading state - with fallback
        if (activityHtml && activityHtml.trim().length > 0) {
          // If we already rendered the same items, skip DOM replacement (prevents icon/glyph flicker)
          if (!forceRefresh && hasExistingContent && prevSignature && prevSignature === newSignature) {
            // Skip update
          } else {
            if (disableAnimations) {
              container.style.height = '';
              container.innerHTML = activityHtml;
              this.attachActivityEvents(container, entityType, entityId);
            } else {
              const currentHeight = container.offsetHeight;
              container.style.height = currentHeight + 'px';
              container.innerHTML = activityHtml;
              this.attachActivityEvents(container, entityType, entityId);

              requestAnimationFrame(() => {
                container.style.height = container.scrollHeight + 'px';
                setTimeout(() => { container.style.height = ''; }, 450);
              });
            }

            try { if (this.lastRenderedSignatures) this.lastRenderedSignatures.set(sigKey, newSignature); } catch (_) { /* noop */ }
          }
        } else {
          container.innerHTML = this.renderEmptyState();
        }

        // CRITICAL: Ensure loading state is always cleared with a fallback
        setTimeout(() => {
          if (container.innerHTML.includes('loading-spinner')) {
            container.innerHTML = this.renderEmptyState();
          }
        }, 2000);

        // Show pagination if there are multiple pages
        this.updatePagination(containerId, totalPages);

        // Only pre-render if there are multiple pages and we're not on the first load
        if (totalPages > 1) {
          // Pre-render adjacent pages in background (non-blocking) with a small delay
          setTimeout(() => {
            this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
              // Silent error handling
            });
          }, 100);
        }


      } catch (error) {
        clearTimeout(timeoutId); // Clear timeout since we got an error
        console.error('Error rendering activities:', error);
        container.innerHTML = this.renderErrorState();
      }
    })();

    try {
      if (this.renderPromises) this.renderPromises.set(renderKey, renderPromise);
      return await renderPromise;
    } finally {
      try { if (this.renderPromises) this.renderPromises.delete(renderKey); } catch (_) { /* noop */ }
    }
  }

  /**
   * Pre-render adjacent pages to prevent container size changes
   */
  async prerenderAdjacentPages(activities, entityType, entityId, totalPages) {
    const prerenderKey = `${entityType}-${entityId || 'global'}`;

    // Pre-render previous page if it exists
    if (this.currentPage > 0) {
      const prevPage = this.currentPage - 1;
      const prevPageKey = `${prerenderKey}-${prevPage}`;
      if (!this.prerenderedPages.has(prevPageKey)) {
        const prevActivities = this.getPageActivities(activities, prevPage);
        const prevHtml = this.renderActivityList(prevActivities);
        this.prerenderedPages.set(prevPageKey, prevHtml);
      }
    }

    // Pre-render next page if it exists
    if (this.currentPage < totalPages - 1) {
      const nextPage = this.currentPage + 1;
      const nextPageKey = `${prerenderKey}-${nextPage}`;
      if (!this.prerenderedPages.has(nextPageKey)) {
        const nextActivities = this.getPageActivities(activities, nextPage);
        const nextHtml = this.renderActivityList(nextActivities);
        this.prerenderedPages.set(nextPageKey, nextHtml);
      }
    }
  }

  /**
   * Get activities for a specific page
   */
  getPageActivities(activities, page) {
    const start = page * this.maxActivitiesPerPage;
    const end = start + this.maxActivitiesPerPage;
    return activities.slice(start, end);
  }

  /**
   * Paginate activities
   */
  paginateActivities(activities) {
    const start = this.currentPage * this.maxActivitiesPerPage;
    const end = start + this.maxActivitiesPerPage;
    const result = activities.slice(start, end);
    return result;
  }

  /**
   * Generate HTML for email tracking badges (opened/clicked)
   * @param {Object} activity - The activity object
   * @returns {string} - HTML string for badges
   */
  getTrackingBadgesHtml(activity) {
    if (activity.type !== 'email' || !activity.data) return '';
    
    const isSent = activity.data.type === 'sent' || activity.data.emailType === 'sent' || activity.data.isSentEmail;
    if (!isSent) return '';

    let badgesHtml = '';
    const opened = activity.data.openCount || 0;
    const clicked = activity.data.clickCount || 0;

    if (opened > 0) {
      badgesHtml += `<span class="badge badge-opened" style="margin-left: 8px;">Opened <span class="count-circle">${opened}</span></span>`;
    }
    if (clicked > 0) {
      badgesHtml += `<span class="badge badge-clicked" style="margin-left: 4px;">Clicked <span class="count-circle">${clicked}</span></span>`;
    }

    return badgesHtml;
  }

  /**
   * Render activity list HTML
   */
  renderActivityList(activities) {

    if (!activities || activities.length === 0) {
      return '';
    }

    try {
      const result = activities.map((activity, index) => {
        try {
          // Add entity name for global activities - with error handling
          let entityName = null;
          try {
            entityName = this.getEntityNameForActivity(activity);
          } catch (error) {
            entityName = null;
          }

          const titleWithEntity = entityName ? `${activity.title} • ${entityName}` : activity.title;

          // Determine navigation target based on activity data
          let navigationTarget = null;
          let navigationType = null;

          // Priority 1: Check for explicit emailId or email type
          if (activity.type === 'email' || activity.emailId) {
            navigationTarget = activity.emailId || activity.id.replace(/^email-/, '');
            navigationType = 'email';
          }
          else if (activity.type === 'task' || activity.taskId) {
            navigationTarget = activity.taskId || activity.id.replace(/^task-/, '');
            navigationType = 'task';
          }
          // Priority 2: Check for explicit data entity type
          else if (activity.data && activity.data.entityType === 'contact') {
            navigationTarget = activity.data.id;
            navigationType = 'contact';
          } else if (activity.data && activity.data.entityType === 'account') {
            navigationTarget = activity.data.id;
            navigationType = 'account';
          } else if (activity.data && activity.data.entityType === 'task') {
            navigationTarget = activity.data.id;
            navigationType = 'task';
          }
          // Priority 3: Check for ID fields
          else if (activity.data && activity.data.contactId) {
            navigationTarget = activity.data.contactId;
            navigationType = 'contact';
          } else if (activity.data && activity.data.accountId) {
            navigationTarget = activity.data.accountId;
            navigationType = 'account';
          } else if (activity.data && activity.data.taskId) {
            navigationTarget = activity.data.taskId;
            navigationType = 'task';
          }

          // Add click handler attributes if we have a navigation target
          const clickAttributes = navigationTarget ?
            `onclick="window.ActivityManager.handleActivityClick('${activity.id}', '${navigationType}', '${navigationTarget}'); event.stopPropagation();" style="cursor: pointer;"` :
            '';


          // Get entity avatar for the activity
          const entityAvatar = this.getEntityAvatarForActivity(activity);

          // Add emailId data attribute for email activities
          const emailIdAttr = activity.emailId ? `data-email-id="${activity.emailId}"` : '';

          // Add staggered delay for modern reveal
          const delay = (index * 0.05).toFixed(2);
          const revealStyle = `style="animation-delay: ${delay}s; cursor: pointer;"`;

          return `
            <div class="activity-item modern-reveal premium-borderline" data-activity-id="${activity.id}" data-activity-type="${activity.type}" ${emailIdAttr} ${clickAttributes} ${revealStyle}>
            <div class="activity-entity-avatar">
              ${entityAvatar}
            </div>
            <div class="activity-content">
                <div class="activity-title">
                  ${this.escapeHtml(activity.title)}
                  ${this.getTrackingBadgesHtml(activity)}
                </div>
                <div class="activity-entity">${this.escapeHtml(entityName || '')}</div>
              <div class="activity-description" data-full-text="${this.escapeHtml(activity.fullDescription || '')}" data-truncated-text="${this.escapeHtml(activity.truncatedDescription || '')}">
                ${this.escapeHtml(activity.description || '')}${activity.fullDescription && activity.fullDescription.length > 100 ? `<span class="expand-link" onclick="window.ActivityManager.expandDescription(this); event.stopPropagation();">EXPAND</span>` : ''}
              </div>
              <div class="activity-time">${this.formatTimestamp(activity.timestamp)}</div>
            </div>
            <div class="activity-icon activity-icon--${activity.type}">
              ${this.getActivityIcon(activity.type)}
            </div>
          </div>
          `;
        } catch (error) {
          console.error('[ActivityManager] Error rendering individual activity:', error);
          // Add staggered delay for modern reveal even on error item
          const delay = (index * 0.05).toFixed(2);
          // Return a fallback activity item if individual activity fails
          return `
            <div class="activity-item modern-reveal" data-activity-id="${activity.id || 'unknown'}" data-activity-type="${activity.type || 'unknown'}" style="animation-delay: ${delay}s;">
            <div class="activity-icon">
              ${this.getActivityIcon(activity.type || 'note')}
            </div>
            <div class="activity-content">
                <div class="activity-title">
                  ${this.escapeHtml(activity.title || 'Activity')}
                  ${this.getTrackingBadgesHtml(activity)}
                </div>
              <div class="activity-description" data-full-text="${this.escapeHtml(activity.fullDescription || '')}" data-truncated-text="${this.escapeHtml(activity.truncatedDescription || '')}">
                ${this.escapeHtml(activity.description || '')}${activity.fullDescription && activity.fullDescription.length > 100 ? `<span class="expand-link" onclick="window.ActivityManager.expandDescription(this); event.stopPropagation();">EXPAND</span>` : ''}
              </div>
              <div class="activity-time">${this.formatTimestamp(activity.timestamp)}</div>
            </div>
          </div>
          `;
        }
      }).join('');

      return result;
    } catch (error) {
      console.error('[ActivityManager] Critical error in renderActivityList:', error);
      return '<div class="activity-item"><div class="activity-content"><div class="activity-title">Error loading activities</div></div></div>';
    }
  }

  /**
   * Render loading state
   */
  renderLoadingState() {
    return `
      <div class="activity-skeletons">
        ${Array(4).fill(0).map(() => `
          <div class="activity-item modern-reveal premium-borderline" style="border: 1px solid rgba(255,255,255,0.08); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02); margin-bottom: 10px; opacity: 0.7; pointer-events: none; display: flex; align-items: center; gap: 12px; padding: 12px 16px; min-height: 85px;">
            <div class="activity-entity-avatar">
              <div class="skeleton-shimmer" style="width: 36px; height: 36px; border-radius: 50%;"></div>
            </div>
            <div class="activity-content" style="flex: 1;">
              <div class="skeleton-text medium skeleton-shimmer" style="margin-bottom: 8px; height: 16px;"></div>
              <div class="skeleton-text skeleton-shimmer" style="margin-bottom: 6px; height: 12px; width: 90%;"></div>
              <div class="skeleton-text short skeleton-shimmer" style="height: 10px;"></div>
            </div>
            <div class="activity-icon">
              <div class="skeleton-shimmer" style="width: 24px; height: 24px; border-radius: 4px;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="activity-placeholder">
        <div class="placeholder-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1v6m0 6v6"/>
          </svg>
        </div>
        <div class="placeholder-text">No recent activity</div>
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderErrorState() {
    return `
      <div class="activity-placeholder">
        <div class="placeholder-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="placeholder-text">Error loading activities</div>
      </div>
    `;
  }

  /**
   * Attach event listeners to activity items
   */
  attachActivityEvents(container, entityType, entityId) {
    const activityItems = container.querySelectorAll('.activity-item');
    activityItems.forEach(item => {
      item.addEventListener('click', () => {
        const activityId = item.getAttribute('data-activity-id');
        const activityType = item.getAttribute('data-activity-type');
        const emailId = item.getAttribute('data-email-id'); // Get emailId if available
        this.handleActivityClick(activityType, activityId, entityType, entityId, { emailId });
      });
    });
  }

  /**
   * Handle activity item click
   */
  handleActivityClick(activityType, activityId, entityType, entityId, activityData = null) {
    switch (activityType) {
      case 'call':
        this.openCallDetail(activityId);
        break;
      case 'note':
        this.openNoteDetail(activityId);
        break;
      case 'sequence':
        this.openSequenceDetail(activityId);
        break;
      case 'email':
        // Pass entityType and entityId to openEmailDetail for navigation source tracking
        this.openEmailDetail(activityId, entityType, entityId);
        break;
      case 'task':
      case 'guide-download':
        this.openTaskDetail(activityId);
        break;
    }
  }

  /**
   * Open call detail
   */
  openCallDetail(activityId) {
    // Navigate to calls page or open call detail modal
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('calls');
    }
  }

  /**
   * Open note detail
   */
  openNoteDetail(activityId) {
    // Open note widget or navigate to notes
  }

  /**
   * Open sequence detail
   */
  openSequenceDetail(activityId) {
    // Navigate to sequences page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('sequences');
    }
  }

  /**
   * Open email detail
   */
  openEmailDetail(activityId, entityType = null, entityId = null) {
    // Extract email ID from activity ID (format: "email-{emailId}")
    const emailId = activityId.replace(/^email-/, '');

    // Store navigation source based on where we came from
    if (entityType === 'contact' && entityId) {
      window._emailNavigationSource = 'contact-detail';
      window._emailNavigationContactId = entityId;
      try { window._emailNavigationContactScroll = window.scrollY || 0; } catch (_) { }
    } else if (entityType === 'task' && entityId) {
      window._emailNavigationSource = 'task-detail';
      window._emailNavigationTaskId = entityId;
      try { window._emailNavigationTaskScroll = window.scrollY || 0; } catch (_) { }
    } else if (entityType === 'account' && entityId) {
      window._emailNavigationSource = 'account-detail';
      window._emailNavigationAccountId = entityId;
      try { window._emailNavigationAccountScroll = window.scrollY || 0; } catch (_) { }
    } else if (entityType === 'global' || !entityType) {
      // Check if we're on dashboard/home page
      const currentPage = window.crm?.currentPage || '';
      if (currentPage === 'dashboard' || currentPage === 'home') {
        window._emailNavigationSource = 'home';
      } else {
        // Default to emails page
        window._emailNavigationSource = null;
      }
    }

    // Navigate to email detail page with the email ID
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('email-detail', { emailId });
    } else if (window.EmailDetail && typeof window.EmailDetail.show === 'function') {
      // Fallback: direct call to EmailDetail module
      window.EmailDetail.show(emailId);
    }
  }

  /**
   * Open task detail
   */
  openTaskDetail(activityId) {
    // Navigate to tasks page
    if (window.crm && typeof window.crm.navigateToPage === 'function') {
      window.crm.navigateToPage('tasks');
    }
  }

  /**
   * Ensure we have enough activities loaded for the requested page.
   * If not, increase the fetch limit (up to a cap) and refresh.
   */
  async ensureActivitiesForPage(page, entityType, entityId) {
    const needed = (page + 1) * this.maxActivitiesPerPage;
    const cacheKey = `${entityType}-${entityId || 'global'}`;

    // Check cache first - avoid re-processing all activities for pagination
    if (this.processedActivitiesCache.has(cacheKey)) {
      const cachedActivities = this.processedActivitiesCache.get(cacheKey);
      if (cachedActivities.length >= needed) {
        return cachedActivities;
      }
    }

    let activities = await this.getActivities(entityType, entityId);
    if (activities.length >= needed) return activities;

    // Increase fetch window and try again
    if (this.fetchLimitPerType < this.maxFetchLimit) {
      this.fetchLimitPerType = Math.min(this.fetchLimitPerType + 20, this.maxFetchLimit);
      activities = await this.getActivities(entityType, entityId, true);
    }
    return activities;
  }

  /**
   * Navigate to next page of activities
   */
  async nextPage(containerId, entityType, entityId) {

    // Use stored activities from initial render to avoid cache invalidation issues
    let activities = this.currentActivities;

    if (!activities) {
      // Fallback: fetch activities if not stored
      activities = await this.getActivities(entityType, entityId);
      this.currentActivities = activities; // Store for future use
    }

    const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);

    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      await this.renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages);
      // Update pagination controls
      this.updatePagination(containerId, totalPages);
    }
  }

  /**
   * Navigate to previous page of activities
   */
  async previousPage(containerId, entityType, entityId) {
    if (this.currentPage > 0) {
      this.currentPage--;
      // Use stored activities from initial render to avoid cache invalidation issues
      let activities = this.currentActivities;

      if (!activities) {
        // Fallback: fetch activities if not stored
        activities = await this.getActivities(entityType, entityId);
        this.currentActivities = activities; // Store for future use
      }

      const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);
      await this.renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages);
      // Update pagination controls
      this.updatePagination(containerId, totalPages);
    }
  }

  /**
   * Go to specific page
   */
  async goToPage(page, containerId, entityType, entityId) {
    // Use stored activities from initial render to avoid cache invalidation issues
    let activities = this.currentActivities;

    if (!activities) {
      // Fallback: fetch activities if not stored
      activities = await this.getActivities(entityType, entityId);
      this.currentActivities = activities; // Store for future use
    }

    const totalPages = Math.ceil(activities.length / this.maxActivitiesPerPage);

    if (page >= 0 && page < totalPages) {
      this.currentPage = page;
      await this.renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages);
      // Update pagination controls
      this.updatePagination(containerId, totalPages);
    }
  }

  /**
   * Render page with pre-rendered content for smooth transitions
   */
  async renderPageWithPrerendering(containerId, entityType, entityId, activities, totalPages) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const prerenderKey = `${entityType}-${entityId || 'global'}`;
    const pageKey = `${prerenderKey}-${this.currentPage}`;

    // Check if we have pre-rendered content
    if (this.prerenderedPages.has(pageKey)) {
      container.innerHTML = this.prerenderedPages.get(pageKey);
      this.attachActivityEvents(container, entityType, entityId);

      // Pre-render adjacent pages for next navigation (non-blocking)
      this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
        // Silent error handling
      });
    } else {
      // Fallback to normal rendering
      const paginatedActivities = this.getPageActivities(activities, this.currentPage);

      if (paginatedActivities.length === 0) {
        container.innerHTML = this.renderEmptyState();
      } else {
        container.innerHTML = this.renderActivityList(paginatedActivities);
        this.attachActivityEvents(container, entityType, entityId);
      }

      // Pre-render adjacent pages (non-blocking)
      this.prerenderAdjacentPages(activities, entityType, entityId, totalPages).catch(error => {
        // Silent error handling
      });
    }
  }

  /**
   * Get call title
   */
  getCallTitle(call) {
    if (call.direction === 'inbound') {
      return 'Incoming Call';
    } else if (call.direction === 'outbound') {
      return 'Outgoing Call';
    }
    return 'Call';
  }

  /**
   * Get call description
   */
  getCallDescription(call) {
    const duration = call.duration ? `${call.duration}s` : 'No duration';
    const status = call.status || 'Unknown';
    return `${status} • ${duration}`;
  }

  /**
   * Get sequence description
   */
  getSequenceDescription(sequence) {
    return sequence.description || 'Sequence activity';
  }

  /**
   * Get entity name for activity (for global activities)
   * Format: "First Last • Title at Company" or "First Last • Company" (if no title)
   */
  getEntityNameForActivity(activity) {
    try {
      if (!activity || !activity.data) {
        return null;
      }

      // Helper function to format contact name with title and company
      const formatContactName = (contact) => {
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
        const contactName = fullName || contact.name || 'Unknown Contact';
        const title = contact.title || contact.jobTitle || '';
        const companyName = this.getCompanyNameForContact(contact);

        // Build subtitle: Title at Company or just Company
        let subtitle = '';
        if (title && companyName) {
          subtitle = `${title} at ${companyName}`;
        } else if (companyName) {
          subtitle = companyName;
        } else if (title) {
          subtitle = title;
        }

        // Format: First Last • Subtitle (or just First Last if no subtitle)
        return subtitle ? `${contactName} • ${subtitle}` : contactName;
      };

      if (activity.data.entityType === 'contact') {
        // For email activities, activity.data is the email object, not the contact
        // We need to look up the contact by contactId
        if (activity.type === 'email' && activity.data.contactId) {
          // Look up the actual contact object
          try {
            let contacts = [];
            if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
              contacts = window.BackgroundContactsLoader.getContactsData() || [];
            } else if (window.getPeopleData && typeof window.getPeopleData === 'function') {
              contacts = window.getPeopleData() || [];
            }

            const contact = contacts.find(c => c && c.id === activity.data.contactId);
            if (contact) {
              return formatContactName(contact);
            }
          } catch (error) {
            console.warn('[ActivityManager] Error looking up contact for email:', error);
          }
        } else {
          // For non-email activities (like notes), activity.data IS the contact
          const contact = activity.data;
          return formatContactName(contact);
        }
      } else if (activity.data.entityType === 'account') {
        const account = activity.data;
        return account.accountName || account.name || account.companyName || 'Unknown Account';
      } else if (activity.data.contactId) {
        // Try to find contact name from contactId - with better error handling
        try {
          // Try BackgroundContactsLoader first (faster)
          let contacts = [];
          if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
            contacts = window.BackgroundContactsLoader.getContactsData() || [];
          } else if (window.getPeopleData && typeof window.getPeopleData === 'function') {
            contacts = window.getPeopleData() || [];
          }

          const contact = contacts.find(c => c && c.id === activity.data.contactId);
          if (contact) {
            return formatContactName(contact);
          } else {
            // Fallback: For email activities, try to find contact by email address
            if (activity.type === 'email' && activity.data) {
              const email = activity.data;
              const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
              const emailTo = (email.to ? (Array.isArray(email.to) ? email.to : [email.to]) : []).map(e => {
                const str = String(e || '');
                const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
                return matches.map(m => m.toLowerCase().trim());
              }).flat();
              const emailFrom = (email.from ? (Array.isArray(email.from) ? [email.from] : [email.from]) : []).map(e => {
                const str = String(e || '');
                const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
                return matches.map(m => m.toLowerCase().trim());
              }).flat();

              const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
              const isReceived = email.type === 'received' || email.emailType === 'received' ||
                (emailFrom.length > 0 && !emailFrom.some(e => e.includes(currentUserEmail.toLowerCase())));

              // Find contact by email address
              let matchingContact = null;
              if (isReceived && !isSent) {
                // Received: sender (from) is the contact
                for (const addr of emailFrom) {
                  matchingContact = contacts.find(c => {
                    const mainEmail = (c.email || '').toLowerCase().trim();
                    if (mainEmail === addr) return true;
                    if (Array.isArray(c.emails)) {
                      return c.emails.some(e => {
                        const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
                        return emailAddr === addr;
                      });
                    }
                    return false;
                  });
                  if (matchingContact) break;
                }
              } else if (isSent) {
                // Sent: recipient (to) is the contact
                for (const addr of emailTo) {
                  matchingContact = contacts.find(c => {
                    const mainEmail = (c.email || '').toLowerCase().trim();
                    if (mainEmail === addr) return true;
                    if (Array.isArray(c.emails)) {
                      return c.emails.some(e => {
                        const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
                        return emailAddr === addr;
                      });
                    }
                    return false;
                  });
                  if (matchingContact) break;
                }
              }

              if (matchingContact) {
                return formatContactName(matchingContact);
              }
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up contact data:', error);
        }
      } else if (activity.type === 'email' && activity.data) {
        // For email activities without contactId, try to find contact by email address
        try {
          let contacts = [];
          if (window.BackgroundContactsLoader && typeof window.BackgroundContactsLoader.getContactsData === 'function') {
            contacts = window.BackgroundContactsLoader.getContactsData() || [];
          } else if (window.getPeopleData && typeof window.getPeopleData === 'function') {
            contacts = window.getPeopleData() || [];
          }

          const email = activity.data;
          const currentUserEmail = window.DataManager?.getCurrentUserEmail?.() || window.currentUserEmail || '';
          const emailTo = (email.to ? (Array.isArray(email.to) ? email.to : [email.to]) : []).map(e => {
            const str = String(e || '');
            const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
            return matches.map(m => m.toLowerCase().trim());
          }).flat();
          const emailFrom = (email.from ? (Array.isArray(email.from) ? [email.from] : [email.from]) : []).map(e => {
            const str = String(e || '');
            const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
            return matches.map(m => m.toLowerCase().trim());
          }).flat();

          const isSent = email.type === 'sent' || email.emailType === 'sent' || email.isSentEmail;
          const isReceived = email.type === 'received' || email.emailType === 'received' ||
            (emailFrom.length > 0 && !emailFrom.some(e => e.includes(currentUserEmail.toLowerCase())));

          // Find contact by email address
          let matchingContact = null;
          if (isReceived && !isSent) {
            // Received: sender (from) is the contact
            for (const addr of emailFrom) {
              matchingContact = contacts.find(c => {
                const mainEmail = (c.email || '').toLowerCase().trim();
                if (mainEmail === addr) return true;
                if (Array.isArray(c.emails)) {
                  return c.emails.some(e => {
                    const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
                    return emailAddr === addr;
                  });
                }
                return false;
              });
              if (matchingContact) break;
            }
          } else if (isSent) {
            // Sent: recipient (to) is the contact
            for (const addr of emailTo) {
              matchingContact = contacts.find(c => {
                const mainEmail = (c.email || '').toLowerCase().trim();
                if (mainEmail === addr) return true;
                if (Array.isArray(c.emails)) {
                  return c.emails.some(e => {
                    const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
                    return emailAddr === addr;
                  });
                }
                return false;
              });
              if (matchingContact) break;
            }
          }

          if (matchingContact) {
            return formatContactName(matchingContact);
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up contact by email address:', error);
        }
      } else if (activity.data.accountId) {
        // Try to find account name from accountId - with better error handling
        try {
          let accounts = [];
          if (window.BackgroundAccountsLoader && typeof window.BackgroundAccountsLoader.getAccountsData === 'function') {
            accounts = window.BackgroundAccountsLoader.getAccountsData() || [];
          } else if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            accounts = window.getAccountsData() || [];
          }

          const account = accounts.find(a => a && a.id === activity.data.accountId);
          if (account) {
            return account.accountName || account.name || account.companyName || 'Unknown Account';
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account data:', error);
        }
      }
    } catch (error) {
      console.warn('[ActivityManager] Error getting entity name for activity:', error);
    }
    return null;
  }

  /**
   * Get entity avatar for activity (contact initials or company favicon)
   */
  getEntityAvatarForActivity(activity) {
    try {
      if (!activity || !activity.data) {
        return this.getDefaultEntityAvatar();
      }

      // Check if this is a guide download activity
      if (activity.type === 'guide-download' ||
        (activity.type === 'task' && activity.title && activity.title.startsWith('Guide Download:'))) {
        return this.getGuideDownloadAvatar();
      }

      if (activity.data.entityType === 'contact') {
        // Contact avatar with initials
        const contact = activity.data;
        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
        const contactName = fullName || contact.name || 'Unknown Contact';
        const initials = this.getContactInitials(contactName);
        return `<div class="activity-entity-avatar-circle contact-avatar" aria-hidden="true">${initials}</div>`;
      } else if (activity.data.entityType === 'account') {
        // Company favicon
        const account = activity.data;
        const logoUrl = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon;
        const domain = account.domain || account.website;

        if (logoUrl && window.__pcFaviconHelper) {
          return window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 40 });
        } else if (domain && window.__pcFaviconHelper) {
          return window.__pcFaviconHelper.generateFaviconHTML(domain, 40);
        } else {
          return this.getDefaultCompanyAvatar();
        }
      } else if (activity.data.contactId) {
        // Try to find contact data
        try {
          if (window.getPeopleData && typeof window.getPeopleData === 'function') {
            const contacts = window.getPeopleData() || [];
            const contact = contacts.find(c => c && c.id === activity.data.contactId);
            if (contact) {
              const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
              const contactName = fullName || contact.name || 'Unknown Contact';
              const initials = this.getContactInitials(contactName);
              return `<div class="activity-entity-avatar-circle contact-avatar" aria-hidden="true">${initials}</div>`;
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up contact for avatar:', error);
        }
      } else if (activity.data.accountId) {
        // Try to find account data
        try {
          if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(a => a && a.id === activity.data.accountId);
            if (account) {
              const logoUrl = account.logoUrl || account.logo || account.companyLogo || account.iconUrl || account.companyIcon;
              const domain = account.domain || account.website;

              if (logoUrl && window.__pcFaviconHelper) {
                return window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl, domain, size: 40 });
              } else if (domain && window.__pcFaviconHelper) {
                return window.__pcFaviconHelper.generateFaviconHTML(domain, 40);
              } else {
                return this.getDefaultCompanyAvatar();
              }
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account for avatar:', error);
        }
      }
    } catch (error) {
      console.warn('[ActivityManager] Error getting entity avatar for activity:', error);
    }

    return this.getDefaultEntityAvatar();
  }

  /**
   * Get contact initials from name
   */
  getContactInitials(contactName) {
    if (!contactName) return '?';
    const parts = contactName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1) {
      return parts[0][0].toUpperCase();
    }
    return '?';
  }

  /**
   * Get default entity avatar (fallback)
   */
  getDefaultEntityAvatar() {
    return `<div class="activity-entity-avatar-circle default-avatar" aria-hidden="true">?</div>`;
  }

  /**
   * Get default company avatar
   */
  getDefaultCompanyAvatar() {
    return `<div class="activity-entity-avatar-circle company-avatar" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"></path>
      </svg>
    </div>`;
  }

  /**
   * Get guide download avatar (blue circle with download icon)
   */
  getGuideDownloadAvatar() {
    return `<div class="activity-entity-avatar-circle guide-download-avatar" aria-hidden="true" style="background: linear-gradient(135deg, #0b1b45 0%, #1e3a8a 100%); color: #ffffff;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    </div>`;
  }

  /**
   * Get company name for a contact
   */
  getCompanyNameForContact(contact) {
    try {
      if (!contact) {
        return null;
      }

      // First try to get company from contact's accountId
      if (contact.accountId) {
        try {
          if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(a => a && a.id === contact.accountId);
            if (account) {
              return account.accountName || account.name || account.companyName;
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account by ID:', error);
        }
      }

      // Fallback to contact's company field
      if (contact.company) {
        return contact.company;
      }

      // Try to find account by company name match
      if (contact.companyName) {
        try {
          if (window.getAccountsData && typeof window.getAccountsData === 'function') {
            const accounts = window.getAccountsData() || [];
            const account = accounts.find(a => a && (
              a.accountName === contact.companyName ||
              a.name === contact.companyName ||
              a.companyName === contact.companyName
            ));
            if (account) {
              return account.accountName || account.name || account.companyName;
            }
          }
        } catch (error) {
          console.warn('[ActivityManager] Error looking up account by name:', error);
        }
      }
    } catch (error) {
      console.warn('[ActivityManager] Error getting company name for contact:', error);
    }
    return null;
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    const ms = this.getTimestampMs(timestamp);
    if (!ms) return 'Just now';
    return this.formatRelativeTime(new Date(ms));
  }

  /**
   * Normalize various timestamp shapes to milliseconds since epoch
   */
  getTimestampMs(value) {
    try {
      if (!value) return 0;
      // Firestore Timestamp object
      if (value && typeof value.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : 0;
      }
      // Firestore { seconds, nanoseconds } shape
      if (typeof value === 'object' && value.seconds != null) {
        const seconds = Number(value.seconds) || 0;
        const nanos = Number(value.nanoseconds || value.nanos || 0) || 0;
        return seconds * 1000 + Math.floor(nanos / 1e6);
      }
      // Date
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? 0 : value.getTime();
      }
      // ISO string
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === 'Invalid date' || trimmed === 'null' || trimmed === 'undefined') return 0;
        const t = Date.parse(trimmed);
        return isNaN(t) ? 0 : t;
      }
      // number (ms)
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }

  /**
   * Strip HTML tags to get plain text
   */
  stripHtml(html) {
    if (!html) return '';

    // Remove style and script tags completely
    let cleaned = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract text content from remaining HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = cleaned;
    let text = tmp.textContent || tmp.innerText || '';

    // Clean up the extracted text
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Format relative time (helper method)
   */
  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Toggle between expanded and truncated activity description
   */
  expandDescription(toggleBtn) {
    const descriptionDiv = toggleBtn.parentElement;
    const fullText = descriptionDiv.getAttribute('data-full-text');
    const truncatedText = descriptionDiv.getAttribute('data-truncated-text');
    
    if (!fullText) return;

    const isExpanded = descriptionDiv.classList.contains('expanded');

    if (isExpanded) {
      // Collapse
      
      // 1. Set explicit height to current scroll height so transition has a starting point
      descriptionDiv.style.maxHeight = descriptionDiv.scrollHeight + 'px';
      
      // 2. Force reflow to ensure the browser registers the fixed height
      descriptionDiv.offsetHeight;
      
      // 3. Remove expanded class (this handles margin-bottom transition via CSS)
      descriptionDiv.classList.remove('expanded');
      
      // 4. Animate to collapsed height
      descriptionDiv.style.maxHeight = '4em';
      
      // Delay innerHTML swap until transition is done (matches CSS 0.8s)
      setTimeout(() => {
        if (!descriptionDiv.classList.contains('expanded')) {
          descriptionDiv.innerHTML = `${this.escapeHtml(truncatedText)}<span class="expand-link" onclick="window.ActivityManager.expandDescription(this); event.stopPropagation();">EXPAND</span>`;
          // Reset style after swap
          descriptionDiv.style.maxHeight = '';
        }
      }, 800);
    } else {
      // Expand
      descriptionDiv.classList.add('expanded');
      descriptionDiv.innerHTML = `${this.escapeHtml(fullText)}<span class="collapse-link" onclick="window.ActivityManager.expandDescription(this); event.stopPropagation();">COLLAPSE</span>`;
      
      // Measure and set specific height for smooth transition
      const scrollHeight = descriptionDiv.scrollHeight;
      descriptionDiv.style.maxHeight = scrollHeight + 'px';
      
      // Optional: Reset to large value after transition to handle potential content changes
      setTimeout(() => {
        if (descriptionDiv.classList.contains('expanded')) {
          descriptionDiv.style.maxHeight = '2000px';
        }
      }, 800);
    }
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Get activity icon SVG for the given type
   */
  getActivityIcon(type) {
    const icons = {
      call: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>`,
      email: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>`,
      note: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>`,
      sequence: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="7 4 20 12 7 20 7 4"></polygon>
      </svg>`,
      task: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9,11 12,14 22,4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>`,
      download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>`
    };

    return icons[type] || icons.note; // Default to note icon if type not found
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }


  /**
   * Force refresh activities (invalidate relevant caches)
   */
  async forceRefresh(containerId, entityType = 'global', entityId = null) {
    // Invalidate relevant caches based on entity type
    if (window.CacheManager) {
      if (entityType === 'contact') {
        window.CacheManager.invalidate('contacts');
      } else if (entityType === 'account') {
        window.CacheManager.invalidate('accounts');
      } else if (entityType === 'task') {
        window.CacheManager.invalidate('tasks');
      } else {
        // For global or unknown types, invalidate all activity-related caches
        window.CacheManager.invalidate('contacts');
        window.CacheManager.invalidate('accounts');
        window.CacheManager.invalidate('calls');
        window.CacheManager.invalidate('tasks');
        window.CacheManager.invalidate('sequences');
        window.CacheManager.invalidate('emails');
      }
    }
    await this.renderActivities(containerId, entityType, entityId);
  }

  handleActivityClick(activityId, navigationType, navigationTarget) {
    try {
      let activity = null;
      const allActivities = this.processedActivitiesCache.get('global-global') || [];
      activity = allActivities.find(a => a.id === activityId);

      if (!activity && navigationType === 'email') {
        const emailId = activityId.replace(/^email-/, '');
        activity = this.processedEmailsCache.get(emailId);
      }

      if (activity && activity.data) {
        this.primeCacheAndNavigate(navigationType, navigationTarget, activity.data);
      } else {
        this.navigateToDetail(navigationType, navigationTarget);
      }
    } catch (error) {
      console.error('[ActivityManager] Error in handleActivityClick:', error);
      this.navigateToDetail(navigationType, navigationTarget);
    }
  }

  inferEmailNavigationSource() {
    const scroll = (() => {
      try { return window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0; } catch (_) { return 0; }
    })();

    let inferred = null;

    const taskId = window.TaskDetail?.state?.currentTask?.id || null;
    const contactId = window.ContactDetail?.state?.currentContact?.id || null;
    const accountId = window.AccountDetail?.state?.currentAccount?.id || null;
    const crmPage = window.crm?.currentPage || '';

    const isActivePage = (id) => {
      try {
        const page = document.getElementById(id);
        return !!(page && page.classList && page.classList.contains('active') && !page.hidden);
      } catch (_) {
        return false;
      }
    };

    const contactPageActive = isActivePage('contact-detail-page');
    const taskPageActive = isActivePage('task-detail-page');
    const accountPageActive = isActivePage('account-details-page');

    if (contactPageActive && contactId) {
      inferred = 'contact-detail';
      window._emailNavigationSource = 'contact-detail';
      window._emailNavigationContactId = contactId;
      window._emailNavigationContactScroll = scroll;
    } else if (taskPageActive && taskId) {
      inferred = 'task-detail';
      window._emailNavigationSource = 'task-detail';
      window._emailNavigationTaskId = taskId;
      window._emailNavigationTaskScroll = scroll;
    } else if (accountPageActive && accountId) {
      inferred = 'account-detail';
      window._emailNavigationSource = 'account-detail';
      window._emailNavigationAccountId = accountId;
      window._emailNavigationAccountScroll = scroll;
    } else if (crmPage === 'people') {
      inferred = 'people';
      window._emailNavigationSource = 'people';
    } else if (crmPage === 'dashboard' || crmPage === 'home') {
      inferred = 'home';
      window._emailNavigationSource = 'home';
    } else if (contactId) {
      inferred = 'contact-detail';
      window._emailNavigationSource = 'contact-detail';
      window._emailNavigationContactId = contactId;
      window._emailNavigationContactScroll = scroll;
    } else if (accountId) {
      inferred = 'account-detail';
      window._emailNavigationSource = 'account-detail';
      window._emailNavigationAccountId = accountId;
      window._emailNavigationAccountScroll = scroll;
    } else if (taskId) {
      inferred = 'task-detail';
      window._emailNavigationSource = 'task-detail';
      window._emailNavigationTaskId = taskId;
      window._emailNavigationTaskScroll = scroll;
    }

    return inferred;
  }

  primeCacheAndNavigate(entityType, entityId, data) {
    if (entityType === 'email') {
      this.inferEmailNavigationSource();
      if (!window.emailCache) window.emailCache = new Map();
      if (data) {
        window.emailCache.set(entityId, data);
      }
    } else if (entityType === 'contact') {
      if (data) {
        window._prefetchedContactForDetail = data;
      }
    } else if (entityType === 'account') {
      if (data) {
        window._prefetchedAccountForDetail = data;
      }
    } else if (entityType === 'task') {
      if (data) {
        if (!window._essentialTasksData) window._essentialTasksData = [];
        window._essentialTasksData = window._essentialTasksData.filter(t => t.id !== entityId);
        window._essentialTasksData.push(data);
      }
    }

    this.navigateToDetail(entityType, entityId);
  }

  /**
   * Get contact data for navigation (prefetching mechanism)
   */
  getContactDataForNavigation(contactId) {
    try {
      // First try to find in people data cache
      if (window.getPeopleData) {
        const peopleData = window.getPeopleData() || [];
        const contact = peopleData.find(c => c.id === contactId);
        if (contact) {
          return contact;
        }
      }

      // If not found in cache, try to find in the activity data we already have
      // This handles cases where the contact ID doesn't match between Firebase and localStorage
      const allActivities = this.processedActivitiesCache.get('global-global') || [];

      for (const activity of allActivities) {
        if (activity.type === 'note' &&
          activity.data &&
          activity.data.entityType === 'contact' &&
          activity.data.id === contactId) {
          return activity.data;
        }
      }

      return null;
    } catch (error) {
      console.error('[ActivityManager] Error getting contact data for navigation:', error);
      return null;
    }
  }

  /**
   * Navigate to detail page from activity
   */
  navigateToDetail(entityType, entityId) {
    // Store navigation source for back button restoration
    this.storeNavigationSource();

    // Navigate to the appropriate detail page
    if (entityType === 'contact') {
      // Prefetch contact data before navigation (like account logic in main.js)
      const contactData = this.getContactDataForNavigation(entityId);
      if (contactData) {
        window._prefetchedContactForDetail = contactData;
      }

      // Navigate to people page first, then show contact detail (required for ContactDetail)
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        window.crm.navigateToPage('people');
      }
      requestAnimationFrame(() => {
        if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
          window.ContactDetail.show(entityId);
        } else {
          // Retry with longer timeout if ContactDetail not ready
          setTimeout(() => {
            if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
              window.ContactDetail.show(entityId);
            }
          }, 200);
        }
      });
    } else if (entityType === 'account') {
      // Navigate to account detail
      if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
        window.AccountDetail.show(entityId);
      } else {
        // Fallback: navigate to accounts page and trigger account detail
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('accounts');
        }
        setTimeout(() => {
          if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
            window.AccountDetail.show(entityId);
          }
        }, 100);
      }
    } else if (entityType === 'email') {
      // Navigate to email detail
      if (window.crm && typeof window.crm.navigateToPage === 'function') {
        this.inferEmailNavigationSource();
        window.crm.navigateToPage('email-detail', { emailId: entityId });
      }
    } else if (entityType === 'task') {
      if (window.TaskDetail && typeof window.TaskDetail.open === 'function') {
        window.TaskDetail.open(entityId, 'dashboard');
      } else {
        if (window.crm && typeof window.crm.navigateToPage === 'function') {
          window.crm.navigateToPage('task-detail');
        }
        setTimeout(() => {
          if (window.TaskDetail && typeof window.TaskDetail.open === 'function') {
            window.TaskDetail.open(entityId, 'dashboard');
          }
        }, 100);
      }
    }
  }

  /**
   * Update pagination controls
   */
  updatePagination(containerId, totalPages) {

    const paginationContainer = document.getElementById(containerId.replace('-timeline', '-pagination'));
    if (!paginationContainer) return;


    if (totalPages <= 1) {
      // Hide pagination if only one page
      paginationContainer.style.display = 'none';
      return;
    }

    // Show pagination
    paginationContainer.style.display = 'flex';

    // Update pagination page button
    const pageButton = paginationContainer.querySelector('#home-activity-page');
    if (pageButton) {
      pageButton.textContent = this.currentPage + 1;
      pageButton.classList.toggle('active', true);
    }

    // Update button states
    const prevButton = paginationContainer.querySelector('.activity-pagination-btn:first-child');
    const nextButton = paginationContainer.querySelector('.activity-pagination-btn:last-child');

    if (prevButton) {
      prevButton.disabled = this.currentPage === 0;
    }

    if (nextButton) {
      nextButton.disabled = this.currentPage >= totalPages - 1;
    }

    // Attach event listeners
    this.attachPaginationEvents(containerId);
  }

  /**
   * Attach pagination event listeners
   */
  attachPaginationEvents(containerId) {
    const paginationContainer = document.getElementById(containerId.replace('-timeline', '-pagination'));
    if (!paginationContainer) return;

    // Remove existing listeners to prevent duplicates
    const prevButton = paginationContainer.querySelector('.activity-pagination-btn:first-child');
    const nextButton = paginationContainer.querySelector('.activity-pagination-btn:last-child');

    if (prevButton) {
      prevButton.onclick = null; // Clear existing
      prevButton.onclick = () => {
        this.previousPage(containerId, 'global', null);
      };
    }

    if (nextButton) {
      nextButton.onclick = null; // Clear existing
      nextButton.onclick = () => {
        this.nextPage(containerId, 'global', null);
      };
    }
  }

  /**
   * Store navigation source for back button restoration
   */
  storeNavigationSource() {
    try {
      const currentPage = window.crm?.currentPage || '';
      const activePage = document.querySelector('.page.active');
      const pageId = activePage?.id || activePage?.getAttribute('data-page') || '';

      // Determine actual current page
      const source = currentPage || pageId.replace('-page', '') || 'dashboard';

      // For task-detail, store additional context
      if (source === 'task-detail' && window.__taskDetailRestoreData) {
        window._contactNavigationSource = 'task-detail';
        window._accountNavigationSource = 'task-detail';
      }

      // For dashboard, store current pagination state
      if (source === 'dashboard') {
        window._dashboardNavigationSource = 'activities';
        window._dashboardReturn = {
          page: this.currentPage,
          scroll: window.scrollY,
          containerId: 'home-activity-timeline'
        };
      }
    } catch (error) {
      console.error('[ActivityManager] Error storing navigation source:', error);
    }
  }

}

// Expose a single global instance (singleton) so other modules don't construct new instances
if (!window.ActivityManager || !(window.ActivityManager instanceof ActivityManager)) {
  window.ActivityManager = new ActivityManager();
}
