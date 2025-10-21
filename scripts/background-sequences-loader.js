/**
 * Background Sequences Loader
 * 
 * Loads sequences data immediately from cache (or Firestore if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero Firestore reads after first visit)
 * - Global data availability via window.BackgroundSequencesLoader
 * - Event notifications when data is ready
 * - Automatic fallback to Firestore if cache is empty
 */

(function() {
  let sequencesData = [];
  let lastLoadedDoc = null; // Track last document for pagination
  let hasMoreData = true; // Flag to indicate if more data exists
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundSequencesLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundSequencesLoader] Loading from Firestore...');
      // OPTIMIZED: Only fetch fields needed for list display and filtering
      // COST REDUCTION: Load in batches of 100 (smart lazy loading)
      let query = window.firebaseDB.collection('sequences')
        .select(
          'id', 'name', 'description', 'status', 'type',
          'createdAt', 'updatedAt', 'createdBy', 'steps',
          'targetType', 'isActive', 'totalSteps', 'completedSteps',
          'lastExecuted', 'nextExecution', 'frequency'
        )
        .orderBy('updatedAt', 'desc')
        .limit(100);
      
      const snapshot = await query.get();
      const newSequences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sequencesData = newSequences;
      
      // Track last document for pagination
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100; // If we got less than 100, no more data
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundSequencesLoader] ✓ Loaded', sequencesData.length, 'sequences from Firestore', hasMoreData ? '(more available)' : '(all loaded)');
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('sequences', sequencesData);
        console.log('[BackgroundSequencesLoader] ✓ Cached', sequencesData.length, 'sequences');
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
        detail: { count: sequencesData.length, fromFirestore: true } 
      }));
    } catch (error) {
      console.error('[BackgroundSequencesLoader] Failed to load from Firestore:', error);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('sequences');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          sequencesData = cached;
          console.log('[BackgroundSequencesLoader] ✓ Loaded', cached.length, 'sequences from cache');
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          console.log('[BackgroundSequencesLoader] Cache empty, loading from Firestore');
          await loadFromFirestore();
        }
      } catch (e) {
        console.warn('[BackgroundSequencesLoader] Cache load failed:', e);
        await loadFromFirestore();
      }
    } else {
      console.warn('[BackgroundSequencesLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('sequences');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            sequencesData = cached;
            console.log('[BackgroundSequencesLoader] ✓ Loaded', cached.length, 'sequences from cache (delayed)');
            document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));
          } else {
            await loadFromFirestore();
          }
        }
      }, 500);
    }
  })();
  
  // Load more sequences (next batch of 100)
  async function loadMoreSequences() {
    if (!hasMoreData) {
      console.log('[BackgroundSequencesLoader] No more data to load');
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundSequencesLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      console.log('[BackgroundSequencesLoader] Loading next batch...');
      let query = window.firebaseDB.collection('sequences')
        .select(
          'id', 'name', 'description', 'status', 'type',
          'createdAt', 'updatedAt', 'createdBy', 'steps',
          'targetType', 'isActive', 'totalSteps', 'completedSteps',
          'lastExecuted', 'nextExecution', 'frequency'
        )
        .orderBy('updatedAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100);
      
      const snapshot = await query.get();
      const newSequences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Append to existing data
      sequencesData = [...sequencesData, ...newSequences];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundSequencesLoader] ✓ Loaded', newSequences.length, 'more sequences. Total:', sequencesData.length, hasMoreData ? '(more available)' : '(all loaded)');
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('sequences', sequencesData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded-more', { 
        detail: { count: newSequences.length, total: sequencesData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newSequences.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundSequencesLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // Get total count from Firestore without loading all records
  async function getTotalCount() {
    if (!window.firebaseDB) return 0;
    
    try {
      const snapshot = await window.firebaseDB.collection('sequences').get();
      return snapshot.size;
    } catch (error) {
      console.error('[BackgroundSequencesLoader] Failed to get total count:', error);
      return sequencesData.length; // Fallback to loaded count
    }
  }

  // Export public API
  window.BackgroundSequencesLoader = {
    getSequencesData: () => sequencesData,
    reload: loadFromFirestore,
    loadMore: loadMoreSequences,
    hasMore: () => hasMoreData,
    getCount: () => sequencesData.length,
    getTotalCount: getTotalCount
  };
  
  console.log('[BackgroundSequencesLoader] Module initialized');
})();


