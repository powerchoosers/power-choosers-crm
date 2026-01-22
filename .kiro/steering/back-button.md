---
inclusion: always
---
image.png---
description: Back Button Navigation - Ensure back buttons always return to the exact previous page/state
globs:
alwaysApply: true
---

# Back Button Navigation

## Core principle
- **Always return to the exact previous page**: If user clicks a company name from Calls page → Account Detail, the back button must return to Calls page, not Accounts page
- **Preserve complete context**: Maintain scroll position, filters, selections, pagination, and sort order
- **Track navigation source**: Store which specific page and state the user came from

## Navigation source tracking patterns
```javascript
// Pattern 1: For Account Detail navigation (use these exact variable names)
window._accountNavigationSource = 'calls'; // or 'people', 'accounts', 'lists'
window._callsReturn = { // or _peopleReturn, _accountsReturn, etc.
  page: state.currentPage,
  scroll: window.scrollY,
  filters: getCurrentFilters(),
  selectedItems: getSelectedItems(),
  sortColumn: getCurrentSort(),
  searchTerm: getCurrentSearch()
};

// Pattern 2: For Contact Detail navigation
window._contactNavigationSource = 'calls'; // or 'people', 'accounts', etc.
window._contactNavigationContactId = contactId;
```

## Contact ID Resolution Requirements
- **Always resolve contact IDs**: When API data lacks contactId, look up by contact name in people data
- **Fallback chain**: API contactId → name lookup in people data → phone lookup → account recent contact
- **Generate fallback IDs**: If no contact ID found, generate `call_contact_${callId}_${timestamp}` for navigation
- **Data consistency**: Ensure row data includes resolved contactId for navigation to work
- **Debug logging**: Include contact ID resolution debugging during development

## Generated Contact ID Handling
- **Pattern**: Generated IDs start with `call_contact_` prefix
- **Navigation**: For generated IDs, create temporary contact object from call data
- **Contact Detail**: Pass temporary contact object to `ContactDetail.show(contactId, tempContact)`
- **Temporary Contact Structure**: `{ id, firstName, lastName, name, email, phone, company, title }`
- **ContactDetail Module**: Must accept optional `tempContact` parameter to render temporary contacts
- **Retry Pattern**: Use retry loop after navigation to ensure ContactDetail module is ready before calling `show()`

## Account Detail back button handling
- Must check for `window._accountNavigationSource === 'calls'` and handle `window._callsReturn`
- Must dispatch `pc:calls-restore` event with complete state restoration
- Must clear navigation variables after successful navigation

## Contact Detail back button handling  
- Must check for `window._contactNavigationSource === 'calls'` and handle contact navigation
- Must clear navigation variables after successful navigation

## Page restore event handling
- Each page must listen for its restore event: `pc:calls-restore`, `pc:people-restore`, etc.
- Must restore: pagination, scroll position, filters, selections, search terms
- Must re-render the page with restored state

## Color consistency requirements
- **Base colors**: Use `var(--grey-400)` for contact names and company names (not `var(--text-primary)`)
- **Font weight**: Use `font-weight: 400` for consistency
- **Hover colors**: Use `var(--text-inverse)` for hover state
- **No underlines**: Never add text-decoration on hover

## Navigation timing and reliability
- **After page navigation**: Use `requestAnimationFrame()` followed by retry loop to ensure modules are ready
- **Retry pattern**: Try calling module functions for up to 2 seconds with 80ms intervals
- **ContactDetail timing**: `navigateToPage('people')` → `requestAnimationFrame()` → retry `ContactDetail.show()`
- **Module readiness**: Check `window.ContactDetail && typeof window.ContactDetail.show === 'function'`

## Navigation debugging
- Always add console.log statements for navigation events
- Log contact IDs, company names, and navigation source storage
- Log restore events and state restoration

## Debug Logging System (Temporarily Turn On)
**Status**: Debug logs are currently **TURNED OFF** for production use

### Quick Methods to Turn On Debug Logs:

#### Method 1: Browser Console (Fastest)
```javascript
// Turn ON debug logs
localStorage.setItem('pc-debug-logs', 'true');
// Refresh page, then logs will appear

// Turn OFF debug logs  
localStorage.removeItem('pc-debug-logs');
```

#### Method 2: Global Debug Flag
```javascript
// Turn ON debug logs
window.PC_DEBUG = true;
// Refresh page, then logs will appear

// Turn OFF debug logs
window.PC_DEBUG = false;
```

#### Method 3: Code Modification (Permanent)
- Open `scripts/pages/task-detail.js` around line 186
- Uncomment console.log statements as needed
- Save and refresh

### Debug Log Locations:
- **Task Detail Navigation**: `scripts/pages/task-detail.js` lines 186, 208, 210, 262, 267
- **Accounts State Capture**: `scripts/main.js` lines 3056, 3070, 3084, 3098
- **Accounts Restore**: `scripts/pages/accounts.js` lines 20, 32, 38, 52

### Debug Log Types:
- **Navigation Source Detection**: Shows what page user came from
- **State Capture**: Shows what data is being saved for restoration  
- **State Restoration**: Shows what data is being restored
- **Fallback Cases**: Shows when navigation falls back to default behavior

## Do not
- Do not use generic `window._navigationSource` - use specific patterns above
- Do not hardcode back button destinations
- Do not use `var(--text-primary)` for base colors - use `var(--grey-400)`
- Do not forget to clear navigation variables after use
- Do not skip restore event handling in page initialization