/**
 * One-Time Migration Script: Fix ownerId fields in sequences and sequenceMembers
 * 
 * This script fixes existing sequences and sequenceMembers documents that are missing
 * or have incorrect ownerId, createdBy, and assignedTo fields.
 * 
 * TO RUN: Copy and paste this entire script into your browser console, then call:
 *   await migrateSequenceOwnerIds()
 * 
 * The script will:
 * 1. Find all sequences missing ownerId fields or with incorrect patterns
 * 2. Find all sequenceMembers missing ownerId fields
 * 3. Update them with the correct ownerId pattern (matching sequences.js)
 * 4. Show progress and results
 */

async function migrateSequenceOwnerIds() {
  console.log('🚀 Starting sequence ownerId migration...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const db = window.firebaseDB;
    if (!db) {
      console.error('❌ Firebase database not available. Make sure Firebase is initialized.');
      return { success: false, error: 'Firebase not available' };
    }

    // Get current user email using the same method as sequences.js
    const userEmail = (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function')
      ? window.DataManager.getCurrentUserEmail()
      : ((window.currentUserEmail || '').toLowerCase());

    if (!userEmail || userEmail === 'unknown') {
      console.error('❌ Could not determine user email. Please ensure you are logged in.');
      return { success: false, error: 'User email not available' };
    }

    console.log(`👤 Current user email: ${userEmail}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const results = {
      sequences: { updated: 0, skipped: 0, errors: 0 },
      sequenceMembers: { updated: 0, skipped: 0, errors: 0 }
    };

    // ===== MIGRATE SEQUENCES =====
    console.log('📋 Step 1: Migrating sequences collection...');
    try {
      const sequencesSnapshot = await db.collection('sequences').get();
      console.log(`   Found ${sequencesSnapshot.size} sequences to check`);

      const updatePromises = [];
      
      sequencesSnapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        
        // Check if ownerId needs updating
        const needsUpdate = !data.ownerId || 
                           data.ownerId !== userEmail ||
                           !data.createdBy ||
                           data.createdBy !== userEmail ||
                           !data.assignedTo ||
                           data.assignedTo !== userEmail;

        if (!needsUpdate) {
          results.sequences.skipped++;
          return;
        }

        // Prepare update
        const updateData = {
          ownerId: userEmail,
          createdBy: data.createdBy || userEmail,
          assignedTo: data.assignedTo || userEmail
        };

        // Use server timestamp if available
        if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
          updateData.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
          updateData.updatedAt = Date.now();
        }

        // Add to batch
        updatePromises.push(
          db.collection('sequences').doc(id).update(updateData)
            .then(() => {
              results.sequences.updated++;
              console.log(`   ✅ Updated sequence: ${id} (${data.name || 'unnamed'})`);
            })
            .catch(err => {
              results.sequences.errors++;
              console.error(`   ❌ Error updating sequence ${id}:`, err);
            })
        );
      });

      await Promise.all(updatePromises);
      console.log(`   ✓ Sequences migration complete: ${results.sequences.updated} updated, ${results.sequences.skipped} skipped, ${results.sequences.errors} errors\n`);

    } catch (error) {
      console.error('❌ Error migrating sequences:', error);
      results.sequences.errors++;
    }

    // ===== MIGRATE SEQUENCE MEMBERS =====
    console.log('👥 Step 2: Migrating sequenceMembers collection...');
    try {
      const membersSnapshot = await db.collection('sequenceMembers').get();
      console.log(`   Found ${membersSnapshot.size} sequenceMembers to check`);

      const updatePromises = [];
      
      membersSnapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        
        // Check if ownerId fields need updating
        const needsUpdate = !data.ownerId || 
                           data.ownerId !== userEmail ||
                           !data.createdBy ||
                           data.createdBy !== userEmail ||
                           !data.assignedTo ||
                           data.assignedTo !== userEmail;

        if (!needsUpdate) {
          results.sequenceMembers.skipped++;
          return;
        }

        // Prepare update
        const updateData = {
          ownerId: userEmail,
          createdBy: data.createdBy || userEmail,
          assignedTo: data.assignedTo || userEmail
        };

        // Use server timestamp if available
        if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
          updateData.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        } else {
          updateData.updatedAt = Date.now();
        }

        // Add to batch
        updatePromises.push(
          db.collection('sequenceMembers').doc(id).update(updateData)
            .then(() => {
              results.sequenceMembers.updated++;
              if (results.sequenceMembers.updated % 10 === 0) {
                console.log(`   ✅ Updated ${results.sequenceMembers.updated} sequenceMembers...`);
              }
            })
            .catch(err => {
              results.sequenceMembers.errors++;
              console.error(`   ❌ Error updating sequenceMember ${id}:`, err);
            })
        );
      });

      await Promise.all(updatePromises);
      console.log(`   ✓ SequenceMembers migration complete: ${results.sequenceMembers.updated} updated, ${results.sequenceMembers.skipped} skipped, ${results.sequenceMembers.errors} errors\n`);

    } catch (error) {
      console.error('❌ Error migrating sequenceMembers:', error);
      results.sequenceMembers.errors++;
    }

    // ===== FIX RECORD COUNTS =====
    console.log('📊 Step 3: Fixing recordCount fields in sequences...');
    try {
      const sequencesSnapshot = await db.collection('sequences').get();
      let countFixed = 0;

      const countPromises = [];
      
      sequencesSnapshot.forEach(async (seqDoc) => {
        const seqData = seqDoc.data();
        const seqId = seqDoc.id;

        // Count actual sequenceMembers
        const membersQuery = await db.collection('sequenceMembers')
          .where('sequenceId', '==', seqId)
          .where('targetType', '==', 'people')
          .get();

        const actualCount = membersQuery.size;

        // Check if recordCount is wrong
        if (seqData.recordCount !== actualCount) {
          const updateData = {
            recordCount: actualCount
          };

          if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
            updateData.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
          } else {
            updateData.updatedAt = Date.now();
          }

          countPromises.push(
            db.collection('sequences').doc(seqId).update(updateData)
              .then(() => {
                countFixed++;
                console.log(`   ✅ Fixed recordCount for sequence ${seqId}: ${seqData.recordCount || 0} → ${actualCount}`);
              })
              .catch(err => {
                console.error(`   ❌ Error fixing recordCount for ${seqId}:`, err);
              })
          );
        }
      });

      await Promise.all(countPromises);
      console.log(`   ✓ Fixed ${countFixed} recordCount values\n`);

    } catch (error) {
      console.error('❌ Error fixing recordCounts:', error);
    }

    // ===== SUMMARY =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Migration Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 Sequences: ${results.sequences.updated} updated, ${results.sequences.skipped} skipped, ${results.sequences.errors} errors`);
    console.log(`👥 SequenceMembers: ${results.sequenceMembers.updated} updated, ${results.sequenceMembers.skipped} skipped, ${results.sequenceMembers.errors} errors`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (results.sequences.errors > 0 || results.sequenceMembers.errors > 0) {
      console.warn('⚠️  Some errors occurred during migration. Check the output above for details.');
    } else {
      console.log('✅ All migrations completed successfully!');
    }

    return {
      success: true,
      results: results
    };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export for console use
window.migrateSequenceOwnerIds = migrateSequenceOwnerIds;

console.log('📝 Migration script loaded!');
console.log('💡 To run: await migrateSequenceOwnerIds()');

