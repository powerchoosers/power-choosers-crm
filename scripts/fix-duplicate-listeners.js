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
    '_widgetsNotesPreloadedBound',
    
    // NEW: Account Detail page button handlers
    '_accountDetailEditAccountBound',
    '_accountDetailWebsiteButtonBound',
    '_accountDetailLinkedInButtonBound',
    
    // NEW: Contact Detail page edit modal handlers
    '_contactDetailEditContactBound',
    
    // NEW: List Detail page unguarded listeners
    '_listDetailBackBtnBound',
    '_listDetailContactsBtnBound',
    '_listDetailQuickSearchBound',
    '_listDetailToggleBtnBound',
    '_listDetailTbodyBound',
    '_listDetailApplyBtnBound',
    '_listDetailClearBtnBound',
    '_listDetailTitleKeydownBound',
    '_listDetailTitleInputBound',
    '_listDetailTitleWrapBound',
    '_listDetailTitleClearBound',
    '_listDetailTitleSuggestBound',
    '_listDetailCompanyKeydownBound',
    '_listDetailCompanyInputBound',
    '_listDetailCompanyWrapBound',
    '_listDetailCompanyClearBound',
    '_listDetailCompanySuggestBound',
    '_listDetailSeniorityKeydownBound',
    '_listDetailSeniorityInputBound',
    '_listDetailSeniorityWrapBound',
    '_listDetailSeniorityClearBound',
    '_listDetailSenioritySuggestBound',
    '_listDetailDepartmentKeydownBound',
    '_listDetailDepartmentInputBound',
    '_listDetailDepartmentWrapBound',
    '_listDetailDepartmentClearBound',
    '_listDetailDepartmentSuggestBound',
    '_listDetailCityKeydownBound',
    '_listDetailCityInputBound',
    '_listDetailCityWrapBound',
    '_listDetailCityClearBound',
    '_listDetailCitySuggestBound',
    '_listDetailStateKeydownBound',
    '_listDetailStateInputBound',
    '_listDetailStateWrapBound',
    '_listDetailStateClearBound',
    '_listDetailStateSuggestBound',
    '_listDetailEmployeesKeydownBound',
    '_listDetailEmployeesInputBound',
    '_listDetailEmployeesWrapBound',
    '_listDetailEmployeesClearBound',
    '_listDetailEmployeesSuggestBound',
    '_listDetailIndustryKeydownBound',
    '_listDetailIndustryInputBound',
    '_listDetailIndustryWrapBound',
    '_listDetailIndustryClearBound',
    '_listDetailIndustrySuggestBound',
    '_listDetailVisitorDomainKeydownBound',
    '_listDetailVisitorDomainInputBound',
    '_listDetailVisitorDomainWrapBound',
    '_listDetailVisitorDomainClearBound',
    '_listDetailVisitorDomainSuggestBound',
    
    // NEW: Algolia reindex button handlers (Settings page)
    '_algoliaReindexAccountsBound',
    '_algoliaReindexContactsBound',
    
    // NEW: Main dashboard listeners (main.js)
    '_mainCrmInitialized',
    '_mainComposeButtonBound',
    '_mainNavigationItemsBound',
    '_mainSidebarHoverBound',
    '_mainSearchInputBound',
    '_mainSearchButtonBound',
    '_mainQuickActionButtonsBound',
    '_mainPhoneButtonBound',
    '_mainScriptsButtonBound',
    '_mainDocumentTooltipBound',
    '_mainDocumentKeydownBound',
    '_mainDocumentMousedownBound',
    '_mainDocumentTouchstartBound',
    '_mainDocumentMouseenterBound',
    '_mainDocumentFocusinBound',
    '_mainDocumentMouseleaveBound',
    '_mainDocumentFocusoutBound',
    '_mainActionButtonsBound',
    '_mainFilterTabsBound',
    
    // NEW: CSV Import listeners (main.js)
    '_csvBrowseBound',
    '_csvFileInputBound',
    '_csvDropZoneBound',
    '_csvRemoveBound',
    '_csvStartBound',
    '_csvFinishBound',
    '_mainPaginationBound',
    '_mainBulkImportBound',
    
    // NEW: Live call insights widget listeners
    '_liveCallInsightsCallStartedBound',
    '_liveCallInsightsCallEndedBound'
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

