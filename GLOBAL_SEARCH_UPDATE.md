# Global Search Navigation Enhancement

## Changes Made

Updated the global search functionality to navigate to individual detail pages instead of just the main listing pages when clicking on search results.

### Key Changes:

1. **Modified `navigateToItem()` function in global-search.js**:
   - Now calls the appropriate detail view functions after navigating to the page
   - Uses `window.ContactDetail.show(id)` for people/contacts
   - Uses `window.AccountDetail.show(id)` for accounts
   - Provides fallback messages for sequences and deals (until their detail pages are implemented)

2. **Function Mappings**:
   - Person results → `window.ContactDetail.show(id)`
   - Account results → `window.AccountDetail.show(id)`
   - Sequence results → Placeholder (shows "coming soon" toast)
   - Deal results → Placeholder (shows "coming soon" toast)

3. **Navigation Flow**:
   - First navigates to the appropriate page (people, accounts, etc.)
   - After a 300ms delay, calls the detail function for the specific item
   - Maintains the session storage for item highlighting

## What This Enables:

- Clicking on a contact in global search results now opens their individual contact detail page
- Clicking on an account in global search results now opens their individual account detail page
- Maintains all existing functionality for action buttons (email, call, etc.)
- Ready for future sequence and deal detail page implementations

## Testing:

To test the functionality:
1. Use the global search to find a contact or account
2. Click on the search result item (not the action buttons)
3. Verify that it navigates to the detail page for that specific item
4. Test that action buttons (email/call for contacts, add contact/create deal for accounts) still work correctly

## Notes:

- The detail page functions are already exported from their respective modules:
  - `contact-detail.js` exports `window.ContactDetail.show`
  - `account-detail.js` exports `window.AccountDetail.show`
- Sequences and deals will show placeholder messages until their detail pages are implemented
- The 300ms delay ensures the page has finished loading before attempting to show the detail view
