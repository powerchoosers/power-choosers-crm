/**
 * Console Script: Diagnose Email Inbox Issues
 * 
 * This script will:
 * 1. Test Firestore queries and trigger index creation links if needed
 * 2. Check what emails are actually in Firestore
 * 3. Show why emails aren't appearing in inbox
 * 4. Test the filter logic
 * 
 * Usage:
 * 1. Open your browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Call: diagnoseEmailInbox()
 */

window.diagnoseEmailInbox = async function() {
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('  🔍 EMAIL INBOX DIAGNOSTICS');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available. Make sure you are logged in.');
    return;
  }
  
  const results = {
    timestamp: new Date().toISOString(),
    totalEmails: 0,
    emailsByType: {},
    inboxFilterResults: [],
    indexIssues: [],
    recommendations: []
  };
  
  try {
    // Test 1: Query all emails (same as emails-redesigned.js line 186)
    console.log('📧 Test 1: Querying all emails (orderBy createdAt)...');
    
    let allEmails = [];
    let indexNeeded = false;
    
    try {
      const emailsSnapshot = await window.firebaseDB.collection('emails')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      
      allEmails = emailsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.sentAt || data.receivedAt || data.createdAt
        };
      });
      
      results.totalEmails = allEmails.length;
      console.log(`  ✅ Found ${allEmails.length} emails (no index needed for this query)`);
      
    } catch (error) {
      if (error.code === 9 || error.message.includes('index')) {
        indexNeeded = true;
        results.indexIssues.push({
          query: 'emails.orderBy(createdAt)',
          error: error.message,
          link: error.message.match(/https:\/\/[^\s]+/)?.[0] || 'Check Firestore console'
        });
        console.error('  ❌ INDEX REQUIRED!');
        console.error('  Error:', error.message);
        
        // Try to extract the index link
        const linkMatch = error.message.match(/https:\/\/[^\s]+/);
        if (linkMatch) {
          console.log('');
          console.log('  🔗 INDEX CREATION LINK:');
          console.log('  ', linkMatch[0]);
          console.log('');
          console.log('  Click the link above to create the required index automatically.');
        } else {
          console.log('');
          console.log('  ⚠️  Go to Firestore Console → Indexes tab');
          console.log('  Create index for: emails collection');
          console.log('  Fields: createdAt (Descending)');
        }
      } else {
        console.error('  ❌ Query failed:', error);
        results.indexIssues.push({
          query: 'emails.orderBy(createdAt)',
          error: error.message
        });
      }
    }
    
    // Test 2: Analyze email types
    console.log('');
    console.log('📊 Test 2: Analyzing email types...');
    
    const typeBreakdown = {};
    const inboxCandidates = [];
    const sentEmails = [];
    
    allEmails.forEach(email => {
      const type = email.type || email.emailType || 'unknown';
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
      
      // Test inbox filter logic (from emails-redesigned.js lines 280-290)
      const isInboxCandidate = (
        email.type === 'received' || 
        email.emailType === 'received' || 
        email.provider === 'sendgrid_inbound' ||
        (!email.type && !email.emailType && !email.isSentEmail)
      ) && !email.deleted;
      
      if (isInboxCandidate) {
        inboxCandidates.push({
          id: email.id,
          type: email.type || email.emailType || 'none',
          provider: email.provider || 'none',
          isSentEmail: email.isSentEmail || false,
          from: email.from || 'unknown',
          subject: email.subject || '(no subject)',
          deleted: email.deleted || false
        });
      }
      
      // Test sent filter logic
      const isSent = (
        email.type === 'sent' ||
        email.emailType === 'sent' ||
        email.isSentEmail === true ||
        email.status === 'sent' ||
        email.provider === 'sendgrid'
      );
      
      if (isSent) {
        sentEmails.push({
          id: email.id,
          type: email.type || email.emailType || 'none',
          status: email.status || 'none',
          provider: email.provider || 'none',
          to: Array.isArray(email.to) ? email.to[0] : email.to || 'unknown',
          subject: email.subject || '(no subject)'
        });
      }
    });
    
    results.emailsByType = typeBreakdown;
    results.inboxFilterResults = inboxCandidates;
    
    console.log('  Email types breakdown:');
    Object.entries(typeBreakdown).forEach(([type, count]) => {
      console.log(`    • ${type}: ${count}`);
    });
    
    console.log('');
    console.log(`  📥 Inbox candidates: ${inboxCandidates.length}`);
    console.log(`  📤 Sent emails: ${sentEmails.length}`);
    
    // Test 3: Check for missing fields
    console.log('');
    console.log('🔍 Test 3: Checking for missing fields...');
    
    const missingType = allEmails.filter(e => !e.type && !e.emailType && !e.provider);
    const missingFrom = allEmails.filter(e => !e.from);
    const missingSubject = allEmails.filter(e => !e.subject);
    
    if (missingType.length > 0) {
      console.log(`  ⚠️  ${missingType.length} emails missing type/emailType/provider`);
      results.recommendations.push(`${missingType.length} emails have no type field - they may not show in inbox`);
    }
    
    if (missingFrom.length > 0) {
      console.log(`  ⚠️  ${missingFrom.length} emails missing 'from' field`);
    }
    
    if (missingSubject.length > 0) {
      console.log(`  ⚠️  ${missingSubject.length} emails missing 'subject' field`);
    }
    
    // Test 4: Check cache vs Firebase
    console.log('');
    console.log('💾 Test 4: Checking cache vs Firebase...');
    
    let cachedEmails = [];
    try {
      if (window.CacheManager && typeof window.CacheManager.get === 'function') {
        cachedEmails = await window.CacheManager.get('emails') || [];
        console.log(`  Cached emails: ${cachedEmails.length}`);
      }
      
      if (window.BackgroundEmailsLoader) {
        const loaderEmails = window.BackgroundEmailsLoader.getEmailsData() || [];
        console.log(`  Background loader emails: ${loaderEmails.length}`);
      }
    } catch (e) {
      console.warn('  Could not check cache:', e);
    }
    
    // Test 5: Sample emails that should be in inbox
    console.log('');
    console.log('📋 Test 5: Sample inbox candidates (first 5):');
    
    if (inboxCandidates.length > 0) {
      inboxCandidates.slice(0, 5).forEach((email, i) => {
        console.log(`  ${i + 1}. ${email.subject}`);
        console.log(`     From: ${email.from}`);
        console.log(`     Type: ${email.type || 'none'}, Provider: ${email.provider || 'none'}`);
        console.log(`     ID: ${email.id}`);
      });
    } else {
      console.log('  ⚠️  NO EMAILS MATCH INBOX FILTER!');
      console.log('');
      console.log('  This means:');
      console.log('    • Emails in Firestore don\'t have type="received"');
      console.log('    • Emails don\'t have provider="sendgrid_inbound"');
      console.log('    • Emails might have isSentEmail=true when they shouldn\'t');
      console.log('');
      console.log('  Sample emails from Firestore:');
      allEmails.slice(0, 3).forEach((email, i) => {
        console.log(`  ${i + 1}. ID: ${email.id}`);
        console.log(`     Type: ${email.type || 'none'}`);
        console.log(`     EmailType: ${email.emailType || 'none'}`);
        console.log(`     Provider: ${email.provider || 'none'}`);
        console.log(`     IsSentEmail: ${email.isSentEmail || false}`);
        console.log(`     Status: ${email.status || 'none'}`);
        console.log(`     From: ${email.from || 'none'}`);
      });
    }
    
    // Summary and recommendations
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('  📊 SUMMARY');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    
    if (indexNeeded) {
      console.log('🚨 CRITICAL: Firestore index required!');
      console.log('');
      results.recommendations.push('Create Firestore index for emails collection (see link above)');
    }
    
    if (inboxCandidates.length === 0 && allEmails.length > 0) {
      console.log('⚠️  ISSUE: Emails exist but none match inbox filter!');
      console.log('');
      console.log('  Possible causes:');
      console.log('  1. Emails missing type="received" field');
      console.log('  2. Emails have isSentEmail=true when they shouldn\'t');
      console.log('  3. Emails have provider field but not "sendgrid_inbound"');
      console.log('');
      results.recommendations.push('Emails need type="received" or provider="sendgrid_inbound" to show in inbox');
      results.recommendations.push('Check sample emails above to see what fields they have');
    } else if (inboxCandidates.length > 0) {
      console.log(`✅ Found ${inboxCandidates.length} emails that should appear in inbox`);
      if (inboxCandidates.length < allEmails.length) {
        console.log(`   (${allEmails.length - inboxCandidates.length} emails filtered out)`);
      }
    }
    
    if (missingType.length > 0) {
      results.recommendations.push(`Add type field to ${missingType.length} emails`);
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('  🛠️  RECOMMENDATIONS');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    
    if (results.recommendations.length === 0) {
      console.log('✅ Everything looks good!');
      console.log('');
      console.log('If emails still don\'t show:');
      console.log('  1. Clear browser cache and reload');
      console.log('  2. Check BackgroundEmailsLoader is running');
      console.log('  3. Check emails-redesigned.js filter logic');
    } else {
      results.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    
    // Store results globally
    window.emailInboxDiagnostics = results;
    
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

// Quick test function that forces index creation link
window.testEmailQuery = async function() {
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available');
    return;
  }
  
  console.log('Testing email query to trigger index link if needed...');
  
  try {
    // This query will fail if index is needed and show the link
    const snapshot = await window.firebaseDB.collection('emails')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    console.log('✅ Query successful - no index needed');
    console.log(`Found ${snapshot.size} emails`);
    
  } catch (error) {
    if (error.code === 9 || error.message.includes('index')) {
      console.error('');
      console.error('❌ INDEX REQUIRED!');
      console.error('');
      console.error('Error:', error.message);
      console.error('');
      
      // Extract index link
      const linkMatch = error.message.match(/https:\/\/[^\s]+/);
      if (linkMatch) {
        console.log('🔗 CLICK THIS LINK TO CREATE INDEX:');
        console.log(linkMatch[0]);
        console.log('');
        console.log('Or copy this URL:');
        console.log(linkMatch[0]);
        
        // Try to open in new window
        if (confirm('Open index creation page in new tab?')) {
          window.open(linkMatch[0], '_blank');
        }
      } else {
        console.log('⚠️  No automatic link found. Go to:');
        console.log('https://console.cloud.google.com/firestore/indexes?project=power-choosers-crm');
        console.log('');
        console.log('Create index for:');
        console.log('  Collection: emails');
        console.log('  Fields: createdAt (Descending)');
      }
    } else {
      console.error('❌ Query failed:', error);
    }
  }
};

// Function to check what fields emails actually have
window.checkEmailFields = async function(limit = 10) {
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available');
    return;
  }
  
  try {
    const snapshot = await window.firebaseDB.collection('emails')
      .limit(limit)
      .get();
    
    console.log(`Checking fields on ${snapshot.size} emails...`);
    console.log('');
    
    const fieldStats = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      Object.keys(data).forEach(key => {
        fieldStats[key] = (fieldStats[key] || 0) + 1;
      });
    });
    
    console.log('Fields found (and how many emails have them):');
    Object.entries(fieldStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        console.log(`  ${field}: ${count}/${snapshot.size}`);
      });
    
    console.log('');
    console.log('Sample emails:');
    snapshot.docs.slice(0, 3).forEach((doc, i) => {
      const data = doc.data();
      console.log(`  ${i + 1}. ID: ${doc.id}`);
      console.log(`     Type: ${data.type || 'MISSING'}`);
      console.log(`     EmailType: ${data.emailType || 'MISSING'}`);
      console.log(`     Provider: ${data.provider || 'MISSING'}`);
      console.log(`     IsSentEmail: ${data.isSentEmail || false}`);
      console.log(`     Status: ${data.status || 'MISSING'}`);
      console.log(`     From: ${data.from || 'MISSING'}`);
      console.log(`     Subject: ${data.subject || 'MISSING'}`);
      console.log('');
    });
    
    return fieldStats;
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.code === 9 || error.message.includes('index')) {
      const linkMatch = error.message.match(/https:\/\/[^\s]+/);
      if (linkMatch) {
        console.log('');
        console.log('🔗 INDEX LINK:', linkMatch[0]);
      }
    }
  }
};

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Email Inbox Diagnostics Script Loaded');
console.log('════════════════════════════════════════════════════════');
console.log('');
console.log('🔍 Run full diagnostics:');
console.log('  diagnoseEmailInbox()');
console.log('');
console.log('🎯 Quick tests:');
console.log('  testEmailQuery()        - Test query and get index link if needed');
console.log('  checkEmailFields(10)    - See what fields emails actually have');
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');

