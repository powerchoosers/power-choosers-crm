/**
 * Background Contacts Loader
 * 
 * Loads contacts data immediately from cache (or Firestore if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero Firestore reads after first visit)
 * - Global data availability via window.BackgroundContactsLoader
 * - Event notifications when data is ready
 * - Automatic fallback to Firestore if cache is empty
 */

(function() {
  let contactsData = [];
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
      console.warn('[BackgroundContactsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundContactsLoader] Loading contacts...');
      if (!isAdmin()) {
        // Employee: scope by ownership
        let newContacts = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership === 'function') {
          newContacts = await window.DataManager.queryWithOwnership('contacts');
        } else {
          const db = window.firebaseDB;
          const email = getUserEmail();
          const [ownedSnap, assignedSnap] = await Promise.all([
            db.collection('contacts').where('ownerId','==',email).get(),
            db.collection('contacts').where('assignedTo','==',email).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id,{ id:d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          newContacts = Array.from(map.values());
        }
        // Sort latest first similar to original
        newContacts.sort((a,b)=> new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
        contactsData = newContacts;
        hasMoreData = false; // disable pagination for scoped loads
      } else {
        // Admin: original unfiltered query
        // COST REDUCTION: Load in batches of 100 (smart lazy loading)
        let query = window.firebaseDB.collection('contacts')
          .orderBy('updatedAt', 'desc')
          .limit(100);
        const snapshot = await query.get();
        const newContacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        contactsData = newContacts;
      }
      
      // Track pagination only for admin path
      if (isAdmin()) {
        if (snapshot.docs.length > 0) {
          lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
          hasMoreData = snapshot.docs.length === 100; // If we got less than 100, no more data
        } else {
          hasMoreData = false;
        }
      } else {
        lastLoadedDoc = null;
        hasMoreData = false;
      }
      
      console.log('[BackgroundContactsLoader] ✓ Loaded', contactsData.length, 'contacts from Firestore', hasMoreData ? '(more available)' : '(all loaded)');
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('contacts', contactsData);
        console.log('[BackgroundContactsLoader] ✓ Cached', contactsData.length, 'contacts');
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:contacts-loaded', { 
        detail: { count: contactsData.length, fromFirestore: true } 
      }));
    } catch (error) {
      console.error('[BackgroundContactsLoader] Failed to load from Firestore:', error);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('contacts');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          if (!isAdmin()) {
            const email = getUserEmail();
            contactsData = (cached || []).filter(c => (c && (c.ownerId === email || c.assignedTo === email)));
          } else {
            contactsData = cached;
          }
          loadedFromCache = true; // Mark as loaded from cache
          console.log('[BackgroundContactsLoader] ✓ Loaded', cached.length, 'contacts from cache');
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:contacts-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          console.log('[BackgroundContactsLoader] Cache empty, loading from Firestore');
          await loadFromFirestore();
        }
      } catch (e) {
        console.warn('[BackgroundContactsLoader] Cache load failed:', e);
        await loadFromFirestore();
      }
    } else {
      console.warn('[BackgroundContactsLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('contacts');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            if (!isAdmin()) {
              const email = getUserEmail();
              contactsData = (cached || []).filter(c => (c && (c.ownerId === email || c.assignedTo === email)));
            } else {
              contactsData = cached;
            }
            loadedFromCache = true; // Mark as loaded from cache
            console.log('[BackgroundContactsLoader] ✓ Loaded', contactsData.length, 'contacts from cache (delayed, filtered)');
            document.dispatchEvent(new CustomEvent('pc:contacts-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));
          } else {
            await loadFromFirestore();
          }
        }
      }, 500);
    }
  })();
  
  // Load more contacts (next batch of 100)
  async function loadMoreContacts() {
    if (!hasMoreData) {
      console.log('[BackgroundContactsLoader] No more data to load');
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundContactsLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      if (!isAdmin()) {
        // For employees, we already scoped and disabled pagination
        return { loaded: 0, hasMore: false };
      }
      console.log('[BackgroundContactsLoader] Loading next batch...');
      let query = window.firebaseDB.collection('contacts')
        .orderBy('updatedAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100);
      
      const snapshot = await query.get();
      const newContacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Append to existing data
      contactsData = [...contactsData, ...newContacts];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundContactsLoader] ✓ Loaded', newContacts.length, 'more contacts. Total:', contactsData.length, hasMoreData ? '(more available)' : '(all loaded)');
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('contacts', contactsData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:contacts-loaded-more', { 
        detail: { count: newContacts.length, total: contactsData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newContacts.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundContactsLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // Get total count from Firestore without loading all records
  async function getTotalCount() {
    if (!window.firebaseDB) return 0;
    
    try {
      const snapshot = await window.firebaseDB.collection('contacts').get();
      return snapshot.size;
    } catch (error) {
      console.error('[BackgroundContactsLoader] Failed to get total count:', error);
      return contactsData.length; // Fallback to loaded count
    }
  }

  // Add new contact to cache
  function addContactToCache(contactData) {
    if (!contactData || !contactData.id) {
      console.warn('[BackgroundContactsLoader] Invalid contact data provided to addContactToCache');
      return;
    }
    
    // Check if contact already exists
    const existingIndex = contactsData.findIndex(c => c.id === contactData.id);
    if (existingIndex >= 0) {
      // Update existing contact
      contactsData[existingIndex] = { ...contactsData[existingIndex], ...contactData };
      console.log('[BackgroundContactsLoader] Updated contact in cache:', contactData.id);
    } else {
      // Add new contact to the beginning of the array (most recent first)
      contactsData.unshift(contactData);
      console.log('[BackgroundContactsLoader] Added new contact to cache:', contactData.id);
    }
    
    // Update the cache in IndexedDB
    if (window.CacheManager && typeof window.CacheManager.set === 'function') {
      window.CacheManager.set('contacts', contactsData).catch(error => {
        console.warn('[BackgroundContactsLoader] Failed to update cache:', error);
      });
    }
  }

  // Export public API
  window.BackgroundContactsLoader = {
    getContactsData: () => contactsData,
    reload: loadFromFirestore,
    loadMore: loadMoreContacts,
    hasMore: () => hasMoreData,
    getCount: () => contactsData.length,
    getTotalCount: getTotalCount,
    addContact: addContactToCache,
    isFromCache: () => loadedFromCache // Expose cache status
  };
  
  console.log('[BackgroundContactsLoader] Module initialized');
})();

