/**
 * Background Loader Coordinator
 * Prevents multiple simultaneous cache loads and coordinates loading order
 * Ensures critical dependencies are loaded first (contacts before emails)
 */

class BackgroundLoaderCoordinator {
  constructor() {
    this.loadingPromises = new Map();
    this.loadedCollections = new Set();
    this.loading = false;
    this.loadStartTime = null;

    // Critical loading order: contacts before emails (emails depend on contacts for filtering)
    this.loadingOrder = [
      'contacts',      // Load first - emails depend on this
      'accounts',      // Load second - many things depend on this
      'calls',         // Load third - independent
      'emails',        // Load fourth - depends on contacts
      'tasks',         // Load fifth - independent
      'sequences',     // Load sixth - independent
      'lists'          // Load last - independent
    ];

    // Track loading performance
    this.loadStats = new Map();
  }

  /**
   * Coordinate all background loading with proper sequencing
   */
  async coordinateLoading() {
    if (this.loading) {
      console.log('[Coordinator] Loading already in progress, waiting...');
      // Wait for existing loading to complete
      await Promise.all(Array.from(this.loadingPromises.values()));
      return;
    }

    this.loading = true;
    this.loadStartTime = Date.now();
    console.log('[Coordinator] Starting coordinated background loading...');
    try {
      // Load collections in priority order
      for (const collection of this.loadingOrder) {
        const startTime = Date.now();
        await this.loadCollection(collection);
        const loadTime = Date.now() - startTime;
        this.loadStats.set(collection, loadTime);
      }

      const totalTime = Date.now() - this.loadStartTime;
      console.log(`[Coordinator] ✓ All background loading completed in ${totalTime}ms`);
    } catch (error) {
      console.error('[Coordinator] Error during coordinated loading:', error);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Load a specific collection with deduplication
   */
  async loadCollection(collection) {
    // Skip if already loaded or loading
    if (this.loadedCollections.has(collection) || this.loadingPromises.has(collection)) {
      return this.loadingPromises.get(collection);
    }

    console.log(`[Coordinator] Loading ${collection}...`);
    const loadPromise = this._performLoad(collection);
    this.loadingPromises.set(collection, loadPromise);

    try {
      await loadPromise;
      this.loadedCollections.add(collection);
      console.log(`[Coordinator] ✓ ${collection} loaded successfully`);
    } catch (error) {
      console.error(`[Coordinator] Failed to load ${collection}:`, error);
    } finally {
      this.loadingPromises.delete(collection);
    }
  }

  /**
   * Internal load implementation
   */
  async _performLoad(collection) {
    // COORDINATION: Use specialized background loaders if available, otherwise fall back to CacheManager
    const loaders = {
      'contacts': 'BackgroundContactsLoader',
      'accounts': 'BackgroundAccountsLoader',
      'calls': 'BackgroundCallsLoader',
      'emails': 'BackgroundEmailsLoader',
      'tasks': 'BackgroundTasksLoader',
      'sequences': 'BackgroundSequencesLoader',
      'lists': 'BackgroundListsLoader'
    };

    const loaderName = loaders[collection];
    if (loaderName && window[loaderName]) {
      const loader = window[loaderName];
      if (typeof loader.reload === 'function') {
        // console.log(`[Coordinator] Delegating ${collection} load to ${loaderName}`);
        await loader.reload();
        if (typeof loader.getContactsData === 'function' && collection === 'contacts') return loader.getContactsData();
        if (typeof loader.getAccountsData === 'function' && collection === 'accounts') return loader.getAccountsData();
        if (typeof loader.getCallsData === 'function' && collection === 'calls') return loader.getCallsData();
        if (typeof loader.getEmailsData === 'function' && collection === 'emails') return loader.getEmailsData();
        if (typeof loader.getTasksData === 'function' && collection === 'tasks') return loader.getTasksData();
        if (typeof loader.getSequencesData === 'function' && collection === 'sequences') return loader.getSequencesData();
        if (typeof loader.getListsData === 'function' && collection === 'lists') return loader.getListsData();
      }
    }

    if (!window.CacheManager) {
      throw new Error('CacheManager not available');
    }

    // Fallback to direct CacheManager access
    return await window.CacheManager.get(collection);
  }

  /**
   * Force refresh a specific collection
   */
  async refreshCollection(collection) {
    console.log(`[Coordinator] Force refreshing ${collection}...`);

    if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
      await window.CacheManager.invalidate(collection);
    }

    this.loadedCollections.delete(collection);
    return this.loadCollection(collection);
  }

  /**
   * Check if a collection is loaded
   */
  isLoaded(collection) {
    return this.loadedCollections.has(collection);
  }

  /**
   * Get loading status for debugging
   */
  getStatus() {
    return {
      loading: this.loading,
      loadedCollections: Array.from(this.loadedCollections),
      activeLoads: Array.from(this.loadingPromises.keys()),
      loadStats: Object.fromEntries(this.loadStats),
      totalLoadTime: this.loadStartTime ? Date.now() - this.loadStartTime : null
    };
  }
}

// Initialize global coordinator
if (typeof window !== 'undefined') {
  window.BackgroundLoaderCoordinator = new BackgroundLoaderCoordinator();
  console.log('[Coordinator] Background loader coordinator initialized');
}


