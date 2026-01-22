/**
 * Background Sequences Loader
 * 
 * Loads sequences data immediately from cache (or Firestore if cache empty)
 * on app initialization, making data globally available for instant access.
 * 
 * Features:
 * - Cache-first loading (zero Firestore reads after first visit)
 * - Global data availability via window.BackgroundSequencesLoader
 * - Event notifications when data is ready
 * - Automatic fallback to Firestore if cache is empty
 */

(function() {
  let sequencesData = [];
  let lastLoadedDoc = null; // Track last document for pagination
  let hasMoreData = true; // Flag to indicate if more data exists
  const isAdmin = () => {
    try { if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin==='function') return window.DataManager.isCurrentUserAdmin(); return window.currentUserRole==='admin'; } catch(_) { return false; }
  };
  const getUserEmail = () => {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail==='function') {
        return (window.DataManager.getCurrentUserEmail() || '').toLowerCase();
      }
      return (window.currentUserEmail||'').toLowerCase();
    } catch(_) { return (window.currentUserEmail||'').toLowerCase(); }
  };
  
  async function loadFromFirestore() {
    if (!window.firebaseDB && !(window.DataManager && typeof window.DataManager.queryWithOwnership==='function')) {
      console.warn('[BackgroundSequencesLoader] firebaseDB not available');
      return;
    }
    
    try {
      if (window.currentUserRole !== 'admin') {
        let newSequences = [];
        if (window.DataManager && typeof window.DataManager.queryWithOwnership==='function') {
          newSequences = await window.DataManager.queryWithOwnership('sequences');
        } else {
          const email = (window.currentUserEmail || '').toLowerCase();
          const db = window.firebaseDB;
          const [ownedSnap, assignedSnap, createdSnap] = await Promise.all([
            db.collection('sequences').where('ownerId','==',email).get(),
            db.collection('sequences').where('assignedTo','==',email).get(),
            db.collection('sequences').where('createdBy','==',email).get()
          ]);
          const map = new Map();
          ownedSnap.forEach(d=>map.set(d.id,{ id:d.id, ...d.data() }));
          assignedSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          createdSnap.forEach(d=>{ if(!map.has(d.id)) map.set(d.id,{ id:d.id, ...d.data() }); });
          newSequences = Array.from(map.values());
        }
        newSequences.sort((a,b)=> new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
        sequencesData = newSequences;
        lastLoadedDoc = null;
        hasMoreData = false;
      } else {
        // Admin path
        let query = window.firebaseDB.collection('sequences')
          .orderBy('updatedAt', 'desc')
          .limit(100);
        const snapshot = await query.get();
        const newSequences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sequencesData = newSequences;
        if (snapshot.docs.length>0) { lastLoadedDoc = snapshot.docs[snapshot.docs.length-1]; hasMoreData = snapshot.docs.length===100; } else { hasMoreData=false; }
      }
      
      // Pagination already handled above per role
      
      
      // Save to cache for future sessions
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('sequences', sequencesData);
      }
      
      // Notify other modules
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
        detail: { count: sequencesData.length, fromFirestore: true } 
      }));
    } catch (error) {
      console.error('[BackgroundSequencesLoader] Failed to load from Firestore:', error);
    }
  }
  
  // Load from cache immediately on module init
  (async function() {
    if (window.CacheManager && typeof window.CacheManager.get === 'function') {
      try {
        const cached = await window.CacheManager.get('sequences');
        if (cached && Array.isArray(cached) && cached.length > 0) {
          const isAdminUser = (window.currentUserRole === 'admin');
          if (isAdminUser) {
            sequencesData = cached;
          } else {
            const email = getUserEmail();
            // Case-insensitive match across ownerId, assignedTo, createdBy
            sequencesData = (cached || []).filter(s => {
              if (!s) return false;
              const owner = (s.ownerId || '').toLowerCase();
              const assigned = (s.assignedTo || '').toLowerCase();
              const created = (s.createdBy || '').toLowerCase();
              return owner === email || assigned === email || created === email;
            });
            // If filter produced nothing but cache has data, trigger a background refresh now
            if (sequencesData.length === 0 && cached.length > 0) {
              await loadFromFirestore();
              return;
            }
          }
          
          // Notify that cached data is available
          document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
            detail: { count: cached.length, cached: true } 
          }));
        } else {
          // Cache empty, load from Firestore
          await loadFromFirestore();
        }
      } catch (e) {
        console.warn('[BackgroundSequencesLoader] Cache load failed:', e);
        await loadFromFirestore();
      }
    } else {
      console.warn('[BackgroundSequencesLoader] CacheManager not available, waiting...');
      // Retry after a short delay if CacheManager isn't ready yet
      setTimeout(async () => {
        if (window.CacheManager) {
          const cached = await window.CacheManager.get('sequences');
          if (cached && Array.isArray(cached) && cached.length > 0) {
            const isAdminUser = (window.currentUserRole === 'admin');
            if (isAdminUser) {
              sequencesData = cached;
            } else {
              const email = getUserEmail();
              sequencesData = (cached || []).filter(s => {
                if (!s) return false;
                const owner = (s.ownerId || '').toLowerCase();
                const assigned = (s.assignedTo || '').toLowerCase();
                const created = (s.createdBy || '').toLowerCase();
                return owner === email || assigned === email || created === email;
              });
              if (sequencesData.length === 0 && cached.length > 0) {
                await loadFromFirestore();
                return;
              }
            }
            document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
              detail: { count: cached.length, cached: true } 
            }));
          } else {
            await loadFromFirestore();
          }
        }
      }, 500);
    }
  })();
  
  // Load more sequences (next batch of 100)
  async function loadMoreSequences() {
    if (!hasMoreData) {
      return { loaded: 0, hasMore: false };
    }
    
    if (!window.firebaseDB) {
      console.warn('[BackgroundSequencesLoader] firebaseDB not available');
      return { loaded: 0, hasMore: false };
    }
    
    try {
      if (window.currentUserRole !== 'admin') return { loaded: 0, hasMore: false };
      let query = window.firebaseDB.collection('sequences')
        .orderBy('updatedAt', 'desc')
        .startAfter(lastLoadedDoc)
        .limit(100);
      
      const snapshot = await query.get();
      const newSequences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Append to existing data
      sequencesData = [...sequencesData, ...newSequences];
      
      // Update pagination tracking
      if (snapshot.docs.length > 0) {
        lastLoadedDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMoreData = snapshot.docs.length === 100;
      } else {
        hasMoreData = false;
      }
      
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('sequences', sequencesData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded-more', { 
        detail: { count: newSequences.length, total: sequencesData.length, hasMore: hasMoreData } 
      }));
      
      return { loaded: newSequences.length, hasMore: hasMoreData };
    } catch (error) {
      console.error('[BackgroundSequencesLoader] Failed to load more:', error);
      return { loaded: 0, hasMore: false };
    }
  }
  
  // OPTIMIZED: Get total count using Firestore aggregation (no document loads!)
  // This reduces Firestore reads from thousands to just 1-2 per count query
  async function getTotalCount() {
    if (!window.firebaseDB) return sequencesData.length;
    
    try {
      const email = window.currentUserEmail || '';
      if (window.currentUserRole !== 'admin' && email) {
        // Non-admin: use aggregation count for owned sequences
        try {
          const countSnap = await window.firebaseDB.collection('sequences').where('ownerId','==',email).count().get();
          return countSnap.data().count || sequencesData.length;
        } catch (aggError) {
          console.warn('[BackgroundSequencesLoader] Aggregation not supported, using loaded count');
          return sequencesData.length;
        }
      } else {
        // Admin: use aggregation count for all sequences
        try {
          const countSnap = await window.firebaseDB.collection('sequences').count().get();
          return countSnap.data().count || sequencesData.length;
        } catch (aggError) {
          console.warn('[BackgroundSequencesLoader] Aggregation not supported, using loaded count');
          return sequencesData.length;
        }
      }
    } catch (error) {
      console.error('[BackgroundSequencesLoader] Failed to get total count:', error);
      return sequencesData.length; // Fallback to loaded count
    }
  }

  // Listen for sequence updates to keep cache fresh without reloading from Firestore
  // This ensures cost efficiency and instant UI updates
  window.addEventListener('pc:sequence-member-added', async (e) => {
    const { sequenceId } = e.detail || {};
    if (!sequenceId) return;
    
    console.log('[BackgroundSequencesLoader] Handling member added for:', sequenceId);
    
    // Update local data
    const seq = sequencesData.find(s => s.id === sequenceId);
    if (seq) {
      if (!seq.stats) seq.stats = {};
      
      // Update counts
      seq.stats.active = (seq.stats.active || 0) + 1;
      if (typeof seq.recordCount === 'number') {
        seq.recordCount++;
      } else {
        seq.recordCount = seq.stats.active;
      }
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
        await window.CacheManager.updateRecord('sequences', sequenceId, seq);
      }
      
      // Notify listeners (UI)
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
        detail: { count: sequencesData.length, cached: true, updatedId: sequenceId } 
      }));
    }
  });

  window.addEventListener('pc:sequence-member-removed', async (e) => {
    const { sequenceId } = e.detail || {};
    if (!sequenceId) return;
    
    console.log('[BackgroundSequencesLoader] Handling member removed for:', sequenceId);
    
    // Update local data
    const seq = sequencesData.find(s => s.id === sequenceId);
    if (seq) {
      if (!seq.stats) seq.stats = {};
      
      // Update counts
      seq.stats.active = Math.max(0, (seq.stats.active || 0) - 1);
      if (typeof seq.recordCount === 'number') {
        seq.recordCount = Math.max(0, seq.recordCount - 1);
      }
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
        await window.CacheManager.updateRecord('sequences', sequenceId, seq);
      }
      
      // Notify listeners (UI)
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
        detail: { count: sequencesData.length, cached: true, updatedId: sequenceId } 
      }));
    }
  });

  window.addEventListener('pc:sequence-created', async (e) => {
    const { sequence } = e.detail || {};
    if (!sequence || !sequence.id) return;
    
    console.log('[BackgroundSequencesLoader] Handling new sequence:', sequence.id);
    
    // Check if already exists
    const exists = sequencesData.some(s => s.id === sequence.id);
    if (!exists) {
      // Add to local data (newest first)
      sequencesData.unshift(sequence);
      
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.set === 'function') {
        await window.CacheManager.set('sequences', sequencesData);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
        detail: { count: sequencesData.length, cached: true, newId: sequence.id } 
      }));
    }
  });

  window.addEventListener('pc:sequence-deleted', async (e) => {
    const { sequenceId } = e.detail || {};
    if (!sequenceId) return;
    
    console.log('[BackgroundSequencesLoader] Handling deleted sequence:', sequenceId);
    
    // Remove from local data
    const initialLen = sequencesData.length;
    sequencesData = sequencesData.filter(s => s.id !== sequenceId);
    
    if (sequencesData.length !== initialLen) {
      // Update cache
      if (window.CacheManager && typeof window.CacheManager.deleteRecord === 'function') {
        await window.CacheManager.deleteRecord('sequences', sequenceId);
      }
      
      // Notify listeners
      document.dispatchEvent(new CustomEvent('pc:sequences-loaded', { 
        detail: { count: sequencesData.length, cached: true, deletedId: sequenceId } 
      }));
    }
  });

  // Export public API
  window.BackgroundSequencesLoader = {
    getSequencesData: () => sequencesData,
    reload: loadFromFirestore,
    loadMore: loadMoreSequences,
    hasMore: () => hasMoreData,
    getCount: () => sequencesData.length,
    getTotalCount: getTotalCount
  };
  
})();



