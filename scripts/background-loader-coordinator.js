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
      // #region agent log - Hypothesis C: Loading already in progress
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sessionId: 'cache-debug-session',
          runId: 'initial-run',
          hypothesisId: 'C',
          location: 'background-loader-coordinator.js:coordinateLoading',
          message: 'Loading already in progress - returning existing promise',
          data: { activeLoads: Array.from(this.loadingPromises.keys()) },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

      console.log('[Coordinator] Loading already in progress, waiting...');
      // Wait for existing loading to complete
      await Promise.all(Array.from(this.loadingPromises.values()));
      return;
    }

    this.loading = true;
    this.loadStartTime = Date.now();
    console.log('[Coordinator] Starting coordinated background loading...');

    // #region agent log - Hypothesis C: Starting coordinated loading
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        sessionId: 'cache-debug-session',
        runId: 'initial-run',
        hypothesisId: 'C',
        location: 'background-loader-coordinator.js:coordinateLoading',
        message: 'Starting coordinated background loading',
        data: { loadingOrder: this.loadingOrder },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion

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

      // #region agent log - Hypothesis C: Loading completed
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sessionId: 'cache-debug-session',
          runId: 'initial-run',
          hypothesisId: 'C',
          location: 'background-loader-coordinator.js:coordinateLoading',
          message: 'Coordinated loading completed',
          data: {
            totalTime,
            loadStats: Object.fromEntries(this.loadStats),
            loadedCollections: Array.from(this.loadedCollections)
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

    } catch (error) {
      console.error('[Coordinator] Error during coordinated loading:', error);

      // #region agent log - Hypothesis C: Loading failed
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sessionId: 'cache-debug-session',
          runId: 'initial-run',
          hypothesisId: 'C',
          location: 'background-loader-coordinator.js:coordinateLoading',
          message: 'Coordinated loading failed',
          data: { error: error.message, stack: error.stack },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

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
      // #region agent log - Hypothesis C: Collection already loading/loaded
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sessionId: 'cache-debug-session',
          runId: 'initial-run',
          hypothesisId: 'C',
          location: 'background-loader-coordinator.js:loadCollection',
          message: 'Collection already loading or loaded - skipping',
          data: { collection, alreadyLoaded: this.loadedCollections.has(collection), alreadyLoading: this.loadingPromises.has(collection) },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

      return this.loadingPromises.get(collection);
    }

    console.log(`[Coordinator] Loading ${collection}...`);

    // #region agent log - Hypothesis C: Starting collection load
    fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        sessionId: 'cache-debug-session',
        runId: 'initial-run',
        hypothesisId: 'C',
        location: 'background-loader-coordinator.js:loadCollection',
        message: 'Starting collection load',
        data: { collection },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion

    const loadPromise = this._performLoad(collection);
    this.loadingPromises.set(collection, loadPromise);

    try {
      await loadPromise;
      this.loadedCollections.add(collection);
      console.log(`[Coordinator] ✓ ${collection} loaded successfully`);

      // #region agent log - Hypothesis C: Collection loaded successfully
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sessionId: 'cache-debug-session',
          runId: 'initial-run',
          hypothesisId: 'C',
          location: 'background-loader-coordinator.js:loadCollection',
          message: 'Collection loaded successfully',
          data: { collection },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

    } catch (error) {
      console.error(`[Coordinator] Failed to load ${collection}:`, error);

      // #region agent log - Hypothesis C: Collection load failed
      fetch('http://127.0.0.1:7242/ingest/4284a946-be5e-44ea-bda2-f1146ae8caca', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sessionId: 'cache-debug-session',
          runId: 'initial-run',
          hypothesisId: 'C',
          location: 'background-loader-coordinator.js:loadCollection',
          message: 'Collection load failed',
          data: { collection, error: error.message },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

    } finally {
      this.loadingPromises.delete(collection);
    }
  }

  /**
   * Internal load implementation
   */
  async _performLoad(collection) {
    if (!window.CacheManager) {
      throw new Error('CacheManager not available');
    }

    // Use CacheManager.get() which now has deduplication built-in
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
