// Data Manager - Centralized ownership and role-based data access
// Handles multi-tenant data isolation between admin and employees

(function() {
  'use strict';

  const ADMIN_EMAIL = 'l.patterson@powerchoosers.com';
  
  // Get current logged-in user email
  function getCurrentUserEmail() {
    if (window.currentUserEmail) return window.currentUserEmail.toLowerCase();
    const user = firebase.auth().currentUser;
    return user ? user.email.toLowerCase() : null;
  }

  // Check if current user is admin
  function isCurrentUserAdmin() {
    if (window.currentUserRole === 'admin') return true;
    const email = getCurrentUserEmail();
    return email === ADMIN_EMAIL;
  }

  // Add ownership fields to data object
  function addOwnership(data) {
    const userEmail = getCurrentUserEmail();
    if (!userEmail) {
      console.warn('[DataManager] Cannot add ownership - user not logged in');
      return data;
    }

    return {
      ...data,
      ownerId: userEmail,
      createdBy: userEmail,
      assignedTo: userEmail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  }

  // Query collection with ownership filtering
  // Admin sees everything, employees only see their owned/assigned records
  async function queryWithOwnership(collectionName, additionalFilters = []) {
    const db = firebase.firestore();
    const userEmail = getCurrentUserEmail();
    
    if (!userEmail) {
      console.error('[DataManager] Cannot query - user not logged in');
      return [];
    }

    let query = db.collection(collectionName);

    // If not admin, filter by ownership
    if (!isCurrentUserAdmin()) {
      // Employee can see records where they are owner OR assignee
      // Note: Firestore doesn't support OR queries easily, so we'll do two queries
      const ownedQuery = query.where('ownerId', '==', userEmail);
      const assignedQuery = query.where('assignedTo', '==', userEmail);
      
      // Execute both queries
      const [ownedSnapshot, assignedSnapshot] = await Promise.all([
        ownedQuery.get(),
        assignedQuery.get()
      ]);
      
      // Merge results and deduplicate
      const resultsMap = new Map();
      ownedSnapshot.forEach(doc => {
        resultsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      assignedSnapshot.forEach(doc => {
        if (!resultsMap.has(doc.id)) {
          resultsMap.set(doc.id, { id: doc.id, ...doc.data() });
        }
      });
      
      return Array.from(resultsMap.values());
    }

    // Admin sees everything - apply additional filters only
    for (const filter of additionalFilters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    const snapshot = await query.get();
    const results = [];
    snapshot.forEach(doc => {
      results.push({ id: doc.id, ...doc.data() });
    });

    return results;
  }


  // Expose functions globally
  try {
    window.DataManager = {
      getCurrentUserEmail,
      isCurrentUserAdmin,
      addOwnership,
      queryWithOwnership,
      ADMIN_EMAIL
    };
    // console.log('[DataManager] Initialized');
  } catch (error) {
    console.error('[DataManager] Initialization error:', error);
  }
})();

