/**
 * Test script to trigger Firestore index creation links
 * 
 * This will attempt queries that require composite indexes.
 * When Firestore rejects them, it will return error messages with
 * direct links to create the indexes in the Firebase Console.
 * 
 * Run this in browser console after deployment:
 * 1. Open browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Then run: testFirestoreIndexes()
 * 
 * The console will show any index creation links that Firestore provides.
 */

async function testFirestoreIndexes() {
  console.log('[Index Test] Testing Firestore queries that require indexes...');
  
  if (!window.firebaseDB) {
    console.error('[Index Test] Firebase not available. Make sure you are logged in.');
    return;
  }
  
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
    console.error('[Index Test] Could not determine current user email');
    return;
  }
  
  const results = {
    sequenceMembers: null,
    emailsNotGenerated: null,
    emailsApproved: null
  };
  
  // Test 1: sequenceMembers query (used in sequences.js)
  console.log('[Index Test] Testing sequenceMembers query...');
  try {
    const testSequenceId = 'test-sequence-id'; // This will fail, but that's okay - we just want the error message
    const membersQuery = window.firebaseDB.collection('sequenceMembers')
      .where('sequenceId', '==', testSequenceId)
      .where('targetType', '==', 'people')
      .where('ownerId', '==', currentUserEmail)
      .limit(1);
    
    await membersQuery.get();
    results.sequenceMembers = { success: true, message: 'Index exists or not needed' };
  } catch (error) {
    results.sequenceMembers = { 
      success: false, 
      error: error.message,
      // Firestore usually includes index link in error.message
      hasIndexLink: error.message.includes('https://console.firebase.google.com') || error.message.includes('index')
    };
    
    console.error('[Index Test] sequenceMembers query error:', error);
    console.log('[Index Test] Look for index creation link in the error message above');
  }
  
  // Test 2: emails query for not_generated (used in generate-scheduled-emails.js)
  console.log('[Index Test] Testing emails (not_generated) query...');
  try {
    const now = Date.now();
    const emailsQuery = window.firebaseDB.collection('emails')
      .where('type', '==', 'scheduled')
      .where('status', '==', 'not_generated')
      .where('scheduledSendTime', '>=', now - (60 * 1000))
      .where('scheduledSendTime', '<=', now + (24 * 60 * 60 * 1000))
      .limit(1);
    
    await emailsQuery.get();
    results.emailsNotGenerated = { success: true, message: 'Index exists or not needed' };
  } catch (error) {
    results.emailsNotGenerated = { 
      success: false, 
      error: error.message,
      hasIndexLink: error.message.includes('https://console.firebase.google.com') || error.message.includes('index')
    };
    
    console.error('[Index Test] emails (not_generated) query error:', error);
    console.log('[Index Test] Look for index creation link in the error message above');
  }
  
  // Test 3: emails query for approved (used in send-scheduled-emails.js)
  console.log('[Index Test] Testing emails (approved) query...');
  try {
    const now = Date.now();
    const emailsQuery = window.firebaseDB.collection('emails')
      .where('type', '==', 'scheduled')
      .where('status', '==', 'approved')
      .where('scheduledSendTime', '<=', now)
      .limit(1);
    
    await emailsQuery.get();
    results.emailsApproved = { success: true, message: 'Index exists or not needed' };
  } catch (error) {
    results.emailsApproved = { 
      success: false, 
      error: error.message,
      hasIndexLink: error.message.includes('https://console.firebase.google.com') || error.message.includes('index')
    };
    
    console.error('[Index Test] emails (approved) query error:', error);
    console.log('[Index Test] Look for index creation link in the error message above');
  }
  
  // Summary
  console.log('\n[Index Test] Summary:');
  console.table(results);
  
  // Extract any index links from error messages
  const indexLinks = [];
  Object.values(results).forEach(result => {
    if (result && result.error) {
      const linkMatch = result.error.match(/https:\/\/console\.firebase\.google\.com[^\s\)]+/);
      if (linkMatch) {
        indexLinks.push(linkMatch[0]);
      }
    }
  });
  
  if (indexLinks.length > 0) {
    console.log('\n[Index Test] 🔗 Index Creation Links Found:');
    indexLinks.forEach((link, i) => {
      console.log(`${i + 1}. ${link}`);
    });
    
    // Try to open links automatically (browser may block this)
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast(`Found ${indexLinks.length} index creation link(s). Check console.`, 'info', 8000);
    }
  } else {
    console.log('\n[Index Test] ✅ All queries passed! Indexes may already exist or not be required.');
    
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('All Firestore indexes appear to be configured correctly.', 'success');
    }
  }
  
  return results;
}

// Make function available globally
if (typeof window !== 'undefined') {
  window.testFirestoreIndexes = testFirestoreIndexes;
}

