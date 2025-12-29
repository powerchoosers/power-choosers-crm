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

  async function loadFromFirestore(preserveExisting = false) {

    if (!window.firebaseDB && !(window.DataManager && typeof window.DataManager.queryWithOwnership === 'function')) {
      console.warn('[BackgroundTasksLoader] firebaseDB not available');
      return;
    }

    try {
      
      // CRITICAL FIX: Preserve existing tasks if this is a refresh (not initial load)
      const existingTasksMap = preserveExisting ? new Map() : null;
      if (preserveExisting && tasksData.length > 0) {
        tasksData.forEach(t => {
          if (t && t.id) existingTasksMap.set(t.id, t);
        });
      }
      
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

        // Merge with existing tasks if preserving
        if (preserveExisting && existingTasksMap) {
          const newTasksMap = new Map();
          newTasks.forEach(t => {
            if (t && t.id) newTasksMap.set(t.id, t);
          });
          // Add existing tasks that weren't in the reload
          existingTasksMap.forEach((task, id) => {
            if (!newTasksMap.has(id)) {
              newTasksMap.set(id, task);
            }
          });
          tasksData = Array.from(newTasksMap.values());
          tasksData.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));


        } else {
        tasksData = newTasks;


        }
        lastLoadedDoc = null;
        hasMoreData = false;
      } else {
        // Admin path: original unfiltered query
        // Admin path: load ALL tasks (source of truth). This avoids 123/200/245 drift.
        const snapshot = await window.firebaseDB.collection('tasks').get();
        const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));


        // Merge with existing tasks if preserving
        if (preserveExisting && existingTasksMap) {
          const newTasksMap = new Map();
          newTasks.forEach(t => {
            if (t && t.id) newTasksMap.set(t.id, t);
          });
          // Add existing tasks that weren't in the reload (beyond the 500 limit)
          existingTasksMap.forEach((task, id) => {
            if (!newTasksMap.has(id)) {
              newTasksMap.set(id, task);
            }
          });
          tasksData = Array.from(newTasksMap.values());
          tasksData.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));


        } else {
        tasksData = newTasks;


        }

        // Admin pagination disabled (we load all tasks in one go)
        lastLoadedDoc = null;
        hasMoreData = false;
      }

      // Pagination handled per role above


      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('tasks', tasksData);
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
            const cachedCount = (cached || []).length;
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

          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:tasks-loaded', {
            detail: { count: cached.length, cached: true }
          }));
        } else {
          // Cache empty, load from Firestore
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
      return { loaded: 0, hasMore: false };
    }

    if (!window.firebaseDB) {
      console.warn('[BackgroundTasksLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }

    try {
      if (window.currentUserRole !== 'admin') return { loaded: 0, hasMore: false };
      let query = window.firebaseDB.collection('tasks')
        .orderBy('timestamp', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(200);

      const snapshot = await query.get();
      const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Append to existing data
      tasksData = [...tasksData, ...newTasks];

      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 200; // CRITICAL FIX: Match the limit we're using
      } else {
        hasMoreData = false;
      }


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

  // OPTIMIZED: Get total count using Firestore aggregation (no document loads!)
  // This reduces Firestore reads from thousands to just 1-2 per count query
  async function getTotalCount() {
    if (!window.firebaseDB) return tasksData.length;

    try {
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: use aggregation count for owned/assigned tasks
        try {
          const [ownedCount, assignedCount] = await Promise.all([
            window.firebaseDB.collection('tasks').where('ownerId', '==', email).count().get(),
            window.firebaseDB.collection('tasks').where('assignedTo', '==', email).count().get()
          ]);
          const owned = ownedCount.data().count || 0;
          const assigned = assignedCount.data().count || 0;
          return Math.max(owned, assigned, tasksData.length);
        } catch (aggError) {
          console.warn('[BackgroundTasksLoader] Aggregation not supported, using loaded count');
          return tasksData.length;
        }
      } else {
        // Admin: use aggregation count for all tasks
        try {
          const countSnap = await window.firebaseDB.collection('tasks').count().get();
          return countSnap.data().count || tasksData.length;
        } catch (aggError) {
          console.warn('[BackgroundTasksLoader] Aggregation not supported, using loaded count');
          return tasksData.length;
        }
      }
    } catch (error) {
      console.error('[BackgroundTasksLoader] Failed to get total count:', error);
      return tasksData.length; // Fallback to loaded count
    }
  }

  // Listen for task updates and reload data
  window.addEventListener('tasksUpdated', async (event) => {
    const { source, taskId, deleted, newTaskCreated, rescheduled, taskData } = event.detail || {};

    if (source === 'tasksPageLoad' || source === 'navigation') {
      return;
    }

    if (deleted && taskId) {
      try {
        tasksData = tasksData.filter(t => t && t.id !== taskId);

        if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
          await window.CacheManager.deleteRecord('tasks', taskId);
        }
      } catch (e) {
        console.warn('[BackgroundTasksLoader] Could not remove deleted task from cache:', e);
      }
    }

    if (newTaskCreated && taskData && taskData.id) {
      try {
        tasksData = tasksData.filter(t => t && t.id !== taskData.id);
        tasksData.push(taskData);
        tasksData.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));

        if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
          await window.CacheManager.updateRecord('tasks', taskData.id, taskData);
        }
      } catch (_) { }
    }

    // CRITICAL FIX: If a task was rescheduled, remove it from cache and force reload
    // This ensures the task appears in its new position (sorted by new dueDate/dueTime)
    // and is removed from its old position
    if (rescheduled && taskId) {
      try {
        // Remove the old task from cache (with old dueDate/dueTime)
        tasksData = tasksData.filter(t => t && t.id !== taskId);
        
        // Update cache immediately to remove old position
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('tasks', tasksData);
        }
      } catch (e) {
        console.warn('[BackgroundTasksLoader] Could not remove rescheduled task from cache:', e);
      }
    }

    try {
      const shouldReloadForNewTask = !!(newTaskCreated && (!taskData || !taskData.id));
      const shouldReload = shouldReloadForNewTask || !!rescheduled;

      if (shouldReload && window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        await window.CacheManager.invalidate('tasks');
      }

      if (shouldReload) {
        if (rescheduled) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        await loadFromFirestore(true);
      }

      // Trigger Today's Tasks widget to refresh (only when dashboard is visible).
      // Do NOT use timeouts; CRM-side logic already debounces/queues as needed.
      if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
        const dashboardActive = !!document.getElementById('dashboard-page')?.classList.contains('active');
        if (dashboardActive) {
          window.crm.loadTodaysTasks();
        }
      }
    } catch (error) {
      console.error('[BackgroundTasksLoader] Error handling tasksUpdated event:', error);
    }
  });

  // CRITICAL FIX: Listen for task deletion events for cross-browser sync
  document.addEventListener('pc:task-deleted', async (event) => {
    const { taskId, source } = event.detail || {};
    if (taskId) {
      try {
        // Remove from local cache
        tasksData = tasksData.filter(t => t && t.id !== taskId);

        if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
          await window.CacheManager.deleteRecord('tasks', taskId);
        }
        
        // CRITICAL FIX: Only trigger refresh if not from task-detail (which handles its own refresh)
        // This prevents duplicate refreshes and race conditions
        if (source !== 'task-detail' && window.crm && typeof window.crm.loadTodaysTasks === 'function') {
          const dashboardActive = !!document.getElementById('dashboard-page')?.classList.contains('active');
          if (dashboardActive) {
            window.crm.loadTodaysTasks();
          }
        }
      } catch (e) {
        console.warn('[BackgroundTasksLoader] Could not remove deleted task from cache:', e);
      }
    }
  });

  // Reload tasks when user returns to tab (to catch changes from other browsers)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {

      try {
        // Check cache age
        const cacheAge = window.CacheManager && typeof window.CacheManager.getMeta === 'function'
          ? await window.CacheManager.getMeta('tasks')
          : null;
        const age = cacheAge?.timestamp ? (Date.now() - cacheAge.timestamp) : Infinity;

        const tasksCacheExpiry = (window.CacheManager && typeof window.CacheManager.tasksCacheExpiry === 'number')
          ? window.CacheManager.tasksCacheExpiry
          : (2 * 60 * 60 * 1000);

        // If cache is older than expiry time, refresh
        if (age > tasksCacheExpiry) {
          
          // CRITICAL FIX: Preserve existing tasks during refresh to prevent loss
          const existingTasksMap = new Map();
          tasksData.forEach(t => {
            if (t && t.id) existingTasksMap.set(t.id, t);
          });
          
          if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
            await window.CacheManager.invalidate('tasks');
          }
          await loadFromFirestore(true); // Preserve existing tasks during refresh
          
          // Merge new tasks with existing ones (prefer new data, but keep old if new doesn't have it)
          const newTasksMap = new Map();
          tasksData.forEach(t => {
            if (t && t.id) newTasksMap.set(t.id, t);
          });
          
          // Add any existing tasks that weren't in the reload (beyond the initial limit)
          existingTasksMap.forEach((task, id) => {
            if (!newTasksMap.has(id)) {
              newTasksMap.set(id, task);
            }
          });
          
          tasksData = Array.from(newTasksMap.values());
          // Re-sort by timestamp
          tasksData.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));
          
          // Update cache with merged data
          if (window.CacheManager && typeof window.CacheManager.set === 'function') {
            await window.CacheManager.set('tasks', tasksData);
          }

          // Trigger Today's Tasks widget to refresh
          if (window.crm && typeof window.crm.loadTodaysTasks === 'function') {
            // Avoid redundant widget refreshes if we just refreshed recently.
            // (Keeps Home from feeling like it is "battling" in the background.)
            const last = window.crm._lastTasksLoad || 0;
            const deltaMs = Date.now() - last;
            if (!last || deltaMs > 5000) {
              window.crm.loadTodaysTasks();
            } else {
            }
          }
        } else {
        }
      } catch (error) {
        console.error('[BackgroundTasksLoader] Error checking cache on visibility change:', error);
      }
    }
  });

  // Remove a task from the local cache immediately
  function removeTask(taskId) {
    if (!taskId) return false;
    try {
      const beforeCount = tasksData.length;
      tasksData = tasksData.filter(t => t && t.id !== taskId);
      const removed = tasksData.length < beforeCount;
      
      if (removed) {
        
        // Update cache immediately
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          window.CacheManager.set('tasks', tasksData).catch(e => {
            console.warn('[BackgroundTasksLoader] Could not update cache after removal:', e);
          });
        }
      }
      
      return removed;
    } catch (e) {
      console.warn('[BackgroundTasksLoader] Error removing task:', e);
      return false;
    }
  }

  // Export public API
  window.BackgroundTasksLoader = {
    getTasksData: () => tasksData,
    reload: loadFromFirestore,
    forceReload: async () => {
      // Force cache invalidation and reload
      try {
        // CRITICAL FIX: Preserve existing tasks during reload to prevent loss
        // Store current tasks before reloading
        const existingTasksMap = new Map();
        tasksData.forEach(t => {
          if (t && t.id) existingTasksMap.set(t.id, t);
        });
        
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          await window.CacheManager.invalidate('tasks');
        }
        await loadFromFirestore(true); // Preserve existing tasks during refresh
        
        // Merge new tasks with existing ones (prefer new data, but keep old if new doesn't have it)
        const newTasksMap = new Map();
        tasksData.forEach(t => {
          if (t && t.id) newTasksMap.set(t.id, t);
        });
        
        // Add any existing tasks that weren't in the reload (beyond the initial limit)
        existingTasksMap.forEach((task, id) => {
          if (!newTasksMap.has(id)) {
            newTasksMap.set(id, task);
          }
        });
        
        tasksData = Array.from(newTasksMap.values());
        // Re-sort by timestamp
        tasksData.sort((a, b) => new Date(b.updatedAt || b.timestamp || 0) - new Date(a.updatedAt || a.timestamp || 0));
        
        // Update cache with merged data
        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('tasks', tasksData);
        }
        
        return tasksData;
      } catch (error) {
        console.error('[BackgroundTasksLoader] Error during force reload:', error);
        return tasksData;
      }
    },
    removeTask: removeTask,
    loadMore: loadMoreTasks,
    hasMore: () => hasMoreData,
    getCount: () => tasksData.length,
    getTotalCount: getTotalCount
  };

})();
