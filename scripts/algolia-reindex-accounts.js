/**
 * Algolia Reindex Script - Accounts
 * 
 * This script triggers a full reindex of all accounts from Firebase to Algolia
 * by performing a dummy update on each account record. This causes the Algolia
 * Firebase extension to detect changes and push all records to Algolia.
 * 
 * Usage:
 * 1. Run this script in your browser console while on the CRM
 * 2. Or run it as a Node.js script with Firebase Admin SDK
 */

(async function reindexAccountsToAlgolia() {
    console.log('🔄 Starting Algolia reindex for all accounts...');
    
    try {
        // Check if Firebase is available
        if (!window.firebaseDB) {
            console.error('❌ Firebase not available. Make sure you are on the CRM page.');
            return;
        }
        
        // Get all accounts from Firebase
        console.log('📥 Fetching all accounts from Firebase...');
        const accountsSnapshot = await window.firebaseDB.collection('accounts').get();
        
        if (accountsSnapshot.empty) {
            console.log('ℹ️ No accounts found in Firebase.');
            return;
        }
        
        console.log(`📊 Found ${accountsSnapshot.size} accounts to reindex`);
        
        // Counter for progress tracking
        let processed = 0;
        let errors = 0;
        
        // Process each account
        for (const doc of accountsSnapshot.docs) {
            try {
                const accountId = doc.id;
                const accountData = doc.data();
                
                console.log(`🔄 Processing account ${processed + 1}/${accountsSnapshot.size}: ${accountData.accountName || accountData.name || accountId}`);
                
                // Perform a dummy update to trigger Algolia sync
                // We'll update the updatedAt timestamp to trigger the extension
                await window.firebaseDB.collection('accounts').doc(accountId).update({
                    updatedAt: new Date().toISOString(),
                    // Add a small increment to ensure change is detected
                    _algoliaReindexTrigger: Date.now()
                });
                
                processed++;
                
                // Add a small delay to avoid overwhelming Firebase
                if (processed % 10 === 0) {
                    console.log(`✅ Processed ${processed}/${accountsSnapshot.size} accounts...`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
            } catch (error) {
                console.error(`❌ Error processing account ${doc.id}:`, error);
                errors++;
            }
        }
        
        console.log(`🎉 Reindex complete!`);
        console.log(`✅ Successfully processed: ${processed} accounts`);
        if (errors > 0) {
            console.log(`❌ Errors: ${errors} accounts`);
        }
        console.log(`📤 All accounts should now be syncing to Algolia...`);
        
        // Clean up the trigger field after a delay
        console.log('🧹 Cleaning up trigger fields in 5 seconds...');
        setTimeout(async () => {
            try {
                for (const doc of accountsSnapshot.docs) {
                    await window.firebaseDB.collection('accounts').doc(doc.id).update({
                        _algoliaReindexTrigger: window.firebase.firestore.FieldValue.delete()
                    });
                }
                console.log('✅ Cleanup complete - trigger fields removed');
            } catch (error) {
                console.warn('⚠️ Cleanup failed (this is not critical):', error);
            }
        }, 5000);
        
    } catch (error) {
        console.error('❌ Fatal error during reindex:', error);
    }
})();

// Export for use in other contexts
window.reindexAccountsToAlgolia = reindexAccountsToAlgolia;
