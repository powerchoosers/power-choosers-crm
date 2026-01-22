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
  let _sentEmailsUnsubscribe = null; // Separate listener for sent email tracking updates
  let _scheduledEmailsUnsubscribe = null; // Separate listener for scheduled emails
  let _cacheWritePending = false;
  let _emailsUpdatedLastDispatchAt = 0;
  let _emailsUpdatedSuppressed = 0;
  let lastLoadedDoc = null; // For pagination
  let hasMoreData = true; // For pagination
  let _scheduledLoadedOnce = false; // Track if scheduled emails have been loaded
  let loadedFromCache = false;
  let _emailsActivated = false;

  const ADMIN_INITIAL_LIMIT = 200;
  const ADMIN_DASHBOARD_LIMIT = 50; // Smaller limit for dashboard to speed up initial load
  const PAGE_LIMIT = 100;
  const EMPLOYEE_INITIAL_LIMIT = 200;
  const EMPLOYEE_DASHBOARD_LIMIT = 50; // Smaller limit for dashboard
  let _employeeCursorOwner = null;
  let _employeeCursorAssigned = null;
  let _employeeHasMoreOwner = false;
  let _employeeHasMoreAssigned = false;
  
  // In-memory cache for folder counts (30 second expiry)
  const folderCountCache = new Map();
  const FOLDER_COUNT_EXPIRY = 30 * 1000; // 30 seconds
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
      if (typeof v === 'string') {
        const s = v.trim();
        if (/^\d{10,}$/.test(s)) return parseInt(s, 10);
        const t = new Date(s).getTime();
        return Number.isFinite(t) ? t : null;
      }
      return null;
    } catch (_) { return null; }
  };
  const isAdmin = () => {
    try { if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin==='function') return window.DataManager.isCurrentUserAdmin(); return window.currentUserRole==='admin'; } catch(_) { return false; }
  };
  const getUserEmail = () => {
    try { if (window.DataManager && typeof window.DataManager.getCurrentUserEmail==='function') return window.DataManager.getCurrentUserEmail(); return (window.currentUserEmail||'').toLowerCase(); } catch(_) { return (window.currentUserEmail||'').toLowerCase(); }
  };
  const isEmailsPageActive = () => {
    try {
      if (window.crm && window.crm.currentPage) return window.crm.currentPage === 'emails';
      const active = document.querySelector('.page.active');
      if (active && active.getAttribute('data-page') === 'emails') return true;
      const page = document.getElementById('emails-page');
      if (!page) return false;
      if (page.style && page.style.display === 'none') return false;
      return page.offsetParent !== null;
    } catch (_) { return false; }
  };

  // Coalesce noisy update bursts (multiple Firestore listeners fire near-simultaneously).
  // This prevents downstream UI (Recent Activities) from re-rendering 2-5 times in <1s (visible flicker).
  function emitEmailsUpdated(detail = {}, reason = 'unknown') {
    try {
      const now = Date.now();
      // Reduced throttle from 1200ms to 300ms for more real-time feel on dashboard
      if (_emailsUpdatedLastDispatchAt && (now - _emailsUpdatedLastDispatchAt) < 300) {
        _emailsUpdatedSuppressed++;
        return;
      }
      _emailsUpdatedLastDispatchAt = now;
      const payload = Object.assign({}, detail, { source: reason, suppressed: _emailsUpdatedSuppressed });
      _emailsUpdatedSuppressed = 0;
      document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail: payload }));
    } catch (_) {
      try { document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail })); } catch (_) {}
    }
  }
  
  // Helper to normalize a Firestore email document into our standard shape
  function normalizeEmailDoc(id, data) {
    const createdAt = tsToIso(data.createdAt);
    const updatedAt = tsToIso(data.updatedAt);
    const sentAt = tsToIso(data.sentAt);
    const receivedAt = tsToIso(data.receivedAt);
    const scheduledSendTime = tsToMs(data.scheduledSendTime); // Keep as milliseconds for numeric comparison
    const generatedAt = tsToIso(data.generatedAt);
    
    // CRITICAL: Normalize 'date' field for consistent sorting across all email sources
    // Priority: existing date field > receivedAt > sentAt > createdAt
    // This ensures emails from Gmail, SendGrid, and sequences all sort correctly
    let date = data.date;
    if (!date || typeof date !== 'string') {
      // Try to parse from receivedAt, sentAt, or createdAt
      date = receivedAt || sentAt || createdAt || new Date().toISOString();
    }
    
    const timestamp = sentAt || receivedAt || createdAt || new Date().toISOString();
    return {
      id,
      ...data,
      createdAt,
      updatedAt,
      sentAt,
      receivedAt,
      scheduledSendTime,
      generatedAt,
      timestamp,
      date, // IMPORTANT: Ensure date field is always set for sorting
      emailType: data.type || (data.provider === 'sendgrid_inbound' || data.provider === 'gmail_api' ? 'received' : 'sent')
    };
  }

  function upgradeCachedEmails(list) {
    const upgraded = [];
    let changed = false;
    for (const item of (list || [])) {
      if (!item || !item.id) continue;
      const beforeScheduled = item.scheduledSendTime;
      const beforeTimestamp = item.timestamp;
      const beforeDate = item.date;
      const normalized = normalizeEmailDoc(item.id, item);
      if (beforeScheduled !== normalized.scheduledSendTime || beforeTimestamp !== normalized.timestamp || beforeDate !== normalized.date) {
        changed = true;
      }
      upgraded.push(normalized);
    }
    return { upgraded, changed };
  }

  async function setAdminCursorFromOldestLoaded() {
    try {
      if (!window.firebaseDB) return;
      if (!emailsData || emailsData.length === 0) return;
      const withCreatedAt = emailsData
        .map(e => ({ id: e && e.id, t: e && e.createdAt ? new Date(e.createdAt).getTime() : 0 }))
        .filter(x => x.id && Number.isFinite(x.t) && x.t > 0)
        .sort((a, b) => a.t - b.t);
      const oldest = withCreatedAt[0];
      if (!oldest) return;
      const snap = await window.firebaseDB.collection('emails').doc(oldest.id).get();
      if (snap && snap.exists) {
        lastLoadedDoc = snap;
      }
    } catch (e) {
      console.warn('[BackgroundEmailsLoader] Failed to set pagination cursor from oldest loaded email:', e);
    }
  }

  async function setEmployeeCursorsFromOldestLoaded() {
    try {
      if (!window.firebaseDB) return;
      const email = (window.currentUserEmail || '').toLowerCase().trim();
      if (!email) return;
      if (!emailsData || emailsData.length === 0) return;

      const pickOldestId = (predicate) => {
        const withCreatedAt = emailsData
          .filter(predicate)
          .map(e => ({ id: e && e.id, t: e && e.createdAt ? new Date(e.createdAt).getTime() : 0 }))
          .filter(x => x.id && Number.isFinite(x.t) && x.t > 0)
          .sort((a, b) => a.t - b.t);
        return withCreatedAt[0] ? withCreatedAt[0].id : null;
      };

      const oldestOwnedId = pickOldestId(e => String(e && e.ownerId || '').toLowerCase() === email);
      const oldestAssignedId = pickOldestId(e => String(e && e.assignedTo || '').toLowerCase() === email);

      if (oldestOwnedId) {
        const snap = await window.firebaseDB.collection('emails').doc(oldestOwnedId).get();
        if (snap && snap.exists) _employeeCursorOwner = snap;
      }
      if (oldestAssignedId) {
        const snap = await window.firebaseDB.collection('emails').doc(oldestAssignedId).get();
        if (snap && snap.exists) _employeeCursorAssigned = snap;
      }
    } catch (e) {
      console.warn('[BackgroundEmailsLoader] Failed to set employee pagination cursors from cache:', e);
    }
  }

  // Ensure all scheduled emails (up to ~200) are loaded into memory so the Scheduled tab
  // is always complete and responsive, regardless of how many other emails exist.
  async function ensureAllScheduledEmailsLoaded() {
    if (_scheduledLoadedOnce) return;
    if (!window.firebaseDB) return;
    if (!isEmailsPageActive()) return;
    
    try {
      const scheduledStart = performance.now();
      const beforeCount = emailsData.length;
      const db = window.firebaseDB;
      const userEmail = (window.currentUserEmail || '').toLowerCase();
      const isEmployee = window.currentUserRole !== 'admin' && !!userEmail;
      
      const map = new Map(emailsData.map(e => [e.id, e]));
      
      if (isEmployee) {
        const e = String(userEmail).toLowerCase();
        const [ownedSnap, assignedSnap] = await Promise.all([
          db.collection('emails')
            .where('ownerId', '==', e)
            .where('type', '==', 'scheduled')
            .limit(200)
            .get(),
          db.collection('emails')
            .where('assignedTo', '==', e)
            .where('type', '==', 'scheduled')
            .limit(200)
            .get()
        ]);
        
        const applySnap = (snap) => {
          snap.forEach(doc => {
            const data = doc.data();
            map.set(doc.id, normalizeEmailDoc(doc.id, data));
          });
        };
        
        applySnap(ownedSnap);
        applySnap(assignedSnap);
      } else {
        // Admin: load up to 200 scheduled emails across the system
        const scheduledSnap = await db.collection('emails')
          .where('type', '==', 'scheduled')
          .orderBy('createdAt', 'desc')
          .limit(200)
          .get();
        
        scheduledSnap.forEach(doc => {
          const data = doc.data();
          map.set(doc.id, normalizeEmailDoc(doc.id, data));
        });
      }
      
      emailsData = Array.from(map.values())
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      
      _scheduledLoadedOnce = true;
    } catch (e) {
      console.warn('[BackgroundEmailsLoader] Failed to ensure all scheduled emails are loaded:', e.message || e);
      if (e.message && e.message.includes('index')) {
        console.error('[BackgroundEmailsLoader] INDEX ERROR: ', e.message);
      }
    }
  }
  
  async function loadFromFirestore() {
    if (!window.firebaseDB) {
      console.warn('[BackgroundEmailsLoader] firebaseDB not available');
      return;
    }
    
    try {
      const loadStart = performance.now();
      const onEmailsPage = isEmailsPageActive();
      const initialLimit = onEmailsPage 
        ? (window.currentUserRole === 'admin' ? ADMIN_INITIAL_LIMIT : EMPLOYEE_INITIAL_LIMIT)
        : (window.currentUserRole === 'admin' ? ADMIN_DASHBOARD_LIMIT : EMPLOYEE_DASHBOARD_LIMIT);


      if (window.currentUserRole !== 'admin') {
        const email = (window.currentUserEmail || '').toLowerCase().trim();
        const db = window.firebaseDB;
        const [ownedSnap, assignedSnap] = await Promise.all([
          db.collection('emails').where('ownerId', '==', email).orderBy('createdAt', 'desc').limit(initialLimit).get().catch(e => {
            return { docs: [], size: 0 };
          }),
          db.collection('emails').where('assignedTo', '==', email).orderBy('createdAt', 'desc').limit(initialLimit).get().catch(e => {
            return { docs: [], size: 0 };
          })
        ]);

        const map = new Map(emailsData.map(e => [e.id, e]));
        ownedSnap.forEach(doc => map.set(doc.id, normalizeEmailDoc(doc.id, doc.data())));
        assignedSnap.forEach(doc => map.set(doc.id, normalizeEmailDoc(doc.id, doc.data())));

        emailsData = Array.from(map.values()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        _employeeCursorOwner = ownedSnap.docs.length ? ownedSnap.docs[ownedSnap.docs.length - 1] : null;
        _employeeCursorAssigned = assignedSnap.docs.length ? assignedSnap.docs[assignedSnap.docs.length - 1] : null;
        _employeeHasMoreOwner = ownedSnap.docs.length === initialLimit;
        _employeeHasMoreAssigned = assignedSnap.docs.length === initialLimit;
        hasMoreData = _employeeHasMoreOwner || _employeeHasMoreAssigned;
      } else {
        const snapshot = await window.firebaseDB.collection('emails')
          .orderBy('createdAt', 'desc')
          .limit(initialLimit)
          .get();
        const fetched = snapshot.docs.map(doc => normalizeEmailDoc(doc.id, doc.data()));

        const map = new Map(emailsData.map(e => [e.id, e]));
        fetched.forEach(e => map.set(e.id, e));
        emailsData = Array.from(map.values());

        emailsData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (snapshot.docs.length > 0) {
          lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
          hasMoreData = snapshot.docs.length === initialLimit;
        } else {
          hasMoreData = false;
        }

        if (emailsData.length > snapshot.docs.length) {
          await setAdminCursorFromOldestLoaded();
        }
      }
      
      // Ensure ALL scheduled emails are present in memory ONLY if on Emails page
      if (onEmailsPage) {
        await ensureAllScheduledEmailsLoaded();
      }

      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('emails', emailsData);
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
        detail: { count: emailsData.length, fromFirestore: true } 
      }));

      // Start realtime listener after a delay to let the page render first (performance optimization)
      setTimeout(() => {
        if (window.currentUserRole !== 'admin') startRealtimeListenerScoped(window.currentUserEmail || ''); else startRealtimeListener();
      }, 2000); // 2 second delay
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to load from Firestore:', error.message || error);
      if (error.message && error.message.includes('index')) {
        console.error('[BackgroundEmailsLoader] INDEX ERROR - CREATE HERE: ', error.message);
      }
    }
  }

  // OPTIMIZED: Get total count using Firestore aggregation (no document loads!)
  // This reduces Firestore reads from thousands to just 1-2 per count query
  async function getTotalCount() {
    if (!window.firebaseDB) return emailsData.length;
    
    try {
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: use aggregation count for owned/assigned emails
        const e = String(email).toLowerCase();
        try {
          const [ownedCount, assignedCount] = await Promise.all([
            window.firebaseDB.collection('emails').where('ownerId','==',e).count().get(),
            window.firebaseDB.collection('emails').where('assignedTo','==',e).count().get()
          ]);
          const owned = ownedCount.data().count || 0;
          const assigned = assignedCount.data().count || 0;
          return Math.max(owned, assigned, emailsData.length);
        } catch (aggError) {
          console.warn('[BackgroundEmailsLoader] Aggregation not supported, using loaded count');
          return emailsData.length;
        }
      } else {
        // Admin: use aggregation count for all emails
        try {
          const countSnap = await window.firebaseDB.collection('emails').count().get();
          return countSnap.data().count || emailsData.length;
        } catch (aggError) {
          console.warn('[BackgroundEmailsLoader] Aggregation not supported, using loaded count');
          return emailsData.length;
        }
      }
    } catch (error) {
      console.error('[BackgroundEmailsLoader] Failed to get total count:', error);
      return emailsData.length; // Fallback to loaded count
    }
  }

  // Fast in-memory filter for folder counts (mirrors emails-redesigned.js filters)
  function getInMemoryCountByFolder(folder) {
    const isEmployee = window.currentUserRole !== 'admin';
    const userEmail = (window.currentUserEmail || '').toLowerCase();
    
    let filtered = emailsData;
    
    // Apply ownership filter for employees
    if (isEmployee && userEmail) {
      filtered = filtered.filter(email => {
        const ownerId = (email.ownerId || '').toLowerCase();
        const assignedTo = (email.assignedTo || '').toLowerCase();
        return ownerId === userEmail || assignedTo === userEmail;
      });
    }
    
    // Apply folder-specific filters (exact same logic as emails-redesigned.js)
    switch (folder) {
      case 'inbox':
        filtered = filtered.filter(email => {
          return (email.type === 'received' || 
                  email.emailType === 'received' || 
                  email.provider === 'sendgrid_inbound' ||
                  email.provider === 'gmail_api' ||
                  (!email.type && !email.emailType && !email.isSentEmail)) && 
                 !email.deleted;
        });
        break;
      case 'sent':
        filtered = filtered.filter(email => {
          const isSent = (
            email.type === 'sent' ||
            email.emailType === 'sent' ||
            email.isSentEmail === true ||
            email.status === 'sent' ||
            email.provider === 'sendgrid'
          );
          return isSent && !email.deleted;
        });
        break;
      case 'scheduled':
        // OPTIMIZATION: Pre-compute time once, use early returns, match emails-redesigned.js logic
        {
          const now = Date.now();
          const oneMinuteAgo = now - 60000;
          filtered = filtered.filter(email => {
            // Fast path: early returns for common cases
            // Exclude if type is 'sent' (already sent, even if type wasn't updated properly)
            if (email.type === 'sent' || email.deleted) return false;
            
            // Only show emails that are actually scheduled
            if (email.type !== 'scheduled') return false;
            
            const status = email.status || '';
            
            // Fast path: exclude already sent, rejected, or errored emails (multiple status indicators)
            if (status === 'sent' || status === 'delivered' || status === 'error' || status === 'rejected') return false;
            
            // Exclude emails stuck in 'sending' state if send time has passed (likely already sent)
            if (status === 'sending') {
              const sendTime = email.scheduledSendTime;
              // If send time was more than 5 minutes ago, assume it was sent
              if (sendTime && typeof sendTime === 'number' && sendTime < (now - 5 * 60 * 1000)) {
                return false;
              }
            }
            
            // Show if pending or generating (most common cases)
            if (status === 'not_generated' || status === 'pending_approval' || status === 'generating') {
              return true;
            }
            
            // Show approved emails with valid future send time
            if (status === 'approved') {
              const sendTime = email.scheduledSendTime;
              return sendTime && typeof sendTime === 'number' && sendTime >= oneMinuteAgo;
            }
            
            // Show newly created emails (no status yet) if they have scheduledSendTime
            // This ensures emails created by sequences are visible immediately
            if (!status && email.scheduledSendTime) {
              const sendTime = email.scheduledSendTime;
              // Show if send time is in the future or very recent (within last 5 minutes)
              // This catches emails that were just created and are being processed
              return sendTime && typeof sendTime === 'number' && sendTime >= (now - 5 * 60 * 1000);
            }
            
            // Exclude emails with missing/null status and no scheduledSendTime (orphaned records)
            if (!status && !email.scheduledSendTime) return false;
            
            // Exclude emails with past send times and no valid status (likely already sent)
            const sendTime = email.scheduledSendTime;
            if (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo && !status) {
              return false;
            }
            
            return false;
          });
        }
        break;
      case 'starred':
        filtered = filtered.filter(email => email.starred && !email.deleted);
        break;
      case 'trash':
        filtered = filtered.filter(email => email.deleted);
        break;
      default:
        return emailsData.length;
    }
    
    return filtered.length;
  }
  
  // Get total count for a specific folder without loading all records.
  // IMPORTANT: This must mirror the same filters used in emails-redesigned.js/applyFilters()
  // so the footer count always matches what the user can actually see.
  // folder: 'inbox' | 'sent' | 'scheduled' | 'starred' | 'trash'
  async function getTotalCountByFolder(folder) {
    // OPTIMIZATION: Check in-memory cache first (30 second expiry)
    const cacheKey = `${folder}-${window.currentUserEmail || 'admin'}`;
    const cached = folderCountCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < FOLDER_COUNT_EXPIRY) {
      return cached.count;
    }
    
    // OPTIMIZATION: Use in-memory filtering first (instant, no Firestore cost)
    // This works well when we have data already loaded in memory
    const inMemoryCount = getInMemoryCountByFolder(folder);

    // Cache the in-memory count
    folderCountCache.set(cacheKey, { count: inMemoryCount, timestamp: Date.now() });
    
    // Return the in-memory count immediately (fast path)
    // We could optionally fetch accurate count from Firestore in background for next time,
    // but for most cases, in-memory filtering is sufficient and accurate
    return inMemoryCount;
  }
  
  // Invalidate folder count cache (call when emails are updated)
  function invalidateFolderCountCache() {
    folderCountCache.clear();
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
              emailType: data.type || (data.provider === 'sendgrid_inbound' || data.provider === 'gmail_api' ? 'received' : 'sent')
            });
          });

          // IMPORTANT: Do NOT overwrite emailsData here, or we will drop
          // older pages that were loaded via pagination. Instead, merge the
          // 100 most recent documents into the existing array by id, and keep
          // everything else intact. This prevents the Scheduled/Inbox lists
          // from "shrinking" after a realtime update.
          const map = new Map(emailsData.map(e => [e.id, e]));
          updated.forEach(e => map.set(e.id, e));
          emailsData = Array.from(map.values())
            .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

          // Invalidate folder count cache when emails are updated
          invalidateFolderCountCache();

          // Throttle cache writes to avoid excessive IndexedDB operations
          if (!_cacheWritePending && window.CacheManager && typeof window.CacheManager.set === 'function') {
            _cacheWritePending = true;
            setTimeout(async () => {
              try {
                await window.CacheManager.set('emails', emailsData);
                emitEmailsUpdated({ count: emailsData.length }, 'realtime-main-cachewrite');
              } finally {
                _cacheWritePending = false;
              }
            }, 500);
          } else {
            // Still notify listeners of updated list
            emitEmailsUpdated({ count: emailsData.length }, 'realtime-main');
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

      
      // ADDITIONAL LISTENER: Watch for updates to sent emails (for tracking badges)
      // This catches webhook updates to emails that might not be in the top 100 by createdAt
      // We watch by sentAt (desc) to catch recently sent emails that get tracking updates
      // Note: This requires a Firestore composite index on (type, status, sentAt)
      // Firestore will automatically prompt to create it if missing
      if (!_sentEmailsUnsubscribe) {
        try {
          _sentEmailsUnsubscribe = window.firebaseDB
            .collection('emails')
            .where('type', '==', 'sent')
            .where('status', '==', 'sent')
            .orderBy('sentAt', 'desc')
            .limit(200) // Watch more sent emails for tracking updates
            .onSnapshot(async (snapshot) => {
              const updated = [];
              snapshot.forEach(doc => {
                const data = doc.data();
                const createdAt = tsToIso(data.createdAt);
                const updatedAt = tsToIso(data.updatedAt);
                const sentAt = tsToIso(data.sentAt);
                const receivedAt = tsToIso(data.receivedAt);
                const scheduledSendTime = tsToMs(data.scheduledSendTime);
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
                  emailType: data.type || 'sent'
                });
              });

              // Merge updates into existing data by ID (same as main listener)
              const map = new Map(emailsData.map(e => [e.id, e]));
              updated.forEach(e => map.set(e.id, e));
              emailsData = Array.from(map.values())
                .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

              // Dispatch update event so emails-redesigned.js refreshes
              emitEmailsUpdated({ count: emailsData.length }, 'realtime-sent');
              
            }, (error) => {
              console.error('[BackgroundEmailsLoader] Sent emails listener error:', error);
              // If index is missing, log a helpful message
              if (error.code === 'failed-precondition') {
                console.warn('[BackgroundEmailsLoader] Firestore index required. Check error message for index creation link.');
              }
            });
          
        } catch (e) {
          console.warn('[BackgroundEmailsLoader] Failed to start sent emails listener:', e);
        }
      }
      
      // ADDITIONAL LISTENER: Watch for scheduled emails (critical for sequence emails)
      // This ensures newly created scheduled emails are always picked up, even if they're
      // processed quickly and not in the top 100 by createdAt
      if (!_scheduledEmailsUnsubscribe) {
        try {
          _scheduledEmailsUnsubscribe = window.firebaseDB
            .collection('emails')
            .where('type', '==', 'scheduled')
            .orderBy('createdAt', 'desc')
            .limit(200) // Watch up to 200 scheduled emails
            .onSnapshot(async (snapshot) => {
              const updated = [];
              snapshot.forEach(doc => {
                const data = doc.data();
                const createdAt = tsToIso(data.createdAt);
                const updatedAt = tsToIso(data.updatedAt);
                const sentAt = tsToIso(data.sentAt);
                const receivedAt = tsToIso(data.receivedAt);
                const scheduledSendTime = tsToMs(data.scheduledSendTime);
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
                  emailType: data.type || 'scheduled'
                });
              });

              // Merge updates into existing data by ID
              const map = new Map(emailsData.map(e => [e.id, e]));
              updated.forEach(e => map.set(e.id, e));
              emailsData = Array.from(map.values())
                .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

              // Invalidate folder count cache
              invalidateFolderCountCache();

              // Dispatch update event so emails-redesigned.js refreshes
              emitEmailsUpdated({ count: emailsData.length }, 'realtime-scheduled');
              
            }, (error) => {
              console.error('[BackgroundEmailsLoader] Scheduled emails listener error:', error);
              // If index is missing, log a helpful message
              if (error.code === 'failed-precondition') {
                console.warn('[BackgroundEmailsLoader] Firestore index required for scheduled emails. Check error message for index creation link.');
              }
            });
          
        } catch (e) {
          console.warn('[BackgroundEmailsLoader] Failed to start scheduled emails listener:', e);
        }
      }
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
        
        // Invalidate folder count cache when emails are updated
        invalidateFolderCountCache();
        
        if (!_cacheWritePending && window.CacheManager && typeof window.CacheManager.set === 'function') {
          _cacheWritePending = true;
          setTimeout(async () => {
            try {
              await window.CacheManager.set('emails', emailsData);
              emitEmailsUpdated({ count: emailsData.length }, 'realtime-scoped-cachewrite');
            } finally { _cacheWritePending = false; }
          }, 500);
        } else {
          emitEmailsUpdated({ count: emailsData.length }, 'realtime-scoped');
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
      // Add scheduled emails listener for employees (critical for sequence emails)
      listeners.push(
        db.collection('emails')
          .where('type', '==', 'scheduled')
          .where('ownerId', '==', email)
          .orderBy('createdAt', 'desc')
          .limit(200)
          .onSnapshot(handleSnapshot, (e) => handleError(e, 'scheduled-owned'))
      );
      listeners.push(
        db.collection('emails')
          .where('type', '==', 'scheduled')
          .where('assignedTo', '==', email)
          .orderBy('createdAt', 'desc')
          .limit(200)
          .onSnapshot(handleSnapshot, (e) => handleError(e, 'scheduled-assigned'))
      );
      _unsubscribe = () => { try { listeners.forEach(u=>u && u()); } catch(_) {} };
    } catch (e) {
      console.warn('[BackgroundEmailsLoader] Failed to start scoped realtime listeners:', e);
    }
  }

  async function activateEmailsLoader() {
    if (_emailsActivated) return;
    _emailsActivated = true;
    await loadFromFirestore();
  }
  
  // Load from cache immediately on module init
  (async function() {
    const allowFirestore = isEmailsPageActive();
    if (allowFirestore) {
      _emailsActivated = true;
    }
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('emails');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          const { upgraded, changed } = upgradeCachedEmails(cached);
          if (changed && window.CacheManager && typeof window.CacheManager.set === 'function') {
            window.CacheManager.set('emails', upgraded).catch(() => {});
          }
          try {
            const email = window.currentUserEmail || '';
            if (window.currentUserRole !== 'admin' && email) {
              const e = String(email).toLowerCase();
              emailsData = (upgraded||[]).filter(x => {
                // Only check ownership fields (ownerId, assignedTo)
                // Don't check 'from' - that's the sender, not the owner
                const ownerId = String(x && x.ownerId || '').toLowerCase();
                const assignedTo = String(x && x.assignedTo || '').toLowerCase();
                return ownerId === e || assignedTo === e;
              });
            } else {
              emailsData = upgraded;
            }
          } catch(_) { emailsData = cached; }

          loadedFromCache = true;
          
          // Check if there are more emails in Firestore (even if we loaded from cache)
          // For admin users: if we have 100 emails (batch size), assume there might be more
          // For non-admin: assume cache has all their data
          if (window.currentUserRole === 'admin') {
            // If we have 100 emails (our batch size), there might be more
            if (emailsData.length >= ADMIN_INITIAL_LIMIT) {
              hasMoreData = true; // Assume there might be more
              // Try to get lastLoadedDoc by querying for the oldest email
              // This ensures we can paginate correctly
              try {
                if (allowFirestore) {
                  await setAdminCursorFromOldestLoaded();
                }
              } catch (error) {
                console.warn('[BackgroundEmailsLoader] Could not set lastLoadedDoc from cache:', error);
                // If we can't set it now, loadMore will try to reload from Firestore
                lastLoadedDoc = null;
              }
            } else {
              // Less than 100, probably all data
              hasMoreData = false;
              lastLoadedDoc = null;
            }
          } else {
            lastLoadedDoc = null;
            const e = (window.currentUserEmail || '').toLowerCase().trim();
            const ownedCount = e ? emailsData.filter(x => String(x && x.ownerId || '').toLowerCase() === e).length : 0;
            const assignedCount = e ? emailsData.filter(x => String(x && x.assignedTo || '').toLowerCase() === e).length : 0;
            _employeeHasMoreOwner = ownedCount >= EMPLOYEE_INITIAL_LIMIT;
            _employeeHasMoreAssigned = assignedCount >= EMPLOYEE_INITIAL_LIMIT;
            hasMoreData = _employeeHasMoreOwner || _employeeHasMoreAssigned;
            if (hasMoreData) {
              if (allowFirestore) {
                await setEmployeeCursorsFromOldestLoaded();
              }
            } else {
              _employeeCursorOwner = null;
              _employeeCursorAssigned = null;
            }
          }

          if (allowFirestore) {
            await ensureAllScheduledEmailsLoaded();
          }

          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));

          if (allowFirestore) {
            if (window.currentUserRole !== 'admin') {
              startRealtimeListenerScoped(window.currentUserEmail || '');
            } else {
              startRealtimeListener();
            }
            loadFromFirestore().catch(e => console.warn('[BackgroundEmailsLoader] Background refresh after cache load failed:', e));
          }
        } else {
          if (allowFirestore) {
            await loadFromFirestore();
          }
        }
      } catch (e) {
        console.warn('[BackgroundEmailsLoader] Cache load failed:', e);
        if (allowFirestore) {
          await loadFromFirestore();
        }
      }
    } else {
      console.warn('[BackgroundEmailsLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        const allowFirestore = isEmailsPageActive();
        if (allowFirestore) {
          _emailsActivated = true;
        }
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('emails');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            const { upgraded, changed } = upgradeCachedEmails(cached);
            if (changed && window.CacheManager && typeof window.CacheManager.set === 'function') {
              window.CacheManager.set('emails', upgraded).catch(() => {});
            }
            try {
              const email = window.currentUserEmail || '';
              if (window.currentUserRole !== 'admin' && email) {
                const e = String(email).toLowerCase();
                emailsData = (upgraded||[]).filter(x => {
                  // Only check ownership fields (ownerId, assignedTo)
                  // Don't check 'from' - that's the sender, not the owner
                  const ownerId = String(x && x.ownerId || '').toLowerCase();
                  const assignedTo = String(x && x.assignedTo || '').toLowerCase();
                  return ownerId === e || assignedTo === e;
                });
              } else {
                emailsData = upgraded;
              }
            } catch(_) { emailsData = cached; }

            loadedFromCache = true;

            if (allowFirestore) {
              await ensureAllScheduledEmailsLoaded();
            }

            // Check if there are more emails (same logic as main cache load)
            if (window.currentUserRole === 'admin') {
              if (emailsData.length >= ADMIN_INITIAL_LIMIT) {
                hasMoreData = true;
                // Try to get lastLoadedDoc by document ID
                try {
                  if (allowFirestore) {
                    await setAdminCursorFromOldestLoaded();
                  }
                } catch (error) {
                  console.warn('[BackgroundEmailsLoader] Could not set lastLoadedDoc from cache (delayed):', error);
                  lastLoadedDoc = null;
                }
              } else {
                hasMoreData = false;
                lastLoadedDoc = null;
              }
            } else {
              lastLoadedDoc = null;
              const e = (window.currentUserEmail || '').toLowerCase().trim();
              const ownedCount = e ? emailsData.filter(x => String(x && x.ownerId || '').toLowerCase() === e).length : 0;
              const assignedCount = e ? emailsData.filter(x => String(x && x.assignedTo || '').toLowerCase() === e).length : 0;
              _employeeHasMoreOwner = ownedCount >= EMPLOYEE_INITIAL_LIMIT;
              _employeeHasMoreAssigned = assignedCount >= EMPLOYEE_INITIAL_LIMIT;
              hasMoreData = _employeeHasMoreOwner || _employeeHasMoreAssigned;
              if (hasMoreData) {
                if (allowFirestore) {
                  await setEmployeeCursorsFromOldestLoaded();
                }
              } else {
                _employeeCursorOwner = null;
                _employeeCursorAssigned = null;
              }
            }
            
            document.dispatchEvent(new CustomEvent('pc:emails-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));

            if (allowFirestore) {
              if (window.currentUserRole !== 'admin') {
                startRealtimeListenerScoped(window.currentUserEmail || '');
              } else {
                startRealtimeListener();
              }
              loadFromFirestore().catch(e => console.warn('[BackgroundEmailsLoader] Background refresh after delayed cache load failed:', e));
            }
          } else {
            if (allowFirestore) {
              await loadFromFirestore();
            }
          }
        }
      }, 500);
    }
  })();
  
  // Load more emails (pagination)
  async function loadMoreEmails() {
    if (!hasMoreData) {
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundEmailsLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      if (window.currentUserRole !== 'admin') {
        const email = (window.currentUserEmail || '').toLowerCase().trim();
        const db = window.firebaseDB;
        let loaded = 0;

        if ((_employeeHasMoreOwner && !_employeeCursorOwner) || (_employeeHasMoreAssigned && !_employeeCursorAssigned)) {
          await setEmployeeCursorsFromOldestLoaded();
        }

        const map = new Map(emailsData.map(e => [e.id, e]));

        if (_employeeHasMoreOwner && _employeeCursorOwner) {
          const ownedSnap = await db.collection('emails')
            .where('ownerId', '==', email)
            .orderBy('createdAt', 'desc')
            .startAfter(_employeeCursorOwner)
            .limit(PAGE_LIMIT)
            .get();
          ownedSnap.forEach(doc => {
            loaded++;
            map.set(doc.id, normalizeEmailDoc(doc.id, doc.data()));
          });
          _employeeCursorOwner = ownedSnap.docs.length ? ownedSnap.docs[ownedSnap.docs.length - 1] : _employeeCursorOwner;
          _employeeHasMoreOwner = ownedSnap.docs.length === PAGE_LIMIT;
        }

        if (_employeeHasMoreAssigned && _employeeCursorAssigned) {
          const assignedSnap = await db.collection('emails')
            .where('assignedTo', '==', email)
            .orderBy('createdAt', 'desc')
            .startAfter(_employeeCursorAssigned)
            .limit(PAGE_LIMIT)
            .get();
          assignedSnap.forEach(doc => {
            loaded++;
            map.set(doc.id, normalizeEmailDoc(doc.id, doc.data()));
          });
          _employeeCursorAssigned = assignedSnap.docs.length ? assignedSnap.docs[assignedSnap.docs.length - 1] : _employeeCursorAssigned;
          _employeeHasMoreAssigned = assignedSnap.docs.length === PAGE_LIMIT;
        }

        emailsData = Array.from(map.values()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        hasMoreData = _employeeHasMoreOwner || _employeeHasMoreAssigned;

        if (window.CacheManager && typeof window.CacheManager.set === 'function') {
          await window.CacheManager.set('emails', emailsData);
        }

        document.dispatchEvent(new CustomEvent('pc:emails-loaded-more', {
          detail: { count: loaded, total: emailsData.length, hasMore: hasMoreData }
        }));

        return { loaded, hasMore: hasMoreData };
      }
      
      if (!lastLoadedDoc) {
        await setAdminCursorFromOldestLoaded();
        if (!lastLoadedDoc) {
          console.warn('[BackgroundEmailsLoader] No lastLoadedDoc for pagination (attempted init)');
          return { loaded: 0, hasMore: false };
        }
      }
      
      const snapshot = await window.firebaseDB.collection('emails')
        .orderBy('createdAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(PAGE_LIMIT)
        .get();
      
      const newEmails = snapshot.docs.map(doc => normalizeEmailDoc(doc.id, doc.data()));
      
      const map = new Map(emailsData.map(e => [e.id, e]));
      newEmails.forEach(e => map.set(e.id, e));
      emailsData = Array.from(map.values()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === PAGE_LIMIT;
      } else {
        hasMoreData = false;
      }
      
      
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
  
  // Remove email by ID from in-memory data (for immediate UI updates after delete/reject)
  function removeEmailById(emailId) {
    if (!emailId) return false;
    const index = emailsData.findIndex(e => e.id === emailId);
    if (index !== -1) {
      emailsData.splice(index, 1);
      invalidateFolderCountCache();
      return true;
    }
    return false;
  }
  
  // Update email status in memory (for immediate UI updates after status change)
  function updateEmailStatus(emailId, newStatus) {
    if (!emailId) return false;
    const email = emailsData.find(e => e.id === emailId);
    if (email) {
      email.status = newStatus;
      email.updatedAt = new Date().toISOString();
      invalidateFolderCountCache();
      return true;
    }
    return false;
  }
  
  // Export public API
  window.BackgroundEmailsLoader = {
    getEmailsData: () => emailsData,
    reload: loadFromFirestore,
    loadMore: loadMoreEmails,
    ensureScheduledLoaded: ensureAllScheduledEmailsLoaded,
    activate: activateEmailsLoader,
    unsubscribe: () => { 
      try { 
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; } 
        if (_sentEmailsUnsubscribe) { _sentEmailsUnsubscribe(); _sentEmailsUnsubscribe = null; } 
        if (_scheduledEmailsUnsubscribe) { _scheduledEmailsUnsubscribe(); _scheduledEmailsUnsubscribe = null; } 
      } catch(_) {} 
    },
    getCount: () => emailsData.length,
    hasMore: () => hasMoreData,
    getTotalCount: getTotalCount,
    getTotalCountByFolder: getTotalCountByFolder,
    invalidateFolderCountCache: invalidateFolderCountCache,
    getInMemoryCountByFolder: getInMemoryCountByFolder,
    removeEmailById: removeEmailById,
    updateEmailStatus: updateEmailStatus,
    isFromCache: () => loadedFromCache
  };
  
})();
