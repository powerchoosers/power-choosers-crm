/**
 * Console Script: Clear Email Cache and Reload
 * 
 * This script will:
 * 1. Clear the emails cache (removes old emails without ownership)
 * 2. Reload emails from Firestore (with ownership fields)
 * 3. Show you how many emails were loaded
 * 
 * Usage:
 * 1. Open your browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Call: clearEmailCacheAndReload()
 */

window.clearEmailCacheAndReload = async function() {
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('  🔄 CLEARING EMAIL CACHE AND RELOADING');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  
  try {
    // Step 1: Clear the cache
    console.log('🗑️  Step 1: Clearing emails cache...');
    
    if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
      await window.CacheManager.invalidate('emails');
      console.log('  ✅ Cache cleared');
    } else {
      console.log('  ⚠️  CacheManager not available, trying localStorage...');
      // Fallback: clear localStorage cache
      const userEmail = window.currentUserEmail || '';
      const cacheKey = userEmail ? `userEmails:${userEmail}` : 'emails';
      localStorage.removeItem(cacheKey);
      console.log('  ✅ localStorage cache cleared');
    }
    
    // Step 2: Unsubscribe from old realtime listeners
    console.log('');
    console.log('🔌 Step 2: Stopping old realtime listeners...');
    
    if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.unsubscribe === 'function') {
      window.BackgroundEmailsLoader.unsubscribe();
      console.log('  ✅ Listeners stopped');
    }
    
    // Step 3: Reload from Firestore
    console.log('');
    console.log('📥 Step 3: Reloading emails from Firestore...');
    
    if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.reload === 'function') {
      await window.BackgroundEmailsLoader.reload();
      console.log('  ✅ Reloaded from Firestore');
    } else {
      console.log('  ⚠️  BackgroundEmailsLoader not available, reloading page...');
      window.location.reload();
      return;
    }
    
    // Step 4: Check results
    console.log('');
    console.log('📊 Step 4: Checking results...');
    
    const emailCount = window.BackgroundEmailsLoader ? window.BackgroundEmailsLoader.getCount() : 0;
    const emailsData = window.BackgroundEmailsLoader ? window.BackgroundEmailsLoader.getEmailsData() : [];
    
    console.log(`  Total emails loaded: ${emailCount}`);
    
    // Count by type
    const byType = {};
    const byOwnership = { hasOwnership: 0, missingOwnership: 0 };
    
    emailsData.forEach(email => {
      const type = email.type || email.emailType || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      
      if (email.ownerId || email.assignedTo) {
        byOwnership.hasOwnership++;
      } else {
        byOwnership.missingOwnership++;
      }
    });
    
    console.log('');
    console.log('  Email breakdown:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`    • ${type}: ${count}`);
    });
    
    console.log('');
    console.log('  Ownership status:');
    console.log(`    • With ownership fields: ${byOwnership.hasOwnership}`);
    console.log(`    • Missing ownership: ${byOwnership.missingOwnership}`);
    
    // Step 5: Verify user's emails
    const userEmail = (window.currentUserEmail || '').toLowerCase();
    if (userEmail && window.currentUserRole !== 'admin') {
      console.log('');
      console.log(`  Checking emails for user: ${userEmail}`);
      
      const userEmails = emailsData.filter(email => {
        const ownerId = (email.ownerId || '').toLowerCase();
        const assignedTo = (email.assignedTo || '').toLowerCase();
        return ownerId === userEmail || assignedTo === userEmail;
      });
      
      console.log(`  ✅ Found ${userEmails.length} emails owned by or assigned to you`);
      
      // Count received emails
      const receivedEmails = userEmails.filter(email => 
        email.type === 'received' || 
        email.emailType === 'received' || 
        email.provider === 'sendgrid_inbound'
      );
      
      console.log(`  📥 Inbox emails (received): ${receivedEmails.length}`);
      
      // Count sent emails
      const sentEmails = userEmails.filter(email => 
        email.type === 'sent' || 
        email.emailType === 'sent' || 
        email.isSentEmail === true
      );
      
      console.log(`  📤 Sent emails: ${sentEmails.length}`);
    }
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('  ✅ COMPLETE');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
    console.log('🔄 Refresh the emails page to see your emails!');
    console.log('');
    
    // Trigger page reload if on emails page
    if (window.EmailsPage && typeof window.EmailsPage.reload === 'function') {
      console.log('🔄 Reloading emails page...');
      await window.EmailsPage.reload();
    }
    
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast(`✓ Cache cleared and reloaded: ${emailCount} emails`, 'success', 5000);
    }
    
    return {
      success: true,
      emailCount,
      byType,
      byOwnership
    };
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error);
    console.error('');
    console.error(error.stack);
    
    if (window.crm && typeof window.crm.showToast === 'function') {
      window.crm.showToast('Failed to clear cache. Check console for details.', 'error');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
};

// Quick helper
window.clearCache = clearEmailCacheAndReload;

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Clear Email Cache Script Loaded');
console.log('════════════════════════════════════════════════════════');
console.log('');
console.log('🔄 Clear cache and reload:');
console.log('  clearEmailCacheAndReload()  - Full process');
console.log('  clearCache()                 - Shortcut');
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');



