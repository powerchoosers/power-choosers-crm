/**
 * COPY-PASTE THIS ENTIRE SCRIPT INTO YOUR BROWSER CONSOLE
 * 
 * This is a self-contained script that you can paste directly into the browser console
 * to run the backfill process for sequence tasks.
 * 
 * Usage after pasting:
 * 
 * // Dry run (preview what would be created)
 * await runBackfill({ dryRun: true });
 * 
 * // Real run (actually create tasks)
 * await runBackfill({ dryRun: false });
 * 
 * // Force mode (for sequences with missing email records)
 * await runBackfill({ dryRun: false, forceCreate: true });
 */

(async function() {
  'use strict';
  
  async function runBackfill(options = {}) {
    const {
      dryRun = true,
      forceCreate = false,
      showProgress = true
    } = options;

    const baseUrl = window.API_BASE_URL || window.location.origin;
    const endpoint = `${baseUrl}/api/backfill-sequence-tasks`;

    console.log(`[Backfill] Starting backfill process...`);
    console.log(`[Backfill] Mode: ${dryRun ? 'DRY RUN (preview only)' : 'REAL RUN (will create tasks)'}`);
    console.log(`[Backfill] Force Create: ${forceCreate ? 'YES (assume emails were sent)' : 'NO (use email records)'}`);
    console.log(`[Backfill] Endpoint: ${endpoint}`);

    if (showProgress) {
      if (window.crm?.showToast) {
        window.crm.showToast(
          `Starting backfill ${dryRun ? '(dry run)' : ''}...`,
          'info'
        );
      }
    }

    try {
      const startTime = Date.now();
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dryRun,
          forceCreate
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`[Backfill] ✅ Complete in ${duration}s`);
      console.log(`[Backfill] Results:`, result);

      if (result.success) {
        console.log(`\n📊 BACKFILL SUMMARY:`);
        console.log(`   Tasks to create: ${result.tasksToCreate}`);
        console.log(`   Skipped: ${result.skipped}`);
        console.log(`   Mode: ${result.dryRun ? 'DRY RUN' : 'REAL RUN'}`);
        console.log(`   Message: ${result.message}`);

        if (result.skippedReasons && result.skippedReasons.length > 0) {
          console.log(`\n⚠️  SKIP REASONS (first 10):`);
          const reasonsByType = {};
          result.skippedReasons.forEach(item => {
            const reason = item.reason || 'Unknown';
            reasonsByType[reason] = (reasonsByType[reason] || 0) + 1;
          });
          Object.entries(reasonsByType).forEach(([reason, count]) => {
            console.log(`   ${reason}: ${count}`);
          });
        }

        // CRITICAL: If not a dry run, invalidate cache and reload tasks
        if (!dryRun && result.tasksToCreate > 0) {
          console.log('[Backfill] Invalidating tasks cache and reloading...');
          try {
            // Invalidate cache
            if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
              await window.CacheManager.invalidate('tasks');
              console.log('[Backfill] ✓ Tasks cache invalidated');
            }
            
            // Force reload from BackgroundTasksLoader
            if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
              await window.BackgroundTasksLoader.forceReload();
              console.log('[Backfill] ✓ Tasks reloaded from Firestore');
            }
            
            // Trigger tasks page refresh if on tasks page
            if (window.Tasks && typeof window.Tasks.loadMoreTasks === 'function') {
              // Dispatch event to trigger tasks page reload
              document.dispatchEvent(new CustomEvent('pc:tasks-loaded', {
                detail: { count: result.tasksToCreate, fromBackfill: true }
              }));
              console.log('[Backfill] ✓ Tasks page refresh triggered');
            }
            
            // Also trigger the tasksUpdated event for any listeners
            window.dispatchEvent(new CustomEvent('tasksUpdated', {
              detail: { source: 'backfill', count: result.tasksToCreate }
            }));
          } catch (cacheError) {
            console.warn('[Backfill] Error refreshing tasks cache:', cacheError);
          }
        }

        if (showProgress && window.crm?.showToast) {
          const message = dryRun
            ? `Dry run complete: Would create ${result.tasksToCreate} tasks, skipped ${result.skipped}`
            : `Backfill complete: Created ${result.tasksToCreate} tasks, skipped ${result.skipped}`;
          window.crm.showToast(message, result.tasksToCreate > 0 ? 'success' : 'info');
        }

        if (showProgress) {
          const resultHtml = `
            <div style="position:fixed;top:20px;right:20px;background:white;border:2px solid ${dryRun ? '#ffa500' : '#4caf50'};padding:20px;z-index:99999;max-width:500px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:system-ui,-apple-system,sans-serif;">
              <h3 style="margin:0 0 15px 0;color:${dryRun ? '#ffa500' : '#4caf50'};">Backfill ${dryRun ? 'Dry Run' : 'Complete'}</h3>
              <p style="margin:5px 0;"><strong>Tasks to create:</strong> ${result.tasksToCreate}</p>
              <p style="margin:5px 0;"><strong>Skipped:</strong> ${result.skipped}</p>
              <p style="margin:5px 0;"><strong>Duration:</strong> ${duration}s</p>
              <p style="margin:15px 0 0 0;font-size:14px;color:#666;">${result.message}</p>
              <button onclick="this.parentElement.remove()" style="margin-top:15px;padding:8px 16px;background:#666;color:white;border:none;border-radius:4px;cursor:pointer;">Close</button>
            </div>
          `;
          document.body.insertAdjacentHTML('beforeend', resultHtml);
        }

        return result;
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error(`[Backfill] ❌ Error:`, error);
      
      if (showProgress && window.crm?.showToast) {
        window.crm.showToast(`Backfill failed: ${error.message}`, 'error');
      }

      if (showProgress) {
        const errorHtml = `
          <div style="position:fixed;top:20px;right:20px;background:white;border:2px solid #f44336;padding:20px;z-index:99999;max-width:500px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:system-ui,-apple-system,sans-serif;">
            <h3 style="margin:0 0 15px 0;color:#f44336;">Backfill Error</h3>
            <p style="margin:0;color:#666;">${error.message}</p>
            <button onclick="this.parentElement.remove()" style="margin-top:15px;padding:8px 16px;background:#666;color:white;border:none;border-radius:4px;cursor:pointer;">Close</button>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', errorHtml);
      }

      throw error;
    }
  }

  // Fix existing backfilled tasks by adding timestamp field
  async function fixBackfilledTasks() {
    console.log('[Backfill] Fixing backfilled tasks (adding timestamp field)...');
    
    if (!window.firebaseDB) {
      console.error('[Backfill] Firebase not available');
      return;
    }

    try {
      // Get all tasks that are backfilled but missing timestamp
      const tasksSnapshot = await window.firebaseDB.collection('tasks')
        .where('backfilled', '==', true)
        .get();

      console.log(`[Backfill] Found ${tasksSnapshot.size} backfilled tasks`);

      const batch = window.firebaseDB.batch();
      let fixedCount = 0;

      tasksSnapshot.forEach(doc => {
        const data = doc.data();
        // Only update if timestamp is missing
        if (!data.timestamp) {
          // Use createdAt if available, otherwise use current time
          let timestampValue;
          if (data.createdAt && data.createdAt.toDate) {
            timestampValue = data.createdAt.toDate().getTime();
          } else if (data.createdAt && data.createdAt.seconds) {
            timestampValue = data.createdAt.seconds * 1000;
          } else if (typeof data.createdAt === 'number') {
            timestampValue = data.createdAt;
          } else {
            timestampValue = Date.now();
          }

          batch.update(doc.ref, {
            timestamp: timestampValue
          });
          fixedCount++;
        }
      });

      if (fixedCount > 0) {
        await batch.commit();
        console.log(`[Backfill] ✅ Fixed ${fixedCount} tasks (added timestamp field)`);
        
        // Invalidate cache and reload
        await refreshTasks();
        
        if (window.crm?.showToast) {
          window.crm.showToast(`Fixed ${fixedCount} tasks`, 'success');
        }
      } else {
        console.log('[Backfill] All backfilled tasks already have timestamp field');
      }

      return { fixed: fixedCount, total: tasksSnapshot.size };
    } catch (error) {
      console.error('[Backfill] Error fixing tasks:', error);
      if (window.crm?.showToast) {
        window.crm.showToast(`Failed to fix tasks: ${error.message}`, 'error');
      }
      throw error;
    }
  }

  // Clean up sent emails that are still marked as scheduled
  async function cleanupSentScheduledEmails(options = {}) {
    const { deleteOrphaned = false, markAllPastAsSent = false } = options;
    console.log('[Backfill] Cleaning up sent emails that are still marked as scheduled...');
    console.log(`[Backfill] Mode: ${deleteOrphaned ? 'DELETE orphaned emails' : markAllPastAsSent ? 'MARK ALL past emails as sent' : 'MARK as sent (smart detection)'}`);
    
    if (!window.firebaseDB) {
      console.error('[Backfill] Firebase not available');
      return;
    }

    try {
      // Get all scheduled emails
      const scheduledSnapshot = await window.firebaseDB.collection('emails')
        .where('type', '==', 'scheduled')
        .get();

      console.log(`[Backfill] Found ${scheduledSnapshot.size} scheduled emails to check`);

      let fixedCount = 0;
      let deletedCount = 0;
      const fixedEmails = [];
      const deletedEmails = [];
      const updates = []; // Collect all updates first
      const deletes = []; // Collect all deletes first

      scheduledSnapshot.forEach(doc => {
        const data = doc.data();
        
        // Check if email was actually sent (multiple indicators)
        const hasSentAt = data.sentAt && (typeof data.sentAt === 'number' || typeof data.sentAt === 'string' || (data.sentAt && data.sentAt.toDate));
        const hasSendgridId = data.sendgridMessageId || data.sgMessageId || data.messageId;
        const statusIsSent = data.status === 'sent' || data.status === 'delivered';
        
        // Check if email is an orphaned sent email (no content, past send time)
        const now = Date.now();
        let scheduledTimeMs = null;
        if (data.scheduledSendTime) {
          if (typeof data.scheduledSendTime === 'number') {
            scheduledTimeMs = data.scheduledSendTime;
          } else if (data.scheduledSendTime.toDate) {
            scheduledTimeMs = data.scheduledSendTime.toDate().getTime();
          } else if (data.scheduledSendTime.seconds) {
            scheduledTimeMs = data.scheduledSendTime.seconds * 1000;
          }
        }
        
        // Check if email has no content (indicates it was sent and content was cleared)
        const hasNoContent = !data.subject || data.subject === '(No Subject)' || 
                             (!data.html && !data.text && !data.content);
        
        // Check if scheduled time is in the past (more than 5 minutes ago - more lenient)
        const isPastSendTime = scheduledTimeMs && scheduledTimeMs < (now - 5 * 60 * 1000);
        
        // AGGRESSIVE CLEANUP: If email has no content AND send time is past, it's likely sent
        // Also check if status is 'approved' or 'sending' with past time (stuck emails)
        const isStuckApproved = data.status === 'approved' && isPastSendTime;
        const isStuckSending = data.status === 'sending' && isPastSendTime;
        const isOrphanedSent = hasNoContent && isPastSendTime;
        
        // AGGRESSIVE MODE: Mark ALL past emails as sent (regardless of content/status)
        const shouldMarkAsSent = markAllPastAsSent 
          ? isPastSendTime  // In aggressive mode, any past email is marked as sent
          : (hasSentAt || hasSendgridId || statusIsSent || isOrphanedSent || isStuckApproved || isStuckSending);
        
        // If email has any indication it was sent, mark it as sent
        // OR if it's clearly orphaned (no content, past time), handle it
        if (shouldMarkAsSent) {
          
          // If deleteOrphaned mode and email has no content, delete it instead of marking as sent
          if (deleteOrphaned && hasNoContent && !hasSentAt && !hasSendgridId && !statusIsSent) {
            deletes.push(doc.ref);
            deletedCount++;
            deletedEmails.push({
              id: doc.id,
              to: Array.isArray(data.to) ? data.to[0] : data.to,
              subject: data.subject || '(No Subject)',
              reason: 'orphaned (no content, past send time, no sent indicators)'
            });
            return; // Skip to next email
          }
          const updateData = {
            type: 'sent',
            status: 'sent',
            emailType: 'sent',
            isSentEmail: true
          };
          
          // Preserve existing sentAt if it exists (don't overwrite)
          // Only set sentAt if it's missing
          if (!data.sentAt) {
            // Try to use scheduledSendTime as fallback
            if (data.scheduledSendTime) {
              if (typeof data.scheduledSendTime === 'number') {
                updateData.sentAt = data.scheduledSendTime;
              } else if (data.scheduledSendTime.toDate) {
                updateData.sentAt = data.scheduledSendTime.toDate().getTime();
              } else if (data.scheduledSendTime.seconds) {
                updateData.sentAt = data.scheduledSendTime.seconds * 1000;
              } else {
                // Use serverTimestamp as last resort
                if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
                  updateData.sentAt = window.firebase.firestore.FieldValue.serverTimestamp();
                } else {
                  updateData.sentAt = Date.now();
                }
              }
            } else {
              // No scheduledSendTime either, use serverTimestamp or now
              if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
                updateData.sentAt = window.firebase.firestore.FieldValue.serverTimestamp();
              } else {
                updateData.sentAt = Date.now();
              }
            }
          }
          // If sentAt already exists, we don't need to set it (Firestore will preserve it)
          
          // Set updatedAt
          if (window.firebase?.firestore?.FieldValue?.serverTimestamp) {
            updateData.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
          } else {
            updateData.updatedAt = new Date().toISOString();
          }
          
          updates.push({ ref: doc.ref, data: updateData });
          
          fixedCount++;
          
          // Get sentAt for logging
          let sentAtForLog = 'Unknown';
          if (data.sentAt) {
            if (data.sentAt.toDate) {
              sentAtForLog = data.sentAt.toDate().toLocaleString();
            } else if (data.sentAt.seconds) {
              sentAtForLog = new Date(data.sentAt.seconds * 1000).toLocaleString();
            } else if (typeof data.sentAt === 'number') {
              sentAtForLog = new Date(data.sentAt).toLocaleString();
            } else if (typeof data.sentAt === 'string') {
              sentAtForLog = new Date(data.sentAt).toLocaleString();
            }
          } else if (data.scheduledSendTime) {
            if (data.scheduledSendTime.toDate) {
              sentAtForLog = data.scheduledSendTime.toDate().toLocaleString();
            } else if (data.scheduledSendTime.seconds) {
              sentAtForLog = new Date(data.scheduledSendTime.seconds * 1000).toLocaleString();
            } else if (typeof data.scheduledSendTime === 'number') {
              sentAtForLog = new Date(data.scheduledSendTime).toLocaleString();
            }
          }
          
          // Determine reason for fixing
          let reason = 'unknown';
          if (markAllPastAsSent) reason = 'past send time (aggressive mode)';
          else if (hasSentAt) reason = 'has sentAt';
          else if (hasSendgridId) reason = 'has sendgridMessageId';
          else if (statusIsSent) reason = 'status is sent';
          else if (isStuckApproved) reason = 'stuck approved (past send time)';
          else if (isStuckSending) reason = 'stuck sending (past send time)';
          else if (isOrphanedSent) reason = 'orphaned (no content, past send time)';
          
          fixedEmails.push({
            id: doc.id,
            to: Array.isArray(data.to) ? data.to[0] : data.to,
            subject: data.subject || '(No Subject)',
            sentAt: sentAtForLog,
            reason: reason
          });
        }
      });

      // Commit deletes first (if any)
      if (deletes.length > 0) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < deletes.length; i += BATCH_SIZE) {
          const batch = window.firebaseDB.batch();
          const chunk = deletes.slice(i, i + BATCH_SIZE);
          chunk.forEach(ref => {
            batch.delete(ref);
          });
          await batch.commit();
          console.log(`[Backfill] Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} emails)`);
        }
        console.log(`[Backfill] ✅ Deleted ${deletedCount} orphaned emails`);
        if (deletedEmails.length > 0) {
          console.table(deletedEmails);
        }
      }
      
      // Commit updates in batches (Firestore limit is 500 per batch)
      if (updates.length > 0) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = window.firebaseDB.batch();
          const chunk = updates.slice(i, i + BATCH_SIZE);
          chunk.forEach(({ ref, data }) => {
            batch.update(ref, data);
          });
          await batch.commit();
          console.log(`[Backfill] Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} emails)`);
        }
        console.log(`[Backfill] ✅ Fixed ${fixedCount} emails (marked as sent)`);
        if (fixedEmails.length > 0) {
          console.table(fixedEmails);
        }
      }
      
      // Invalidate cache and reload emails if there were any changes
      if (updates.length > 0 || deletes.length > 0) {
        // Invalidate cache and reload emails
        if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
          await window.CacheManager.invalidate('emails');
          console.log('[Backfill] ✓ Emails cache invalidated');
        }
        
        // Force reload emails
        if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.forceReload === 'function') {
          await window.BackgroundEmailsLoader.forceReload();
          console.log('[Backfill] ✓ Emails reloaded');
        }
        
        // Trigger emails page refresh
        document.dispatchEvent(new CustomEvent('pc:emails-updated', { 
          detail: { count: fixedCount + deletedCount, fromCleanup: true } 
        }));
        
        const totalFixed = fixedCount + deletedCount;
        if (window.crm?.showToast) {
          const message = deletedCount > 0 
            ? `Fixed ${fixedCount} emails and deleted ${deletedCount} orphaned emails`
            : `Fixed ${fixedCount} sent emails (removed from scheduled tab)`;
          window.crm.showToast(message, 'success');
        }
      } else {
        console.log('[Backfill] No sent emails found that need fixing');
        if (window.crm?.showToast) {
          window.crm.showToast('All scheduled emails are correctly marked', 'info');
        }
      }

      return { fixed: fixedCount, deleted: deletedCount, total: scheduledSnapshot.size };
    } catch (error) {
      console.error('[Backfill] Error cleaning up emails:', error);
      if (window.crm?.showToast) {
        window.crm.showToast(`Failed to cleanup emails: ${error.message}`, 'error');
      }
      throw error;
    }
  }

  // Delete ALL scheduled emails (simple, no questions asked)
  async function deleteAllScheduledEmails() {
    console.log('[Backfill] Deleting ALL scheduled emails...');
    
    if (!window.firebaseDB) {
      console.error('[Backfill] Firebase not available');
      return;
    }

    try {
      // Get all scheduled emails
      const scheduledSnapshot = await window.firebaseDB.collection('emails')
        .where('type', '==', 'scheduled')
        .get();

      console.log(`[Backfill] Found ${scheduledSnapshot.size} scheduled emails to delete`);

      if (scheduledSnapshot.size === 0) {
        console.log('[Backfill] No scheduled emails to delete');
        if (window.crm?.showToast) {
          window.crm.showToast('No scheduled emails found', 'info');
        }
        return { deleted: 0 };
      }

      // Delete in batches
      const BATCH_SIZE = 500;
      let deletedCount = 0;
      
      for (let i = 0; i < scheduledSnapshot.size; i += BATCH_SIZE) {
        const batch = window.firebaseDB.batch();
        const chunk = scheduledSnapshot.docs.slice(i, i + BATCH_SIZE);
        
        chunk.forEach(doc => {
          batch.delete(doc.ref);
          deletedCount++;
        });
        
        await batch.commit();
        console.log(`[Backfill] Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} emails)`);
      }

      console.log(`[Backfill] ✅ Deleted ${deletedCount} scheduled emails`);

      // Invalidate cache and reload emails
      if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        await window.CacheManager.invalidate('emails');
        console.log('[Backfill] ✓ Emails cache invalidated');
      }
      
      if (window.BackgroundEmailsLoader && typeof window.BackgroundEmailsLoader.forceReload === 'function') {
        await window.BackgroundEmailsLoader.forceReload();
        console.log('[Backfill] ✓ Emails reloaded');
      }
      
      document.dispatchEvent(new CustomEvent('pc:emails-updated', { 
        detail: { count: deletedCount, fromCleanup: true } 
      }));

      if (window.crm?.showToast) {
        window.crm.showToast(`Deleted ${deletedCount} scheduled emails`, 'success');
      }

      return { deleted: deletedCount };
    } catch (error) {
      console.error('[Backfill] Error deleting scheduled emails:', error);
      if (window.crm?.showToast) {
        window.crm.showToast(`Failed to delete emails: ${error.message}`, 'error');
      }
      throw error;
    }
  }

  // Manual refresh function to see new tasks
  async function refreshTasks() {
    console.log('[Backfill] Refreshing tasks...');
    try {
      // Invalidate cache
      if (window.CacheManager && typeof window.CacheManager.invalidate === 'function') {
        await window.CacheManager.invalidate('tasks');
        console.log('[Backfill] ✓ Tasks cache invalidated');
      }
      
      // Force reload from BackgroundTasksLoader
      if (window.BackgroundTasksLoader && typeof window.BackgroundTasksLoader.forceReload === 'function') {
        await window.BackgroundTasksLoader.forceReload();
        console.log('[Backfill] ✓ Tasks reloaded from Firestore');
      }
      
      // Trigger tasks page refresh
      document.dispatchEvent(new CustomEvent('pc:tasks-loaded', {
        detail: { count: 0, fromRefresh: true }
      }));
      
      // Also trigger tasksUpdated event
      window.dispatchEvent(new CustomEvent('tasksUpdated', {
        detail: { source: 'manual-refresh' }
      }));
      
      // If on tasks page, reload data
      if (window.Tasks && typeof window.Tasks.loadMoreTasks === 'function') {
        // The event above should trigger the reload, but we can also try direct reload
        const tasksPage = document.getElementById('tasks-page');
        if (tasksPage && tasksPage.offsetParent !== null) {
          console.log('[Backfill] Tasks page is visible, triggering reload...');
          // The page should listen to pc:tasks-loaded event
        }
      }
      
      console.log('[Backfill] ✅ Tasks refresh complete! Check your Tasks page.');
      
      if (window.crm?.showToast) {
        window.crm.showToast('Tasks refreshed', 'success');
      }
    } catch (error) {
      console.error('[Backfill] Error refreshing tasks:', error);
      if (window.crm?.showToast) {
        window.crm.showToast('Failed to refresh tasks', 'error');
      }
    }
  }

  // Make it available globally
  window.runBackfill = runBackfill;
  window.refreshTasks = refreshTasks;
  window.fixBackfilledTasks = fixBackfilledTasks;
  window.cleanupSentScheduledEmails = cleanupSentScheduledEmails;
  window.deleteAllScheduledEmails = deleteAllScheduledEmails;

  // Show instructions
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ✅ Backfill Script Loaded!                                  ║
╚══════════════════════════════════════════════════════════════╝

📋 Quick Commands:

1. Preview (dry run):
   await runBackfill({ dryRun: true });

2. Create tasks (real run):
   await runBackfill({ dryRun: false });

3. Force mode (missing email records):
   await runBackfill({ dryRun: false, forceCreate: true });

4. Refresh tasks (see new tasks):
   await refreshTasks();

5. Fix existing backfilled tasks (add timestamp field):
   await fixBackfilledTasks();

6. Clean up sent emails from scheduled tab:
   await cleanupSentScheduledEmails();
   
7. Delete orphaned emails (no content, past send time):
   await cleanupSentScheduledEmails({ deleteOrphaned: true });

8. Mark ALL past scheduled emails as sent (aggressive):
   await cleanupSentScheduledEmails({ markAllPastAsSent: true });

9. Delete ALL scheduled emails (simple, removes everything):
   await deleteAllScheduledEmails();

💡 Recommended: Run dry run first, then real run
💡 If tasks don't appear: Run await fixBackfilledTasks(); then await refreshTasks();
💡 If sent emails show in scheduled tab: Run await cleanupSentScheduledEmails();
💡 To delete ALL scheduled emails: Run await deleteAllScheduledEmails();
  `);

  return { runBackfill };
})();

