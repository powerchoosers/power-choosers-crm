/**
 * Algolia Reindex Script - Contacts
 * 
 * This script triggers a full reindex of all contacts from Firebase to Algolia
 * by performing a dummy update on each contact record. This causes the Algolia
 * Firebase extension to detect changes and push all records to Algolia.
 * 
 * Usage:
 * 1. Run this script in your browser console while on the CRM
 * 2. Or run it as a Node.js script with Firebase Admin SDK
 */

(async function reindexContactsToAlgolia() {
    console.log('🔄 Starting Algolia reindex for all contacts...');
    
    try {
        // Check if Firebase is available
        if (!window.firebaseDB) {
            console.error('❌ Firebase not available. Make sure you are on the CRM page.');
            return;
        }
        
        // Get all contacts from Firebase
        console.log('📥 Fetching all contacts from Firebase...');
        const contactsSnapshot = await window.firebaseDB.collection('people').get();
        
        if (contactsSnapshot.empty) {
            console.log('ℹ️ No contacts found in Firebase.');
            return;
        }
        
        console.log(`📊 Found ${contactsSnapshot.size} contacts to reindex`);
        
        // Counter for progress tracking
        let processed = 0;
        let errors = 0;
        
        // Process each contact
        for (const doc of contactsSnapshot.docs) {
            try {
                const contactId = doc.id;
                const contactData = doc.data();
                
                console.log(`🔄 Processing contact ${processed + 1}/${contactsSnapshot.size}: ${contactData.firstName || ''} ${contactData.lastName || ''} (${contactId})`);
                
                // Perform a dummy update to trigger Algolia sync
                // We'll update the updatedAt timestamp to trigger the extension
                await window.firebaseDB.collection('people').doc(contactId).update({
                    updatedAt: new Date().toISOString(),
                    // Add a small increment to ensure change is detected
                    _algoliaReindexTrigger: Date.now()
                });
                
                processed++;
                
                // Add a small delay to avoid overwhelming Firebase
                if (processed % 10 === 0) {
                    console.log(`✅ Processed ${processed}/${contactsSnapshot.size} contacts...`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
            } catch (error) {
                console.error(`❌ Error processing contact ${doc.id}:`, error);
                errors++;
            }
        }
        
        console.log(`🎉 Reindex complete!`);
        console.log(`✅ Successfully processed: ${processed} contacts`);
        if (errors > 0) {
            console.log(`❌ Errors: ${errors} contacts`);
        }
        console.log(`📤 All contacts should now be syncing to Algolia...`);
        
        // Clean up the trigger field after a delay
        console.log('🧹 Cleaning up trigger fields in 5 seconds...');
        setTimeout(async () => {
            try {
                for (const doc of contactsSnapshot.docs) {
                    await window.firebaseDB.collection('people').doc(doc.id).update({
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
window.reindexContactsToAlgolia = reindexContactsToAlgolia;
