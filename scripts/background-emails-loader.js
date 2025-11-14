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
  let lastLoadedDoc = null; // For pagination
  let hasMoreData = true; // For pagination
  const tsToIso = (v) => {
    try {
      if (!v) return null;
      if (typeof v.toDate === 'function') return v.toDate().toISOString();
      if (typeof v === 'string') return v;
      return null;
    } catch (_) { return null; }
  };
  
  // Convert timestamp to milliseconds (for scheduledSendTime which needs numeric comparison)
  const tsToMs = (v) => {
    try {
      if (!v) return null;
      if (typeof v === 'number') return v;
      if (typeof v.toDate === 'function') return v.toDate().getTime();
      if (typeof v === 'string') return new Date(v).getTime();
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
      // Clear old cache format (scheduledSendTime was string, now it's number)
      if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        await window.CacheManager.invalidate('emails');
        console.log('[BackgroundEmailsLoader] Cleared old email cache');
      }
      
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
          const scheduledSendTime = tsToMs(data.scheduledSendTime); // Keep as milliseconds for numeric comparison
          const generatedAt = tsToIso(data.generatedAt);
          const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
          return { ...data, createdAt, updatedAt, sentAt, receivedAt, scheduledSendTime, generatedAt, timestamp, emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent') };
        });
        // Sort newest first
        emailsData.sort((a,b)=> new Date(b.timestamp||0) - new Date(a.timestamp||0));
      } else {
        // Admin: Load initial 200 emails to cover more date range (pagination will load more as needed)
        const snapshot = await window.firebaseDB.collection('emails')
          .orderBy('createdAt', 'desc')
          .limit(200)
          .get();
        
        emailsData = snapshot.docs.map(doc => {
          const data = doc.data();
          const createdAt = tsToIso(data.createdAt);
          const updatedAt = tsToIso(data.updatedAt);
          const sentAt = tsToIso(data.sentAt);
          const receivedAt = tsToIso(data.receivedAt);
          const scheduledSendTime = tsToMs(data.scheduledSendTime); // Keep as milliseconds for numeric comparison
          const generatedAt = tsToIso(data.generatedAt);
          // Prioritize actual sent/received dates over creation date for display
          const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
          return {
            id: doc.id,
            ...data,
            createdAt,
            updatedAt,
            sentAt,
            receivedAt,
            scheduledSendTime,
            generatedAt,
            timestamp,
            emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
          };
        });
        
        // Sort by timestamp (actual sent/received date) instead of createdAt for better date continuity
        emailsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Track pagination state
        if (snapshot.docs.length > 0) {
          lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
          hasMoreData = snapshot.docs.length === 200;
        } else {
          hasMoreData = false;
        }
        
        console.log('[BackgroundEmailsLoader] Admin loaded, date range:', 
                    emailsData.length > 0 ? `${emailsData[emailsData.length-1].timestamp} to ${emailsData[0].timestamp}` : 'none');
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

      // Start realtime listener after a delay to let the page render first (performance optimization)
      setTimeout(() => {
        console.log('[BackgroundEmailsLoader] Starting real-time listener...');
      if (window.currentUserRole !== 'admin') startRealtimeListenerScoped(window.currentUserEmail || ''); else startRealtimeListener();
      }, 2000); // 2 second delay
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to load from Firestore:', error);
    }
  }

  // Load more emails (pagination) - similar to background-contacts-loader.js
  async function loadMoreEmails() {
    if (!hasMoreData) {
      console.log('[BackgroundEmailsLoader] No more data to load');
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundEmailsLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      if (window.currentUserRole !== 'admin') {
        // For employees, we already scoped and disabled pagination (100 limit)
        return { loaded: 0, hasMore: false };
      }
      
      if (!lastLoadedDoc) {
        console.warn('[BackgroundEmailsLoader] No lastLoadedDoc, cannot paginate');
        return { loaded: 0, hasMore: false };
      }
      
      console.log('[BackgroundEmailsLoader] Loading next batch...');
      const snapshot = await window.firebaseDB.collection('emails')
        .orderBy('createdAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100)
        .get();
      
      const newEmails = snapshot.docs.map(doc => {
        const data = doc.data();
        const createdAt = tsToIso(data.createdAt);
        const updatedAt = tsToIso(data.updatedAt);
        const sentAt = tsToIso(data.sentAt);
        const receivedAt = tsToIso(data.receivedAt);
        const scheduledSendTime = tsToMs(data.scheduledSendTime); // Keep as milliseconds for numeric comparison
        const generatedAt = tsToIso(data.generatedAt);
        const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
        return {
          id: doc.id,
          ...data,
          createdAt,
          updatedAt,
          sentAt,
          receivedAt,
          scheduledSendTime,
          generatedAt,
          timestamp,
          emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
        };
      });
      
      // Append to existing data
      emailsData = [...emailsData, ...newEmails];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundEmailsLoader] ✓ Loaded', newEmails.length, 'more emails. Total:', emailsData.length, hasMoreData ? '(more available)' : '(all loaded)');
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('emails', emailsData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:emails-loaded-more', { 
        detail: { count: newEmails.length, total: emailsData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newEmails.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }

  // Get total count from Firestore without loading all records
  async function getTotalCount() {
    if (!window.firebaseDB) return 0;
    
    try {
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: count only owned/assigned emails
        const e = String(email).toLowerCase();
        const [ownedSnap, assignedSnap] = await Promise.all([
          window.firebaseDB.collection('emails').where('ownerId','==',e).get(),
          window.firebaseDB.collection('emails').where('assignedTo','==',e).get()
        ]);
        const map = new Map();
        ownedSnap.forEach(d=>map.set(d.id, d.id));
        assignedSnap.forEach(d=>map.set(d.id, d.id));
        return map.size;
      } else {
        // Admin: count all emails
        const snapshot = await window.firebaseDB.collection('emails').get();
        return snapshot.size;
      }
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to get total count:', error);
      return emailsData.length; // Fallback to loaded count
    }
  }

  // Get total count for a specific folder without loading all records
  // folder: 'inbox' | 'sent' | 'scheduled' | 'starred' | 'trash'
  async function getTotalCountByFolder(folder) {
    if (!window.firebaseDB) return 0;
    const db = window.firebaseDB.collection('emails');
    const isEmployee = window.currentUserRole !== 'admin';
    const user = (window.currentUserEmail || '').toLowerCase();
    const idSet = new Set();
    
    const runQuery = async (builder) => {
      try {
        const snap = await builder.get();
        snap.forEach(d => idSet.add(d.id));
      } catch (e) {
        console.warn('[BackgroundEmailsLoader] Count query failed for folder', folder, e);
      }
    };
    
    try {
      switch (folder) {
        case 'inbox': {
          // Union of: type == 'received' OR provider == 'sendgrid_inbound'
          if (isEmployee && user) {
            await runQuery(db.where('ownerId','==',user).where('type','==','received'));
            await runQuery(db.where('assignedTo','==',user).where('type','==','received'));
            await runQuery(db.where('ownerId','==',user).where('provider','==','sendgrid_inbound'));
            await runQuery(db.where('assignedTo','==',user).where('provider','==','sendgrid_inbound'));
          } else {
            await runQuery(db.where('type','==','received'));
            await runQuery(db.where('provider','==','sendgrid_inbound'));
          }
          break;
        }
        case 'sent': {
          // Union of: type == 'sent' OR provider == 'sendgrid'
          if (isEmployee && user) {
            await runQuery(db.where('ownerId','==',user).where('type','==','sent'));
            await runQuery(db.where('assignedTo','==',user).where('type','==','sent'));
            await runQuery(db.where('ownerId','==',user).where('provider','==','sendgrid'));
            await runQuery(db.where('assignedTo','==',user).where('provider','==','sendgrid'));
          } else {
            await runQuery(db.where('type','==','sent'));
            await runQuery(db.where('provider','==','sendgrid'));
          }
          break;
        }
        case 'scheduled': {
          if (isEmployee && user) {
            await runQuery(db.where('ownerId','==',user).where('type','==','scheduled'));
            await runQuery(db.where('assignedTo','==',user).where('type','==','scheduled'));
          } else {
            await runQuery(db.where('type','==','scheduled'));
          }
          break;
        }
        case 'starred': {
          if (isEmployee && user) {
            await runQuery(db.where('ownerId','==',user).where('starred','==',true));
            await runQuery(db.where('assignedTo','==',user).where('starred','==',true));
          } else {
            await runQuery(db.where('starred','==',true));
          }
          break;
        }
        case 'trash': {
          if (isEmployee && user) {
            await runQuery(db.where('ownerId','==',user).where('deleted','==',true));
            await runQuery(db.where('assignedTo','==',user).where('deleted','==',true));
          } else {
            await runQuery(db.where('deleted','==',true));
          }
          break;
        }
        default: {
          // Fallback to total
          return await getTotalCount();
        }
      }
      return idSet.size;
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to get folder count:', folder, error);
      return 0;
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
            const scheduledSendTime = tsToMs(data.scheduledSendTime); // Keep as milliseconds for numeric comparison
            const generatedAt = tsToIso(data.generatedAt);
            const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
            updated.push({
              id: doc.id,
              ...data,
              createdAt,
              updatedAt,
              sentAt,
              receivedAt,
              scheduledSendTime,
              generatedAt,
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
          
          // Handle permission denied errors gracefully
          if (error.code === 'permission-denied') {
            console.warn('[BackgroundEmailsLoader] Permission denied - user may not have access to emails');
            emailsData = []; // Clear data
            document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
              detail: { count: 0, error: 'permission-denied' } 
            }));
          }
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
          const scheduledSendTime = tsToMs(data.scheduledSendTime); // Keep as milliseconds for numeric comparison
          const generatedAt = tsToIso(data.generatedAt);
          const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
          updated.push({ id: doc.id, ...data, createdAt, updatedAt, sentAt, receivedAt, scheduledSendTime, generatedAt, timestamp, emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent') });
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
      const handleError = (e, type) => {
        console.error(`[BackgroundEmailsLoader] Scoped listener error (${type}):`, e);
        if (e.code === 'permission-denied') {
          console.warn(`[BackgroundEmailsLoader] Permission denied for ${type} query`);
          emailsData = [];
          document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
            detail: { count: 0, error: 'permission-denied' } 
          }));
        }
      };
      
      listeners.push(
        db.collection('emails').where('ownerId','==',email).limit(100).onSnapshot(handleSnapshot, (e)=>handleError(e, 'owner'))
      );
      listeners.push(
        db.collection('emails').where('assignedTo','==',email).limit(100).onSnapshot(handleSnapshot, (e)=>handleError(e, 'assigned'))
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
            const email = window.currentUserEmail || '';
            if (window.currentUserRole !== 'admin' && email) {
              const e = String(email).toLowerCase();
              emailsData = (cached||[]).filter(x => {
                // Only check ownership fields (ownerId, assignedTo)
                // Don't check 'from' - that's the sender, not the owner
                const ownerId = String(x && x.ownerId || '').toLowerCase();
                const assignedTo = String(x && x.assignedTo || '').toLowerCase();
                return ownerId === e || assignedTo === e;
              });
            } else {
              emailsData = cached;
            }
          } catch(_) { emailsData = cached; }
          console.log('[BackgroundEmailsLoader] ✓ Loaded', cached.length, 'emails from cache');
          
          // Check if there are more emails in Firestore (even if we loaded from cache)
          // For admin users: if we have 100 emails (batch size), assume there might be more
          // For non-admin: assume cache has all their data
          if (window.currentUserRole === 'admin') {
            // If we have 100 emails (our batch size), there might be more
            if (emailsData.length >= 100) {
              hasMoreData = true; // Assume there might be more
              // Try to get lastLoadedDoc by querying for the oldest email
              // This ensures we can paginate correctly
              try {
                const sorted = [...emailsData].sort((a, b) => {
                  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return aTime - bTime; // Oldest first
                });
                const oldestEmail = sorted[0];
                if (oldestEmail && oldestEmail.id && window.firebaseDB) {
                  // Get the document by ID (simpler than querying by createdAt)
                  const docRef = window.firebaseDB.collection('emails').doc(oldestEmail.id);
                  const docSnap = await docRef.get();
                  if (docSnap.exists) {
                    lastLoadedDoc = docSnap;
                    console.log('[BackgroundEmailsLoader] Set lastLoadedDoc from cache (oldest email ID)');
                  }
                }
              } catch (error) {
                console.warn('[BackgroundEmailsLoader] Could not set lastLoadedDoc from cache:', error);
                // If we can't set it now, loadMore will try to reload from Firestore
                lastLoadedDoc = null;
              }
              console.log('[BackgroundEmailsLoader] Cache has 100+ emails, assuming more available. hasMoreData:', hasMoreData);
            } else {
              // Less than 100, probably all data
              hasMoreData = false;
              lastLoadedDoc = null;
              console.log('[BackgroundEmailsLoader] Cache has <100 emails, assuming all loaded');
            }
          } else {
            // For non-admin users, assume cache has all their data (they have limited access)
            lastLoadedDoc = null;
            hasMoreData = false;
          }
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));

          // Ensure realtime listener is running even when using cache first
          // Use scoped listener for non-admin users, full listener for admins
          if (window.currentUserRole !== 'admin') {
            startRealtimeListenerScoped(window.currentUserEmail || '');
          } else {
          startRealtimeListener();
          }
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
                  // Only check ownership fields (ownerId, assignedTo)
                  // Don't check 'from' - that's the sender, not the owner
                  const ownerId = String(x && x.ownerId || '').toLowerCase();
                  const assignedTo = String(x && x.assignedTo || '').toLowerCase();
                  return ownerId === e || assignedTo === e;
                });
              } else {
                emailsData = cached;
              }
            } catch(_) { emailsData = cached; }
            console.log('[BackgroundEmailsLoader] ✓ Loaded', emailsData.length, 'emails from cache (delayed, filtered)');
            
            // Check if there are more emails (same logic as main cache load)
            if (window.currentUserRole === 'admin') {
              if (emailsData.length >= 100) {
                hasMoreData = true;
                // Try to get lastLoadedDoc by document ID
                try {
                  const sorted = [...emailsData].sort((a, b) => {
                    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return aTime - bTime;
                  });
                  const oldestEmail = sorted[0];
                  if (oldestEmail && oldestEmail.id && window.firebaseDB) {
                    const docRef = window.firebaseDB.collection('emails').doc(oldestEmail.id);
                    const docSnap = await docRef.get();
                    if (docSnap.exists) {
                      lastLoadedDoc = docSnap;
                    }
                  }
                } catch (error) {
                  console.warn('[BackgroundEmailsLoader] Could not set lastLoadedDoc from cache (delayed):', error);
                  lastLoadedDoc = null;
                }
                console.log('[BackgroundEmailsLoader] Cache has 100+ emails (delayed), assuming more available');
              } else {
                hasMoreData = false;
                lastLoadedDoc = null;
              }
            } else {
              lastLoadedDoc = null;
              hasMoreData = false;
            }
            
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
  
  // Load more emails (pagination)
  async function loadMoreEmails() {
    if (!hasMoreData) {
      console.log('[BackgroundEmailsLoader] No more data to load');
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundEmailsLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      if (window.currentUserRole !== 'admin') {
        // For employees, pagination is disabled (they get all their emails in initial load)
        return { loaded: 0, hasMore: false };
      }
      
      if (!lastLoadedDoc) {
        console.warn('[BackgroundEmailsLoader] No lastLoadedDoc for pagination');
        return { loaded: 0, hasMore: false };
      }
      
      console.log('[BackgroundEmailsLoader] Loading next batch...');
      const snapshot = await window.firebaseDB.collection('emails')
        .orderBy('createdAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100)
        .get();
      
      const newEmails = snapshot.docs.map(doc => {
        const data = doc.data();
        const createdAt = tsToIso(data.createdAt);
        const updatedAt = tsToIso(data.updatedAt);
        const sentAt = tsToIso(data.sentAt);
        const receivedAt = tsToIso(data.receivedAt);
        const scheduledSendTime = tsToMs(data.scheduledSendTime); // Keep as milliseconds for numeric comparison
        const generatedAt = tsToIso(data.generatedAt);
        const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
        return {
          id: doc.id,
          ...data,
          createdAt,
          updatedAt,
          sentAt,
          receivedAt,
          scheduledSendTime,
          generatedAt,
          timestamp,
          emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
        };
      });
      
      // Append to existing data
      emailsData = [...emailsData, ...newEmails];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      console.log('[BackgroundEmailsLoader] ✓ Loaded', newEmails.length, 'more emails. Total:', emailsData.length, hasMoreData ? '(more available)' : '(all loaded)');
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('emails', emailsData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:emails-loaded-more', { 
        detail: { count: newEmails.length, total: emailsData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newEmails.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // Export public API
  window.BackgroundEmailsLoader = {
    getEmailsData: () => emailsData,
    reload: loadFromFirestore,
    loadMore: loadMoreEmails,
    unsubscribe: () => { try { if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; } } catch(_) {} },
    getCount: () => emailsData.length,
    hasMore: () => hasMoreData,
    getTotalCount: getTotalCount,
    getTotalCountByFolder: getTotalCountByFolder
  };
  
  console.log('[BackgroundEmailsLoader] Module initialized');
})();
