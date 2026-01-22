// Power Choosers CRM - Badge Data Loader
// Lightweight loader for "No Calls" badges on People and Accounts pages
// Uses efficient call-status API instead of loading all calls

class BadgeLoader {
  constructor() {
    this.cacheKey = 'badge-status-cache';
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.statusCache = new Map(); // In-memory cache for call status
  }

  /**
   * Get call status for phones, account IDs, and contact IDs
   * Uses the efficient call-status API with Firestore queries
   */
  async getCallStatus(phones = [], accountIds = [], contactIds = []) {
    try {
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      
      // Use POST for large requests to avoid URL length limits
      const totalItems = phones.length + accountIds.length + contactIds.length;
      const usePost = totalItems > 50; // Use POST if more than 50 items
      
      let response;
      
      if (usePost) {
        // Use POST with JSON body for large requests
        let headers = { 'Content-Type': 'application/json' };
        try {
          const user = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
          if (user) {
            const token = await user.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
          }
        } catch(_) {}
        response = await fetch(`${base}/api/call-status`, {
          method: 'POST',
          headers,
          credentials: 'include', // Include cookies for authentication
          body: JSON.stringify({
            phones: phones,
            accountIds: accountIds,
            contactIds: contactIds
          })
        });
      } else {
        // Use GET with query parameters for small requests
        const params = new URLSearchParams();
        
        if (phones.length) params.append('phones', phones.join(','));
        if (accountIds.length) params.append('accountIds', accountIds.join(','));
        if (contactIds.length) params.append('contactIds', contactIds.join(','));
        
        const url = `${base}/api/call-status?${params}`;
        let headers = {};
        try {
          const user = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
          if (user) {
            const token = await user.getIdToken();
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
          }
        } catch(err) {
          console.warn('[BadgeLoader] Failed to get auth token:', err);
        }
        
        // If no token, skip the request rather than getting 401
        if (!headers['Authorization']) {
          console.warn('[BadgeLoader] No auth token available, skipping call status check');
          return {};
        }
        
        response = await fetch(url, { 
          headers,
          credentials: 'include' // Include cookies for authentication
        });
      }
      
      if (response.ok) {
        const result = await response.json();
        
        // Cache the results
        Object.entries(result).forEach(([key, value]) => {
          this.statusCache.set(key, value);
        });
        
        return result;
      }
      return {};
    } catch (error) {
      console.error('[BadgeLoader] Failed to get call status:', error);
      return {};
    }
  }

  /**
   * Invalidate call status cache (call this when new calls arrive)
   */
  async invalidate() {
    this.statusCache.clear();
    if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
      await window.CacheManager.invalidate(this.cacheKey);
      // console.log('[BadgeLoader] Call status cache invalidated');
    }
  }

  /**
   * Check if a specific phone/account/contact has calls
   */
  hasCalls(key) {
    return this.statusCache.get(key) === true;
  }
}

// Initialize global badge loader
if (typeof window !== 'undefined') {
  window.BadgeLoader = new BadgeLoader();
  // console.log('[BadgeLoader] Global badge loader initialized');
}

