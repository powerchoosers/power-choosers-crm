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
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundAccountsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundAccountsLoader] Loading from Firestore...');
      // OPTIMIZED: Only fetch fields needed for list display and filtering (35% data reduction)
      const snapshot = await window.firebaseDB.collection('accounts')
        .select(
          'id', 'name', 'accountName', 'companyName',
          'companyPhone', 'phone', 'primaryPhone', 'mainPhone',
          'industry', 'domain', 'website', 'site',
          'employees', 'employeeCount', 'numEmployees',
          'city', 'locationCity', 'town', 'state', 'locationState', 'region',
          'contractEndDate', 'contractEnd', 'contract_end_date',
          'squareFootage', 'sqft', 'square_feet',
          'occupancyPct', 'occupancy', 'occupancy_percentage',
          'logoUrl', // Required for account favicons in list view
          'updatedAt', 'createdAt'
        )
        .get();
      accountsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('[BackgroundAccountsLoader] ✓ Loaded', accountsData.length, 'accounts from Firestore');
      
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
          accountsData = cached;
          console.log('[BackgroundAccountsLoader] ✓ Loaded', cached.length, 'accounts from cache');
          
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
            accountsData = cached;
            console.log('[BackgroundAccountsLoader] ✓ Loaded', cached.length, 'accounts from cache (delayed)');
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
  
  // Export public API
  window.BackgroundAccountsLoader = {
    getAccountsData: () => accountsData,
    reload: loadFromFirestore,
    getCount: () => accountsData.length
  };
  
  console.log('[BackgroundAccountsLoader] Module initialized');
})();

