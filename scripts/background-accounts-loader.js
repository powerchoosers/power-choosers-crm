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
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundAccountsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundAccountsLoader] Loading from Firestore...');
      // OPTIMIZED: Only fetch fields needed for list display, filtering, and AI email generation (25% data reduction)
      // COST REDUCTION: Load in batches of 100 (smart lazy loading)
      let query = window.firebaseDB.collection('accounts')
        .select(
          'id', 'name', 'accountName', 'companyName',
          'companyPhone', 'phone', 'primaryPhone', 'mainPhone',
          'industry', 'domain', 'website', 'site',
          'employees', 'employeeCount', 'numEmployees',
          'city', 'locationCity', 'town', 'state', 'locationState', 'region',
          'billingCity', 'billingState', // For AI email generation
          'contractEndDate', 'contractEnd', 'contract_end_date',
          'squareFootage', 'sqft', 'square_feet',
          'occupancyPct', 'occupancy', 'occupancy_percentage',
          'logoUrl', // Required for account favicons in list view
          'shortDescription', 'short_desc', 'descriptionShort', 'description', // Required for AI email generation
          'annualUsage', 'annual_kwh', 'kwh', // Required for AI email generation
          'electricitySupplier', 'supplier', // Required for AI email generation
          'currentRate', 'rate', // Required for AI email generation
          'notes', 'note', // Required for AI email generation
          'updatedAt', 'createdAt'
        )
        .orderBy('updatedAt', 'desc')
        .limit(100);
      
      const snapshot = await query.get();
      const newAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      accountsData = newAccounts;
      
      // Track last document for pagination
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100; // If we got less than 100, no more data
      } else {
        hasMoreData = false;
      }
      
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
      console.log('[BackgroundAccountsLoader] Loading next batch...');
      let query = window.firebaseDB.collection('accounts')
        .select(
          'id', 'name', 'accountName', 'companyName',
          'companyPhone', 'phone', 'primaryPhone', 'mainPhone',
          'industry', 'domain', 'website', 'site',
          'employees', 'employeeCount', 'numEmployees',
          'city', 'locationCity', 'town', 'state', 'locationState', 'region',
          'billingCity', 'billingState',
          'contractEndDate', 'contractEnd', 'contract_end_date',
          'squareFootage', 'sqft', 'square_feet',
          'occupancyPct', 'occupancy', 'occupancy_percentage',
          'logoUrl',
          'shortDescription', 'short_desc', 'descriptionShort', 'description',
          'annualUsage', 'annual_kwh', 'kwh',
          'electricitySupplier', 'supplier',
          'currentRate', 'rate',
          'notes', 'note',
          'updatedAt', 'createdAt'
        )
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
  
  // Export public API
  window.BackgroundAccountsLoader = {
    getAccountsData: () => accountsData,
    reload: loadFromFirestore,
    loadMore: loadMoreAccounts,
    hasMore: () => hasMoreData,
    getCount: () => accountsData.length
  };
  
  console.log('[BackgroundAccountsLoader] Module initialized');
})();

