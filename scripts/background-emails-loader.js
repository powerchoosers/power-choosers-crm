/**
 * Background Emails Loader
 * 
 * Loads emails data immediately from cache (or Firestore if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero Firestore reads after first visit)
 * - Global data availability via window.BackgroundEmailsLoader
 * - Event notifications when data is ready
 * - Automatic fallback to Firestore if cache is empty
 */

(function() {
  let emailsData = [];
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundEmailsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundEmailsLoader] Loading from Firestore...');
      const snapshot = await window.firebaseDB.collection('emails')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      
      emailsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.sentAt || data.receivedAt || data.createdAt,
          emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
        };
      });
      
      console.log('[BackgroundEmailsLoader] ✓ Loaded', emailsData.length, 'emails from Firestore');
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('emails', emailsData);
        console.log('[BackgroundEmailsLoader] ✓ Cached', emailsData.length, 'emails');
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
        detail: { count: emailsData.length, fromFirestore: true } 
      }));
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to load from Firestore:', error);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('emails');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          emailsData = cached;
          console.log('[BackgroundEmailsLoader] ✓ Loaded', cached.length, 'emails from cache');
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          console.log('[BackgroundEmailsLoader] Cache empty, loading from Firestore');
          await loadFromFirestore();
        }
      } catch (e) {
        console.warn('[BackgroundEmailsLoader] Cache load failed:', e);
        await loadFromFirestore();
      }
    } else {
      console.warn('[BackgroundEmailsLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('emails');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            emailsData = cached;
            console.log('[BackgroundEmailsLoader] ✓ Loaded', cached.length, 'emails from cache (delayed)');
            document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
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
  window.BackgroundEmailsLoader = {
    getEmailsData: () => emailsData,
    reload: loadFromFirestore,
    getCount: () => emailsData.length
  };
  
  console.log('[BackgroundEmailsLoader] Module initialized');
})();
