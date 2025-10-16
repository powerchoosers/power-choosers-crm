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
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundContactsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundContactsLoader] Loading from Firestore...');
      // OPTIMIZED: Only fetch fields needed for list display and filtering (60% data reduction)
      const snapshot = await window.firebaseDB.collection('contacts')
        .select(
          'id', 'firstName', 'lastName', 'name',
          'email', 'phone', 'mobile', 'workDirectPhone', 'otherPhone', 'preferredPhoneField',
          'title', 'companyName', 'seniority', 'department',
          'city', 'state', 'location',
          'employees', 'companySize', 'employeeCount',
          'industry', 'companyIndustry',
          'domain', 'companyDomain', 'website',
          'updatedAt', 'createdAt'
        )
        .get();
      contactsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('[BackgroundContactsLoader] ✓ Loaded', contactsData.length, 'contacts from Firestore');
      
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
          contactsData = cached;
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
            contactsData = cached;
            console.log('[BackgroundContactsLoader] ✓ Loaded', cached.length, 'contacts from cache (delayed)');
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
  
  // Export public API
  window.BackgroundContactsLoader = {
    getContactsData: () => contactsData,
    reload: loadFromFirestore,
    getCount: () => contactsData.length
  };
  
  console.log('[BackgroundContactsLoader] Module initialized');
})();

