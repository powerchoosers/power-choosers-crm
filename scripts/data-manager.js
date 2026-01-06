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
    if (!email) return false;
    
    // Explicitly check for known admin emails or role in localStorage
    const admins = ['l.patterson@powerchoosers.com'];
    if (admins.includes(email)) return true;
    
    // Check if role is persisted in localStorage
    try {
      const persistedRole = localStorage.getItem('pc:userRole');
      if (persistedRole === 'admin') return true;
    } catch (_) {}

    return false;
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
      // Employee can see records where they are owner OR assignee OR the record is unassigned
      // Note: Firestore doesn't support OR queries easily across different fields with different values
      // so we'll do three queries to be thorough
      const ownedQuery = query.where('ownerId', '==', userEmail);
      const assignedQuery = query.where('assignedTo', '==', userEmail);
      const unassignedQuery = query.where('ownerId', '==', 'unassigned');
      
      // Execute all queries
      const [ownedSnapshot, assignedSnapshot, unassignedSnapshot] = await Promise.all([
        ownedQuery.get(),
        assignedQuery.get(),
        unassignedQuery.get()
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
      unassignedSnapshot.forEach(doc => {
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

