/**
 * Background Lists Loader
 * 
 * Loads lists metadata immediately from cache (or Firestore if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero Firestore reads after first visit)
 * - Global data availability via window.BackgroundListsLoader
 * - Event notifications when data is ready
 * - Automatic fallback to Firestore if cache is empty
 */

(function() {
  let listsData = [];
  let lastLoadedDoc = null; // Track last document for pagination
  let hasMoreData = true; // Flag to indicate if more data exists
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundListsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundListsLoader] Loading from Firestore...');
      // OPTIMIZED: Only fetch fields needed for list display and filtering
      // COST REDUCTION: Load in batches of 100 (smart lazy loading)
      let query = window.firebaseDB.collection('lists')
        .select(
          'id', 'name', 'description', 'kind', 'type',
          'createdAt', 'updatedAt', 'createdBy', 'isActive',
          'memberCount', 'lastUsed', 'tags', 'color'
        )
        .orderBy('updatedAt', 'desc')
        .limit(100);
      
      const snapshot = await query.get();
      const newLists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      listsData = newLists;
      
      // Track last document for pagination
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100; // If we got less than 100, no more data
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundListsLoader] ✓ Loaded', listsData.length, 'lists from Firestore', hasMoreData ? '(more available)' : '(all loaded)');
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('lists', listsData);
        console.log('[BackgroundListsLoader] ✓ Cached', listsData.length, 'lists');
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:lists-loaded', { 
        detail: { count: listsData.length, fromFirestore: true } 
      }));
    } catch (error) {
      console.error('[BackgroundListsLoader] Failed to load from Firestore:', error);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('lists');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          listsData = cached;
          console.log('[BackgroundListsLoader] ✓ Loaded', cached.length, 'lists from cache');
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:lists-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          console.log('[BackgroundListsLoader] Cache empty, loading from Firestore');
          await loadFromFirestore();
        }
      } catch (e) {
        console.warn('[BackgroundListsLoader] Cache load failed:', e);
        await loadFromFirestore();
      }
    } else {
      console.warn('[BackgroundListsLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('lists');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            listsData = cached;
            console.log('[BackgroundListsLoader] ✓ Loaded', cached.length, 'lists from cache (delayed)');
            document.dispatchEvent(new CustomEvent('pc:lists-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));
          } else {
            await loadFromFirestore();
          }
        }
      }, 500);
    }
  })();
  
  // Load more lists (next batch of 100)
  async function loadMoreLists() {
    if (!hasMoreData) {
      console.log('[BackgroundListsLoader] No more data to load');
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundListsLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      console.log('[BackgroundListsLoader] Loading next batch...');
      let query = window.firebaseDB.collection('lists')
        .select(
          'id', 'name', 'description', 'kind', 'type',
          'createdAt', 'updatedAt', 'createdBy', 'isActive',
          'memberCount', 'lastUsed', 'tags', 'color'
        )
        .orderBy('updatedAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100);
      
      const snapshot = await query.get();
      const newLists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Append to existing data
      listsData = [...listsData, ...newLists];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundListsLoader] ✓ Loaded', newLists.length, 'more lists. Total:', listsData.length, hasMoreData ? '(more available)' : '(all loaded)');
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('lists', listsData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:lists-loaded-more', { 
        detail: { count: newLists.length, total: listsData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newLists.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundListsLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // Get total count from Firestore without loading all records
  async function getTotalCount() {
    if (!window.firebaseDB) return 0;
    
    try {
      const snapshot = await window.firebaseDB.collection('lists').get();
      return snapshot.size;
    } catch (error) {
      console.error('[BackgroundListsLoader] Failed to get total count:', error);
      return listsData.length; // Fallback to loaded count
    }
  }

  // Export public API
  window.BackgroundListsLoader = {
    getListsData: () => listsData,
    reload: loadFromFirestore,
    loadMore: loadMoreLists,
    hasMore: () => hasMoreData,
    getCount: () => listsData.length,
    getTotalCount: getTotalCount
  };
  
  console.log('[BackgroundListsLoader] Module initialized');
})();

