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
  
  async function loadFromAPI() {
    try {
      console.log('[BackgroundCallsLoader] Loading from API...');
      const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
      const url = `${base}/api/calls?limit=1000`; // Load more at once for better performance
      
      const response = await fetch(url);
      if (!response.ok) {
        console.warn('[BackgroundCallsLoader] API request failed:', response.status);
        return;
      }
      
      const data = await response.json();
      
      if (data.ok && Array.isArray(data.calls) && data.calls.length > 0) {
        callsData = data.calls;
        console.log('[BackgroundCallsLoader] ✓ Loaded', callsData.length, 'calls from API');
        
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
  
  // Export public API (same pattern as contacts/accounts)
  window.BackgroundCallsLoader = {
    getCallsData: () => callsData,
    reload: loadFromAPI,
    getCount: () => callsData.length
  };
  
  console.log('[BackgroundCallsLoader] Module initialized');
})();

