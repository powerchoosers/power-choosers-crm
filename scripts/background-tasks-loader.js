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

(function () {
  let tasksData = [];
  let lastLoadedDoc = null; // Track last document for pagination
  let hasMoreData = true; // Flag to indicate if more data exists
  const isAdmin = () => {
    try { if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') return window.DataManager.isCurrentUserAdmin(); return window.currentUserRole === 'admin'; } catch (_) { return false; }
  };
  const getUserEmail = () => {
    try { if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') return window.DataManager.getCurrentUserEmail(); return (window.currentUserEmail || '').toLowerCase(); } catch (_) { return (window.currentUserEmail || '').toLowerCase(); }
  };

  async function loadFromFirestore() {
    if (!window.firebaseDB && !(window.DataManager && typeof window.DataManager.queryWithOwnership === 'function')) {
      console.warn('[BackgroundTasksLoader] firebaseDB not available');
      return;
    }

    try {
      console.log('[BackgroundTasksLoader] Loading tasks...');
      if (window.currentUserRole !== 'admin') {
        let newTasks = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
          newTasks = await window.DataManager.queryWithOwnership('tasks');
        } else {
          const email = window.currentUserEmail || '';
          const db = window.firebaseDB;
          const [ownedSnap, assignedSnap] = await Promise.all([
            db.collection('tasks').where('ownerId', '==', email).get(),
            db.collection('tasks').where('assignedTo', '==', email).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
          assignedSnap.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() }); });
          newTasks = Array.from(map.values());
        }
        // Sort by updatedAt/timestamp desc similar to original
        newTasks.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));
        tasksData = newTasks;
        lastLoadedDoc = null;
        hasMoreData = false;
      } else {
        // Admin path: original unfiltered query
        // COST REDUCTION: Load in batches of 100 (smart lazy loading)
        let query = window.firebaseDB.collection('tasks')
          .orderBy('timestamp', 'desc')
          .limit(100);
        const snapshot = await query.get();
        const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        tasksData = newTasks;
        // Admin pagination
        if (snapshot.docs.length > 0) { lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1]; hasMoreData = snapshot.docs.length === 100; } else { hasMoreData = false; }
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
  (async function () {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('tasks');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          if (window.currentUserRole !== 'admin') {
            const email = (window.currentUserEmail || '').toLowerCase();
            // CRITICAL FIX: Include createdBy field in ownership check to match filterTasksByOwnership()
            tasksData = (cached || []).filter(t => {
              if (!t) return false;
              const ownerId = (t.ownerId || '').toLowerCase();
              const assignedTo = (t.assignedTo || '').toLowerCase();
              const createdBy = (t.createdBy || '').toLowerCase();
              return ownerId === email || assignedTo === email || createdBy === email;
            });
          } else {
            tasksData = cached;
          }
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
            if (window.currentUserRole !== 'admin') {
              const email = (window.currentUserEmail || '').toLowerCase();
              // CRITICAL FIX: Include createdBy field in ownership check to match filterTasksByOwnership()
              tasksData = (cached || []).filter(t => {
                if (!t) return false;
                const ownerId = (t.ownerId || '').toLowerCase();
                const assignedTo = (t.assignedTo || '').toLowerCase();
                const createdBy = (t.createdBy || '').toLowerCase();
                return ownerId === email || assignedTo === email || createdBy === email;
              });
            } else {
              tasksData = cached;
            }
            console.log('[BackgroundTasksLoader] ✓ Loaded', tasksData.length, 'tasks from cache (delayed, filtered)');
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
      if (window.currentUserRole !== 'admin') return { loaded: 0, hasMore: false };
      console.log('[BackgroundTasksLoader] Loading next batch...');
      let query = window.firebaseDB.collection('tasks')
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
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: count only owned/assigned tasks
        const [ownedSnap, assignedSnap] = await Promise.all([
          window.firebaseDB.collection('tasks').where('ownerId', '==', email).get(),
          window.firebaseDB.collection('tasks').where('assignedTo', '==', email).get()
        ]);
        const map = new Map();
        ownedSnap.forEach(d => map.set(d.id, d.id));
        assignedSnap.forEach(d => map.set(d.id, d.id));
        return map.size;
      } else {
        // Admin: count all tasks
        const snapshot = await window.firebaseDB.collection('tasks').get();
        return snapshot.size;
      }
    } catch (error) {
      console.error('[BackgroundTasksLoader] Failed to get total count:', error);
      return tasksData.length; // Fallback to loaded count
    }
  }

  // Listen for task updates and reload data
  window.addEventListener('tasksUpdated', async (event) => {
    const { source, taskId, deleted } = event.detail || {};
    console.log('[BackgroundTasksLoader] Tasks updated from:', source, deleted ? '(deleted)' : '');

    // CRITICAL FIX: If a task was deleted, remove it from local cache immediately
    if (deleted && taskId) {
      try {
        tasksData = tasksData.filter(t => t && t.id !== taskId);
        console.log('[BackgroundTasksLoader] Removed deleted task from cache:', taskId);
        
        // Also update cache
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('tasks', tasksData);
        }
      } catch (e) {
        console.warn('[BackgroundTasksLoader] Could not remove deleted task from cache:', e);
      }
    }

    // Invalidate cache and reload from Firestore
    try {
      if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        await window.CacheManager.invalidate('tasks');
        console.log('[BackgroundTasksLoader] Cache invalidated');
      }
      await loadFromFirestore();

      // Trigger Today's Tasks widget to refresh
      if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
        window.crm.loadTodaysTasks();
      }
    } catch (error) {
      console.error('[BackgroundTasksLoader] Error handling tasksUpdated event:', error);
    }
  });

  // CRITICAL FIX: Listen for task deletion events for cross-browser sync
  document.addEventListener('pc:task-deleted', async (event) => {
    const { taskId } = event.detail || {};
    if (taskId) {
      try {
        // Remove from local cache
        tasksData = tasksData.filter(t => t && t.id !== taskId);
        console.log('[BackgroundTasksLoader] Removed deleted task from cache (cross-browser sync):', taskId);
        
        // Update cache
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('tasks', tasksData);
        }
        
        // Trigger Today's Tasks widget to refresh
        if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
          window.crm.loadTodaysTasks();
        }
      } catch (e) {
        console.warn('[BackgroundTasksLoader] Could not remove deleted task from cache:', e);
      }
    }
  });

  // Reload tasks when user returns to tab (to catch changes from other browsers)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      console.log('[BackgroundTasksLoader] Tab visible, checking for updates...');

      try {
        // Check cache age
        const cacheAge = window.CacheManager && typeof window.CacheManager.getMeta === 'function'
          ? await window.CacheManager.getMeta('tasks')
          : null;
        const age = cacheAge?.timestamp ? (Date.now() - cacheAge.timestamp) : Infinity;

        // If cache is older than 1 minute, refresh
        if (age > 60000) {
          console.log('[BackgroundTasksLoader] Cache is stale (age: ' + Math.round(age / 1000) + 's), refreshing...');
          if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
            await window.CacheManager.invalidate('tasks');
          }
          await loadFromFirestore();

          // Trigger Today's Tasks widget to refresh
          if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
            window.crm.loadTodaysTasks();
          }
        } else {
          console.log('[BackgroundTasksLoader] Cache is fresh (age: ' + Math.round(age / 1000) + 's)');
        }
      } catch (error) {
        console.error('[BackgroundTasksLoader] Error checking cache on visibility change:', error);
      }
    }
  });

  // Export public API
  window.BackgroundTasksLoader = {
    getTasksData: () => tasksData,
    reload: loadFromFirestore,
    forceReload: async () => {
      // Force cache invalidation and reload
      console.log('[BackgroundTasksLoader] Force reload requested');
      try {
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          await window.CacheManager.invalidate('tasks');
        }
        await loadFromFirestore();
        return tasksData;
      } catch (error) {
        console.error('[BackgroundTasksLoader] Error during force reload:', error);
        return tasksData;
      }
    },
    loadMore: loadMoreTasks,
    hasMore: () => hasMoreData,
    getCount: () => tasksData.length,
    getTotalCount: getTotalCount
  };

  console.log('[BackgroundTasksLoader] Module initialized');
})();



