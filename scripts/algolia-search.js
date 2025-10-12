// Power Choosers CRM - Algolia Search Helper
// Provides instant search capabilities for contacts and accounts

class AlgoliaSearchHelper {
  constructor() {
    this.client = null;
    this.indices = {};
    this.isInitialized = false;
    this.init();
  }

  init() {
    // Check if Algolia library is loaded
    if (typeof algoliasearch === 'undefined') {
      console.warn('[Algolia] Library not loaded yet, will retry...');
      // Retry after a short delay
      setTimeout(() => this.init(), 500);
      return;
    }

    if (!window.ALGOLIA_CONFIG) {
      console.warn('[Algolia] Configuration not found');
      return;
    }

    try {
      const { appId, searchApiKey, indices } = window.ALGOLIA_CONFIG;
      
      // Initialize Algolia client
      this.client = algoliasearch(appId, searchApiKey);
      
      // Initialize indices
      this.indices.contacts = this.client.initIndex(indices.contacts);
      this.indices.accounts = this.client.initIndex(indices.accounts);
      
      this.isInitialized = true;
      console.log('[Algolia] Search helper initialized successfully');
    } catch (error) {
      console.error('[Algolia] Failed to initialize:', error);
    }
  }

  /**
   * Search contacts with Algolia
   * @param {string} query - Search query
   * @param {object} options - Search options (limit, page, filters)
   * @returns {Promise<object>} Search results
   */
  async searchContacts(query, options = {}) {
    if (!this.isInitialized || !this.indices.contacts) {
      console.warn('[Algolia] Contacts index not initialized');
      return { hits: [], nbHits: 0, nbPages: 0 };
    }
    
    try {
      const searchOptions = {
        hitsPerPage: options.limit || 100,
        page: options.page || 0,
        attributesToRetrieve: options.fields || ['*'],
        ...options
      };

      const results = await this.indices.contacts.search(query, searchOptions);
      
      console.log('[Algolia] Contacts search:', query, '→', results.nbHits, 'results');
      return results;
    } catch (error) {
      console.error('[Algolia] Search contacts failed:', error);
      return { hits: [], nbHits: 0, nbPages: 0 };
    }
  }

  /**
   * Search accounts with Algolia
   * @param {string} query - Search query
   * @param {object} options - Search options (limit, page, filters)
   * @returns {Promise<object>} Search results
   */
  async searchAccounts(query, options = {}) {
    if (!this.isInitialized || !this.indices.accounts) {
      console.warn('[Algolia] Accounts index not initialized');
      return { hits: [], nbHits: 0, nbPages: 0 };
    }
    
    try {
      const searchOptions = {
        hitsPerPage: options.limit || 100,
        page: options.page || 0,
        attributesToRetrieve: options.fields || ['*'],
        ...options
      };

      const results = await this.indices.accounts.search(query, searchOptions);
      
      console.log('[Algolia] Accounts search:', query, '→', results.nbHits, 'results');
      return results;
    } catch (error) {
      console.error('[Algolia] Search accounts failed:', error);
      return { hits: [], nbHits: 0, nbPages: 0 };
    }
  }

  /**
   * Check if Algolia is available and ready
   * @returns {boolean}
   */
  isAvailable() {
    return this.isInitialized && this.client !== null;
  }
}

// Initialize global Algolia search helper
if (typeof window !== 'undefined') {
  window.AlgoliaSearch = new AlgoliaSearchHelper();
  console.log('[Algolia] Global search helper created');
}

