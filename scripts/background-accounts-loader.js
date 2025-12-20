/**
 * Background Accounts Loader
 * 
 * Loads accounts data immediately from cache (or Firestore if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero Firestore reads after first visit)
 * - Global data availability via window.BackgroundAccountsLoader
 * - Event notifications when data is ready
 * - Automatic fallback to Firestore if cache is empty
 */

(function() {
  let accountsData = [];
  let lastLoadedDoc = null; // Track last document for pagination
  let hasMoreData = true; // Flag to indicate if more data exists
  let loadedFromCache = false; // Track if data was loaded from cache (no cost)
  const isAdmin = () => {
    try {
      if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') return window.DataManager.isCurrentUserAdmin();
      return window.currentUserRole === 'admin';
    } catch(_) { return false; }
  };
  const getUserEmail = () => {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') return window.DataManager.getCurrentUserEmail();
      return (window.currentUserEmail || '').toLowerCase();
    } catch(_) { return (window.currentUserEmail || '').toLowerCase(); }
  };
  
  async function loadFromFirestore() {
    if (!window.firebaseDB && !(window.DataManager && typeof window.DataManager.queryWithOwnership === 'function')) {
      console.warn('[BackgroundAccountsLoader] firebaseDB not available');
      return;
    }
    
    try {
      if (window.currentUserRole !== 'admin') {
        // Employee: scope by ownership
        let newAccounts = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
          newAccounts = await window.DataManager.queryWithOwnership('accounts');
        } else {
          const db = window.firebaseDB;
          const email = window.currentUserEmail || '';
          const [ownedSnap, assignedSnap] = await Promise.all([
            db.collection('accounts').where('ownerId','==',email).get(),
            db.collection('accounts').where('assignedTo','==',email).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id,{ id:d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          newAccounts = Array.from(map.values());
        }
        // Sort latest first
        newAccounts.sort((a,b)=> new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
        accountsData = newAccounts;
        lastLoadedDoc = null;
        hasMoreData = false;
      } else {
        // Admin path: original unfiltered query
        let query = window.firebaseDB.collection('accounts')
          .orderBy('updatedAt', 'desc')
          .limit(100);
        const snapshot = await query.get();
        const newAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        accountsData = newAccounts;
        // Track admin pagination
        if (snapshot.docs.length > 0) {
          lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
          hasMoreData = snapshot.docs.length === 100; // If we got less than 100, no more data
        } else {
          hasMoreData = false;
        }
      }
      
      // Pagination handled per role above
      
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('accounts', accountsData);
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:accounts-loaded', { 
        detail: { count: accountsData.length, fromFirestore: true } 
      }));
    } catch (error) {
      console.error('[BackgroundAccountsLoader] Failed to load from Firestore:', error);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('accounts');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          if (window.currentUserRole !== 'admin') {
            const email = window.currentUserEmail || '';
            accountsData = (cached || []).filter(a => (a && (a.ownerId === email || a.assignedTo === email)));
          } else {
            accountsData = cached;
          }
          loadedFromCache = true; // Mark as loaded from cache
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:accounts-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          await loadFromFirestore();
        }
      } catch (e) {
        console.warn('[BackgroundAccountsLoader] Cache load failed:', e);
        await loadFromFirestore();
      }
    } else {
      console.warn('[BackgroundAccountsLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('accounts');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            if (window.currentUserRole !== 'admin') {
              const email = window.currentUserEmail || '';
              accountsData = (cached || []).filter(a => (a && (a.ownerId === email || a.assignedTo === email)));
            } else {
              accountsData = cached;
            }
            loadedFromCache = true; // Mark as loaded from cache
            document.dispatchEvent(new CustomEvent('pc:accounts-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));
          } else {
            await loadFromFirestore();
          }
        }
      }, 500);
    }
  })();
  
  // Load more accounts (next batch of 100)
  async function loadMoreAccounts() {
    if (!hasMoreData) {
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundAccountsLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      if (window.currentUserRole !== 'admin') {
        // For employees, we already scoped and disabled pagination
        return { loaded: 0, hasMore: false };
      }
      let query = window.firebaseDB.collection('accounts')
        .orderBy('updatedAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100);
      
      const snapshot = await query.get();
      const newAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Append to existing data
      accountsData = [...accountsData, ...newAccounts];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('accounts', accountsData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:accounts-loaded-more', { 
        detail: { count: newAccounts.length, total: accountsData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newAccounts.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundAccountsLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // OPTIMIZED: Get total count using Firestore aggregation (no document loads!)
  // This reduces Firestore reads from thousands to just 1-2 per count query
  async function getTotalCount() {
    if (!window.firebaseDB) return accountsData.length;
    
    try {
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: use aggregation count for owned/assigned accounts
        try {
          const [ownedCount, assignedCount] = await Promise.all([
            window.firebaseDB.collection('accounts').where('ownerId','==',email).count().get(),
            window.firebaseDB.collection('accounts').where('assignedTo','==',email).count().get()
          ]);
          const owned = ownedCount.data().count || 0;
          const assigned = assignedCount.data().count || 0;
          return Math.max(owned, assigned, accountsData.length);
        } catch (aggError) {
          console.warn('[BackgroundAccountsLoader] Aggregation not supported, using loaded count');
          return accountsData.length;
        }
      } else {
        // Admin: use aggregation count for all accounts
        try {
          const countSnap = await window.firebaseDB.collection('accounts').count().get();
          return countSnap.data().count || accountsData.length;
        } catch (aggError) {
          console.warn('[BackgroundAccountsLoader] Aggregation not supported, using loaded count');
          return accountsData.length;
        }
      }
    } catch (error) {
      console.error('[BackgroundAccountsLoader] Failed to get total count:', error);
      return accountsData.length; // Fallback to loaded count
    }
  }

  // Add new account to cache
  function addAccountToCache(accountData) {
    if (!accountData || !accountData.id) {
      console.warn('[BackgroundAccountsLoader] Invalid account data provided to addAccountToCache');
      return;
    }
    
    // Check if account already exists
    const existingIndex = accountsData.findIndex(a => a.id === accountData.id);
    if (existingIndex >= 0) {
      // Update existing account
      accountsData[existingIndex] = { ...accountsData[existingIndex], ...accountData };
    } else {
      // Add new account to the beginning of the array (most recent first)
      accountsData.unshift(accountData);
    }
    
    // Update the cache in IndexedDB
    if (window.CacheManager && typeof window.CacheManager.set === 'function') {
      window.CacheManager.set('accounts', accountsData).catch(error => {
        console.warn('[BackgroundAccountsLoader] Failed to update cache:', error);
      });
    }
  }

  // Export public API
  window.BackgroundAccountsLoader = {
    getAccountsData: () => accountsData,
    reload: loadFromFirestore,
    loadMore: loadMoreAccounts,
    hasMore: () => hasMoreData,
    getCount: () => accountsData.length,
    getTotalCount: getTotalCount,
    addAccount: addAccountToCache,
    isFromCache: () => loadedFromCache // Expose cache status
  };
  
})();

