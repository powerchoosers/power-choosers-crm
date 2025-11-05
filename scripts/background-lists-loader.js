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
      if (window.currentUserRole !== 'admin') {
        let newLists = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership==='function') {
          newLists = await window.DataManager.queryWithOwnership('lists');
        } else {
          const email = window.currentUserEmail || '';
          const db = window.firebaseDB;
          // Check multiple ownership fields for lists
          const [ownedSnap, assignedSnap, createdSnap] = await Promise.all([
            db.collection('lists').where('ownerId','==',email).get(),
            db.collection('lists').where('assignedTo','==',email).get(),
            db.collection('lists').where('createdBy','==',email).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id,{ id:d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          createdSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
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
        
        // Track pagination for admin path
        if (snapshot.docs.length > 0) {
          lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
          hasMoreData = snapshot.docs.length === 100; // If we got less than 100, no more data
        } else {
          hasMoreData = false;
        }
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
          // CacheManager already handles scoped queries, so use cached data directly
          listsData = cached;
          console.log('[BackgroundListsLoader] ✓ Loaded', listsData.length, 'lists from cache');
          
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
            // CacheManager already handles scoped queries, so use cached data directly
            listsData = cached;
            console.log('[BackgroundListsLoader] ✓ Loaded', listsData.length, 'lists from cache (delayed)');
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
      if (window.currentUserRole !== 'admin') return { loaded: 0, hasMore: false };
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
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: count only owned/assigned lists
        const [ownedSnap, assignedSnap] = await Promise.all([
          window.firebaseDB.collection('lists').where('ownerId','==',email).get(),
          window.firebaseDB.collection('lists').where('assignedTo','==',email).get()
        ]);
        const map = new Map();
        ownedSnap.forEach(d=>map.set(d.id, d.id));
        assignedSnap.forEach(d=>map.set(d.id, d.id));
        return map.size;
      } else {
        // Admin: count all lists
        const snapshot = await window.firebaseDB.collection('lists').get();
        return snapshot.size;
      }
    } catch (error) {
      console.error('[BackgroundListsLoader] Failed to get total count:', error);
      return listsData.length; // Fallback to loaded count
    }
  }

  // Update list recordCount locally (cost-effective: avoids Firestore read)
  function updateListCountLocally(listId, newCount) {
    const list = listsData.find(l => l.id === listId);
    if (list) {
      list.recordCount = newCount;
      list.count = newCount;
      list.updatedAt = new Date();
      console.log(`[BackgroundListsLoader] ✓ Updated local count for ${listId}: ${newCount}`);
      
      // Update cache if available (cost-effective)
      if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
        window.CacheManager.updateRecord('lists', listId, { 
          recordCount: newCount, 
          count: newCount,
          updatedAt: new Date()
        }).catch(err => console.warn('[BackgroundListsLoader] Cache update failed:', err));
      }
      
      return true;
    }
    return false;
  }

  // Remove list from cache (cost-effective: avoids Firestore read on reload)
  function removeListLocally(listId) {
    const index = listsData.findIndex(l => l.id === listId);
    if (index >= 0) {
      listsData.splice(index, 1);
      console.log(`[BackgroundListsLoader] ✓ Removed list ${listId} from cache`);
      
      // Remove from CacheManager cache (cost-effective)
      if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
        window.CacheManager.deleteRecord('lists', listId).catch(err => 
          console.warn('[BackgroundListsLoader] Cache delete failed:', err)
        );
      }
      
      // Update cache storage
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        window.CacheManager.set('lists', listsData).catch(err => 
          console.warn('[BackgroundListsLoader] Cache save failed:', err)
        );
      }
      
      return true;
    }
    return false;
  }

  // Export public API
  window.BackgroundListsLoader = {
    getListsData: () => listsData,
    reload: loadFromFirestore,
    loadMore: loadMoreLists,
    hasMore: () => hasMoreData,
    getCount: () => listsData.length,
    getTotalCount: getTotalCount,
    updateListCountLocally: updateListCountLocally,
    removeListLocally: removeListLocally
  };
  
  console.log('[BackgroundListsLoader] Module initialized');
})();



