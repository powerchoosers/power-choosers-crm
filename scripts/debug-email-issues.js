/**
 * Email Diagnostic Script
 * Run this in the browser console to diagnose email loading and sequence issues
 */

(async function debugEmailIssues() {
  console.log('🔍 EMAIL DIAGNOSTIC REPORT');
  console.log('================================\n');

  // 1. Check Inbox Emails
  console.log('📥 INBOX EMAILS:');
  console.log('-----------------');
  
  if (window.BackgroundEmailsLoader) {
    const allEmails = window.BackgroundEmailsLoader.getEmailsData() || [];
    const inboxEmails = allEmails.filter(e => {
      return (e.type === 'received' || 
              e.emailType === 'received' || 
              e.provider === 'sendgrid_inbound' ||
              (!e.type && !e.emailType && !e.isSentEmail)) && 
             !e.deleted;
    });
    
    console.log(`  Loaded in memory: ${allEmails.length} total emails`);
    console.log(`  Filtered inbox: ${inboxEmails.length} emails`);
    
    // Get real count from Firestore
    if (typeof window.BackgroundEmailsLoader.getTotalCountByFolder === 'function') {
      try {
        const realInboxCount = await window.BackgroundEmailsLoader.getTotalCountByFolder('inbox');
        console.log(`  Real inbox count (Firestore): ${realInboxCount} emails`);
        console.log(`  ⚠️  Difference: ${realInboxCount - inboxEmails.length} emails not loaded`);
      } catch (e) {
        console.warn('  Could not get real inbox count:', e);
      }
    }
    
    // Check footer count
    const footerCount = document.getElementById('emails-count')?.textContent || 'N/A';
    const footerSummary = document.getElementById('emails-summary')?.textContent || 'N/A';
    console.log(`  Footer count: ${footerCount}`);
    console.log(`  Footer summary: ${footerSummary}`);
  } else {
    console.warn('  BackgroundEmailsLoader not available');
  }
  
  console.log('');

  // 2. Check Scheduled Emails
  console.log('📅 SCHEDULED EMAILS:');
  console.log('---------------------');
  
  if (window.BackgroundEmailsLoader) {
    const allEmails = window.BackgroundEmailsLoader.getEmailsData() || [];
    const scheduledEmails = allEmails.filter(e => {
      const isScheduled = e.type === 'scheduled';
      const isPending = e.status === 'not_generated' || e.status === 'pending_approval';
      const isGenerating = e.status === 'generating';
      const isApproved = e.status === 'approved';
      const notDeleted = !e.deleted;
      const notSent = e.status !== 'sent' && e.status !== 'delivered';
      
      const hasSendTime = e.scheduledSendTime && typeof e.scheduledSendTime === 'number';
      return isScheduled && notDeleted && notSent && 
             (isPending || isGenerating || (isApproved && hasSendTime && e.scheduledSendTime >= (Date.now() - 60000)));
    });
    
    console.log(`  Loaded in memory: ${scheduledEmails.length} scheduled emails`);
    
    // Breakdown by status
    const byStatus = {};
    scheduledEmails.forEach(e => {
      const status = e.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    console.log(`  Status breakdown:`, byStatus);
    
    // Get real count from Firestore
    if (typeof window.BackgroundEmailsLoader.getTotalCountByFolder === 'function') {
      try {
        const realScheduledCount = await window.BackgroundEmailsLoader.getTotalCountByFolder('scheduled');
        console.log(`  Real scheduled count (Firestore): ${realScheduledCount} emails`);
        console.log(`  ⚠️  Difference: ${realScheduledCount - scheduledEmails.length} scheduled emails not loaded`);
      } catch (e) {
        console.warn('  Could not get real scheduled count:', e);
      }
    }
    
    // Check if on scheduled tab
    const scheduledTab = document.querySelector('.filter-tab[data-folder="scheduled"]');
    if (scheduledTab && scheduledTab.classList.contains('active')) {
      const footerCount = document.getElementById('emails-count')?.textContent || 'N/A';
      const footerSummary = document.getElementById('emails-summary')?.textContent || 'N/A';
      console.log(`  Footer count (scheduled tab): ${footerCount}`);
      console.log(`  Footer summary (scheduled tab): ${footerSummary}`);
    }
  } else {
    console.warn('  BackgroundEmailsLoader not available');
  }
  
  console.log('');

  // 3. Check Sequence Members and Emails
  console.log('🔄 SEQUENCE MEMBERS & EMAILS:');
  console.log('------------------------------');
  
  if (!window.firebaseDB) {
    console.warn('  Firebase not available');
  } else {
    try {
      const db = window.firebaseDB;
      
      // Get all active sequences
      const sequencesSnapshot = await db.collection('sequences')
        .where('status', '==', 'active')
        .get();
      
      console.log(`  Active sequences: ${sequencesSnapshot.size}`);
      
      let totalMembers = 0;
      let totalEmailsCreated = 0;
      let totalEmailsShouldHave = 0;
      
      const sequenceDetails = [];
      
      for (const seqDoc of sequencesSnapshot.docs) {
        const seq = seqDoc.data();
        const seqId = seqDoc.id;
        
        // Count sequence members
        const membersSnapshot = await db.collection('sequenceMembers')
          .where('sequenceId', '==', seqId)
          .where('status', '==', 'active')
          .get();
        
        const memberCount = membersSnapshot.size;
        totalMembers += memberCount;
        
        // Count auto-email steps
        const autoEmailSteps = (seq.steps || []).filter(s => s.type === 'auto-email');
        const autoEmailStepCount = autoEmailSteps.length;
        
        // Count emails created for this sequence
        const emailsSnapshot = await db.collection('emails')
          .where('sequenceId', '==', seqId)
          .where('type', '==', 'scheduled')
          .get();
        
        const emailsCreated = emailsSnapshot.size;
        totalEmailsCreated += emailsCreated;
        
        // Calculate how many emails should exist
        // Each member should have one email per auto-email step (but only first step initially)
        const emailsShouldHave = memberCount * 1; // Only first step initially
        
        sequenceDetails.push({
          name: seq.name || 'Unnamed',
          id: seqId,
          members: memberCount,
          autoEmailSteps: autoEmailStepCount,
          emailsCreated: emailsCreated,
          emailsShouldHave: emailsShouldHave,
          missing: Math.max(0, emailsShouldHave - emailsCreated)
        });
      }
      
      console.log(`  Total sequence members: ${totalMembers}`);
      console.log(`  Total emails created: ${totalEmailsCreated}`);
      console.log(`  Total emails should have: ${totalMembers} (one per member for first step)`);
      console.log(`  ⚠️  Missing emails: ${Math.max(0, totalMembers - totalEmailsCreated)}`);
      
      console.log('\n  Sequence Details:');
      sequenceDetails.forEach((detail, idx) => {
        console.log(`\n  ${idx + 1}. ${detail.name} (${detail.id.substring(0, 8)}...)`);
        console.log(`     Members: ${detail.members}`);
        console.log(`     Auto-email steps: ${detail.autoEmailSteps}`);
        console.log(`     Emails created: ${detail.emailsCreated}`);
        console.log(`     Emails should have: ${detail.emailsShouldHave}`);
        if (detail.missing > 0) {
          console.log(`     ⚠️  MISSING: ${detail.missing} emails`);
        }
      });
      
    } catch (error) {
      console.error('  Error checking sequences:', error);
    }
  }
  
  console.log('');

  // 4. Check Sequence Activations
  console.log('🚀 SEQUENCE ACTIVATIONS:');
  console.log('-------------------------');
  
  if (!window.firebaseDB) {
    console.warn('  Firebase not available');
  } else {
    try {
      const db = window.firebaseDB;
      
      // Check pending activations
      const pendingActivations = await db.collection('sequenceActivations')
        .where('status', '==', 'pending')
        .get();
      
      console.log(`  Pending activations: ${pendingActivations.size}`);
      
      // Check processing activations
      const processingActivations = await db.collection('sequenceActivations')
        .where('status', '==', 'processing')
        .get();
      
      console.log(`  Processing activations: ${processingActivations.size}`);
      
      // Check completed activations
      const completedActivations = await db.collection('sequenceActivations')
        .where('status', '==', 'completed')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      
      console.log(`  Recent completed activations: ${completedActivations.size}`);
      
      if (pendingActivations.size > 0) {
        console.log('\n  ⚠️  PENDING ACTIVATIONS FOUND - These need to be processed!');
        pendingActivations.forEach(doc => {
          const data = doc.data();
          console.log(`    - ${doc.id}: ${data.sequenceName || 'Unknown'} (${data.processedContacts || 0}/${data.contactIds?.length || 0} processed)`);
        });
      }
      
      if (processingActivations.size > 0) {
        console.log('\n  ⚠️  PROCESSING ACTIVATIONS FOUND - These may be stuck!');
        processingActivations.forEach(doc => {
          const data = doc.data();
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          const ageMinutes = (Date.now() - createdAt.getTime()) / (60 * 1000);
          console.log(`    - ${doc.id}: ${data.sequenceName || 'Unknown'} (${ageMinutes.toFixed(1)} minutes old, ${data.processedContacts || 0}/${data.contactIds?.length || 0} processed)`);
        });
      }
      
    } catch (error) {
      console.error('  Error checking activations:', error);
    }
  }
  
  console.log('');

  // 5. Check Email Generation Status
  console.log('🤖 EMAIL GENERATION STATUS:');
  console.log('----------------------------');
  
  if (!window.firebaseDB) {
    console.warn('  Firebase not available');
  } else {
    try {
      const db = window.firebaseDB;
      
      // Count not_generated emails
      const notGeneratedQuery = db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('status', '==', 'not_generated');
      
      const notGeneratedSnapshot = await notGeneratedQuery.get();
      console.log(`  Not generated emails: ${notGeneratedSnapshot.size}`);
      
      // Count pending_approval emails
      const pendingApprovalQuery = db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('status', '==', 'pending_approval');
      
      const pendingApprovalSnapshot = await pendingApprovalQuery.get();
      console.log(`  Pending approval emails: ${pendingApprovalSnapshot.size}`);
      
      // Count generating emails
      const generatingQuery = db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('status', '==', 'generating');
      
      const generatingSnapshot = await generatingQuery.get();
      console.log(`  Generating emails: ${generatingSnapshot.size}`);
      
      // Check when last generation ran
      const recentGenerated = await db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('status', '==', 'pending_approval')
        .orderBy('generatedAt', 'desc')
        .limit(1)
        .get();
      
      if (!recentGenerated.empty) {
        const lastGenerated = recentGenerated.docs[0].data();
        const generatedAt = lastGenerated.generatedAt ? new Date(lastGenerated.generatedAt) : null;
        if (generatedAt) {
          const ageMinutes = (Date.now() - generatedAt.getTime()) / (60 * 1000);
          console.log(`  Last generation: ${ageMinutes.toFixed(1)} minutes ago`);
        }
      } else {
        console.log(`  ⚠️  No emails have been generated yet`);
      }
      
      if (notGeneratedSnapshot.size > 0) {
        console.log(`\n  ⚠️  ${notGeneratedSnapshot.size} emails are waiting to be generated!`);
        console.log(`     Run "Generate Now" button or wait for automatic generation (every 30 minutes)`);
      }
      
    } catch (error) {
      console.error('  Error checking generation status:', error);
    }
  }
  
  console.log('');

  // 6. Summary & Recommendations
  console.log('📋 SUMMARY & RECOMMENDATIONS:');
  console.log('------------------------------');
  
  if (window.BackgroundEmailsLoader) {
    const allEmails = window.BackgroundEmailsLoader.getEmailsData() || [];
    const hasMore = window.BackgroundEmailsLoader.hasMore ? window.BackgroundEmailsLoader.hasMore() : false;
    
    console.log(`  Total emails loaded: ${allEmails.length}`);
    console.log(`  More emails available: ${hasMore ? 'Yes' : 'No'}`);
    
    if (hasMore) {
      console.log(`  💡 TIP: More emails available - pagination will load them automatically`);
    }
  }
  
  console.log('\n✅ Diagnostic complete!');
  console.log('================================\n');
})();

