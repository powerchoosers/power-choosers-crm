/**
 * Background Calls Loader
 * 
 * Loads calls data immediately from cache (or API if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero API calls after first visit)
 * - Global data availability via window.BackgroundCallsLoader
 * - Event notifications when data is ready
 * - Automatic fallback to API if cache is empty
 * - Works exactly like contacts/accounts loaders for consistency
 */

(function() {
  let callsData = [];
  let callStatusCache = new Map(); // Cache for call status lookups
  let lastLoadedOffset = 0; // Track pagination offset
  let hasMoreData = true; // Track if more data is available
  
  async function loadFromAPI() {
    try {
      console.log('[BackgroundCallsLoader] Loading from API...');
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const url = `${base}/api/calls?limit=100`; // Load 100 calls for efficiency
      // Attach ID token for secured endpoints
      let headers = {};
      try {
        const user = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
        if (user) {
          const token = await user.getIdToken();
          headers = { 'Authorization': `Bearer ${token}` };
        }
      } catch(_) {}
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.warn('[BackgroundCallsLoader] API request failed:', response.status);
        return;
      }
      
      const data = await response.json();
      
      if (data.ok && Array.isArray(data.calls) && data.calls.length > 0) {
        callsData = data.calls;
        lastLoadedOffset = data.calls.length;
        hasMoreData = data.calls.length === 100; // If we got less than 100, no more data
        console.log('[BackgroundCallsLoader] ✓ Loaded', callsData.length, 'calls from API', hasMoreData ? '(more available)' : '(all loaded)');
        
        // Save to cache for future sessions (use standard 'calls' key)
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('calls', callsData);
          console.log('[BackgroundCallsLoader] ✓ Cached', callsData.length, 'calls');
        }
        
        // Notify other modules
        document.dispatchEvent(new CustomEvent('pc:calls-loaded', { 
          detail: { count: callsData.length, fromAPI: true } 
        }));
      } else {
        console.log('[BackgroundCallsLoader] No calls data from API:', data);
      }
    } catch (error) {
      console.error('[BackgroundCallsLoader] Failed to load from API:', error);
    }
  }
  
  // Load from cache immediately on module init (like contacts/accounts)
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('calls');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          callsData = cached;
          console.log('[BackgroundCallsLoader] ✓ Loaded', cached.length, 'calls from cache');
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:calls-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from API
          console.log('[BackgroundCallsLoader] Cache empty, loading from API');
          await loadFromAPI();
        }
      } catch (e) {
        console.warn('[BackgroundCallsLoader] Cache load failed:', e);
        await loadFromAPI();
      }
    } else {
      console.warn('[BackgroundCallsLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('calls');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            callsData = cached;
            console.log('[BackgroundCallsLoader] ✓ Loaded', cached.length, 'calls from cache (delayed)');
            document.dispatchEvent(new CustomEvent('pc:calls-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));
          } else {
            await loadFromAPI();
          }
        }
      }, 500);
    }
  })();
  
  // Load more calls (pagination)
  async function loadMoreCalls() {
    if (!hasMoreData) {
      console.log('[BackgroundCallsLoader] No more data to load');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      console.log('[BackgroundCallsLoader] Loading next batch...');
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const url = `${base}/api/calls?limit=100&offset=${lastLoadedOffset}`;
      // Attach ID token for secured endpoints
      let headers = {};
      try {
        const user = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
        if (user) {
          const token = await user.getIdToken();
          headers = { 'Authorization': `Bearer ${token}` };
        }
      } catch(_) {}
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.warn('[BackgroundCallsLoader] API request failed:', response.status);
        return { loaded: 0, hasMore: false };
      }
      
      const data = await response.json();
      
      if (data.ok && Array.isArray(data.calls) && data.calls.length > 0) {
        // Append to existing data
        callsData = [...callsData, ...data.calls];
        lastLoadedOffset += data.calls.length;
        hasMoreData = data.calls.length === 100;
        
        console.log('[BackgroundCallsLoader] ✓ Loaded', data.calls.length, 'more calls. Total:', callsData.length, hasMoreData ? '(more available)' : '(all loaded)');
        
        // Update cache
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('calls', callsData);
        }
        
        // Notify listeners
        document.dispatchEvent(new CustomEvent('pc:calls-loaded-more', { 
          detail: { count: data.calls.length, total: callsData.length, hasMore: hasMoreData } 
        }));
        
        return { loaded: data.calls.length, hasMore: hasMoreData };
      } else {
        hasMoreData = false;
        return { loaded: 0, hasMore: false };
      }
    } catch (error) {
      console.error('[BackgroundCallsLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // Get call status for phones, account IDs, and contact IDs
  async function getCallStatus(phones = [], accountIds = [], contactIds = []) {
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
            headers['Authorization'] = `Bearer ${token}`;
          }
        } catch(_) {}
        response = await fetch(url, { headers });
      }
      
      if (response.ok) {
        const result = await response.json();
        
        // Cache the results
        Object.entries(result).forEach(([key, value]) => {
          callStatusCache.set(key, value);
        });
        
        return result;
      }
      return {};
    } catch (error) {
      console.error('[BackgroundCallsLoader] Failed to get call status:', error);
      return {};
    }
  }
  
  // Invalidate cache entries for specific keys
  function invalidateCallStatusCache(keys) {
    keys.forEach(key => {
      callStatusCache.delete(key);
    });
  }
  
  // Listen for call completion to invalidate cache
  document.addEventListener('pc:call-logged', (event) => {
    const { targetPhone, accountId, contactId } = event.detail || {};
    const keysToInvalidate = [];
    
    if (targetPhone) {
      const normalizedPhone = String(targetPhone).replace(/\D/g, '').slice(-10);
      if (normalizedPhone.length === 10) {
        keysToInvalidate.push(normalizedPhone);
      }
    }
    if (accountId) keysToInvalidate.push(accountId);
    if (contactId) keysToInvalidate.push(contactId);
    
    if (keysToInvalidate.length > 0) {
      invalidateCallStatusCache(keysToInvalidate);
      console.log('[BackgroundCallsLoader] Invalidated cache for:', keysToInvalidate);
    }
  });
  
  // Export public API (same pattern as contacts/accounts)
  window.BackgroundCallsLoader = {
    getCallsData: () => callsData,
    reload: loadFromAPI,
    loadMore: loadMoreCalls,
    hasMore: () => hasMoreData,
    getCount: () => callsData.length,
    getCallStatus: getCallStatus,
    invalidateCache: invalidateCallStatusCache
  };
  
  console.log('[BackgroundCallsLoader] Module initialized');
})();

