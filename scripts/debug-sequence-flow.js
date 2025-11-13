'use strict';

// Diagnostic tool to debug sequence email generation flow
window.debugSequenceFlow = async function() {
  console.log('===== SEQUENCE FLOW DIAGNOSTIC =====');
  
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available');
    return;
  }
  
  const db = window.firebaseDB;
  const currentUserEmail = (() => {
    try {
      if (window.DataManager && typeof window.DataManager.getCurrentUserEmail === 'function') {
        return String(window.DataManager.getCurrentUserEmail() || '').toLowerCase();
      }
      return String(window.currentUserEmail || '').toLowerCase();
    } catch (_) {
      return String(window.currentUserEmail || '').toLowerCase();
    }
  })();
  
  console.log('Current User Email:', currentUserEmail);
  
  // Step 1: Check for sequenceActivations
  console.log('\n📋 STEP 1: Checking sequenceActivations...');
  try {
    const activationsQuery = await db.collection('sequenceActivations')
      .where('ownerId', '==', currentUserEmail)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    console.log(`Found ${activationsQuery.size} activations for your account`);
    
    if (!activationsQuery.empty) {
      const activations = [];
      activationsQuery.forEach(doc => {
        const data = doc.data();
        activations.push({
          id: doc.id,
          status: data.status,
          sequenceId: data.sequenceId,
          contactIds: data.contactIds?.length || 0,
          processedContacts: data.processedContacts || 0,
          createdAt: data.createdAt?.toDate?.() || 'N/A'
        });
      });
      // Display activations (fallback for browsers without console.table)
      if (typeof console.table === 'function') {
        console.table(activations);
      } else {
        activations.forEach(a => {
          console.log(`  ${a.id}: ${a.status} | Contacts: ${a.processedContacts}/${a.contactIds} | Created: ${a.createdAt}`);
        });
      }
      
      // Check for pending ones
      const pending = activations.filter(a => a.status === 'pending');
      if (pending.length > 0) {
        console.log(`\n⏳ ${pending.length} activation(s) are PENDING - waiting for cron to process`);
        console.log('💡 Cron runs every 30 minutes. You can manually trigger processing.');
      }
      
      const processing = activations.filter(a => a.status === 'processing');
      if (processing.length > 0) {
        console.log(`\n⚙️ ${processing.length} activation(s) are PROCESSING - currently being handled`);
      }
      
      const completed = activations.filter(a => a.status === 'completed');
      if (completed.length > 0) {
        console.log(`\n✅ ${completed.length} activation(s) COMPLETED`);
      }
    } else {
      console.log('❌ No activations found. Did you enable a sequence?');
      return;
    }
  } catch (error) {
    if (error.message?.includes('index')) {
      console.error('❌ MISSING INDEX: sequenceActivations');
      console.log('📝 Create this index in Firebase Console:');
      console.log('   Collection: sequenceActivations');
      console.log('   Fields: ownerId (Ascending), createdAt (Descending)');
      console.log('   Query scope: Collection');
      if (error.message.includes('create it here:')) {
        const match = error.message.match(/https:\/\/[^\s]+/);
        if (match) {
          console.log(`   Direct link: ${match[0]}`);
        }
      }
    } else {
      console.error('Error checking activations:', error);
    }
  }
  
  // Step 2: Check for scheduled emails
  console.log('\n📧 STEP 2: Checking scheduled emails...');
  try {
    const now = Date.now();
    const emailsQuery = await db.collection('emails')
      .where('type', '==', 'scheduled')
      .where('ownerId', '==', currentUserEmail)
      .orderBy('scheduledSendTime', 'asc')
      .limit(50)
      .get();
    
    console.log(`Found ${emailsQuery.size} scheduled emails for your account`);
    
    if (!emailsQuery.empty) {
      const emails = [];
      const byStatus = {};
      
      emailsQuery.forEach(doc => {
        const data = doc.data();
        const status = data.status || 'unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;
        
        const scheduledTime = data.scheduledSendTime || 0;
        const minutesUntil = Math.round((scheduledTime - now) / (60 * 1000));
        
        emails.push({
          id: doc.id,
          status: status,
          to: data.to,
          contactName: data.contactName,
          scheduledTime: new Date(scheduledTime).toLocaleString(),
          minutesUntil: minutesUntil,
          sequenceName: data.sequenceName || 'N/A',
          subject: data.subject || '(not generated yet)'
        });
      });
      
      console.log('\nBreakdown by status:');
      if (typeof console.table === 'function') {
        console.table(byStatus);
      } else {
        Object.entries(byStatus).forEach(([status, count]) => {
          console.log(`  ${status}: ${count}`);
        });
      }
      
      console.log('\nAll scheduled emails:');
      if (typeof console.table === 'function') {
        console.table(emails);
      } else {
        emails.forEach(e => {
          console.log(`  ${e.id}: ${e.status} | To: ${e.to} | Scheduled: ${e.scheduledTime} (${e.minutesUntil} min)`);
        });
      }
      
      // Check for not_generated
      const notGenerated = emails.filter(e => e.status === 'not_generated');
      if (notGenerated.length > 0) {
        console.log(`\n📝 ${notGenerated.length} email(s) need content generation`);
        console.log('💡 Run: await debugTriggerGeneration()');
      }
      
      // Check for pending_approval
      const pendingApproval = emails.filter(e => e.status === 'pending_approval');
      if (pendingApproval.length > 0) {
        console.log(`\n✋ ${pendingApproval.length} email(s) need your approval in the Scheduled tab`);
      }
      
      // Check for approved
      const approved = emails.filter(e => e.status === 'approved');
      if (approved.length > 0) {
        const readyToSend = approved.filter(e => e.minutesUntil <= 0);
        console.log(`\n✅ ${approved.length} email(s) approved`);
        if (readyToSend.length > 0) {
          console.log(`   ${readyToSend.length} ready to send NOW`);
        }
      }
    } else {
      console.log('❌ No scheduled emails found.');
      console.log('💡 This means:');
      console.log('   1. No activation has been processed yet (waiting for cron)');
      console.log('   2. OR contacts have no email addresses');
      console.log('   3. OR sequence has no auto-email steps');
    }
  } catch (error) {
    if (error.message?.includes('index')) {
      console.error('❌ MISSING INDEX: emails');
      console.log('📝 Create this index in Firebase Console:');
      console.log('   Collection: emails');
      console.log('   Fields: type (Ascending), ownerId (Ascending), scheduledSendTime (Ascending)');
      console.log('   Query scope: Collection');
      if (error.message.includes('create it here:')) {
        const match = error.message.match(/https:\/\/[^\s]+/);
        if (match) {
          console.log(`   Direct link: ${match[0]}`);
        }
      }
    } else {
      console.error('Error checking scheduled emails:', error);
    }
  }
  
  // Step 3: Check sequences
  console.log('\n📊 STEP 3: Checking active sequences...');
  try {
    const sequencesQuery = await db.collection('sequences')
      .where('ownerId', '==', currentUserEmail)
      .where('status', '==', 'active')
      .get();
    
    console.log(`Found ${sequencesQuery.size} active sequence(s)`);
    
    if (!sequencesQuery.empty) {
      const sequences = [];
      sequencesQuery.forEach(doc => {
        const data = doc.data();
        const autoEmailSteps = (data.steps || []).filter(s => s.type === 'auto-email').length;
        sequences.push({
          id: doc.id,
          name: data.name,
          status: data.status,
          totalSteps: data.steps?.length || 0,
          autoEmailSteps: autoEmailSteps
        });
      });
      if (typeof console.table === 'function') {
        console.table(sequences);
      } else {
        sequences.forEach(s => {
          console.log(`  ${s.name}: ${s.totalSteps} steps (${s.autoEmailSteps} auto-emails) | Status: ${s.status}`);
        });
      }
    }
  } catch (error) {
    console.error('Error checking sequences:', error);
  }
  
  // Step 4: Check sequence members
  console.log('\n👥 STEP 4: Checking sequence members...');
  try {
    const membersQuery = await db.collection('sequenceMembers')
      .where('ownerId', '==', currentUserEmail)
      .where('targetType', '==', 'people')
      .limit(20)
      .get();
    
    console.log(`Found ${membersQuery.size} sequence member(s)`);
    
    if (!membersQuery.empty) {
      const bySequence = {};
      membersQuery.forEach(doc => {
        const data = doc.data();
        const seqId = data.sequenceId || 'unknown';
        bySequence[seqId] = (bySequence[seqId] || 0) + 1;
      });
      
      console.log('Members by sequence:');
      if (typeof console.table === 'function') {
        console.table(bySequence);
      } else {
        Object.entries(bySequence).forEach(([seqId, count]) => {
          console.log(`  ${seqId}: ${count} member(s)`);
        });
      }
    }
  } catch (error) {
    console.error('Error checking members:', error);
  }
  
  console.log('\n===== DIAGNOSTIC COMPLETE =====\n');
  console.log('💡 MANUAL TRIGGER FUNCTIONS:');
  console.log('   await debugTriggerActivationProcessing() - Process pending activations');
  console.log('   await debugTriggerGeneration() - Generate email content');
  console.log('   await debugTriggerSending() - Send approved emails');
};

// Manual trigger for processing activations
window.debugTriggerActivationProcessing = async function() {
  console.log('🚀 Manually triggering activation processing...');
  
  try {
    const baseUrl = window.API_BASE_URL || window.location.origin || '';
    const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Result:', result);
    
    if (result.count > 0) {
      console.log(`\n✅ Processed ${result.count} activation(s)`);
      console.log('💡 Now run: await debugSequenceFlow()');
    } else {
      console.log('ℹ️ No activations to process');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
};

// Manual trigger for generating emails
window.debugTriggerGeneration = async function() {
  console.log('🚀 Manually triggering email generation...');
  
  try {
    const baseUrl = window.API_BASE_URL || window.location.origin || '';
    const response = await fetch(`${baseUrl}/api/generate-scheduled-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ immediate: true })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Result:', result);
    
    if (result.count > 0) {
      console.log(`\n✅ Generated ${result.count} email(s)`);
      console.log('💡 Check the Scheduled tab in Emails page');
      
      // Refresh emails page if viewing it
      if (window.EmailsPage && typeof window.EmailsPage.reload === 'function') {
        window.EmailsPage.reload();
      }
    } else {
      console.log('ℹ️ No emails needed generation');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
};

// Manual trigger for sending emails
window.debugTriggerSending = async function() {
  console.log('🚀 Manually triggering email sending...');
  
  try {
    const baseUrl = window.API_BASE_URL || window.location.origin || '';
    const response = await fetch(`${baseUrl}/api/send-scheduled-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Result:', result);
    
    if (result.count > 0) {
      console.log(`\n✅ Sent ${result.count} email(s)`);
    } else {
      console.log('ℹ️ No emails ready to send');
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
};

console.log('🔧 Sequence diagnostics loaded!');
console.log('Run: await debugSequenceFlow()');

