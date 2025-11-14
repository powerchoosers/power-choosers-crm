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
      console.log('[BackgroundAccountsLoader] Loading accounts...');
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
        console.log('[BackgroundAccountsLoader] Loading from Firestore...');
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
      
      console.log('[BackgroundAccountsLoader] ✓ Loaded', accountsData.length, 'accounts from Firestore', hasMoreData ? '(more available)' : '(all loaded)');
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('accounts', accountsData);
        console.log('[BackgroundAccountsLoader] ✓ Cached', accountsData.length, 'accounts');
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
          console.log('[BackgroundAccountsLoader] ✓ Loaded', accountsData.length, 'accounts from cache (filtered)');
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:accounts-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          console.log('[BackgroundAccountsLoader] Cache empty, loading from Firestore');
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
            console.log('[BackgroundAccountsLoader] ✓ Loaded', accountsData.length, 'accounts from cache (delayed, filtered)');
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
      console.log('[BackgroundAccountsLoader] No more data to load');
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
      console.log('[BackgroundAccountsLoader] Loading next batch...');
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
      
      console.log('[BackgroundAccountsLoader] ✓ Loaded', newAccounts.length, 'more accounts. Total:', accountsData.length, hasMoreData ? '(more available)' : '(all loaded)');
      
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
  
  // Get total count from Firestore without loading all records
  async function getTotalCount() {
    if (!window.firebaseDB) return 0;
    
    try {
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: count only owned/assigned accounts
        const [ownedSnap, assignedSnap] = await Promise.all([
          window.firebaseDB.collection('accounts').where('ownerId','==',email).get(),
          window.firebaseDB.collection('accounts').where('assignedTo','==',email).get()
        ]);
        const map = new Map();
        ownedSnap.forEach(d=>map.set(d.id, d.id));
        assignedSnap.forEach(d=>map.set(d.id, d.id));
        return map.size;
      } else {
        // Admin: count all accounts
        const snapshot = await window.firebaseDB.collection('accounts').get();
        return snapshot.size;
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
      console.log('[BackgroundAccountsLoader] Updated account in cache:', accountData.id);
    } else {
      // Add new account to the beginning of the array (most recent first)
      accountsData.unshift(accountData);
      console.log('[BackgroundAccountsLoader] Added new account to cache:', accountData.id);
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
  
  console.log('[BackgroundAccountsLoader] Module initialized');
})();

