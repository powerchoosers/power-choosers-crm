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
  const isAdmin = () => {
    try { if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin==='function') return window.DataManager.isCurrentUserAdmin(); return window.currentUserRole==='admin'; } catch(_) { return false; }
  };
  const getUserEmail = () => {
    try { if (window.DataManager && typeof window.DataManager.getCurrentUserEmail==='function') return window.DataManager.getCurrentUserEmail(); return (window.currentUserEmail||'').toLowerCase(); } catch(_) { return (window.currentUserEmail||'').toLowerCase(); }
  };
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundEmailsLoader] firebaseDB not available');
      return;
    }
    
    try {
      console.log('[BackgroundEmailsLoader] Loading from Firestore...');
      if (window.currentUserRole !== 'admin') {
        // Employee: scope by ownership
        let raw = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership==='function') {
          raw = await window.DataManager.queryWithOwnership('emails');
        } else {
          const email = window.currentUserEmail || '';
          const db = window.firebaseDB;
          const [ownedSnap, assignedSnap] = await Promise.all([
            db.collection('emails').where('ownerId','==',email).limit(100).get(),
            db.collection('emails').where('assignedTo','==',email).limit(100).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id,{ id:d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          raw = Array.from(map.values());
        }
        emailsData = raw.map((data) => {
          const createdAt = tsToIso(data.createdAt);
          const updatedAt = tsToIso(data.updatedAt);
          const sentAt = tsToIso(data.sentAt);
          const receivedAt = tsToIso(data.receivedAt);
          const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
          return { ...data, createdAt, updatedAt, sentAt, receivedAt, timestamp, emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent') };
        });
        // Sort newest first
        emailsData.sort((a,b)=> new Date(b.timestamp||0) - new Date(a.timestamp||0));
      } else {
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
      }
      
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
      if (window.currentUserRole !== 'admin') startRealtimeListenerScoped(window.currentUserEmail || ''); else startRealtimeListener();
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
  
  // Scoped realtime listener for employees (owner or assigned)
  function startRealtimeListenerScoped(email) {
    try {
      if (!window.firebaseDB) return;
      if (_unsubscribe) return;
      const db = window.firebaseDB;
      const listeners = [];
      const handleSnapshot = async (snapshot) => {
        const updated = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          const createdAt = tsToIso(data.createdAt);
          const updatedAt = tsToIso(data.updatedAt);
          const sentAt = tsToIso(data.sentAt);
          const receivedAt = tsToIso(data.receivedAt);
          const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
          updated.push({ id: doc.id, ...data, createdAt, updatedAt, sentAt, receivedAt, timestamp, emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent') });
        });
        // Merge into emailsData by id
        const map = new Map(emailsData.map(e=>[e.id,e]));
        updated.forEach(e=>map.set(e.id,e));
        emailsData = Array.from(map.values()).sort((a,b)=> new Date(b.timestamp||0) - new Date(a.timestamp||0));
        if (!_cacheWritePending && window.CacheManager && typeof window.CacheManager.set === 'function') {
          _cacheWritePending = true;
          setTimeout(async () => {
            try {
              await window.CacheManager.set('emails', emailsData);
              document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail: { count: emailsData.length } }));
            } finally { _cacheWritePending = false; }
          }, 500);
        } else {
          document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail: { count: emailsData.length } }));
        }
      };
      listeners.push(
        db.collection('emails').where('ownerId','==',email).limit(100).onSnapshot(handleSnapshot, (e)=>console.error('[BackgroundEmailsLoader] Scoped listener error (owner):', e))
      );
      listeners.push(
        db.collection('emails').where('assignedTo','==',email).limit(100).onSnapshot(handleSnapshot, (e)=>console.error('[BackgroundEmailsLoader] Scoped listener error (assigned):', e))
      );
      _unsubscribe = () => { try { listeners.forEach(u=>u && u()); } catch(_) {} };
      console.log('[BackgroundEmailsLoader] Scoped realtime listeners started');
    } catch (e) {
      console.warn('[BackgroundEmailsLoader] Failed to start scoped realtime listeners:', e);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('emails');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          try {
            const email = getUserEmail();
            if (!isAdmin() && email) {
              const e = String(email).toLowerCase();
              emailsData = (cached||[]).filter(x => {
                const fields = [x && x.ownerId, x && x.assignedTo, x && x.from];
                return fields.some(v => String(v||'').toLowerCase() === e);
              });
            } else {
              emailsData = cached;
            }
          } catch(_) { emailsData = cached; }
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
            try {
              const email = window.currentUserEmail || '';
              if (window.currentUserRole !== 'admin' && email) {
                const e = String(email).toLowerCase();
                emailsData = (cached||[]).filter(x => {
                  const fields = [x && x.ownerId, x && x.assignedTo, x && x.from];
                  return fields.some(v => String(v||'').toLowerCase() === e);
                });
              } else {
                emailsData = cached;
              }
            } catch(_) { emailsData = cached; }
            console.log('[BackgroundEmailsLoader] ✓ Loaded', emailsData.length, 'emails from cache (delayed, filtered)');
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
