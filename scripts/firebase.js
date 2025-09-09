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
      projectId: 'power-choosers-crm'
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
      console.log('[Firebase] Initialized', { projectId: firebaseConfig.projectId });
      window.firebaseProjectId = firebaseConfig.projectId;
    } catch (e) {
      console.warn('Firebase init warning:', e);
    }
  }

  // Expose Firestore instance globally
  try {
    if (window.firebase) {
      window.firebaseDB = window.firebase.firestore();
      // Quick connectivity smoke test (non-blocking)
      try {
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        window.firebaseDB.collection('lists').limit(1).get()
          .then(snap => {
            const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            console.log('[Firebase] Firestore reachable', { projectId: window.firebaseProjectId, listsSample: snap?.size || 0, tookMs: Math.round(t1 - t0) });
          })
          .catch(err => {
            console.warn('[Firebase] Firestore lists read failed', err);
          });
      } catch (_) {}
    }
  } catch (e) {
    console.warn('Firestore init warning:', e);
  }
})();
