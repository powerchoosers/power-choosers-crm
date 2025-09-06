# CRM Redesign Plan

## Notes
- User wants a CRM similar to previous "Working Refactored" version, but improved, prettier, and more functional.
- Previous issues included poor planning, layout overrides, and inconsistent margins/padding.
- Top bar: logo left, title center, search/call center, right-side buttons (scripts, notifications, profile), same height as before.
- Left sidebar: same width as before, expands on hover, collapses otherwise.
- Main content area: 3:1 ratio with right widget bar, 1px divider, consistent 25px margin/padding outside containers.
- Widget bar: persistent on all pages except settings/account details, slightly darker background for two-tone effect.2
- Home page: stat cards, live electricity price widget (demo/API), suggested leads, recent activities, recent replies, all with consistent spacing.
- Main pages: dashboard/home, people (contacts), accounts, lists, calls, emails, sequences (with builder), deals, web insights, account details, settings, tasks.
- Scrolling: main content and widget bar should be independently scrollable with 25px margin at all edges.
- User is open to dashboard suggestions.
- Requirements and technical notes consolidated after reviewing previous project: focus on strategic component-based layout, strict 25px margin system, two-tone backgrounds, independent scrolling, and improved maintainability.
- Widget panel must include: Quick Actions (add contact, account, bulk CSV import), Today's Tasks, and Energy News (placeholder for now). Open to more widget suggestions except for Notes (handled elsewhere).
- Site color scheme: greys, lighter greys, darker greys. Buttons should be grey with 1px border. Company theme colors (orange, dark blue) should be present but extremely subtle, not loud.
- All main content on non-home pages must be inside containers with 1px border and 25px padding/margins on all sides. No scrolling on main content for these pages; only the widget panel scrolls. Homepage main content can scroll.
- Use a template for container-based pages to ensure consistent structure and spacing; recommend building the template first, then customizing per page.
- Add new pages: Deals (with individual deal pages) and Tasks (with individual task pages) to left panel/navigation.
- Use provided logo and favicon: https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png
- Main CRM HTML should be named crm-dashboard.html (not index.html) due to existing homepage.
- All containers and widgets must use the same consistent border-radius for rounded corners throughout the app.
- User wants NO white backgrounds: main content must be a light grey, widget panel a subtly darker grey (two-tone effect), and all elements must be updated to match this theme.
- Sidebar icons must be centered properly when sidebar is collapsed.
- User requested to revert all changes and restore the initial CRM version that was working, discarding recent grey theme and layout changes.
- User now requests ONLY a color revision: NO white backgrounds, keep structure unchanged, use greys close to the dark grey top bar/sidebar.
- All backgrounds and text colors are controlled by CSS variables in main.css; white backgrounds are set via --bg-main and --bg-card, with a few direct white values in badge/priority classes. Color revision can be done by updating these variables and values only, with no layout changes needed.
- User now requests overall aesthetic improvements: make borders more subtle and light grey (all borders 1px), darken main content a bit more but keep two-tone, ensure stat card text is white, add shadows for depth, and make any other visual improvements for a softer, more dynamic look—without changing the layout.
- User now requests to make the main content section background slightly lighter (soften contrast but keep two-tone), and to set all 1px borders/lines to a slightly darker grey so borders are less distracting.
- User now requests that inner tile elements (task-item, lead-item, activity-item, action-btn) be lighter than their parent containers; this is handled via a new --bg-item variable in CSS.
- Sidebar icons are now visually centered when collapsed, scrollbars only appear when expanded, and the "Lists" icon is slightly larger and nudged for perfect centering.
- Sequences sidebar icon updated to a right-facing triangle outline for better visual match per user request.
- Home page theme variables (greys, two-tone, borders, etc.) are now the global rule for all container-based pages; no page-specific color overrides allowed.
- The actual CRM workspace is c:/Users/johncobb/Documents/Power Choosers CRM/; all People and Lists page work will be done here.
- Shadows/elevation system is now set via CSS variables (e.g., --elevation-card, --elevation-page) so all containers/cards/pages inherit homepage shadow style automatically.
- User wants codebase modularized: separate JS for People, Firebase initialization in its own file, and Call Scripts as a separate module (not included with People).
- Modularization will improve maintainability and scalability of the CRM.
- Firebase will be used for data storage and authentication.
- Call Scripts will be separated from People module to allow for easier updates and maintenance.
- People table now features vertical column dividers, rounded corners, row selection with checkboxes, and a select-all checkbox in the header per user request.
- People table now supports client-side pagination (50 rows per page) with page-turning buttons at the bottom.
- People table pagination bar is now always rendered, even for a single page, per user request.
- People table pagination/footer is now pinned to the bottom of its container with a consistent 25px margin, per user request.
- List Detail (Lists → List view) pagination/footer is pinned to the bottom, with the scroll area padded to maintain a consistent 25px visual gap above the footer. Implemented via CSS: `#lists-page #lists-detail .table-scroll { padding-bottom: 25px; }`.
- People table should render all cell contents on a single line (no wrapping), show "N/A" for invalid dates/timestamps, and allow horizontal scrolling for wide tables.
- People table now supports Apollo-style bulk selection: when the select-all checkbox is checked, a modal popover appears below the header to choose how many contacts to select (custom number, this page, or all). After selection, a bulk actions modal/bar appears with options (Email, Sequence, Call, Add to list, Export, Research with AI, Delete), matching Apollo's UX flow.
- Bulk actions bar now includes white vector icons for each option, matching CRM theme and improving usability.
- User requested: Bulk action Email and Sequence icons must match left sidebar exactly; Add to list icon lines should be larger to fill container; AI icon should be larger and better centered in its box.
- Bulk select popover is now dynamically positioned under the select-all checkbox, with accessibility improvements and proper event listener cleanup when closed.
- Accounts table now implements Apollo-style quick actions (call, add to list, AI, LinkedIn, website) and bulk actions modal/bar with all requested icons and dynamic selection, matching People table UX.
- Accounts page and table IDs in HTML and JS are already consistent (e.g., #accounts-page, #accounts-table, #accounts-pagination).
- Table/footer structure and CSS for Accounts page already use flex/pinned footer, horizontal scrolling, and correct container separation.
- People and Accounts tables now use a .table-scroll wrapper so only the table area scrolls horizontally and the footer remains fixed, improving UX for wide tables.
- Added note and task for .table-scroll wrapper and fixed footer implementation for People and Accounts tables.
- User now requests a complete revert and restart of the Lists page: remove all previous lists.js logic and UI, and begin with a fresh Lists overview page that toggles between People and Company lists, showing an empty state with a prompt to create a new list if none exist.
- This implementation is now deprecated per user request; all Lists page logic/UI is to be removed and replaced with a new overview/empty state as described above.
- Lists page empty state must be centered in its container with padding so the border does not touch the screen edges.
- Lists toggle must be a single button: "Switch to company lists" or "Switch to people lists" depending on current view.
- The last selected list kind should persist as the default until toggled again.
- When user clicks "Create List" (top right), show a modal just below the button with an input for list name and a dropdown to select People or Accounts.
- When user clicks the centered "Create List" button in the empty state, the modal should appear centered within the empty state container, not below the top right button.
- People page Name filter now uses a tokenized chip input with suggestions, chips, and dark theme styles, matching CRM UI/UX requirements.
- People page Job title, Company, and Email filters now use tokenized chip inputs with suggestions and chips, matching Name filter behavior and CRM UI/UX requirements.
- People page Name and Email filters have been removed. Chip-token filters for Job Title, City, State, Company, Employees, Industry, and Website Visitors (domain) are now used. Each supports multi-value chips and suggestions while typing. Visitor-domain filter is a placeholder until Web Insights integration.
- People page filter changes: removal of Name/Email, addition of chip-token filters for new fields, and multi-value/suggestion support.
- Debugging focus: Investigate and resolve issues with People page filtering and bulk selection (chip/token filters, bulk selection, pagination).
- Noted ReferenceError on buildTitleSuggestionPool in people.js; patched loadDataOnce to guard calls to suggestion pool builder functions to prevent runtime errors if not hoisted/available.
- People page element queries are now properly scoped to avoid duplicate IDs, and employees chip rendering is normalized.

## Task List
- [x] Define and document core layout components (top bar, sidebar, main/widget sections)
- [x] Establish global style guide (colors, fonts, margins, two-tone backgrounds)
- [x] Create reusable container and widget components with 25px margin system
- [x] Plan navigation structure and routing for all required pages
- [x] Home/dashboard: design stat cards, live price widget, leads, activities, replies
- [x] Sidebar: implement expand/collapse on hover
- [x] Top bar: implement all specified elements and interactions
- [x] Widget bar: ensure persistent, scrollable, two-tone design
- [x] Plan and scaffold all main pages (dashboard, contacts, accounts, etc.)
- [x] Suggest and review additional dashboard widgets/features
- [x] Add and design Deals page (with individual deal pages)
- [x] Add and design Tasks page (with individual task pages)
- [x] Create template for container-based pages with 1px border and strict 25px padding/margins
- [x] Update CSS to implement two-tone grey theme and fix sidebar icon centering
- [x] Revise only the color scheme (no structure/layout changes, no white backgrounds, use dark greys throughout)
- [x] Improve overall dashboard aesthetic: subtle 1px light grey borders, slightly darker main content, stat card text white, add shadows, and enhance visual appeal while maintaining current layout.
- [x] Fine-tune main content background to be slightly lighter and adjust all 1px borders to a slightly darker grey for less distraction.
- [x] Make inner tile elements lighter than their parent containers using a new --bg-item variable in CSS.
- [x] Modularize People page: create people.js, add filter UI, and connect to Firebase via firebase.js
- [x] Add CSS for People page toolbar and filter panel using theme variables
- [x] Implement People table UI upgrades: vertical dividers, rounded corners, row selection with checkboxes, select-all support
- [x] Add client-side pagination (50 rows per page) to People table
- [x] Implement Apollo-style bulk selection popover for People table
- [x] Implement Apollo-style bulk actions modal/bar for People table
  - [x] Refine bulk action icons to match sidebar for Email/Sequence, enlarge Add to list lines, and enlarge/center AI icon as requested
- [x] Implement tokenized chip-inputs with suggestions for Job title, Company, and Email filters on People page
- [x] Implement Apollo-style quick actions and bulk actions modal/bar for Accounts table with all requested icons and dynamic selection
- [x] Modularize Accounts JS
- [x] Improve table scroll UX by adding .table-scroll wrapper so only the table scrolls horizontally and the footer stays fixed
- [x] Implement .table-scroll wrapper and fixed footer for People table
- [x] Modularize remaining page JS, keep call scripts separate
- [ ] Remove previous Lists page implementation (lists.js, filters, table, pagination, selection UI)
- [ ] Implement new Lists overview page: toggle between People lists and Company lists, display empty state with prompt to create new list if none exist
- [ ] Implement empty state and create-list prompt for both People and Company lists
- [ ] Refactor Lists page toggle to a single switch button with persistent selection
- [ ] Center and pad the empty state container so the border never touches the screen edge
- [ ] Implement "Create List" modal with input and dropdown (appears below button or centered in empty state)

## Firebase Data Structure

### Firebase Configuration
- **Project ID**: `power-choosers-crm`
- **API Key**: `AIzaSyBKg28LJZgyI3J--I8mnQXOLGN5351tfaE`
- **Database**: Firestore (using compat SDK)

### Contacts Collection (`contacts`)
**Core Identity Fields:**
- `firstName` - Contact's first name
- `lastName` - Contact's last name  
- `name` - Full name (fallback/computed field)
- `email` - Primary email address
- `phone` - Primary phone number
- `mobile` - Mobile phone number

**Professional Information:**
- `title` - Job title/position
- `companyName` - Company name
- `accountName` - Associated account name (for linking)
- `industry` - Industry classification
- `companyIndustry` - Company's industry (fallback)

**Location Data:**
- `city` - City
- `locationCity` - City (alternate field name)
- `state` - State/region
- `locationState` - State (alternate field name)

**Company Size/Metrics:**
- `employees` - Number of employees
- `accountEmployees` - Employee count from linked account

**Web Analytics:**
- `visitorDomain` - Website visitor domain tracking (placeholder for Web Insights integration)

**Timestamps:**
- `createdAt` - Record creation timestamp
- `updatedAt` - Last modification timestamp

### Accounts Collection (`accounts`)
**Core Company Information:**
- `accountName` - Primary account/company name
- `name` - Company name (alternate field)
- `companyName` - Company name (alternate field)
- `industry` - Industry classification
- `domain` - Primary domain
- `website` - Company website URL
- `site` - Website (alternate field)

**Contact Information:**
- `phone` - Primary phone number
- `primaryPhone` - Primary phone (alternate field)
- `mainPhone` - Main phone (alternate field)

**Location Data:**
- `city` - City location
- `locationCity` - City (alternate field)
- `town` - Town (alternate field)
- `state` - State/region
- `locationState` - State (alternate field)
- `region` - Region (alternate field)

**Business Metrics:**
- `employees` - Number of employees
- `employeeCount` - Employee count (alternate field)
- `numEmployees` - Employee count (alternate field)
- `squareFootage` - Office square footage
- `sqft` - Square footage (alternate field)
- `square_feet` - Square footage (alternate field)
- `occupancyPct` - Occupancy percentage
- `occupancy` - Occupancy (alternate field)
- `occupancy_percentage` - Occupancy percentage (alternate field)

**Contract Information:**
- `contractEndDate` - Contract end date
- `contractEnd` - Contract end (alternate field)
- `contract_end_date` - Contract end date (alternate field)
- `electricitySupplier` - Current electricity supplier/provider
- `benefits` - Contract benefits and advantages
- `painPoints` - Contract pain points and issues

**Energy Usage:**
- `annualKilowattUsage` - Annual kilowatt usage (kWh)
- `annualUsage` - Annual usage (alternate field)
- `kilowattUsage` - Kilowatt usage (alternate field)

**Social/Web Presence:**
- `linkedin` - LinkedIn URL
- `linkedinUrl` - LinkedIn URL (alternate field)
- `linkedin_url` - LinkedIn URL (alternate field)

**Timestamps:**
- `createdAt` - Record creation timestamp
- `updatedAt` - Last modification timestamp

### Data Loading Strategy
- **Contacts**: Loads first 200 records from `contacts` collection
- **Accounts**: Loads all records from `accounts` collection for cross-referencing
- **Client-side filtering**: All filtering and pagination handled in browser
- **Data enrichment**: Contact records are enriched with account data when `accountName` matches

### Field Mapping & Fallbacks
 The system uses multiple field name variations to handle data inconsistencies:
 - Names: `accountName` → `name` → `companyName`
 - Phones: `phone` → `primaryPhone` → `mainPhone`
 - Locations: `city` → `locationCity` → `town`
 - Employee counts: `employees` → `employeeCount` → `numEmployees`
 - Contract dates:  - `contractEndDate` → `contractEnd` → `contract_end_date`

## Google APIs — Gmail + Discovery (as of 2025-08-22)

* __Project ID__: `power-choosers-crm-468420`
* __OAuth 2.0 Client ID__: `448802258090-re0u5rtja879t4tkej22rnedmo1jt3lp.apps.googleusercontent.com`
* __API Discovery Key__: `AIzaSyDwrD5n-_1jNzw6Qsj2q8xFUWT3gaMs4Xk`
* __Discovery Doc__: `https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest`
* __Scopes__: `https://www.googleapis.com/auth/gmail.readonly`

* __Authorized JavaScript origins (OAuth)__
  - `https://powerchoosers.com`
  - `https://powerchoosers.github.io`
  - `http://localhost:3000`
  - `https://power-choosers-crm.vercel.app`
  - Note: Origins must be exact (no trailing slash, no wildcards).

* __API Key restrictions (recommended)__
  - Application restrictions: Websites (HTTP referrers)
    - `https://power-choosers-crm.vercel.app/*`
    - `https://powerchoosers.com/*`
    - `https://powerchoosers.github.io/*`
    - `http://localhost:3000/*`
  - API restrictions: allow
    - Gmail API
    - Google API Discovery Service

* __Code references__
  - `scripts/pages/emails.js` uses `CLIENT_ID` and `API_KEY` above for `gapi.client.init()` and Gmail calls.
  - No redirect URIs are required for the current popup flow.

* __Test flow__
  1) Deploy to the target origin (e.g., Vercel).
  2) Open Emails page → “Try Sign In”.
  3) If errors occur, check browser console for origin/referrer messages and adjust OAuth origins or API key referrers accordingly.

## Telephony & Phone Dialer — Current State (as of 2025-08-19)

* __Overview__
  - Backend server: `server.js` (Node HTTP) on port `3000`.
  - Webhooks/public URL: `PUBLIC_BASE_URL` = `https://powerchoosers.com` (set in `server.js`).
  - Vonage App ID: `5b7c6b93-35aa-43d7-8223-53163f1e00c6`.
  - Numbers: `VONAGE_NUMBER` = `+14693518845`, `AGENT_NUMBER` = `+19728342317`.
  - Recording enabled by default (`RECORD_ENABLED=true`, split `conversation`, format `mp3`).
  - Optional AI: `GOOGLE_API_KEY` enables Gemini transcript/summary when a recording is available.

* __Key Files__
  - Backend: `server.js` (routes, call flow, webhooks, CORS).
  - Frontend widget: `scripts/widgets/phone.js` (dialer UI + browser calling).
  - Dashboard shell: `crm-dashboard.html` (loads SDKs, sets `window.API_BASE_URL`).

* __Current Call Flow (Agent-first)__
  - Client initiates server call via `POST /api/vonage/call` with `{ to: "+E164" }`.
  - Server dials `AGENT_NUMBER` first. `answer_url` is `https://powerchoosers.com/webhooks/answer?dst=<E164>` so when the agent answers, the NCCO connects the destination.
  - `handleWebhookAnswer()` builds NCCO `[record?, connect]`. If `dst` is missing/invalid, it falls back to connecting the agent.
  - Events (`/webhooks/event`) and recordings (`/webhooks/recording`) are accepted and stored in-memory (`CALL_STORE`). Recording webhook optionally triggers Gemini processing.

* __Normalization Rules__
  - Frontend `normalizeDialedNumber()` and backend `normalizeE164()` accept digits, `+`, `*`, `#`, and letters (letters map via T9 to digits) and normalize to E.164.
  - US defaults: 10 digits -> `+1##########`; 11 digits starting with `1` -> `+###########`.

* __Endpoints & Methods__
  - `GET|POST /api/vonage/jwt?user=agent` → Client SDK JWT for browser.
  - `GET|POST /api/vonage/ensure_user?user=agent` → idempotent create of SDK user in Vonage.
  - `POST /api/vonage/call` → Places an outbound agent-first call. Returns 405 if not POST.
  - `GET /webhooks/answer?dst=+E164` → Returns NCCO JSON.
  - `POST /webhooks/event` → Accepts call lifecycle events; returns `{ ok: true }`.
  - `POST /webhooks/recording` → Accepts recording events; triggers optional AI; returns `{ ok: true }`.
  - `GET /api/calls` → Recent calls summary from `CALL_STORE`.
  - `GET /api/calls_full` → Recent calls + last events for diagnostics.
  - `GET /api/recording?url=<recording_url>` → Authenticated proxy fetch of Vonage recording via app JWT.

* __Browser Dialer Widget (`scripts/widgets/phone.js`)__
  - Input + dialpad UI with Call, Backspace, Clear.
  - T9 hint UI removed (no extra text under the input).
  - Keyboard support: digits `0-9`, `*`, `#`, letters map via T9; Enter places a call; Backspace deletes.
  - Paste support: Ctrl/Cmd+V into input or card; letters in pasted text are mapped via T9; `+` allowed once at the front.
  - On Call: tries Vonage Client SDK browser call (`app.callPhone`). On error, falls back to server PSTN call via `POST /api/vonage/call`.
  - Session: `RTC.ensureSession()` fetches JWT from `/api/vonage/jwt?user=agent` and creates a Client SDK session.

* __Frontend Config__
  - `window.API_BASE_URL` is read in the browser. Set via localStorage for dev/prod:
    - Dev: `localStorage.setItem('API_BASE_URL', 'http://localhost:3000')`.
    - Prod: `localStorage.setItem('API_BASE_URL', 'https://powerchoosers.com')`.
  - Page must be a secure origin for microphone access (HTTPS or `http://localhost`). Check `window.isSecureContext` and `navigator.permissions.query({ name: 'microphone' })`.

* __Testing Cheatsheet__
  - Start server: `node server.js` (runs on `http://localhost:3000`). Ensure `private.key` exists and matches the Vonage app.
  - Webhooks: open `https://powerchoosers.com/webhooks/answer?dst=+19202683260` to see NCCO; POST any JSON to `https://powerchoosers.com/webhooks/event` to get `{ ok: true }`.
  - API: `curl -X POST http://localhost:3000/api/vonage/call -H 'Content-Type: application/json' -d '{"to":"+19202683260"}'`.
  - Diagnostics: `GET /api/calls_full` to view recent event flow.

* __Common Pitfalls__
  - 405 on `/api/vonage/call`: this route is POST-only; browser GETs (e.g., visiting the URL) will return 405.
  - Microphone not prompting: ensure HTTPS (or localhost), and the site has mic permission. IDE previews on non-secure hosts will fail.
  - `PUBLIC_BASE_URL` mismatch: Vonage must be configured to use `https://powerchoosers.com/*` for webhooks; the server uses this base to generate `answer_url`/`event_url`.

* __Next Steps (suggested)__
  - Optional per-call strategy toggle (agent-first vs destination-first) via a parameter on `/api/vonage/call`.
  - Display live call state in the widget (ringing/answered/timer) and add hangup UI for PSTN fallback.
  - Inbound call routing UI/logic to surface calls in the widget.
  - Persist calls to a database instead of the in-memory `CALL_STORE`.

## Current Goal
  Debug People page filtering and bulk selection

## Page Switching Pattern (How navigation works and how to add new pages)

The app uses simple DOM-based navigation controlled by `scripts/main.js`.

- **Nav items**: Sidebar links have the `.nav-item` class and a `data-page` attribute, e.g. `<a class="nav-item" data-page="people">…</a>`.
- **Page containers**: Each page is a `.page` element whose `id` follows the pattern `{pageName}-page` and is listed in the DOM (see `crm-dashboard.html`). Example: `id="people-page"` with `data-page="people"` is not required on the container but used on the nav item.
- **Activation**: `PowerChoosersCRM.navigateToPage(pageName)` toggles the `.active` class on the matching `.nav-item` and `.page` elements. Only the active page is visible.
- **Rebinding hooks**: On navigation, `main.js` optionally calls `window.peopleModule.rebindDynamic()` or `init()` for People and Accounts pages to ensure dynamic event bindings are active when entering those pages.
- **Utilities**: `window.crm.showToast(message)` provides a simple toast. `window.crm.showModal(type)` is a placeholder for future modals.

How to add a new page (e.g., Contact Details or Lists variant):

1. **Add markup in `crm-dashboard.html`:**
   - Create a container: `<div class="page" id="contact-details-page" data-page="contact-details">…</div>`.
   - Follow the existing structure inside: `.page-container` → `.page-header` (with `.page-title-section` and optional `.page-actions`) → `.page-content`.
2. **Add a sidebar nav item:**
   - `<a class="nav-item" data-page="contact-details">Contact Details</a>`.
3. **Integrate script (optional):**
   - If the page needs JS, create `scripts/pages/contact-details.js` and load it in the HTML. Expose an API as needed via `window.ContactDetails` or similar.
4. **Navigate programmatically (optional):**
   - Use `window.crm.navigateToPage('contact-details')` to switch pages from code (e.g., after clicking into a row).
5. **Show/hide header actions:**
   - Use page-specific JS (like `scripts/pages/lists.js` `updateHeaderForMode()`) to toggle header buttons based on mode or context.

Notes for Lists page duplication:

- Keep `.page-title` and `.page-actions` consistent with other pages.
- Use `window.ListsView.open({ id, name, kind })` to enter list detail. Header actions like `#add-contact-btn` are shown only in detail mode for People lists.co