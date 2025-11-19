/**
 * Cleanup Script: Fix Orphaned Scheduled Emails
 * 
 * This script finds scheduled emails that have already been sent but weren't properly updated,
 * and fixes them by updating their type and status.
 * 
 * Usage:
 * 1. Open your browser console (F12 or Cmd+Option+I)
 * 2. Copy and paste this entire script
 * 3. Call: cleanupOrphanedScheduledEmails()
 * 
 * Options:
 * cleanupOrphanedScheduledEmails({ dryRun: true }) // Preview what would be fixed
 * cleanupOrphanedScheduledEmails({ deleteOrphaned: true }) // Delete truly orphaned records (no content)
 */

window.cleanupOrphanedScheduledEmails = async function(options = {}) {
  const {
    dryRun = false,
    deleteOrphaned = false,
    deleteMatchedSent = false  // New option: delete orphaned emails that match sent emails
  } = options;
  
  console.log('[Email Cleanup] Starting ' + (dryRun ? 'DRY RUN' : 'cleanup') + ' of orphaned scheduled emails...');
  
  if (!window.firebaseDB) {
    console.error('[Email Cleanup] Firebase not available. Make sure you are logged in.');
    return { error: 'Firebase not available' };
  }
  
  const db = window.firebaseDB;
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  const errors = [];
  const updateDetails = [];
  
  // Build a map of sent emails by recipient for cross-referencing
  // Use both time-based matching and recipient-only matching
  let sentEmailsMap = new Map(); // recipient|timeKey -> [emails]
  let sentEmailsByRecipient = new Map(); // recipient -> [emails] (for flexible matching)
  try {
    console.log('[Email Cleanup] Building sent emails map for cross-reference...');
    const sentQuery = await db.collection('emails')
      .where('type', '==', 'sent')
      .limit(500) // Get recent sent emails
      .get();
    
    sentQuery.forEach(doc => {
      const data = doc.data();
      // Safely extract recipient - handle cases where to/recipientEmail might be an object or array
      let recipient = '';
      if (data.to) {
        recipient = typeof data.to === 'string' ? data.to : (data.to.email || data.to.address || String(data.to));
      } else if (data.recipientEmail) {
        recipient = typeof data.recipientEmail === 'string' ? data.recipientEmail : String(data.recipientEmail);
      }
      recipient = (recipient || '').toLowerCase().trim();
      const sentAt = data.sentAt ? (typeof data.sentAt === 'number' ? data.sentAt : new Date(data.sentAt).getTime()) : null;
      
      if (recipient) {
        // Time-based matching (exact time match)
        if (sentAt) {
          const timeKey = Math.floor(sentAt / 60000) * 60000; // Round to nearest minute
          const mapKey = recipient + '|' + timeKey;
          if (!sentEmailsMap.has(mapKey)) {
            sentEmailsMap.set(mapKey, []);
          }
          sentEmailsMap.get(mapKey).push({ id: doc.id, sentAt: sentAt, subject: data.subject || '', recipient: recipient });
        }
        
        // Recipient-only matching (for flexible matching when times don't match)
        if (!sentEmailsByRecipient.has(recipient)) {
          sentEmailsByRecipient.set(recipient, []);
        }
        sentEmailsByRecipient.get(recipient).push({ 
          id: doc.id, 
          sentAt: sentAt || 0, 
          subject: data.subject || '', 
          recipient: recipient 
        });
      }
    });
    console.log('[Email Cleanup] Built sent emails map: ' + sentEmailsMap.size + ' time-based keys, ' + sentEmailsByRecipient.size + ' unique recipients');
  } catch (error) {
    console.warn('[Email Cleanup] Could not build sent emails map (non-fatal):', error);
  }
  
  try {
    // Find all scheduled emails
    const scheduledQuery = await db.collection('emails')
      .where('type', '==', 'scheduled')
      .get();
    
    console.log('[Email Cleanup] Found ' + scheduledQuery.size + ' scheduled emails to check...');
    
    const batch = db.batch();
    let batchCount = 0;
    
    for (const emailDoc of scheduledQuery.docs) {
      try {
        const email = emailDoc.data();
        const emailId = emailDoc.id;
        const status = email.status || '';
        const sendTime = email.scheduledSendTime;
        const hasContent = !!(email.html || email.text || email.content);
        const hasSubject = !!(email.subject && email.subject.trim() && email.subject !== '(No Subject)');
        const recipient = (email.to || email.recipientEmail || '').toLowerCase().trim();
        
        // Case 0: Check if this scheduled email has a matching sent email (cross-reference)
        if (recipient) {
          let matchingSent = null;
          let matchType = '';
          
          // First try: Time-based matching (if send time is in the past)
          if (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo) {
            const timeKey = Math.floor(sendTime / 60000) * 60000; // Round to nearest minute
            const mapKey = recipient + '|' + timeKey;
            const timeMatches = sentEmailsMap.get(mapKey);
            if (timeMatches && timeMatches.length > 0) {
              matchingSent = timeMatches[0];
              matchType = 'time-based';
            }
          }
          
          // Second try: Recipient-only matching (if time-based didn't work)
          // Match if scheduled email has past send time, no send time, OR if there's a recent sent email
          // (This catches cases where scheduled email has future time but was actually sent earlier)
          if (!matchingSent) {
            const recipientMatches = sentEmailsByRecipient.get(recipient);
            if (recipientMatches && recipientMatches.length > 0) {
              // Find the most recent sent email for this recipient (within last 7 days)
              const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
              const recentMatches = recipientMatches.filter(e => e.sentAt > sevenDaysAgo && e.sentAt > 0);
              
              if (recentMatches.length > 0) {
                // Sort by sentAt descending and take the most recent
                recentMatches.sort((a, b) => b.sentAt - a.sentAt);
                const mostRecent = recentMatches[0];
                
                // Only match if:
                // 1. Scheduled email has past send time, OR
                // 2. Scheduled email has no send time, OR
                // 3. Scheduled email has future send time BUT there's a sent email from the last 2 days
                const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);
                const hasPastSendTime = sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo;
                const hasNoSendTime = !sendTime;
                const hasRecentSentEmail = mostRecent.sentAt > twoDaysAgo;
                
                if (hasPastSendTime || hasNoSendTime || hasRecentSentEmail) {
                  matchingSent = mostRecent;
                  matchType = 'recipient-based (recent)';
                }
              } else if (recipientMatches.length > 0 && (!sendTime || (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo))) {
                // If no recent matches but scheduled email is in past, match to most recent sent email
                recipientMatches.sort((a, b) => b.sentAt - a.sentAt);
                matchingSent = recipientMatches[0];
                matchType = 'recipient-based (any)';
              }
            }
          }
          
          if (matchingSent) {
            // Found a matching sent email - this scheduled email was already sent
            if (deleteMatchedSent && !dryRun) {
              // Delete the orphaned scheduled email since we have the sent version
              batch.delete(emailDoc.ref);
              batchCount++;
              deleted++;
              updateDetails.push({ id: emailId, reason: 'deleted - matched to sent email: ' + matchingSent.id + ' (' + matchType + ')' });
            } else if (deleteMatchedSent) {
              console.log('[Email Cleanup] Would delete: ' + emailId + ' (matched to sent email: ' + matchingSent.id + ' sent at ' + (matchingSent.sentAt ? new Date(matchingSent.sentAt).toLocaleString() : 'N/A') + ' - ' + matchType + ')');
              deleted++;
              updateDetails.push({ id: emailId, reason: 'would delete - matched to sent email: ' + matchingSent.id + ' (' + matchType + ')' });
            } else if (!dryRun) {
              batch.update(emailDoc.ref, {
                type: 'sent',
                status: 'sent',
                sentAt: matchingSent.sentAt || sendTime || Date.now(),
                updatedAt: new Date().toISOString()
              });
              batchCount++;
              updated++;
              updateDetails.push({ id: emailId, reason: 'matched to sent email: ' + matchingSent.id + ' (' + matchType + ')' });
            } else {
              const sentTimeStr = matchingSent.sentAt ? new Date(matchingSent.sentAt).toLocaleString() : 'N/A';
              console.log('[Email Cleanup] Would update: ' + emailId + ' (matched to sent email: ' + matchingSent.id + ' sent at ' + sentTimeStr + ' - ' + matchType + ')');
              updated++;
              updateDetails.push({ id: emailId, reason: 'matched to sent email: ' + matchingSent.id + ' (' + matchType + ')' });
            }
            continue;
          }
        }
        
        // Debug logging for ALL emails being checked (in dry run mode)
        if (dryRun) {
          const sendTimeStr = sendTime ? (typeof sendTime === 'number' ? new Date(sendTime).toLocaleString() : String(sendTime)) : 'missing';
          const isPastSendTime = sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo;
          console.log('[Email Cleanup] DEBUG - Checking: ' + emailId + 
            ' | status: "' + status + '" | hasContent: ' + hasContent + 
            ' | hasSubject: ' + hasSubject + ' | sendTime: ' + sendTimeStr + 
            ' | isPastSendTime: ' + isPastSendTime + ' | recipient: ' + (recipient || 'N/A'));
        }
        
        // Case 1: Email has status 'sent' or 'delivered' but type is still 'scheduled'
        if (status === 'sent' || status === 'delivered') {
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'sent',
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'status=' + status + ', type=scheduled -> sent' });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (status: ' + status + ', type: scheduled -> sent)');
            updated++;
            updateDetails.push({ id: emailId, reason: 'status=' + status + ', type=scheduled -> sent' });
          }
          continue;
        }
        
        // Case 2: Email is stuck in 'sending' state and send time passed more than 5 minutes ago
        if (status === 'sending' && sendTime && typeof sendTime === 'number' && sendTime < fiveMinutesAgo) {
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'sent',
              sentAt: sendTime,
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'stuck in sending, send time: ' + new Date(sendTime).toLocaleString() });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (stuck in sending, send time: ' + new Date(sendTime).toLocaleString() + ')');
            updated++;
            updateDetails.push({ id: emailId, reason: 'stuck in sending' });
          }
          continue;
        }
        
        // Case 3: Email has error status - exclude from scheduled
        if (status === 'error') {
          // Log detailed error information for investigation
          const errorDetails = {
            id: emailId,
            recipient: recipient || 'N/A',
            sendTime: sendTime ? new Date(sendTime).toLocaleString() : 'N/A',
            hasContent: hasContent,
            hasSubject: hasSubject,
            errorMessage: email.errorMessage || email.error || 'No error message',
            errorCode: email.errorCode || 'No error code',
            createdAt: email.createdAt ? (typeof email.createdAt === 'number' ? new Date(email.createdAt).toLocaleString() : email.createdAt) : 'N/A',
            updatedAt: email.updatedAt ? (typeof email.updatedAt === 'number' ? new Date(email.updatedAt).toLocaleString() : email.updatedAt) : 'N/A',
            sequenceId: email.sequenceId || 'N/A',
            stepId: email.stepId || 'N/A'
          };
          
          console.log('[Email Cleanup] ERROR EMAIL DETAILS:');
          console.log('  ID: ' + errorDetails.id);
          console.log('  Recipient: ' + errorDetails.recipient);
          console.log('  Send Time: ' + errorDetails.sendTime);
          console.log('  Created At: ' + errorDetails.createdAt);
          console.log('  Updated At: ' + errorDetails.updatedAt);
          console.log('  Has Content: ' + errorDetails.hasContent);
          console.log('  Has Subject: ' + errorDetails.hasSubject);
          console.log('  Error Message: ' + errorDetails.errorMessage);
          console.log('  Error Code: ' + errorDetails.errorCode);
          console.log('  Sequence ID: ' + errorDetails.sequenceId);
          console.log('  Step ID: ' + errorDetails.stepId);
          console.log('');
          
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'error',
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'error status - moving out of scheduled', errorMessage: errorDetails.errorMessage });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (error status - moving out of scheduled)');
            updated++;
            updateDetails.push({ id: emailId, reason: 'error status', errorMessage: errorDetails.errorMessage });
          }
          continue;
        }
        
        // Case 4: Email has past send time, no content, no subject (truly orphaned)
        if (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo && !hasContent && !hasSubject) {
          if (deleteOrphaned && !dryRun) {
            batch.delete(emailDoc.ref);
            batchCount++;
            deleted++;
            updateDetails.push({ id: emailId, reason: 'deleted - orphaned (no content, no subject, past send time)' });
          } else if (deleteOrphaned) {
            console.log('[Email Cleanup] Would delete: ' + emailId + ' (orphaned - no content, no subject, past send time)');
            deleted++;
            updateDetails.push({ id: emailId, reason: 'would delete - orphaned' });
          } else {
            // Update to sent instead of deleting
            if (!dryRun) {
              batch.update(emailDoc.ref, {
                type: 'sent',
                status: 'sent',
                sentAt: sendTime,
                updatedAt: new Date().toISOString()
              });
              batchCount++;
              updated++;
              updateDetails.push({ id: emailId, reason: 'orphaned - marked as sent (no content, no subject)' });
            } else {
              console.log('[Email Cleanup] Would update: ' + emailId + ' (orphaned - would mark as sent)');
              updated++;
              updateDetails.push({ id: emailId, reason: 'orphaned - would mark as sent' });
            }
          }
          continue;
        }
        
        // Case 5: Email has past send time, no status, but has content (likely sent but status not updated)
        if (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo && !status && hasContent) {
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'sent',
              sentAt: sendTime,
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'past send time, has content, no status' });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (past send time, has content, no status)');
            updated++;
            updateDetails.push({ id: emailId, reason: 'past send time, has content, no status' });
          }
          continue;
        }
        
        // Case 6: Email has past send time, missing/null status, and missing subject (orphaned)
        if (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo && !status && !hasSubject) {
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'sent',
              sentAt: sendTime,
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'past send time, no status, no subject' });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (past send time, no status, no subject)');
            updated++;
            updateDetails.push({ id: emailId, reason: 'past send time, no status, no subject' });
          }
          continue;
        }
        
        // Case 7: Email has past send time and approved status (should have been sent)
        if (status === 'approved' && sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo) {
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'sent',
              sentAt: sendTime,
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'approved status but past send time' });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (approved status but past send time: ' + new Date(sendTime).toLocaleString() + ')');
            updated++;
            updateDetails.push({ id: emailId, reason: 'approved but past send time' });
          }
          continue;
        }
        
        // Case 10: Email stuck in 'not_generated' status with past send time (should have been generated and sent)
        if (status === 'not_generated' && sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo) {
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'sent',
              sentAt: sendTime,
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'not_generated status but past send time' });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (not_generated status but past send time: ' + new Date(sendTime).toLocaleString() + ')');
            updated++;
            updateDetails.push({ id: emailId, reason: 'not_generated but past send time' });
          }
          continue;
        }
        
        // Case 11: Email stuck in 'not_generated' status for more than 24 hours (likely stuck)
        if (status === 'not_generated') {
          const createdAt = email.createdAt;
          if (createdAt) {
            const createdTime = typeof createdAt === 'number' ? createdAt : new Date(createdAt).getTime();
            const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
            if (createdTime && createdTime < twentyFourHoursAgo) {
              // Email has been in 'not_generated' state for more than 24 hours - likely stuck
              if (!dryRun) {
                batch.update(emailDoc.ref, {
                  type: 'sent',
                  status: 'error',
                  updatedAt: new Date().toISOString()
                });
                batchCount++;
                updated++;
                updateDetails.push({ id: emailId, reason: 'stuck in not_generated for 24+ hours' });
              } else {
                console.log('[Email Cleanup] Would update: ' + emailId + ' (stuck in not_generated for 24+ hours, created: ' + new Date(createdTime).toLocaleString() + ')');
                updated++;
                updateDetails.push({ id: emailId, reason: 'stuck in not_generated for 24+ hours' });
              }
              continue;
            }
          }
        }
        
        // Case 8: Email has no subject and no content (orphaned, regardless of status)
        if (!hasSubject && !hasContent) {
          // If it has a past send time, definitely orphaned
          if (sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo) {
            if (!dryRun) {
              batch.update(emailDoc.ref, {
                type: 'sent',
                status: 'sent',
                sentAt: sendTime,
                updatedAt: new Date().toISOString()
              });
              batchCount++;
              updated++;
              updateDetails.push({ id: emailId, reason: 'no subject, no content, past send time' });
            } else {
              console.log('[Email Cleanup] Would update: ' + emailId + ' (no subject, no content, past send time)');
              updated++;
              updateDetails.push({ id: emailId, reason: 'no subject, no content, past send time' });
            }
            continue;
          }
          // If no send time, it's truly orphaned
          if (!sendTime) {
            if (deleteOrphaned && !dryRun) {
              batch.delete(emailDoc.ref);
              batchCount++;
              deleted++;
              updateDetails.push({ id: emailId, reason: 'deleted - no subject, no content, no send time' });
            } else if (deleteOrphaned) {
              console.log('[Email Cleanup] Would delete: ' + emailId + ' (no subject, no content, no send time)');
              deleted++;
              updateDetails.push({ id: emailId, reason: 'would delete - no subject, no content, no send time' });
            } else {
              // Mark as sent instead of deleting
              if (!dryRun) {
                batch.update(emailDoc.ref, {
                  type: 'sent',
                  status: 'sent',
                  sentAt: Date.now(),
                  updatedAt: new Date().toISOString()
                });
                batchCount++;
                updated++;
                updateDetails.push({ id: emailId, reason: 'no subject, no content, no send time - marked as sent' });
              } else {
                console.log('[Email Cleanup] Would update: ' + emailId + ' (no subject, no content, no send time - would mark as sent)');
                updated++;
                updateDetails.push({ id: emailId, reason: 'no subject, no content, no send time' });
              }
            }
            continue;
          }
        }
        
        // Case 9: Email has no subject but has past send time (orphaned, even if it has content)
        if (!hasSubject && sendTime && typeof sendTime === 'number' && sendTime < oneMinuteAgo) {
          if (!dryRun) {
            batch.update(emailDoc.ref, {
              type: 'sent',
              status: 'sent',
              sentAt: sendTime,
              updatedAt: new Date().toISOString()
            });
            batchCount++;
            updated++;
            updateDetails.push({ id: emailId, reason: 'no subject, past send time' });
          } else {
            console.log('[Email Cleanup] Would update: ' + emailId + ' (no subject, past send time: ' + new Date(sendTime).toLocaleString() + ')');
            updated++;
            updateDetails.push({ id: emailId, reason: 'no subject, past send time' });
          }
          continue;
        }
        
        // Email is valid scheduled email - skip it
        if (dryRun) {
          console.log('[Email Cleanup] DEBUG - SKIPPED (valid): ' + emailId + 
            ' | status: "' + status + '" | hasContent: ' + hasContent + 
            ' | hasSubject: ' + hasSubject + ' | sendTime: ' + (sendTime ? new Date(sendTime).toLocaleString() : 'missing'));
        }
        skipped++;
        
        // Commit batch if we hit the limit (500 operations per batch)
        if (batchCount >= 500) {
          if (!dryRun) {
            await batch.commit();
            console.log('[Email Cleanup] Committed batch of ' + batchCount + ' updates...');
          }
          batchCount = 0;
        }
        
      } catch (error) {
        console.error('[Email Cleanup] Error processing email ' + emailDoc.id + ':', error);
        errors.push({ emailId: emailDoc.id, error: error.message });
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0 && !dryRun) {
      await batch.commit();
      console.log('[Email Cleanup] Committed final batch of ' + batchCount + ' updates...');
    }
    
    console.log('[Email Cleanup] Cleanup complete!');
    console.log('  - Updated: ' + updated + ' emails');
    if (deleteOrphaned) {
      console.log('  - Deleted: ' + deleted + ' orphaned emails');
    }
    console.log('  - Skipped: ' + skipped + ' valid scheduled emails');
    if (errors.length > 0) {
      console.log('  - Errors: ' + errors.length);
      console.error('[Email Cleanup] Errors:', errors);
    }
    
    // Show detailed breakdown
    if (updateDetails.length > 0) {
      console.log('[Email Cleanup] Update breakdown:');
      const reasonCounts = {};
      updateDetails.forEach(d => {
        const reason = d.reason.split(' - ')[0] || d.reason;
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });
      Object.entries(reasonCounts).forEach(([reason, count]) => {
        console.log('  - ' + reason + ': ' + count);
      });
    }
    
    // Refresh emails page if it's open
    if (window.EmailsPage && typeof window.EmailsPage.reload === 'function') {
      console.log('[Email Cleanup] Refreshing emails page...');
      window.EmailsPage.reload();
    }
    
    return {
      dryRun: dryRun,
      updated: updated,
      deleted: deleted,
      skipped: skipped,
      errors: errors.length,
      errorDetails: errors,
      updateDetails: updateDetails
    };
    
  } catch (error) {
    console.error('[Email Cleanup] Fatal error:', error);
    return { error: error.message };
  }
};

// Quick access functions
window.cleanupOrphanedScheduledEmailsDryRun = function() {
  return window.cleanupOrphanedScheduledEmails({ dryRun: true });
};

window.cleanupOrphanedScheduledEmailsWithDelete = function() {
  return window.cleanupOrphanedScheduledEmails({ deleteOrphaned: true });
};

// Helper function to show recent sent emails for comparison
window.showRecentSentEmails = async function(limit = 30) {
  if (!window.firebaseDB) {
    console.error('[Email Cleanup] Firebase not available. Make sure you are logged in.');
    return { error: 'Firebase not available' };
  }
  
  const db = window.firebaseDB;
  
  try {
    console.log('[Email Cleanup] Fetching last ' + limit + ' sent emails...');
    
    // Query for sent emails, ordered by sentAt or createdAt descending
    const sentQuery = await db.collection('emails')
      .where('type', '==', 'sent')
      .orderBy('sentAt', 'desc')
      .limit(limit)
      .get();
    
    if (sentQuery.empty) {
      // Try alternative query if sentAt doesn't work
      const altQuery = await db.collection('emails')
        .where('status', '==', 'sent')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      
      console.log('[Email Cleanup] Found ' + altQuery.size + ' sent emails (via status query):');
      const sentEmails = [];
      altQuery.forEach(doc => {
        const data = doc.data();
        const sentAt = data.sentAt ? (typeof data.sentAt === 'number' ? new Date(data.sentAt).toLocaleString() : data.sentAt) : 'N/A';
        const createdAt = data.createdAt ? (typeof data.createdAt === 'number' ? new Date(data.createdAt).toLocaleString() : data.createdAt) : 'N/A';
        sentEmails.push({
          id: doc.id,
          subject: data.subject || '(No Subject)',
          to: data.to || data.recipientEmail || 'N/A',
          sentAt: sentAt,
          createdAt: createdAt,
          status: data.status || 'N/A'
        });
      });
      
      // Display in a readable format
      console.log('[Email Cleanup] Sent Emails List:');
      sentEmails.forEach((email, idx) => {
        console.log('  ' + (idx + 1) + '. ID: ' + email.id);
        console.log('     Subject: ' + email.subject);
        console.log('     To: ' + email.to);
        console.log('     Sent At: ' + email.sentAt);
        console.log('     Created At: ' + email.createdAt);
        console.log('     Status: ' + email.status);
        console.log('');
      });
      return { count: altQuery.size, emails: sentEmails };
    }
    
    console.log('[Email Cleanup] Found ' + sentQuery.size + ' sent emails:');
    const sentEmails = [];
    sentQuery.forEach(doc => {
      const data = doc.data();
      const sentAt = data.sentAt ? (typeof data.sentAt === 'number' ? new Date(data.sentAt).toLocaleString() : data.sentAt) : 'N/A';
      const createdAt = data.createdAt ? (typeof data.createdAt === 'number' ? new Date(data.createdAt).toLocaleString() : data.createdAt) : 'N/A';
      sentEmails.push({
        id: doc.id,
        subject: data.subject || '(No Subject)',
        to: data.to || data.recipientEmail || 'N/A',
        sentAt: sentAt,
        createdAt: createdAt,
        status: data.status || 'N/A'
      });
    });
    
    // Display in a readable format
    console.log('[Email Cleanup] Sent Emails List:');
    sentEmails.forEach((email, idx) => {
      console.log('  ' + (idx + 1) + '. ID: ' + email.id);
      console.log('     Subject: ' + email.subject);
      console.log('     To: ' + email.to);
      console.log('     Sent At: ' + email.sentAt);
      console.log('     Created At: ' + email.createdAt);
      console.log('     Status: ' + email.status);
      console.log('');
    });
    
    console.log('[Email Cleanup] Quick Reference - Email IDs:');
    sentEmails.forEach((email, idx) => {
      console.log('  ' + (idx + 1) + '. ' + email.id + ' | ' + email.subject + ' | ' + email.to);
    });
    
    return { count: sentQuery.size, emails: sentEmails };
  } catch (error) {
    console.error('[Email Cleanup] Failed to fetch sent emails:', error);
    return { error: error.message };
  }
};

// Function to retry failed email generation
window.retryFailedEmailGeneration = async function(emailIds = null) {
  if (!window.firebaseDB) {
    console.error('[Email Retry] Firebase not available. Make sure you are logged in.');
    return { error: 'Firebase not available' };
  }
  
  const db = window.firebaseDB;
  let emailsToRetry = [];
  
  try {
    if (emailIds && Array.isArray(emailIds) && emailIds.length > 0) {
      // Retry specific email IDs
      console.log('[Email Retry] Retrying ' + emailIds.length + ' specific emails...');
      for (const emailId of emailIds) {
        const emailDoc = await db.collection('emails').doc(emailId).get();
        if (emailDoc.exists) {
          const data = emailDoc.data();
          if (data.status === 'error' || data.status === 'not_generated') {
            emailsToRetry.push({ id: emailId, doc: emailDoc });
          } else {
            console.warn('[Email Retry] Email ' + emailId + ' has status "' + data.status + '", skipping');
          }
        } else {
          console.warn('[Email Retry] Email ' + emailId + ' not found');
        }
      }
    } else {
      // Retry all error-status emails
      console.log('[Email Retry] Finding all error-status emails...');
      const errorQuery = await db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('status', '==', 'error')
        .get();
      
      errorQuery.forEach(doc => {
        emailsToRetry.push({ id: doc.id, doc: doc });
      });
    }
    
    if (emailsToRetry.length === 0) {
      console.log('[Email Retry] No emails to retry');
      return { retried: 0, errors: 0 };
    }
    
    console.log('[Email Retry] Found ' + emailsToRetry.length + ' emails to retry');
    
    const batch = db.batch();
    let batchCount = 0;
    let retried = 0;
    const errors = [];
    
    for (const { id, doc } of emailsToRetry) {
      try {
        // Reset status to 'not_generated' so the generation job picks it up
        batch.update(doc.ref, {
          status: 'not_generated',
          errorMessage: null,
          errorCode: null,
          updatedAt: new Date().toISOString()
        });
        batchCount++;
        retried++;
        
        // Commit in batches of 500
        if (batchCount >= 500) {
          await batch.commit();
          console.log('[Email Retry] Committed batch of ' + batchCount + ' updates...');
          batchCount = 0;
        }
      } catch (error) {
        console.error('[Email Retry] Error retrying email ' + id + ':', error);
        errors.push({ emailId: id, error: error.message });
      }
    }
    
    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log('[Email Retry] ✓ Retried ' + retried + ' emails');
    if (errors.length > 0) {
      console.log('[Email Retry] Errors: ' + errors.length);
      console.error('[Email Retry] Error details:', errors);
    }
    
    // Trigger immediate generation
    console.log('[Email Retry] Triggering immediate email generation...');
    try {
      const baseUrl = window.API_BASE_URL || window.location.origin || '';
      const response = await fetch(baseUrl + '/api/generate-scheduled-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediate: true })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[Email Retry] Generation triggered:', result);
      } else {
        console.warn('[Email Retry] Generation trigger failed:', response.status);
      }
    } catch (error) {
      console.warn('[Email Retry] Generation trigger error (non-fatal):', error);
    }
    
    return { retried: retried, errors: errors.length, errorDetails: errors };
  } catch (error) {
    console.error('[Email Retry] Fatal error:', error);
    return { error: error.message };
  }
};

// Function to check scheduled emails status with detailed breakdown
window.checkScheduledEmailsStatus = async function(showTomorrowOnly = false) {
  if (!window.firebaseDB) {
    console.error('[Email Status] Firebase not available');
    return { error: 'Firebase not available' };
  }
  
  const db = window.firebaseDB;
  const now = Date.now();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);
  const tomorrowStart = tomorrow.getTime();
  const tomorrowEndTime = tomorrowEnd.getTime();
  
  try {
    let scheduledQuery;
    if (showTomorrowOnly) {
      console.log('[Email Status] Finding scheduled emails for tomorrow (' + tomorrow.toLocaleDateString() + ')...');
      scheduledQuery = await db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('scheduledSendTime', '>=', tomorrowStart)
        .where('scheduledSendTime', '<=', tomorrowEndTime)
        .get();
    } else {
      scheduledQuery = await db.collection('emails')
        .where('type', '==', 'scheduled')
        .get();
    }
    
    console.log('[Email Status] Found ' + scheduledQuery.size + ' scheduled emails' + (showTomorrowOnly ? ' for tomorrow' : '') + ':');
    
    const statusCounts = {};
    const emailsByStatus = {};
    const failedEmails = [];
    const willBeProcessed = {
      generation: [], // not_generated emails that will be picked up by generate-scheduled-emails cron
      sending: []     // approved emails that will be picked up by send-scheduled-emails cron
    };
    
    scheduledQuery.forEach(doc => {
      const data = doc.data();
      const status = data.status || 'no_status';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      const sendTime = data.scheduledSendTime;
      const sendTimeDate = sendTime ? (typeof sendTime === 'number' ? new Date(sendTime) : new Date(sendTime)) : null;
      const sendTimeStr = sendTimeDate ? sendTimeDate.toLocaleString() : 'N/A';
      const isPast = sendTime && typeof sendTime === 'number' && sendTime < now;
      const isFuture = sendTime && typeof sendTime === 'number' && sendTime > now;
      
      const emailInfo = {
        id: doc.id,
        recipient: (data.to || data.recipientEmail || 'N/A').toLowerCase(),
        sendTime: sendTimeStr,
        sendTimeMs: sendTime,
        isPast: isPast,
        isFuture: isFuture,
        hasSubject: !!(data.subject && data.subject.trim()),
        hasContent: !!(data.html || data.text || data.content),
        errorMessage: data.errorMessage || data.error || null,
        errorCode: data.errorCode || null,
        sequenceId: data.sequenceId || 'N/A',
        stepIndex: data.stepIndex !== undefined ? data.stepIndex : 'N/A'
      };
      
      if (!emailsByStatus[status]) {
        emailsByStatus[status] = [];
      }
      emailsByStatus[status].push(emailInfo);
      
      // Track failed emails
      if (status === 'error' || (status === 'not_generated' && isPast)) {
        failedEmails.push({ ...emailInfo, status: status });
      }
      
      // Track emails that will be processed by cron
      if (status === 'not_generated' && isFuture) {
        willBeProcessed.generation.push(emailInfo);
      } else if (status === 'approved' && isFuture) {
        willBeProcessed.sending.push(emailInfo);
      }
    });
    
    console.log('\n[Email Status] ========================================');
    console.log('[Email Status] BREAKDOWN BY STATUS:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log('  - ' + status + ': ' + count);
    });
    
    // Show failed emails
    if (failedEmails.length > 0) {
      console.log('\n[Email Status] ⚠️  FAILED EMAILS (' + failedEmails.length + '):');
      failedEmails.forEach((email, idx) => {
        console.log('  ' + (idx + 1) + '. ID: ' + email.id);
        console.log('     Recipient: ' + email.recipient);
        console.log('     Send Time: ' + email.sendTime + (email.isPast ? ' (PAST - needs attention!)' : ''));
        console.log('     Status: ' + email.status);
        if (email.errorMessage) {
          console.log('     Error: ' + email.errorMessage);
        }
        if (email.errorCode) {
          console.log('     Error Code: ' + email.errorCode);
        }
        console.log('     Has Subject: ' + email.hasSubject + ' | Has Content: ' + email.hasContent);
        console.log('     Sequence: ' + email.sequenceId + ' | Step: ' + email.stepIndex);
        console.log('');
      });
    }
    
    // Show emails that will be processed by generation cron
    if (willBeProcessed.generation.length > 0) {
      console.log('\n[Email Status] ✅ WILL BE GENERATED BY CRON (' + willBeProcessed.generation.length + '):');
      console.log('  (These not_generated emails will be picked up by /api/generate-scheduled-emails)');
      willBeProcessed.generation.slice(0, 10).forEach((email, idx) => {
        console.log('  ' + (idx + 1) + '. ' + email.recipient + ' | ' + email.sendTime);
      });
      if (willBeProcessed.generation.length > 10) {
        console.log('  ... and ' + (willBeProcessed.generation.length - 10) + ' more');
      }
    }
    
    // Show emails that will be sent by sending cron
    if (willBeProcessed.sending.length > 0) {
      console.log('\n[Email Status] ✅ WILL BE SENT BY CRON (' + willBeProcessed.sending.length + '):');
      console.log('  (These approved emails will be picked up by /api/send-scheduled-emails)');
      willBeProcessed.sending.slice(0, 10).forEach((email, idx) => {
        console.log('  ' + (idx + 1) + '. ' + email.recipient + ' | ' + email.sendTime);
      });
      if (willBeProcessed.sending.length > 10) {
        console.log('  ... and ' + (willBeProcessed.sending.length - 10) + ' more');
      }
    }
    
    // Summary
    console.log('\n[Email Status] ========================================');
    console.log('[Email Status] SUMMARY:');
    console.log('  - Total scheduled: ' + scheduledQuery.size);
    console.log('  - Failed/needs attention: ' + failedEmails.length);
    console.log('  - Will be generated: ' + willBeProcessed.generation.length);
    console.log('  - Will be sent: ' + willBeProcessed.sending.length);
    console.log('  - Other statuses: ' + (scheduledQuery.size - failedEmails.length - willBeProcessed.generation.length - willBeProcessed.sending.length));
    
    if (failedEmails.length > 0) {
      console.log('\n[Email Status] ⚠️  ACTION NEEDED: ' + failedEmails.length + ' failed emails need attention!');
      console.log('  Run: retryFailedEmailGeneration() to retry them');
    }
    
    return { 
      total: scheduledQuery.size, 
      statusCounts, 
      emailsByStatus,
      failedEmails,
      willBeProcessed
    };
  } catch (error) {
    console.error('[Email Status] Error:', error);
    return { error: error.message };
  }
};

// Function to force reload scheduled emails in the UI
window.reloadScheduledEmails = function() {
  if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.reload === 'function') {
    console.log('[Email Reload] Reloading emails...');
    window.BackgroundEmailsLoader.reload();
    
    // Also invalidate folder count cache
    if (window.BackgroundEmailsLoader.invalidateFolderCountCache) {
      window.BackgroundEmailsLoader.invalidateFolderCountCache();
    }
    
    // Refresh the emails page if it's open
    if (window.EmailsPage && typeof window.EmailsPage.reload === 'function') {
      setTimeout(() => {
        window.EmailsPage.reload();
      }, 1000);
    }
    
    console.log('[Email Reload] Reload triggered. Check scheduled tab in a few seconds.');
  } else {
    console.error('[Email Reload] BackgroundEmailsLoader not available');
  }
};

// Function to find and recover recently added contacts to sequences
window.recoverRecentlyAddedContacts = async function(hoursAgo = 24, limit = 50, dryRun = false) {
  if (!window.firebaseDB) {
    console.error('[Recover] Firebase not available');
    return { error: 'Firebase not available' };
  }
  
  const db = window.firebaseDB;
  const now = Date.now();
  const cutoffTime = now - (hoursAgo * 60 * 60 * 1000);
  
  try {
    console.log('[Recover] ' + (dryRun ? 'DRY RUN: ' : '') + 'Finding contacts added to sequences in the last ' + hoursAgo + ' hours...');
    
    // Get recent sequenceMembers (ordered by createdAt descending)
    const membersQuery = await db.collection('sequenceMembers')
      .where('targetType', '==', 'people')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    if (membersQuery.empty) {
      console.log('[Recover] No sequenceMembers found');
      return { found: 0, recovered: 0 };
    }
    
    console.log('[Recover] Found ' + membersQuery.size + ' recent sequenceMembers');
    
    // Filter by timestamp and get unique sequences
    const recentMembers = [];
    const sequenceIds = new Set();
    
    membersQuery.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt;
      let createdTime = null;
      
      if (createdAt) {
        if (typeof createdAt === 'number') {
          createdTime = createdAt;
        } else if (createdAt.toDate) {
          createdTime = createdAt.toDate().getTime();
        } else if (typeof createdAt === 'string') {
          createdTime = new Date(createdAt).getTime();
        }
      }
      
      // Include if created within the time window
      if (createdTime && createdTime >= cutoffTime) {
        recentMembers.push({
          id: doc.id,
          sequenceId: data.sequenceId,
          contactId: data.targetId,
          createdAt: createdTime,
          createdAtStr: new Date(createdTime).toLocaleString(),
          hasEmail: data.hasEmail !== false
        });
        sequenceIds.add(data.sequenceId);
      }
    });
    
    console.log('[Recover] Found ' + recentMembers.length + ' contacts added in the last ' + hoursAgo + ' hours');
    console.log('[Recover] Across ' + sequenceIds.size + ' sequences');
    
    if (recentMembers.length === 0) {
      console.log('[Recover] No recent contacts found. Try increasing hoursAgo parameter.');
      return { found: 0, recovered: 0 };
    }
    
    // Show what was found
    console.log('\n[Recover] RECENTLY ADDED CONTACTS:');
    const bySequence = {};
    recentMembers.forEach(member => {
      if (!bySequence[member.sequenceId]) {
        bySequence[member.sequenceId] = [];
      }
      bySequence[member.sequenceId].push(member);
    });
    
    Object.entries(bySequence).forEach(([seqId, members]) => {
      console.log('  Sequence: ' + seqId + ' (' + members.length + ' contacts)');
      members.slice(0, 5).forEach((m, idx) => {
        console.log('    ' + (idx + 1) + '. Contact: ' + m.contactId + ' | Added: ' + m.createdAtStr);
      });
      if (members.length > 5) {
        console.log('    ... and ' + (members.length - 5) + ' more');
      }
    });
    
    // Now check which ones don't have activations and backfill them
    console.log('\n[Recover] Checking which contacts need activation...');
    
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
    const userEmail = getUserEmail();
    
    let totalRecovered = 0;
    const results = [];
    
    // Group by sequence
    for (const seqId of sequenceIds) {
      const membersInSeq = recentMembers.filter(m => m.sequenceId === seqId);
      const contactIds = membersInSeq.map(m => m.contactId).filter(id => id);
      
      if (contactIds.length === 0) continue;
      
      // Check existing activations for this sequence
      const activationsQuery = await db.collection('sequenceActivations')
        .where('sequenceId', '==', seqId)
        .get();
      
      const activatedContactIds = new Set();
      activationsQuery.forEach(doc => {
        const data = doc.data();
        if (data.contactIds && Array.isArray(data.contactIds)) {
          data.contactIds.forEach(id => activatedContactIds.add(id));
        }
      });
      
      // Find unactivated contacts
      const unactivatedContacts = contactIds.filter(id => !activatedContactIds.has(id));
      const contactsWithEmail = membersInSeq.filter(m => 
        unactivatedContacts.includes(m.contactId) && m.hasEmail
      );
      
      if (contactsWithEmail.length > 0) {
        const contactIdsToActivate = contactsWithEmail.map(m => m.contactId);
        
        console.log('[Recover] Sequence ' + seqId + ': ' + contactIdsToActivate.length + ' contacts need activation');
        
        if (dryRun) {
          console.log('[Recover] DRY RUN - Would create sequenceActivation for ' + contactIdsToActivate.length + ' contacts:');
          contactIdsToActivate.slice(0, 10).forEach((contactId, idx) => {
            const member = contactsWithEmail.find(m => m.contactId === contactId);
            console.log('  ' + (idx + 1) + '. Contact: ' + contactId + ' | Added: ' + (member ? member.createdAtStr : 'N/A'));
          });
          if (contactIdsToActivate.length > 10) {
            console.log('  ... and ' + (contactIdsToActivate.length - 10) + ' more');
          }
          totalRecovered += contactIdsToActivate.length;
        } else {
          // Create sequenceActivations in batches of 25
          const BATCH_SIZE = 25;
          for (let i = 0; i < contactIdsToActivate.length; i += BATCH_SIZE) {
            const batch = contactIdsToActivate.slice(i, i + BATCH_SIZE);
            
            const activationRef = db.collection('sequenceActivations').doc();
            const activationId = activationRef.id;
            
            const sequenceActivationData = {
              sequenceId: seqId,
              contactIds: batch,
              status: 'pending',
              processedContacts: 0,
              totalContacts: batch.length,
              ownerId: userEmail || 'unknown',
              assignedTo: userEmail || 'unknown',
              createdBy: userEmail || 'unknown',
              createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || Date.now()
            };
            
            await activationRef.set(sequenceActivationData);
            console.log('[Recover] Created sequenceActivation:', activationId, 'for', batch.length, 'contacts');
            
            // Trigger immediate processing
            try {
              const baseUrl = window.API_BASE_URL || window.location.origin || '';
              const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  immediate: true,
                  activationId: activationId
                })
              });
              
              if (response.ok) {
                const result = await response.json();
                console.log('[Recover] Triggered processing for activation:', result);
              }
            } catch (error) {
              console.warn('[Recover] Failed to trigger processing (non-fatal):', error);
            }
            
            totalRecovered += batch.length;
          }
        }
        
        results.push({
          sequenceId: seqId,
          recovered: contactIdsToActivate.length
        });
      }
    }
    
    console.log('\n[Recover] ✓ ' + (dryRun ? 'DRY RUN complete!' : 'Recovery complete!'));
    console.log('  - Total contacts found: ' + recentMembers.length);
    console.log('  - Total contacts ' + (dryRun ? 'that would be recovered' : 'recovered') + ': ' + totalRecovered);
    console.log('  - Sequences processed: ' + results.length);
    
    if (dryRun && totalRecovered > 0) {
      console.log('\n[Recover] To actually recover these contacts, run:');
      console.log('  recoverRecentlyAddedContacts(' + hoursAgo + ', ' + limit + ', false)');
    }
    
    if (results.length > 0) {
      console.log('[Recover] Results:');
      results.forEach(r => {
        console.log('  - Sequence ' + r.sequenceId + ': ' + r.recovered + ' contacts');
      });
    }
    
    return { found: recentMembers.length, recovered: totalRecovered, results };
  } catch (error) {
    console.error('[Recover] Fatal error:', error);
    return { error: error.message };
  }
};

// Function to restart sequences from step 1 for contacts that haven't received any emails
window.restartSequenceFromStep1 = async function(sequenceId = null, dryRun = false, strictMode = false) {
  if (!window.firebaseDB) {
    console.error('[Restart] Firebase not available');
    return { error: 'Firebase not available' };
  }
  
  const db = window.firebaseDB;
  
  try {
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
    const userEmail = getUserEmail();
    
    let sequencesToCheck = [];
    
    if (sequenceId) {
      // Check specific sequence
      const seqDoc = await db.collection('sequences').doc(sequenceId).get();
      if (seqDoc.exists) {
        sequencesToCheck.push({ id: sequenceId, data: seqDoc.data() });
      } else {
        console.error('[Restart] Sequence not found:', sequenceId);
        return { error: 'Sequence not found' };
      }
    } else {
      // Check all sequences with active members
      console.log('[Restart] Finding all sequences with active members...');
      const sequencesQuery = await db.collection('sequences')
        .where('stats.active', '>', 0)
        .get();
      
      sequencesQuery.forEach(doc => {
        sequencesToCheck.push({ id: doc.id, data: doc.data() });
      });
    }
    
    console.log('[Restart] ' + (dryRun ? 'DRY RUN: ' : '') + 'Checking ' + sequencesToCheck.length + ' sequences...');
    
    let totalRestarted = 0;
    const results = [];
    
    for (const seq of sequencesToCheck) {
      try {
        // Get all sequenceMembers for this sequence
        const membersQuery = await db.collection('sequenceMembers')
          .where('sequenceId', '==', seq.id)
          .where('targetType', '==', 'people')
          .get();
        
        if (membersQuery.empty) {
          console.log('[Restart] Sequence ' + seq.id + ' has no members, skipping');
          continue;
        }
        
        console.log('[Restart] Sequence ' + seq.id + ' (' + (seq.data?.name || 'unnamed') + '): ' + membersQuery.size + ' contacts');
        
        // NEW APPROACH: Get all sent emails for this sequence first, then match by email address
        // This works even if contacts don't exist in people collection by ID
        const sentEmailsForSequence = await db.collection('emails')
          .where('sequenceId', '==', seq.id)
          .where('type', '==', 'sent')
          .get();
        
        // Also check for sent emails by status (in case type wasn't updated)
        const sentEmailsByStatus = await db.collection('emails')
          .where('sequenceId', '==', seq.id)
          .where('status', 'in', ['sent', 'delivered'])
          .get();
        
        // Create a set of email addresses that have received emails
        // Also create a map of contactId -> email for direct matching
        const emailsThatReceivedEmails = new Set();
        const contactIdsWithSentEmails = new Set(); // contactId -> has sent email
        const emailToContactIdMap = new Map(); // email -> contactId (from sent emails)
        
        sentEmailsForSequence.forEach(doc => {
          const emailData = doc.data();
          const toEmail = emailData.to || emailData.recipientEmail || '';
          const contactId = emailData.contactId;
          
          if (toEmail && typeof toEmail === 'string') {
            const normalizedEmail = toEmail.toLowerCase().trim();
            emailsThatReceivedEmails.add(normalizedEmail);
            if (contactId) {
              contactIdsWithSentEmails.add(contactId);
              emailToContactIdMap.set(normalizedEmail, contactId);
            }
          } else if (contactId) {
            // Even if no email address, if we have contactId, mark it
            contactIdsWithSentEmails.add(contactId);
          }
        });
        
        sentEmailsByStatus.forEach(doc => {
          const emailData = doc.data();
          const toEmail = emailData.to || emailData.recipientEmail || '';
          const contactId = emailData.contactId;
          
          if (toEmail && typeof toEmail === 'string') {
            const normalizedEmail = toEmail.toLowerCase().trim();
            emailsThatReceivedEmails.add(normalizedEmail);
            if (contactId) {
              contactIdsWithSentEmails.add(contactId);
              if (!emailToContactIdMap.has(normalizedEmail)) {
                emailToContactIdMap.set(normalizedEmail, contactId);
              }
            }
          } else if (contactId) {
            contactIdsWithSentEmails.add(contactId);
          }
        });
        
        console.log('[Restart] Found ' + emailsThatReceivedEmails.size + ' unique email addresses that have received emails for this sequence');
        
        // Now get contact info from sequenceMembers and match by email
        const contactIds = [];
        const contactEmails = new Map(); // contactId -> email
        const contactIdByEmail = new Map(); // email -> contactId (reverse lookup)
        
        membersQuery.forEach(doc => {
          const memberData = doc.data();
          const contactId = memberData.targetId;
          if (contactId) {
            contactIds.push(contactId);
            // Check if email is stored directly in sequenceMembers
            if (memberData.email) {
              const email = (memberData.email || '').toLowerCase().trim();
              if (email && email.includes('@')) {
                contactEmails.set(contactId, email);
                contactIdByEmail.set(email, contactId);
              }
            }
          }
        });
        
        // Look up contact emails from people collection by email address (not by ID)
        // This handles cases where contact IDs don't match but emails do
        for (const contactId of contactIds) {
          // Skip if we already have email from sequenceMembers
          if (contactEmails.has(contactId)) {
            continue;
          }
          
          try {
            // Try to find contact by ID first
            const contactDoc = await db.collection('people').doc(contactId).get();
            if (contactDoc.exists) {
              const contactData = contactDoc.data();
              
              // Try multiple email fields
              let email = '';
              if (contactData.email) {
                email = (contactData.email || '').toLowerCase().trim();
              } else if (contactData.primaryEmail) {
                email = (contactData.primaryEmail || '').toLowerCase().trim();
              } else if (contactData.emails && Array.isArray(contactData.emails) && contactData.emails.length > 0) {
                email = (contactData.emails[0] || '').toLowerCase().trim();
              } else if (contactData.workEmail) {
                email = (contactData.workEmail || '').toLowerCase().trim();
              }
              
              if (email && email.includes('@')) {
                contactEmails.set(contactId, email);
                contactIdByEmail.set(email, contactId);
              }
            }
          } catch (error) {
            // Silently continue
          }
        }
        
        // Also try to find contacts by matching email addresses from sent emails
        // This catches cases where we have sent emails but contact lookup by ID failed
        for (const emailAddr of emailsThatReceivedEmails) {
          if (!contactIdByEmail.has(emailAddr)) {
            // Try to find contact by email address
            try {
              const contactByEmailQuery = await db.collection('people')
                .where('email', '==', emailAddr)
                .limit(1)
                .get();
              
              if (!contactByEmailQuery.empty) {
                const contactDoc = contactByEmailQuery.docs[0];
                const contactId = contactDoc.id;
                // Only add if this contact is in our sequenceMembers
                if (contactIds.includes(contactId)) {
                  contactEmails.set(contactId, emailAddr);
                  contactIdByEmail.set(emailAddr, contactId);
                }
              }
            } catch (error) {
              // Silently continue
            }
          }
        }
        
        // Check which contacts have sent emails by matching email addresses AND contactIds
        const contactsWithSentEmails = new Set();
        
        // Method 1: Direct contactId matching from sent emails
        for (const contactId of contactIds) {
          if (contactIdsWithSentEmails.has(contactId)) {
            contactsWithSentEmails.add(contactId);
          }
        }
        
        // Method 2: Match by email address
        for (const [contactId, email] of contactEmails.entries()) {
          if (emailsThatReceivedEmails.has(email)) {
            contactsWithSentEmails.add(contactId);
          }
        }
        
        // Method 3: Match email addresses from sent emails to contacts (reverse lookup)
        for (const [emailAddr, sentEmailContactId] of emailToContactIdMap.entries()) {
          if (contactIds.includes(sentEmailContactId)) {
            contactsWithSentEmails.add(sentEmailContactId);
            // Also add to contactEmails map if not already there
            if (!contactEmails.has(sentEmailContactId)) {
              contactEmails.set(sentEmailContactId, emailAddr);
              contactIdByEmail.set(emailAddr, sentEmailContactId);
            }
          }
        }
        
        // Also check for scheduled emails in this sequence that were actually sent (if not in strict mode)
        if (!strictMode) {
          const scheduledEmailsQuery = await db.collection('emails')
            .where('type', '==', 'scheduled')
            .where('sequenceId', '==', seq.id)
            .get();
          
          scheduledEmailsQuery.forEach(emailDoc => {
            const emailData = emailDoc.data();
            const toEmail = (emailData.to || '').toLowerCase().trim();
            
            // Check if email was actually sent (has sentAt or status is sent/delivered)
            // But be more strict - only count if it has a sendgridMessageId or clear sentAt
            if (toEmail && ((emailData.sentAt && emailData.sendgridMessageId) || 
                (emailData.status === 'sent' && emailData.sentAt) ||
                (emailData.status === 'delivered' && emailData.sentAt))) {
              // Find contact ID for this email address
              const contactId = contactIdByEmail.get(toEmail);
              if (contactId) {
                contactsWithSentEmails.add(contactId);
              }
            }
          });
        }
        
        console.log('[Restart] Found ' + contactsWithSentEmails.size + ' contacts that have received emails (out of ' + contactIds.length + ' total)');
        console.log('[Restart] Found ' + contactEmails.size + ' contacts with email addresses');
        
        // Debug: Show breakdown of all contacts with emails
        if (dryRun) {
          console.log('[Restart] DEBUG - All contacts with email addresses:');
          const contactsWithEmails = Array.from(contactEmails.entries());
          contactsWithEmails.slice(0, 20).forEach(([contactId, email]) => {
            const hasReceived = contactsWithSentEmails.has(contactId);
            console.log('  - Contact: ' + contactId + ' | Email: ' + email + ' | Has received: ' + (hasReceived ? 'YES' : 'NO'));
          });
          if (contactsWithEmails.length > 20) {
            console.log('  ... and ' + (contactsWithEmails.length - 20) + ' more');
          }
          
          // Show which contacts are marked as having received emails
          if (contactsWithSentEmails.size > 0) {
            console.log('[Restart] DEBUG - Contacts marked as having received emails:');
            Array.from(contactsWithSentEmails).slice(0, 10).forEach(contactId => {
              const email = contactEmails.get(contactId) || 'N/A';
              console.log('  - Contact: ' + contactId + ' | Email: ' + email);
            });
            if (contactsWithSentEmails.size > 10) {
              console.log('  ... and ' + (contactsWithSentEmails.size - 10) + ' more');
            }
          }
          
          // Show contacts with emails that HAVEN'T received emails
          const contactsWithEmailsButNoSent = contactsWithEmails.filter(([contactId]) => !contactsWithSentEmails.has(contactId));
          if (contactsWithEmailsButNoSent.length > 0) {
            console.log('[Restart] DEBUG - Contacts with emails that HAVEN\'T received emails (' + contactsWithEmailsButNoSent.length + '):');
            contactsWithEmailsButNoSent.slice(0, 10).forEach(([contactId, email]) => {
              console.log('  - Contact: ' + contactId + ' | Email: ' + email);
            });
            if (contactsWithEmailsButNoSent.length > 10) {
              console.log('  ... and ' + (contactsWithEmailsButNoSent.length - 10) + ' more');
            }
          }
        }
        
        // Debug: Track why contacts are being filtered out
        let noMemberCount = 0;
        let noEmailCount = 0;
        let hasReceivedEmailCount = 0;
        let willRestartCount = 0;
        
        // Find contacts that haven't received any emails
        // IMPORTANT: Use contactEmails.has(id) as the source of truth for whether a contact has an email
        // We populate contactEmails from multiple sources (sequenceMembers, people collection, sent emails)
        const contactsToRestart = contactIds.filter(id => {
          const member = Array.from(membersQuery.docs).find(d => d.data().targetId === id);
          if (!member) {
            noMemberCount++;
            return false;
          }
          const memberData = member.data();
          
          // If we have the email address in contactEmails (from any source), that's good enough
          const hasEmail = contactEmails.has(id);
          const hasReceivedEmail = contactsWithSentEmails.has(id);
          
          if (!hasEmail) {
            noEmailCount++;
            if (dryRun && contactIds.indexOf(id) < 5) {
              console.log('[Restart] DEBUG - Contact filtered (no email): ' + id + ' | hasEmail (member): ' + memberData.hasEmail + ' | in contactEmails: ' + contactEmails.has(id));
            }
            return false;
          }
          
          if (hasReceivedEmail) {
            hasReceivedEmailCount++;
            return false;
          }
          
          willRestartCount++;
          if (dryRun && willRestartCount <= 10) {
            // Show contacts that will be restarted
            const email = contactEmails.get(id) || 'N/A';
            console.log('[Restart] DEBUG - Contact will be restarted: ' + id + ' | Email: ' + email);
          }
          
          return true;
        });
        
        if (dryRun) {
          console.log('[Restart] DEBUG - Filter breakdown:');
          console.log('  - No member record: ' + noMemberCount);
          console.log('  - No email address: ' + noEmailCount);
          console.log('  - Already received email: ' + hasReceivedEmailCount);
          console.log('  - Will restart: ' + willRestartCount);
        }
        
        if (contactsToRestart.length > 0) {
          console.log('[Restart] Sequence ' + seq.id + ': ' + contactsToRestart.length + ' contacts have NOT received emails (will restart from step 1)');
          
          if (dryRun) {
            console.log('[Restart] DRY RUN - Would restart ' + contactsToRestart.length + ' contacts:');
            contactsToRestart.slice(0, 10).forEach((contactId, idx) => {
              const email = contactEmails.get(contactId) || 'N/A';
              console.log('  ' + (idx + 1) + '. Contact: ' + contactId + ' | Email: ' + email);
            });
            if (contactsToRestart.length > 10) {
              console.log('  ... and ' + (contactsToRestart.length - 10) + ' more');
            }
            totalRestarted += contactsToRestart.length;
          } else {
            // Delete any existing scheduled emails for these contacts in this sequence
            console.log('[Restart] Cleaning up existing scheduled emails for these contacts...');
            const scheduledEmailsQuery = await db.collection('emails')
              .where('type', '==', 'scheduled')
              .where('sequenceId', '==', seq.id)
              .get();
            
            let deletedCount = 0;
            const deleteBatch = db.batch();
            let deleteBatchCount = 0;
            
            scheduledEmailsQuery.forEach(emailDoc => {
              const emailData = emailDoc.data();
              const emailRecipient = (emailData.to || emailData.recipientEmail || '').toLowerCase().trim();
              
              // Check if this email is for one of the contacts we're restarting
              const isForRestartContact = Array.from(contactEmails.values()).some(email => 
                email.toLowerCase().trim() === emailRecipient
              );
              
              if (isForRestartContact) {
                deleteBatch.delete(emailDoc.ref);
                deleteBatchCount++;
                deletedCount++;
                
                if (deleteBatchCount >= 500) {
                  deleteBatch.commit();
                  deleteBatchCount = 0;
                }
              }
            });
            
            if (deleteBatchCount > 0) {
              await deleteBatch.commit();
            }
            
            if (deletedCount > 0) {
              console.log('[Restart] Deleted ' + deletedCount + ' existing scheduled emails for these contacts');
            }
            
            // Create new sequenceActivations in batches of 25
            const BATCH_SIZE = 25;
            for (let i = 0; i < contactsToRestart.length; i += BATCH_SIZE) {
              const batch = contactsToRestart.slice(i, i + BATCH_SIZE);
              
              const activationRef = db.collection('sequenceActivations').doc();
              const activationId = activationRef.id;
              
              const sequenceActivationData = {
                sequenceId: seq.id,
                contactIds: batch,
                status: 'pending',
                processedContacts: 0,
                totalContacts: batch.length,
                ownerId: userEmail || 'unknown',
                assignedTo: userEmail || 'unknown',
                createdBy: userEmail || 'unknown',
                createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || Date.now()
              };
              
              await activationRef.set(sequenceActivationData);
              console.log('[Restart] Created sequenceActivation:', activationId, 'for', batch.length, 'contacts');
              
              // Trigger immediate processing
              try {
                const baseUrl = window.API_BASE_URL || window.location.origin || '';
                const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    immediate: true,
                    activationId: activationId
                  })
                });
                
                if (response.ok) {
                  const result = await response.json();
                  console.log('[Restart] Triggered processing for activation:', result);
                }
              } catch (error) {
                console.warn('[Restart] Failed to trigger processing (non-fatal):', error);
              }
              
              totalRestarted += batch.length;
            }
          }
          
          results.push({
            sequenceId: seq.id,
            sequenceName: seq.data?.name || 'unnamed',
            restarted: contactsToRestart.length,
            totalContacts: contactIds.length,
            contactsWithEmails: contactsWithSentEmails.size
          });
        } else {
          if (contactEmails.size === 0) {
            console.log('[Restart] Sequence ' + seq.id + ': No contacts with email addresses found, skipping');
          } else if (contactsWithSentEmails.size === contactEmails.size) {
            console.log('[Restart] Sequence ' + seq.id + ': All contacts with emails have already received emails, skipping');
          } else {
            console.log('[Restart] Sequence ' + seq.id + ': No contacts to restart (may be filtered out due to missing emails or other criteria)');
          }
        }
      } catch (error) {
        console.error('[Restart] Error processing sequence ' + seq.id + ':', error);
      }
    }
    
    console.log('\n[Restart] ✓ ' + (dryRun ? 'DRY RUN complete!' : 'Restart complete!'));
    console.log('  - Total contacts ' + (dryRun ? 'that would be restarted' : 'restarted') + ': ' + totalRestarted);
    console.log('  - Sequences processed: ' + results.length);
    
    if (results.length > 0) {
      console.log('[Restart] Results:');
      results.forEach(r => {
        console.log('  - ' + r.sequenceName + ' (' + r.sequenceId + '):');
        console.log('    Total contacts: ' + r.totalContacts);
        console.log('    Contacts with emails: ' + r.contactsWithEmails);
        console.log('    Contacts restarted: ' + r.restarted);
      });
    }
    
    if (dryRun && totalRestarted > 0) {
      console.log('\n[Restart] To actually restart these contacts, run:');
      if (sequenceId) {
        console.log('  restartSequenceFromStep1("' + sequenceId + '", false)');
      } else {
        console.log('  restartSequenceFromStep1(null, false)');
      }
    }
    
    return { totalRestarted, results };
  } catch (error) {
    console.error('[Restart] Fatal error:', error);
    return { error: error.message };
  }
};

// Function to backfill sequence activations for contacts added to sequences but never activated
window.backfillSequenceActivations = async function(sequenceId = null) {
  if (!window.firebaseDB) {
    console.error('[Backfill] Firebase not available');
    return { error: 'Firebase not available' };
  }
  
  const db = window.firebaseDB;
  
  try {
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
    const userEmail = getUserEmail();
    
    let sequencesToCheck = [];
    
    if (sequenceId) {
      // Check specific sequence
      const seqDoc = await db.collection('sequences').doc(sequenceId).get();
      if (seqDoc.exists) {
        sequencesToCheck.push({ id: sequenceId, data: seqDoc.data() });
      } else {
        console.error('[Backfill] Sequence not found:', sequenceId);
        return { error: 'Sequence not found' };
      }
    } else {
      // Check all sequences with active members
      console.log('[Backfill] Finding all sequences with active members...');
      const sequencesQuery = await db.collection('sequences')
        .where('stats.active', '>', 0)
        .get();
      
      sequencesQuery.forEach(doc => {
        sequencesToCheck.push({ id: doc.id, data: doc.data() });
      });
    }
    
    console.log('[Backfill] Checking ' + sequencesToCheck.length + ' sequences...');
    
    let totalBackfilled = 0;
    const results = [];
    
    for (const seq of sequencesToCheck) {
      try {
        // Get all sequenceMembers for this sequence
        const membersQuery = await db.collection('sequenceMembers')
          .where('sequenceId', '==', seq.id)
          .where('targetType', '==', 'people')
          .get();
        
        if (membersQuery.empty) {
          console.log('[Backfill] Sequence ' + seq.id + ' has no members, skipping');
          continue;
        }
        
        // Get all existing sequenceActivations for this sequence
        const activationsQuery = await db.collection('sequenceActivations')
          .where('sequenceId', '==', seq.id)
          .get();
        
        const activatedContactIds = new Set();
        activationsQuery.forEach(doc => {
          const data = doc.data();
          if (data.contactIds && Array.isArray(data.contactIds)) {
            data.contactIds.forEach(id => activatedContactIds.add(id));
          }
        });
        
        // Find members that don't have activations
        const unactivatedMembers = [];
        membersQuery.forEach(doc => {
          const memberData = doc.data();
          const contactId = memberData.targetId;
          if (contactId && !activatedContactIds.has(contactId)) {
            // Check if contact has email
            const hasEmail = memberData.hasEmail !== false; // Default to true if not specified
            if (hasEmail) {
              unactivatedMembers.push({ id: contactId, memberDoc: doc });
            }
          }
        });
        
        if (unactivatedMembers.length > 0) {
          console.log('[Backfill] Sequence ' + seq.id + ' (' + (seq.data?.name || 'unnamed') + '): ' + unactivatedMembers.length + ' contacts need activation');
          
          // Create sequenceActivations in batches of 25
          const BATCH_SIZE = 25;
          for (let i = 0; i < unactivatedMembers.length; i += BATCH_SIZE) {
            const batch = unactivatedMembers.slice(i, i + BATCH_SIZE);
            const contactIds = batch.map(m => m.id);
            
            const activationRef = db.collection('sequenceActivations').doc();
            const activationId = activationRef.id;
            
            const sequenceActivationData = {
              sequenceId: seq.id,
              contactIds: contactIds,
              status: 'pending',
              processedContacts: 0,
              totalContacts: contactIds.length,
              ownerId: userEmail || 'unknown',
              assignedTo: userEmail || 'unknown',
              createdBy: userEmail || 'unknown',
              createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp() || Date.now()
            };
            
            await activationRef.set(sequenceActivationData);
            console.log('[Backfill] Created sequenceActivation:', activationId, 'for', contactIds.length, 'contacts');
            
            // Trigger immediate processing
            try {
              const baseUrl = window.API_BASE_URL || window.location.origin || '';
              const response = await fetch(`${baseUrl}/api/process-sequence-activations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  immediate: true,
                  activationId: activationId
                })
              });
              
              if (response.ok) {
                const result = await response.json();
                console.log('[Backfill] Triggered processing for activation:', result);
              }
            } catch (error) {
              console.warn('[Backfill] Failed to trigger processing (non-fatal):', error);
            }
            
            totalBackfilled += contactIds.length;
          }
          
          results.push({
            sequenceId: seq.id,
            sequenceName: seq.data?.name || 'unnamed',
            backfilled: unactivatedMembers.length
          });
        }
      } catch (error) {
        console.error('[Backfill] Error processing sequence ' + seq.id + ':', error);
      }
    }
    
    console.log('[Backfill] ✓ Backfill complete!');
    console.log('  - Total contacts backfilled: ' + totalBackfilled);
    console.log('  - Sequences processed: ' + results.length);
    if (results.length > 0) {
      console.log('[Backfill] Results:');
      results.forEach(r => {
        console.log('  - ' + r.sequenceName + ': ' + r.backfilled + ' contacts');
      });
    }
    
    return { totalBackfilled, results };
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    return { error: error.message };
  }
};

console.log('[Email Cleanup] Script loaded!');
console.log('  - Run: cleanupOrphanedScheduledEmails() to fix orphaned emails');
console.log('  - Run: cleanupOrphanedScheduledEmails({ dryRun: true }) to preview changes');
console.log('  - Run: cleanupOrphanedScheduledEmails({ deleteOrphaned: true }) to delete truly orphaned records');
console.log('  - Run: cleanupOrphanedScheduledEmails({ deleteMatchedSent: true }) to delete orphaned emails that match sent emails');
console.log('  - Run: retryFailedEmailGeneration() to retry all error-status emails');
console.log('  - Run: retryFailedEmailGeneration([id1, id2, ...]) to retry specific email IDs');
console.log('  - Run: checkScheduledEmailsStatus() to see all scheduled emails status');
console.log('  - Run: checkScheduledEmailsStatus(true) to see only tomorrow\'s scheduled emails');
console.log('  - Run: reloadScheduledEmails() to force reload scheduled emails in UI');
console.log('  - Run: recoverRecentlyAddedContacts(24, 50, true) to DRY RUN - preview contacts added in last 24 hours');
console.log('  - Run: recoverRecentlyAddedContacts(24) to recover contacts added in last 24 hours');
console.log('  - Run: recoverRecentlyAddedContacts(48, 100) to recover contacts added in last 48 hours (up to 100)');
console.log('  - Run: restartSequenceFromStep1(null, true) to DRY RUN - preview contacts that haven\'t received emails');
console.log('  - Run: restartSequenceFromStep1(sequenceId, true) to DRY RUN - preview for specific sequence');
console.log('  - Run: restartSequenceFromStep1(null, true, true) to DRY RUN in STRICT mode (only checks actual sent emails)');
console.log('  - Run: restartSequenceFromStep1() to restart all sequences from step 1 for contacts without emails');
console.log('  - Run: restartSequenceFromStep1(sequenceId) to restart specific sequence from step 1');
console.log('  - Run: restartSequenceFromStep1(sequenceId, false, true) to restart in STRICT mode');
console.log('  - Run: backfillSequenceActivations() to backfill activations for contacts added but never activated');
console.log('  - Run: backfillSequenceActivations(sequenceId) to backfill specific sequence');
console.log('  - Run: showRecentSentEmails(30) to see last 30 sent emails for comparison');

