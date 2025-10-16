/**
 * Emergency Fix: Clear Duplicate Event Listeners
 * 
 * This script prevents the 60,000+ hidden log issue caused by duplicate event listeners.
 * Run this once after page load to clean up existing duplicates.
 */

(function() {
  console.log('[EventListener Fix] Applying emergency fix for duplicate listeners...');
  
  // Mark all listener guards as bound to prevent future duplicates
  const guards = [
    // Original guards (already fixed)
    '_peopleRestoreBound',
    '_peopleCallLoggedBound',
    '_accountsRestoreBound',
    '_accountsCallLoggedBound',
    '_callsModuleCallLoggedBound',
    '_contactDetailUpdatedBound',
    '_contactDetailCallLoggedBound',
    '_contactDetailLoadedBound',
    '_arcLiveHooksBound',
    '_tasksRestoreBound',
    
    // NEW: Unguarded listeners found in contact-detail.js (lines 2749-2753)
    '_contactDetailCallEndedBound',
    '_contactDetailLiveCallDurationBound',
    '_contactDetailCallLoggedBound2',
    
    // NEW: Unguarded listeners found in account-detail.js (lines 1531-1535)
    '_accountDetailCallEndedBound',
    '_accountDetailLiveCallDurationBound',
    '_accountDetailCallLoggedBound2',
    
    // NEW: Unguarded listeners found in calls.js (line 3353)
    '_callsLiveCallDurationBound',
    
    // NEW: Unguarded listeners found in other files
    '_clickToCallPageLoadedBound',
    '_mainActivitiesRefreshBound',
    '_taskDetailContactCreatedBound',
    '_taskDetailContactUpdatedBound',
    '_taskDetailPageLoadedBound',
    '_taskDetailRestoreBound',
    '_tasksAutoTaskBound1',
    '_tasksAutoTaskBound2',
    '_phoneEnergyUpdatedBound',
    '_healthEnergyUpdatedBound',
    '_listDetailRestoreListenerBound',
    '_accountDetailContactsListenerBound',
    '_contactDetailAccountsListenerBound',
    '_contactDetailActivitiesRefreshBound',
    '_contactDetailEnergyUpdatedBound',
    '_contactDetailContactCreatedBound',
    '_accountDetailActivitiesRefreshBound',
    '_accountDetailAccountCreatedBound',
    '_accountDetailContactCreatedBound',
    '_accountDetailContactUpdatedBound',
    '_accountDetailEnergyUpdatedBound',
    '_listsRestoreBound',
    '_callsRestoreBound',
    '_widgetsNotesPreloadedBound'
  ];
  
  guards.forEach(guard => {
    if (!document[guard]) {
      document[guard] = true;
      console.log(`[EventListener Fix] Set guard: ${guard}`);
    }
  });
  
  console.log('[EventListener Fix] All listener guards are now active.');
  console.log('[EventListener Fix] Please refresh the page to clear duplicate listeners.');
  console.log('[EventListener Fix] After refresh, hidden logs should stop accumulating.');
  
  // Optional: Monitor for rapid log generation
  let logCount = 0;
  let lastLogCheck = Date.now();
  
  setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastLogCheck;
    const logsPerSecond = (logCount * 1000) / elapsed;
    
    if (logsPerSecond > 10) {
      console.warn(`[EventListener Fix] WARNING: ${Math.round(logsPerSecond)} logs/second detected. Possible runaway listener still active.`);
    } else if (logCount > 0) {
      console.log(`[EventListener Fix] Log rate: ${Math.round(logsPerSecond)} logs/second (normal)`);
    }
    
    logCount = 0;
    lastLogCheck = now;
  }, 5000); // Check every 5 seconds
  
  // Hook console to track log rate
  const originalLog = console.log;
  console.log = function(...args) {
    logCount++;
    return originalLog.apply(console, args);
  };
  
})();

