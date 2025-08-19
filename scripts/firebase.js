// Firebase initialization for Power Choosers CRM
// Uses compat SDK to keep simple script include usage
(function () {
  if (window.firebase && !window.firebase.apps.length) {
    const firebaseConfig = {
      apiKey: 'REDACTED_GOOGLE_API_KEY',
      projectId: 'power-choosers-crm'
      // For local/dev we only need apiKey + projectId for Firestore
    };
    try {
      window.firebase.initializeApp(firebaseConfig);
    } catch (e) {
      console.warn('Firebase init warning:', e);
    }
  }

  // Expose Firestore instance globally
  try {
    if (window.firebase) {
      window.firebaseDB = window.firebase.firestore();
    }
  } catch (e) {
    console.warn('Firestore init warning:', e);
  }
})();
