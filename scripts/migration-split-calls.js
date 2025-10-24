/**
 * Migration Script: Split Calls Collection
 * 
 * Splits the calls collection into:
 * - calls (metadata only, ~1KB per doc)
 * - callDetails (large fields, ~15-30KB per doc)
 * 
 * Run this in browser console as admin:
 * 1. Open your CRM app
 * 2. Log in as l.patterson@powerchoosers.com
 * 3. Open browser console (F12)
 * 4. Paste this entire script
 * 5. Run: await migrateCallsToSplitStructure()
 */

async function migrateCallsToSplitStructure() {
  console.log('='.repeat(60));
  console.log('MIGRATION: Split Calls Collection');
  console.log('='.repeat(60));
  
  // Verify admin
  const user = firebase.auth().currentUser;
  if (!user || user.email.toLowerCase() !== 'l.patterson@powerchoosers.com') {
    console.error('❌ ERROR: Must be logged in as admin (l.patterson@powerchoosers.com)');
    return;
  }
  
  console.log('✓ Admin verified:', user.email);
  
  const db = firebase.firestore();
  const batchSize = 500; // Firestore batch limit
  let totalProcessed = 0;
  let totalWithDetails = 0;
  let totalErrors = 0;
  
  try {
    // Get all calls
    console.log('\n📊 Fetching all calls...');
    const snapshot = await db.collection('calls').get();
    console.log(`✓ Found ${snapshot.size} calls to process`);
    
    if (snapshot.size === 0) {
      console.log('⚠️  No calls found. Migration complete (nothing to do).');
      return;
    }
    
    // Process in batches
    let batch = db.batch();
    let batchCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const callId = doc.id;
      
      // Check if has large fields
      const hasTranscript = !!(data.transcript || data.formattedTranscript);
      const hasAiInsights = !!(data.aiInsights && Object.keys(data.aiInsights).length > 0);
      const hasCI = !!(data.conversationalIntelligence && Object.keys(data.conversationalIntelligence).length > 0);
      const hasLargeFields = hasTranscript || hasAiInsights || hasCI;
      
      if (hasLargeFields) {
        try {
          // Create callDetails document
          const detailsRef = db.collection('callDetails').doc(callId);
          batch.set(detailsRef, {
            callId: callId,
            transcript: data.transcript || '',
            formattedTranscript: data.formattedTranscript || '',
            aiInsights: data.aiInsights || null,
            conversationalIntelligence: data.conversationalIntelligence || null,
            ownerId: data.ownerId || 'l.patterson@powerchoosers.com',
            assignedTo: data.assignedTo || 'l.patterson@powerchoosers.com',
            createdBy: data.createdBy || 'l.patterson@powerchoosers.com',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          // Update calls document with flags (don't remove old fields yet for safety)
          const callRef = db.collection('calls').doc(callId);
          batch.update(callRef, {
            hasTranscript: hasTranscript,
            hasAiInsights: hasAiInsights,
            hasConversationalIntelligence: hasCI,
            migratedToSplit: true,
            migratedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          totalWithDetails++;
          batchCount++;
          
          // Commit batch when reaching limit
          if (batchCount >= batchSize) {
            await batch.commit();
            totalProcessed += batchCount;
            console.log(`✓ Processed ${totalProcessed}/${snapshot.size} calls (${totalWithDetails} with details)...`);
            batch = db.batch(); // Create new batch
            batchCount = 0;
          }
        } catch (error) {
          console.error(`❌ Error processing call ${callId}:`, error);
          totalErrors++;
        }
      } else {
        // No large fields, just add flags
        const callRef = db.collection('calls').doc(callId);
        batch.update(callRef, {
          hasTranscript: false,
          hasAiInsights: false,
          hasConversationalIntelligence: false,
          migratedToSplit: true,
          migratedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batchCount++;
        
        if (batchCount >= batchSize) {
          await batch.commit();
          totalProcessed += batchCount;
          console.log(`✓ Processed ${totalProcessed}/${snapshot.size} calls...`);
          batch = db.batch();
          batchCount = 0;
        }
      }
    }
    
    // Commit remaining batch
    if (batchCount > 0) {
      await batch.commit();
      totalProcessed += batchCount;
      console.log(`✓ Processed ${totalProcessed}/${snapshot.size} calls (final batch)`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`Total calls processed: ${totalProcessed}`);
    console.log(`Calls with details: ${totalWithDetails}`);
    console.log(`Calls without details: ${totalProcessed - totalWithDetails}`);
    console.log(`Errors: ${totalErrors}`);
    console.log('\n📋 Next steps:');
    console.log('1. Verify callDetails collection in Firebase Console');
    console.log('2. Deploy updated code');
    console.log('3. Deploy new Firestore rules');
    console.log('4. Test thoroughly');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Export for use
window.migrateCallsToSplitStructure = migrateCallsToSplitStructure;

console.log('✓ Migration script loaded. Run: await migrateCallsToSplitStructure()');
