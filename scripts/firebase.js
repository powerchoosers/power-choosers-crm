// Firebase initialization for Power Choosers CRM
// Uses compat SDK to keep simple script include usage
(function () {
  if (window.firebase && !window.firebase.apps.length) {
    // Allow override via global or localStorage for your own Firebase project
    let override = null;
    try { override = window.__FIREBASE_CONFIG || null; } catch (_) {}
    if (!override) {
      try {
        const raw = localStorage.getItem('PC_FIREBASE_CONFIG');
        if (raw) override = JSON.parse(raw);
      } catch (_) {}
    }

    const fallbackConfig = {
      apiKey: 'AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE',
      projectId: 'power-choosers-crm',
      authDomain: 'power-choosers-crm.firebaseapp.com',
      storageBucket: 'power-choosers-crm.firebasestorage.app',
      messagingSenderId: '792458658491',
      appId: '1:792458658491:web:0ad91d0b47ae39e1e2d6df'
    };

    // Guard: ignore invalid placeholder overrides (e.g., YOUR_PROJECT_ID)
    function isInvalidConfig(cfg) {
      try {
        if (!cfg || typeof cfg !== 'object') return true;
        const pid = String(cfg.projectId || '').trim();
        const key = String(cfg.apiKey || '').trim();
        const invalidPid = !pid || /^your_project_id$/i.test(pid) || /YOUR_PROJECT_ID/i.test(pid);
        const invalidKey = !key || /YOUR_API_KEY|your_api_key/i.test(key);
        return invalidPid || invalidKey;
      } catch (_) {
        return true;
      }
    }

    if (override && isInvalidConfig(override)) {
      try { console.warn('[Firebase] Ignoring invalid override config (PC_FIREBASE_CONFIG/__FIREBASE_CONFIG). Using fallback.', override); } catch(_) {}
      try { localStorage.removeItem('PC_FIREBASE_CONFIG'); } catch(_) {}
      override = null;
    }

    const firebaseConfig = Object.assign({}, fallbackConfig, override || {});

    try {
      window.firebase.initializeApp(firebaseConfig);
      // console.log('[Firebase] Initialized', { projectId: firebaseConfig.projectId });
      window.firebaseProjectId = firebaseConfig.projectId;
    } catch (e) {
      console.warn('Firebase init warning:', e);
    }
  }

  // Expose Firestore instance globally
  try {
    if (window.firebase) {
      window.firebaseDB = window.firebase.firestore();
      
      // Attempt to reduce "net::ERR_ABORTED" noise by preferring WebSockets over Long Polling
      try {
        window.firebaseDB.settings({ experimentalAutoDetectLongPolling: false });
      } catch (e) {
        // Ignore if settings cannot be applied (e.g. if already initialized)
      }
      
      // Enable Firebase persistence for offline caching and reduced Firestore reads
      // This improves performance and reduces costs by caching data locally
      try {
        window.firebaseDB.enablePersistence()
          .then(() => {
            // Persistence enabled successfully - data will be cached locally
            // console.log('[Firebase] Persistence enabled - faster loads and reduced costs');
          })
          .catch(err => {
            // Handle common persistence errors gracefully
            if (err.code === 'failed-precondition') {
              // Multiple tabs open - only one tab can have persistence enabled
              // This is expected behavior, not an error
              // console.log('[Firebase] Persistence unavailable: Multiple tabs open (expected)');
            } else if (err.code === 'unimplemented') {
              // Browser doesn't support persistence (e.g., some mobile browsers)
              // Falls back to network-only mode - still works fine
              // console.log('[Firebase] Persistence not supported in this browser (falls back to network)');
            } else {
              // Other errors - log but don't break the app
              console.warn('[Firebase] Persistence setup warning:', err.message);
            }
          });
      } catch (e) {
        // Fallback if enablePersistence itself throws (shouldn't happen, but be safe)
        console.warn('[Firebase] Persistence initialization error:', e);
      }
      
      // Quick connectivity smoke test (non-blocking, with ownership filter for employees)
      try {
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        let testQuery = window.firebaseDB.collection('lists');
        // Add ownership filter for non-admin users (required by Firestore rules)
        if (window.currentUserRole !== 'admin' && window.currentUserEmail) {
          testQuery = testQuery.where('ownerId', '==', window.currentUserEmail);
        }
        testQuery.limit(1).get()
          .then(snap => {
            const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            // console.log('[Firebase] Firestore reachable', { projectId: window.firebaseProjectId, listsSample: snap?.size || 0, tookMs: Math.round(t1 - t0) });
          })
          .catch(err => {
            // Expected for employees if they don't have lists - not a real error
            if (err.code === 'permission-denied' && window.currentUserRole !== 'admin') {
              // console.log('[Firebase] Firestore reachable (no lists access for employee, expected)');
            } else {
              console.warn('[Firebase] Firestore lists read failed', err);
            }
          });
      } catch (_) {}
    }
  } catch (e) {
    console.warn('Firestore init warning:', e);
  }
  
  // Centralized optimistic save helpers for immediate UI persistence
  try {
    if (!window.PCSaves) {
      window.PCSaves = {
        async update(collection, id, changes, options) {
          const db = window.firebaseDB;
          const fv = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
          const serverTs = fv && typeof fv.serverTimestamp === 'function' ? fv.serverTimestamp() : new Date();
          const optimisticTs = new Date();
          const payload = Object.assign({}, changes || {}, { updatedAt: serverTs });
          
          // Update cache immediately (optimistic)
          try {
            if (window.CacheManager && typeof window.CacheManager.updateRecord === 'function') {
              await window.CacheManager.updateRecord(collection, id, Object.assign({}, changes || {}, { updatedAt: optimisticTs }));
            }
          } catch (_) {}
          
          // Optimistic event before persistence (so UI updates instantly)
          try {
            if (options && options.eventName && id) {
              const ev = new CustomEvent(options.eventName, { detail: { id, changes: Object.assign({}, changes || {}, { updatedAt: optimisticTs }) } });
              document.dispatchEvent(ev);
            }
          } catch (_) {}
          
          // Persist to Firestore
          if (db && collection && id) {
            try { await db.collection(collection).doc(id).set(payload, { merge: true }); } catch (e) { console.warn('[PCSaves] update failed', { collection, id }, e); }
          }
          return true;
        },
        async updateAccount(id, changes) {
          return this.update('accounts', id, changes, { eventName: 'pc:account-updated' });
        },
        async updateContact(id, changes) {
          return this.update('contacts', id, changes, { eventName: 'pc:contact-updated' });
        }
      };
      // console.log('[Firebase] PCSaves helper installed');
    }
  } catch (_) {}
})();
