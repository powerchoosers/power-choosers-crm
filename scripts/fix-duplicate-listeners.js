/**
 * Emergency Fix: Clear Duplicate Event Listeners
 * 
 * This script prevents the 60,000+ hidden log issue caused by duplicate event listeners.
 * Run this once after page load to clean up existing duplicates.
 */

(function() {
  
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
    '_liveCallInsightsCallEndedBound',
    
    // NEW: Firebase real-time insights listeners
    // Note: Dynamic guards are created as _${page}Insights_${callSid}_Bound
    // Examples: _contactDetailInsights_call123_Bound, _accountDetailInsights_call456_Bound, _callsInsights_call789_Bound
    
    // NEW: Calls page unguarded listeners (calls.js)
    '_callsToggleBound',
    '_callsBtnClearBound',
    '_callsBtnApplyBound',
    '_callsSelectAllBound',
    '_callsTabsBound',
    '_callsInsightsKeydownBound',
    '_callsBulkResizeBound',
    '_callsBulkScrollBound',
    '_callsBulkOutsideBound',
    '_callsDeleteKeydownBound',
    '_callsDeleteMousedownBound',
    '_callsVisibilityChangeBound',
    
    // NEW: Left navigation sidebar listeners (main.js)
    '_sidebarHoverBound',
    
    // NEW: Contact lists / sequences panel listeners (contact-detail.js)
    // NOTE: These panels manage their own attach/detach lifecycle and are opened/closed
    // per-contact. We intentionally do NOT pre-mark their guards here because doing so
    // prevents listeners from being attached on subsequent opens (breaking Add-to-List
    // and Add-to-Sequence after the first use).
    // '_contactListsResizeBound',
    // '_contactListsScrollBound',
    // '_contactListsKeydownBound',
    // '_contactListsMousedownBound',
    // '_contactSequencesResizeBound',
    // '_contactSequencesScrollBound',
    // '_contactSequencesKeydownBound',
    // '_contactSequencesMousedownBound',

    // Sequence Builder page (new)
    '_sequenceContactsBtnBound',
    '_sequencePreviewDocClickBound',
    '_sequenceVarsPopoverDocClickBound',
    '_sequenceDelayPopoverDocClickBound',
    '_sequenceDeletePopoverDocClickBound',
    // NOTE: _sequenceBuilderContactHandlersBound is NOT pre-marked here because the handler
    // uses document-level delegation and must be attached once on first page load.
    // The guard in sequence-builder.js itself prevents duplicates on subsequent renders.
    
    // NEW: Task Detail page event listener guards (task-detail.js)
    '_taskDetailContactHandlersBound',
    '_taskDetailPhoneHandlersBound',
    '_taskDetailContactCreationBound',
    
    // NEW: Email Detail page event listener guards (email-detail.js)
    '_emailDetailSendNowBound'
  ];
  
  // NOTE: _composeToolbarClickBound removed - it was preventing the listener from being attached at all
  // The compose toolbar uses its own guard logic in setupToolbarEventListeners()
  
  guards.forEach(guard => {
    if (!document[guard]) {
      document[guard] = true;
    }
  });

  // De-duplicate stacked modal overlays/popovers that may have been created by duplicate listeners
  function pruneDuplicateOverlays() {
    try {
      // Keep only the most recently added .modal-overlay
      const overlays = Array.from(document.querySelectorAll('.modal-overlay'));
      if (overlays.length > 1) {
        overlays.slice(0, overlays.length - 1).forEach(el => {
          try { el.parentNode && el.parentNode.removeChild(el); } catch (_) {}
        });
      }

      // Also dedupe common anchored popovers used in sequence builder (keep last)
      ['.delete-popover', '.delay-popover', '.vars-popover', '.add-contact-popover'].forEach(sel => {
        const pops = Array.from(document.querySelectorAll(sel));
        if (pops.length > 1) {
          pops.slice(0, pops.length - 1).forEach(el => {
            try { el.parentNode && el.parentNode.removeChild(el); } catch (_) {}
          });
        }
      });
    } catch (_) {}
  }

  // One-time cleanup now
  pruneDuplicateOverlays();

  // Observe DOM for new overlays and prune older ones with throttling to reduce overhead
  try {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { try { pruneDuplicateOverlays(); } catch(_) {} scheduled = false; }, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}
  
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
    }
    
    logCount = 0;
    lastLogCheck = now;
  }, 5000); // Check every 5 seconds
  
  // Console.log hook removed - logs will now show their true origin
  // Log rate monitoring disabled to prevent all logs appearing from this file
  
})();

