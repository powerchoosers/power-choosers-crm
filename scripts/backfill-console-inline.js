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

💡 Recommended: Run dry run first, then real run
💡 If tasks don't appear: Run await fixBackfilledTasks(); then await refreshTasks();
  `);

  return { runBackfill };
})();

