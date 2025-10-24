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

  // One-time migration: Add/normalize ownership to all existing records
  async function migrateExistingData() {
    console.log('[DataManager] Starting data migration...');
    
    const db = firebase.firestore();
    const collections = [
      'accounts',
      'contacts',
      'activities',
      'tasks',
      'emails',
      'calls',
      'notes',
      'lists',
      // Newly added per request
      'notifications',
      'settings',
      'sequences',
      'sequenceMembers',
      'listMembers',
      'threads'
    ];
    const batchLimit = 500; // Firestore batch limit
    let totalUpdated = 0;
    
    for (const collectionName of collections) {
      try {
        console.log(`[DataManager] Migrating ${collectionName}...`);
        const snapshot = await db.collection(collectionName).get();
        
        let batch = db.batch(); // Create new batch for each collection
        let updateCount = 0;
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          
          // Normalize lowercase
          const currentOwner = data.ownerId ? String(data.ownerId).toLowerCase() : null;
          const currentAssigned = data.assignedTo ? String(data.assignedTo).toLowerCase() : null;
          const currentCreatedBy = data.createdBy ? String(data.createdBy).toLowerCase() : null;
          const currentUserId = data.userId ? String(data.userId).toLowerCase() : null; // for notifications/settings/members

          const updatePayload = {};

          // Collection-specific owner inference
          let inferredOwner = null;
          if ((collectionName === 'notifications' || collectionName === 'settings' || 
               collectionName === 'sequenceMembers' || collectionName === 'listMembers') && currentUserId) {
            inferredOwner = currentUserId; // these are per-user docs
          } else if (collectionName === 'sequences') {
            // personal sequences: prefer existing owner, else createdBy
            inferredOwner = currentOwner || currentCreatedBy || null;
          }

          // If no ownership info at all, set to admin
          if (!currentOwner && !currentCreatedBy) {
            updatePayload.ownerId = inferredOwner || ADMIN_EMAIL;
            updatePayload.createdBy = ADMIN_EMAIL;
            updatePayload.assignedTo = inferredOwner || ADMIN_EMAIL;
          } else {
            // Backfill missing with best available info, else admin
            if (!currentOwner) updatePayload.ownerId = inferredOwner || currentCreatedBy || currentAssigned || ADMIN_EMAIL;
            if (!currentAssigned) updatePayload.assignedTo = currentOwner || currentCreatedBy || ADMIN_EMAIL;
            if (!currentCreatedBy) updatePayload.createdBy = currentOwner || ADMIN_EMAIL;

            // Ensure lowercase on existing fields
            if (currentOwner && data.ownerId !== currentOwner) updatePayload.ownerId = currentOwner;
            if (currentAssigned && data.assignedTo !== currentAssigned) updatePayload.assignedTo = currentAssigned;
            if (currentCreatedBy && data.createdBy !== currentCreatedBy) updatePayload.createdBy = currentCreatedBy;
          }

          if (Object.keys(updatePayload).length > 0) {
            updatePayload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            batch.update(doc.ref, updatePayload);
            updateCount++;
          }
          
          // Commit batch if reaching limit and create new batch
          if (updateCount >= batchLimit) {
            await batch.commit();
            console.log(`[DataManager] Committed batch of ${updateCount} updates for ${collectionName}`);
            totalUpdated += updateCount;
            batch = db.batch(); // Create NEW batch for next set
            updateCount = 0;
          }
        }
        
        // Commit remaining updates for this collection
        if (updateCount > 0) {
          await batch.commit();
          console.log(`[DataManager] Committed final batch of ${updateCount} updates for ${collectionName}`);
          totalUpdated += updateCount;
        }
        
        console.log(`[DataManager] ✓ Migrated ${collectionName}`);
      } catch (error) {
        console.error(`[DataManager] Error migrating ${collectionName}:`, error);
      }
    }
    
    console.log(`[DataManager] ✅ Migration complete! Updated ${totalUpdated} records`);
    
    // Store migration flag
    localStorage.setItem('pc_data_migrated', 'true');
    return true;
  }

  // Check if migration has been run
  function isMigrationComplete() {
    return localStorage.getItem('pc_data_migrated') === 'true';
  }

  // Auto-run migration on admin login if not done yet
  async function checkAndRunMigration() {
    if (isCurrentUserAdmin() && !isMigrationComplete()) {
      console.log('[DataManager] Admin detected - checking if migration needed...');
      
      // Quick check: see if any accounts lack ownership
      const db = firebase.firestore();
      const sample = await db.collection('accounts').limit(1).get();
      
      if (!sample.empty) {
        const firstDoc = sample.docs[0].data();
        if (!firstDoc.ownerId) {
          console.log('[DataManager] Migration needed - starting...');
          await migrateExistingData();
        } else {
          console.log('[DataManager] Data already has ownership fields');
          localStorage.setItem('pc_data_migrated', 'true');
        }
      }
    }
  }

  // Expose functions globally
  try {
    window.DataManager = {
      getCurrentUserEmail,
      isCurrentUserAdmin,
      addOwnership,
      queryWithOwnership,
      migrateExistingData,
      isMigrationComplete,
      checkAndRunMigration,
      ADMIN_EMAIL
    };
    console.log('[DataManager] Initialized');
  } catch (error) {
    console.error('[DataManager] Initialization error:', error);
  }
})();

