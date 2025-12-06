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
  let lastLoadedDoc = null; // For pagination
  let hasMoreData = true; // For pagination
  let _scheduledLoadedOnce = false; // Track if scheduled emails have been loaded
  
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

  // Ensure all scheduled emails (up to ~200) are loaded into memory so the Scheduled tab
  // is always complete and responsive, regardless of how many other emails exist.
  async function ensureAllScheduledEmailsLoaded() {
    if (_scheduledLoadedOnce) return;
    if (!window.firebaseDB) return;
    
    try {
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
      console.log('[BackgroundEmailsLoader] ✓ Ensured all scheduled emails loaded into memory (up to 200)');
    } catch (e) {
      console.warn('[BackgroundEmailsLoader] Failed to ensure all scheduled emails are loaded:', e);
    }
  }
  
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
        emailsData = raw.map((data) => normalizeEmailDoc(data.id || data.id, data));
        // Sort newest first
        emailsData.sort((a,b)=> new Date(b.timestamp||0) - new Date(a.timestamp||0));
      } else {
        // Admin: Load initial 200 emails to cover more date range (pagination will load more as needed)
        const snapshot = await window.firebaseDB.collection('emails')
          .orderBy('createdAt', 'desc')
          .limit(200)
          .get();
        
        emailsData = snapshot.docs.map(doc => normalizeEmailDoc(doc.id, doc.data()));
        
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
      
      // Ensure ALL scheduled emails (up to 200) are present in memory so the Scheduled tab is complete
      await ensureAllScheduledEmailsLoaded();
      
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
          emailType: data.type || (data.provider === 'sendgrid_inbound' || data.provider === 'gmail_api' ? 'received' : 'sent')
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
      console.log(`[BackgroundEmailsLoader] Folder count cache HIT for ${folder}: ${cached.count}`);
      return cached.count;
    }
    
    // OPTIMIZATION: Use in-memory filtering first (instant, no Firestore cost)
    // This works well when we have data already loaded in memory
    const inMemoryCount = getInMemoryCountByFolder(folder);
    console.log(`[BackgroundEmailsLoader] In-memory count for ${folder}: ${inMemoryCount}`);
    
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
    console.log('[BackgroundEmailsLoader] Folder count cache cleared');
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
              document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail: { count: emailsData.length } }));
              
              console.log('[BackgroundEmailsLoader] Sent emails listener updated', updated.length, 'emails');
            }, (error) => {
              console.error('[BackgroundEmailsLoader] Sent emails listener error:', error);
              // If index is missing, log a helpful message
              if (error.code === 'failed-precondition') {
                console.warn('[BackgroundEmailsLoader] Firestore index required. Check error message for index creation link.');
              }
            });
          
          console.log('[BackgroundEmailsLoader] Sent emails tracking listener started');
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
              document.dispatchEvent(new CustomEvent('pc:emails-updated', { detail: { count: emailsData.length } }));
              
              console.log('[BackgroundEmailsLoader] Scheduled emails listener updated', updated.length, 'emails');
            }, (error) => {
              console.error('[BackgroundEmailsLoader] Scheduled emails listener error:', error);
              // If index is missing, log a helpful message
              if (error.code === 'failed-precondition') {
                console.warn('[BackgroundEmailsLoader] Firestore index required for scheduled emails. Check error message for index creation link.');
              }
            });
          
          console.log('[BackgroundEmailsLoader] Scheduled emails listener started');
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
      console.log('[BackgroundEmailsLoader] Scoped realtime listeners started (including scheduled emails)');
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
          
          // Ensure scheduled emails are present even when served from cache
          await ensureAllScheduledEmailsLoaded();
          
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

        // Fire a background refresh to avoid stale cache (non-blocking)
        // This keeps Scheduled/Sent tabs in sync after server-side changes.
        loadFromFirestore().catch(e => console.warn('[BackgroundEmailsLoader] Background refresh after cache load failed:', e));
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
            
            // Ensure scheduled emails are present even when served from cache (delayed path)
            await ensureAllScheduledEmailsLoaded();
            
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

            // Start listeners after cache load
            if (window.currentUserRole !== 'admin') {
              startRealtimeListenerScoped(window.currentUserEmail || '');
            } else {
              startRealtimeListener();
            }

            // Kick off a background refresh to avoid stale cache (non-blocking)
            loadFromFirestore().catch(e => console.warn('[BackgroundEmailsLoader] Background refresh after delayed cache load failed:', e));
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
          emailType: data.type || (data.provider === 'sendgrid_inbound' || data.provider === 'gmail_api' ? 'received' : 'sent')
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
  
  // Remove email by ID from in-memory data (for immediate UI updates after delete/reject)
  function removeEmailById(emailId) {
    if (!emailId) return false;
    const index = emailsData.findIndex(e => e.id === emailId);
    if (index !== -1) {
      emailsData.splice(index, 1);
      console.log('[BackgroundEmailsLoader] Removed email from memory:', emailId);
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
      console.log('[BackgroundEmailsLoader] Updated email status in memory:', emailId, newStatus);
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
    updateEmailStatus: updateEmailStatus
  };
  
  console.log('[BackgroundEmailsLoader] Module initialized');
})();
