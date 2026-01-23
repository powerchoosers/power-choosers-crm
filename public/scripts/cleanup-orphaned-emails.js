/**
 * Cleanup Script for Orphaned Emails in Recent Activities
 * 
 * COPY AND PASTE THIS ENTIRE SCRIPT INTO YOUR BROWSER CONSOLE
 * 
 * Run this in your browser console to:
 * 1. Clear ActivityManager cache (forces refresh with new filtering)
 * 2. Optionally identify and remove emails from Firestore that don't match any CRM contacts
 * 
 * Usage:
 *   cleanupOrphanedEmails() - Just clear cache and refresh (SAFE - recommended)
 *   cleanupOrphanedEmails(true) - Clear cache AND delete orphaned emails from Firestore (DESTRUCTIVE)
 */

async function cleanupOrphanedEmails(removeFromFirestore = false) {
  console.log('[Cleanup] Starting orphaned emails cleanup...');
  
  try {
    // Step 1: Get all contacts from CRM
    const allContacts = window.getPeopleData ? (window.getPeopleData() || []) : [];
    console.log(`[Cleanup] Found ${allContacts.length} contacts in CRM`);
    
    // Build comprehensive set of all contact email addresses
    const contactIdsSet = new Set(allContacts.map(c => c.id).filter(Boolean));
    const contactEmailsSet = new Set();
    
    allContacts.forEach(c => {
      // Add main email field
      const mainEmail = (c.email || '').toLowerCase().trim();
      if (mainEmail) contactEmailsSet.add(mainEmail);
      
      // Add emails from emails array (if it exists)
      if (Array.isArray(c.emails)) {
        c.emails.forEach(e => {
          const emailAddr = (e.address || e.email || e || '').toLowerCase().trim();
          if (emailAddr) contactEmailsSet.add(emailAddr);
        });
      }
    });
    
    console.log(`[Cleanup] Found ${contactEmailsSet.size} unique email addresses from ${allContacts.length} contacts`);
    
    // Helper to extract email addresses from string or array
    const extractEmails = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) {
        return value.map(v => String(v || '').toLowerCase().trim()).filter(e => e);
      }
      const str = String(value || '');
      const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      return matches.map(e => e.toLowerCase().trim());
    };
    
    // Helper to check if email is from a contact in CRM
    const isEmailFromCrmContact = (email) => {
      // Check by contactId
      if (email.contactId && contactIdsSet.has(email.contactId)) {
        return true;
      }
      
      // Check by email address (to/from fields)
      const emailTo = extractEmails(email.to);
      const emailFrom = extractEmails(email.from);
      const allEmailAddresses = [...emailTo, ...emailFrom];
      
      // Check if any email address matches a contact in CRM
      return allEmailAddresses.some(addr => contactEmailsSet.has(addr));
    };
    
    // Step 2: Clear ActivityManager cache
    if (window.ActivityManager) {
      window.ActivityManager.clearCache('global');
      console.log('[Cleanup] ✓ Cleared ActivityManager cache');
    }
    
    // Step 3: If requested, remove orphaned emails from Firestore
    if (removeFromFirestore && window.firebaseDB) {
      console.log('[Cleanup] Scanning Firestore for orphaned emails...');
      
      const getUserEmail = () => {
        try {
          if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
            return window.DataManager.getCurrentUserEmail();
          }
          return (window.currentUserEmail || '').toLowerCase();
        } catch(_) {
          return (window.currentUserEmail || '').toLowerCase();
        }
      };
      
      const isAdmin = () => {
        try {
          if (window.DataManager && typeof window.DataManager.isCurrentUserAdmin === 'function') {
            return window.DataManager.isCurrentUserAdmin();
          }
          return window.currentUserRole === 'admin';
        } catch(_) {
          return window.currentUserRole === 'admin';
        }
      };
      
      let emailsSnapshot;
      if (!isAdmin()) {
        // Non-admin: get owned/assigned emails
        const email = getUserEmail();
        const [ownedSnap, assignedSnap] = await Promise.all([
          window.firebaseDB.collection('emails').where('ownerId', '==', email).get(),
          window.firebaseDB.collection('emails').where('assignedTo', '==', email).get()
        ]);
        
        const emailsMap = new Map();
        ownedSnap.docs.forEach(doc => emailsMap.set(doc.id, { id: doc.id, ...doc.data() }));
        assignedSnap.docs.forEach(doc => {
          if (!emailsMap.has(doc.id)) emailsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        emailsSnapshot = { docs: Array.from(emailsMap.values()).map(e => ({ id: e.id, data: () => e })) };
      } else {
        // Admin: get all emails (with limit for safety)
        const snapshot = await window.firebaseDB.collection('emails').limit(1000).get();
        emailsSnapshot = snapshot;
      }
      
      const orphanedEmails = [];
      emailsSnapshot.docs.forEach(doc => {
        const email = { id: doc.id, ...doc.data() };
        if (!isEmailFromCrmContact(email)) {
          orphanedEmails.push(email);
        }
      });
      
      console.log(`[Cleanup] Found ${orphanedEmails.length} orphaned emails (out of ${emailsSnapshot.docs.length} total)`);
      
      if (orphanedEmails.length > 0) {
        console.log('[Cleanup] Orphaned email IDs:', orphanedEmails.map(e => e.id));
        
        // Ask for confirmation before deleting
        const confirmDelete = confirm(
          `Found ${orphanedEmails.length} orphaned emails.\n\n` +
          `These emails don't match any contacts in your CRM.\n\n` +
          `Do you want to DELETE these emails from Firestore?\n\n` +
          `(This action cannot be undone!)`
        );
        
        if (confirmDelete) {
          console.log('[Cleanup] Deleting orphaned emails from Firestore...');
          let deletedCount = 0;
          let errorCount = 0;
          
          for (const email of orphanedEmails) {
            try {
              await window.firebaseDB.collection('emails').doc(email.id).delete();
              deletedCount++;
              console.log(`[Cleanup] ✓ Deleted email: ${email.id} - ${email.subject || 'No subject'}`);
            } catch (error) {
              errorCount++;
              console.error(`[Cleanup] ✗ Error deleting email ${email.id}:`, error);
            }
          }
          
          console.log(`[Cleanup] ✓ Deleted ${deletedCount} orphaned emails (${errorCount} errors)`);
          
          // Also clear BackgroundEmailsLoader cache if it exists
          if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.reload === 'function') {
            await window.BackgroundEmailsLoader.reload();
            console.log('[Cleanup] ✓ Reloaded BackgroundEmailsLoader cache');
          }
        } else {
          console.log('[Cleanup] Deletion cancelled by user');
        }
      } else {
        console.log('[Cleanup] ✓ No orphaned emails found - all emails match contacts in CRM');
      }
    }
    
    // Step 4: Refresh Recent Activities
    if (window.ActivityManager && document.getElementById('home-activity-timeline')) {
      console.log('[Cleanup] Refreshing Recent Activities...');
      await window.ActivityManager.renderActivities('home-activity-timeline', 'global', null, true);
      console.log('[Cleanup] ✓ Recent Activities refreshed');
    }
    
    console.log('[Cleanup] ✓ Cleanup complete!');
    return {
      success: true,
      contactsCount: allContacts.length,
      contactEmailsCount: contactEmailsSet.size,
      cacheCleared: true,
      activitiesRefreshed: true
    };
    
  } catch (error) {
    console.error('[Cleanup] Error during cleanup:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

window.cleanupOrphanedEmails = cleanupOrphanedEmails

// Auto-run the cleanup (just clears cache, doesn't delete)
console.log('✓ Cleanup script loaded!');
console.log('Running cleanup (cache clear only)...');
cleanupOrphanedEmails(false).then(result => {
  console.log('✓ Cleanup complete!', result);
  console.log('\nTo also DELETE orphaned emails from Firestore, run:');
  console.log('  cleanupOrphanedEmails(true)');
}).catch(err => {
  console.error('✗ Cleanup failed:', err);
});
