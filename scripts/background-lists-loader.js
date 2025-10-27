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
  const isAdmin = () => { try { if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin==='function') return window.DataManager.isCurrentUserAdmin(); return window.currentUserRole==='admin'; } catch(_) { return false; } };
  const getUserEmail = () => { try { if (window.DataManager && typeof window.DataManager.getCurrentUserEmail==='function') return window.DataManager.getCurrentUserEmail(); return (window.currentUserEmail||'').toLowerCase(); } catch(_) { return (window.currentUserEmail||'').toLowerCase(); } };
  
  async function loadFromFirestore() {
    if (!window.firebaseDB && !(window.DataManager && typeof window.DataManager.queryWithOwnership==='function')) {
      console.warn('[BackgroundListsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundListsLoader] Loading lists...');
      if (!isAdmin()) {
        let newLists = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership==='function') {
          newLists = await window.DataManager.queryWithOwnership('lists');
        } else {
          const email = getUserEmail();
          const db = window.firebaseDB;
          const [ownedSnap, assignedSnap] = await Promise.all([
            db.collection('lists').where('ownerId','==',email).get(),
            db.collection('lists').where('assignedTo','==',email).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id,{ id:d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          newLists = Array.from(map.values());
        }
        newLists.sort((a,b)=> new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
        listsData = newLists;
        lastLoadedDoc = null;
        hasMoreData = false;
      } else {
        // Admin path
        let query = window.firebaseDB.collection('lists')
          .orderBy('updatedAt', 'desc')
          .limit(100);
        const snapshot = await query.get();
        const newLists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        listsData = newLists;
        if (snapshot.docs.length>0) { lastLoadedDoc = snapshot.docs[snapshot.docs.length-1]; hasMoreData = snapshot.docs.length===100; } else { hasMoreData=false; }
      }
      
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
          if (!isAdmin()) {
            const email = getUserEmail();
            listsData = (cached || []).filter(l => (l && (l.ownerId === email || l.assignedTo === email)));
          } else {
            listsData = cached;
          }
          console.log('[BackgroundListsLoader] ✓ Loaded', listsData.length, 'lists from cache (filtered)');
          
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
            if (!isAdmin()) {
              const email = getUserEmail();
              listsData = (cached || []).filter(l => (l && (l.ownerId === email || l.assignedTo === email)));
            } else {
              listsData = cached;
            }
            console.log('[BackgroundListsLoader] ✓ Loaded', listsData.length, 'lists from cache (delayed, filtered)');
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
      if (!isAdmin()) return { loaded: 0, hasMore: false };
      console.log('[BackgroundListsLoader] Loading next batch...');
      let query = window.firebaseDB.collection('lists')
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



