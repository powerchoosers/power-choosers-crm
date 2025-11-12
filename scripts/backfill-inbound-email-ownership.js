/**
 * Console Script: Backfill Inbound Email Ownership Fields
 * 
 * This script adds ownerId, assignedTo, and createdBy fields to existing
 * inbound emails that are missing them. This fixes the issue where emails
 * disappear on refresh for non-admin users.
 * 
 * Usage:
 * 1. Open your browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Call: backfillInboundEmailOwnership()
 * 
 * Or use the helper: runBackfill()
 */

window.backfillInboundEmailOwnership = async function() {
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('  📧 BACKFILLING INBOUND EMAIL OWNERSHIP');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available. Make sure you are logged in.');
    return { success: false, error: 'Firebase not available' };
  }
  
  try {
    // Get all emails
    console.log('📋 Loading all emails from Firestore...');
    const allEmailsSnapshot = await window.firebaseDB.collection('emails').get();
    console.log(`  Found ${allEmailsSnapshot.size} total emails`);
    
    // Filter for inbound emails missing ownership
    const emailsToFix = [];
    const emailsToSkip = [];
    
    allEmailsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // Identify inbound emails (received emails)
      const isInbound = (
        data.type === 'received' ||
        data.emailType === 'received' ||
        data.provider === 'sendgrid_inbound'
      );
      
      // Check if missing ownership fields
      const missingOwnership = !data.ownerId || !data.assignedTo || !data.createdBy;
      
      if (isInbound && missingOwnership) {
        emailsToFix.push({
          id: doc.id,
          to: data.to || '',
          from: data.from || '',
          subject: data.subject || '(no subject)',
          receivedAt: data.receivedAt || data.createdAt
        });
      } else {
        emailsToSkip.push(doc.id);
      }
    });
    
    console.log('');
    console.log(`  📥 Inbound emails missing ownership: ${emailsToFix.length}`);
    console.log(`  ⏭️  Emails to skip: ${emailsToSkip.length}`);
    
    if (emailsToFix.length === 0) {
      console.log('');
      console.log('✅ No emails need fixing! All inbound emails have ownership fields.');
      return { success: true, updated: 0, skipped: emailsToSkip.length };
    }
    
    // Extract recipient email helper
    function extractEmailAddress(emailString) {
      if (!emailString) return '';
      if (Array.isArray(emailString)) {
        emailString = emailString[0] || '';
      }
      // Handle formats: "Name" <email@domain.com> or email@domain.com
      const match = emailString.match(/<([^>]+)>/) || emailString.match(/([^\s<>]+@[^\s<>]+)/);
      return match ? match[1].toLowerCase().trim() : emailString.toLowerCase().trim();
    }
    
    // Update emails in batches
    let updated = 0;
    let errors = 0;
    let batch = window.firebaseDB.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500; // Firestore batch limit
    
    console.log('');
    console.log('🔄 Updating emails...');
    
    for (const email of emailsToFix) {
      try {
        const recipientEmail = extractEmailAddress(email.to);
        
        if (!recipientEmail) {
          console.warn(`  ⚠️  Skipping email ${email.id}: no recipient email found`);
          errors++;
          continue;
        }
        
        const emailRef = window.firebaseDB.collection('emails').doc(email.id);
        batch.update(emailRef, {
          ownerId: recipientEmail,
          assignedTo: recipientEmail,
          createdBy: recipientEmail,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        
        batchCount++;
        updated++;
        
        // Commit batch when it reaches limit
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`  ✓ Committed batch of ${BATCH_SIZE} updates...`);
          batch = window.firebaseDB.batch();
          batchCount = 0;
        }
      } catch (error) {
        console.error(`  ❌ Error updating email ${email.id}:`, error);
        errors++;
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      try {
        await batch.commit();
        console.log(`  ✓ Committed final batch of ${batchCount} updates`);
      } catch (error) {
        console.error(`  ❌ Error committing final batch:`, error);
        errors += batchCount;
      }
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('  ✅ BACKFILL COMPLETE');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Updated: ${updated} emails`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Skipped: ${emailsToSkip.length} emails (already have ownership)`);
    console.log('');
    console.log('🔄 Refresh the emails page to see your emails!');
    console.log('');
    
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast(`✓ Backfill complete: ${updated} emails updated`, 'success', 5000);
    }
    
    return {
      success: true,
      updated,
      errors,
      skipped: emailsToSkip.length
    };
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR during backfill:', error);
    console.error('');
    console.error(error.stack);
    
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Backfill failed. Check console for details.', 'error');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
};

// Helper function that automatically awaits and shows result
window.runBackfill = async function() {
  console.log('[Backfill] Running inbound email ownership backfill...');
  try {
    const result = await backfillInboundEmailOwnership();
    console.log('[Backfill] Final result:', result);
    return result;
  } catch (error) {
    console.error('[Backfill] Unexpected error:', error);
    return { success: false, error: error.message };
  }
};

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Inbound Email Ownership Backfill Script Loaded');
console.log('════════════════════════════════════════════════════════');
console.log('');
console.log('🔧 Run backfill:');
console.log('  backfillInboundEmailOwnership()  - Full backfill');
console.log('  runBackfill()                    - Helper (auto-awaits)');
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');

