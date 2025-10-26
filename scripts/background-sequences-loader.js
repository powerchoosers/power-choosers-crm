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
  const isAdmin = () => {
    try { if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin==='function') return window.DataManager.isCurrentUserAdmin(); return window.currentUserRole==='admin'; } catch(_) { return false; }
  };
  const getUserEmail = () => {
    try { if (window.DataManager && typeof window.DataManager.getCurrentUserEmail==='function') return window.DataManager.getCurrentUserEmail(); return (window.currentUserEmail||'').toLowerCase(); } catch(_) { return (window.currentUserEmail||'').toLowerCase(); }
  };
  
  async function loadFromFirestore() {
    if (!window.firebaseDB && !(window.DataManager && typeof window.DataManager.queryWithOwnership==='function')) {
      console.warn('[BackgroundSequencesLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundSequencesLoader] Loading sequences...');
      if (!isAdmin()) {
        let newSequences = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership==='function') {
          newSequences = await window.DataManager.queryWithOwnership('sequences');
        } else {
          const email = getUserEmail();
          const snap = await window.firebaseDB.collection('sequences').where('ownerId','==',email).get();
          newSequences = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        }
        newSequences.sort((a,b)=> new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
        sequencesData = newSequences;
        lastLoadedDoc = null;
        hasMoreData = false;
      } else {
        // Admin path
        let query = window.firebaseDB.collection('sequences')
          .orderBy('updatedAt', 'desc')
          .limit(100);
        const snapshot = await query.get();
        const newSequences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sequencesData = newSequences;
        if (snapshot.docs.length>0) { lastLoadedDoc = snapshot.docs[snapshot.docs.length-1]; hasMoreData = snapshot.docs.length===100; } else { hasMoreData=false; }
      }
      
      // Pagination already handled above per role
      
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
      if (!isAdmin()) return { loaded: 0, hasMore: false };
      console.log('[BackgroundSequencesLoader] Loading next batch...');
      let query = window.firebaseDB.collection('sequences')
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



