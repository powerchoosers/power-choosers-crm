# Analysis: Power Choosers CRM Account Detail Freeze

This document summarizes the investigation into the UI freeze occurring when navigating to the Account Detail page.

## 1. The Core Issue
When opening an account (especially from the People page), the UI freezes for 10-15 seconds. 

## 2. Prime Suspect: `loadRecentCallsForAccount`
According to recent runtime logs (`docs/Logs.md`), this function is the primary bottleneck:
- **Log Line 37**: `durationMs: 11691` (11.6 seconds)
- **Log Line 53**: `durationMs: 11624` (11.6 seconds)
- **Log Line 70**: `durationMs: 10359` (10.3 seconds)

While this is intended to be a background task, it likely blocks the main thread during the fetch or the subsequent DOM processing/rendering of the call list.

## 3. Critical Files and Line Ranges

### `scripts/pages/account-detail.js`
*   **Navigation & Mutex (Lines 265-437)**: `showAccountDetail(accountId)`. Handles the page transition and prevents duplicate loads.
*   **Contact Rendering (Lines 900-1094)**: `renderAccountContacts()`. Now optimized to use `BackgroundContactsLoader` (takes ~100ms).
*   **Event Binding (Lines 3156-3400)**: `attachAccountDetailEvents()`. Refactored to prevent listener pile-up using `window._accountDetailDocEventsBound`.
*   **THE BOTTLENECK (Lines 1935-2045)**: `loadRecentCallsForAccount()`. This makes the heavy API call to `/api/twilio/conversational-intelligence`.

### `scripts/activity-manager.js`
*   **Activity Processing (Lines 1939-2065)**: `renderActivities()`. 
*   **Email Optimization (Lines 617-768)**: `getEmailActivities()`. Now uses a cached contact-email map to avoid O(N^2) lookups.

### `scripts/pages/people.js`
*   **Navigation Handler (Lines 3596-3651)**: The click listener on `els.tbody`. It uses `window._openingAccountDetail` as a guard.

### `scripts/cache-manager.js`
*   **Data Retrieval (Lines 206-231)**: `get(collection)`. This is the fallback if background loaders aren't ready.

## 4. What has been implemented
1.  **Debounce/Mutex**: Prevented `showAccountDetail` from running multiple times in parallel if a user double-clicks.
2.  **Cache-First Contacts**: Changed contact rendering to trust `BackgroundContactsLoader` first, avoiding slow Firestore queries.
3.  **One-Time Event Binding**: Document-level listeners are now only attached once.
4.  **Activity Manager Optimization**: Added a `_contactsEmailCache` to `ActivityManager` to speed up email-to-contact matching.
5.  **Visibility Guards**: Background tasks now check if the page is still visible before running.

## 5. Recommended Next Steps
The freeze is happening during the 11-second window while `loadRecentCallsForAccount` is running. 
1.  **Check API Blocking**: Ensure the `fetch` call inside `loadRecentCallsForAccount` isn't accidentally blocking the main thread (unlikely for `fetch`, but possible if there's heavy synchronous data processing immediately after).
2.  **Virtualize/Chunk Rendering**: If the account has hundreds of calls, rendering them all at once into the DOM will freeze the browser. Check if `arcRenderPage` or `arcPatchList` is doing too much DOM work at once.
3.  **Isolate the API**: Temporarily comment out the call to `loadRecentCallsForAccount()` in `showAccountDetail` (around Line 431) to confirm the freeze disappears.

