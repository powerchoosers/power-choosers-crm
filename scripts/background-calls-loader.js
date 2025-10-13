/**
 * Background Calls Loader
 * 
 * Loads calls data progressively in the background after dashboard initialization
 * to enable "No Calls" badges on People/Accounts pages without requiring user
 * to visit the Calls page first.
 * 
 * Features:
 * - Non-blocking progressive loading in batches
 * - Starts 2.5 seconds after dashboard ready
 * - Updates badge system after each batch
 * - Graceful error handling
 */

(function() {
  let isLoading = false;
  let loadedCount = 0;
  let callsData = []; // Store calls for badge system
  
  async function loadCallsInBackground() {
    if (isLoading) {
      console.log('[BackgroundCallsLoader] Already loading, skipping duplicate request');
      return;
    }
    
    isLoading = true;
    console.log('[BackgroundCallsLoader] Starting background load...');
    
    const batchSize = 150;
    let offset = 0;
    let hasMore = true;
    let batchCount = 0;
    
    try {
      while (hasMore) {
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
        const url = `${base}/api/calls?limit=${batchSize}&offset=${offset}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.warn('[BackgroundCallsLoader] API request failed:', response.status);
          break;
        }
        
        const data = await response.json();
        
        if (data.ok && Array.isArray(data.calls) && data.calls.length > 0) {
          // Append directly to callsData to avoid duplicate arrays
          callsData = [...callsData, ...data.calls];
          offset += batchSize;
          batchCount++;
          
          // Update calls module if it's loaded
          if (window.callsModule && typeof window.callsModule.updateCallsData === 'function') {
            window.callsModule.updateCallsData(callsData);
          }
          
          // Notify badge system
          try {
            document.dispatchEvent(new CustomEvent('pc:calls-loaded', { 
              detail: { count: callsData.length, partial: true, batch: batchCount } 
            }));
          } catch (e) {
            console.warn('[BackgroundCallsLoader] Failed to dispatch event:', e);
          }
          
          console.log(`[BackgroundCallsLoader] Loaded batch ${batchCount}: ${callsData.length} total calls`);
          
          // Check if there are more calls to load
          hasMore = data.hasMore && data.calls.length === batchSize;
          
          // Small delay between batches to keep UI responsive
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } else {
          // No more calls or empty response
          hasMore = false;
          
          if (!data.ok) {
            console.log('[BackgroundCallsLoader] API returned not OK:', data);
          }
        }
      }
      
      console.log(`[BackgroundCallsLoader] ✓ Complete: ${callsData.length} calls loaded in ${batchCount} batches`);
      loadedCount = callsData.length;
      
      // Final notification
      try {
        document.dispatchEvent(new CustomEvent('pc:calls-loaded', { 
          detail: { count: callsData.length, partial: false, complete: true } 
        }));
      } catch (e) {
        console.warn('[BackgroundCallsLoader] Failed to dispatch completion event:', e);
      }
      
      // Cache the loaded data for future loads
      if (window.CacheManager && typeof window.CacheManager.set === 'function' && callsData.length > 0) {
        try {
          await window.CacheManager.set('calls-raw', callsData);
          console.log('[BackgroundCallsLoader] Cached', callsData.length, 'calls for future loads');
        } catch (cacheError) {
          console.warn('[BackgroundCallsLoader] Failed to cache calls:', cacheError);
        }
      }
      
    } catch (error) {
      console.warn('[BackgroundCallsLoader] Error during background loading:', error);
    } finally {
      isLoading = false;
    }
  }
  
  // Export public API
  window.BackgroundCallsLoader = {
    start: loadCallsInBackground,
    isLoading: () => isLoading,
    getLoadedCount: () => loadedCount,
    getCallsData: () => callsData // For badge system
  };
  
  console.log('[BackgroundCallsLoader] Module initialized');
  
  // Try to load from cache immediately for instant badge access
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('calls-raw');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          callsData = cached;
          console.log('[BackgroundCallsLoader] Loaded', cached.length, 'calls from cache');
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:calls-loaded', { 
            detail: { count: cached.length, partial: false, cached: true } 
          }));
        }
      } catch (e) {
        console.warn('[BackgroundCallsLoader] Cache load failed:', e);
      }
    }
  })();
})();

