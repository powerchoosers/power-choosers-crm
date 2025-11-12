/**
 * Console Script: Check Email Ownership Fields
 * 
 * This script checks if emails have ownership fields that match your email.
 * 
 * Usage:
 * 1. Open your browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Call: checkEmailOwnership()
 */

window.checkEmailOwnership = async function() {
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('  🔍 CHECKING EMAIL OWNERSHIP');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  
  if (!window.firebaseDB) {
    console.error('❌ Firebase not available');
    return;
  }
  
  const userEmail = (window.currentUserEmail || '').toLowerCase();
  const isAdmin = window.currentUserRole === 'admin';
  
  console.log(`User: ${userEmail || 'unknown'}`);
  console.log(`Role: ${isAdmin ? 'admin' : 'employee'}`);
  console.log('');
  
  try {
    // Get all inbound emails
    console.log('📧 Checking inbound emails...');
    
    const inboundSnapshot = await window.firebaseDB.collection('emails')
      .where('type', '==', 'received')
      .limit(50)
      .get();
    
    console.log(`  Found ${inboundSnapshot.size} received emails`);
    
    const ownershipStats = {
      matchesUser: 0,
      differentOwner: 0,
      missingOwner: 0,
      sample: []
    };
    
    inboundSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = (data.ownerId || '').toLowerCase();
      const assignedTo = (data.assignedTo || '').toLowerCase();
      const to = data.to || '';
      
      if (!ownerId && !assignedTo) {
        ownershipStats.missingOwner++;
      } else if (ownerId === userEmail || assignedTo === userEmail) {
        ownershipStats.matchesUser++;
      } else {
        ownershipStats.differentOwner++;
        
        // Collect samples
        if (ownershipStats.sample.length < 5) {
          ownershipStats.sample.push({
            id: doc.id,
            to: to,
            ownerId: data.ownerId || 'MISSING',
            assignedTo: data.assignedTo || 'MISSING',
            subject: data.subject || '(no subject)'
          });
        }
      }
    });
    
    console.log('');
    console.log('  Ownership breakdown:');
    console.log(`    ✅ Matches your email: ${ownershipStats.matchesUser}`);
    console.log(`    ❌ Different owner: ${ownershipStats.differentOwner}`);
    console.log(`    ⚠️  Missing ownership: ${ownershipStats.missingOwner}`);
    
    if (ownershipStats.sample.length > 0) {
      console.log('');
      console.log('  Sample emails with different owners:');
      ownershipStats.sample.forEach((email, i) => {
        console.log(`    ${i + 1}. ${email.subject}`);
        console.log(`       To: ${email.to}`);
        console.log(`       OwnerId: ${email.ownerId}`);
        console.log(`       AssignedTo: ${email.assignedTo}`);
      });
    }
    
    // Check if user's emails are being queried correctly
    console.log('');
    console.log('🔍 Testing Firestore query...');
    
    if (!isAdmin && userEmail) {
      const userEmailsSnapshot = await window.firebaseDB.collection('emails')
        .where('ownerId', '==', userEmail)
        .limit(10)
        .get();
      
      console.log(`  Query: where('ownerId', '==', '${userEmail}')`);
      console.log(`  Result: ${userEmailsSnapshot.size} emails`);
      
      if (userEmailsSnapshot.size === 0 && ownershipStats.matchesUser > 0) {
        console.log('');
        console.log('  ⚠️  ISSUE: Emails have ownership but query returns 0!');
        console.log('  This might be a case-sensitivity issue.');
        console.log('');
        console.log('  Checking first email ownership field...');
        if (inboundSnapshot.docs.length > 0) {
          const firstEmail = inboundSnapshot.docs[0].data();
          console.log(`    ownerId in Firestore: "${firstEmail.ownerId}"`);
          console.log(`    Your email: "${userEmail}"`);
          console.log(`    Match: ${(firstEmail.ownerId || '').toLowerCase() === userEmail}`);
        }
      }
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('  📊 SUMMARY');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    
    if (ownershipStats.matchesUser > 0) {
      console.log(`✅ You have ${ownershipStats.matchesUser} emails that should appear in your inbox`);
      console.log('');
      console.log('If they\'re not showing:');
      console.log('  1. Clear the cache: clearEmailCacheAndReload()');
      console.log('  2. Refresh the emails page');
    } else if (ownershipStats.differentOwner > 0) {
      console.log('⚠️  ISSUE: Emails have ownership fields, but they don\'t match your email!');
      console.log('');
      console.log('The backfill set ownership based on the recipient email.');
      console.log('If the recipient email doesn\'t match your user email, they won\'t show.');
      console.log('');
      console.log('Check the sample emails above to see what ownerId values were set.');
    } else {
      console.log('⚠️  No emails found with ownership matching your email.');
    }
    
    console.log('');
    
    return ownershipStats;
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error);
    console.error('');
    
    if (error.code === 9 || error.message.includes('index')) {
      const linkMatch = error.message.match(/https:\/\/[^\s]+/);
      if (linkMatch) {
        console.log('🔗 INDEX REQUIRED:', linkMatch[0]);
      }
    }
    
    return { error: error.message };
  }
};

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Email Ownership Check Script Loaded');
console.log('════════════════════════════════════════════════════════');
console.log('');
console.log('🔍 Check ownership:');
console.log('  checkEmailOwnership()');
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');



