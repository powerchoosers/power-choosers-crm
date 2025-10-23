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
  let _unsubscribe = null;
  let _cacheWritePending = false;
  const tsToIso = (v) => {
    try {
      if (!v) return null;
      if (typeof v.toDate === 'function') return v.toDate().toISOString();
      if (typeof v === 'string') return v;
      return null;
    } catch (_) { return null; }
  };
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundEmailsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundEmailsLoader] Loading from Firestore...');
      const snapshot = await window.firebaseDB.collection('emails')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      
      emailsData = snapshot.docs.map(doc => {
        const data = doc.data();
        const createdAt = tsToIso(data.createdAt);
        const updatedAt = tsToIso(data.updatedAt);
        const sentAt = tsToIso(data.sentAt);
        const receivedAt = tsToIso(data.receivedAt);
        const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
        return {
          id: doc.id,
          ...data,
          createdAt,
          updatedAt,
          sentAt,
          receivedAt,
          timestamp,
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

      // Start realtime listener after initial load
      startRealtimeListener();
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to load from Firestore:', error);
    }
  }

  // Start a real-time listener for emails collection
  function startRealtimeListener() {
    try {
      if (!window.firebaseDB) return;
      if (_unsubscribe) return; // already listening

      _unsubscribe = window.firebaseDB
        .collection('emails')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .onSnapshot(async (snapshot) => {
          const updated = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            const createdAt = tsToIso(data.createdAt);
            const updatedAt = tsToIso(data.updatedAt);
            const sentAt = tsToIso(data.sentAt);
            const receivedAt = tsToIso(data.receivedAt);
            const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
            updated.push({
              id: doc.id,
              ...data,
              createdAt,
              updatedAt,
              sentAt,
              receivedAt,
              timestamp,
              emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
            });
          });

          emailsData = updated;

          // Throttle cache writes to avoid excessive IndexedDB operations
          if (!_cacheWritePending && window.CacheManager && typeof window.CacheManager.set === 'function') {
            _cacheWritePending = true;
            setTimeout(async () => {
              try {
                await window.CacheManager.set('emails', emailsData);
                document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail: { count: emailsData.length } }));
              } finally {
                _cacheWritePending = false;
              }
            }, 500);
          } else {
            // Still notify listeners of updated list
            document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail: { count: emailsData.length } }));
          }
        }, (error) => {
          console.error('[BackgroundEmailsLoader] Realtime listener error:', error);
        });

      console.log('[BackgroundEmailsLoader] Realtime listener started');
    } catch (e) {
      console.warn('[BackgroundEmailsLoader] Failed to start realtime listener:', e);
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

          // Ensure realtime listener is running even when using cache first
          startRealtimeListener();
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
    unsubscribe: () => { try { if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; } } catch(_) {} },
    getCount: () => emailsData.length
  };
  
  console.log('[BackgroundEmailsLoader] Module initialized');
})();
