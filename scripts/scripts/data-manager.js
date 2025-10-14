// Data Manager - Centralized ownership and role-based data access
// Handles multi-tenant data isolation between admin and employees

(function() {
  'use strict';

  const ADMIN_EMAIL = 'l.patterson@powerchoosers.com';
  
  // Get current logged-in user email
  function getCurrentUserEmail() {
    if (window.currentUserEmail) return window.currentUserEmail;
    const user = firebase.auth().currentUser;
    return user ? user.email : null;
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

  // One-time migration: Add ownership to all existing records
  async function migrateExistingData() {
    console.log('[DataManager] Starting data migration...');
    
    const db = firebase.firestore();
    const collections = ['accounts', 'contacts', 'deals', 'tasks', 'emails', 'calls', 'notes', 'lists'];
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
          
          // Skip if already has ownership fields
          if (data.ownerId || data.createdBy) {
            continue;
          }
          
          // Add ownership fields pointing to admin
          batch.update(doc.ref, {
            ownerId: ADMIN_EMAIL,
            createdBy: ADMIN_EMAIL,
            assignedTo: ADMIN_EMAIL,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          updateCount++;
          
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

