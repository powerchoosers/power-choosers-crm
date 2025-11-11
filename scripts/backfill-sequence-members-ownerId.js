/**
 * Backfill script to add ownerId to sequenceMembers documents
 * 
 * Run this in browser console on your production site (after login):
 * 
 * 1. Open browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Then run: backfillSequenceMembersOwnerId()
 * 
 * OR run via Node.js (requires Firebase Admin SDK):
 * node scripts/backfill-sequence-members-ownerId.js
 */

async function backfillSequenceMembersOwnerId() {
  console.log('[Backfill] Starting sequenceMembers ownerId backfill...');
  
  if (!window.firebaseDB) {
    console.error('[Backfill] Firebase not available. Make sure you are logged in.');
    return;
  }
  
  // Get current user email
  const getUserEmail = () => {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
        return window.DataManager.getCurrentUserEmail().toLowerCase();
      }
      return (window.currentUserEmail || '').toLowerCase();
    } catch (_) {
      return (window.currentUserEmail || '').toLowerCase();
    }
  };
  
  const currentUserEmail = getUserEmail();
  if (!currentUserEmail) {
    console.error('[Backfill] Could not determine current user email');
    return;
  }
  
  console.log(`[Backfill] Using ownerId: ${currentUserEmail}`);
  
  try {
    // Get all sequenceMembers documents
    const membersQuery = await window.firebaseDB.collection('sequenceMembers').get();
    
    if (membersQuery.empty) {
      console.log('[Backfill] No sequenceMembers documents found');
      return;
    }
    
    console.log(`[Backfill] Found ${membersQuery.size} sequenceMembers documents`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    let batch = window.firebaseDB.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500; // Firestore batch limit
    
    for (const doc of membersQuery.docs) {
      const data = doc.data();
      
      // Skip if already has ownerId
      if (data.ownerId) {
        skipped++;
        continue;
      }
      
      // Add ownerId (use existing userId if available, otherwise use current user)
      const ownerId = (data.userId || currentUserEmail).toLowerCase();
      
      batch.update(doc.ref, {
        ownerId: ownerId,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });
      
      batchCount++;
      updated++;
      
      // Commit batch when it reaches limit
      if (batchCount >= BATCH_SIZE) {
        try {
          await batch.commit();
          console.log(`[Backfill] Committed batch of ${BATCH_SIZE} updates...`);
          // Create new batch for next set of updates
          batch = window.firebaseDB.batch();
          batchCount = 0;
        } catch (error) {
          console.error(`[Backfill] Error committing batch:`, error);
          errors += batchCount;
          // Create new batch and continue
          batch = window.firebaseDB.batch();
          batchCount = 0;
        }
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      try {
        await batch.commit();
        console.log(`[Backfill] Committed final batch of ${batchCount} updates`);
      } catch (error) {
        console.error(`[Backfill] Error committing final batch:`, error);
        errors += batchCount;
      }
    }
    
    console.log(`[Backfill] Complete! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
    
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast(`✓ Backfill complete: ${updated} updated, ${skipped} skipped`, 'success', 5000);
    }
    
  } catch (error) {
    console.error('[Backfill] Error:', error);
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Backfill failed. Check console for details.', 'error');
    }
  }
}

// Make function available globally for console execution
if (typeof window !== 'undefined') {
  window.backfillSequenceMembersOwnerId = backfillSequenceMembersOwnerId;
}

// Auto-run if executed directly (Node.js with Firebase Admin)
if (typeof require !== 'undefined' && require.main === module) {
  const admin = require('firebase-admin');
  
  // Initialize Firebase Admin (you'll need to set GOOGLE_APPLICATION_CREDENTIALS)
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  
  const db = admin.firestore();
  
  async function backfillWithAdmin() {
    console.log('[Backfill] Starting with Firebase Admin SDK...');
    
    try {
      const membersQuery = await db.collection('sequenceMembers').get();
      
      if (membersQuery.empty) {
        console.log('[Backfill] No sequenceMembers documents found');
        return;
      }
      
      console.log(`[Backfill] Found ${membersQuery.size} sequenceMembers documents`);
      
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      
      let batch = db.batch();
      let batchCount = 0;
      const BATCH_SIZE = 500;
      
      for (const doc of membersQuery.docs) {
        const data = doc.data();
        
        if (data.ownerId) {
          skipped++;
          continue;
        }
        
        const ownerId = (data.userId || 'l.patterson@powerchoosers.com').toLowerCase();
        
        batch.update(doc.ref, {
          ownerId: ownerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        batchCount++;
        updated++;
        
        if (batchCount >= BATCH_SIZE) {
          try {
            await batch.commit();
            console.log(`[Backfill] Committed batch of ${BATCH_SIZE} updates...`);
            // Create new batch for next set of updates
            batch = db.batch();
            batchCount = 0;
          } catch (error) {
            console.error(`[Backfill] Error committing batch:`, error);
            errors += batchCount;
            // Create new batch and continue
            batch = db.batch();
            batchCount = 0;
          }
        }
      }
      
      if (batchCount > 0) {
        try {
          await batch.commit();
          console.log(`[Backfill] Committed final batch of ${batchCount} updates`);
        } catch (error) {
          console.error(`[Backfill] Error committing final batch:`, error);
          errors += batchCount;
        }
      }
      
      console.log(`[Backfill] Complete! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
    } catch (error) {
      console.error('[Backfill] Error:', error);
      process.exit(1);
    }
  }
  
  backfillWithAdmin().then(() => process.exit(0));
}

