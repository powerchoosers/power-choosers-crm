
### Industry Filtering & Logistics Migration
- **Status**: Completed
- **Description**: Migrated logistics and warehouse industries into a dedicated high-level filter vector for enhanced forensic search.
- **Actions**:
  - [x] **Industry Vector Expansion**: Created a dedicated `Logistics & Warehouse` vector in `industry-mapping.ts`.
  - [x] **Mapping Consolidation**: Pulled logistics-related sub-industries (Cross-border, 3PL, Transportation, Warehousing) out of the generic `Services` vector and grouped them.
  - [x] **Keyword Audit**: Included additional high-impact keywords like `distribution` and `supply chain` to capture missing records identified in Supabase.
  - [x] **UI Integration**: Verified that `FilterCommandDeck.tsx` dynamically picks up the new vector, providing a dedicated filter button across all network pages.
  - [x] **Data Ingestion Parity**: Confirmed `BulkImportModal.tsx` supports the industry field mapping for future logistics data ingestion.

### Bulk Import Description & Mapping Caching
- **Status**: Completed
- **Description**: Enhanced the Bulk Import system with company description mapping and persistent field mapping caching.
- **Actions**:
  - [x] **Description Mapping**: 
    - [x] Added `description` field to `ACCOUNT_FIELDS` schema in `BulkImportModal.tsx`.
    - [x] Labeled as "Forensic Log / Description" to align with the `FORENSIC_LOG_STREAM` component on Account Dossier pages.
    - [x] Updated ingestion logic to map CSV columns to the `description` field for Account vectors.
  - [x] **Persistent Mapping Caching**:
    - [x] Implemented `localStorage`-based caching for CSV field mappings.
    - [x] Unique cache keys for `CONTACTS` and `ACCOUNTS` import vectors to prevent mapping collisions.
    - [x] Automated mapping recovery: Loads previously saved mappings when a new CSV is uploaded.
    - [x] Real-time updates: Saves mapping changes immediately as the user calibrates fields.
    - [x] Prioritizes user-defined cached mappings over automated field detection.

### Sitewide Layout Consistency
- **Status**: Completed
- **Description**: Standardized the layout across all pages by resolving uneven padding issues caused by scrollbar reservation.
- **Actions**:
  - [x] **Scrollbar Refinement**: 
    - [x] Removed `scrollbar-gutter: stable` from the `np-scroll` class in `globals.css` to eliminate the phantom right padding.
    - [x] Implemented hidden scrollbars while maintaining full scrolling functionality using `scrollbar-width: none` and `display: none`.
  - [x] **Layout Balancing**: Verified that the main content container is perfectly centered and balanced across all forensic dashboard views.
  - [x] **Consistency**: Applied the fix globally via the shared `np-scroll` utility class used in `layout.tsx`.

### Bulk Selection & Tactical Actions
- **Status**: Completed
- **Description**: Implemented a "Ghost Protocol" bulk selection system with a levitating command deck for tactical operations on People and Accounts pages.
- **Actions**:
  - [x] **Ghost Selection Logic**:
    - [x] Implemented row numbers that fade out on hover/selection in the People and Accounts tables.
    - [x] Created "Ghost Checkboxes" (glass style) that appear on hover and lock in when selected.
    - [x] Applied International Klein Blue (#002FA7) highlight and background to selected rows.
    - [x] Refined "Select All" toggle in table headers to explicitly target the **Whole Page** (50 nodes) using `getToggleAllPageRowsSelectedHandler`.
  - [x] **Levitating Command Deck**:
    - [x] Built `BulkActionDeck.tsx` component that levitates from the bottom when nodes are selected.
    - [x] Integrated real-time node counter (`[ X NODES SELECTED ]`) with one-line layout.
    - [x] Added click-to-edit count functionality for custom selection amounts.
    - [x] Standardized typography: Changed counter and AI (Enrich) icon colors to white.
    - [x] Refined counter interaction: Added `framer-motion` scale animation (zoom-in) and maintained white color on hover to signify clickability.
    - [x] Synced Icons: Updated `ADD_TO_TARGET` to use the `Radar` icon and `INITIATE_PROTOCOL` to use the `GitMerge` icon to match the sidebar.
    - [x] Added tactical action buttons: `ADD_TO_TARGET`, `INITIATE_PROTOCOL` (Play), and `ENRICH_DATA` (Sparkles).
    - [x] Implemented a distinct "Nuclear Option" (Trash icon) with red glow hover state.
  - [x] **Lazy Loading Selection**:
    - [x] Implemented logic to automatically fetch missing records when a custom count exceeds currently loaded data.
    - [x] Added "Execute-time" lazy loading to ensure all selected nodes are loaded before bulk actions are processed.
  - [x] **Nuclear Protocol (Purge)**:
    - [x] Built `DestructModal.tsx` for high-stakes deletion confirmation.
    - [x] Implemented a "Hold to Execute" mechanism requiring a 1.5-second hold to authorize the purge, preventing accidental deletions.
    - [x] Applied forensic "Obsidian" styling to the destruction interface.
  - [x] **Integration**: Fully integrated the selection system into `PeoplePage` and `AccountsPage` with TanStack Table state synchronization.

### Target Array Detail & List Filtering
- **Status**: Completed
- **Description**: Implemented dedicated detail views for target lists with automated filtering for People and Accounts.
- **Actions**:
  - [x] **Data Layer Enhancement**: 
    - [x] Modified `useContacts.ts` and `useAccounts.ts` to support optional `listId` filtering using a two-step `list_members` lookup (resolving polymorphic join limitations).
    - [x] Added `useTarget(id)` hook to `useTargets.ts` for single-list intelligence fetching.
  - [x] **Target Detail View**:
    - [x] Created `src/app/network/targets/[id]/page.tsx` with robust conditional rendering for `Human_Intel` (People) and `Asset_Intel` (Accounts).
    - [x] Optimized query execution to prevent invalid requests before target metadata is resolved.
    - [x] Integrated `ForensicTableSkeleton` and `FilterCommandDeck` for consistent UX.
    - [x] Implemented standardized `Sync_Block` footer and navigation controls.
  - [x] **UI/UX Refinement**:
    - [x] Applied `font-mono tabular-nums` to all ID and count fields.
    - [x] Integrated `ClickToCallButton` and action menus within list rows.
    - [x] Verified navigation flow from main Targets grid to specific list sectors.

### Call Data & Schema Migration
- **Status**: Completed
- **Description**: Synchronized call data fetching with the new snake_case Supabase schema and resolved search-related join errors.
- **Actions**:
  - [x] **Schema Sync**: Updated `useCalls.ts` and `useContactCalls` hooks to use snake_case columns (`contact_id`, `owner_id`, `ai_summary`, etc.) matching the production database.
  - [x] **Search Fix**: Resolved "Search calls error: {}" by switching to direct `owner_id` filtering on the `calls` table and removing strict inner join requirements in `GlobalSearch`.
  - [x] **Error Handling**: Enhanced logging in search hooks to capture structured Supabase error details (message, hint, code) for faster debugging.
  - [x] **Reliability**: Updated `useCallsCount` and infinite query hooks to ensure data consistency across the platform.

### Dossier Intelligence & Call Insights
- **Status**: Completed
- **Description**: Replaced legacy Bill History with real-time Call Insights and refined the Dossier header with Forensic Log and Context Lock controls.
- **Actions**:
  - [x] **Bill History Removal**: Removed the static/placeholder Bill History section from `ContactDossierPage`.
  - [x] **Call Integration**: Implemented `useContactCalls` hook to fetch real-time call logs from Supabase.
  - [x] **Forensic Log**: Added a "Forensic Log" (History) button to the header linked to the Gemini neural history.
  - [x] **Context Lock**: Implemented a "Context Lock" chip in the header for visual verification of target entity focus.
  - [x] **AI Summaries**: Integrated AI-generated call summaries and voice data insights into the dossier view.
  - [x] **Nodal Aesthetic**: Applied build.md design principles (Monolith borders, International Klein Blue accents, Monospaced data).
  - [x] **Gemini Chat Enhancement**: Converted "Reset Session" to "Add Chat" (+) button with global state synchronization and added access to History and New Chat in both chat header and TopBar.

### Editable Fields & UI Standardization
- **Status**: Completed
- **Description**: Implemented interactive editable fields on Dossier pages and standardized identity iconography across the platform.
- **Actions**:
  - [x] **Editable Dossier Fields**:
    - [x] Added padlock-triggered editing for Logo URL, Website, and LinkedIn fields on Account and Contact Dossiers.
    - [x] Implemented "Obsidian & Glass" slide-open input containers with Framer Motion animations.
    - [x] Integrated CRM persistence via Supabase mutations (`useUpdateAccount`, `useUpdateContact`).
  - [x] **Icon Standardization**:
    - [x] Standardized all contact letter glyphs and company icons to `rounded-2xl` (Squircle) across Accounts, People, Target ID, and Global Search pages.
    - [x] **Hardcoded Consistency**: Removed `variant` prop from `CompanyIcon` and `ContactAvatar` components, hardcoding `rounded-2xl` to prevent accidental circle overrides.
    - [x] **Deep Audit**: Identified and replaced hardcoded `rounded-full` instances with `rounded-2xl` in `GeminiChat`, `EmailList`, `SatelliteUplink`, `BulkImportModal`, `OrgIntelligence`, `DataIngestionCard`, `TaskManagement`, and all Dossier empty/error states.
    - [x] Preserved `rounded-full` ONLY for decorative status indicators, signal dots, and pulsing animations per forensic aesthetic requirements.

### Infrastructure Map Migration & Real-Time Grid
- **Status**: Completed
- **Description**: Migrated the Infrastructure Map from mock data to real-time Supabase contacts and implemented dynamic risk visualization based on ERCOT market data.
- **Actions**:
  - [x] **Real-Time Data Layer**:
    - [x] Replaced mock `MOCK_NODES` with live Supabase contact fetching (`useContacts` logic).
    - [x] Implemented **Active Load Filtering**: Configured map to strictly display only contacts with associated `ACTIVE_LOAD` accounts (current clients).
    - [x] Added inner join logic on `accounts` table to enforce status filtering.
  - [x] **ERCOT Market Integration**:
    - [x] Implemented `mapLocationToZone` utility to resolve contacts to ERCOT Load Zones (Houston, North, South, West) based on city/address.
    - [x] **Expanded City Mapping**: Added comprehensive Texas city arrays (including Deer Park, Katy, Sugar Land, etc.) to `market-mapping.ts` to ensure accurate zone resolution for smaller municipalities.
    - [x] Connected to `/api/market/ercot` endpoint for 60-second real-time pricing updates.
  - [x] **Dynamic Visualization**:
    - [x] Implemented price-based risk coloring (Green < $50, Yellow $50-$100, Red > $100).
    - [x] Added geocoding fallback (city-based jitter) for contacts missing precise lat/lng coordinates.
    - [x] Standardized map container with "Obsidian & Glass" aesthetic, fixed height, and Sync_Block footer.
  - [x] **Bug Fixes**:
    - [x] **Build Error**: Fixed TypeScript implicit `any` error in the contact ID hashing function (`InfrastructureMap.tsx`).
    - [x] **Import Error**: Corrected `useAuth` import path to `@/context/AuthContext`.
    - [x] **Animation**: Added missing `animate-progress` keyframes to `tailwind.config.ts`.

### Org Intelligence & Account Enrichment
- **Status**: Completed
- **Description**: Enhanced the Organizational Intelligence widget with account enrichment capabilities and resolved critical fetch and type errors.
- **Actions**:
  - [x] **UI Optimization**:
    - [x] Relocated the **Enrich** button to the right of the **Search Decision Makers** input field for optimal access during lead filtering.
    - [x] Applied squircle styling (`rounded-lg`) and Sparkles icon to the enrichment trigger.
  - [x] **Bug Fixes**:
    - [x] **TypeScript Error**: Resolved a type mismatch in `OrgIntelligence.tsx` where `scanStatus` was being compared to incompatible states.
    - [x] **Apollo Fetch Error**: Fixed a route mismatch in `server.js` that caused `/api/apollo/search-people` calls to fail.
    - [x] **Search Optimization**: Fixed 0 results issue for specific companies by switching from strict `q_keywords` to `person_titles` filtering and preventing guessed domains from polluting search parameters.

### Neural Scan & AI Script Generation
- **Status**: Completed
- **Description**: Fixed critical AI generation failures (400 errors) and implemented a robust fallback system with Gemini 2.5 Flash-Lite.
- **Actions**:
  - [x] **400 Error Resolution**:
    - [x] Fixed a ReferenceError in `chat.js` where `prompt` was incorrectly scoped in the OpenRouter handler.
    - [x] Corrected routing logic in `chat.js` to recognize `meta-llama/` and `mistralai/` prefixes for OpenRouter.
    - [x] Enforced structured JSON output by adding `response_format` (OpenRouter) and `responseMimeType` (Gemini) headers.
  - [x] **Gemini 2.5 Flash-Lite Integration**:
    - [x] Integrated **Gemini 2.5 Flash-Lite** as the primary fallback and high-performance provider.
    - [x] Updated model candidates to prioritize Gemini 2.5 for cost and speed efficiency.
  - [x] **Bespoke Script Logic**:
    - [x] Modified `useAI.ts` to inject contact-specific context (Name, Company) into the user prompt, forcing the AI to generate personalized scripts.
    - [x] Switched the default model to **Llama 3.1 70B** on OpenRouter for superior script reasoning.
  - [x] **Safety Protocols**:
    - [x] Implemented a "Graceful Fallback" in `useAI.ts` that returns a high-quality default NEPQ script if the API is unreachable.
    - [x] Added debug logging to `_supabase.js` and `chat.js` to monitor 401/406 authentication errors.

### User Identity & Identity Migration
- **Status**: Completed
- **Description**: Migrated Lewis Patterson's system identity to the new Nodal Point domain and resolved read-only identity constraints.
- **Actions**:
  - [x] **Identity Migration**:
    - [x] Migrated Lewis Patterson's email from `l.patterson@powerchoosers.com` to `l.patterson@nodalpoint.io` across Supabase `users` and Firebase Auth.
    - [x] **Relational Integrity**: Performed a system-wide batch migration of 3,932 `ownerId` references in Supabase (Contacts, Accounts, etc.) to maintain data ownership.
    - [x] **Access Control**: Updated hardcoded admin email references in `call-status.js` and other API files to ensure uninterrupted administrative access.
  - [x] **Settings UI Refinement**:
    - [x] Removed `readOnly` constraints from the Email field in the Settings page.
    - [x] Added visual warnings for system-wide ID synchronization requirements.
    - [x] Standardized email input with `font-mono tabular-nums` and forensic styling.
    - [x] **Routing Sync**: Standardized API routes in `server.js` to match the frontend expectations (`/api/apollo/search-people` and `/api/apollo/search-organizations`).
  - [x] **Integration**: Verified the end-to-end flow from domain-based scanning to account enrichment.

### Emails Page & Integration
- **Status**: Completed
- **Description**: Migrated legacy email features (Inbox Sync, Composition, Tracking) to the new Next.js platform.
- **Actions**:
  - [x] **Backend Integration**: Verified `sendgrid-send.js` API proxy via `next.config.ts`.
  - [x] **Logic Porting**:
    - Created `useGmailSync.ts` to handle client-side Gmail API sync and Firestore deduplication (ported from `gmail-inbox-sync.js`).
    - Created `useEmails.ts` with TanStack Query for real-time email list management (ported from `emails-redesigned.js`).
  - [x] **UI Implementation**:
    - Created `ComposeModal.tsx` for sending emails (replacing `email-compose-global.js`).
    - [x] **Integration**:
      - Integrated `ComposeModal` into the `ContactDossierPage` email button, replacing `mailto:` with the internal composer.
      - Integrated `ComposeModal` into the `PeoplePage` table actions for direct node-to-email workflow.
      - Implemented pre-filled `To` and `Subject` fields (pre-filled with Company name) to match legacy global compose behavior.

### Market Telemetry & Operational Sentinel
- **Status**: Completed
- **Description**: Integrated real-time ERCOT market data and seasonal intelligence into the platform's core UI and intelligence layer.
- **Actions**:
  - [x] **ERCOT Data Pipeline**:
    - [x] Implemented OAuth2 ROPC flow with token caching for the ERCOT API.
    - [x] Built a robust scraper fallback to ensure data continuity during API outages.
    - [x] Created `useMarketPulse.ts` hook for unified price and grid data access.
  - [x] **Operational Sentinel (TopBar)**:
    - [x] Integrated a real-time strategy engine that adjusts based on seasonal 4CP windows and grid physics (ACCUMULATION vs. 4CP_DEFENSE).
    - [x] Added a "System Heartbeat" (System_Live) to the TopBar with millisecond-precision sync tracking.
    - [x] Applied forensic instrument aesthetic with `font-mono tabular-nums` and pulsing LED status dots.
    - [x] Moved brand identity ("NodalPoint Network") to the Sidebar with two-color styling, freeing up space for Strategic Context in the TopBar.
  - [x] **Dossier Integration**:
    - [x] Created the `MarketPulseHUD` component in `GeminiChat.tsx` for real-time market visualization during AI consultations.
    - [x] Integrated `get_market_pulse` tool into the Gemini chat backend for real-time data retrieval.
  - [x] **Telemetry Storage (Supabase)**:
    - [x] Created `market_telemetry` table with `vector(768)` support for semantic search of historical market days.
    - [x] Implemented throttled 2x daily (AM/PM) logging to preserve storage while maintaining a "source of truth" for the grid.
    - [x] Documented the schema strategy in `nodalpoint.md`.

### Nodal Architect Search Fixes
- **Status**: Completed
- **Description**: Resolved critical logic failures in the AI search system preventing fallback to keyword search when vector results were empty.
- **Actions**:
  - [x] **Logic Gate Repair**: Updated `list_contacts`, `list_accounts`, and `search_emails` in `api/gemini/chat.js` to strictly check for `vectorResults.length > 0` before declaring vector search successful.
  - [x] **Schema Alignment**: Corrected `firstName`/`lastName` (camelCase) to `first_name`/`last_name` (snake_case) in the `list_contacts` fallback SQL query to prevent "Column does not exist" crashes.

### Nodal Architect ID Generation
- **Status**: Completed
- **Description**: Implemented proactive UUID v4 generation for new Contacts and Tasks created via AI tools to support Supabase text-based primary keys.
- **Actions**:
  - [x] **ID Generation**: Updated `create_contact` and `create_task` in `api/gemini/chat.js` to assign `crypto.randomUUID()` if no ID is provided by the LLM.
  - [x] **Searchability Verification**: Confirmed existence of `embed_contacts_on_insert` triggers in `20260201_automatic_embeddings.sql`, ensuring new records are automatically indexed for vector search.

### Nodal Architect Anti-Hallucination Guard
- **Status**: Completed
- **Description**: Eliminated fabricated CRM responses by grounding account search and contract queries directly in Supabase.
- **Actions**:
  - [x] **Grounded Routing**: Added a deterministic CRM path in `api/gemini/chat.js` that intercepts account lookups, expiration-year queries, and contract detail requests.
  - [x] **Context Inference**: Implemented last-account inference from prior `forensic_grid` JSON blocks to support follow-up questions like "contract details".
  - [x] **No Fabrication**: Returns `Unknown` / `Data_Void` when key contract fields are missing instead of inventing values.

### Infrastructure Map & Asset Tracking
- **Status**: Completed
- **Description**: Migrated the Infrastructure Map from mock data to real-time asset tracking using Supabase contacts and ERCOT market data, with strict account status filtering.
- **Actions**:
  - [x] **Real-Time Data Uplink**:
    - [x] Replaced mock nodes with live contacts from Supabase (`useInfiniteQuery`).
    - [x] Implemented ERCOT Zone resolution based on contact city/state via `mapLocationToZone`.
    - [x] Integrated real-time market pricing via `/api/market/ercot` (60-second polling).
  - [x] **Dynamic Risk Logic**:
    - [x] Implemented price-sensitive risk detection (Red Dot): Nodes turn "Risk" (Red) if Price > $40 AND Load is HIGH.
    - [x] Added "Protected" status (Blue) for High/Med load accounts under safe price thresholds.
  - [x] **Customer Verification**:
    - [x] Applied strict filtering to only display contacts linked to accounts with `ACTIVE_LOAD` status (Current Customers).
    - [x] Confirmed `ACTIVE_LOAD` status is automatically set upon contract upload in the Data Locker (`analyze-document.js`).
  - [x] **UI/UX Standardization**:
    - [x] Aligned map container layout with People/Protocol Builder pages (Glass container, Sync_Block footer).
    - [x] Added `animate-progress` loading state for initial data fetch.
    - [x] Fixed `useAuth` import path error causing build failures.

### Nodal Architect Account Search Hardening
- **Status**: Completed
- **Description**: Improved reliability for multi-word account lookups and reduced dependence on a brittle RPC search function.
- **Actions**:
  - [x] **Query Normalization**: Strips common “find/search/list account” preambles and trailing “account(s)” tokens before searching.
  - [x] **Exact Name Pass**: Adds a direct `name ILIKE <query>` check before hybrid/keyword search.
  - [x] **Tokenized Fallback**: Expands keyword fallback to search across multiple tokens (name/domain/industry/location) and ranks results in-memory for best match.
  - [x] **Hybrid Search Upgrade**: Updated `hybrid_search_accounts` SQL to guarantee exact-name matches are pinned above RRF fusion ordering.
  - [x] **Location Search**: Implemented dedicated location search path for city/state queries (e.g. "accounts in Houston") with `forensic_grid` response.
  - [x] **Single Match Promotion**: Added logic to automatically promote single or exact account matches to detailed `position_maturity` view instead of a generic grid.
  - [x] **RPC Fix**: Resolved `contractEndDate` column name mismatch in `hybrid_search_accounts` RPC function.

### ERCOT API Migration & Market Pulse
- **Status**: Completed
- **Description**: Migrated the Market Pulse widget to use official ERCOT API data with ROPC authentication and robust fallback mechanisms.
- **Actions**:
  - [x] **Official API Integration**:
    - [x] Implemented OAuth2 ROPC (Resource Owner Password Credentials) flow in `ercot.js` to acquire Bearer tokens.
    - [x] Integrated `NP6-905-CD` (Prices) and `NP6-345-CD` (Grid) endpoints for real-time market data.
    - [x] Added `ERCOT_USERNAME` and `ERCOT_PASSWORD` credentials to the backend environment.
  - [x] **Data Normalization & Simulation**:
    - [x] Implemented simulated metric generation for `reserves`, `scarcity_prob`, `forecast_load`, and `total_capacity` derived from actual system load.
    - [x] Added support for both `prices` and `grid` data types via a single API proxy.
  - [x] **Robustness & Fallback**:
    - [x] Maintained the legacy CDR scraper as a primary fallback if the official API fails or credentials expire.
    - [x] Implemented `headersSent` checks to prevent server crashes during multi-step fallback logic.
    - [x] Fixed Next.js `SyntaxError` by ensuring all `/api/*` routes return structured JSON even on 404/500 errors.
  - [x] **UI/UX Enhancement**:
    - [x] Updated `MarketPulseWidget.tsx` to display real-time price feeds for Houston and North zones.
    - [x] Integrated a dynamic "Grid Reserves" progress bar that scales relative to total capacity.
    - [x] Added "Scarcity Probability" tracking with live updates every 30 seconds.
    - [x] Applied forensic monospaced typography and tabular numbers for all market metrics.

### React Documentation & Standards Update
- **Status**: Completed
- **Description**: Standardized React development patterns to prevent hydration mismatches and race conditions.
- **Actions**:
  - [x] **Key Protocol**: Enforced unique, stable keys for all mapped elements.
  - [x] **Hydration Safety**: Implemented mounted-state checks for browser-only globals.
  - [x] **Effect Dependencies**: Validated all `useEffect` and `useCallback` dependency arrays.
  - [x] **Research**: Audited `react.dev` for key protocol, hydration safety, and performance best practices.
  - [x] **Instruction Update**: Added a new **React & Next.js Development Standards** section to `builder-agent-instructions.md`.
  - [x] **Source of Truth**: Synchronized the documentation update with `nodalpoint.md` to ensure zero drift in architectural standards.
  - [x] **Self-Correction**: Added "Agent Self-Correction & Efficiency" rules to prevent looping and improve search strategies.

### React Key Warning Resolution & Animation Safety
- **Status**: Completed
- **Description**: Performed a project-wide audit of all components using `AnimatePresence` and `motion` to resolve React "unique key prop" warnings and ensure stable exit animations.
- **Actions**:
  - [x] **Deep Audit**: Identified 22 files using `AnimatePresence` via recursive Grep and audited each for key consistency.
  - [x] **Key Implementation**:
    - [x] Fixed `BulkActionDeck.tsx`: Added `AnimatePresence` and unique `key="bulk-action-deck"`.
    - [x] Fixed `GeminiChat.tsx`: Added semantic keys `diagnostics-hud` and `history-panel` to dynamic motion overlays.
    - [x] Fixed `FilterCommandDeck.tsx`: Added unique `key="filter-deck"`.
    - [x] Fixed `TopBar.tsx`: Renamed search container key from `search` to `search-container` for better uniqueness.
    - [x] Fixed `CallListItem.tsx`: Added `AnimatePresence` wrapper with semantic `key="processing-indicator"`.
  - [x] **Animation Logic**:
    - [x] Fixed `DestructModal.tsx`: Corrected `AnimatePresence` logic by moving the `isOpen` conditional *inside* the wrapper and adding unique keys to the overlay and content containers, ensuring smooth exit transitions.
  - [x] **Validation**: Verified stable keys in all core table views (`PeoplePage`, `AccountsPage`, `TasksPage`, `EnergyPage`) using stable row IDs.
  - [x] **Git Synchronization**: Pushed all key-related fixes to the repository.

### Twilio Voice Stability & Token Management
- **Status**: Completed
- **Description**: Resolved critical Twilio Voice errors (Transport, Token Invalid, and State errors) occurring during long idle sessions.
- **Actions**:
  - [x] **Token Persistence**: Increased Twilio Access Token TTL from 1 hour to 24 hours in `api/twilio/token.js` to ensure session continuity.
  - [x] **State-Aware Cleanup**: Modified `VoiceContext.tsx` to check `device.state` before unregistering, eliminating `InvalidStateError` during re-initialization.
  - [x] **Concurrency Control**: Added `isInitializing` ref to prevent overlapping device initializations from timers and error events.
  - [x] **Auto-Recovery**: Implemented automatic device re-initialization on `TransportError (31009)` and `AccessTokenInvalid (20101)` errors.
  - [x] **Signaling Optimization**: Configured explicit `edge` regions (`ashburn`, `roaming`) and increased signaling timeouts for better reliability in browser environments.
  - [x] **UI Noise Reduction**: Suppressed repetitive "Transport Unavailable" toast notifications during background recovery attempts.

### Satellite Uplink & Asset Intelligence
- **Status**: Completed
- **Description**: Enhanced the Satellite Uplink widget with name-based address resolution and automated forensic data enrichment for contacts and accounts.
- **Actions**:
  - [x] **Address Resolution**:
    - [x] Implemented server-side Google Places API proxy (`/api/maps/search`) to secure API keys.
    - [x] Added fallback logic to search by Name (Contact Name or Account Name) if the entity has no address on file.
  - [x] **Forensic Enrichment**:
    - [x] Auto-syncs discovered Address to the `address` field if currently empty.
    - [x] Auto-syncs discovered Phone Number to the `phone` (Contact) or `company_phone` (Account) field if currently empty.
    - [x] Updates Supabase directly and triggers a UI refetch via `onSyncComplete` callback.
  - [x] **UI/UX Enhancement**:
    - [x] Added real-time status updates ("Initiating Satellite Scan...", "Asset Intelligence Acquired").
    - [x] Integrated `RightPanel` context awareness to pass `entityId`, `entityType`, and `currentPhone` props dynamically.
