/**
 * Console Script: Diagnose Sequence Processing Issues
 * 
 * Copy and paste this entire script into your browser console to check:
 * - Pending sequence activations
 * - Emails waiting for generation
 * - Emails waiting to be sent
 * - Recent sequence activity
 * 
 * Usage:
 * 1. Open your browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Call: diagnoseSequences()
 */

window.diagnoseSequences = async function() {
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('  🔍 SEQUENCE DIAGNOSTICS');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available. Make sure you are logged in.');
    return;
  }
  
  const results = {
    timestamp: new Date().toLocaleString(),
    sequenceActivations: {},
    emails: {},
    cloudScheduler: {},
    recommendations: []
  };
  
  try {
    // 1. Check sequence activations
    console.log('📋 Checking sequence activations...');
    
    const activationsSnapshot = await window.firebaseDB
      .collection('sequenceActivations')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    const activationsByStatus = {
      pending: [],
      processing: [],
      completed: [],
      failed: []
    };
    
    activationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const status = data.status || 'unknown';
      if (!activationsByStatus[status]) {
        activationsByStatus[status] = [];
      }
      activationsByStatus[status].push({
        id: doc.id,
        status: data.status,
        contactCount: data.totalContacts || data.contactIds?.length || 0,
        processed: data.processedContacts || 0,
        created: data.createdAt?.toDate?.() || new Date(data.createdAt),
        sequenceId: data.sequenceId
      });
    });
    
    results.sequenceActivations = activationsByStatus;
    
    console.log(`  ✓ Total activations found: ${activationsSnapshot.size}`);
    console.log(`  • Pending: ${activationsByStatus.pending.length}`);
    console.log(`  • Processing: ${activationsByStatus.processing.length}`);
    console.log(`  • Completed: ${activationsByStatus.completed.length}`);
    console.log(`  • Failed: ${activationsByStatus.failed?.length || 0}`);
    
    if (activationsByStatus.pending.length > 0) {
      console.log('');
      console.log('  ⚠️  FOUND PENDING ACTIVATIONS:');
      activationsByStatus.pending.forEach(act => {
        console.log(`    • ${act.id}`);
        console.log(`      Created: ${act.created.toLocaleString()}`);
        console.log(`      Contacts: ${act.contactCount}`);
        console.log(`      Age: ${Math.round((Date.now() - act.created.getTime()) / 60000)} minutes`);
      });
      
      results.recommendations.push('🚨 Found pending activations that should have been processed by Cloud Scheduler');
      results.recommendations.push('   → Check Cloud Scheduler logs in Google Cloud Console');
      results.recommendations.push('   → Manually trigger: gcloud scheduler jobs run process-activations-cron --location=us-central1');
    }
    
    if (activationsByStatus.processing.length > 0) {
      console.log('');
      console.log('  ⚠️  FOUND STUCK PROCESSING ACTIVATIONS:');
      activationsByStatus.processing.forEach(act => {
        const age = Math.round((Date.now() - act.created.getTime()) / 60000);
        if (age > 10) {
          console.log(`    • ${act.id} (STUCK - ${age} minutes old)`);
          results.recommendations.push(`🔧 Activation ${act.id} stuck in processing state for ${age} minutes`);
        } else {
          console.log(`    • ${act.id} (${age} minutes old - may be actively processing)`);
        }
      });
    }
    
    console.log('');
    
    // 2. Check emails waiting for generation
    console.log('📧 Checking emails waiting for generation...');
    
    const notGeneratedSnapshot = await window.firebaseDB
      .collection('emails')
      .where('status', '==', 'not_generated')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    
    results.emails.notGenerated = notGeneratedSnapshot.size;
    console.log(`  • Emails not generated: ${notGeneratedSnapshot.size}`);
    
    if (notGeneratedSnapshot.size > 0) {
      const oldest = notGeneratedSnapshot.docs[notGeneratedSnapshot.size - 1].data();
      const oldestAge = Math.round((Date.now() - (oldest.createdAt?.toDate?.() || new Date(oldest.createdAt)).getTime()) / 60000);
      console.log(`  • Oldest: ${oldestAge} minutes old`);
      
      if (oldestAge > 60) {
        results.recommendations.push(`⚠️  ${notGeneratedSnapshot.size} emails waiting ${oldestAge}+ minutes for generation`);
        results.recommendations.push('   → Check generate-emails-cron job is running');
      }
    }
    
    // 3. Check emails waiting for approval
    console.log('📧 Checking emails pending approval...');
    
    const pendingApprovalSnapshot = await window.firebaseDB
      .collection('emails')
      .where('status', '==', 'pending_approval')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    
    results.emails.pendingApproval = pendingApprovalSnapshot.size;
    console.log(`  • Emails pending approval: ${pendingApprovalSnapshot.size}`);
    
    // 4. Check approved emails waiting to send
    console.log('📧 Checking approved emails ready to send...');
    
    const approvedSnapshot = await window.firebaseDB
      .collection('emails')
      .where('status', '==', 'approved')
      .where('scheduledSendTime', '<=', Date.now())
      .limit(100)
      .get();
    
    results.emails.approvedReadyToSend = approvedSnapshot.size;
    console.log(`  • Approved emails ready to send: ${approvedSnapshot.size}`);
    
    if (approvedSnapshot.size > 0) {
      results.recommendations.push(`📬 ${approvedSnapshot.size} emails approved and ready to send`);
      results.recommendations.push('   → send-emails-cron should send these every 15 minutes');
    }
    
    // 5. Check recently sent emails
    console.log('📧 Checking recently sent emails...');
    
    const sentSnapshot = await window.firebaseDB
      .collection('emails')
      .where('type', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(10)
      .get();
    
    results.emails.recentlySent = sentSnapshot.size;
    console.log(`  • Recently sent (last 10): ${sentSnapshot.size}`);
    
    if (sentSnapshot.size > 0) {
      const mostRecent = sentSnapshot.docs[0].data();
      const lastSentTime = new Date(mostRecent.sentAt || mostRecent.timestamp);
      const minutesAgo = Math.round((Date.now() - lastSentTime.getTime()) / 60000);
      console.log(`  • Last sent: ${minutesAgo} minutes ago (${lastSentTime.toLocaleString()})`);
      
      if (minutesAgo > 120) {
        results.recommendations.push(`⚠️  No emails sent in ${minutesAgo} minutes (${Math.round(minutesAgo/60)} hours)`);
        results.recommendations.push('   → Sequences may not be processing');
      }
    } else {
      results.recommendations.push('⚠️  No sent emails found');
      results.recommendations.push('   → This might be normal if sequences were just activated');
    }
    
    console.log('');
    
    // 6. Summary and recommendations
    console.log('════════════════════════════════════════════════════════');
    console.log('  📊 SUMMARY');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    
    if (results.recommendations.length === 0) {
      console.log('✅ Everything looks good!');
      console.log('');
      console.log('Sequences are processing normally:');
      console.log(`  • ${results.sequenceActivations.completed.length} activations completed`);
      console.log(`  • ${results.emails.recentlySent} emails recently sent`);
      console.log(`  • ${results.emails.pendingApproval} emails pending your approval`);
    } else {
      console.log('⚠️  ISSUES DETECTED:');
      console.log('');
      results.recommendations.forEach(rec => {
        console.log(rec);
      });
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('  🛠️  NEXT STEPS');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    console.log('1. Check Cloud Scheduler logs:');
    console.log('   https://console.cloud.google.com/cloudscheduler?project=power-choosers-crm');
    console.log('');
    console.log('2. Check Cloud Run logs:');
    console.log('   https://console.cloud.google.com/run/detail/us-south1/power-choosers-crm/logs?project=power-choosers-crm');
    console.log('');
    console.log('3. Manually trigger sequence processing:');
    console.log('   Run in Cloud Shell:');
    console.log('   gcloud scheduler jobs run process-activations-cron --location=us-central1');
    console.log('');
    console.log('4. View detailed results:');
    console.log('   Copy the results object from the variable: diagResults');
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    
    // Store results globally for inspection
    window.diagResults = results;
    
    return results;
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR during diagnostics:', error);
    console.error('');
    console.error(error.stack);
    return {
      error: error.message,
      stack: error.stack
    };
  }
};

// Quick access functions
window.checkPendingActivations = async function() {
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available');
    return;
  }
  
  const snapshot = await window.firebaseDB
    .collection('sequenceActivations')
    .where('status', '==', 'pending')
    .get();
  
  console.log(`Found ${snapshot.size} pending activations:`);
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log(`  • ${doc.id}`);
    console.log(`    Created: ${data.createdAt?.toDate?.()?.toLocaleString() || 'unknown'}`);
    console.log(`    Contacts: ${data.totalContacts || data.contactIds?.length || 0}`);
  });
  
  return snapshot.size;
};

window.checkEmailsWaiting = async function() {
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available');
    return;
  }
  
  const notGen = await window.firebaseDB.collection('emails').where('status', '==', 'not_generated').get();
  const pending = await window.firebaseDB.collection('emails').where('status', '==', 'pending_approval').get();
  const approved = await window.firebaseDB.collection('emails').where('status', '==', 'approved').where('scheduledSendTime', '<=', Date.now()).get();
  
  console.log('Emails waiting:');
  console.log(`  • Not generated: ${notGen.size}`);
  console.log(`  • Pending approval: ${pending.size}`);
  console.log(`  • Approved & ready: ${approved.size}`);
  
  return {
    notGenerated: notGen.size,
    pendingApproval: pending.size,
    approvedReady: approved.size
  };
};

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Sequence Diagnostics Script Loaded');
console.log('════════════════════════════════════════════════════════');
console.log('');
console.log('🔍 Run full diagnostics:');
console.log('  diagnoseSequences()');
console.log('');
console.log('🎯 Quick checks:');
console.log('  checkPendingActivations()  - Check stuck activations');
console.log('  checkEmailsWaiting()       - Check emails in queue');
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');


