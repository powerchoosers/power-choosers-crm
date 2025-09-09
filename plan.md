# Power Choosers CRM - Development Plan

## Project Overview
Power Choosers CRM is a comprehensive customer relationship management system with integrated calling, email, and AI-powered analytics capabilities. The system is built with Node.js for the backend and modern web technologies for the frontend.

## System Architecture

### Backend (Node.js)
- **Server**: Express.js with custom routing
- **Port**: 3000 (configurable via environment variables)
- **Environment**: Supports development and production modes
- **API Base URL**: https://power-choosers-crm.vercel.app (production)

### Frontend
- **Main Entry Point**: crm-dashboard.html
- **Styling**: CSS with custom variables for theming
- **JavaScript**: Modular architecture with page-specific modules

## Gemini Email System

The Gemini Email System is an AI-powered email generation tool that creates personalized, context-aware emails based on recipient data and user prompts. It's integrated with the CRM's contact and account data to generate highly relevant email content.

### Key Features
- Generates both plain text and HTML emails
- Personalizes content based on recipient data (name, company, title, industry, etc.)
- Supports multiple email templates and scenarios
- Enforces consistent branding and tone
- Includes energy-specific content when applicable

### Email Types & Prompts

1. **Warm Intro After a Call**
   - References previous conversation naturally
   - Proposes specific next steps
   - Suggests two time windows for follow-up

2. **Follow-up with Tailored Value Propositions**
   - Assumes some time has passed since last contact
   - Highlights 1-2 benefits relevant to the recipient's industry/facility
   - Includes one brief proof point
   - Ends with a light call-to-action

3. **Schedule an Energy Health Check**
   - Explains what an Energy Health Check is
   - Tailors the message based on relationship stage (warm/cold)
   - Outlines what the review covers:
     - Current bill/supplier/rate review
     - Contract end date (Month YYYY)
     - Quick usage estimate
     - Energy Health Score
     - Projected costs comparison
     - Supplier BBB rating insight
     - Recommended next steps
   - Offers two specific time windows for follow-up

4. **Proposal Delivery with Next Steps**
   - Summarizes proposal options clearly
   - Provides selection guidance
   - Outlines 2-3 clear next steps
   - Includes a call-to-action to review/confirm

5. **Cold Email to Unreached Lead**
   - Uses a pattern-interrupt hook
   - References colleague connection if available
   - Focuses on one concrete pain point
   - Includes one clear call-to-action

6. **Standard Invoice Request**
   - Follows up on agreement to send invoice
   - Briefly includes energy contract details if available
   - Explains how the invoice will be used
   - Lists required information (ESIDs, Contract End Date, Service Address)
   - Includes a time-bound call-to-action

### Technical Implementation
- **Endpoint**: `/api/gemini-email`
- **Request Format**:
  ```json
  {
    "prompt": "string",
    "mode": "standard|html",
    "recipient": {
      "fullName": "string",
      "company": "string",
      "title": "string",
      "industry": "string",
      "email": "string",
      "energy": {
        "usage": "string",
        "supplier": "string",
        "contractEnd": "string",
        "currentRate": "string"
      },
      "notes": "string"
    },
    "to": "recipient@example.com"
  }
  ```
- **Required Environment Variable**: `GEMINI_API_KEY`
- **Response Format**: Generated email content in the requested format (plain text or HTML)

### Content Guidelines
- **Tone**: Professional, helpful, and concise
- **Length**: 70-110 words (2 short paragraphs + CTA)
- **Structure**:
  1. Personal greeting with time/season awareness
  2. Value proposition or context
  3. Clear call-to-action
- **Personalization**: Uses recipient data to tailor content
  - Includes time/season awareness (e.g., "great start to the week" on Monday)
  - References specific pain points relevant to the recipient's industry
  - Uses natural language for personalization (no handlebar placeholders)
- **Energy-Specific**: Includes relevant energy details when available
  - References supplier, contract end (month/year only), and usage profile
  - Avoids exact square footage, uses qualitative descriptions (e.g., "large facility")
  - Normalizes rate presentation (e.g., 0.089 → $0.089/kWh)

### Critical Validation Rules
- **Strict Duplication Check**: No sentence, phrase, or information can be repeated
- **Single Call-to-Action**: Each email must have exactly one clear CTA
- **Signature Format**: "Best regards," followed immediately by sender name on next line with no blank line
- **Date Handling**: Only use month and year (no specific days) for any date references
- **Personal Touch**: Must include time/season awareness in the greeting
- **No Placeholders**: All personalization must be natural language, no {{templates}}

### Technical Configuration
- **Model**: Gemini 1.5 Pro
- **Temperature**: 0.7 (balanced creativity and consistency)
- **Max Tokens**: 2048
- **Top-K**: 40
- **Top-P**: 0.9
- **Format**: Returns subject line followed by email body (plain text or HTML)

### Error Handling
- Validates required environment variables on startup
- Returns appropriate HTTP status codes for different error scenarios
- Includes detailed error messages for debugging
- Implements CORS for cross-origin requests

### Common Use Cases
- Initial outreach to new leads
- Follow-up after calls/meetings
- Energy health check scheduling
- Proposal delivery and next steps
- Invoice requests for energy analysis
- General business communications

### Integration Points
- **CRM Data**: Pulls contact and company information
- **Energy Data**: Utilizes energy usage and contract details
- **Activity History**: References previous interactions when available
- **Notes**: Incorporates relevant notes from the CRM

## API Integration Status

### Twilio Integration (Voice & SMS)
- **Status**: Implemented with native Twilio AI features
- **Features**:
  - Call recording and transcription
  - AI-powered call insights
  - SMS/MMS capabilities
  - Webhook support for call events
- **Required Environment Variables**:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`

### Email System (SendGrid)
- **Status**: Implemented with tracking
- **Features**:
  - Email composition and sending
  - Open/click tracking
  - Reply detection
  - Email templates
- **Required Environment Variables**:
  - `SENDGRID_API_KEY`

### Gemini AI Insights (Optional)
- **Status**: Twilio native transcription is primary; Gemini is optional for richer insights
- **Usage**: If set, Gemini generates enhanced summaries and insights from transcripts
- **Environment Variable**:
  - `GEMINI_API_KEY`

## Current Issues & Console Errors

### Authentication & Rate Limiting
1. **Gmail API Rate Limiting (429 Errors)**
   - **Issue**: Multiple 429 errors from Gmail API
   - **Affected Endpoints**: `/gmail/v1/users/me/messages/`
   - **Cause**: Exceeding Gmail API quota limits
   - **Recommended Action**:
     - Implement request batching
     - Add exponential backoff
     - Cache responses
     - Consider using Gmail API quota management

2. **Twilio Authentication**
   - **Issue**: Potential token refresh issues
   - **Affected Areas**: Call initialization
   - **Recommended Action**:
     - Verify token refresh implementation
     - Add error handling for auth failures

### Frontend Issues
1. **Missing Assets**
   - **Issue**: 404 errors for certain resources
   - **Recommended Action**:
     - Verify asset paths
     - Add error boundaries for missing assets

2. **WebSocket Connections**
   - **Issue**: Multiple connection attempts
   - **Recommended Action**:
     - Implement connection pooling
     - Add reconnection logic

## Development Priorities

### High Priority
1. **Fix Gmail API Rate Limiting**
   - Implement proper error handling
   - Add request queuing
   - Set up monitoring for API usage

2. **Authentication Flow**
   - Review and secure all auth endpoints
   - Implement proper session management
   - Add rate limiting for auth endpoints

3. **Error Handling**
   - Add comprehensive error boundaries
   - Improve error messages
   - Implement logging for client-side errors

### Medium Priority
1. **Performance Optimization**
   - Lazy load non-critical components
   - Optimize API calls
   - Implement caching where appropriate

2. **Testing**
   - Add unit tests for core functionality
   - Implement E2E tests for critical paths
   - Set up CI/CD pipeline

### Low Priority
1. **Documentation**
   - Update API documentation
   - Add inline code documentation
   - Create developer onboarding guide

2. **UI/UX Improvements**
   - Enhance loading states
   - Improve error messages
   - Add tooltips and help text

## API Endpoints

### Twilio Endpoints
- `/api/twilio/voice` - Handle incoming/outgoing calls
- `/api/twilio/recording` - Process call recordings
- `/api/twilio/ai-insights` - Generate call insights
- `/api/twilio/status` - Call status updates

### Email Endpoints
- `/api/email/send` - Send emails
- `/api/email/track` - Track email opens/clicks
- `/api/email/webhook` - Handle email events

### Utility Endpoints
- `/api/search` - Global search
- `/api/energy-news` - Fetch energy news
- `/api/process-call` - Process calls for AI insights

## Environment Variables

### Required for Development
```env
# Server
PORT=3000
NODE_ENV=development

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number

# SendGrid
SENDGRID_API_KEY=your_sendgrid_key

# Optional: Gemini AI for insights
GEMINI_API_KEY=your_gemini_api_key
```

## Running the Application

### Development
```bash
# Install dependencies
npm install

# Start development server
node server.js
```

### Production
```bash
# Set environment variables
export NODE_ENV=production
export PORT=3000
# ... other environment variables ...

# Start production server
node server.js
```

## Troubleshooting

### Common Issues
1. **API Rate Limiting**
   - Check console for 429 errors
   - Implement backoff strategy
   - Review API quotas

2. **Authentication Failures**
   - Verify API keys
   - Check token expiration
   - Review auth flow

3. **Missing Data**
   - Check network requests
   - Verify API responses
   - Review error logs

## Next Steps
1. Address high-priority issues
2. Implement monitoring
3. Set up automated testing
4. Plan next development sprint

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
  - Optional AI: `GEMINI_API_KEY` enables Gemini-based summaries/insights from Twilio transcripts.

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

## Twilio Voice Insights — Current State and Fixes (as of 2025-09-08)

__Overview__
- The CRM uses Twilio Programmable Voice for calling and Voice Insights (recording + post-call processing).
- The Calls page loads real data from `window.API_BASE_URL` (`/api/calls`) and plays audio via a local proxy endpoint.

## Twilio Webhook Configuration

### Key Fixes Implemented
- **Base URL Resolution**: All Twilio webhook callbacks now use `PUBLIC_BASE_URL` or fall back to the production domain to prevent 401 errors from Vercel preview domains.
- **Recording Proxy**: Added `/api/recording` endpoint to securely stream Twilio recordings to the browser.
- **Firebase Integration**: Call metadata, recordings, and transcripts are stored in Firestore for persistence.
- **Debug Endpoint**: Added `/api/debug/health` to verify environment variables and Firestore connectivity.

### Environment Variables (Vercel)
```
# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+18176630380
TWILIO_API_KEY_SID=your_api_key_sid
TWILIO_API_KEY_SECRET=your_api_key_secret
TWILIO_TWIML_APP_SID=your_twiml_app_sid

# Firebase (for call persistence)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Optional: Google/Gemini for fallback transcription
GEMINI_API_KEY=your-gemini-api-key

# Base URL (critical for webhooks)
PUBLIC_BASE_URL=https://power-choosers-crm.vercel.app
```

### Webhook Endpoints
- `POST /api/twilio/status` - Handles call status updates
- `POST /api/twilio/recording` - Processes call recordings and triggers transcription
- `POST /api/twilio/bridge` - Handles call bridging logic
- `GET /api/recording` - Proxies Twilio recording audio to the browser
- `GET /api/debug/health` - Debug endpoint to verify configuration

### Key Learnings
1. **Avoid Vercel Preview Domains**: Always use `PUBLIC_BASE_URL` or hardcoded production domain for Twilio webhooks to prevent 401 errors.
2. **Firebase Private Key**: Ensure proper newline escaping in environment variables (`\n` for Vercel).
3. **Recording Playback**: Use a server-side proxy to avoid CORS issues with Twilio's recording URLs.
4. **Webhook Logging**: Log all webhook requests to Firestore for debugging.
5. **Fallback Transcriptions**: Implement Google Speech-to-Text as a fallback when Twilio's native transcription fails.

### Testing & Debugging
1. **Test Call**: 
   ```bash
   curl -X GET "https://power-choosers-crm.vercel.app/api/debug/call?to=%2B15551234567&agent_phone=%2B15551234567"
   ```
2. **Check Logs**: Monitor Vercel function logs for errors.
3. **Verify Data**: Use the debug endpoint to check call data:
   ```
   GET /api/debug/health
   ```
4. **Troubleshooting**:
   - 401 Errors: Verify `PUBLIC_BASE_URL` is set and points to a public URL.
   - Missing Recordings: Check Twilio console for recording webhook delivery status.
   - No Transcripts: Verify `GEMINI_API_KEY` is set if using fallback transcription.

__Recording and Callbacks__
- We do NOT set a separate "Recording status callback" in Twilio Console. Instead, the callback is defined in TwiML:
  - `api/twilio/voice.js` and `api/twilio/bridge.js` set `record="record-from-answer"` and `recordingStatusCallback="<BASE>/api/twilio/recording"`.
- Console should be configured with:
  - Request URL: `https://power-choosers-crm.vercel.app/api/twilio/voice`
  - Status Callback URL: `https://power-choosers-crm.vercel.app/api/twilio/status`

__Local Server Proxy for Recordings__
- Added `GET /api/recording` in `server.js` that proxies Twilio audio using `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`.
- The Calls UI builds playback URLs as: `${API_BASE_URL}/api/recording?url=<encoded_twilio_mp3>`.

__Client API base__
- The Calls page only loads real data when `window.API_BASE_URL` is set in the browser:
  - Dev: `localStorage.setItem('API_BASE_URL', 'http://localhost:3000')`
  - Prod: `localStorage.setItem('API_BASE_URL', 'https://power-choosers-crm.vercel.app')`

__Firestore persistence (Calls)__
- Created `api/_firebase.js` to initialize Firebase Admin from env vars:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY` (with `\n` escapes)
- Updated `api/calls.js`:
  - `POST` upserts call docs in Firestore collection `calls` (and caches in-memory).
  - `GET` returns the latest 50 call docs from Firestore (fallback to in-memory if Firestore is not configured).
- The pipeline:
  - TwiML triggers recording → Twilio posts to `/api/twilio/recording` → we create/fetch transcript and AI insights → we `POST /api/calls` to persist → Calls page reads from `/api/calls`.

__Verification steps__
- Ensure browser has API base configured (see above) and reload CRM.
- Place a test call via the widget.
- Check logs on Vercel:
  - `[Status Callback] … completed`
  - `[Recording] Webhook received … RecordingStatus: completed`
  - `[Recording] Creating Twilio transcription …` then `Twilio AI processing completed`
- Firestore: new document appears in `calls/` with `id = CallSid`.
- CRM Calls → Insights:
  - Recording is playable.
  - Transcript appears after Twilio completes.
  - AI summary populated from `aiInsights.summary`.

__Local server notes__
- `server.js` now includes preflight and route handling for `/api/recording`.
- Local server still proxies `/api/calls` to production unless changed; persistence happens on Vercel API.

## CRM Calls — Attribution & Merge Plan (as of 2025-09-09)

__Objective__
- Ensure every call results in a single, correctly attributed row with recording and transcript attached to that same row. Avoid duplicates and wrong-company flips caused by shared numbers or late-arriving webhooks.

__Frontend changes__
- __Phone widget (`scripts/widgets/phone.js`)__
  - Capture Twilio `CallSid` on accept; use it for subsequent status updates (`connected`, `completed`).
  - Post final status BEFORE clearing context so account/contact attribution is included on the completion POST.
  - Send context on every POST: `accountId`, `accountName`, `contactId`, `contactName`, `source`, `targetPhone` (10-digit), `businessPhone` (E.164).
  - Business number is read from `window.CRM_BUSINESS_NUMBERS[0]` when available; falls back to default.
  - Exposes `window.Widgets.setCallContext(ctx)` to set attribution from any page prior to dialing.

- __Accounts and Account Detail pages__
  - `scripts/pages/accounts.js` and `scripts/pages/account-detail.js` set call context (account/contact) before calling `Widgets.callNumber()` so the initiated row is attributed correctly from the start.

- __Calls page (`scripts/pages/calls.js`)__
  - Prefer explicit stored attribution from API (`accountId/accountName`, `contactId/contactName`).
  - Fall back to phone-based heuristics only when explicit attribution is missing.
  - Optional debug: set `window.CRM_DEBUG_CALLS = true` to log per-row mapping sources and the chosen counterparty.

__Backend changes__
- __`api/calls.js` POST merge logic__
  - Early exact match by `twilioSid` (memory, then Firestore). If found, merge into that row.
  - Otherwise, compute counterparty using `targetPhone` when provided; else derive from `to/from` after excluding known business numbers.
  - Score recent candidates (last 5 minutes) by recency, missing recording, and matching `accountId/contactId`; always merge into the best candidate.
  - Persist context: `accountId`, `accountName`, `contactId`, `contactName`, `source`, `targetPhone`, `businessPhone`, and `twilioSid`.
  - Temporary verbose logs print request body, candidate scoring, merge target, and final UPSERT.

- __`api/calls.js` GET de-duplication__
  - Returns latest 50 calls (Firestore preferred, memory fallback) and de-duplicates by `twilioSid` (or `id`).
  - For duplicates, prefer: row with recording → longer duration → newest timestamp. Merge context fields across duplicates.

- __Recording webhook (`api/twilio/recording.js`)__
  - If `RecordingStatus=completed`, fetch recording (and URL) by `CallSid` when needed.
  - POST to `/api/calls` with `callSid`, `to`, `from`, `status='completed'`, `duration`, `recordingUrl`, plus `source='twilio-recording-webhook'`, `targetPhone`, and `businessPhone` to ensure the update merges to the initiated row.
  - Triggers transcription (Twilio native) and optional AI insights (Gemini fallback). When ready, POST transcript/insights to `/api/calls` for the same `callSid`.

__Configuration__
- __Environment__
  - `PUBLIC_BASE_URL` must be the externally reachable domain used by Twilio webhooks.
  - `BUSINESS_NUMBERS` or `TWILIO_BUSINESS_NUMBERS` should include all of your Twilio business numbers (comma-separated). Used to distinguish the counterparty vs your own line.

- __Client__
  - Define `window.CRM_BUSINESS_NUMBERS = ['+18176630380', '+19728342317']` (example) to help the UI ignore your own number when determining the counterparty and to populate `businessPhone` in calls posted by the widget.

__Validation checklist__
- __Outbound to a known contact__
  - One row appears immediately with correct contact/company from explicit context.
  - After hangup, the row updates to status `Connected` with the correct duration (no new 0s row).
  - Within ~30s, recording attaches to the same row; transcript and insights follow.

- __Outbound to an account with no selected contact__
  - One row appears with company populated and blank contact fields.
  - Recording attaches to the same row (no split into a second row).

- __Debugging (temporary)__
  - Backend logs show one `[Calls][POST]` chain merging into the same `id`/`twilioSid`.
  - Calls page console shows `[Calls][map]` indicating which mapping source was used.

__Cleanup (post-validation)__
- Remove or gate verbose merge logs in `api/calls.js` and recording logs in `api/twilio/recording.js` behind an env flag (e.g., `LOG_VERBOSE_CALLS`).
- Keep GET de-duplication and robust merge logic in place.
- Document `window.Widgets.setCallContext()` for all future call initiation points.

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