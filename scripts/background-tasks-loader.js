/**
 * Background Tasks Loader
 * 
 * Loads tasks data immediately from cache (or Firestore if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero Firestore reads after first visit)
 * - Global data availability via window.BackgroundTasksLoader
 * - Event notifications when data is ready
 * - Automatic fallback to Firestore if cache is empty
 */

(function() {
  let tasksData = [];
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
      console.warn('[BackgroundTasksLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundTasksLoader] Loading tasks...');
      if (!isAdmin()) {
        let newTasks = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership==='function') {
          newTasks = await window.DataManager.queryWithOwnership('tasks');
        } else {
          const email = getUserEmail();
          const db = window.firebaseDB;
          const [ownedSnap, assignedSnap] = await Promise.all([
            db.collection('tasks').where('ownerId','==',email).get(),
            db.collection('tasks').where('assignedTo','==',email).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id,{ id:d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          newTasks = Array.from(map.values());
        }
        // Sort by updatedAt/timestamp desc similar to original
        newTasks.sort((a,b)=> new Date(b.updatedAt||b.timestamp||0) - new Date(a.updatedAt||a.timestamp||0));
        tasksData = newTasks;
        lastLoadedDoc = null;
        hasMoreData = false;
      } else {
        // Admin path: original unfiltered query
        // OPTIMIZED: Only fetch fields needed for list display and filtering
        // COST REDUCTION: Load in batches of 100 (smart lazy loading)
        let query = window.firebaseDB.collection('tasks')
          .select(
            'id', 'title', 'description', 'status', 'priority',
            'dueDate', 'createdAt', 'updatedAt', 'assignedTo',
            'contactId', 'accountId', 'type', 'category',
            'completed', 'completedAt', 'notes'
          )
          .orderBy('timestamp', 'desc')
          .limit(100);
        const snapshot = await query.get();
        const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        tasksData = newTasks;
        // Admin pagination
        if (snapshot.docs.length>0) { lastLoadedDoc = snapshot.docs[snapshot.docs.length-1]; hasMoreData = snapshot.docs.length===100; } else { hasMoreData=false; }
      }
      
      // Pagination handled per role above
      
      console.log('[BackgroundTasksLoader] ✓ Loaded', tasksData.length, 'tasks from Firestore', hasMoreData ? '(more available)' : '(all loaded)');
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('tasks', tasksData);
        console.log('[BackgroundTasksLoader] ✓ Cached', tasksData.length, 'tasks');
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:tasks-loaded', { 
        detail: { count: tasksData.length, fromFirestore: true } 
      }));
    } catch (error) {
      console.error('[BackgroundTasksLoader] Failed to load from Firestore:', error);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('tasks');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          tasksData = cached;
          console.log('[BackgroundTasksLoader] ✓ Loaded', cached.length, 'tasks from cache');
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:tasks-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          console.log('[BackgroundTasksLoader] Cache empty, loading from Firestore');
          await loadFromFirestore();
        }
      } catch (e) {
        console.warn('[BackgroundTasksLoader] Cache load failed:', e);
        await loadFromFirestore();
      }
    } else {
      console.warn('[BackgroundTasksLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('tasks');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            tasksData = cached;
            console.log('[BackgroundTasksLoader] ✓ Loaded', cached.length, 'tasks from cache (delayed)');
            document.dispatchEvent(new CustomEvent('pc:tasks-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));
          } else {
            await loadFromFirestore();
          }
        }
      }, 500);
    }
  })();
  
  // Load more tasks (next batch of 100)
  async function loadMoreTasks() {
    if (!hasMoreData) {
      console.log('[BackgroundTasksLoader] No more data to load');
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundTasksLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      if (!isAdmin()) return { loaded: 0, hasMore: false };
      console.log('[BackgroundTasksLoader] Loading next batch...');
      let query = window.firebaseDB.collection('tasks')
        .select(
          'id', 'title', 'description', 'status', 'priority',
          'dueDate', 'createdAt', 'updatedAt', 'assignedTo',
          'contactId', 'accountId', 'type', 'category',
          'completed', 'completedAt', 'notes'
        )
        .orderBy('timestamp', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100);
      
      const snapshot = await query.get();
      const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Append to existing data
      tasksData = [...tasksData, ...newTasks];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundTasksLoader] ✓ Loaded', newTasks.length, 'more tasks. Total:', tasksData.length, hasMoreData ? '(more available)' : '(all loaded)');
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('tasks', tasksData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:tasks-loaded-more', { 
        detail: { count: newTasks.length, total: tasksData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newTasks.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundTasksLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // Get total count from Firestore without loading all records
  async function getTotalCount() {
    if (!window.firebaseDB) return 0;
    
    try {
      const snapshot = await window.firebaseDB.collection('tasks').get();
      return snapshot.size;
    } catch (error) {
      console.error('[BackgroundTasksLoader] Failed to get total count:', error);
      return tasksData.length; // Fallback to loaded count
    }
  }

  // Export public API
  window.BackgroundTasksLoader = {
    getTasksData: () => tasksData,
    reload: loadFromFirestore,
    loadMore: loadMoreTasks,
    hasMore: () => hasMoreData,
    getCount: () => tasksData.length,
    getTotalCount: getTotalCount
  };
  
  console.log('[BackgroundTasksLoader] Module initialized');
})();



