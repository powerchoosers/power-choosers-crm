/**
 * Browser Console Script: Backfill Sequence Tasks
 * 
 * This script runs the backfill process to create tasks for contacts
 * that already have emails sent in sequence steps.
 * 
 * Usage in browser console:
 * 
 * // Dry run (preview what would be created)
 * await runBackfill({ dryRun: true });
 * 
 * // Real run (actually create tasks)
 * await runBackfill({ dryRun: false });
 * 
 * // Force mode (for sequences with missing email records)
 * await runBackfill({ dryRun: false, forceCreate: true });
 * 
 * // With progress updates
 * await runBackfill({ dryRun: false, showProgress: true });
 */

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
    // Show toast if available
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

    // Display results
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

      // Show toast with results
      if (showProgress && window.crm?.showToast) {
        const message = dryRun
          ? `Dry run complete: Would create ${result.tasksToCreate} tasks, skipped ${result.skipped}`
          : `Backfill complete: Created ${result.tasksToCreate} tasks, skipped ${result.skipped}`;
        window.crm.showToast(message, result.tasksToCreate > 0 ? 'success' : 'info');
      }

      // Force display results (bypasses log silencing)
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

    // Force display error
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

// Export for easy access
window.runBackfill = runBackfill;

// Auto-run instructions
console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Backfill Sequence Tasks - Console Script                   ║
╚══════════════════════════════════════════════════════════════╝

📋 Available Commands:

1. Dry Run (preview only):
   await runBackfill({ dryRun: true });

2. Real Run (create tasks):
   await runBackfill({ dryRun: false });

3. Force Mode (assume emails were sent):
   await runBackfill({ dryRun: false, forceCreate: true });

4. With progress updates:
   await runBackfill({ dryRun: false, showProgress: true });

💡 Quick Start:
   await runBackfill({ dryRun: true });  // Preview first
   await runBackfill({ dryRun: false }); // Then run for real

The function is now available as: window.runBackfill()
`);

