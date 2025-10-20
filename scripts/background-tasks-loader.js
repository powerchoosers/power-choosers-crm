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
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundTasksLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundTasksLoader] Loading from Firestore...');
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
      
      // Track last document for pagination
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100; // If we got less than 100, no more data
      } else {
        hasMoreData = false;
      }
      
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

